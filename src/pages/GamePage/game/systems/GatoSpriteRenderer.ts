import { GATO_ASSET, gatoFrameFor } from '../data/bossAssets';
import type { Boss } from '../entities/model';
import type { EnemySpriteImage, EnemySpriteScene } from './EnemySpriteRenderer';

/** Structural subset of the installed Phaser 4.0 Image; this module imports no browser runtime. */
export interface GatoSpriteImage extends EnemySpriteImage { setAlpha(value: number): unknown }
export interface GatoSpriteScene {
  readonly add: { image(x: number, y: number, texture: string, frame: string): GatoSpriteImage };
  readonly textures: EnemySpriteScene['textures'];
}
export interface GatoSpriteWorld {
  readonly save: Readonly<{ runId: string }>;
  readonly chapter: Readonly<{ stage: number }>;
  readonly boss: Readonly<Pick<Boss, 'kind' | 'phase' | 'action' | 'active' | 'hp' | 'x' | 'y'>>;
}

/** One view-owned body Image, with no physics, clock, target prediction, IO, global state or hooks. */
export class GatoSpriteRenderer {
  private readonly frames: readonly string[];
  private readonly validBinding: boolean;
  private image: GatoSpriteImage | null = null;
  private frame: string | null = null;
  private runId: string | null = null;
  private stage: number | null = null;
  private disposed = false;

  constructor(private readonly scene: GatoSpriteScene, frames: readonly string[] = GATO_ASSET.frames) {
    this.frames = Object.freeze(Array.isArray(frames) ? [...frames] : []);
    this.validBinding = this.frames.length === GATO_ASSET.frameCount && new Set(this.frames).size === GATO_ASSET.frameCount
      && this.frames.every(name => typeof name === 'string' && name.trim().length > 0);
  }

  /** True owns only the body this draw; the caller still paints real shield/telegraph/shock overlays. */
  draw(world: GatoSpriteWorld): boolean {
    if (this.disposed) return false;
    if (this.runId !== world.save.runId || this.stage !== world.chapter.stage) {
      this.clear(); this.runId = world.save.runId; this.stage = world.chapter.stage;
    }
    const boss = world.boss, index = gatoFrameFor(boss.phase, boss.action);
    if (boss.kind !== 'gato' || !Number.isFinite(boss.hp) || boss.hp <= 0 || !Number.isFinite(boss.x) || !Number.isFinite(boss.y) || index === null || !this.validBinding) {
      this.clear(); return false;
    }
    if (!this.scene.textures.exists(GATO_ASSET.key)) { this.clear(); return false; }
    const texture = this.scene.textures.get(GATO_ASSET.key);
    if (!this.frames.every(name => texture.has(name))) { this.clear(); return false; }
    const frame = this.frames[index];
    let image = this.image;
    if (!image) {
      image = this.scene.add.image(Math.round(boss.x), Math.round(boss.y), GATO_ASSET.key, frame);
      image.setScale(1); image.setDepth(2); image.setDisplayOrigin(GATO_ASSET.pivot.x, GATO_ASSET.pivot.y);
      this.image = image; this.frame = frame;
    } else if (this.frame !== frame) {
      image.setFrame(frame); image.setDisplayOrigin(GATO_ASSET.pivot.x, GATO_ASSET.pivot.y); this.frame = frame;
    }
    // Core alone moves the phase-2 attack to targetX; never anticipate that transition or add bobbing.
    image.setPosition(Math.round(boss.x), Math.round(boss.y));
    image.setFlipX(false); // Gato's real front-only reflector is on its authored left, not toward the player.
    image.setAlpha(boss.active ? 1 : GATO_ASSET.inactiveAlpha);
    return true;
  }

  private clear(): void { this.image?.destroy(); this.image = null; this.frame = null; }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.clear(); }
}
