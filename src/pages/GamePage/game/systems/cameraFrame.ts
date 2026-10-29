import { clamp } from './geometry';

interface CameraChapter {
  width: number; height: number; axis: 'horizontal' | 'vertical';
  arena: { x: number; y: number; w?: number; h?: number };
}
interface CameraPlayer { x: number; y: number; facing: -1 | 1; vy: number }
export interface CameraPoint { x: number; y: number }

/** Viewport planning only: narrow arenas lock; wider ones keep the player in view inside their bounds. */
export function cameraTarget(chapter: CameraChapter, player: CameraPlayer, arenaLocked: boolean): CameraPoint {
  const vertical = chapter.axis === 'vertical';
  const followX = vertical ? player.x - 320 : player.x - 265 + player.facing * 30;
  const followY = chapter.height > 360 ? player.y - 235 + clamp(player.vy / 20, -18, 14) : 0;
  const arena = chapter.arena;
  const x = arenaLocked ? clamp(followX, arena.x, arena.x + Math.max(0, (arena.w ?? 640) - 640)) : followX;
  const y = arenaLocked ? clamp(followY, arena.y, arena.y + Math.max(0, (arena.h ?? 360) - 360)) : followY;
  return { x: clamp(x, 0, Math.max(0, chapter.width - 640)), y: clamp(y, 0, Math.max(0, chapter.height - 360)) };
}

export function stepCamera(current: CameraPoint, target: CameraPoint, deltaMs: number, snap = false): CameraPoint {
  if (snap) return { ...target };
  const weight = 1 - Math.exp(-Math.min(100, Math.max(0, deltaMs)) / 120);
  return { x: current.x + (target.x - current.x) * weight, y: current.y + (target.y - current.y) * weight };
}

/** World-space teaching text appears as a complete sentence, never half clipped at a viewport edge. */
export function worldLabelFits(x: number, width: number, scrollX: number, viewportWidth = 640, inset = 12): boolean {
  return width > 0 && x - scrollX >= inset && x + width - scrollX <= viewportWidth - inset;
}

/** Quantize only the published view, never the floating follow state used by smoothing. */
export const rasterCameraPoint = (point: CameraPoint): CameraPoint => ({ x: Math.round(point.x), y: Math.round(point.y) });
