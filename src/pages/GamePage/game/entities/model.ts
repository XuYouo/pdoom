import type { GameSaveData, RelicId, RunResult } from '../../../../objects/game/GameSaveData';

export interface Vec2 { x: number; y: number }
export interface Rect extends Vec2 { w: number; h: number }
export type BulletKind = 'dictionary' | 'echo' | 'caption' | 'impact' | 'dialogue' | 'knife' | 'gpu' | 'causal' | 'void' | 'mirror';
export type DoomForm = 'aligned' | 'masked' | 'foom';
export interface Platform extends Rect { id: string; oneWay?: boolean; fragile?: boolean; protected?: boolean }
export interface ChapterDefinition {
  readonly stage: 1 | 2 | 3 | 4 | 5; readonly name: string; readonly english: string;
  readonly width: number; readonly height: number; readonly axis: 'horizontal' | 'vertical'; readonly floor: number;
  readonly arena: Readonly<Rect & { trigger: number }>;
  readonly checkpoints: readonly Readonly<{ id: 0 | 1 | 2; x: number; y: number; trigger: number }>[];
  readonly platforms: readonly Platform[]; readonly enemies: readonly Enemy[]; readonly pickups: readonly Pickup[];
  readonly signs: readonly Readonly<Vec2 & { text: string }>[];
  readonly boss: Readonly<Vec2 & { kind: 'gato' | 'sydney' | 'basilisk' | 'leviathan' | 'mirror'; name: string; maxHp: number }>;
}
export const PROBE_RADIUS = 11;
export const BUBBLE_RADIUS = 17;
export interface Probe extends Vec2 {
  id: number; hp: number; targetPlatformId: string | null;
  phase: 'seek' | 'tell' | 'consume'; phaseUntil: number;
}
export interface PuaBubble extends Vec2 { id: number; hp: number; expiresAt: number; text: string }
export interface FactoryState {
  seaY: number; riseSpeed: number; probes: Probe[]; bubbles: PuaBubble[];
  nextProbeId: number; nextBubbleId: number; nextReplicateAt: number;
}
export const CHINCHILLA_HALF_SIZE = 6;
export interface MovingPlatform extends Platform {
  minY: number; maxY: number; periodMs: number; offsetMs: number; dy: number;
}
export interface HeatZone extends Rect { id: string; phase: 'cool' | 'tell' | 'active'; phaseUntil: number }
export interface LaserState extends Vec2 { length: number; halfHeight: number; facing: -1 | 1; phase: 'tell' | 'active'; until: number; hitPlayer: boolean; absorbedByRewind: boolean }
export interface FurnaceState {
  startedAt: number; enraged: boolean; lifts: MovingPlatform[]; heatZones: HeatZone[]; laser: LaserState | null;
}
export const LEVIATHAN_SIZE = 144;
export interface LoomNode extends Platform {
  branch: 'hub' | 'upper' | 'lower' | 'arena'; segment: number; next: string[];
  expanded: boolean; collapseAt: number | null; collapsed: boolean;
}
export interface LoomState {
  timeline: 0 | 1; nodes: LoomNode[]; rerollReadyAt: number; rerolls: number;
  lastReroll: { at: number; from: Vec2; to: Vec2 } | null;
  hpUiTaken: boolean; stemsLost: 0 | 1 | 2 | 3 | 4; eaten: string[];
  swallow: { ids: string[]; at: number } | null; narrow: Rect; pullSpeed: number;
  turn: { until: number; lineX: number; startX: number | null; successes: number; weakUntil: number };
}
export type BehaviorAction = keyof GameSaveData['actionCounts'];
export interface BehaviorCombo { actions: BehaviorAction[]; uses: number; lastAt: number }
export interface BehaviorMemory {
  runId: string; seed: number; observedAt: number; counts: GameSaveData['actionCounts']; source: 'observed' | 'counts-only';
  recent: { action: BehaviorAction; at: number }[]; combos: BehaviorCombo[];
}
export interface MirrorProfile {
  source: 'counts-only' | 'observed' | 'mixed'; dominant: BehaviorAction; frequencies: GameSaveData['actionCounts']; combo: BehaviorAction[];
  activeBuild: RelicId[]; suppressedBuild: RelicId[]; doom: number; hallucinationEvery: number | null;
  damageMultiplier: number; defenseMultiplier: number; fireIntervalMs: number; rewindCooldownMs: number;
  insightDurationMs: number; insightCooldownMs: number; coreRadius: number; criticalMultiplier: number;
}
export interface StormZone extends Rect { id: string; phase: 'cool' | 'tell' | 'active'; phaseUntil: number; direction: -1 | 1 }
export interface MirrorState {
  actor: Player; previous: Vec2; history: HistorySample[]; rewind: RewindState | null; traversal: HistorySample[];
  state: 'idle' | 'tell' | 'execute' | 'recover'; until: number; plan: BehaviorAction[]; index: number; action: BehaviorAction | null; actionBase: number;
  completedCombos: number; completedInPhase: number; executed: GameSaveData['actionCounts']; profile: MirrorProfile; target: Vec2;
  scan: { rect: Rect; at: number; until: number; hit: boolean } | null;
}
export interface OmegaState {
  phase: 'storm' | 'chamber' | 'reveal' | 'duel' | 'complete'; door: Rect; chair: Vec2; glass: Rect;
  revealAt: number | null; revealUntil: number; stormZones: StormZone[]; mirror: MirrorState;
}
export interface Player extends Vec2 {
  vx: number; vy: number; facing: -1 | 1; grounded: boolean; rootedBy: number | null;
  standingOn: string | null; petrifiedUntil: number;
  coyoteUntil: number; jumpUntil: number; dashUntil: number; dashReadyAt: number;
  shotReadyAt: number; invulnerableUntil: number; rewindReadyAt: number;
  insightUntil: number; insightReadyAt: number; invertedUntil: number;
  immunity: Partial<Record<BulletKind, number>>; criticalCharges: number;
}
export interface HistorySample extends Vec2 { at: number; vx: number; vy: number; facing: -1 | 1 }
export interface RewindState { path: HistorySample[]; startedAt: number; durationMs: number }
export interface Bullet extends Vec2 {
  id: number; vx: number; vy: number; radius: number; damage: number;
  faction: 'player' | 'enemy'; kind: BulletKind; expiresAt: number; critical?: boolean;
  harmless?: boolean; glyph?: '(' | ')';
}
export interface Enemy extends Vec2 {
  id: string; kind: 'parrot' | 'repeater' | 'deceiver' | 'chinchilla'; hp: number;
  homeX: number; homeY: number; phase: 'idle' | 'tell' | 'recover'; phaseUntil: number;
}
export interface Boss extends Vec2 {
  kind: 'gato' | 'sydney' | 'basilisk' | 'leviathan' | 'mirror'; name: string; facing: -1 | 1;
  hp: number; maxHp: number; active: boolean; phase: 1 | 2 | 3;
  action: 'idle' | 'tell' | 'attack' | 'recover'; actionUntil: number;
  targetX: number; volley: number; enteredAt: number;
}
export interface Pickup extends Vec2 { id: string; kind: 'token' | 'compute' | 'mushroom' | 'heal'; amount: number }
export interface Shockwave { x: number; width: number; until: number }
export type WorldEvent =
  | { type: 'notice'; message: string }
  | { type: 'checkpoint'; save: GameSaveData }
  | { type: 'defeat'; save: GameSaveData }
  | { type: 'victory'; result: RunResult }
  | { type: 'stage-cleared'; stage: number; save: GameSaveData }
  | { type: 'impact'; strength: number }
  | { type: 'rest-opened' | 'rest-updated' | 'rest-closed' | 'context-changed' };
