import { readFileSync } from 'node:fs';
import type * as Phaser from 'phaser';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { LeviathanSpriteRenderer, leviathanSpriteFrameFor, leviathanSpriteResourcesReady,
  type LeviathanSpriteBinding, type LeviathanSpriteImage, type LeviathanSpriteScene,
  type LeviathanSpriteTexture, type LeviathanTextureFrame, type LeviathanTextureSource } from '../../src/pages/GamePage/game/systems/LeviathanSpriteRenderer';
import { LEVIATHAN_ASSET, LEVIATHAN_BINDING } from '../../src/pages/GamePage/game/data/leviathanAssets';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { enterLoomArena, tryLoomReroll } from '../../src/pages/GamePage/game/systems/loom';
import { advanceLeviathan, applyLeviathanPressure, releaseLeviathanPresentation } from '../../src/pages/GamePage/game/systems/leviathan';
import { bossRect } from '../../src/pages/GamePage/game/entities/model';
import { worldPlatforms } from '../../src/pages/GamePage/game/systems/platforms';

// Independent view/real-Core fixture contracts. These are not PNG proofs or browser playthroughs.
const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const NAMES = ['leviathan 0.aseprite', 'leviathan 1.aseprite', 'leviathan 2.aseprite', 'leviathan 3.aseprite',
  'leviathan 4.aseprite', 'leviathan 5.aseprite', 'leviathan 6.aseprite', 'leviathan 7.aseprite'];
const FRAME_CASES = [[0, 0, 0], [99.999, 0, 0], [100, 0, 1], [199.999, 0, 1], [200, 0, 2], [300, 0, 3],
  [399.999, 0, 3], [400, 0, 0], [0, 1, 4], [100, 101, 5], [200, 201, 6], [300, 301, 7], [400, 401, 4],
  [350, 349.999, 3], [350, 350, 3], [350, 350.001, 7], [123456, 0, 2], [123456, 999999, 6]] as const;
