import type * as Phaser from 'phaser';
import { PLAYER_IDS, COOP_RULES, type CoopWorldState, type PlayerId } from '../game/coop/model';
import { playerView } from '../game/coop/state';
import { ClawdRenderer } from '../game/systems/ClawdRenderer';
import type { WorldRenderer } from '../game/systems/WorldRenderer';
import { doomForm } from '../game/systems/rules';
import { clamp } from '../game/systems/geometry';
import { counterFeedbackFrame } from '../game/systems/counterFeedback';
import { drawCounterReward } from '../game/systems/CounterRewardRenderer';
import type { CameraPoint } from '../game/systems/cameraFrame';
import { coopCameraTarget } from './coopCamera';

/** Two independent native actors in one rendered world, with one shared camera plan. */
export class CoopRenderer {
  private actors: Record<PlayerId, ClawdRenderer>;
  private labels: Record<PlayerId, Phaser.GameObjects.Text>;
  private cues: Phaser.GameObjects.Graphics;
  private lastEpoch = -1;
  private cameraFollow: CameraPoint | null = null;
  private lastRerollAt: number | null = null;
  constructor(private scene: Phaser.Scene, private view: WorldRenderer) {
    this.actors = { p1: new ClawdRenderer(scene), p2: new ClawdRenderer(scene) };
    const label = (color: string) => scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '8px', color,
      backgroundColor: '#0c171bdb', padding: { x: 3, y: 2 } }).setOrigin(0.5, 1).setDepth(7);
    this.labels = { p1: label('#ffd0a3'), p2: label('#a6e3ef') };
    this.cues = scene.add.graphics().setDepth(5);
  }
  draw(state: CoopWorldState, localId: PlayerId, deltaMs: number) {
    const world = playerView(state, localId), now = state.run.elapsedMs;
    const rerollAt = state.shared.loom?.lastReroll?.at ?? null;
    const snap = state.epoch !== this.lastEpoch || rerollAt !== this.lastRerollAt;
    this.lastEpoch = state.epoch; this.lastRerollAt = rerollAt;
    this.cameraFollow = coopCameraTarget(state, this.cameraFollow, deltaMs, snap);
    // Team framing already eases and contains the actors; do not apply solo look-ahead or ease twice.
    this.view.draw(world, deltaMs, true, { cameraTarget: this.cameraFollow, hidePlayer: true });
    this.cues.clear();
    const camera = this.scene.cameras.main;
    for (const id of PLAYER_IDS) {
      const player = state.players[id], actor = player.actor;
      const color = id === 'p1' ? 0xf5b384 : 0x8ed9ed;
      const active = player.state === 'active';
      this.actors[id].drawVisual({ runId: `${state.run.runId}:${state.epoch}:${id}`, now, hp: player.hp, form: doomForm(state.run.doom),
        actor, playing: world.mode === 'playing' && active, rewinding: player.rewind !== null, firedAt: actor.lastFiredAt,
        hidden: player.state === 'waiting', alpha: player.state === 'downed' ? 0.45 : 1 });
      if (player.state === 'waiting') { this.labels[id].setVisible(false); continue; }
      const inView = actor.x >= camera.scrollX + 12 && actor.x <= camera.scrollX + 628
        && actor.y >= camera.scrollY + 48 && actor.y <= camera.scrollY + 338;
      const arrow = actor.x < camera.scrollX + 12 ? '← ' : actor.x > camera.scrollX + 628 ? '→ '
        : actor.y < camera.scrollY + 48 ? '↑ ' : actor.y > camera.scrollY + 338 ? '↓ ' : '';
      const label = this.labels[id].setVisible(true).setText(`${arrow}${id === 'p1' ? '1P' : '2P'}${id === localId ? ' · YOU' : ''}${player.state === 'downed' ? ' · F 救援' : ''}`);
      const bounds = label.getBounds();
      label.setPosition(Math.round(clamp(actor.x, Math.ceil(camera.scrollX + 12 + bounds.width / 2), Math.floor(camera.scrollX + 628 - bounds.width / 2))),
        Math.round(clamp(actor.y - 23, Math.ceil(camera.scrollY + Math.max(75, 48 + bounds.height)), Math.floor(camera.scrollY + 335))));
      if (inView) {
        this.cues.lineStyle(1, color, 0.9).lineBetween(actor.x - 10, actor.y + 14, actor.x + 10, actor.y + 14);
        this.cues.fillStyle(color).fillTriangle(actor.x - 3, actor.y - 21, actor.x + 3, actor.y - 21, actor.x, actor.y - 18);
        if (player.state === 'downed') {
          this.cues.fillStyle(0x102127).fillRect(actor.x - 16, actor.y + 18, 32, 4);
          this.cues.fillStyle(0xbce1a3).fillRect(actor.x - 16, actor.y + 18, 32 * player.reviveProgressMs / COOP_RULES.reviveMs, 4);
        }
      }
      if (id !== localId) {
        drawCounterReward(this.cues, counterFeedbackFrame(playerView(state, id), { x: camera.scrollX, y: camera.scrollY, w: 640, h: 360 }));
        if (player.rewind) {
          this.cues.lineStyle(1, color, 0.5);
          player.rewind.path.forEach((point, index, path) => { if (index) this.cues.lineBetween(path[index - 1].x, path[index - 1].y, point.x, point.y); });
        }
      }
    }
    const first = this.labels.p1, second = this.labels.p2;
    if (first.visible && second.visible) {
      const a = first.getBounds(), b = second.getBounds();
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
        const gap = 3, lowerHeight = Math.ceil(b.height);
        const stackHeight = Math.ceil(a.height) + lowerHeight + gap;
        const bottom = Math.round(clamp(Math.max(a.bottom, b.bottom), Math.ceil(camera.scrollY + 48 + stackHeight), Math.floor(camera.scrollY + 335)));
        // Actual text bounds decide overlap; only labels move, with 1P consistently above 2P.
        first.setY(bottom - lowerHeight - gap); second.setY(bottom);
      }
    }
  }
  destroy() { for (const id of PLAYER_IDS) { this.actors[id].destroy(); this.labels[id].destroy(); } this.cues.destroy(); }
}
