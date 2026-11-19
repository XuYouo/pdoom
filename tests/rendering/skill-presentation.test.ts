import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT, type WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { skillHudSnapshot } from '../../src/pages/GamePage/game/systems/skillPresentation';
import { bindPuaBubble, syncRootBubble } from '../../src/pages/GamePage/game/systems/factory';

const save = () => createRun('37b40e07-dd2e-40bb-a6cb-627d9b42fc33', 42);
function until(world: WorldState, deadline: number) {
  let next = world;
  while (next.save.elapsedMs + 0.01 < deadline && next.mode === 'playing') next = stepWorld(next, EMPTY_INPUT);
  expect(next.mode).toBe('playing');
  return next;
}

describe('skill snapshots match real simulation gates', () => {
  it('distinguishes initial history, real rewind, and the remaining cooldown without advancing its input', () => {
    let world = createWorld(save());
    const original = JSON.stringify(world);
    expect(skillHudSnapshot(world).rewind).toEqual({ state: 'recording', remainingMs: 2000 });
    expect(JSON.stringify(world)).toBe(original);
    world = until(world, 1000);
    expect(skillHudSnapshot(world).rewind.state).toBe('recording');
    expect(skillHudSnapshot(world).rewind.remainingMs).toBeCloseTo(1000);
    world = stepWorld(world, { ...EMPTY_INPUT, rewindPressed: true });
    expect(world.save.actionCounts.rewinds).toBe(0);
    world = until(world, 2000);
    expect(skillHudSnapshot(world).rewind.state).toBe('ready');
    world = stepWorld(world, { ...EMPTY_INPUT, rewindPressed: true });
    expect(world.save.actionCounts.rewinds).toBe(1);
    expect(skillHudSnapshot(world).rewind.state).toBe('rewinding');
    expect(skillHudSnapshot(world).rewind.remainingMs).toBeCloseTo(600);
    expect(skillHudSnapshot(world).insight).toMatchObject({ ready: false, blockedByRewind: true });
    world = stepWorld(world, { ...EMPTY_INPUT, insightPressed: true });
    expect(world.save.actionCounts.insights).toBe(0);
    world = until(world, world.save.elapsedMs + 700);
    expect(skillHudSnapshot(world).rewind.state).toBe('cooldown');
    expect(skillHudSnapshot(world).rewind.remainingMs).toBeCloseTo(world.player.rewindReadyAt - world.save.elapsedMs);
    world = until(world, world.player.rewindReadyAt + 1);
    expect(skillHudSnapshot(world).rewind).toEqual({ state: 'ready', remainingMs: 0 });
  });

  it('keeps E unavailable after its effect ends until its real cooldown expires', () => {
    let world = stepWorld(createWorld(save()), { ...EMPTY_INPUT, insightPressed: true });
    expect(world.save.actionCounts.insights).toBe(1);
    expect(skillHudSnapshot(world).insight).toEqual({ ready: false, activeRemainingMs: 4000, cooldownRemainingMs: 8500, blockedByRewind: false });
    world = until(world, world.player.insightUntil + 1);
    expect(skillHudSnapshot(world).insight.activeRemainingMs).toBe(0);
    expect(skillHudSnapshot(world).insight.cooldownRemainingMs).toBeGreaterThan(4400);
    expect(skillHudSnapshot(world).insight.ready).toBe(false);
    world = stepWorld(world, { ...EMPTY_INPUT, insightPressed: true });
    expect(world.save.actionCounts.insights).toBe(1);
    world = until(world, world.player.insightReadyAt + 1);
    expect(skillHudSnapshot(world).insight.ready).toBe(true);
    world = stepWorld(world, { ...EMPTY_INPUT, insightPressed: true });
    expect(world.save.actionCounts.insights).toBe(2);
  });

  it('uses the actual calibrated/interpretability deadlines instead of hardcoded durations', () => {
    const world = stepWorld(createWorld({ ...save(), inventory: ['constitutional', 'interpretability'], upgrades: ['calibrated'] }), { ...EMPTY_INPUT, insightPressed: true });
    expect(skillHudSnapshot(world).insight).toEqual({ ready: false, activeRemainingMs: 6000, cooldownRemainingMs: 6000, blockedByRewind: false });
  });

  it('does not advertise Q during a real PUA bind, and releases the gate only after that bubble is removed', () => {
    let world = until(createWorld({ ...save(), stage: 2 }), 2100);
    expect(skillHudSnapshot(world).rewind.state).toBe('ready');
    bindPuaBubble(world, world.save.elapsedMs);
    expect(skillHudSnapshot(world).rewind).toEqual({ state: 'controlled', remainingMs: 0 });
    world = stepWorld(world, { ...EMPTY_INPUT, rewindPressed: true });
    expect(world.save.actionCounts.rewinds).toBe(0);
    expect(world.rewind).toBeNull();
    world.factory!.bubbles.find(bubble => bubble.id === world.player.rootedBy)!.hp = 0;
    syncRootBubble(world, world.save.elapsedMs);
    expect(skillHudSnapshot(world).rewind.state).toBe('ready');
    world = stepWorld(world, { ...EMPTY_INPUT, rewindPressed: true });
    expect(world.save.actionCounts.rewinds).toBe(1);
  });
});
