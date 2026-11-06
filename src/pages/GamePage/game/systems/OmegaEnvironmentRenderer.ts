import type { WorldState } from '../entities/model';
import { OMEGA_TERRAIN_ROLES, OMEGA_PROP_ROLES, OMEGA_IMAGE_LIMIT, planOmegaEnvironment,
  type OmegaTerrainRole, type OmegaPropRole, type OmegaCommand, type OmegaRect } from './OmegaEnvironmentPlan';

export interface OmegaTextureBinding<R extends string> { readonly key: string; readonly frames: Readonly<Record<R, string | number>> }
export interface OmegaEnvironmentBinding { readonly terrain: OmegaTextureBinding<OmegaTerrainRole>; readonly props: OmegaTextureBinding<OmegaPropRole> }
export interface OmegaTextureSource { readonly width: number; readonly height: number; readonly image: unknown; readonly source?: unknown }
export interface OmegaTextureFrame {
  readonly name: string | number; readonly texture: OmegaSourceTexture; readonly sourceIndex: number; readonly source: OmegaTextureSource;
  readonly x: number; readonly y: number; readonly cutX: number; readonly cutY: number;
  readonly width: number; readonly height: number; readonly cutWidth: number; readonly cutHeight: number;
  readonly realWidth: number; readonly realHeight: number; readonly trimmed: boolean; readonly rotated: boolean;
}
export interface OmegaSourceTexture {
  readonly key: string; readonly source: readonly OmegaTextureSource[];
  setFilter(mode: number): unknown; has(frame: string): boolean; get(frame: string): OmegaTextureFrame | undefined;
}
export interface OmegaTextures { exists(key: string): boolean; get(key: string): OmegaSourceTexture }
export interface OmegaImage {
  readonly scene?: unknown; readonly active?: boolean;
  once?(event: string, listener: () => void): unknown;
  setTexture(key: string, frame: string): unknown;
  setOrigin(x: number, y: number): unknown; setScale(value: number): unknown; setRotation(value: number): unknown;
  setPosition(x: number, y: number): unknown; setDepth(value: number): unknown; setAlpha(value: number): unknown;
  setVisible(value: boolean): unknown; setCrop(x: number, y: number, width: number, height: number): unknown;
  setTint(value: number): unknown; setFlip(x: boolean, y: boolean): unknown; destroy(): unknown;
}
export interface OmegaEnvironmentScene {
  readonly textures: OmegaTextures;
  readonly add: { image(x: number, y: number, texture: string, frame: string): OmegaImage };
}
interface Resources { readonly refs: readonly unknown[]; readonly textures: readonly OmegaSourceTexture[] }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function copyPart<R extends string>(value: unknown, roles: readonly R[], key: string, prop: boolean): OmegaTextureBinding<R> | null {
  if (!record(value) || value.key !== key || !record(value.frames)) return null;
  const entries: [R, string][] = [];
  for (const [index, role] of roles.entries()) {
    const raw = value.frames[role], expected = prop ? `omega-props ${index}.aseprite` : String(index);
    if (!(typeof raw === 'string' || typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0)
      || String(raw) !== expected) return null;
    entries.push([role, expected]);
  }
  return Object.freeze({ key, frames: Object.freeze(Object.fromEntries(entries) as Record<R, string>) });
}
function copyBinding(value: unknown): OmegaEnvironmentBinding | null {
  try {
    if (!record(value)) return null;
    const terrain = copyPart(value.terrain, OMEGA_TERRAIN_ROLES, 'environment-omega-terrain', false);
    const props = copyPart(value.props, OMEGA_PROP_ROLES, 'environment-omega-props', true);
    return terrain && props ? Object.freeze({ terrain, props }) : null;
  } catch { return null; }
}
function nativeImage(image: unknown, width: number, height: number): boolean {
  if (!record(image)) return false;
  if ('naturalWidth' in image || 'naturalHeight' in image) return image.naturalWidth === width && image.naturalHeight === height;
  return image.width === width && image.height === height;
}
function resources(textures: OmegaTextures, binding: OmegaEnvironmentBinding): Resources | null {
  const refs: unknown[] = [], sources: OmegaSourceTexture[] = [], seen = new Set<OmegaTextureFrame>();
  const wrappers = new Set<OmegaTextureSource>(), images = new Set<unknown>();
  for (const [part, roles, w, h, sw, sh] of [
    [binding.terrain, OMEGA_TERRAIN_ROLES, 16, 16, 96, 96],
    [binding.props, OMEGA_PROP_ROLES, 64, 128, 384, 128],
  ] as const) {
    if (!textures.exists(part.key)) return null;
    const texture = textures.get(part.key);
    if (texture.key !== part.key || !Array.isArray(texture.source) || texture.source.length !== 1 || sources.includes(texture)) return null;
    const source = texture.source[0], image = source?.image;
    if (!source || wrappers.has(source) || images.has(image) || source.width !== sw || source.height !== sh
      || !nativeImage(image, sw, sh)) return null;
    // Sharing within one family is required; sharing physical media across the two families is not.
    wrappers.add(source); images.add(image);
    refs.push(texture, texture.source, source, image, source.source); sources.push(texture);
    for (const [index, role] of roles.entries()) {
      const name = String((part.frames as Readonly<Record<string, string | number>>)[role]);
      if (!texture.has(name)) return null;
      const f = texture.get(name);
      if (!f || f.texture !== texture || f.source !== source || f.sourceIndex !== 0
        || !(typeof f.name === 'string' || typeof f.name === 'number' && Number.isSafeInteger(f.name)) || String(f.name) !== name
        || f.trimmed !== false || f.rotated !== false || f.x !== 0 || f.y !== 0) return null;
      if (f.cutX !== index % 6 * w || f.cutY !== Math.floor(index / 6) * h
        || [f.cutWidth, f.width, f.realWidth].some(v => v !== w)
        || [f.cutHeight, f.height, f.realHeight].some(v => v !== h) || seen.has(f)) return null;
      seen.add(f); refs.push(f);
    }
  }
  return { refs, textures: sources };
}
/** Pure all38-frame gate: no Image allocation, filter writes, texture ownership or borrowed-texture destruction. */
export function omegaEnvironmentResourcesReady(textures: OmegaTextures, value: unknown): boolean {
  try { const binding = copyBinding(value); return !!binding && resources(textures, binding) !== null; } catch { return false; }
}

