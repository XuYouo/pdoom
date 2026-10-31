import type * as Phaser from 'phaser';
import type { Boss } from '../entities/model';
import type { EnemySpriteImage } from './EnemySpriteRenderer';

export const SYDNEY_SPRITE_ACTIONS = Object.freeze(['idle', 'tell', 'attack', 'recover'] as const);
export const SYDNEY_SPRITE_SIZE = 96;
export const SYDNEY_SPRITE_FRAME_COUNT = 12;
export const SYDNEY_SPRITE_PIVOT = Object.freeze({ x: 48, y: 48 });
export type SydneySpriteFrameId = string | number;
/** Phase-major order, then idle/tell/attack/recover. No unverified export names. */
export interface SydneySpriteBinding {
  readonly key: string;
  readonly frames: readonly SydneySpriteFrameId[];
}
interface Binding { readonly key: string; readonly frames: readonly string[] }
export interface SydneyTextureFrame extends Readonly<Pick<Phaser.Textures.Frame,
  'cutX' | 'cutY' | 'cutWidth' | 'cutHeight' | 'x' | 'y' | 'width' | 'height' | 'realWidth' | 'realHeight' | 'trimmed' | 'rotated'>> {
  readonly source: Readonly<Pick<Phaser.Textures.TextureSource, 'width' | 'height'>> & { readonly image?: unknown; readonly source?: unknown };
}
export interface SydneySpriteTexture {
  has(frame: string): boolean;
  get(frame: string): SydneyTextureFrame | undefined;
  setFilter(mode: Phaser.Textures.FilterMode): unknown;
}
export interface SydneySpriteImage extends EnemySpriteImage {
  setAlpha(value: number): unknown;
  setRotation(value: number): unknown;
}
export interface SydneySpriteScene {
  readonly add: { image(x: number, y: number, key: string, frame: string): SydneySpriteImage };
  readonly textures: { exists(key: string): boolean; get(key: string): SydneySpriteTexture };
}
export interface SydneySpriteWorld {
  readonly save: Readonly<{ runId: string }>;
  readonly chapter: Readonly<{ stage: number }>;
  readonly boss: Readonly<Pick<Boss, 'kind' | 'phase' | 'action' | 'hp' | 'x' | 'y'>>;
}
interface Resources { readonly texture: SydneySpriteTexture; readonly refs: readonly unknown[] }
// Installed Phaser 4.0 enum; independently checked against its own module in tests.
const NEAREST: Phaser.Textures.FilterMode = 1;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function copyBinding(value: unknown): Binding | null {
  try {
    if (!isRecord(value) || typeof value.key !== 'string' || !value.key.trim() || !Array.isArray(value.frames) || value.frames.length !== 12) return null;
    const frames: string[] = [];
    for (const id of value.frames) {
      if (!(typeof id === 'string' ? id.trim().length > 0 : typeof id === 'number' && Number.isSafeInteger(id) && id >= 0)) return null;
      // Iteration also rejects sparse slots; named zero avoids Texture.get(0)'s fallback.
      frames.push(String(id));
    }
    if (frames.length !== 12 || new Set(frames).size !== 12) return null;
    return Object.freeze({ key: value.key, frames: Object.freeze(frames) });
  } catch { return null; }
}
function validFrame(frame: SydneyTextureFrame | undefined): frame is SydneyTextureFrame {
  if (!frame || !frame.source || frame.trimmed !== false || frame.rotated !== false || frame.x !== 0 || frame.y !== 0) return false;
  const { cutX, cutY, cutWidth, cutHeight, width, height, realWidth, realHeight, source } = frame;
  return [cutX, cutY, source.width, source.height].every(Number.isSafeInteger)
    && cutX >= 0 && cutY >= 0 && source.width > 0 && source.height > 0
    && [cutWidth, cutHeight, width, height, realWidth, realHeight].every(size => size === 96)
    && cutX + 96 <= source.width && cutY + 96 <= source.height;
}
/** Current Core pose only; no threshold/deadline/clock prediction. */
export function sydneySpriteFrameFor(phase: unknown, action: unknown): number | null {
  if (phase !== 1 && phase !== 2 && phase !== 3) return null;
  const index = SYDNEY_SPRITE_ACTIONS.findIndex(value => value === action);
  return index < 0 ? null : (phase - 1) * 4 + index;
}

/** Body-only view. Core owns Sydney's sin motion, attacks and control bubbles. */
export class SydneySpriteRenderer {
  private readonly binding: Binding | null;
  private image: SydneySpriteImage | null = null;
  private frame: string | null = null;
  private resourceRefs: readonly unknown[] = [];
  private runId: string | null = null;
  private stage: number | null = null;
  private disposed = false;

  constructor(private readonly scene: SydneySpriteScene, binding: unknown = null) { this.binding = copyBinding(binding); }

  /** True replaces only body pixels; the caller retains real telegraphs/HP/effects. */
  draw(world: SydneySpriteWorld): boolean {
    if (this.disposed) return false;
    if (this.runId !== world.save.runId || this.stage !== world.chapter.stage) {
      this.clear(); this.runId = world.save.runId; this.stage = world.chapter.stage;
    }
    const boss = world.boss, binding = this.binding, index = sydneySpriteFrameFor(boss.phase, boss.action);
    if (!binding || world.chapter.stage !== 2 || boss.kind !== 'sydney' || index === null
      || typeof world.save.runId !== 'string' || !world.save.runId.trim()
      || !Number.isFinite(boss.hp) || boss.hp <= 0 || !Number.isFinite(boss.x) || !Number.isFinite(boss.y)) {
      this.clear(); return false;
    }
    try {
      const resources = this.readResources(binding);
      if (!resources) { this.clear(); return false; }
      if (resources.refs.length !== this.resourceRefs.length || resources.refs.some((value, i) => value !== this.resourceRefs[i])) {
        this.clear(); resources.texture.setFilter(NEAREST); this.resourceRefs = resources.refs;
      }
      const frame = binding.frames[index];
      let image = this.image;
      if (!image) {
        image = this.scene.add.image(Math.round(boss.x), Math.round(boss.y), binding.key, frame);
        this.image = image; this.frame = frame; // Own before any configuration can fail.
      } else if (this.frame !== frame) {
        image.setFrame(frame); this.frame = frame;
      }
      image.setDisplayOrigin(48, 48); // A frame change may reset its pivot.
      image.setScale(1); image.setDepth(2); image.setRotation(0); image.setFlipX(false);
      image.setAlpha(1); // Unlike Gato, the original inactive Sydney body is opaque.
      image.setPosition(Math.round(boss.x), Math.round(boss.y));
      return true;
    } catch { this.clear(); return false; }
  }

  private readResources(binding: Binding): Resources | null {
    if (!this.scene.textures.exists(binding.key)) return null;
    const texture = this.scene.textures.get(binding.key), refs: unknown[] = [texture];
    for (const name of binding.frames) {
      if (!texture.has(name)) return null;
      const frame = texture.get(name); if (!validFrame(frame)) return null;
      refs.push(frame, frame.source, frame.source.image, frame.source.source,
        frame.cutX, frame.cutY, frame.source.width, frame.source.height);
    }
    return { texture, refs };
  }
  private clear(): void {
    const image = this.image; this.image = null; this.frame = null; this.resourceRefs = [];
    image?.destroy();
  }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.clear(); }
}
