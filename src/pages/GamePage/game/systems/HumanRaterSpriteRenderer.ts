import type { WorldState } from '../entities/model';
import { worldPlatforms } from './platforms';
import { decodeCheckpoint } from '../data/checkpoints';
import { humanRaterSnapshot } from '../data/humanRater';
import { HUMAN_RATER_BINDING, HUMAN_RATER_POSES, type HumanRaterBinding, type HumanRaterPose } from '../data/humanRaterAssets';
export type { HumanRaterBinding, HumanRaterPose } from '../data/humanRaterAssets';
export const HUMAN_RATER_IMAGE_LIMIT = 2;
export interface HumanRaterView { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface HumanRaterTextureSource {
  readonly width: number; readonly height: number; readonly image: unknown; readonly source?: unknown;
}
export interface HumanRaterTextureFrame {
  readonly name: string | number; readonly texture: HumanRaterTexture;
  readonly sourceIndex: number; readonly source: HumanRaterTextureSource;
  readonly x: number; readonly y: number; readonly cutX: number; readonly cutY: number;
  readonly width: number; readonly height: number; readonly cutWidth: number; readonly cutHeight: number;
  readonly realWidth: number; readonly realHeight: number; readonly trimmed: boolean; readonly rotated: boolean;
}
export interface HumanRaterTexture {
  readonly key: string; readonly source: readonly HumanRaterTextureSource[];
  has(frame: string): boolean; get(frame: string): HumanRaterTextureFrame | undefined; setFilter(mode: number): unknown;
}
export interface HumanRaterTextures { exists(key: string): boolean; get(key: string): HumanRaterTexture }
export interface HumanRaterImage {
  readonly scene?: unknown; readonly active?: boolean; readonly isDestroyed?: boolean;
  once?(event: string, listener: () => void): unknown;
  setTexture(key: string, frame: string): unknown; setOrigin(x: number, y: number): unknown;
  setScale(value: number): unknown; setRotation(value: number): unknown; setPosition(x: number, y: number): unknown;
  setDepth(value: number): unknown; setAlpha(value: number): unknown; setVisible(value: boolean): unknown;
  setCrop(x: number, y: number, width: number, height: number): unknown;
  clearTint(): unknown; setFlip(x: boolean, y: boolean): unknown; destroy(): unknown;
}
export interface HumanRaterScene {
  readonly textures: HumanRaterTextures;
  readonly add: { image(x: number, y: number, key: string, frame: string): HumanRaterImage };
}
interface Resources { readonly texture: HumanRaterTexture; readonly refs: readonly unknown[] }
export interface HumanRaterPlacement { readonly id: string; readonly room: 1 | 2; readonly role: HumanRaterPose; readonly x: number; readonly y: number; readonly supportId: string; readonly visible: boolean }
type Command = HumanRaterPlacement;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function copyBinding(value: unknown): HumanRaterBinding | null {
  try {
    if (!record(value)) return null;
    const key = value.key, raw = value.frames;
    if (key !== HUMAN_RATER_BINDING.key || !record(raw)) return null;
    const frames = {} as Record<HumanRaterPose, string>;
    for (const role of HUMAN_RATER_POSES) {
      const frame = raw[role]; if (frame !== HUMAN_RATER_BINDING.frames[role]) return null;
      frames[role] = frame;
    }
    return Object.freeze({ key, frames: Object.freeze(frames) });
  } catch { return null; }
}
function nativeImage(image: unknown): boolean {
  if (!record(image)) return false;
  if ('naturalWidth' in image || 'naturalHeight' in image) return image.naturalWidth === 256 && image.naturalHeight === 64;
  return image.width === 256 && image.height === 64;
}
function resources(textures: HumanRaterTextures, binding: HumanRaterBinding): Resources | null {
  if (!textures.exists(binding.key)) return null;
  const texture = textures.get(binding.key), sources = texture.source;
  if (texture.key !== binding.key || !Array.isArray(sources) || sources.length !== 1) return null;
  const source = sources[0], image = source?.image;
  if (!source || source.width !== 256 || source.height !== 64 || !nativeImage(image)) return null;
  const refs: unknown[] = [texture, sources, source, image, source.source], seen = new Set<HumanRaterTextureFrame>();
  for (const [index, role] of HUMAN_RATER_POSES.entries()) {
    const name = binding.frames[role]; if (!texture.has(name)) return null;
    const f = texture.get(name);
    if (!f || seen.has(f) || f.name !== name || f.texture !== texture || f.source !== source || f.sourceIndex !== 0
      || f.trimmed !== false || f.rotated !== false || f.x !== 0 || f.y !== 0 || f.cutX !== index * 64 || f.cutY !== 0
      || [f.width, f.height, f.realWidth, f.realHeight, f.cutWidth, f.cutHeight].some(v => v !== 64)) return null;
    seen.add(f); refs.push(f);
  }
  return { texture, refs };
}
/** Pure whole-family guard, including unused frames; no filter or allocation writes. */
export function humanRaterResourcesReady(textures: HumanRaterTextures, value: unknown): boolean {
  try { const binding = copyBinding(value); return !!binding && resources(textures, binding) !== null; } catch { return false; }
}
/** Read the live support list, not the static chapter floor or remembered prior pose. */
export function humanRaterPlan(world: Readonly<WorldState>, view: HumanRaterView): readonly HumanRaterPlacement[] {
  const { runId, stage: saveStage, checkpoint: savedCheckpoint } = world.save;
  const { stage, width, height, checkpoints } = world.chapter;
  const { x: vx, y: vy, width: vw, height: vh } = view;
  if (typeof runId !== 'string' || !runId.trim() || saveStage !== stage || ![1, 2, 3, 4, 5].includes(stage)
    || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 640 || height < 360
    || vw !== 640 || vh !== 360 || !Number.isFinite(vx) || !Number.isFinite(vy)
    || vx < 0 || vy < 0 || vx > width - vw || vy > height - vh || !Array.isArray(checkpoints) || checkpoints.length !== 3) throw Error('Invalid Human Rater view');
  const saved = decodeCheckpoint(savedCheckpoint), mode = world.mode;
  if (!saved.supported || !['ready', 'playing', 'rest', 'dead', 'cleared', 'finished'].includes(mode)) throw Error('Invalid Human Rater checkpoint');
  const moving = new Set(world.furnace?.lifts.map(lift => lift.id) ?? []);
  const platforms = worldPlatforms(world).filter(platform => !moving.has(platform.id)), seaY = world.factory?.seaY;
  if (seaY !== undefined && !Number.isFinite(seaY)) throw Error('Invalid Human Rater support');
  const result: HumanRaterPlacement[] = [], ids = new Set<number>();
  for (const point of checkpoints) {
    const { id: room, x: checkpointX, y: checkpointY } = point;
    if (![0, 1, 2].includes(room) || ids.has(room) || !Number.isFinite(checkpointX) || !Number.isFinite(checkpointY)) throw Error('Invalid Human Rater anchor');
    ids.add(room); if (room === 0) continue;
    const x = Math.round(checkpointX + (stage === 4 || stage === 1 && room === 2 ? -56 : 56));
    const supports = platforms.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.w) && p.w > 0 && Number.isFinite(p.h) && p.h > 0
      && checkpointX >= p.x && checkpointX <= p.x + p.w && Math.abs(p.y - checkpointY - 11) <= 3
      && x - 32 >= p.x && x + 32 <= p.x + p.w && (seaY === undefined || seaY > p.y));
    // Multiple ambiguous supports are not a license to snap the station onto another platform.
    if (supports.length !== 1) continue;
    const support = supports[0], y = Math.round(support.y);
    if (x - 32 < 0 || x + 32 > width || y - 60 < 0 || y + 4 > height || typeof support.id !== 'string' || !support.id) continue;
    const rest = world.rest;
    const role = mode === 'rest' && saved.resting && saved.room === room && rest !== null && rest.room === room
      ? humanRaterSnapshot(rest.evaluation, saved.hackUsed).pose : 'neutral';
    if (!HUMAN_RATER_POSES.includes(role)) throw Error('Invalid Human Rater pose');
    result.push({ id: `rater:${room}`, room, role, x, y, supportId: support.id,
      visible: x + 32 > vx && x - 32 < vx + vw && y + 4 > vy && y - 60 < vy + vh });
    if (result.length > HUMAN_RATER_IMAGE_LIMIT) throw Error('Human Rater image budget');
  }
  return result;
}
function snapshot(world: Readonly<WorldState>, view: HumanRaterView) {
  return { runId: world.save.runId, stage: world.chapter.stage, commands: humanRaterPlan(world, view) };
}
/** Native images keyed by real live ids. No gameplay mutations or wall clock; platform/marker and actor ordering stays outside this adapter. */
export class HumanRaterSpriteRenderer {
  private readonly binding: HumanRaterBinding | null;
  private images = new Map<string, HumanRaterImage>();
  private readonly released = new WeakSet<HumanRaterImage>();
  private refs: readonly unknown[] = [];
  private runId: string | null = null;
  private stage: number | null = null;
  private disposed = false;
  private drawing = false;
  private releasing = false;
  private epoch = 0;
  constructor(private readonly scene: HumanRaterScene, binding: unknown = null) { this.binding = copyBinding(binding); }
  draw(world: Readonly<WorldState>, view: HumanRaterView): ReadonlySet<string> {
    const handled = new Set<string>();
    if (this.disposed || this.releasing) return handled;
    if (this.drawing) { this.releaseOwned(); return handled; }
    this.drawing = true;
    try {
      const start = this.epoch, plan = snapshot(world, view); this.assertLive(start);
      if (!this.binding) throw Error('Invalid humanRater binding');
      const ready = resources(this.scene.textures, this.binding); this.assertLive(start);
      if (!ready) throw Error('Invalid humanRater resources');
      const changed = ready.refs.length !== this.refs.length || ready.refs.some((v, i) => v !== this.refs[i]);
      if ((changed || plan.runId !== this.runId || plan.stage !== this.stage) && !this.releaseOwned()) {
        throw Error('HumanRater generation cleanup failed');
      }
      const epoch = this.epoch; this.assertLive(epoch);
      if (changed) { ready.texture.setFilter(1); this.assertLive(epoch); this.refs = ready.refs; }
      this.runId = plan.runId; this.stage = plan.stage;
      const live = new Set(plan.commands.map(command => command.id));
      for (const [id, image] of this.images) if (!live.has(id)) {
        this.images.delete(id);
        const clean = this.releaseImage(image); this.assertLive(epoch);
        if (!clean) throw Error('HumanRater cleanup failed');
      }
      for (const command of plan.commands) {
        let image = this.images.get(command.id);
        if (!command.visible) {
          if (image) { this.assertLive(epoch, image); image.setVisible(false); this.assertLive(epoch, image); }
          continue;
        }
        if (!image) {
          image = this.scene.add.image(command.x, command.y, this.binding.key, this.binding.frames[command.role]);
          if (!record(image) || this.released.has(image) || [...this.images.values()].includes(image)) throw Error('Aliased humanRater Image');
          // Adopt even a handle returned after a factory-triggered dispose, then release it safely.
          this.images.set(command.id, image); this.assertLive(epoch, image);
          const owned = image;
          image.once?.('destroy', () => {
            if (this.released.has(owned)) return;
            // Phaser emits destroy before clearing scene/active. Fence that live-looking handle first.
            this.released.add(owned); this.releaseOwned();
          });
          this.assertLive(epoch, image);
        }
        this.configure(image, command, epoch); handled.add(command.id);
      }
      this.assertLive(epoch); return handled;
    } catch { this.releaseOwned(); return new Set<string>(); }
    finally { this.drawing = false; }
  }
  private configure(image: HumanRaterImage, command: Command, epoch: number): void {
    if (!this.binding) throw Error('Unavailable humanRater binding');
    this.assertLive(epoch, image);
    image.setTexture(this.binding.key, this.binding.frames[command.role]); this.assertLive(epoch, image);
    image.setOrigin(0.5, 60 / 64); this.assertLive(epoch, image);
    image.setScale(1); this.assertLive(epoch, image);
    image.setRotation(0); this.assertLive(epoch, image);
    image.setFlip(false, false); this.assertLive(epoch, image);
    image.clearTint(); this.assertLive(epoch, image); // Also resets Phaser4's separate FILL tint mode.
    image.setAlpha(1); this.assertLive(epoch, image);
    image.setPosition(command.x, command.y); this.assertLive(epoch, image);
    image.setDepth(-3); this.assertLive(epoch, image);
    image.setCrop(0, 0, 64, 64); this.assertLive(epoch, image);
    image.setVisible(true); this.assertLive(epoch, image);
  }
  private assertLive(epoch: number, image?: HumanRaterImage): void {
    const dead = image && (this.released.has(image) || image.isDestroyed === true || image.active === false || 'scene' in image && !image.scene);
    if (this.disposed || epoch !== this.epoch || dead) throw Error('Disposed humanRater generation');
  }
  private releaseImage(image: HumanRaterImage): boolean {
    if (this.released.has(image)) return true;
    this.released.add(image);
    // A factory may return an already destroyed object before our listener can be installed.
    try { if (image.isDestroyed === true || 'scene' in image && !image.scene) return true; } catch { /* Still try both releases. */ }
    let clean = true;
    try { image.setVisible(false); } catch { clean = false; }
    try { image.destroy(); } catch { clean = false; }
    return clean;
  }
  private releaseOwned(): boolean {
    if (this.releasing) return true;
    this.releasing = true;
    let clean = true;
    const images = this.images; this.images = new Map(); this.runId = null; this.stage = null; this.epoch++;
    try { for (const image of images.values()) if (!this.releaseImage(image)) clean = false; return clean; }
    finally { this.releasing = false; }
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.refs = []; this.releaseOwned();
  }
}
