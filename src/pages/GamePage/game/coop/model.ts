import type { Ending, GameSaveData } from '../../../../objects/game/GameSaveData';
import type { BehaviorMemory, FrameInput, HistorySample, Player, RewindState, WorldState } from '../entities/model';

export const PLAYER_IDS = ['p1', 'p2'] as const;
export type PlayerId = typeof PLAYER_IDS[number];
export type CoopInput = FrameInput & { reviveHeld?: boolean };
export type CoopRun = Omit<GameSaveData, 'hp' | 'actionCounts'>;
export interface CoopPlayerState {
  actor: Player; hp: number; state: 'active' | 'downed' | 'waiting';
  history: HistorySample[]; rewind: RewindState | null; behavior: BehaviorMemory;
  actionCounts: GameSaveData['actionCounts']; reviveProgressMs: number;
  laserUntil: number | null; laserHit: boolean; laserAbsorbed: boolean;
  scanAt: number | null; turnStartX: number | null;
}
export interface CoopCheckpoint {
  run: CoopRun;
  players: Record<PlayerId, { hp: number; actionCounts: GameSaveData['actionCounts']; behavior: BehaviorMemory }>;
}
export type CoopEvent =
  | { type: 'notice'; message: string; playerId?: PlayerId }
  | { type: 'impact'; strength: number; playerId?: PlayerId }
  | { type: 'checkpoint' | 'defeat' | 'rest-opened' | 'rest-updated' | 'rest-closed' | 'context-changed' }
  | { type: 'stage-cleared'; stage: number }
  | { type: 'victory'; ending: Exclude<Ending, 'defeat'> };
export interface CoopWorldState {
  version: 1; tick: number; epoch: number; hostPlayerId: PlayerId;
  shared: Omit<WorldState, 'save' | 'player' | 'history' | 'rewind' | 'behavior' | 'events'>;
  run: CoopRun; players: Record<PlayerId, CoopPlayerState>;
  ready: Record<PlayerId, boolean>; targetPlayerId: PlayerId; enemyTargets: Record<string, PlayerId>;
  checkpoint: CoopCheckpoint; events: CoopEvent[];
}
export type CoopCommand =
  | { type: 'continue-ready'; playerId: PlayerId; ready?: boolean }
  | { type: 'shop-buy' | 'shop-hack'; playerId: PlayerId; offerId: string; targetPlayerId?: PlayerId }
  | { type: 'context-reorder'; playerId: PlayerId; from: number; to: number };
export const COOP_RULES = { reviveMs: 2000, reviveHp: 35, reviveRadius: 42, reviveInvulnerabilityMs: 1000, maxSeparationX: 480, maxSeparationY: 240 } as const;
