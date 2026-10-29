import { describe, expect, it } from 'vitest';
import { getChapter, isChapterPlayable } from '../../src/pages/GamePage/game/data/chapters';
import { EMPTY_INPUT, BUBBLE_RADIUS, PROBE_RADIUS } from '../../src/pages/GamePage/game/entities/model';
import type { FrameInput, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { advanceFactory, bindPuaBubble, FACTORY_LIMITS, segmentHitsCircle, syncRootBubble } from '../../src/pages/GamePage/game/systems/factory';
import { advanceSydney } from '../../src/pages/GamePage/game/systems/sydney';
import { advanceCombat } from '../../src/pages/GamePage/game/systems/combat';
import { applyProgressionCommand, enterRest, transactShop } from '../../src/pages/GamePage/game/systems/shop';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';

const save = () => ({ ...createRun('968f79d7-179b-4c33-bd87-99de23d909fc', 42), stage: 2 });
const run = (world: WorldState, ticks: number, input: Partial<FrameInput> = {}) => Array.from({ length: ticks }).reduce((state: WorldState) => stepWorld(state, { ...EMPTY_INPUT, ...input }), world);
function freezeDeep(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.values(value).forEach(freezeDeep); Object.freeze(value);
}

describe('chapter registry and vertical checkpoints', () => {
  it('preserves registered chapter two and refuses stage-five checkpoint 99 without altering saves', () => {
    expect(getChapter(2)).toMatchObject({ axis: 'vertical', height: 2040, boss: { kind: 'sydney' } });
    expect(isChapterPlayable(1)).toBe(true); expect(isChapterPlayable(2)).toBe(true); expect(isChapterPlayable(3)).toBe(true);
    [0, 99].forEach(stage => expect(getChapter(stage)).toBeUndefined());
    expect(getChapter(5)).toMatchObject({ boss: { kind: 'mirror' } });
    const future = { ...save(), stage: 5, checkpoint: 99, score: 4000 };
    expect(createWorld(future)).toMatchObject({ mode: 'unavailable', save: future });
  });
  it('restores each vertical checkpoint, clears passed rewards and keeps encoded hack/rest states', () => {
    [11, 12, 21, 22].forEach(checkpoint => {
      const world = createWorld({ ...save(), checkpoint });
      expect(world.mode).toBe('rest');
      expect(world.player.y).toBe(world.chapter.checkpoints[checkpoint % 10].y);
      expect(world.pickups.every(item => item.y < world.player.y)).toBe(true);
      expect(world.factory!.probes.every(item => item.y < world.player.y)).toBe(true);
      const before = JSON.stringify(world);
      expect(run(world, 600, { fire: true, jumpPressed: true })).toBe(world);
      expect(JSON.stringify(world)).toBe(before);
      const continued = applyProgressionCommand(world, { type: 'rest-continue' });
      expect(continued.save.checkpoint).toBe(checkpoint % 10);
      expect(continued.mode).toBe('playing');
    });
  });
  it('allows chapter-two shopping but never an unsupported checkpoint-99 transaction', () => {
    const original = { ...save(), checkpoint: 11, tokens: 200 };
    expect(transactShop(original, 'upgrade:reinforced')).toMatchObject({ ok: true, save: { stage: 2, tokens: 168 } });
    expect(transactShop({ ...original, stage: 5, checkpoint: 99 }, 'upgrade:reinforced').ok).toBe(false);
    const world = createWorld(save()); world.player.y = 1281;
    const next = stepWorld(world, EMPTY_INPUT);
    expect(next.mode).toBe('rest'); expect(next.save.checkpoint).toBe(11);
  });
});

describe('factory hazards, replication and deterministic isolation', () => {
  it('rising sea kills through ordinary invulnerability, dash and real Q rewind', () => {
    for (const defense of ['invulnerable', 'dash', 'rewind']) {
      let world = createWorld(save());
      if (defense === 'rewind') world = run(world, 125);
      if (defense === 'invulnerable') world.player.invulnerableUntil = 100000;
      if (defense === 'dash') world.player.dashUntil = 100000;
      world.factory!.seaY = world.player.y + 10;
      const next = stepWorld(world, { ...EMPTY_INPUT, rewindPressed: defense === 'rewind' });
      expect(next.mode).toBe('dead'); expect(next.save.hp).toBe(0);
      expect(next.events.filter(event => event.type === 'defeat')).toHaveLength(1);
    }
  });
  it('copies from a live probe only, stays bounded and cannot respawn an exterminated population', () => {
    const world = createWorld(save()); const original = world.factory!.probes.length;
    advanceFactory(world, FACTORY_LIMITS.replicateMs + 1, 0);
    expect(world.factory!.probes.length).toBe(original + 1);
    for (let i = 2; i < 15; i += 1) advanceFactory(world, i * FACTORY_LIMITS.replicateMs + 1, 0);
    expect(world.factory!.probes.length).toBeLessThanOrEqual(FACTORY_LIMITS.probeCap);
    world.factory!.probes.forEach(probe => { probe.hp = 0; });
    advanceFactory(world, 100000, 0); advanceFactory(world, 200000, 0);
    expect(world.factory!.probes).toHaveLength(0);
  });
  it('warns before actually consuming optional platforms, never the protected route', () => {
    const world = createWorld(save());
    advanceFactory(world, 0, 0);
    const probe = world.factory!.probes.find(item => item.phase === 'tell')!;
    expect(probe).toBeDefined(); const target = probe.targetPlatformId!;
    expect(world.collapsed).not.toContain(target);
    advanceFactory(world, FACTORY_LIMITS.tellMs - 1, 0);
    expect(world.collapsed).not.toContain(target);
    advanceFactory(world, FACTORY_LIMITS.tellMs + 1, 0);
    expect(world.collapsed).toContain(target); expect(probe.phase).toBe('consume');
    const protectedIds = world.chapter.platforms.filter(platform => platform.protected).map(platform => platform.id);
    expect(world.collapsed.filter(id => protectedIds.includes(id))).toEqual([]);
  });
  it('detaches all nested mutable state and freezes factory, boss and root clocks in rest', () => {
    const world = createWorld(save());
    bindPuaBubble(world, 0);
    const original = JSON.stringify(world); freezeDeep(world);
    const next = stepWorld(world, { ...EMPTY_INPUT, fire: true });
    expect(JSON.stringify(world)).toBe(original); expect(next.factory).not.toBe(world.factory);
    expect(next.factory!.probes[0]).not.toBe(world.factory!.probes[0]);
    const resting = createWorld(save()); enterRest(resting, 1);
    expect(run(resting, 1000, { fire: true, move: 1 })).toBe(resting);
  });
  it('real shots kill a high-altitude probe once, while harmless brackets cannot damage it', () => {
    const world = createWorld(save()); const probe = world.factory!.probes[0];
    const shot = { id: 900, x: probe.x - 30, y: probe.y, vx: 510, vy: 0, radius: 3, damage: 24, faction: 'player' as const, kind: 'dictionary' as const, expiresAt: 10000 };
    world.bullets = [{ ...shot, harmless: true, damage: 1000 }];
    advanceCombat(world, world.player, [], 1, 0.1);
    expect(world.factory!.probes[0].hp).toBe(24);
    world.bullets = [shot, { ...shot, id: 901 }];
    advanceCombat(world, world.player, [], 2, 0.1);
    expect(world.factory!.probes[0].hp).toBe(0);
    expect(world.save.tokens).toBe(5); expect(world.save.score).toBe(100);
  });
  it('uses exported circular hit radii rather than a larger square collider', () => {
    expect(PROBE_RADIUS).toBe(11); expect(BUBBLE_RADIUS).toBe(17);
    expect(segmentHitsCircle({ x: -20, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 0 }, PROBE_RADIUS)).toBe(true);
    expect(segmentHitsCircle({ x: 10, y: 10 }, { x: 11, y: 11 }, { x: 0, y: 0 }, PROBE_RADIUS)).toBe(false);
  });
});

describe('Sydney is not a reskinned Gato', () => {
  it('uses dialogue fans, descending knife lanes and PUA roots across all three phases', () => {
    [1, 2, 3].forEach(phase => {
      const world = createWorld({ ...save(), checkpoint: 2 });
      world.player.x = 150; world.player.y = 289;
      world.boss = { ...world.boss, active: true, hp: phase === 1 ? 420 : phase === 2 ? 250 : 100, phase: phase as 1 | 2 | 3, action: 'tell', actionUntil: 0 };
      const result = advanceSydney(world, 10);
      expect(result.bullets.every(bullet => bullet.kind === 'dialogue' || bullet.kind === 'knife')).toBe(true);
      expect(result.bullets.some(bullet => bullet.kind === 'dialogue')).toBe(phase !== 2);
      expect(result.bullets.some(bullet => bullet.kind === 'knife')).toBe(phase >= 2);
      expect(world.player.rootedBy).not.toBeNull(); expect(world.factory!.bubbles).toHaveLength(1);
    });
  });
  it('never expires an attached control bubble and root blocks motion/dash/Q but permits shots', () => {
    const world = createWorld({ ...save(), checkpoint: 2 });
    world.player.x = 150; world.player.y = 289; world.player.grounded = true;
    bindPuaBubble(world, 0); const binding = world.player.rootedBy;
    syncRootBubble(world, 100000);
    expect(world.player.rootedBy).toBe(binding); expect(world.factory!.bubbles).toHaveLength(1);
    const next = stepWorld(world, { ...EMPTY_INPUT, move: 1, jumpPressed: true, jumpHeld: true, dashPressed: true, rewindPressed: true, fire: true });
    expect(next.player.x).toBe(150); expect(next.save.actionCounts.shots).toBe(1);
    expect(next.save.actionCounts.dashes).toBe(0); expect(next.save.actionCounts.rewinds).toBe(0);
  });
  it.each([10, 630])('keyboard J breaks the bound bubble from world edge x=%s without aim or a soft lock', x => {
    let world = createWorld({ ...save(), checkpoint: 2 });
    world.player.x = x; world.player.y = 289; world.player.grounded = true;
    bindPuaBubble(world, 0);
    expect(world.player.facing).toBe(x > 320 ? -1 : 1);
    world = run(world, 35, { fire: true });
    expect(world.player.rootedBy).toBeNull(); expect(world.factory!.bubbles).toHaveLength(0);
    expect(world.save.actionCounts.shots).toBeGreaterThanOrEqual(2);
  });
  it('harmless Lisp brackets cannot break a PUA bubble', () => {
    const world = createWorld({ ...save(), checkpoint: 2 });
    world.player.x = 150; world.player.y = 289;
    bindPuaBubble(world, 0); const bubble = world.factory!.bubbles[0];
    world.boss.active = true;
    world.bullets = [{ id: 900, x: bubble.x - 3, y: bubble.y, vx: 510, vy: 0, radius: 3, damage: 1000, faction: 'player', kind: 'dictionary', harmless: true, glyph: '(', expiresAt: 10000 }];
    const next = stepWorld(world, EMPTY_INPUT);
    expect(next.factory!.bubbles[0].hp).toBe(FACTORY_LIMITS.bubbleHp);
    expect(next.player.rootedBy).toBe(world.player.rootedBy);
  });
  it('saves stage three before chapter-two clear, without emitting an ending or losing the build', () => {
    const world = createWorld({ ...save(), checkpoint: 2, inventory: ['constitutional', 'residual'], upgrades: ['reinforced'], donated: true });
    world.player.y = 289; world.boss.active = true; world.boss.hp = 0;
    const result = stepWorld(world, EMPTY_INPUT);
    expect(result.mode).toBe('cleared'); expect(result.save.stage).toBe(3);
    expect(result.save.inventory).toEqual(world.save.inventory); expect(result.save.upgrades).toEqual(world.save.upgrades);
    expect(result.save.runId).toBe(world.save.runId); expect(result.save.donated).toBe(true);
    expect(result.events.filter(event => event.type === 'checkpoint' || event.type === 'stage-cleared').map(event => event.type)).toEqual(['checkpoint', 'stage-cleared']);
    expect(result.events.find(event => event.type === 'stage-cleared')).toMatchObject({ stage: 2, save: { stage: 3, checkpoint: 0 } });
    expect(result.events.some(event => 'ending' in event)).toBe(false); expect(isGameSave(result.save)).toBe(true);
  });
});
