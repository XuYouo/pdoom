import type * as Phaser from 'phaser';
import type { Platform } from '../entities/model';
import { FACTORY_TERRAIN_ROLES, FACTORY_PROP_ROLES, planFactoryEnvironment, planFactorySea, planFactorySeaPatterns, type FactoryTerrainRole, type FactoryPropRole, type FactoryPlanInput, type FactoryRect, type FactoryCommand, type FactoryEnvironmentPlan, type FactorySeaPlan, type FactorySeaRegion } from './FactoryEnvironmentPlan';

export interface FactoryTextureBinding<Role extends string> { readonly key: string; readonly frames: Readonly<Record<Role, string>> }
export interface FactoryEnvironmentBinding { readonly terrain: FactoryTextureBinding<FactoryTerrainRole>; readonly props: FactoryTextureBinding<FactoryPropRole> }
export interface FactoryTextureHandle { setFilter(mode: number): unknown }
export interface FactoryTextureFrame {
  readonly x: number; readonly y: number; readonly cutX: number; readonly cutY: number; readonly cutWidth: number; readonly cutHeight: number;
  readonly width: number; readonly height: number; readonly realWidth: number; readonly realHeight: number; readonly trimmed: boolean; readonly rotated: boolean;
  readonly source: Readonly<{ width: number; height: number; image?: unknown; source?: unknown }>;
}
export interface FactorySourceTexture extends FactoryTextureHandle { has(frame: string): boolean; get(frame: string): FactoryTextureFrame }
export interface FactoryRepeatConfig { alpha: number; originX: number; originY: number; scale: number; tilePositionX: number; tilePositionY: number }
interface Owned { destroy(): void }
export interface FactoryRenderTexture<T extends FactoryTextureHandle = Phaser.Textures.Texture> extends Owned {
  readonly texture: T;
  readonly camera: { setPosition(x: number, y: number): unknown; setScroll(x: number, y: number): unknown; setZoom(value: number): unknown; setRotation(value: number): unknown };
  setOrigin(x: number, y: number): unknown; setScale(value: number): unknown; setDepth(value: number): unknown; setVisible(value: boolean): unknown; setRenderMode(mode: 'render'): unknown;
  clear(): unknown; render(): unknown;
  repeat(key: string, frame: string, x: number, y: number, width: number, height: number, config: FactoryRepeatConfig): unknown;
  stamp(key: string, frame: string, x: number, y: number, config: { originX: number; originY: number; scale: number; alpha: number }): unknown;
}
export interface FactoryTileSprite extends Owned {
  setOrigin(x: number, y: number): unknown; setScale(value: number): unknown; setDepth(value: number): unknown; setVisible(value: boolean): unknown; setAlpha(value: number): unknown;
  setPosition(x: number, y: number): unknown; setSize(width: number, height: number): unknown; setRotation(value: number): unknown;
  setTileScale(x: number, y: number): unknown; setTilePosition(x: number, y: number): unknown; setTileRotation(value: number): unknown;
}
export interface FactoryEnvironmentScene<T extends FactoryTextureHandle = Phaser.Textures.Texture> {
  readonly add: { renderTexture(x: number, y: number, width: number, height: number): FactoryRenderTexture<T>; tileSprite(x: number, y: number, width: number, height: number, texture: T): FactoryTileSprite };
  readonly textures: { exists(key: string): boolean; get(key: string): FactorySourceTexture };
  readonly game: { readonly renderer: { getMaxTextureSize?(): number; on(event: string, listener: () => void): unknown; off(event: string, listener: () => void): unknown } };
}
export interface FactoryEnvironmentWorld extends FactoryPlanInput { readonly save: Readonly<{ runId: string }>; readonly factory: Readonly<{ seaY: number }> | null }
interface Resources { readonly refs: readonly unknown[]; readonly textures: readonly FactorySourceTexture[] }
const SEA_PATTERNS = planFactorySeaPatterns();
function copyPart<Role extends string>(value: unknown, roles: readonly Role[]): FactoryTextureBinding<Role> | null {
  if (!value || typeof value !== 'object') return null;
  const part = value as { key?: unknown; frames?: Readonly<Record<string, unknown>> };
  if (typeof part.key !== 'string' || !part.key.trim() || !part.frames || typeof part.frames !== 'object') return null;
  const entries: [Role, string][] = []; const seen = new Set<string>();
  for (const role of roles) { const frame = part.frames[role]; if (typeof frame !== 'string' || !frame.trim() || seen.has(frame)) return null; seen.add(frame); entries.push([role, frame]); }
  // Named string zero is exact in Phaser4; numeric get(0) would select firstFrame. Every role in a group must name a distinct native frame.
  return Object.freeze({ key: part.key, frames: Object.freeze(Object.fromEntries(entries) as Record<Role, string>) });
}
function copyBinding(value: unknown): FactoryEnvironmentBinding | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const raw = value as { terrain?: unknown; props?: unknown }, terrain = copyPart(raw.terrain, FACTORY_TERRAIN_ROLES), props = copyPart(raw.props, FACTORY_PROP_ROLES);
    return terrain && props ? Object.freeze({ terrain, props }) : null;
  } catch { return null; }
}
function validFrame(frame: FactoryTextureFrame | undefined, size: number): boolean {
  if (!frame || !frame.source || frame.trimmed !== false || frame.rotated !== false || frame.x !== 0 || frame.y !== 0) return false;
  const s = frame.source;
  return [frame.width, frame.height, frame.realWidth, frame.realHeight, frame.cutWidth, frame.cutHeight].every(value => value === size)
    && [frame.cutX, frame.cutY, s.width, s.height].every(Number.isSafeInteger)
    && frame.cutX >= 0 && frame.cutY >= 0 && s.width > 0 && s.height > 0 && frame.cutX + size <= s.width && frame.cutY + size <= s.height;
}

