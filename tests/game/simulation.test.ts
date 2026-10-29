import { describe, expect, it } from 'vitest';
import { CHAPTER, PREVIEW_SAVE, TUNING } from '../../src/pages/GamePage/game/data/chapterOne';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import type { FrameInput, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { advanceEncounters } from '../../src/pages/GamePage/game/systems/encounters';
import { firePlayer } from '../../src/pages/GamePage/game/systems/combat';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { isGameSave } from '../../src/pages/GamePage/functions/saveModel';

const save = () => ({ ...PREVIEW_SAVE, runId: 'test-run', doom: 8, inventory: ['constitutional' as const] });
const run = (world: WorldState, ticks: number, input: Partial<FrameInput> = {}) => Array.from({ length: ticks }).reduce<WorldState>(state => stepWorld(state, { ...EMPTY_INPUT, ...input }), world);

describe('world lifecycle and checkpoints', () => {
  it('is static before start; simulation is deterministic and does not mutate old snapshots', () => {
    const preview = createWorld(save(), 'ready');
    expect(run(preview, 120, { fire: true, move: 1 })).toBe(preview);
    expect(preview.bullets).toHaveLength(0);
    expect(preview.save.elapsedMs).toBe(0);
    const active = createWorld(save());
    const immutableBefore = JSON.stringify(active);
    expect(run(active, 120)).toEqual(run(createWorld(save()), 120));
    expect(JSON.stringify(active)).toBe(immutableBefore);
  });
  it('does not silently downgrade a stage 5 checkpoint-99 save into a fresh first chapter', () => {
    [5].forEach(stage => {
      const world = createWorld({ ...save(), stage, checkpoint: 99, score: 8000 });
      expect(world.mode).toBe('unavailable');
      expect(world.save.stage).toBe(stage);
      expect(world.save.score).toBe(8000);
      expect(run(world, 60)).toBe(world);
      expect(world.events.some(event => event.type === 'checkpoint')).toBe(false);
    });
  });
  it('restores a safe checkpoint and does not respawn earlier rewards/enemies', () => {
    const world = createWorld({ ...save(), checkpoint: 1 });
    expect(world.player.x).toBe(CHAPTER.checkpoints[1].x);
    expect(world.enemies.every(enemy => enemy.x > world.player.x)).toBe(true);
    expect(world.pickups.every(pickup => pickup.x > world.player.x)).toBe(true);
  });
  it('emits a checkpoint only once while crossing it', () => {
    const world = createWorld(save());
    world.player.x = 1382;
    const first = stepWorld(world, EMPTY_INPUT);
    expect(first.events.filter(event => event.type === 'checkpoint')).toHaveLength(1);
    expect(first.save.checkpoint).toBe(11);
    expect(first.mode).toBe('rest');
    expect(stepWorld(first, EMPTY_INPUT)).toBe(first); // frozen rest is not another emission/tick
  });
  it('heals a reinforced character without violating the shared 100HP save contract', () => {
    const world = createWorld({ ...save(), runId: 'c4f98977-a2f8-4012-8c3a-e47e955473b2', hp: 95, upgrades: ['reinforced'] });
    world.player.x = 1382;
    const checkpoint = stepWorld(world, EMPTY_INPUT).events.find(event => event.type === 'checkpoint');
    expect(checkpoint?.type).toBe('checkpoint');
    if (checkpoint?.type === 'checkpoint') {
      expect(checkpoint.save.hp).toBe(100);
      expect(isGameSave(checkpoint.save)).toBe(true);
    }
  });
  it('death is terminal and does not masquerade as a chapter clear', () => {
    const world = createWorld(save()); world.player.y = 430;
    const dead = stepWorld(world, EMPTY_INPUT);
    expect(dead.mode).toBe('dead'); expect(dead.save.hp).toBe(0);
    expect(dead.events.filter(event => event.type === 'defeat')).toHaveLength(1);
    expect(dead.events.some(event => event.type === 'stage-cleared')).toBe(false);
    expect(run(dead, 100)).toBe(dead);
  });
  it('Gato clear emits stage-two checkpoint BEFORE chapter-clear and never final ending', () => {
    const world = createWorld({ ...save(), checkpoint: 2 });
    world.boss.active = true; world.boss.hp = 0;
    const cleared = stepWorld(world, EMPTY_INPUT);
    expect(cleared.mode).toBe('cleared'); expect(cleared.save.stage).toBe(2);
    const events = cleared.events.filter(event => event.type !== 'notice');
    expect(events.map(event => event.type)).toEqual(['checkpoint', 'stage-cleared']);
    expect(events[1]).toMatchObject({ type: 'stage-cleared', stage: 1, save: { stage: 2, checkpoint: 0 } });
    expect(cleared.events.some(event => 'ending' in event)).toBe(false);
    expect(run(cleared, 100)).toBe(cleared);
  });
});

describe('combat and encounter integration', () => {
  it('forbidden compute is optional, increases Doom once, and is removed', () => {
    const world = createWorld(save());
    world.player.x = 477; world.player.y = 180;
    const collected = stepWorld(world, EMPTY_INPUT);
    expect(collected.save.doom).toBe(36);
    expect(collected.pickups.some(pickup => pickup.id === 'compute-1')).toBe(false);
    expect(stepWorld(collected, EMPTY_INPUT).save.doom).toBe(36);
  });
  it('Q rewinds through an enemy bullet, grants type immunity and consumes a cooldown', () => {
    let world = run(createWorld(save()), 130);
    world.bullets = [{ id: 800, x: world.player.x, y: world.player.y, faction: 'enemy', kind: 'echo', vx: 0, vy: 0, damage: 18, radius: 4, expiresAt: 20000 }];
    const beforeHp = world.save.hp;
    world = stepWorld(world, { ...EMPTY_INPUT, rewindPressed: true });
    expect(world.rewind).not.toBeNull();
    expect(world.save.actionCounts.rewinds).toBe(1);
    expect(world.save.hp).toBe(beforeHp);
    expect(world.player.immunity.echo).toBeCloseTo(world.save.elapsedMs + 10000, 5);
    expect(world.player.criticalCharges).toBe(2);
    world = run(world, 40);
    expect(world.rewind).toBeNull();
    expect(stepWorld(world, { ...EMPTY_INPUT, rewindPressed: true }).save.actionCounts.rewinds).toBe(1);
  });
  it('insight exposes a precise core; shooting the core kills the otherwise tough deceiver', () => {
    const world = createWorld({ ...save(), elapsedMs: 2000 });
    const enemy = world.enemies.find(item => item.kind === 'deceiver')!;
    world.player.x = enemy.x - 25; world.player.y = enemy.y - 19;
    world.player.insightUntil = 10000;
    world.bullets = [{ id: 99, faction: 'player', kind: 'dictionary', x: enemy.x - 8, y: enemy.y - 19, vx: 510, vy: 0, radius: 3, damage: 12, expiresAt: 5000 }];
    const result = stepWorld(world, EMPTY_INPUT);
    expect(result.enemies.find(item => item.id === enemy.id)?.hp).toBe(0);
    expect(result.save.score).toBe(250);
  });
  it('Gato phase-one tell reflects, all three modes produce distinct attacks', () => {
    const world = createWorld({ ...save(), checkpoint: 2, elapsedMs: 3000 });
    world.boss = { ...world.boss, active: true, phase: 1, action: 'tell', actionUntil: 5000 };
    world.player.x = 2460; world.player.y = 280;
    world.bullets = [{ id: 99, faction: 'player', kind: 'dictionary', x: world.boss.x - 28, y: 270, vx: 510, vy: 0, radius: 3, damage: 12, expiresAt: 5000 }];
    const reflected = stepWorld(world, EMPTY_INPUT);
    expect(reflected.boss.hp).toBe(TUNING.bossHp);
    expect(reflected.bullets.some(bullet => bullet.faction === 'enemy')).toBe(true);
    const phase2 = advanceEncounters({ ...world, boss: { ...world.boss, hp: 200, phase: 2, actionUntil: 2000 } }, 3000);
    expect(phase2.shocks).toHaveLength(1);
    expect(phase2.bullets.map(bullet => bullet.kind)).toEqual(['impact', 'impact']);
    const phase3 = advanceEncounters({ ...world, boss: { ...world.boss, hp: 80, phase: 3, actionUntil: 2000 } }, 3000);
    expect(phase3.bullets).toHaveLength(7);
    expect(phase3.bullets.every(bullet => bullet.kind === 'caption')).toBe(true);
  });
  it('FOOM fragile platforms warn before collapsing, and the bullet pool stays bounded', () => {
    const world = createWorld({ ...save(), doom: 90 });
    world.player.x = 1080; world.player.y = 181; world.player.grounded = true;
    const warning = stepWorld(world, EMPTY_INPUT);
    expect(warning.collapseAt['compute-branch']).toBeGreaterThan(warning.save.elapsedMs);
    const later = run(warning, 60);
    expect(later.collapsed).toContain('compute-branch');
    const saturated = createWorld(save());
    saturated.bullets = Array.from({ length: TUNING.maxBullets }, (_, id) => ({ id, faction: 'player' as const, kind: 'echo' as const, x: 100, y: 100, vx: 0, vy: 0, radius: 3, damage: 10, expiresAt: 10000 }));
    firePlayer(saturated, { ...EMPTY_INPUT, fire: true }, 1000);
    expect(saturated.bullets).toHaveLength(TUNING.maxBullets);
  });
});
