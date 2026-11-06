import * as Phaser from 'phaser';
import { clawdFrameAt, clawdFrameName, clawdShotFrame, clawdTexture, type ClawdPose } from '../data/clawdAssets';
import { PLAYER_HEIGHT, type DoomForm, type Player, type WorldState } from '../entities/model';
import { clawdResourceSnapshot, sameClawdResources, type ClawdResources, type ClawdTextures } from './ClawdResources';
import { doomForm } from './rules';

export interface ClawdVisual {
  runId: string; now: number; hp: number; form: DoomForm;
  actor: Pick<Player, 'x' | 'y' | 'vx' | 'facing' | 'grounded' | 'petrifiedUntil' | 'invulnerableUntil'>;
  playing: boolean; rewinding: boolean; hidden?: boolean; alpha?: number; firedAt?: number | null;
}
export interface ClawdImage {
  readonly scene?: unknown; readonly active?: boolean; readonly isDestroyed?: boolean;
  once?(event: string, listener: () => void): unknown;
  setTexture(key: string, frame: string): unknown; setDisplayOrigin(x: number, y: number): unknown;
  setScale(value: number): unknown; setRotation(value: number): unknown; setPosition(x: number, y: number): unknown;
  setDepth(value: number): unknown; setAlpha(value: number): unknown; setVisible(value: boolean): unknown;
  setCrop(): unknown; clearTint(): unknown; setTint(value: number): unknown; setTintMode(value: number): unknown;
  setFlip(x: boolean, y: boolean): unknown; destroy(): unknown;
}
export interface ClawdScene {
  readonly textures: ClawdTextures;
  readonly add: { image(x: number, y: number, key: string, frame: string): ClawdImage };
}
interface Motion { runId: string; lastNow: number; lastHp: number; hurtUntil: number; pose: ClawdPose; poseSince: number }
const owned = new WeakSet<object>();
const methods = ['setTexture', 'setDisplayOrigin', 'setScale', 'setRotation', 'setPosition', 'setDepth', 'setAlpha',
  'setVisible', 'setCrop', 'clearTint', 'setTint', 'setTintMode', 'setFlip', 'destroy'] as const;
