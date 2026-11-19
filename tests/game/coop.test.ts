import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT, type Bullet } from '../../src/pages/GamePage/game/entities/model';
import { TUNING } from '../../src/pages/GamePage/game/data/tuning';
import { applyCoopCommand, createCoopWorld, playerView, stepCoopWorld, type CoopInput, type CoopWorldState } from '../../src/pages/GamePage/game/coop';
import { advanceCoopCombat } from '../../src/pages/GamePage/game/coop/combat';
import { enforceCoopTether, loseActor } from '../../src/pages/GamePage/game/coop/actors';
import { cloneData } from '../../src/pages/GamePage/game/coop/state';

const save = () => createRun('7c1382d5-3b81-4054-8d97-7bbfe22e0740', 42);
const inputs = (p1: Partial<CoopInput> = {}, p2: Partial<CoopInput> = {}) => ({ p1: { ...EMPTY_INPUT, ...p1 }, p2: { ...EMPTY_INPUT, ...p2 } });
const bullet = (patch: Partial<Bullet> = {}): Bullet => ({ id: 90, x: 300, y: 50, vx: 60, vy: 0, radius: 3, damage: 20, faction: 'enemy', kind: 'dictionary', expiresAt: 5000, ...patch });
const origins = (state: CoopWorldState) => ({ p1: { ...state.players.p1.actor }, p2: { ...state.players.p2.actor } });
const tick = (state: CoopWorldState, frames: number, p1: Partial<CoopInput> = {}, p2: Partial<CoopInput> = {}) => {
  for (let i = 0; i < frames; i++) state = stepCoopWorld(state, inputs(p1, p2)); return state;
};
const freeze = <T,>(data: T): T => { if (data && typeof data === 'object' && !Object.isFrozen(data)) { Object.freeze(data); Object.values(data).forEach(freeze); } return data; };