/** View-only candidate. The caller retains protected strips, the true 3px sea edge and ALL combat Graphics. */
export class FactoryEnvironmentRenderer<T extends FactoryTextureHandle = Phaser.Textures.Texture> {
  private readonly binding: FactoryEnvironmentBinding | null;
  private readonly owned: Owned[] = [];
  private readonly bands: FactoryRenderTexture<T>[] = [];
  private readonly patterns: FactoryRenderTexture<T>[] = [];
  private fill: FactoryTileSprite | null = null;
  private surface: FactoryTileSprite | null = null;
  private plan: FactoryEnvironmentPlan | null = null;
  private sea: FactorySeaPlan | null = null;
  private signature: string | null = null;
  private runId: string | null = null;
  private resourceRefs: readonly unknown[] = [];
  private disposed = false;
  constructor(private readonly scene: FactoryEnvironmentScene<T>, binding: unknown = null, private readonly invalidateRestore?: () => void) {
    this.binding = copyBinding(binding);
    scene.game.renderer.on('restorewebgl', this.restore);
  }
  /** One independent factory success flag; never the chapter-one mushroom flag. No simulation tick. */
  draw(world: FactoryEnvironmentWorld, platforms: readonly Readonly<Platform>[], view: FactoryRect): boolean {
    if (this.disposed) return false;
    try {
      if (!this.binding || world.chapter.stage !== 2 || !world.factory || typeof world.save.runId !== 'string' || !world.save.runId.trim()) { this.clearOwned(); return false; }
      if (this.runId !== world.save.runId) { this.clearOwned(); this.runId = world.save.runId; }
      const sea = planFactorySea(world.factory.seaY, view), plan = planFactoryEnvironment(world, platforms);
      if (!sea || !plan) { this.clearOwned(); return false; }
      const resources = this.readResources();
      if (!resources) { this.clearOwned(); return false; }
      if (!this.sameResources(resources)) { this.clearOwned(); this.resourceRefs = resources.refs; }
      const signature = JSON.stringify(plan), fresh = this.bands.length === 0;
      if (fresh) {
        resources.textures.forEach(texture => texture.setFilter(1));
        for (const band of plan.bands) this.bands.push(this.makeRT(band, -5, true));
        this.patterns.push(this.makeRT({ x: 0, y: 0, width: 128, height: 64 }, -5, false));
        this.patterns.push(this.makeRT({ x: 0, y: 0, width: 128, height: 16 }, -5, false));
        this.replayPatterns();
        this.fill = this.makeSea(this.patterns[0].texture); this.surface = this.makeSea(this.patterns[1].texture);
      }
      if (fresh || signature !== this.signature) this.replayBands(plan);
      this.updateSea(sea); this.plan = plan; this.sea = sea; this.signature = signature;
      return true;
    } catch { this.clearOwned(); return false; }
  }
  private makeRT(rect: FactoryRect, depth: number, visible: boolean): FactoryRenderTexture<T> {
    const rt = this.scene.add.renderTexture(rect.x, rect.y, rect.width, rect.height); this.owned.push(rt);
    rt.setOrigin(0, 0); rt.setScale(1); rt.setDepth(depth); rt.setVisible(visible); rt.setRenderMode('render'); return rt;
  }
  private makeSea(texture: T): FactoryTileSprite {
    // Pass the owned Texture object, not a guessed/generated public texture key.
    const sprite = this.scene.add.tileSprite(0, 0, 1, 1, texture); this.owned.push(sprite);
    sprite.setOrigin(0, 0); sprite.setScale(1); sprite.setDepth(0.5); sprite.setAlpha(1); sprite.setRotation(0);
    sprite.setTileScale(1, 1); sprite.setTileRotation(0); return sprite;
  }
  private bake(rt: FactoryRenderTexture<T>, commands: readonly FactoryCommand[]): void {
    if (!this.binding) throw new Error('Unavailable factory binding');
    // Phaser4 filtering may reallocate storage: do it BEFORE clear/commands/render, never after.
    rt.texture.setFilter(1); rt.camera.setPosition(0, 0); rt.camera.setScroll(0, 0); rt.camera.setZoom(1); rt.camera.setRotation(0); rt.clear();
    for (const c of commands) {
      if (c.kind === 'prop') rt.stamp(this.binding.props.key, this.binding.props.frames[c.role], c.x, c.y, { originX: 0, originY: 0, scale: 1, alpha: c.alpha });
      else rt.repeat(this.binding.terrain.key, this.binding.terrain.frames[c.role], c.x, c.y, c.width, c.height, { alpha: c.alpha, originX: 0, originY: 0, scale: 1, tilePositionX: c.tileX, tilePositionY: c.tileY });
    }
    rt.render();
  }
  private replayBands(plan: FactoryEnvironmentPlan): void { plan.bands.forEach((band, index) => this.bake(this.bands[index], band.commands)); }
  private replayPatterns(): void { this.bake(this.patterns[0], SEA_PATTERNS.fill.commands); this.bake(this.patterns[1], SEA_PATTERNS.surface.commands); }
  private updateSea(sea: FactorySeaPlan): void {
    const apply = (sprite: FactoryTileSprite | null, region: FactorySeaRegion) => {
      if (!sprite) throw new Error('Incomplete factory sea allocation');
      sprite.setOrigin(0, 0); sprite.setScale(1); sprite.setDepth(0.5); sprite.setAlpha(1); sprite.setRotation(0); sprite.setTileScale(1, 1); sprite.setTileRotation(0);
      sprite.setPosition(region.x, region.y); sprite.setSize(region.width, region.height); sprite.setTilePosition(region.tileX, region.tileY); sprite.setVisible(region.visible);
    };
    apply(this.fill, sea.fill); apply(this.surface, sea.surface);
  }
  private readResources(): Resources | null {
    if (!this.binding) return null;
    const limit = this.scene.game.renderer.getMaxTextureSize?.();
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 640) return null;
    const refs: unknown[] = [], textures: FactorySourceTexture[] = [];
    const groups = [[this.binding.terrain, FACTORY_TERRAIN_ROLES, 16], [this.binding.props, FACTORY_PROP_ROLES, 64]] as const;
    for (const [part, roles, size] of groups) {
      if (!this.scene.textures.exists(part.key)) return null;
      const texture = this.scene.textures.get(part.key); refs.push(texture); textures.push(texture);
      for (const role of roles) {
        const name = (part.frames as Readonly<Record<string, string>>)[role];
        if (!texture.has(name)) return null;
        const frame = texture.get(name); if (!validFrame(frame, size)) return null;
        refs.push(frame, frame.source, frame.source.image, frame.source.source, frame.cutX, frame.cutY, frame.source.width, frame.source.height);
      }
    }
    // Extra BASE/unused packed tail cells are legal; only all required semantic roles are counted.
    return { refs, textures };
  }
  private sameResources(value: Resources): boolean { return value.refs.length === this.resourceRefs.length && value.refs.every((ref, i) => ref === this.resourceRefs[i]); }
  private readonly restore = (): void => {
    if (this.disposed || !this.plan || !this.sea) return;
    try {
      const resources = this.readResources();
      if (!resources || !this.sameResources(resources)) throw new Error('Factory resources changed during restore');
      resources.textures.forEach(texture => texture.setFilter(1));
      this.replayPatterns(); this.replayBands(this.plan); this.updateSea(this.sea);
    } catch {
      this.clearOwned();
      // Paused scenes have no draw tick. Parent may repaint its last immutable world with delta 0.
      // Ordinary draw failures already return false; notifying there would recurse into parent.draw.
      this.invalidateRestore?.();
    }
  };
  private clearOwned(): void {
    const owned = this.owned.splice(0).reverse();
    this.bands.length = 0; this.patterns.length = 0; this.fill = null; this.surface = null;
    this.plan = null; this.sea = null; this.signature = null; this.resourceRefs = [];
    // Consumers are released before their owned pattern RTs; no source asset texture is destroyed.
    for (const object of owned) { try { object.destroy(); } catch { /* Continue releasing every owned view object. */ } }
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.scene.game.renderer.off('restorewebgl', this.restore); this.clearOwned();
  }
}
