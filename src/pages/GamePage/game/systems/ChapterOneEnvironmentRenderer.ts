import {
  ENVIRONMENT_BINDING, ENVIRONMENT_MUSHROOM_PIVOT, ENVIRONMENT_PROP_ROLES, ENVIRONMENT_PROP_SIZE, ENVIRONMENT_TILE_ROLES, ENVIRONMENT_TILE_SIZE,
  type EnvironmentBinding, type EnvironmentFrameId, type EnvironmentTextureBinding,
} from '../data/environmentAssets';
import type { Pickup, Platform } from '../entities/model';
import { ENVIRONMENT_CHUNK_WIDTH, planChapterOneEnvironment, type ChapterOneEnvironmentPlan, type EnvironmentPlanInput } from './ChapterOneEnvironmentPlan';

export interface EnvironmentTextureFrame {
  readonly cutX: number; readonly cutY: number; readonly cutWidth: number; readonly cutHeight: number;
  readonly width: number; readonly height: number; readonly realWidth: number; readonly realHeight: number;
  readonly trimmed: boolean; readonly rotated: boolean; readonly source: Readonly<{ width: number; height: number }>;
}
export interface EnvironmentImage {
  setPosition(x: number, y: number): unknown;
  setDisplayOrigin(x: number, y: number): unknown;
  setScale(scale: number): unknown;
  setDepth(depth: number): unknown;
  setFlipX(value: boolean): unknown;
  setAlpha(alpha: number): unknown;
  destroy(): void;
}
export interface EnvironmentRenderTexture {
  setOrigin(x: number, y: number): unknown;
  setScale(scale: number): unknown;
  setDepth(depth: number): unknown;
  setRenderMode(mode: 'render'): unknown;
  readonly texture: { setFilter(mode: number): unknown };
  readonly camera: {
    setPosition(x: number, y: number): unknown; setScroll(x: number, y: number): unknown;
    setZoom(zoom: number): unknown; setRotation(rotation: number): unknown;
  };
  clear(): unknown;
  repeat(key: string, frame: EnvironmentFrameId, x: number, y: number, width: number, height: number, config?: { alpha: number }): unknown;
  stamp(key: string, frame: EnvironmentFrameId, x: number, y: number, config: { originX: number; originY: number; scale: number; alpha: number }): unknown;
  render(): unknown;
  destroy(): void;
}
export interface ChapterOneEnvironmentScene {
  readonly add: {
    renderTexture(x: number, y: number, width: number, height: number): EnvironmentRenderTexture;
    image(x: number, y: number, key: string, frame: EnvironmentFrameId): EnvironmentImage;
  };
  readonly textures: {
    exists(key: string): boolean;
    get(key: string): { has(frame: EnvironmentFrameId): boolean; get(frame: EnvironmentFrameId): EnvironmentTextureFrame };
  };
  readonly game: { readonly renderer: {
    getMaxTextureSize?(): number;
    on(event: string, listener: () => void): unknown;
    off(event: string, listener: () => void): unknown;
  } };
}
export interface ChapterOneEnvironmentWorld extends EnvironmentPlanInput {
  readonly save: Readonly<{ runId: string; elapsedMs: number }>;
  readonly pickups: readonly Readonly<Pick<Pickup, 'id' | 'kind' | 'x' | 'y'>>[];
}

