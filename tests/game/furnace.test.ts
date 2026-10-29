import { describe, expect, it } from 'vitest';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { getChapter, isChapterPlayable } from '../../src/pages/GamePage/game/data/chapters';
import { CHINCHILLA_HALF_SIZE, EMPTY_INPUT, PLAYER_HEIGHT, enemyRect, laserRect } from '../../src/pages/GamePage/game/entities/model';
import type { FrameInput, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { advanceFurnace, applyFurnaceHazards, FURNACE_TIMING, inBasiliskGaze } from '../../src/pages/GamePage/game/systems/furnace';
import { advanceBasilisk, basiliskTuning } from '../../src/pages/GamePage/game/systems/basilisk';
import { advanceEncounters } from '../../src/pages/GamePage/game/systems/encounters';
import { worldPlatforms } from '../../src/pages/GamePage/game/systems/platforms';
import { movePlayer } from '../../src/pages/GamePage/game/systems/controller';
import { advanceCombat, firePlayer } from '../../src/pages/GamePage/game/systems/combat';
import { bindPuaBubble } from '../../src/pages/GamePage/game/systems/factory';
import { bossIncomingDamage, canReflect, completeChapter } from '../../src/pages/GamePage/game/systems/rules';
import { applyProgressionCommand, enterRest, shopOffers, transactShop } from '../../src/pages/GamePage/game/systems/shop';

const save = (donated = true) => ({ ...createRun('7afe9005-07dd-43ad-a0ee-a86c797d75ee', 42), stage: 3, donated });
const run = (world: WorldState, ticks: number, input: Partial<FrameInput> = {}) => Array.from({ length: ticks }).reduce((state: WorldState) => stepWorld(state, { ...EMPTY_INPUT, ...input }), world);
function freezeDeep(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.values(value).forEach(freezeDeep); Object.freeze(value);
}
function rider(): WorldState {
  const world = createWorld(save());
  world.enemies = []; // Isolated collision fixture, not the normal-input route proof.
  world.player = { ...world.player, x: 620, y: 309, grounded: true, standingOn: 'nvda-lift' };
  return world;
}
function gaze(): WorldState {
  const world = createWorld({ ...save(), checkpoint: 2 });
  world.player = { ...world.player, x: 2700, y: 309, facing: 1, invulnerableUntil: 0 };
  world.boss = { ...world.boss, active: true, facing: -1, action: 'attack', actionUntil: 10000 };
  world.furnace!.laser = { x: world.boss.x - 26, y: world.boss.y + 15, length: 440, halfHeight: 11, facing: -1, phase: 'active', until: 10000, hitPlayer: false, absorbedByRewind: false };
  return world;
}

describe('third-chapter state and causal donation contract', () => {
  it('registers stage three without changing the verified factory entry or accepting unsupported checkpoints', () => {
    expect(getChapter(3)).toMatchObject({ axis: 'horizontal', height: 360, floor: 320, boss: { kind: 'basilisk' } });
    expect(isChapterPlayable(3)).toBe(true); expect(getChapter(2)!.arena.trigger).toBe(289);
    [5].forEach(stage => {
      const future = { ...save(), stage, checkpoint: 99, score: 9000 };
      const world = createWorld(future);
      expect(world.mode).toBe('unavailable'); expect(world.save).toEqual(future); expect(stepWorld(world, EMPTY_INPUT)).toBe(world);
    });
  });
  it.each([1, 2])('consumes a real donation made in chapter %s to avoid later frenzy', stage => {
    const result = transactShop({ ...save(false), stage, checkpoint: 11, tokens: 100 }, 'donation');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.donated).toBe(true);
      const stageThree = stage === 1 ? completeChapter(completeChapter(result.save)) : completeChapter(result.save);
      expect(createWorld(stageThree).furnace!.enraged).toBe(false);
    }
    expect(createWorld(save(false)).furnace!.enraged).toBe(true);
  });
  it('shows a disabled third-chapter donation and rejects payment or hacking without changing the flag', () => {
    const original = { ...save(false), checkpoint: 11, tokens: 200, doom: 60, inventory: ['constitutional' as const, 'recursive' as const, 'residual' as const] };
    expect(shopOffers(original).find(offer => offer.id === 'donation')).toMatchObject({ available: false, canBuy: false, canHack: false });
    expect(transactShop(original, 'donation')).toMatchObject({ ok: false, message: expect.stringContaining('第三章不能补捐') });
    expect(transactShop(original, 'donation', true).ok).toBe(false);
    const world = createWorld(original);
    const next = applyProgressionCommand(world, { type: 'shop-buy', offerId: 'donation' });
    expect(next.save).toEqual(world.save); expect(next.save.donated).toBe(false); expect(next.furnace!.enraged).toBe(true);
    expect(next.rest!.message).toContain('因果已锁定');
  });
  it('frenzy has faster cycles, more real bullets and greater real damage', () => {
    const normal = basiliskTuning(false); const frenzy = basiliskTuning(true);
    expect(frenzy.tellMs + frenzy.attackMs + frenzy.recoverMs).toBeLessThan(normal.tellMs + normal.attackMs + normal.recoverMs);
    const volley = (donated: boolean) => {
      const world = createWorld(save(donated)); world.boss = { ...world.boss, active: true, action: 'tell', actionUntil: 0 };
      return advanceBasilisk(world, 1).bullets;
    };
    expect(volley(false).length).toBeGreaterThan(volley(true).length);
    expect(volley(false)[0].damage).toBeGreaterThan(volley(true)[0].damage);
    expect(Math.hypot(volley(false)[0].vx, volley(false)[0].vy)).toBeGreaterThan(Math.hypot(volley(true)[0].vx, volley(true)[0].vy));
  });
  it('rebuilds only the safe segment and never respawns passed secret rewards', () => {
    const world = createWorld({ ...save(), checkpoint: 11, tokens: 150 });
    expect(world.mode).toBe('rest'); expect(world.furnace!.lifts).toHaveLength(0);
    expect(world.pickups.every(pickup => pickup.x > world.player.x)).toBe(true);
    expect(world.pickups.some(pickup => pickup.id === 'gpu-secret-token')).toBe(false);
    expect(world.save.tokens).toBe(150);
    const continued = applyProgressionCommand(world, { type: 'rest-continue' });
    expect(continued.save.checkpoint).toBe(1); expect(continued.save.tokens).toBe(150);
  });
});

