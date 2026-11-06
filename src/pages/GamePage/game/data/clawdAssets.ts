import type { DoomForm } from '../entities/model';

/** R37 native extension of the original rig; all22 roles stay on the native 32px grid. */
export const CLAWD_FORMS: readonly DoomForm[] = Object.freeze(['aligned', 'masked', 'foom']);
export const CLAWD_FRAME_COUNT = 22;
export const clawdTexture = (form: DoomForm) => `clawd-${form}`;
export const clawdFrameName = (index: number) => `clawd-svg ${index}.aseprite`;
export const CLAWD_CLIPS = {
  idle: [{ frame: 0, duration: 400 }, { frame: 1, duration: 600 }],
  run: [{ frame: 2, duration: 100 }, { frame: 3, duration: 70 }, { frame: 4, duration: 100 }, { frame: 5, duration: 70 }],
  jump: [{ frame: 6, duration: 100 }],
  hurt: [{ frame: 7, duration: 120 }],
} as const;
export type ClawdPose = keyof typeof CLAWD_CLIPS;

/** Simulation time, not wall time: modal/pause/blur must freeze visual animation too. */
export function clawdFrameAt(pose: ClawdPose, elapsedMs: number): number {
  const clip = CLAWD_CLIPS[pose];
  const total = clip.reduce((sum, item) => sum + item.duration, 0);
  let cursor = Math.max(0, elapsedMs) % total;
  for (const item of clip) {
    if (cursor < item.duration) return item.frame;
    cursor -= item.duration;
  }
  return clip[0].frame;
}

/** A pose matrix layered onto the current gait. Never restart locomotion or use a wall/animation clock. */
export function clawdShotFrame(base: number, now: number, firedAt: number | null | undefined, enabled = true): number {
  if (!Number.isInteger(base) || base < 0 || base > 7) throw Error('Invalid Clawd base frame');
  if (!enabled || base === 7 || firedAt == null || !Number.isFinite(firedAt) || firedAt < 0 || !Number.isFinite(now)) return base;
  const age = now - firedAt;
  if (age < 0 || age >= 133) return base;
  return base + (age < 83 ? 8 : 15);
}
