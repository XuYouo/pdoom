import * as Phaser from 'phaser';
import { clawdFrameAt, clawdFrameName, clawdTexture, type ClawdPose } from '../data/clawdAssets';
import { PLAYER_HEIGHT, type DoomForm, type Player, type WorldState } from '../entities/model';
import { doomForm } from './rules';

export interface ClawdVisual {
  runId: string; now: number; hp: number; form: DoomForm;
  actor: Pick<Player, 'x' | 'y' | 'vx' | 'facing' | 'grounded' | 'petrifiedUntil' | 'invulnerableUntil'>;
  playing: boolean; rewinding: boolean; hidden?: boolean; alpha?: number;
}

/** Art only. Collision, timers and damage remain in the pure simulation. */
export class ClawdRenderer {
  private image: Phaser.GameObjects.Image;
  private runId = '';
  private lastNow = -1;
  private lastHp = 100;
  private hurtUntil = 0;
  private pose: ClawdPose = 'idle';
  private poseSince = 0;
  private texture = '';
  private frame = -1;

  constructor(scene: Phaser.Scene) {
    this.image = scene.add.image(0, 0, clawdTexture('aligned'), clawdFrameName(0)).setDepth(3).setDisplayOrigin(16, 27);
  }

  draw(world: WorldState) {
    this.drawVisual({
      runId: world.save.runId, now: world.save.elapsedMs, hp: world.save.hp, form: doomForm(world.save.doom),
      actor: world.player, playing: world.mode === 'playing', rewinding: world.rewind !== null,
      hidden: world.mode === 'dead' && world.factory !== null && world.player.y + PLAYER_HEIGHT / 2 >= world.factory.seaY,
    });
  }

  drawVisual(visual: ClawdVisual) {
    const { now, actor, playing } = visual;
    if (visual.runId !== this.runId || now < this.lastNow) {
      this.runId = visual.runId;
      this.lastHp = visual.hp;
      this.hurtUntil = 0;
      this.poseSince = now;
    }
    if (visual.hp < this.lastHp) this.hurtUntil = now + 120;
    this.lastHp = visual.hp;
    this.lastNow = now;
    const petrified = now < actor.petrifiedUntil;
    const next: ClawdPose = petrified ? 'idle' : now < this.hurtUntil ? 'hurt'
      : playing && !actor.grounded ? 'jump'
      : playing && Math.abs(actor.vx) > 10 ? 'run' : 'idle';
    if (next !== this.pose) { this.pose = next; this.poseSince = now; }
    const texture = clawdTexture(visual.form);
    const frame = petrified ? clawdFrameAt('idle', 0) : clawdFrameAt(this.pose, now - this.poseSince);
    if (texture !== this.texture || frame !== this.frame) {
      this.image.setTexture(texture, clawdFrameName(frame)).setDisplayOrigin(16, 27);
      this.texture = texture;
      this.frame = frame;
    }
    const flash = now < actor.invulnerableUntil && Math.floor(now / 80) % 2 === 0;
    this.image.setPosition(Math.round(actor.x), Math.round(actor.y + PLAYER_HEIGHT / 2))
      .setFlipX(actor.facing < 0).setAlpha(visual.alpha ?? 1)
      .setVisible(!visual.hidden && (petrified || !flash || !playing));
    if (petrified) this.image.setTint(0xbcc7c8).setTintMode(Phaser.TintModes.FILL);
    else this.image.clearTint().setTint(visual.rewinding ? 0xa5fff1 : 0xffffff);
  }

  setVisible(visible: boolean) { this.image.setVisible(visible); }
  destroy() { this.image.destroy(); }
}
