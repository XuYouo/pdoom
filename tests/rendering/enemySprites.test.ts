import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type * as Phaser from 'phaser';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { enemyRect, type Enemy } from '../../src/pages/GamePage/game/entities/model';
import { hasParrotArt, PARROT_ASSET, parrotFrameAt, type ParrotFrameNames } from '../../src/pages/GamePage/game/data/enemyAssets';
import { EnemySpriteRenderer, type EnemySpriteImage, type EnemySpriteScene, type EnemySpriteWorld } from '../../src/pages/GamePage/game/systems/EnemySpriteRenderer';

// These names are an adapter test double, NOT a claimed production atlas or a generated replacement image.
const TEST_FRAMES = ['unit-idle-0', 'unit-idle-1', 'unit-tell', 'unit-recover'] as const;
class ImageDouble implements EnemySpriteImage {
  x = 0; y = 0; origin = [0, 0]; scale = 0; depth = 0; flipX = false; destroyed = 0;
  readonly calls: string[] = [];
  constructor(readonly texture: string, public frame: string) {}
  setFrame(frame: string) { this.frame = frame; this.origin = [0, 0]; this.calls.push(`frame:${frame}`); }
  setDisplayOrigin(x: number, y: number) { this.origin = [x, y]; this.calls.push(`origin:${x},${y}`); }
  setPosition(x: number, y: number) { this.x = x; this.y = y; }
  setFlipX(value: boolean) { this.flipX = value; }
  setScale(value: number) { this.scale = value; }
  setDepth(value: number) { this.depth = value; }
  destroy() { this.destroyed++; }
}
class SceneDouble implements EnemySpriteScene {
  available = true;
  readonly missing = new Set<string>();
  readonly images: ImageDouble[] = [];
  readonly textures = {
    exists: vi.fn((key: string) => this.available && key === PARROT_ASSET.key),
    get: vi.fn((key: string) => ({ has: (name: string) => key === PARROT_ASSET.key && (TEST_FRAMES as readonly string[]).includes(name) && !this.missing.has(name) })),
  };
  readonly add = { image: vi.fn((_x: number, _y: number, texture: string, frame: string) => { const image = new ImageDouble(texture, frame); this.images.push(image); return image; }) };
}
const enemy = (patch: Partial<Enemy> = {}): Readonly<Enemy> => Object.freeze({ id: 'parrot-1', kind: 'parrot', hp: 32, x: 100.25, y: 306, homeX: 100, homeY: 306, phase: 'idle', phaseUntil: 600, ...patch });
function world(enemies: readonly Readonly<Enemy>[] = [enemy()], elapsedMs = 0, runId = 'run-a', stage = 1, playerX = 40): EnemySpriteWorld {
  return Object.freeze({ save: Object.freeze({ runId, elapsedMs }), chapter: Object.freeze({ stage }), player: Object.freeze({ x: playerX }), enemies: Object.freeze([...enemies]) });
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('parrot-only asset/frame description', () => {
  it('keeps the agreed native grid, center pivot and durations immutable', () => {
    expect(PARROT_ASSET).toMatchObject({ frameWidth: 48, frameHeight: 48, frameCount: 4, pivot: { x: 24, y: 30 }, facing: 'left', idleDurations: [400, 600] });
    expect(Object.isFrozen(PARROT_ASSET)).toBe(true); expect(Object.isFrozen(PARROT_ASSET.pivot)).toBe(true); expect(Object.isFrozen(PARROT_ASSET.idleDurations)).toBe(true);
  });
  it.each([[0, 0], [399.999, 0], [400, 1], [999.999, 1], [1000, 0], [1399.999, 0], [1400, 1], [-1, 0], [NaN, 0], [Infinity, 0]])('uses simulation time %s for idle frame %s', (now, frame) => {
    expect(parrotFrameAt('idle', now)).toBe(frame);
  });
  it.each(['tell', 'recover'] as const)('holds %s until the real phase changes, never by an animation callback', phase => {
    for (const now of [0, 399, 400, 10000, NaN]) expect(parrotFrameAt(phase, now)).toBe(phase === 'tell' ? 2 : 3);
  });
  it('never claims other enemy kinds, defeated parrots or invalid health as finished art', () => {
    expect(hasParrotArt(enemy())).toBe(true);
    for (const kind of ['repeater', 'deceiver', 'chinchilla'] as const) expect(hasParrotArt(enemy({ kind }))).toBe(false);
    for (const hp of [0, -1, NaN]) expect(hasParrotArt(enemy({ hp }))).toBe(false);
  });
});

interface AtlasDocument {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; rotated: boolean; trimmed: boolean; spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; size: { w: number; h: number }; scale: string; frameTags: { name: string; from: number; to: number; direction: string }[]; layers: { name: string }[] };
}
// Formal files were read after the Lead's approved native export; missing files are failures, never skips.
const readAtlas = () => JSON.parse(readFileSync(new URL(`../../public/${PARROT_ASSET.atlas}`, import.meta.url), 'utf8')) as AtlasDocument;
const readNativePng = () => readFileSync(new URL(`../../public/${PARROT_ASSET.image}`, import.meta.url));

