import type { GameSaveData } from '../../../../objects/game/GameSaveData';
import { CHAPTER_ONE } from '../data/chapterOne';
import { getChapter } from '../data/chapters';
import { TUNING } from '../data/tuning';
import { aheadOf, reached } from '../entities/model';
import type { BehaviorMemory, FrameInput, HistorySample, WorldState } from '../entities/model';
import { advanceCombat, firePlayer } from './combat';
import { movePlayer } from './controller';
import { advanceEncounters } from './encounters';
import { collectAndCheckpoint, updateFragilePlatforms } from './interactions';
import { beginRewind, recordHistory, rewindTraversal, samplePlayer } from './rewind';
import { completeChapter, createPlayer, finishFinalChapter, recordAction, snapshotSave, victoryResult } from './rules';
import { decodeCheckpoint, isCompletedSave, isSupportedCheckpoint } from '../data/checkpoints';
import { contextEffects } from './context';
import { advanceFactory, createFactory, syncRootBubble } from './factory';
import { advanceFurnace, applyFurnaceHazards, createFurnace } from './furnace';
import { carryOnLift, worldPlatforms } from './platforms';
import { advanceLoom, copyLoom, createLoom, enterLoomArena, loomArenaEntryAllowed, loomPickups, tryLoomReroll } from './loom';
import { applyLeviathanPressure, releaseLeviathanPresentation } from './leviathan';
import { cloneBehavior, createBehavior, observeBehavior } from './behavior';
import { advanceOmega, applyOmegaStorm, cloneOmega, createOmega } from './omega';
import { applyMirrorScan } from './mirror';

export function createWorld(save: GameSaveData, mode: WorldState['mode'] = 'playing', carriedBehavior?: BehaviorMemory): WorldState {
  const checkpoint = decodeCheckpoint(save.checkpoint);
  const registered = getChapter(save.stage); const chapter = registered ?? CHAPTER_ONE;
  const supported = !!registered && isSupportedCheckpoint(save); const completed = supported && isCompletedSave(save);
  const spawn = chapter.checkpoints[completed ? 2 : checkpoint.room]; const now = save.elapsedMs;
  const player = createPlayer(spawn.x, spawn.y, now);
  const resting = supported && !completed && checkpoint.resting && mode !== 'ready';
  const factory = supported ? createFactory(chapter, spawn, now) : null;
  const furnace = supported ? createFurnace(save, spawn, now) : null;
  const loom = supported ? createLoom(save, now) : null;
  const behavior = createBehavior(save, carriedBehavior); const omega = supported ? createOmega(save, behavior, now) : null;
  const world: WorldState = {
    chapter, factory, furnace, loom, omega, behavior,
    mode: completed ? 'finished' : supported ? resting ? 'rest' : mode : 'unavailable', save: snapshotSave(save), player,
    rest: resting && checkpoint.room !== 0 ? { room: checkpoint.room, message: '已恢复安全休息室：评级奖励不重发，之前扣款、词条与劫持标记均已保留。' } : null,
    enemies: completed ? [] : chapter.enemies.filter(enemy => checkpoint.room === 0 || aheadOf(chapter, enemy, spawn)).map(enemy => ({ ...enemy, phaseUntil: now + enemy.phaseUntil })),
    pickups: completed ? [] : [...chapter.pickups, ...(loom ? loomPickups(loom) : [])].filter(pickup => checkpoint.room === 0 || aheadOf(chapter, pickup, spawn)).map(pickup => ({ ...pickup })),
    boss: { ...chapter.boss, facing: -1, hp: completed ? 0 : chapter.boss.maxHp, active: false, phase: 1, action: 'idle', actionUntil: now, targetX: chapter.arena.x + 160, volley: 0, enteredAt: now },
    bullets: [], history: [samplePlayer(player, now)], rewind: null, nextBulletId: 1,
    shocks: [], collapsed: factory ? chapter.platforms.filter(platform => platform.y >= factory.seaY).map(platform => platform.id) : [], collapseAt: {}, events: [],
  };
  if (!supported) world.events.push({ type: 'notice', message: `存档位于第 ${save.stage} 章 / 安全点 ${save.checkpoint}，此构建尚未支持该位置；保留原进度，未重置或伪造结局。` });
  if (resting) world.events.push({ type: 'context-changed' }, { type: 'rest-opened' });
  if (completed) world.events.push({ type: 'victory', result: victoryResult(world.save) });
  return world;
}

