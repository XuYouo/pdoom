import { expect, it } from 'vitest';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import type { FrameInput, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { applyProgressionCommand } from '../../src/pages/GamePage/game/systems/shop';

/** Test-only controller: ordinary movement/aim/skills and explicit rest-continue, no state editing. */
function inputFor(world: WorldState, seenAttacks: Set<number>): FrameInput {
  const p = world.player;
  if (!world.boss.active) {
    return { ...EMPTY_INPUT, move: p.x < 317 ? 1 : p.x > 323 ? -1 : 0, jumpPressed: p.grounded, jumpHeld: true };
  }
  const bubble = world.factory?.bubbles.find(item => item.id === p.rootedBy);
  const near = world.bullets.some(bullet => bullet.faction === 'enemy' && Math.abs(bullet.x - p.x) < 95 && Math.abs(bullet.y - p.y) < 45);
  const target = bubble ?? world.boss;
  return { ...EMPTY_INPUT, move: p.x < 160 ? 1 : p.x > 175 ? -1 : 0, jumpPressed: p.grounded && near, jumpHeld: true,
    fire: !!bubble || seenAttacks.has(world.boss.phase), aim: { x: target.x, y: target.y },
    rewindPressed: !bubble && near && world.save.elapsedMs >= p.rewindReadyAt };
}

it('normally climbs both rest rooms and defeats all Sydney phases, saving the playable chapter-three handoff', () => {
  let world = createWorld({ ...createRun('7f516379-e67d-431c-bb24-16b8e2c9aa07', 42), stage: 2 });
  const rooms = new Set<number>(); const phases = new Set<number>(); const attacks = new Set<number>();
  let roots = 0; let previousRoot: number | null = null; let frames = 0;
  let minClimbSeaGap = Infinity; let enteredArenaAt = 0;
  while ((world.mode === 'playing' || world.mode === 'rest') && frames < 60 * 100) {
    if (world.mode === 'rest') { rooms.add(world.rest!.room); world = applyProgressionCommand(world, { type: 'rest-continue' }); }
    else world = stepWorld(world, inputFor(world, attacks));
    if (!world.boss.active && world.mode === 'playing') minClimbSeaGap = Math.min(minClimbSeaGap, world.factory!.seaY - world.player.y - 11);
    if (world.boss.active && !enteredArenaAt) enteredArenaAt = world.save.elapsedMs;
    if (world.boss.active) phases.add(world.boss.phase);
    if (world.boss.action === 'attack') attacks.add(world.boss.phase);
    if (world.player.rootedBy !== null && world.player.rootedBy !== previousRoot) roots += 1;
    previousRoot = world.player.rootedBy; frames += 1;
  }
  expect({ mode: world.mode, hp: world.save.hp, x: world.player.x, y: world.player.y, bossHp: world.boss.hp, root: world.player.rootedBy, seaY: world.factory!.seaY }).toMatchObject({ mode: 'cleared', bossHp: 0, root: null });
  expect([...rooms]).toEqual([1, 2]); expect([...phases]).toEqual([1, 2, 3]); expect([...attacks]).toEqual([1, 2, 3]);
  expect(roots).toBeGreaterThan(0); expect(world.save.stage).toBe(3); expect(world.save.checkpoint).toBe(0);
  expect(world.save.doom).toBe(8); expect(world.save.actionCounts.shots).toBeGreaterThan(20);
  expect(isGameSave(world.save)).toBe(true); expect(frames).toBeLessThan(60 * 100);
  expect(minClimbSeaGap).toBeGreaterThan(100);
  console.info('chapter-two normal-input metrics', { elapsedMs: world.save.elapsedMs, arenaAtMs: Math.round(enteredArenaAt), hp: world.save.hp, frames, rootsEncountered: roots, minClimbSeaGap: Math.round(minClimbSeaGap), shots: world.save.actionCounts.shots, rewinds: world.save.actionCounts.rewinds });
});
