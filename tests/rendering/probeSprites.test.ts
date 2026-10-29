import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type Phaser from 'phaser';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { PROBE_RADIUS, type Probe } from '../../src/pages/GamePage/game/entities/model';
import { advanceFactory } from '../../src/pages/GamePage/game/systems/factory';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { PROBE_SEEK_FRAME_MS, PROBE_SPRITE_PIVOT, PROBE_SPRITE_ROLES, PROBE_SPRITE_SIZE, ProbeSpriteRenderer, probeSpriteRoleFor,
  type ProbeSpriteBinding, type ProbeSpriteFrameId, type ProbeSpriteImage, type ProbeSpriteRole, type ProbeSpriteScene, type ProbeSpriteTexture, type ProbeSpriteWorld, type ProbeTextureFrame,
} from '../../src/pages/GamePage/game/systems/ProbeSpriteRenderer';

const localRequire = createRequire(import.meta.url);
const nativeFilterMode: Readonly<{ LINEAR: number; NEAREST: number }> = localRequire(join(dirname(localRequire.resolve('phaser/package.json')), 'src/textures/const.js'));
// Deliberately unit-only. Neither these names nor their order claim a native export.
function unitBinding(): { key: string; frames: Record<ProbeSpriteRole, ProbeSpriteFrameId> } {
  return { key: 'unit-probe-atlas', frames: { 'seek-a': 'unit-seek-a', 'seek-b': 'unit-seek-b', tell: 'unit-tell', consume: 'unit-consume' } };
}
function source() { return { width: 128, height: 32, image: { version: 1 }, source: { version: 1 } }; }
function frame(index = 0, sheet = source()) {
  return { cutX: index * 32, cutY: 0, cutWidth: 32, cutHeight: 32, x: 0, y: 0, width: 32, height: 32, realWidth: 32, realHeight: 32, trimmed: false, rotated: false, source: sheet };
}
class TextureDouble implements ProbeSpriteTexture {
  readonly frames = new Map<string, ReturnType<typeof frame>>();
  readonly filters: number[] = []; readonly reads: (string | number)[] = [];
  firstFrame = ''; failHas = false; failGet = false; failFilter = false;
  readonly destroy = vi.fn();
  constructor(binding: ProbeSpriteBinding, private readonly events: string[]) {
    const sheet = source();
    PROBE_SPRITE_ROLES.forEach((role, index) => this.frames.set(String(binding.frames[role]), frame(index, sheet)));
    this.firstFrame = String(binding.frames['seek-a']);
  }
  has(id: string | number) { if (this.failHas) throw new Error('lost has'); return this.frames.has(String(id)); }
  get(id: string | number) {
    if (this.failGet) throw new Error('lost frame'); this.reads.push(id);
    // Actual 4.0 falsy-zero behavior, with an independently configurable decoy.
    const value = this.frames.get(id ? String(id) : this.firstFrame); if (!value) throw new Error('Missing frame lookup'); return value;
  }
  setFilter(mode: number) { this.events.push(`filter:${mode}`); if (this.failFilter) throw new Error('filter unavailable'); this.filters.push(mode); }
}
class ImageDouble implements ProbeSpriteImage {
  origin: number[] = []; scale = 0; depth = 0; alpha = 0; rotation = 99; flipped = true; destroyed = 0;
  readonly frameChanges: string[] = []; failPosition = false;
  constructor(public x: number, public y: number, readonly key: string, public frame: string, readonly texture: TextureDouble) {}
  setFrame(value: string) { this.frame = value; this.frameChanges.push(value); this.origin = [0, 0]; }
  setDisplayOrigin(x: number, y: number) { this.origin = [x, y]; }
  setPosition(x: number, y: number) { if (this.failPosition) throw new Error('image update failed'); this.x = x; this.y = y; }
  setScale(value: number) { this.scale = value; }
  setDepth(value: number) { this.depth = value; }
  setAlpha(value: number) { this.alpha = value; }
  setRotation(value: number) { this.rotation = value; }
  setFlipX(value: boolean) { this.flipped = value; }
  destroy() { this.destroyed++; }
}
class SceneDouble implements ProbeSpriteScene {
  readonly events: string[] = []; readonly images: ImageDouble[] = []; readonly key: string;
  texture: TextureDouble; available = true; failExists = false; failTexture = false; failImageAt = -1;
  readonly time = { addEvent: vi.fn(() => { throw new Error('No renderer-owned clock'); }) };
  readonly anims = { create: vi.fn(() => { throw new Error('No global animation registration'); }) };
  constructor(binding: ProbeSpriteBinding = unitBinding()) { this.key = binding.key; this.texture = new TextureDouble(binding, this.events); }
  readonly textures = {
    exists: vi.fn((key: string) => { if (this.failExists) throw new Error('lost manager'); return this.available && key === this.key; }),
    get: vi.fn((key: string) => { if (this.failTexture || key !== this.key) throw new Error('lost texture'); return this.texture; }),
  };
  readonly add = { image: vi.fn((x: number, y: number, key: string, value: string) => {
    this.events.push('image'); if (this.images.length === this.failImageAt) throw new Error('allocation failed');
    const image = new ImageDouble(x, y, key, value, this.texture); this.images.push(image); return image;
  }) };
}
const probe = (patch: Partial<Probe> = {}): Readonly<Probe> => Object.freeze({ id: 1, x: 80.4, y: 1650.7, hp: 24, phase: 'seek', phaseUntil: 999999, targetPlatformId: null, ...patch });
const world = (actors: readonly Readonly<Probe>[] = [probe()], elapsedMs = 0, runId = 'run-a', stage = 2): ProbeSpriteWorld =>
  Object.freeze({ save: Object.freeze({ runId, elapsedMs }), chapter: Object.freeze({ stage }), factory: Object.freeze({ probes: Object.freeze([...actors]) }) });
