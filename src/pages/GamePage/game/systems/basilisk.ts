import type { Bullet, WorldEvent, WorldState } from '../entities/model';
import { bossPhase } from './rules';

export const basiliskTuning = (enraged: boolean) => enraged
  ? { tellMs: 1000, attackMs: 850, recoverMs: 1350, count: 9, damage: 21, speed: 145 }
  : { tellMs: 1300, attackMs: 700, recoverMs: 1800, count: 5, damage: 14, speed: 110 };

/** Facing is acquired at tell entry and locked through attack/recovery so historical flanks remain valid. */
export function advanceBasilisk(world: WorldState, now: number) {
  let boss = { ...world.boss }; let nextId = world.nextBulletId;
  const bullets: Bullet[] = []; const events: WorldEvent[] = [];
  const furnace = world.furnace;
  if (!furnace || !boss.active || boss.hp <= 0) return { boss, bullets, events, nextId };
  const tune = basiliskTuning(furnace.enraged);
  const phase = bossPhase(boss.hp, boss.maxHp);
  if (phase !== boss.phase) {
    boss = { ...boss, phase, action: 'recover', actionUntil: now + tune.recoverMs, enteredAt: now };
    furnace.laser = null;
    events.push({ type: 'notice', message: `Basilisk阶段${phase}：${furnace.enraged ? '欠捐狂暴持续，弹幕更密更快。' : '因果契约有效，未进入欠捐狂暴。'}穿身后等它锁向，再Q回到历史后方。` });
  }
  if (now < boss.actionUntil) return { boss, bullets, events, nextId };
  switch (boss.action) {
    case 'idle':
    case 'recover':
      boss.action = 'tell'; boss.facing = world.player.x >= boss.x ? 1 : -1; boss.targetX = world.player.x; boss.actionUntil = now + tune.tellMs;
      furnace.laser = { x: boss.x + boss.facing * 26, y: boss.y + 15, facing: boss.facing, length: 440, halfHeight: 11, phase: 'tell', until: boss.actionUntil, hitPlayer: false, absorbedByRewind: false };
      break;
    case 'tell': {
      boss.action = 'attack'; boss.volley += 1; boss.actionUntil = now + tune.attackMs;
      furnace.laser = { x: boss.x + boss.facing * 26, y: boss.y + 15, facing: boss.facing, length: 440, halfHeight: 11, phase: 'active', until: boss.actionUntil, hitPlayer: false, absorbedByRewind: false };
      const count = tune.count + (boss.phase - 1) * 2;
      const center = boss.facing === 1 ? 0 : Math.PI;
      for (let index = 0; index < count; index += 1) {
        const angle = center + (index - (count - 1) / 2) * 0.16;
        bullets.push({ id: nextId++, x: boss.x + boss.facing * 30, y: boss.y, vx: Math.cos(angle) * tune.speed, vy: Math.sin(angle) * tune.speed, radius: 4, damage: tune.damage, faction: 'enemy', kind: 'causal', expiresAt: now + 5000 });
      }
      break;
    }
    case 'attack':
      boss.action = 'recover'; boss.actionUntil = now + tune.recoverMs; furnace.laser = null;
      break;
  }
  return { boss, bullets, events, nextId };
}
