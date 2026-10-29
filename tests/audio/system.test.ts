import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem, type AudioFrame } from '../../src/pages/GamePage/game/audio/AudioSystem';
import type { AudioStatus } from '../../src/pages/GamePage/game/bridge';
import { FakeContext, FakeGain } from './fakeAudio';

const frame: AudioFrame = { runId: 'run-a', stage: 4, doom: 85, bossActive: true, running: true, elapsedMs: 5000, hp: 90, shots: 1, rewinds: 0, rerolls: 0, turns: 0, stemsLost: 0 };
let owned: AudioSystem[] = [];
beforeEach(() => { vi.useFakeTimers(); owned = []; vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { owned.forEach(system => system.destroy()); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
function setup(context = new FakeContext()) {
  const status: AudioStatus[] = []; const factory = vi.fn(() => context.asContext());
  const system = new AudioSystem(value => status.push(value), factory); owned.push(system);
  return { system, context, factory, status };
}

// Only lifecycle/API structure is doubled here. Native rendered waveform/RMS is a separate Lead check.
describe('page-private AudioSystem lifecycle', () => {
  it('allocates nothing before an explicit unlock and coalesces concurrent gestures', async () => {
    const { system, context, factory, status } = setup();
    system.setPreferences({ muted: false, volume: 0.5 }); system.update(frame);
    expect(factory).not.toHaveBeenCalled(); expect(status).toEqual(['locked']); expect(vi.getTimerCount()).toBe(0);
    const first = system.unlock(), second = system.unlock(); expect(second).toBe(first);
    await first;
    expect(factory).toHaveBeenCalledOnce(); expect(context.state).toBe('running'); expect(status[status.length - 1]).toBe('running');
    expect(context.sources.length).toBeGreaterThan(0); expect(vi.getTimerCount()).toBe(1);
  });
  it('can warm an unlocked context while no game is running without scheduling notes', async () => {
    const { system, context, status } = setup(); await system.unlock();
    await vi.advanceTimersByTimeAsync(50);
    expect(context.sources).toHaveLength(0); expect(context.state).toBe('suspended'); expect(status[status.length - 1]).toBe('suspended');
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['pause', 'rest', 'blur'])('honors running:false immediately for %s-style transitions', async () => {
    const { system, context, status, factory } = setup(); system.update(frame); await system.unlock();
    for (let index = 0; index < 10; index++) system.update({ ...frame, running: false });
    expect(vi.getTimerCount()).toBe(1); // Only the bounded 40ms fade-to-suspend remains, not the music interval.
    await vi.advanceTimersByTimeAsync(50);
    expect(context.state).toBe('suspended'); expect(context.sources.every(source => source.disconnected)).toBe(true);
    expect(status[status.length - 1]).toBe('suspended'); expect(vi.getTimerCount()).toBe(0);
    system.update({ ...frame, elapsedMs: 5017 }); await system.unlock();
    expect(factory).toHaveBeenCalledOnce(); expect(context.state).toBe('running'); expect(vi.getTimerCount()).toBe(1);
  });
  it('stops the music clock when four stems are swallowed but still schedules new SFX', async () => {
    const { system, context } = setup(); system.update(frame); await system.unlock();
    system.update({ ...frame, stemsLost: 4 }); expect(vi.getTimerCount()).toBe(0);
    const before = context.sources.length;
    context.advance(0.1); system.update({ ...frame, stemsLost: 4, shots: 2, elapsedMs: 5100 });
    expect(context.sources.length - before).toBe(1);
    system.update({ ...frame, shots: 2, elapsedMs: 5117, stemsLost: 0 });
    expect(vi.getTimerCount()).toBe(1); expect(context.sources.length).toBeGreaterThan(before + 1);
  });
  it('mutes all output and does not replay counters accumulated while muted', async () => {
    const { system, context } = setup(); system.update(frame); await system.unlock();
    system.setPreferences({ muted: true, volume: 1 });
    system.update({ ...frame, shots: 200, elapsedMs: 5200 });
    await vi.advanceTimersByTimeAsync(50); expect(context.state).toBe('suspended');
    system.setPreferences({ muted: false, volume: 0.4 }); await system.unlock();
    const before = context.sources.length;
    system.update({ ...frame, shots: 200, elapsedMs: 5217 });
    expect(context.sources.length).toBe(before); // No backlog of 199 old shot cues.
  });
  it('resets stage/run music without emitting historical counter bursts', async () => {
    const { system, context } = setup(); system.update(frame); await system.unlock();
    const before = context.sources.length;
    system.update({ ...frame, runId: 'new-run', stage: 1, shots: 999, rewinds: 80, elapsedMs: 0 });
    expect(context.sources.length - before).toBeLessThanOrEqual(5);
    expect(context.sources.slice(0, before).every(source => source.disconnected)).toBe(true);
  });
  it('skips missed audio-clock steps instead of scheduling an unbounded catch-up burst', async () => {
    const { system, context } = setup(); system.update(frame); await system.unlock();
    const before = context.sources.length; context.advance(1000);
    await vi.advanceTimersByTimeAsync(25);
    expect(context.sources.length - before).toBeLessThanOrEqual(10);
    expect(vi.getTimerCount()).toBe(1);
  });
  it('keeps one running context through repeated two-stem/full/four-stem transitions at a nonzero clock', async () => {
    const context = new FakeContext(); context.currentTime = 137.008;
    const { system, status, factory } = setup(context); system.update(frame); await system.unlock();
    let elapsedMs = frame.elapsedMs, turns = 0;
    for (const stemsLost of [2, 0, 2, 0, 4, 0, 2, 0]) {
      if (stemsLost === 0) turns++;
      for (let tick = 0; tick < 20; tick++) {
        context.advance(1 / 60); elapsedMs += 1000 / 60;
        system.update({ ...frame, elapsedMs, stemsLost, turns });
        await vi.advanceTimersByTimeAsync(17);
      }
      expect(context.state).toBe('running'); expect(context.closeCalls).toBe(0);
    }
    expect(factory).toHaveBeenCalledOnce(); expect(status).not.toContain('unavailable'); expect(console.warn).not.toHaveBeenCalled();
  });
  it('preserves an unexpected native gain error with one bounded local diagnostic before closing', async () => {
    const { system, context, status } = setup(); context.currentTime = 123.456;
    system.update(frame); await system.unlock();
    const chip = context.nodes.filter((node): node is FakeGain => node instanceof FakeGain)[3];
    const original = new Error('native gain operation rejected'); original.name = 'InvalidStateError';
    vi.spyOn(chip.gain, 'setValueAtTime').mockImplementationOnce(() => { throw original; });
    expect(() => system.update({ ...frame, stemsLost: 2 })).not.toThrow();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[P(Doom) audio disabled]', expect.objectContaining({ operation: 'reconcile', contextState: 'running', audioTime: 123.456, stemsLost: 2, name: 'InvalidStateError', message: original.message }), original);
    expect(status[status.length - 1]).toBe('unavailable'); expect(context.closeCalls).toBe(1);
    system.update({ ...frame, stemsLost: 2 }); await system.unlock(); system.destroy();
    expect(console.warn).toHaveBeenCalledOnce();
  });
  it('contains unlock failures, reports unavailable, and closes the failed context', async () => {
    const context = new FakeContext(); context.rejectResume = true;
    const { system, status, factory } = setup(context); system.update(frame);
    await expect(system.unlock()).resolves.toBeUndefined();
    expect(status[status.length - 1]).toBe('unavailable'); expect(context.closeCalls).toBe(1); expect(vi.getTimerCount()).toBe(0);
    await system.unlock(); expect(factory).toHaveBeenCalledOnce();
  });
  it('contains a missing native API without constructing a game-breaking rejection', async () => {
    const statuses: AudioStatus[] = [];
    const system = new AudioSystem(value => statuses.push(value), () => { throw new Error('no AudioContext'); }); owned.push(system);
    await expect(system.unlock()).resolves.toBeUndefined(); expect(statuses).toEqual(['locked', 'unavailable']);
  });
  it('does not resurrect audio after destroy races a pending resume', async () => {
    const context = new FakeContext(); let release!: () => void;
    context.resumeGate = new Promise<void>(resolve => { release = resolve; });
    const { system, status } = setup(context); system.update(frame);
    const pending = system.unlock(); system.destroy(); const observed = [...status]; release(); await pending;
    expect(context.closeCalls).toBe(1); expect(context.state).toBe('closed'); expect(vi.getTimerCount()).toBe(0);
    expect(status).toEqual(observed); expect(context.nodes.every(node => node.disconnected)).toBe(true);
    system.destroy(); expect(context.closeCalls).toBe(1);
  });
});
