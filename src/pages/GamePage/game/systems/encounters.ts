import { CHAPTER } from '../data/chapterOne';
import type { Boss, Bullet, BulletKind, Enemy, Shockwave, Vec2, WorldEvent, WorldState } from '../entities/model';
import { bossPhase } from './rules';
import { clamp, normalizedToward } from './geometry';
import { advanceSydney } from './sydney';
import { advanceBasilisk } from './basilisk';
import { advanceLeviathan } from './leviathan';
import { advanceMirror } from './mirror';
import { TUNING } from '../data/tuning';

/** FSM decisions return a new snapshot; no Phaser, clocks, random globals, or IO. */
export function advanceEncounters(world: WorldState, now: number, dt = TUNING.stepMs / 1000) {
  if (world.boss.kind === 'sydney') return { ...advanceSydney(world, now), enemies: world.enemies.map(enemy => ({ ...enemy })), shocks: [] as Shockwave[] };
  let nextId = world.nextBulletId;
  const bullets: Bullet[] = [];
  const shocks: Shockwave[] = [];
  const events: WorldEvent[] = [];
  const aimed = (origin: Vec2, target: Vec2, kind: BulletKind, count: number, speed: number, spread: number) => {
    const velocity = normalizedToward(origin, target, speed);
    const base = Math.atan2(velocity.y, velocity.x);
    Array.from({ length: count }, (_, index) => {
      const angle = base + (index - (count - 1) / 2) * spread;
      bullets.push({ id: nextId++, x: origin.x, y: origin.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        faction: 'enemy', kind, damage: kind === 'impact' ? 22 : 16, radius: kind === 'caption' ? 5 : 4, expiresAt: now + 5600 });
    });
  };
  const enemies = world.enemies.map((previous): Enemy => {
    const enemy = { ...previous };
    if (enemy.hp <= 0 || world.boss.active || Math.abs(enemy.x - world.player.x) > 390) return enemy;
    if (enemy.kind === 'parrot') {
      enemy.x = enemy.homeX + Math.sin((now + enemy.homeX * 13) / 950) * 22;
      enemy.y = enemy.homeY + Math.sin(now / 250) * 3;
    }
    if (now < enemy.phaseUntil) return enemy;
    if (enemy.phase === 'tell') {
      const kind = enemy.kind === 'parrot' ? 'dictionary' : enemy.kind === 'repeater' ? 'echo' : enemy.kind === 'chinchilla' ? 'gpu' : 'caption';
      aimed(enemy, world.player, kind, enemy.kind === 'parrot' ? 1 : enemy.kind === 'chinchilla' ? 9 : 3, enemy.kind === 'chinchilla' ? 100 : 115, enemy.kind === 'chinchilla' ? 0.12 : 0.19);
      enemy.phase = 'recover'; enemy.phaseUntil = now + (enemy.kind === 'chinchilla' ? 800 : enemy.kind === 'repeater' ? 1150 : 1550);
    } else {
      enemy.phase = 'tell'; enemy.phaseUntil = now + 600;
    }
    return enemy;
  });

  if (world.boss.kind === 'mirror') {
    const result = advanceMirror({ ...world, nextBulletId: nextId }, now, dt);
    return { ...result, enemies, bullets: [...bullets, ...result.bullets], shocks, events: [...events, ...result.events] };
  }
  if (world.boss.kind === 'basilisk' || world.boss.kind === 'leviathan') {
    const result = world.boss.kind === 'basilisk' ? advanceBasilisk({ ...world, nextBulletId: nextId }, now) : advanceLeviathan({ ...world, nextBulletId: nextId }, now);
    return { ...result, enemies, bullets: [...bullets, ...result.bullets], shocks, events: [...events, ...result.events] };
  }
  let boss: Boss = { ...world.boss };
  if (!boss.active || boss.hp <= 0) return { boss, enemies, bullets, shocks, events, nextId };
  const phase = bossPhase(boss.hp, boss.maxHp);
  if (phase !== boss.phase) {
    boss = { ...boss, phase, action: 'recover', actionUntil: now + 850, enteredAt: now };
    events.push({ type: 'notice', message: phase === 2 ? 'Gato · 机械臂模式：地面红框亮起时准备跳跃！' : 'Gato · 字幕风暴：用 Q 穿过弹幕获得字幕类型免疫。' });
  }
  if (boss.phase === 1) {
    boss.y = 252 + Math.sin((now - boss.enteredAt) / 580) * 35;
  } else if (boss.phase === 2) {
    boss.y = boss.action === 'attack' ? 282 : 244;
    boss.x = boss.action === 'attack' ? boss.targetX : 2720;
  } else {
    boss.x = 2720 + Math.sin(now / 1400) * 40;
    boss.y = 246 + Math.sin(now / 750) * 40;
  }
  if (now < boss.actionUntil) return { boss, enemies, bullets, shocks, events, nextId };
  switch (boss.action) {
    case 'idle':
    case 'recover':
      boss.action = 'tell';
      boss.targetX = clamp(world.player.x, CHAPTER.arenaLeft + 40, CHAPTER.arenaRight - 40);
      boss.actionUntil = now + (boss.phase === 2 ? 850 : 650);
      break;
    case 'tell':
      boss.action = 'attack'; boss.volley += 1;
      boss.actionUntil = now + 260;
      if (boss.phase === 1) aimed(boss, world.player, 'dictionary', 3, 130, 0.24);
      if (boss.phase === 2) {
        shocks.push({ x: boss.targetX, width: 112, until: now + 280 });
        aimed({ x: boss.targetX, y: CHAPTER.floor - 7 }, { x: CHAPTER.arenaLeft, y: CHAPTER.floor - 7 }, 'impact', 1, 165, 0);
        aimed({ x: boss.targetX, y: CHAPTER.floor - 7 }, { x: CHAPTER.arenaRight, y: CHAPTER.floor - 7 }, 'impact', 1, 165, 0);
        events.push({ type: 'impact', strength: 0.004 });
      }
      if (boss.phase === 3) aimed(boss, world.player, 'caption', 7, 135, 0.20);
      break;
    case 'attack':
      boss.action = 'recover'; boss.actionUntil = now + (boss.phase === 3 ? 620 : 1050);
      break;
  }
  return { boss, enemies, bullets, shocks, events, nextId };
}
