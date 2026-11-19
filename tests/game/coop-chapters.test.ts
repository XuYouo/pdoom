import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT, type Bullet } from '../../src/pages/GamePage/game/entities/model';
import { TUNING } from '../../src/pages/GamePage/game/data/tuning';
import { LOOM_ANCHOR_ID } from '../../src/pages/GamePage/game/data/loomGraph';
import { applyCoopCommand, createCoopWorld, stepCoopWorld } from '../../src/pages/GamePage/game/coop';
import { advanceCoopCombat } from '../../src/pages/GamePage/game/coop/combat';
import { advanceCoopEncounters, advanceCoopOmega, applyCoopHazards } from '../../src/pages/GamePage/game/coop/chapters';
import { advanceCoopLoom, tryCoopReroll } from '../../src/pages/GamePage/game/coop/loom';
import { syncCoopBubbles } from '../../src/pages/GamePage/game/coop/actors';
import { cloneData } from '../../src/pages/GamePage/game/coop/state';
import { resolveCoopOutcome } from '../../src/pages/GamePage/game/coop/progression';
import { enterLoomArena } from '../../src/pages/GamePage/game/systems/loom';
import { playerView } from '../../src/pages/GamePage/game/coop';

const world = (stage: number, checkpoint = 2) => createCoopWorld({ ...createRun('7c1382d5-3b81-4054-8d97-7bbfe22e0740', 42), stage, checkpoint });
const idle = { p1: { ...EMPTY_INPUT }, p2: { ...EMPTY_INPUT } };
const origins = (state: ReturnType<typeof world>) => ({ p1: { ...state.players.p1.actor }, p2: { ...state.players.p2.actor } });
const shot = (patch: Partial<Bullet> = {}): Bullet => ({ id: 900, x: 300, y: 200, vx: 0, vy: 0, damage: 100, radius: 3, faction: 'player', ownerPlayerId: 'p1', kind: 'dictionary', expiresAt: 5000, ...patch });

