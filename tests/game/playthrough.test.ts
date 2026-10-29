import { describe, expect, it } from 'vitest';
import { CHAPTER, PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import type { FrameInput, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { applyProgressionCommand } from '../../src/pages/GamePage/game/systems/shop';

/** Test-only bot sends normal input; no HP edits, teleporting, kill commands, or production hooks. */
function routeInput(world: WorldState): FrameInput {
  const p = world.player;
  const enemy = world.enemies.filter(item => item.hp > 0 && item.x > p.x - 50).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
  const target = world.boss.active ? world.boss : enemy;
  const gapAhead = [640, 1210, 1750].some(edge => p.x > edge - 38 && p.x < edge + 5);
  const nearBullet = world.bullets.some(bullet => bullet.faction === 'enemy' && Math.abs(bullet.x - p.x) < 130 && Math.abs(bullet.y - p.y) < 50);
  const slamWarning = world.boss.active && world.boss.phase === 2 && world.boss.action === 'tell';
  const move = world.boss.active ? (p.x < CHAPTER.arenaLeft + 105 ? 1 : 0) : 1;
  const jump = p.grounded && (gapAhead || (world.boss.active && (nearBullet || slamWarning)));
  return { ...EMPTY_INPUT, move, jumpPressed: jump, jumpHeld: true, fire: !!target,
    aim: target ? { x: target.x, y: target.y } : null,
    rewindPressed: world.boss.active && nearBullet && p.rewindReadyAt <= world.save.elapsedMs,
    insightPressed: enemy?.kind === 'deceiver' && Math.abs(enemy.x - p.x) < 250 && world.save.elapsedMs >= p.insightReadyAt };
}

describe('normal-input first-chapter path', () => {
  it('reaches and defeats all Gato phases from a fresh aligned run without cheats', () => {
    let world = createWorld({ ...PREVIEW_SAVE, doom: 8, runId: 'normal-input-test', inventory: ['constitutional'] });
    const phases = new Set<number>();
    let frames = 0;
    while ((world.mode === 'playing' || world.mode === 'rest') && frames < 60 * 90) {
      world = world.mode === 'rest' ? applyProgressionCommand(world, { type: 'rest-continue' }) : stepWorld(world, routeInput(world));
      if (world.boss.active) phases.add(world.boss.phase);
      frames += 1;
    }
    expect({ mode: world.mode, x: world.player.x, hp: world.save.hp, bossHp: world.boss.hp }).toMatchObject({ mode: 'cleared', bossHp: 0 });
    expect([...phases]).toEqual([1, 2, 3]);
    expect(world.save.stage).toBe(2);
    expect(world.save.doom).toBe(8); // the required path never forces forbidden compute
    expect(world.save.actionCounts.shots).toBeGreaterThan(20);
    expect(frames).toBeLessThan(60 * 90);
  });
});
