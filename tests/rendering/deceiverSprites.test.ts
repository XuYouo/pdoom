import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { enemyRect, type Enemy } from '../../src/pages/GamePage/game/entities/model';
import { DECEIVER_ASSET, ENEMY_ASSETS, PARROT_ASSET, REPEATER_ASSET, deceiverFrameAt, deceiverRevealedAt, enemyFrameAt } from '../../src/pages/GamePage/game/data/enemyAssets';
import { EnemySpriteRenderer, type EnemySpriteImage, type EnemySpriteScene, type EnemySpriteWorld } from '../../src/pages/GamePage/game/systems/EnemySpriteRenderer';
import { advanceCombat } from '../../src/pages/GamePage/game/systems/combat';
import { contextEffects } from '../../src/pages/GamePage/game/systems/context';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';

// Explicit unit-only bindings, not guessed filenames or replacement production atlases.
const P = ['unit-p0', 'unit-p1', 'unit-p2', 'unit-p3'] as const;
const R = ['unit-r0', 'unit-r1', 'unit-r2', 'unit-r3'] as const;
const D = ['unit-friendly-0', 'unit-friendly-1', 'unit-friendly-tell', 'unit-friendly-recover', 'unit-revealed-0', 'unit-revealed-1', 'unit-revealed-tell', 'unit-revealed-recover'] as const;
const families = ['parrot', 'repeater', 'deceiver'] as const;
const assets = { parrot: PARROT_ASSET, repeater: REPEATER_ASSET, deceiver: DECEIVER_ASSET } as const;
const names = { parrot: P, repeater: R, deceiver: D } as const;
class ImageDouble implements EnemySpriteImage {
  x = 0; y = 0; origin = [0, 0]; scale = 0; depth = 0; flipX = false; destroyed = 0;
  constructor(readonly texture: string, public frame: string) {}
  setFrame(frame: string) { this.frame = frame; this.origin = [0, 0]; }
  setDisplayOrigin(x: number, y: number) { this.origin = [x, y]; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; }
  setFlipX(value: boolean) { this.flipX = value; }
  setScale(value: number) { this.scale = value; }
  setDepth(value: number) { this.depth = value; }
  destroy() { this.destroyed++; }
}
class SceneDouble implements EnemySpriteScene {
  readonly resources = new Map<string, Set<string>>(families.map(kind => [assets[kind].key, new Set<string>(names[kind])]));
  readonly images: ImageDouble[] = [];
  readonly textures = {
    exists: vi.fn((key: string) => this.resources.has(key)),
    get: vi.fn((key: string) => ({ has: (frame: string) => this.resources.get(key)?.has(frame) ?? false })),
  };
  readonly add = { image: vi.fn((_x: number, _y: number, texture: string, frame: string) => { const image = new ImageDouble(texture, frame); this.images.push(image); return image; }) };
}
const enemy = (kind: Enemy['kind'] = 'deceiver', patch: Partial<Enemy> = {}): Readonly<Enemy> => Object.freeze({ id: kind, kind, hp: 32, x: 170.4, y: 306, homeX: 170, homeY: 306, phase: 'idle', phaseUntil: 600, ...patch });
const mixed = () => families.map(kind => enemy(kind));
function world(enemies: readonly Readonly<Enemy>[] = mixed(), elapsedMs = 0, insightUntil?: number, runId = 'run-a', stage = 1, playerX = 40): EnemySpriteWorld {
  return Object.freeze({ save: Object.freeze({ runId, elapsedMs }), chapter: Object.freeze({ stage }), player: Object.freeze({ x: playerX, ...(insightUntil === undefined ? {} : { insightUntil }) }), enemies: Object.freeze([...enemies]) });
}
const adapter = (scene: SceneDouble) => new EnemySpriteRenderer(scene, P, R, D);
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('deceiver simulation-window frame projection', () => {
  it('declares the agreed eight-frame two-state layout without changing either prior family', () => {
    expect(DECEIVER_ASSET).toMatchObject({ kind: 'deceiver', key: 'enemy-deceiver', image: 'game/deceiver.png', atlas: 'game/deceiver.json', frameWidth: 48, frameHeight: 48, frameCount: 8, pivot: { x: 24, y: 30 }, idleDurations: [400, 600], frameDurations: [400, 600, 180, 140, 400, 600, 180, 140] });
    expect(Object.isFrozen(DECEIVER_ASSET)).toBe(true); expect(Object.isFrozen(DECEIVER_ASSET.frames)).toBe(true); expect(Object.isFrozen(DECEIVER_ASSET.pivot)).toBe(true);
    expect(PARROT_ASSET.frameCount).toBe(4); expect(REPEATER_ASSET.frameCount).toBe(4);
    for (const asset of ENEMY_ASSETS) expect(asset.frames).toHaveLength(asset.frameCount);
  });
  it.each([
    { now: 0, until: undefined, active: false }, { now: 0, until: 0, active: false }, { now: 0, until: 1, active: true },
    { now: 399.999, until: 400, active: true }, { now: 400, until: 400, active: false }, { now: 401, until: 400, active: false },
    { now: 999.999, until: 1000, active: true }, { now: 1000, until: 1000, active: false }, { now: 1000, until: 1001, active: true },
    { now: 0, until: -1, active: false }, { now: 0, until: NaN, active: false }, { now: 0, until: Infinity, active: false }, { now: 0, until: -Infinity, active: false },
    { now: NaN, until: 1000, active: false }, { now: Infinity, until: 1000, active: false }, { now: -Infinity, until: 1000, active: false },
  ])('selects active=$active for simulation $now and E end $until', ({ now, until, active }) => {
    expect(deceiverRevealedAt(now, until)).toBe(active);
    for (const phase of ['idle', 'tell', 'recover'] as const) expect(deceiverFrameAt(phase, now, until)).toBe(enemyFrameAt(DECEIVER_ASSET, phase, now) + (active ? 4 : 0));
  });
  it.each([{ phase: 'idle', expected: 5 }, { phase: 'tell', expected: 6 }, { phase: 'recover', expected: 7 }] as const)('maps the real $phase phase to revealed frame $expected without phase prediction', ({ phase, expected }) => {
    expect(deceiverFrameAt(phase, 400, 401)).toBe(expected); expect(deceiverFrameAt(phase, 400, 400)).toBe(expected - 4);
  });
});

