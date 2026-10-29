import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { loomHudSnapshot, worldObjective } from '../../src/pages/GamePage/game/systems/presentation';
import { advanceLeviathan } from '../../src/pages/GamePage/game/systems/leviathan';

const furnace = (donated = false) => createWorld({ ...createRun('33333333-3333-4333-8333-333333333333', 42), stage: 3, donated });

describe('third-chapter low-frequency presentation', () => {
  it('reports the locked donation outcome rather than a generic Gato objective', () => {
    const unpaid = furnace(); unpaid.boss.active = true;
    const paid = furnace(true); paid.boss.active = true;
    expect(worldObjective(unpaid)).toContain('未捐款狂暴');
    expect(worldObjective(paid)).toContain('已捐款抑制狂暴');
    expect(worldObjective(unpaid)).not.toContain('Gato');
  });
  it('only announces riding or the secret room when the actual supporting platform matches', () => {
    const world = furnace();
    expect(worldObjective(world)).not.toContain('正在乘坐');
    world.player.standingOn = 'nvda-lift';
    expect(worldObjective(world)).toContain('正在乘坐K线');
    world.player.standingOn = 'secret-room';
    expect(worldObjective(world)).toContain('已抵达K线隐藏房');
  });
  it('explains petrification without promising an automatic teleport behind the boss', () => {
    const world = furnace(); world.boss.active = true;
    world.player.petrifiedUntil = 1200;
    expect(worldObjective(world)).toContain('石化：Q就绪后');
    expect(worldObjective(world)).toContain('不会自动传送身后');
  });
  it('keeps safe-room clock language independent of a particular chapter hazard', () => {
    const world = furnace(); world.mode = 'rest';
    expect(worldObjective(world)).toContain('世界与机关计时冻结');
  });
  it('reports the cleared third world while offering the now playable fourth entrance explicitly', () => {
    const world = furnace(); world.mode = 'cleared'; world.save.stage = 4;
    expect(worldObjective(world)).toContain('第 3 章通过，第 4 章入口已保存');
    expect(worldObjective(world)).toContain('从页面明确继续下一章');
    expect(worldObjective(world)).toContain('不是最终结局');
  });
});

const loomWorld = () => createWorld({ ...createRun('44444444-4444-4444-8444-444444444444', 42), stage: 4 });

describe('Loom low-frequency presentation', () => {
  it('exports only the small UI contract and never mutates the actual health', () => {
    const world = loomWorld(); expect(world.loom).not.toBeNull();
    world.save.hp = 83;
    world.loom!.hpUiTaken = true; world.loom!.stemsLost = 4; world.loom!.narrow.w = 180;
    const hud = loomHudSnapshot(world)!;
    expect(hud).toMatchObject({ hpUiTaken: true, stemsLost: 4, narrow: true });
    expect(Object.keys(hud).sort()).toEqual(['timeline', 'rerollReady', 'hpUiTaken', 'stemsLost', 'narrow', 'sharpTurnReady'].sort());
    expect(world.save.hp).toBe(83); expect(loomHudSnapshot(furnace())).toBeUndefined();
  });
  it('honors mode, cooldown and actual rewind gating for R readiness', () => {
    const world = loomWorld(); world.loom!.rerollReadyAt = world.save.elapsedMs;
    expect(loomHudSnapshot(world)?.rerollReady).toBe(true);
    world.loom!.rerollReadyAt = world.save.elapsedMs + 1000;
    expect(loomHudSnapshot(world)?.rerollReady).toBe(false);
    world.loom!.rerollReadyAt = 0;
    world.rewind = { path: [{ at: 0, x: 100, y: 349, vx: 0, vy: 0, facing: 1 }], startedAt: 0, durationMs: 600 };
    expect(loomHudSnapshot(world)?.rerollReady).toBe(false);
    world.rewind = null; world.mode = 'rest';
    expect(loomHudSnapshot(world)?.rerollReady).toBe(false);
    expect(worldObjective(world)).toContain('世界与机关计时冻结');
  });
  it('distinguishes the real left-turn window from the opened weak point', () => {
    const world = loomWorld(); world.boss.active = true;
    world.loom!.turn.until = world.save.elapsedMs + 1000;
    world.player.x = world.loom!.turn.lineX + 20;
    expect(loomHudSnapshot(world)?.sharpTurnReady).toBe(true);
    expect(worldObjective(world)).toContain('A + Shift向左冲过金色标线');
    world.loom!.turn.weakUntil = world.save.elapsedMs + 500;
    expect(loomHudSnapshot(world)?.sharpTurnReady).toBe(false);
    expect(worldObjective(world)).toContain('弱点已开');
  });
  it('does not promise another platform collapse when a repeated phase has no new targets', () => {
    const world = loomWorld(); world.boss.active = true; world.boss.action = 'recover'; world.boss.actionUntil = 0;
    const first = advanceLeviathan(world, 0); world.boss = first.boss;
    expect(world.loom!.swallow!.ids).toHaveLength(2);
    expect(worldObjective(world)).toContain('橙框平台将真实消失');
    world.loom!.eaten = [...world.loom!.swallow!.ids];
    world.boss.action = 'recover'; world.boss.actionUntil = 0;
    const repeated = advanceLeviathan(world, 0); world.boss = repeated.boss;
    expect(world.loom!.swallow!.ids).toHaveLength(0);
    expect(worldObjective(world)).toContain('本轮无新增平台消失');
    expect(repeated.events).toContainEqual(expect.objectContaining({ type: 'notice', message: expect.stringContaining('本轮无新增平台消失') }));
  });
  it('preserves the fifth entrance without inventing a final ending', () => {
    const world = loomWorld(); world.mode = 'cleared'; world.save.stage = 5;
    expect(worldObjective(world)).toContain('第 4 章通过，第 5 章入口已保存');
    expect(worldObjective(world)).toContain('从页面明确继续下一章');
    expect(worldObjective(world)).toContain('不是最终结局');
  });
});

