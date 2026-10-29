import type { GameSaveData, RelicId, RunResult } from '../../../objects/game/GameSaveData';

export interface ContextSnapshot {
  capacityK: 32 | 128;
  usedK: number;
  overloaded: boolean;
  hallucinationEvery: number | null;
  editable: boolean;
  slots: Array<{ id: RelicId; name: string; costK: number; description: string; active: boolean }>;
}

export interface ShopOfferSnapshot {
  id: string;
  name: string;
  description: string;
  price: number;
  kind: 'repair' | 'relic' | 'upgrade' | 'donation';
  owned: boolean;
  available: boolean;
  canBuy: boolean;
  canHack: boolean;
  reason: string | null;
}

export interface RestRoomSnapshot {
  save: GameSaveData;
  rewardText: string;
  room: 1 | 2;
  hp: number;
  tokens: number;
  doom: number;
  hackUsed: boolean;
  hackEligible: boolean;
  hackRequirement: string;
  message: string;
  offers: ShopOfferSnapshot[];
  context: ContextSnapshot;
}

export type AudioStatus = 'locked' | 'running' | 'suspended' | 'unavailable';

export interface LoomHudSnapshot {
  timeline: number;
  rerollReady: boolean;
  hpUiTaken: boolean;
  stemsLost: number;
  narrow: boolean;
  sharpTurnReady: boolean;
}

export interface OmegaHudSnapshot {
  phaseLabel: string;
  memorySource: 'ordered' | 'counts-only';
  dominantAction: string;
  combo: string;
  activeTraits: string[];
  observedCombos: number;
  mirrorAction: string;
}

export interface HudSnapshot {
  hp: number;
  doom: number;
  tokens: number;
  score: number;
  stage: number;
  elapsedMs: number;
  rewindReady: boolean;
  insightActive: boolean;
  boss: { name: string; hp: number; maxHp: number } | null;
  objective: string;
  loom?: LoomHudSnapshot;
  omega?: OmegaHudSnapshot;
}

export type GameCommand =
  | { type: 'start'; save: GameSaveData }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart'; save: GameSaveData }
  | { type: 'insight' }
  | { type: 'rewind' }
  | { type: 'set-muted'; muted: boolean }
  | { type: 'reroll' }
  | { type: 'set-audio'; muted: boolean; volume: number; unlock?: boolean }
  | { type: 'shop-buy'; offerId: string }
  | { type: 'shop-hack'; offerId: string }
  | { type: 'rest-continue' }
  | { type: 'context-reorder'; from: number; to: number }
  | { type: 'request-context' };

export type GameEvent =
  | { type: 'ready' }
  | { type: 'load-failed'; message: string }
  | { type: 'audio-status'; status: AudioStatus }
  | { type: 'hud'; snapshot: HudSnapshot }
  | { type: 'checkpoint'; save: GameSaveData }
  | { type: 'ended'; result: RunResult }
  | { type: 'stage-cleared'; save: GameSaveData; stage: number }
  | { type: 'pause-requested' }
  | { type: 'notice'; message: string }
  | { type: 'context'; snapshot: ContextSnapshot }
  | { type: 'rest-opened'; snapshot: RestRoomSnapshot }
  | { type: 'rest-updated'; snapshot: RestRoomSnapshot }
  | { type: 'rest-closed' };

/** Per-mount bridge: no Phaser, React, persistence, or global singleton dependencies. */
export class GameBridge {
  private events = new Set<(event: GameEvent) => void>();
  private commands = new Set<(command: GameCommand) => void>();
  onEvent(listener: (event: GameEvent) => void) { this.events.add(listener); return () => { this.events.delete(listener); }; }
  onCommand(listener: (command: GameCommand) => void) { this.commands.add(listener); return () => { this.commands.delete(listener); }; }
  emit(event: GameEvent) { this.events.forEach(listener => listener(event)); }
  send(command: GameCommand) { this.commands.forEach(listener => listener(command)); }
  dispose() { this.events.clear(); this.commands.clear(); }
}
