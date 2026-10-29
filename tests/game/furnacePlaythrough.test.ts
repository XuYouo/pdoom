import { expect, it } from 'vitest';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import type { FrameInput, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { applyProgressionCommand } from '../../src/pages/GamePage/game/systems/shop';
import { sampleAt } from '../../src/pages/GamePage/game/systems/rewind';

function normalInput(world: WorldState, seenAttacks: Set<number>): FrameInput {
  const p = world.player; const now = world.save.elapsedMs;
  if (!world.boss.active) {
    const enemy = world.enemies.filter(item => item.hp > 0 && item.x > p.x - 30).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    const heat = world.furnace!.heatZones.some(zone => zone.phase !== 'cool' && p.x > zone.x - 28 && p.x < zone.x + zone.w + 10);
    const near = world.bullets.some(bullet => bullet.faction === 'enemy' && Math.abs(bullet.x - p.x) < 105 && Math.abs(bullet.y - p.y) < 48);
    return { ...EMPTY_INPUT, move: 1, fire: !!enemy, aim: enemy ? { x: enemy.x, y: enemy.y } : null, jumpPressed: p.grounded && (heat || near), jumpHeld: true, dashPressed: heat && !p.grounded && p.y < 285 && now >= p.dashReadyAt };
  }
  const boss = world.boss;
  const target = boss.x - boss.facing * 100;
  const move = p.x < target - 4 ? 1 : p.x > target + 4 ? -1 : 0;
  const crossing = (p.x - boss.x) * (target - boss.x) < 0;
  const memory = world.history[0];
  const historyBehind = !!memory && memory.at <= now - 1999 && (memory.x - boss.x) * boss.facing < -34;
  const front = (p.x - boss.x) * boss.facing > 0;
  return { ...EMPTY_INPUT, move, jumpPressed: p.grounded && crossing && Math.abs(p.x - boss.x) < 120, jumpHeld: true,
    dashPressed: crossing && Math.abs(p.x - boss.x) < 45 && now >= p.dashReadyAt,
    rewindPressed: !world.rewind && front && historyBehind && now >= p.rewindReadyAt && (boss.action === 'tell' || now < p.petrifiedUntil),
    fire: seenAttacks.has(boss.phase), aim: { x: boss.x, y: boss.y } };
}

it.each([true, false])('clears the whole furnace using only normal inputs, prior donation=%s', donated => {
  let world = createWorld({ ...createRun('fc08270a-4c3a-493f-a3be-5c312a201e03', 42), stage: 3, donated });
  const rooms = new Set<number>(); const phases = new Set<number>(); const attacks = new Set<number>();
  let frames = 0; let actualRewindFlanks = 0; let endpoint: { x: number; y: number } | null = null;
  while ((world.mode === 'playing' || world.mode === 'rest') && frames < 60 * 150) {
    const previous = world;
    if (world.mode === 'rest') { rooms.add(world.rest!.room); world = applyProgressionCommand(world, { type: 'rest-continue' }); }
    else world = stepWorld(world, normalInput(world, attacks));
    if (!previous.rewind && world.rewind) {
      const actualPast = sampleAt(previous.history, world.save.elapsedMs - 2000);
      expect(world.rewind.path[0].x).toBeCloseTo(actualPast.x, 6); expect(world.rewind.path[0].y).toBeCloseTo(actualPast.y, 6);
      endpoint = { x: actualPast.x, y: actualPast.y };
    }
    if (previous.rewind && !world.rewind && endpoint && world.mode === 'playing') {
      expect(world.player.x).toBeCloseTo(endpoint.x, 6); expect(world.player.y).toBeCloseTo(endpoint.y, 6);
      if ((world.player.x - world.boss.x) * world.boss.facing < -34) actualRewindFlanks += 1;
      endpoint = null;
    }
    if (world.boss.active) phases.add(world.boss.phase);
    if (world.boss.action === 'attack') attacks.add(world.boss.phase);
    frames += 1;
  }
  expect({ mode: world.mode, hp: world.save.hp, x: world.player.x, bossHp: world.boss.hp, phase: world.boss.phase }).toMatchObject({ mode: 'cleared', bossHp: 0 });
  expect([...rooms]).toEqual([1, 2]); expect([...phases]).toEqual([1, 2, 3]); expect([...attacks]).toEqual([1, 2, 3]);
  expect(actualRewindFlanks).toBeGreaterThan(0); expect(world.save.actionCounts.rewinds).toBeGreaterThan(0);
  expect(world.furnace!.enraged).toBe(!donated); expect(world.save.donated).toBe(donated);
  expect(world.save.stage).toBe(4); expect(world.save.checkpoint).toBe(0); expect(isGameSave(world.save)).toBe(true);
  // The real dodge path crosses the optional +22 cache; 30 remains aligned and grants no damage-tier boost.
  expect(world.save.doom).toBe(30);
  console.info('furnace normal-input metrics', { donated, elapsedMs: world.save.elapsedMs, hp: world.save.hp, frames, actualRewindFlanks, shots: world.save.actionCounts.shots, rewinds: world.save.actionCounts.rewinds });
});

it('boards the real K-line, rides it and jumps into the high secret reward room without teleporting', () => {
  let world = createWorld({ ...createRun('d08a4a20-fc66-4963-a91a-b3f8e1a4ac9d104', 42), stage: 3, donated: true });
  let boarded = false; let movedUp = false; let movedDown = false; let secretStanding = false; let frames = 0;
  while (world.mode === 'playing' && world.pickups.some(item => item.id === 'gpu-secret-token') && frames < 60 * 35) {
    const p = world.player; const lift = world.furnace!.lifts[0];
    const enemy = world.enemies.find(item => item.hp > 0 && item.x > p.x);
    let move: FrameInput['move'] = p.x < 616 ? 1 : p.x > 624 ? -1 : 0;
    let jump = p.grounded && Math.abs(p.x - 620) < 25 && lift.y >= 280;
    if (p.standingOn === lift.id) {
      boarded = true; movedUp ||= lift.dy < 0; movedDown ||= lift.dy > 0;
      move = p.x < 653 ? 1 : p.x > 660 ? -1 : 0;
      jump = p.x >= 650 && lift.y <= 170;
      if (jump) move = 1;
    } else if (p.x > 650 && p.y < 185) { move = p.x < 815 ? 1 : 0; jump = false; }
    world = stepWorld(world, { ...EMPTY_INPUT, move, jumpPressed: jump, jumpHeld: true, fire: !!enemy, aim: enemy ? { x: enemy.x, y: enemy.y } : null });
    secretStanding ||= world.player.standingOn === 'secret-room'; frames += 1;
  }
  expect({ mode: world.mode, x: world.player.x, y: world.player.y, hp: world.save.hp, boarded, movedUp, movedDown, secretStanding }).toMatchObject({ mode: 'playing', boarded: true, movedUp: true, movedDown: true, secretStanding: true });
  expect(world.pickups.some(item => item.id === 'gpu-secret-token')).toBe(false);
  expect(world.save.tokens).toBeGreaterThanOrEqual(45);
  console.info('K-line secret route metrics', { elapsedMs: world.save.elapsedMs, frames, hp: world.save.hp, x: world.player.x, y: world.player.y });
});
