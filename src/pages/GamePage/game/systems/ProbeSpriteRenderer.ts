import type * as Phaser from 'phaser';
import type { Probe } from '../entities/model';
import type { EnemySpriteImage } from './EnemySpriteRenderer';

export const PROBE_SPRITE_ROLES = Object.freeze(['seek-a', 'seek-b', 'tell', 'consume'] as const);
export type ProbeSpriteRole = typeof PROBE_SPRITE_ROLES[number];
export type ProbeSpriteFrameId = string | number;
export const PROBE_SPRITE_SIZE = 32;
export const PROBE_SPRITE_PIVOT = Object.freeze({ x: 16, y: 16 });
export const PROBE_SEEK_FRAME_MS = 240;

/** Semantic roles only. The Lead injects verified atlas keys after native export. */
export interface ProbeSpriteBinding {
  readonly key: string;
  readonly frames: Readonly<Record<ProbeSpriteRole, ProbeSpriteFrameId>>;
}
type BoundFrames = Readonly<Record<ProbeSpriteRole, string>>;
interface Binding { readonly key: string; readonly frames: BoundFrames }
export interface ProbeTextureFrame extends Readonly<Pick<Phaser.Textures.Frame,
  'cutX' | 'cutY' | 'cutWidth' | 'cutHeight' | 'x' | 'y' | 'width' | 'height' | 'realWidth' | 'realHeight' | 'trimmed' | 'rotated'>> {
  readonly source: Readonly<Pick<Phaser.Textures.TextureSource, 'width' | 'height'>> & { readonly image?: unknown; readonly source?: unknown };
}
export interface ProbeSpriteTexture {
  has(frame: string): boolean;
  get(frame: string): ProbeTextureFrame | undefined;
  setFilter(mode: Phaser.Textures.FilterMode): unknown;
}
export interface ProbeSpriteImage extends EnemySpriteImage {
  setAlpha(value: number): unknown;
  setRotation(value: number): unknown;
}
export interface ProbeSpriteScene {
  readonly add: { image(x: number, y: number, key: string, frame: string): ProbeSpriteImage };
  readonly textures: { exists(key: string): boolean; get(key: string): ProbeSpriteTexture };
}
export type ProbeSpriteActor = Readonly<Pick<Probe, 'id' | 'hp' | 'x' | 'y' | 'phase'>>;
export interface ProbeSpriteWorld {
  readonly save: Readonly<{ runId: string; elapsedMs: number }>;
  readonly chapter: Readonly<{ stage: number }>;
  readonly factory: Readonly<{ probes: readonly ProbeSpriteActor[] }> | null;
}
interface Entry { readonly image: ProbeSpriteImage; frame: string }
interface Resources { readonly texture: ProbeSpriteTexture; readonly refs: readonly unknown[] }

// Runtime import of Phaser would require browser globals. The independent test
// reads installed Phaser 4.0 src/textures/const.js, where NEAREST=1, LINEAR=0.
const NEAREST: Phaser.Textures.FilterMode = 1;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function copyBinding(value: unknown): Binding | null {
  try {
    if (!isRecord(value) || typeof value.key !== 'string' || !value.key.trim() || !isRecord(value.frames)) return null;
    const frames: Record<ProbeSpriteRole, string> = { 'seek-a': '', 'seek-b': '', tell: '', consume: '' };
    for (const role of PROBE_SPRITE_ROLES) {
      const id = value.frames[role];
      if (!(typeof id === 'string' ? id.trim().length > 0 : typeof id === 'number' && Number.isSafeInteger(id) && id >= 0)) return null;
      // Texture.get(0) selects firstFrame in installed 4.0. Named "0" does not.
      frames[role] = String(id);
    }
    if (new Set(Object.values(frames)).size !== PROBE_SPRITE_ROLES.length) return null;
    return Object.freeze({ key: value.key, frames: Object.freeze(frames) });
  } catch { return null; }
}
function validFrame(frame: ProbeTextureFrame | undefined): frame is ProbeTextureFrame {
  if (!frame || !frame.source || frame.trimmed !== false || frame.rotated !== false || frame.x !== 0 || frame.y !== 0) return false;
  const { cutX, cutY, cutWidth, cutHeight, width, height, realWidth, realHeight, source } = frame;
  return [cutX, cutY, source.width, source.height].every(Number.isSafeInteger)
    && cutX >= 0 && cutY >= 0 && source.width > 0 && source.height > 0
    && [cutWidth, cutHeight, width, height, realWidth, realHeight].every(value => value === PROBE_SPRITE_SIZE)
    && cutX + PROBE_SPRITE_SIZE <= source.width && cutY + PROBE_SPRITE_SIZE <= source.height;
}