/** Test-only decoder for the confirmed 8-bit, non-interlaced RGBA export. No production image IO or dependencies. */
function nativePixels() {
  const png = readNativePng(), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  expect(width).toBe(PARROT_ASSET.frameWidth * PARROT_ASSET.frameCount); expect(height).toBe(PARROT_ASSET.frameHeight);
  expect([png[24], png[25], png[26], png[27], png[28]]).toEqual([8, 6, 0, 0, 0]);
  const parts: Buffer[] = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = width * 4, rgba = Buffer.alloc(width * height * 4);
  expect(raw.length).toBe(height * (stride + 1));
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, left = x >= 4 ? rgba[index - 4] : 0, up = y ? rgba[index - stride] : 0, upperLeft = y && x >= 4 ? rgba[index - stride - 4] : 0;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter];
      rgba[index] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, at: (frame: number, x: number, y: number) => rgba.subarray((y * width + frame * 48 + x) * 4, (y * width + frame * 48 + x) * 4 + 4) };
}

describe('actual formal Aseprite atlas contract (not a native-game acceptance claim)', () => {
  it('binds actual names, native cells, authored timing and tags without trims or reference layers', () => {
    const atlas = readAtlas(); expect(Array.isArray(atlas.frames)).toBe(true); expect(atlas.frames).toHaveLength(PARROT_ASSET.frameCount);
    expect(atlas.frames.map(frame => frame.filename)).toEqual(PARROT_ASSET.frames);
    expect(atlas.frames.map(frame => frame.duration)).toEqual(PARROT_ASSET.frameDurations);
    for (const [index, frame] of atlas.frames.entries()) {
      expect(frame.frame).toEqual({ x: index * 48, y: 0, w: 48, h: 48 }); expect(frame.rotated).toBe(false); expect(frame.trimmed).toBe(false);
      expect(frame.spriteSourceSize).toEqual({ x: 0, y: 0, w: 48, h: 48 }); expect(frame.sourceSize).toEqual({ w: 48, h: 48 });
    }
    expect(atlas.meta.size).toEqual({ w: 192, h: 48 }); expect(atlas.meta.scale).toBe('1'); expect(atlas.meta.image).toBe('parrot.png');
    expect(atlas.meta.frameTags.map(({ name, from, to, direction }) => ({ name, from, to, direction }))).toEqual([
      { name: 'idle', from: 0, to: 1, direction: 'forward' }, { name: 'tell', from: 2, to: 2, direction: 'forward' }, { name: 'recover', from: 3, to: 3, direction: 'forward' },
    ]);
    expect(atlas.meta.layers.some(layer => /reference/i.test(layer.name))).toBe(false);
    expect(Object.isFrozen(PARROT_ASSET.frames)).toBe(true); expect(Object.isFrozen(PARROT_ASSET.frameDurations)).toBe(true);
  });
  it('checks the actual PNG native dimensions against the JSON, not a scaled review preview', () => {
    const png = readNativePng(); const atlas = readAtlas();
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(png.toString('ascii', 12, 16)).toBe('IHDR');
    expect({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) }).toEqual(atlas.meta.size);
  });
  it('keeps both complete soles at source y44 in all four frames, with transparent borders and space below', () => {
    const pixels = nativePixels(); expect(pixels.width).toBe(192); expect(pixels.height).toBe(48);
    for (let frame = 0; frame < 4; frame++) {
      const soles: number[] = [];
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const alpha = pixels.at(frame, x, y)[3];
        if (y === 44 && alpha > 0) soles.push(x);
        if (y > 44 || x === 0 || x === 47 || y === 0) expect(alpha).toBe(0);
      }
      expect(soles).toEqual([18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30]);
      for (const left of [18, 25]) for (let y = 40; y <= 44; y++) {
        expect(Array.from({ length: 6 }, (_, offset) => pixels.at(frame, left + offset, y)[3]).some(alpha => alpha === 255)).toBe(true);
      }
    }
    expect(44 - PARROT_ASSET.pivot.y).toBe(14); // Authored center anchor, so y306 reaches the existing floor320.
  });
  it('retains hard alpha and a green-led limited palette instead of a protagonist-orange body', () => {
    const pixels = nativePixels(), colors = new Set<string>();
    for (let frame = 0; frame < 4; frame++) {
      let opaque = 0, green = 0, orange = 0, transparent = 0, reservedClawdOrange = 0;
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const pixel = pixels.at(frame, x, y), [r, g, b, a] = pixel;
        expect(a === 0 || a === 255).toBe(true);
        if (a === 0) { transparent++; continue; }
        opaque++; colors.add(pixel.subarray(0, 3).toString('hex'));
        if (g > r && g > b) green++;
        if (r === 217 && g === 119 && b === 87) reservedClawdOrange++;
        // Warm book/beak accents remain legal; this bounds orange dominance, not every warm pixel.
        if (r >= 160 && r - g >= 40 && g - b >= 20) orange++;
      }
      expect(transparent).toBeGreaterThan(0); expect(green / opaque).toBeGreaterThan(0.35); expect(orange / opaque).toBeLessThan(0.1);
      expect(reservedClawdOrange).toBe(0); // #d97757 is reserved specifically for Clawd, not generic warm accents.
    }
    expect(colors.size).toBeLessThanOrEqual(16);
  });
});

