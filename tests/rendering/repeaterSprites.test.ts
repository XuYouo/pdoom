import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enemyRect, type Enemy } from '../../src/pages/GamePage/game/entities/model';
import { ENEMY_ASSETS, PARROT_ASSET, REPEATER_ASSET, DECEIVER_ASSET, parrotFrameAt, repeaterFrameAt, type EnemySpriteKind, type ParrotFrameNames } from '../../src/pages/GamePage/game/data/enemyAssets';
import { EnemySpriteRenderer, type EnemySpriteImage, type EnemySpriteScene, type EnemySpriteWorld } from '../../src/pages/GamePage/game/systems/EnemySpriteRenderer';

// Explicit port doubles only. These strings do not claim to be real repeater export keys.
const P = ['unit-parrot-0', 'unit-parrot-1', 'unit-parrot-tell', 'unit-parrot-recover'] as const;
const R = ['unit-repeater-0', 'unit-repeater-1', 'unit-repeater-tell', 'unit-repeater-recover'] as const;
const keyFor = (kind: EnemySpriteKind) => kind === 'parrot' ? PARROT_ASSET.key : REPEATER_ASSET.key;
const namesFor = (kind: EnemySpriteKind) => kind === 'parrot' ? P : R;
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
  readonly resources = new Map<string, Set<string>>([[PARROT_ASSET.key, new Set(P)], [REPEATER_ASSET.key, new Set(R)]]);
  readonly images: ImageDouble[] = [];
  readonly textures = {
    exists: vi.fn((key: string) => this.resources.has(key)),
    get: vi.fn((key: string) => ({ has: (frame: string) => this.resources.get(key)?.has(frame) ?? false })),
  };
  readonly add = { image: vi.fn((_x: number, _y: number, texture: string, frame: string) => { const image = new ImageDouble(texture, frame); this.images.push(image); return image; }) };
}
const enemy = (kind: Enemy['kind'], patch: Partial<Enemy> = {}): Readonly<Enemy> => Object.freeze({ id: kind, kind, hp: 32, x: 170.4, y: 306, homeX: 170, homeY: 306, phase: 'idle', phaseUntil: 600, ...patch });
const mixed = () => [enemy('parrot'), enemy('repeater')];
function world(enemies: readonly Readonly<Enemy>[] = mixed(), elapsedMs = 0, runId = 'run-a', stage = 1, playerX = 40): EnemySpriteWorld {
  return Object.freeze({ save: Object.freeze({ runId, elapsedMs }), chapter: Object.freeze({ stage }), player: Object.freeze({ x: playerX }), enemies: Object.freeze([...enemies]) });
}
const adapter = (scene: SceneDouble) => new EnemySpriteRenderer(scene, P, R);
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('repeater descriptor and pure FSM frame selection', () => {
  it('keeps the confirmed machine geometry/timing immutable, while the loader list contains only bound exports', () => {
    expect(REPEATER_ASSET).toMatchObject({ kind: 'repeater', key: 'enemy-repeater', image: 'game/repeater.png', atlas: 'game/repeater.json', frameWidth: 48, frameHeight: 48, frameCount: 4, pivot: { x: 24, y: 30 }, facing: 'left', idleDurations: [400, 600], frameDurations: [400, 600, 180, 140] });
    expect(Object.isFrozen(REPEATER_ASSET)).toBe(true); expect(Object.isFrozen(REPEATER_ASSET.pivot)).toBe(true); expect(Object.isFrozen(REPEATER_ASSET.frames)).toBe(true);
    expect(Object.isFrozen(ENEMY_ASSETS)).toBe(true); expect(ENEMY_ASSETS).toContain(PARROT_ASSET);
    for (const asset of ENEMY_ASSETS) { expect(asset.frames).toHaveLength(asset.frameCount); expect(Object.isFrozen(asset)).toBe(true); }
  });
  it.each([[0, 0], [399.999, 0], [400, 1], [999.999, 1], [1000, 0], [1400, 1], [-1, 0], [NaN, 0], [Infinity, 0]])('uses the same approved idle cadence at %s without changing parrot compatibility', (time, frame) => {
    expect(repeaterFrameAt('idle', time)).toBe(frame); expect(parrotFrameAt('idle', time)).toBe(frame);
  });
  it.each(['tell', 'recover'] as const)('holds the %s frame for the authoritative FSM, not atlas duration callbacks', phase => {
    for (const time of [0, 399, 600, 120000, NaN]) expect(repeaterFrameAt(phase, time)).toBe(phase === 'tell' ? 2 : 3);
  });
});

