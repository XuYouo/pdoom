import type * as Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { FactoryRenderer } from '../../src/pages/GamePage/game/systems/FactoryRenderer';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';

function setup() {
  const status = { x: 0, y: 0, origin: [0, 0], scroll: -1, depth: -1, text: '', color: '', visible: true,
    setOrigin(x: number, y: number) { this.origin = [x, y]; return this; },
    setScrollFactor(value: number) { this.scroll = value; return this; },
    setDepth(value: number) { this.depth = value; return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    setColor(value: string) { this.color = value; return this; },
    setText(value: string) { this.text = value; return this; }, destroy: vi.fn(),
  };
  const scene = { cameras: { main: { width: 640, scrollX: 0, scrollY: 109 } },
    textures: { exists: () => false },
    add: { text: (x: number, y: number) => { status.x = x; status.y = y; return status; } },
  } as unknown as Phaser.Scene;
  const graphics = new Proxy({}, { get: () => () => graphics }) as Phaser.GameObjects.Graphics;
  return { renderer: new FactoryRenderer(scene), status, graphics };
}
describe('factory readout stays clear of native actors and teaching text', () => {
  it('anchors to the native viewport center above the play area', () => {
    const { renderer, status } = setup();
    expect([status.x, status.y]).toEqual([320, 12]); expect(status.origin).toEqual([0.5, 0]);
    expect(status.scroll).toBe(0); expect(status.depth).toBe(6); renderer.destroy();
  });
  it('does not cover the original failed native idle body at462,43', () => {
    const { renderer, status } = setup();
    // Conservative200px width exceeds both actual two-line readout variants.
    const left = status.x - status.origin[0] * 200, right = left + 200;
    const overlap = left < 558 && right > 462 && status.y < 139 && status.y + 34 > 43;
    expect(overlap).toBe(false); renderer.destroy();
  });
  it('leaves the y55 arena teaching line unobscured', () => {
    const { renderer, status } = setup(); expect(status.y + 34).toBeLessThan(55); renderer.destroy();
  });
  it('keeps actual sea distance, binding text and unchanged Core input', () => {
    const { renderer, status, graphics } = setup();
    const world = createWorld({ ...PREVIEW_SAVE, stage: 2, checkpoint: 2 });
    world.factory!.probes = []; world.factory!.bubbles = [];
    world.factory!.seaY = world.player.y + 126;
    const before = structuredClone(world); renderer.draw(graphics, world);
    expect(status.text).toBe('回形针海：距脚 115 px\n存活探针：0'); expect(world).toEqual(before);
    world.player.rootedBy = 12; renderer.draw(graphics, world);
    expect(status.text).toBe('精神控制 / 定身\nJ 或鼠标：击破亮框气泡');
    expect(status.color).toBe('#ffb9d6'); renderer.destroy(); expect(status.destroy).toHaveBeenCalledOnce();
  });
  it('hides the readout outside the factory instead of leaking it across chapters', () => {
    const { renderer, status, graphics } = setup(); renderer.draw(graphics, createWorld(PREVIEW_SAVE));
    expect(status.visible).toBe(false); renderer.destroy();
  });
});