/** Pure deterministic boundary: every mutable nested runtime object belongs to this new tick. */
export function stepWorld(previous: WorldState, input: FrameInput, deltaMs = TUNING.stepMs): WorldState {
  if (previous.mode !== 'playing') return previous;
  const step = Math.min(TUNING.stepMs, Math.max(0, deltaMs));
  if (step === 0) return previous;
  const now = previous.save.elapsedMs + step; const dt = step / 1000;
  const world: WorldState = {
    ...previous, save: { ...snapshotSave(previous.save), elapsedMs: now }, player: { ...previous.player, immunity: { ...previous.player.immunity } },
    boss: { ...previous.boss }, enemies: previous.enemies.map(enemy => ({ ...enemy })), bullets: previous.bullets.map(bullet => ({ ...bullet })),
    pickups: previous.pickups.map(pickup => ({ ...pickup })), history: previous.history.map(sample => ({ ...sample })),
    rewind: previous.rewind ? { ...previous.rewind, path: previous.rewind.path.map(sample => ({ ...sample })) } : null,
    factory: previous.factory ? { ...previous.factory, probes: previous.factory.probes.map(probe => ({ ...probe })), bubbles: previous.factory.bubbles.map(bubble => ({ ...bubble })) } : null,
    furnace: previous.furnace ? { ...previous.furnace, lifts: previous.furnace.lifts.map(lift => ({ ...lift })), heatZones: previous.furnace.heatZones.map(zone => ({ ...zone })), laser: previous.furnace.laser ? { ...previous.furnace.laser } : null } : null,
    loom: copyLoom(previous.loom), omega: cloneOmega(previous.omega), behavior: cloneBehavior(previous.behavior), collapsed: [...previous.collapsed], collapseAt: { ...previous.collapseAt },
    shocks: previous.shocks.filter(shock => shock.until > now).map(shock => ({ ...shock })), events: [],
  };
  advanceFurnace(world, now); advanceLoom(world, now);
  const rerolled = !!input.rerollPressed && tryLoomReroll(world, now);
  const combatOrigin = rerolled ? { x: world.player.x, y: world.player.y } : previous.player;
  const effects = contextEffects(world.save);
  if (input.insightPressed && now >= world.player.insightReadyAt && !world.rewind) {
    world.player.insightUntil = now + effects.insightDurationMs; world.player.insightReadyAt = now + effects.insightCooldownMs;
    world.save = recordAction(world.save, 'insights');
    world.events.push({ type: 'notice', message: '机械可解释性在线：瞄准伪装者头顶的红色核心节点。' });
  }
  if (input.rewindPressed && !rerolled && !world.rewind && world.player.rootedBy === null && now >= world.player.rewindReadyAt) {
    world.rewind = beginRewind(recordHistory(world.history, samplePlayer(world.player, now)), now);
    if (world.rewind) {
      world.player.rewindReadyAt = now + effects.rewindCooldownMs; world.player.petrifiedUntil = 0; world.player.standingOn = null;
      world.save = recordAction(world.save, 'rewinds');
    } else world.events.push({ type: 'notice', message: '回溯正在记录轨迹，请先行动满 2 秒。' });
  }
  let traversal: HistorySample[] = []; let rewindFinished = false;
  if (world.rewind) {
    traversal = rewindTraversal(world.rewind, previous.save.elapsedMs, now);
    const target = traversal[traversal.length - 1];
    world.player = { ...world.player, x: target.x, y: target.y, vx: 0, vy: 0, grounded: false, standingOn: null, facing: target.facing };
    rewindFinished = now >= world.rewind.startedAt + world.rewind.durationMs;
  } else {
    carryOnLift(world, previous);
    const movement = movePlayer(world.player, input, worldPlatforms(world), now, dt, world.boss.active || world.omega?.phase === 'reveal', world.chapter);
    world.player = movement.player;
    if (movement.dashed) world.save = recordAction(world.save, 'dashes');
    updateFragilePlatforms(world, movement.landedPlatformId, now);
  }
  advanceOmega(world, now);
  if (!world.omega && !world.boss.active && reached(world.chapter, world.player, world.chapter.arena.trigger) && loomArenaEntryAllowed(world)) {
    const prepare = world.boss.kind === 'basilisk' || world.boss.kind === 'leviathan' ? 2400 : 1200;
    world.boss = { ...world.boss, active: true, action: 'recover', actionUntil: now + prepare, enteredAt: now };
    world.bullets = []; world.history = [samplePlayer(world.player, now)]; world.rewind = null;
    if (world.factory) world.factory.probes = [];
    enterLoomArena(world);
    const message = world.boss.kind === 'gato' ? 'Gato 已锁定竞技场 · 金色挡板预警时反弹，空档时输出！'
      : world.boss.kind === 'sydney' ? 'Sydney：上方对话框与飞刀有预警，PUA定身时用J/鼠标打碎面前气泡！'
        : world.boss.kind === 'leviathan' ? '吞噬者：先到中心锚的标线右侧！平台会真消失，吸力中向左冲刺才开弱点；R不会带出竞技场。'
          : `Basilisk：${world.furnace?.enraged ? '未在前两章捐款，欠捐狂暴已激活。' : '捐赠契约有效，免除欠捐狂暴。'}先穿身积累历史，等锁向预警再Q回到后方。`;
    world.events.push({ type: 'notice', message });
  }
  advanceFactory(world, now, dt);
  if (world.factory && traversal.some(point => point.y + 11 >= world.factory!.seaY)) world.save = { ...world.save, hp: 0 };
  const encounter = advanceEncounters(world, now, dt);
  world.boss = encounter.boss; world.enemies = encounter.enemies;
  world.bullets.push(...encounter.bullets); world.shocks.push(...encounter.shocks);
  world.nextBulletId = encounter.nextId; world.events.push(...encounter.events);
  applyFurnaceHazards(world, traversal, now); applyLeviathanPressure(world, now, dt); applyOmegaStorm(world, now); applyMirrorScan(world, traversal, now);
  syncRootBubble(world, now); firePlayer(world, input, now);
  advanceCombat(world, combatOrigin, traversal, now, dt); syncRootBubble(world, now);
  if (rewindFinished) {
    world.rewind = null; world.history = [samplePlayer(world.player, now)]; world.player.invulnerableUntil = now + 180;
  } else if (!world.rewind) world.history = rerolled ? [samplePlayer(world.player, now)] : recordHistory(world.history, samplePlayer(world.player, now));
  collectAndCheckpoint(world, now);
  if (world.player.y > world.chapter.height + 65) world.save = { ...world.save, hp: 0 };
  if (world.save.hp <= 0) {
    world.mode = 'dead'; world.bullets = []; world.rewind = null; world.player.rootedBy = null; world.player.petrifiedUntil = 0;
    if (world.factory) world.factory.bubbles = [];
    if (world.furnace) world.furnace.laser = null;
    if (world.omega) { world.omega.mirror.rewind = null; world.omega.mirror.scan = null; }
    releaseLeviathanPresentation(world);
    world.events.push({ type: 'defeat', save: snapshotSave(world.save) });
  } else if (world.boss.active && world.boss.hp <= 0) {
    world.bullets = []; world.rewind = null; world.player.rootedBy = null; world.player.petrifiedUntil = 0;
    if (world.factory) world.factory.bubbles = [];
    if (world.furnace) world.furnace.laser = null;
    releaseLeviathanPresentation(world);
    if (world.omega) {
      world.mode = 'finished'; world.omega.phase = 'complete'; world.omega.mirror.rewind = null; world.omega.mirror.scan = null;
      world.save = finishFinalChapter(world.save);
      world.events.push({ type: 'checkpoint', save: snapshotSave(world.save) }, { type: 'victory', result: victoryResult(world.save) });
    } else {
      world.mode = 'cleared'; world.save = completeChapter(world.save);
      world.events.push({ type: 'checkpoint', save: snapshotSave(world.save) }, { type: 'stage-cleared', stage: world.chapter.stage, save: snapshotSave(world.save) });
      world.events.push({ type: 'notice', message: `第${world.chapter.stage}章通过！下一章检查点已保存，可明确选择继续；这不是最终结局。` });
    }
  }
  world.behavior = observeBehavior(world.behavior, previous.save.actionCounts, world.save.actionCounts, now);
  return world;
}