const binding = () => ({ key: 'unit-leviathan', frames: SLOTS.map(String) as (string | number)[] });
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) { const d = Object.getOwnPropertyDescriptor(value, key); if (d && 'value' in d) freeze(d.value); }
    Object.freeze(value);
  }
  return value;
}
function input(elapsedMs = 0, weakUntil = 0) {
  return { save: { runId: 'run-a', elapsedMs }, chapter: { stage: 4 }, loom: { turn: { weakUntil } },
    boss: { kind: 'leviathan' as const, hp: 420, x: 2490.49, y: 448.51, active: true } };
}
const BASE = freeze(input());
function trap(target: object, key: string, reads: string[]) {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, get() { reads.push(key); throw Error('getter ' + key); } });
}
type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type Media = Mutable<LeviathanTextureSource> & { image: Record<string, unknown> };
type Frame = Mutable<Omit<LeviathanTextureFrame, 'source'>> & { source: Media };
interface State { failure: string; onlyFrame: string | null; imageFailure: string; present: boolean; hook: ((op: string) => void) | null }
class ImagePort implements LeviathanSpriteImage {
  origin = [11, 17]; position = [-1, -1]; scale = 5; depth = -9; alpha = 0.2; rotation = 3; flipX = true; flipY = true; tint = true;
  visible = false; alive = true; destroyed = 0; calls: string[] = []; frameChanges: string[] = [];
  constructor(public frame: string, readonly state: State) {}
  private hit(name: string) { this.calls.push(name); this.state.hook?.(name); if (this.state.imageFailure === name) throw Error(name); }
  setFrame(value: string) { this.hit('frame'); this.frameChanges.push(value); this.frame = value; this.origin = [11, 17]; return this; }
  setDisplayOrigin(x: number, y: number) { this.hit('origin'); this.origin = [x, y]; return this; }
  setPosition(x: number, y: number) { this.hit('position'); this.position = [x, y]; return this; }
  setScale(v: number) { this.hit('scale'); this.scale = v; return this; }
  setDepth(v: number) { this.hit('depth'); this.depth = v; return this; }
  setAlpha(v: number) { this.hit('alpha'); this.alpha = v; return this; }
  setRotation(v: number) { this.hit('rotation'); this.rotation = v; return this; }
  setFlipX(v: boolean) { this.hit('flipX'); this.flipX = v; return this; }
  setFlipY(v: boolean) { this.hit('flipY'); this.flipY = v; return this; }
  clearTint() { this.hit('tint'); this.tint = false; return this; }
  setVisible(v: boolean) { this.hit('visible'); this.visible = v; return this; }
  destroy() { this.destroyed++; this.alive = false; this.visible = false; this.hit('destroy'); }
}
function harness(b: LeviathanSpriteBinding = binding()) {
  const textureKey = b.key, names = [...b.frames];
  const state: State = { failure: '', onlyFrame: null, imageFailure: '', present: true, hook: null };
  const calls: string[] = [], images: ImagePort[] = [], creations: { x: number; y: number; key: string; frame: string }[] = [];
  const borrowed: { destroyed: number }[] = [];
  const step = (op: string, frame?: string) => {
    calls.push(op + (frame === undefined ? '' : ':' + frame)); state.hook?.(op);
    if (state.failure === op && (state.onlyFrame === null || frame === state.onlyFrame)) throw Error(op);
  };
  const makeTexture = () => {
    const media: Media = { width: 1280, height: 160, image: { naturalWidth: 1280, naturalHeight: 160, width: 1280, height: 160 }, source: {} };
    const frames = new Map<string, Frame>(), filters: number[] = [];
    const tex: Omit<LeviathanSpriteTexture, 'source'> & { source: Media[]; frames: Map<string, Frame>; filters: number[]; destroyed: number; destroy(): void } = {
      source: [media], frames, filters, destroyed: 0,
      has: name => { step('has', name); return frames.has(String(name)); },
      get: name => { step('get-frame', name); if (typeof name !== 'string') throw Error('Native numeric-zero firstFrame trap'); return frames.get(name); },
      setFilter: mode => { step('filter'); filters.push(mode); }, destroy() { this.destroyed++; },
    };
    names.forEach((name, index) => frames.set(String(name), { name, texture: tex, sourceIndex: 0, x: 0, y: 0, cutX: index * 160, cutY: 0,
      width: 160, height: 160, cutWidth: 160, cutHeight: 160, realWidth: 160, realHeight: 160, trimmed: false, rotated: false, source: media }));
    Object.defineProperty(tex, 'frameTotal', { get() { throw Error('Required slots, not total including BASE'); } });
    borrowed.push(tex); return tex;
  };
  const texture = { current: makeTexture() };
  const scene: LeviathanSpriteScene = {
    textures: { exists: key => { step('exists'); return state.present && key === textureKey; }, get: key => { step('get-texture'); if (key !== textureKey) throw Error('key'); return texture.current; } },
    add: { image: (x, y, key, frame) => {
      step('add'); const image = new ImagePort(frame, state); images.push(image); creations.push({ x, y, key, frame });
      // Phaser4.0 ImageFactory -> DisplayList.add emits addedtoscene synchronously before returning.
      state.hook?.('addedtoscene'); return image;
    } },
  };
  return { state, calls, images, creations, texture, scene, makeTexture, borrowed, binding: b,
    frame: (index: number) => texture.current.frames.get(String(names[index]))! };
}
type Harness = ReturnType<typeof harness>;
function empty(h: Harness) { expect(h.images.filter(i => i.alive)).toHaveLength(0); expect(h.borrowed.every(t => t.destroyed === 0)).toBe(true); }
function nativeStyle(image: ImagePort, alpha = 1, position = [2490, 449]) {
  expect(image.origin).toEqual([80, 80]); expect(image.position).toEqual(position);
  expect([image.scale, image.depth, image.alpha, image.rotation]).toEqual([1, 2, alpha, 0]);
  expect([image.flipX, image.flipY, image.tint, image.visible, image.alive]).toEqual([false, false, false, true, true]);
}
const leaf = (path: string) => readFileSync(new URL('../../node_modules/phaser/' + path, import.meta.url), 'utf8');

