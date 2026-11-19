import { decodeCheckpoint } from '../data/checkpoints';
import { reached } from '../entities/model';
import { distanceSquared } from '../systems/geometry';
import { addDoom, completeChapter, endingForDoom, finishFinalChapter } from '../systems/rules';
import { enterRest, applyProgressionCommand } from '../systems/shop';
import { loomCheckpointReached } from '../systems/loom';
import { omegaCheckpointReached } from '../systems/omega';
import { releaseLeviathanPresentation } from '../systems/leviathan';
import { createBehavior } from '../systems/behavior';
import { samplePlayer } from '../systems/rewind';
import { COOP_RULES, PLAYER_IDS, type CoopCheckpoint, type CoopCommand, type CoopWorldState, type PlayerId } from './model';
import { activeIds, cloneCoop, cloneData, commitView, createCoopWorld, makeCheckpoint, playerView, runPart, withPlayer } from './state';

export function saveCoopCheckpoint(state: CoopWorldState): void {
  state.checkpoint = makeCheckpoint(state); state.events.push({ type: 'checkpoint' });
}
function reviveAtSafePoint(state: CoopWorldState, now: number): void {
  for (const id of PLAYER_IDS) {
    const player = state.players[id];
    if (player.state !== 'active' || player.hp <= 0) { player.state = 'active'; player.hp = COOP_RULES.reviveHp; }
    player.reviveProgressMs = 0; player.rewind = null; player.turnStartX = null;
    player.actor.rootedBy = null; player.actor.petrifiedUntil = 0; player.actor.dashUntil = 0;
    player.actor.invulnerableUntil = now + 1000;
    player.history = [samplePlayer(player.actor, now)];
  }
}
export function collectCoopPickups(state: CoopWorldState, now: number): void {
  const collected = new Set<string>();
  for (const pickup of state.shared.pickups) {
    const id = activeIds(state).filter(candidate => !state.players[candidate].rewind && distanceSquared(pickup, state.players[candidate].actor) < 24 ** 2)
      .sort((a, b) => distanceSquared(pickup, state.players[a].actor) - distanceSquared(pickup, state.players[b].actor))[0];
    if (!id) continue;
    const player = state.players[id]; collected.add(pickup.id);
    if (pickup.kind === 'token') { state.run.tokens += pickup.amount; state.run.score += pickup.amount * 2; }
    if (pickup.kind === 'heal') player.hp = Math.min(100, player.hp + pickup.amount);
    if (pickup.kind === 'compute' || pickup.kind === 'mushroom') {
      state.run.doom = addDoom(state.run.doom, pickup.amount); state.run.tokens += 8;
      state.events.push({ type: 'notice', playerId: id, message: `队伍禁忌算力 +${pickup.amount}% P(Doom)，共享输出与弹幕速度改变。` });
      if (pickup.kind === 'mushroom') { player.actor.invertedUntil = now + 1700; player.actor.vy = -160; player.actor.grounded = false; }
    }
  }
  state.shared.pickups = state.shared.pickups.filter(pickup => !collected.has(pickup.id));
}
export function collectCoopCheckpoint(state: CoopWorldState, now: number): void {
  const active = activeIds(state); if (!active.length || state.shared.mode !== 'playing') return;
  const current = decodeCheckpoint(state.run.checkpoint);
  const point = state.shared.chapter.checkpoints.find(point => point.id > current.room && active.every(id => {
    const player = state.players[id], view = playerView(state, id);
    return !player.rewind && player.actor.y <= state.shared.chapter.height + 65 && reached(state.shared.chapter, player.actor, point.trigger) &&
      omegaCheckpointReached(view, point.id) && loomCheckpointReached(view, point.id);
  }));
  if (!point || point.id === 0) return;
  const id = active[0], view = playerView(state, id), hp = view.save.hp;
  // A shared rating is approved only if every survivor meets the original HP threshold.
  view.save = { ...view.save, hp: Math.min(...active.map(member => state.players[member].hp)) };
  enterRest(view, point.id); view.save.hp = hp;
  commitView(state, id, view);
  if (view.mode !== 'rest') return;
  const spawn = state.players[id].actor;
  for (const member of PLAYER_IDS) {
    const player = state.players[member];
    player.actor = { ...player.actor, x: point.x + (member === 'p1' ? -12 : 12), y: spawn.y, vx: 0, vy: 0, grounded: true, standingOn: null, invertedUntil: 0 };
  }
  reviveAtSafePoint(state, now); state.ready = { p1: false, p2: false };
  saveCoopCheckpoint(state);
  state.events.push({ type: 'context-changed' }, { type: 'rest-opened' });
}

