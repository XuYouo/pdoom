import { expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT, PLAYER_HEIGHT } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { cameraTarget } from '../../src/pages/GamePage/game/systems/cameraFrame';

it('keeps the factory camera following until the feet really clear the arena floor', () => {
  // Local collision fixture at the last step, not the separate normal-input whole-level proof.
  let world = createWorld({ ...createRun('22222222-2222-4222-8222-222222222222', 42), stage: 2, checkpoint: 2 });
  world.player = { ...world.player, x: 320, y: 344, grounded: true };
  let minimumY = world.player.y;
  for (let frame = 0; frame < 36; frame++) {
    world = stepWorld(world, { ...EMPTY_INPUT, jumpPressed: frame === 0, jumpHeld: frame < 2 });
    minimumY = Math.min(minimumY, world.player.y);
  }
  expect(minimumY).toBeGreaterThan(world.chapter.floor - PLAYER_HEIGHT / 2);
  expect(world.boss.active).toBe(false);
  expect(world.player.y).toBe(344);
  expect(cameraTarget(world.chapter, world.player, world.boss.active).y).toBeGreaterThan(0);
  for (let frame = 0; frame < 45; frame++) {
    world = stepWorld(world, { ...EMPTY_INPUT, jumpPressed: frame === 0, jumpHeld: true });
  }
  expect(world.boss.active).toBe(true);
  expect(world.player.y + PLAYER_HEIGHT / 2).toBeLessThanOrEqual(world.chapter.floor);
  expect(cameraTarget(world.chapter, world.player, world.boss.active)).toEqual({ x: 0, y: 0 });
});
