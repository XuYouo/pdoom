import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASILISK_SPRITE_ACTIONS, BasiliskSpriteRenderer, basiliskSpriteFrameFor, basiliskSpriteResourcesReady,
  type BasiliskSpriteImage, type BasiliskSpriteScene, type BasiliskSpriteTexture, type BasiliskSpriteWorld, type BasiliskTextureFrame } from '../../src/pages/GamePage/game/systems/BasiliskSpriteRenderer';
import { BASILISK_ASSET, BASILISK_BINDING } from '../../src/pages/GamePage/game/data/basiliskAssets';

// Independent adapter/DTO contract tests, not PNG/ASE validation or native gameplay.
// The mode/action oracle below is literal: never derive expectations from the helper under test.
type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type Media = { width: number; height: number; image: object; source: object };
type Frame = Mutable<Omit<BasiliskTextureFrame, 'source'>> & { source: Media };
type BossView = BasiliskSpriteWorld['boss'];
const slots = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const modes = [[false, 'idle', 0], [false, 'tell', 1], [false, 'attack', 2], [false, 'recover', 3],
  [true, 'idle', 4], [true, 'tell', 5], [true, 'attack', 6], [true, 'recover', 7]] as const;
const binding = () => ({ key: 'isolated-basilisk', frames: slots.map(String) as (string | number)[] });
const boss = (patch: Partial<BossView> = {}): BossView => Object.freeze({ kind: 'basilisk', action: 'idle', hp: 540, x: 2890.49, y: 280.51, facing: -1, ...patch });
const world = (patch: Partial<BasiliskSpriteWorld> = {}): BasiliskSpriteWorld => Object.freeze({
  save: Object.freeze({ runId: 'attempt-a' }), chapter: Object.freeze({ stage: 3 }), furnace: Object.freeze({ enraged: false }), boss: boss(), ...patch,
});
function trap(target: object, key: string, reads: string[], label = key) {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, get() { reads.push(label); throw new Error(`Forbidden read: ${label}`); } });
}

