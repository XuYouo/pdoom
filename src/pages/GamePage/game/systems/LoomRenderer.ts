import type * as Phaser from 'phaser';
import { bossRect, PLAYER_HEIGHT, PLAYER_WIDTH, type LoomNode, type WorldState } from '../entities/model';

export const loomBranchColor = (branch: LoomNode['branch']) => branch === 'upper' ? 0xb9a4e8 : branch === 'lower' ? 0x79c9c1 : branch === 'hub' ? 0xe3c58e : 0x90c6b0;
const remaining = (until: number, now: number) => Math.max(0, Math.ceil((until - now) / 100) / 10).toFixed(1);

/** Temporary geometry, never an independent model of where the playable surfaces are. */
export class LoomRenderer {
  private status: Phaser.GameObjects.Text;
  private action: Phaser.GameObjects.Text;
  private labels = new Map<string, Phaser.GameObjects.Text>();

  constructor(private scene: Phaser.Scene) {
    this.status = scene.add.text(630, 28, '', { fontFamily: 'monospace', fontSize: '10px', color: '#c8bedf', align: 'right', lineSpacing: 4, backgroundColor: '#121724eb', padding: { x: 5, y: 4 } }).setOrigin(1, 0).setScrollFactor(0).setDepth(6);
    this.action = scene.add.text(12, 132, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffe0a3', align: 'left', lineSpacing: 3, backgroundColor: '#181e29ef', padding: { x: 5, y: 4 } }).setOrigin(0, 0).setScrollFactor(0).setDepth(6);
  }

  private label(id: string, x: number, y: number, text: string, color: string) {
    let label = this.labels.get(id);
    if (!label) {
      label = this.scene.add.text(x, y, '', { fontFamily: 'monospace', fontSize: '8px', color, backgroundColor: '#141a26e0', padding: { x: 3, y: 2 } }).setOrigin(0.5, 1).setDepth(1);
      this.labels.set(id, label);
    }
    label.setPosition(Math.round(x), Math.round(y)).setText(text);
    if (label.style.color !== color) label.setColor(color);
  }

  drawEnvironment(g: Phaser.GameObjects.Graphics, world: WorldState) {
    const loom = world.loom;
    const needed = new Set<string>();
    if (loom) {
      const camera = this.scene.cameras.main;
      const nodes = new Map(loom.nodes.map(node => [node.id, node]));
      for (const node of loom.nodes) {
        if (node.x + node.w < camera.scrollX - 90 || node.x > camera.scrollX + 730 || node.y < camera.scrollY - 100 || node.y > camera.scrollY + 440) continue;
        const color = loomBranchColor(node.branch);
        for (const id of node.next) {
          const next = nodes.get(id);
          if (!next || (!node.expanded && !next.expanded)) continue;
          const x = node.x + node.w, y = node.y + 8, nx = next.x, ny = next.y + 8;
          const mid = Math.round((x + nx) / 2);
          g.lineStyle(1, loomBranchColor(next.branch), node.collapsed || next.collapsed ? 0.12 : next.expanded ? 0.45 : 0.18)
            .lineBetween(x, y, mid, y).lineBetween(mid, y, mid, ny).lineBetween(mid, ny, nx, ny);
        }
        if (!node.expanded || node.collapsed || loom.eaten.includes(node.id)) {
          // Dashed ghosts have no filled top surface; they must not look like live collision.
          g.lineStyle(1, color, node.collapsed ? 0.22 : 0.16);
          for (let x = node.x + 3; x < node.x + node.w - 5; x += 12) g.lineBetween(x, node.y + 5, Math.min(x + 4, node.x + node.w - 3), node.y + 5);
          if (node.collapsed || loom.eaten.includes(node.id)) {
            const cx = node.x + node.w / 2;
            g.lineStyle(1, 0xad7c99, 0.45).lineBetween(cx - 4, node.y, cx + 4, node.y + 8).lineBetween(cx + 4, node.y, cx - 4, node.y + 8);
          }
          continue;
        }
        if (node.branch !== 'arena') {
          needed.add(node.id);
          const warning = node.collapseAt !== null;
          const branch = node.branch === 'upper' ? '上分支' : node.branch === 'lower' ? '下分支' : '安全岛';
          this.label(node.id, node.x + node.w / 2, node.y - 29,
            warning ? `R救回 / ${remaining(node.collapseAt!, world.save.elapsedMs)}s` : `${branch} · ${loom.timeline === 0 ? 'A' : 'B'}`,
            warning ? '#ffbb9b' : node.branch === 'upper' ? '#c5b6eb' : node.branch === 'lower' ? '#a1dad1' : '#e3c58e');
        }
      }
    }
    for (const [id, label] of this.labels) if (!needed.has(id)) { label.destroy(); this.labels.delete(id); }
  }

  drawWarnings(g: Phaser.GameObjects.Graphics, world: WorldState) {
    const loom = world.loom;
    if (!loom) return;
    for (const node of loom.nodes) {
      if (!node.expanded || node.collapsed || node.collapseAt === null) continue;
      g.lineStyle(2, 0xf4a07d).strokeRect(node.x, node.y, node.w, node.h);
      for (let x = node.x + 4; x < node.x + node.w - 8; x += 18) g.lineStyle(1, 0xffc498).lineBetween(x, node.y + 2, x + 7, node.y + node.h - 2);
    }
    if (loom.swallow) for (const id of loom.swallow.ids) {
      const node = loom.nodes.find(value => value.id === id);
      if (!node) continue;
      g.lineStyle(2, 0xefb18c).strokeRect(node.x - 2, node.y - 2, node.w + 4, node.h + 4);
      g.lineStyle(1, 0xefb18c, 0.28).lineBetween(node.x + node.w / 2, node.y, world.boss.x, world.boss.y);
    }
  }

  drawCombat(g: Phaser.GameObjects.Graphics, world: WorldState) {
    const loom = world.loom;
    this.status.setVisible(!!loom);
    this.action.setVisible(false);
    if (!loom) return;
    const now = world.save.elapsedMs, boss = world.boss;
    const ready = now >= loom.rerollReadyAt && !world.rewind;
    const reroll = ready ? 'R / 可重roll' : world.rewind ? '回溯中不可重roll' : `R / ${remaining(loom.rerollReadyAt, now)}s`;
    this.status.setText(boss.active && boss.hp > 0
      ? `${reroll} · 时间线${loom.timeline === 0 ? 'A' : 'B'}\n${loom.hpUiTaken ? '血条已被吞' : '血条可读'} · 音轨被吞 ${loom.stemsLost}/4`
      : `LOOM / 时间线${loom.timeline === 0 ? 'A' : 'B'}\n${reroll} · 上下都可通行`);
    if (loom.lastReroll && now - loom.lastReroll.at < 450) {
      const { from, to, at } = loom.lastReroll;
      const alpha = Math.max(0, 1 - (now - at) / 450);
      g.lineStyle(1, 0xb8abef, alpha).strokeRect(from.x - PLAYER_WIDTH / 2, from.y - PLAYER_HEIGHT / 2, PLAYER_WIDTH, PLAYER_HEIGHT);
      g.lineStyle(2, 0xb8abef, alpha * 0.65).lineBetween(from.x, from.y, to.x, to.y);
      g.lineStyle(1, 0xd0c4ff, alpha).strokeCircle(to.x, to.y, 20);
    }
    if (!boss.active || boss.hp <= 0) return;
    const open = loom.turn.weakUntil > now;
    const turning = !open && loom.turn.until > now;
    const area = loom.narrow;
    g.lineStyle(1, 0x9acfb7, 0.38).strokeRect(area.x, area.y, area.w, area.h);
    const floor = loom.nodes.find(node => node.branch === 'arena' && node.protected)?.y ?? world.chapter.floor;
    // The staging line must exist BEFORE suction starts, otherwise 'prepare on its right' is impossible to read.
    g.lineStyle(turning ? 2 : 1, 0xf4d298, open ? 0.3 : 1).lineBetween(loom.turn.lineX, floor - 70, loom.turn.lineX, floor + 5);
    if (turning) {
      const ax = loom.turn.lineX - 14, ay = floor - 48;
      g.lineStyle(3, 0xffdba1).lineBetween(ax + 38, ay, ax - 18, ay);
      g.fillStyle(0xffdba1).fillTriangle(ax - 22, ay, ax - 10, ay - 7, ax - 10, ay + 7);
    }
    this.action.setVisible(world.mode === 'playing');
    this.action.setText(open ? `SHARP LEFT TURN / 弱点 ${remaining(loom.turn.weakUntil, now)}s\n血条与音轨已吐回 · 立即射击`
      : turning ? `先在标线右侧，再 A + SHIFT 向左跨线\n急转弯窗口 ${remaining(loom.turn.until, now)}s`
        : boss.action === 'tell' ? loom.swallow?.ids.length
          ? '吞噬预警 / 橙框平台即将消失\n靠近标线右侧，等待吸力与左转箭头'
          : '吞噬预警 / 本轮无新增平台消失\n中心锚仍保留 · 准备下一次左转'
          : '闭壳反击无效 / 准备下一轮急转弯');
  }

  drawBoss(g: Phaser.GameObjects.Graphics, world: WorldState) {
    const boss = world.boss, loom = world.loom;
    if (!loom) return;
    const bounds = bossRect(boss);
    const open = loom.turn.weakUntil > world.save.elapsedMs;
    // The entire shared square contact domain is visible, including corners outside the inner hexagon.
    g.fillStyle(0x204e3f, boss.active ? 0.3 : 0.15).fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    g.lineStyle(1, open ? 0xffda9b : 0x8dd6ba, 0.65).strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    const turn = Math.floor(world.save.elapsedMs / 100) % 24 * Math.PI / 12;
    for (let ring = 3; ring >= 0; ring--) {
      const radius = bounds.w * (0.16 + ring * 0.1);
      const angle = turn * (ring % 2 ? -1 : 1) + ring * Math.PI / 6;
      const points = Array.from({ length: 6 }, (_, i) => ({
        x: Math.round(boss.x + Math.cos(angle + i * Math.PI / 3) * radius),
        y: Math.round(boss.y + Math.sin(angle + i * Math.PI / 3) * radius),
      }));
      g.fillStyle(ring % 2 ? 0x1f5445 : 0x39735d, boss.active ? 0.95 : 0.55)
        .lineStyle(2, open ? 0xf3d69d : ring % 2 ? 0x83c7a4 : 0x5aa98b).beginPath().moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
      g.closePath().fillPath().strokePath();
    }
    g.fillStyle(open ? 0xffd69b : 0x0e251f).fillRect(boss.x - 13, boss.y - 15, 26, 30);
    g.lineStyle(1, open ? 0xfff1c4 : 0x92cbb5).strokeRect(boss.x - 13, boss.y - 15, 26, 30);
    if (!open) g.lineStyle(2, 0x68a991).lineBetween(boss.x - 10, boss.y, boss.x + 10, boss.y);
  }

  destroy() {
    this.status.destroy(); this.action.destroy();
    this.labels.forEach(label => label.destroy()); this.labels.clear();
  }
}
