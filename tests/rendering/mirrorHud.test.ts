import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({}));
import { WorldRenderer } from '../../src/pages/GamePage/game/systems/WorldRenderer';
import { BossHudRenderer } from '../../src/pages/GamePage/game/systems/BossHudRenderer';
import type * as Phaser from 'phaser';
import type { WorldState } from '../../src/pages/GamePage/game/entities/model';
import { worldAnnotationCenterX } from '../../src/pages/GamePage/game/systems/cameraFrame';
import { assertMirrorName } from '../e2e/mirror-hud-pixels';

function harness(scrollX = 0, viewportWidth = 640, measuredWidth = 120) {
  const rects: { color: number; x: number; y: number; w: number; h: number }[] = [];
  const graphics = {
    color: 0, setDepth() { return this; },
    fillStyle(color: number) { this.color = color; return this; },
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ color: this.color, x, y, w, h }); return this; },
  };
  const text = {
    x: -999, y: -999, displayWidth: 0, text: '', visible: false, depth: 0, origin: 0,
    setVisible(visible: boolean) { this.visible = visible; return this; },
    setDepth(depth: number) { this.depth = depth; return this; },
    setOrigin(origin: number) { this.origin = origin; return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    // Phaser4.0.0 updates text canvas size synchronously. Initial0 catches measure-before-setText bugs.
    setText(value: string) { this.text = value; this.displayWidth = measuredWidth; return this; },
  };
  const native = { draw: vi.fn(() => true) };
  const renderer = Object.assign(Object.create(WorldRenderer.prototype) as WorldRenderer, {
    scene: { cameras: { main: { scrollX, width: viewportWidth } } },
    bossText: text, graphics, coreGraphics: graphics, bossHud: new BossHudRenderer({ add: { graphics: () => graphics } } as unknown as Phaser.Scene), gato: native, sydney: native, basilisk: native, leviathan: native,
  });
  function draw(x: number, hp = 50, active = true, phase = 1, kind: 'mirror' | 'basilisk' = 'mirror') {
    const boss = Object.freeze({ kind, x, y: 309, hp, maxHp: 100, active, phase });
    const world = Object.freeze({ boss, chapter: Object.freeze({}) }) as unknown as WorldState;
    const before = JSON.stringify(world);
    (renderer as unknown as { drawBoss(state: WorldState): void }).drawBoss(world);
    expect(JSON.stringify(world)).toBe(before);
    return { text, rects, native, boss };
  }
  return { draw, text, rects };
}

describe('actual WorldRenderer mirror annotation projection', () => {
  it.each([
    ['right', 624, 0, 640, 120, 572],
    ['left', 12, 0, 640, 120, 68],
    ['scrolled-right', 3152, 2520, 640, 120, 3092],
    ['scrolled-left', 2532, 2520, 640, 120, 2588],
    ['narrow-right', 308, 0, 320, 120, 252],
    ['bar-wider-than-label', 628, 0, 640, 28, 600],
    ['middle', 320, 0, 640, 120, 320],
    ['fractional-scroll', 3152.25, 2520.25, 640, 120, 3092.25],
  ] as const)('keeps the complete %s name and64px HP together without changing Core', (_name, x, left, width, labelWidth, expectedX) => {
    const { text, rects, boss } = harness(left, width, labelWidth).draw(x);
    expect(text.text).toBe('AGI / 你的镜像 1/3');
    expect(text.x).toBe(expectedX); expect(text.y).toBe(267);
    expect(text.x - text.displayWidth / 2 - left).toBeGreaterThanOrEqual(8);
    expect(text.x + text.displayWidth / 2 - left).toBeLessThanOrEqual(width - 8);
    expect(rects).toEqual([
      { color: 0x252b28, x: expectedX - 32, y: 278, w: 64, h: 4 },
      { color: 0xebaa7b, x: expectedX - 32, y: 278, w: 32, h: 4 },
    ]);
    expect(text.visible).toBe(true); expect(text.depth).toBe(4); expect(text.origin).toBe(0.5);
    expect(boss.x).toBe(x);
  });
  it.each([1, 30, 75, 100])('preserves the actual HP%s fraction instead of stretching it to the safe width', hp => {
    const { rects } = harness().draw(320, hp);
    expect(rects[0].w).toBe(64); expect(rects[1].w).toBe(64 * hp / 100);
  });
  it.each([[0, true], [-1, true], [50, false]] as const)('hides ended or inactive encounters hp%s active%s', (hp, active) => {
    const { text, rects, native } = harness().draw(624, hp, active);
    expect(text.visible).toBe(false); expect(rects).toEqual([]); expect(native.draw).toHaveBeenCalledTimes(4);
  });
});

describe('finite measured world annotations', () => {
  it.each([
    [0, 200, 0, 640, 108], [640, 200, 0, 640, 532],
    [8, 624, 0, 640, 320], [320, 120, 0, 640, 320],
    [2630, 140, 2520, 320, 2630], [3258, 141, 2630.5, 640, 3192],
  ] as const)('fits x%s width%s scroll%s viewport%s with an8px safe edge', (x, width, scroll, viewport, expected) => {
    expect(worldAnnotationCenterX(x, width, scroll, viewport)).toBe(expected);
  });
  it('centers an oversized annotation without altering its width or claiming it can fit', () => {
    expect(worldAnnotationCenterX(3600, 700, 2630, 640)).toBe(2950);
  });
  it('measures the new phase label, not a previous display width', () => {
    const h = harness(); h.text.displayWidth = 300;
    h.draw(624, 75, true, 3);
    expect(h.text.x).toBe(572); expect(h.text.text).toBe('AGI / 你的镜像 3/3');
  });
  it('hides on death and reanchors from fresh actor data instead of retaining a previous edge', () => {
    const h = harness(); h.draw(624); expect(h.text.x).toBe(572);
    h.rects.length = 0; h.draw(624, 0); expect(h.text.visible).toBe(false); expect(h.rects).toEqual([]);
    h.draw(320, 100); expect(h.text.visible).toBe(true); expect(h.text.x).toBe(320); expect(h.rects[1].w).toBe(64);
  });
  it('does not silently reposition a different boss or change its HP geometry', () => {
    const { text, rects } = harness().draw(624, 50, true, 1, 'basilisk');
    expect(text.x).toBe(624); expect(text.y).toBe(248); expect(rects.map(r => [r.x, r.y, r.w])).toEqual([[592, 258, 64], [592, 258, 32]]);
  });
});

describe('complete rendered-name coverage gate', () => {
  it.each([[3, 8], [291, 61]] as const)('rejects%s glyph samples covering only%s pixels even when safely inset', (ink, width) => {
    const points = Array.from({ length: ink }, (_, i) => ({ x: 8 + i % width, y: 263 + Math.floor(i / width), color: 0xf5dfbd }));
    expect(() => assertMirrorName({ left: 8, right: 8 + width - 1, top: 263, bottom: 270, width, height: 8, ink,
      points, key: points.map(p => `${p.x - 8},${p.y - 263}:${p.color}`).join(';') })).toThrow('Full blended name coverage missing');
  });
});