class ImagePort implements BasiliskSpriteImage {
  origin = [3, 7]; position = [-9, -9]; scale = 8; depth = 99; alpha = 0.2; rotation = 2; flip = true;
  live = true; destroyed = 0; changes: string[] = []; failure = ''; throwDestroy = false;
  constructor(public frame: string, failure = '') { this.failure = failure; }
  private set(name: string) { this.changes.push(name); if (this.failure === name) throw new Error(`image-${name}`); }
  setFrame(value: string) { this.set('frame'); this.frame = value; this.origin = [0, 0]; }
  setDisplayOrigin(x: number, y: number) { this.set('origin'); this.origin = [x, y]; }
  setPosition(x: number, y: number) { this.set('position'); this.position = [x, y]; }
  setScale(value: number) { this.set('scale'); this.scale = value; }
  setDepth(value: number) { this.set('depth'); this.depth = value; }
  setAlpha(value: number) { this.set('alpha'); this.alpha = value; }
  setRotation(value: number) { this.set('rotation'); this.rotation = value; }
  setFlipX(value: boolean) { this.set('flip'); this.flip = value; }
  destroy() { this.destroyed++; this.live = false; if (this.throwDestroy) throw new Error('image-destroy'); }
}
function harness(names: readonly string[] = slots.map(String), key = 'isolated-basilisk') {
  const source: Media = { width: 768, height: 96, image: {}, source: {} };
  const frames = new Map<string, Frame>(names.map((name, index) => [name, {
    cutX: index * 96, cutY: 0, cutWidth: 96, cutHeight: 96, x: 0, y: 0, width: 96, height: 96,
    realWidth: 96, realHeight: 96, trimmed: false, rotated: false, source,
  }]));
  const images: ImagePort[] = [], filters: number[] = [], calls: string[] = [];
  const additions: { x: number; y: number; key: string; frame: string }[] = [];
  const shared: { destroyed: number }[] = [];
  const state = { present: true, failure: '', onlyFrame: null as string | null, nextImageFailure: '' };
  const step = (operation: string, frame?: string) => {
    calls.push(frame === undefined ? operation : `${operation}:${frame}`);
    if (state.failure === operation && (state.onlyFrame === null || state.onlyFrame === frame)) throw new Error(operation);
  };
  const makeTexture = () => {
    const value: BasiliskSpriteTexture & { destroyed: number; destroy(): void } = {
      has: name => { step('has', name); return typeof name === 'string' && frames.has(name); },
      get: name => { step('get-frame', name); if (typeof name !== 'string') throw new Error('Numeric frame0 would mean Phaser firstFrame'); return frames.get(name); },
      setFilter: value => { step('filter'); filters.push(value); },
      destroyed: 0, destroy() { this.destroyed++; },
    };
    shared.push(value); return value;
  };
  const texture = { current: makeTexture() };
  const scene: BasiliskSpriteScene = {
    textures: {
      exists: name => { step('exists'); return state.present && name === key; },
      get: name => { step('get-texture'); if (name !== key) throw new Error('Unexpected texture key'); return texture.current; },
    },
    add: { image: (x, y, textureKey, frame) => {
      step('add'); additions.push({ x, y, key: textureKey, frame });
      const value = new ImagePort(frame, state.nextImageFailure); images.push(value); return value;
    } },
  };
  return { scene, frames, source, images, filters, calls, additions, state, texture, makeTexture, shared };
}
type Harness = ReturnType<typeof harness>;
function sharedUntouched(h: Harness) { expect(h.shared.every(texture => texture.destroyed === 0)).toBe(true); }
function empty(h: Harness) { expect(h.images.filter(image => image.live)).toHaveLength(0); sharedUntouched(h); }
function nativeTransform(image: ImagePort, flip = false, position = [2890, 281]) {
  expect(image.origin).toEqual([48, 48]); expect(image.position).toEqual(position);
  expect([image.scale, image.depth, image.alpha, image.rotation, image.flip]).toEqual([1, 2, 1, 0, flip]);
}
function rejectResourceMutation(mutate: (h: Harness) => void) {
  const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding());
  expect(renderer.draw(world())).toBe(true); const owned = h.images[0];
  mutate(h);
  expect(basiliskSpriteResourcesReady(h.scene.textures, binding())).toBe(false);
  expect(renderer.draw(world())).toBe(false); expect(owned.destroyed).toBe(1); expect(h.images).toHaveLength(1);
  empty(h); renderer.destroy(); expect(owned.destroyed).toBe(1); sharedUntouched(h);
}

