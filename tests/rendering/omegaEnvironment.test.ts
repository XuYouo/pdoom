import { readFileSync } from 'node:fs';
import type * as Phaser from 'phaser';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { worldPlatforms } from '../../src/pages/GamePage/game/systems/platforms';
import { OMEGA_ENVIRONMENT_ASSETS, OMEGA_ENVIRONMENT_BINDING } from '../../src/pages/GamePage/game/data/omegaEnvironmentAssets';
import { OMEGA_TERRAIN_ROLES, OMEGA_PROP_ROLES, OMEGA_IMAGE_LIMIT, planOmegaEnvironment,
  type OmegaCommand, type OmegaRect } from '../../src/pages/GamePage/game/systems/OmegaEnvironmentPlan';
import { OmegaEnvironmentRenderer, omegaEnvironmentResourcesReady, type OmegaEnvironmentBinding,
  type OmegaEnvironmentScene, type OmegaImage, type OmegaTextureFrame, type OmegaSourceTexture } from '../../src/pages/GamePage/game/systems/OmegaEnvironmentRenderer';

// Independent technical literals. Mock/unit outputs are not native browser evidence.
const TILES = ['corridor-top-left', 'corridor-top-mid-a', 'corridor-top-mid-b', 'corridor-top-right',
  'corridor-body-left', 'corridor-body-a', 'corridor-body-b', 'corridor-body-right',
  'corridor-foot-left', 'corridor-foot-a', 'corridor-foot-b', 'corridor-foot-right',
  'chamber-top-left', 'chamber-top-mid-a', 'chamber-top-mid-b', 'chamber-top-right',
  'chamber-body-left', 'chamber-body-a', 'chamber-body-b', 'chamber-body-right',
  'chamber-foot-left', 'chamber-foot-a', 'chamber-foot-b', 'chamber-foot-right',
  'observer-left', 'observer-mid-a', 'observer-mid-b', 'observer-right', 'quiet-wall', 'rear-channel', 'rack-base', 'floor-recess'] as const;
