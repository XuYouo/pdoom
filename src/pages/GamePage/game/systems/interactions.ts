import { reached } from '../entities/model';
import type { WorldState } from '../entities/model';
import { nearbyPickups } from './combat';
import { addDoom, doomForm, maxHp } from './rules';
import { decodeCheckpoint, type RestRoomId } from '../data/checkpoints';
import { enterRest } from './shop';
import { loomCheckpointReached } from './loom';
import { omegaCheckpointReached } from './omega';

export function collectAndCheckpoint(world: WorldState, now: number): void {
  if (world.rewind || world.mode !== 'playing' || world.save.hp <= 0) return;
  if ((world.loom || world.omega) && world.player.y > world.chapter.height + 65) { world.save = { ...world.save, hp: 0 }; return; }
  const collected = nearbyPickups(world);
  collected.forEach(pickup => {
    if (pickup.kind === 'token') world.save = { ...world.save, tokens: world.save.tokens + pickup.amount, score: world.save.score + pickup.amount * 2 };
    if (pickup.kind === 'heal') world.save = { ...world.save, hp: Math.min(maxHp(), world.save.hp + pickup.amount) };
    if (pickup.kind === 'compute' || pickup.kind === 'mushroom') {
      const oldForm = doomForm(world.save.doom);
      world.save = { ...world.save, doom: addDoom(world.save.doom, pickup.amount), tokens: world.save.tokens + 8 };
      world.events.push({ type: 'notice', message: `禁忌算力 +${pickup.amount}% P(Doom) · 输出提高，弹幕也将加速。` });
      if (doomForm(world.save.doom) !== oldForm) world.events.push({ type: 'notice', message: doomForm(world.save.doom) === 'foom' ? 'FOOM >80%：触手觉醒，弹速与伤害上升，裂纹平台会崩塌！' : 'P(Doom) >50%：RLHF 面具显现，安全护栏削弱。' });
      if (pickup.kind === 'mushroom') {
        world.player = { ...world.player, invertedUntil: now + 1700, vy: -160, grounded: false };
        world.events.push({ type: 'notice', message: '幻觉蘑菇：重力反转 1.7 秒，顶部是安全边界。' });
      }
    }
  });
  const collectedIds = new Set(collected.map(pickup => pickup.id));
  world.pickups = world.pickups.filter(pickup => !collectedIds.has(pickup.id));
  const checkpoint = decodeCheckpoint(world.save.checkpoint);
  const next = world.chapter.checkpoints.find(point => point.id > checkpoint.room && reached(world.chapter, world.player, point.trigger) && omegaCheckpointReached(world, point.id));
  if (next && next.id !== 0 && loomCheckpointReached(world, next.id)) enterRest(world, next.id as RestRoomId);
}

export function updateFragilePlatforms(world: WorldState, landedPlatformId: string | undefined, now: number): void {
  if (doomForm(world.save.doom) === 'foom' && landedPlatformId) {
    const platform = world.chapter.platforms.find(item => item.id === landedPlatformId);
    if (platform?.fragile && !world.collapseAt[platform.id]) {
      world.collapseAt[platform.id] = now + 750;
      world.events.push({ type: 'notice', message: '平台即将崩塌！离开红色裂纹平台。' });
    }
  }
  Object.entries(world.collapseAt).forEach(([id, deadline]) => {
    if (deadline <= now && !world.collapsed.includes(id)) world.collapsed.push(id);
  });
}
