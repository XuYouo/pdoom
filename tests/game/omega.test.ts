import { describe, expect, it } from 'vitest';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { CHAPTER_FIVE, OMEGA_ROOM } from '../../src/pages/GamePage/game/data/chapterFive';
import { FINAL_CHECKPOINT, decodeCheckpoint, isCompletedSave, isSupportedCheckpoint } from '../../src/pages/GamePage/game/data/checkpoints';
import { bossRect, EMPTY_INPUT, playerRect } from '../../src/pages/GamePage/game/entities/model';
import type { FrameInput, HistorySample, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { advanceCombat } from '../../src/pages/GamePage/game/systems/combat';
import { endingForDoom, finishFinalChapter } from '../../src/pages/GamePage/game/systems/rules';
import { MIRROR_RULES, recordMirrorHistory } from '../../src/pages/GamePage/game/systems/mirror';
import { sampleAt } from '../../src/pages/GamePage/game/systems/rewind';
import { applyProgressionCommand, transactShop } from '../../src/pages/GamePage/game/systems/shop';

const save = () => ({ ...createRun('8a40b11b-007a-4aa3-9e14-6f1f08825d01', 42), stage: 5 });
function run(world: WorldState, frames: number, input: Partial<FrameInput> = {}) {
  for (let index = 0; index < frames; index += 1) world = stepWorld(world, { ...EMPTY_INPUT, ...input }); return world;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
/** Local mechanism fixtures are distinct from omegaPlaythrough's all-input complete runs. */
function duel(overrides: Partial<ReturnType<typeof save>> = {}) {
  const world = createWorld({ ...save(), checkpoint: 2, ...overrides });
  world.player = { ...world.player, x: 2700, y: 309, grounded: true, standingOn: 'omega-floor-2', invulnerableUntil: 0 };
  world.boss.active = true; world.omega!.phase = 'duel'; world.omega!.mirror.until = 2000;
  return world;
}
function hit(world: WorldState, damage = 12) {
  world.bullets = [{ id: 500, x: world.boss.x - 28, y: world.boss.y, vx: 510, vy: 0, radius: 3, faction: 'player', kind: 'dictionary', damage, expiresAt: 999999 }];
  advanceCombat(world, world.player, [], world.save.elapsedMs, 0.05);
}

describe('Omega geometry, honest reveal and terminal saves', () => {
  it('shares the accepted room coordinates and the exact player-sized mirror collision body', () => {
    expect(CHAPTER_FIVE).toMatchObject({ width: 3200, height: 360, floor: 320, arena: { x: 2540, y: 0, w: 640, h: 360 } });
    expect(OMEGA_ROOM).toEqual({ door: { x: 2480, y: 224, w: 40, h: 96 }, chair: { x: 2800, y: 300 }, glass: { x: 3001, y: 222, w: 48, h: 98 } });
    expect(bossRect({ x: 3025, y: 309, kind: 'mirror' })).toEqual(playerRect({ x: 3025, y: 309 }));
  });
  it('reserves 90 solely for completed stage five without changing ordinary decode semantics', () => {
    expect(FINAL_CHECKPOINT).toBe(90); expect(decodeCheckpoint(90).supported).toBe(false);
    for (const stage of [1, 2, 3, 4]) {
      const saved = { ...save(), stage, checkpoint: 90 }; expect(isCompletedSave(saved)).toBe(false); expect(isSupportedCheckpoint(saved)).toBe(false);
      expect(createWorld(saved)).toMatchObject({ mode: 'unavailable', save: saved });
    }
    for (const checkpoint of [0, 1, 2, 11, 12, 21, 22, 90]) expect(isSupportedCheckpoint({ stage: 5, checkpoint })).toBe(true);
    expect(isSupportedCheckpoint({ stage: 5, checkpoint: 99 })).toBe(false);
  });
  it.each([[0, 'aligned'], [29.99, 'aligned'], [30, 'warden'], [79.99, 'warden'], [80, 'foom'], [100, 'foom']] as const)('replays real Doom %s as %s without changing statistics or re-awarding', (doom, ending) => {
    const saved = { ...save(), doom, checkpoint: 90, score: 911, tokens: 73, elapsedMs: 2222 }; const before = JSON.stringify(saved);
    const world = createWorld(saved); expect(world.mode).toBe('finished'); expect(endingForDoom(doom)).toBe(ending);
    expect(world.events).toEqual([{ type: 'victory', result: { save: saved, ending } }]); expect(world.events).toHaveLength(1);
    expect(world.boss.hp).toBe(0); expect(world.omega!.phase).toBe('complete'); expect(world.pickups).toEqual([]); expect(world.enemies).toEqual([]);
    expect(run(world, 600, { fire: true, dashPressed: true, rewindPressed: true, insightPressed: true, rerollPressed: true })).toBe(world);
    expect(finishFinalChapter(world.save)).toEqual(saved); expect(createWorld(saved, 'ready').mode).toBe('finished');
    const ignored = applyProgressionCommand(world, { type: 'rest-continue' });
    expect(ignored).toMatchObject({ mode: 'finished', save: saved });
    expect(ignored.events.some(event => event.type === 'victory' || event.type === 'checkpoint' || event.type === 'stage-cleared')).toBe(false);
    expect(transactShop(saved, 'repair').ok).toBe(false);
    expect(JSON.stringify(saved)).toBe(before); expect(isGameSave(world.save)).toBe(true);
  });
  it('awards final completion once, emits victory rather than stage-cleared and restores the identical result', () => {
    const world = duel({ doom: 55, score: 700, tokens: 9 }); world.boss.hp = 0;
    const result = stepWorld(world, EMPTY_INPUT);
    expect(result.mode).toBe('finished'); expect(result.save).toMatchObject({ stage: 5, checkpoint: 90, doom: 55, score: 4700, tokens: 189 });
    expect(result.events.filter(event => event.type === 'checkpoint' || event.type === 'victory').map(event => event.type)).toEqual(['checkpoint', 'victory']);
    expect(result.events.some(event => event.type === 'stage-cleared')).toBe(false);
    expect(createWorld(result.save).events).toEqual(result.events.filter(event => event.type === 'victory'));
    expect(finishFinalChapter(result.save)).toEqual(result.save);
  });
  it('saturates the once-only final reward at the unchanged v1 DTO ceilings', () => {
    const finished = finishFinalChapter({ ...save(), score: 9999999, tokens: 999999 });
    expect(finished).toMatchObject({ checkpoint: 90, score: 10000000, tokens: 1000000 }); expect(isGameSave(finished)).toBe(true);
    expect(finishFinalChapter(finished)).toEqual(finished);
  });
  it('does not rescue an airborne or long-passed rest threshold with a hidden position or health change', () => {
    const airborne = createWorld({ ...save(), hp: 73 }); airborne.player = { ...airborne.player, x: 962, y: 270, vy: 0, grounded: false };
    const air = stepWorld(airborne, EMPTY_INPUT); expect(air.mode).toBe('playing'); expect(air.save).toMatchObject({ checkpoint: 0, hp: 73, score: 0 }); expect(air.player.y).toBeLessThan(272);
    const far = createWorld({ ...save(), hp: 73 }); far.player = { ...far.player, x: 1100, y: 309, grounded: true };
    const missed = stepWorld(far, EMPTY_INPUT); expect(missed.mode).toBe('playing'); expect(missed.player.x).toBe(1100); expect(missed.save).toMatchObject({ checkpoint: 0, hp: 73 });
  });
  it('still emits defeat, not a final marker, if the player dies even on a simultaneous boss kill', () => {
    const world = duel(); world.boss.hp = 0; world.save.hp = 0;
    const result = stepWorld(world, EMPTY_INPUT);
    expect(result.mode).toBe('dead'); expect(result.save.checkpoint).toBe(2); expect(result.events.some(event => event.type === 'defeat')).toBe(true);
    expect(result.events.some(event => event.type === 'victory' || event.type === 'stage-cleared')).toBe(false);
  });
  it('shows the empty chamber before actual grounded proximity, then reveals for 1200ms without moving the player', () => {
    let world = createWorld({ ...save(), checkpoint: 2 }); world.player = { ...world.player, x: 2540, y: 309, grounded: true };
    world = stepWorld(world, EMPTY_INPUT); expect(world.omega!.phase).toBe('chamber'); expect(world.boss.active).toBe(false); expect(world.player.x).toBe(2540);
    world.player = { ...world.player, x: 2960, y: 280, vy: 0, grounded: false };
    world = stepWorld(world, EMPTY_INPUT); expect(world.omega!.phase).toBe('chamber'); expect(world.boss.active).toBe(false);
    world.player = { ...world.player, y: 309, vy: 0, grounded: true };
    world = stepWorld(world, EMPTY_INPUT); expect(world.omega!.phase).toBe('reveal'); expect(world.boss.active).toBe(false);
    expect(world.omega!.revealUntil - world.save.elapsedMs).toBe(1200); const position = { x: world.player.x, y: world.player.y }; const hp = world.save.hp;
    for (let index = 0; index < 100 && !world.boss.active; index += 1) world = stepWorld(world, EMPTY_INPUT);
    expect(world.omega!.phase).toBe('duel'); expect(world.boss.active).toBe(true); expect({ x: world.player.x, y: world.player.y }).toEqual(position); expect(world.save.hp).toBe(hp);
  });
  it('cannot open the chamber from below its floor, and a reveal never clamps a player in from outside', () => {
    let fallen = createWorld({ ...save(), checkpoint: 2 }); fallen.player = { ...fallen.player, x: 2960, y: 325, vy: 0 };
    fallen = stepWorld(fallen, EMPTY_INPUT); expect(fallen.omega!.phase).toBe('storm'); expect(fallen.boss.active).toBe(false); expect(fallen.player.y).toBeGreaterThan(325);
    let world = createWorld({ ...save(), checkpoint: 2 }); world.omega!.phase = 'chamber'; world.player = { ...world.player, x: 2940, y: 309, grounded: true };
    world = stepWorld(world, EMPTY_INPUT); expect(world.omega!.phase).toBe('reveal');
    world = stepWorld(world, { ...EMPTY_INPUT, rewindPressed: true }); expect(world.rewind).toBeNull();
    for (let index = 0; index < 100; index += 1) {
      const previousX = world.player.x; world = stepWorld(world, { ...EMPTY_INPUT, move: 1, dashPressed: true });
      expect(Math.abs(world.player.x - previousX)).toBeLessThanOrEqual(490 / 60 + 0.000001); expect(world.player.x).toBeLessThanOrEqual(3168);
    }
  });
  it('telegraphs a real storm hurt zone and stops its harm after entering the quiet chamber', () => {
    let world = createWorld({ ...save(), checkpoint: 2 }); world.player = { ...world.player, x: 2120, y: 309, grounded: true };
    let sawTell = false;
    for (let index = 0; index < 200 && world.save.hp === 100; index += 1) {
      world = stepWorld(world, EMPTY_INPUT); sawTell ||= world.omega!.stormZones[2].phase === 'tell';
    }
    expect(sawTell).toBe(true); expect(world.save.hp).toBeLessThan(100);
    world.omega!.phase = 'chamber'; world.player.invulnerableUntil = 0; const hp = world.save.hp;
    expect(stepWorld(world, EMPTY_INPUT).save.hp).toBe(hp);
  });
  it('freezes rest and detaches all nested mirror, history, scan, plan and behavior data', () => {
    const resting = createWorld({ ...save(), checkpoint: 12 }); expect(run(resting, 600, { fire: true, insightPressed: true })).toBe(resting);
    const world = duel(); const mirror = world.omega!.mirror;
    mirror.scan = { rect: { x: 2600, y: 250, w: 20, h: 20 }, at: 5000, until: 6000, hit: false };
    mirror.plan = ['shots', 'dashes']; const before = JSON.stringify(world); freeze(world);
    const next = stepWorld(world, EMPTY_INPUT); expect(JSON.stringify(world)).toBe(before);
    expect(next.omega!.mirror).not.toBe(mirror); expect(next.omega!.mirror.actor.immunity).not.toBe(mirror.actor.immunity);
    expect(next.omega!.mirror.history[0]).not.toBe(mirror.history[0]); expect(next.omega!.mirror.plan).not.toBe(mirror.plan);
    expect(next.omega!.mirror.scan!.rect).not.toBe(mirror.scan!.rect); expect(next.omega!.mirror.profile.activeBuild).not.toBe(mirror.profile.activeBuild);
    expect(next.behavior.recent).not.toBe(world.behavior.recent); expect(next.omega!.stormZones[0]).not.toBe(world.omega!.stormZones[0]);
  });
});

describe('real mirror execution rather than a reskinned boss', () => {
  it('executes the selected dash-Q-E order with actual movement and its own exact two-second past', () => {
    let world = duel({ actionCounts: { shots: 0, dashes: 3, rewinds: 3, insights: 3 } });
    world.behavior.source = 'observed'; world.behavior.combos = [{ actions: ['dashes', 'rewinds', 'insights'], uses: 3, lastAt: 0 }];
    const actions: string[] = []; let movedDash = false; let startedQ = false; let endedQ = false; let target: HistorySample | null = null;
    for (let index = 0; index < 600 && world.omega!.mirror.completedCombos === 0; index += 1) {
      const previous = world; world = stepWorld(world, EMPTY_INPUT); const mirror = world.omega!.mirror; const before = previous.omega!.mirror;
      if (mirror.state === 'execute' && before.state !== 'execute') actions.push(mirror.action!);
      movedDash ||= world.save.elapsedMs < mirror.actor.dashUntil && Math.abs(mirror.actor.x - before.actor.x) > 6;
      if (!before.rewind && mirror.rewind) {
        target = sampleAt(before.history, world.save.elapsedMs - 2000); startedQ = true;
        expect(mirror.rewind.path[0].x).toBeCloseTo(target.x, 6); expect(target.x).not.toBe(world.player.x);
        expect(Math.abs(target.x - mirror.actor.x)).toBeGreaterThan(50);
      }
      if (before.rewind && !mirror.rewind && target) { endedQ = true; expect(mirror.actor.x).toBeCloseTo(target.x, 6); expect(mirror.actor.y).toBeCloseTo(target.y, 6); }
      expect(world.boss.x).toBe(mirror.actor.x); expect(world.boss.y).toBe(mirror.actor.y);
    }
    expect(actions).toEqual(['dashes', 'rewinds', 'insights']); expect(movedDash && startedQ && endedQ).toBe(true);
    expect(world.omega!.mirror.executed).toMatchObject({ dashes: 1, rewinds: 1, insights: 1 }); expect(world.omega!.mirror.completedInPhase).toBe(1);
    expect(world.player.x).toBe(2700); expect(world.omega!.mirror.state).toBe('recover');
    expect(world.save.hp).toBe(89); expect(world.omega!.mirror.actor.insightUntil).toBeGreaterThan(world.save.elapsedMs);
  });
  it('copies effective armor and temperature into actual damage and emitted shot counts', () => {
    const armored = duel(); armored.omega!.mirror.state = 'recover'; armored.omega!.mirror.completedInPhase = 1; hit(armored);
    const bare = duel({ inventory: [] }); bare.omega!.mirror.state = 'recover'; bare.omega!.mirror.completedInPhase = 1; hit(bare);
    expect(armored.boss.hp).toBe(350); expect(bare.boss.hp).toBe(348);
    const shots = (temperature: boolean) => {
      let world = duel({ inventory: temperature ? ['temperature'] : [] }); const mirror = world.omega!.mirror;
      mirror.state = 'tell'; mirror.action = 'shots'; mirror.plan = ['shots']; mirror.until = 0;
      world = run(world, 40); return world.omega!.mirror.executed.shots;
    };
    expect(shots(false)).toBe(4); expect(shots(true)).toBe(5);
  });
  it('cannot take damage before real execution, and high critical damage cannot skip phases', () => {
    let world = duel(); hit(world, 1000000); expect(world.boss.hp).toBe(360);
    world.omega!.mirror.state = 'recover'; hit(world, 1000000); expect(world.boss.hp).toBe(360);
    world.omega!.mirror.completedInPhase = 1; hit(world, 1000000); expect(world.boss.hp).toBe(240);
    world = stepWorld(world, EMPTY_INPUT); expect(world.boss.phase).toBe(2); expect(world.omega!.mirror.completedInPhase).toBe(0);
    hit(world, 1000000); expect(world.boss.hp).toBe(240);
  });
  it('uses relative swept collision for a moving 16px target instead of only its final box', () => {
    const world = duel(); const mirror = world.omega!.mirror; mirror.state = 'recover'; mirror.completedInPhase = 1;
    mirror.previous.x = 2930; mirror.actor.x = 3030; world.boss.x = 3030;
    world.bullets = [{ id: 1, x: 2980, y: 309, vx: 0, vy: 0, radius: 3, faction: 'player', kind: 'dictionary', damage: 12, expiresAt: 1000 }];
    advanceCombat(world, world.player, [], 10, 1 / 60); expect(world.boss.hp).toBe(350);
  });
  it('absorbs along its real Q trail for at most two critical charges, never permanent copied immunity', () => {
    const world = duel(); const mirror = world.omega!.mirror;
    const sample = { at: 0, x: mirror.actor.x, y: mirror.actor.y, vx: 0, vy: 0, facing: -1 as const };
    mirror.rewind = { path: [sample, { ...sample, at: 2000 }], startedAt: 2000, durationMs: 600 };
    mirror.traversal = [{ ...sample, x: sample.x - 20 }, { ...sample, x: sample.x + 20 }];
    world.bullets = Array.from({ length: 8 }, (_, index) => ({ id: index, x: mirror.actor.x, y: mirror.actor.y, vx: 0, vy: 0, radius: 3, faction: 'player' as const, kind: 'dictionary' as const, damage: 12, expiresAt: 5000 }));
    advanceCombat(world, world.player, [], 2100, 1 / 60);
    expect(mirror.actor.criticalCharges).toBe(2); expect(mirror.actor.immunity).toEqual({}); expect(world.boss.hp).toBe(360); expect(world.bullets).toEqual([]);
    mirror.rewind = null; mirror.traversal = []; mirror.state = 'recover'; mirror.completedInPhase = 1; hit(world);
    expect(world.boss.hp).toBe(350);
  });
  it('bounds its self-history even under tiny caller substeps', () => {
    let history: HistorySample[] = [];
    for (let index = 0; index < 6000; index += 1) history = recordMirrorHistory(history, { at: index / 2, x: index / 100, y: 309, vx: 1, vy: 0, facing: 1 });
    expect(history.length).toBeLessThanOrEqual(MIRROR_RULES.historyLimit); expect(history[0].at).toBeLessThanOrEqual(history[history.length - 1].at - 2000);
  });
});
