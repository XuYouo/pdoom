import type * as Phaser from 'phaser';
import { BUBBLE_RADIUS, PROBE_RADIUS, type WorldState } from '../entities/model';
import { PROBE_BINDING } from '../data/probeAssets';
import { ProbeSpriteRenderer } from './ProbeSpriteRenderer';

/** Native probes and optional native sea; genuine hazards and PUA cues remain Core-driven Graphics. */
export class FactoryRenderer {
  private readonly probes: ProbeSpriteRenderer;
  private status: Phaser.GameObjects.Text;
  private bubbleLabels = new Map<number, Phaser.GameObjects.Text>();

  constructor(private scene: Phaser.Scene) {
    this.probes = new ProbeSpriteRenderer(scene, PROBE_BINDING);
    this.status = scene.add.text(630, 28, '', { fontFamily: 'monospace', fontSize: '10px', color: '#b7d5df', align: 'right', lineSpacing: 4, backgroundColor: '#101a1bdb', padding: { x: 5, y: 4 } }).setOrigin(1, 0).setScrollFactor(0).setDepth(6);
  }

  draw(g: Phaser.GameObjects.Graphics, world: WorldState, cues: Phaser.GameObjects.Graphics = g, afterSea: Phaser.GameObjects.Graphics = g, nativeSea = false) {
    const factory = world.factory;
    const nativeProbes = this.probes.draw(world);
    this.status.setVisible(factory !== null);
    const active = new Set(factory?.bubbles.map(bubble => bubble.id) ?? []);
    for (const [id, label] of this.bubbleLabels) {
      if (!active.has(id)) { label.destroy(); this.bubbleLabels.delete(id); }
    }
    if (!factory) return;
    const camera = this.scene.cameras.main;
    const bottom = camera.scrollY + 360;
    const top = Math.max(camera.scrollY, factory.seaY);
    const gap = Math.max(0, Math.round(factory.seaY - world.player.y - 11));
    this.status.setColor(world.player.rootedBy !== null ? '#ffb9d6' : gap < 90 ? '#ffb689' : '#b7d5df')
      .setText(world.player.rootedBy !== null ? '精神控制 / 定身\nJ 或鼠标：击破亮框气泡' : `回形针海：距脚 ${gap} px\n存活探针：${factory.probes.filter(probe => probe.hp > 0).length}`);
    if (top < bottom) {
      if (!nativeSea) {
        g.fillStyle(0x344654).fillRect(camera.scrollX, top, 640, bottom - top);
        g.lineStyle(1, 0x8fa5b4, 0.75);
        for (let y = Math.ceil(top / 22) * 22 + 6; y < bottom; y += 22) {
          for (let x = 12; x < world.chapter.width; x += 28) {
            g.strokeRect(x, y, 10, 14).lineBetween(x + 3, y + 3, x + 3, y + 11).lineBetween(x + 3, y + 11, x + 7, y + 11);
          }
        }
      }
      // This3px boundary belongs to Core seaY, never to the decorative fill or viewport top.
      afterSea.fillStyle(0xbed4dc).fillRect(camera.scrollX, factory.seaY, 640, 3);
    }
    for (const probe of factory.probes) {
      if (probe.hp <= 0 || probe.y < camera.scrollY - 45 || probe.y > bottom + 45) continue;
      const warning = probe.phase === 'tell' || probe.phase === 'consume';
      if (!nativeProbes.has(probe.id)) {
        afterSea.fillStyle(warning ? 0xf0b77c : 0x7bbdc5).fillCircle(probe.x, probe.y, PROBE_RADIUS);
        afterSea.lineStyle(1, 0xd4f2ea).strokeCircle(probe.x, probe.y, PROBE_RADIUS);
        afterSea.fillStyle(0x18272e).fillRect(probe.x - 3, probe.y - 3, 6, 5);
        afterSea.lineStyle(1, warning ? 0xf0b77c : 0x77a6af).lineBetween(probe.x - 13, probe.y, probe.x + 13, probe.y);
      }
      if (warning) {
        cues.lineStyle(1, 0xff8e7c, 0.9).strokeCircle(probe.x, probe.y, 14);
        const target = world.chapter.platforms.find(platform => platform.id === probe.targetPlatformId);
        if (target && !world.collapsed.includes(target.id)) {
          cues.lineStyle(2, 0xff8e7c, 0.7).strokeRect(target.x, target.y, target.w, target.h);
          cues.lineStyle(1, 0xff8e7c, 0.4).lineBetween(probe.x, probe.y + 8, target.x + target.w / 2, target.y);
        }
      }
    }
    for (const bubble of factory.bubbles) {
      const binding = world.player.rootedBy === bubble.id;
      afterSea.fillStyle(binding ? 0x6a364f : 0x304956, 0.94).fillCircle(bubble.x, bubble.y, BUBBLE_RADIUS);
      afterSea.lineStyle(binding ? 2 : 1, binding ? 0xffb2d2 : 0x94d7e1).strokeCircle(bubble.x, bubble.y, BUBBLE_RADIUS);
      afterSea.lineStyle(1, 0xf9d5e4).lineBetween(bubble.x - 6, bubble.y - 3, bubble.x + 6, bubble.y - 3).lineBetween(bubble.x - 6, bubble.y + 2, bubble.x + 3, bubble.y + 2);
      if (binding) afterSea.lineStyle(1, 0xf19cbd, 0.8).lineBetween(world.player.x, world.player.y - 3, bubble.x, bubble.y);
      let label = this.bubbleLabels.get(bubble.id);
      if (!label) {
        label = this.scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '9px', color: '#ffd8e6', align: 'center', backgroundColor: '#271e2be8', padding: { x: 4, y: 2 } }).setOrigin(0.5, 1).setDepth(4);
        this.bubbleLabels.set(bubble.id, label);
      }
      label.setPosition(Math.max(65, Math.min(world.chapter.width - 65, bubble.x)), bubble.y - 20).setText(`${bubble.text}\n击破解除 · HP ${Math.max(0, bubble.hp)}`);
    }
    if (world.player.rootedBy !== null) {
      afterSea.lineStyle(2, 0xe394b9, 0.7).strokeRect(world.player.x - 13, world.player.y - 16, 26, 31);
    }
    if (world.mode === 'dead' && world.player.y + 11 >= factory.seaY) {
      afterSea.fillStyle(0xd97757);
      [-15, -7, 5, 13].forEach((offset, index) => afterSea.fillRect(world.player.x + offset, world.player.y - 12 - index * 4, 3, 3));
    }
  }

  destroy() {
    this.probes.destroy();
    this.status.destroy();
    this.bubbleLabels.forEach(label => label.destroy());
    this.bubbleLabels.clear();
  }
}