function clearCombat(state: CoopWorldState): void {
  state.shared.bullets = [];
  for (const id of PLAYER_IDS) { state.players[id].rewind = null; state.players[id].actor.rootedBy = null; state.players[id].actor.petrifiedUntil = 0; }
  if (state.shared.factory) state.shared.factory.bubbles = [];
  if (state.shared.furnace) state.shared.furnace.laser = null;
  if (state.shared.omega) { state.shared.omega.mirror.rewind = null; state.shared.omega.mirror.scan = null; }
  withPlayer(state, state.hostPlayerId, releaseLeviathanPresentation);
}
export function resolveCoopOutcome(state: CoopWorldState, now: number): void {
  if (state.shared.mode !== 'playing') return;
  if (!activeIds(state).length) {
    state.shared.mode = 'dead'; clearCombat(state); state.ready = { p1: false, p2: false };
    state.events.push({ type: 'defeat' }); return;
  }
  if (!state.shared.boss.active || state.shared.boss.hp > 0) return;
  clearCombat(state); reviveAtSafePoint(state, now); state.ready = { p1: false, p2: false };
  const view = playerView(state, state.hostPlayerId);
  if (state.shared.omega) {
    state.run = runPart(finishFinalChapter(view.save)); state.shared.mode = 'finished'; state.shared.omega.phase = 'complete';
    saveCoopCheckpoint(state); state.events.push({ type: 'victory', ending: endingForDoom(state.run.doom) });
  } else {
    const stage = state.shared.chapter.stage;
    state.run = runPart(completeChapter(view.save)); state.shared.mode = 'cleared';
    saveCoopCheckpoint(state); state.events.push({ type: 'stage-cleared', stage });
  }
}

function restoreCheckpoint(previous: CoopWorldState, checkpoint: CoopCheckpoint): CoopWorldState {
  const state = createCoopWorld({ ...cloneData(checkpoint.run), hp: checkpoint.players.p1.hp, actionCounts: cloneData(checkpoint.players.p1.actionCounts) }, { hostPlayerId: previous.hostPlayerId });
  for (const id of PLAYER_IDS) {
    state.players[id].hp = checkpoint.players[id].hp;
    state.players[id].state = checkpoint.players[id].hp > 0 ? 'active' : 'downed';
    state.players[id].actionCounts = cloneData(checkpoint.players[id].actionCounts);
    state.players[id].behavior = createBehavior(playerView(state, id).save, checkpoint.players[id].behavior);
  }
  state.tick = previous.tick; state.epoch = previous.epoch + 1; state.checkpoint = cloneData(checkpoint);
  return state;
}

export function applyCoopCommand(previous: CoopWorldState, command: CoopCommand): CoopWorldState {
  if (!PLAYER_IDS.includes(command.playerId)) return previous;
  const state = cloneCoop(previous), mode = state.shared.mode;
  if (command.type === 'continue-ready') {
    if (mode !== 'rest' && mode !== 'cleared' && mode !== 'dead') return previous;
    state.ready[command.playerId] = command.ready ?? true;
    if (!state.ready.p1 || !state.ready.p2) return state;
    if (mode === 'cleared' || mode === 'dead') return restoreCheckpoint(state, state.checkpoint);
    const view = applyProgressionCommand(playerView(state, state.hostPlayerId), { type: 'rest-continue' });
    commitView(state, state.hostPlayerId, view); state.ready = { p1: false, p2: false }; state.epoch += 1;
    saveCoopCheckpoint(state); state.events.push({ type: 'rest-closed' }, { type: 'context-changed' });
    return state;
  }
  if (mode !== 'rest' || command.playerId !== state.hostPlayerId) {
    state.events.push({ type: 'notice', playerId: command.playerId, message: '共享补给与构筑只由房主在休息室调整。' }); return state;
  }
  if ((command.type === 'shop-buy' || command.type === 'shop-hack') && command.offerId === 'repair' && (!command.targetPlayerId || !PLAYER_IDS.includes(command.targetPlayerId))) {
    state.events.push({ type: 'notice', message: '修复必须明确选择一位队友，尚未扣除算力。' }); return state;
  }
  const target: PlayerId = command.type !== 'context-reorder' && command.offerId === 'repair' ? command.targetPlayerId! : state.hostPlayerId;
  const action = command.type === 'context-reorder' ? { type: 'context-reorder' as const, from: command.from, to: command.to }
    : { type: command.type, offerId: command.offerId };
  const view = applyProgressionCommand(playerView(state, target), action);
  const committed = view.events.some(event => event.type === 'checkpoint');
  commitView(state, target, view);
  if (committed) { state.ready = { p1: false, p2: false }; saveCoopCheckpoint(state); state.events.push({ type: 'rest-updated' }, { type: 'context-changed' }); }
  return state;
}
