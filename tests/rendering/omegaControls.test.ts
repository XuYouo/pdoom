import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { CHAPTER_FIVE } from '../../src/pages/GamePage/game/data/chapterFive';
import { TUNING } from '../../src/pages/GamePage/game/data/tuning';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { createPlayer } from '../../src/pages/GamePage/game/systems/rules';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { movePlayer } from '../../src/pages/GamePage/game/systems/controller';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { withCleanup } from '../e2e/factory-navigation';
import { createOmegaPreparation, runOmegaMovement, createOmegaTicket, flushOmegaPreparations, completeOmegaActions,
  type OmegaGoal, type OmegaPreparationPort, type OmegaRead, type OmegaMovePort, type OmegaPreparationProof } from '../e2e/omega-controls';
// Synthetic stencils exercise the actual observer/coordinator. They are never native acceptance evidence.
function stamp(slot: number, width: number, height: number, color: number) {
  const points = Array.from({ length: 144 }, (_, i) => ({ x: i % 12, y: Math.floor(i / 12), color: i === 143 ? color + 1 : color }));
  return { slot, width, height, points, anchors: [points[143], points[0], points[11]], colors: 2, flipped: false };
}
const heroStamp = stamp(0, 32, 32, 0xb84c12), furniture = [stamp(3, 64, 128, 0x436723), stamp(4, 64, 128, 0x28557a), stamp(5, 64, 128, 0x703562)];
const source = { hero: [heroStamp], props: furniture };
function pixel(rgba: Uint8ClampedArray, x: number, y: number, rgb: number, alpha = 255) {
  rgba.set([rgb >>> 16, (rgb >>> 8) & 255, rgb & 255, alpha], (y * 640 + x) * 4);
}
function paint(rgba: Uint8ClampedArray, s: typeof heroStamp, x: number, y: number) {
  for (const p of s.points) if (x + p.x >= 0 && x + p.x < 640 && y + p.y >= 0 && y + p.y < 360) pixel(rgba, x + p.x, y + p.y, p.color);
}
function image(center = 200, feet = 320, room = false, gap = 60): OmegaRead {
  const rgba = new Uint8ClampedArray(640 * 360 * 4); for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  paint(rgba, heroStamp, center - 16, feet - 27);
  for (let x = 0; x < 640; x++) if (room || x < 264 || x >= 264 + gap) pixel(rgba, x, 320, 0x90c6b0);
  if (room) { paint(rgba, furniture[0], 228, 200); paint(rgba, furniture[2], 453, 200); }
  return { rgba, hud: ['HP100/100'], omega: 'unit marker,not native evidence' };
}
function browser(goal: OmegaGoal = 'gap-jump', raw = image()) {
  let now = 0, next = 0; const rafs = new Map<number, (at: number) => void>(), timers = new Map<number, () => void>();
  const calls: string[] = [], encoded: string[] = [];
  const digest = (bytes: Uint8ClampedArray) => createHash('sha256').update(bytes).digest('hex');
  const port: OmegaPreparationPort = { now: () => now, raf: f => { const id = ++next; rafs.set(id, f); return id; }, cancelRaf: id => { calls.push('cancelRAF'); rafs.delete(id); },
    timer: (f, ms) => { calls.push('timer:' + ms); const id = ++next; timers.set(id, f); return id; }, cancelTimer: id => { calls.push('cancelTimer'); timers.delete(id); },
    read: () => { calls.push('read'); return raw; }, encode: bytes => { calls.push('encode'); encoded.push(digest(bytes)); return 'unit PNG marker'; } };
  const subject = createOmegaPreparation({ goal, source }, port);
  return { subject, port, raw, calls, encoded, digest, rafs, timers, now: (value: number) => { now = value; },
    frame: (at = now) => { now = at; const [id, take] = [...rafs][0]; rafs.delete(id); take(at); },
    timeout: () => { now = 5000; const take = [...timers.values()][0]; take(); } };
}
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const tick = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
function watch<T>(promise: Promise<T>) { const state = { settled: false }; const outcome = promise.then(value => { state.settled = true; return { ok: true, value } as const; }, reason => { state.settled = true; return { ok: false, reason } as const; }); return { state, outcome }; }
const reasons: [string, unknown][] = [['error', Error('sentinel')], ['undefined', undefined], ['null', null], ['false', false], ['zero', 0], ['empty', ''], ['nan', NaN]];
describe('actual public RGBA preparation observer,not game screenshots', () => {
  test.each([['gap-jump', 200, false], ['room-baseline', 210, true], ['projection', 330, true], ['reveal', 420, true]] as const)('%s selects first full-source grounded position', async (goal, x, room) => {
    const r = browser(goal, image(x, 320, room)), pending = r.subject.run(5000); r.frame(0);
    const result = await pending; expect(result.ok).toBe(true); expect(r.rafs.size + r.timers.size).toBe(0); expect(r.calls).not.toContain('encode');
    const proof = r.subject.finish(); expect(proof.selected?.hero?.centerX).toBe(x); expect(proof.frames).toHaveLength(1); expect(r.encoded).toHaveLength(1);
  });
  test('closed door uses full source and the same-frame relative distance', async () => {
    const raw = image(); paint(raw.rgba, furniture[1], 244, 200); const r = browser('closed-door', raw), p = r.subject.run(5000); r.frame(); expect((await p).ok).toBe(true);
  });
  test.each([199, 225])('room position%i outside200..224 cannot qualify', async x => {
    const r = browser('room-baseline', image(x, 320, true)), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false); expect(r.subject.finish().selected).toBeNull();
  });
  test.each([59, 61, 400])('gap width%i is not the real60px gap', async gap => {
    const r = browser('gap-jump', image(200, 320, false, gap)), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false);
  });
  test.each([319, 321])('feet%i cannot qualify as grounded320', async feet => {
    const r = browser('gap-jump', image(200, feet)), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false);
  });
  test('missing opaque source column fails rather than using orange centroid', async () => {
    const raw = image(); for (let y = 293; y < 305; y++) pixel(raw.rgba, 184, y, 0);
    const r = browser('gap-jump', raw), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false); expect(r.subject.finish().frames[0].hero).toBeNull();
  });
  test('partial out-of-canvas source box cannot be accepted', async () => {
    const r = browser('gap-jump', image(10)), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false);
  });
  test('two distinct source actors are ambiguous,not selected by arbitrary ordering', async () => {
    const raw = image(); paint(raw.rgba, heroStamp, 384, 293); const r = browser('gap-jump', raw), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false);
  });
  test('off-palette alpha does not match an opaque source point', async () => {
    const raw = image(); pixel(raw.rgba, 184, 293, heroStamp.points[0].color, 254); const r = browser('gap-jump', raw), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false);
  });
  test('selected RGBA is immutable and encoding is explicitly deferred', async () => {
    const r = browser(), digest = r.digest(r.raw.rgba), p = r.subject.run(5000); r.frame(); await p; r.raw.rgba.fill(0); expect(r.calls).not.toContain('encode'); r.subject.finish(); expect(r.encoded).toEqual([digest]);
  });
  test.each([0, -1, 5001, NaN, Infinity])('rejects invalid remaining budget%s without scheduling', async ms => {
    const r = browser(); expect((await r.subject.run(ms)).ok).toBe(false); expect(r.rafs.size + r.timers.size).toBe(0);
  });
  test('deadline callback settles pending RAF,stale callback cannot read', async () => {
    const r = browser(), p = r.subject.run(5000), stale = [...r.rafs.values()][0]; r.timeout(); expect((await p).ok).toBe(false); stale(5010); expect(r.calls).not.toContain('read'); expect(r.rafs.size).toBe(0);
  });
  test('late RAF is rejected before native read', async () => {
    const r = browser(), p = r.subject.run(5000); r.frame(5001); expect((await p).ok).toBe(false); expect(r.calls).not.toContain('read');
  });
  test('read that crosses deadline cannot qualify despite a good image', async () => {
    const r = browser(); r.port.read = () => { r.now(5001); return r.raw; }; const p = r.subject.run(5000); r.frame(4990); expect((await p).ok).toBe(false); expect(r.subject.finish().selected).toBeNull();
  });
  test('zero is a real starting timestamp,not reset on a later frame', async () => {
    const r = browser('gap-jump', image(150)), p = r.subject.run(5000); r.frame(0); r.frame(5001); expect((await p).ok).toBe(false); expect(r.subject.finish().frames).toHaveLength(1);
  });
  test.each([NaN, Infinity])('invalid initial clock%s schedules nothing', async now => {
    const r = browser(); r.now(now); expect((await r.subject.run(5000)).ok).toBe(false); expect(r.rafs.size + r.timers.size).toBe(0);
  });
  test('backward read clock is rejected', async () => {
    const r = browser(); r.port.read = () => { r.now(-1); return r.raw; }; const p = r.subject.run(5000); r.frame(); expect((await p).ok).toBe(false);
  });
  test.each(reasons)('read fault%s is a failure,including falsy values', async (_label, reason) => {
    const r = browser(); r.port.read = () => { throw reason; }; const p = r.subject.run(5000); r.frame(); const result = await p; expect(result.ok).toBe(false); if (result.ok) throw Error('unexpected'); expect(result.problems[0]).toContain('Preparation read:');
  });
  test('HP0 cancels preparation instead of waiting for a pause dialog', async () => {
    const r = browser(); r.raw.hud = ['HP0/100']; const p = r.subject.run(5000); r.frame(); expect((await p).ok).toBe(false);
  });
  test('finish cannot encode while observation is live', async () => {
    const r = browser(), p = r.subject.run(5000); expect(() => r.subject.finish()).toThrow('must stop'); expect(r.calls).not.toContain('encode'); r.subject.cancel(); await p;
  });
  test('restart cannot renew the deadline or install another RAF', async () => {
    const r = browser(), p = r.subject.run(5000); expect((await r.subject.run(5000)).ok).toBe(false); expect(r.calls.filter(s => s.startsWith('timer:'))).toHaveLength(1); r.subject.cancel(); await p;
  });
});
function driver() {
  const read = deferred<object>(), calls: string[] = []; let now = 0, expires!: () => void, observed = false, cancelSettles = true;
  const port: OmegaMovePort<object> = { now: () => now, timer: (f, ms) => { calls.push('timer:' + ms); expires = f; return 1; }, cancelTimer: () => { calls.push('clearDeadline'); },
    down: async () => { calls.push('down'); }, up: async () => { calls.push('up'); },
    observe: ms => { observed = true; calls.push('observe:' + ms); return read.promise; },
    cancel: async () => { calls.push('cancel'); if (observed && cancelSettles) read.reject(Error('cancelled by owner')); } };
  return { port, read, calls, now: (value: number) => { now = value; }, expire: () => { now = 5000; expires(); }, ignoreCancel: () => { cancelSettles = false; } };
}
describe('actual Node absolute deadline,input ownership and measurement drain', () => {
  test('down latency is deducted;successful readiness releases before slow measurement', async () => {
    const r = driver(), measured = deferred<string>(); r.port.down = async () => { r.calls.push('down'); r.now(120); };
    const task = watch(runOmegaMovement(r.port, undefined, () => { r.calls.push('measure'); return measured.promise; })); await tick(); expect(r.calls).toContain('observe:4880');
    r.now(420); const marker = { unit: true }; r.read.resolve(marker); await tick(); expect(r.calls).toContain('up'); expect(task.state.settled).toBe(false);
    measured.resolve('original window'); const out = await task.outcome; expect(out.ok).toBe(true); if (!out.ok) throw out.reason;
    expect(out.value.ready).toBe(marker); expect(out.value.measurement).toBe('original window'); expect(out.value.preparationMs).toBe(420);
  });
  test('measurement may finish first without ending preparation', async () => {
    const r = driver(), task = watch(runOmegaMovement(r.port, undefined, async () => 'measured')); await tick(); expect(task.state.settled).toBe(false); expect(r.calls).not.toContain('up'); r.read.resolve({}); expect((await task.outcome).ok).toBe(true);
  });
  test('original follow-through begins only after readiness and retains key until done', async () => {
    const r = driver(), tail = deferred<void>(), task = watch(runOmegaMovement(r.port, () => { r.calls.push('follow'); return tail.promise; })); await tick(); expect(r.calls).not.toContain('follow');
    r.read.resolve({}); await tick(); expect(r.calls).toContain('follow'); expect(r.calls).not.toContain('up'); r.expire(); expect(r.calls).not.toContain('up'); tail.resolve(); expect((await task.outcome).ok).toBe(true); expect(r.calls.filter(c => c === 'up')).toHaveLength(1);
  });
  test.each(reasons)('observation failure%s releases/cancels before draining original measurement', async (_label, reason) => {
    const r = driver(), measure = deferred<string>(), task = watch(runOmegaMovement(r.port, undefined, () => measure.promise)); await tick(); r.read.reject(reason); await tick();
    expect(r.calls).toContain('up'); expect(r.calls).toContain('cancel'); expect(task.state.settled).toBe(false); measure.resolve('done'); const out = await task.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); expect(Object.is(out.reason, reason)).toBe(true);
  });
  test('measurement failure immediately releases and cancels movement,retaining both reasons', async () => {
    const r = driver(), measure = deferred<string>(), task = watch(runOmegaMovement(r.port, undefined, () => measure.promise)); await tick(); measure.reject(undefined); await tick();
    expect(r.calls).toContain('up'); expect(r.calls).toContain('cancel'); const out = await task.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected');
    const e = out.reason as Error & { failures: { phase: string; reason: unknown }[] }; expect(e.failures.some(f => f.phase === 'measurement' && f.reason === undefined)).toBe(true); expect(e.failures.some(f => f.phase === 'observation')).toBe(true);
  });
  test('deadline immediately requests release,does not accept a late readiness or start follow-through', async () => {
    const r = driver(); r.ignoreCancel(); const task = watch(runOmegaMovement(r.port, async () => { r.calls.push('follow'); })); await tick(); r.expire(); await tick();
    expect(r.calls).toContain('up'); expect(r.calls).toContain('cancel'); expect(task.state.settled).toBe(false); r.read.resolve({ late: true }); const out = await task.outcome; expect(out.ok).toBe(false); expect(r.calls).not.toContain('follow');
  });
  test('late key-down settlement gets a final release and never starts observation', async () => {
    const r = driver(), down = deferred<void>(); r.port.down = () => { r.calls.push('down'); return down.promise; }; const task = watch(runOmegaMovement(r.port)); await tick(); r.expire(); await tick(); expect(r.calls).toContain('up'); expect(task.state.settled).toBe(false);
    down.resolve(); expect((await task.outcome).ok).toBe(false); expect(r.calls.filter(c => c === 'up')).toHaveLength(2); expect(r.calls.some(c => c.startsWith('observe:'))).toBe(false);
  });
  test('late reply is rejected even if a watchdog callback has not executed yet', async () => {
    const r = driver(), task = watch(runOmegaMovement(r.port, async () => { r.calls.push('follow'); })); await tick(); r.now(5001); r.read.resolve({}); expect((await task.outcome).ok).toBe(false); expect(r.calls).not.toContain('follow'); expect(r.calls).toContain('up');
  });
  test.each(reasons)('down failure%s still releases and cancels without observing', async (_label, reason) => {
    const r = driver(); r.port.down = () => { r.calls.push('down'); throw reason; }; const out = await watch(runOmegaMovement(r.port)).outcome;
    expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); expect(Object.is(out.reason, reason)).toBe(true); expect(r.calls.filter(c => c === 'up')).toHaveLength(1); expect(r.calls).toContain('cancel'); expect(r.calls.some(c => c.startsWith('observe:'))).toBe(false);
  });
  test.each(reasons)('release failure%s cannot skip cancellation or measurement drain', async (_label, reason) => {
    const r = driver(), measure = deferred<void>(); r.port.up = () => { r.calls.push('up'); throw reason; }; const task = watch(runOmegaMovement(r.port, undefined, () => measure.promise)); await tick(); r.read.resolve({}); await tick(); expect(task.state.settled).toBe(false); expect(r.calls).toContain('cancel'); measure.resolve();
    const out = await task.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); expect(Object.is(out.reason, reason)).toBe(true); expect(r.calls).toContain('cancel');
  });
  test('sync follow-through failure still releases and does not masquerade as readiness failure', async () => {
    const r = driver(), failure = Error('Space action'), task = watch(runOmegaMovement(r.port, () => { throw failure; })); await tick(); r.read.resolve({}); const out = await task.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); expect(out.reason).toBe(failure); expect(r.calls).toContain('up'); expect(r.calls).toContain('cancel');
  });
  test('success has no redundant cancel RPC before the original next measurement', async () => {
    const r = driver(), task = watch(runOmegaMovement(r.port)); await tick(); r.read.resolve({}); expect((await task.outcome).ok).toBe(true); expect(r.calls).toContain('up'); expect(r.calls).not.toContain('cancel');
  });
  test('cancel failure preserves the observation failure as well', async () => {
    const r = driver(); r.port.cancel = () => { r.calls.push('cancel'); throw false; }; const task = watch(runOmegaMovement(r.port)); await tick(); r.read.reject(undefined); const out = await task.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected');
    const e = out.reason as Error & { failures: { phase: string; reason: unknown }[] }; expect(e.failures.some(f => f.phase === 'observation' && f.reason === undefined)).toBe(true); expect(e.failures.some(f => f.phase === 'cancel' && f.reason === false)).toBe(true); expect(r.calls).toContain('up');
  });
  test('bad start clock cannot press a key', async () => {
    const r = driver(); r.now(NaN); expect((await watch(runOmegaMovement(r.port)).outcome).ok).toBe(false); expect(r.calls).not.toContain('down'); expect(r.calls).toContain('cancel');
  });
  test('exhausted down budget cannot start capture', async () => {
    const r = driver(); r.port.down = async () => { r.now(5000); }; expect((await watch(runOmegaMovement(r.port)).outcome).ok).toBe(false); expect(r.calls.some(c => c.startsWith('observe:'))).toBe(false); expect(r.calls).toContain('up');
  });
  test('timer cleanup fault prevents follow-through and remains visible', async () => {
    const r = driver(); r.port.cancelTimer = () => { throw null; }; const task = watch(runOmegaMovement(r.port, async () => { r.calls.push('follow'); })); await tick(); r.read.resolve({}); const out = await task.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); expect(out.reason).toBeNull(); expect(r.calls).not.toContain('follow'); expect(r.calls).toContain('up');
  });
});
const unitProof: OmegaPreparationProof = { goal: 'gap-jump', budget: 5000, frames: [], selected: null, png: 'unit marker only', aborted: null, abortedPng: null, result: null };
describe('deferred immutable preparation evidence at original pause boundary', () => {
  test('neither encoding nor disposal occurs until measurement and pause guard complete', async () => {
    const calls: string[] = [], frozen = deferred<void>();
    const ticket = createOmegaTicket({ finish: async () => { calls.push('encode'); return unitProof; }, dispose: async () => { calls.push('dispose'); } });
    const pending = [ticket], task = watch(flushOmegaPreparations(pending, () => { calls.push('original-pause-guard'); return frozen.promise; }));
    await tick(); expect(calls).toEqual(['original-pause-guard']); expect(pending).toHaveLength(1); expect(task.state.settled).toBe(false);
    frozen.resolve(); const out = await task.outcome; expect(out.ok).toBe(true); if (!out.ok) throw out.reason; expect(out.value).toEqual([unitProof]); expect(calls).toEqual(['original-pause-guard', 'encode', 'dispose']); expect(pending).toEqual([]);
  });
  test('failed pause retains ticket for failed-test cleanup,without premature encoding', async () => {
    const calls: string[] = [], pending = [createOmegaTicket({ finish: async () => { calls.push('encode'); return unitProof; }, dispose: async () => { calls.push('dispose'); } })];
    const out = await watch(flushOmegaPreparations(pending, async () => { throw undefined; })).outcome; expect(out.ok).toBe(false); expect(calls).toEqual([]); expect(pending).toHaveLength(1);
    await flushOmegaPreparations(pending, async () => {}); expect(calls).toEqual(['encode', 'dispose']);
  });
  test('finalize is once-only even if two consumers request it', async () => {
    let encoded = 0, disposed = 0; const ticket = createOmegaTicket({ finish: async () => { encoded++; return unitProof; }, dispose: async () => { disposed++; } });
    const a = ticket.finalize(), b = ticket.finalize(); expect(a).toBe(b); await Promise.all([a, b]); expect([encoded, disposed]).toEqual([1, 1]);
  });
  test.each(reasons)('encoding failure%s still disposes and retains exact reason', async (_label, reason) => {
    let disposed = false; const ticket = createOmegaTicket({ finish: async () => { throw reason; }, dispose: async () => { disposed = true; } }); const out = await watch(ticket.finalize()).outcome;
    expect(disposed).toBe(true); expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); expect(Object.is(out.reason, reason)).toBe(true);
  });
  test('dual finalizer failures have both diagnostic roles and original identities', async () => {
    const ticket = createOmegaTicket({ finish: async () => { throw undefined; }, dispose: async () => { throw false; } }); const out = await watch(ticket.finalize()).outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected');
    const error = out.reason as Error & { cause: unknown; cleanupError: unknown }; expect(error.message).toContain('encode: undefined'); expect(error.message).toContain('dispose: false'); expect(error.cause).toBeUndefined(); expect(error.cleanupError).toBe(false);
  });
  test('one failed ticket cannot skip another ticket or finish the drain early', async () => {
    const later = deferred<OmegaPreparationProof>(), calls: string[] = [], pending = [createOmegaTicket({ finish: async () => { throw 0; }, dispose: async () => { calls.push('dispose1'); } }), createOmegaTicket({ finish: () => later.promise, dispose: async () => { calls.push('dispose2'); } })];
    const task = watch(flushOmegaPreparations(pending, async () => {})); await tick(); expect(task.state.settled).toBe(false); expect(calls).toEqual(['dispose1']); later.resolve(unitProof); const out = await task.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); expect(out.reason).toBe(0); expect(calls).toEqual(['dispose1', 'dispose2']);
  });
});