const actualWorld = () => structuredClone(createWorld({ ...createRun('44444444-4444-4444-8444-444444444444', 42), stage: 2, elapsedMs: 10000 }));
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('unbound native probe view contract', () => {
  it('uses the actual installed Phaser Scene/Image/Frame and Core world shapes without importing Phaser runtime', () => {
    expectTypeOf<Phaser.Scene>().toMatchTypeOf<ProbeSpriteScene>();
    expectTypeOf<Phaser.GameObjects.Image>().toMatchTypeOf<ProbeSpriteImage>();
    expectTypeOf<Phaser.Textures.Frame>().toMatchTypeOf<ProbeTextureFrame>();
    expectTypeOf<ReturnType<typeof createWorld>>().toMatchTypeOf<ProbeSpriteWorld>();
    expect(PROBE_SPRITE_SIZE).toBe(32); expect(PROBE_SPRITE_PIVOT).toEqual({ x: 16, y: 16 }); expect(PROBE_RADIUS).toBe(11);
    expect(PROBE_SPRITE_ROLES).toEqual(['seek-a', 'seek-b', 'tell', 'consume']); expect(PROBE_SEEK_FRAME_MS).toBe(240);
    expect(Object.isFrozen(PROBE_SPRITE_ROLES)).toBe(true); expect(Object.isFrozen(PROBE_SPRITE_PIVOT)).toBe(true);
  });
  it('defaults to no binding and makes no texture request or Image', () => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene);
    expect([...renderer.draw(world())]).toEqual([]); expect(scene.textures.exists).not.toHaveBeenCalled(); expect(scene.add.image).not.toHaveBeenCalled();
  });
  it.each([
    { label: 'null', value: null }, { label: 'undefined', value: undefined }, { label: 'array', value: [] }, { label: 'number', value: 7 }, { label: 'empty', value: {} },
    { label: 'empty-key', value: { ...unitBinding(), key: ' ' } }, { label: 'numeric-key', value: { ...unitBinding(), key: 0 } },
    { label: 'null-frames', value: { ...unitBinding(), frames: null } }, { label: 'missing-role', value: { ...unitBinding(), frames: { 'seek-a': 'a', 'seek-b': 'b', tell: 'c' } } },
    ...[undefined, null, false, {}, '', ' ', -1, 0.5, NaN, Infinity].map(value => ({ label: `invalid-frame-${String(value)}`, value: { ...unitBinding(), frames: { ...unitBinding().frames, consume: value } } })),
    { label: 'duplicate', value: { ...unitBinding(), frames: { 'seek-a': 'a', 'seek-b': 'a', tell: 'b', consume: 'c' } } },
    { label: 'normalized-duplicate', value: { ...unitBinding(), frames: { 'seek-a': 0, 'seek-b': '0', tell: 1, consume: 2 } } },
  ])('keeps $label on Graphics fallback before touching resources', ({ value }) => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, value);
    expect([...renderer.draw(world())]).toEqual([]); expect(scene.textures.exists).not.toHaveBeenCalled(); expect(scene.images).toHaveLength(0);
  });
  it('copies the caller key and role dictionary without retaining mutable binding state', () => {
    const binding = unitBinding(), scene = new SceneDouble(binding), renderer = new ProbeSpriteRenderer(scene, binding);
    binding.key = 'caller-key'; binding.frames['seek-a'] = 'caller-frame';
    expect([...renderer.draw(world())]).toEqual([1]); expect(scene.images[0]).toMatchObject({ key: 'unit-probe-atlas', frame: 'unit-seek-a' });
  });
  it('normalizes numeric zero before both texture lookup and Image creation', () => {
    const binding = { key: 'unit-numbered-probe', frames: { 'seek-a': 0, 'seek-b': 1, tell: 2, consume: 3 } }, scene = new SceneDouble(binding);
    const decoy = frame(); Object.assign(decoy, { cutWidth: 64, width: 64, realWidth: 64 }); scene.texture.frames.set('decoy', decoy); scene.texture.firstFrame = 'decoy';
    expect(scene.texture.get(0)).toBe(decoy); expect(scene.texture.get('0')).not.toBe(decoy); scene.texture.reads.length = 0;
    expect([...new ProbeSpriteRenderer(scene, binding).draw(world())]).toEqual([1]);
    expect(scene.texture.reads).toEqual(['0', '1', '2', '3']); expect(scene.images[0].frame).toBe('0');
  });
});