const PROPS = ['compute-bank', 'cable-arch', 'air-duct', 'empty-chair', 'final-door-frame', 'standing-mirror'] as const;
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    for (const key of Reflect.ownKeys(v)) { const d = Object.getOwnPropertyDescriptor(v, key); if (d && 'value' in d) freeze(d.value); }
    Object.freeze(v);
  }
  return v;
}
function trap(target: object, key: string, reads: string[]) {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, get() { reads.push(key); throw Error('forbidden ' + key); } });
}
const world = (checkpoint = 0) => structuredClone(createWorld({
  ...createRun('0badcafe-0000-4000-8000-000000000125', 42), stage: 5, checkpoint, elapsedMs: 20000,
}));
const view = (x = 0): OmegaRect => ({ x, y: 0, width: 640, height: 360 });
function binding() {
  return { terrain: { key: 'environment-omega-terrain', frames: Object.fromEntries(TILES.map((r, i) => [r, String(i)])) as Record<typeof TILES[number], string | number> },
    props: { key: 'environment-omega-props', frames: Object.fromEntries(PROPS.map((r, i) => [r, `omega-props ${i}.aseprite`])) as Record<typeof PROPS[number], string | number> } };
}
type Part = 'terrain' | 'props';
type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type Media = { width: number; height: number; image: unknown; source?: unknown };
type Frame = Mutable<Omit<OmegaTextureFrame, 'source'>> & { source: Media };
interface Faults { op: string; frame: string | null; imageOp: string; imageAt: number; hook: ((op: string, index?: number) => void) | null }
class ImagePort implements OmegaImage {
  x = -1; y = -1; key = ''; frame = ''; origin = [0.5, 0.5]; scale = 9; rotation = 3; alpha = 0.2; tint = 0; depth = 99;
  flip = [true, true]; crop = [-1, -1, -1, -1]; visible = false; destroyed = 0; calls: string[] = [];
  scene: unknown = {}; active = true; private destroyListeners: (() => void)[] = [];
  constructor(readonly index: number, readonly faults: Faults) {}
  private hit(op: string) {
    this.calls.push(op); this.faults.hook?.(op, this.index);
    if (this.faults.imageOp === op && (this.faults.imageAt < 0 || this.faults.imageAt === this.index)) throw Error('image ' + op);
  }
  once(event: string, listener: () => void) { this.hit('once'); if (event !== 'destroy') throw Error('unexpected event'); this.destroyListeners.push(listener); return this; }
  setTexture(key: string, frame: string) { this.hit('texture'); this.key = key; this.frame = frame; this.origin = [0.5, 0.5]; this.crop = [-1, -1, -1, -1]; return this; }
  setOrigin(x: number, y: number) { this.hit('origin'); this.origin = [x, y]; return this; }
  setScale(v: number) { this.hit('scale'); this.scale = v; return this; }
  setRotation(v: number) { this.hit('rotation'); this.rotation = v; return this; }
  setPosition(x: number, y: number) { this.hit('position'); this.x = x; this.y = y; return this; }
  setDepth(v: number) { this.hit('depth'); this.depth = v; return this; }
  setAlpha(v: number) { this.hit('alpha'); this.alpha = v; return this; }
  setVisible(v: boolean) { this.hit('visible'); this.visible = v; return this; }
  setCrop(x: number, y: number, width: number, height: number) { this.hit('crop'); this.crop = [x, y, width, height]; return this; }
  setTint(v: number) { this.hit('tint'); this.tint = v; return this; }
  setFlip(x: boolean, y: boolean) { this.hit('flip'); this.flip = [x, y]; return this; }
  destroy() {
    if (!this.scene) return; this.destroyed++; this.hit('destroy');
    const listeners = this.destroyListeners; this.destroyListeners = []; for (const listener of listeners) listener();
    this.active = false; this.visible = false; this.scene = undefined;
  }
}
interface Source extends OmegaSourceTexture { frames: Map<string, Frame>; filters: number[]; destroyed: number; media: Media; destroy(): void }
function harness(b: OmegaEnvironmentBinding = binding()) {
  const faults: Faults = { op: '', frame: null, imageOp: '', imageAt: -1, hook: null };
  const images: ImagePort[] = [], borrowed: Source[] = [], calls: string[] = [];
  const hit = (op: string, name?: string) => {
    calls.push(op + (name === undefined ? '' : ':' + name)); faults.hook?.(op);
    if (faults.op === op && (faults.frame === null || name === faults.frame)) throw Error(op);
  };
  const make = (part: Part): Source => {
    const width = part === 'terrain' ? 96 : 384, height = part === 'terrain' ? 96 : 128;
    const fw = part === 'terrain' ? 16 : 64, fh = part === 'terrain' ? 16 : 128;
    const media: Media = { width, height, image: { naturalWidth: width, naturalHeight: height }, source: {} }, frames = new Map<string, Frame>();
    const roles = part === 'terrain' ? TILES : PROPS;
    const texture: Source = { key: b[part].key, source: [media], frames, media, filters: [], destroyed: 0,
      has(name) { hit('has', name); return frames.has(name); },
      get(name) { hit('get-frame', name); if (typeof name !== 'string') throw Error('numeric-zero base trap'); return frames.get(name); },
      setFilter(mode) { hit('filter'); this.filters.push(mode); }, destroy() { this.destroyed++; },
    };
    roles.forEach((role, i) => frames.set(String((b[part].frames as Record<string, string | number>)[role]), {
      name: String((b[part].frames as Record<string, string | number>)[role]), texture, sourceIndex: 0, x: 0, y: 0, cutX: i % 6 * fw, cutY: Math.floor(i / 6) * fh, cutWidth: fw, cutHeight: fh,
      width: fw, height: fh, realWidth: fw, realHeight: fh, trimmed: false, rotated: false, source: media,
    }));
    trap(texture, 'frameTotal', calls); borrowed.push(texture); return texture;
  };
  const sources = { terrain: make('terrain'), props: make('props') }, keys = { terrain: b.terrain.key, props: b.props.key };
  const scene: OmegaEnvironmentScene = { textures: {
    exists(key) { hit('exists'); return key === keys.terrain || key === keys.props; },
    get(key) { hit('get-texture'); if (key === keys.terrain) return sources.terrain; if (key === keys.props) return sources.props; throw Error('key'); },
  }, add: { image(x, y, key, frame) {
    hit('add'); const image = new ImagePort(images.length, faults); image.x = x; image.y = y; image.key = key; image.frame = frame;
    images.push(image); faults.hook?.('addedtoscene', image.index); return image;
  } } };
  return { scene, sources, make, images, faults, borrowed, calls, binding: b,
    frame(part: Part, slot: number) { const role = (part === 'terrain' ? TILES : PROPS)[slot]; return sources[part].frames.get(String((b[part].frames as Record<string, string | number>)[role]))!; } };
}
type Harness = ReturnType<typeof harness>;
const alive = (h: Harness) => h.images.filter(i => !i.destroyed);
const visible = (h: Harness) => alive(h).filter(i => i.visible);
function clean(h: Harness) { expect(alive(h)).toHaveLength(0); expect(h.borrowed.every(s => s.destroyed === 0)).toBe(true); }
function style(i: ImagePort) {
  expect(i.origin).toEqual([0, 0]); expect(i.scale).toBe(1); expect(i.rotation).toBe(0); expect(i.alpha).toBe(1);
  expect(i.tint).toBe(0xffffff); expect(i.flip).toEqual([false, false]); expect(i.crop.slice(0, 2)).toEqual([0, 0]);
  expect(i.crop[2]).toBeGreaterThan(0); expect(i.crop[3]).toBeGreaterThan(0); expect(i.destroyed).toBe(0);
}
function rectArea(a: OmegaRect, b: OmegaRect) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}
function coverage(commands: readonly OmegaCommand[], w: WorldState, v: OmegaRect) {
  const actual = worldPlatforms(w), supports = commands.filter(c => c.platformId !== null);
  for (const c of commands) {
    expect(rectArea(c, v)).toBeGreaterThan(0); expect(c.width).toBeGreaterThan(0); expect(c.height).toBeGreaterThan(0);
    if (c.kind === 'tile') { expect(c.width).toBeLessThanOrEqual(16); expect(c.height).toBeLessThanOrEqual(16); }
    else { expect([c.width, c.height]).toEqual([64, 128]); expect(c.depth).toBeLessThan(0); }
  }
  for (const p of actual) {
    const rect = { x: p.x, y: p.y, width: p.w, height: p.h };
    const tiles = supports.filter(c => c.platformId === p.id);
    expect(tiles.reduce((sum, c) => sum + rectArea(c, v), 0)).toBeCloseTo(rectArea(rect, v), 7);
    for (const c of tiles) {
      expect(c.kind).toBe('tile'); expect(c.depth).toBe(0.5);
      expect(c.x).toBeGreaterThanOrEqual(p.x); expect(c.x + c.width).toBeLessThanOrEqual(p.x + p.w);
      expect(c.y).toBeGreaterThanOrEqual(p.y); expect(c.y + c.height).toBeLessThanOrEqual(p.y + p.h);
      for (const other of tiles) if (other !== c) expect(rectArea(c, other)).toBe(0);
    }
  }
  expect(supports.every(c => actual.some(p => p.id === c.platformId))).toBe(true);
}
function plan(w = world(), v = view()) { const p = planOmegaEnvironment(w, v); expect(p).not.toBeNull(); return p!; }

