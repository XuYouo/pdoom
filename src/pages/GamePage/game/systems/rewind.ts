import { TUNING } from '../data/chapterOne';
import type { Bullet, HistorySample, Player, RewindState, Vec2 } from '../entities/model';
import { playerRect } from '../entities/model';
import { clamp, segmentHitsRect } from './geometry';

export function samplePlayer(player: Player, at: number): HistorySample {
  return { at, x: player.x, y: player.y, vx: player.vx, vy: player.vy, facing: player.facing };
}

export function recordHistory(history: readonly HistorySample[], sample: HistorySample): HistorySample[] {
  const appended = [...history, sample];
  const cutoff = sample.at - TUNING.rewindWindowMs;
  const firstAfter = appended.findIndex(item => item.at >= cutoff);
  // Retain the bracketing sample for an exact 2-second endpoint at any frame rate.
  return appended.slice(Math.max(0, firstAfter - 1));
}

export function sampleAt(path: readonly HistorySample[], at: number): HistorySample {
  if (at <= path[0].at) return { ...path[0] };
  const right = path.findIndex(item => item.at >= at);
  if (right < 0) return { ...path[path.length - 1] };
  const a = path[right - 1];
  const b = path[right];
  const t = (at - a.at) / Math.max(0.001, b.at - a.at);
  return { ...a, at, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, vx: a.vx + (b.vx - a.vx) * t, vy: a.vy + (b.vy - a.vy) * t };
}

export function beginRewind(history: readonly HistorySample[], now: number): RewindState | null {
  if (history.length < 2 || history[0].at > now - TUNING.rewindWindowMs + 0.01) return null;
  const endpoint = sampleAt(history, now - TUNING.rewindWindowMs);
  return { path: [endpoint, ...history.filter(sample => sample.at > endpoint.at)], startedAt: now, durationMs: TUNING.rewindDurationMs };
}

const historyTime = (rewind: RewindState, now: number) => {
  const t = clamp((now - rewind.startedAt) / rewind.durationMs, 0, 1);
  const last = rewind.path[rewind.path.length - 1];
  return last.at + (rewind.path[0].at - last.at) * t;
};

/** Return every corner traversed this tick, not a teleport/chord across the entire trail. */
export function rewindTraversal(rewind: RewindState, before: number, now: number): HistorySample[] {
  const from = historyTime(rewind, before);
  const to = historyTime(rewind, now);
  return [sampleAt(rewind.path, from), ...rewind.path.filter(sample => sample.at < from && sample.at > to).reverse(), sampleAt(rewind.path, to)];
}

export function crossesBullet(traversal: readonly Vec2[], bullet: Bullet): boolean {
  return traversal.some((point, index) => index > 0 && segmentHitsRect(traversal[index - 1], point, playerRect(bullet), bullet.radius));
}

export function absorbAttack(player: Player, kind: Bullet['kind'], now: number): Player {
  return { ...player, immunity: { ...player.immunity, [kind]: now + TUNING.immunityMs }, criticalCharges: Math.min(6, player.criticalCharges + 2) };
}
export function absorbBullet(player: Player, bullet: Bullet, now: number): Player {
  return absorbAttack(player, bullet.kind, now);
}
