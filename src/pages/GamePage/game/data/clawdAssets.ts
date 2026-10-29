import type { DoomForm } from '../entities/model';

/** Exported from assets/source/clawd-svg.aseprite; frames stay on the native 32px grid. */
export const CLAWD_FORMS: readonly DoomForm[] = ['aligned', 'masked', 'foom'];
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
