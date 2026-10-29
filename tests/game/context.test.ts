import { describe, expect, it } from 'vitest';
import type { GameSaveData, RelicId, UpgradeId } from '../../src/objects/game/GameSaveData';
import { RELIC_IDS, UPGRADE_IDS } from '../../src/objects/game/GameSaveData';
import { PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';
import { RELICS, UPGRADES } from '../../src/pages/GamePage/game/data/relics';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { activeRelics, contextEffects, contextSnapshot, isHallucinationShot, reorderContext } from '../../src/pages/GamePage/game/systems/context';
import { advanceCombat, firePlayer, hurt } from '../../src/pages/GamePage/game/systems/combat';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';

const save = (inventory: RelicId[] = [], upgrades: UpgradeId[] = []): GameSaveData => ({ ...PREVIEW_SAVE, inventory, upgrades, actionCounts: { shots: 0, dashes: 0, rewinds: 0, insights: 0 } });
function shot(inventory: RelicId[] = [], upgrades: UpgradeId[] = [], critical = false) {
  const world = createWorld(save(inventory, upgrades));
  world.player.criticalCharges = critical ? 1 : 0;
  firePlayer(world, { ...EMPTY_INPUT, fire: true }, 2000);
  return world;
}
function hit(inventory: RelicId[] = [], upgrades: UpgradeId[] = []) {
  const world = createWorld(save(inventory, upgrades));
  hurt(world, 20, 2000);
  return world.save.hp;
}

describe('ordered token capacity and Lost in the Middle', () => {
  it('has a cost and real definition for every registered relic/upgrade', () => {
    expect(Object.keys(RELICS)).toEqual([...RELIC_IDS]);
    expect(Object.keys(UPGRADES)).toEqual([...UPGRADE_IDS]);
    expect(Object.values(RELICS).every(relic => relic.costK > 0 && relic.price > 0)).toBe(true);
  });
  it('starts with 8K reserved, fills exactly at 32K and disables the odd middle', () => {
    expect(contextSnapshot(save())).toMatchObject({ usedK: 8, capacityK: 32, overloaded: false });
    const full = save(['constitutional', 'recursive', 'residual']);
    expect(contextSnapshot(full)).toMatchObject({ usedK: 32, overloaded: true, hallucinationEvery: 4 });
    expect([...activeRelics(full)]).toEqual(['constitutional', 'residual']);
  });
  it('suppresses both middle entries for even lengths and recomputes after a saved reorder', () => {
    const full = save(['constitutional', 'recursive', 'residual', 'temperature']);
    expect([...activeRelics(full)]).toEqual(['constitutional', 'temperature']);
    const reordered = reorderContext(full, 1, 0)!;
    expect(reordered.inventory).toEqual(['recursive', 'constitutional', 'residual', 'temperature']);
    expect(contextEffects(reordered).damageMultiplier).toBe(1.25);
    expect(contextEffects(full).damageMultiplier).toBe(1);
    expect(full.inventory[0]).toBe('constitutional');
    expect(reorderContext(full, -1, 2)).toBeNull();
    expect(reorderContext(full, 1, 99)).toBeNull();
    expect(reorderContext(full, 1.1, 2)).toBeNull();
  });
  it('context-expansion and expanded each remove suppression and hallucination by providing 128K', () => {
    const inventory: RelicId[] = ['constitutional', 'recursive', 'residual'];
    expect(contextSnapshot(save([...inventory, 'context-expansion']))).toMatchObject({ capacityK: 128, usedK: 44, overloaded: false, hallucinationEvery: null });
    expect(contextSnapshot(save(inventory, ['expanded']))).toMatchObject({ capacityK: 128, usedK: 32, overloaded: false });
    expect(activeRelics(save(inventory, ['expanded'])).has('recursive')).toBe(true);
    expect(isHallucinationShot({ ...save(inventory, ['expanded']), actionCounts: { shots: 3, dashes: 0, rewinds: 0, insights: 0 } })).toBe(false);
  });
});

describe('every passive affects the live rules, not just its label', () => {
  it('constitutional and reinforced reduce actual damage independently and together', () => {
    expect(hit(['constitutional'])).toBeGreaterThan(hit());
    expect(hit([], ['reinforced'])).toBeGreaterThan(hit());
    expect(hit(['constitutional'], ['reinforced'])).toBeGreaterThan(hit([], ['reinforced']));
    expect(hit(['recursive', 'constitutional', 'residual'])).toBe(hit()); // exactly full; constitution lost in middle
  });
  it('recursive and overclocked change actual bullets; middle suppression removes recursion', () => {
    expect(shot(['recursive']).bullets[0].damage).toBe(15);
    expect(shot([], ['overclocked']).bullets[0].damage).toBe(14);
    expect(shot(['recursive'], ['overclocked']).bullets[0].damage).toBe(18);
    expect(shot(['constitutional', 'recursive', 'residual']).bullets[0].damage).toBe(12);
  });
  it('temperature changes the real firing deadline', () => {
    expect(shot(['temperature']).player.shotReadyAt).toBe(2148);
    expect(shot().player.shotReadyAt).toBe(2185);
  });
  it('interpretability extends real insight and enlarges the one-hit core collision', () => {
    const active = stepWorld(createWorld(save(['interpretability'])), { ...EMPTY_INPUT, insightPressed: true });
    expect(active.player.insightUntil - active.save.elapsedMs).toBe(6000);
    const hitCore = (inventory: RelicId[]) => {
      const world = createWorld({ ...save(inventory), checkpoint: 1 });
      const enemy = world.enemies.find(item => item.kind === 'deceiver')!;
      world.player.insightUntil = 10000;
      world.bullets = [{ id: 1, x: enemy.x - 12, y: enemy.y - 26, vx: 900, vy: 0, radius: 1, damage: 12, faction: 'player', kind: 'dictionary', expiresAt: 9000 }];
      advanceCombat(world, world.player, [], 2000, 1 / 60);
      return world.enemies.find(item => item.id === enemy.id)!.hp;
    };
    expect(hitCore([])).toBe(65);
    expect(hitCore(['interpretability'])).toBe(0);
  });
  it('residual changes the actual backprop cooldown after recording two seconds', () => {
    let world = createWorld(save(['residual']));
    Array.from({ length: 130 }).forEach(() => { world = stepWorld(world, EMPTY_INPUT); });
    world = stepWorld(world, { ...EMPTY_INPUT, rewindPressed: true });
    expect(world.rewind).not.toBeNull();
    expect(world.player.rewindReadyAt - world.save.elapsedMs).toBeCloseTo(5000, 6);
  });
  it('calibrated changes critical projectile damage and actual E cooldown', () => {
    expect(shot([], ['calibrated'], true).bullets[0].damage).toBe(36);
    expect(shot([], [], true).bullets[0].damage).toBe(30);
    const active = stepWorld(createWorld(save([], ['calibrated'])), { ...EMPTY_INPUT, insightPressed: true });
    expect(active.player.insightReadyAt - active.save.elapsedMs).toBe(6000);
  });
  it('lisp actively reduces attention failures from every fourth to every eighth shot', () => {
    const full = save(['lisp', 'recursive', 'constitutional', 'residual']);
    full.actionCounts.shots = 3;
    expect(contextSnapshot(full).hallucinationEvery).toBe(8);
    expect(isHallucinationShot(full)).toBe(false);
    full.actionCounts.shots = 7;
    expect(isHallucinationShot(full)).toBe(true);
    const suppressed = { ...full, inventory: ['recursive', 'lisp', 'constitutional', 'residual'] as RelicId[] };
    expect(contextSnapshot(suppressed).hallucinationEvery).toBe(4);
  });
  it('hallucination emits visible glyph data but cannot damage a boss or execute an exposed core', () => {
    const world = createWorld({ ...save(['constitutional', 'recursive', 'residual']), checkpoint: 1 });
    world.save.actionCounts.shots = 3;
    world.player.criticalCharges = 2;
    firePlayer(world, { ...EMPTY_INPUT, fire: true }, 2000);
    expect(world.bullets).toHaveLength(3);
    expect(world.bullets.every(bullet => bullet.harmless && bullet.damage === 0 && bullet.glyph)).toBe(true);
    expect(world.player.criticalCharges).toBe(2);
    const enemy = world.enemies.find(item => item.kind === 'deceiver')!;
    world.player.insightUntil = 10000;
    world.boss.active = true;
    world.bullets = [{ ...world.bullets[0], x: enemy.x - 10, y: enemy.y - 19, vx: 900, vy: 0 }, { ...world.bullets[1], x: world.boss.x - 30, y: world.boss.y, vx: 900, vy: 0 }];
    advanceCombat(world, world.player, [], 2010, 1 / 60);
    expect(world.enemies.find(item => item.id === enemy.id)!.hp).toBe(65);
    expect(world.boss.hp).toBe(world.boss.maxHp);
    expect(world.save.score).toBe(0);
  });
});
