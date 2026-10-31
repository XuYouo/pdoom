import type * as Phaser from 'phaser';
import type { Enemy } from '../entities/model';
import type { EnemySpriteImage } from './EnemySpriteRenderer';

export const CHINCHILLA_SPRITE_ROLES = Object.freeze(['idle', 'tell', 'recover'] as const);
export type ChinchillaSpriteRole = typeof CHINCHILLA_SPRITE_ROLES[number];
export interface ChinchillaSpriteBinding { readonly key: string; readonly frames: Readonly<Record<ChinchillaSpriteRole, string | number>> }
interface Binding { readonly key: string; readonly frames: Readonly<Record<ChinchillaSpriteRole, string>> }
export interface ChinchillaTextureFrame extends Readonly<Pick<Phaser.Textures.Frame,
  'cutX' | 'cutY' | 'cutWidth' | 'cutHeight' | 'x' | 'y' | 'width' | 'height' | 'realWidth' | 'realHeight' | 'trimmed' | 'rotated'>> {
  readonly source: Readonly<Pick<Phaser.Textures.TextureSource, 'width' | 'height'>> & { readonly image?: unknown; readonly source?: unknown };
}
export interface ChinchillaSpriteTexture {
  has(frame: string): boolean;
  get(frame: string): ChinchillaTextureFrame | undefined;
  setFilter(mode: Phaser.Textures.FilterMode): unknown;
}
export interface ChinchillaSpriteImage extends EnemySpriteImage {
  setAlpha(value: number): unknown;
  setRotation(value: number): unknown;
}
export interface ChinchillaSpriteScene {
  readonly add: { image(x: number, y: number, key: string, frame: string): ChinchillaSpriteImage };
  readonly textures: { exists(key: string): boolean; get(key: string): ChinchillaSpriteTexture };
}
export type ChinchillaSpriteActor = Readonly<Pick<Enemy, 'id' | 'kind' | 'hp' | 'x' | 'y' | 'phase'>>;
export interface ChinchillaSpriteWorld {
  readonly save: Readonly<{ runId: string }>;
  readonly chapter: Readonly<{ stage: number }>;
  readonly player: Readonly<{ x: number }>;
  readonly enemies: readonly ChinchillaSpriteActor[];
}
interface Resources { readonly texture: ChinchillaSpriteTexture; readonly refs: readonly unknown[] }
interface Entry { readonly image: ChinchillaSpriteImage; frame: string }
const NEAREST: Phaser.Textures.FilterMode = 1;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function copyBinding(value: unknown): Binding | null {
  try {
    if (!record(value) || typeof value.key !== 'string' || !value.key.trim() || !record(value.frames)) return null;
    const frames: Record<ChinchillaSpriteRole, string> = { idle: '', tell: '', recover: '' };
    for (const role of CHINCHILLA_SPRITE_ROLES) {
      const id = value.frames[role];
      if (!(typeof id === 'string' ? id.trim().length > 0 : typeof id === 'number' && Number.isSafeInteger(id) && id >= 0)) return null;
      frames[role] = String(id);
    }
    if (new Set(Object.values(frames)).size !== 3) return null;
    return Object.freeze({ key: value.key, frames: Object.freeze(frames) });
  } catch { return null; }
}
function validFrame(f: ChinchillaTextureFrame | undefined, index: number): f is ChinchillaTextureFrame {
  return !!f && !!f.source && f.trimmed === false && f.rotated === false && f.x === 0 && f.y === 0
    && f.cutX === index * 32 && f.cutY === 0 && f.source.width === 96 && f.source.height === 32
    && [f.cutWidth, f.cutHeight, f.width, f.height, f.realWidth, f.realHeight].every(v => v === 32);
}
function resources(textures: ChinchillaSpriteScene['textures'], binding: Binding): Resources | null {
  if (!textures.exists(binding.key)) return null;
  const texture = textures.get(binding.key), refs: unknown[] = [texture];
  for (const [index, role] of CHINCHILLA_SPRITE_ROLES.entries()) {
    const key = binding.frames[role]; if (!texture.has(key)) return null;
    const frame = texture.get(key); if (!validFrame(frame, index)) return null;
    refs.push(frame, frame.source, frame.source.image, frame.source.source, frame.cutX, frame.cutY, frame.source.width, frame.source.height);
  }
  return { texture, refs };
}
/** Shared complete guard: no allocation, filter writes or partially-ready pose. */
export function chinchillaSpriteResourcesReady(textures: ChinchillaSpriteScene['textures'], value: unknown): boolean {
  try { const binding = copyBinding(value); return !!binding && resources(textures, binding) !== null; } catch { return false; }
}
export function chinchillaSpriteRoleFor(phase: unknown): ChinchillaSpriteRole | null {
  return phase === 'idle' || phase === 'tell' || phase === 'recover' ? phase : null;
}
/** Three static Core states, never a Phaser animation or a second encounter clock. */
export class ChinchillaSpriteRenderer {
  private readonly binding: Binding | null;
  private readonly images = new Map<string, Entry>();
  private refs: readonly unknown[] = [];
  private runId: string | null = null;
  private stage: number | null = null;
  private disposed = false;
  constructor(private readonly scene: ChinchillaSpriteScene, binding: unknown = null) { this.binding = copyBinding(binding); }
  draw(world: ChinchillaSpriteWorld): ReadonlySet<string> {
    const handled = new Set<string>(); if (this.disposed) return handled;
    try {
      if (this.runId !== world.save.runId || this.stage !== world.chapter.stage) {
        this.clear(); this.runId = world.save.runId; this.stage = world.chapter.stage;
      }
      const binding = this.binding;
      if (!binding || world.chapter.stage !== 3 || typeof world.save.runId !== 'string' || !world.save.runId.trim()
        || !Number.isFinite(world.player.x) || !Array.isArray(world.enemies)) { this.clear(); return handled; }
      const ready = resources(this.scene.textures, binding);
      if (!ready) { this.clear(); return handled; }
      if (ready.refs.length !== this.refs.length || ready.refs.some((v, i) => v !== this.refs[i])) {
        this.clear(); ready.texture.setFilter(NEAREST); this.refs = ready.refs;
      }
      const counts = new Map<string, number>();
      for (const e of world.enemies) counts.set(e.id, (counts.get(e.id) ?? 0) + 1);
      for (const e of world.enemies) {
        const role = chinchillaSpriteRoleFor(e.phase);
        if (e.kind !== 'chinchilla' || typeof e.id !== 'string' || !e.id.trim() || counts.get(e.id) !== 1 || !Number.isFinite(e.hp) || e.hp <= 0
          || !Number.isFinite(e.x) || !Number.isFinite(e.y) || role === null) continue;
        const frame = binding.frames[role]; let entry = this.images.get(e.id);
        if (!entry) {
          const image = this.scene.add.image(Math.round(e.x), Math.round(e.y), binding.key, frame);
          entry = { image, frame }; this.images.set(e.id, entry);
        } else if (entry.frame !== frame) { entry.image.setFrame(frame); entry.frame = frame; }
        const image = entry.image;
        image.setDisplayOrigin(16, 16); image.setScale(1); image.setDepth(2); image.setRotation(0); image.setAlpha(1);
        image.setFlipX(world.player.x > e.x); image.setPosition(Math.round(e.x), Math.round(e.y)); handled.add(e.id);
      }
      for (const [id, entry] of this.images) if (!handled.has(id)) { this.images.delete(id); entry.image.destroy(); }
      return handled;
    } catch { this.clear(); return new Set<string>(); }
  }
  private clear(): void {
    const entries = [...this.images.values()]; this.images.clear(); this.refs = [];
    for (const entry of entries) { try { entry.image.destroy(); } catch { /* Continue releasing the other owned images. */ } }
  }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.clear(); }
}
