import type * as Phaser from 'phaser';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import type { WorldState } from '../../src/pages/GamePage/game/entities/model';
import { PICKUP_ASSET, PICKUP_BINDING } from '../../src/pages/GamePage/game/data/pickupAssets';
import { PickupSpriteRenderer, pickupResourcesReady, PICKUP_IMAGE_LIMIT,
  type PickupScene, type PickupImage, type PickupTexture, type PickupTextureFrame, type PickupView } from '../../src/pages/GamePage/game/systems/PickupSpriteRenderer';
const roles = ['token', 'compute', 'heal'] as const;
const names = roles.map((_, i) => `pickup-items ${i}.aseprite`);
const binding = () => ({ key: 'pickup-items', frames: { token: names[0], compute: names[1], heal: names[2] } });
function world(stage = 1): WorldState {
  const w = structuredClone(createWorld({ ...createRun('0badcafe-0000-4000-8000-000000000126', 42), stage, elapsedMs: 20000 }));
  w.pickups = roles.map((kind, i) => ({ id: kind + '-real', kind, x: 100 + i * 60, y: 100, amount: 12 }));
  w.pickups.push({ id: 'owned-elsewhere', kind: 'mushroom', x: 300, y: 100, amount: 28 }); return w;
}
const view = (x = 0, y = 0): PickupView => ({ x, y, width: 640, height: 360 });
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    for (const key of Reflect.ownKeys(v)) { const d = Object.getOwnPropertyDescriptor(v, key); if (d && 'value' in d) freeze(d.value); }
    Object.freeze(v);
  } return v;
}
function trap(v: object, key: string) { Object.defineProperty(v, key, { configurable: true, get() { throw Error('forbidden ' + key); } }); }
interface Faults { op: string; imageOp: string; imageAt: number; hook: ((op: string, index?: number) => void) | null }
class ImagePort implements PickupImage {
  scene: unknown = {}; active = true; isDestroyed = false; visible = true; destroyed = 0;
  x = -1; y = -1; key = ''; frame = ''; scale = 7; origin = [0, 0]; depth = 8; rotation = 2; alpha = .2;
  tint = 1; tintMode = 'FILL'; flip = [true, true]; crop = [3, 3, 1, 1]; calls: string[] = [];
  listeners: (() => void)[] = [];
  constructor(readonly index: number, readonly faults: Faults) {}
  private hit(op: string) { this.calls.push(op); this.faults.hook?.(op, this.index); if (this.faults.imageOp === op && (this.faults.imageAt < 0 || this.faults.imageAt === this.index)) throw Error(op); }
  once(event: string, listener: () => void) { this.hit('once'); if (event !== 'destroy') throw Error(event); this.listeners.push(listener); return this; }
  setTexture(key: string, frame: string) { this.hit('texture'); this.key = key; this.frame = frame; return this; }
  setOrigin(x: number, y: number) { this.hit('origin'); this.origin = [x, y]; return this; }
  setScale(v: number) { this.hit('scale'); this.scale = v; return this; }
  setRotation(v: number) { this.hit('rotation'); this.rotation = v; return this; }
  setPosition(x: number, y: number) { this.hit('position'); this.x = x; this.y = y; return this; }
  setDepth(v: number) { this.hit('depth'); this.depth = v; return this; }
  setAlpha(v: number) { this.hit('alpha'); this.alpha = v; return this; }
  setVisible(v: boolean) { this.hit('visible'); this.visible = v; return this; }
  setCrop(x: number, y: number, w: number, h: number) { this.hit('crop'); this.crop = [x, y, w, h]; return this; }
  clearTint() { this.hit('clearTint'); this.tint = 0xffffff; this.tintMode = 'MULTIPLY'; return this; }
  setFlip(x: boolean, y: boolean) { this.hit('flip'); this.flip = [x, y]; return this; }
  destroy() {
    if (!this.scene) return; this.destroyed++; this.hit('destroy');
    const pending = this.listeners; this.listeners = []; for (const listener of pending) listener();
    this.visible = false; this.active = false; this.isDestroyed = true; this.scene = undefined;
  }
}
type Frame = { -readonly [P in keyof PickupTextureFrame]: PickupTextureFrame[P] };
function harness() {
  const faults: Faults = { op: '', imageOp: '', imageAt: -1, hook: null }, images: ImagePort[] = [], calls: string[] = [];
  const media = { width: 96, height: 32, image: { naturalWidth: 96, naturalHeight: 32 }, source: {} };
  const frames = new Map<string, Frame>(); let filters = 0, borrowedDestroy = 0;
  const hit = (op: string) => { calls.push(op); faults.hook?.(op); if (faults.op === op) throw Error(op); };
  const texture: PickupTexture & { destroy(): void } = {
    key: 'pickup-items', source: [media], has(n) { hit('has'); return frames.has(n); }, get(n) { hit('frame'); return frames.get(n); },
    setFilter(n) { hit('filter'); expect(n).toBe(1); filters++; }, destroy() { borrowedDestroy++; },
  };
  names.forEach((name, i) => frames.set(name, { name, texture, sourceIndex: 0, source: media, x: 0, y: 0,
    cutX: i * 32, cutY: 0, cutWidth: 32, cutHeight: 32, width: 32, height: 32, realWidth: 32, realHeight: 32, trimmed: false, rotated: false }));
  trap(texture, 'frameTotal');
  const scene: PickupScene = { textures: { exists(key) { hit('exists'); return key === 'pickup-items'; },
    get(key) { hit('get'); if (key !== 'pickup-items') throw Error('foreign key'); return texture; } },
    add: { image(x, y, key, frame) { hit('add'); const i = new ImagePort(images.length, faults); i.x = x; i.y = y; i.key = key; i.frame = frame;
      images.push(i); faults.hook?.('created', i.index); return i; } } };
  return { scene, texture, frames, media, faults, images, calls, get filters() { return filters; }, get borrowedDestroy() { return borrowedDestroy; }, frame: (i: number) => frames.get(names[i])! };
}
type H = ReturnType<typeof harness>;
const visible = (h: H) => h.images.filter(i => i.visible && !i.destroyed);
function noOwned(h: H) { expect(visible(h)).toHaveLength(0); expect(h.images.every(i => i.destroyed === 1)).toBe(true); expect(h.borrowedDestroy).toBe(0); }
function style(i: ImagePort) {
  expect(i.origin).toEqual([.5, .5]); expect(i.scale).toBe(1); expect(i.rotation).toBe(0); expect(i.depth).toBe(-1); expect(i.alpha).toBe(1);
  expect(i.flip).toEqual([false, false]); expect(i.crop).toEqual([0, 0, 32, 32]); expect(i.tint).toBe(0xffffff); expect(i.tintMode).toBe('MULTIPLY');
}

