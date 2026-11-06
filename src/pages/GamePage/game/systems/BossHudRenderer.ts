import type * as Phaser from 'phaser';

/** World-space health annotations, above Clawd (3) and danger cues (3), below modal/status UI. */
export class BossHudRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private disposed = false;
  constructor(scene: Pick<Phaser.Scene, 'add'>) {
    this.graphics = scene.add.graphics().setDepth(4);
  }
  clear() { if (!this.disposed) this.graphics.clear(); }
  drawHealth(centerX: number, y: number, hp: number, maxHp: number) {
    if (this.disposed) return;
    // Exact existing geometry and fraction: no fake minimum health or screen-space relocation.
    this.graphics.fillStyle(0x252b28).fillRect(centerX - 32, y, 64, 4);
    this.graphics.fillStyle(0xebaa7b).fillRect(centerX - 32, y, 64 * hp / maxHp, 4);
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true; this.graphics.destroy();
  }
}
