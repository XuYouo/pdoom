import { describe, expect, it } from 'vitest';
import { createRun, formatTime, isGameSave, parseSave } from '../../src/pages/GamePage/functions/saveModel';
import { readLocalSave, writeLocalSave } from '../../src/pages/GamePage/functions/localSave';

const valid = createRun('8d5a4ccb-a1b1-44c2-bd20-9e503de02211', 82);
const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
describe('versioned checkpoints', () => {
  it('round trips a real new run', () => expect(parseSave(JSON.stringify(valid))).toEqual(valid));
  it.each([ { ...valid, schemaVersion: 2 }, { ...valid, doom: 101 }, { ...valid, hp: NaN }, { ...valid, stage: 6 }, { ...valid, seed: 0 }, { ...valid, inventory: ['unknown'] }, { ...valid, inventory: ['constitutional', 'constitutional'] }, { ...valid, runId: 'not-a-uuid' }, { ...valid, elapsedMs: Infinity }, { ...valid, actionCounts: { ...valid.actionCounts, shots: 1000001 } } ])('rejects incompatible or tampered saves', data => expect(isGameSave(data)).toBe(false));
  it('returns null for malformed data', () => expect(parseSave('{')).toBeNull());
  it('reports empty and unavailable storage honestly', () => {
    expect(readLocalSave(memory())).toEqual({ status: 'empty' });
    expect(readLocalSave({ getItem: () => { throw new Error('denied'); } }).status).toBe('error');
  });
  it('preserves a valid backup and recovers it after primary corruption', () => {
    const store = memory();
    writeLocalSave(store, valid);
    writeLocalSave(store, { ...valid, score: 100 });
    store.setItem('pdoom.save.v1', '{invalid');
    expect(readLocalSave(store)).toEqual({ status: 'ready', save: valid, recovered: true });
  });
  it('does not overwrite a valid save with invalid data', () => {
    const store = memory(); writeLocalSave(store, valid);
    expect(() => writeLocalSave(store, { ...valid, hp: -1 })).toThrow();
    expect(readLocalSave(store)).toEqual({ status: 'ready', save: valid, recovered: false });
  });
  it('formats paused-independent simulation duration', () => expect(formatTime(125499)).toBe('02:05'));
});