describe('literal native160 binding and clock/weak-only selection', () => {
  it('agrees with installed Phaser4.0 setters, pivot resets, numeric-zero trap and synchronous factory events', () => {
    expectTypeOf<Phaser.Scene>().toMatchTypeOf<LeviathanSpriteScene>(); expectTypeOf<Phaser.GameObjects.Image>().toMatchTypeOf<LeviathanSpriteImage>();
    expect(JSON.parse(leaf('package.json')).version).toBe('4.0.0');
    expect(leaf('src/textures/const.js')).toMatch(/NEAREST:\s*1/);
    expect(leaf('src/gameobjects/components/TextureCrop.js')).toContain('setFrame: function (frame, updateSize, updateOrigin)');
    expect(leaf('src/gameobjects/components/TextureCrop.js')).toContain('this.setOrigin(this.frame.pivotX, this.frame.pivotY)');
    expect(leaf('src/textures/Texture.js')).toContain('if (!name)');
    expect(leaf('src/gameobjects/image/ImageFactory.js')).toContain('return this.displayList.add(new Image(');
    expect(leaf('src/gameobjects/DisplayList.js')).toContain('this.events.emit(SceneEvents.ADDED_TO_SCENE');
  });
  it('exposes immutable8-slot descriptor without browser or runtime Phaser imports', () => {
    expect(typeof window).toBe('undefined'); expect(typeof document).toBe('undefined');
    expect(LEVIATHAN_BINDING).toEqual({ key: 'boss-leviathan', frames: NAMES });
    expect(LEVIATHAN_ASSET).toEqual({ key: 'boss-leviathan', frames: NAMES, image: 'game/leviathan.png', atlas: 'game/leviathan.json', frameWidth: 160, frameHeight: 160 });
    expect([LEVIATHAN_BINDING, LEVIATHAN_BINDING.frames, LEVIATHAN_ASSET].every(Object.isFrozen)).toBe(true);
    const h = harness(LEVIATHAN_BINDING), r = new LeviathanSpriteRenderer(h.scene, LEVIATHAN_BINDING);
    expect(leviathanSpriteResourcesReady(h.scene.textures, LEVIATHAN_BINDING)).toBe(true); expect(r.draw(BASE)).toBe(true);
    expect(h.images[0].frame).toBe('leviathan 0.aseprite'); r.destroy(); empty(h);
  });
  it.each(FRAME_CASES)('elapsed=%s weakUntil=%s selects literal slot%s', (elapsed, weak, expected) => {
    expect(leviathanSpriteFrameFor(elapsed, weak)).toBe(expected);
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()), data = freeze(input(elapsed, weak)), before = JSON.stringify(data);
    expect(r.draw(data)).toBe(true); expect(h.images[0].frame).toBe(String(expected)); nativeStyle(h.images[0]);
    expect(h.creations).toEqual([{ x: 2490, y: 449, key: 'unit-leviathan', frame: String(expected) }]);
    expect(h.calls.indexOf('filter')).toBeLessThan(h.calls.indexOf('add')); expect(JSON.stringify(data)).toBe(before); r.destroy(); empty(h);
  });
  it('rejects invalid times/deadlines instead of coercing, clamping or sampling another clock', () => {
    for (const value of [undefined, null, -1, NaN, Infinity, -Infinity, '100', false, {}, []]) {
      expect(leviathanSpriteFrameFor(value, 0)).toBeNull(); expect(leviathanSpriteFrameFor(0, value)).toBeNull();
    }
  });
  it('ignores recover/HP/phase/facing/floor/actor fields and cannot create timers or animation state', () => {
    const data = input(250, 0), reads: string[] = [];
    for (const key of ['action', 'phase', 'facing', 'maxHp', 'actionUntil', 'enteredAt']) trap(data.boss, key, reads);
    for (const key of ['floor', 'platforms']) trap(data.chapter, key, reads);
    for (const key of ['player', 'time', 'frame', 'toJSON']) trap(data, key, reads);
    trap(data.loom, 'nodes', reads); trap(data.loom.turn, 'until', reads); freeze(data);
    const h = harness(); for (const key of ['anims', 'time', 'tweens']) trap(h.scene, key, reads);
    const r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(data)).toBe(true);
    expect(h.images[0].frame).toBe('2'); expect(reads).toEqual([]); r.destroy(); empty(h);
  });
  it('pause reuses a frame, actual time crossings select frames and every draw restores native style', () => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(BASE)).toBe(true); const image = h.images[0];
    Object.assign(image, { origin: [1, 2], position: [8, 9], scale: 8, depth: -1, alpha: 0.2, rotation: 2, flipX: true, flipY: true, tint: true, visible: false });
    for (let i = 0; i < 4; i++) expect(r.draw(BASE)).toBe(true);
    nativeStyle(image); expect(image.frameChanges).toEqual([]);
    for (const [time, deadline, slot] of [[100, 0, '1'], [100, 1000, '5'], [200, 1000, '6'], [300, 1000, '7'], [400, 0, '0']] as const) {
      expect(r.draw(freeze(input(time, deadline)))).toBe(true); expect(image.frame).toBe(slot); nativeStyle(image);
    }
    expect(image.frameChanges).toEqual(['1', '5', '6', '7', '0']); expect(h.images).toHaveLength(1); expect(h.texture.current.filters).toEqual([1]); r.destroy(); empty(h);
  });
  it('inactive body is dim rather than hidden, and actual floating x/y are rounded without floor anchoring or flipping', () => {
    const data = input(100, 0); data.boss.active = false; data.boss.x = 120.75; data.boss.y = -40.25; Object.assign(data.boss, { facing: 1, action: 'recover' });
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(freeze(data))).toBe(true);
    expect(h.images[0].frame).toBe('1'); nativeStyle(h.images[0], 0.55, [121, -40]); r.destroy(); empty(h);
  });
});
function coreFixture() {
  const w = structuredClone(createWorld({ ...createRun('0badcafe-0000-4000-8000-000000000001', 42), stage: 4, checkpoint: 2, elapsedMs: 1000 }));
  // Pure setup fixture, not a claimed legal browser arrival or input playthrough.
  w.boss.active = true; w.boss.action = 'attack'; w.boss.actionUntil = 5000; enterLoomArena(w);
  Object.assign(w.player, { x: 2260, y: 509, grounded: true, standingOn: 'loom-arena-anchor', facing: -1, vx: -420, dashUntil: 2000 });
  w.loom!.turn.until = 5000; w.loom!.pullSpeed = 0; return w;
}
describe('actual Core geometry and weak deadline, using explicitly pure fixtures', () => {
  it('real R changes A520/176 to B508/160 but never moves the2490,448 Boss body or its144-square contact domain', () => {
    const w = coreFixture(), h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding());
    expect(w.loom!.nodes.find(n => n.id === 'loom-arena-anchor')).toMatchObject({ x: 2152, y: 520, w: 176, h: 12 });
    expect(r.draw(freeze(structuredClone(w)))).toBe(true); nativeStyle(h.images[0], 1, [2490, 448]);
    expect(tryLoomReroll(w, 1000)).toBe(true);
    expect(w.loom!.nodes.find(n => n.id === 'loom-arena-anchor')).toMatchObject({ x: 2160, y: 508, w: 160, h: 12 });
    expect(bossRect(w.boss)).toEqual({ x: 2418, y: 376, w: 144, h: 144 });
    expect(r.draw(freeze(structuredClone(w)))).toBe(true); nativeStyle(h.images[0], 1, [2490, 448]); expect(h.images).toHaveLength(1);
    w.boss.action = 'tell'; w.boss.actionUntil = 1000;
    w.loom!.swallow = { ids: ['loom-arena-left-outer', 'loom-arena-right-outer'], at: 1000 };
    w.boss = advanceLeviathan(w, 1000).boss;
    expect(worldPlatforms(w).some(p => p.x <= 2490 && p.x + p.w > 2490)).toBe(false);
    expect(r.draw(freeze(structuredClone(w)))).toBe(true); nativeStyle(h.images[0], 1, [2490, 448]); r.destroy(); empty(h);
  });
  it('only a real pressure-rule left-turn opens recover; phase transitions close it and death hides residual weakness', () => {
    const w = coreFixture(), h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding());
    w.boss.action = 'recover'; expect(r.draw(freeze(structuredClone(w)))).toBe(true); expect(h.images[0].frame).toBe('2');
    w.boss.action = 'attack'; applyLeviathanPressure(w, 1000, 0); expect(w.loom!.turn.startX).toBe(2260);
    w.player.x = 2225; w.save.elapsedMs = 1100; applyLeviathanPressure(w, 1100, 0);
    expect(w.loom!.turn.weakUntil).toBe(4300); expect(w.loom!.turn.successes).toBe(1); expect(w.boss.action).toBe('recover');
    expect(r.draw(freeze(structuredClone(w)))).toBe(true); expect(h.images[0].frame).toBe('7');
    const dead = structuredClone(w); dead.boss.hp = 0; releaseLeviathanPresentation(dead);
    expect(dead.loom!.turn.weakUntil).toBe(4300); expect(r.draw(freeze(dead))).toBe(false); empty(h);
    w.boss.hp = 280; w.boss = advanceLeviathan(w, 1100).boss;
    expect(w.boss).toMatchObject({ phase: 2, action: 'recover' }); expect(w.loom!.turn.weakUntil).toBe(0);
    expect(r.draw(freeze(structuredClone(w)))).toBe(true); expect(h.images[h.images.length - 1].frame).toBe('3');
    w.boss.hp = 140; w.boss = advanceLeviathan(w, 1100).boss;
    expect(w.boss.phase).toBe(3); expect(r.draw(freeze(structuredClone(w)))).toBe(true); expect(h.images[h.images.length - 1].frame).toBe('3'); r.destroy(); empty(h);
  });
});