describe('first-chapter current hazards rather than historical notices', () => {
  const first = () => createWorld({ ...createRun('11111111-1111-4111-8111-111111111111', 42), checkpoint: 1, elapsedMs: 10000, doom: 92 });
  it('reads actual inversion time, expires at the controller boundary and never mutates a snapshot', () => {
    const world = first(); world.player.invertedUntil = 11700;
    const before = JSON.stringify(world); expect(worldObjective(world)).toBe('重力反转 · 1.7 秒；顶部安全，A/D仍可移动'); expect(JSON.stringify(world)).toBe(before);
    world.save.elapsedMs = 11501; expect(worldObjective(world)).toContain('0.2 秒');
    world.save.elapsedMs = 11700; expect(worldObjective(world)).not.toContain('重力反转');
  });
  it('does not invent a pending collapse merely from high Doom or a fragile support', () => {
    const world = first(); world.player.standingOn = 'shroom-canopy'; expect(worldObjective(world)).not.toContain('裂纹平台');
  });
  it('requires real support and a real Core deadline, retaining zero until Core actually removes it', () => {
    const world = first(); world.player.standingOn = 'shroom-canopy'; world.collapseAt['shroom-canopy'] = 10750;
    expect(worldObjective(world)).toContain('0.8 秒后坍塌');
    world.save.elapsedMs = 10800; expect(worldObjective(world)).toContain('0.0 秒后坍塌');
    world.collapsed = ['shroom-canopy']; expect(worldObjective(world)).not.toContain('裂纹平台');
  });
  it('stops warning about a platform after the player leaves it', () => {
    const world = first(); world.collapseAt['shroom-canopy'] = 10750; world.player.standingOn = null; expect(worldObjective(world)).not.toContain('裂纹平台');
  });
  it('preserves mode priorities and does not promise A/D steering during actual rewind', () => {
    const world = first(); world.player.invertedUntil = 11700; world.mode = 'rest'; expect(worldObjective(world)).toContain('计时冻结');
    world.mode = 'playing'; world.rewind = { path: [{ at: 10000, x: 1380, y: 309, vx: 0, vy: 0, facing: 1 }], startedAt: 10000, durationMs: 600 };
    expect(worldObjective(world)).not.toContain('A/D仍可移动');
  });
  it('leaves later-chapter objectives in their existing systems', () => {
    const world = furnace(); world.player.invertedUntil = 1000; expect(worldObjective(world)).not.toContain('重力反转');
  });
});
