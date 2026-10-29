import type { Ending } from '../GameSaveData';
import { isGameSave, isUuid } from '../validation';
import type { LoadGameResponse } from './LoadGameResponse';
import type { SaveGameResponse } from './SaveGameResponse';
import type { SubmitScoreResponse } from './SubmitScoreResponse';
import type { LeaderboardEntry, ListLeaderboardResponse } from './ListLeaderboardResponse';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const instant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const ending = (value: unknown): value is Ending => value === 'defeat' || value === 'aligned' || value === 'warden' || value === 'foom';

export function isLoadGameResponse(value: unknown): value is LoadGameResponse {
  if (!record(value)) return false;
  return value.save === null
    ? value.revision === 0 && value.updatedAt === null
    : isGameSave(value.save) && integer(value.revision, 1) && instant(value.updatedAt);
}
export function isSaveGameResponse(value: unknown): value is SaveGameResponse {
  return record(value) && integer(value.revision, 1) && instant(value.updatedAt);
}
export function isSubmitScoreResponse(value: unknown): value is SubmitScoreResponse {
  return record(value) && isUuid(value.scoreId) && typeof value.personalBest === 'boolean';
}
function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (!record(value) || !integer(value.rank, 1, 10050) || typeof value.username !== 'string' || !/^[A-Za-z0-9_]{3,32}$/.test(value.username)
      || !integer(value.score, 0, 10000000) || !integer(value.stage, 1, 5)
      || typeof value.doom !== 'number' || !Number.isFinite(value.doom) || value.doom < 0 || value.doom > 100
      || !ending(value.ending) || !instant(value.createdAt)) return false;
  return value.ending === 'defeat' || value.stage === 5 && (
    value.ending === 'aligned' && value.doom < 30
    || value.ending === 'warden' && value.doom >= 30 && value.doom < 80
    || value.ending === 'foom' && value.doom >= 80);
}
export function isListLeaderboardResponse(value: unknown): value is ListLeaderboardResponse {
  return record(value) && Array.isArray(value.entries) && value.entries.length <= 50 && value.entries.every(isLeaderboardEntry)
    && (value.nextOffset === null || integer(value.nextOffset, 1, 10000));
}
