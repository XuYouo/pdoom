import { describe, expect, it } from 'vitest';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { getChapter } from '../../src/pages/GamePage/game/data/chapters';
import { generateLoomNodes, LOOM_ANCHOR_ID, LOOM_NODE_LIMIT, LOOM_SWALLOW_ORDER, loomRandom, validateLoomGraph } from '../../src/pages/GamePage/game/data/loomGraph';
import { bossRect, EMPTY_INPUT, LEVIATHAN_SIZE } from '../../src/pages/GamePage/game/entities/model';
import type { FrameInput, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { worldPlatforms } from '../../src/pages/GamePage/game/systems/platforms';
import { enterLoomArena, LOOM_RULES } from '../../src/pages/GamePage/game/systems/loom';
import { advanceCombat } from '../../src/pages/GamePage/game/systems/combat';
import { advanceLeviathan } from '../../src/pages/GamePage/game/systems/leviathan';
import { samplePlayer } from '../../src/pages/GamePage/game/systems/rewind';
import { applyProgressionCommand, transactShop } from '../../src/pages/GamePage/game/systems/shop';

const save = (seed = 42) => ({ ...createRun('3c530bfa-8da0-4d57-a907-b19ebbb2e808', seed), stage: 4 });
const run = (start: WorldState, frames: number, input: Partial<FrameInput> = {}) => {
  let world = start; for (let index = 0; index < frames; index += 1) world = stepWorld(world, { ...EMPTY_INPUT, ...input }); return world;
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
/** Local mechanism fixtures may choose a phase; complete-input proofs never change HP or positions. */
function arena(phase: 1 | 2 | 3 = 1) {
  const world = createWorld({ ...save(), checkpoint: 2 });
  world.player = { ...world.player, x: 2262, y: 509, grounded: true, standingOn: LOOM_ANCHOR_ID };
  world.history = [samplePlayer(world.player, world.save.elapsedMs)];
  world.boss = { ...world.boss, active: true, phase, hp: (4 - phase) * 140, action: 'recover', actionUntil: 0 };
  enterLoomArena(world); return world;
}
function untilAttack(start: WorldState) {
  let world = start; for (let index = 0; index < 100 && world.boss.action !== 'attack'; index += 1) world = stepWorld(world, EMPTY_INPUT);
  expect(world.boss.action).toBe('attack'); return world;
}
function hitBoss(world: WorldState, damage: number, now: number) {
  world.bullets = [{ id: 900, x: world.boss.x - 90, y: world.boss.y, vx: 510, vy: 0, radius: 3, damage, faction: 'player', kind: 'dictionary', expiresAt: now + 1000 }];
  advanceCombat(world, world.player, [], now, 0.05);
}

describe('bounded deterministic Loom geometry', () => {
  it('pins its owned unsigned PRNG and deterministically handles the zero seed', () => {
    const random = loomRandom(1);
    expect(Array.from({ length: 5 }, () => random())).toEqual([270369, 67634689, 2647435461, 307599695, 2398689233]);
    const zeroA = loomRandom(0); const zeroB = loomRandom(0);
    expect([zeroA(), zeroA(), zeroA()]).toEqual([zeroB(), zeroB(), zeroB()]);
    expect(loomRandom(0)()).toBeGreaterThan(0);
  });
  it('checks every branch and checkpoint across 128 seeds in both physical timelines', () => {
    const topologies = new Set<string>();
    for (let seed = 0; seed < 128; seed += 1) for (const timeline of [0, 1] as const) for (let room = 0; room < 3; room += 1) {
      const nodes = generateLoomNodes(seed, timeline, room);
      expect(nodes.length).toBeLessThanOrEqual(LOOM_NODE_LIMIT); expect(validateLoomGraph(nodes, room)).toEqual([]);
      expect(nodes).toEqual(generateLoomNodes(seed, timeline, room));
      if (room === 0) {
        const branches = nodes.filter(node => node.branch === 'upper' || node.branch === 'lower');
        topologies.add(branches.map(node => node.id).join(','));
        expect(nodes.find(node => node.id === 'loom-hub-0')!.next).toHaveLength(2);
      }
    }
    expect(topologies.size).toBeGreaterThan(4);
    expect(generateLoomNodes(42, 0)).not.toEqual(generateLoomNodes(42, 1));
  });
  it('registers a high horizontal world with no continuous bypass floor and keeps stage five honest', () => {
    expect(getChapter(4)).toMatchObject({ width: 2580, height: 640, axis: 'horizontal', platforms: [], boss: { kind: 'leviathan' } });
    expect(getChapter(5)).toMatchObject({ boss: { kind: 'mirror' } }); expect(getChapter(2)!.arena.trigger).toBe(289);
    const future = { ...save(), stage: 5, checkpoint: 99, score: 9800 }; expect(createWorld(future)).toMatchObject({ mode: 'unavailable', save: future });
    expect(transactShop({ ...save(), checkpoint: 11, tokens: 100 }, 'upgrade:reinforced').ok).toBe(true);
    expect(transactShop({ ...save(), checkpoint: 11, tokens: 100 }, 'donation').ok).toBe(false);
  });
  it('actually unfolds nearby connected collision nodes and leaves distant nodes absent', () => {
    const initial = createWorld(save()); expect(worldPlatforms(initial)).toHaveLength(1);
    const next = stepWorld(initial, EMPTY_INPUT);
    expect(worldPlatforms(next).length).toBeGreaterThan(1);
    expect(next.loom!.nodes.find(node => node.id === 'loom-hub-3')!.expanded).toBe(false);
    expect(worldPlatforms(next).every(platform => next.loom!.nodes.find(node => node.id === platform.id) === platform)).toBe(true);
    expect(worldPlatforms(next).every(platform => next.loom!.nodes.find(node => node.id === platform.id)!.expanded)).toBe(true);
  });
  it('warns before removing a stood-on branch from real collisions, then R rescues the fall', () => {
    let world = createWorld(save()); const node = world.loom!.nodes.find(item => item.id === 'loom-0-upper-1')!;
    node.expanded = true; world.player = { ...world.player, x: node.x + node.w / 2, y: node.y - 11, grounded: true, standingOn: node.id };
    world = stepWorld(world, EMPTY_INPUT); const deadline = world.loom!.nodes.find(item => item.id === node.id)!.collapseAt!;
    expect(deadline - world.save.elapsedMs).toBe(LOOM_RULES.collapseMs);
    while (world.save.elapsedMs + 17 < deadline) world = stepWorld(world, EMPTY_INPUT);
    expect(worldPlatforms(world).some(item => item.id === node.id)).toBe(true);
    world = run(world, 4); expect(worldPlatforms(world).some(item => item.id === node.id)).toBe(false);
    expect(world.player.grounded).toBe(false); expect(world.player.vy).toBeGreaterThan(0);
    const rescued = stepWorld(world, { ...EMPTY_INPUT, rerollPressed: true });
    expect(rescued.player.grounded).toBe(true); expect(rescued.loom!.rerolls).toBe(1);
    const support = worldPlatforms(rescued).find(item => item.id === rescued.player.standingOn)!;
    expect(rescued.player.y + 11).toBeCloseTo(support.y, 6); expect(rescued.save.hp).toBe(100);
  });
});

describe('R contracts and immutable checkpoint reconstruction', () => {
  it('changes real geometry and shared-hub position, cools down and resets rather than joins Q histories', () => {
    const previous = run(createWorld(save()), 125);
    const next = stepWorld(previous, { ...EMPTY_INPUT, rerollPressed: true });
    expect(next.loom!.timeline).toBe(1); expect(next.loom!.nodes).not.toEqual(previous.loom!.nodes);
    expect(next.player.x).not.toBe(previous.player.x); expect(next.history).toHaveLength(1);
    expect(next.save.actionCounts).toEqual(previous.save.actionCounts);
    const denied = stepWorld(next, { ...EMPTY_INPUT, rerollPressed: true, rewindPressed: true });
    expect(denied.loom!.rerolls).toBe(1); expect(denied.rewind).toBeNull(); expect(denied.save.actionCounts.rewinds).toBe(0);
    const ready = run(denied, 121); const rewind = stepWorld(ready, { ...EMPTY_INPUT, rewindPressed: true });
    expect(rewind.rewind).not.toBeNull(); expect(rewind.rewind!.path[0].x).toBe(next.player.x);
  });
  it('cannot act in other chapters, in rest, or during a genuine recorded Q', () => {
    for (const stage of [1, 2, 3]) {
      const original = createWorld({ ...save(), stage }); const next = stepWorld(original, { ...EMPTY_INPUT, rerollPressed: true });
      expect(next.loom).toBeNull(); expect(next.save.actionCounts).toEqual(original.save.actionCounts);
    }
    const resting = createWorld({ ...save(), checkpoint: 11 }); const before = JSON.stringify(resting);
    expect(run(resting, 600, { rerollPressed: true, fire: true, dashPressed: true })).toBe(resting); expect(JSON.stringify(resting)).toBe(before);
    const recorded = run(createWorld(save()), 125); const q = stepWorld(recorded, { ...EMPTY_INPUT, rewindPressed: true });
    expect(q.rewind).not.toBeNull(); const denied = stepWorld(q, { ...EMPTY_INPUT, rerollPressed: true });
    expect(denied.loom!.timeline).toBe(0); expect(denied.loom!.rerolls).toBe(0); expect(denied.rewind).not.toBeNull();
  });
  it('cannot cross the next checkpoint even when rerolling from its leading platform', () => {
    const world = createWorld(save()); world.player = { ...world.player, x: 679, y: 349, grounded: true, standingOn: 'loom-hub-1' };
    world.loom!.nodes.find(node => node.id === 'loom-hub-1')!.expanded = true;
    const next = stepWorld(world, { ...EMPTY_INPUT, rerollPressed: true });
    expect(next.player.x).toBeLessThan(680); expect(next.save.checkpoint).toBe(0);
    expect(next.events.some(event => event.type === 'checkpoint')).toBe(false);
  });
  it('keeps swallowed cells absent and places an arena R on a real safe support without a fake turn', () => {
    const world = untilAttack(arena(3)); const next = stepWorld(world, { ...EMPTY_INPUT, rerollPressed: true });
    expect(next.loom!.rerolls).toBe(1); expect(next.save.checkpoint).toBe(2); expect(next.loom!.eaten).toEqual([...LOOM_SWALLOW_ORDER]);
    expect(worldPlatforms(next).filter(node => next.loom!.nodes.find(item => item.id === node.id)!.branch === 'arena').map(node => node.id)).toEqual([LOOM_ANCHOR_ID]);
    expect(next.player.x).toBeGreaterThanOrEqual(next.chapter.arena.x + 12); expect(next.player.x).toBeLessThanOrEqual(next.chapter.arena.x + next.chapter.arena.w - 12);
    expect(next.player.standingOn).toBe(LOOM_ANCHOR_ID); expect(next.loom!.turn.successes).toBe(0); expect(next.history).toHaveLength(1);
  });
  it('deeply detaches graph edges, swallow state, turn state and reroll endpoints on a tick', () => {
    const world = stepWorld(createWorld(save()), { ...EMPTY_INPUT, rerollPressed: true });
    world.loom!.swallow = { ids: [LOOM_SWALLOW_ORDER[0]], at: 5000 };
    const before = JSON.stringify(world); freeze(world); const next = stepWorld(world, EMPTY_INPUT);
    expect(JSON.stringify(world)).toBe(before); expect(next.loom).not.toBe(world.loom);
    expect(next.loom!.nodes[0].next).not.toBe(world.loom!.nodes[0].next); expect(next.loom!.eaten).not.toBe(world.loom!.eaten);
    expect(next.loom!.swallow!.ids).not.toBe(world.loom!.swallow!.ids); expect(next.loom!.turn).not.toBe(world.loom!.turn);
    expect(next.loom!.narrow).not.toBe(world.loom!.narrow); expect(next.loom!.lastReroll!.from).not.toBe(world.loom!.lastReroll!.from); expect(next.loom!.lastReroll!.to).not.toBe(world.loom!.lastReroll!.to);
  });
  it.each([11, 12, 21, 22])('restores seed/checkpoint %s canonically without replaying passed rewards or runtime R', checkpoint => {
    const saved = { ...save(77), checkpoint, tokens: 123, score: 989, elapsedMs: 12000 }; const room = checkpoint % 10;
    const world = createWorld(saved);
    expect(world.mode).toBe('rest'); expect(world.save).toEqual(saved); expect(world.loom).toMatchObject({ timeline: 0, rerolls: 0, hpUiTaken: false, stemsLost: 0 });
    expect(world.loom!.nodes).toEqual(generateLoomNodes(77, 0, room)); expect(world.loom!.nodes.every(node => node.segment >= room)).toBe(true);
    expect(world.pickups.every(pickup => pickup.x > world.player.x)).toBe(true);
    expect(world.events.some(event => event.type === 'checkpoint')).toBe(false);
    const continued = applyProgressionCommand(world, { type: 'rest-continue' }); expect(continued.save.tokens).toBe(123); expect(continued.save.checkpoint).toBe(room);
  });
});

describe('Loom physical checkpoint and arena gates', () => {
  it.each([1, 2])('does not pull a fallen lower-route player up through checkpoint %s', room => {
    const world = createWorld({ ...save(), checkpoint: room - 1 }); const point = world.chapter.checkpoints[room];
    world.loom!.nodes.forEach(node => { node.expanded = true; });
    world.player = { ...world.player, x: point.x - 2, y: 390, vx: 190, vy: 0, grounded: false, standingOn: null };
    const next = stepWorld(world, { ...EMPTY_INPUT, move: 1 });
    expect(next.player.x).toBeGreaterThan(point.trigger); expect(next.player.y).toBeGreaterThan(390);
    expect(next.mode).toBe('playing'); expect(next.save.checkpoint).toBe(room - 1);
    expect(next.events.some(event => event.type === 'checkpoint')).toBe(false);
  });
  it.each([1, 2])('does enter checkpoint %s after a real supported arrival', room => {
    const world = createWorld({ ...save(), checkpoint: room - 1 }); const point = world.chapter.checkpoints[room];
    world.loom!.nodes.forEach(node => { node.expanded = true; });
    world.player = { ...world.player, x: point.x - 2, y: 349, vx: 190, vy: 0, grounded: true, standingOn: `loom-hub-${room}` };
    const next = stepWorld(world, { ...EMPTY_INPUT, move: 1 });
    expect(next.mode).toBe('rest'); expect(next.save.checkpoint).toBe(10 + room); expect(next.player.y).toBe(349);
  });
  it('admits the bounded door above the island without ever lifting from underneath it', () => {
    const world = createWorld(save()); world.loom!.nodes.forEach(node => { node.expanded = true; });
    world.player = { ...world.player, x: 679, y: 320, vx: 190, vy: 0, grounded: false, standingOn: null };
    const next = stepWorld(world, { ...EMPTY_INPUT, move: 1 });
    expect(next.mode).toBe('rest'); expect(next.save.checkpoint).toBe(11); expect(next.player.y).toBeGreaterThan(world.player.y);
  });
  it.each([0, 1])('does not lock a falling body beneath the actual timeline %s arena floor', timeline => {
    let world = createWorld({ ...save(), checkpoint: 2 });
    if (timeline) world = stepWorld(world, { ...EMPTY_INPUT, rerollPressed: true });
    world.loom!.nodes.forEach(node => { node.expanded = true; });
    const floor = world.loom!.nodes.find(node => node.id === LOOM_ANCHOR_ID)!.y;
    world.player = { ...world.player, x: 1958, y: floor - 8, vx: 190, vy: 0, grounded: false, standingOn: null };
    const next = stepWorld(world, { ...EMPTY_INPUT, move: 1 });
    expect(next.player.x).toBeGreaterThan(next.chapter.arena.trigger); expect(next.player.y + 11).toBeGreaterThan(floor);
    expect(next.boss.active).toBe(false);
    if (timeline) expect(floor).toBe(508);
  });
  it('does not lock the camera while the head would be above its arena viewport', () => {
    const world = createWorld({ ...save(), checkpoint: 2 }); world.loom!.nodes.forEach(node => { node.expanded = true; });
    world.player = { ...world.player, x: 1958, y: 205, vx: 190, vy: 0, grounded: false, standingOn: null };
    const next = stepWorld(world, { ...EMPTY_INPUT, move: 1 });
    expect(next.player.x).toBeGreaterThan(next.chapter.arena.trigger); expect(next.player.y - 11).toBeLessThan(next.chapter.arena.y); expect(next.boss.active).toBe(false);
  });
  it.each([0, 1])('activates the arena for a real body above timeline %s support', timeline => {
    let world = createWorld({ ...save(), checkpoint: 2 });
    if (timeline) world = stepWorld(world, { ...EMPTY_INPUT, rerollPressed: true });
    world.loom!.nodes.forEach(node => { node.expanded = true; });
    const floor = world.loom!.nodes.find(node => node.id === LOOM_ANCHOR_ID)!.y;
    world.player = { ...world.player, x: 1958, y: floor - 11, vx: 190, vy: 0, grounded: true, standingOn: LOOM_SWALLOW_ORDER[0] };
    const next = stepWorld(world, { ...EMPTY_INPUT, move: 1 });
    expect(next.boss.active).toBe(true); expect(next.player.y + 11).toBe(floor); expect(next.player.y - 11).toBeGreaterThanOrEqual(next.chapter.arena.y);
  });
  it('resolves Loom void death before any pickup or checkpoint reward', () => {
    const world = createWorld(save()); const tokens = world.save.tokens; const score = world.save.score;
    world.player = { ...world.player, x: 678, y: 704, vx: 190, vy: 620, grounded: false, standingOn: null };
    world.pickups = [{ id: 'void-token-fixture', kind: 'token', x: 682, y: 714, amount: 99 }, { id: 'void-heal-fixture', kind: 'heal', x: 682, y: 714, amount: 100 }];
    const next = stepWorld(world, { ...EMPTY_INPUT, move: 1 });
    expect(next.mode).toBe('dead'); expect(next.save.hp).toBe(0); expect(next.save.checkpoint).toBe(0);
    expect(next.save.tokens).toBe(tokens); expect(next.save.score).toBe(score); expect(next.pickups).toHaveLength(2);
    expect(next.events.some(event => event.type === 'checkpoint')).toBe(false);
  });
});

describe('Leviathan real consumption and sharp-turn damage gates', () => {
  it('uses the visible 144-square contact domain, leaving old boss rectangles unchanged', () => {
    expect(LEVIATHAN_SIZE).toBe(144); expect(bossRect({ x: 2490, y: 448, kind: 'leviathan' })).toEqual({ x: 2418, y: 376, w: 144, h: 144 });
    expect(bossRect({ x: 100, y: 100, kind: 'basilisk' })).toEqual({ x: 74, y: 63, w: 52, h: 74 });
  });
  it('telegraphs real edge-platform loss without falsifying HP, and an affected player really falls', () => {
    let world = arena(); world.player.x = 1990; world.player.standingOn = LOOM_SWALLOW_ORDER[0];
    world = stepWorld(world, EMPTY_INPUT); expect(world.boss.action).toBe('tell');
    expect(world.loom!.swallow!.ids).toHaveLength(2); expect(world.loom!.eaten).toEqual([]); expect(world.loom!.hpUiTaken).toBe(false);
    const hp = world.save.hp; world = untilAttack(world); expect(world.loom!.eaten).toHaveLength(2);
    expect(world.loom!.hpUiTaken).toBe(true); expect(world.loom!.stemsLost).toBe(2); expect(world.save.hp).toBe(hp);
    expect(worldPlatforms(world).some(node => node.id === LOOM_SWALLOW_ORDER[0])).toBe(false);
    world = run(world, 2); expect(world.player.grounded).toBe(false); expect(world.player.y).toBeGreaterThan(509);
    const rescued = stepWorld(world, { ...EMPTY_INPUT, rerollPressed: true }); expect(rescued.player.grounded).toBe(true);
    expect(rescued.loom!.eaten).toEqual(world.loom!.eaten); expect(worldPlatforms(rescued).some(node => node.id === LOOM_SWALLOW_ORDER[0])).toBe(false);
  });
  it('shrinks 640 to 410 to about 300 to under 200, never consuming the protected anchor', () => {
    const widths = [1, 2, 3].map(phase => {
      const world = untilAttack(arena(phase as 1 | 2 | 3));
      expect(worldPlatforms(world).some(node => node.id === LOOM_ANCHOR_ID)).toBe(true);
      expect(world.loom!.eaten).toHaveLength(phase + 1); expect(world.loom!.stemsLost).toBe(phase + 1);
      return world.loom!.narrow.w;
    });
    expect(widths[0]).toBe(410); expect(widths[1]).toBeLessThan(widths[0]); expect(widths[2]).toBeLessThanOrEqual(200);
  });
  it('ordinary left walking across the line does not fake a dash counter', () => {
    const world = run(untilAttack(arena(3)), 75, { move: -1 });
    expect(world.player.x).toBeLessThan(world.loom!.turn.lineX - 14); expect(world.loom!.turn.successes).toBe(0); expect(world.loom!.turn.weakUntil).toBe(0);
  });
  it('a real narrow left dash opens the weak point and temporarily returns UI/audio during play', () => {
    let world = untilAttack(arena(3)); const before = world.player.x; const hp = world.save.hp;
    world = stepWorld(world, { ...EMPTY_INPUT, move: -1, dashPressed: true });
    for (let index = 0; index < 12 && world.loom!.turn.successes === 0; index += 1) world = stepWorld(world, { ...EMPTY_INPUT, move: -1 });
    expect(world.loom!.turn.successes).toBe(1); expect(before - world.player.x).toBeGreaterThanOrEqual(32);
    expect(world.loom!.narrow.w).toBeLessThanOrEqual(200); expect(world.loom).toMatchObject({ hpUiTaken: false, stemsLost: 0 });
    expect(world.save.hp).toBe(hp); expect(world.mode).toBe('playing'); expect(world.loom!.turn.weakUntil).toBeGreaterThan(world.save.elapsedMs);
    expect(world.loom!.eaten).toHaveLength(4); expect(world.save.actionCounts.dashes).toBe(1);
    for (let index = 0; index < 300 && world.boss.action !== 'tell' && world.mode === 'playing'; index += 1) world = stepWorld(world, EMPTY_INPUT);
    expect(world.boss.action).toBe('tell');
    expect(world.loom).toMatchObject({ hpUiTaken: true, stemsLost: 4 }); expect(world.loom!.eaten).toHaveLength(4);
  });
  it('J cannot pierce the shell, and even extreme critical damage cannot skip a turn phase', () => {
    const world = arena(); hitBoss(world, 1000000, 10); expect(world.boss.hp).toBe(420);
    world.loom!.turn.weakUntil = 1000; hitBoss(world, 1000000, 11); expect(world.boss.hp).toBe(280);
    world.boss = advanceLeviathan(world, 12).boss; expect(world.boss.phase).toBe(2); expect(world.loom!.turn.weakUntil).toBe(0);
    hitBoss(world, 1000000, 13); expect(world.boss.hp).toBe(280);
    world.loom!.turn.weakUntil = 1000; hitBoss(world, 1000000, 14); expect(world.boss.hp).toBe(140);
  });
  it('clears only chapter four, restores presentation, and saves valid stage five without a fabricated ending', () => {
    const world = untilAttack(arena(3)); world.boss.hp = 0;
    const clear = stepWorld(world, EMPTY_INPUT);
    expect(clear.mode).toBe('cleared'); expect(clear.loom).toMatchObject({ hpUiTaken: false, stemsLost: 0, pullSpeed: 0 });
    expect(clear.save).toMatchObject({ stage: 5, checkpoint: 0, schemaVersion: 1 }); expect(isGameSave(clear.save)).toBe(true);
    expect(clear.events.some(event => event.type === 'stage-cleared' && event.stage === 4)).toBe(true);
    expect(clear.events.some(event => event.type === 'checkpoint' && event.save.stage === 5)).toBe(true);
    expect(createWorld(clear.save)).toMatchObject({ mode: 'playing', save: clear.save, omega: { phase: 'storm' } });
    const unsupported = { ...clear.save, checkpoint: 99 };
    expect(createWorld(unsupported)).toMatchObject({ mode: 'unavailable', save: unsupported });
    expect(Object.keys(clear.save.actionCounts).sort()).toEqual(['dashes', 'insights', 'rewinds', 'shots']);
  });
});
