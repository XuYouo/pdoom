import type { Rect, Vec2 } from '../entities/model';

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const approach = (value: number, target: number, amount: number) => value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const distanceSquared = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Slab sweep: stops fast projectiles/dashes from tunnelling through thin targets. */
export function segmentHitsRect(from: Vec2, to: Vec2, rect: Rect, padding = 0): boolean {
  const min = { x: rect.x - padding, y: rect.y - padding };
  const max = { x: rect.x + rect.w + padding, y: rect.y + rect.h + padding };
  let enter = 0;
  let leave = 1;
  for (const axis of ['x', 'y'] as const) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-9) {
      if (from[axis] < min[axis] || from[axis] > max[axis]) return false;
      continue;
    }
    const a = (min[axis] - from[axis]) / delta;
    const b = (max[axis] - from[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return true;
}

export function normalizedToward(from: Vec2, target: Vec2, speed: number): Vec2 {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  return { x: dx / magnitude * speed, y: dy / magnitude * speed };
}