describe('Omega native API and bounded pure support plan', () => {
  it('uses all32 source roles and six actual64x128 atlas descriptors, not64square props', () => {
    expect(OMEGA_TERRAIN_ROLES).toEqual(TILES); expect(OMEGA_PROP_ROLES).toEqual(PROPS);
    expect(OMEGA_IMAGE_LIMIT).toBe(384); expect(OMEGA_ENVIRONMENT_ASSETS).toHaveLength(2);
    const [terrain, props] = OMEGA_ENVIRONMENT_ASSETS;
    expect(terrain).toMatchObject({ key: 'environment-omega-terrain', load: 'spritesheet', image: 'game/omega-terrain.png', frameWidth: 16, frameHeight: 16, startFrame: 0, endFrame: 31 });
    expect(props).toMatchObject({ key: 'environment-omega-props', load: 'atlas', image: 'game/omega-props.png', atlas: 'game/omega-props.json', frameWidth: 64, frameHeight: 128 });
    TILES.forEach((r, i) => expect(String(OMEGA_ENVIRONMENT_BINDING.terrain.frames[r])).toBe(String(i)));
    PROPS.forEach((r, i) => expect(OMEGA_ENVIRONMENT_BINDING.props.frames[r]).toBe(`omega-props ${i}.aseprite`));
    expectTypeOf<Phaser.Scene>().toMatchTypeOf<OmegaEnvironmentScene>();
  });
  it.each([0, 0.125, 319.5, 400.25, 640, 1024.75, 1280, 1600, 1920, 2080, 2320, 2540, 2559.875, 2560])('exactly covers actual visible support area at cameraX%s without overlaps', x => {
    const w = freeze(world()), before = JSON.stringify(w), p = plan(w, view(x));
    expect(p.commands.length).toBeLessThanOrEqual(384); expect(new Set(p.commands.map(c => c.id)).size).toBe(p.commands.length);
    coverage(p.commands, w, view(x)); expect(JSON.stringify(w)).toBe(before);
  });
  it('is deterministic and budgeted after viewport filtering even though the complete world needs605 support Images', () => {
    const w = freeze(world()); let max = 0;
    const raw = worldPlatforms(w).reduce((sum, p) => sum + (2 + Math.ceil((p.w - 32) / 16)) * (p.h === 40 ? 3 : 1), 0);
    expect(raw).toBe(605); expect(raw).toBeGreaterThan(512);
    for (let x = 0; x <= 2560; x += 7.5) {
      const a = plan(w, view(x)); expect(plan(w, view(x))).toEqual(a);
      expect(a.commands.length).toBeGreaterThan(0); max = Math.max(max, a.commands.length);
    }
    expect(max).toBeLessThanOrEqual(384); expect(max).toBeLessThan(raw);
  });
  it('keeps native16+16+8 rows and12px observers, including middle-prefix2 on width130', () => {
    const w = world();
    for (const x of [0, 740, 1100, 1600, 2080, 2480, 2560]) {
      for (const c of plan(w, view(Math.min(x, 2560))).commands.filter(c => c.platformId !== null)) {
        const p = worldPlatforms(w).find(p => p.id === c.platformId)!;
        const row = c.y - p.y;
        expect(p.h === 40 ? [0, 16, 32] : [0]).toContain(row);
        expect(c.height).toBe(p.h === 12 ? 12 : row === 32 ? 8 : 16);
        const family = p.h === 12 ? TILES.slice(24, 28) : TILES.slice((c.x >= 2480 ? 12 : 0) + row / 16 * 4, (c.x >= 2480 ? 12 : 0) + row / 16 * 4 + 4);
        expect(family).toContain(c.role);
        if (c.x === p.x) expect(c.role).toBe(family[0]);
        else if (c.x === p.x + p.w - 16) expect(c.role).toBe(family[3]);
        else expect(family.slice(1, 3)).toContain(c.role);
      }
    }
    const observer = plan(w, view(1100)).commands.filter(c => c.platformId === 'omega-observer-1');
    expect(observer.map(c => c.width)).toContain(2);
    expect(observer.find(c => c.x === 1200)?.width).toBe(16);
    expect(observer.find(c => c.x === 1314)?.width).toBe(16);
  });
  it('leaves both real60px gaps empty and x740 un-snapped', () => {
    const w = world();
    for (const x of [500, 1400]) {
      for (const c of plan(w, view(x)).commands.filter(c => c.platformId !== null && c.y >= 320)) {
        expect(rectArea(c, { x: 680, y: 320, width: 60, height: 40 })).toBe(0);
        expect(rectArea(c, { x: 1540, y: 320, width: 60, height: 40 })).toBe(0);
      }
    }
    expect(plan(w, view(600)).commands.some(c => c.x === 740 && c.y === 320)).toBe(true);
    expect(plan(w, view(600)).commands.some(c => c.x === 736 && c.y === 320)).toBe(false);
  });
  it('maps all six static pivots literally while the chamber remains free of extra machinery', () => {
    const found = new Map<string, OmegaCommand>();
    for (const x of [0, 640, 1280, 1920, 2560]) for (const c of plan(world(), view(x)).commands) if (c.kind === 'prop') found.set(c.role, c);
    expect([...found.keys()].sort()).toEqual([...PROPS].sort());
    for (const [role, x] of [['compute-bank', 240], ['cable-arch', 1068], ['air-duct', 1808], ['empty-chair', 2768], ['final-door-frame', 2468], ['standing-mirror', 2993]] as const) {
      expect(found.get(role)).toMatchObject({ x, y: 200, width: 64, height: 128, platformId: null });
      expect(found.get(role)!.depth).toBeLessThan(0);
    }
    const door = found.get('final-door-frame')!, mirror = found.get('standing-mirror')!;
    expect([door.x + 12, door.y + 24, 40, 96]).toEqual([2480, 224, 40, 96]);
    expect([mirror.x + 8, mirror.y + 22, 48, 98]).toEqual([3001, 222, 48, 98]);
  });
  it('follows current worldPlatforms collapsed state rather than creating a replacement floor', () => {
    const w = world(); w.collapsed = ['omega-floor-1', 'omega-observer-1'];
    const p = plan(freeze(w), view(1100)); coverage(p.commands, w, view(1100));
    expect(p.commands.some(c => c.platformId === 'omega-floor-1' || c.platformId === 'omega-observer-1')).toBe(false);
  });
  it.each([NaN, Infinity, -1, 2560.01])('rejects malformed/current-viewport cameraX%s with no partial plan', x => {
    expect(planOmegaEnvironment(world(), { ...view(), x })).toBeNull();
  });
  it.each([{ y: 1 }, { width: 0 }, { width: 641 }, { width: Infinity }, { height: 0 }, { height: 361 }])('rejects invalid viewport%s', patch => {
    expect(planOmegaEnvironment(world(), { ...view(), ...patch })).toBeNull();
  });
  it.each([{ w: 0 }, { w: 40.5 }, { h: 16 }, { x: NaN }, { y: Infinity }])('rejects invalid support%s without mutating Core', patch => {
    const w = world(); Object.assign(w.chapter.platforms[0], patch); expect(planOmegaEnvironment(w, view())).toBeNull();
  });
  it('rejects other chapter/world shapes and throwing boundary inputs', () => {
    const w = world(); w.chapter = { ...w.chapter, width: 3201 }; expect(planOmegaEnvironment(w, view())).toBeNull();
    expect(planOmegaEnvironment(createWorld(createRun('0badcafe-0000-4000-8000-000000000111', 42)), view())).toBeNull();
    expect(planOmegaEnvironment(null as unknown as WorldState, view())).toBeNull();
    const bad = world(); trap(bad, 'chapter', []); expect(planOmegaEnvironment(bad, view())).toBeNull();
  });
});

