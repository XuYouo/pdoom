import { TUNING } from '../data/tuning';
import { EMPTY_INPUT, type HistorySample } from '../entities/model';
import { PLAYER_IDS, type CoopInput, type CoopWorldState, type PlayerId } from './model';
import { activeIds, cloneCoop } from './state';
import { actorOrigin, enforceCoopTether, finishActors, fireActor, moveActor, resolveRescue, syncCoopBubbles } from './actors';
import { advanceCoopCombat } from './combat';
import { advanceCoopLoom, tryCoopReroll } from './loom';
import { advanceCoopEncounters, advanceCoopEnvironment, advanceCoopFactory, advanceCoopOmega, applyCoopHazards, enterCoopArena } from './chapters';
import { collectCoopCheckpoint, collectCoopPickups, resolveCoopOutcome } from './progression';

/** One fixed shared tick: two actor stages, one environment/AI/projectile/progression stage. */
export function stepCoopWorld(previous: CoopWorldState, inputs: Record<PlayerId, CoopInput>, deltaMs = TUNING.stepMs): CoopWorldState {
  if (previous.shared.mode !== 'playing') return previous;
  const step = Math.min(TUNING.stepMs, Math.max(0, deltaMs)); if (!Number.isFinite(step) || step === 0) return previous;
  const state = cloneCoop(previous), now = previous.run.elapsedMs + step, dt = step / 1000;
  state.tick += 1; state.run.elapsedMs = now;
  state.shared.shocks = state.shared.shocks.filter(shock => shock.until > now);
  const frames = { p1: inputs.p1 ?? EMPTY_INPUT, p2: inputs.p2 ?? EMPTY_INPUT };
  advanceCoopLoom(state, now);
  const rerolled = activeIds(state).some(id => frames[id].rerollPressed) && tryCoopReroll(state, now);
  const origins = { p1: actorOrigin(rerolled ? state : previous, 'p1'), p2: actorOrigin(rerolled ? state : previous, 'p2') };
  const traversals: Record<PlayerId, HistorySample[]> = { p1: [], p2: [] };
  // Lifts must advance before either actor is carried, while the shared sea advances just once.
  advanceCoopEnvironment(state, now);
  for (const id of PLAYER_IDS) traversals[id] = moveActor(state, previous, id, frames[id], now, dt, rerolled);
  enforceCoopTether(state, previous);
  advanceCoopOmega(state, now); enterCoopArena(state, now);
  advanceCoopFactory(state, now, dt);
  advanceCoopEncounters(state, now, dt);
  applyCoopHazards(state, traversals, now, dt); syncCoopBubbles(state, now);
  // Alternate priority at the shared projectile cap without changing anyone's firing interval.
  for (const id of state.tick % 2 ? PLAYER_IDS : [...PLAYER_IDS].reverse()) fireActor(state, id, frames[id], now);
  advanceCoopCombat(state, origins, traversals, now, dt); syncCoopBubbles(state, now);
  finishActors(state, previous, now); resolveRescue(state, frames, now, step);
  collectCoopPickups(state, now); collectCoopCheckpoint(state, now);
  resolveCoopOutcome(state, now);
  return state;
}