export class OmegaEnvironmentRenderer {
  private readonly binding: OmegaEnvironmentBinding | null;
  private pool: OmegaImage[] = [];
  private readonly released = new WeakSet<OmegaImage>();
  private refs: readonly unknown[] = [];
  private runId: string | null = null;
  private disposed = false;
  private drawing = false;
  private releasing = false;
  private epoch = 0;
  constructor(private readonly scene: OmegaEnvironmentScene, binding: unknown = null) { this.binding = copyBinding(binding); }
  draw(world: Readonly<WorldState>, view: OmegaRect): boolean {
    if (this.disposed || this.drawing || this.releasing) return false;
    this.drawing = true;
    try {
      const entry = this.epoch, runId = world.save.runId;
      const plan = planOmegaEnvironment(world, view); this.assertLive(entry);
      if (!plan || !this.binding || typeof runId !== 'string' || !runId.trim() || plan.commands.length > OMEGA_IMAGE_LIMIT) throw Error('Invalid Omega view');
      const ready = resources(this.scene.textures, this.binding); this.assertLive(entry);
      if (!ready) throw Error('Invalid Omega resources');
      const changed = ready.refs.length !== this.refs.length || ready.refs.some((value, i) => value !== this.refs[i]);
      if (changed || runId !== this.runId) this.releaseOwned();
      const epoch = this.epoch; this.assertLive(epoch);
      if (changed) {
        for (const texture of ready.textures) { texture.setFilter(1); this.assertLive(epoch); } // Phaser4.0.0 NEAREST
        this.refs = ready.refs;
      }
      this.runId = runId;
      for (const [index, command] of plan.commands.entries()) {
        let image = this.pool[index];
        if (!image) {
          const part = command.kind === 'tile' ? this.binding.terrain : this.binding.props;
          const name = String((part.frames as Readonly<Record<string, string | number>>)[command.role]);
          image = this.scene.add.image(command.x, command.y, part.key, name);
          if (!record(image) || this.pool.includes(image) || this.released.has(image)) throw Error('Aliased Omega Image');
          // Adopt a late returned handle even if the factory synchronously disposed this owner.
          this.pool.push(image); this.assertLive(epoch, image);
          const owned = image;
          image.once?.('destroy', () => { this.released.add(owned); this.releaseOwned(); });
          this.assertLive(epoch, image);
        }
        this.configure(image, command, epoch);
      }
      // Keep the high-water capacity; hide unused slots instead of camera-driven create/destroy churn.
      for (let index = plan.commands.length; index < this.pool.length; index++) {
        const image = this.pool[index]; this.assertLive(epoch, image);
        image.setVisible(false); this.assertLive(epoch, image);
      }
      this.assertLive(epoch); return true;
    } catch { this.releaseOwned(); return false; }
    finally { this.drawing = false; }
  }
  private configure(image: OmegaImage, command: OmegaCommand, epoch: number): void {
    if (!this.binding) throw Error('Unavailable Omega binding');
    const part = command.kind === 'tile' ? this.binding.terrain : this.binding.props;
    const frame = String((part.frames as Readonly<Record<string, string | number>>)[command.role]);
    this.assertLive(epoch, image);
    image.setTexture(part.key, frame); this.assertLive(epoch, image);
    image.setOrigin(0, 0); this.assertLive(epoch, image);
    image.setScale(1); this.assertLive(epoch, image);
    image.setRotation(0); this.assertLive(epoch, image);
    image.setFlip(false, false); this.assertLive(epoch, image);
    image.setTint(0xffffff); this.assertLive(epoch, image);
    image.setAlpha(1); this.assertLive(epoch, image);
    image.setPosition(command.x, command.y); this.assertLive(epoch, image);
    image.setDepth(command.depth); this.assertLive(epoch, image);
    image.setCrop(0, 0, command.width, command.height); this.assertLive(epoch, image);
    image.setVisible(true); this.assertLive(epoch, image);
  }
  private assertLive(epoch: number, image?: OmegaImage): void {
    const dead = image && (this.released.has(image) || image.active === false || 'scene' in image && !image.scene);
    if (this.disposed || epoch !== this.epoch || dead) throw Error('Disposed Omega Image generation');
  }
  private releaseOwned(): void {
    if (this.releasing) return;
    this.releasing = true;
    const images = this.pool; this.pool = []; this.runId = null; this.epoch++;
    try {
      for (const image of images) {
        if (this.released.has(image)) continue;
        this.released.add(image);
        try { image.setVisible(false); } catch { /* Still release every owned handle. */ }
        try { image.destroy(); } catch { /* A failing destructor cannot strand the rest. */ }
      }
    } finally { this.releasing = false; }
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.refs = []; this.releaseOwned();
  }
}