describe('one real shared cooperative world', () => {
  it('advances one clock and one bullet trajectory while both independent actors move', () => {
    const world = createCoopWorld(save()); world.shared.bullets = [bullet()];
    const previous = cloneData(world);
    const next = stepCoopWorld(freeze(world), inputs({ move: 1 }, { move: -1 }));
    expect(next.tick).toBe(1); expect(next.run.elapsedMs).toBe(TUNING.stepMs);
    expect(next.shared.bullets[0].x).toBe(301);
    expect(next.players.p1.actor.x).toBeGreaterThan(previous.players.p1.actor.x);
    expect(next.players.p2.actor.x).toBeLessThan(previous.players.p2.actor.x);
    expect(world).toEqual(previous);
    expect(next.players.p1.actor).not.toBe(next.players.p2.actor);
    expect(next.players.p1.history).not.toBe(next.players.p2.history);
  });
  it('is deterministic over a mixed-input sequence and leaves the original checkpoint detached', () => {
    const start = createCoopWorld(save());
    const run = () => { let current = start; for (let i = 0; i < 120; i++) current = stepCoopWorld(current, inputs({ move: 1, fire: true, jumpPressed: i === 15, jumpHeld: i < 25 }, { move: i < 30 ? -1 : 1, dashPressed: i === 50 })); return current; };
    expect(run()).toEqual(run()); expect(start.tick).toBe(0);
    expect(start.checkpoint.run.elapsedMs).toBe(0);
  });
  it('each shot has its own owner and only that player spends firing cooldown/counts', () => {
    const result = stepCoopWorld(createCoopWorld(save()), inputs({}, { fire: true }));
    expect(result.shared.bullets.filter(item => item.faction === 'player').map(item => item.ownerPlayerId)).toEqual(['p2']);
    expect(result.players.p1.actionCounts.shots).toBe(0); expect(result.players.p2.actionCounts.shots).toBe(1);
    expect(result.players.p1.actor.shotReadyAt).toBe(0); expect(result.players.p2.actor.shotReadyAt).toBeGreaterThan(0);
    expect(result.players.p2.behavior.counts.shots).toBe(1); expect(result.players.p1.behavior.counts.shots).toBe(0);
  });
  it('one enemy bullet is consumed by its first player collision without sharing damage', () => {
    const world = createCoopWorld(save());
    world.players.p1.actor = { ...world.players.p1.actor, x: 200, y: 200, invulnerableUntil: 0 };
    world.players.p2.actor = { ...world.players.p2.actor, x: 170, y: 200, invulnerableUntil: 0 };
    world.shared.bullets = [bullet({ x: 140, y: 200, vx: 1000 })];
    advanceCoopCombat(world, origins(world), { p1: [], p2: [] }, 2000, 0.1);
    expect(world.players.p2.hp).toBeLessThan(100); expect(world.players.p1.hp).toBe(100); expect(world.shared.bullets).toHaveLength(0);
  });
  it('both players can hit the same enemy but its reward is granted once', () => {
    const world = createCoopWorld(save());
    world.shared.enemies = [{ id: 'shared', kind: 'parrot', x: 300, y: 200, hp: 12, homeX: 300, homeY: 200, phase: 'idle', phaseUntil: 5000 }];
    world.shared.bullets = ['p1', 'p2'].map((owner, index) => bullet({ id: index, x: 280, y: 200, vx: 500, damage: 12, faction: 'player', ownerPlayerId: owner as 'p1' | 'p2' }));
    advanceCoopCombat(world, origins(world), { p1: [], p2: [] }, 20, 0.05);
    expect(world.shared.enemies[0].hp).toBe(0); expect(world.run.score).toBe(120); expect(world.run.tokens).toBe(6);
  });
  it('core hits use the projectile owner insight rather than the other player skill', () => {
    const world = createCoopWorld(save());
    world.players.p2.actor.insightUntil = 1000;
    world.shared.enemies = [{ id: 'core', kind: 'deceiver', x: 300, y: 200, hp: 100, homeX: 300, homeY: 200, phase: 'idle', phaseUntil: 5000 }];
    world.shared.bullets = [bullet({ x: 300, y: 181, vx: 0, faction: 'player', ownerPlayerId: 'p1', damage: 1 })];
    advanceCoopCombat(world, origins(world), { p1: [], p2: [] }, 20, 0.01); expect(world.shared.enemies[0].hp).toBe(100);
    world.shared.bullets = [bullet({ x: 300, y: 181, vx: 0, faction: 'player', ownerPlayerId: 'p2', damage: 1 })];
    advanceCoopCombat(world, origins(world), { p1: [], p2: [] }, 20, 0.01); expect(world.shared.enemies[0].hp).toBe(0);
  });
  it('shared pickup is collected only once and healing belongs to its actual collector', () => {
    const world = createCoopWorld(save()); const p = world.players.p2.actor;
    world.players.p1.hp = 40; world.players.p2.hp = 50;
    world.shared.pickups = [{ id: 'one', x: p.x, y: p.y, kind: 'heal', amount: 20 }, { id: 'money', x: p.x, y: p.y, kind: 'token', amount: 10 }];
    const next = stepCoopWorld(world, inputs());
    expect(next.shared.pickups).toHaveLength(0); expect(next.players.p1.hp).toBe(40); expect(next.players.p2.hp).toBe(70);
    expect(next.run.tokens).toBe(10); expect(next.run.score).toBe(20);
  });
  it('Q records, consumes and rewards only the actor who actually rewinds', () => {
    let world = tick(createCoopWorld(save()), 125);
    const p1History = cloneData(world.players.p1.history);
    world = stepCoopWorld(world, inputs({}, { rewindPressed: true }));
    expect(world.players.p1.rewind).toBeNull(); expect(world.players.p2.rewind).not.toBeNull();
    expect(world.players.p1.actionCounts.rewinds).toBe(0); expect(world.players.p2.actionCounts.rewinds).toBe(1);
    expect(world.players.p1.history.slice(0, -1).length).toBeGreaterThan(0); expect(p1History.length).toBeGreaterThan(0);
  });
  it('waits for a continuous two-second rescue and resets progress when F is released', () => {
    let world = createCoopWorld(save()); loseActor(world, 'p2', false);
    world = tick(world, 60, { reviveHeld: true }); expect(world.players.p2.state).toBe('downed'); expect(world.players.p2.reviveProgressMs).toBeGreaterThan(900);
    world = stepCoopWorld(world, inputs()); expect(world.players.p2.reviveProgressMs).toBe(0);
    world = tick(world, 120, { reviveHeld: true });
    expect(world.players.p2).toMatchObject({ state: 'active', hp: 35, reviveProgressMs: 0 });
    expect(world.players.p2.history).toHaveLength(1); expect(world.players.p2.actor.invulnerableUntil).toBeGreaterThan(world.run.elapsedMs);
  });
  it('prevents voluntary separation beyond the shared screen while permitting movement toward a partner', () => {
    const previous = createCoopWorld(save());
    Object.assign(previous.players.p1.actor, { x: 100, y: 300 }); Object.assign(previous.players.p2.actor, { x: 580, y: 60 });
    const next = cloneData(previous); next.players.p1.actor.x = 95; next.players.p2.actor.y = 55;
    enforceCoopTether(next, previous);
    expect(next.players.p1.actor.x).toBe(100); expect(next.players.p2.actor.y).toBe(60);
    next.players.p1.actor.x = 110; next.players.p2.actor.y = 70;
    enforceCoopTether(next, previous);
    expect(next.players.p1.actor.x).toBe(110); expect(next.players.p2.actor.y).toBe(70);
  });
  it('friendly bullets never hurt the teammate they pass through', () => {
    const world = createCoopWorld(save());
    world.players.p2.actor = { ...world.players.p2.actor, x: 170, y: 200, invulnerableUntil: 0 };
    world.shared.bullets = [bullet({ x: 140, y: 200, vx: 1000, faction: 'player', ownerPlayerId: 'p1' })];
    advanceCoopCombat(world, origins(world), { p1: [], p2: [] }, 100, 0.1);
    expect(world.players.p2.hp).toBe(100); expect(world.shared.bullets).toHaveLength(1);
  });
  it('does not teleport a falling teammate to enforce camera separation', () => {
    const world = createCoopWorld(save());
    world.players.p2.actor.y = world.shared.chapter.height + 80;
    const next = stepCoopWorld(world, inputs());
    expect(next.players.p2.state).toBe('waiting'); expect(next.players.p2.hp).toBe(0);
    expect(next.players.p2.actor.y).toBeGreaterThan(world.shared.chapter.height);
    expect(next.shared.mode).toBe('playing');
  });
  it('requires both actors to reach a checkpoint and only then revives an absent teammate', () => {
    const world = createCoopWorld(save()), point = world.shared.chapter.checkpoints[1];
    world.players.p1.actor.x = point.trigger + 2;
    expect(stepCoopWorld(world, inputs()).shared.mode).toBe('playing');
    loseActor(world, 'p2', true);
    const next = stepCoopWorld(world, inputs());
    expect(next.shared.mode).toBe('rest'); expect(next.players.p2.hp).toBe(35); expect(next.players.p2.state).toBe('active');
    expect(next.events.filter(event => event.type === 'checkpoint')).toHaveLength(1);
  });
  it('team defeat and retry require both ready flags and restore the real last checkpoint', () => {
    const world = createCoopWorld(save()); world.run.tokens = 999; loseActor(world, 'p1', false); loseActor(world, 'p2', false);
    const dead = stepCoopWorld(world, inputs()); expect(dead.shared.mode).toBe('dead');
    const first = applyCoopCommand(dead, { type: 'continue-ready', playerId: 'p1' }); expect(first.shared.mode).toBe('dead');
    const restored = applyCoopCommand(first, { type: 'continue-ready', playerId: 'p2' });
    expect(restored.shared.mode).toBe('playing'); expect(restored.run.tokens).toBe(0); expect(restored.players.p1.hp).toBe(100); expect(restored.players.p2.hp).toBe(100);
    expect(restored.epoch).toBe(1); expect(restored.ready).toEqual({ p1: false, p2: false });
  });
  it('chapter progression awards once and derives the next chapter only after both are ready', () => {
    const world = createCoopWorld({ ...save(), checkpoint: 2 }); world.shared.boss.active = true; world.shared.boss.hp = 0;
    const cleared = stepCoopWorld(world, inputs());
    expect(cleared.shared.mode).toBe('cleared'); expect(cleared.run.stage).toBe(2); expect(cleared.shared.chapter.stage).toBe(1); expect(cleared.run.score).toBe(1500);
    expect(stepCoopWorld(cleared, inputs())).toBe(cleared);
    const next = applyCoopCommand(applyCoopCommand(cleared, { type: 'continue-ready', playerId: 'p2' }), { type: 'continue-ready', playerId: 'p1' });
    expect(next.shared.chapter.stage).toBe(2); expect(next.shared.factory).not.toBeNull(); expect(next.run.score).toBe(1500);
  });
  it('shared shop is host-only and healing has an explicit target, with both-ready continuation', () => {
    const world = createCoopWorld({ ...save(), checkpoint: 11, tokens: 100, hp: 50 });
    const denied = applyCoopCommand(world, { type: 'shop-buy', playerId: 'p2', offerId: 'repair', targetPlayerId: 'p2' }); expect(denied.run.tokens).toBe(100);
    const unspecified = applyCoopCommand(world, { type: 'shop-buy', playerId: 'p1', offerId: 'repair' }); expect(unspecified.run.tokens).toBe(100);
    const repaired = applyCoopCommand(world, { type: 'shop-buy', playerId: 'p1', offerId: 'repair', targetPlayerId: 'p2' });
    expect(repaired.players.p1.hp).toBe(50); expect(repaired.players.p2.hp).toBe(85); expect(repaired.run.tokens).toBe(88);
    const one = applyCoopCommand(repaired, { type: 'continue-ready', playerId: 'p2' }); expect(one.shared.mode).toBe('rest');
    const both = applyCoopCommand(one, { type: 'continue-ready', playerId: 'p1' }); expect(both.shared.mode).toBe('playing'); expect(both.run.checkpoint).toBe(1);
    expect(playerView(both, 'p1').save.hp).toBe(50); expect(playerView(both, 'p2').save.hp).toBe(85);
  });
});
