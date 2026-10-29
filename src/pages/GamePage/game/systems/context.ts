import type { GameSaveData, RelicId } from '../../../../objects/game/GameSaveData';
import type { ContextSnapshot } from '../bridge';
import { TUNING } from '../data/chapterOne';
import { BASE_CONTEXT_K, RELICS } from '../data/relics';

export function contextSnapshot(save: GameSaveData, editable = false): ContextSnapshot {
  const capacityK = save.upgrades.includes('expanded') || save.inventory.includes('context-expansion') ? 128 : 32;
  const usedK = BASE_CONTEXT_K + save.inventory.reduce((sum, id) => sum + RELICS[id].costK, 0);
  const overloaded = usedK >= capacityK;
  const middle = (save.inventory.length - 1) / 2;
  const slots = save.inventory.map((id, index) => ({ ...RELICS[id], active: !overloaded || save.inventory.length < 3 || (index !== Math.floor(middle) && index !== Math.ceil(middle)) }));
  const lispActive = slots.some(slot => slot.id === 'lisp' && slot.active);
  return { capacityK, usedK, overloaded, editable, hallucinationEvery: overloaded ? lispActive ? 8 : 4 : null, slots };
}

export function activeRelics(save: GameSaveData): Set<RelicId> {
  return new Set(contextSnapshot(save).slots.filter(slot => slot.active).map(slot => slot.id));
}

/** Derived modifiers are never persisted; reordering/removing suppression recomputes them. */
export function contextEffects(save?: GameSaveData) {
  const active = save ? activeRelics(save) : new Set<RelicId>();
  const upgrades = save?.upgrades ?? [];
  return {
    damageMultiplier: (active.has('recursive') ? 1.25 : 1) * (upgrades.includes('overclocked') ? 1.2 : 1),
    defenseMultiplier: (active.has('constitutional') ? 0.85 : 1) * (upgrades.includes('reinforced') ? 0.8 : 1),
    fireIntervalMs: active.has('temperature') ? TUNING.fireIntervalMs * 0.8 : TUNING.fireIntervalMs,
    rewindCooldownMs: active.has('residual') ? 5000 : TUNING.rewindCooldownMs,
    insightDurationMs: active.has('interpretability') ? 6000 : TUNING.insightDurationMs,
    coreRadius: active.has('interpretability') ? 8 : 5,
    insightCooldownMs: upgrades.includes('calibrated') ? 6000 : TUNING.insightCooldownMs,
    criticalMultiplier: upgrades.includes('calibrated') ? 3 : 2.5,
  };
}

export function isHallucinationShot(save: GameSaveData): boolean {
  const interval = contextSnapshot(save).hallucinationEvery;
  return interval !== null && (save.actionCounts.shots + 1) % interval === 0;
}

export function reorderContext(save: GameSaveData, from: number, to: number): GameSaveData | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= save.inventory.length || to >= save.inventory.length || from === to) return null;
  const inventory = [...save.inventory];
  const [moved] = inventory.splice(from, 1);
  inventory.splice(to, 0, moved);
  return { ...save, inventory };
}
