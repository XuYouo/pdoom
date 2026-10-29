import { expect, type Page } from '@playwright/test';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { isGameSave } from '../../src/pages/GamePage/functions/saveModel';

/** Assert the new identity policy without weakening any persisted-progress comparison. Read-only. */
export async function assertCheckpointAttempt(page: Page, previous: GameSaveData): Promise<GameSaveData> {
  const next: GameSaveData = await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'));
  expect(isGameSave(next)).toBe(true);
  expect(next.runId).not.toBe(previous.runId);
  expect(next).toEqual({ ...previous, runId: next.runId });
  return next;
}