describe('single renderer, three resource families and two appearances', () => {
  it('reads the actual optional E field without mutating model, geometry or the previous constructor bindings', () => {
    const scene = new SceneDouble(), renderer = adapter(scene), snapshot = world([...mixed(), enemy('chinchilla')], 450, 451);
    const before = JSON.stringify(snapshot), hitboxes = snapshot.enemies.map(enemyRect);
    expect([...renderer.draw(snapshot)]).toEqual([...families]); expect(scene.images.map(image => image.frame)).toEqual([P[1], R[1], D[5]]);
    for (const image of scene.images) expect(image).toMatchObject({ origin: [24, 30], x: 170, y: 306, scale: 1, depth: 2, flipX: false });
    expect(JSON.stringify(snapshot)).toBe(before); expect(snapshot.enemies.map(enemyRect)).toEqual(hitboxes); expect(hitboxes[2]).toMatchObject({ w: 24, h: 24 });
  });
  it('keeps legacy worlds without insightUntil friendly, rather than inventing an E session', () => {
    const scene = new SceneDouble(), renderer = adapter(scene), legacy = world([enemy()], 450);
    expect('insightUntil' in legacy.player).toBe(false); renderer.draw(legacy); expect(scene.images[0].frame).toBe(D[1]);
  });
  it('changes appearance in place and returns to friendly at the exact end instant without restarting the FSM', () => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world([enemy('deceiver', { phase: 'recover' })], 500)); const image = scene.images[0];
    expect(image.frame).toBe(D[3]); renderer.draw(world([enemy('deceiver', { phase: 'recover' })], 500, 501)); expect(image.frame).toBe(D[7]);
    renderer.draw(world([enemy('deceiver', { phase: 'recover' })], 501, 501)); expect(image.frame).toBe(D[3]); expect(image.origin).toEqual([24, 30]);
    expect(scene.images).toHaveLength(1); expect(image.destroyed).toBe(0);
  });
  it('does not reveal on non-finite or non-numeric runtime input', () => {
    const scene = new SceneDouble(), renderer = adapter(scene);
    for (const until of [undefined, NaN, Infinity, -Infinity, '9999' as unknown as number]) { renderer.draw(world([enemy()], 450, until)); expect(scene.images[0].frame).toBe(D[1]); }
    for (const now of [NaN, Infinity, -Infinity]) { renderer.draw(world([enemy()], now, 1000)); expect(scene.images[0].frame).toBe(D[0]); }
  });
  it('holds revealed animation while paused on the same simulation time, then expires only when simulation advances', () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const scene = new SceneDouble(), renderer = adapter(scene), snapshot = world(mixed(), 450, 451); renderer.draw(snapshot);
    vi.advanceTimersByTime(120000); renderer.draw(snapshot); expect(scene.images.map(image => image.frame)).toEqual([P[1], R[1], D[5]]); expect(vi.getTimerCount()).toBe(0);
    renderer.draw(world(mixed(), 451, 451)); expect(scene.images.map(image => image.frame)).toEqual([P[1], R[1], D[1]]); expect(scene.images).toHaveLength(3);
  });
  it.each([
    { kind: 'parrot', cause: 'texture' }, { kind: 'parrot', cause: 'frame' }, { kind: 'repeater', cause: 'texture' },
    { kind: 'repeater', cause: 'frame' }, { kind: 'deceiver', cause: 'texture' }, { kind: 'deceiver', cause: 'frame' },
  ] as const)('isolates a missing $kind $cause from the two other families', ({ kind, cause }) => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world(mixed(), 0, 1000)); const original = [...scene.images];
    if (cause === 'texture') scene.resources.delete(assets[kind].key); else scene.resources.get(assets[kind].key)!.delete(names[kind].at(-1)!);
    expect([...renderer.draw(world(mixed(), 0, 1000))]).toEqual(families.filter(value => value !== kind));
    expect(original.map(image => image.destroyed)).toEqual(families.map(value => value === kind ? 1 : 0));
    scene.resources.set(assets[kind].key, new Set<string>(names[kind])); expect([...renderer.draw(world(mixed(), 0, 1000))]).toEqual([...families]);
    expect(scene.images).toHaveLength(4); expect(original.map(image => image.destroyed)).toEqual(families.map(value => value === kind ? 1 : 0));
  });
  it('refuses partial four-frame or duplicate deceiver bindings even when friendly is currently selected', () => {
    for (const binding of [D.slice(0, 4), [D[0], D[0], ...D.slice(2)], []]) {
      const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, P, R, binding);
      expect([...renderer.draw(world())]).toEqual(['parrot', 'repeater']); expect(scene.images).toHaveLength(2);
    }
  });
  it.each([
    { from: 'parrot', to: 'deceiver' }, { from: 'repeater', to: 'deceiver' },
    { from: 'deceiver', to: 'parrot' }, { from: 'deceiver', to: 'repeater' },
  ] as const)('rebuilds same-ID $from to $to even when friendly frame names are shared', ({ from, to }) => {
    const scene = new SceneDouble(); const shared = ['same-0', 'same-1', 'same-tell', 'same-recover'] as const, twoStates = [...shared, ...D.slice(4)];
    scene.resources.set(PARROT_ASSET.key, new Set(shared)); scene.resources.set(REPEATER_ASSET.key, new Set(shared)); scene.resources.set(DECEIVER_ASSET.key, new Set(twoStates));
    const renderer = new EnemySpriteRenderer(scene, shared, shared, twoStates); renderer.draw(world([enemy(from, { id: 'shared' })]));
    expect([...renderer.draw(world([enemy(to, { id: 'shared' })]))]).toEqual(['shared']); expect(scene.images).toHaveLength(2);
    expect(scene.images[0].destroyed).toBe(1); expect(scene.images[1].texture).toBe(assets[to].key); expect(scene.images[1].frame).toBe(shared[0]);
  });
  it('does not retain a revealed old image when the same ID changes to a missing family', () => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world([enemy('deceiver', { id: 'same' })], 0, 1000));
    scene.resources.delete(PARROT_ASSET.key); expect([...renderer.draw(world([enemy('parrot', { id: 'same' })], 0, 1000))]).toEqual([]); expect(scene.images[0].destroyed).toBe(1);
  });
  it('copies the eight-frame caller binding and keeps the original second/third arguments intact', () => {
    const scene = new SceneDouble(), bound: string[] = [...D], renderer = new EnemySpriteRenderer(scene, P, R, bound);
    bound[4] = 'changed-outside'; renderer.draw(world(mixed(), 0, 1000)); expect(scene.images.map(image => image.frame)).toEqual([P[0], R[0], D[4]]);
    const legacy = new SceneDouble(); new EnemySpriteRenderer(legacy, P, R).draw(world([enemy('parrot'), enemy('repeater')]));
    expect(legacy.images.map(image => image.frame)).toEqual([P[0], R[0]]);
  });
  it('uses the center pivot and real target facing without moving the revealed body toward the weak point', () => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world([enemy()], 500, 1000, 'run-a', 1, 300));
    expect(scene.images[0]).toMatchObject({ x: 170, y: 306, origin: [24, 30], flipX: true }); expect(DECEIVER_ASSET.pivot.y - 19).toBe(11);
    renderer.draw(world([enemy()], 1000, 1000)); expect(scene.images[0]).toMatchObject({ x: 170, y: 306, origin: [24, 30], flipX: false });
  });
  it('cleans dead and missing revealed actors while preserving the other families', () => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world(mixed(), 0, 1000));
    renderer.draw(world([enemy('parrot'), enemy('repeater'), enemy('deceiver', { hp: 0 })], 0, 1000));
    expect(scene.images.map(image => image.destroyed)).toEqual([0, 0, 1]); renderer.draw(world([], 0, 1000)); expect(scene.images.map(image => image.destroyed)).toEqual([1, 1, 1]);
  });
  it.each([{ runId: 'run-b', stage: 1 }, { runId: 'run-a', stage: 2 }])('cleans all appearances on a real context transition to $runId/$stage', ({ runId, stage }) => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world(mixed(), 0, 1000)); renderer.draw(world(mixed(), 0, undefined, runId, stage));
    expect(scene.images.map(image => image.destroyed)).toEqual([1, 1, 1, 0, 0, 0]); expect(scene.images[5].frame).toBe(D[0]);
  });
  it('disposes once and never recreates friendly or revealed images afterward', () => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world(mixed(), 0, 1000)); renderer.destroy(); renderer.destroy();
    expect([...renderer.draw(world(mixed(), 0, 1000))]).toEqual([]); expect(scene.images.map(image => image.destroyed)).toEqual([1, 1, 1]);
  });
});