describe('Basilisk mode/action-only immutable view', () => {
  it('imports without browser/runtime Phaser and exposes the frozen native descriptor', () => {
    expect(typeof window).toBe('undefined'); expect(typeof document).toBe('undefined');
    expect(BASILISK_SPRITE_ACTIONS).toEqual(['idle', 'tell', 'attack', 'recover']); expect(Object.isFrozen(BASILISK_SPRITE_ACTIONS)).toBe(true);
    expect(BASILISK_BINDING).toEqual({ key: 'basilisk', frames: slots.map(i => `basilisk ${i}.aseprite`) });
    expect(BASILISK_ASSET).toMatchObject({ key: 'basilisk', image: 'game/basilisk.png', atlas: 'game/basilisk.json', frameWidth: 96, frameHeight: 96 });
    expect(BASILISK_ASSET.frames).toBe(BASILISK_BINDING.frames);
    expect([BASILISK_BINDING, BASILISK_BINDING.frames, BASILISK_ASSET].every(Object.isFrozen)).toBe(true);
    const h = harness(BASILISK_BINDING.frames.map(String), BASILISK_BINDING.key);
    expect(basiliskSpriteResourcesReady(h.scene.textures, BASILISK_BINDING)).toBe(true);
    const renderer = new BasiliskSpriteRenderer(h.scene, BASILISK_BINDING); expect(renderer.draw(world())).toBe(true);
    expect(h.images[0].frame).toBe('basilisk 0.aseprite'); renderer.destroy(); empty(h);
  });
  it.each(modes)('mode=%s actual action=%s selects only native slot%i', (enraged, action, slot) => {
    expect(basiliskSpriteFrameFor(enraged, action)).toBe(slot);
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding());
    const input = world({ furnace: Object.freeze({ enraged }), boss: boss({ action }) });
    expect(renderer.draw(input)).toBe(true); expect(h.images[0].frame).toBe(String(slot)); nativeTransform(h.images[0]);
    expect(h.additions).toEqual([{ x: 2890, y: 281, key: 'isolated-basilisk', frame: String(slot) }]);
    expect(h.calls.indexOf('filter')).toBeLessThan(h.calls.indexOf('add')); renderer.destroy(); empty(h);
  });
  it.each([null, undefined, 0, 1, 'false', 'true', {}, [], NaN].map(value => [value] as const))('rejects nonboolean furnace mode %j', mode => expect(basiliskSpriteFrameFor(mode, 'idle')).toBeNull());
  it.each([null, undefined, 0, 'seek', 'consume', 'IDLE', 'tell ', {}, []].map(value => [value] as const))('rejects invented action %j', action => {
    expect(basiliskSpriteFrameFor(false, action)).toBeNull(); expect(basiliskSpriteFrameFor(true, action)).toBeNull();
  });
  it.each(modes)('never reads phase/active/clocks/player/donation for mode=%s action=%s slot%i', (enraged, action, slot) => {
    const reads: string[] = [], b = { ...boss({ action }) }, save = { runId: 'attempt-a' }, furnace = { enraged }, player = {};
    for (const key of ['phase', 'active', 'maxHp', 'actionUntil', 'phaseUntil']) trap(b, key, reads, `boss.${key}`);
    for (const key of ['elapsedMs', 'donated', 'stage', 'checkpoint']) trap(save, key, reads, `save.${key}`);
    for (const key of ['startedAt', 'laser', 'phase']) trap(furnace, key, reads, `furnace.${key}`);
    trap(player, 'x', reads, 'player.x'); trap(player, 'y', reads, 'player.y'); Object.freeze(player);
    const input = { save: Object.freeze(save), chapter: Object.freeze({ stage: 3 }), furnace: Object.freeze(furnace), boss: Object.freeze(b), player };
    trap(input, 'player', reads, 'world.player'); trap(input, 'time', reads); Object.freeze(input);
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding());
    for (let i = 0; i < 5; i++) expect(renderer.draw(input)).toBe(true);
    expect(reads).toEqual([]); expect(h.images).toHaveLength(1); expect(h.images[0].frame).toBe(String(slot)); expect(h.filters).toEqual([1]);
    renderer.destroy(); empty(h);
  });
  it.each([false, true])('draws an explicitly inactive idle body in actual mode=%s', enraged => {
    const input = world({ furnace: Object.freeze({ enraged }), boss: Object.freeze({ ...boss(), active: false, phase: 3 }) });
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding());
    expect(renderer.draw(input)).toBe(true); expect(h.images[0].frame).toBe(enraged ? '4' : '0'); renderer.destroy(); empty(h);
  });
  it.each([0.1, 1, 100, 540, 9999])('HP%j is only an alive gate, never a phase/action selector', hp => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding());
    expect(renderer.draw(world({ boss: boss({ hp, action: 'recover' }) }))).toBe(true); expect(h.images[0].frame).toBe('3'); renderer.destroy(); empty(h);
  });
  it.each([-1, 1] as const)('uses locked boss.facing=%i even when the player position disagrees', facing => {
    const input = Object.freeze({ ...world({ boss: boss({ facing }) }), player: Object.freeze({ x: facing === 1 ? -1000 : 9999 }) });
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(input)).toBe(true);
    nativeTransform(h.images[0], facing === 1); renderer.destroy(); empty(h);
  });
  it('reuses one image and reasserts all native transforms even without changing its frame', () => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true); const image = h.images[0];
    image.origin = [0, 0]; image.position = [4, 9]; image.scale = 7; image.depth = -90; image.alpha = 0.1; image.rotation = 9; image.flip = true;
    for (let i = 0; i < 5; i++) expect(renderer.draw(world())).toBe(true);
    expect(h.images).toHaveLength(1); nativeTransform(image); expect(image.changes.filter(value => value === 'frame')).toHaveLength(0);
    for (const [enraged, action, slot] of modes) {
      expect(renderer.draw(world({ furnace: Object.freeze({ enraged }), boss: boss({ action, facing: 1 }) }))).toBe(true);
      expect(image.frame).toBe(String(slot)); nativeTransform(image, true);
    }
    expect(h.images).toHaveLength(1); expect(h.filters).toEqual([1]); renderer.destroy(); empty(h);
  });
  it('checks installed Phaser4.0 filter constants independently of the port expectation', () => {
    const text = readFileSync(new URL('../../node_modules/phaser/src/textures/const.js', import.meta.url), 'utf8');
    const nearest = Number(text.match(/^\s*NEAREST:\s*(\d+)/m)?.[1]);
    const linear = Number(text.match(/^\s*LINEAR:\s*(\d+)/m)?.[1]);
    expect([linear, nearest]).toEqual([0, 1]);
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true);
    expect(h.filters).toEqual([nearest]); renderer.destroy(); empty(h);
  });
});

