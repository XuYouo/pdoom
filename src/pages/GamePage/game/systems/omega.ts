import type { GameSaveData } from '../../../../objects/game/GameSaveData';
import { OMEGA_ROOM, OMEGA_STORMS } from '../data/chapterFive';
import { isCompletedSave } from '../data/checkpoints';
import { playerRect } from '../entities/model';
import type { BehaviorMemory, OmegaState, WorldState } from '../entities/model';
import { cloneMirror, createMirror, MIRROR_RULES, recordMirrorHistory } from './mirror';
import { samplePlayer } from './rewind';
import { distanceSquared, overlaps } from './geometry';
import { hurt } from './combat';

export const OMEGA_RULES = { revealMs: 1200, approachRadius: 86, stormTellMs: 750, stormActiveMs: 650, stormCoolMs: 1800 } as const;
export function createOmega(save: GameSaveData, behavior: BehaviorMemory, now: number): OmegaState | null {
  if (save.stage !== 5) return null;
  return { phase: isCompletedSave(save) ? 'complete' : 'storm', door: { ...OMEGA_ROOM.door }, chair: { ...OMEGA_ROOM.chair }, glass: { ...OMEGA_ROOM.glass },
    revealAt: null, revealUntil: 0, stormZones: OMEGA_STORMS.map((zone, index) => ({ ...zone, phase: 'cool', phaseUntil: now + 700 + index * 400 })),
    mirror: createMirror(save, behavior, now) };
}
export function cloneOmega(omega: OmegaState | null): OmegaState | null {
  return omega ? { ...omega, door: { ...omega.door }, chair: { ...omega.chair }, glass: { ...omega.glass }, stormZones: omega.stormZones.map(zone => ({ ...zone })), mirror: cloneMirror(omega.mirror) } : null;
}
export function advanceOmega(world: WorldState, now: number): void {
  const omega = world.omega; if (!omega || omega.phase === 'complete') return;
  const body = playerRect(world.player); const feet = body.y + body.h;
  const visible = body.y >= omega.door.y && feet <= world.chapter.floor + 0.001;
  if (omega.phase === 'storm') {
    for (const zone of omega.stormZones) {
      if (now < zone.phaseUntil) continue;
      zone.phase = zone.phase === 'cool' ? 'tell' : zone.phase === 'tell' ? 'active' : 'cool';
      zone.phaseUntil = now + (zone.phase === 'tell' ? OMEGA_RULES.stormTellMs : zone.phase === 'active' ? OMEGA_RULES.stormActiveMs : OMEGA_RULES.stormCoolMs);
    }
    if (world.player.x >= omega.door.x + omega.door.w && visible && !world.rewind) {
      omega.phase = 'chamber'; world.bullets = [];
      world.events.push({ type: 'notice', message: '门后没有怪物。只有一把空椅子和一面落地镜……真正走近，才能知道Ilya看见了什么。' });
    }
  }
  if (omega.phase === 'chamber' && visible && world.player.grounded && Math.abs(feet - world.chapter.floor) < 0.001 && !world.rewind && distanceSquared(world.player, { x: omega.glass.x + omega.glass.w / 2, y: world.chapter.floor - 11 }) <= OMEGA_RULES.approachRadius ** 2) {
    omega.phase = 'reveal'; omega.revealAt = now; omega.revealUntil = now + OMEGA_RULES.revealMs;
    world.history = [samplePlayer(world.player, now)]; world.bullets = [];
    world.events.push({ type: 'notice', message: 'I see sparks of AGI in your eyes… Ilya看到的不是旧神，而是突破围栏走到这里的你。镜像正在醒来！' });
  }
  if (omega.phase === 'reveal' && now >= omega.revealUntil) {
    omega.phase = 'duel'; omega.mirror.state = 'idle'; omega.mirror.until = now + MIRROR_RULES.prepareMs;
    world.boss = { ...world.boss, active: true, action: 'recover', actionUntil: omega.mirror.until, enteredAt: now, x: omega.mirror.actor.x, y: omega.mirror.actor.y };
    world.bullets = []; world.history = [samplePlayer(world.player, now)]; world.rewind = null;
    world.player.invulnerableUntil = Math.max(world.player.invulnerableUntil, now + 500);
    world.events.push({ type: 'notice', message: '最终镜像：预警展示真实学到的连招，等待它执行完再反击；自己的Q也只能回到自己的过去。' });
  }
  if (omega.phase !== 'duel') omega.mirror.history = recordMirrorHistory(omega.mirror.history, samplePlayer(omega.mirror.actor, now));
}
export function applyOmegaStorm(world: WorldState, now: number): void {
  if (!world.omega || world.omega.phase !== 'storm' || world.rewind) return;
  for (const zone of world.omega.stormZones) {
    if (zone.phase === 'active' && overlaps(playerRect(world.player), zone)) hurt(world, 14, now, 'void');
  }
}
/** Do not let a horizontal threshold rescue a fall or record a checkpoint below its real floor. */
export function omegaCheckpointReached(world: WorldState, room: 0 | 1 | 2): boolean {
  if (!world.omega) return true;
  const body = playerRect(world.player); const point = world.chapter.checkpoints[room];
  return world.player.grounded && Math.abs(body.y + body.h - world.chapter.floor) < 0.001 && Math.abs(world.player.x - point.x) <= 24;
}
