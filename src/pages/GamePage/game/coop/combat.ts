import { BUBBLE_RADIUS, PROBE_RADIUS, bossRect, enemyRect, playerRect, type Bullet, type HistorySample, type Rect, type Vec2 } from '../entities/model';
import { TUNING } from '../data/tuning';
import { contextEffects } from '../systems/context';
import { segmentHitsCircle } from '../systems/factory';
import { normalizedToward, overlaps, segmentHitsRect } from '../systems/geometry';
import { absorbBullet, crossesBullet } from '../systems/rewind';
import { bossIncomingDamage, bulletSpeedMultiplier, canReflect } from '../systems/rules';
import type { CoopWorldState, PlayerId } from './model';
import { activeIds, playerView } from './state';
import { hurtActor } from './actors';

function entryTime(from: Vec2, to: Vec2, rect: Rect, radius: number): number | null {
  let entry = 0, exit = 1;
  for (const axis of ['x', 'y'] as const) {
    const min = rect[axis] - radius, max = rect[axis] + (axis === 'x' ? rect.w : rect.h) + radius;
    const delta = to[axis] - from[axis];
    if (delta === 0) { if (from[axis] < min || from[axis] > max) return null; continue; }
    const a = (min - from[axis]) / delta, b = (max - from[axis]) / delta;
    entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return null;
  }
  return entry;
}

