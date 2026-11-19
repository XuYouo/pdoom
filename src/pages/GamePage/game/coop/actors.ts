import type { HistorySample, Vec2 } from '../entities/model';
import { contextEffects } from '../systems/context';
import { movePlayer } from '../systems/controller';
import { firePlayer, hurt } from '../systems/combat';
import { carryOnLift, worldPlatforms } from '../systems/platforms';
import { updateFragilePlatforms } from '../systems/interactions';
import { beginRewind, recordHistory, rewindTraversal, samplePlayer } from '../systems/rewind';
import { observeBehavior } from '../systems/behavior';
import { BUBBLE_RADIUS } from '../entities/model';
import { clamp, distanceSquared } from '../systems/geometry';
import { COOP_RULES, PLAYER_IDS, type CoopInput, type CoopWorldState, type PlayerId } from './model';
import { activeIds, playerView, withPlayer } from './state';

export function moveActor(state: CoopWorldState, previous: CoopWorldState, id: PlayerId, input: CoopInput, now: number, dt: number, rerolled: boolean): HistorySample[] {
  if (!activeIds(state).includes(id)) return [];
  let traversal: HistorySample[] = [];
  withPlayer(state, id, view => {
    const effects = contextEffects(view.save);
    if (input.insightPressed && now >= view.player.insightReadyAt && !view.rewind) {
      view.player.insightUntil = now + effects.insightDurationMs; view.player.insightReadyAt = now + effects.insightCooldownMs;
      view.save.actionCounts = { ...view.save.actionCounts, insights: view.save.actionCounts.insights + 1 };
      view.events.push({ type: 'notice', message: '机械可解释性在线：瞄准伪装者头顶的红色核心节点。' });
    }
    if (input.rewindPressed && !rerolled && !view.rewind && view.player.rootedBy === null && now >= view.player.rewindReadyAt) {
      view.rewind = beginRewind(recordHistory(view.history, samplePlayer(view.player, now)), now);
      if (view.rewind) {
        view.player.rewindReadyAt = now + effects.rewindCooldownMs; view.player.petrifiedUntil = 0; view.player.standingOn = null;
        view.save.actionCounts = { ...view.save.actionCounts, rewinds: view.save.actionCounts.rewinds + 1 };
      } else view.events.push({ type: 'notice', message: '回溯正在记录自己的轨迹，请先行动满 2 秒。' });
    }
    if (view.rewind) {
      traversal = rewindTraversal(view.rewind, previous.run.elapsedMs, now);
      const target = traversal[traversal.length - 1];
      view.player = { ...view.player, x: target.x, y: target.y, facing: target.facing, vx: 0, vy: 0, grounded: false, standingOn: null };
    } else {
      carryOnLift(view, playerView(previous, id));
      const movement = movePlayer(view.player, input, worldPlatforms(view), now, dt, view.boss.active || view.omega?.phase === 'reveal', view.chapter);
      view.player = movement.player;
      if (movement.dashed) view.save.actionCounts = { ...view.save.actionCounts, dashes: view.save.actionCounts.dashes + 1 };
      updateFragilePlatforms(view, movement.landedPlatformId, now);
    }
  });
  return traversal;
}

export function fireActor(state: CoopWorldState, id: PlayerId, input: CoopInput, now: number): void {
  if (!activeIds(state).includes(id)) return;
  const firstId = state.shared.nextBulletId;
  withPlayer(state, id, view => firePlayer(view, input, now));
  for (const bullet of state.shared.bullets) if (bullet.id >= firstId && bullet.faction === 'player') bullet.ownerPlayerId = id;
}
export function hurtActor(state: CoopWorldState, id: PlayerId, damage: number, now: number, kind?: Parameters<typeof hurt>[3]): void {
  if (!activeIds(state).includes(id)) return;
  withPlayer(state, id, view => hurt(view, damage, now, kind));
}
export function finishActors(state: CoopWorldState, previous: CoopWorldState, now: number): void {
  for (const id of PLAYER_IDS) {
    const actor = state.players[id];
    if (actor.state === 'active') {
      if (actor.rewind && now >= actor.rewind.startedAt + actor.rewind.durationMs) {
        actor.rewind = null; actor.history = [samplePlayer(actor.actor, now)]; actor.actor.invulnerableUntil = now + 180;
      } else if (!actor.rewind) actor.history = recordHistory(actor.history, samplePlayer(actor.actor, now));
    }
    actor.behavior = observeBehavior(actor.behavior, previous.players[id].actionCounts, actor.actionCounts, now);
  }
}