const sparseTail: (string | number)[] = slots.slice(0, 7).map(String); sparseTail.length = 8;
const badBindings: { name: string; value: unknown }[] = [
  { name: 'null', value: null }, { name: 'undefined', value: undefined }, { name: 'primitive', value: 'isolated-basilisk' }, { name: 'array root', value: [] },
  { name: 'empty key', value: { ...binding(), key: '' } }, { name: 'blank key', value: { ...binding(), key: '  ' } }, { name: 'numeric key', value: { ...binding(), key: 0 } },
  { name: 'missing frames', value: { key: 'isolated-basilisk' } }, { name: 'seven frames', value: { ...binding(), frames: slots.slice(0, 7) } },
  { name: 'nine frames', value: { ...binding(), frames: [...slots, 8] } }, { name: 'array-like frames', value: { ...binding(), frames: { length: 8, 0: '0' } } },
  { name: 'fully sparse frames', value: { ...binding(), frames: new Array(8) } },
  { name: 'trailing hole', value: { ...binding(), frames: sparseTail } },
  { name: 'duplicate strings', value: { ...binding(), frames: ['0', '1', '2', '3', '4', '5', '6', '0'] } },
  { name: 'numeric-string alias', value: { ...binding(), frames: [0, '0', 2, 3, 4, 5, 6, 7] } },
  ...[undefined, null, '', ' ', NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, {}, [], false, 0n].map((value, i) => ({ name: `invalid tail id ${i}`, value: { ...binding(), frames: ['0', '1', '2', '3', '4', '5', '6', value] } })),
];
describe('Basilisk complete binding and resource guard', () => {
  it.each(badBindings)('rejects $name before any texture/image/filter activity', ({ value }) => {
    const h = harness(); expect(basiliskSpriteResourcesReady(h.scene.textures, value)).toBe(false);
    const renderer = new BasiliskSpriteRenderer(h.scene, value); expect(renderer.draw(world())).toBe(false);
    expect(h.calls).toEqual([]); expect(h.images).toEqual([]); expect(h.filters).toEqual([]); renderer.destroy(); sharedUntouched(h);
  });
  it.each(['key', 'frames', 'iterator', 'tail', 'length'])('catches a throwing binding %s without allocation', field => {
    const h = harness(), value = binding();
    if (field === 'length') value.frames = new Proxy(value.frames, { get(target, key, receiver) { if (key === 'length') throw new Error('length'); return Reflect.get(target, key, receiver); } });
    else if (field === 'iterator') Object.defineProperty(value.frames, Symbol.iterator, { get() { throw new Error('iterator'); } });
    else if (field === 'tail') Object.defineProperty(value.frames, '7', { get() { throw new Error('tail'); } });
    else Object.defineProperty(value, field, { get() { throw new Error(field); } });
    expect(basiliskSpriteResourcesReady(h.scene.textures, value)).toBe(false);
    const renderer = new BasiliskSpriteRenderer(h.scene, value); expect(renderer.draw(world())).toBe(false);
    expect(h.calls).toEqual([]); expect(h.images).toEqual([]); renderer.destroy(); sharedUntouched(h);
  });
  it('normalizes numeric0 through7 to real named string frames, never a numeric base-frame alias', () => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, { ...binding(), frames: slots });
    expect(renderer.draw(world())).toBe(true); expect(h.images[0].frame).toBe('0');
    expect(h.calls.filter(call => call.startsWith('get-frame:'))).toEqual(slots.map(i => `get-frame:${i}`));
    expect(h.additions[0].frame).toBe('0'); renderer.destroy(); empty(h);
  });
  it('snapshots mutable caller configuration instead of rereading it on draw', () => {
    const h = harness(), value = binding(), renderer = new BasiliskSpriteRenderer(h.scene, value);
    value.key = 'corrupted'; value.frames[0] = 'missing'; value.frames.pop();
    expect(renderer.draw(world())).toBe(true); expect(h.additions[0]).toMatchObject({ key: 'isolated-basilisk', frame: '0' }); renderer.destroy(); empty(h);
  });
  it('checks every unused slot and has no allocation/filter/texture-destruction side effects', () => {
    const h = harness(); h.state.failure = 'filter';
    expect(basiliskSpriteResourcesReady(h.scene.textures, binding())).toBe(true);
    expect(h.calls.filter(call => call.startsWith('has:'))).toEqual(slots.map(i => `has:${i}`));
    expect(h.calls.filter(call => call.startsWith('get-frame:'))).toEqual(slots.map(i => `get-frame:${i}`));
    expect(h.filters).toEqual([]); expect(h.additions).toEqual([]); expect(h.images).toEqual([]); sharedUntouched(h);
  });
  it('a missing/returning shared texture clears the body and recovers without destroying the texture', () => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true);
    h.state.present = false; expect(basiliskSpriteResourcesReady(h.scene.textures, binding())).toBe(false); expect(renderer.draw(world())).toBe(false);
    expect(h.images[0].destroyed).toBe(1); empty(h);
    h.state.present = true; expect(renderer.draw(world())).toBe(true); expect(h.images).toHaveLength(2); renderer.destroy(); empty(h);
  });
});

