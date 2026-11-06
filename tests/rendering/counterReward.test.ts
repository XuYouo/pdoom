import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawCounterReward } from '../../src/pages/GamePage/game/systems/CounterRewardRenderer';
import type { CounterFeedbackFrame } from '../../src/pages/GamePage/game/systems/counterFeedback';
// A rectangle command raster double only. Native screenshots remain a separate gate.
function surface() {
  const pixels = new Map<string, number>(); let color = 0;
  const g = { fillStyle(value: number) { color = value; return this; },
    fillRect(x: number, y: number, w: number, h: number) {
      expect([x, y, w, h].every(Number.isInteger)).toBe(true);
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) pixels.set(`${xx},${yy}`, color);
      return this;
    } };
  return { g: g as unknown as Parameters<typeof drawCounterReward>[0], pixels, count: (c: number) => [...pixels.values()].filter(v => v === c).length };
}
const frame: CounterFeedbackFrame = Object.freeze({ x: 100, y: 200, immunityTicks: 10, charges: 2 });
describe('small counter reward draw commands', () => {
  it('null has no draw, clear, scene ownership or fabricated placeholder', () => {
    const h = surface(); drawCounterReward(h.g, null); expect(h.pixels.size).toBe(0);
  });
  it.each([1, 2, 3, 4, 5, 6])('draws exactly%s filled charge pips and a distinct dictionary book', charges => {
    const h = surface(); drawCounterReward(h.g, { ...frame, charges });
    expect(h.count(0xffffff)).toBe(charges * 4); expect(h.count(0xeec76d)).toBe(28);
    for (const key of h.pixels.keys()) {
      const [x, y] = key.split(',').map(Number); expect(x).toBeGreaterThanOrEqual(86); expect(x).toBeLessThanOrEqual(114);
      expect(y).toBeGreaterThanOrEqual(200); expect(y).toBeLessThanOrEqual(220);
    }
  });
  it.each([1, 5, 10])('draws exactly%s active duration ticks, independent of charges', immunityTicks => {
    const h = surface(); drawCounterReward(h.g, { ...frame, immunityTicks, charges: 0 });
    expect(h.count(0x87e3cd)).toBe(34 + immunityTicks * 2); expect(h.count(0xffffff)).toBe(0);
  });
  it('spent immunity removes the book but does not erase unspent critical pips', () => {
    const h = surface(); drawCounterReward(h.g, { ...frame, immunityTicks: 0 });
    expect(h.count(0xffffff)).toBe(8); expect(h.count(0x87e3cd)).toBe(0); expect(h.count(0xeec76d)).toBe(0);
  });
  it('replaying a frozen projection is exactly stable and does not mutate it', () => {
    const a = surface(), b = surface(); drawCounterReward(a.g, frame); drawCounterReward(b.g, frame);
    expect([...a.pixels]).toEqual([...b.pixels]); expect(frame).toEqual({ x: 100, y: 200, immunityTicks: 10, charges: 2 });
  });
  it('WorldRenderer sends the marker into the same surface BEFORE real bullets, with no new layer', () => {
    const text = readFileSync('src/pages/GamePage/game/systems/WorldRenderer.ts', 'utf8');
    const marker = text.indexOf('drawCounterReward(shots, counterFeedbackFrame(world,');
    expect(marker).toBeGreaterThan(text.indexOf('const shots ='));
    expect(marker).toBeLessThan(text.indexOf('world.bullets.forEach(bullet => {'));
    const source = readFileSync('src/pages/GamePage/game/systems/CounterRewardRenderer.ts', 'utf8');
    expect(source).not.toMatch(/setDepth|add\.graphics|\.clear\(|setTimeout|Date\.now|requestAnimationFrame/);
  });
});
