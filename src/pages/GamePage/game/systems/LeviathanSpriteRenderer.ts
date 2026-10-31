import type { Boss } from '../entities/model';

export interface LeviathanSpriteBinding { readonly key: string; readonly frames: readonly (string | number)[] }
interface Binding { readonly key: string; readonly frames: readonly string[] }
export interface LeviathanTextureSource {
  readonly width: number; readonly height: number; readonly image: unknown; readonly source?: unknown;
}
export interface LeviathanTextureFrame {
  readonly name: string | number; readonly texture: unknown; readonly sourceIndex: number;
  readonly x: number; readonly y: number; readonly cutX: number; readonly cutY: number;
  readonly width: number; readonly height: number; readonly cutWidth: number; readonly cutHeight: number;
  readonly realWidth: number; readonly realHeight: number; readonly trimmed: boolean; readonly rotated: boolean;
  readonly source: LeviathanTextureSource;
}
export interface LeviathanSpriteTexture {
  readonly source: readonly LeviathanTextureSource[];
  has(frame: string): boolean;
  get(frame: string): LeviathanTextureFrame | undefined;
  setFilter(mode: number): unknown;
}
export interface LeviathanSpriteImage {
  setFrame(frame: string): unknown;
  setDisplayOrigin(x: number, y: number): unknown;
  setPosition(x: number, y: number): unknown;
  setScale(value: number): unknown;
  setDepth(value: number): unknown;
  setAlpha(value: number): unknown;
  setRotation(value: number): unknown;
  setFlipX(value: boolean): unknown;
  setFlipY(value: boolean): unknown;
  clearTint(): unknown;
  setVisible(value: boolean): unknown;
  destroy(): void;
}
export interface LeviathanSpriteScene {
  readonly add: { image(x: number, y: number, key: string, frame: string): LeviathanSpriteImage };
  readonly textures: { exists(key: string): boolean; get(key: string): LeviathanSpriteTexture };
}
export interface LeviathanSpriteWorld {
  readonly save: Readonly<{ runId: string; elapsedMs: number }>;
  readonly chapter: Readonly<{ stage: number }>;
  readonly loom: Readonly<{ turn: Readonly<{ weakUntil: number }> }> | null;
  readonly boss: Readonly<Pick<Boss, 'kind' | 'hp' | 'x' | 'y' | 'active'>>;
}
interface Resources { readonly texture: LeviathanSpriteTexture; readonly refs: readonly unknown[] }
const NEAREST = 1;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function copyBinding(value: unknown): Binding | null {
  try {
    if (!record(value) || typeof value.key !== 'string' || !value.key.trim()) return null;
    if (!Array.isArray(value.frames) || value.frames.length !== 8) return null;
    const frames: string[] = [];
    for (const id of value.frames) {
      if (!(typeof id === 'string' ? id.trim().length > 0 : typeof id === 'number' && Number.isSafeInteger(id) && id >= 0)) return null;
      frames.push(String(id)); // A named zero avoids numeric-zero BASE fallback in Phaser.
    }
    if (new Set(frames).size !== 8) return null;
    return Object.freeze({ key: value.key, frames: Object.freeze(frames) });
  } catch { return null; }
}
function nativeImage(image: unknown): boolean {
  if (!record(image)) return false;
  // Native pixels, not CSS display dimensions. Also accept canvas/ImageBitmap-like sources.
  if ('naturalWidth' in image || 'naturalHeight' in image) {
    return image.naturalWidth === 1280 && image.naturalHeight === 160;
  }
  return image.width === 1280 && image.height === 160;
}
function validFrame(f: LeviathanTextureFrame | undefined, index: number, name: string,
  texture: LeviathanSpriteTexture, source: LeviathanTextureSource): f is LeviathanTextureFrame {
  return !!f && f.texture === texture && f.source === source && f.sourceIndex === 0 && String(f.name) === name
    && f.trimmed === false && f.rotated === false && f.x === 0 && f.y === 0
    && f.cutX === index * 160 && f.cutY === 0
    && [f.cutWidth, f.cutHeight, f.width, f.height, f.realWidth, f.realHeight].every(value => value === 160);
}
function resources(textures: LeviathanSpriteScene['textures'], binding: Binding): Resources | null {
  if (!textures.exists(binding.key)) return null;
  const texture = textures.get(binding.key);
  if (!Array.isArray(texture.source) || texture.source.length !== 1) return null;
  const source = texture.source[0];
  if (!source || source.width !== 1280 || source.height !== 160 || !nativeImage(source.image)) return null;
  const refs: unknown[] = [texture, texture.source, source, source.image, source.source, source.width, source.height];
  const seen = new Set<LeviathanTextureFrame>();
  for (const [index, name] of binding.frames.entries()) {
    if (!texture.has(name)) return null;
    const frame = texture.get(name);
    if (!validFrame(frame, index, name, texture, source) || seen.has(frame)) return null;
    seen.add(frame); refs.push(frame, frame.cutX, frame.cutY);
  }
  return { texture, refs };
}
/** Complete native resource gate, without images, filter writes, animation or browser globals. */
export function leviathanSpriteResourcesReady(textures: LeviathanSpriteScene['textures'], value: unknown): boolean {
  try { const binding = copyBinding(value); return !!binding && resources(textures, binding) !== null; } catch { return false; }
}
/** Only the actual simulation clock and live weak deadline select art. */
export function leviathanSpriteFrameFor(elapsedMs: unknown, weakUntil: unknown): number | null {
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0
    || typeof weakUntil !== 'number' || !Number.isFinite(weakUntil) || weakUntil < 0) return null;
  return Math.floor(elapsedMs / 100) % 4 + (weakUntil > elapsedMs ? 4 : 0);
}
export class LeviathanSpriteRenderer {
  private readonly binding: Binding | null;
  private image: LeviathanSpriteImage | null = null;
  private frame: string | null = null;
  private refs: readonly unknown[] = [];
  private runId: string | null = null;
  private stage: number | null = null;
  private disposed = false;
  private drawing = false;
  constructor(private readonly scene: LeviathanSpriteScene, binding: unknown = null) { this.binding = copyBinding(binding); }
  /** Replaces only body pixels; caller retains true contact/weak cues, HP, swallowing and projectiles. */
  draw(world: LeviathanSpriteWorld): boolean {
    if (this.disposed || this.drawing) return false;
    this.drawing = true;
    try {
      const { runId, elapsedMs } = world.save, stage = world.chapter.stage;
      if (this.runId !== runId || this.stage !== stage) { this.clear(); this.runId = runId; this.stage = stage; }
      const boss = world.boss, binding = this.binding;
      if (!binding || stage !== 4 || boss.kind !== 'leviathan' || !world.loom
        || typeof runId !== 'string' || !runId.trim() || !Number.isFinite(boss.hp) || boss.hp <= 0
        || !Number.isFinite(boss.x) || !Number.isFinite(boss.y) || typeof boss.active !== 'boolean') { this.clear(); return false; }
      // HP is checked before the weak deadline: defeat may leave weakUntil in the snapshot.
      const index = leviathanSpriteFrameFor(elapsedMs, world.loom.turn.weakUntil);
      if (index === null) { this.clear(); return false; }
      const ready = resources(this.scene.textures, binding);
      if (!ready) { this.clear(); return false; }
      if (ready.refs.length !== this.refs.length || ready.refs.some((value, i) => value !== this.refs[i])) {
        this.clear(); ready.texture.setFilter(NEAREST); this.refs = ready.refs;
      }
      const frame = binding.frames[index]; let image = this.image;
      if (!image) {
        image = this.scene.add.image(Math.round(boss.x), Math.round(boss.y), binding.key, frame);
        this.image = image; this.frame = frame; // Own before any setter can throw.
      } else if (this.frame !== frame) { image.setFrame(frame); this.frame = frame; }
      image.setDisplayOrigin(80, 80); image.setScale(1); image.setDepth(2);
      image.setAlpha(boss.active ? 1 : 0.55); image.setRotation(0);
      image.setFlipX(false); image.setFlipY(false); image.clearTint();
      image.setPosition(Math.round(boss.x), Math.round(boss.y)); image.setVisible(true);
      return true;
    } catch { this.clear(); return false; }
    finally { this.drawing = false; }
  }
  private clear(): void {
    const image = this.image; this.image = null; this.frame = null; this.refs = [];
    try { image?.setVisible(false); } catch { /* Teardown still releases the owned image. */ }
    try { image?.destroy(); } catch { /* No shared texture destruction, including on engine errors. */ }
  }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.clear(); }
}