interface AtlasDocument {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; rotated: boolean; trimmed: boolean; spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; size: { w: number; h: number }; scale: string; frameTags: { name: string; from: number; to: number; direction: string }[]; layers: { name: string }[] };
}
const sourceLayers = ['feet', 'cloak', 'mask', 'hand', 'body', 'coil-right', 'coil-left', 'network', 'shards'];
const nativeAtlas = () => JSON.parse(readFileSync(new URL(`../../public/${DECEIVER_ASSET.atlas}`, import.meta.url), 'utf8')) as AtlasDocument;
// Decoder is test-only and read-only. The published source format was inspected before these assertions were added.
function nativePixels() {
  const png = readFileSync(new URL(`../../public/${DECEIVER_ASSET.image}`, import.meta.url)), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(png.toString('ascii', 12, 16)).toBe('IHDR');
  expect([width, height]).toEqual([384, 48]); expect([png[24], png[25], png[26], png[27], png[28]]).toEqual([8, 6, 0, 0, 0]);
  const parts: Buffer[] = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = width * 4, rgba = Buffer.alloc(width * height * 4);
  expect(raw.length).toBe(height * (stride + 1));
  const paeth = (a: number, b: number, c: number) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, left = x >= 4 ? rgba[index - 4] : 0, up = y ? rgba[index - stride] : 0, upperLeft = y && x >= 4 ? rgba[index - stride - 4] : 0;
      rgba[index] = (raw[y * (stride + 1) + 1 + x] + [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter]) & 255;
    }
  }
  return (frame: number, x: number, y: number) => rgba.subarray((y * width + frame * 48 + x) * 4, (y * width + frame * 48 + x) * 4 + 4);
}

