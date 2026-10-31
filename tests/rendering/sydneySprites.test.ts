import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type Phaser from 'phaser';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { bossRect, type Boss } from '../../src/pages/GamePage/game/entities/model';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { advanceSydney } from '../../src/pages/GamePage/game/systems/sydney';
import { SydneySpriteRenderer, sydneySpriteFrameFor, SYDNEY_SPRITE_ACTIONS, SYDNEY_SPRITE_SIZE, SYDNEY_SPRITE_FRAME_COUNT, SYDNEY_SPRITE_PIVOT,
  type SydneySpriteBinding, type SydneySpriteImage, type SydneySpriteScene, type SydneySpriteTexture, type SydneySpriteWorld, type SydneyTextureFrame,
} from '../../src/pages/GamePage/game/systems/SydneySpriteRenderer';

const localRequire = createRequire(import.meta.url);
const nativeFilter: Readonly<{ LINEAR: number; NEAREST: number }> = localRequire(join(dirname(localRequire.resolve('phaser/package.json')), 'src/textures/const.js'));
// Test-only keys, never a claim about the not-yet-verified native export.
const UNIT_FRAMES = Array.from({ length: 12 }, (_, i) => `unit-sydney-frame-${i}`);
const binding = () => ({ key: 'unit-only-sydney', frames: [...UNIT_FRAMES] });
function sheet() { return { width: 1152, height: 96, image: { revision: 1 }, source: { revision: 1 } }; }
function frame(index = 0, source = sheet()) {
  return { cutX: index * 96, cutY: 0, cutWidth: 96, cutHeight: 96, x: 0, y: 0, width: 96, height: 96, realWidth: 96, realHeight: 96, trimmed: false, rotated: false, source };
}
class TextureDouble implements SydneySpriteTexture {
  readonly frames = new Map<string, ReturnType<typeof frame>>();
  readonly hasReads: (string | number)[] = [];
  readonly reads: (string | number)[] = []; readonly filters: number[] = []; readonly destroy = vi.fn();
  firstFrame = ''; failHas = false; failGet = false; failFilter = false;
  constructor(names: SydneySpriteBinding, private readonly events: string[]) {
    const source = sheet(); names.frames.forEach((key, i) => this.frames.set(String(key), frame(i, source))); this.firstFrame = String(names.frames[0]);
  }
  has(key: string | number) { this.hasReads.push(key); if (this.failHas) throw new Error('has failure'); return this.frames.has(String(key)); }
  get(key: string | number) {
    if (this.failGet) throw new Error('get failure'); this.reads.push(key);
    const value = this.frames.get(key ? String(key) : this.firstFrame); if (!value) throw new Error('missing frame'); return value;
  }
  setFilter(mode: number) { this.events.push(`filter:${mode}`); if (this.failFilter) throw new Error('filter failure'); this.filters.push(mode); }
}
class ImageDouble implements SydneySpriteImage {
  origin: number[] = []; scale = 0; depth = 0; alpha = 0; rotation = 99; flip = true; destroyed = 0;
  failOrigin = false; failFrame = false; failPosition = false; readonly frameChanges: string[] = [];
  constructor(public x: number, public y: number, readonly key: string, public frame: string, readonly texture: TextureDouble) {}
  setFrame(value: string) { if (this.failFrame) throw new Error('frame failure'); this.frame = value; this.frameChanges.push(value); this.origin = [0, 0]; }
  setDisplayOrigin(x: number, y: number) { if (this.failOrigin) throw new Error('origin failure'); this.origin = [x, y]; }
  setPosition(x: number, y: number) { if (this.failPosition) throw new Error('position failure'); this.x = x; this.y = y; }
  setScale(value: number) { this.scale = value; }
  setDepth(value: number) { this.depth = value; }
  setRotation(value: number) { this.rotation = value; }
  setFlipX(value: boolean) { this.flip = value; }
  setAlpha(value: number) { this.alpha = value; }
  destroy() { this.destroyed++; }
}
class SceneDouble implements SydneySpriteScene {
  readonly events: string[] = []; readonly images: ImageDouble[] = []; readonly key: string;
  texture: TextureDouble; available = true; failExists = false; failTexture = false; failImage = false; failConfig = false;
  readonly time = { addEvent: vi.fn() }; readonly anims = { create: vi.fn() };
  constructor(names: SydneySpriteBinding = binding()) { this.key = names.key; this.texture = new TextureDouble(names, this.events); }
  readonly textures = {
    exists: vi.fn((key: string) => { if (this.failExists) throw new Error('exists failure'); return this.available && key === this.key; }),
    get: vi.fn((key: string) => { if (this.failTexture || key !== this.key) throw new Error('texture failure'); return this.texture; }),
  };
  readonly add = { image: vi.fn((x: number, y: number, key: string, frame: string) => {
    this.events.push('image'); if (this.failImage) throw new Error('allocation failure');
    const image = new ImageDouble(x, y, key, frame, this.texture); image.failOrigin = this.failConfig; this.images.push(image); return image;
  }) };
}
const boss = (patch: Partial<Boss> = {}): Readonly<Boss> => Object.freeze({ kind: 'sydney', name: 'Sydney', facing: 1, hp: 900, maxHp: 900, active: true, phase: 1, action: 'idle', actionUntil: 0, targetX: 550, volley: 0, enteredAt: 0, x: 320.4, y: 198.7, ...patch });
const world = (actor: Readonly<Boss> = boss(), runId = 'run-a', stage = 2): SydneySpriteWorld => Object.freeze({ save: Object.freeze({ runId }), chapter: Object.freeze({ stage }), boss: actor });
const actualWorld = () => structuredClone(createWorld({ ...createRun('44444444-4444-4444-8444-444444444444', 42), stage: 2, elapsedMs: 10000 }));
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
const poses = ([1, 2, 3] as const).flatMap(phase => (['idle', 'tell', 'attack', 'recover'] as const).map((action, i) => ({ phase, action, index: (phase - 1) * 4 + i })));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Sydney body-only contract', () => {
  it('matches installed Phaser and actual Core types without a browser runtime import', () => {
    expectTypeOf<Phaser.Scene>().toMatchTypeOf<SydneySpriteScene>();
    expectTypeOf<Phaser.GameObjects.Image>().toMatchTypeOf<SydneySpriteImage>();
    expectTypeOf<Phaser.Textures.Frame>().toMatchTypeOf<SydneyTextureFrame>();
    expectTypeOf<ReturnType<typeof createWorld>>().toMatchTypeOf<SydneySpriteWorld>();
    expect(SYDNEY_SPRITE_SIZE).toBe(96); expect(SYDNEY_SPRITE_FRAME_COUNT).toBe(12); expect(SYDNEY_SPRITE_PIVOT).toEqual({ x: 48, y: 48 });
    expect(SYDNEY_SPRITE_ACTIONS).toEqual(['idle', 'tell', 'attack', 'recover']);
    expect(Object.isFrozen(SYDNEY_SPRITE_ACTIONS)).toBe(true); expect(Object.isFrozen(SYDNEY_SPRITE_PIVOT)).toBe(true);
    expect(bossRect(boss())).toEqual({ x: 294.4, y: 161.7, w: 52, h: 74 });
  });
  it('defaults to unbound Graphics fallback before touching any texture', () => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene);
    expect(renderer.draw(world())).toBe(false); expect(scene.textures.exists).not.toHaveBeenCalled(); expect(scene.images).toHaveLength(0);
  });
  it.each([
    { label: 'null', value: null }, { label: 'undefined', value: undefined }, { label: 'empty', value: {} }, { label: 'array', value: [] },
    { label: 'key', value: { ...binding(), key: ' ' } }, { label: 'numeric-key', value: { ...binding(), key: 7 } },
    ...[null, {}, 'frames', [], UNIT_FRAMES.slice(0, 11), [...UNIT_FRAMES, 'extra'], Array(12), Array(12).fill('duplicate')].map(frames => ({ label: 'malformed-frames', value: { ...binding(), frames } })),
    ...[undefined, null, false, {}, '', ' ', -1, 0.5, NaN, Infinity].map(value => ({ label: `bad-frame-${String(value)}`, value: { ...binding(), frames: [...UNIT_FRAMES.slice(0, 11), value] } })),
    { label: 'normalized-duplicate', value: { ...binding(), frames: [0, '0', ...UNIT_FRAMES.slice(2)] } },
  ])('rejects $label before texture access', ({ value }) => {
    const scene = new SceneDouble(); expect(new SydneySpriteRenderer(scene, value).draw(world())).toBe(false);
    expect(scene.textures.exists).not.toHaveBeenCalled(); expect(scene.images).toHaveLength(0);
  });
  it('copies binding data instead of retaining a mutable caller dictionary', () => {
    const names = binding(), scene = new SceneDouble(names), renderer = new SydneySpriteRenderer(scene, names);
    names.key = 'mutated'; names.frames[0] = 'mutated';
    expect(renderer.draw(world())).toBe(true); expect(scene.images[0]).toMatchObject({ key: 'unit-only-sydney', frame: UNIT_FRAMES[0] });
  });
  it('normalizes frame zero before has/get/Image and subsequent frame changes', () => {
    const names = { key: 'unit-numeric-sydney', frames: Array.from({ length: 12 }, (_, i) => i) };
    const scene = new SceneDouble(names), renderer = new SydneySpriteRenderer(scene, names), decoy = frame();
    decoy.width = 192; scene.texture.frames.set('decoy', decoy); scene.texture.firstFrame = 'decoy';
    expect(scene.texture.get(0)).toBe(decoy); expect(scene.texture.get('0')).not.toBe(decoy); scene.texture.reads.length = 0;
    expect(renderer.draw(world())).toBe(true); expect(scene.texture.reads).toEqual(names.frames.map(String)); expect(scene.texture.hasReads).toEqual(names.frames.map(String)); expect(scene.images[0].frame).toBe('0');
    renderer.draw(world(boss({ phase: 3, action: 'recover' }))); expect(scene.images[0].frameChanges).toEqual(['11']);
  });
});

