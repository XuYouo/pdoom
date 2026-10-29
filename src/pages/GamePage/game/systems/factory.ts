import { BUBBLE_RADIUS, PLAYER_HEIGHT, PROBE_RADIUS } from '../entities/model';
import type { ChapterDefinition, FactoryState, Vec2, WorldState } from '../entities/model';
import { approach, clamp, distanceSquared } from './geometry';

export const FACTORY_LIMITS = { probeCap: 6, probeHp: 24, bubbleHp: 24, replicateMs: 6200, tellMs: 1800, riseSpeed: 52 } as const;

export function createFactory(chapter: ChapterDefinition, spawn: Vec2, now: number): FactoryState | null {
  if (chapter.stage !== 2) return null;
  const probes = [{ x: 80, y: 1650 }, { x: 550, y: 1100 }, { x: 80, y: 550 }]
    .filter(point => point.y < spawn.y).map((point, index) => ({ ...point, id: index + 1, hp: FACTORY_LIMITS.probeHp, targetPlatformId: null, phase: 'seek' as const, phaseUntil: now }));
  return { seaY: spawn.y + 165, riseSpeed: FACTORY_LIMITS.riseSpeed, probes, bubbles: [], nextProbeId: probes.length + 1, nextBubbleId: 1, nextReplicateAt: now + FACTORY_LIMITS.replicateMs };
}

/** Circle CCD, using the exact radii exported to the renderer. */
export function segmentHitsCircle(from: Vec2, to: Vec2, center: Vec2, radius: number): boolean {
  const dx = to.x - from.x; const dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((center.x - from.x) * dx + (center.y - from.y) * dy) / length, 0, 1) : 0;
  return distanceSquared({ x: from.x + dx * t, y: from.y + dy * t }, center) <= radius * radius;
}

/** Moves only the detached draft. Sea contact bypasses dash, Q and ordinary damage immunity. */
export function advanceFactory(world: WorldState, now: number, dt: number): void {
  const factory = world.factory;
  if (!factory) return;
  factory.seaY = Math.max(world.chapter.arena.y + world.chapter.arena.h + 20, factory.seaY - factory.riseSpeed * dt);
  world.pickups = world.pickups.filter(item => item.y < factory.seaY);
  world.enemies = world.enemies.filter(item => item.y + 12 < factory.seaY);
  world.bullets = world.bullets.filter(item => item.y + item.radius < factory.seaY);
  world.chapter.platforms.forEach(platform => {
    if (platform.y >= factory.seaY && !world.collapsed.includes(platform.id)) world.collapsed.push(platform.id);
  });
  if (world.player.y + PLAYER_HEIGHT / 2 >= factory.seaY) {
    world.save = { ...world.save, hp: 0 };
    world.events.push({ type: 'notice', message: '回形针海触及即死：冲刺、Q和弹幕免疫都不能抵抗金属拆解。' });
  }
  factory.probes = factory.probes.filter(probe => probe.hp > 0 && probe.y + PROBE_RADIUS < factory.seaY);
  if (world.boss.active) return;
  const claimed = new Set(factory.probes.map(probe => probe.targetPlatformId));
  factory.probes.forEach(probe => {
    if (Math.abs(probe.y - world.player.y) > 390) return;
    if (probe.phase === 'seek' && now >= probe.phaseUntil) {
      const target = world.chapter.platforms.filter(platform => platform.oneWay && !platform.protected && !world.collapsed.includes(platform.id) && !claimed.has(platform.id) && Math.abs(platform.y - world.player.y) < 320)
        .sort((a, b) => Math.abs(a.y - world.player.y) - Math.abs(b.y - world.player.y))[0];
      if (target) {
        probe.targetPlatformId = target.id; claimed.add(target.id); probe.phase = 'tell'; probe.phaseUntil = now + FACTORY_LIMITS.tellMs;
        world.events.push({ type: 'notice', message: '探针锁定侧路平台：1.8秒红色预警后吞噬。射击探针可阻止；绿色主路仍安全。' });
      }
    }
    const target = world.chapter.platforms.find(platform => platform.id === probe.targetPlatformId);
    if (target) {
      probe.x = approach(probe.x, target.x + target.w / 2, 180 * dt);
      probe.y = approach(probe.y, target.y - 22, 180 * dt);
    }
    if (probe.phase === 'tell' && now >= probe.phaseUntil) {
      if (target && !target.protected && !world.collapsed.includes(target.id)) {
        world.collapsed.push(target.id); world.collapseAt[target.id] = now;
      }
      probe.phase = 'consume'; probe.phaseUntil = now + 500;
    } else if (probe.phase === 'consume' && now >= probe.phaseUntil) {
      probe.phase = 'seek'; probe.targetPlatformId = null; probe.phaseUntil = now + 450;
    }
  });
  if (now >= factory.nextReplicateAt) {
    factory.nextReplicateAt = now + FACTORY_LIMITS.replicateMs;
    const parent = factory.probes.find(probe => probe.hp > 0 && Math.abs(probe.y - world.player.y) < 390);
    if (parent && factory.probes.length < FACTORY_LIMITS.probeCap) {
      factory.probes.push({ id: factory.nextProbeId++, x: clamp(parent.x + 28, 20, world.chapter.width - 20), y: parent.y - 24, hp: FACTORY_LIMITS.probeHp, targetPlatformId: null, phase: 'seek', phaseUntil: now + 900 });
      world.events.push({ type: 'notice', message: '存活探针完成自复制。摧毁全部探针可彻底停止复制，没有凭空刷新的波次。' });
    }
  }
}

/** Root is linked to a live bubble, never a timer. At edges, turn inward for keyboard J. */
export function bindPuaBubble(world: WorldState, now: number): void {
  const factory = world.factory;
  if (!factory || world.player.rootedBy !== null || world.rewind) return;
  const facing = world.player.x > world.chapter.width - 70 ? -1 : world.player.x < 70 ? 1 : world.player.facing;
  const id = factory.nextBubbleId++;
  world.player = { ...world.player, rootedBy: id, facing, vx: 0, vy: 0, dashUntil: 0, jumpUntil: 0 };
  factory.bubbles.push({ id, x: world.player.x + facing * 44, y: world.player.y - 3, hp: FACTORY_LIMITS.bubbleHp, expiresAt: now + 6000, text: '你真正爱的是我！' });
  world.events.push({ type: 'notice', message: 'Sydney PUA定身：不能移动、冲刺或Q；面前气泡可用J/鼠标射碎。边缘已转向场内，气泡不会自动解除！' });
}

export function syncRootBubble(world: WorldState, now: number): void {
  const factory = world.factory;
  if (!factory) return;
  factory.bubbles = factory.bubbles.filter(bubble => bubble.hp > 0 && (bubble.id === world.player.rootedBy || bubble.expiresAt > now));
  const bound = factory.bubbles.find(bubble => bubble.id === world.player.rootedBy);
  if (bound) {
    bound.x = clamp(world.player.x + world.player.facing * 44, BUBBLE_RADIUS + 2, world.chapter.width - BUBBLE_RADIUS - 2);
    bound.y = world.player.y - 3;
  } else if (world.player.rootedBy !== null) {
    world.player = { ...world.player, rootedBy: null };
    world.events.push({ type: 'notice', message: 'PUA气泡已击碎，控制解除。' });
  }
}
