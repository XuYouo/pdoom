import { describe, expect, it } from 'vitest';
import { platformRuleCue } from '../../src/pages/GamePage/game/systems/platformRuleCue';

const positions = [194, 219, 258, 320].flatMap(y => [0, .01, .25, .49, .5, .75, .99]
  .map(fraction => Object.freeze({ x: 720 + fraction, y: y + fraction, w: 120 })));
describe('native semantic strip shares the skin raster grid, not subpixel collision geometry', () => {
  it.each(positions)('native rule cue stays exactly in the first3 rows at %j', platform => {
    const before = { ...platform }, result = platformRuleCue(platform, true);
    expect(result).toEqual([Math.round(platform.x), Math.round(platform.y), 120, 3]);
    expect(result[1] + result[3]).toBe(Math.round(platform.y) + 3);
    expect(platform).toEqual(before);
  });
  it.each(positions)('blockout cue keeps its original physical coordinates at %j', platform => {
    expect(platformRuleCue(platform, false)).toEqual([platform.x, platform.y, 120, 3]);
  });
});
