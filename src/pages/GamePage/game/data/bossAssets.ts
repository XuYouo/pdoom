import type { Boss } from '../entities/model';

export const GATO_POSES = Object.freeze(['idle', 'tell', 'attack', 'recover'] as const);
/** Twelve native pose keys verified against the approved PNG, JSON and Aseprite source. */
export const GATO_ASSET = Object.freeze({
  kind: 'gato' as const,
  key: 'boss-gato',
  image: 'game/gato.png',
  atlas: 'game/gato.json',
  frameWidth: 96,
  frameHeight: 96,
  frameCount: 12,
  frames: Object.freeze(['gato 0.aseprite', 'gato 1.aseprite', 'gato 2.aseprite', 'gato 3.aseprite', 'gato 4.aseprite', 'gato 5.aseprite', 'gato 6.aseprite', 'gato 7.aseprite', 'gato 8.aseprite', 'gato 9.aseprite', 'gato 10.aseprite', 'gato 11.aseprite'] as const),
  // Export metadata, never a clock or replacement for the authoritative Boss FSM.
  frameDurations: Object.freeze([600, 650, 260, 1050, 600, 850, 260, 1050, 600, 650, 260, 620] as const),
  pivot: Object.freeze({ x: 48, y: 48 }),
  facing: 'left' as const,
  inactiveAlpha: 0.4,
});
/** Loader list contains only formally approved, actually verified boss assets. */
export const BOSS_ASSETS: readonly (typeof GATO_ASSET)[] = Object.freeze([GATO_ASSET]);
export type GatoFrameIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** Trust phase/action as reported by Core; never infer a phase from HP or advance a pose with time. */
export function gatoFrameFor(phase: Boss['phase'], action: Boss['action']): GatoFrameIndex | null {
  if (phase !== 1 && phase !== 2 && phase !== 3) return null;
  const pose = GATO_POSES.indexOf(action);
  return pose < 0 ? null : ((phase - 1) * 4 + pose) as GatoFrameIndex;
}