describe('current phase and the existing simulation clock only', () => {
  it.each([{ time: 0, role: 'seek-a' }, { time: 239.999, role: 'seek-a' }, { time: 240, role: 'seek-b' }, { time: 479.999, role: 'seek-b' }, { time: 480, role: 'seek-a' }, { time: 720, role: 'seek-b' }] as const)('selects $role at $time ms', ({ time, role }) => {
    const binding = unitBinding(), scene = new SceneDouble(binding), renderer = new ProbeSpriteRenderer(scene, binding);
    expect(probeSpriteRoleFor('seek', time)).toBe(role); expect([...renderer.draw(world([probe()], time))]).toEqual([1]); expect(scene.images[0].frame).toBe(binding.frames[role]);
  });
  it.each(['tell', 'consume'] as const)('keeps true %s across all seek boundaries and expired deadlines', phase => {
    const binding = unitBinding(), scene = new SceneDouble(binding), renderer = new ProbeSpriteRenderer(scene, binding);
    for (const time of [0, 239, 240, 480, 1000000]) { expect(probeSpriteRoleFor(phase, time)).toBe(phase); renderer.draw(world([probe({ phase, phaseUntil: -1 })], time)); expect(scene.images[0].frame).toBe(binding.frames[phase]); }
    expect(scene.images).toHaveLength(1); expect(scene.images[0].frameChanges).toEqual([]);
  });
  it.each([-1, NaN, Infinity, -Infinity])('cleans rather than inventing a clock at %s', time => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding()); renderer.draw(world());
    expect(probeSpriteRoleFor('tell', time)).toBeNull(); expect([...renderer.draw(world([probe()], time))]).toEqual([]); expect(scene.images[0].destroyed).toBe(1);
    expect([...renderer.draw(world())]).toEqual([1]); expect(scene.images).toHaveLength(2);
  });
  it('keeps paused snapshots frozen despite wall-time advancement and creates no timer or animation', () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding()), snapshot = world([probe()], 240);
    renderer.draw(snapshot); const image = scene.images[0]; vi.advanceTimersByTime(120000); renderer.draw(snapshot);
    expect(image).toMatchObject({ frame: 'unit-seek-b', x: 80, y: 1651, alpha: 1, scale: 1, rotation: 0 });
    expect(scene.images).toHaveLength(1); expect(image.frameChanges).toEqual([]); expect(vi.getTimerCount()).toBe(0);
    expect(scene.time.addEvent).not.toHaveBeenCalled(); expect(scene.anims.create).not.toHaveBeenCalled();
  });
  it('reasserts a centered native housing after real phase changes and tracks only real x/y', () => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding());
    for (const phase of ['seek', 'tell', 'consume', 'seek'] as const) {
      renderer.draw(world([probe({ phase, x: 97.6, y: 1431.2 })], 240));
      expect(scene.images[0]).toMatchObject({ x: 98, y: 1431, origin: [16, 16], scale: 1, depth: 2, alpha: 1, rotation: 0, flipped: false });
    }
    expect(scene.images).toHaveLength(1); expect(scene.images[0].frameChanges).toEqual(['unit-tell', 'unit-consume', 'unit-seek-b']);
  });
  it('does not read target, deadline, replication, player, camera, Doom or saved-next-stage inference', () => {
    const input = actualWorld(); if (!input.factory) throw new Error('Expected chapter-two factory');
    const forbidden = (object: object, key: string) => Object.defineProperty(object, key, { configurable: true, get: () => { throw new Error(`Forbidden renderer read: ${key}`); } });
    for (const actor of input.factory.probes) { forbidden(actor, 'phaseUntil'); forbidden(actor, 'targetPlatformId'); }
    for (const key of ['nextReplicateAt', 'nextProbeId', 'seaY']) forbidden(input.factory, key);
    for (const key of ['player', 'camera', 'collapsed', 'collapseAt']) forbidden(input, key);
    forbidden(input.save, 'doom'); forbidden(input.save, 'stage'); forbidden(input.chapter, 'platforms');
    const scene = new SceneDouble(); expect([...new ProbeSpriteRenderer(scene, unitBinding()).draw(input)]).toEqual(input.factory.probes.map(actor => actor.id));
    expect(scene.images).toHaveLength(input.factory.probes.length);
  });
  it('reads a deeply frozen actual world without changing Core or allocating synthetic births', () => {
    const input = freeze(actualWorld()), before = JSON.stringify(input), scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding());
    expect(input.factory).not.toBeNull(); expect([...renderer.draw(input)]).toEqual(input.factory!.probes.map(actor => actor.id)); renderer.draw(input);
    expect(JSON.stringify(input)).toBe(before); expect(scene.images).toHaveLength(input.factory!.probes.length);
  });
  it('adds a body only after the actual Core replication function adds a new positive-hp id', () => {
    const input = actualWorld(); if (!input.factory) throw new Error('Expected factory');
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding()), oldIds = input.factory.probes.map(actor => actor.id);
    renderer.draw(input); input.save.elapsedMs = 1000000; renderer.draw(input);
    expect(scene.images).toHaveLength(oldIds.length); expect(input.factory.probes.map(actor => actor.id)).toEqual(oldIds);
    // A unit-fixture Core step, not a renderer mutation or a browser debug command.
    advanceFactory(input, input.save.elapsedMs, 0);
    const born = input.factory.probes.find(actor => !oldIds.includes(actor.id)); expect(born).toBeDefined(); expect(born?.phase).toBe('seek');
    const afterCore = JSON.stringify(input); expect([...renderer.draw(input)]).toEqual(input.factory.probes.map(actor => actor.id));
    expect(scene.images).toHaveLength(oldIds.length + 1); expect(scene.images.at(-1)?.frame).toBe('unit-seek-a'); expect(JSON.stringify(input)).toBe(afterCore);
  });
});

