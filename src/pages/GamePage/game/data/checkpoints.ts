import type { GameSaveData } from '../../../../objects/game/GameSaveData';

export const FINAL_CHECKPOINT = 90;
export type RestRoomId = 1 | 2;
export interface DecodedCheckpoint { room: 0 | RestRoomId; resting: boolean; hackUsed: boolean; supported: boolean }

/** v1 additions: 11/12 = open room; 21/22 = open room after its single hack.
 * Legacy 0/1/2 remain closed progress markers. Never compare encoded values by magnitude.
 */
export function decodeCheckpoint(encoded: number): DecodedCheckpoint {
  if (encoded === 0 || encoded === 1 || encoded === 2) return { room: encoded, resting: false, hackUsed: false, supported: true };
  if (encoded === 11 || encoded === 12) return { room: (encoded - 10) as RestRoomId, resting: true, hackUsed: false, supported: true };
  if (encoded === 21 || encoded === 22) return { room: (encoded - 20) as RestRoomId, resting: true, hackUsed: true, supported: true };
  return { room: 0, resting: false, hackUsed: false, supported: false };
}
export const encodeRestCheckpoint = (room: RestRoomId, hackUsed = false) => (hackUsed ? 20 : 10) + room;

export const isCompletedSave = (save: Pick<GameSaveData, 'stage' | 'checkpoint'>): boolean => save.stage === 5 && save.checkpoint === FINAL_CHECKPOINT;
export const isSupportedCheckpoint = (save: Pick<GameSaveData, 'stage' | 'checkpoint'>): boolean => isCompletedSave(save) || decodeCheckpoint(save.checkpoint).supported;