const alive = (image: ClawdImage): boolean => image.isDestroyed !== true && image.active !== false && image.scene !== null;
function snapshot(v: ClawdVisual): ClawdVisual {
  const a = v.actor, actor = { x: a.x, y: a.y, vx: a.vx, facing: a.facing, grounded: a.grounded, petrifiedUntil: a.petrifiedUntil, invulnerableUntil: a.invulnerableUntil };
  const copy = { runId: v.runId, now: v.now, hp: v.hp, form: v.form, actor, playing: v.playing, rewinding: v.rewinding,
    firedAt: v.firedAt, hidden: v.hidden, alpha: v.alpha ?? 1 };
  if (typeof copy.runId !== 'string' || !copy.runId.trim() || ![copy.now, copy.hp, actor.x, actor.y, actor.vx, actor.petrifiedUntil, actor.invulnerableUntil, copy.alpha].every(Number.isFinite)
    || copy.now < 0 || copy.hp < 0 || copy.alpha < 0 || copy.alpha > 1 || !['aligned', 'masked', 'foom'].includes(copy.form)
    || ![-1, 1].includes(actor.facing) || typeof actor.grounded !== 'boolean' || typeof copy.playing !== 'boolean' || typeof copy.rewinding !== 'boolean'
    || copy.hidden !== undefined && typeof copy.hidden !== 'boolean') throw Error('Invalid Clawd visual');
  return copy;
}
function motion(v: ClawdVisual, previous: Motion) {
  const { now, actor, playing } = v, reset = v.runId !== previous.runId || now < previous.lastNow;
  const lastHp = reset ? v.hp : previous.lastHp;
  const hurtUntil = v.hp < lastHp ? now + 120 : reset ? 0 : previous.hurtUntil;
  const petrified = now < actor.petrifiedUntil;
  const pose: ClawdPose = petrified ? 'idle' : now < hurtUntil ? 'hurt' : playing && !actor.grounded ? 'jump' : playing && Math.abs(actor.vx) > 10 ? 'run' : 'idle';
  const poseSince = reset || pose !== previous.pose ? now : previous.poseSince;
  const base = petrified ? 0 : clawdFrameAt(pose, now - poseSince);
  const frame = clawdShotFrame(base, now, v.firedAt, playing && !petrified && !v.rewinding);
  return { petrified, frame, state: { runId: v.runId, lastNow: now, lastHp: v.hp, hurtUntil, pose, poseSince } };
}
/** One owned Image per actor; pure simulation time and source-pose matrix, never an AnimationManager clock. */
export class ClawdRenderer {
  private image: ClawdImage | null = null;
  private state: Motion = { runId: '', lastNow: -1, lastHp: 100, hurtUntil: 0, pose: 'idle', poseSince: 0 };
  private resources: ClawdResources | null = null;
  private texture = ''; private frame = -1; private disposed = false; private drawing = false; private epoch = 0;
  constructor(private readonly scene: ClawdScene) {}
  draw(world: WorldState) {
    this.drawVisual({ runId: world.save.runId, now: world.save.elapsedMs, hp: world.save.hp, form: doomForm(world.save.doom), actor: world.player,
      firedAt: world.player.lastFiredAt, playing: world.mode === 'playing', rewinding: world.rewind !== null,
      hidden: world.mode === 'dead' && world.factory !== null && world.player.y + PLAYER_HEIGHT / 2 >= world.factory.seaY });
  }
  private drop() {
    const image = this.image; this.image = null; this.resources = null; this.texture = ''; this.frame = -1;
    if (image && owned.has(image)) { owned.delete(image); try { if (image.isDestroyed !== true) image.destroy(); } catch { /* Disposal must stay terminal. */ } }
  }
  private hide() {
    this.resources = null; this.texture = ''; this.frame = -1;
    try { if (this.image && owned.has(this.image) && alive(this.image)) this.image.setVisible(false); } catch { this.drop(); }
  }
  private acquire(key: string, name: string): ClawdImage {
    if (this.image && !alive(this.image)) this.drop();
    if (this.image) return this.image;
    const image = this.scene.add.image(0, 0, key, name);
    if (!image || typeof image !== 'object' || owned.has(image) || image.scene !== undefined && image.scene !== this.scene) throw Error('Foreign Clawd image');
    owned.add(image); this.image = image;
    if (!alive(image) || methods.some(m => typeof image[m] !== 'function')) throw Error('Invalid Clawd image');
    image.once?.('destroy', () => { if (this.image === image) { owned.delete(image); this.image = null; this.resources = null; this.texture = ''; this.frame = -1; this.epoch++; } });
    return image;
  }
  drawVisual(value: ClawdVisual) {
    if (this.disposed || this.drawing) return;
    this.drawing = true; const epoch = this.epoch;
    try {
      const visual = snapshot(value), resources = clawdResourceSnapshot(this.scene.textures);
      if (!resources) { this.hide(); return; }
      const plan = motion(visual, this.state), key = clawdTexture(visual.form), name = clawdFrameName(plan.frame);
      const image = this.acquire(key, name);
      const ensure = () => { if (this.disposed || this.epoch !== epoch || this.image !== image || !alive(image)) throw Error('Stale Clawd draw'); };
      const apply = (write: () => unknown) => { ensure(); write(); ensure(); };
      apply(() => image.setVisible(false));
      if (!sameClawdResources(this.resources, resources)) for (const texture of resources.textures) apply(() => texture.setFilter(1));
      if (key !== this.texture || plan.frame !== this.frame || !sameClawdResources(this.resources, resources)) apply(() => image.setTexture(key, name));
      apply(() => image.setDisplayOrigin(16, 27)); apply(() => image.setScale(1)); apply(() => image.setRotation(0));
      apply(() => image.setCrop()); apply(() => image.setDepth(3));
      apply(() => image.setPosition(Math.round(visual.actor.x), Math.round(visual.actor.y + PLAYER_HEIGHT / 2)));
      apply(() => image.setFlip(visual.actor.facing < 0, false)); apply(() => image.setAlpha(visual.alpha ?? 1));
      apply(() => image.clearTint());
      if (plan.petrified) { apply(() => image.setTint(0xbcc7c8)); apply(() => image.setTintMode(Phaser.TintModes.FILL)); }
      else apply(() => image.setTint(visual.rewinding ? 0xa5fff1 : 0xffffff));
      if (!sameClawdResources(resources, clawdResourceSnapshot(this.scene.textures))) throw Error('Replaced Clawd resources');
      const flash = visual.now < visual.actor.invulnerableUntil && Math.floor(visual.now / 80) % 2 === 0;
      apply(() => image.setVisible(!visual.hidden && (plan.petrified || !flash || !visual.playing)));
      if (!sameClawdResources(resources, clawdResourceSnapshot(this.scene.textures))) throw Error('Replaced Clawd resources');
      this.state = plan.state; this.resources = resources; this.texture = key; this.frame = plan.frame;
    } catch { this.drop(); } finally { this.drawing = false; }
  }
  setVisible(visible: boolean) {
    if (this.disposed) return;
    this.epoch++;
    try {
      if (this.image && alive(this.image)) this.image.setVisible(visible && sameClawdResources(this.resources, clawdResourceSnapshot(this.scene.textures)));
    } catch { this.drop(); }
  }
  destroy() { if (this.disposed) return; this.disposed = true; this.epoch++; this.drop(); }
}
