import { beforeEach, describe, expect, it, vi } from 'vitest';
const core = vi.hoisted(() => ({ create: vi.fn(), step: vi.fn(), apply: vi.fn() }));
vi.mock('phaser', () => ({ Scene: class {} }));
vi.mock('../../src/pages/GamePage/game/systems/simulation', async original => ({
  ...await original<typeof import('../../src/pages/GamePage/game/systems/simulation')>(), createWorld: core.create, stepWorld: core.step,
}));
vi.mock('../../src/pages/GamePage/game/systems/shop', async original => ({
  ...await original<typeof import('../../src/pages/GamePage/game/systems/shop')>(), applyProgressionCommand: core.apply,
}));
import { WorldScene } from '../../src/pages/GamePage/game/scenes/WorldScene';
import { GameBridge, type GameCommand } from '../../src/pages/GamePage/game/bridge';
import type { WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
interface Probe {
  world: WorldState; paused: boolean; cleaned: boolean; accumulator: number;
  command(value: GameCommand): void; requestPause(): void; update(time: number, delta: number): void;
}
// Scene-boundary unit doubles, not browser/gameplay evidence or mutations of a running World.
const world = (mode: WorldState['mode'] = 'playing') => Object.freeze({ mode, save: Object.freeze(createRun('unit-camera', 42)), events: Object.freeze([]) }) as unknown as WorldState;
function harness() {
  const bridge = new GameBridge(), emitted = vi.fn(); bridge.onEvent(emitted);
  const effect = { offset: 1, reset: vi.fn(() => { effect.offset = 0; }) };
  const controls = { setEnabled: vi.fn(), poll: vi.fn(), consume: vi.fn() };
  const draw = vi.fn(), audio = vi.fn(), hud = vi.fn(), events = vi.fn();
  const actual = new WorldScene(bridge);
  Object.assign(actual as object, { world: world(), accumulator: 7, cameras: { main: { shakeEffect: effect } },
    controls, view: { draw }, syncAudio: audio, emitHud: hud, emitContext: vi.fn(), emitWorldEvents: events,
    audio: { unlock: vi.fn(() => Promise.resolve()) }, checkpointMemory: { restore: vi.fn(() => null), store: vi.fn() } });
  const scene = actual as unknown as Probe;
  return { scene, effect, controls, draw, audio, hud, emitted };
}
beforeEach(() => { core.create.mockReset(); core.step.mockReset(); core.apply.mockReset(); });
describe('Scene ends camera shake at frozen presentation boundaries without changing Core', () => {
  it('manual pause zeros residual camera movement before publishing the frozen HUD', () => {
    const h = harness(), initial = h.scene.world, before = JSON.stringify(initial);
    h.scene.command({ type: 'pause' });
    expect(h.effect.reset).toHaveBeenCalledOnce(); expect(h.effect.offset).toBe(0);
    expect(h.effect.reset.mock.invocationCallOrder[0]).toBeLessThan(h.hud.mock.invocationCallOrder[0]);
    expect(h.scene.paused).toBe(true); expect(h.scene.accumulator).toBe(0); expect(h.controls.setEnabled).toHaveBeenCalledWith(false);
    expect(h.scene.world).toBe(initial); expect(JSON.stringify(initial)).toBe(before); expect(core.step).not.toHaveBeenCalled();
  });
  it('duplicate pause requests do not restart or repeatedly reset effects', () => {
    const h = harness(); h.scene.command({ type: 'pause' }); h.scene.command({ type: 'pause' });
    expect(h.effect.reset).toHaveBeenCalledOnce(); expect(h.audio).toHaveBeenCalledOnce();
  });
  it('resume restores ordinary input without advancing Core or replaying an old shake', () => {
    const h = harness(); h.scene.paused = true; h.effect.offset = 0; h.scene.command({ type: 'resume' });
    expect(h.scene.paused).toBe(false); expect(h.controls.setEnabled).toHaveBeenCalledWith(true);
    expect(h.effect.reset).not.toHaveBeenCalled(); expect(core.step).not.toHaveBeenCalled();
  });
  it('a cleaned Scene cannot touch an obsolete camera', () => {
    const h = harness(); h.scene.cleaned = true; h.scene.command({ type: 'pause' }); h.scene.requestPause();
    expect(h.effect.reset).not.toHaveBeenCalled(); expect(h.hud).not.toHaveBeenCalled();
  });
  it('keyboard/blur pause settles the camera before the bridge opens a menu', () => {
    const h = harness(); h.scene.requestPause(); expect(h.effect.reset).toHaveBeenCalledOnce();
    expect(h.emitted).toHaveBeenCalledExactlyOnceWith({ type: 'pause-requested' });
    expect(h.effect.reset.mock.invocationCallOrder[0]).toBeLessThan(h.emitted.mock.invocationCallOrder[0]);
  });
  it('an already frozen update does not step Core, redraw, or reset again', () => {
    const h = harness(); h.scene.command({ type: 'pause' }); h.effect.reset.mockClear(); h.scene.update(100, 80);
    expect(core.step).not.toHaveBeenCalled(); expect(h.draw).not.toHaveBeenCalled(); expect(h.effect.reset).not.toHaveBeenCalled();
  });
  it('ordinary playing frames leave camera impact feedback alone', () => {
    const h = harness(); core.step.mockReturnValue(h.scene.world); h.scene.update(100, 17);
    expect(core.step).toHaveBeenCalledOnce(); expect(h.effect.reset).not.toHaveBeenCalled(); expect(h.draw).toHaveBeenCalledOnce();
  });
  it.each(['rest', 'dead', 'cleared', 'finished'] as const)('a real adapter transition to%s settles shake before the final frozen draw', mode => {
    const h = harness(), next = world(mode); core.step.mockReturnValue(next); h.scene.update(100, 17);
    expect(h.effect.reset).toHaveBeenCalledOnce(); expect(h.scene.world).toBe(next); expect(h.controls.setEnabled).toHaveBeenCalledWith(false);
    expect(h.effect.reset.mock.invocationCallOrder[0]).toBeLessThan(h.draw.mock.invocationCallOrder[0]);
  });
  it.each((['start', 'restart'] as const).flatMap(type => (['playing', 'rest', 'finished'] as const).map(mode => [type, mode] as const)))('%s into%s drops effects from the previous attempt', (type, mode) => {
    const h = harness(), next = world(mode), save = createRun('fresh-camera', 42); core.create.mockReturnValue(next);
    h.scene.command({ type, save }); expect(h.effect.reset).toHaveBeenCalledOnce(); expect(h.effect.offset).toBe(0);
    expect(h.scene.world).toBe(next); expect(core.step).not.toHaveBeenCalled();
    expect(h.effect.reset.mock.invocationCallOrder[0]).toBeLessThan(h.draw.mock.invocationCallOrder[0]);
  });
  it.each(['rest', 'playing'] as const)('rest transaction ending in%s preserves mode and the frozen display policy', mode => {
    const h = harness(); h.scene.world = world('rest'); const next = world(mode); core.apply.mockReturnValue(next);
    h.scene.command({ type: 'rest-continue' }); expect(h.scene.world).toBe(next);
    expect(h.effect.reset).toHaveBeenCalledTimes(mode === 'rest' ? 1 : 0); expect(core.step).not.toHaveBeenCalled();
  });
});