describe('independent pickup adapter resource contract', () => {
  it('is compatible with installed real Scene and canonical three literal frames', () => {
    expectTypeOf<Phaser.Scene>().toExtend<PickupScene>();
    expect(PICKUP_BINDING).toEqual(binding()); expect(PICKUP_ASSET.frames).toEqual(names);
    expect(PICKUP_ASSET).toMatchObject({ key: 'pickup-items', image: 'game/pickup-items.png', atlas: 'game/pickup-items.json', frameWidth: 32, frameHeight: 32 });
    expect(PICKUP_IMAGE_LIMIT).toBe(64);
  });
  it('pure eager guard visits all frames but never filters or allocates', () => {
    const h = harness(); expect(pickupResourcesReady(h.scene.textures, binding())).toBe(true);
    expect(h.calls.filter(v => v === 'frame')).toHaveLength(3); expect(h.filters).toBe(0); expect(h.images).toHaveLength(0);
  });
  it.each([null, undefined, {}, [], { key: 'foreign', frames: binding().frames }, { key: 'pickup-items', frames: {} }])('rejects malformed binding %s', value => {
    const h = harness(); expect(pickupResourcesReady(h.scene.textures, value)).toBe(false);
    expect(new PickupSpriteRenderer(h.scene, value).draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(0);
  });
  it.each(roles)('rejects missing role %s even when world contains only token', role => {
    const h = harness(); h.frames.delete(binding().frames[role]); const w = world(); w.pickups = [w.pickups[0]];
    expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
    expect(new PickupSpriteRenderer(h.scene, binding()).draw(w, view()).size).toBe(0); expect(h.images).toHaveLength(0);
  });
  const badFrames = [
    ['name', 'wrong'], ['texture', {}], ['source', { width: 96, height: 32 }], ['sourceIndex', 1], ['x', 1], ['y', 1],
    ['cutX', -1], ['cutY', 1], ['width', 31], ['height', 31], ['cutWidth', 31], ['cutHeight', 31],
    ['realWidth', 33], ['realHeight', 33], ['trimmed', true], ['rotated', true], ['cutX', 65], ['cutX', NaN],
  ] as const;
  it.each(badFrames)('rejects unused heal frame %s=%s', (key, value) => {
    const h = harness(); Object.assign(h.frame(2), { [key]: value });
    expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
    expect(new PickupSpriteRenderer(h.scene, binding()).draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(0);
  });
  it.each(['width', 'height', 'naturalWidth', 'naturalHeight'])('rejects wrong %s on actual atlas source', key => {
    const h = harness(); if (key.startsWith('natural')) Object.assign(h.media.image, { [key]: 97 }); else Object.assign(h.media, { [key]: 97 });
    expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it('allows canonical Canvas source96x32 but rejects natural-vs-layout mismatch', () => {
    const h = harness(); Object.assign(h.media, { image: { width: 96, height: 32 } });
    expect(pickupResourcesReady(h.scene.textures, binding())).toBe(true);
    Object.assign(h.media, { image: { width: 96, height: 32, naturalWidth: 97, naturalHeight: 32 } });
    expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it('rejects aliased Frame identity even with adaptive getters', () => {
    const h = harness(); const f = h.frame(0); let index = 0;
    Object.defineProperty(f, 'name', { get: () => names[index] }); Object.defineProperty(f, 'cutX', { get: () => index * 32 });
    h.texture.get = name => { index = names.indexOf(name); return f; };
    expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it.each(['exists', 'get', 'has', 'frame'])('catches resource exception %s without drawing', op => {
    const h = harness(); h.faults.op = op;
    expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
    expect(new PickupSpriteRenderer(h.scene, binding()).draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(0);
  });
  it.each(['key', 'source'])('catches texture getter %s', key => {
    const h = harness(); trap(h.texture, key); expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it.each(['image', 'width', 'height', 'source'])('catches source getter %s', key => {
    const h = harness(); trap(h.media, key); expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it.each(['name', 'texture', 'source', 'sourceIndex', 'cutX', 'realWidth', 'trimmed'])('catches unused frame getter %s', key => {
    const h = harness(); trap(h.frame(2), key); expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it('rejects extra TextureSource and forged owner key', () => {
    const h = harness(); Object.assign(h.texture, { source: [h.media, h.media] }); expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
    Object.assign(h.texture, { source: [h.media], key: 'foreign' }); expect(pickupResourcesReady(h.scene.textures, binding())).toBe(false);
  });
});

describe('live ids, simulation-only clock and readonly geometry', () => {
  it('deep-frozen input paints only live three kinds, preserving exact bob/pivot/style', () => {
    const h = harness(), w = world(), original = JSON.stringify(w); freeze(w);
    const r = new PickupSpriteRenderer(h.scene, freeze(binding())), handled = r.draw(w, freeze(view()));
    expect([...handled]).toEqual(['token-real', 'compute-real', 'heal-real']); expect(visible(h)).toHaveLength(3);
    for (const [index, i] of h.images.entries()) {
      style(i); expect(i.x).toBe(w.pickups[index].x); expect(i.y).toBe(w.pickups[index].y + Math.sin(w.save.elapsedMs / 280 + w.pickups[index].x) * 2);
      expect(i.frame).toBe(names[index]);
    }
    expect(JSON.stringify(w)).toBe(original); expect(h.filters).toBe(1); r.destroy(); noOwned(h);
  });
  it('never reads player, rewards, chapter initial lists or wall clock', () => {
    const h = harness(), w = world(); trap(w, 'player'); trap(w.chapter, 'pickups');
    for (const i of w.pickups) trap(i, 'amount');
    for (const key of ['hp', 'doom', 'tokens', 'score', 'stage', 'checkpoint']) trap(w.save, key);
    const r = new PickupSpriteRenderer(h.scene, binding()); expect(r.draw(w, view()).size).toBe(3); r.destroy(); noOwned(h);
  });
  it.each(['ready', 'playing', 'rest', 'cleared', 'finished', 'dead'] as WorldState['mode'][])('keeps frozen simulation visuals in %s', mode => {
    const h = harness(), w = world(); w.mode = mode; const r = new PickupSpriteRenderer(h.scene, binding());
    expect(r.draw(w, view()).size).toBe(3); const positions = h.images.map(i => [i.x, i.y]);
    expect(r.draw(w, view()).size).toBe(3); expect(h.images.map(i => [i.x, i.y])).toEqual(positions); expect(h.filters).toBe(1);
    w.save.elapsedMs += 100; expect(r.draw(w, view()).size).toBe(3); expect(h.images.map(i => [i.x, i.y])).not.toEqual(positions);
  });
  it('changes role with same real id without allocating a fourth Image', () => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view());
    w.pickups[0].kind = 'heal'; expect(r.draw(w, view()).size).toBe(3); expect(h.images).toHaveLength(3); expect(h.images[0].frame).toBe(names[2]);
  });
  it('hides offscreen live id, reuses on return, removes only actual consumed id', () => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view()); const first = h.images[0];
    w.pickups[0].x = 1000; expect(r.draw(w, view()).size).toBe(2); expect(first.visible).toBe(false); expect(first.destroyed).toBe(0);
    w.pickups[0].x = 140; expect(r.draw(w, view()).size).toBe(3); expect(first.visible).toBe(true); expect(h.images).toHaveLength(3);
    w.pickups.shift(); expect(r.draw(w, view()).size).toBe(2); expect(first.destroyed).toBe(1); expect(visible(h)).toHaveLength(2);
    r.draw(w, view()); expect(first.destroyed).toBe(1); expect(h.images).toHaveLength(3);
  });
  it('clear and R-like live list remap never resurrect consumed ids from chapter', () => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view()); w.pickups.shift();
    w.pickups = w.pickups.map(p => ({ ...p, x: p.x + 17, y: p.y + 21 }));
    expect([...r.draw(w, view())]).toEqual(['compute-real', 'heal-real']); expect(h.images).toHaveLength(3); expect(h.images[0].destroyed).toBe(1);
    w.pickups = []; expect(r.draw(w, view()).size).toBe(0); noOwned(h);
  });
  it.each([1, 2, 3, 4, 5])('accepts chapter%d world bounds including vertical camera', stage => {
    const h = harness(), w = world(stage), r = new PickupSpriteRenderer(h.scene, binding());
    const v = view(0, stage === 2 ? 1000 : 0); w.pickups.forEach(p => p.y += v.y);
    expect(r.draw(w, v).size).toBe(3); expect(h.images.every(i => i.y > v.y)).toBe(true);
  });
  it('validates budget across ALL live kinds before viewport allocations', () => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding());
    w.pickups = Array.from({ length: 64 }, (_, i) => ({ id: 'id' + i, kind: 'token', x: 100 + i / 100, y: 100, amount: 1 }));
    expect(r.draw(w, view()).size).toBe(64); expect(h.images).toHaveLength(64);
    w.pickups.push({ id: 'offscreen65', kind: 'heal', x: 10000, y: 10000, amount: 1 });
    expect(r.draw(w, view()).size).toBe(0); expect(h.images).toHaveLength(64); noOwned(h);
  });
  it('does not allocate wholly offscreen objects or touch native mushroom ownership', () => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding());
    w.pickups = [w.pickups[3], { ...w.pickups[0], x: -16, y: 100 }];
    expect(r.draw(w, view()).size).toBe(0); expect(h.images).toHaveLength(0);
    w.pickups[1].x = -15.9; expect(r.draw(w, view()).size).toBe(1); expect(h.images).toHaveLength(1);
  });
  it.each(['run', 'stage', 'frame', 'source', 'source-array', 'physical-image', 'texture'])('releases stale %s generation before fresh painting', change => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view());
    if (change === 'run') w.save.runId += '-next';
    if (change === 'stage') w.chapter = { ...w.chapter, stage: 3 };
    if (change === 'frame') h.frames.set(names[2], { ...h.frame(2) });
    if (change === 'source-array') Object.assign(h.texture, { source: [...h.texture.source] });
    if (change === 'physical-image') h.media.image = { naturalWidth: 96, naturalHeight: 32 };
    if (change === 'source') { const s = { ...h.media }; Object.assign(h.texture, { source: [s] }); for (const f of h.frames.values()) f.source = s; }
    if (change === 'texture') { const t = { ...h.texture }; for (const f of h.frames.values()) f.texture = t; h.scene.textures.get = () => t; }
    expect(r.draw(w, view()).size).toBe(3); expect(h.images.slice(0, 3).every(i => i.destroyed === 1)).toBe(true);
    expect(h.images).toHaveLength(6); expect(h.filters).toBe(change === 'run' || change === 'stage' ? 1 : 2); expect(h.borrowedDestroy).toBe(0);
  });
  it('defensively snapshots binding rather than retain mutable caller roles', () => {
    const h = harness(), b = binding(), r = new PickupSpriteRenderer(h.scene, b); b.key = 'foreign'; b.frames.heal = 'foreign';
    expect(r.draw(world(), view()).size).toBe(3); expect(h.images[2].frame).toBe(names[2]);
  });
});

describe('invalid snapshots never leave partial skins', () => {
  const cases: [string, (w: WorldState, v: PickupView) => void][] = [
    ['empty run', w => { w.save.runId = ' '; }], ['negative time', w => { w.save.elapsedMs = -1; }],
    ['NaN time', w => { w.save.elapsedMs = NaN; }], ['infinite time', w => { w.save.elapsedMs = Infinity; }],
    ['stage0', w => { Object.assign(w.chapter, { stage: 0 }); }], ['stage6', w => { Object.assign(w.chapter, { stage: 6 }); }],
    ['short world', w => { w.chapter = { ...w.chapter, width: 639 }; }], ['low world', w => { w.chapter = { ...w.chapter, height: 359 }; }],
    ['fraction world', w => { w.chapter = { ...w.chapter, width: w.chapter.width + .5 }; }], ['missing list', w => { Object.assign(w, { pickups: null }); }],
    ['negative viewX', (_, v) => { Object.assign(v, { x: -1 }); }], ['negative viewY', (_, v) => { Object.assign(v, { y: -1 }); }],
    ['view overflowX', (w, v) => { Object.assign(v, { x: w.chapter.width - 639 }); }],
    ['view overflowY', (w, v) => { Object.assign(v, { y: w.chapter.height - 359 }); }],
    ['view width', (_, v) => { Object.assign(v, { width: 639 }); }], ['view height', (_, v) => { Object.assign(v, { height: 359 }); }],
    ['NaN view', (_, v) => { Object.assign(v, { x: NaN }); }], ['infinite view', (_, v) => { Object.assign(v, { y: Infinity }); }],
    ['blank id', w => { w.pickups[0].id = ''; }], ['whitespace id', w => { w.pickups[0].id = ' '; }],
    ['duplicate id', w => { w.pickups[1].id = w.pickups[0].id; }], ['duplicate skipped mushroom', w => { w.pickups[3].id = w.pickups[0].id; }],
    ['NaN x', w => { w.pickups[0].x = NaN; }], ['infinite y', w => { w.pickups[0].y = Infinity; }],
    ['invalid skipped mushroom', w => { w.pickups[3].y = NaN; }], ['unknown kind', w => { Object.assign(w.pickups[0], { kind: 'potato' }); }],
  ];
  it.each(cases)('%s cleans previous generation and makes no new Image', (_, mutate) => {
    const h = harness(), w = world(), v = view(), r = new PickupSpriteRenderer(h.scene, binding()); expect(r.draw(w, v).size).toBe(3);
    mutate(w, v); expect(r.draw(w, v).size).toBe(0); expect(h.images).toHaveLength(3); noOwned(h);
  });
  it.each(['save', 'chapter', 'pickups'])('catches readonly world getter %s', key => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view()); trap(w, key);
    expect(r.draw(w, view()).size).toBe(0); noOwned(h);
  });
  it.each(['id', 'kind', 'x', 'y'])('catches pickup getter %s including an unused offscreen object', key => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view()); trap(w.pickups[3], key);
    expect(r.draw(w, view()).size).toBe(0); noOwned(h);
  });
});
describe('bounded lifetime, real destroy order and exception fences', () => {
  it.each(['texture', 'origin', 'scale', 'rotation', 'flip', 'clearTint', 'alpha', 'position', 'depth', 'crop', 'visible', 'once'])('catches Image %s setter exception without partial handling', op => {
    const h = harness(), w = world(); h.faults.imageOp = op; h.faults.imageAt = 1;
    const r = new PickupSpriteRenderer(h.scene, binding()); expect(r.draw(w, view()).size).toBe(0);
    expect(h.images).toHaveLength(2); noOwned(h); h.faults.imageOp = ''; expect(r.draw(w, view()).size).toBe(3);
  });
  it.each(['add', 'filter'])('catches %s exception with no borrowed destruction', op => {
    const h = harness(); h.faults.op = op; const r = new PickupSpriteRenderer(h.scene, binding());
    expect(r.draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(0); expect(h.borrowedDestroy).toBe(0);
  });
  it('release failure on a run transition fails closed but tries every owned image', () => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view());
    h.faults.imageOp = 'destroy'; h.faults.imageAt = 0; w.save.runId += '-new';
    expect(r.draw(w, view()).size).toBe(0); expect(h.images).toHaveLength(3);
    expect(h.images.every(i => i.destroyed === 1 && !i.visible)).toBe(true); expect(h.borrowedDestroy).toBe(0);
    h.faults.imageOp = ''; expect(r.draw(w, view()).size).toBe(3); expect(h.images).toHaveLength(6);
  });
  it('actual collection destroy does not clear the other live ids', () => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view());
    w.pickups.shift(); expect(r.draw(w, view()).size).toBe(2); expect(visible(h)).toHaveLength(2);
    expect(h.images.map(i => i.destroyed)).toEqual([1, 0, 0]); expect(h.images).toHaveLength(3);
  });
  it('external DESTROY is fenced while scene and active still look live', () => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view());
    let liveDuringEvent = false; h.images[0].once('destroy', () => { liveDuringEvent = !!h.images[0].scene && h.images[0].active; });
    h.images[0].destroy(); expect(liveDuringEvent).toBe(true); noOwned(h);
    expect(r.draw(w, view()).size).toBe(3); expect(h.images).toHaveLength(6); r.destroy(); noOwned(h);
  });
  it('external destroy during configure never returns partial ids or double destroys', () => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view());
    let once = false; h.faults.hook = (op, i) => { if (!once && op === 'position' && i === 1) { once = true; h.images[1].destroy(); } };
    expect(r.draw(w, view()).size).toBe(0); noOwned(h); h.faults.hook = null; expect(r.draw(w, view()).size).toBe(3);
  });
  it.each(['created', 'texture', 'position', 'visible', 'filter', 'frame'])('dispose during %s fences and cleans even just-returned handles', op => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); let once = false;
    h.faults.hook = name => { if (!once && name === op) { once = true; r.destroy(); } };
    expect(r.draw(w, view()).size).toBe(0); noOwned(h); const count = h.images.length;
    expect(r.draw(w, view()).size).toBe(0); expect(h.images).toHaveLength(count);
  });
  it.each(['created', 'texture', 'position', 'visible', 'filter', 'frame'])('reentrant draw during %s invalidates the outer generation', op => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); let once = false;
    h.faults.hook = name => { if (!once && name === op) { once = true; expect(r.draw(w, view()).size).toBe(0); } };
    expect(r.draw(w, view()).size).toBe(0); noOwned(h); h.faults.hook = null; expect(r.draw(w, view()).size).toBe(3);
  });
  it('adopts and releases an allocated handle when factory disposes before returning', () => {
    const h = harness(), r = new PickupSpriteRenderer(h.scene, binding());
    h.faults.hook = op => { if (op === 'created') r.destroy(); };
    expect(r.draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(1); noOwned(h);
  });
  it('rejects same Image returned for two live ids', () => {
    const h = harness(); const factory = h.scene.add.image; let first: PickupImage | null = null;
    h.scene.add.image = (...args) => first ??= factory(...args);
    expect(new PickupSpriteRenderer(h.scene, binding()).draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(1); noOwned(h);
  });
  it('dispose is idempotent and makes no later allocation, filter or callback registration', () => {
    const h = harness(), w = world(), r = new PickupSpriteRenderer(h.scene, binding()); r.draw(w, view()); r.destroy(); r.destroy(); noOwned(h);
    const calls = h.calls.length; expect(r.draw(w, view()).size).toBe(0); expect(h.calls).toHaveLength(calls); expect(h.images).toHaveLength(3);
  });
});
