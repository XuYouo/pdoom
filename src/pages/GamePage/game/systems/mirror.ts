import type { GameSaveData } from '../../../../objects/game/GameSaveData';
import { CHAPTER_FIVE } from '../data/chapterFive';
import { TUNING } from '../data/tuning';
import { EMPTY_INPUT, playerRect } from '../entities/model';
import type { BehaviorAction, BehaviorMemory, Bullet, HistorySample, MirrorState, WorldEvent, WorldState } from '../entities/model';
import { cloneMirrorProfile, emptyActionCounts, mirrorProfile } from './behavior';
import { movePlayer } from './controller';
import { normalizedToward, overlaps, segmentHitsRect } from './geometry';
import { worldPlatforms } from './platforms';
import { absorbAttack, beginRewind, recordHistory, rewindTraversal, samplePlayer } from './rewind';
import { bossPhase, createPlayer } from './rules';
import { hurt } from './combat';

export const MIRROR_RULES = { historyLimit: 128, prepareMs: 2200, recoverMs: 3000, shotMs: 620, dashMs: 200, scanMs: 740 } as const;
export function createMirror(save: GameSaveData, behavior: BehaviorMemory, now: number): MirrorState {
  const actor = createPlayer(CHAPTER_FIVE.boss.x, CHAPTER_FIVE.boss.y, now); actor.facing = -1;
  return { actor, previous: { x: actor.x, y: actor.y }, history: [samplePlayer(actor, now)], rewind: null, traversal: [], state: 'idle', until: now,
    plan: [], index: 0, action: null, actionBase: 0, completedCombos: 0, completedInPhase: 0, executed: emptyActionCounts(),
    profile: mirrorProfile(save, behavior), target: { x: actor.x, y: actor.y }, scan: null };
}
export function cloneMirror(mirror: MirrorState): MirrorState {
  return { ...mirror, actor: { ...mirror.actor, immunity: { ...mirror.actor.immunity } }, previous: { ...mirror.previous }, target: { ...mirror.target },
    history: mirror.history.map(sample => ({ ...sample })), traversal: mirror.traversal.map(sample => ({ ...sample })),
    rewind: mirror.rewind ? { ...mirror.rewind, path: mirror.rewind.path.map(sample => ({ ...sample })) } : null,
    plan: [...mirror.plan], executed: { ...mirror.executed }, profile: cloneMirrorProfile(mirror.profile), scan: mirror.scan ? { ...mirror.scan, rect: { ...mirror.scan.rect } } : null };
}
export function recordMirrorHistory(history: readonly HistorySample[], sample: HistorySample): HistorySample[] {
  const last = history[history.length - 1];
  const sameBucket = last && Math.floor(last.at / TUNING.stepMs) === Math.floor(sample.at / TUNING.stepMs);
  return recordHistory(sameBucket ? history.slice(0, -1) : history, sample).slice(-MIRROR_RULES.historyLimit);
}
const direction = (dx: number): -1 | 1 => dx >= 0 ? 1 : -1;
function readyAt(mirror: MirrorState, action: BehaviorAction): number {
  if (action === 'rewinds') return Math.max(mirror.actor.rewindReadyAt, (mirror.history[0]?.at ?? 0) + TUNING.rewindWindowMs);
  if (action === 'insights') return mirror.actor.insightReadyAt;
  if (action === 'dashes') return mirror.actor.dashReadyAt;
  return mirror.actor.shotReadyAt;
}
function tell(world: WorldState, mirror: MirrorState, now: number, events: WorldEvent[]) {
  mirror.state = 'tell'; mirror.action = mirror.plan[mirror.index]; mirror.target = { x: world.player.x, y: world.player.y };
  mirror.until = Math.max(now + 780 - world.boss.phase * 80, readyAt(mirror, mirror.action));
  events.push({ type: 'notice', message: `镜像预警 ${mirror.index + 1}/${mirror.plan.length}：${mirror.action} · ${mirror.profile.source === 'counts-only' ? '只有真实频次，尚无有序连招' : '实际观察到的连招'}；执行后有反击窗口。` });
}
function selectPlan(world: WorldState, mirror: MirrorState, now: number, events: WorldEvent[]) {
  mirror.profile = mirrorProfile(world.save, world.behavior); mirror.plan = [...mirror.profile.combo]; mirror.index = 0;
  tell(world, mirror, now, events);
}
function startAction(mirror: MirrorState, now: number): boolean {
  const action = mirror.action!; mirror.actionBase = mirror.executed[action];
  if (action === 'rewinds') {
    const rewind = beginRewind(recordMirrorHistory(mirror.history, samplePlayer(mirror.actor, now)), now);
    if (!rewind) { mirror.until = now + 100; return false; }
    mirror.rewind = rewind; mirror.actor.rewindReadyAt = now + mirror.profile.rewindCooldownMs;
    mirror.actor.dashUntil = 0; mirror.actor.standingOn = null; mirror.executed.rewinds += 1; mirror.until = now + rewind.durationMs;
  } else if (action === 'insights') {
    mirror.actor.insightUntil = now + mirror.profile.insightDurationMs; mirror.actor.insightReadyAt = now + mirror.profile.insightCooldownMs;
    const radius = mirror.profile.coreRadius;
    mirror.scan = { rect: { x: mirror.target.x - 20 - radius, y: mirror.target.y - 15 - radius, w: 40 + radius * 2, h: 30 + radius * 2 }, at: now + 420, until: now + 700, hit: false };
    mirror.executed.insights += 1; mirror.until = now + MIRROR_RULES.scanMs;
  } else mirror.until = now + (action === 'shots' ? MIRROR_RULES.shotMs : MIRROR_RULES.dashMs);
  mirror.state = 'execute'; return true;
}

