import type { WorldState } from '../entities/model';
import { PICKUP_BINDING, PICKUP_ROLES, type PickupBinding, type PickupRole } from '../data/pickupAssets';
export type { PickupBinding, PickupRole } from '../data/pickupAssets';
export const PICKUP_IMAGE_LIMIT = 64;
export interface PickupView { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface PickupTextureSource {
  readonly width: number; readonly height: number; readonly image: unknown; readonly source?: unknown;
}
export interface PickupTextureFrame {
  readonly name: string | number; readonly texture: PickupTexture;
  readonly sourceIndex: number; readonly source: PickupTextureSource;
  readonly x: number; readonly y: number; readonly cutX: number; readonly cutY: number;
  readonly width: number; readonly height: number; readonly cutWidth: number; readonly cutHeight: number;
  readonly realWidth: number; readonly realHeight: number; readonly trimmed: boolean; readonly rotated: boolean;
}
export interface PickupTexture {
  readonly key: string; readonly source: readonly PickupTextureSource[];
  has(frame: string): boolean; get(frame: string): PickupTextureFrame | undefined; setFilter(mode: number): unknown;
}
export interface PickupTextures { exists(key: string): boolean; get(key: string): PickupTexture }
export interface PickupImage {
  readonly scene?: unknown; readonly active?: boolean; readonly isDestroyed?: boolean;
  once?(event: string, listener: () => void): unknown;
  setTexture(key: string, frame: string): unknown; setOrigin(x: number, y: number): unknown;
  setScale(value: number): unknown; setRotation(value: number): unknown; setPosition(x: number, y: number): unknown;
  setDepth(value: number): unknown; setAlpha(value: number): unknown; setVisible(value: boolean): unknown;
  setCrop(x: number, y: number, width: number, height: number): unknown;
  clearTint(): unknown; setFlip(x: boolean, y: boolean): unknown; destroy(): unknown;
}
export interface PickupScene {
  readonly textures: PickupTextures;
  readonly add: { image(x: number, y: number, key: string, frame: string): PickupImage };
}
interface Resources { readonly texture: PickupTexture; readonly refs: readonly unknown[] }
interface Command { readonly id: string; readonly role: PickupRole; readonly x: number; readonly y: number; readonly visible: boolean }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function copyBinding(value: unknown): PickupBinding | null {
  try {
    if (!record(value)) return null;
    const key = value.key, raw = value.frames;
    if (key !== PICKUP_BINDING.key || !record(raw)) return null;
    const frames = {} as Record<PickupRole, string>;
    for (const role of PICKUP_ROLES) {
      const frame = raw[role]; if (frame !== PICKUP_BINDING.frames[role]) return null;
      frames[role] = frame;
    }
    return Object.freeze({ key, frames: Object.freeze(frames) });
  } catch { return null; }
}
function nativeImage(image: unknown): boolean {
  if (!record(image)) return false;
  if ('naturalWidth' in image || 'naturalHeight' in image) return image.naturalWidth === 96 && image.naturalHeight === 32;
  return image.width === 96 && image.height === 32;
}
function resources(textures: PickupTextures, binding: PickupBinding): Resources | null {
  if (!textures.exists(binding.key)) return null;
  const texture = textures.get(binding.key), sources = texture.source;
  if (texture.key !== binding.key || !Array.isArray(sources) || sources.length !== 1) return null;
  const source = sources[0], image = source?.image;
  if (!source || source.width !== 96 || source.height !== 32 || !nativeImage(image)) return null;
  const refs: unknown[] = [texture, sources, source, image, source.source], seen = new Set<PickupTextureFrame>();
  for (const [index, role] of PICKUP_ROLES.entries()) {
    const name = binding.frames[role]; if (!texture.has(name)) return null;
    const f = texture.get(name);
    if (!f || seen.has(f) || f.name !== name || f.texture !== texture || f.source !== source || f.sourceIndex !== 0
      || f.trimmed !== false || f.rotated !== false || f.x !== 0 || f.y !== 0 || f.cutX !== index * 32 || f.cutY !== 0
      || [f.width, f.height, f.realWidth, f.realHeight, f.cutWidth, f.cutHeight].some(v => v !== 32)) return null;
    seen.add(f); refs.push(f);
  }
  return { texture, refs };
}
/** Pure whole-family guard, including unused frames; no filter or allocation writes. */
export function pickupResourcesReady(textures: PickupTextures, value: unknown): boolean {
  try { const binding = copyBinding(value); return !!binding && resources(textures, binding) !== null; } catch { return false; }
}
function snapshot(world: Readonly<WorldState>, view: PickupView) {
  const { runId, elapsedMs: now } = world.save, { stage, width, height } = world.chapter, pickups = world.pickups;
  const { x: vx, y: vy, width: vw, height: vh } = view;
  if (typeof runId !== 'string' || !runId.trim() || !Number.isFinite(now) || now < 0
    || ![1, 2, 3, 4, 5].includes(stage) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 640 || height < 360 || vw !== 640 || vh !== 360 || !Number.isFinite(vx) || !Number.isFinite(vy)
    || vx < 0 || vy < 0 || vx > width - vw || vy > height - vh || !Array.isArray(pickups)) throw Error('Invalid pickup view');
  const commands: Command[] = [], ids = new Set<string>();
  for (const pickup of pickups) {
    const { id, kind, x, y } = pickup;
    if (typeof id !== 'string' || !id.trim() || ids.has(id) || !Number.isFinite(x) || !Number.isFinite(y)
      || !['token', 'compute', 'heal', 'mushroom'].includes(kind)) throw Error('Invalid pickup');
    ids.add(id); if (kind === 'mushroom') continue;
    const bob = y + Math.sin(now / 280 + x) * 2;
    if (!Number.isFinite(bob) || commands.length >= PICKUP_IMAGE_LIMIT) throw Error('Invalid pickup budget');
    commands.push({ id, role: kind, x, y: bob, visible: x + 16 > vx && x - 16 < vx + vw && bob + 16 > vy && bob - 16 < vy + vh });
  }
  return { runId, stage, commands };
}
/** Native images keyed by real live ids. No gameplay mutations or wall clock. */
export class PickupSpriteRenderer {
  private readonly binding: PickupBinding | null;
  private images = new Map<string, PickupImage>();
  private readonly released = new WeakSet<PickupImage>();
  private refs: readonly unknown[] = [];
  private runId: string | null = null;
  private stage: number | null = null;
  private disposed = false;
  private drawing = false;
  private releasing = false;
  private epoch = 0;
  constructor(private readonly scene: PickupScene, binding: unknown = null) { this.binding = copyBinding(binding); }
  draw(world: Readonly<WorldState>, view: PickupView): ReadonlySet<string> {
    const handled = new Set<string>();
    if (this.disposed || this.releasing) return handled;
    if (this.drawing) { this.releaseOwned(); return handled; }
    this.drawing = true;
    try {
      const start = this.epoch, plan = snapshot(world, view); this.assertLive(start);
      if (!this.binding) throw Error('Invalid pickup binding');
      const ready = resources(this.scene.textures, this.binding); this.assertLive(start);
      if (!ready) throw Error('Invalid pickup resources');
      const changed = ready.refs.length !== this.refs.length || ready.refs.some((v, i) => v !== this.refs[i]);
      if ((changed || plan.runId !== this.runId || plan.stage !== this.stage) && !this.releaseOwned()) {
        throw Error('Pickup generation cleanup failed');
      }
      const epoch = this.epoch; this.assertLive(epoch);
      if (changed) { ready.texture.setFilter(1); this.assertLive(epoch); this.refs = ready.refs; }
      this.runId = plan.runId; this.stage = plan.stage;
      const live = new Set(plan.commands.map(command => command.id));
      for (const [id, image] of this.images) if (!live.has(id)) {
        this.images.delete(id);
        const clean = this.releaseImage(image); this.assertLive(epoch);
        if (!clean) throw Error('Pickup cleanup failed');
      }
      for (const command of plan.commands) {
        let image = this.images.get(command.id);
        if (!command.visible) {
          if (image) { this.assertLive(epoch, image); image.setVisible(false); this.assertLive(epoch, image); }
          continue;
        }
        if (!image) {
          image = this.scene.add.image(command.x, command.y, this.binding.key, this.binding.frames[command.role]);
          if (!record(image) || this.released.has(image) || [...this.images.values()].includes(image)) throw Error('Aliased pickup Image');
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
  private configure(image: PickupImage, command: Command, epoch: number): void {
    if (!this.binding) throw Error('Unavailable pickup binding');
    this.assertLive(epoch, image);
    image.setTexture(this.binding.key, this.binding.frames[command.role]); this.assertLive(epoch, image);
    image.setOrigin(0.5, 0.5); this.assertLive(epoch, image);
    image.setScale(1); this.assertLive(epoch, image);
    image.setRotation(0); this.assertLive(epoch, image);
    image.setFlip(false, false); this.assertLive(epoch, image);
    image.clearTint(); this.assertLive(epoch, image); // Also resets Phaser4's separate FILL tint mode.
    image.setAlpha(1); this.assertLive(epoch, image);
    image.setPosition(command.x, command.y); this.assertLive(epoch, image);
    image.setDepth(-1); this.assertLive(epoch, image);
    image.setCrop(0, 0, 32, 32); this.assertLive(epoch, image);
    image.setVisible(true); this.assertLive(epoch, image);
  }
  private assertLive(epoch: number, image?: PickupImage): void {
    const dead = image && (this.released.has(image) || image.isDestroyed === true || image.active === false || 'scene' in image && !image.scene);
    if (this.disposed || epoch !== this.epoch || dead) throw Error('Disposed pickup generation');
  }
  private releaseImage(image: PickupImage): boolean {
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
