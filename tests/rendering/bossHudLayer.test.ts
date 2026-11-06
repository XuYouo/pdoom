import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({}));
import { WorldRenderer } from '../../src/pages/GamePage/game/systems/WorldRenderer';
import { bossRect, type WorldState } from '../../src/pages/GamePage/game/entities/model';

import { BossHudRenderer } from '../../src/pages/GamePage/game/systems/BossHudRenderer';
import type * as Phaser from 'phaser';
type BossKind = WorldState['boss']['kind'];

// Explicit projection doubles: these test routing/values, not native WebGL visibility.
function harness(kind: BossKind, active = true, hp = 50) {
  const legacyRects: { color: number; args: number[] }[] = [];
  const graphics = {
    color: 0,
    fillStyle(color: number) { this.color = color; return this; },
    fillRect(...args: number[]) { legacyRects.push({ color: this.color, args }); return this; },
    lineStyle() { return this; }, strokeCircle() { return this; }, strokeRect() { return this; },
  };
  const text = {
    x: -1, y: -1, displayWidth: 120, visible: false,
    setVisible(value: boolean) { this.visible = value; return this; },
    setDepth() { return this; }, setOrigin() { return this; }, setText() { return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
  };
  const native = { draw: vi.fn(() => true) }, bossHud = { drawHealth: vi.fn() };
  const renderer = Object.assign(Object.create(WorldRenderer.prototype) as WorldRenderer, {
    scene: { cameras: { main: { scrollX: 0, width: 640 } } },
    graphics, coreGraphics: graphics, bossText: text, bossHud,
    gato: native, sydney: native, basilisk: native, leviathan: native, loom: { drawBoss: vi.fn() },
  });
  const boss = Object.freeze({ kind, active, hp, maxHp: 100, phase: 1, x: 320, y: 309, action: 'idle', targetX: 320 });
  const world = Object.freeze({ boss, chapter: Object.freeze({ floor: 330, arena: { x: 0 } }), save: Object.freeze({ elapsedMs: 10000 }) }) as unknown as WorldState;
  const before = JSON.stringify(world);
  const draw = () => {
    (renderer as unknown as { drawBoss(world: WorldState): void }).drawBoss(world);
    expect(JSON.stringify(world)).toBe(before);
  };
  return { draw, bossHud, legacyRects, text, native, world };
}
const kinds = ['gato', 'sydney', 'basilisk', 'leviathan', 'mirror'] as const;
describe('real WorldRenderer routes health separately from actors and hazard cues', () => {
  it.each(kinds)('%s uses the front health plane with the unchanged actual values', kind => {
    const h = harness(kind); h.draw();
    const y = kind === 'leviathan' ? bossRect(h.world.boss).y - 10 : kind === 'mirror' ? 278 : 258;
    expect(h.bossHud.drawHealth).toHaveBeenCalledExactlyOnceWith(320, y, 50, 100);
    expect(h.legacyRects.filter(r => r.color === 0xebaa7b || r.color === 0x252b28)).toEqual([]);
    expect(h.text.visible).toBe(true);
  });
  it.each(kinds)('%s inactive does not add a health bar', kind => {
    const h = harness(kind, false); h.draw();
    expect(h.bossHud.drawHealth).not.toHaveBeenCalled(); expect(h.text.visible).toBe(false);
    expect(h.native.draw).toHaveBeenCalledTimes(4);
  });
  it.each(kinds)('%s defeated still clears native actor visibility without drawing health', kind => {
    const h = harness(kind, true, 0); h.draw();
    expect(h.bossHud.drawHealth).not.toHaveBeenCalled(); expect(h.text.visible).toBe(false);
    expect(h.native.draw).toHaveBeenCalledTimes(4);
  });
});

// These doubles check the production plane/lifecycle, not a claim of real GPU pixels.
function healthSurface() {
  const rects: { color: number; x: number; y: number; w: number; h: number }[] = [];
  const graphics = {
    color: 0, depth: 0, destroyed: 0,
    setDepth(value: number) { this.depth = value; return this; },
    fillStyle(value: number) { this.color = value; return this; },
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ color: this.color, x, y, w, h }); return this; },
    clear() { rects.length = 0; return this; },
    destroy() { this.destroyed++; },
  };
  const hud = new BossHudRenderer({ add: { graphics: () => graphics } } as unknown as Phaser.Scene);
  return { hud, graphics, rects };
}
describe('production BossHudRenderer health plane', () => {
  it('stays strictly above current Clawd and real danger planes without moving those planes', () => {
    const h = healthSurface(); expect(h.graphics.depth).toBe(4); expect(h.graphics.depth).toBeGreaterThan(3);
  });
  it.each([1, 30, 50, 75, 100])('retains exact original hp%s ratio, colors,64x4 shape and world coordinates', hp => {
    const h = healthSurface(); h.hud.drawHealth(416.25, 233.5, hp, 100);
    expect(h.rects).toEqual([
      { color: 0x252b28, x: 384.25, y: 233.5, w: 64, h: 4 },
      { color: 0xebaa7b, x: 384.25, y: 233.5, w: 64 * hp / 100, h: 4 },
    ]);
  });
  it('clears the preceding frame so inactive/dead/next-chapter draws cannot retain old health', () => {
    const h = healthSurface(); h.hud.drawHealth(480, 200, 30, 100);
    expect(h.rects).toHaveLength(2); h.hud.clear(); expect(h.rects).toEqual([]);
    h.hud.drawHealth(320, 180, 100, 100); expect(h.rects[1].w).toBe(64); expect(h.rects[1].x).toBe(288);
  });
  it('owns and destroys one plane once, ignoring late callbacks after disposal', () => {
    const h = healthSurface(); h.hud.destroy(); h.hud.destroy(); h.hud.clear(); h.hud.drawHealth(320, 180, 100, 100);
    expect(h.graphics.destroyed).toBe(1); expect(h.rects).toEqual([]);
  });
});