/** Project current Core phase. No phaseUntil, replication deadline or birth clock. */
export function probeSpriteRoleFor(phase: unknown, elapsedMs: number): ProbeSpriteRole | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  if (phase === 'tell' || phase === 'consume') return phase;
  if (phase !== 'seek') return null;
  return Math.floor(elapsedMs / PROBE_SEEK_FRAME_MS) % 2 === 0 ? 'seek-a' : 'seek-b';
}

/** Owns only body Images. Rule rings, target outlines and real replication stay with Core/caller. */
export class ProbeSpriteRenderer {
  private readonly binding: Binding | null;
  private readonly images = new Map<number, Entry>();
  private resourceRefs: readonly unknown[] = [];
  private runId: string | null = null;
  private stage: number | null = null;
  private disposed = false;

  constructor(private readonly scene: ProbeSpriteScene, binding: unknown = null) { this.binding = copyBinding(binding); }

  /** Returned IDs own only this draw's native bodies; all others keep the caller's Graphics fallback. */
  draw(world: ProbeSpriteWorld): ReadonlySet<number> {
    const handled = new Set<number>();
    if (this.disposed) return handled;
    if (this.runId !== world.save.runId || this.stage !== world.chapter.stage) {
      this.clear(); this.runId = world.save.runId; this.stage = world.chapter.stage;
    }
    const factory = world.factory, binding = this.binding, now = world.save.elapsedMs;
    if (!binding || world.chapter.stage !== 2 || !factory || !Array.isArray(factory.probes)
      || typeof world.save.runId !== 'string' || !world.save.runId.trim() || !Number.isFinite(now) || now < 0) {
      this.clear(); return handled;
    }
    try {
      const resources = this.readResources(binding);
      if (!resources) { this.clear(); return handled; }
      if (resources.refs.length !== this.resourceRefs.length || resources.refs.some((value, index) => value !== this.resourceRefs[index])) {
        this.clear(); resources.texture.setFilter(NEAREST); this.resourceRefs = resources.refs;
      }
      // An ambiguous duplicate ID must not move one Image between two bodies.
      const counts = new Map<number, number>();
      for (const probe of factory.probes) counts.set(probe.id, (counts.get(probe.id) ?? 0) + 1);
      for (const probe of factory.probes) {
        const role = probeSpriteRoleFor(probe.phase, now);
        if (!Number.isSafeInteger(probe.id) || probe.id <= 0 || counts.get(probe.id) !== 1 || !Number.isFinite(probe.hp) || probe.hp <= 0
          || !Number.isFinite(probe.x) || !Number.isFinite(probe.y) || role === null) continue;
        const frame = binding.frames[role]; let entry = this.images.get(probe.id);
        if (!entry) {
          const image = this.scene.add.image(Math.round(probe.x), Math.round(probe.y), binding.key, frame);
          entry = { image, frame }; this.images.set(probe.id, entry); // Own it before any setter can fail.
        } else if (entry.frame !== frame) { entry.image.setFrame(frame); entry.frame = frame; }
        const image = entry.image;
        // SetFrame may reset its pivot. Keep native centered housing; all detail motion is in the source frames.
        image.setDisplayOrigin(PROBE_SPRITE_PIVOT.x, PROBE_SPRITE_PIVOT.y);
        image.setScale(1); image.setDepth(2); image.setRotation(0); image.setFlipX(false); image.setAlpha(1);
        image.setPosition(Math.round(probe.x), Math.round(probe.y)); handled.add(probe.id);
      }
      for (const [id, entry] of this.images) if (!handled.has(id)) { entry.image.destroy(); this.images.delete(id); }
      return handled;
    } catch {
      // A failed allocation/update cannot leave partial bodies over the safe Graphics fallback.
      this.clear(); return new Set<number>();
    }
  }

  private readResources(binding: Binding): Resources | null {
    if (!this.scene.textures.exists(binding.key)) return null;
    const texture = this.scene.textures.get(binding.key), refs: unknown[] = [texture];
    for (const role of PROBE_SPRITE_ROLES) {
      const key = binding.frames[role]; if (!texture.has(key)) return null;
      const frame = texture.get(key); if (!validFrame(frame)) return null;
      refs.push(frame, frame.source, frame.source.image, frame.source.source,
        frame.cutX, frame.cutY, frame.source.width, frame.source.height);
    }
    return { texture, refs };
  }
  private clear(): void {
    for (const entry of this.images.values()) entry.image.destroy();
    this.images.clear(); this.resourceRefs = [];
  }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.clear(); }
}
