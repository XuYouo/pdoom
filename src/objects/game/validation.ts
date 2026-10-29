import { RELIC_IDS, UPGRADE_IDS, type GameSaveData } from './GameSaveData';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const numberIn = (value: unknown, min: number, max: number, integer = false): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
const knownIds = (value: unknown, allowed: readonly string[]) => Array.isArray(value) && value.length <= 12 && new Set(value).size === value.length && value.every(id => typeof id === 'string' && allowed.includes(id));
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Pure v1 data validation shared by local saves and transport decoders, never engine/page IO. */
export function isGameSave(value: unknown): value is GameSaveData {
  if (!record(value) || value.schemaVersion !== 1 || !isUuid(value.runId)) return false;
  const counts = value.actionCounts;
  return numberIn(value.seed, 1, 2147483647, true)
    && numberIn(value.stage, 1, 5, true) && numberIn(value.checkpoint, 0, 100, true)
    && numberIn(value.hp, 0, 100) && numberIn(value.doom, 0, 100)
    && numberIn(value.tokens, 0, 1000000, true) && numberIn(value.score, 0, 10000000, true)
    && numberIn(value.elapsedMs, 0, 86400000, true)
    && knownIds(value.inventory, RELIC_IDS) && knownIds(value.upgrades, UPGRADE_IDS)
    && typeof value.donated === 'boolean' && record(counts)
    && ['shots', 'dashes', 'rewinds', 'insights'].every(key => numberIn(counts[key], 0, 1000000, true));
}
