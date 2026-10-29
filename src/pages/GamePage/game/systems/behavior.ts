import type { GameSaveData } from '../../../../objects/game/GameSaveData';
import type { BehaviorAction, BehaviorMemory, MirrorProfile } from '../entities/model';
import { contextEffects, contextSnapshot } from './context';

// Four actions without adjacent duplicates have exactly 12 bigrams + 36 trigrams.
// Keep that entire finite grammar: a top-k pool would discard a new combo before it can accumulate evidence.
export const BEHAVIOR_LIMITS = { recent: 48, combos: 48, uses: 1000000, comboWindowMs: 2400 } as const;
export const BEHAVIOR_ACTIONS: readonly BehaviorAction[] = ['shots', 'dashes', 'rewinds', 'insights'];
// This is stepWorld's actual successful-action execution order, not input-key order.
const EXECUTION_ORDER: readonly BehaviorAction[] = ['insights', 'rewinds', 'dashes', 'shots'];
export const emptyActionCounts = (): GameSaveData['actionCounts'] => ({ shots: 0, dashes: 0, rewinds: 0, insights: 0 });

export function cloneBehavior(memory: BehaviorMemory): BehaviorMemory {
  return { ...memory, counts: { ...memory.counts }, recent: memory.recent.map(item => ({ ...item })), combos: memory.combos.map(combo => ({ ...combo, actions: [...combo.actions] })) };
}
function validOrderedPayload(memory: BehaviorMemory): boolean {
  if (!Number.isFinite(memory.observedAt) || memory.observedAt < 0 || (memory.source !== 'observed' && memory.source !== 'counts-only') ||
    !Array.isArray(memory.recent) || !Array.isArray(memory.combos) || memory.recent.length > BEHAVIOR_LIMITS.recent || memory.combos.length > BEHAVIOR_LIMITS.combos) return false;
  const actionExists = (action: BehaviorAction) => BEHAVIOR_ACTIONS.includes(action) && memory.counts[action] > 0;
  const validTime = (at: number) => Number.isFinite(at) && at >= 0 && at <= memory.observedAt;
  return memory.recent.every((item, index) => actionExists(item.action) && validTime(item.at) &&
    (index === 0 || (item.at >= memory.recent[index - 1].at && item.action !== memory.recent[index - 1].action))) &&
    memory.combos.every(combo => Array.isArray(combo.actions) && combo.actions.length >= 2 && combo.actions.length <= 3 &&
      combo.actions.every((action, index) => actionExists(action) && (index === 0 || action !== combo.actions[index - 1])) &&
      Number.isInteger(combo.uses) && combo.uses > 0 && combo.uses <= BEHAVIOR_LIMITS.uses &&
      combo.actions.every(action => combo.uses <= memory.counts[action]) && validTime(combo.lastAt)) &&
    new Set(memory.combos.map(combo => combo.actions.join('>'))).size === memory.combos.length;
}
export function createBehavior(save: GameSaveData, carried?: BehaviorMemory): BehaviorMemory {
  const sameTick = carried && carried.observedAt >= save.elapsedMs - 0.000001 && carried.observedAt - save.elapsedMs < 1;
  if (carried && sameTick && carried.runId === save.runId && carried.seed === save.seed &&
    BEHAVIOR_ACTIONS.every(action => carried.counts[action] === save.actionCounts[action]) &&
    validOrderedPayload(carried)) return cloneBehavior(carried);
  return { runId: save.runId, seed: save.seed, observedAt: save.elapsedMs, counts: { ...save.actionCounts },
    source: BEHAVIOR_ACTIONS.some(action => save.actionCounts[action] > 0) ? 'counts-only' : 'observed', recent: [], combos: [] };
}

/** Called once after real successful actions; failed/cooling/blocked key presses have no delta. */
export function observeBehavior(memory: BehaviorMemory, before: GameSaveData['actionCounts'], after: GameSaveData['actionCounts'], now: number): BehaviorMemory {
  const next = cloneBehavior(memory); next.counts = { ...after }; next.observedAt = now;
  if (BEHAVIOR_ACTIONS.some(action => after[action] < before[action])) {
    next.source = 'counts-only'; next.recent = []; next.combos = []; return next;
  }
  for (const action of EXECUTION_ORDER) {
    if (after[action] <= before[action]) continue;
    const last = next.recent[next.recent.length - 1];
    if (last?.action === action) { last.at = now; continue; }
    next.recent.push({ action, at: now }); next.recent = next.recent.slice(-BEHAVIOR_LIMITS.recent);
    for (const length of [2, 3]) {
      const tail = next.recent.slice(-length);
      if (tail.length < length || now - tail[0].at > BEHAVIOR_LIMITS.comboWindowMs) continue;
      const actions = tail.map(item => item.action); const key = actions.join('>');
      const existing = next.combos.find(combo => combo.actions.join('>') === key);
      if (existing) { existing.uses = Math.min(BEHAVIOR_LIMITS.uses, existing.uses + 1); existing.lastAt = now; }
      else next.combos.push({ actions, uses: 1, lastAt: now });
    }
  }
  next.combos.sort((a, b) => b.uses - a.uses || b.actions.length - a.actions.length || b.lastAt - a.lastAt || asciiCompare(a.actions.join('>'), b.actions.join('>')));
  next.combos = next.combos.slice(0, BEHAVIOR_LIMITS.combos);
  return next;
}
const asciiCompare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function mirrorProfile(save: GameSaveData, behavior: BehaviorMemory): MirrorProfile {
  const total = BEHAVIOR_ACTIONS.reduce((sum, action) => sum + save.actionCounts[action], 0);
  const frequencies = emptyActionCounts();
  BEHAVIOR_ACTIONS.forEach(action => { frequencies[action] = total ? save.actionCounts[action] / total : 0; });
  const dominant = [...BEHAVIOR_ACTIONS].sort((a, b) => frequencies[b] - frequencies[a] || BEHAVIOR_ACTIONS.indexOf(a) - BEHAVIOR_ACTIONS.indexOf(b))[0];
  const best = [...behavior.combos].sort((a, b) => b.uses - a.uses || b.actions.length - a.actions.length || b.lastAt - a.lastAt || asciiCompare(a.actions.join('>'), b.actions.join('>')))[0];
  const context = contextSnapshot(save);
  return { ...contextEffects(save), source: best ? behavior.source === 'counts-only' ? 'mixed' : 'observed' : 'counts-only',
    dominant, frequencies, combo: best ? [...best.actions] : [dominant], doom: save.doom,
    activeBuild: context.slots.filter(slot => slot.active).map(slot => slot.id), suppressedBuild: context.slots.filter(slot => !slot.active).map(slot => slot.id),
    hallucinationEvery: context.hallucinationEvery };
}
export function cloneMirrorProfile(profile: MirrorProfile): MirrorProfile {
  return { ...profile, frequencies: { ...profile.frequencies }, combo: [...profile.combo], activeBuild: [...profile.activeBuild], suppressedBuild: [...profile.suppressedBuild] };
}
