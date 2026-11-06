import { describe, expect, test } from 'vitest';
import { groundedEnvironmentActor, prepareEnvironmentJump } from '../e2e/environment-controls';
import { withCleanup } from '../e2e/factory-navigation';
type Frame = { hero: { count: number; meanY: number } | null; core: { count: number } | null; png: string };
const frame = (png = 'ground'): Frame => ({ hero: { count: 384, meanY: 309 }, core: null, png });
const phases = ['ready', 'ground', 'insight', 'core'] as const;
type Phase = typeof phases[number];
function rig(durations = [1000, 500, 25, 25]) {
  let at = 0;
  const events: Phase[] = [], failures = new Map<Phase, unknown>();
  const grounded = frame(), exposed = frame('original-E-capture'); exposed.core = { count: 208 };
  const step = (phase: Phase) => {
    events.push(phase); at += durations[phases.indexOf(phase)];
    if (failures.has(phase)) throw failures.get(phase);
  };
  const timeouts: number[] = [];
  const port = { now: () => at,
    ready: async (ms: number) => { timeouts.push(ms); step('ready'); },
    ground: async (ms: number) => { timeouts.push(ms); step('ground'); return grounded; },
    insight: async () => { step('insight'); },
    core: async (ms: number) => { timeouts.push(ms); step('core'); return exposed; },
  };
  return { port, grounded, exposed, events, timeouts, failures, setTime: (value: number) => { at = value; } };
}
describe('C1 original shared preparation budget, not native success proof', () => {
  test('ready,ground,E and core share one5000ms deadline and preserve actual frame references', async () => {
    const r = rig(), result = await prepareEnvironmentJump(r.port);
    expect(r.events).toEqual(phases); expect(r.timeouts).toEqual([5000, 4000, 3475]);
    expect(result.grounded).toBe(r.grounded); expect(result.exposed).toBe(r.exposed);
    expect(result.elapsedMs).toBe(1550);
    expect(result.requests.map(v => v.remainingMs)).toEqual([5000, 4000, 3500, 3475, 3450]);
  });
  test.each(phases)('protocol failure at%s preserves identity and never continues to jump', async phase => {
    const r = rig(), primary = Error(phase); r.failures.set(phase, primary); let jumps = 0;
    await expect(prepareEnvironmentJump(r.port).then(() => { jumps++; })).rejects.toBe(primary);
    expect(r.events).toEqual(phases.slice(0, phases.indexOf(phase) + 1)); expect(jumps).toBe(0);
  });
  test.each(phases)('a late%s consumes the shared deadline, even if its result is valid', async phase => {
    const times = [0, 0, 0, 0]; times[phases.indexOf(phase)] = 5000;
    const r = rig(times); let jumps = 0;
    await expect(prepareEnvironmentJump(r.port).then(() => { jumps++; })).rejects.toThrow('deadline expired');
    expect(r.events).toEqual(phases.slice(0, phases.indexOf(phase) + 1)); expect(jumps).toBe(0);
  });
  test.each([NaN, Infinity, -1])('nonfinite or backwards clock%s cannot renew the allowance', async at => {
    const r = rig(); r.port.ready = async () => { r.events.push('ready'); r.setTime(at); };
    await expect(prepareEnvironmentJump(r.port)).rejects.toThrow('Invalid preparation clock');
    expect(r.events).toEqual(['ready']);
  });
  test.each([NaN, Infinity, -Infinity])('invalid start%s performs no observation or input', async at => {
    const r = rig(); r.setTime(at);
    await expect(prepareEnvironmentJump(r.port)).rejects.toThrow('Invalid preparation clock'); expect(r.events).toEqual([]);
  });
  const invalidActors: Frame['hero'][] = [null, { count: 19, meanY: 309 }, { count: 20.5, meanY: 309 },
    { count: NaN, meanY: 309 }, { count: 20, meanY: 285 }, { count: 20, meanY: 360 },
    { count: 20, meanY: NaN }, { count: 20, meanY: Infinity }];
  test.each(invalidActors)('invalid grounded actor%j never authorizes E or jump', async actor => {
    const r = rig(); r.grounded.hero = actor;
    expect(groundedEnvironmentActor(r.grounded)).toBe(false);
    await expect(prepareEnvironmentJump(r.port)).rejects.toThrow('No visible grounded preparation actor');
    expect(r.events).toEqual(['ready', 'ground']);
  });
  test.each([null, { count: 30 }, { count: 30.5 }, { count: NaN }])('invalid exposed core%j never authorizes jump', async core => {
    const r = rig(); r.exposed.core = core; let jumps = 0;
    await expect(prepareEnvironmentJump(r.port).then(() => { jumps++; })).rejects.toThrow('No current grounded actor and exposed core');
    expect(r.events).toEqual(phases); expect(jumps).toBe(0);
  });
  test.each([null, { count: 384, meanY: 240 }])('an earlier grounded actor cannot substitute for current exposure%j', async actor => {
    const r = rig(); r.exposed.hero = actor;
    await expect(prepareEnvironmentJump(r.port)).rejects.toThrow('No current grounded actor and exposed core');
    expect(r.events).toEqual(phases);
  });
  test('the exact count20 and strict meanY/core boundaries can pass', async () => {
    const r = rig(); r.grounded.hero = r.exposed.hero = { count: 20, meanY: 285.001 }; r.exposed.core = { count: 31 };
    expect((await prepareEnvironmentJump(r.port)).exposed).toBe(r.exposed);
  });
  test('one jump/shot/hit completes before archival of the exact prepared capture', async () => {
    const r = rig(), p = await prepareEnvironmentJump(r.port), events: string[] = [], archived: Frame[] = [];
    await withCleanup(async () => { events.push('Space', '150', 'first-airborne', 'click80', 'Space-up', 'real-hit'); }, async () => {
      events.push('archive'); archived.push(p.exposed);
    });
    expect(r.events.filter(v => v === 'insight')).toHaveLength(1);
    expect(events).toEqual(['Space', '150', 'first-airborne', 'click80', 'Space-up', 'real-hit', 'archive']);
    expect(archived).toHaveLength(1); expect(archived[0]).toBe(r.exposed); expect(archived[0].png).toBe('original-E-capture');
  });
  test('failed live shot still archives its original exposure without hiding the primary failure', async () => {
    const r = rig(), p = await prepareEnvironmentJump(r.port), primary = Error('shot'), cleanupError = Error('archive');
    const archived: Frame[] = [];
    await expect(withCleanup(async () => { throw primary; }, async () => { archived.push(p.exposed); throw cleanupError; }))
      .rejects.toMatchObject({ cause: primary, cleanupError });
    expect(archived).toHaveLength(1); expect(archived[0]).toBe(r.exposed);
  });
});
