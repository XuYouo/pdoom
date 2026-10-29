import type { GameSaveData } from '../../../../objects/game/GameSaveData';

/** Exact, canonical safe snapshot identity. Object property order from cloud JSON is irrelevant. */
export function checkpointMemoryKey(save: GameSaveData): string {
  const { schemaVersion, runId, seed, stage, checkpoint, hp, doom, tokens, score, elapsedMs, inventory, upgrades, donated, actionCounts } = save;
  return JSON.stringify([schemaVersion, runId, seed, stage, checkpoint, hp, doom, tokens, score, elapsedMs,
    inventory, upgrades, donated, actionCounts.shots, actionCounts.dashes, actionCounts.rewinds, actionCounts.insights]);
}

/** Scene-owned, bounded, nonpersistent memory. It never invents ordered history after a reload/cloud restore. */
export class CheckpointMemoryCache<T> {
  private runId: string | null = null;
  private entries = new Map<string, T>();
  private capacity: number;

  constructor(private copy: (value: T) => T, capacity = 48) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 128) throw new Error('Invalid run-memory capacity');
    this.capacity = capacity;
  }
  private selectRun(runId: string) {
    if (this.runId !== runId) { this.entries.clear(); this.runId = runId; }
  }
  store(save: GameSaveData, memory: T) {
    this.selectRun(save.runId);
    const key = checkpointMemoryKey(save);
    this.entries.delete(key); this.entries.set(key, this.copy(memory));
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }
  restore(save: GameSaveData): T | undefined {
    this.selectRun(save.runId);
    const value = this.entries.get(checkpointMemoryKey(save));
    return value === undefined ? undefined : this.copy(value);
  }
  clear() { this.entries.clear(); this.runId = null; }
  get size() { return this.entries.size; }
}
