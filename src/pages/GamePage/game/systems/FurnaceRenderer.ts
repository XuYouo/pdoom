import type * as Phaser from 'phaser';
import { laserRect, type WorldState } from '../entities/model';

/** Third-chapter gameplay visualization, explicitly temporary until the Aseprite environment pass. */
export class FurnaceRenderer {
  private status: Phaser.GameObjects.Text;
  private facing: Phaser.GameObjects.Text;
  private labels = new Map<string, Phaser.GameObjects.Text>();

  constructor(private scene: Phaser.Scene) {
    this.status = scene.add.text(630, 28, '', { fontFamily: 'monospace', fontSize: '10px', color: '#c3df9d', align: 'right', lineSpacing: 4, backgroundColor: '#111d18df', padding: { x: 5, y: 4 } }).setOrigin(1, 0).setScrollFactor(0).setDepth(6);
    this.facing = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '8px', color: '#dce9c5', backgroundColor: '#14251de0', padding: { x: 3, y: 2 } }).setOrigin(0.5, 1).setDepth(4);
  }

  private label(id: string, x: number, y: number, text: string, color: string) {
    let label = this.labels.get(id);
    if (!label) {
      label = this.scene.add.text(x, y, '', { fontFamily: 'monospace', fontSize: '8px', color, backgroundColor: '#132019d8', padding: { x: 3, y: 2 } }).setOrigin(0.5, 1).setDepth(1);
      this.labels.set(id, label);
    }
    label.setPosition(Math.round(x), Math.round(y)).setText(text);
    // Phaser 4 TextStyle.setColor redraws/uploads even when the color is unchanged.
    if (label.style.color !== color) label.setColor(color);
  }

  drawEnvironment(g: Phaser.GameObjects.Graphics, world: WorldState) {
    const furnace = world.furnace;
    const ids = new Set(furnace ? [...furnace.lifts.map(lift => lift.id), ...furnace.heatZones.map(zone => zone.id)] : []);
    for (const [id, label] of this.labels) {
      if (!ids.has(id)) { label.destroy(); this.labels.delete(id); }
    }
    if (!furnace) return;
    for (const zone of furnace.heatZones) {
      const color = zone.phase === 'active' ? 0xe68a5b : zone.phase === 'tell' ? 0xe9c879 : 0x62876c;
      g.fillStyle(color, zone.phase === 'active' ? 0.55 : 0.15).fillRect(zone.x, zone.y, zone.w, zone.h);
      g.lineStyle(zone.phase === 'cool' ? 1 : 2, color).strokeRect(zone.x, zone.y, zone.w, zone.h);
      if (zone.phase !== 'cool') {
        for (let x = zone.x + 5; x < zone.x + zone.w - 8; x += 14) {
          g.lineStyle(1, color).lineBetween(x, zone.y + zone.h - 3, x + 7, zone.y + 3);
        }
      }
      this.label(zone.id, zone.x + zone.w / 2, zone.y - 4, zone.phase === 'active' ? 'GPU / 高温' : zone.phase === 'tell' ? 'GPU / 升温预警' : 'GPU / 冷却', zone.phase === 'active' ? '#ffc09a' : '#c7dba5');
    }
    for (const lift of furnace.lifts) {
      const center = lift.x + lift.w / 2;
      g.fillStyle(0x3b7047, 0.6).fillRect(lift.x + 18, lift.y + lift.h, lift.w - 36, Math.max(0, lift.maxY - lift.y - lift.h));
      g.lineStyle(2, 0x92d57b).lineBetween(center, lift.y - 12, center, lift.maxY + 8);
      g.lineStyle(1, 0x8dc889, 0.3).lineBetween(center, 26, center, lift.y - 13);
      g.lineStyle(1, 0xc4d2ae, 0.6).strokeCircle(center, 20, 9);
      this.label(lift.id, center, lift.y - 16, lift.dy < -0.01 ? 'K线 ↑ / 载人上升' : lift.dy > 0.01 ? 'K线 ↓ / 回落' : 'K线 / 可乘坐', '#b9ed9b');
    }
  }

  drawCombat(g: Phaser.GameObjects.Graphics, world: WorldState) {
    const furnace = world.furnace;
    this.status.setVisible(!!furnace);
    this.facing.setVisible(!!furnace && world.boss.active && world.mode === 'playing');
    if (!furnace) return;
    const now = world.save.elapsedMs;
    const petrified = now < world.player.petrifiedUntil;
    const ledger = furnace.enraged ? '因果账本：未捐款 / 狂暴' : '因果账本：已捐款 / 狂暴抑制';
    const statusColor = petrified ? '#d5dddd' : furnace.enraged ? '#e9b288' : '#c3df9d';
    if (this.status.style.color !== statusColor) this.status.setColor(statusColor);
    this.status.setText(petrified ? `石化 ${Math.max(0, Math.ceil((world.player.petrifiedUntil - now) / 100) / 10).toFixed(1)}s\nQ就绪时沿真实历史解除` : world.boss.active ? `${ledger}\n背对激光 / 绕后输出` : `${ledger}\n热区按节拍 · K线通向支路`);
    this.facing.setPosition(Math.round(world.player.x), Math.round(world.player.y - 22))
      .setText(petrified ? '石化 / Q' : world.player.facing === -1 ? '◀ 看向' : '看向 ▶');
    if (furnace.laser) {
      const laser = furnace.laser;
      const bounds = laserRect(laser);
      const active = laser.phase === 'active';
      g.fillStyle(active ? 0xb7ed78 : 0xe6ca83, active ? 0.22 : 0.08).fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      g.lineStyle(active ? 2 : 1, active ? 0xd4ffac : 0xe6ca83, active ? 0.85 : 0.55).strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
      g.lineStyle(active ? 2 : 1, active ? 0xf0ffd8 : 0xe6ca83, active ? 1 : 0.45).lineBetween(laser.x, laser.y, laser.x + laser.facing * laser.length, laser.y);
      const tip = laser.x + laser.facing * Math.min(laser.length, 44);
      g.fillStyle(active ? 0xf0ffd8 : 0xe6ca83).fillTriangle(tip, laser.y, tip - laser.facing * 8, laser.y - 4, tip - laser.facing * 8, laser.y + 4);
    }
    if (petrified) g.lineStyle(1, 0xe3eeee).strokeRect(world.player.x - 13, world.player.y - 16, 26, 30);
  }

  destroy() {
    this.status.destroy(); this.facing.destroy();
    this.labels.forEach(label => label.destroy()); this.labels.clear();
  }
}
