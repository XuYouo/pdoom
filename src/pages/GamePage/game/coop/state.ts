import type { GameSaveData } from '../../../../objects/game/GameSaveData';
import type { Vec2, WorldState } from '../entities/model';
import { createWorld } from '../systems/simulation';
import { createBehavior } from '../systems/behavior';
import { samplePlayer } from '../systems/rewind';
import { PLAYER_IDS, type CoopCheckpoint, type CoopPlayerState, type CoopRun, type CoopWorldState, type PlayerId } from './model';

/** Runtime data has no classes, timers or browser objects; preserve the registered chapter identity. */
export function cloneData<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => cloneData(item)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)])) as T;
  return value;
}
export function runPart(save: GameSaveData): CoopRun {
  const { hp: _hp, actionCounts: _counts, ...run } = save;
  void _hp; void _counts;
  return { ...run, inventory: [...run.inventory], upgrades: [...run.upgrades] };
}
export function playerView(state: CoopWorldState, id: PlayerId): WorldState {
  const player = state.players[id];
  return { ...state.shared, save: { ...state.run, hp: player.hp, actionCounts: player.actionCounts }, player: player.actor,
    history: player.history, rewind: player.rewind, behavior: player.behavior, events: [] };
}
/** Commit one actor perspective into the same detached draft, never step or merge two worlds. */
export function commitView(state: CoopWorldState, id: PlayerId, view: WorldState): void {
  const { save, player, history, rewind, behavior, events, ...shared } = view;
  Object.assign(state.shared, shared); state.run = runPart(save);
  Object.assign(state.players[id], { actor: player, hp: save.hp, actionCounts: save.actionCounts, history, rewind, behavior });
  for (const event of events) if (event.type === 'notice' || event.type === 'impact') state.events.push({ ...event, playerId: id });
}
export function withPlayer(state: CoopWorldState, id: PlayerId, fn: (view: WorldState) => void): void {
  const view = playerView(state, id); fn(view); commitView(state, id, view);
}
export function cloneCoop(state: CoopWorldState): CoopWorldState {
  const { chapter, ...runtime } = state.shared;
  return { ...state, shared: { ...cloneData(runtime), chapter }, run: cloneData(state.run), players: cloneData(state.players),
    ready: { ...state.ready }, enemyTargets: { ...state.enemyTargets }, events: [] };
}
export const activeIds = (state: CoopWorldState) => PLAYER_IDS.filter(id => state.players[id].state === 'active' && state.players[id].hp > 0);
export function nearestPlayer(state: CoopWorldState, origin: Vec2): PlayerId {
  return activeIds(state).sort((a, b) => {
    const p = state.players[a].actor, q = state.players[b].actor;
    return (p.x - origin.x) ** 2 + (p.y - origin.y) ** 2 - (q.x - origin.x) ** 2 - (q.y - origin.y) ** 2;
  })[0] ?? state.hostPlayerId;
}
export function makeCheckpoint(state: CoopWorldState): CoopCheckpoint {
  const entry = (id: PlayerId) => ({ hp: state.players[id].hp, actionCounts: cloneData(state.players[id].actionCounts), behavior: cloneData(state.players[id].behavior) });
  return { run: cloneData(state.run), players: { p1: entry('p1'), p2: entry('p2') } };
}
export function createCoopWorld(save: GameSaveData, options: { hostPlayerId?: PlayerId } = {}): CoopWorldState {
  const solo = createWorld(save);
  const { save: initial, player, history: _history, rewind: _rewind, behavior: _behavior, events: _events, ...shared } = solo;
  void _history; void _rewind; void _behavior; void _events;
  const actorState = (offset: number): CoopPlayerState => {
    const actor = { ...cloneData(player), x: player.x + offset };
    return { actor, hp: initial.hp, state: initial.hp > 0 ? 'active' : 'downed', history: [samplePlayer(actor, initial.elapsedMs)], rewind: null,
      actionCounts: { ...initial.actionCounts }, behavior: createBehavior(initial), reviveProgressMs: 0,
      laserUntil: null, laserHit: false, laserAbsorbed: false, scanAt: null, turnStartX: null };
  };
  const run = runPart(initial), players = { p1: actorState(-12), p2: actorState(12) };
  const state: CoopWorldState = { version: 1, tick: 0, epoch: 0, hostPlayerId: options.hostPlayerId ?? 'p1', shared, run, players,
    ready: { p1: false, p2: false }, targetPlayerId: 'p1', enemyTargets: {}, checkpoint: { run, players: { p1: players.p1, p2: players.p2 } }, events: [] };
  state.checkpoint = makeCheckpoint(state);
  if (shared.mode === 'rest') state.events.push({ type: 'rest-opened' });
  return state;
}
