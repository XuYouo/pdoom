import type { GameSaveData } from '../../../../objects/game/GameSaveData';
import { FURNACE_HEAT_ZONES, FURNACE_LIFTS } from '../data/chapterThree';
import { PLAYER_HEIGHT, PLAYER_WIDTH, laserRect, playerRect } from '../entities/model';
import type { FurnaceState, MovingPlatform, Vec2, WorldState } from '../entities/model';
import { overlaps, segmentHitsRect } from './geometry';
import { hurt } from './combat';
import { absorbAttack } from './rewind';
import { isImmune } from './rules';

export const FURNACE_TIMING = { coolMs: 1800, tellMs: 900, activeMs: 900, petrifyMs: 1200, heatDamage: 14 } as const;
const liftY = (lift: MovingPlatform, elapsed: number) => (lift.minY + lift.maxY) / 2 + (lift.maxY - lift.minY) / 2 * Math.cos((elapsed + lift.offsetMs) / lift.periodMs * Math.PI * 2);

export function createFurnace(save: GameSaveData, spawn: Vec2, now: number): FurnaceState | null {
  if (save.stage !== 3) return null;
  return {
    startedAt: now, enraged: !save.donated,
    lifts: FURNACE_LIFTS.filter(lift => lift.x + lift.w > spawn.x).map(lift => ({ ...lift, y: liftY(lift, 0), dy: 0 })),
    heatZones: FURNACE_HEAT_ZONES.filter(zone => zone.x + zone.w > spawn.x).map(zone => ({ ...zone, phase: 'cool', phaseUntil: now + FURNACE_TIMING.coolMs })),
    laser: null,
  };
}

/** Tick-owned draft only. A stopped/rest world never calls this clock. */
export function advanceFurnace(world: WorldState, now: number): void {
  const furnace = world.furnace;
  if (!furnace) return;
  const elapsed = now - furnace.startedAt;
  furnace.lifts.forEach(lift => { const y = liftY(lift, elapsed); lift.dy = y - lift.y; lift.y = y; });
  const { coolMs, tellMs, activeMs } = FURNACE_TIMING;
  const period = coolMs + tellMs + activeMs;
  furnace.heatZones.forEach((zone, index) => {
    const phaseAt = (elapsed + index * 700) % period;
    const end = phaseAt < coolMs ? coolMs : phaseAt < coolMs + tellMs ? coolMs + tellMs : period;
    const phase = phaseAt < coolMs ? 'cool' : phaseAt < coolMs + tellMs ? 'tell' : 'active';
    if (phase === 'tell' && zone.phase !== 'tell' && Math.abs(zone.x - world.player.x) < 380) world.events.push({ type: 'notice', message: 'GPU热区即将升温：橙色预警后才造成伤害，可等冷却或跳跃穿过。' });
    zone.phase = phase; zone.phaseUntil = now + end - phaseAt;
  });
}

export function inBasiliskGaze(world: WorldState, now = world.save.elapsedMs): boolean {
  const laser = world.furnace?.laser;
  return !!laser && laser.phase === 'active' && now < laser.until && overlaps(playerRect(world.player), laserRect(laser)) && (world.boss.x - world.player.x) * world.player.facing > 0;
}

export function applyFurnaceHazards(world: WorldState, traversal: readonly Vec2[], now: number): void {
  const furnace = world.furnace;
  if (!furnace) return;
  furnace.heatZones.forEach(zone => { if (zone.phase === 'active' && overlaps(playerRect(world.player), zone)) hurt(world, FURNACE_TIMING.heatDamage, now, 'gpu'); });
  const laser = furnace.laser;
  if (!laser || laser.phase !== 'active' || now >= laser.until) return;
  const ray = laserRect(laser);
  const swept = { x: ray.x - PLAYER_WIDTH / 2, y: ray.y - PLAYER_HEIGHT / 2, w: ray.w + PLAYER_WIDTH, h: ray.h + PLAYER_HEIGHT };
  if (world.rewind) {
    if (!laser.absorbedByRewind && traversal.some((point, index) => index > 0 && segmentHitsRect(traversal[index - 1], point, swept))) {
      world.player = absorbAttack(world.player, 'causal', now); laser.absorbedByRewind = true;
      world.events.push({ type: 'notice', message: 'Q真实轨迹穿过因果激光：causal免疫10秒，返还暴击。' });
    }
    return;
  }
  if (!laser.hitPlayer && inBasiliskGaze(world, now) && !isImmune(world.player, 'causal', now)) {
    laser.hitPlayer = true;
    world.player = { ...world.player, petrifiedUntil: now + FURNACE_TIMING.petrifyMs, vx: 0, jumpUntil: 0, dashUntil: 0 };
    hurt(world, furnace.enraged ? 22 : 14, now, 'causal');
    world.events.push({ type: 'notice', message: '与因果激光对视：石化1.2秒。Q就绪且有2秒历史时可解除；只回溯原路径，不自动传送。' });
  }
}
