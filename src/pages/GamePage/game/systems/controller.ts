import { CHAPTER_ONE } from '../data/chapterOne';
import { TUNING } from '../data/tuning';
import type { ChapterDefinition } from '../entities/model';
import { PLAYER_HEIGHT, PLAYER_WIDTH, playerRect } from '../entities/model';
import type { FrameInput, Platform, Player } from '../entities/model';
import { approach, clamp } from './geometry';

/** Fixed-tick kinematic controller. All dimensions are world pixels; velocities are px/s. */
export function movePlayer(previous: Player, input: FrameInput, platforms: readonly Platform[], now: number, dt: number, arenaLocked: boolean, chapter: ChapterDefinition = CHAPTER_ONE) {
  const player = { ...previous };
  const frozen = previous.rootedBy != null || now < previous.petrifiedUntil;
  const controls: FrameInput = frozen ? { ...input, move: 0, jumpPressed: false, jumpHeld: false, dashPressed: false } : input;
  if (frozen) { player.vx = 0; player.dashUntil = 0; player.jumpUntil = 0; }
  const direction = now < player.invertedUntil ? -1 : 1;
  if (previous.grounded) player.coyoteUntil = now + TUNING.coyoteMs;
  if (controls.jumpPressed) player.jumpUntil = now + TUNING.jumpBufferMs;
  if (controls.move) player.facing = controls.move;
  const dashed = controls.dashPressed && now >= player.dashReadyAt;
  if (dashed) {
    player.dashUntil = now + TUNING.dashMs;
    player.dashReadyAt = now + TUNING.dashCooldownMs;
    player.vy = 0;
  }
  if (now < player.dashUntil) {
    player.vx = player.facing * TUNING.dashSpeed; player.vy = 0;
  } else {
    player.vx = approach(player.vx, controls.move * TUNING.runSpeed, (controls.move ? TUNING.acceleration : TUNING.friction) * dt);
    if (player.jumpUntil > now && player.coyoteUntil > now) {
      player.vy = -direction * TUNING.jumpSpeed; player.coyoteUntil = 0; player.jumpUntil = 0; player.grounded = false;
    }
    if (!controls.jumpHeld && player.vy * direction < -180) player.vy = -180 * direction;
    const gravity = player.vy * direction < 0 ? TUNING.riseGravity : TUNING.fallGravity;
    player.vy = clamp(player.vy + gravity * direction * dt, -TUNING.terminalSpeed, TUNING.terminalSpeed);
  }
  const oldRect = playerRect(previous);
  player.x += player.vx * dt;
  platforms.filter(platform => !platform.oneWay).forEach(platform => {
    if (oldRect.y + oldRect.h <= platform.y || oldRect.y >= platform.y + platform.h) return;
    if (player.vx > 0 && oldRect.x + oldRect.w <= platform.x && player.x + PLAYER_WIDTH / 2 > platform.x) {
      player.x = platform.x - PLAYER_WIDTH / 2; player.vx = 0;
    } else if (player.vx < 0 && oldRect.x >= platform.x + platform.w && player.x - PLAYER_WIDTH / 2 < platform.x + platform.w) {
      player.x = platform.x + platform.w + PLAYER_WIDTH / 2; player.vx = 0;
    }
  });
  player.x = clamp(player.x, arenaLocked ? chapter.arena.x + 12 : 10, Math.min(chapter.width - 10, arenaLocked ? chapter.arena.x + chapter.arena.w - 12 : chapter.width));
  player.y += player.vy * dt; player.grounded = false;
  let landedPlatformId: string | undefined;
  platforms.forEach(platform => {
    if (player.x + PLAYER_WIDTH / 2 <= platform.x || player.x - PLAYER_WIDTH / 2 >= platform.x + platform.w) return;
    if (player.vy >= 0 && oldRect.y + oldRect.h <= platform.y + 0.5 && player.y + PLAYER_HEIGHT / 2 >= platform.y) {
      player.y = platform.y - PLAYER_HEIGHT / 2; player.vy = 0; player.grounded = direction === 1; landedPlatformId = platform.id;
    } else if (player.vy < 0 && (!platform.oneWay || direction === -1) && oldRect.y >= platform.y + platform.h - 0.5 && player.y - PLAYER_HEIGHT / 2 <= platform.y + platform.h) {
      player.y = platform.y + platform.h + PLAYER_HEIGHT / 2; player.vy = 0; player.grounded = direction === -1;
    }
  });
  if (player.y < 18) { player.y = 18; player.vy = 0; player.grounded = direction === -1; }
  player.standingOn = player.grounded ? landedPlatformId ?? null : null;
  return { player, dashed, landedPlatformId };
}
