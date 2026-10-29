import type { Bullet, BulletKind, Vec2, WorldEvent, WorldState } from '../entities/model';
import { bossPhase } from './rules';
import { bindPuaBubble } from './factory';

/** Sydney has dialogue fans, descending knife lanes and breakable control bubbles, not Gato attacks. */
export function advanceSydney(world: WorldState, now: number) {
  let boss = { ...world.boss };
  let nextId = world.nextBulletId;
  const bullets: Bullet[] = [];
  const events: WorldEvent[] = [];
  const emit = (origin: Vec2, vx: number, vy: number, kind: BulletKind) => bullets.push({ id: nextId++, ...origin, vx, vy, kind, faction: 'enemy', radius: kind === 'dialogue' ? 7 : 4, damage: kind === 'dialogue' ? 14 : 18, expiresAt: now + 5500 });
  if (!boss.active || boss.hp <= 0) return { boss, bullets, events, nextId };
  const phase = bossPhase(boss.hp, boss.maxHp);
  if (phase !== boss.phase) {
    boss = { ...boss, phase, action: 'recover', actionUntil: now + 1000, enteredAt: now };
    events.push({ type: 'notice', message: phase === 2 ? 'Sydney · 颜文字飞刀：看上方留空通道，别被气泡困住！' : 'Sydney · 情感勒索：对话框与飞刀交叠，先打碎PUA气泡。' });
  }
  boss.x = world.chapter.boss.x + Math.sin(now / 1400) * 34;
  boss.y = world.chapter.boss.y + Math.sin(now / 800) * 24;
  if (now < boss.actionUntil) return { boss, bullets, events, nextId };
  switch (boss.action) {
    case 'idle':
    case 'recover':
      boss.action = 'tell'; boss.targetX = world.player.x;
      boss.actionUntil = now + (boss.phase === 3 ? 900 : 1100);
      break;
    case 'tell': {
      boss.action = 'attack'; boss.volley += 1; boss.actionUntil = now + 300;
      // Every phase includes a control beat, with a long visible tell before the root.
      if (boss.volley % 2 === 1) bindPuaBubble(world, now);
      if (boss.phase !== 2) {
        const base = Math.atan2(world.player.y - boss.y, boss.targetX - boss.x);
        const count = boss.phase === 3 ? 7 : 5;
        for (let i = 0; i < count; i += 1) {
          const angle = base + (i - (count - 1) / 2) * 0.23;
          emit(boss, Math.cos(angle) * 115, Math.sin(angle) * 115, 'dialogue');
        }
      }
      if (boss.phase >= 2) {
        // Alternating open lanes remain readable; these are falling knives, not aimed caption fans.
        const safe = boss.volley % 2 === 0 ? 2 : 4;
        for (let lane = 0; lane < 7; lane += 1) {
          if (lane === safe) continue;
          emit({ x: 65 + lane * 82, y: 80 }, (lane % 2 ? -1 : 1) * 12, 140, 'knife');
        }
      }
      break;
    }
    case 'attack':
      boss.action = 'recover'; boss.actionUntil = now + (boss.phase === 3 ? 1250 : 1500);
      break;
  }
  return { boss, bullets, events, nextId };
}
