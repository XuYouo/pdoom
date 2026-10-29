import { TUNING } from '../data/tuning';
import { BUBBLE_RADIUS, PROBE_RADIUS, bossRect, enemyRect, playerRect } from '../entities/model';
import { segmentHitsCircle, syncRootBubble } from './factory';
import type { Bullet, FrameInput, Vec2, WorldState } from '../entities/model';
import { distanceSquared, normalizedToward, overlaps, segmentHitsRect } from './geometry';
import { absorbBullet, crossesBullet } from './rewind';
import { bossIncomingDamage, bulletSpeedMultiplier, canReflect, damagePlayer, outgoingDamage, recordAction } from './rules';
import { contextEffects, isHallucinationShot } from './context';

/** Functions mutate only the detached next-tick draft owned by stepWorld. */
export function firePlayer(world: WorldState, input: FrameInput, now: number): void {
  const p = world.player;
  if (world.mode !== 'playing' || !input.fire || world.rewind || now < p.petrifiedUntil || now < p.shotReadyAt || world.bullets.length >= TUNING.maxBullets) return;
  const effects = contextEffects(world.save);
  const hallucination = isHallucinationShot(world.save);
  const critical = p.criticalCharges > 0 && !hallucination;
  const target = input.aim ?? { x: p.x + p.facing * 100, y: p.y - 3 };
  const origin = { x: p.x, y: p.y - 3 };
  const velocity = normalizedToward(origin, target, TUNING.bulletSpeed);
  const count = hallucination ? Math.min(3, TUNING.maxBullets - world.bullets.length) : 1;
  Array.from({ length: count }, (_, index) => {
    const angle = Math.atan2(velocity.y, velocity.x) + (hallucination ? (index - 1) * 0.16 : 0);
    world.bullets.push({ id: world.nextBulletId++, x: origin.x, y: origin.y,
      vx: Math.cos(angle) * TUNING.bulletSpeed, vy: Math.sin(angle) * TUNING.bulletSpeed,
      radius: critical ? 4 : 3, damage: hallucination ? 0 : outgoingDamage(world.save.doom, critical, world.save),
      faction: 'player', kind: 'dictionary', critical, harmless: hallucination,
      ...(hallucination ? { glyph: index % 2 ? ')' as const : '(' as const } : {}), expiresAt: now + 1500 });
  });
  if (hallucination) world.events.push({ type: 'notice', message: '注意力发散！本次前向传播变为无伤 Lisp 括号；休息室可调整顺序或扩容。' });
  world.player = { ...p, shotReadyAt: now + effects.fireIntervalMs, criticalCharges: Math.max(0, p.criticalCharges - (critical ? 1 : 0)) };
  world.save = recordAction(world.save, 'shots');
}

export function hurt(world: WorldState, damage: number, now: number, kind?: Bullet['kind']): void {
  if (world.rewind) return;
  const adjustedDamage = damage * contextEffects(world.save).defenseMultiplier;
  const result = damagePlayer(world.player, world.save.hp, adjustedDamage, world.save.doom, now, kind);
  world.player = result.player;
  world.save = { ...world.save, hp: result.hp };
  if (result.hit) world.events.push({ type: 'impact', strength: 0.003 });
}