describe('Omega all38 native resource guard, independent source geometry', () => {
  it('accepts complete literal resources without reading counts, allocating, changing filters or styles', () => {
    const h = harness(); expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(true);
    expect(h.images).toEqual([]); expect(h.borrowed.every(s => s.filters.length === 0 && !s.destroyed)).toBe(true);
    expect(h.calls.some(c => c.includes('frameTotal'))).toBe(false);
  });
  it.each([...TILES.map((role, i) => ['terrain' as const, role, i] as const), ...PROPS.map((role, i) => ['props' as const, role, i] as const)])('fails closed on missing%s:%s including every unused native slot', (part, role) => {
    const h = harness(); h.sources[part].frames.delete(String(h.binding[part].frames[role as never]));
    expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false); expect(h.images).toEqual([]);
  });
  it('rejects wrong last-frame cuts, swapped roles, square props and source dimensions', () => {
    const badFields: [string, unknown][] = [['x', 1], ['y', 1], ['width', 63], ['height', 64], ['realWidth', 65], ['realHeight', 64], ['cutWidth', 63], ['cutHeight', 64], ['cutX', -1], ['cutY', 1], ['trimmed', true], ['rotated', true], ['source', null]];
    for (const [key, value] of badFields) {
      const h = harness(); Object.assign(h.frame('props', 5), { [key]: value }); expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding), key).toBe(false);
    }
    for (const field of ['width', 'height']) { const h = harness(); Object.assign(h.sources.props.media, { [field]: 64 }); expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false); }
    const h = harness(); Object.assign(h.frame('terrain', 31), { cutX: 16, cutY: 16 }); expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
  });
  it('rejects aliased frames, source objects and source textures even when getters adapt rectangle fields', () => {
    const a = harness(), shared = { ...a.frame('terrain', 0) };
    a.sources.terrain.get = name => { const f = a.sources.terrain.frames.get(name); return f ? Object.assign(shared, f) : undefined; };
    expect(omegaEnvironmentResourcesReady(a.scene.textures, a.binding)).toBe(false);
    const b = harness(); for (const [name, frame] of b.sources.props.frames) b.sources.terrain.frames.set(name, frame);
    b.sources.props = b.sources.terrain; expect(omegaEnvironmentResourcesReady(b.scene.textures, b.binding)).toBe(false);
    const c = harness(), media: Media = { width: 96, height: 96, image: null };
    media.image = { get naturalWidth() { return media.width; }, get naturalHeight() { return media.height; } };
    for (const part of ['terrain', 'props'] as const) {
      const s = c.sources[part]; (s.source as Media[])[0] = media; s.frames.forEach(f => { f.source = media; });
    }
    const get = c.scene.textures.get;
    c.scene.textures.get = key => { media.width = key === c.binding.terrain.key ? 96 : 384; media.height = key === c.binding.terrain.key ? 96 : 128; return get(key); };
    expect(omegaEnvironmentResourcesReady(c.scene.textures, c.binding)).toBe(false);
  });
  it.each(['exists', 'get-texture', 'has', 'get-frame'])('catches%s exceptions without GPU writes', op => {
    const h = harness(); h.faults.op = op; expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
    expect(h.images).toEqual([]); expect(h.borrowed.every(s => s.filters.length === 0)).toBe(true);
  });
  it('catches getter-hostile bindings, frames and media', () => {
    for (const field of ['binding', 'frame', 'media']) {
      const h = harness(), reads: string[] = [];
      if (field === 'binding') trap(h.binding.props.frames, PROPS[5], reads);
      if (field === 'frame') trap(h.frame('terrain', 31), 'trimmed', reads);
      if (field === 'media') trap(h.sources.props.media, 'height', reads);
      expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false); expect(reads.length).toBeGreaterThan(0);
    }
  });
});

