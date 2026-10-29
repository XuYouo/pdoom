import type { GameSaveData } from '../../../objects/game/GameSaveData';
import { isGameSave, isUuid } from '../../../objects/game/validation';
import { isChapterPlayable } from '../game/data/chapters';
import { isCompletedSave, isSupportedCheckpoint } from '../game/data/checkpoints';

/** A deliberate checkpoint retry is a new score identity, not a reset or a retry of an upload. */
export function forkCheckpointAttempt(save: GameSaveData, newRunId: string): GameSaveData | null {
  if (!isGameSave(save) || !isChapterPlayable(save.stage) || !isSupportedCheckpoint(save) || isCompletedSave(save)
    || !isUuid(newRunId) || newRunId.toLowerCase() === save.runId.toLowerCase()) return null;
  return { ...save, runId: newRunId, inventory: [...save.inventory], upgrades: [...save.upgrades], actionCounts: { ...save.actionCounts } };
}