export function advanceCombat(world: WorldState, previousPlayer: Vec2, traversal: readonly Vec2[], now: number, dt: number): void {
  const survivors: Bullet[] = [];
  const absorbed = new Set<string>();
  const coreRadius = contextEffects(world.save).coreRadius;
  const coreRect = (enemy: Vec2) => ({ x: enemy.x - coreRadius, y: enemy.y - 19 - coreRadius, w: coreRadius * 2, h: coreRadius * 2 });
  world.bullets.forEach(bullet => {
    if (now >= bullet.expiresAt) return;
    const speed = bullet.faction === 'enemy' ? bulletSpeedMultiplier(world.save.doom) : 1;
    const next = { ...bullet, x: bullet.x + bullet.vx * dt * speed, y: bullet.y + bullet.vy * dt * speed };
    if (next.x < -40 || next.x > world.chapter.width + 40 || next.y < -60 || next.y > world.chapter.height + 70) return;
    if (world.factory && next.y + next.radius >= world.factory.seaY) return;
    // Harmless brackets cannot damage bubbles/probes, hit bodies, reflect, or trigger the core rule.
    if (bullet.harmless) { survivors.push(next); return; }
    if (bullet.faction === 'enemy') {
      if (world.rewind && (crossesBullet(traversal, bullet) || crossesBullet(traversal, next))) {
        world.player = absorbBullet(world.player, bullet, now);
        absorbed.add(bullet.kind);
        return;
      }
      const relativeBefore = { x: bullet.x - previousPlayer.x, y: bullet.y - previousPlayer.y };
      const relativeAfter = { x: next.x - world.player.x, y: next.y - world.player.y };
      if (segmentHitsRect(relativeBefore, relativeAfter, playerRect({ x: 0, y: 0 }), bullet.radius)) {
        if (world.rewind) { world.player = absorbBullet(world.player, bullet, now); absorbed.add(bullet.kind); }
        else hurt(world, bullet.damage, now, bullet.kind);
        return;
      }
    } else {
      const mirror = world.boss.kind === 'mirror' && world.boss.active ? world.omega?.mirror : undefined;
      const mirrorRewinding = !!mirror && (!!mirror.rewind || mirror.traversal.length > 0);
      if (mirrorRewinding && (crossesBullet(mirror!.traversal, bullet) || crossesBullet(mirror!.traversal, next))) {
        mirror!.actor.criticalCharges = Math.min(2, mirror!.actor.criticalCharges + 1); return;
      }
      const factory = world.factory;
      if (factory) {
        const bubbleIndex = factory.bubbles.findIndex(bubble => bubble.hp > 0 && segmentHitsCircle(bullet, next, bubble, BUBBLE_RADIUS + bullet.radius));
        if (bubbleIndex >= 0) {
          const bubble = factory.bubbles[bubbleIndex];
          factory.bubbles[bubbleIndex] = { ...bubble, hp: Math.max(0, bubble.hp - bullet.damage) };
          syncRootBubble(world, now);
          return;
        }
        const probeIndex = factory.probes.findIndex(probe => probe.hp > 0 && segmentHitsCircle(bullet, next, probe, PROBE_RADIUS + bullet.radius));
        if (probeIndex >= 0) {
          const probe = factory.probes[probeIndex];
          const hp = Math.max(0, probe.hp - bullet.damage);
          factory.probes[probeIndex] = { ...probe, hp };
          if (hp === 0) world.save = { ...world.save, score: world.save.score + 100, tokens: world.save.tokens + 5 };
          return;
        }
      }
      const enemyIndex = world.enemies.findIndex(enemy => enemy.hp > 0 && (
        segmentHitsRect(bullet, next, enemyRect(enemy), bullet.radius) ||
        (enemy.kind === 'deceiver' && now < world.player.insightUntil && segmentHitsRect(bullet, next, coreRect(enemy), bullet.radius))
      ));
      if (enemyIndex >= 0) {
        const enemy = world.enemies[enemyIndex];
        const core = enemy.kind === 'deceiver' && now < world.player.insightUntil && segmentHitsRect(bullet, next, coreRect(enemy), bullet.radius);
        const hp = core ? 0 : Math.max(0, enemy.hp - bullet.damage);
        world.enemies[enemyIndex] = { ...enemy, hp };
        if (hp === 0) {
          world.save = { ...world.save, score: world.save.score + (core ? 250 : 120), tokens: world.save.tokens + 6 };
          if (core) world.events.push({ type: 'notice', message: '背叛特征节点已击破 · 机械可解释性一击击杀。' });
        }
        return;
      }
      const hitsBoss = mirror ? segmentHitsRect({ x: bullet.x - mirror.previous.x, y: bullet.y - mirror.previous.y },
        { x: next.x - mirror.actor.x, y: next.y - mirror.actor.y }, playerRect({ x: 0, y: 0 }), bullet.radius) : segmentHitsRect(bullet, next, bossRect(world.boss), bullet.radius);
      if (world.boss.active && world.boss.hp > 0 && hitsBoss) {
        // The gold paddle is on Gato's left: flanking it really bypasses reflection.
        if (canReflect(world.boss) && bullet.vx > 0 && bullet.x < world.boss.x) {
          const velocity = normalizedToward(world.boss, world.player, 180);
          survivors.push({ ...next, id: world.nextBulletId++, x: world.boss.x - 32, vx: velocity.x, vy: velocity.y,
            faction: 'enemy', kind: 'dictionary', damage: 18, critical: false, expiresAt: now + 4000 });
        } else {
          const leviathan = world.boss.kind === 'leviathan';
          const open = mirror ? mirror.state === 'recover' && mirror.completedInPhase > 0 && !mirrorRewinding && now >= mirror.actor.dashUntil
            : !leviathan || (world.loom !== null && now < world.loom.turn.weakUntil);
          const raw = bossIncomingDamage(world.boss, bullet.damage, bullet.x);
          const damage = open ? mirror ? Math.round(raw * mirror.profile.defenseMultiplier) : raw : 0;
          // Every phase must contain its actual mechanic, even for extreme critical builds.
          const phaseFloor = (leviathan || mirror) && world.boss.phase < 3 ? world.boss.maxHp * (3 - world.boss.phase) / 3 : 0;
          world.boss = { ...world.boss, hp: Math.max(Math.min(world.boss.hp, phaseFloor), world.boss.hp - damage) };
        }
        return;
      }
    }
    survivors.push(next);
  });
  world.bullets = survivors.slice(0, TUNING.maxBullets);
  if (absorbed.size) world.events.push({ type: 'notice', message: `梯度下降：${[...absorbed].join(' / ')} 类型免疫 10 秒，已返还暴击。` });
  if (world.rewind) return;
  world.enemies.filter(enemy => enemy.hp > 0).forEach(enemy => {
    if (overlaps(playerRect(world.player), enemyRect(enemy))) hurt(world, 17, now);
  });
  const mirrorGhost = world.boss.kind === 'mirror' && !!world.omega && (!!world.omega.mirror.rewind || world.omega.mirror.traversal.length > 0);
  if (world.boss.active && world.boss.hp > 0 && !mirrorGhost && overlaps(playerRect(world.player), bossRect(world.boss))) hurt(world, 24, now);
  world.shocks.forEach(shock => {
    if (now < shock.until && Math.abs(world.player.x - shock.x) < shock.width / 2 + 8 && world.player.y > world.chapter.floor - 35) hurt(world, 24, now, 'impact');
  });
}

export function nearbyPickups(world: WorldState) {
  return world.pickups.filter(pickup => distanceSquared(pickup, world.player) < 24 * 24);
}