describe('cooperative adaptations preserve each authored chapter mechanic', () => {
  it('Gato targets the closer live actor and keeps a telegraphed target while positions change', () => {
    const state = world(1); state.shared.boss.active = true; state.shared.boss.action = 'idle';
    state.players.p1.actor.x = 2400; state.players.p2.actor.x = state.shared.boss.x - 40;
    advanceCoopEncounters(state, 100, 1 / 60);
    expect(state.targetPlayerId).toBe('p2'); expect(state.shared.boss.targetX).toBe(state.players.p2.actor.x);
    state.players.p1.actor.x = state.shared.boss.x - 10; state.players.p2.actor.x = 2400;
    advanceCoopEncounters(state, 110, 1 / 60); expect(state.targetPlayerId).toBe('p2');
  });
  it('Gato reflection returns a shot toward its actual owner, not the other player', () => {
    const state = world(1); Object.assign(state.shared.boss, { active: true, phase: 1, action: 'tell' });
    state.players.p1.actor.y = 200; state.players.p2.actor.y = 100;
    state.shared.bullets = [shot({ x: state.shared.boss.x - 30, y: state.shared.boss.y, vx: 510, ownerPlayerId: 'p2' })];
    advanceCoopCombat(state, origins(state), { p1: [], p2: [] }, 100, 0.05);
    expect(state.shared.bullets[0].faction).toBe('enemy'); expect(state.shared.bullets[0].ownerPlayerId).toBeUndefined();
    expect(state.shared.bullets[0].vy).toBeLessThan(0);
  });
  it('Factory sea advances once, kills the touched actor despite immunity, and does not kill their partner', () => {
    const state = world(2, 0); const sea = state.shared.factory!.seaY;
    state.players.p2.actor.y = sea - 5; state.players.p2.actor.invulnerableUntil = 99999;
    const next = stepCoopWorld(state, idle);
    expect(next.shared.factory!.seaY).toBeCloseTo(sea - 52 / 60, 10);
    expect(next.players.p2).toMatchObject({ state: 'waiting', hp: 0 }); expect(next.players.p1.hp).toBe(100); expect(next.shared.mode).toBe('playing');
  });
  it('Sydney roots only its target, and either player can shoot that shared bubble to rescue them', () => {
    const state = world(2); Object.assign(state.shared.boss, { active: true, action: 'tell', actionUntil: 0 }); state.targetPlayerId = 'p2';
    advanceCoopEncounters(state, 100, 1 / 60);
    expect(state.players.p1.actor.rootedBy).toBeNull(); expect(state.players.p2.actor.rootedBy).not.toBeNull();
    const bubble = state.shared.factory!.bubbles[0];
    state.shared.bullets = [shot({ x: bubble.x, y: bubble.y, ownerPlayerId: 'p1' })];
    advanceCoopCombat(state, origins(state), { p1: [], p2: [] }, 120, 0.01); syncCoopBubbles(state, 120);
    expect(state.players.p2.actor.rootedBy).toBeNull(); expect(state.shared.factory!.bubbles).toHaveLength(0);
  });
  it('Basilisk laser hits are tracked independently per actor', () => {
    const state = world(3); const boss = state.shared.boss;
    state.shared.furnace!.laser = { x: boss.x + 26, y: boss.y + 15, facing: 1, length: 440, halfHeight: 11, phase: 'active', until: 1000, hitPlayer: false, absorbedByRewind: false };
    for (const id of ['p1', 'p2'] as const) Object.assign(state.players[id].actor, { x: boss.x + (id === 'p1' ? 60 : 100), y: boss.y + 15, facing: -1, invulnerableUntil: 0 });
    applyCoopHazards(state, { p1: [], p2: [] }, 100, 0);
    expect(state.players.p1.actor.petrifiedUntil).toBe(1300); expect(state.players.p2.actor.petrifiedUntil).toBe(1300);
    expect(state.players.p1.hp).toBeLessThan(100); expect(state.players.p2.hp).toBeLessThan(100);
    expect(state.players.p1.laserHit).toBe(true); expect(state.players.p2.laserHit).toBe(true);
  });
  it('one player can absorb the shared Basilisk ray with Q while the other takes its real gaze hit', () => {
    const state = world(3), boss = state.shared.boss;
    state.shared.furnace!.laser = { x: boss.x + 26, y: boss.y + 15, facing: 1, length: 440, halfHeight: 11, phase: 'active', until: 1000, hitPlayer: false, absorbedByRewind: false };
    for (const id of ['p1', 'p2'] as const) Object.assign(state.players[id].actor, { x: boss.x + 70, y: boss.y + 15, facing: -1, invulnerableUntil: 0 });
    const path = [0, 1].map(index => ({ at: index * 100, x: boss.x + 70, y: boss.y - 40 + index * 80, vx: 0, vy: 0, facing: -1 as const }));
    state.players.p1.rewind = { path, startedAt: 0, durationMs: 500 };
    applyCoopHazards(state, { p1: path, p2: [] }, 100, 0);
    expect(state.players.p1.hp).toBe(100); expect(state.players.p1.laserAbsorbed).toBe(true);
    expect(state.players.p1.actor.immunity.causal).toBe(10100); expect(state.players.p1.actor.criticalCharges).toBe(2);
    expect(state.players.p2.hp).toBeLessThan(100); expect(state.players.p2.laserHit).toBe(true);
    expect(state.players.p2.actor.immunity.causal).toBeUndefined();
    const hp = state.players.p2.hp;
    applyCoopHazards(state, { p1: path, p2: [] }, 101, 0);
    expect(state.players.p1.actor.criticalCharges).toBe(2); expect(state.players.p2.hp).toBe(hp);
  });
  it('a mirror scan independently rewards one real rewind and damages the other actor once', () => {
    const state = world(5), omega = state.shared.omega!; omega.phase = 'duel';
    omega.mirror.scan = { rect: { x: 100, y: 100, w: 100, h: 100 }, at: 100, until: 1000, hit: false };
    for (const id of ['p1', 'p2'] as const) Object.assign(state.players[id].actor, { x: 150, y: 150, invulnerableUntil: 0 });
    const path = [0, 1].map(index => ({ at: index * 100, x: 50 + index * 200, y: 150, vx: 0, vy: 0, facing: 1 as const }));
    state.players.p1.rewind = { path, startedAt: 0, durationMs: 500 };
    applyCoopHazards(state, { p1: path, p2: [] }, 100, 0);
    expect(state.players.p1.hp).toBe(100); expect(state.players.p1.actor.immunity.impact).toBe(10100);
    expect(state.players.p2.hp).toBeLessThan(100); expect(state.players.p2.actor.immunity.impact).toBeUndefined();
    expect(state.players.p1.scanAt).toBe(100); expect(state.players.p2.scanAt).toBe(100);
    const hp = state.players.p2.hp;
    applyCoopHazards(state, { p1: path, p2: [] }, 101, 0);
    expect(state.players.p1.actor.criticalCharges).toBe(2); expect(state.players.p2.hp).toBe(hp);
  });
  it('the shared donation contract remains effective and cannot be added during chapter three', () => {
    const ordinary = world(3, 11); expect(ordinary.shared.furnace!.enraged).toBe(true);
    ordinary.run.tokens = 200;
    const refused = applyCoopCommand(ordinary, { type: 'shop-buy', playerId: 'p1', offerId: 'donation' });
    expect(refused.run.donated).toBe(false); expect(refused.run.tokens).toBe(200);
    const donated = createCoopWorld({ ...createRun('7c1382d5-3b81-4054-8d97-7bbfe22e0740', 42), stage: 3, donated: true });
    expect(donated.shared.furnace!.enraged).toBe(false);
  });
  it('Loom unfolds and starts one real collapse timer from either player standing on a node', () => {
    const state = world(4, 0), node = state.shared.loom!.nodes.find(node => node.fragile)!;
    node.expanded = true; Object.assign(state.players.p2.actor, { x: node.x + node.w / 2, y: node.y - 11, grounded: true, standingOn: node.id });
    advanceCoopLoom(state, 100); expect(node.collapseAt).toBe(2100);
    advanceCoopLoom(state, 2101); expect(node.collapsed).toBe(true);
    expect(state.shared.loom!.nodes.find(item => item.id === node.id)!.collapsed).toBe(true);
  });
  it('R changes the one shared timeline atomically for both players, without restoring consumed pickups', () => {
    const state = world(4, 0); state.shared.pickups = [];
    const before = cloneData(state.players);
    expect(tryCoopReroll(state, 100)).toBe(true);
    expect(state.shared.loom!.timeline).toBe(1); expect(state.shared.loom!.rerolls).toBe(1); expect(state.shared.pickups).toHaveLength(0);
    for (const id of ['p1', 'p2'] as const) { expect(state.players[id].history).toHaveLength(1); expect(state.players[id].actor).not.toEqual(before[id].actor); }
    expect(tryCoopReroll(state, 101)).toBe(false);
  });
  it('R fails without any map or position mutation if either player lacks a legal landing', () => {
    const state = world(4, 0); state.players.p2.actor.x = 20000;
    const before = cloneData(state); expect(tryCoopReroll(state, 100)).toBe(false);
    expect(state.shared).toEqual(before.shared); expect(state.players).toEqual(before.players); expect(state.run).toEqual(before.run);
  });
  it('a real left turn by player two opens the shared Leviathan weakness without using player one history', () => {
    const state = world(4), loom = state.shared.loom!; enterLoomArena(playerView(state, 'p1'));
    const anchor = loom.nodes.find(node => node.id === LOOM_ANCHOR_ID)!;
    Object.assign(state.shared.boss, { active: true, action: 'attack', actionUntil: 1000 }); loom.turn.until = 1000; loom.pullSpeed = 80;
    Object.assign(state.players.p1.actor, { x: 2260, y: anchor.y - 11, standingOn: anchor.id, grounded: true });
    Object.assign(state.players.p2.actor, { x: 2224, y: anchor.y - 11, standingOn: anchor.id, grounded: true, facing: -1, vx: -490, dashUntil: 300 });
    state.players.p2.turnStartX = 2260;
    applyCoopHazards(state, { p1: [], p2: [] }, 100, 0);
    expect(state.shared.loom!.turn.successes).toBe(1); expect(state.shared.boss.action).toBe('recover'); expect(state.shared.loom!.turn.weakUntil).toBe(3300);
  });
  it('Leviathan cannot be damaged through its closed shell or skip an actual phase with two shots', () => {
    const state = world(4); Object.assign(state.shared.boss, { active: true, phase: 1 });
    const hit = () => { state.shared.bullets = [shot({ x: state.shared.boss.x, y: state.shared.boss.y, damage: 99999 })]; advanceCoopCombat(state, origins(state), { p1: [], p2: [] }, 100, 0.01); };
    const hp = state.shared.boss.hp; hit(); expect(state.shared.boss.hp).toBe(hp);
    state.shared.loom!.turn.weakUntil = 1000; hit(); expect(state.shared.boss.hp).toBeCloseTo(state.shared.boss.maxHp * 2 / 3, 8);
  });
  it('Omega waits for both living players to physically enter the chamber', () => {
    const state = world(5), door = state.shared.omega!.door;
    Object.assign(state.players.p1.actor, { x: door.x + door.w + 20, y: state.shared.chapter.floor - 11, grounded: true });
    state.players.p2.actor.x = door.x - 30;
    advanceCoopOmega(state, 100); expect(state.shared.omega!.phase).toBe('storm');
    Object.assign(state.players.p2.actor, { x: door.x + door.w + 40, y: state.shared.chapter.floor - 11, grounded: true });
    advanceCoopOmega(state, 200); expect(state.shared.omega!.phase).toBe('chamber');
  });
  it('mirror plans come from one selected player actual behavior, never an interleaved team fiction', () => {
    const state = world(5), mirror = state.shared.omega!.mirror;
    state.shared.omega!.phase = 'duel'; state.shared.boss.active = true; mirror.state = 'idle'; mirror.until = 0;
    state.players.p2.actor.x = mirror.actor.x - 20; state.players.p1.actor.x = mirror.actor.x - 300;
    state.players.p2.actionCounts = { shots: 0, dashes: 10, rewinds: 10, insights: 0 };
    state.players.p2.behavior.counts = { ...state.players.p2.actionCounts };
    state.players.p2.behavior.combos = [{ actions: ['rewinds', 'dashes'], uses: 10, lastAt: 0 }];
    state.players.p1.behavior.combos = [{ actions: ['shots', 'insights'], uses: 20, lastAt: 0 }];
    advanceCoopEncounters(state, 100, TUNING.stepMs / 1000);
    expect(state.targetPlayerId).toBe('p2'); expect(state.shared.omega!.mirror.plan).toEqual(['rewinds', 'dashes']);
  });
  it('final completion writes checkpoint 90 and the real shared Doom ending exactly once', () => {
    const state = world(5); state.run.doom = 79.99; state.shared.boss.active = true; state.shared.boss.hp = 0;
    resolveCoopOutcome(state, 100);
    expect(state.shared.mode).toBe('finished'); expect(state.run.checkpoint).toBe(90); expect(state.run.score).toBe(4000);
    expect(state.events).toContainEqual({ type: 'victory', ending: 'warden' });
    resolveCoopOutcome(state, 101); expect(state.run.score).toBe(4000);
  });
});
