import { PLAYER_HEIGHT, PLAYER_WIDTH } from '../entities/model';
import type { Platform, WorldState } from '../entities/model';

/** Single source of geometry for the controller and renderer, including live K-line surfaces. */
export function worldPlatforms(world: WorldState): readonly Platform[] {
  const surfaces = world.loom ? world.loom.nodes.filter(node => node.expanded && !node.collapsed) : [...world.chapter.platforms, ...(world.furnace?.lifts ?? [])];
  return surfaces.filter(platform => !world.collapsed.includes(platform.id));
}

/** Carry only a verified grounded rider; walking/jumping off clears standingOn in the controller. */
export function carryOnLift(world: WorldState, previous: WorldState): void {
  if (world.rewind || !previous.player.grounded || !previous.player.standingOn) return;
  const before = previous.furnace?.lifts.find(lift => lift.id === previous.player.standingOn);
  const after = world.furnace?.lifts.find(lift => lift.id === previous.player.standingOn);
  if (!before || !after) return;
  const p = previous.player;
  if (Math.abs(p.y + PLAYER_HEIGHT / 2 - before.y) > 0.75 || p.x + PLAYER_WIDTH / 2 <= before.x || p.x - PLAYER_WIDTH / 2 >= before.x + before.w) return;
  world.player = { ...world.player, y: world.player.y + after.dy };
}