describe('Omega stable borrowed-source Image boundary and owned lifecycle', () => {
  it('draws native cropped Images and restores every reused style without source or world mutation', () => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding), w = freeze(world()), before = JSON.stringify(w);
    expect(r.draw(w, view())).toBe(true); expect(visible(h).length).toBeGreaterThan(0); visible(h).forEach(style);
    expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]);
    for (const i of visible(h)) { i.scale = 2; i.alpha = 0.1; i.tint = 0; i.flip = [true, true]; i.crop = [2, 2, 1, 1]; i.rotation = 1; i.origin = [1, 1]; }
    const count = h.images.length; expect(r.draw(w, view())).toBe(true); visible(h).forEach(style);
    expect(h.images.length).toBe(count); expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]);
    expect(JSON.stringify(w)).toBe(before); r.destroy(); r.destroy(); clean(h); expect(h.images.every(i => i.destroyed === 1)).toBe(true);
  });
  it('reuses the bounded viewport slot pool across a complete forward and reverse camera journey', () => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding), w = freeze(world());
    for (const x of [...Array.from({ length: 129 }, (_, i) => i * 20), ...Array.from({ length: 129 }, (_, i) => 2560 - i * 20)]) {
      expect(r.draw(w, view(x))).toBe(true); expect(alive(h).length).toBeLessThanOrEqual(384); visible(h).forEach(style);
      const expected = plan(w, view(x)).commands;
      expect(visible(h)).toHaveLength(expected.length);
      for (const c of expected) expect(visible(h).some(i => i.x === c.x && i.y === c.y && i.crop[2] === c.width && i.crop[3] === c.height && i.depth === c.depth)).toBe(true);
    }
    expect(h.images.length).toBeLessThanOrEqual(384); expect(h.images.every(i => i.destroyed === 0)).toBe(true);
    expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]); r.destroy(); clean(h);
  });
  it('retains all three128px-tall chamber props at their true pivots and no fake source reflections', () => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding); expect(r.draw(freeze(world(2)), view(2560))).toBe(true);
    for (const [slot, x] of [[3, 2768], [5, 2993]]) {
      const image = visible(h).find(i => i.key === 'environment-omega-props' && i.frame === `omega-props ${slot}.aseprite`)!;
      expect(image).toBeDefined(); expect([image.x, image.y, ...image.crop]).toEqual([x, 200, 0, 0, 64, 128]); style(image);
    }
    expect(h.images.some(i => i.key.includes('clawd') || i.key.includes('mirror-actor'))).toBe(false); r.destroy(); clean(h);
  });
  it('copies valid bindings once, supports numeric terrain0 as string and ignores caller mutation', () => {
    const b = binding(); TILES.forEach((role, i) => { b.terrain.frames[role] = i; });
    const h = harness(b), r = new OmegaEnvironmentRenderer(h.scene, b);
    b.terrain.key = 'mutated'; b.props.key = 'mutated'; TILES.forEach(role => { b.terrain.frames[role] = 'bad'; });
    expect(r.draw(freeze(world()), view())).toBe(true); expect(h.calls).toContain('get-frame:0');
    expect(visible(h).every(i => i.key.startsWith('environment-omega-'))).toBe(true); r.destroy(); clean(h);
  });
  it('fails closed for malformed bindings and zero partial Image allocation', () => {
    const same = binding(); same.props.key = same.terrain.key;
    const duplicate = binding(); duplicate.terrain.frames[TILES[31]] = duplicate.terrain.frames[TILES[0]];
    const missing = binding(); delete (missing.props.frames as Partial<typeof missing.props.frames>)[PROPS[5]];
    const hostile = binding(); trap(hostile.props.frames, PROPS[5], []);
    for (const b of [null, undefined, 3, [], {}, same, duplicate, missing, hostile]) {
      const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, b);
      expect(r.draw(world(), view())).toBe(false); clean(h); expect(h.images).toEqual([]);
    }
  });
  it('withdraws previous images on invalid view, stage exit, missing unused source or malformed plan', () => {
    for (const fault of ['view', 'stage', 'source', 'plan']) {
      const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding), w = world(); expect(r.draw(w, view())).toBe(true);
      if (fault === 'source') h.sources.props.frames.delete('omega-props 5.aseprite');
      if (fault === 'plan') Object.assign(w.chapter.platforms[0], { h: 16 });
      const next = fault === 'stage' ? createWorld(createRun('0badcafe-0000-4000-8000-000000000222', 42)) : w;
      expect(r.draw(next, fault === 'view' ? { ...view(), width: 641 } : view())).toBe(false); clean(h);
    }
  });
  it('destroys old-run ownership without destroying borrowed textures', () => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding), w = world(); expect(r.draw(w, view())).toBe(true);
    const old = [...h.images]; w.save.runId = '0badcafe-0000-4000-8000-000000000223';
    expect(r.draw(w, view())).toBe(true); expect(old.every(i => i.destroyed === 1)).toBe(true);
    expect(visible(h).every(i => !old.includes(i))).toBe(true); r.destroy(); clean(h);
  });
  it('refilters only actual source/frame/media identity changes, including browser image-only restore', () => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding), w = world(); expect(r.draw(w, view())).toBe(true);
    for (let i = 0; i < 5; i++) expect(r.draw(w, view(640))).toBe(true);
    expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]);
    h.sources.props.media.image = { naturalWidth: 384, naturalHeight: 128 }; expect(r.draw(w, view(2560))).toBe(true);
    expect(h.borrowed.map(s => s.filters)).toEqual([[1, 1], [1, 1]]);
    for (let i = 0; i < 5; i++) expect(r.draw(w, view(2560))).toBe(true);
    expect(h.borrowed.map(s => s.filters)).toEqual([[1, 1], [1, 1]]); r.destroy(); clean(h);
  });
  it.each(['filter', 'add', 'has', 'get-frame', 'get-texture', 'exists'])('catches public port%s failures and releases all owned Images', op => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding); h.faults.op = op;
    expect(r.draw(world(), view())).toBe(false); clean(h);
  });
  it.each(['once', 'texture', 'origin', 'scale', 'rotation', 'position', 'depth', 'alpha', 'tint', 'flip', 'crop', 'visible'])('cleans an Image when setter%s throws after ownership begins', op => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding); h.faults.imageOp = op;
    expect(r.draw(world(), view())).toBe(false); expect(h.images.length).toBeGreaterThan(0); clean(h);
    expect(h.images.every(i => i.destroyed === 1)).toBe(true); r.destroy();
  });
  it.each(['add', 'addedtoscene', 'filter', 'get-texture', 'position', 'crop', 'visible'])('respects synchronous disposal from%s with zero leaked/double-destroyed Images', op => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding);
    h.faults.hook = current => { if (current === op) r.destroy(); };
    expect(r.draw(world(), view())).toBe(false); clean(h); expect(h.images.every(i => i.destroyed === 1)).toBe(true);
    h.faults.hook = null; expect(r.draw(world(), view())).toBe(false); expect(alive(h)).toEqual([]);
  });
  it('blocks recursive draw without corrupting the outer transaction', () => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding), values: boolean[] = [];
    h.faults.hook = op => { if (op === 'crop' && !values.length) values.push(r.draw(world(), view())); };
    expect(r.draw(world(), view())).toBe(true); expect(values).toEqual([false]); visible(h).forEach(style); r.destroy(); clean(h);
  });
  it('detaches every owned object before destroy callbacks throw or dispose again', () => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding); expect(r.draw(world(), view())).toBe(true);
    h.faults.imageOp = 'destroy'; h.faults.hook = op => { if (op === 'destroy') r.destroy(); };
    expect(() => r.destroy()).not.toThrow(); clean(h); expect(h.images.every(i => i.destroyed === 1)).toBe(true);
  });
  it('owns no clock, render target or GL callback; published World alone selects the fifth view', () => {
    const source = readFileSync('src/pages/GamePage/game/systems/OmegaEnvironmentRenderer.ts', 'utf8');
    expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|add\.sprite|add\.renderTexture|RESTORE_WEBGL|Date\.now|Math\.random/);
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding), w = world(); r.destroy();
    expect(r.draw(w, view())).toBe(false); expect(h.images).toEqual([]); expect(h.borrowed.every(s => s.filters.length === 0)).toBe(true);
  });
});