interface AtlasDocument {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; rotated: boolean; trimmed: boolean; spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; size: { w: number; h: number }; scale: string; frameTags: { name: string; from: number; to: number; direction: string }[]; layers: { name: string }[] };
}
const nativePng = () => readFileSync(new URL(`../../public/${REPEATER_ASSET.image}`, import.meta.url));
const nativeAtlas = () => JSON.parse(readFileSync(new URL(`../../public/${REPEATER_ASSET.atlas}`, import.meta.url), 'utf8')) as AtlasDocument;
// Read-only test decoder for the verified native RGBA export, not a renderer or image writer.
function nativePixels() {
  const png = nativePng(), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(png.toString('ascii', 12, 16)).toBe('IHDR');
  expect([width, height]).toEqual([192, 48]); expect([png[24], png[25], png[26], png[27], png[28]]).toEqual([8, 6, 0, 0, 0]);
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
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter];
      rgba[index] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return (frame: number, x: number, y: number) => rgba.subarray((y * width + frame * 48 + x) * 4, (y * width + frame * 48 + x) * 4 + 4);
}

describe('verified formal repeater export, not a native-game acceptance claim', () => {
  it('publishes all three actual asset descriptors and locks repeater names, cells, timing, tags and layers', () => {
    expect(ENEMY_ASSETS).toEqual([PARROT_ASSET, REPEATER_ASSET, DECEIVER_ASSET]); expect(new Set(ENEMY_ASSETS.map(asset => asset.key)).size).toBe(3);
    const atlas = nativeAtlas(); expect(atlas.frames).toHaveLength(4);
    expect(atlas.frames.map(frame => frame.filename)).toEqual(REPEATER_ASSET.frames); expect(atlas.frames.map(frame => frame.duration)).toEqual(REPEATER_ASSET.frameDurations);
    for (const [index, frame] of atlas.frames.entries()) {
      expect(frame.frame).toEqual({ x: index * 48, y: 0, w: 48, h: 48 }); expect(frame.rotated).toBe(false); expect(frame.trimmed).toBe(false);
      expect(frame.sourceSize).toEqual({ w: 48, h: 48 }); expect(frame.spriteSourceSize).toEqual({ x: 0, y: 0, w: 48, h: 48 });
    }
    expect(atlas.meta.image).toBe('repeater.png'); expect(atlas.meta.size).toEqual({ w: 192, h: 48 }); expect(atlas.meta.scale).toBe('1');
    expect(atlas.meta.frameTags.map(({ name, from, to, direction }) => ({ name, from, to, direction }))).toEqual([
      { name: 'idle', from: 0, to: 1, direction: 'forward' }, { name: 'tell', from: 2, to: 2, direction: 'forward' }, { name: 'recover', from: 3, to: 3, direction: 'forward' },
    ]);
    expect(atlas.meta.layers.map(layer => layer.name)).toEqual(['feet', 'case', 'reels', 'speaker', 'spokes', 'lights']);
  });
  it('preserves native hard alpha, actual occupied bounds/areas and the exact Clawd-orange exclusion', () => {
    const at = nativePixels(), colors = new Set<string>(), areas: number[] = [], bounds: number[][] = [];
    for (let frame = 0; frame < 4; frame++) {
      let opaque = 0, reservedOrange = 0, minX = 48, minY = 48, maxX = -1, maxY = -1;
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const pixel = at(frame, x, y), [r, g, b, a] = pixel; expect(a === 0 || a === 255).toBe(true);
        if (!a) continue;
        opaque++; colors.add(pixel.subarray(0, 3).toString('hex')); if (r === 217 && g === 119 && b === 87) reservedOrange++;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      expect(reservedOrange).toBe(0); areas.push(opaque); bounds.push([minX, minY, maxX + 1, maxY + 1]);
    }
    expect(areas).toEqual([649, 649, 665, 649]); expect(bounds).toEqual([[12, 13, 36, 45], [12, 13, 36, 45], [10, 13, 36, 45], [12, 13, 36, 45]]);
    expect(colors.size).toBe(12); expect(colors.size).toBeLessThanOrEqual(20);
  });
  it('keeps complete identical feet, the three-pixel sole gap, and transparent cell margins in every frame', () => {
    const at = nativePixels();
    const feet = (frame: number) => Array.from({ length: 17 * 4 }, (_, index) => [...at(frame, 17 + index % 17, 41 + Math.floor(index / 17))]).flat();
    for (let frame = 0; frame < 4; frame++) {
      const soles: number[] = [];
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const alpha = at(frame, x, y)[3]; if (y === 44 && alpha) soles.push(x);
        if (y > 44 || y === 0 || x === 0 || x === 47) expect(alpha).toBe(0);
      }
      expect(soles).toEqual([17, 18, 19, 20, 21, 22, 23, 27, 28, 29, 30, 31, 32, 33]);
      expect([24, 25, 26].map(x => at(frame, x, 44)[3])).toEqual([0, 0, 0]); expect(feet(frame)).toEqual(feet(0));
    }
    expect(44 - REPEATER_ASSET.pivot.y).toBe(14);
  });
  it('keeps the fixed right housing alpha footprint while allowing authored grooves, reels and light RGB animation', () => {
    const at = nativePixels();
    const rightMask = (frame: number) => Array.from({ length: 12 * 48 }, (_, index) => at(frame, 24 + index % 12, Math.floor(index / 12))[3]);
    const pixels = (frame: number) => Array.from({ length: 48 * 48 }, (_, index) => [...at(frame, index % 48, Math.floor(index / 48))]).flat();
    for (const frame of [1, 2, 3]) expect(rightMask(frame)).toEqual(rightMask(0));
    expect(pixels(1)).not.toEqual(pixels(0)); expect(pixels(2)).not.toEqual(pixels(0)); expect(pixels(3)).not.toEqual(pixels(2));
    // In particular, tell's intentional 18px groove shadow is not constrained to match idle RGB.
  });
});