function validFrameId(value: unknown): value is EnvironmentFrameId {
  return typeof value === 'string' ? value.trim().length > 0 : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function copyTextureBinding<Role extends string>(source: EnvironmentTextureBinding<Role> | undefined, roles: readonly Role[]): EnvironmentTextureBinding<Role> | null {
  if (!source || typeof source.key !== 'string' || !source.key.trim() || !source.frames) return null;
  const entries = roles.map(role => [role, source.frames[role]] as const);
  if (!entries.every(([, frame]) => validFrameId(frame))) return null;
  // Phaser 4.0 get(0) means firstFrame; string keys preserve an actual named zero frame. Aliases are legal.
  return Object.freeze({ key: source.key, frames: Object.freeze(Object.fromEntries(entries.map(([role, frame]) => [role, String(frame)])) as Record<Role, EnvironmentFrameId>) });
}
function copyBinding(source: EnvironmentBinding | null): EnvironmentBinding | null {
  if (!source) return null;
  const terrain = copyTextureBinding(source.terrain, ENVIRONMENT_TILE_ROLES), props = copyTextureBinding(source.props, ENVIRONMENT_PROP_ROLES);
  return terrain && props ? Object.freeze({ terrain, props }) : null;
}
function validFrame(frame: EnvironmentTextureFrame | undefined, size: number): boolean {
  if (!frame || !frame.source || frame.trimmed !== false || frame.rotated !== false) return false;
  const { cutX, cutY, cutWidth, cutHeight, width, height, realWidth, realHeight, source } = frame;
  return [cutX, cutY, source.width, source.height].every(Number.isSafeInteger) && cutX >= 0 && cutY >= 0
    && [cutWidth, cutHeight, width, height, realWidth, realHeight].every(value => value === size)
    && source.width > 0 && source.height > 0 && cutX + size <= source.width && cutY + size <= source.height;
}

/** Owns only view objects. Never owns physics, Loader requests, world mutation or a new clock. */
export class ChapterOneEnvironmentRenderer {
  private readonly binding: EnvironmentBinding | null;
  private readonly surfaces: EnvironmentRenderTexture[] = [];
  private readonly mushrooms = new Map<string, EnvironmentImage>();
  private plan: ChapterOneEnvironmentPlan | null = null;
  private signature: string | null = null;
  private runId: string | null = null;
  private stage: number | null = null;
  private disposed = false;
  private resourceRefs: readonly object[] = [];

  constructor(private readonly scene: ChapterOneEnvironmentScene, binding: EnvironmentBinding | null = ENVIRONMENT_BINDING, private readonly invalidateRestore?: () => void) {
    this.binding = copyBinding(binding);
    scene.game.renderer.on('restorewebgl', this.restore);
  }

  /** True replaces only stage-one platform bases and actual mushrooms; all real warning/state Graphics remain above it. */
  draw(world: ChapterOneEnvironmentWorld, platforms: readonly Readonly<Platform>[] = world.chapter.platforms): boolean {
    if (this.disposed) return false;
    if (this.runId !== world.save.runId || this.stage !== world.chapter.stage) {
      this.clearOwned(); this.runId = world.save.runId; this.stage = world.chapter.stage;
    }
    if (world.chapter.stage !== 1 || !Number.isFinite(world.save.elapsedMs) || world.save.elapsedMs < 0) {
      this.clearOwned(); return false;
    }
    const resources = this.readResources();
    if (!resources) { this.clearOwned(); return false; }
    if (!this.sameResources(resources)) { this.clearOwned(); this.resourceRefs = resources; }
    const plan = planChapterOneEnvironment(world, platforms), pickups = world.pickups.filter(pickup => pickup.kind === 'mushroom');
    if (!plan || pickups.some(pickup => !pickup.id || !Number.isFinite(pickup.x) || !Number.isFinite(pickup.y)) || new Set(pickups.map(pickup => pickup.id)).size !== pickups.length) {
      this.clearOwned(); return false;
    }
    const signature = JSON.stringify(plan);
    try {
      if (signature !== this.signature) {
        if (!this.surfaces.length) for (const chunk of plan.chunks) {
          const texture = this.scene.add.renderTexture(chunk.x, chunk.y, chunk.width, chunk.height);
          this.surfaces.push(texture);
          texture.setOrigin(0, 0); texture.setScale(1); texture.setDepth(-5); texture.setRenderMode('render');
        }
        this.replay(plan); this.plan = plan; this.signature = signature;
      }
      const live = new Set<string>();
      for (const pickup of pickups) {
        const y = pickup.y + Math.sin(world.save.elapsedMs / 280 + pickup.x) * 2;
        let image = this.mushrooms.get(pickup.id);
        if (!image) {
          const binding = this.binding;
          if (!binding) { this.clearOwned(); return false; }
          image = this.scene.add.image(pickup.x, y, binding.props.key, binding.props.frames.mushroom);
          this.mushrooms.set(pickup.id, image);
          image.setDisplayOrigin(ENVIRONMENT_MUSHROOM_PIVOT.x, ENVIRONMENT_MUSHROOM_PIVOT.y);
          image.setScale(1); image.setDepth(-1); image.setFlipX(false); image.setAlpha(1);
        }
        image.setPosition(pickup.x, y); live.add(pickup.id);
      }
      for (const [id, image] of this.mushrooms) if (!live.has(id)) { image.destroy(); this.mushrooms.delete(id); }
      return true;
    } catch {
      // Allocation/resource loss must not leave a partial overlay that hides the existing Graphics fallback.
      this.clearOwned(); return false;
    }
  }

  private sameResources(resources: readonly object[]): boolean {
    return resources.length === this.resourceRefs.length && resources.every((value, index) => value === this.resourceRefs[index]);
  }
  private readResources(): readonly object[] | null {
    const binding = this.binding, renderer = this.scene.game.renderer;
    if (!binding || typeof renderer.getMaxTextureSize !== 'function') return null;
    try {
      const limit = renderer.getMaxTextureSize();
      if (!Number.isFinite(limit) || limit < ENVIRONMENT_CHUNK_WIDTH) return null;
      const resources: object[] = [];
      const valid = <Role extends string>(asset: EnvironmentTextureBinding<Role>, roles: readonly Role[], size: number) => {
        if (!this.scene.textures.exists(asset.key)) return false;
        const texture = this.scene.textures.get(asset.key); resources.push(texture);
        return roles.every(role => {
          if (!texture.has(asset.frames[role])) return false;
          const frame = texture.get(asset.frames[role]);
          if (!validFrame(frame, size)) return false;
          resources.push(frame, frame.source); return true;
        });
      };
      return valid(binding.terrain, ENVIRONMENT_TILE_ROLES, ENVIRONMENT_TILE_SIZE) && valid(binding.props, ENVIRONMENT_PROP_ROLES, ENVIRONMENT_PROP_SIZE) ? resources : null;
    } catch { return null; }
  }

  private replay(plan: ChapterOneEnvironmentPlan): void {
    const binding = this.binding;
    if (!binding) return;
    plan.chunks.forEach((chunk, index) => {
      const target = this.surfaces[index];
      // Installed 4.0 setFilter can reallocate storage: always BEFORE, never after, baking.
      target.texture.setFilter(1); // Installed Phaser 4.0 textures/const.js: NEAREST=1 (LINEAR=0).
      target.camera.setPosition(0, 0); target.camera.setScroll(0, 0); target.camera.setZoom(1); target.camera.setRotation(0);
      target.clear();
      for (const command of chunk.commands) {
        if (command.kind === 'repeat') target.repeat(binding.terrain.key, binding.terrain.frames[command.role], command.x, command.y, command.width, command.height);
        else if (command.kind === 'decor-repeat') target.repeat(binding.terrain.key, binding.terrain.frames[command.role], command.x, command.y, command.width, command.height, { alpha: command.alpha });
        else target.stamp(binding.props.key, binding.props.frames[command.role], command.x, command.y, { originX: 0, originY: 0, scale: 1, alpha: command.alpha });
      }
      target.render(); // 4.0 queues primitive stamp/repeat values. No draw(Image) references or drawFrame API.
    });
  }

  private restore = (): void => {
    if (this.disposed || !this.plan) return;
    const resources = this.readResources();
    if (!resources || !this.sameResources(resources)) { this.abandonRestoration(); return; }
    try { this.replay(this.plan); } catch { this.abandonRestoration(); }
  };
  private abandonRestoration(): void {
    this.clearOwned();
    // Parent may repaint the last immutable world as Graphics fallback, even while paused. No new tick.
    this.invalidateRestore?.();
  }
  private clearOwned(): void {
    for (const texture of this.surfaces) texture.destroy(); this.surfaces.length = 0;
    for (const image of this.mushrooms.values()) image.destroy(); this.mushrooms.clear();
    this.plan = null; this.signature = null; this.resourceRefs = [];
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.scene.game.renderer.off('restorewebgl', this.restore); this.clearOwned();
  }
}
