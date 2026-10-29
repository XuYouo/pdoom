import * as Phaser from 'phaser';
import { bossRect, PLAYER_HEIGHT, type WorldState } from '../entities/model';
import { ClawdRenderer } from './ClawdRenderer';
import { clamp } from './geometry';
import { doomForm } from './rules';
import { mirrorComboLabel, omegaHudSnapshot, OMEGA_PHASE_LABELS } from './omegaPresentation';

/** Read-only projections: the reflection is decoration; the duel actor uses its actual 16×22 contact domain. */
export class OmegaRenderer {
  private reflection: ClawdRenderer;
  private title: Phaser.GameObjects.Text;
  private profile: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.reflection = new ClawdRenderer(scene);
    this.title = scene.add.text(14, 28, '', { fontFamily: 'monospace', fontSize: '10px', color: '#e3d8c4', lineSpacing: 3, backgroundColor: '#101923db', padding: { x: 5, y: 4 }, wordWrap: { width: 350 } }).setScrollFactor(0).setDepth(5);
    this.profile = scene.add.text(626, 28, '', { fontFamily: 'monospace', fontSize: '9px', color: '#d3bedf', align: 'right', lineSpacing: 3, backgroundColor: '#101923db', padding: { x: 5, y: 4 }, wordWrap: { width: 230 } }).setOrigin(1, 0).setScrollFactor(0).setDepth(5);
  }

  drawEnvironment(g: Phaser.GameObjects.Graphics, world: WorldState) {
    const omega = world.omega;
    this.title.setVisible(!!omega); this.profile.setVisible(!!omega);
    if (!omega) { this.reflection.setVisible(false); return; }
    const now = world.save.elapsedMs, hud = omegaHudSnapshot(world)!;
    const caption = omega.phase === 'storm' ? '跳过亮框风暴和断口 · 前往最后的门'
      : omega.phase === 'chamber' ? '空椅子。落地镜。靠近镜面，站稳。'
        : omega.phase === 'reveal' ? '镜中睁眼的，是一路升级的你。'
          : omega.phase === 'complete' ? '结果已锁定 · 不再推进战斗计时'
            : omega.mirror.state === 'tell' ? `预告：${mirrorComboLabel(omega.mirror.plan)}` : `${hud.mirrorAction} · 留意恢复空档`;
    this.title.setText(`${OMEGA_PHASE_LABELS[omega.phase]} / OMEGA\n${caption}`);
    this.profile.setText(`${hud.memorySource === 'ordered' ? '实际观察序列' : '频次起手 · 继续观察'} / ${hud.dominantAction}\n遗物有效 ${omega.mirror.profile.activeBuild.length} · 失活 ${omega.mirror.profile.suppressedBuild.length} · 连招 ${hud.observedCombos}`);
    if (omega.phase === 'storm') for (const zone of omega.stormZones) {
      const color = zone.phase === 'tell' ? 0xf4d298 : zone.phase === 'active' ? 0xe89fce : 0x688c91;
      g.fillStyle(color, zone.phase === 'active' ? 0.25 : 0.08).fillRect(zone.x, zone.y, zone.w, zone.h);
      g.lineStyle(1, color, zone.phase === 'cool' ? 0.3 : 0.95).strokeRect(zone.x, zone.y, zone.w, zone.h);
      if (zone.phase !== 'cool') for (let x = zone.x + 16; x < zone.x + zone.w - 10; x += 28) {
        const y = zone.y + zone.h / 2, tip = x + zone.direction * 7;
        g.lineStyle(1, color, 0.8).lineBetween(x - zone.direction * 7, y, tip, y)
          .lineBetween(tip, y, tip - zone.direction * 4, y - 3).lineBetween(tip, y, tip - zone.direction * 4, y + 3);
      }
    }
    const { door, glass } = omega;
    if (omega.phase === 'reveal' || omega.phase === 'duel') {
      const arena = world.chapter.arena;
      g.lineStyle(2, 0xb39acb, 0.6).lineBetween(arena.x, arena.y, arena.x, world.chapter.floor)
        .lineBetween(arena.x + arena.w, arena.y, arena.x + arena.w, world.chapter.floor);
    }
    const closed = omega.phase === 'storm';
    g.fillStyle(closed ? 0x5f7774 : 0x334d50).fillRect(door.x + 4, door.y + 3, closed ? door.w - 8 : 5, door.h - 3);
    if (closed) g.fillStyle(0xe0c289).fillRect(door.x + door.w - 10, door.y + 46, 3, 6);
    if (omega.phase === 'reveal') {
      const pulse = 0.45 + 0.25 * Math.sin((now - (omega.revealAt ?? now)) / 65);
      g.lineStyle(2, 0xf4d298, pulse).strokeRect(glass.x - 2, glass.y - 2, glass.w + 4, glass.h + 4);
      for (let i = 0; i < 8; i++) {
        const x = glass.x - 8 + i * 9, y = glass.y - 10 - ((Math.floor(now / 70) + i * 5) % 19);
        g.fillStyle(0xe5d2ae, 0.8).fillRect(x, y, 2, 3);
      }
    }
  }

  drawCombat(g: Phaser.GameObjects.Graphics, world: WorldState) {
    const omega = world.omega;
    if (!omega) { this.reflection.setVisible(false); return; }
    const now = world.save.elapsedMs, { mirror, glass } = omega;
    if (omega.phase === 'duel' && world.boss.hp > 0) {
      this.reflection.drawVisual({ runId: `${world.save.runId}:mirror`, now, hp: world.boss.hp, form: 'foom', actor: mirror.actor, playing: world.mode === 'playing', rewinding: mirror.rewind !== null });
      const bounds = bossRect(world.boss);
      g.lineStyle(1, 0xd4b0ff, 0.95).strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
      // A visible hostile chevron distinguishes two legitimate Clawd silhouettes; it is not a second hitbox.
      g.fillStyle(0xd4b0ff).fillTriangle(mirror.actor.x - 3, mirror.actor.y - 57, mirror.actor.x + 3, mirror.actor.y - 57, mirror.actor.x, mirror.actor.y - 53);
      if (mirror.state === 'tell') {
        g.lineStyle(1, 0xf4d298, 0.7).lineBetween(mirror.actor.x, mirror.actor.y, mirror.target.x, mirror.target.y);
        g.lineBetween(mirror.target.x - 4, mirror.target.y, mirror.target.x + 4, mirror.target.y).lineBetween(mirror.target.x, mirror.target.y - 4, mirror.target.x, mirror.target.y + 4);
      }
      if (mirror.rewind) {
        const path = mirror.rewind.path;
        g.lineStyle(1, 0xad9cd8, 0.6);
        for (let index = 1; index < path.length; index += 3) g.lineBetween(path[index - 1].x, path[index - 1].y, path[index].x, path[index].y);
      }
      if (mirror.scan && now < mirror.scan.until) {
        const { rect, at } = mirror.scan, warning = now < at, color = warning ? 0xf4d298 : 0xef9fca;
        g.fillStyle(color, warning ? 0.1 : 0.3).fillRect(rect.x, rect.y, rect.w, rect.h);
        g.lineStyle(warning ? 1 : 2, color, 0.9).strokeRect(rect.x, rect.y, rect.w, rect.h);
      }
    } else if ((omega.phase === 'chamber' || omega.phase === 'reveal') && world.player.x > glass.x - 190) {
      // A projected reflection is not the active enemy: its position never enters the simulation.
      const actor = { ...world.player, x: glass.x + glass.w / 2, y: clamp(world.player.y, glass.y + PLAYER_HEIGHT, world.chapter.floor - PLAYER_HEIGHT / 2), facing: (world.player.facing === 1 ? -1 : 1) as -1 | 1, invulnerableUntil: 0 };
      this.reflection.drawVisual({ runId: `${world.save.runId}:glass`, now, hp: world.save.hp, actor, form: omega.phase === 'reveal' ? 'foom' : doomForm(world.save.doom), playing: world.mode === 'playing', rewinding: false, alpha: omega.phase === 'reveal' ? 0.9 : 0.45 });
    } else this.reflection.setVisible(false);
  }

  destroy() { this.reflection.destroy(); this.title.destroy(); this.profile.destroy(); }
}