describe('actual all-attempt cleanup and retained diagnostics', () => {
  test.each(reasons)('first release failure%s does not skip other keys/finalizers/attachments', async (_label, reason) => {
    const calls: string[] = [], out = await watch(completeOmegaActions(['a', 'd', 'Space', 'finalizer', 'metadata', 'PNG'].map(phase => ({ phase, run: async () => { calls.push(phase); if (phase === 'a') throw reason; } })))).outcome;
    expect(calls).toEqual(['a', 'd', 'Space', 'finalizer', 'metadata', 'PNG']); expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); expect(Object.is(out.reason, reason)).toBe(true);
  });
  test('a failing finalizer cannot discard another successfully decoded proof', async () => {
    const saved: OmegaPreparationProof[] = [], pending = [createOmegaTicket({ finish: async () => { throw 0; }, dispose: async () => {} }), createOmegaTicket({ finish: async () => unitProof, dispose: async () => {} })];
    const out = await watch(flushOmegaPreparations(pending, async () => {}, proof => { saved.push(proof); })).outcome;
    expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); expect(out.reason).toBe(0); expect(saved).toEqual([unitProof]); expect(pending).toEqual([]);
  });
  test('metadata attachment failure does not skip PNG or later records', async () => {
    const calls: string[] = [], out = await watch(completeOmegaActions(['metadata1', 'PNG1', 'metadata2', 'PNG2'].map(phase => ({ phase, run: () => { calls.push(phase); if (phase === 'metadata1') throw undefined; if (phase === 'PNG1') throw false; } })))).outcome;
    expect(calls).toEqual(['metadata1', 'PNG1', 'metadata2', 'PNG2']); expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); const error = out.reason as Error; expect(error.message).toContain('metadata1: undefined'); expect(error.message).toContain('PNG1: false');
  });
  test('the same Space withCleanup used by the case preserves input and release errors', async () => {
    const primary = Error('SpaceDown'), cleanup = Error('SpaceUp'), out = await watch(withCleanup(async () => { throw primary; }, async () => { throw cleanup; })).outcome;
    expect(out.ok).toBe(false); if (out.ok) throw Error('unexpected'); const error = out.reason as Error & { cause: unknown; cleanupError: unknown }; expect(error.cause).toBe(primary); expect(error.cleanupError).toBe(cleanup);
  });
});