describe('real resources and owned-Image lifecycle', () => {
  it('sets the independently imported installed NEAREST mode before the first Image, not every draw', () => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding()); renderer.draw(world()); renderer.draw(world([probe()], 240));
    expect(nativeFilterMode.NEAREST).not.toBe(nativeFilterMode.LINEAR); expect(scene.texture.filters).toEqual([nativeFilterMode.NEAREST]); expect(scene.events[0]).toBe(`filter:${nativeFilterMode.NEAREST}`);
    expect(scene.events.indexOf('image')).toBeGreaterThan(0);
  });
  it.each([
    { cutWidth: 31 }, { cutHeight: 31 }, { width: 31 }, { height: 31 }, { realWidth: 64 }, { realHeight: 64 }, { x: 1 }, { y: 1 }, { trimmed: true }, { rotated: true },
    { cutX: -1 }, { cutY: -1 }, { cutX: 0.5 }, { cutY: NaN }, { cutX: 128 }, { cutY: 1 }, { source: undefined },
    { source: { width: 31, height: 32 } }, { source: { width: 128, height: 31 } }, { source: { width: Infinity, height: 32 } }, { source: { width: 128.5, height: 32 } },
  ])('cleans an existing body for invalid actual frame metadata %j', patch => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding()); renderer.draw(world());
    Object.assign(scene.texture.get('unit-consume'), patch); // Required even while the current phase is seek.
    expect([...renderer.draw(world())]).toEqual([]); expect(scene.images[0].destroyed).toBe(1); expect(scene.images).toHaveLength(1);
  });
  it.each(['texture', 'unused-frame', 'exists-error', 'texture-error', 'has-error', 'frame-error'] as const)('cleans after %s failure and recovers on the next valid draw', fault => {
    const binding = unitBinding(), scene = new SceneDouble(binding), renderer = new ProbeSpriteRenderer(scene, binding); renderer.draw(world());
    if (fault === 'texture') scene.available = false;
    if (fault === 'unused-frame') scene.texture.frames.delete('unit-consume');
    if (fault === 'exists-error') scene.failExists = true;
    if (fault === 'texture-error') scene.failTexture = true;
    if (fault === 'has-error') scene.texture.failHas = true;
    if (fault === 'frame-error') scene.texture.failGet = true;
    expect([...renderer.draw(world())]).toEqual([]); expect(scene.images[0].destroyed).toBe(1);
    scene.available = true; scene.failExists = false; scene.failTexture = false; scene.texture = new TextureDouble(binding, scene.events);
    expect([...renderer.draw(world())]).toEqual([1]); expect(scene.images).toHaveLength(2);
  });
  it.each(['texture', 'frame', 'source', 'image-data', 'source-data', 'valid-cut'] as const)('rebuilds owned Images when %s identity/content coordinates change', change => {
    const binding = unitBinding(), scene = new SceneDouble(binding), renderer = new ProbeSpriteRenderer(scene, binding); renderer.draw(world());
    const previousTexture = scene.texture, previousFrame = scene.texture.get('unit-seek-a');
    if (change === 'texture') scene.texture = new TextureDouble(binding, scene.events);
    if (change === 'frame') scene.texture.frames.set('unit-seek-a', { ...previousFrame });
    if (change === 'source') previousFrame.source = { ...previousFrame.source };
    if (change === 'image-data') previousFrame.source.image = { version: 2 };
    if (change === 'source-data') previousFrame.source.source = { version: 2 };
    if (change === 'valid-cut') previousFrame.cutX = 1;
    expect([...renderer.draw(world())]).toEqual([1]); expect(scene.images).toHaveLength(2); expect(scene.images[0].destroyed).toBe(1); expect(scene.images[1].destroyed).toBe(0);
    expect(scene.images[1].texture).toBe(scene.texture); expect(previousTexture.destroy).not.toHaveBeenCalled();
  });
  it('drops a failed filter or partial allocation instead of leaving stale/partial overlays', () => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding()); scene.texture.failFilter = true;
    expect([...renderer.draw(world())]).toEqual([]); expect(scene.images).toHaveLength(0);
    scene.texture.failFilter = false; scene.failImageAt = 1;
    expect([...renderer.draw(world([probe(), probe({ id: 2 })]))]).toEqual([]); expect(scene.images).toHaveLength(1); expect(scene.images[0].destroyed).toBe(1);
    scene.failImageAt = -1; expect([...renderer.draw(world([probe(), probe({ id: 2 })]))]).toEqual([1, 2]); expect(scene.images).toHaveLength(3);
  });
  it('cleans all owned bodies if an Image update fails, then can recover', () => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding()), input = world([probe(), probe({ id: 2 })]); renderer.draw(input);
    scene.images[0].failPosition = true; expect([...renderer.draw(input)]).toEqual([]); expect(scene.images.map(image => image.destroyed)).toEqual([1, 1]);
    expect([...renderer.draw(input)]).toEqual([1, 2]); expect(scene.images).toHaveLength(4);
  });
  it.each([{ id: 0 }, { id: -1 }, { id: 1.5 }, { id: NaN }, { hp: 0 }, { hp: -1 }, { hp: NaN }, { hp: Infinity }, { x: NaN }, { y: Infinity }, { phase: 'invalid' as Probe['phase'] }])('removes invalid/dead actor %j without removing the unrelated live id', patch => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding()), other = probe({ id: 9 }); renderer.draw(world([probe(), other]));
    expect([...renderer.draw(world([probe(patch), other]))]).toEqual([9]); expect(scene.images.map(image => image.destroyed)).toEqual([1, 0]); expect(scene.images).toHaveLength(2);
  });
  it('removes missing ids and fails closed on duplicates instead of creating copy art', () => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding()); renderer.draw(world([probe(), probe({ id: 2 })]));
    expect([...renderer.draw(world([probe({ id: 2 })]))]).toEqual([2]); expect(scene.images.map(image => image.destroyed)).toEqual([1, 0]);
    expect([...renderer.draw(world([probe({ id: 2 }), probe({ id: 2, x: 300 })]))]).toEqual([]); expect(scene.images.map(image => image.destroyed)).toEqual([1, 1]);
    expect([...renderer.draw(world([]))]).toEqual([]); expect(scene.images).toHaveLength(2);
  });
  it('cleans on factory loss, run change and actual chapter change, but not a saved-next-stage field', () => {
    const scene = new SceneDouble(), renderer = new ProbeSpriteRenderer(scene, unitBinding()), original = world(); renderer.draw(original);
    const savedNextStage = { ...original, save: { ...original.save, stage: 3 } }; renderer.draw(savedNextStage); expect(scene.images).toHaveLength(1);
    expect([...renderer.draw({ ...original, factory: null })]).toEqual([]); expect(scene.images[0].destroyed).toBe(1);
    renderer.draw(original); renderer.draw(world([probe()], 0, 'run-b')); expect(scene.images.map(image => image.destroyed)).toEqual([1, 1, 0]);
    expect([...renderer.draw(world([probe()], 0, 'run-b', 3))]).toEqual([]); expect(scene.images.map(image => image.destroyed)).toEqual([1, 1, 1]);
    expect([...renderer.draw(world([probe()], 0, 'run-b', 2))]).toEqual([1]); expect(scene.images).toHaveLength(4);
  });
  it('keeps instance ownership independent and destroys idempotently without recreation', () => {
    const scene = new SceneDouble(), first = new ProbeSpriteRenderer(scene, unitBinding()), second = new ProbeSpriteRenderer(scene, unitBinding());
    const owned = first.draw(world()); second.draw(world()); (owned as Set<number>).clear(); expect([...first.draw(world())]).toEqual([1]);
    first.destroy(); first.destroy(); expect([...first.draw(world())]).toEqual([]); expect(scene.images.map(image => image.destroyed)).toEqual([1, 0]);
    expect([...second.draw(world())]).toEqual([1]); second.destroy(); expect(scene.images.map(image => image.destroyed)).toEqual([1, 1]); expect(scene.texture.destroy).not.toHaveBeenCalled();
  });
});
