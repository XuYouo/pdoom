import type { Platform } from '../entities/model';
import { FURNACE_TERRAIN_ROLES, FURNACE_PROP_ROLES, FURNACE_WIDTH, FURNACE_HEIGHT, FURNACE_BAND_WIDTH,
  planFurnaceEnvironment, readFurnaceGeometry, type FurnaceTerrainRole, type FurnacePropRole,
  type FurnacePlanInput, type FurnaceRect, type FurnaceSurface } from './FurnaceEnvironmentPlan';

export interface FurnaceTextureBinding<R extends string> { readonly key: string; readonly frames: Readonly<Record<R, string | number>> }
export interface FurnaceEnvironmentBinding { readonly terrain: FurnaceTextureBinding<FurnaceTerrainRole>; readonly props: FurnaceTextureBinding<FurnacePropRole> }
interface Part<R extends string> { readonly key: string; readonly frames: Readonly<Record<R, string>> }
interface Binding { readonly terrain: Part<FurnaceTerrainRole>; readonly props: Part<FurnacePropRole> }
export interface FurnaceTextureHandle { setFilter(mode: number): unknown }
export interface FurnaceTextureFrame {
  readonly x: number; readonly y: number; readonly cutX: number; readonly cutY: number;
  readonly cutWidth: number; readonly cutHeight: number; readonly width: number; readonly height: number;
  readonly realWidth: number; readonly realHeight: number; readonly trimmed: boolean; readonly rotated: boolean;
  readonly source: Readonly<{ width: number; height: number; image?: unknown; source?: unknown }>;
}
export interface FurnaceSourceTexture extends FurnaceTextureHandle { has(frame: string): boolean; get(frame: string): FurnaceTextureFrame | undefined }
export interface FurnaceTextures { exists(key: string): boolean; get(key: string): FurnaceSourceTexture }
export interface FurnaceStampConfig { originX: number; originY: number; scale: number; rotation: number; alpha: number; tint: number }
export interface FurnaceRepeatConfig extends FurnaceStampConfig { tilePositionX: number; tilePositionY: number; tileScaleX: number; tileScaleY: number; tileRotation: number }
export interface FurnaceRenderTexture {
  readonly texture: FurnaceTextureHandle;
  readonly camera: { setPosition(x: number, y: number): unknown; setScroll(x: number, y: number): unknown; setZoom(value: number): unknown; setRotation(value: number): unknown };
  setOrigin(x: number, y: number): unknown; setScale(value: number): unknown; setRotation(value: number): unknown;
  setPosition(x: number, y: number): unknown; setDepth(value: number): unknown; setAlpha(value: number): unknown;
  setVisible(value: boolean): unknown; setRenderMode(mode: 'render'): unknown;
  resize?(width: number, height: number, forceEven: boolean): unknown;
  clear(): unknown; render(): unknown; destroy(): void;
  repeat(key: string, frame: string, x: number, y: number, width: number, height: number, config: FurnaceRepeatConfig): unknown;
  stamp(key: string, frame: string, x: number, y: number, config: FurnaceStampConfig): unknown;
}
export interface FurnaceEnvironmentScene {
  readonly add: { renderTexture(x: number, y: number, width: number, height: number): FurnaceRenderTexture };
  readonly textures: FurnaceTextures;
  readonly game: { readonly renderer: {
    getMaxTextureSize?(): number;
    on(event: string, listener: () => void): unknown; off(event: string, listener: () => void): unknown;
  } };
}
export interface FurnaceEnvironmentWorld extends FurnacePlanInput { readonly save: Readonly<{ runId: string }> }
interface Resources { readonly refs: readonly unknown[]; readonly textures: readonly FurnaceSourceTexture[] }
interface Owned { readonly rt: FurnaceRenderTexture; readonly plan: FurnaceSurface; x: number; y: number; visible: boolean }
const NEAREST = 1;
const STAMP: FurnaceStampConfig = Object.freeze({ originX: 0, originY: 0, scale: 1, rotation: 0, alpha: 1, tint: 0xffffff });
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function copyPart<R extends string>(value: unknown, roles: readonly R[]): Part<R> | null {
  if (!record(value) || typeof value.key !== 'string' || !value.key.trim() || !record(value.frames)) return null;
  const entries: [R, string][] = [], seen = new Set<string>();
  for (const role of roles) {
    const raw = value.frames[role];
    if (!(typeof raw === 'string' ? !!raw.trim() : typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0)) return null;
    const name = String(raw); if (seen.has(name)) return null;
    seen.add(name); entries.push([role, name]);
  }
  return Object.freeze({ key: value.key, frames: Object.freeze(Object.fromEntries(entries) as Record<R, string>) });
}
function copyBinding(value: unknown): Binding | null {
  try {
    if (!record(value)) return null;
    const terrain = copyPart(value.terrain, FURNACE_TERRAIN_ROLES), props = copyPart(value.props, FURNACE_PROP_ROLES);
    return terrain && props && terrain.key !== props.key ? Object.freeze({ terrain, props }) : null;
  } catch { return null; }
}
function validFrame(f: FurnaceTextureFrame | undefined, size: number, slot: number): f is FurnaceTextureFrame {
  if (!f || !f.source || f.trimmed !== false || f.rotated !== false || f.x !== 0 || f.y !== 0) return false;
  const columns = 6;
  return f.cutX === slot % columns * size && f.cutY === Math.floor(slot / columns) * size
    && f.source.width === (size === 16 ? 96 : 384) && f.source.height === (size === 16 ? 96 : 64)
    && [f.width, f.height, f.realWidth, f.realHeight, f.cutWidth, f.cutHeight].every(v => v === size);
}
function resources(manager: FurnaceTextures, binding: Binding): Resources | null {
  const refs: unknown[] = [], textures: FurnaceSourceTexture[] = [], frames = new Set<FurnaceTextureFrame>();
  const groups = [[binding.terrain, FURNACE_TERRAIN_ROLES, 16], [binding.props, FURNACE_PROP_ROLES, 64]] as const;
  for (const [part, roles, size] of groups) {
    if (!manager.exists(part.key)) return null;
    const texture = manager.get(part.key); refs.push(texture); textures.push(texture);
    for (const [slot, role] of roles.entries()) {
      const name = (part.frames as Readonly<Record<string, string>>)[role];
      if (!texture.has(name)) return null;
      const frame = texture.get(name);
      if (!validFrame(frame, size, slot) || frames.has(frame)) return null;
      frames.add(frame);
      refs.push(frame, frame.source, frame.source.image, frame.source.source, frame.cutX, frame.cutY, frame.source.width, frame.source.height);
    }
  }
  return { refs, textures };
}
/** Loader guard only: no RT allocation, filter writes or GPU capability requirement. */
export function furnaceEnvironmentResourcesReady(textures: FurnaceTextures, value: unknown): boolean {
  try { const binding = copyBinding(value); return !!binding && resources(textures, binding) !== null; } catch { return false; }
}
const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((value, i) => value === b[i]);
function validView(v: FurnaceRect): boolean {
  return !!v && [v.x, v.y, v.width, v.height].every(Number.isFinite) && v.x >= 0 && v.y >= 0
    && v.width > 0 && v.height > 0 && v.width <= 640 && v.height <= 360
    && v.x + v.width <= FURNACE_WIDTH && v.y + v.height <= FURNACE_HEIGHT;
}
/** Owns only RTs. Core retains heat, candle/wick/guide, labels and all combat cues. */
export class FurnaceEnvironmentRenderer {
  private readonly binding: Binding | null;
  private readonly owned: Owned[] = [];
  private readonly moving = new Map<string, Owned>();
  private key: readonly unknown[] = [];
  private refs: readonly unknown[] = [];
  private runId: string | null = null;
  private disposed = false;
  private drawing = false;
  private restoring = false;
  private listening = false;
  private setupFailed = false;
  constructor(private readonly scene: FurnaceEnvironmentScene, binding: unknown = null, private readonly invalidateRestore?: () => void) {
    this.binding = copyBinding(binding);
    try { scene.game.renderer.on('restorewebgl', this.restore); this.listening = true; }
    catch {
      this.setupFailed = true;
      try { scene.game.renderer.off('restorewebgl', this.restore); } catch { /* No owned resources exist. */ }
    }
  }
  draw(world: FurnaceEnvironmentWorld, platforms: readonly Readonly<Platform>[], view: FurnaceRect): boolean {
    if (this.disposed || this.setupFailed || this.drawing) return false;
    this.drawing = true;
    try {
      const id = world.save.runId;
      if (!this.binding || typeof id !== 'string' || !id.trim() || !validView(view)) { this.clearOwned(); return false; }
      const geometry = readFurnaceGeometry(world, platforms);
      const limit = this.scene.game.renderer.getMaxTextureSize?.();
      if (!geometry || typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < FURNACE_BAND_WIDTH) { this.clearOwned(); return false; }
      if (this.runId !== id) { this.clearOwned(); this.runId = id; }
      const ready = resources(this.scene.textures, this.binding);
      if (!ready) { this.clearOwned(); return false; }
      if (!this.owned.length || !same(this.refs, ready.refs) || !same(this.key, geometry.key)) {
        this.clearOwned(); ready.textures.forEach(texture => texture.setFilter(NEAREST));
        const plan = planFurnaceEnvironment(geometry.world, [...geometry.platforms, ...geometry.lifts]);
        if (!plan) return false;
        for (const band of plan.backgrounds) this.make(band, -9, 0.6, limit);
        for (const item of plan.surfaces) this.make(item, 0.5, 1, limit);
        for (const lift of plan.lifts) this.moving.set(lift.id, this.make(lift, 0.5, 1, limit));
        this.key = geometry.key; this.refs = ready.refs;
      }
      // Identical static geometry never plans, serializes, filters or bakes again.
      for (const lift of geometry.lifts) {
        const item = this.moving.get(`lift:${lift.id}`); if (!item) throw Error('Missing actual lift skin');
        const x = Math.round(lift.x), y = Math.round(lift.y);
        if (x !== item.x || y !== item.y) { item.rt.setPosition(x, y); item.x = x; item.y = y; }
      }
      for (const item of this.owned) {
        const visible = item.x + item.plan.width > view.x - 16 && item.x < view.x + view.width + 16
          && item.y + item.plan.height > view.y - 16 && item.y < view.y + view.height + 16;
        if (visible !== item.visible) { item.rt.setVisible(visible); item.visible = visible; }
      }
      return true;
    } catch { this.clearOwned(); return false; }
    finally { this.drawing = false; }
  }
  private make(plan: FurnaceSurface, depth: number, alpha: number, limit: number): Owned {
    if (plan.width > limit || plan.height > limit) throw Error('RT exceeds device limit');
    const rt = this.scene.add.renderTexture(plan.x, plan.y, plan.width, plan.height);
    const item: Owned = { rt, plan, x: plan.x, y: plan.y, visible: false };
    this.owned.push(item); // Own before any setter, resize or command can throw.
    if (plan.width % 2 || plan.height % 2) {
      if (!rt.resize) throw Error('Exact odd-sized RT unsupported');
      rt.resize(plan.width, plan.height, false);
    }
    rt.setVisible(false); rt.setOrigin(0, 0); rt.setScale(1); rt.setRotation(0);
    rt.setDepth(depth); rt.setAlpha(alpha); rt.setRenderMode('render');
    this.bake(item); return item;
  }
  private bake(item: Owned): void {
    const binding = this.binding; if (!binding) throw Error('Unavailable binding');
    const rt = item.rt;
    // Installed4.0 filtering may reallocate storage. Always filter BEFORE commands.
    rt.texture.setFilter(NEAREST); rt.camera.setPosition(0, 0); rt.camera.setScroll(0, 0);
    rt.camera.setZoom(1); rt.camera.setRotation(0); rt.clear();
    for (const c of item.plan.commands) {
      if (c.kind === 'prop') rt.stamp(binding.props.key, binding.props.frames[c.role], c.x, c.y, STAMP);
      else rt.repeat(binding.terrain.key, binding.terrain.frames[c.role], c.x, c.y, c.width, c.height,
        { ...STAMP, tilePositionX: c.tileX, tilePositionY: c.tileY, tileScaleX: 1, tileScaleY: 1, tileRotation: 0 });
    }
    rt.render(); // Required command-buffer flush in Phaser4.0.
  }
  private readonly restore = (): void => {
    if (this.disposed || this.restoring || this.drawing || !this.owned.length || !this.binding) return;
    this.restoring = true;
    try {
      const limit = this.scene.game.renderer.getMaxTextureSize?.();
      if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < FURNACE_BAND_WIDTH) throw Error('RT unavailable after restore');
      const ready = resources(this.scene.textures, this.binding);
      if (!ready || !same(this.refs, ready.refs)) throw Error('Source changed during restore');
      ready.textures.forEach(texture => texture.setFilter(NEAREST));
      for (const item of this.owned) this.bake(item);
    } catch {
      this.clearOwned();
      // A paused parent may redraw its immutable last world with delta0.
      // draw itself never calls this callback, and nested restore is ignored.
      try { this.invalidateRestore?.(); } catch { this.clearOwned(); }
    } finally { this.restoring = false; }
  };
  private clearOwned(): void {
    const owned = this.owned.splice(0).reverse(); this.moving.clear(); this.key = []; this.refs = [];
    for (const { rt } of owned) { try { rt.destroy(); } catch { /* Release every owned RT, never shared sources. */ } }
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    try { if (this.listening) this.scene.game.renderer.off('restorewebgl', this.restore); }
    catch { /* Teardown faults cannot prevent owned cleanup. */ }
    finally { this.listening = false; this.clearOwned(); }
  }
}