describe('real K-line geometry, heat and immutable clocks', () => {
  it('moves a real grounded rider upward and downward, using the same geometry as rendering', () => {
    let world = rider(); let up = false; let down = false;
    for (let frame = 0; frame < 480; frame += 1) {
      world = stepWorld(world, EMPTY_INPUT);
      const lift = world.furnace!.lifts[0];
      expect(worldPlatforms(world).find(platform => platform.id === lift.id)).toBe(lift);
      expect(world.player.standingOn).toBe(lift.id); expect(world.player.y + PLAYER_HEIGHT / 2).toBeCloseTo(lift.y, 6);
      up ||= lift.dy < -0.01; down ||= lift.dy > 0.01;
    }
    expect(up && down).toBe(true);
  });
  it('detaches on jump and walking off, and rejects a stale attachment outside the lift', () => {
    const seated = run(rider(), 120);
    const jumped = stepWorld(seated, { ...EMPTY_INPUT, jumpPressed: true, jumpHeld: true });
    expect(jumped.player.standingOn).toBeNull(); expect(jumped.player.grounded).toBe(false); expect(jumped.player.vy).toBeLessThan(0);
    const off = run({ ...seated, player: { ...seated.player, x: 679 } }, 20, { move: 1 });
    expect(off.player.standingOn).not.toBe('nvda-lift');
    const stale = rider(); stale.player.x = 50;
    const next = stepWorld(stale, EMPTY_INPUT);
    expect(next.player.y).toBe(309); expect(next.player.standingOn).toBe('gpu-floor');
  });
  it('warns before GPU damage and respects the cold phase', () => {
    const world = createWorld(save()); world.player.x = 1000; world.player.y = 309; world.player.invulnerableUntil = 0;
    advanceFurnace(world, 1000); applyFurnaceHazards(world, [], 1000);
    expect(world.furnace!.heatZones[0].phase).toBe('cool'); expect(world.save.hp).toBe(100);
    advanceFurnace(world, FURNACE_TIMING.coolMs + 1); applyFurnaceHazards(world, [], FURNACE_TIMING.coolMs + 1);
    expect(world.furnace!.heatZones[0].phase).toBe('tell'); expect(world.save.hp).toBe(100);
    advanceFurnace(world, FURNACE_TIMING.coolMs + FURNACE_TIMING.tellMs + 1);
    applyFurnaceHazards(world, [], FURNACE_TIMING.coolMs + FURNACE_TIMING.tellMs + 1);
    expect(world.furnace!.heatZones[0].phase).toBe('active'); expect(world.save.hp).toBeLessThan(100);
  });
  it('keeps all nested previous state immutable and freezes every runtime clock in rest', () => {
    const world = rider(); const before = JSON.stringify(world); freezeDeep(world);
    const next = stepWorld(world, EMPTY_INPUT);
    expect(JSON.stringify(world)).toBe(before); expect(next.furnace).not.toBe(world.furnace);
    expect(next.furnace!.lifts[0]).not.toBe(world.furnace!.lifts[0]); expect(next.furnace!.heatZones[0]).not.toBe(world.furnace!.heatZones[0]);
    const resting = createWorld(save()); enterRest(resting, 1);
    resting.player.petrifiedUntil = resting.save.elapsedMs + 1200;
    const frozen = JSON.stringify(resting);
    expect(run(resting, 600, { move: 1, fire: true, rewindPressed: true })).toBe(resting);
    expect(JSON.stringify(resting)).toBe(frozen);
  });
  it('gives chinchillas their tiny hitbox, high health and dense GPU volleys', () => {
    const world = createWorld(save()); const enemy = world.enemies[0];
    expect(CHINCHILLA_HALF_SIZE).toBe(6); expect(enemyRect(enemy)).toMatchObject({ w: 12, h: 12 }); expect(enemy.hp).toBe(108);
    world.player.x = enemy.x - 100; enemy.phase = 'tell'; enemy.phaseUntil = 0;
    const result = advanceEncounters(world, 1);
    expect(result.bullets.filter(bullet => bullet.kind === 'gpu')).toHaveLength(9);
  });
});

