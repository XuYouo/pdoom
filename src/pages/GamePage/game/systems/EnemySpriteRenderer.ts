import { DECEIVER_ASSET, deceiverFrameAt, enemyFrameAt, PARROT_ASSET, REPEATER_ASSET, type EnemySpriteAsset, type EnemySpriteKind, type ParrotFrameNames } from '../data/enemyAssets';
import type { Enemy } from '../entities/model';

/** Structural subset of the installed Phaser 4.0 Image API; importing this adapter needs no browser globals. */
export interface EnemySpriteImage {
  setFrame(frame: string): unknown;
  setDisplayOrigin(x: number, y: number): unknown;
  setPosition(x: number, y: number): unknown;
  setFlipX(value: boolean): unknown;
  setScale(value: number): unknown;
  setDepth(value: number): unknown;
  destroy(): void;
}
export interface EnemySpriteScene {
  readonly add: { image(x: number, y: number, texture: string, frame: string): EnemySpriteImage };
  readonly textures: { exists(key: string): boolean; get(key: string): { has(frame: string): boolean } };
}
export interface EnemySpriteWorld {
  readonly save: Readonly<{ runId: string; elapsedMs: number }>;
  readonly chapter: Readonly<{ stage: number }>;
  readonly player: Readonly<{ x: number; insightUntil?: number }>;
  readonly enemies: readonly Readonly<Enemy>[];
}
interface Entry { image: EnemySpriteImage; frame: string; kind: EnemySpriteKind }
interface Binding { readonly asset: EnemySpriteAsset; readonly frameNames: readonly string[]; readonly valid: boolean }

/** View-owned Images only: no entity mutation, physics bodies, timers, global animations, IO or hooks. */
export class EnemySpriteRenderer {
  private readonly images = new Map<string, Entry>();
  private readonly bindings: readonly Binding[];
  private runId: string | null = null;
  private stage: number | null = null;
  private disposed = false;

  // Legacy second/third arguments bind parrot/repeater; the fourth can bind all eight deceiver frames.
  constructor(private readonly scene: EnemySpriteScene, frameNames: ParrotFrameNames = PARROT_ASSET.frames, repeaterFrames: readonly string[] = REPEATER_ASSET.frames, deceiverFrames: readonly string[] = DECEIVER_ASSET.frames) {
    const bind = (asset: EnemySpriteAsset, names: readonly string[]): Binding => {
      const copy = Object.freeze(Array.isArray(names) ? [...names] : []);
      return Object.freeze({ asset, frameNames: copy, valid: copy.length === asset.frameCount
        && new Set(copy).size === asset.frameCount && copy.every(name => typeof name === 'string' && name.length > 0) });
    };
    this.bindings = Object.freeze([bind(PARROT_ASSET, frameNames), bind(REPEATER_ASSET, repeaterFrames), bind(DECEIVER_ASSET, deceiverFrames)]);
  }

  /** The returned IDs are owned only for this draw. Everything else stays on the caller's Graphics fallback. */
  draw(world: EnemySpriteWorld): ReadonlySet<string> {
    const handled = new Set<string>();
    if (this.disposed) return handled;
    if (this.runId !== world.save.runId || this.stage !== world.chapter.stage) {
      this.clear(); this.runId = world.save.runId; this.stage = world.chapter.stage;
    }
    const available = new Map<Enemy['kind'], Binding>();
    for (const binding of this.bindings) {
      if (!binding.valid || !this.scene.textures.exists(binding.asset.key)) continue;
      const texture = this.scene.textures.get(binding.asset.key);
      if (binding.frameNames.every(name => texture.has(name))) available.set(binding.asset.kind, binding);
    }

    for (const enemy of world.enemies) {
      if (!(enemy.hp > 0) || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) continue;
      const binding = available.get(enemy.kind);
      if (!binding) continue;
      const { asset, frameNames } = binding;
      const frame = frameNames[asset.kind === 'deceiver'
        ? deceiverFrameAt(enemy.phase, world.save.elapsedMs, world.player.insightUntil)
        : enemyFrameAt(asset, enemy.phase, world.save.elapsedMs)];
      let entry = this.images.get(enemy.id);
      if (entry && entry.kind !== asset.kind) { this.images.delete(enemy.id); entry.image.destroy(); entry = undefined; }
      if (!entry) {
        const image = this.scene.add.image(Math.round(enemy.x), Math.round(enemy.y), asset.key, frame);
        image.setScale(1); image.setDepth(2);
        image.setDisplayOrigin(asset.pivot.x, asset.pivot.y);
        entry = { image, frame, kind: asset.kind }; this.images.set(enemy.id, entry);
      } else if (entry.frame !== frame) {
        entry.image.setFrame(frame);
        // Phaser's frame change may reset a pivot: reassert the authored pixel anchor afterwards.
        entry.image.setDisplayOrigin(asset.pivot.x, asset.pivot.y);
        entry.frame = frame;
      }
      // Center anchor, not feet. Detail moves inside atlas frames; never add shell/body Y oscillation.
      entry.image.setPosition(Math.round(enemy.x), Math.round(enemy.y));
      entry.image.setFlipX(world.player.x > enemy.x); // Authored facing is left.
      handled.add(enemy.id);
    }
    for (const [id, entry] of this.images) {
      if (!handled.has(id)) { entry.image.destroy(); this.images.delete(id); }
    }
    return handled;
  }

  private clear(): void { for (const entry of this.images.values()) entry.image.destroy(); this.images.clear(); }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.clear(); }
}