function removeStamp(raw: OmegaRead, s: typeof heroStamp, x: number, y: number) { for (const p of s.points) pixel(raw.rgba, x + p.x, y + p.y, 0); }
function onlyAnchor(x: number, slot: 3 | 5) {
  const raw = image(x, 320, true); removeStamp(raw, slot === 3 ? furniture[2] : furniture[0], slot === 3 ? 453 : 228, 200); return raw;
}
describe('goal-specific current anchors and fail-closed preparation', () => {
  test.each([56, 72])('verified early jump boundary%i qualifies', async distance => {
    const r = browser('gap-jump', image(264 - distance)), p = r.subject.run(5000); r.frame(); expect((await p).ok).toBe(true); expect(r.subject.finish().aborted).toBeNull();
  });
  test.each([55, 73])('outside early jump boundary%i cannot qualify', async distance => {
    const r = browser('gap-jump', image(264 - distance)), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false); expect(r.subject.finish().selected).toBeNull();
  });
  test.each([['projection', 330, 5], ['reveal', 420, 3]] as const)('%s needs only its current complete anchor', async (goal, x, slot) => {
    const r = browser(goal, onlyAnchor(x, slot)), p = r.subject.run(5000); r.frame(); expect((await p).ok).toBe(true); expect(r.subject.finish().selected?.props).toEqual([{ slot, x: slot === 3 ? 228 : 453 }]);
  });
  test('baseline still needs both chair and mirror', async () => {
    for (const slot of [3, 5] as const) { const r = browser('room-baseline', onlyAnchor(210, slot)), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false); }
  });
  test.each([411, 433])('reveal current-chair boundary%i qualifies without mirror', async x => {
    const r = browser('reveal', onlyAnchor(x, 3)), p = r.subject.run(5000); r.frame(); expect((await p).ok).toBe(true);
  });
  test.each([410, 434])('reveal outside boundary%i never qualifies', async x => {
    const r = browser('reveal', onlyAnchor(x, 3)), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false);
  });
  test.each(['missing', 'wrong', 'partial', 'duplicate', 'hero-missing', 'hero-duplicate', 'feet'] as const)('bad current anchor/actor:%s cannot use old or alternate success', async defect => {
    for (const [goal, x, slot] of [['projection', 330, 5], ['reveal', 420, 3]] as const) {
      const raw = image(x, defect === 'feet' ? 321 : 320, true), s = slot === 3 ? furniture[0] : furniture[2], origin = slot === 3 ? 228 : 453;
      if (defect === 'missing' || defect === 'wrong') removeStamp(raw, s, origin, 200);
      if (defect === 'wrong') paint(raw.rgba, s, origin + 1, 200);
      if (defect === 'partial') pixel(raw.rgba, origin + 1, 201, 0);
      if (defect === 'duplicate') paint(raw.rgba, s, 520, 200);
      if (defect === 'hero-missing') removeStamp(raw, heroStamp, x - 16, 293);
      if (defect === 'hero-duplicate') paint(raw.rgba, heroStamp, 40, 293);
      const r = browser(goal, raw), p = r.subject.run(5000); r.frame(); r.subject.cancel(); expect((await p).ok).toBe(false); expect(r.subject.finish().selected).toBeNull();
    }
  });
  test('reveal mirror-to-chair transition waits without borrowing the old mirror for success', async () => {
    const r = browser('reveal', onlyAnchor(330, 5)), p = watch(r.subject.run(5000)); r.frame(0); await tick(); expect(p.state.settled).toBe(false);
    r.port.read = () => onlyAnchor(395, 5); r.frame(16); await tick(); expect(p.state.settled).toBe(false);
    r.port.read = () => onlyAnchor(414, 3); r.frame(32); const out = await p.outcome; expect(out.ok && out.value.ok).toBe(true);
    const proof = r.subject.finish(); expect(proof.frames).toHaveLength(3); expect(proof.selected?.hero?.centerX).toBe(414); expect(proof.selected?.props).toEqual([{ slot: 3, x: 228 }]);
  });
  test('cached mirror does not qualify a later projection with only chair', async () => {
    const r = browser('projection', onlyAnchor(310, 5)), p = r.subject.run(5000); r.frame(); r.port.read = () => onlyAnchor(330, 3); r.frame(16);
    r.subject.cancel(); expect((await p).ok).toBe(false); expect(r.subject.finish().selected).toBeNull();
  });
  test.each(['hero', 'feet', 'floor', 'gap82'] as const)('latched critical gap stops on unavailable%s,not a cached ready pose', async lost => {
    const r = browser('gap-jump', image(184)), p = r.subject.run(5000); r.frame();
    const raw = image(200, lost === 'feet' ? 321 : 320, false, lost === 'gap82' ? 82 : 60);
    if (lost === 'hero') removeStamp(raw, heroStamp, 184, 293);
    if (lost === 'floor') for (let x = 0; x < 640; x++) pixel(raw.rgba, x, 320, 0);
    r.port.read = () => { r.calls.push('read'); return raw; }; const stale = [...r.rafs.values()][0]; r.frame(16); expect((await p).ok).toBe(false); stale(32);
    const proof = r.subject.finish(); expect(proof.selected).toBeNull(); expect(proof.aborted).toBe(proof.frames[1]); expect(proof.aborted?.unsafe).toContain('unavailable'); expect(r.calls.filter(c => c === 'read')).toHaveLength(2);
  });
  test('latched critical room cannot reset when current actor and both locators vanish', async () => {
    const r = browser('reveal', onlyAnchor(395, 5)), p = r.subject.run(5000); r.frame();
    r.port.read = () => ({ ...image(414), rgba: new Uint8ClampedArray(640 * 360 * 4) }); r.frame(16);
    expect((await p).ok).toBe(false); const proof = r.subject.finish(); expect(proof.selected).toBeNull(); expect(proof.aborted?.unsafe).toContain('Critical room');
  });
  test.each([325, 349])('projection boundary%i stays inclusive without chair', async x => {
    const r = browser('projection', onlyAnchor(x, 5)), p = r.subject.run(5000); r.frame(); expect((await p).ok).toBe(true);
  });
  test.each([['gap-jump', image(209)], ['room-baseline', image(225, 320, true)], ['projection', onlyAnchor(350, 5)], ['reveal', onlyAnchor(434, 3)]] as const)('%s first confirmed overshoot stops and preserves separate immutable abortRGBA', async (goal, raw) => {
    const r = browser(goal, raw), p = r.subject.run(5000), stale = [...r.rafs.values()][0], staleTimer = [...r.timers.values()][0], digest = r.digest(raw.rgba);
    r.frame(); expect((await p).ok).toBe(false); stale(16); staleTimer(); r.subject.cancel(); raw.rgba.fill(0);
    expect(r.rafs.size + r.timers.size).toBe(0); expect(r.calls.filter(c => c === 'read')).toHaveLength(1); expect(r.calls).not.toContain('encode');
    const proof = r.subject.finish(); expect(proof.selected).toBeNull(); expect(proof.png).toBeNull(); expect(proof.aborted?.unsafe).toContain('passed'); expect(proof.abortedPng).toBe('unit PNG marker'); expect(r.encoded).toEqual([digest]);
  });
  test('closed-door confirmed overshoot stops too', async () => {
    const raw = image(); paint(raw.rgba, furniture[1], 233, 200); const r = browser('closed-door', raw), p = r.subject.run(5000); r.frame(); expect((await p).ok).toBe(false); expect(r.subject.finish().aborted?.unsafe).toContain('Closed-door');
  });
  test('actual unsafe observer drives coordinator release without follow-through or encoding', async () => {
    const r = browser('reveal', onlyAnchor(434, 3)), calls: string[] = [];
    const port: OmegaMovePort<unknown> = { now: () => 0, timer: () => 1, cancelTimer: () => {}, down: async () => { calls.push('down'); }, up: async () => { calls.push('up'); },
      observe: async ms => { const result = await r.subject.run(ms); if (!result.ok) throw Error(result.problems.join(';')); return result; }, cancel: async () => { calls.push('cancel'); r.subject.cancel(); } };
    const p = watch(runOmegaMovement(port, async () => { calls.push('follow'); })); await tick(); r.frame(); expect((await p.outcome).ok).toBe(false);
    expect(calls).toContain('up'); expect(calls).toContain('cancel'); expect(calls).not.toContain('follow'); expect(r.calls).not.toContain('encode');
  });
});