/** Shared bullets advance once. Each enemy bullet chooses its first real actor collision. */
export function advanceCoopCombat(state: CoopWorldState, origins: Record<PlayerId, Vec2>, traversals: Record<PlayerId, HistorySample[]>, now: number, dt: number): void {
  const shared = state.shared, survivors: Bullet[] = [];
  for (const bullet of shared.bullets) {
    if (now >= bullet.expiresAt) continue;
    const speed = bullet.faction === 'enemy' ? bulletSpeedMultiplier(state.run.doom) : 1;
    const next = { ...bullet, x: bullet.x + bullet.vx * dt * speed, y: bullet.y + bullet.vy * dt * speed };
    if (next.x < -40 || next.x > shared.chapter.width + 40 || next.y < -60 || next.y > shared.chapter.height + 70 || (shared.factory && next.y + next.radius >= shared.factory.seaY)) continue;
    if (bullet.harmless) { survivors.push(next); continue; }
    if (bullet.faction === 'enemy') {
      const hits = activeIds(state).flatMap(id => {
        const player = state.players[id];
        if (player.rewind && (crossesBullet(traversals[id], bullet) || crossesBullet(traversals[id], next))) return [{ id, t: 0, absorb: true }];
        const before = { x: bullet.x - origins[id].x, y: bullet.y - origins[id].y };
        const after = { x: next.x - player.actor.x, y: next.y - player.actor.y };
        const t = entryTime(before, after, playerRect({ x: 0, y: 0 }), bullet.radius);
        return t === null ? [] : [{ id, t, absorb: !!player.rewind }];
      }).sort((a, b) => a.t - b.t);
      const hit = hits[0];
      if (hit) {
        if (hit.absorb) {
          state.players[hit.id].actor = absorbBullet(state.players[hit.id].actor, bullet, now);
          state.events.push({ type: 'notice', playerId: hit.id, message: '回溯吸收成功：自己的同类免疫延长10秒，并获得反击充能。' });
        } else hurtActor(state, hit.id, bullet.damage, now, bullet.kind);
        continue;
      }
      survivors.push(next); continue;
    }

    const ownerId = bullet.ownerPlayerId ?? state.hostPlayerId;
    const owner = state.players[ownerId], view = playerView(state, ownerId);
    const radius = contextEffects(view.save).coreRadius;
    const coreRect = (enemy: Vec2): Rect => ({ x: enemy.x - radius, y: enemy.y - 19 - radius, w: radius * 2, h: radius * 2 });
    const mirror = shared.boss.kind === 'mirror' && shared.boss.active ? shared.omega?.mirror : undefined;
    const mirrorRewinding = !!mirror && (!!mirror.rewind || mirror.traversal.length > 0);
    if (mirrorRewinding && (crossesBullet(mirror!.traversal, bullet) || crossesBullet(mirror!.traversal, next))) {
      mirror!.actor.criticalCharges = Math.min(2, mirror!.actor.criticalCharges + 1); continue;
    }
    const bubble = shared.factory?.bubbles.find(item => item.hp > 0 && segmentHitsCircle(bullet, next, item, BUBBLE_RADIUS + bullet.radius));
    if (bubble) { bubble.hp = Math.max(0, bubble.hp - bullet.damage); continue; }
    const probe = shared.factory?.probes.find(item => item.hp > 0 && segmentHitsCircle(bullet, next, item, PROBE_RADIUS + bullet.radius));
    if (probe) {
      probe.hp = Math.max(0, probe.hp - bullet.damage);
      if (probe.hp === 0) { state.run.score += 100; state.run.tokens += 5; }
      continue;
    }
    const enemy = shared.enemies.find(item => item.hp > 0 && (segmentHitsRect(bullet, next, enemyRect(item), bullet.radius) ||
      (item.kind === 'deceiver' && now < owner.actor.insightUntil && segmentHitsRect(bullet, next, coreRect(item), bullet.radius))));
    if (enemy) {
      const core = enemy.kind === 'deceiver' && now < owner.actor.insightUntil && segmentHitsRect(bullet, next, coreRect(enemy), bullet.radius);
      enemy.hp = core ? 0 : Math.max(0, enemy.hp - bullet.damage);
      if (enemy.hp === 0) { state.run.score += core ? 250 : 120; state.run.tokens += 6; }
      if (core) state.events.push({ type: 'notice', playerId: ownerId, message: '背叛核心已由透视中的队友击破。' });
      continue;
    }
    const hitsBoss = mirror ? segmentHitsRect({ x: bullet.x - mirror.previous.x, y: bullet.y - mirror.previous.y },
      { x: next.x - mirror.actor.x, y: next.y - mirror.actor.y }, playerRect({ x: 0, y: 0 }), bullet.radius) : segmentHitsRect(bullet, next, bossRect(shared.boss), bullet.radius);
    if (shared.boss.active && shared.boss.hp > 0 && hitsBoss) {
      if (canReflect(shared.boss) && bullet.vx > 0 && bullet.x < shared.boss.x) {
        const velocity = normalizedToward(shared.boss, owner.actor, 180);
        survivors.push({ ...next, ownerPlayerId: undefined, id: shared.nextBulletId++, x: shared.boss.x - 32, vx: velocity.x, vy: velocity.y,
          faction: 'enemy', kind: 'dictionary', damage: 18, critical: false, expiresAt: now + 4000 });
      } else {
        const leviathan = shared.boss.kind === 'leviathan';
        const open = mirror ? mirror.state === 'recover' && mirror.completedInPhase > 0 && !mirrorRewinding && now >= mirror.actor.dashUntil
          : !leviathan || (shared.loom !== null && now < shared.loom.turn.weakUntil);
        const raw = bossIncomingDamage(shared.boss, bullet.damage, bullet.x);
        const damage = open ? mirror ? Math.round(raw * mirror.profile.defenseMultiplier) : raw : 0;
        const phaseFloor = (leviathan || mirror) && shared.boss.phase < 3 ? shared.boss.maxHp * (3 - shared.boss.phase) / 3 : 0;
        shared.boss.hp = Math.max(Math.min(shared.boss.hp, phaseFloor), shared.boss.hp - damage);
      }
      continue;
    }
    survivors.push(next);
  }
  // withPlayer may replace the shared container while preserving the detached runtime objects.
  state.shared.bullets = survivors.slice(0, TUNING.maxBullets);
  for (const id of activeIds(state)) {
    const player = state.players[id]; if (player.rewind) continue;
    for (const enemy of state.shared.enemies) if (enemy.hp > 0 && overlaps(playerRect(player.actor), enemyRect(enemy))) hurtActor(state, id, 17, now);
    const mirrorGhost = state.shared.boss.kind === 'mirror' && !!state.shared.omega && (!!state.shared.omega.mirror.rewind || state.shared.omega.mirror.traversal.length > 0);
    if (state.shared.boss.active && state.shared.boss.hp > 0 && !mirrorGhost && overlaps(playerRect(player.actor), bossRect(state.shared.boss))) hurtActor(state, id, 24, now);
    for (const shock of state.shared.shocks) if (now < shock.until && Math.abs(player.actor.x - shock.x) < shock.width / 2 + 8 && player.actor.y > state.shared.chapter.floor - 35) hurtActor(state, id, 24, now, 'impact');
  }
}
