import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLAWD_CLIPS, CLAWD_FORMS, clawdFrameAt, clawdFrameName, clawdTexture } from '../../src/pages/GamePage/game/data/clawdAssets';

interface Atlas {
  frames: Array<{ filename: string; frame: { x: number; y: number; w: number; h: number }; duration: number; sourceSize: { w: number; h: number } }>;
  meta: { size: { w: number; h: number }; frameTags: Array<{ name: string; from: number; to: number }> };
}

const durations = Object.values(CLAWD_CLIPS).flatMap(clip => clip.map(item => item.duration));

describe('native Aseprite asset contract', () => {
  for (const form of CLAWD_FORMS) {
    it(`${form}: every named frame has matching PNG geometry, duration and animation tags`, () => {
      const key = clawdTexture(form);
      const json = new URL(`../../public/game/${key}.json`, import.meta.url);
      const atlas: Atlas = JSON.parse(readFileSync(json, 'utf8'));
      const png = readFileSync(new URL(`../../public/game/${key}.png`, import.meta.url));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(256);
      expect(png.readUInt32BE(20)).toBe(32);
      expect(atlas.meta.size).toEqual({ w: 256, h: 32 });
      expect(atlas.frames).toHaveLength(8);
      atlas.frames.forEach((frame, index) => {
        expect(frame.filename).toBe(clawdFrameName(index));
        expect(frame.frame).toEqual({ x: index * 32, y: 0, w: 32, h: 32 });
        expect(frame.sourceSize).toEqual({ w: 32, h: 32 });
        expect(frame.duration).toBe(durations[index]);
      });
      expect(atlas.meta.frameTags.map(({ name, from, to }) => ({ name, from, to }))).toEqual([
        { name: 'idle', from: 0, to: 1 }, { name: 'run', from: 2, to: 5 },
        { name: 'jump', from: 6, to: 6 }, { name: 'hurt', from: 7, to: 7 },
      ]);
    });
  }

  it('holds the exported unequal idle timings exactly', () => {
    expect([0, 399, 400, 999, 1000].map(time => clawdFrameAt('idle', time))).toEqual([0, 0, 1, 1, 0]);
  });
  it('holds contact poses longer than passing poses', () => {
    expect([0, 99, 100, 169, 170, 269, 270, 339, 340].map(time => clawdFrameAt('run', time))).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 2]);
  });
  it('holds single-frame poses and clamps a negative transition delta', () => {
    expect(clawdFrameAt('jump', 10000)).toBe(6);
    expect(clawdFrameAt('hurt', 10000)).toBe(7);
    expect(clawdFrameAt('idle', -1)).toBe(0);
  });
});