// Offline controlled-state fixtures exercise the production physics;never injected into a browser.
function coreWorld() {
  return createWorld({ ...createRun('f955710e-6f1c-44aa-8ba6-3113dad8de42', 42), stage: 5, tokens: 200, elapsedMs: 60000,
    upgrades: ['reinforced'], inventory: ['constitutional'], actionCounts: { shots: 0, dashes: 0, rewinds: 0, insights: 300 } });
}
const runInput = { ...EMPTY_INPUT, move: 1 as const };
function coreGap(gap: number, vx: number, delay: number, release: number, engine: 'controller' | 'simulation') {
  let world = coreWorld(), player = { ...createPlayer(680 - gap, 309, 60000), vx, grounded: true, standingOn: 'omega-floor-0' as string | null }, now = 60000, airborne = false;
  let first: { tick: number; platform: string | null; feet: number; overlap: number } | null = null; world.player = player;
  for (let n = 0; n < delay + 21 + release + 33; n++) {
    const input = { ...runInput, jumpPressed: n === delay, jumpHeld: n >= delay && n < delay + 21 + release }; now += TUNING.stepMs;
    if (engine === 'controller') player = movePlayer(player, input, CHAPTER_FIVE.platforms, now, TUNING.stepMs / 1000, false, CHAPTER_FIVE).player;
    else { world = stepWorld(world, input, TUNING.stepMs); player = world.player; }
    if (!player.grounded) airborne = true;
    if (airborne && player.grounded && !first) first = { tick: n - delay + 1, platform: player.standingOn, feet: player.y + 11, overlap: player.x + 8 - 740 };
  }
  return { first, player, world };
}
describe('actual fixed60Hz Core launch geometry,not native evidence', () => {
  test.each(Array.from({ length: 18 }, (_, i) => 56 + i))('gap%i reaches actual far support over explored low/hot velocities and dispatch/release ticks', gap => {
    expect(TUNING.stepMs).toBe(1000 / 60);
    for (const engine of ['controller', 'simulation'] as const) for (const vx of [0, 40, 100, 190]) for (const delay of [0, 1, 2, 6]) for (const release of [-1, 0, 1]) {
      const r = coreGap(gap, vx, delay, release, engine);
      expect(r.first).toMatchObject({ tick: 42, platform: 'omega-floor-1', feet: 320 }); expect(r.first?.overlap).toBeGreaterThan(1.9);
      expect(r.player.grounded).toBe(true); expect(r.player.standingOn).toBe('omega-floor-1'); expect(r.player.y + 11).toBe(320); expect(r.world.mode).toBe('playing'); expect(r.world.save.hp).toBeGreaterThan(0);
    }
  });
  test.each([[75, 0], [81, 190]])('unsafe earlier gap%i/vx%i is a real falling counterexample', (gap, vx) => {
    for (const engine of ['controller', 'simulation'] as const) { const r = coreGap(gap, vx, 0, 0, engine); expect(r.first).toBeNull(); expect(r.player.grounded).toBe(false); expect(r.player.y + 11).toBeGreaterThan(320); }
  });
  test.each([0, 21, 75, 120])('ordinary D then original21+33 ticks from actual CP0 after idle%i', idle => {
    for (const delay of [0, 1, 2, 6]) {
      let world = coreWorld(); for (let n = 0; n < idle; n++) world = stepWorld(world, EMPTY_INPUT, TUNING.stepMs);
      let moved = 0; while (world.player.x < 608 && world.mode === 'playing' && moved < 300) { world = stepWorld(world, runInput, TUNING.stepMs); moved++; }
      expect(680 - world.player.x).toBeGreaterThanOrEqual(56); expect(680 - world.player.x).toBeLessThanOrEqual(72); expect(world.player.grounded).toBe(true);
      let airborne = false, landing: string | null = null;
      for (let n = 0; n < delay + 54; n++) {
        world = stepWorld(world, { ...runInput, jumpPressed: n === delay, jumpHeld: n >= delay && n < delay + 21 }, TUNING.stepMs);
        if (!world.player.grounded) airborne = true;
        if (airborne && world.player.grounded && !landing) landing = world.player.standingOn;
      }
      expect(landing).toBe('omega-floor-1'); expect(world.player.grounded).toBe(true); expect(world.player.y + 11).toBe(320); expect(world.mode).toBe('playing'); expect(world.save.hp).toBeGreaterThan(0);
    }
  });
});
