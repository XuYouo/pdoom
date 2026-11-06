import { vi } from 'vitest';
import type { ClawdScene, ClawdImage, ClawdVisual } from '../../src/pages/GamePage/game/systems/ClawdRenderer';
import type { ClawdTexture, ClawdTextureFrame, ClawdTextures } from '../../src/pages/GamePage/game/systems/ClawdResources';
export type Frame = { -readonly [K in keyof ClawdTextureFrame]: ClawdTextureFrame[K] };
export class Atlas implements ClawdTexture {
  source = [{ width: 704, height: 32, image: { naturalWidth: 704, naturalHeight: 32, width: 704, height: 32 }, source: {} }];
  frames = new Map<string, Frame>();
  setFilter = vi.fn();
  constructor(public key: string) {
    for (let i = 0; i < 22; i++) {
      const name = `clawd-svg ${i}.aseprite`;
      this.frames.set(name, { name, texture: this, source: this.source[0], sourceIndex: 0, x: 0, y: 0, cutX: i * 32, cutY: 0,
        width: 32, height: 32, cutWidth: 32, cutHeight: 32, realWidth: 32, realHeight: 32, trimmed: false, rotated: false });
    }
  }
  has(name: string) { return this.frames.has(name); }
  get(name: string) { return this.frames.get(name); }
}
export class Textures implements ClawdTextures {
  atlases = new Map(['aligned', 'masked', 'foom'].map(f => [`clawd-${f}`, new Atlas(`clawd-${f}`)]));
  exists(key: string) { return this.atlases.has(key); }
  get(key: string) { const t = this.atlases.get(key); if (!t) throw Error('missing texture'); return t; }
}
export class Image implements ClawdImage {
  active = true; isDestroyed = false; visible = true; key = ''; frame = ''; x = 0; y = 0;
  origin = [0, 0]; scale = 1; rotation = 0; depth = 0; alpha = 1; flip = [false, false]; crop = false; tint = 0xffffff; tintMode = 0;
  calls: { name: string; args: unknown[] }[] = []; hook?: (name: string, args: unknown[]) => void;
  private events = new Map<string, (() => void)[]>();
  constructor(public scene: ClawdScene | null) {}
  private record(name: string, ...args: unknown[]) { this.calls.push({ name, args }); this.hook?.(name, args); return this; }
  once(name: string, fn: () => void) { this.events.set(name, [...this.events.get(name) ?? [], fn]); return this; }
  setTexture(key: string, frame: string) { this.key = key; this.frame = frame; return this.record('setTexture', key, frame); }
  setDisplayOrigin(x: number, y: number) { this.origin = [x, y]; return this.record('setDisplayOrigin', x, y); }
  setScale(n: number) { this.scale = n; return this.record('setScale', n); }
  setRotation(n: number) { this.rotation = n; return this.record('setRotation', n); }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this.record('setPosition', x, y); }
  setDepth(n: number) { this.depth = n; return this.record('setDepth', n); }
  setAlpha(n: number) { this.alpha = n; return this.record('setAlpha', n); }
  setVisible(v: boolean) { this.visible = v; return this.record('setVisible', v); }
  setCrop() { this.crop = false; return this.record('setCrop'); }
  clearTint() { this.tint = 0xffffff; this.tintMode = 0; return this.record('clearTint'); }
  setTint(n: number) { this.tint = n; return this.record('setTint', n); }
  setTintMode(n: number) { this.tintMode = n; return this.record('setTintMode', n); }
  setFlip(x: boolean, y: boolean) { this.flip = [x, y]; return this.record('setFlip', x, y); }
  destroy() {
    if (this.isDestroyed) throw Error('double destroy'); this.isDestroyed = true; this.active = false; this.visible = false;
    const handlers = this.events.get('destroy') ?? []; this.events.clear(); handlers.forEach(fn => fn()); this.scene = null;
    return this.record('destroy');
  }
}
export function scene() {
  const textures = new Textures(), images: Image[] = [];
  const s: ClawdScene = { textures, add: { image: vi.fn(() => { const i = new Image(s); images.push(i); return i; }) } };
  return { s, textures, images };
}
export const visual = (changes: Partial<ClawdVisual> = {}): ClawdVisual => ({ runId: 'run', now: 0, hp: 100, form: 'aligned',
  actor: { x: 80.25, y: 300.4, vx: 0, facing: 1, grounded: true, petrifiedUntil: 0, invulnerableUntil: 0 },
  playing: true, rewinding: false, firedAt: null, ...changes });
