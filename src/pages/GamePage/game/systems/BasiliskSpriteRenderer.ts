import type * as Phaser from 'phaser';
import type { Boss } from '../entities/model';
import type { EnemySpriteImage } from './EnemySpriteRenderer';

export const BASILISK_SPRITE_ACTIONS = Object.freeze(['idle', 'tell', 'attack', 'recover'] as const);
export interface BasiliskSpriteBinding { readonly key: string; readonly frames: readonly (string | number)[] }
interface Binding { readonly key: string; readonly frames: readonly string[] }
export interface BasiliskTextureFrame extends Readonly<Pick<Phaser.Textures.Frame,
  'cutX' | 'cutY' | 'cutWidth' | 'cutHeight' | 'x' | 'y' | 'width' | 'height' | 'realWidth' | 'realHeight' | 'trimmed' | 'rotated'>> {
  readonly source: Readonly<Pick<Phaser.Textures.TextureSource, 'width' | 'height'>> & { readonly image?: unknown; readonly source?: unknown };
}
export interface BasiliskSpriteTexture {
  has(frame: string): boolean;
  get(frame: string): BasiliskTextureFrame | undefined;
  setFilter(mode: Phaser.Textures.FilterMode): unknown;
}
export interface BasiliskSpriteImage extends EnemySpriteImage {
  setAlpha(value: number): unknown;
  setRotation(value: number): unknown;
}
export interface BasiliskSpriteScene {
  readonly add: { image(x: number, y: number, key: string, frame: string): BasiliskSpriteImage };
  readonly textures: { exists(key: string): boolean; get(key: string): BasiliskSpriteTexture };
}
export interface BasiliskSpriteWorld {
  readonly save: Readonly<{ runId: string }>;
  readonly chapter: Readonly<{ stage: number }>;
  readonly furnace: Readonly<{ enraged: boolean }> | null;
  readonly boss: Readonly<Pick<Boss, 'kind' | 'action' | 'hp' | 'x' | 'y' | 'facing'>>;
}
interface Resources { readonly texture: BasiliskSpriteTexture; readonly refs: readonly unknown[] }
const NEAREST: Phaser.Textures.FilterMode = 1;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function copyBinding(value: unknown): Binding | null {
  try {
    if (!record(value) || typeof value.key !== 'string' || !value.key.trim() || !Array.isArray(value.frames) || value.frames.length !== 8) return null;
    const frames: string[] = [];
    for (const id of value.frames) {
      if (!(typeof id === 'string' ? id.trim().length > 0 : typeof id === 'number' && Number.isSafeInteger(id) && id >= 0)) return null;
      frames.push(String(id)); // Named zero avoids Phaser's numeric-zero base-frame fallback.
    }
    if (new Set(frames).size !== 8) return null;
    return Object.freeze({ key: value.key, frames: Object.freeze(frames) });
  } catch { return null; }
}
function validFrame(f: BasiliskTextureFrame | undefined, index: number): f is BasiliskTextureFrame {
  return !!f && !!f.source && f.trimmed === false && f.rotated === false && f.x === 0 && f.y === 0
    && f.cutX === index * 96 && f.cutY === 0 && f.source.width === 768 && f.source.height === 96
    && [f.cutWidth, f.cutHeight, f.width, f.height, f.realWidth, f.realHeight].every(value => value === 96);
}
function resources(textures: BasiliskSpriteScene['textures'], binding: Binding): Resources | null {
  if (!textures.exists(binding.key)) return null;
  const texture = textures.get(binding.key), refs: unknown[] = [texture];
  for (const [index, name] of binding.frames.entries()) {
    if (!texture.has(name)) return null;
    const frame = texture.get(name); if (!validFrame(frame, index)) return null;
    refs.push(frame, frame.source, frame.source.image, frame.source.source, frame.cutX, frame.cutY, frame.source.width, frame.source.height);
  }
  return { texture, refs };
}
/** Complete loader/draw guard; no game objects, texture writes or partial readiness. */
export function basiliskSpriteResourcesReady(textures: BasiliskSpriteScene['textures'], value: unknown): boolean {
  try { const binding = copyBinding(value); return !!binding && resources(textures, binding) !== null; } catch { return false; }
}
/** Real donation mode and action only. HP phases share the same anatomy; no clock prediction. */
export function basiliskSpriteFrameFor(enraged: unknown, action: unknown): number | null {
  if (typeof enraged !== 'boolean') return null;
  const index = BASILISK_SPRITE_ACTIONS.findIndex(value => value === action);
  return index < 0 ? null : (enraged ? 4 : 0) + index;
}
export class BasiliskSpriteRenderer {
  private readonly binding: Binding | null;
  private image: BasiliskSpriteImage | null = null;
  private frame: string | null = null;
  private refs: readonly unknown[] = [];
  private runId: string | null = null;
  private stage: number | null = null;
  private disposed = false;
  constructor(private readonly scene: BasiliskSpriteScene, binding: unknown = null) { this.binding = copyBinding(binding); }
  /** True replaces only body pixels. The caller retains actual laser, HP and projectiles. */
  draw(world: BasiliskSpriteWorld): boolean {
    if (this.disposed) return false;
    try {
      if (this.runId !== world.save.runId || this.stage !== world.chapter.stage) {
        this.clear(); this.runId = world.save.runId; this.stage = world.chapter.stage;
      }
      const boss = world.boss, binding = this.binding, index = basiliskSpriteFrameFor(world.furnace?.enraged, boss.action);
      if (!binding || world.chapter.stage !== 3 || boss.kind !== 'basilisk' || index === null
        || typeof world.save.runId !== 'string' || !world.save.runId.trim() || !Number.isFinite(boss.hp) || boss.hp <= 0
        || !Number.isFinite(boss.x) || !Number.isFinite(boss.y) || (boss.facing !== -1 && boss.facing !== 1)) { this.clear(); return false; }
      const ready = resources(this.scene.textures, binding);
      if (!ready) { this.clear(); return false; }
      if (ready.refs.length !== this.refs.length || ready.refs.some((value, i) => value !== this.refs[i])) {
        this.clear(); ready.texture.setFilter(NEAREST); this.refs = ready.refs;
      }
      const frame = binding.frames[index]; let image = this.image;
      if (!image) {
        image = this.scene.add.image(Math.round(boss.x), Math.round(boss.y), binding.key, frame);
        this.image = image; this.frame = frame; // Own before a setter can fail.
      } else if (this.frame !== frame) { image.setFrame(frame); this.frame = frame; }
      image.setDisplayOrigin(48, 48); image.setScale(1); image.setDepth(2); image.setAlpha(1); image.setRotation(0);
      image.setFlipX(boss.facing === 1); image.setPosition(Math.round(boss.x), Math.round(boss.y));
      return true;
    } catch { this.clear(); return false; }
  }
  private clear(): void {
    const image = this.image; this.image = null; this.frame = null; this.refs = [];
    try { image?.destroy(); } catch { /* Ownership is cleared even if an engine object's teardown fails. */ }
  }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.clear(); }
}
