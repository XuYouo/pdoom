import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({}));
import { WorldRenderer } from '../../src/pages/GamePage/game/systems/WorldRenderer';
import type { WorldState } from '../../src/pages/GamePage/game/entities/model';
import { cameraTarget, rasterCameraPoint, stepCamera } from '../../src/pages/GamePage/game/systems/cameraFrame';

function fixture(stage: number) {
  return Object.freeze({
    chapter: Object.freeze({ stage, width: stage === 2 ? 640 : 6000, height: stage === 2 ? 1800 : 720,
      axis: stage === 2 ? 'vertical' as const : 'horizontal' as const, arena: Object.freeze({ x: 4500, y: 360, w: 800, h: 360 }), signs: [] }),
    player: Object.freeze({ x: stage === 2 ? 320 : 4050.25, y: 500.25, vy: 0, facing: 1 as const }),
    boss: Object.freeze({ active: false }), save: Object.freeze({ elapsedMs: 777, runId: 'camera-unit' }),
    mode: 'running', loom: null, omega: null,
  }) as unknown as WorldState;
}
function harness(stage: number) {
  const world = fixture(stage), origin = { x: stage === 2 ? 0 : 3727.5, y: 120.49 };
  const publication = new Error('stop at public camera seam, before unrelated draw systems');
  const camera = {
    scrollX: origin.x, scrollY: origin.y, width: 640, height: 360, setBounds: vi.fn(),
    setScroll(x: number, y: number) { this.scrollX = x; this.scrollY = y; throw publication; },
  };
  const rebuildBackdrop = vi.fn();
  const renderer = Object.assign(Object.create(WorldRenderer.prototype) as object, {
    scene: { cameras: { main: camera } }, chapter: world.chapter, labels: [], rebuildBackdrop, lastRerollAt: null,
  }) as unknown as WorldRenderer;
  function draw(value = world, deltaMs = 0, snap = false) {
    const before = JSON.stringify(value);
    expect(() => renderer.draw(value, deltaMs, snap)).toThrow(publication);
    expect(JSON.stringify(value)).toBe(before);
    return { x: camera.scrollX, y: camera.scrollY };
  }
  return { world, origin, camera, draw, rebuildBackdrop };
}
const stages = [1, 2, 3, 4, 5];

describe('actual WorldRenderer publishes a native raster camera in every chapter', () => {
  it.each(stages)('chapter%s quantizes a held fractional view without mutating World', stage => {
    const h = harness(stage); expect(h.draw()).toEqual(rasterCameraPoint(h.origin));
  });
  it.each(stages)('chapter%s keeps floating follow state instead of feeding rounded coordinates back', stage => {
    const h = harness(stage), target = cameraTarget(h.world.chapter, h.world.player, false);
    let logical = { ...h.origin };
    for (let frame = 0; frame < 120; frame++) {
      logical = stepCamera(logical, target, 1000 / 60);
      const published = h.draw(h.world, 1000 / 60);
      expect(published).toEqual(rasterCameraPoint(logical));
      expect(Number.isInteger(published.x) && Number.isInteger(published.y)).toBe(true);
    }
    expect(h.draw()).toEqual(rasterCameraPoint(target));
  });
  it.each(stages)('chapter%s frozen restoration retains the last raster even with a different target', stage => {
    const h = harness(stage), first = h.draw(h.world, 16);
    const moved = Object.freeze({ ...h.world, player: Object.freeze({ ...h.world.player, x: 5200, y: 900 }) }) as WorldState;
    expect(h.draw(moved, 0)).toEqual(first);
    expect(Number.isInteger(first.x) && Number.isInteger(first.y)).toBe(true);
  });
  it.each(stages)('chapter%s snap uses the current target on the same lattice', stage => {
    const h = harness(stage), target = cameraTarget(h.world.chapter, h.world.player, false);
    expect(h.draw(h.world, 0, true)).toEqual(rasterCameraPoint(target));
  });
  it('chapter replacement drops the previous follow path and retains real bounds', () => {
    const h = harness(3); h.draw(h.world, 16); const next = fixture(4);
    expect(h.draw(next, 0)).toEqual(rasterCameraPoint(cameraTarget(next.chapter, next.player, false)));
    expect(h.camera.setBounds).toHaveBeenCalledExactlyOnceWith(0, 0, 6000, 720);
    expect(h.rebuildBackdrop).toHaveBeenCalledOnce();
  });
  it('actual reroll stamp snaps once, then resumes continuous floating follow', () => {
    const h = harness(4); h.draw(h.world, 16);
    const rerolled = Object.freeze({ ...h.world, loom: Object.freeze({ lastReroll: Object.freeze({ at: 987 }) }) }) as unknown as WorldState;
    const target = cameraTarget(rerolled.chapter, rerolled.player, false);
    expect(h.draw(rerolled, 0)).toEqual(rasterCameraPoint(target));
    const moved = Object.freeze({ ...rerolled, player: Object.freeze({ ...rerolled.player, x: 4300.5 }) }) as WorldState;
    expect(h.draw(moved, 16)).toEqual(rasterCameraPoint(stepCamera(target, cameraTarget(moved.chapter, moved.player, false), 16)));
  });
});
