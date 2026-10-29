import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { CheckpointMemoryCache, checkpointMemoryKey } from '../../src/pages/GamePage/game/systems/runMemory';

const save = () => createRun('77777777-7777-4777-8777-777777777777', 42);
type Memory = { sequence: string[]; hits: { count: number } };
const copy = (value: Memory): Memory => ({ sequence: [...value.sequence], hits: { ...value.hits } });

describe('Scene-owned safe-point behavior memory', () => {
  it('copies at both boundaries and survives a same-run chapter transition with an exact snapshot', () => {
    const cache = new CheckpointMemoryCache(copy);
    const next = { ...save(), stage: 5, elapsedMs: 50000, score: 2200 };
    const original = { sequence: ['dash', 'shot'], hits: { count: 4 } };
    cache.store(next, original); original.sequence.push('rewind'); original.hits.count = 99;
    const first = cache.restore(next)!; expect(first).toEqual({ sequence: ['dash', 'shot'], hits: { count: 4 } });
    first.hits.count = 100; first.sequence.pop();
    expect(cache.restore(next)).toEqual({ sequence: ['dash', 'shot'], hits: { count: 4 } });
  });
  it('does not attach future observations to an older safe checkpoint or a different cloud payload', () => {
    const cache = new CheckpointMemoryCache(copy); const before = save();
    const after = { ...before, elapsedMs: 12000, actionCounts: { ...before.actionCounts, shots: 9 } };
    cache.store(after, { sequence: ['shot', 'dash'], hits: { count: 2 } });
    expect(cache.restore(before)).toBeUndefined();
    expect(cache.restore({ ...after, tokens: 1 })).toBeUndefined();
    expect(cache.restore({ ...after, seed: 77 })).toBeUndefined();
    expect(cache.restore({ ...after, inventory: ['recursive'] })).toBeUndefined();
  });
  it('keeps inventory order meaningful but ignores JSON object property order', () => {
    const value = { ...save(), inventory: ['constitutional', 'recursive'] as const };
    const mutable = { ...value, inventory: [...value.inventory] };
    const reordered = { ...mutable, actionCounts: { insights: 0, rewinds: 0, dashes: 0, shots: 0 } };
    expect(checkpointMemoryKey(mutable)).toBe(checkpointMemoryKey(reordered));
    expect(checkpointMemoryKey(mutable)).not.toBe(checkpointMemoryKey({ ...mutable, inventory: [...mutable.inventory].reverse() }));
  });
  it('drops memory on a different run and never resurrects it by switching back', () => {
    const cache = new CheckpointMemoryCache(copy); const first = save();
    cache.store(first, { sequence: ['shot'], hits: { count: 1 } });
    expect(cache.restore({ ...first, runId: '88888888-8888-4888-8888-888888888888' })).toBeUndefined();
    expect(cache.restore(first)).toBeUndefined(); expect(cache.size).toBe(0);
  });
  it('bounds entries, replaces duplicate safe snapshots, and clears on scene destruction', () => {
    const cache = new CheckpointMemoryCache(copy, 2); const initial = save();
    const memory = { sequence: ['shot'], hits: { count: 1 } };
    cache.store(initial, memory); cache.store(initial, memory); expect(cache.size).toBe(1);
    cache.store({ ...initial, checkpoint: 1 }, memory); cache.store({ ...initial, checkpoint: 2 }, memory);
    expect(cache.size).toBe(2); expect(cache.restore(initial)).toBeUndefined();
    expect(cache.restore({ ...initial, checkpoint: 2 })).toEqual(memory);
    cache.clear(); expect(cache.size).toBe(0);
  });
  it('starts empty after a page reload and rejects an unbounded capacity', () => {
    expect(new CheckpointMemoryCache(copy).restore(save())).toBeUndefined();
    for (const capacity of [0, -1, 129, Infinity, 1.5]) expect(() => new CheckpointMemoryCache(copy, capacity)).toThrow();
  });
});