describe('approved formal deceiver source and atlas (not native-game acceptance)', () => {
  it('publishes the one three-family manifest and the actual eight keys, timings, state tags and layers', () => {
    expect(ENEMY_ASSETS).toEqual([PARROT_ASSET, REPEATER_ASSET, DECEIVER_ASSET]); expect(new Set(ENEMY_ASSETS.map(asset => asset.key)).size).toBe(3);
    const atlas = nativeAtlas(); expect(atlas.frames).toHaveLength(8); expect(atlas.frames.map(frame => frame.filename)).toEqual(DECEIVER_ASSET.frames);
    expect(new Set(atlas.frames.map(frame => frame.filename)).size).toBe(8); expect(atlas.frames.map(frame => frame.duration)).toEqual(DECEIVER_ASSET.frameDurations);
    for (const [index, frame] of atlas.frames.entries()) {
      expect(frame.frame).toEqual({ x: index * 48, y: 0, w: 48, h: 48 }); expect(frame.rotated).toBe(false); expect(frame.trimmed).toBe(false);
      expect(frame.sourceSize).toEqual({ w: 48, h: 48 }); expect(frame.spriteSourceSize).toEqual({ x: 0, y: 0, w: 48, h: 48 });
    }
    expect(atlas.meta.image).toBe('deceiver.png'); expect(atlas.meta.size).toEqual({ w: 384, h: 48 }); expect(atlas.meta.scale).toBe('1');
    expect(atlas.meta.frameTags.map(({ name, from, to, direction }) => ({ name, from, to, direction }))).toEqual([
      { name: 'friendly-idle', from: 0, to: 1, direction: 'forward' }, { name: 'friendly-tell', from: 2, to: 2, direction: 'forward' }, { name: 'friendly-recover', from: 3, to: 3, direction: 'forward' },
      { name: 'revealed-idle', from: 4, to: 5, direction: 'forward' }, { name: 'revealed-tell', from: 6, to: 6, direction: 'forward' }, { name: 'revealed-recover', from: 7, to: 7, direction: 'forward' },
    ]);
    expect(atlas.meta.layers.map(layer => layer.name)).toEqual(sourceLayers);
  });
  it('reads the genuine native source header, frame/chunk bounds, nine layers and twenty-entry palette', () => {
    const source = readFileSync(new URL('../../assets/source/deceiver.aseprite', import.meta.url));
    expect(source.readUInt32LE(0)).toBe(source.length); expect(source.readUInt16LE(4)).toBe(0xa5e0);
    expect([source.readUInt16LE(6), source.readUInt16LE(8), source.readUInt16LE(10), source.readUInt16LE(12)]).toEqual([8, 48, 48, 32]);
    const layers: string[] = [], palettes: number[] = [], durations: number[] = []; let offset = 128;
    for (let frame = 0; frame < 8; frame++) {
      const end = offset + source.readUInt32LE(offset), chunks = source.readUInt32LE(offset + 12) || source.readUInt16LE(offset + 6);
      expect(end).toBeLessThanOrEqual(source.length); expect(source.readUInt16LE(offset + 4)).toBe(0xf1fa); durations.push(source.readUInt16LE(offset + 8));
      let chunk = offset + 16;
      for (let index = 0; index < chunks; index++) {
        const size = source.readUInt32LE(chunk), type = source.readUInt16LE(chunk + 4); expect(size).toBeGreaterThanOrEqual(6); expect(chunk + size).toBeLessThanOrEqual(end);
        if (type === 0x2004) { const length = source.readUInt16LE(chunk + 22); expect(24 + length).toBeLessThanOrEqual(size); layers.push(source.toString('utf8', chunk + 24, chunk + 24 + length)); }
        if (type === 0x2019) palettes.push(source.readUInt32LE(chunk + 6));
        chunk += size;
      }
      expect(chunk).toBe(end); offset = end;
    }
    expect(offset).toBe(source.length); expect(layers).toEqual(sourceLayers); expect(palettes).toEqual([20]); expect(durations).toEqual(DECEIVER_ASSET.frameDurations);
  });
  it('keeps measured native hard alpha, palette, occupied geometry and exact protagonist-orange exclusion', () => {
    const at = nativePixels(), colors = new Set<string>(), areas: number[] = [], bounds: number[][] = [];
    for (let frame = 0; frame < 8; frame++) {
      let opaque = 0, reserved = 0, minX = 48, minY = 48, maxX = -1, maxY = -1;
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const pixel = at(frame, x, y), [r, g, b, a] = pixel; expect(a === 0 || a === 255).toBe(true); if (!a) continue;
        opaque++; colors.add(pixel.subarray(0, 3).toString('hex')); if (r === 217 && g === 119 && b === 87) reserved++;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      expect(reserved).toBe(0); areas.push(opaque); bounds.push([minX, minY, maxX + 1, maxY + 1]);
    }
    expect(areas).toEqual([643, 639, 646, 639, 764, 771, 768, 758]); expect(colors.size).toBe(14); expect(colors.size).toBeLessThanOrEqual(20);
    expect(bounds).toEqual([[9, 11, 39, 45], [9, 11, 39, 45], [7, 11, 39, 45], [10, 11, 39, 45], [2, 11, 46, 45], [2, 11, 46, 45], [1, 11, 46, 45], [3, 11, 46, 45]]);
  });
  it('has eight visually unique frame rasters, rather than eight different names for duplicate art', () => {
    const at = nativePixels(), rasters = new Set<string>();
    for (let frame = 0; frame < 8; frame++) {
      const pixels = Array.from({ length: 48 * 48 }, (_, index) => { const pixel = at(frame, index % 48, Math.floor(index / 48)); return pixel[3] ? [...pixel] : [0, 0, 0, 0]; }).flat();
      rasters.add(Buffer.from(pixels).toString('hex')); // Transparent RGB does not count as a visible difference.
    }
    expect(rasters.size).toBe(8);
  });
  it('locks the actually measured shared sole line without requiring different state silhouettes to have identical bottom rows', () => {
    const at = nativePixels();
    const soleLine = (frame: number) => Array.from({ length: 48 }, (_, x) => { const pixel = at(frame, x, 44); return pixel[3] ? [...pixel] : [0, 0, 0, 0]; }).flat();
    for (let frame = 0; frame < 8; frame++) {
      const soles: number[] = [];
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const alpha = at(frame, x, y)[3]; if (y === 44 && alpha) soles.push(x);
        if (y > 44 || y === 0 || x === 0 || x === 47) expect(alpha).toBe(0);
      }
      expect(soles).toEqual([18, 19, 20, 21, 22, 23, 28, 29, 30, 31, 32, 33]); expect([24, 25, 26, 27].map(x => at(frame, x, 44)[3])).toEqual([0, 0, 0, 0]);
      expect(soleLine(frame)).toEqual(soleLine(0));
    }
    expect(44 - DECEIVER_ASSET.pivot.y).toBe(14); expect(DECEIVER_ASSET.pivot.y - 19).toBe(11);
  });
  it('uses the actual default eight keys for every phase and reverts precisely at E expiry without an override', () => {
    const scene = new SceneDouble(); for (const kind of families) scene.resources.set(assets[kind].key, new Set<string>(assets[kind].frames));
    const renderer = new EnemySpriteRenderer(scene);
    for (const phase of ['idle', 'tell', 'recover'] as const) {
      const actor = enemy('deceiver', { phase }), base = enemyFrameAt(DECEIVER_ASSET, phase, 400);
      renderer.draw(world([actor], 400, 401)); expect(scene.images[0].frame).toBe(DECEIVER_ASSET.frames[base + 4]);
      renderer.draw(world([actor], 401, 401)); expect(scene.images[0].frame).toBe(DECEIVER_ASSET.frames[base]);
    }
    expect(scene.images).toHaveLength(1); expect(scene.images[0].origin).toEqual([24, 30]); expect(scene.images[0].destroyed).toBe(0);
  });
});

