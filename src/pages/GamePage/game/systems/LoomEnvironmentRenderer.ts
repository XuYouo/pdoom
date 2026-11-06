import type { WorldState } from '../entities/model';
import { LOOM_TERRAIN_ROLES, LOOM_PROP_ROLES, LOOM_IMAGE_LIMIT, planLoomEnvironment,
  type LoomTerrainRole, type LoomPropRole, type LoomCommand, type LoomRect } from './LoomEnvironmentPlan';

export interface LoomTextureBinding<R extends string> { readonly key: string; readonly frames: Readonly<Record<R, string | number>> }
export interface LoomEnvironmentBinding { readonly terrain: LoomTextureBinding<LoomTerrainRole>; readonly props: LoomTextureBinding<LoomPropRole> }
export interface LoomTextureFrame {
  readonly x: number; readonly y: number; readonly cutX: number; readonly cutY: number;
  readonly width: number; readonly height: number; readonly cutWidth: number; readonly cutHeight: number;
  readonly realWidth: number; readonly realHeight: number; readonly trimmed: boolean; readonly rotated: boolean;
  readonly source: Readonly<{ width: number; height: number; image?: unknown; source?: unknown }>;
}
export interface LoomSourceTexture { setFilter(mode: number): unknown; has(frame: string): boolean; get(frame: string): LoomTextureFrame | undefined }
export interface LoomTextures { exists(key: string): boolean; get(key: string): LoomSourceTexture }
export interface LoomImage {
  setTexture(key: string, frame: string): unknown;
  setOrigin(x: number, y: number): unknown; setScale(value: number): unknown; setRotation(value: number): unknown;
  setPosition(x: number, y: number): unknown; setDepth(value: number): unknown; setAlpha(value: number): unknown;
  setVisible(value: boolean): unknown; setCrop(x: number, y: number, width: number, height: number): unknown;
  setTint(value: number): unknown; setFlip(x: boolean, y: boolean): unknown; destroy(): unknown;
}
export interface LoomEnvironmentScene {
  readonly textures: LoomTextures;
  readonly add: { image(x: number, y: number, texture: string, frame: string): LoomImage };
}
interface Resources { readonly refs: readonly unknown[]; readonly textures: readonly LoomSourceTexture[] }
interface Owned { readonly image: LoomImage; command: LoomCommand; visible: boolean }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function copyPart<R extends string>(value: unknown, roles: readonly R[]): LoomTextureBinding<R> | null {
  if (!object(value) || typeof value.key !== 'string' || !value.key.trim() || !object(value.frames)) return null;
  const entries: [R, string][] = [], seen = new Set<string>();
  for (const role of roles) {
    const raw = value.frames[role];
    if (!(typeof raw === 'string' ? !!raw.trim() : typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0)) return null;
    const name = String(raw); if (seen.has(name)) return null;
    seen.add(name); entries.push([role, name]);
  }
  return Object.freeze({ key: value.key, frames: Object.freeze(Object.fromEntries(entries) as Record<R, string>) });
}
function copyBinding(value: unknown): LoomEnvironmentBinding | null {
  try {
    if (!object(value)) return null;
    const terrain = copyPart(value.terrain, LOOM_TERRAIN_ROLES), props = copyPart(value.props, LOOM_PROP_ROLES);
    return terrain && props && terrain.key !== props.key ? Object.freeze({ terrain, props }) : null;
  } catch { return null; }
}
function validFrame(frame: LoomTextureFrame | undefined, size: number, slot: number): frame is LoomTextureFrame {
  return !!frame && !!frame.source && frame.trimmed === false && frame.rotated === false && frame.x === 0 && frame.y === 0
    && frame.cutX === slot % 6 * size && frame.cutY === Math.floor(slot / 6) * size
    && frame.source.width === (size === 16 ? 96 : 384) && frame.source.height === (size === 16 ? 96 : 64)
    && [frame.width, frame.height, frame.realWidth, frame.realHeight, frame.cutWidth, frame.cutHeight].every(v => v === size);
}
function resources(manager: LoomTextures, binding: LoomEnvironmentBinding): Resources | null {
  const refs: unknown[] = [], textures: LoomSourceTexture[] = [], frames = new Set<LoomTextureFrame>();
  const sources = new Set<unknown>();
  for (const [part, roles, size] of [[binding.terrain, LOOM_TERRAIN_ROLES, 16], [binding.props, LOOM_PROP_ROLES, 64]] as const) {
    if (!manager.exists(part.key)) return null;
    const texture = manager.get(part.key); if (textures.includes(texture)) return null;
    textures.push(texture); refs.push(texture);
    let groupSource: LoomTextureFrame['source'] | null = null;
    for (const [slot, role] of roles.entries()) {
      const name = (part.frames as Readonly<Record<string, string | number>>)[role];
      if (!texture.has(String(name))) return null;
      const frame = texture.get(String(name));
      if (!validFrame(frame, size, slot) || frames.has(frame)) return null;
      if (groupSource && groupSource !== frame.source) return null;
      groupSource = frame.source; frames.add(frame);
      refs.push(frame, frame.source, frame.source.image, frame.source.source);
    }
    if (!groupSource || sources.has(groupSource)) return null;
    sources.add(groupSource);
  }
  return { refs, textures };
}
/** Complete native resource guard; no image, filter write, timer or Core allocation. */
export function loomEnvironmentResourcesReady(textures: LoomTextures, binding: unknown): boolean {
  try { const copied = copyBinding(binding); return !!copied && resources(textures, copied) !== null; } catch { return false; }
}
const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const validView = (v: LoomRect) => !!v && [v.x, v.y, v.width, v.height].every(Number.isFinite)
  && v.x >= 0 && v.y >= 0 && v.width > 0 && v.width <= 640 && v.height > 0 && v.height <= 360
  && v.x + v.width <= 2580 && v.y + v.height <= 640;
