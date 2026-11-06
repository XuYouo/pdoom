import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
const projection = vi.hoisted(() => ({ drawVisual: vi.fn(), setVisible: vi.fn(), destroy: vi.fn() }));
vi.mock('../../src/pages/GamePage/game/systems/ClawdRenderer', () => ({ ClawdRenderer: class {
  drawVisual = projection.drawVisual; setVisible = projection.setVisible; destroy = projection.destroy;
} }));
import { OmegaRenderer } from '../../src/pages/GamePage/game/systems/OmegaRenderer';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
function rig() {
  const text = { setOrigin: vi.fn().mockReturnThis(), setScrollFactor: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(), destroy: vi.fn() };
  const scene = { add: { text: () => text } } as unknown as Phaser.Scene;
  const graphics = { lineStyle: vi.fn().mockReturnThis(), strokeRect: vi.fn().mockReturnThis(), fillStyle: vi.fn().mockReturnThis(), fillTriangle: vi.fn().mockReturnThis() } as unknown as Phaser.GameObjects.Graphics;
  const world = createWorld({ ...createRun('8a40b11b-007a-4aa3-9e14-6f1f08825d01', 42), stage: 5, checkpoint: 2 });
  world.player.x = world.omega!.glass.x - 180; world.player.lastFiredAt = 450; world.omega!.mirror.actor.lastFiredAt = 300;
  return { renderer: new OmegaRenderer(scene), world, graphics };
}
beforeEach(() => vi.clearAllMocks());
describe('Omega projects the correct actual actor emission, never the other actor count', () => {
  it('duel uses mirror receipt and mirror rewind state only', () => {
    const { renderer, world, graphics } = rig(); world.omega!.phase = 'duel'; world.boss.active = true;
    const before = JSON.stringify(world); renderer.drawCombat(graphics, world);
    expect(projection.drawVisual).toHaveBeenCalledWith(expect.objectContaining({ firedAt: 300, form: 'foom', actor: world.omega!.mirror.actor, rewinding: false }));
    expect(JSON.stringify(world)).toBe(before); renderer.destroy();
  });
  it.each(['chamber', 'reveal'] as const)('%s is a read-only reflected player projection, not a hostile emission', phase => {
    const { renderer, world, graphics } = rig(); world.omega!.phase = phase; const before = JSON.stringify(world); renderer.drawCombat(graphics, world);
    expect(projection.drawVisual).toHaveBeenCalledWith(expect.objectContaining({ firedAt: 450, alpha: phase === 'chamber' ? 0.45 : 0.9, rewinding: false }));
    const args = projection.drawVisual.mock.calls[0][0]; expect(args.actor).not.toBe(world.player); expect(args.actor.facing).toBe(-world.player.facing);
    expect(JSON.stringify(world)).toBe(before); renderer.destroy();
  });
  it('a player rewind cannot display a new quiet-reflection shot or adopt its rewind tint', () => {
    const { renderer, world, graphics } = rig(); world.omega!.phase = 'chamber'; world.rewind = { path: [...world.history], startedAt: 400, durationMs: 1000 };
    renderer.drawCombat(graphics, world); expect(projection.drawVisual).toHaveBeenCalledWith(expect.objectContaining({ firedAt: null, rewinding: false, alpha: 0.45 })); renderer.destroy();
  });
  it('hides the reflection once the duel actor is dead', () => {
    const { renderer, world, graphics } = rig(); world.omega!.phase = 'duel'; world.boss.hp = 0; renderer.drawCombat(graphics, world);
    expect(projection.drawVisual).not.toHaveBeenCalled(); expect(projection.setVisible).toHaveBeenCalledWith(false); renderer.destroy();
  });
});