/** Decision/telegraph is separate from the actual shared player-sized kinematic motor. */
export function advanceMirror(world: WorldState, now: number, dt = TUNING.stepMs / 1000) {
  const boss = { ...world.boss }; const mirror = world.omega?.mirror;
  const bullets: Bullet[] = []; const events: WorldEvent[] = []; let nextId = world.nextBulletId;
  if (!mirror || world.omega?.phase !== 'duel' || !boss.active || boss.hp <= 0) return { boss, bullets, events, nextId };
  const phase = bossPhase(boss.hp, boss.maxHp);
  if (phase !== boss.phase) {
    boss.phase = phase; world.boss = boss; mirror.completedInPhase = 0; mirror.state = 'idle'; mirror.until = now + 1000;
    mirror.action = null; mirror.plan = []; mirror.scan = null;
    events.push({ type: 'notice', message: `镜像第${phase}阶段：根据你的新行为重新学习，必须观察真实执行后的反击窗口。` });
  }
  mirror.previous = { x: mirror.actor.x, y: mirror.actor.y }; mirror.traversal = [];
  if (mirror.scan && now > mirror.scan.until) mirror.scan = null;
  if ((mirror.state === 'idle' || mirror.state === 'recover') && now >= mirror.until) selectPlan(world, mirror, now, events);
  let started = false;
  if (mirror.state === 'tell' && now >= mirror.until) started = startAction(mirror, now);
  const actor = mirror.actor;
  let move: -1 | 0 | 1 = 0;
  if (mirror.state === 'idle' && Math.abs(actor.x - world.player.x) < 180) move = direction(actor.x - world.player.x);
  if (mirror.state === 'execute' && mirror.action === 'shots' && Math.abs(world.player.x - actor.x) > 4) move = direction(world.player.x - actor.x);
  if (mirror.state === 'execute' && mirror.action === 'dashes') move = started ? direction(mirror.target.x - actor.x) : actor.facing;
  if (mirror.rewind) {
    mirror.traversal = rewindTraversal(mirror.rewind, now - dt * 1000, now);
    const target = mirror.traversal[mirror.traversal.length - 1];
    mirror.actor = { ...actor, x: target.x, y: target.y, facing: target.facing, vx: 0, vy: 0, grounded: false, standingOn: null };
    if (now >= mirror.rewind.startedAt + mirror.rewind.durationMs) { mirror.rewind = null; mirror.history = [samplePlayer(mirror.actor, now)]; }
  } else {
    const movement = movePlayer(actor, { ...EMPTY_INPUT, move, dashPressed: started && mirror.action === 'dashes' }, worldPlatforms(world), now, dt, true, world.chapter);
    mirror.actor = movement.player; if (movement.dashed) mirror.executed.dashes += 1;
    mirror.history = recordMirrorHistory(mirror.history, samplePlayer(mirror.actor, now));
  }
  if (mirror.state === 'execute' && mirror.action === 'shots' && now >= mirror.actor.shotReadyAt && world.bullets.length + bullets.length < TUNING.maxBullets) {
    const hallucination = mirror.profile.hallucinationEvery !== null && (mirror.executed.shots + 1) % mirror.profile.hallucinationEvery === 0;
    const critical = mirror.actor.criticalCharges > 0 && !hallucination;
    const origin = { x: mirror.actor.x, y: mirror.actor.y - 3 };
    const target = now < mirror.actor.insightUntil ? world.player : mirror.target;
    const velocity = normalizedToward(origin, target, 150 + boss.phase * 15);
    bullets.push({ id: nextId++, ...origin, vx: velocity.x, vy: velocity.y, radius: critical ? 4 : 3,
      damage: hallucination ? 0 : Math.min(24, Math.round((8 + boss.phase) * mirror.profile.damageMultiplier * (critical ? mirror.profile.criticalMultiplier : 1))),
      faction: 'enemy', kind: 'mirror', critical, harmless: hallucination, ...(hallucination ? { glyph: '(' as const } : {}), expiresAt: now + 2400 });
    mirror.executed.shots += 1; mirror.actor.shotReadyAt = now + mirror.profile.fireIntervalMs;
    if (critical) mirror.actor.criticalCharges -= 1;
  }
  if (mirror.state === 'execute' && now >= mirror.until && !mirror.rewind) {
    if (mirror.executed[mirror.action!] <= mirror.actionBase) mirror.until = now + TUNING.stepMs;
    else if (mirror.index + 1 < mirror.plan.length) { mirror.index += 1; tell(world, mirror, now, events); }
    else {
      mirror.completedCombos += 1; mirror.completedInPhase += 1; mirror.state = 'recover'; mirror.action = null; mirror.until = now + MIRROR_RULES.recoverMs;
      events.push({ type: 'notice', message: '镜像真实连招已执行完毕 · 现在反击！本阶段不能被一次高伤害跳过。' });
    }
  }
  boss.x = mirror.actor.x; boss.y = mirror.actor.y; boss.facing = mirror.actor.facing;
  boss.action = mirror.state === 'tell' ? 'tell' : mirror.state === 'execute' ? 'attack' : 'recover'; boss.actionUntil = mirror.until;
  return { boss, bullets, events, nextId };
}
export function applyMirrorScan(world: WorldState, traversal: readonly HistorySample[], now: number): void {
  const mirror = world.omega?.mirror; const scan = mirror?.scan;
  if (!mirror || !scan || scan.hit || now < scan.at || now > scan.until || world.omega?.phase !== 'duel') return;
  if (world.rewind && traversal.some((point, index) => index > 0 && segmentHitsRect(traversal[index - 1], point, scan.rect, 8))) {
    world.player = absorbAttack(world.player, 'impact', now); scan.hit = true;
  } else if (overlaps(playerRect(world.player), scan.rect)) { hurt(world, 18 * mirror.profile.damageMultiplier, now, 'impact'); scan.hit = true; }
}
