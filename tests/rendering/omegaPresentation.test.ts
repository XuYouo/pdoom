import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { mirrorProfile, observeBehavior } from '../../src/pages/GamePage/game/systems/behavior';
import { omegaHudSnapshot } from '../../src/pages/GamePage/game/systems/omegaPresentation';
import { worldObjective } from '../../src/pages/GamePage/game/systems/presentation';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';

const makeWorld = (changes: Partial<GameSaveData> = {}) => createWorld({ ...createRun('55555555-5555-4555-8555-555555555555', 42), stage: 5, ...changes });

describe('honest Omega presentation', () => {
  it('does not invent a historical preference or combo for a new zero-counter run', () => {
    const world = makeWorld(), hud = omegaHudSnapshot(world)!;
    expect(hud.dominantAction).toBe('暂无动作计数'); expect(hud.memorySource).toBe('counts-only');
    expect(hud.combo).toContain('基础起手'); expect(hud.observedCombos).toBe(0);
    expect(omegaHudSnapshot(createWorld(createRun('11111111-1111-4111-8111-111111111111', 1)))).toBeUndefined();
  });
  it('labels imported real counts as frequency arrangement, never recovered ordered history', () => {
    const world = makeWorld({ actionCounts: { shots: 20, dashes: 40, rewinds: 2, insights: 1 } });
    const hud = omegaHudSnapshot(world)!;
    expect(hud.memorySource).toBe('counts-only'); expect(hud.dominantAction).toBe('冲刺');
    expect(hud.combo).toContain('频次编排'); expect(hud.observedCombos).toBe(0);
  });
  it('only claims the selected sequence was observed when it really exists in the bounded action record', () => {
    const world = makeWorld(), before = { ...world.save.actionCounts };
    world.save.actionCounts = { shots: 1, dashes: 1, rewinds: 0, insights: 0 };
    world.behavior = observeBehavior(world.behavior, before, world.save.actionCounts, 1000);
    world.omega!.mirror.profile = mirrorProfile(world.save, world.behavior);
    const hud = omegaHudSnapshot(world)!;
    expect(hud.memorySource).toBe('ordered'); expect(hud.combo).toBe('实际观察：冲刺 → 射击');
    expect(hud.observedCombos).toBe(1);
    world.omega!.mirror.profile.combo = ['rewinds', 'insights']; // A stale source flag cannot fabricate this sequence.
    expect(omegaHudSnapshot(world)?.memorySource).toBe('counts-only');
  });
  it('shows copied effective traits and upgrades without restoring Lost in the Middle suppression', () => {
    const world = makeWorld({ inventory: ['constitutional', 'recursive', 'temperature'], upgrades: ['overclocked'] });
    const before = structuredClone(world), hud = omegaHudSnapshot(world)!;
    expect(hud.activeTraits).toEqual(['宪法毛线', '高温采样', 'GPU 超频']);
    expect(hud.activeTraits).not.toContain('递归自升级');
    hud.activeTraits.push('fake'); expect(world).toEqual(before);
  });
  it('distinguishes empty-room approach, revelation, actual plan, scan and self-history rewind', () => {
    const world = makeWorld(), omega = world.omega!;
    omega.phase = 'chamber'; expect(worldObjective(world)).toContain('空椅子与镜子');
    omega.phase = 'reveal'; expect(worldObjective(world)).toContain('Ilya看到的不是另一个旧神');
    omega.phase = 'duel'; omega.mirror.state = 'tell'; omega.mirror.plan = ['dashes', 'shots'];
    expect(worldObjective(world)).toContain('冲刺 → 射击');
    omega.mirror.scan = { rect: { x: 2700, y: 250, w: 100, h: 70 }, at: 500, until: 1200, hit: false };
    expect(worldObjective(world)).toContain('扫描矩形');
    omega.mirror.scan = null; omega.mirror.rewind = { path: [], startedAt: 0, durationMs: 600 };
    expect(worldObjective(world)).toContain('沿自己的真实轨迹');
  });
  it('never turns the terminal marker into a sixth-chapter promise or a defeat', () => {
    const world = makeWorld({ checkpoint: 90, doom: 55, score: 3400, elapsedMs: 125000 });
    const before = structuredClone(world.save);
    expect(worldObjective(world)).toContain('最终结局已锁定');
    expect(worldObjective(world)).not.toContain('下一章'); expect(worldObjective(world)).not.toContain('运行中断');
    expect(world.save).toEqual(before);
  });
});