const geometry = [
  ...['cutX', 'cutY', 'x', 'y', 'cutWidth', 'cutHeight', 'width', 'height', 'realWidth', 'realHeight', 'trimmed', 'rotated', 'source.width', 'source.height'].flatMap(field => slots.map(index => ({
    field, index,
    good: field === 'cutX' ? index * 96 : ['cutY', 'x', 'y'].includes(field) ? 0 : ['trimmed', 'rotated'].includes(field) ? false : field === 'source.width' ? 768 : 96,
  }))),
];
function location(h: Harness, index: number, field: string): { object: object; key: string } {
  const frame = h.frames.get(String(index))!;
  if (field.startsWith('source.')) { frame.source = { ...frame.source }; return { object: frame.source, key: field.slice(7) }; }
  return { object: frame, key: field };
}
describe('all eight full96px rectangles including the unused tail', () => {
  it.each(geometry)('rejects invalid values for $field on slot$index, releasing any old body', ({ field, index, good }) => {
    const invalid: unknown[] = typeof good === 'number' ? [good + 1, good - 0.25, -1, NaN, Infinity, -Infinity, null, undefined, String(good), true] : [true, 0, 'false', undefined, null];
    for (const value of invalid) rejectResourceMutation(h => { const place = location(h, index, field); Object.defineProperty(place.object, place.key, { value }); });
  });
  it.each(geometry)('rejects missing $field on slot$index in helper and renderer', ({ field, index }) => {
    rejectResourceMutation(h => { const place = location(h, index, field); Reflect.deleteProperty(place.object, place.key); });
  });
  it.each(geometry)('contains throwing $field on slot$index in helper and renderer', ({ field, index }) => {
    rejectResourceMutation(h => { const place = location(h, index, field); Object.defineProperty(place.object, place.key, { get() { throw new Error(`${field}/${index}`); } }); });
  });
  it.each(slots.flatMap(index => ['missing-name', 'undefined-frame', 'null-frame', 'missing-source', 'null-source', 'throw-source', 'throw-image', 'throw-media'].map(fault => ({ index, fault }))))('rejects $fault even on unused slot$index', ({ index, fault }) => {
    rejectResourceMutation(h => {
      const name = String(index), frame = h.frames.get(name)!;
      if (fault === 'missing-name') h.frames.delete(name);
      else if (fault === 'undefined-frame') h.frames.set(name, undefined as unknown as Frame);
      else if (fault === 'null-frame') h.frames.set(name, null as unknown as Frame);
      else if (fault === 'missing-source') Reflect.deleteProperty(frame, 'source');
      else if (fault === 'null-source') Object.defineProperty(frame, 'source', { value: null });
      else if (fault === 'throw-source') Object.defineProperty(frame, 'source', { get() { throw new Error('source'); } });
      else {
        frame.source = { ...frame.source };
        Object.defineProperty(frame.source, fault === 'throw-image' ? 'image' : 'source', { get() { throw new Error(fault); } });
      }
    });
  });
  it('repairs a previously invalid unused tail without carrying a stale current frame', () => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true);
    const tail = h.frames.get('7')!; tail.cutX = 0; expect(renderer.draw(world())).toBe(false); empty(h);
    tail.cutX = 672; expect(basiliskSpriteResourcesReady(h.scene.textures, binding())).toBe(true); expect(renderer.draw(world())).toBe(true);
    expect(h.images).toHaveLength(2); expect(h.images[0].destroyed).toBe(1); renderer.destroy(); empty(h);
  });
  it.each(['exists', 'get-texture', 'has', 'get-frame'])('contains %s errors in the pure helper and an already-live renderer', failure => {
    rejectResourceMutation(h => { h.state.failure = failure; if (failure === 'has' || failure === 'get-frame') h.state.onlyFrame = '7'; });
  });
});

