import type { GameSaveData } from '../../../objects/game/GameSaveData';
import { isGameSave } from '../../../objects/game/validation';
export { isGameSave, isUuid } from '../../../objects/game/validation';

export function createRun(runId: string, seed: number): GameSaveData {
  return {
    schemaVersion: 1, runId, seed, stage: 1, checkpoint: 0,
    hp: 100, doom: 8, tokens: 0, score: 0, elapsedMs: 0,
    inventory: ['constitutional'], upgrades: [], donated: false,
    actionCounts: { shots: 0, dashes: 0, rewinds: 0, insights: 0 },
  };
}

export function parseSave(raw: string): GameSaveData | null {
  try { const data: unknown = JSON.parse(raw); return isGameSave(data) ? data : null; } catch { return null; }
}

export function formatTime(elapsedMs: number) {
  const seconds = Math.floor(elapsedMs / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