const visible = (c: LoomCommand, v: LoomRect) => c.x + c.width > v.x && c.x < v.x + v.width && c.y + c.height > v.y && c.y < v.y + v.height;

/** Native source Images only: no owned render target to re-bake and no independent simulation clock. */
export class LoomEnvironmentRenderer {
  private readonly binding: LoomEnvironmentBinding | null;
  private readonly owned = new Map<string, Owned>();
  private refs: readonly unknown[] = [];
  private runId: string | null = null;
  private disposed = false;
  private drawing = false;
  constructor(private readonly scene: LoomEnvironmentScene, binding: unknown = null) { this.binding = copyBinding(binding); }
  draw(world: Readonly<WorldState>, view: LoomRect): boolean {
    if (this.disposed || this.drawing) return false;
    this.drawing = true;
    try {
      if (!this.binding || !validView(view) || typeof world.save.runId !== 'string' || !world.save.runId.trim()) {
        this.clearOwned(); return false;
      }
      const plan = planLoomEnvironment(world);
      if (!plan) { this.clearOwned(); return false; }
      const ready = resources(this.scene.textures, this.binding);
      this.assertLive();
      if (!ready || plan.commands.length > LOOM_IMAGE_LIMIT) { this.clearOwned(); return false; }
      const resourcesChanged = !same(this.refs, ready.refs);
      if (this.runId !== world.save.runId || resourcesChanged) {
        this.clearOwned();
        if (resourcesChanged) for (const texture of ready.textures) {
          this.assertLive(); texture.setFilter(1); this.assertLive();
        }
        this.refs = ready.refs; this.runId = world.save.runId;
      }
      const needed = new Set(plan.commands.map(command => command.id));
      for (const [id, owned] of this.owned) if (!needed.has(id)) {
        // Detach before an engine destroy event can synchronously dispose or throw.
        this.owned.delete(id); owned.image.destroy(); this.assertLive();
      }
      for (const command of plan.commands) {
        this.assertLive();
        let owned = this.owned.get(command.id);
        const show = visible(command, view);
        if (!owned && !show) continue;
        if (!owned) {
          const part = command.kind === 'tile' ? this.binding.terrain : this.binding.props;
          const frame = (part.frames as Readonly<Record<string, string | number>>)[command.role];
          const image = this.scene.add.image(command.x, command.y, part.key, String(frame));
          // Own first, so an exception in a setter cannot leak an Image.
          owned = { image, command, visible: show }; this.owned.set(command.id, owned);
        }
        // Reassert native crop/style even on unchanged worlds; no shared style state leaks into support Images.
        this.configure(owned.image, command); owned.command = command;
        owned.image.setVisible(show); this.assertLive(); owned.visible = show;
      }
      this.assertLive(); return true;
    } catch { this.clearOwned(); return false; }
    finally { this.drawing = false; }
  }
  private configure(image: LoomImage, command: LoomCommand): void {
    if (!this.binding) throw Error('Unavailable Loom binding');
    const part = command.kind === 'tile' ? this.binding.terrain : this.binding.props;
    const frame = (part.frames as Readonly<Record<string, string | number>>)[command.role];
    this.assertLive(); image.setTexture(part.key, String(frame));
    this.assertLive(); image.setOrigin(0, 0);
    this.assertLive(); image.setScale(1);
    this.assertLive(); image.setRotation(0);
    this.assertLive(); image.setPosition(command.x, command.y);
    this.assertLive(); image.setDepth(command.depth);
    this.assertLive(); image.setAlpha(1);
    this.assertLive(); image.setTint(0xffffff);
    this.assertLive(); image.setFlip(false, false);
    this.assertLive(); image.setCrop(0, 0, command.width, command.height);
    this.assertLive();
  }
  private assertLive(): void { if (this.disposed) throw Error('Disposed Loom environment'); }
  private clearOwned(): void {
    const images = [...this.owned.values()]; this.owned.clear(); this.runId = null;
    for (const { image } of images) { try { image.destroy(); } catch { /* Release every owned Image, never shared sources. */ } }
  }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.clearOwned(); this.refs = []; }
}