describe('only the current true phase/action', () => {
  it.each(poses)('maps phase $phase/$action despite HP, deadlines and inactivity', ({ phase, action, index }) => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding());
    expect(sydneySpriteFrameFor(phase, action)).toBe(index);
    for (const hp of [1, 900, 1800]) for (const active of [false, true]) {
      const snapshot = world(boss({ phase, action, hp, active, actionUntil: -1 }));
      const futureClock = { ...snapshot, save: { ...snapshot.save, elapsedMs: 1000000, stage: 3 } };
      expect(renderer.draw(futureClock)).toBe(true);
      expect(scene.images[0]).toMatchObject({ frame: UNIT_FRAMES[index], x: 320, y: 199, origin: [48, 48], scale: 1, depth: 2, rotation: 0, flip: false, alpha: 1 });
    }
    expect(scene.images).toHaveLength(1); expect(scene.images[0].frameChanges).toEqual([]);
  });
  it('reuses one Image across all 12 current poses and reanchors each frame reset', () => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding());
    for (const { phase, action, index } of poses) {
      expect(renderer.draw(world(boss({ phase, action, x: 271.6, y: 189.2 })))).toBe(true);
      expect(scene.images[0]).toMatchObject({ frame: UNIT_FRAMES[index], x: 272, y: 189, origin: [48, 48], scale: 1, alpha: 1, rotation: 0, flip: false });
    }
    expect(scene.images).toHaveLength(1); expect(scene.images[0].frameChanges).toEqual(UNIT_FRAMES.slice(1));
  });
  it('freezes inactive/paused snapshots without adding timers, motion or alpha drift', () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding());
    const snapshot = world(boss({ active: false, phase: 3, action: 'attack', actionUntil: -1 }));
    renderer.draw(snapshot); vi.advanceTimersByTime(120000); renderer.draw(snapshot);
    expect(scene.images[0]).toMatchObject({ frame: UNIT_FRAMES[10], x: 320, y: 199, alpha: 1, rotation: 0, scale: 1 });
    expect(scene.images).toHaveLength(1); expect(scene.images[0].frameChanges).toEqual([]); expect(vi.getTimerCount()).toBe(0);
    expect(scene.time.addEvent).not.toHaveBeenCalled(); expect(scene.anims.create).not.toHaveBeenCalled();
  });
  it('copies only the actual Core-computed sin coordinates, without a second hover', () => {
    const input = actualWorld(), scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding());
    input.boss.active = true; input.boss.actionUntil = 100000;
    for (const now of [1000, 2000, 3000]) {
      input.boss = advanceSydney(input, now).boss; const before = JSON.stringify(input);
      expect(renderer.draw(input)).toBe(true);
      expect(scene.images[0].x).toBe(Math.round(input.boss.x)); expect(scene.images[0].y).toBe(Math.round(input.boss.y));
      expect(JSON.stringify(input)).toBe(before);
    }
    expect(scene.images).toHaveLength(1);
  });
  it('leaves a deeply frozen actual WorldState and collision footprint unchanged', () => {
    const input = freeze(actualWorld()), before = JSON.stringify(input), footprint = bossRect(input.boss);
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding());
    expect(renderer.draw(input)).toBe(true); expect(renderer.draw(input)).toBe(true);
    expect(JSON.stringify(input)).toBe(before); expect(bossRect(input.boss)).toEqual(footprint); expect(scene.images).toHaveLength(1);
  });
  it('does not even read inference clocks, activation, HP thresholds, player or attack effects', () => {
    const input = actualWorld();
    const forbid = (object: object, key: string) => Object.defineProperty(object, key, { configurable: true, get: () => { throw new Error(`Forbidden read ${key}`); } });
    for (const key of ['active', 'maxHp', 'actionUntil', 'enteredAt', 'targetX', 'facing', 'volley']) forbid(input.boss, key);
    for (const key of ['elapsedMs', 'stage', 'doom']) forbid(input.save, key);
    for (const key of ['player', 'factory', 'bullets', 'shocks', 'events']) forbid(input, key);
    expect(new SydneySpriteRenderer(new SceneDouble(), binding()).draw(input)).toBe(true);
  });
  it.each([0, 4, NaN, Infinity, '1', null, undefined])('rejects unknown phase %s instead of inferring it', phase => { expect(sydneySpriteFrameFor(phase, 'idle')).toBeNull(); });
  it.each(['seek', 'idle ', '', null, undefined, 0])('rejects unknown action %s', action => { expect(sydneySpriteFrameFor(1, action)).toBeNull(); });
});

