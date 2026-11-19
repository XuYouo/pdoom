import type { HistorySample } from '../entities/model';
import { playerRect, reached } from '../entities/model';
import { OMEGA_RULES } from '../systems/omega';
import { applyOmegaStorm } from '../systems/omega';
import { applyMirrorScan, MIRROR_RULES, recordMirrorHistory } from '../systems/mirror';
import { advanceFactory } from '../systems/factory';
import { advanceFurnace, applyFurnaceHazards } from '../systems/furnace';
import { applyLeviathanPressure } from '../systems/leviathan';
import { advanceEncounters } from '../systems/encounters';
import { enterLoomArena, loomArenaEntryAllowed } from '../systems/loom';
import { distanceSquared } from '../systems/geometry';
import { samplePlayer } from '../systems/rewind';
import { type CoopWorldState, type PlayerId, PLAYER_IDS } from './model';
import { activeIds, nearestPlayer, playerView, withPlayer } from './state';
import { loseActor } from './actors';

export function advanceCoopEnvironment(state: CoopWorldState, now: number): void {
  const id = activeIds(state)[0] ?? state.hostPlayerId;
  withPlayer(state, id, view => advanceFurnace(view, now));
}
export function advanceCoopFactory(state: CoopWorldState, now: number, dt: number): void {
  const id = activeIds(state)[0] ?? state.hostPlayerId;
  const actors = activeIds(state).map(playerId => state.players[playerId].actor);
  withPlayer(state, id, view => advanceFactory(view, now, dt, actors));
}

export function enterCoopArena(state: CoopWorldState, now: number): void {
  const active = activeIds(state);
  if (!active.length || state.shared.omega || state.shared.boss.active || !active.every(id => reached(state.shared.chapter, state.players[id].actor, state.shared.chapter.arena.trigger) && loomArenaEntryAllowed(playerView(state, id)))) return;
  const prepare = state.shared.boss.kind === 'basilisk' || state.shared.boss.kind === 'leviathan' ? 2400 : 1200;
  state.shared.boss = { ...state.shared.boss, active: true, action: 'recover', actionUntil: now + prepare, enteredAt: now };
  state.shared.bullets = [];
  if (state.shared.factory) state.shared.factory.probes = [];
  withPlayer(state, active[0], enterLoomArena);
  for (const id of PLAYER_IDS) {
    const player = state.players[id]; player.history = [samplePlayer(player.actor, now)]; player.rewind = null;
    if (player.state === 'downed') loseActor(state, id, true);
  }
  state.events.push({ type: 'notice', message: '队伍已进入同一竞技场。Boss阶段、弱点和地形由两人共同推进。' });
}

export function advanceCoopOmega(state: CoopWorldState, now: number): void {
  const omega = state.shared.omega, active = activeIds(state);
  if (!omega || omega.phase === 'complete' || !active.length) return;
  const allAt = (check: (id: PlayerId) => boolean) => active.every(check);
  const visible = (id: PlayerId) => { const body = playerRect(state.players[id].actor); return body.y >= omega.door.y && body.y + body.h <= state.shared.chapter.floor + 0.000001; };
  if (omega.phase === 'storm') {
    for (const zone of omega.stormZones) {
      if (now < zone.phaseUntil) continue;
      zone.phase = zone.phase === 'cool' ? 'tell' : zone.phase === 'tell' ? 'active' : 'cool';
      zone.phaseUntil = now + (zone.phase === 'tell' ? OMEGA_RULES.stormTellMs : zone.phase === 'active' ? OMEGA_RULES.stormActiveMs : OMEGA_RULES.stormCoolMs);
    }
    if (allAt(id => state.players[id].actor.x >= omega.door.x + omega.door.w && visible(id) && !state.players[id].rewind)) {
      omega.phase = 'chamber'; state.shared.bullets = [];
      state.events.push({ type: 'notice', message: '队伍进入镜室。两人走近镜子，揭示才会开始。' });
    }
  }
  if (omega.phase === 'chamber' && allAt(id => {
    const player = state.players[id];
    return visible(id) && player.actor.grounded && Math.abs(player.actor.y + 11 - state.shared.chapter.floor) < 0.000001 && !player.rewind &&
      distanceSquared(player.actor, { x: omega.glass.x + omega.glass.w / 2, y: state.shared.chapter.floor - 11 }) <= OMEGA_RULES.approachRadius ** 2;
  })) {
    omega.phase = 'reveal'; omega.revealAt = now; omega.revealUntil = now + OMEGA_RULES.revealMs; state.shared.bullets = [];
    for (const id of active) state.players[id].history = [samplePlayer(state.players[id].actor, now)];
    state.events.push({ type: 'notice', message: '镜像正在醒来。它将学习一名玩家真实执行过的组合，不会拼凑两人的动作。' });
  }
  if (omega.phase === 'reveal' && now >= omega.revealUntil) {
    omega.phase = 'duel'; omega.mirror.state = 'idle'; omega.mirror.until = now + MIRROR_RULES.prepareMs;
    state.shared.boss = { ...state.shared.boss, active: true, action: 'recover', actionUntil: omega.mirror.until, enteredAt: now, x: omega.mirror.actor.x, y: omega.mirror.actor.y };
    state.shared.bullets = [];
    for (const id of active) { const player = state.players[id]; player.history = [samplePlayer(player.actor, now)]; player.rewind = null; player.actor.invulnerableUntil = Math.max(player.actor.invulnerableUntil, now + 500); }
  }
  if (omega.phase !== 'duel') omega.mirror.history = recordMirrorHistory(omega.mirror.history, samplePlayer(omega.mirror.actor, now));
}