describe('directed causal gaze and honest historical rewind', () => {
  it('requires both spatial beam overlap and facing toward the boss', () => {
    const world = gaze(); const beam = world.furnace!.laser!;
    expect(laserRect(beam)).toEqual({ x: 2424, y: 284, w: 440, h: 22 }); expect(inBasiliskGaze(world)).toBe(true);
    world.player.facing = -1; expect(inBasiliskGaze(world)).toBe(false);
    world.player = { ...world.player, x: 3000, facing: -1 }; expect(inBasiliskGaze(world)).toBe(false);
    world.player = { ...world.player, x: 2700, y: 250, facing: 1 }; expect(inBasiliskGaze(world)).toBe(false);
    world.player = { ...world.player, x: 2200, y: 309 }; expect(inBasiliskGaze(world)).toBe(false);
    world.player = { ...world.player, x: 3100, facing: -1 };
    world.furnace!.laser = { ...beam, x: world.boss.x + 26, facing: 1 };
    expect(inBasiliskGaze(world)).toBe(true);
  });
  it('never petrifies during tell, limits stone to 1.2s and does not refresh it every frame', () => {
    const world = gaze(); world.furnace!.laser!.phase = 'tell';
    applyFurnaceHazards(world, [], 1); expect(world.player.petrifiedUntil).toBe(0);
    world.furnace!.laser!.phase = 'active';
    applyFurnaceHazards(world, [], 10); const deadline = world.player.petrifiedUntil;
    expect(deadline).toBe(1210);
    applyFurnaceHazards(world, [], 400); expect(world.player.petrifiedUntil).toBe(deadline);
    const held = movePlayer(world.player, { ...EMPTY_INPUT, move: 1, dashPressed: true }, worldPlatforms(world), 500, 1 / 60, true, world.chapter);
    expect(held.player.x).toBe(world.player.x); expect(held.dashed).toBe(false);
    const released = movePlayer(world.player, { ...EMPTY_INPUT, move: 1 }, worldPlatforms(world), 1211, 1 / 60, true, world.chapter);
    expect(released.player.x).toBeGreaterThan(world.player.x);
  });
  it('blocks ordinary fire while petrified, but never blocks Sydney PUA release shots', () => {
    const stone = gaze(); applyFurnaceHazards(stone, [], 10);
    firePlayer(stone, { ...EMPTY_INPUT, fire: true }, 11);
    expect(stone.save.actionCounts.shots).toBe(0); expect(stone.bullets).toHaveLength(0);
    firePlayer(stone, { ...EMPTY_INPUT, fire: true }, 1211);
    expect(stone.save.actionCounts.shots).toBe(1);
    const bound = createWorld({ ...save(), stage: 2, checkpoint: 2 });
    bindPuaBubble(bound, 0); firePlayer(bound, { ...EMPTY_INPUT, fire: true }, 1);
    expect(bound.player.rootedBy).not.toBeNull(); expect(bound.save.actionCounts.shots).toBe(1);
  });
  it('after real petrification, Q absorbs that same beam exactly once without bullet interference', () => {
    let world = createWorld({ ...save(), checkpoint: 2 });
    for (let frame = 0; frame < 400 && world.boss.action !== 'attack'; frame += 1) {
      world = stepWorld(world, { ...EMPTY_INPUT, move: world.player.x < 2600 ? 1 : 0 });
    }
    expect(world.boss.action).toBe('attack'); expect(world.player.petrifiedUntil).toBeGreaterThan(world.save.elapsedMs);
    expect(world.furnace!.laser).toMatchObject({ hitPlayer: true, absorbedByRewind: false });
    // Unit isolation only: remove projectile interference, leaving the real beam and recorded movement history.
    world = { ...world, bullets: [] };
    const before = JSON.stringify(world); freezeDeep(world);
    const first = stepWorld(world, { ...EMPTY_INPUT, rewindPressed: true });
    expect(first.rewind).not.toBeNull(); expect(first.player.petrifiedUntil).toBe(0);
    expect(first.furnace!.laser).toMatchObject({ hitPlayer: true, absorbedByRewind: true });
    expect(first.player.criticalCharges).toBe(2);
    expect(first.player.immunity.causal).toBeCloseTo(first.save.elapsedMs + 10000, 5);
    const later = run(first, 8);
    expect(later.player.criticalCharges).toBe(2); expect(later.player.immunity.causal).toBe(first.player.immunity.causal);
    expect(JSON.stringify(world)).toBe(before);
  });
  it('locks facing during tell even after the player crosses to the other side', () => {
    const world = gaze(); world.boss.action = 'recover'; world.boss.actionUntil = 0;
    const locked = advanceBasilisk(world, 1); world.boss = locked.boss;
    expect(world.boss.facing).toBe(-1);
    world.player.x = 3100;
    const stillLocked = advanceBasilisk(world, 100);
    expect(stillLocked.boss.facing).toBe(-1); expect(world.furnace!.laser!.facing).toBe(-1);
  });
  it('only Gato reflects, and actual rear hits deal more damage than frontal armor', () => {
    const front = gaze(); const back = gaze();
    const impact = (world: WorldState, side: -1 | 1) => {
      world.boss.action = 'tell';
      world.bullets = [{ id: 999, x: world.boss.x + side * 50, y: world.boss.y, vx: -side * 510, vy: 0, radius: 3, damage: 12, faction: 'player', kind: 'dictionary', expiresAt: 10000 }];
      advanceCombat(world, world.player, [], 1, 0.1);
    };
    impact(front, -1); impact(back, 1);
    expect(540 - front.boss.hp).toBe(4); expect(540 - back.boss.hp).toBe(22);
    expect(front.bullets.some(bullet => bullet.faction === 'enemy')).toBe(false);
    expect(canReflect(front.boss)).toBe(false); expect(canReflect({ ...front.boss, kind: 'sydney' })).toBe(false);
    expect(canReflect({ ...front.boss, kind: 'gato' })).toBe(true);
    expect(bossIncomingDamage(front.boss, 0, front.boss.x + 100)).toBe(0);
  });
  it('saves stage four after chapter-three clear and preserves build and donation fields', () => {
    const world = createWorld({ ...save(false), checkpoint: 2, inventory: ['constitutional', 'residual'], upgrades: ['calibrated'] });
    world.player.x = 2600; world.boss.active = true; world.boss.hp = 0;
    const result = stepWorld(world, EMPTY_INPUT);
    expect(result.mode).toBe('cleared'); expect(result.save.stage).toBe(4); expect(result.save.checkpoint).toBe(0);
    expect(result.save.inventory).toEqual(world.save.inventory); expect(result.save.donated).toBe(false);
    expect(result.save.runId).toBe(world.save.runId); expect(result.save.upgrades).toEqual(world.save.upgrades);
    expect(result.events.filter(event => event.type === 'checkpoint' || event.type === 'stage-cleared').map(event => event.type)).toEqual(['checkpoint', 'stage-cleared']);
    expect(result.events.find(event => event.type === 'stage-cleared')).toMatchObject({ stage: 3, save: { stage: 4 } });
    expect(result.events.some(event => 'ending' in event)).toBe(false); expect(isGameSave(result.save)).toBe(true);
  });
});
