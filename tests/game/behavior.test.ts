import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import type { BehaviorAction, BehaviorMemory } from '../../src/pages/GamePage/game/entities/model';
import { BEHAVIOR_ACTIONS, BEHAVIOR_LIMITS, cloneBehavior, createBehavior, mirrorProfile, observeBehavior } from '../../src/pages/GamePage/game/systems/behavior';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { snapshotSave } from '../../src/pages/GamePage/game/systems/rules';

const save = () => createRun('ae365d8b-dc23-407a-9a20-789c35d53511', 42);
const bump = (memory: BehaviorMemory, action: BehaviorAction, now: number) => observeBehavior(memory, memory.counts, { ...memory.counts, [action]: memory.counts[action] + 1 }, now);

describe('honest bounded behavioral observation', () => {
  it('uses legacy frequencies without inventing their missing order', () => {
    const saved = { ...save(), actionCounts: { shots: 400, dashes: 40, rewinds: 20, insights: 10 } };
    const memory = createBehavior(saved); const profile = mirrorProfile(saved, memory);
    expect(memory).toMatchObject({ source: 'counts-only', recent: [], combos: [] });
    expect(profile.source).toBe('counts-only'); expect(profile.combo).toEqual(['shots']); expect(profile.dominant).toBe('shots');
    expect(profile.frequencies.shots).toBeCloseTo(400 / 470);
    let learned = bump(memory, 'dashes', 100); learned = bump(learned, 'shots', 200);
    const live = mirrorProfile({ ...saved, actionCounts: learned.counts }, learned);
    expect(live.source).toBe('mixed'); expect(live.combo).toEqual(['dashes', 'shots']); expect(memory.combos).toEqual([]);
  });
  it('records actual successful insight→dash→shot order, not failed Q or held cooldown keys', () => {
    let world = createWorld(save());
    for (let index = 0; index < 10; index += 1) world = stepWorld(world, { ...EMPTY_INPUT, move: 1, fire: true, dashPressed: true, rewindPressed: true, insightPressed: true, rerollPressed: true });
    expect(world.save.actionCounts).toEqual({ shots: 1, dashes: 1, rewinds: 0, insights: 1 });
    expect(world.behavior.recent.map(item => item.action)).toEqual(['insights', 'dashes', 'shots']);
    expect(world.behavior.combos.some(combo => combo.actions.join('>') === 'insights>dashes>shots')).toBe(true);
    expect(world.behavior.recent.some(item => item.action === 'rewinds')).toBe(false);
  });
  it('deduplicates continuous shots and learns only real two/three-action windows', () => {
    let memory = createBehavior(save());
    for (let index = 0; index < 20; index += 1) memory = bump(memory, 'shots', index * 185);
    expect(memory.recent).toHaveLength(1); expect(memory.combos).toHaveLength(0); expect(memory.counts.shots).toBe(20);
    memory = bump(memory, 'dashes', 3600); memory = bump(memory, 'shots', 3700);
    expect(memory.combos.find(combo => combo.actions.join('>') === 'shots>dashes>shots')!.uses).toBe(1);
    memory = bump(memory, 'insights', 9000);
    expect(memory.combos.some(combo => combo.actions.join('>') === 'shots>insights')).toBe(false);
  });
  it('caps all ordered arrays and combo weights under long observation', () => {
    let memory = createBehavior(save());
    for (let index = 0; index < 3000; index += 1) memory = bump(memory, BEHAVIOR_ACTIONS[(index * 7 + Math.floor(index / 4) + Math.floor(index / 13)) % 4], index * 17);
    expect(memory.recent.length).toBeLessThanOrEqual(BEHAVIOR_LIMITS.recent); expect(memory.combos.length).toBeLessThanOrEqual(BEHAVIOR_LIMITS.combos);
    expect(memory.combos.every(combo => combo.actions.length >= 2 && combo.actions.length <= 3 && combo.uses <= BEHAVIOR_LIMITS.uses)).toBe(true);
    let capped = bump(bump(createBehavior(save()), 'shots', 0), 'dashes', 1); capped.combos[0].uses = BEHAVIOR_LIMITS.uses;
    capped = bump(bump(capped, 'shots', 2), 'dashes', 3);
    expect(capped.combos.find(combo => combo.actions.join('>') === 'shots>dashes')!.uses).toBe(BEHAVIOR_LIMITS.uses);
  });
  it('learns a genuinely new favorite after 32 older high-frequency groups instead of repeatedly evicting it', () => {
    const saved = { ...save(), actionCounts: { shots: 1000, dashes: 1000, rewinds: 1000, insights: 1000 } };
    let memory = createBehavior(saved); memory.source = 'observed';
    const novel: BehaviorAction[] = ['insights', 'rewinds', 'dashes'];
    const growing = new Set(['insights>rewinds', 'rewinds>dashes', 'dashes>insights', 'insights>rewinds>dashes', 'rewinds>dashes>insights', 'dashes>insights>rewinds']);
    const grammar: BehaviorAction[][] = [];
    for (const a of BEHAVIOR_ACTIONS) for (const b of BEHAVIOR_ACTIONS) {
      if (a === b) continue; grammar.push([a, b]);
      for (const c of BEHAVIOR_ACTIONS) if (b !== c) grammar.push([a, b, c]);
    }
    expect(grammar).toHaveLength(48);
    memory.combos = grammar.filter(actions => !growing.has(actions.join('>'))).slice(0, 32).map(actions => ({ actions, uses: 3, lastAt: 0 }));
    for (let cycle = 0; cycle < 30; cycle += 1) for (let index = 0; index < novel.length; index += 1) memory = bump(memory, novel[index], (cycle * 3 + index + 1) * 17);
    expect(memory.combos.find(combo => combo.actions.join('>') === novel.join('>'))!.uses).toBe(30);
    expect(mirrorProfile({ ...saved, actionCounts: memory.counts }, memory).combo).toEqual(novel);
    expect(memory.combos.length).toBeLessThanOrEqual(48); expect(new Set(memory.combos.map(combo => combo.actions.join('>'))).size).toBe(memory.combos.length);
  });
  it('preserves distinct legal long-run frequencies above 9999 without early saturation', () => {
    const saved = { ...save(), elapsedMs: 60000000, actionCounts: { shots: 50000, dashes: 45000, rewinds: 0, insights: 0 } };
    const recorded = createBehavior(saved); recorded.source = 'observed'; recorded.recent = [{ action: 'shots', at: saved.elapsedMs }];
    recorded.combos = [{ actions: ['shots', 'dashes'], uses: 20000, lastAt: saved.elapsedMs - 100 }, { actions: ['dashes', 'shots'], uses: 19000, lastAt: saved.elapsedMs - 50 }];
    const carried = createBehavior(saved, recorded); expect(carried.combos.map(combo => combo.uses)).toEqual([20000, 19000]);
    const next = bump(carried, 'dashes', saved.elapsedMs + 17);
    expect(next.combos[0]).toMatchObject({ actions: ['shots', 'dashes'], uses: 20001 });
    expect(next.combos[1].uses).toBe(19000); expect(BEHAVIOR_LIMITS.uses).toBe(1000000);
    expect(mirrorProfile({ ...saved, actionCounts: next.counts }, next).combo).toEqual(['shots', 'dashes']);
  });
  it('deep-clones every mutable memory level without exposing cached references', () => {
    const original = bump(bump(createBehavior(save()), 'shots', 0), 'dashes', 1); const copy = cloneBehavior(original);
    copy.counts.shots = 99; copy.recent[0].at = 99; copy.combos[0].actions[0] = 'insights'; copy.combos[0].uses = 99;
    expect(original.counts.shots).toBe(1); expect(original.recent[0].at).toBe(0); expect(original.combos[0]).toMatchObject({ actions: ['shots', 'dashes'], uses: 1 });
  });
  it('carries the exact safe tick including floor rounding but refuses future, stale, foreign or count-mismatched memory', () => {
    let world = createWorld(save()); for (let index = 0; index < 10; index += 1) world = stepWorld(world, { ...EMPTY_INPUT, fire: true, dashPressed: index === 3 });
    const safe = snapshotSave(world.save); const accepted = createWorld(safe, 'playing', world.behavior);
    expect(accepted.behavior).toEqual(world.behavior); expect(accepted.behavior).not.toBe(world.behavior);
    for (const bad of [
      { ...cloneBehavior(world.behavior), observedAt: safe.elapsedMs + 1 },
      { ...cloneBehavior(world.behavior), observedAt: safe.elapsedMs - 1 },
      { ...cloneBehavior(world.behavior), seed: 77 },
      { ...cloneBehavior(world.behavior), runId: 'different-run' },
      { ...cloneBehavior(world.behavior), counts: { ...world.behavior.counts, dashes: world.behavior.counts.dashes + 1 } },
    ]) expect(createBehavior(safe, bad)).toMatchObject({ source: 'counts-only', recent: [], combos: [] });
  });
  it('refuses malformed overlong or future ordered payloads even when their scalar cache stamp matches', () => {
    const saved = { ...save(), actionCounts: { shots: 4, dashes: 4, rewinds: 0, insights: 0 } };
    const bad = createBehavior(saved); bad.source = 'observed'; bad.combos = [{ actions: ['shots', 'dashes', 'shots', 'dashes'], uses: 1, lastAt: 0 }];
    expect(createBehavior(saved, bad).combos).toEqual([]);
    bad.combos = [{ actions: ['shots', 'dashes'], uses: 1, lastAt: 100 }];
    expect(createBehavior(saved, bad).combos).toEqual([]);
    bad.combos = [{ actions: ['shots', 'dashes'], uses: 1, lastAt: 0 }, { actions: ['shots', 'dashes'], uses: 2, lastAt: 0 }];
    expect(createBehavior(saved, bad).combos).toEqual([]);
  });
  it('copies only the actually effective build, including Lost in Middle and upgrades', () => {
    const a = { ...save(), inventory: ['constitutional', 'recursive', 'interpretability'] as const };
    const original = { ...a, inventory: [...a.inventory] }; const profile = mirrorProfile(original, createBehavior(original));
    expect(profile.activeBuild).toEqual(['constitutional', 'interpretability']); expect(profile.suppressedBuild).toEqual(['recursive']);
    expect(profile.damageMultiplier).toBe(1); expect(profile.defenseMultiplier).toBe(0.85); expect(profile.coreRadius).toBe(8);
    const moved = { ...original, inventory: ['recursive', 'constitutional', 'interpretability'] as typeof original.inventory };
    expect(mirrorProfile(moved, createBehavior(moved))).toMatchObject({ damageMultiplier: 1.25, defenseMultiplier: 1, suppressedBuild: ['constitutional'] });
    const upgraded = { ...original, upgrades: ['expanded', 'overclocked', 'reinforced', 'calibrated'] as const };
    const upgradedSave = { ...upgraded, upgrades: [...upgraded.upgrades] };
    expect(mirrorProfile(upgradedSave, createBehavior(upgradedSave))).toMatchObject({ damageMultiplier: 1.5, defenseMultiplier: 0.68, criticalMultiplier: 3, insightCooldownMs: 6000, suppressedBuild: [] });
    const temporal = { ...save(), inventory: ['temperature', 'residual'] as const }; const temporalSave = { ...temporal, inventory: [...temporal.inventory] };
    expect(mirrorProfile(temporalSave, createBehavior(temporalSave))).toMatchObject({ fireIntervalMs: 148, rewindCooldownMs: 5000 });
  });
});