const numericFields = ['x', 'y', 'cutX', 'cutY', 'width', 'height', 'cutWidth', 'cutHeight', 'realWidth', 'realHeight', 'sourceIndex'] as const;
const frameMutations: { name: string; mutate: (frame: Frame) => void }[] = [
  ...numericFields.map(key => ({ name: key, mutate: (f: Frame) => { f[key]++; } })),
  { name: 'name', mutate: f => { f.name = 'alias-wrong'; } },
  { name: 'texture', mutate: f => { f.texture = {}; } },
  { name: 'source', mutate: f => { f.source = { ...f.source }; } },
  { name: 'trimmed', mutate: f => { f.trimmed = true; } }, { name: 'rotated', mutate: f => { f.rotated = true; } },
];
function rejectsMutation(mutate: (h: Harness) => void, label: string) {
  const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(BASE), label + ' baseline').toBe(true);
  mutate(h); expect(leviathanSpriteResourcesReady(h.scene.textures, binding()), label + ' gate').toBe(false);
  expect(r.draw(BASE), label + ' draw').toBe(false); expect(h.images).toHaveLength(1); expect(h.images[0].destroyed).toBe(1);
  empty(h); r.destroy(); expect(h.images[0].destroyed).toBe(1);
}
describe('complete8-slot validation and borrowed source provenance', () => {
  it('ready is read-only and accepts numeric binding0 only after string normalization, with extra frames allowed', () => {
    const b = binding(); b.frames[0] = 0; const h = harness(b);
    h.texture.current.frames.set('extra', h.frame(7));
    expect(leviathanSpriteResourcesReady(h.scene.textures, b)).toBe(true); expect(h.images).toEqual([]); expect(h.texture.current.filters).toEqual([]);
    expect(h.calls).toContain('get-frame:0'); expect(h.calls).not.toContain('filter'); expect(h.calls).not.toContain('add');
    const r = new LeviathanSpriteRenderer(h.scene, b); expect(r.draw(BASE)).toBe(true); expect(h.creations[0].frame).toBe('0'); r.destroy(); empty(h);
  });
  it.each(SLOTS)('required slot%i rejects missing/malformed fields and every throwing frame getter, even while closed0 is selected', slot => {
    rejectsMutation(h => { h.texture.current.frames.delete(String(slot)); }, 'slot' + slot + ' missing');
    for (const field of frameMutations) rejectsMutation(h => field.mutate(h.frame(slot)), 'slot' + slot + '/' + field.name);
    for (const key of [...numericFields, 'name', 'texture', 'source', 'trimmed', 'rotated']) {
      rejectsMutation(h => { trap(h.frame(slot), key, []); }, 'slot' + slot + '/getter:' + key);
    }
  });
  it('requires explicit false trim/rotation and exact finite numeric native dimensions', () => {
    for (const key of ['trimmed', 'rotated']) for (const value of [undefined, null, 0, 'false']) {
      rejectsMutation(h => { Reflect.set(h.frame(7), key, value); }, key + '/' + String(value));
    }
    for (const value of [undefined, null, '160', NaN, Infinity, -1, 160.5]) {
      rejectsMutation(h => { Reflect.set(h.frame(7), 'cutWidth', value); }, 'cutWidth/' + String(value));
    }
  });
  it('rejects aliased frame objects despite dynamic name/cut getters that would otherwise match each slot', () => {
    const h = harness(), f = h.frame(0); let selected = '0';
    Object.defineProperty(f, 'name', { get: () => selected }); Object.defineProperty(f, 'cutX', { get: () => Number(selected) * 160 });
    h.texture.current.get = name => { selected = name; return f; };
    expect(leviathanSpriteResourcesReady(h.scene.textures, binding())).toBe(false); expect(h.images).toEqual([]);
  });
  it('accepts native image dimensions independent of CSS size and supports canvas/ImageBitmap-like dimensions', () => {
    for (const image of [{ naturalWidth: 1280, naturalHeight: 160, width: 1, height: 2 }, { width: 1280, height: 160 }]) {
      const h = harness(); h.texture.current.source[0].image = image;
      expect(leviathanSpriteResourcesReady(h.scene.textures, binding())).toBe(true); expect(h.texture.current.filters).toEqual([]);
    }
  });
  it('rejects wrong/missing/native-vs-CSS image sizes, source dimensions, source-list shapes and getter exceptions', () => {
    const invalidImages: unknown[] = [null, [], {}, { width: 1279, height: 160 }, { width: 1280, height: 159 },
      { naturalWidth: 0, naturalHeight: 0, width: 1280, height: 160 }, { naturalWidth: 1280, height: 160 },
      { naturalWidth: '1280', naturalHeight: 160 }, { naturalWidth: 1280, naturalHeight: 159, width: 1280, height: 160 }];
    for (const image of invalidImages) rejectsMutation(h => { Reflect.set(h.texture.current.source[0], 'image', image); }, 'native image');
    for (const key of ['width', 'height'] as const) rejectsMutation(h => { h.texture.current.source[0][key]++; }, 'source ' + key);
    for (const shape of [null, {}, [], [null], [{ width: 1280, height: 160 }]]) {
      rejectsMutation(h => { Reflect.set(h.texture.current, 'source', shape); }, 'source list');
    }
    rejectsMutation(h => { h.texture.current.source.push(h.texture.current.source[0]); }, 'multiple sources');
    for (const key of ['width', 'height', 'image', 'source']) rejectsMutation(h => { trap(h.texture.current.source[0], key, []); }, 'source getter ' + key);
    for (const key of ['naturalWidth', 'naturalHeight']) rejectsMutation(h => { trap(h.texture.current.source[0].image, key, []); }, 'image getter ' + key);
  });
  it('copies binding values and rejects invalid8-slot descriptors without source writes or image allocation', () => {
    const b = binding(), h = harness(b), r = new LeviathanSpriteRenderer(h.scene, b);
    b.key = 'changed'; b.frames[0] = 'changed'; b.frames.pop(); expect(r.draw(BASE)).toBe(true); expect(h.images[0].frame).toBe('0'); r.destroy(); empty(h);
    const sparse: string[] = ['0']; sparse.length = 8;
    const invalid: unknown[] = [null, undefined, [], {}, { ...binding(), key: ' ' }, { ...binding(), key: 1 },
      { ...binding(), frames: SLOTS.slice(0, 7) }, { ...binding(), frames: [...SLOTS, 8] }, { ...binding(), frames: sparse },
      { ...binding(), frames: { length: 8 } }, { ...binding(), frames: ['0', 0, '2', '3', '4', '5', '6', '7'] }];
    for (const value of [undefined, null, {}, [], '', ' ', false, -1, NaN, Infinity, 0.5]) {
      const bad = binding(); Reflect.set(bad.frames, '7', value); invalid.push(bad);
    }
    for (const value of invalid) {
      const candidate = harness(), renderer = new LeviathanSpriteRenderer(candidate.scene, value);
      expect(leviathanSpriteResourcesReady(candidate.scene.textures, value)).toBe(false);
      expect(renderer.draw(BASE)).toBe(false); expect(candidate.images).toEqual([]); expect(candidate.texture.current.filters).toEqual([]); renderer.destroy();
    }
    for (const key of ['key', 'frames']) { const bad = binding(); trap(bad, key, []); expect(leviathanSpriteResourcesReady(h.scene.textures, bad)).toBe(false); }
    const bad = binding(); trap(bad.frames, '7', []); expect(leviathanSpriteResourcesReady(h.scene.textures, bad)).toBe(false);
  });
  it.each(['texture', 'source-array', 'source', 'image', 'source-source', 'frame'])('valid %s replacement rebuilds only owned image without destroying borrowed resources', kind => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(BASE)).toBe(true); const old = h.images[0];
    if (kind === 'texture') h.texture.current = h.makeTexture();
    else if (kind === 'source-array') h.texture.current.source = [...h.texture.current.source];
    else if (kind === 'source') {
      const next = { ...h.texture.current.source[0] }; h.texture.current.source = [next]; for (const f of h.texture.current.frames.values()) f.source = next;
    } else if (kind === 'image') h.texture.current.source[0].image = { width: 1280, height: 160 };
    else if (kind === 'source-source') h.texture.current.source[0].source = {};
    else h.texture.current.frames.set('7', { ...h.frame(7) });
    expect(r.draw(BASE)).toBe(true); expect(old.destroyed).toBe(1); expect(h.images).toHaveLength(2); nativeStyle(h.images[1]); r.destroy(); empty(h);
  });
});

