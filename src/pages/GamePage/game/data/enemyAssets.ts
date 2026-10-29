import type { Enemy } from '../entities/model';

export type EnemySpriteKind = 'parrot' | 'repeater' | 'deceiver';
export interface EnemySpriteAsset {
  readonly kind: EnemySpriteKind;
  readonly key: string; readonly image: string; readonly atlas: string;
  readonly frameWidth: number; readonly frameHeight: number; readonly frameCount: number;
  readonly frames: readonly string[];
  readonly frameDurations: readonly number[];
  readonly pivot: Readonly<{ x: number; y: number }>;
  readonly facing: 'left';
  readonly idleDurations: readonly [number, number];
}

/** Only explicitly described families may use sprites; other kinds stay on Graphics. */
export const PARROT_ASSET = Object.freeze({
  kind: 'parrot' as const,
  key: 'enemy-parrot',
  image: 'game/parrot.png',
  atlas: 'game/parrot.json',
  frameWidth: 48,
  frameHeight: 48,
  frameCount: 4,
  // Exact names/durations read from the Lead's actual Aseprite export, never guessed from an asset prefix.
  frames: Object.freeze(['parrot 0.aseprite', 'parrot 1.aseprite', 'parrot 2.aseprite', 'parrot 3.aseprite'] as const),
  frameDurations: Object.freeze([400, 600, 180, 140] as const),
  pivot: Object.freeze({ x: 24, y: 30 }),
  facing: 'left' as const,
  idleDurations: Object.freeze([400, 600] as const),
});
/** Exact keys verified again against the approved native public PNG/JSON export. */
export const REPEATER_ASSET = Object.freeze({
  kind: 'repeater' as const,
  key: 'enemy-repeater',
  image: 'game/repeater.png',
  atlas: 'game/repeater.json',
  frameWidth: 48,
  frameHeight: 48,
  frameCount: 4,
  frames: Object.freeze(['repeater 0.aseprite', 'repeater 1.aseprite', 'repeater 2.aseprite', 'repeater 3.aseprite'] as const),
  frameDurations: Object.freeze([400, 600, 180, 140] as const),
  pivot: Object.freeze({ x: 24, y: 30 }),
  facing: 'left' as const,
  idleDurations: Object.freeze([400, 600] as const),
});

/** Exact eight-frame keys verified against the approved native public PNG/JSON export. */
export const DECEIVER_ASSET = Object.freeze({
  kind: 'deceiver' as const,
  key: 'enemy-deceiver',
  image: 'game/deceiver.png',
  atlas: 'game/deceiver.json',
  frameWidth: 48,
  frameHeight: 48,
  frameCount: 8,
  frames: Object.freeze(['deceiver 0.aseprite', 'deceiver 1.aseprite', 'deceiver 2.aseprite', 'deceiver 3.aseprite', 'deceiver 4.aseprite', 'deceiver 5.aseprite', 'deceiver 6.aseprite', 'deceiver 7.aseprite'] as const),
  frameDurations: Object.freeze([400, 600, 180, 140, 400, 600, 180, 140] as const),
  pivot: Object.freeze({ x: 24, y: 30 }),
  facing: 'left' as const,
  idleDurations: Object.freeze([400, 600] as const),
});

/** Loader-facing list contains only verified formal exports; unsupported kinds still use Graphics. */
export const ENEMY_ASSETS: readonly EnemySpriteAsset[] = Object.freeze([PARROT_ASSET, REPEATER_ASSET, DECEIVER_ASSET]);
export type ParrotFrameNames = readonly [string, string, string, string];
export type ParrotFrameIndex = 0 | 1 | 2 | 3;

/** Manual atlas frames use simulation time only. Tell/recover hold until the real FSM changes phase. */
export function enemyFrameAt(asset: EnemySpriteAsset, phase: Enemy['phase'], simulationMs: number): ParrotFrameIndex {
  if (phase === 'tell') return 2;
  if (phase === 'recover') return 3;
  const now = Number.isFinite(simulationMs) ? Math.max(0, simulationMs) : 0;
  const [first, second] = asset.idleDurations;
  return now % (first + second) < first ? 0 : 1;
}
export function parrotFrameAt(phase: Enemy['phase'], simulationMs: number): ParrotFrameIndex { return enemyFrameAt(PARROT_ASSET, phase, simulationMs); }
export function repeaterFrameAt(phase: Enemy['phase'], simulationMs: number): ParrotFrameIndex { return enemyFrameAt(REPEATER_ASSET, phase, simulationMs); }
export type DeceiverFrameIndex = ParrotFrameIndex | 4 | 5 | 6 | 7;
/** The real simulation window is authoritative: equality, missing data and non-finite values are friendly. */
export function deceiverRevealedAt(simulationMs: number, insightUntil?: number): boolean {
  return Number.isFinite(simulationMs) && typeof insightUntil === 'number' && Number.isFinite(insightUntil) && simulationMs < insightUntil;
}
export function deceiverFrameAt(phase: Enemy['phase'], simulationMs: number, insightUntil?: number): DeceiverFrameIndex {
  const frame = enemyFrameAt(DECEIVER_ASSET, phase, simulationMs);
  return (frame + (deceiverRevealedAt(simulationMs, insightUntil) ? 4 : 0)) as DeceiverFrameIndex;
}

/** Kind/health eligibility only; Graphics may be skipped ONLY for the renderer's returned handled IDs. */
export const hasParrotArt = (enemy: Readonly<Pick<Enemy, 'kind' | 'hp'>>): boolean => enemy.kind === 'parrot' && enemy.hp > 0;