export interface WorldState {
  mode: 'ready' | 'playing' | 'rest' | 'dead' | 'cleared' | 'finished' | 'unavailable';
  chapter: ChapterDefinition; factory: FactoryState | null; furnace: FurnaceState | null; loom: LoomState | null;
  omega: OmegaState | null; behavior: BehaviorMemory;
  rest: { room: 1 | 2; message: string } | null;
  save: GameSaveData; player: Player; enemies: Enemy[]; boss: Boss;
  bullets: Bullet[]; pickups: Pickup[]; history: HistorySample[]; rewind: RewindState | null;
  shocks: Shockwave[]; collapsed: string[]; collapseAt: Record<string, number>;
  nextBulletId: number; events: WorldEvent[];
}
export interface FrameInput {
  move: -1 | 0 | 1; jumpPressed: boolean; jumpHeld: boolean; dashPressed: boolean;
  fire: boolean; aim: Vec2 | null; rewindPressed: boolean; insightPressed: boolean; rerollPressed?: boolean;
}
export const EMPTY_INPUT: Readonly<FrameInput> = Object.freeze({
  move: 0, jumpPressed: false, jumpHeld: false, dashPressed: false,
  fire: false, aim: null, rewindPressed: false, insightPressed: false, rerollPressed: false,
});
export const PLAYER_WIDTH = 16;
export const PLAYER_HEIGHT = 22;
export const playerRect = (p: Vec2): Rect => ({ x: p.x - PLAYER_WIDTH / 2, y: p.y - PLAYER_HEIGHT / 2, w: PLAYER_WIDTH, h: PLAYER_HEIGHT });
export const enemyRect = (e: Vec2 & { kind?: Enemy['kind'] }): Rect => {
  const half = e.kind === 'chinchilla' ? CHINCHILLA_HALF_SIZE : 12;
  return { x: e.x - half, y: e.y - half, w: half * 2, h: half * 2 };
};
export const laserRect = (laser: LaserState): Rect => ({ x: laser.facing === 1 ? laser.x : laser.x - laser.length, y: laser.y - laser.halfHeight, w: laser.length, h: laser.halfHeight * 2 });
export const bossRect = (b: Vec2 & { kind?: Boss['kind'] }): Rect => b.kind === 'leviathan'
  ? { x: b.x - LEVIATHAN_SIZE / 2, y: b.y - LEVIATHAN_SIZE / 2, w: LEVIATHAN_SIZE, h: LEVIATHAN_SIZE }
  : b.kind === 'mirror' ? playerRect(b) : { x: b.x - 26, y: b.y - 37, w: 52, h: 74 };

export function reached(chapter: ChapterDefinition, position: Vec2, threshold: number): boolean {
  return chapter.axis === 'vertical' ? position.y <= threshold : position.x >= threshold;
}
export function aheadOf(chapter: ChapterDefinition, position: Vec2, checkpoint: Vec2): boolean {
  return chapter.axis === 'vertical' ? position.y < checkpoint.y : position.x > checkpoint.x;
}
