import { describe, expect, it } from 'vitest';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { isGameSave } from '../../src/objects/game/validation';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { forkCheckpointAttempt } from '../../src/pages/GamePage/functions/checkpointAttempt';

const ORIGINAL = '465df28f-4c40-4c3c-b401-56bb55b6de89';
const NEXT = '4c6d9953-b7f8-4bde-9173-40126ae2a02a';
const saved = (stage: number, checkpoint: number): GameSaveData => ({ ...createRun(ORIGINAL, 42), stage, checkpoint, hp: 37.25, doom: 79.999, tokens: 379, score: 4189, elapsedMs: 499999, inventory: ['lisp', 'constitutional', 'residual'], upgrades: ['reinforced', 'calibrated'], donated: stage % 2 === 0, actionCounts: { shots: 127, dashes: 34, rewinds: 9, insights: 18 } });

describe('explicit checkpoint attempt identity', () => {
  it.each([1, 2, 3, 4, 5])('preserves every v1 field and ordering at every supported unfinished point in chapter %i', stage => {
    for (const checkpoint of [0, 1, 2, 11, 12, 21, 22]) {
      const source = saved(stage, checkpoint); const before = JSON.stringify(source);
      Object.freeze(source.inventory); Object.freeze(source.upgrades); Object.freeze(source.actionCounts); Object.freeze(source);
      const attempt = forkCheckpointAttempt(source, NEXT);
      expect(attempt).not.toBeNull(); expect(isGameSave(attempt)).toBe(true); expect(attempt?.runId).toBe(NEXT);
      expect({ ...attempt, runId: source.runId }).toEqual(source); expect(Object.keys(attempt!).sort()).toEqual(Object.keys(source).sort());
      expect(attempt).not.toBe(source); expect(attempt!.inventory).not.toBe(source.inventory); expect(attempt!.upgrades).not.toBe(source.upgrades); expect(attempt!.actionCounts).not.toBe(source.actionCounts);
      attempt!.inventory.reverse(); attempt!.upgrades.reverse(); attempt!.actionCounts.shots++;
      expect(JSON.stringify(source)).toBe(before);
    }
  });
  it('never forks a completed record; the caller must replay its original identity', () => {
    const source = saved(5, 90); const before = JSON.stringify(source);
    expect(isGameSave(source)).toBe(true); expect(forkCheckpointAttempt(source, NEXT)).toBeNull(); expect(JSON.stringify(source)).toBe(before);
  });
  it('preserves legal unknown points and wrong-chapter terminal markers', () => {
    for (const source of [...[1, 2, 3, 4, 5].map(stage => saved(stage, 99)), ...[1, 2, 3, 4].map(stage => saved(stage, 90))]) {
      const before = JSON.stringify(source); expect(isGameSave(source)).toBe(true); expect(forkCheckpointAttempt(source, NEXT)).toBeNull(); expect(JSON.stringify(source)).toBe(before);
    }
  });
  it.each(['not-a-uuid', ORIGINAL, ORIGINAL.toUpperCase()])('rejects an invalid or semantically identical new identity %s', id => {
    const source = saved(2, 21); const before = JSON.stringify(source);
    expect(forkCheckpointAttempt(source, id)).toBeNull(); expect(JSON.stringify(source)).toBe(before);
  });
  it('does not repair invalid data or heal a zero-HP valid checkpoint', () => {
    const source = saved(3, 11);
    expect(forkCheckpointAttempt({ ...source, hp: NaN }, NEXT)).toBeNull();
    expect(forkCheckpointAttempt({ ...source, hp: 0 }, NEXT)).toEqual({ ...source, hp: 0, runId: NEXT });
  });
});