describe('actual simulation geometry remains authoritative', () => {
  it.each([
    { lens: false, offset: 0, active: true, hit: true, radius: 5 }, { lens: false, offset: 0, active: false, hit: false, radius: 5 },
    { lens: false, offset: 7, active: true, hit: false, radius: 5 }, { lens: true, offset: 7, active: true, hit: true, radius: 8 },
    { lens: true, offset: 8.5, active: true, hit: false, radius: 8 }, { lens: true, offset: 7, active: false, hit: false, radius: 8 },
  ])('uses real y−19 core geometry with radius $radius, offset $offset, active=$active', ({ lens, offset, active, hit, radius }) => {
    const actual = createWorld({ ...createRun('33333333-3333-4333-8333-333333333333', 42), inventory: lens ? ['interpretability'] : [] });
    actual.save.elapsedMs = 1000; actual.player.insightUntil = active ? 1001 : 1000; actual.enemies = [{ ...enemy('deceiver', { x: 170, y: 200 }) }];
    const target = actual.enemies[0]; const before = JSON.stringify(actual), body = enemyRect(target), scene = new SceneDouble();
    adapter(scene).draw(actual); expect(JSON.stringify(actual)).toBe(before); expect(scene.images[0].frame).toBe(active ? D[4] : D[0]);
    expect(body).toEqual({ x: 158, y: 188, w: 24, h: 24 }); expect(contextEffects(actual.save).coreRadius).toBe(radius);
    actual.bullets = [{ id: 1, x: target.x + offset, y: target.y - 19, vx: 0, vy: 0, radius: 0, damage: 1, faction: 'player', kind: 'dictionary', expiresAt: 2000 }];
    advanceCombat(actual, { x: actual.player.x, y: actual.player.y }, [], 1000, 0);
    expect(actual.enemies[0].hp).toBe(hit ? 0 : 32); expect(enemyRect(actual.enemies[0])).toEqual(body);
  });
});