const invalidWorlds: { name: string; change: (w: ReturnType<typeof input>) => void }[] = [
  { name: 'stage', change: w => { w.chapter.stage = 3; } }, { name: 'kind', change: w => { Reflect.set(w.boss, 'kind', 'basilisk'); } },
  { name: 'no loom', change: w => { Reflect.set(w, 'loom', null); } }, { name: 'no turn', change: w => { Reflect.set(w.loom, 'turn', null); } },
  { name: 'dead', change: w => { w.boss.hp = 0; } }, { name: 'negative HP', change: w => { w.boss.hp = -1; } },
  { name: 'NaN HP', change: w => { w.boss.hp = NaN; } }, { name: 'infinite x', change: w => { w.boss.x = Infinity; } },
  { name: 'string y', change: w => { Reflect.set(w.boss, 'y', '448'); } }, { name: 'nonboolean active', change: w => { Reflect.set(w.boss, 'active', 1); } },
  { name: 'empty run', change: w => { w.save.runId = ' '; } }, { name: 'numeric run', change: w => { Reflect.set(w.save, 'runId', 1); } },
  { name: 'negative clock', change: w => { w.save.elapsedMs = -1; } }, { name: 'NaN weak', change: w => { w.loom.turn.weakUntil = NaN; } },
];
describe('ownership, exceptions and terminal disposal', () => {
  it.each(invalidWorlds)('$name removes an existing body, including when future weakness remains', ({ change }) => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(BASE)).toBe(true);
    const data = input(200, 10000); change(data); freeze(data); expect(r.draw(data)).toBe(false); empty(h); expect(h.images[0].destroyed).toBe(1);
    r.destroy(); expect(h.images[0].destroyed).toBe(1);
  });
  it('death is checked before residual weak getters and a new run/stage has no stale image', () => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(BASE)).toBe(true);
    const dead = input(200, 10000), reads: string[] = []; dead.boss.hp = 0; trap(dead.loom.turn, 'weakUntil', reads); freeze(dead);
    expect(r.draw(dead)).toBe(false); expect(reads).toEqual([]); empty(h);
    const run = input(); run.save.runId = 'run-b'; expect(r.draw(freeze(run))).toBe(true); expect(h.images).toHaveLength(2);
    const exit = input(); exit.chapter.stage = 5; expect(r.draw(freeze(exit))).toBe(false); empty(h);
    expect(r.draw(BASE)).toBe(true); expect(h.images).toHaveLength(3); r.destroy(); empty(h);
  });
  it.each(['exists', 'get-texture', 'has', 'get-frame', 'filter', 'add'])('%s exception releases owned resources and never destroys the source', failure => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(BASE)).toBe(true);
    h.state.failure = failure;
    // Filter/factory only run on replacement, so force an actual new resource transaction.
    if (failure === 'filter' || failure === 'add') h.texture.current.source[0].image = { width: 1280, height: 160 };
    expect(r.draw(BASE)).toBe(false); empty(h); expect(h.images[0].destroyed).toBe(1);
    h.state.failure = ''; expect(r.draw(BASE)).toBe(true); r.destroy(); empty(h);
  });
  it.each(['origin', 'scale', 'depth', 'alpha', 'rotation', 'flipX', 'flipY', 'tint', 'position', 'visible'])('first image %s setter failure is owned before setup and cannot leak partial creation', operation => {
    const h = harness(); h.state.imageFailure = operation;
    const r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(BASE)).toBe(false); expect(h.images).toHaveLength(1); expect(h.images[0].destroyed).toBe(1); empty(h);
    r.destroy(); expect(h.images[0].destroyed).toBe(1);
  });
  it('setFrame failure releases the prior image; cleanup failures do not double-destroy or retain it', () => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(BASE)).toBe(true);
    h.state.imageFailure = 'frame'; expect(r.draw(freeze(input(100, 0)))).toBe(false); empty(h); expect(h.images[0].destroyed).toBe(1);
    h.state.imageFailure = ''; expect(r.draw(BASE)).toBe(true); h.state.imageFailure = 'destroy'; expect(() => r.destroy()).not.toThrow(); empty(h);
    r.destroy(); expect(h.images.map(i => i.destroyed)).toEqual([1, 1]);
  });
  it('throwing world getters cannot leave a live body and disposed draw never reads even those getters', () => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(BASE)).toBe(true);
    const data = input(), reads: string[] = []; trap(data, 'save', reads); freeze(data);
    expect(r.draw(data)).toBe(false); expect(reads).toEqual(['save']); empty(h); r.destroy();
    expect(r.draw(data)).toBe(false); expect(reads).toEqual(['save']); expect(h.images).toHaveLength(1);
  });
  it('nested draw during native factory or setter execution cannot clear or duplicate the active transaction', () => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); let nested = 0;
    h.state.hook = op => { if (op === 'addedtoscene' || op === 'origin') { nested++; expect(r.draw(BASE)).toBe(false); } };
    expect(r.draw(BASE)).toBe(true); expect(nested).toBe(2); expect(h.images).toHaveLength(1); nativeStyle(h.images[0]);
    h.state.hook = null; r.destroy(); empty(h);
  });
  it('destroy during native addedtoscene before factory return is terminal and releases the returned image', () => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding());
    h.state.hook = op => { if (op === 'addedtoscene') { h.state.hook = null; r.destroy(); } };
    const drawn = r.draw(BASE); r.destroy();
    expect({ drawn, live: h.images.filter(i => i.alive).length, destroyed: h.images.map(i => i.destroyed) })
      .toEqual({ drawn: false, live: 0, destroyed: [1] });
    expect(r.draw(BASE)).toBe(false); expect(h.images).toHaveLength(1); empty(h);
  });
  it('destroy during an owned setter cannot be reported as a successful replacement body', () => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding());
    h.state.hook = op => { if (op === 'origin') { h.state.hook = null; r.destroy(); } };
    const drawn = r.draw(BASE); r.destroy();
    expect({ drawn, live: h.images.filter(i => i.alive).length, destroyed: h.images.map(i => i.destroyed) })
      .toEqual({ drawn: false, live: 0, destroyed: [1] });
    empty(h);
  });
  it('explicit destroy is idempotent even when image destruction synchronously attempts a draw', () => {
    const h = harness(), r = new LeviathanSpriteRenderer(h.scene, binding()); expect(r.draw(BASE)).toBe(true); let calls = 0;
    h.state.hook = op => { if (op === 'destroy') { calls++; expect(r.draw(BASE)).toBe(false); } };
    r.destroy(); r.destroy(); expect(calls).toBe(1); expect(h.images[0].destroyed).toBe(1); expect(r.draw(BASE)).toBe(false); expect(h.images).toHaveLength(1); empty(h);
  });
});