export function advanceCoopEncounters(state: CoopWorldState, now: number, dt: number): void {
  const active = activeIds(state); if (!active.length) return;
  const boss = state.shared.boss, mirror = state.shared.omega?.mirror;
  const choose = mirror ? (mirror.state === 'idle' || mirror.state === 'recover') && now >= mirror.until : (boss.action === 'idle' || boss.action === 'recover') && now >= boss.actionUntil;
  if (choose || !active.includes(state.targetPlayerId)) state.targetPlayerId = nearestPlayer(state, boss);
  withPlayer(state, state.targetPlayerId, view => {
    const result = advanceEncounters(view, now, dt, enemy => {
      const before = state.enemyTargets[enemy.id];
      if (enemy.phase !== 'tell' || !before || !active.includes(before)) state.enemyTargets[enemy.id] = nearestPlayer(state, enemy);
      return state.players[state.enemyTargets[enemy.id]].actor;
    });
    view.boss = result.boss; view.enemies = result.enemies; view.nextBulletId = result.nextId;
    view.bullets.push(...result.bullets); view.shocks.push(...result.shocks); view.events.push(...result.events);
  });
}

export function applyCoopHazards(state: CoopWorldState, traversals: Record<PlayerId, HistorySample[]>, now: number, dt: number): void {
  for (const id of PLAYER_IDS.filter(id => state.players[id].state === 'active')) {
    const player = state.players[id];
    const sea = state.shared.factory?.seaY;
    if (player.actor.y > state.shared.chapter.height + 65 || (sea !== undefined && (player.actor.y + 11 >= sea || traversals[id].some(point => point.y + 11 >= sea)))) { loseActor(state, id, true); continue; }
    const laser = state.shared.furnace?.laser;
    if (laser && player.laserUntil !== laser.until) { player.laserUntil = laser.until; player.laserHit = false; player.laserAbsorbed = false; }
    withPlayer(state, id, view => {
      if (view.furnace?.laser) view.furnace.laser = { ...view.furnace.laser, hitPlayer: player.laserHit, absorbedByRewind: player.laserAbsorbed };
      applyFurnaceHazards(view, traversals[id], now);
      if (view.furnace?.laser) { player.laserHit = view.furnace.laser.hitPlayer; player.laserAbsorbed = view.furnace.laser.absorbedByRewind; }
      if (view.loom) view.loom.turn = { ...view.loom.turn, startX: player.turnStartX };
      applyLeviathanPressure(view, now, dt);
      player.turnStartX = view.loom?.turn.startX ?? null;
      applyOmegaStorm(view, now);
      const scan = view.omega?.mirror.scan;
      if (scan) scan.hit = player.scanAt === scan.at;
      applyMirrorScan(view, traversals[id], now);
      if (scan?.hit) player.scanAt = scan.at;
    });
  }
}
