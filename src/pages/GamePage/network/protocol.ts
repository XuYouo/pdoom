export const COOP_BUILD_ID = 'pdoom-coop-v1';
export const COOP_PROTOCOL_VERSION = 1 as const;
export type CoopSlot = 0 | 1;
export type CoopAction = 'pause' | 'resume' | 'continue-ready';
export interface CoopRoom {
  v: 1; type: 'room'; roomId: string; code: string; buildId: string;
  phase: 'lobby' | 'playing' | 'reconnecting'; version: number; selfSlot: CoopSlot;
  players: Array<{ slot: CoopSlot; connected: boolean; ready: boolean }>;
  matchId: string | null;
}
export type CoopClientMessage =
  | { type: 'create'; requestId: string; buildId: string }
  | { type: 'join'; requestId: string; code: string; buildId: string }
  | { type: 'ready'; requestId: string; ready: boolean }
  | { type: 'start' | 'leave'; requestId: string }
  | { type: 'reconnect'; requestId: string; roomId: string }
  | { type: 'command'; requestId: string; action: CoopAction }
  | { type: 'state' | 'input'; seq: number; payload: Record<string, unknown> };
export interface CoopFrame {
  v: 1; type: 'state' | 'input'; seq: number; slot: CoopSlot;
  roomId: string; matchId: string; connectionId: string; payload: Record<string, unknown>;
}
export type CoopServerMessage = CoopRoom | CoopFrame
  | { v: 1; type: 'authenticated' }
  | { v: 1; type: 'ack'; requestId: string }
  | { v: 1; type: 'left'; roomId: string }
  | { v: 1; type: 'pong' }
  | { v: 1; type: 'error'; requestId?: string; code: string; message: string }
  | { v: 1; type: 'closed'; reason: string }
  | { v: 1; type: 'command'; requestId: string; action: CoopAction; slot: CoopSlot; roomId: string; matchId: string };

export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 160): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const slot = (value: unknown): value is CoopSlot => value === 0 || value === 1;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const action = (value: unknown): value is CoopAction => value === 'pause' || value === 'resume' || value === 'continue-ready';

/** Packet envelope only. The simulation separately validates its snapshot/input DTO before use. */
export function parseCoopMessage(raw: string): CoopServerMessage | null {
  if (raw.length > 70_000) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value) || value.v !== COOP_PROTOCOL_VERSION) return null;
  switch (value.type) {
    case 'authenticated': return { v: 1, type: 'authenticated' };
    case 'ack': return text(value.requestId) ? { v: 1, type: 'ack', requestId: value.requestId } : null;
    case 'left': return text(value.roomId) ? { v: 1, type: 'left', roomId: value.roomId } : null;
    case 'pong': return { v: 1, type: 'pong' };
    case 'error': return text(value.code) && text(value.message, 600) && (value.requestId === undefined || text(value.requestId))
      ? { v: 1, type: 'error', code: value.code, message: value.message, requestId: value.requestId as string | undefined } : null;
    case 'closed': return text(value.reason, 600) ? { v: 1, type: 'closed', reason: value.reason } : null;
    case 'room': {
      if (!text(value.roomId) || !text(value.code, 16) || !text(value.buildId) || !count(value.version) || !slot(value.selfSlot)
        || (value.phase !== 'lobby' && value.phase !== 'playing' && value.phase !== 'reconnecting') || !(value.matchId === null || text(value.matchId))
        || !Array.isArray(value.players) || value.players.length < 1 || value.players.length > 2) return null;
      const players: CoopRoom['players'] = [];
      for (const player of value.players) {
        if (!isRecord(player) || !slot(player.slot) || typeof player.connected !== 'boolean' || typeof player.ready !== 'boolean'
          || players.some(other => other.slot === player.slot)) return null;
        players.push({ slot: player.slot, connected: player.connected, ready: player.ready });
      }
      if (!players.some(player => player.slot === value.selfSlot)) return null;
      return { v: 1, type: 'room', roomId: value.roomId, code: value.code, buildId: value.buildId, phase: value.phase,
        version: value.version, selfSlot: value.selfSlot, players, matchId: value.matchId as string | null };
    }
    case 'state': case 'input':
      return count(value.seq) && slot(value.slot) && text(value.roomId) && text(value.matchId) && text(value.connectionId) && isRecord(value.payload)
        ? { v: 1, type: value.type, seq: value.seq, slot: value.slot, roomId: value.roomId, matchId: value.matchId, connectionId: value.connectionId, payload: value.payload } : null;
    case 'command':
      return text(value.requestId) && action(value.action) && slot(value.slot) && text(value.roomId) && text(value.matchId)
        ? { v: 1, type: 'command', requestId: value.requestId, action: value.action, slot: value.slot, roomId: value.roomId, matchId: value.matchId } : null;
    default: return null;
  }
}
