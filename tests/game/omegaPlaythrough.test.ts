import { expect, it } from 'vitest';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import type { BehaviorAction, FrameInput, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { applyProgressionCommand } from '../../src/pages/GamePage/game/systems/shop';
import { endingForDoom } from '../../src/pages/GamePage/game/systems/rules';
import { sampleAt } from '../../src/pages/GamePage/game/systems/rewind';

function controls() {
  let orbit: -1 | 1 = -1;
  return (world: WorldState): FrameInput => {
    const p = world.player; const now = world.save.elapsedMs; const omega = world.omega!;
    if (omega.phase === 'reveal') return EMPTY_INPUT;
    if (!world.boss.active) {
      const enemy = world.enemies.filter(item => item.hp > 0).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      const storm = omega.stormZones.some(zone => zone.phase !== 'cool' && p.x > zone.x - 75 && p.x < zone.x + zone.w + 8);
      const gap = (p.x > 640 && p.x < 710) || (p.x > 1500 && p.x < 1570);
      const room = omega.phase === 'chamber';
      const aim = enemy && Math.abs(enemy.x - p.x) < 700 ? { x: enemy.x, y: enemy.y - (enemy.kind === 'deceiver' && now < p.insightUntil ? 19 : 0) } : null;
      return { ...EMPTY_INPUT, move: 1, fire: true, aim, jumpPressed: !room && p.grounded && (storm || gap), jumpHeld: true,
        dashPressed: !room && storm && !p.grounded && p.y < 280 && now >= p.dashReadyAt,
        insightPressed: !!enemy && enemy.kind === 'deceiver' && Math.abs(enemy.x - p.x) < 350 && now >= p.insightReadyAt };
    }
    const mirror = omega.mirror; const dx = mirror.actor.x - p.x;
    if (p.x < world.chapter.arena.x + 70) orbit = 1;
    if (p.x > world.chapter.arena.x + world.chapter.arena.w - 70) orbit = -1;
    const open = mirror.state === 'recover' && mirror.completedInPhase > 0;
    const crossing = Math.sign(dx) === orbit;
    const nearBullet = world.bullets.some(bullet => bullet.faction === 'enemy' && Math.abs(bullet.x - p.x) < 85 && Math.abs(bullet.y - p.y) < 40);
    const qReady = !world.rewind && now >= p.rewindReadyAt && world.history[0].at <= now - 2000;
    return { ...EMPTY_INPUT, move: open ? 0 : orbit, fire: true, aim: { x: mirror.actor.x, y: mirror.actor.y },
      jumpPressed: p.grounded && !open && ((crossing && Math.abs(dx) < 155) || !!mirror.scan || nearBullet), jumpHeld: true,
      dashPressed: !open && crossing && Math.abs(dx) < 65 && now >= p.dashReadyAt,
      rewindPressed: nearBullet && qReady,
      insightPressed: mirror.state === 'tell' && mirror.action === 'insights' && now >= p.insightReadyAt };
  };
}

/** Teach D→Q→E with real cooldowns and a real two-second player trajectory; never manufacture memory. */
function trainedControls() {
  const normal = controls(); let chamberAt: number | null = null; let cycles = 0;
  let step: 'wait' | 'dash' | 'rewind' = 'wait'; let rewindCount = 0;
  return (world: WorldState): FrameInput => {
    if (world.omega!.phase !== 'chamber' || cycles >= 3) return normal(world);
    const now = world.save.elapsedMs; const p = world.player; chamberAt ??= now;
    if (step === 'wait') {
      if (now - chamberAt < 2100 || now < p.insightReadyAt || now < p.rewindReadyAt || now < p.dashReadyAt || world.history[0].at > now - 2000) return EMPTY_INPUT;
      step = 'dash'; return { ...EMPTY_INPUT, move: 1, dashPressed: true };
    }
    if (step === 'dash') {
      if (now < p.dashUntil + 70) return EMPTY_INPUT;
      step = 'rewind'; rewindCount = world.save.actionCounts.rewinds;
      return { ...EMPTY_INPUT, rewindPressed: true };
    }
    if (world.rewind || world.save.actionCounts.rewinds === rewindCount) return EMPTY_INPUT;
    cycles += 1; step = 'wait'; return { ...EMPTY_INPUT, insightPressed: true, fire: true };
  };
}

const scenarios = [{ doom: 8, training: false }, { doom: 55, training: false }, { doom: 90, training: false }, { doom: 8, training: true }];
it.each(scenarios)('completes the full fifth chapter at real Doom $doom, ordered-Q/E training=$training, using only normal inputs', ({ doom, training }) => {
  let world = createWorld({ ...createRun('f955710e-6f1c-44aa-8ba6-3113dad8de42', 42), stage: 5, doom });
  const input = training ? trainedControls() : controls(); const rooms = new Set<number>(); const phases = new Set<number>(); const attacks = new Set<number>();
  const omegaPhases = new Set<string>(); const plans: BehaviorAction[][] = []; const performed: BehaviorAction[][] = [];
  let currentActions: BehaviorAction[] = []; let frames = 0; let dashMovementFrames = 0; let realMirrorRewinds = 0;
  while ((world.mode === 'playing' || world.mode === 'rest') && frames < 60 * 240) {
    const before = world;
    if (world.mode === 'rest') { rooms.add(world.rest!.room); world = applyProgressionCommand(world, { type: 'rest-continue' }); }
    else world = stepWorld(world, input(world));
    const mirror = world.omega!.mirror; const previous = before.omega!.mirror;
    omegaPhases.add(world.omega!.phase);
    if (world.boss.active) phases.add(world.boss.phase);
    if (mirror.state === 'execute') attacks.add(world.boss.phase);
    if (mirror.state === 'execute' && previous.state !== 'execute') {
      if (mirror.index === 0) { plans.push([...mirror.plan]); currentActions = []; }
      currentActions.push(mirror.action!);
    }
    if (mirror.completedCombos > previous.completedCombos) performed.push([...currentActions]);
    if (world.save.elapsedMs < mirror.actor.dashUntil && Math.abs(mirror.actor.x - previous.actor.x) > 6) dashMovementFrames += 1;
    if (!previous.rewind && mirror.rewind) {
      const actual = sampleAt(previous.history, world.save.elapsedMs - 2000);
      expect(mirror.rewind.path[0].x).toBeCloseTo(actual.x, 5); expect(mirror.rewind.path[0].y).toBeCloseTo(actual.y, 5); realMirrorRewinds += 1;
    }
    frames += 1;
  }
  console.info('Omega normal-input result', { doom, training, mode: world.mode, hp: world.save.hp, x: world.player.x, y: world.player.y, bossHp: world.boss.hp,
    elapsedMs: world.save.elapsedMs, frames, rooms: [...rooms], phases: [...phases], profile: world.omega!.mirror.profile.source,
    plans, performed, mirrorExecuted: world.omega!.mirror.executed, dashMovementFrames, realMirrorRewinds, playerActions: world.save.actionCounts });
  expect(world.mode).toBe('finished'); expect(world.boss.hp).toBe(0); expect(world.save.hp).toBeGreaterThan(0);
  expect([...rooms]).toEqual([1, 2]); expect([...phases]).toEqual([1, 2, 3]); expect([...attacks]).toEqual([1, 2, 3]);
  expect([...omegaPhases]).toEqual(['storm', 'chamber', 'reveal', 'duel', 'complete']);
  expect(plans.some(plan => plan.length >= 2)).toBe(true); expect(performed.length).toBeGreaterThanOrEqual(3);
  performed.forEach((sequence, index) => expect(sequence).toEqual(plans[index]));
  expect(dashMovementFrames).toBeGreaterThan(0); expect(world.omega!.mirror.profile.source).not.toBe('counts-only');
  if (training) {
    expect(realMirrorRewinds).toBeGreaterThan(0); expect(world.omega!.mirror.executed.insights).toBeGreaterThan(0); expect(world.save.actionCounts.insights).toBeGreaterThanOrEqual(3);
    expect(plans[0]).toEqual(['dashes', 'rewinds', 'insights']);
    expect(plans.slice(1).some(plan => plan.join('>') !== plans[0].join('>'))).toBe(true);
  }
  expect(world.save.doom).toBe(doom); expect(world.save.stage).toBe(5); expect(world.save.checkpoint).toBe(90); expect(isGameSave(world.save)).toBe(true);
  expect(world.events.find(event => event.type === 'victory')).toMatchObject({ result: { ending: endingForDoom(doom), save: world.save } });
  expect(world.events.some(event => event.type === 'stage-cleared' || event.type === 'defeat')).toBe(false);
});