describe('owned Image lifecycle and native resource admission', () => {
  it('uses independently loaded installed NEAREST before Image construction, once per resource admission', () => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding()); renderer.draw(world()); renderer.draw(world(boss({ action: 'tell' })));
    expect(nativeFilter.NEAREST).not.toBe(nativeFilter.LINEAR); expect(scene.texture.filters).toEqual([nativeFilter.NEAREST]);
    expect(scene.events).toEqual([`filter:${nativeFilter.NEAREST}`, 'image']);
  });
  it.each([{ hp: 0 }, { hp: -1 }, { hp: NaN }, { hp: Infinity }, { x: NaN }, { y: Infinity }, { kind: 'gato' as const }, { phase: 4 as Boss['phase'] }, { action: 'seek' as Boss['action'] }])('cleans death, foreign kind or invalid current body %j, then recovers', patch => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding()); expect(renderer.draw(world())).toBe(true);
    expect(renderer.draw(world(boss(patch)))).toBe(false); expect(scene.images[0].destroyed).toBe(1);
    expect(renderer.draw(world())).toBe(true); expect(scene.images).toHaveLength(2);
  });
  it('cleans run/chapter loss, ignores saved-next-stage and reuses cloned snapshots', () => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding()); renderer.draw(world()); renderer.draw(world());
    const snapshot = { ...world(), save: { runId: 'run-a', stage: 3, elapsedMs: NaN } };
    expect(renderer.draw(snapshot)).toBe(true); expect(scene.images).toHaveLength(1);
    expect(renderer.draw(world(boss(), 'run-b'))).toBe(true); expect(scene.images[0].destroyed).toBe(1);
    expect(renderer.draw(world(boss(), 'run-b', 3))).toBe(false); expect(scene.images[1].destroyed).toBe(1);
    expect(renderer.draw(world(boss(), 'run-b', 2))).toBe(true); expect(scene.images).toHaveLength(3);
    expect(renderer.draw(world(boss(), ''))).toBe(false); expect(scene.images[2].destroyed).toBe(1);
  });
  it.each([
    { cutWidth: 95 }, { cutHeight: 95 }, { width: 95 }, { height: 95 }, { realWidth: 192 }, { realHeight: 192 },
    { x: 1 }, { y: 1 }, { trimmed: true }, { rotated: true }, { cutX: -1 }, { cutY: -1 }, { cutX: 1.5 }, { cutY: NaN }, { cutX: 1057 }, { cutY: 1 }, { source: undefined },
    { source: { width: 1151, height: 96 } }, { source: { width: 1152, height: 95 } }, { source: { width: 0, height: 96 } },
    { source: { width: Infinity, height: 96 } }, { source: { width: 1152.5, height: 96 } },
  ])('rejects invalid unused phase-3 metadata %j and destroys the old overlay', patch => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding()); expect(renderer.draw(world())).toBe(true);
    Object.assign(scene.texture.get(UNIT_FRAMES[11]), patch);
    expect(renderer.draw(world())).toBe(false); expect(scene.images[0].destroyed).toBe(1); expect(scene.images).toHaveLength(1);
  });
  it.each(['missing-texture', 'missing-unused-frame', 'exists', 'texture-get', 'has', 'frame-get', 'filter'] as const)('cleans and recovers from %s resource failure', fault => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding()); renderer.draw(world());
    if (fault === 'missing-texture') scene.available = false;
    if (fault === 'missing-unused-frame') scene.texture.frames.delete(UNIT_FRAMES[11]);
    if (fault === 'exists') scene.failExists = true;
    if (fault === 'texture-get') scene.failTexture = true;
    if (fault === 'has') scene.texture.failHas = true;
    if (fault === 'frame-get') scene.texture.failGet = true;
    if (fault === 'filter') { scene.texture.failFilter = true; scene.texture.frames.set(UNIT_FRAMES[0], { ...scene.texture.get(UNIT_FRAMES[0]) }); }
    expect(renderer.draw(world())).toBe(false); expect(scene.images[0].destroyed).toBe(1);
    scene.available = true; scene.failExists = false; scene.failTexture = false; scene.texture = new TextureDouble(binding(), scene.events);
    expect(renderer.draw(world())).toBe(true); expect(scene.images).toHaveLength(2);
  });
  it.each(['texture', 'frame', 'source', 'image', 'payload', 'cut', 'dimensions'] as const)('rebuilds for changed %s identity or geometry even with the same keys', change => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding()); renderer.draw(world());
    const previous = scene.texture, target = previous.get(UNIT_FRAMES[0]);
    if (change === 'texture') scene.texture = new TextureDouble(binding(), scene.events);
    if (change === 'frame') previous.frames.set(UNIT_FRAMES[11], { ...previous.get(UNIT_FRAMES[11]) });
    if (change === 'source') target.source = { ...target.source };
    if (change === 'image') target.source.image = { revision: 2 };
    if (change === 'payload') target.source.source = { revision: 2 };
    if (change === 'cut') target.cutX = 1;
    if (change === 'dimensions') target.source.width += 96;
    expect(renderer.draw(world())).toBe(true); expect(scene.images).toHaveLength(2); expect(scene.images.map(image => image.destroyed)).toEqual([1, 0]);
    expect(scene.images[1].texture).toBe(scene.texture); expect(previous.destroy).not.toHaveBeenCalled();
  });
  it('accepts complete boundary-inclusive frames and a legitimate non-HTMLElement source', () => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding());
    Object.assign(scene.texture.get(UNIT_FRAMES[0]).source, { image: null });
    expect(renderer.draw(world(boss({ phase: 3, action: 'recover' })))).toBe(true); expect(scene.images[0].frame).toBe(UNIT_FRAMES[11]);
  });
  it.each(['allocate', 'configure'] as const)('cleans %s construction failure without hiding the fallback', failure => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding());
    scene.failImage = failure === 'allocate'; scene.failConfig = failure === 'configure';
    expect(renderer.draw(world())).toBe(false); expect(scene.images).toHaveLength(failure === 'allocate' ? 0 : 1);
    expect(scene.images.every(image => image.destroyed === 1)).toBe(true);
    scene.failImage = false; scene.failConfig = false; expect(renderer.draw(world())).toBe(true);
    expect(scene.images.at(-1)?.destroyed).toBe(0);
  });
  it.each(['frame', 'position'] as const)('destroys a stale body on %s update failure and recovers', failure => {
    const scene = new SceneDouble(), renderer = new SydneySpriteRenderer(scene, binding()); renderer.draw(world());
    scene.images[0].failFrame = failure === 'frame'; scene.images[0].failPosition = failure === 'position';
    expect(renderer.draw(world(boss({ action: 'tell' })))).toBe(false); expect(scene.images[0].destroyed).toBe(1);
    expect(renderer.draw(world(boss({ action: 'tell' })))).toBe(true); expect(scene.images).toHaveLength(2); expect(scene.images[1].origin).toEqual([48, 48]);
  });
  it('disposes idempotently, never re-reads resources afterward, and preserves other owners', () => {
    const scene = new SceneDouble(), first = new SydneySpriteRenderer(scene, binding()), second = new SydneySpriteRenderer(scene, binding());
    first.draw(world()); second.draw(world()); first.destroy(); first.destroy();
    const reads = scene.textures.exists.mock.calls.length;
    expect(first.draw(world())).toBe(false); expect(scene.textures.exists).toHaveBeenCalledTimes(reads);
    expect(scene.images.map(image => image.destroyed)).toEqual([1, 0]); expect(second.draw(world())).toBe(true);
    second.destroy(); expect(scene.images.map(image => image.destroyed)).toEqual([1, 1]); expect(scene.texture.destroy).not.toHaveBeenCalled();
  });
});