describe('Omega exact native ownership and underlying image negative controls', () => {
  it.each(['key', 'owner', 'name', 'index', 'source-array', 'natural-width', 'natural-height'])('rejects%s despite otherwise valid native rectangles', fault => {
    const h = harness(); expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(true);
    if (fault === 'key') Object.assign(h.sources.props, { key: 'different-texture' });
    if (fault === 'owner') Object.assign(h.frame('props', 5), { texture: h.sources.terrain });
    if (fault === 'name') Object.assign(h.frame('props', 5), { name: 'omega-props 4.aseprite' });
    if (fault === 'index') Object.assign(h.frame('props', 5), { sourceIndex: 1 });
    if (fault === 'source-array') Object.assign(h.sources.props, { source: [h.sources.terrain.media] });
    if (fault === 'natural-width') h.sources.props.media.image = { naturalWidth: 768, naturalHeight: 128 };
    if (fault === 'natural-height') h.sources.props.media.image = { naturalWidth: 384, naturalHeight: 64 };
    expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
    expect(h.images).toEqual([]); expect(h.borrowed.every(s => s.filters.length === 0)).toBe(true);
  });
  it('does not read Core time, HP, actor state or invisible RNG to skin static geometry', () => {
    const w = world(), reads: string[] = [];
    for (const key of ['elapsedMs', 'hp', 'seed']) trap(w.save, key, reads);
    for (const key of ['player', 'boss', 'bullets', 'history', 'behavior']) trap(w, key, reads);
    expect(planOmegaEnvironment(w, view())).not.toBeNull(); expect(reads).toEqual([]);
  });
});