/** Only a voluntary outward movement is blocked. A falling or rewinding player is never teleported. */
export function enforceCoopTether(state: CoopWorldState, previous: CoopWorldState): void {
  if (activeIds(state).length !== 2) return;
  for (const id of PLAYER_IDS) {
    const other = id === 'p1' ? 'p2' : 'p1';
    const actor = state.players[id]; if (actor.rewind) continue;
    const p = actor.actor, old = previous.players[id].actor, q = state.players[other].actor;
    if (Math.abs(p.x - q.x) > COOP_RULES.maxSeparationX && Math.abs(p.x - q.x) > Math.abs(old.x - q.x)) {
      p.x = old.x; p.vx = 0;
      const support = worldPlatforms(playerView(state, id)).find(platform => platform.id === p.standingOn);
      if (support && (p.x + 8 <= support.x || p.x - 8 >= support.x + support.w)) { p.grounded = false; p.standingOn = null; }
    }
    if (q.y - p.y > COOP_RULES.maxSeparationY && p.y < old.y) { p.y = old.y; p.vy = 0; p.grounded = false; p.standingOn = null; }
  }
}

export function syncCoopBubbles(state: CoopWorldState, now: number): void {
  const factory = state.shared.factory; if (!factory) return;
  const roots = new Set(activeIds(state).map(id => state.players[id].actor.rootedBy));
  factory.bubbles = factory.bubbles.filter(bubble => bubble.hp > 0 && (roots.has(bubble.id) || bubble.expiresAt > now));
  for (const id of activeIds(state)) {
    const actor = state.players[id].actor;
    const bubble = factory.bubbles.find(item => item.id === actor.rootedBy);
    if (bubble) { bubble.x = clamp(actor.x + actor.facing * 44, BUBBLE_RADIUS + 2, state.shared.chapter.width - BUBBLE_RADIUS - 2); bubble.y = actor.y - 3; }
    else if (actor.rootedBy !== null) { actor.rootedBy = null; state.events.push({ type: 'notice', playerId: id, message: 'PUA气泡已击碎，控制解除。' }); }
  }
}
export function loseActor(state: CoopWorldState, id: PlayerId, waiting: boolean): void {
  const player = state.players[id];
  player.hp = 0; player.state = waiting ? 'waiting' : 'downed'; player.rewind = null; player.reviveProgressMs = 0;
  player.actor.rootedBy = null; player.actor.petrifiedUntil = 0; player.actor.vx = 0; player.actor.vy = 0; player.actor.dashUntil = 0;
  player.history = [samplePlayer(player.actor, state.run.elapsedMs)];
}
export function resolveRescue(state: CoopWorldState, inputs: Record<PlayerId, CoopInput>, now: number, dtMs: number): void {
  for (const id of PLAYER_IDS) if (state.players[id].state === 'active' && state.players[id].hp <= 0) loseActor(state, id, false);
  for (const id of PLAYER_IDS) {
    const downed = state.players[id]; if (downed.state !== 'downed') continue;
    const other = id === 'p1' ? 'p2' : 'p1', rescuer = state.players[other];
    const helping = rescuer.state === 'active' && rescuer.hp > 0 && !rescuer.rewind && inputs[other].reviveHeld &&
      distanceSquared(rescuer.actor, downed.actor) <= COOP_RULES.reviveRadius ** 2;
    downed.reviveProgressMs = helping ? downed.reviveProgressMs + dtMs : 0;
    if (downed.reviveProgressMs + 0.000001 < COOP_RULES.reviveMs) continue;
    downed.state = 'active'; downed.hp = COOP_RULES.reviveHp; downed.reviveProgressMs = 0;
    downed.actor.invulnerableUntil = now + COOP_RULES.reviveInvulnerabilityMs;
    downed.history = [samplePlayer(downed.actor, now)];
    state.events.push({ type: 'notice', playerId: id, message: '队友救援完成：恢复 35 HP。自己的回溯从这里重新记录。' });
  }
}
export const actorOrigin = (state: CoopWorldState, id: PlayerId): Vec2 => ({ x: state.players[id].actor.x, y: state.players[id].actor.y });