describe('one read-only renderer with independently available families', () => {
  it('handles both families in one pass, leaves unsupported kinds on Graphics, and does not mutate the frozen model or hitboxes', () => {
    const scene = new SceneDouble(), renderer = adapter(scene), snapshot = world([...mixed(), enemy('deceiver'), enemy('chinchilla')]);
    const before = JSON.stringify(snapshot), hitboxes = snapshot.enemies.map(enemyRect);
    expect([...renderer.draw(snapshot)]).toEqual(['parrot', 'repeater']); expect(scene.images.map(image => image.texture)).toEqual([PARROT_ASSET.key, REPEATER_ASSET.key]);
    for (const image of scene.images) expect(image).toMatchObject({ origin: [24, 30], x: 170, y: 306, scale: 1, depth: 2, flipX: false });
    expect(JSON.stringify(snapshot)).toBe(before); expect(snapshot.enemies.map(enemyRect)).toEqual(hitboxes); expect(hitboxes[1]).toMatchObject({ w: 24, h: 24 });
  });
  it('uses both actual default frame bindings without requiring either test override', () => {
    const scene = new SceneDouble();
    scene.resources.set(PARROT_ASSET.key, new Set(PARROT_ASSET.frames)); scene.resources.set(REPEATER_ASSET.key, new Set(REPEATER_ASSET.frames));
    const renderer = new EnemySpriteRenderer(scene);
    expect([...renderer.draw(world())]).toEqual(['parrot', 'repeater']); expect(scene.images.map(image => image.frame)).toEqual([PARROT_ASSET.frames[0], REPEATER_ASSET.frames[0]]);
    renderer.draw(world([enemy('parrot', { phase: 'tell' }), enemy('repeater', { phase: 'recover' })], 900));
    expect(scene.images.map(image => image.frame)).toEqual([PARROT_ASSET.frames[2], REPEATER_ASSET.frames[3]]);
  });
  it.each(['parrot', 'repeater'] as const)('missing %s on the first draw does not suppress the other family', missing => {
    const scene = new SceneDouble(), renderer = adapter(scene); scene.resources.delete(keyFor(missing));
    const present = missing === 'parrot' ? 'repeater' : 'parrot'; expect([...renderer.draw(world())]).toEqual([present]);
    expect(scene.images).toHaveLength(1); expect(scene.images[0].texture).toBe(keyFor(present));
  });
  it.each([
    { missing: 'parrot', cause: 'texture' }, { missing: 'parrot', cause: 'frame' },
    { missing: 'repeater', cause: 'texture' }, { missing: 'repeater', cause: 'frame' },
  ] as const)('losing a $missing $cause cleans only that family and recovers independently', ({ missing, cause }) => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world());
    const lost = scene.images.find(image => image.texture === keyFor(missing))!;
    const kept = scene.images.find(image => image.texture !== keyFor(missing))!;
    if (cause === 'texture') scene.resources.delete(keyFor(missing)); else scene.resources.get(keyFor(missing))!.delete(namesFor(missing)[3]);
    const present = missing === 'parrot' ? 'repeater' : 'parrot'; expect([...renderer.draw(world())]).toEqual([present]);
    expect(lost.destroyed).toBe(1); expect(kept.destroyed).toBe(0); expect(scene.images).toHaveLength(2);
    scene.resources.set(keyFor(missing), new Set(namesFor(missing))); expect([...renderer.draw(world())]).toEqual(['parrot', 'repeater']);
    expect(scene.images).toHaveLength(3); expect(kept.destroyed).toBe(0); expect(lost.destroyed).toBe(1);
  });
  it.each([{ from: 'parrot', to: 'repeater' }, { from: 'repeater', to: 'parrot' }] as const)('rebuilds same-ID $from to $to even when both textures have identical frame names', ({ from, to }) => {
    const scene = new SceneDouble(); const shared = ['idle-0', 'idle-1', 'tell', 'recover'] as const;
    scene.resources.set(PARROT_ASSET.key, new Set(shared)); scene.resources.set(REPEATER_ASSET.key, new Set(shared));
    const renderer = new EnemySpriteRenderer(scene, shared, shared);
    renderer.draw(world([enemy(from, { id: 'shared' })])); const old = scene.images[0];
    expect([...renderer.draw(world([enemy(to, { id: 'shared' })]))]).toEqual(['shared']);
    expect(old.destroyed).toBe(1); expect(scene.images).toHaveLength(2); expect(scene.images[1].texture).toBe(keyFor(to)); expect(scene.images[1].frame).toBe(shared[0]);
  });
  it('drops an old same-ID image when its replacement kind is missing, then creates only the requested family', () => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world([enemy('parrot', { id: 'shared' })]));
    scene.resources.delete(REPEATER_ASSET.key); expect([...renderer.draw(world([enemy('repeater', { id: 'shared' })]))]).toEqual([]); expect(scene.images[0].destroyed).toBe(1);
    scene.resources.set(REPEATER_ASSET.key, new Set(R)); renderer.draw(world([enemy('repeater', { id: 'shared' })]));
    expect(scene.images).toHaveLength(2); expect(scene.images[1].texture).toBe(REPEATER_ASSET.key);
  });
  it.each(['parrot', 'repeater'] as const)('invalid %s binding does not disable the other valid binding', invalid => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, (invalid === 'parrot' ? [] : P) as unknown as ParrotFrameNames, invalid === 'repeater' ? [] : R);
    expect([...renderer.draw(world())]).toEqual([invalid === 'parrot' ? 'repeater' : 'parrot']); expect(scene.images).toHaveLength(1);
  });
  it('preserves legacy parrot second-argument semantics and copies both supplied bindings', () => {
    const scene = new SceneDouble(); const p: [string, string, string, string] = [...P]; const r: string[] = [...R];
    const renderer = new EnemySpriteRenderer(scene, p, r); p[0] = 'caller-change'; r[0] = 'caller-change';
    renderer.draw(world()); expect(scene.images.map(image => image.frame)).toEqual([P[0], R[0]]);
    const legacyScene = new SceneDouble(), legacy = new EnemySpriteRenderer(legacyScene, P);
    expect([...legacy.draw(world([enemy('parrot')]))]).toEqual(['parrot']); expect(legacyScene.images[0].frame).toBe(P[0]);
  });
  it('freezes both families on a fixed simulation clock, without shell breathing or wall-clock timers', () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const scene = new SceneDouble(), renderer = adapter(scene), snapshot = world(mixed(), 399); renderer.draw(snapshot);
    vi.advanceTimersByTime(120000); renderer.draw(snapshot); expect(scene.images.map(image => image.frame)).toEqual([P[0], R[0]]);
    expect(vi.getTimerCount()).toBe(0); renderer.draw(world(mixed(), 400)); expect(scene.images.map(image => image.frame)).toEqual([P[1], R[1]]);
    for (const image of scene.images) expect(image).toMatchObject({ x: 170, y: 306, origin: [24, 30] });
  });
  it('selects each live phase independently and aims the authored left-facing images toward the real target', () => {
    const scene = new SceneDouble(), renderer = adapter(scene);
    renderer.draw(world([enemy('parrot', { phase: 'tell' }), enemy('repeater', { phase: 'recover' })], 1000, 'run-a', 1, 300));
    expect(scene.images.map(image => image.frame)).toEqual([P[2], R[3]]); expect(scene.images.every(image => image.flipX)).toBe(true);
    renderer.draw(world(mixed(), 0)); expect(scene.images.every(image => !image.flipX)).toBe(true); expect(scene.images.every(image => image.y === 306)).toBe(true);
  });
  it('cleans dead, missing and invalid-position entities without destroying the still-present family', () => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world());
    renderer.draw(world([enemy('parrot', { hp: 0 }), enemy('repeater')])); expect(scene.images[0].destroyed).toBe(1); expect(scene.images[1].destroyed).toBe(0);
    renderer.draw(world([enemy('repeater', { y: NaN })])); expect(scene.images[1].destroyed).toBe(1); renderer.draw(world([]));
    expect(scene.images.map(image => image.destroyed)).toEqual([1, 1]);
  });
  it.each([{ runId: 'run-b', stage: 1 }, { runId: 'run-a', stage: 2 }])('cleans both families when the real context changes to $runId/$stage', ({ runId, stage }) => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world()); renderer.draw(world(mixed(), 0, runId, stage));
    expect(scene.images.map(image => image.destroyed)).toEqual([1, 1, 0, 0]);
  });
  it('disposes both families once and never recreates afterward', () => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world()); renderer.destroy(); renderer.destroy();
    expect([...renderer.draw(world())]).toEqual([]); expect(scene.images.map(image => image.destroyed)).toEqual([1, 1]);
  });
});