describe('Omega installed4.0 GameObject destroy-event ordering', () => {
  it('withdraws the entire skin on external Image destruction without a second destroy call', () => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding), w = world(); expect(r.draw(w, view())).toBe(true);
    const old = [...h.images]; h.images[0].destroy(); clean(h); expect(old.every(i => i.destroyed === 1)).toBe(true);
    expect(r.draw(w, view())).toBe(true); expect(visible(h).every(i => !old.includes(i))).toBe(true);
    expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]); r.destroy(); clean(h);
  });
  it('aborts an in-flight projection after a destroy event during crop and safely rebuilds next time', () => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding);
    h.faults.hook = (op, index) => { if (op === 'crop' && index === 0) h.images[0].destroy(); };
    expect(r.draw(world(), view())).toBe(false); clean(h); expect(h.images[0].destroyed).toBe(1);
    h.faults.hook = null; expect(r.draw(world(), view())).toBe(true); r.destroy(); clean(h);
  });
  it('rejects an inactive borrowed handle while still cleaning the other owned Images', () => {
    const h = harness(), r = new OmegaEnvironmentRenderer(h.scene, h.binding), w = world(); expect(r.draw(w, view())).toBe(true);
    h.images[0].active = false; expect(r.draw(w, view())).toBe(false); clean(h);
    expect(h.images.every(i => i.destroyed === 1)).toBe(true); r.destroy();
  });
});

describe('Omega physical atlas identity', () => {
  it('rejects one physical image shared across distinct source wrappers with getter-adapted natural sizes', () => {
    const h = harness(); expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(true);
    let part: Part = 'terrain';
    const image = { get naturalWidth() { return part === 'terrain' ? 96 : 384; }, get naturalHeight() { return part === 'terrain' ? 96 : 128; } };
    h.sources.terrain.media.image = image; h.sources.props.media.image = image;
    const get = h.scene.textures.get;
    h.scene.textures.get = key => { part = key === h.binding.terrain.key ? 'terrain' : 'props'; return get(key); };
    expect(omegaEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
    expect(h.images).toEqual([]); expect(h.borrowed.every(s => s.filters.length === 0)).toBe(true);
  });
});