describe('read-only enemy Image lifecycle', () => {
  it('accepts the actual installed Phaser Scene API without importing a runtime engine into Node', () => {
    expectTypeOf<Phaser.Scene>().toExtend<EnemySpriteScene>();
  });
  it('uses the real verified default frame names when the caller supplies no custom binding', () => {
    const scene = new SceneDouble();
    scene.textures.get.mockImplementation(key => ({ has: name => key === PARROT_ASSET.key && (PARROT_ASSET.frames as readonly string[]).includes(name) }));
    const renderer = new EnemySpriteRenderer(scene);
    expect([...renderer.draw(world())]).toEqual(['parrot-1']); expect(scene.images[0].frame).toBe(PARROT_ASSET.frames[0]);
    renderer.draw(world([enemy({ phase: 'tell' })], 500)); expect(scene.images[0].frame).toBe(PARROT_ASSET.frames[2]);
    renderer.draw(world([enemy({ phase: 'recover' })], 600)); expect(scene.images[0].frame).toBe(PARROT_ASSET.frames[3]);
  });
  it('creates images lazily, takes only living parrots and preserves model/collision values', () => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES);
    const parrot = enemy(); const snapshot = world([parrot, enemy({ id: 'other', kind: 'repeater' }), enemy({ id: 'dead', hp: 0 })]);
    const before = JSON.stringify(snapshot), hitbox = enemyRect(parrot);
    expect(scene.images).toHaveLength(0); expect([...renderer.draw(snapshot)]).toEqual(['parrot-1']);
    expect(scene.images).toHaveLength(1); expect(scene.images[0]).toMatchObject({ x: 100, y: 306, origin: [24, 30], scale: 1, depth: 2, texture: PARROT_ASSET.key, frame: TEST_FRAMES[0], flipX: false });
    expect(enemyRect(parrot)).toEqual(hitbox); expect(hitbox).toMatchObject({ w: 24, h: 24 }); expect(JSON.stringify(snapshot)).toBe(before);
  });
  it.each([[40, false], [100.25, false], [200, true]] as const)('faces target x=%s with flipX=%s and no extra breathing offset', (playerX, flipX) => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES);
    renderer.draw(world([enemy()], 450, 'run-a', 1, playerX));
    expect(scene.images[0].flipX).toBe(flipX); expect(scene.images[0].y).toBe(306); expect(scene.images[0].origin).toEqual([24, 30]);
  });
  it('reuses the same image, changes only atlas frames, and reasserts pivot after Phaser frame reset', () => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES);
    renderer.draw(world()); const image = scene.images[0];
    renderer.draw(world([enemy()], 399)); expect(image.calls.filter(value => value.startsWith('frame:'))).toHaveLength(0);
    renderer.draw(world([enemy()], 400)); expect(image.calls.slice(-2)).toEqual([`frame:${TEST_FRAMES[1]}`, 'origin:24,30']);
    renderer.draw(world([enemy({ phase: 'tell' })], 500)); expect(image.frame).toBe(TEST_FRAMES[2]);
    renderer.draw(world([enemy({ phase: 'recover' })], 700)); expect(image.frame).toBe(TEST_FRAMES[3]);
    expect(scene.images).toHaveLength(1); expect(image.origin).toEqual([24, 30]);
  });
  it('does not advance on wall-clock time during pause/rest/blur; only a changed simulation clock advances idle', () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES); const snapshot = world([enemy()], 399);
    renderer.draw(snapshot); vi.advanceTimersByTime(120000); renderer.draw(snapshot);
    expect(scene.images[0].frame).toBe(TEST_FRAMES[0]); expect(scene.images).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
    renderer.draw(world([enemy()], 400)); expect(scene.images[0].frame).toBe(TEST_FRAMES[1]);
    renderer.draw(world([enemy()], 50)); expect(scene.images[0].frame).toBe(TEST_FRAMES[0]);
  });
  it('destroys missing/dead/changed-kind entities without retaining stale sprite ownership', () => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES);
    renderer.draw(world([enemy(), enemy({ id: 'second' }), enemy({ id: 'third' })]));
    expect([...renderer.draw(world([enemy({ hp: 0 }), enemy({ id: 'second', kind: 'deceiver' })]))]).toEqual([]);
    expect(scene.images.map(image => image.destroyed)).toEqual([1, 1, 1]); renderer.draw(world([]));
    expect(scene.images.map(image => image.destroyed)).toEqual([1, 1, 1]);
  });
  it('retains still-present images while cleaning up only the removed ID', () => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES);
    renderer.draw(world([enemy(), enemy({ id: 'second' })])); renderer.draw(world([enemy({ id: 'second', x: 140 })]));
    expect(scene.images).toHaveLength(2); expect(scene.images[0].destroyed).toBe(1); expect(scene.images[1].destroyed).toBe(0); expect(scene.images[1].x).toBe(140);
  });
  it.each([{ runId: 'run-b', stage: 1 }, { runId: 'run-a', stage: 2 }])('cleans the previous run/chapter before accepting $runId/$stage, even when an ID is reused', ({ runId, stage }) => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES);
    renderer.draw(world()); renderer.draw(world([enemy()], 0, runId, stage));
    expect(scene.images).toHaveLength(2); expect(scene.images[0].destroyed).toBe(1); expect(scene.images[1].destroyed).toBe(0);
  });
  it('keys the rendered chapter, not the next saved chapter at a clear boundary', () => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES); const snapshot = world();
    renderer.draw(snapshot); renderer.draw({ ...snapshot, save: { ...snapshot.save, ...{ stage: 2 } } });
    expect(scene.images).toHaveLength(1); expect(scene.images[0].destroyed).toBe(0);
  });
  it('falls back without throwing or claiming IDs when the texture or any required frame is missing, including after a prior draw', () => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES); scene.available = false;
    expect([...renderer.draw(world())]).toEqual([]); expect(scene.images).toHaveLength(0); expect(scene.textures.get).not.toHaveBeenCalled();
    scene.available = true; expect([...renderer.draw(world())]).toEqual(['parrot-1']);
    scene.missing.add(TEST_FRAMES[3]); expect([...renderer.draw(world())]).toEqual([]); expect(scene.images[0].destroyed).toBe(1);
    scene.missing.clear(); expect([...renderer.draw(world())]).toEqual(['parrot-1']); expect(scene.images).toHaveLength(2);
  });
  it.each([{ names: [] }, { names: ['same', 'same', 'same', 'same'] }, { names: ['', 'a', 'b', 'c'] }, { names: 'same' }, { names: {} }])('refuses malformed binding $names before accessing textures', ({ names }) => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, names as unknown as ParrotFrameNames);
    expect([...renderer.draw(world())]).toEqual([]); expect(scene.images).toHaveLength(0); expect(scene.textures.get).not.toHaveBeenCalled();
  });
  it('copies the supplied frame binding instead of keeping a mutable caller array', () => {
    const scene = new SceneDouble(); const names: [string, string, string, string] = [...TEST_FRAMES]; const renderer = new EnemySpriteRenderer(scene, names);
    names[0] = 'changed-outside'; renderer.draw(world()); expect(scene.images[0].frame).toBe(TEST_FRAMES[0]);
  });
  it('does not take invalid coordinates or leave an earlier valid sprite visible', () => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES); renderer.draw(world());
    expect([...renderer.draw(world([enemy({ x: NaN })]))]).toEqual([]); expect(scene.images[0].destroyed).toBe(1);
  });
  it('destroys idempotently and never recreates after disposal', () => {
    const scene = new SceneDouble(), renderer = new EnemySpriteRenderer(scene, TEST_FRAMES); renderer.draw(world());
    renderer.destroy(); renderer.destroy(); expect([...renderer.draw(world())]).toEqual([]);
    expect(scene.images).toHaveLength(1); expect(scene.images[0].destroyed).toBe(1);
  });
  it('keeps view state per instance rather than sharing a module-level sprite map', () => {
    const scene = new SceneDouble(), one = new EnemySpriteRenderer(scene, TEST_FRAMES), two = new EnemySpriteRenderer(scene, TEST_FRAMES);
    one.draw(world()); two.draw(world()); one.destroy(); two.draw(world());
    expect(scene.images).toHaveLength(2); expect(scene.images[0].destroyed).toBe(1); expect(scene.images[1].destroyed).toBe(0);
  });
});
