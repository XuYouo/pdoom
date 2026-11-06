import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem, type AudioFrame } from '../../src/pages/GamePage/game/audio/AudioSystem';
import { FakeContext } from './fakeAudio';
const frame: AudioFrame = { runId: 'actions', stage: 4, doom: 8, bossActive: true, running: true, elapsedMs: 5000,
  hp: 100, shots: 0, rewinds: 0, dashes: 0, insights: 0, rerolls: 0, turns: 0, stemsLost: 4 };
const actions = ['dashes', 'insights'] as const;
let owned: AudioSystem[];
beforeEach(() => { vi.useFakeTimers(); owned = []; });
afterEach(() => { owned.forEach(system => system.destroy()); vi.clearAllTimers(); vi.useRealTimers(); });
function setup() {
  const context = new FakeContext(), factory = vi.fn(() => context.asContext());
  const system = new AudioSystem(() => undefined, factory); owned.push(system); system.update(frame);
  return { context, factory, system };
}
// Lifecycle/API doubles only. Native waveform and real-input proof are browser tests.
describe('new ability cues retain the existing AudioSystem lifecycle', () => {
  it.each(actions)('%s before gesture is consumed without allocation or later backlog', async key => {
    const h = setup(), next = { ...frame, [key]: 100 }; h.system.update(next);
    expect(h.factory).not.toHaveBeenCalled(); await h.system.unlock(); expect(h.context.sources).toHaveLength(0);
    h.system.update({ ...next, elapsedMs: 5100 }); expect(h.context.sources).toHaveLength(0);
    h.system.update({ ...next, [key]: 101, elapsedMs: 5200 }); expect(h.context.sources).toHaveLength(2);
  });
  it.each(actions)('%s schedules two bounded voices with all music swallowed, never repeated snapshots', async key => {
    const h = setup(); await h.system.unlock(); expect(vi.getTimerCount()).toBe(0);
    const next = { ...frame, [key]: 1, elapsedMs: 5100 }; h.system.update(next);
    expect(h.context.sources).toHaveLength(2);
    h.system.update(next); expect(h.context.sources).toHaveLength(2);
    h.context.advance(1); expect(h.context.sources.every(source => source.disconnected)).toBe(true);
    h.system.update({ ...next, elapsedMs: 6100 }); expect(h.context.sources).toHaveLength(2);
    h.system.destroy(); expect(h.context.closeCalls).toBe(1); expect(h.factory).toHaveBeenCalledOnce();
  });
  it.each(actions)('%s anti-burst guard drops rapid deltas instead of queueing them', async key => {
    const h = setup(); await h.system.unlock(); h.system.update({ ...frame, [key]: 1 });
    h.context.advance(0.02); h.system.update({ ...frame, [key]: 2 }); expect(h.context.sources).toHaveLength(2);
    h.context.advance(0.2); h.system.update({ ...frame, [key]: 2 }); expect(h.context.sources).toHaveLength(2);
    h.system.update({ ...frame, [key]: 3 }); expect(h.context.sources).toHaveLength(4);
  });
  it.each(actions.flatMap(key => [{ key, muted: true, volume: 0.5 }, { key, muted: false, volume: 0 }]))('%s disabled output never replays accumulated ability counts', async ({ key, muted, volume }) => {
    const h = setup(); await h.system.unlock(); h.system.setPreferences({ muted, volume });
    const next = { ...frame, [key]: 200, elapsedMs: 6000 }; h.system.update(next);
    await vi.advanceTimersByTimeAsync(50); expect(h.context.state).toBe('suspended'); expect(h.context.sources).toHaveLength(0);
    h.system.setPreferences({ muted: false, volume: 0.5 }); await h.system.unlock(); h.system.update(next);
    expect(h.context.sources).toHaveLength(0);
    h.system.update({ ...next, [key]: 201, elapsedMs: 6200 }); expect(h.context.sources).toHaveLength(2);
    expect(h.factory).toHaveBeenCalledOnce();
  });
  it.each(actions)('%s does not replay a cue consumed at a frozen boundary', async key => {
    const h = setup(); await h.system.unlock(); const next = { ...frame, [key]: 1, running: false };
    h.system.update(next); await vi.advanceTimersByTimeAsync(50); expect(h.context.state).toBe('suspended');
    h.system.update({ ...next, running: true }); await h.system.unlock(); expect(h.context.sources).toHaveLength(0);
    h.system.update({ ...next, running: true, [key]: 2 }); expect(h.context.sources).toHaveLength(2);
  });
  it.each(actions)('%s rollback releases old voices and does not play other increased counters', async key => {
    const h = setup(); await h.system.unlock(); h.system.update({ ...frame, [key]: 1 }); expect(h.context.sources).toHaveLength(2);
    h.system.update({ ...frame, [key]: 0, shots: 100 });
    expect(h.context.sources).toHaveLength(2); expect(h.context.sources.every(source => source.disconnected)).toBe(true);
  });
  it('same-frame turn confirmation replaces dash rather than doubling the two effects', async () => {
    const h = setup(); await h.system.unlock(); h.system.update({ ...frame, dashes: 1, turns: 1 });
    expect(h.context.sources).toHaveLength(2);
    expect(h.context.sources.some(source => source.frequency.events.some(event => event.kind === 'set' && event.value === 760))).toBe(false);
    expect(h.context.sources.some(source => source.frequency.events.some(event => event.kind === 'set' && event.value === 180))).toBe(true);
  });
});
