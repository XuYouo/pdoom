import { TUNING } from '../data/tuning';
import type { Rect, WorldState } from '../entities/model';

export interface CounterFeedbackFrame {
  readonly x: number;
  readonly y: number;
  readonly immunityTicks: number;
  readonly charges: number;
}

/** A stateless view of earned runtime rewards, never of a Q press or notice. */
export function counterFeedbackFrame(world: Readonly<WorldState>, view: Readonly<Rect>): CounterFeedbackFrame | null {
  if (world.mode === 'ready' || world.mode === 'dead' || world.mode === 'unavailable' || world.save.hp <= 0) return null;
  const { player } = world, now = world.save.elapsedMs;
  if (![player.x, player.y, now, view.x, view.y, view.w, view.h].every(Number.isFinite) || view.w < 32 || view.h < 64) return null;
  const remaining = (player.immunity.dictionary ?? 0) - now;
  const immunityTicks = Number.isFinite(remaining) && remaining > 0 ? Math.min(10, Math.ceil(remaining / TUNING.immunityMs * 10)) : 0;
  const charges = Number.isFinite(player.criticalCharges) ? Math.min(6, Math.max(0, Math.floor(player.criticalCharges))) : 0;
  if (!immunityTicks && !charges) return null;
  // A dying/off-screen actor must not leave a detached status mark at the edge.
  if (player.x < view.x - 12 || player.x > view.x + view.w + 12 || player.y < view.y - 12 || player.y > view.y + view.h + 12) return null;
  const x = Math.max(Math.ceil(view.x) + 15, Math.min(Math.floor(view.x + view.w) - 15, Math.round(player.x)));
  // Keep the 29x21 mark outside the existing r17 immunity ring. At the ceiling use the lower side.
  let y = Math.round(player.y) - 39;
  if (y < Math.ceil(view.y) + 4) y = Math.round(player.y) + 21;
  y = Math.min(Math.floor(view.y + view.h) - 23, y);
  return { x, y, immunityTicks, charges };
}