describe('Basilisk resource identity, ownership and failure recovery', () => {
  it.each([0, 7].flatMap(index => ['texture', 'frame', 'source', 'image', 'media'].map(identity => ({ index, identity }))))('rebuilds on $identity identity change at slot$index, including unused-tail media', ({ index, identity }) => {
    const h = harness(), name = String(index), firstFrame = h.frames.get(name)!;
    // Isolate this slot's source BEFORE the first draw; media replacement must be
    // detected even when the frame and source objects themselves remain identical.
    firstFrame.source = { ...firstFrame.source };
    const renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true); const old = h.images[0];
    if (identity === 'texture') h.texture.current = h.makeTexture();
    else if (identity === 'frame') h.frames.set(name, { ...firstFrame });
    else if (identity === 'source') firstFrame.source = { ...firstFrame.source };
    else if (identity === 'image') firstFrame.source.image = {};
    else firstFrame.source.source = {};
    expect(renderer.draw(world())).toBe(true); expect(old.destroyed).toBe(1); expect(h.images).toHaveLength(2);
    expect(h.images[1]).not.toBe(old); expect(h.images[1].frame).toBe('0'); nativeTransform(h.images[1]); expect(h.filters).toEqual([1, 1]);
    expect(renderer.draw(world())).toBe(true); expect(h.images).toHaveLength(2); expect(h.filters).toEqual([1, 1]);
    renderer.destroy(); empty(h); expect(h.images.map(image => image.destroyed)).toEqual([1, 1]);
  });
  it('drops ownership at run/stage boundaries and never destroys the shared texture', () => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true);
    expect(renderer.draw(world({ save: Object.freeze({ runId: 'attempt-b' }) }))).toBe(true);
    expect(h.images).toHaveLength(2); expect(h.images[0].destroyed).toBe(1);
    expect(renderer.draw(world({ chapter: Object.freeze({ stage: 2 }) }))).toBe(false); empty(h);
    expect(renderer.draw(world())).toBe(true); expect(h.images).toHaveLength(3); renderer.destroy(); empty(h);
    expect(h.images.map(image => image.destroyed)).toEqual([1, 1, 1]);
  });
  it.each(['filter', 'add'])('contains first allocation-path %s failure and permits a clean retry', failure => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); h.state.failure = failure;
    expect(basiliskSpriteResourcesReady(h.scene.textures, binding())).toBe(true);
    expect(renderer.draw(world())).toBe(false); expect(h.images).toHaveLength(0); sharedUntouched(h);
    h.state.failure = ''; expect(renderer.draw(world())).toBe(true); expect(h.images).toHaveLength(1); renderer.destroy(); empty(h);
  });
  it('releases the old image if a replacement texture fails to accept NEAREST', () => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true);
    h.texture.current = h.makeTexture(); h.state.failure = 'filter';
    expect(renderer.draw(world())).toBe(false); expect(h.images).toHaveLength(1); expect(h.images[0].destroyed).toBe(1); empty(h);
    h.state.failure = ''; expect(renderer.draw(world())).toBe(true); expect(h.images).toHaveLength(2); renderer.destroy(); empty(h);
  });
  it.each(['origin', 'scale', 'depth', 'alpha', 'rotation', 'flip', 'position'])('owns and releases a new image before its %s setter can fail', failure => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); h.state.nextImageFailure = failure;
    expect(renderer.draw(world())).toBe(false); expect(h.images).toHaveLength(1); expect(h.images[0].destroyed).toBe(1); empty(h);
    h.state.nextImageFailure = ''; expect(renderer.draw(world())).toBe(true); expect(h.images).toHaveLength(2); renderer.destroy(); empty(h);
  });
  it.each(['frame', 'origin', 'scale', 'depth', 'alpha', 'rotation', 'flip', 'position'])('drops an existing image when later %s configuration fails', failure => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true);
    h.images[0].failure = failure;
    expect(renderer.draw(world({ boss: boss({ action: 'tell' }) }))).toBe(false); expect(h.images[0].destroyed).toBe(1); empty(h);
    expect(renderer.draw(world())).toBe(true); expect(h.images).toHaveLength(2); renderer.destroy(); empty(h);
  });
  it('clears ownership even when teardown throws, without double-destroy or stale reuse', () => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true);
    const old = h.images[0]; old.throwDestroy = true;
    expect(renderer.draw(world({ boss: boss({ hp: 0 }) }))).toBe(false); expect(old.destroyed).toBe(1); empty(h);
    expect(renderer.draw(world())).toBe(true); expect(h.images).toHaveLength(2); expect(h.images[1]).not.toBe(old);
    h.images[1].throwDestroy = true; expect(() => renderer.destroy()).not.toThrow(); expect(() => renderer.destroy()).not.toThrow();
    expect(h.images.map(image => image.destroyed)).toEqual([1, 1]); empty(h);
    expect(renderer.draw(world())).toBe(false); expect(h.images).toHaveLength(2);
  });
  it('destroy-before-draw and repeated destroy are inert; disposed draw reads no world or resource', () => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()), reads: string[] = [], hostile = {};
    trap(hostile, 'save', reads); renderer.destroy(); renderer.destroy();
    expect(renderer.draw(hostile as BasiliskSpriteWorld)).toBe(false);
    expect(reads).toEqual([]); expect(h.calls).toEqual([]); expect(h.images).toEqual([]); sharedUntouched(h);
  });
});

