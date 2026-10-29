import { describe, expect, it } from 'vitest';
import { cameraTarget, stepCamera, worldLabelFits, rasterCameraPoint } from '../../src/pages/GamePage/game/systems/cameraFrame';

const horizontal = { width: 2880, height: 360, axis: 'horizontal' as const, arena: { x: 2240, y: 0 } };
const vertical = { width: 640, height: 1800, axis: 'vertical' as const, arena: { x: 0, y: 0 } };
const player = { x: 1000, y: 309, facing: 1 as const, vy: 0 };

describe('chapter-aware camera planning', () => {
  it('preserves chapter one look-ahead and arena framing', () => {
    expect(cameraTarget(horizontal, player, false)).toEqual({ x: 765, y: 0 });
    expect(cameraTarget(horizontal, player, true)).toEqual({ x: 2240, y: 0 });
  });
  it('looks above a climbing character while keeping lower hazards in view', () => {
    expect(cameraTarget(vertical, { ...player, x: 320, y: 1600 }, false)).toEqual({ x: 0, y: 1365 });
    expect(cameraTarget(vertical, { ...player, x: 320, y: 1600, vy: -440 }, false)).toEqual({ x: 0, y: 1347 });
  });
  it('clamps both axes at the top and bottom', () => {
    expect(cameraTarget(vertical, { ...player, x: -100, y: 50 }, false)).toEqual({ x: 0, y: 0 });
    expect(cameraTarget(vertical, { ...player, x: 900, y: 1800 }, false)).toEqual({ x: 0, y: 1440 });
  });
  it('locks the upper arena and never creates negative scroll for a small level', () => {
    expect(cameraTarget(vertical, player, true)).toEqual({ x: 0, y: 0 });
    expect(cameraTarget({ ...vertical, width: 320, height: 180 }, player, false)).toEqual({ x: 0, y: 0 });
  });
  it('follows across a wider arena without exposing space outside that arena', () => {
    const wide = { ...horizontal, width: 3280, arena: { x: 2520, y: 0, w: 750, h: 360 } };
    expect(cameraTarget(wide, { ...player, x: 2532 }, true)).toEqual({ x: 2520, y: 0 });
    const right = cameraTarget(wide, { ...player, x: 3258 }, true);
    expect(right).toEqual({ x: 2630, y: 0 });
    expect(3258 - right.x).toBeLessThan(640);
    expect(2890 - right.x).toBeGreaterThan(0); // The central boss remains visible while flanking.
  });
  it('follows both coordinates in a tall horizontal branching world and contains its arena', () => {
    const branching = { width: 4000, height: 720, axis: 'horizontal' as const, arena: { x: 3200, y: 360, w: 800, h: 360 } };
    expect(cameraTarget(branching, { ...player, x: 1000, y: 550 }, false)).toEqual({ x: 765, y: 315 });
    expect(cameraTarget(branching, { ...player, x: 1000, y: 180 }, false)).toEqual({ x: 765, y: 0 });
    expect(cameraTarget(branching, { ...player, x: 3900, y: 680 }, true)).toEqual({ x: 3360, y: 360 });
    expect(cameraTarget(branching, { ...player, x: 3212, y: 500 }, true)).toEqual({ x: 3200, y: 360 });
  });
  it('snaps chapter changes, freezes a zero delta, and smooths without overshoot', () => {
    const origin = Object.freeze({ x: 1000, y: 0 });
    const target = Object.freeze({ x: 0, y: 1400 });
    expect(stepCamera(origin, target, 0, true)).toEqual(target);
    expect(stepCamera(origin, target, 0)).toEqual(origin);
    const next = stepCamera(origin, target, 16);
    expect(next.x).toBeGreaterThan(0); expect(next.x).toBeLessThan(1000);
    expect(next.y).toBeGreaterThan(0); expect(next.y).toBeLessThan(1400);
    expect(stepCamera(origin, target, -30)).toEqual(origin);
    expect(origin).toEqual({ x: 1000, y: 0 });
  });
});

describe('complete world-space teaching labels', () => {
  it.each([
    [65, 205, 0, true], [540, 210, 0, false], [540, 210, 200, true],
    [540, 210, 529, false], [540, 210, 122, true], [540, 210, 121.99, false],
    [540, 0, 200, false], [540, NaN, 200, false],
  ] as const)('tests label x%s width%s at scroll%s without repositioning it', (x, width, scrollX, visible) => {
    expect(worldLabelFits(x, width, scrollX)).toBe(visible);
  });
});

describe('one first-chapter raster camera for native Images and Graphics cues', () => {
  it('does not turn a tiny positive residual into a one-pixel Graphics edge mismatch', () => {
    const point = Object.freeze({ x: 1442.000000000001, y: 0 });
    expect(rasterCameraPoint(point)).toEqual({ x: 1442, y: 0 }); expect(point.x).toBe(1442.000000000001);
  });
  it('retains smooth subpixels internally and converges fully instead of stalling short of an arena', () => {
    let follow = { x: 1945, y: 0 }; const target = { x: 2240, y: 0 };
    for (let tick = 0; tick < 120; tick++) {
      follow = stepCamera(follow, target, 1000 / 60);
      const visible = rasterCameraPoint(follow); expect(Number.isInteger(visible.x)).toBe(true);
      expect(Math.abs(visible.x - follow.x)).toBeLessThanOrEqual(0.5);
    }
    expect(rasterCameraPoint(follow)).toEqual(target); expect(follow.x).toBeLessThan(target.x);
  });
  it('keeps zero-delta restoration and snap boundaries on the same pixel lattice', () => {
    const held = { x: 1280.49, y: 0 };
    expect(rasterCameraPoint(stepCamera(held, { x: 2240, y: 0 }, 0))).toEqual({ x: 1280, y: 0 });
    expect(rasterCameraPoint(stepCamera(held, { x: 2240, y: 0 }, 0, true))).toEqual({ x: 2240, y: 0 });
  });
});