const invalidWorlds: { name: string; make: () => unknown }[] = [
  { name: 'null world', make: () => null }, { name: 'undefined world', make: () => undefined },
  { name: 'null boss', make: () => ({ ...world(), boss: null }) }, { name: 'null save', make: () => ({ ...world(), save: null }) },
  { name: 'null chapter', make: () => ({ ...world(), chapter: null }) }, { name: 'null furnace', make: () => world({ furnace: null }) },
  { name: 'absent furnace', make: () => ({ ...world(), furnace: undefined }) }, { name: 'empty furnace', make: () => ({ ...world(), furnace: {} }) },
  ...[undefined, null, 0, 1, 'false', 'true', {}, NaN].map((enraged, i) => ({ name: `invalid actual furnace mode ${i}`, make: () => ({ ...world(), furnace: { enraged } }) })),
  ...[0, -1, NaN, Infinity, -Infinity, undefined, null, '540'].map((hp, i) => ({ name: `dead/invalid HP ${i}`, make: () => ({ ...world(), boss: { ...boss(), hp } }) })),
  ...['x', 'y'].flatMap(field => [NaN, Infinity, -Infinity, undefined, null, '100'].map((value, i) => ({ name: `invalid ${field} ${i}`, make: () => ({ ...world(), boss: { ...boss(), [field]: value } }) }))),
  ...[0, 2, -2, NaN, Infinity, undefined, null, '1', true].map((facing, i) => ({ name: `invalid locked facing ${i}`, make: () => ({ ...world(), boss: { ...boss(), facing } }) })),
  ...['gato', 'sydney', 'mirror', '', undefined].map((kind, i) => ({ name: `wrong boss kind ${i}`, make: () => ({ ...world(), boss: { ...boss(), kind } }) })),
  ...['seek', 'consume', 'attack ', 0, undefined, null].map((action, i) => ({ name: `invalid actual action ${i}`, make: () => ({ ...world(), boss: { ...boss(), action } }) })),
  ...['', '   ', null, undefined, 7].map((runId, i) => ({ name: `invalid run identity ${i}`, make: () => ({ ...world(), save: { runId } }) })),
  ...[1, 2, 4, 5, '3', NaN, null, undefined].map((stage, i) => ({ name: `inactive/invalid stage ${i}`, make: () => ({ ...world(), chapter: { stage } }) })),
];
describe('invalid world boundaries never leave stale owned body pixels', () => {
  it.each(invalidWorlds)('clears $name and recovers on the next legitimate draw', ({ make }) => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true); const old = h.images[0];
    expect(renderer.draw(make() as BasiliskSpriteWorld)).toBe(false); expect(old.destroyed).toBe(1); empty(h);
    expect(renderer.draw(world())).toBe(true); expect(h.images).toHaveLength(2); renderer.destroy(); empty(h);
    expect(h.images.map(image => image.destroyed)).toEqual([1, 1]);
  });
  it.each(['save', 'chapter', 'boss', 'furnace'])('contains throwing root %s access while releasing the previous image', key => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true);
    const input = { ...world() }, reads: string[] = []; trap(input, key, reads); Object.freeze(input);
    expect(renderer.draw(input)).toBe(false); expect(reads).toContain(key); expect(h.images[0].destroyed).toBe(1); empty(h); renderer.destroy();
  });
  it.each(['save.runId', 'chapter.stage', 'furnace.enraged', 'boss.kind', 'boss.action', 'boss.hp', 'boss.x', 'boss.y', 'boss.facing'])('contains throwing required %s access; forbidden fields are tested separately', path => {
    const h = harness(), renderer = new BasiliskSpriteRenderer(h.scene, binding()); expect(renderer.draw(world())).toBe(true);
    const parts: Record<string, object> = { save: { runId: 'attempt-a' }, chapter: { stage: 3 }, furnace: { enraged: false }, boss: { ...boss() } }, reads: string[] = [];
    const [region, field] = path.split('.'); trap(parts[region], field, reads, path); Object.values(parts).forEach(Object.freeze); Object.freeze(parts);
    expect(renderer.draw(parts as unknown as BasiliskSpriteWorld)).toBe(false); expect(reads).toContain(path); expect(h.images[0].destroyed).toBe(1); empty(h); renderer.destroy();
  });
});
