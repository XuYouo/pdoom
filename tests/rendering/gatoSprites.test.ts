import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type Phaser from 'phaser';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { BOSS_ASSETS, GATO_ASSET, GATO_POSES, gatoFrameFor } from '../../src/pages/GamePage/game/data/bossAssets';
import { CHAPTER } from '../../src/pages/GamePage/game/data/chapterOne';
import { bossRect, type Boss } from '../../src/pages/GamePage/game/entities/model';
import { GatoSpriteRenderer, type GatoSpriteImage, type GatoSpriteScene, type GatoSpriteWorld } from '../../src/pages/GamePage/game/systems/GatoSpriteRenderer';
import { advanceCombat } from '../../src/pages/GamePage/game/systems/combat';
import { advanceEncounters } from '../../src/pages/GamePage/game/systems/encounters';
import { canReflect } from '../../src/pages/GamePage/game/systems/rules';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';

// Explicit port-test keys only: no claim that these are real export filenames.
const UNIT_FRAMES = Array.from({ length: 12 }, (_, index) => `unit-gato-${index}`);
const poses = ([1, 2, 3] as const).flatMap(phase => GATO_POSES.map((action, index) => ({ phase, action, index: (phase - 1) * 4 + index })));
class ImageDouble implements GatoSpriteImage {
  x = 0; y = 0; origin = [0, 0]; scale = 0; depth = 0; flipX = true; alpha = 0; destroyed = 0;
  constructor(readonly texture: string, public frame: string) {}
  setFrame(frame: string) { this.frame = frame; this.origin = [0, 0]; }
  setDisplayOrigin(x: number, y: number) { this.origin = [x, y]; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; }
  setFlipX(value: boolean) { this.flipX = value; }
  setAlpha(value: number) { this.alpha = value; }
  setScale(value: number) { this.scale = value; }
  setDepth(value: number) { this.depth = value; }
  destroy() { this.destroyed++; }
}
class SceneDouble implements GatoSpriteScene {
  available = true; readonly names = new Set(UNIT_FRAMES); readonly images: ImageDouble[] = [];
  readonly textures = {
    exists: vi.fn((key: string) => this.available && key === GATO_ASSET.key),
    get: vi.fn((key: string) => ({ has: (frame: string) => key === GATO_ASSET.key && this.names.has(frame) })),
  };
  readonly add = { image: vi.fn((_x: number, _y: number, texture: string, frame: string) => { const image = new ImageDouble(texture, frame); this.images.push(image); return image; }) };
}
const boss = (patch: Partial<Boss> = {}): Readonly<Boss> => Object.freeze({ kind: 'gato', name: 'GATO', facing: -1, hp: 900, maxHp: 900, active: true, phase: 1, action: 'idle', actionUntil: 1000, targetX: 2500, volley: 0, enteredAt: 0, x: 2720.4, y: 244.2, ...patch });
const world = (actor: Readonly<Boss> = boss(), runId = 'run-a', stage = 1): GatoSpriteWorld => Object.freeze({ save: Object.freeze({ runId }), chapter: Object.freeze({ stage }), boss: actor });
const adapter = (scene: SceneDouble) => new GatoSpriteRenderer(scene, UNIT_FRAMES);
function actualWorld(phase: Boss['phase'] = 1) {
  const actual = createWorld(createRun('44444444-4444-4444-8444-444444444444', 42));
  actual.enemies = []; actual.bullets = []; actual.shocks = []; actual.save.doom = 60;
  actual.save.inventory = []; // createRun grants constitutional; this geometry fixture isolates unmodified damage.
  actual.player.x = 2500; actual.player.y = 307;
  actual.boss = { ...boss({ phase, hp: phase === 1 ? 900 : phase === 2 ? 450 : 200, x: 2720, y: 244 }) };
  return actual;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Gato descriptor and authoritative pose projection', () => {
  it('keeps the planned native layout immutable and only publishes complete verified bindings', () => {
    expect(GATO_ASSET).toMatchObject({ kind: 'gato', key: 'boss-gato', image: 'game/gato.png', atlas: 'game/gato.json', frameWidth: 96, frameHeight: 96, frameCount: 12, pivot: { x: 48, y: 48 }, facing: 'left' });
    expect(GATO_ASSET.frameDurations).toEqual([600, 650, 260, 1050, 600, 850, 260, 1050, 600, 650, 260, 620]);
    expect(Object.isFrozen(GATO_ASSET)).toBe(true); expect(Object.isFrozen(GATO_ASSET.frames)).toBe(true); expect(Object.isFrozen(GATO_ASSET.pivot)).toBe(true);
    expect(Object.isFrozen(BOSS_ASSETS)).toBe(true); for (const asset of BOSS_ASSETS) expect(asset.frames).toHaveLength(asset.frameCount);
  });
  it('accepts the installed Phaser Scene and actual simulation shape without a browser-runtime import', () => {
    expectTypeOf<Phaser.Scene>().toMatchTypeOf<GatoSpriteScene>(); expectTypeOf<ReturnType<typeof createWorld>>().toMatchTypeOf<GatoSpriteWorld>();
  });
  it.each(poses)('maps phase $phase / $action directly to frame $index', ({ phase, action, index }) => {
    expect(gatoFrameFor(phase, action)).toBe(index);
    const scene = new SceneDouble(); expect(adapter(scene).draw(world(boss({ phase, action })))).toBe(true); expect(scene.images[0].frame).toBe(UNIT_FRAMES[index]);
  });
  it.each([0, 4, 1.5, NaN, Infinity])('fails closed for invalid phase %s instead of predicting a legal phase', phase => {
    expect(gatoFrameFor(phase as Boss['phase'], 'idle')).toBeNull();
  });
  it('fails closed for an unknown action', () => { expect(gatoFrameFor(1, 'charge' as Boss['action'])).toBeNull(); });
});

describe('single view-owned Gato Image', () => {
  it('owns only the body, keeps 52×74 collision intact, and never modifies the frozen snapshot', () => {
    const scene = new SceneDouble(), renderer = adapter(scene), snapshot = world(), before = JSON.stringify(snapshot), rectangle = bossRect(snapshot.boss);
    expect(renderer.draw(snapshot)).toBe(true); expect(scene.images[0]).toMatchObject({ x: 2720, y: 244, origin: [48, 48], scale: 1, depth: 2, flipX: false, alpha: 1 });
    expect(JSON.stringify(snapshot)).toBe(before); expect(bossRect(snapshot.boss)).toEqual(rectangle); expect(rectangle).toMatchObject({ w: 52, h: 74 });
    expect([48 - 26, 48 - 37, 48 + 26, 48 + 37]).toEqual([22, 11, 74, 85]);
  });
  it('reuses one Image through all twelve poses and reasserts its origin after every frame change', () => {
    const scene = new SceneDouble(), renderer = adapter(scene);
    for (const { phase, action, index } of poses) { renderer.draw(world(boss({ phase, action }))); expect(scene.images[0].frame).toBe(UNIT_FRAMES[index]); expect(scene.images[0].origin).toEqual([48, 48]); }
    expect(scene.images).toHaveLength(1); expect(scene.images[0].destroyed).toBe(0);
  });
  it('dims inactive previews in place and restores full alpha on real activation', () => {
    const scene = new SceneDouble(), renderer = adapter(scene);
    expect(renderer.draw(world(boss({ active: false })))).toBe(true); expect(scene.images[0].alpha).toBe(GATO_ASSET.inactiveAlpha); expect(scene.images[0].alpha).toBeGreaterThan(0); expect(scene.images[0].alpha).toBeLessThan(1);
    renderer.draw(world()); expect(scene.images[0].alpha).toBe(1); renderer.draw(world(boss({ active: false }))); expect(scene.images[0].alpha).toBe(GATO_ASSET.inactiveAlpha); expect(scene.images).toHaveLength(1);
  });
  it('does not read targetX, facing, maxHp, actionUntil, player or elapsed time to invent visual motion', () => {
    const actor = { ...boss({ phase: 2, action: 'attack', x: 2720, y: 244 }) };
    for (const property of ['targetX', 'facing', 'maxHp', 'actionUntil']) Object.defineProperty(actor, property, { get: () => { throw new Error(`forbidden read ${property}`); } });
    const snapshot = { ...world(Object.freeze(actor)), get player(): never { throw new Error('forbidden player read'); }, save: { runId: 'run-a', get elapsedMs(): never { throw new Error('forbidden clock read'); } } };
    const scene = new SceneDouble(); expect(adapter(scene).draw(snapshot)).toBe(true); expect(scene.images[0]).toMatchObject({ x: 2720, y: 244, frame: UNIT_FRAMES[6], flipX: false });
  });
  it('does not animate or move a fixed snapshot when wall time advances', () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const scene = new SceneDouble(), renderer = adapter(scene), snapshot = world(boss({ phase: 3, action: 'tell' })); renderer.draw(snapshot);
    vi.advanceTimersByTime(120000); renderer.draw(snapshot); expect(scene.images[0]).toMatchObject({ x: 2720, y: 244, frame: UNIT_FRAMES[9] }); expect(vi.getTimerCount()).toBe(0); expect(scene.images).toHaveLength(1);
  });
  it.each([{ hp: 0 }, { hp: -1 }, { hp: NaN }, { hp: Infinity }, { x: NaN }, { y: Infinity }, { phase: 0 as Boss['phase'] }, { action: 'unknown' as Boss['action'] }])('cleans an invalid/dead body for %j', patch => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world()); expect(renderer.draw(world(boss(patch)))).toBe(false); expect(scene.images[0].destroyed).toBe(1);
  });
  it.each(['sydney', 'basilisk', 'leviathan', 'mirror'] as const)('leaves %s on its original renderer and cleans the Gato image', kind => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world()); expect(renderer.draw(world(boss({ kind })))).toBe(false); expect(scene.images[0].destroyed).toBe(1);
  });
  it.each(['texture', 'last-frame'] as const)('releases only its own body when the required %s disappears and safely recreates on recovery', missing => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world());
    if (missing === 'texture') scene.available = false; else scene.names.delete(UNIT_FRAMES[11]);
    expect(renderer.draw(world())).toBe(false); expect(scene.images[0].destroyed).toBe(1);
    scene.available = true; scene.names.add(UNIT_FRAMES[11]); expect(renderer.draw(world())).toBe(true); expect(scene.images).toHaveLength(2); expect(scene.images[0].destroyed).toBe(1);
  });
  it.each([
    { value: [] }, { value: UNIT_FRAMES.slice(0, 11) }, { value: Array(12).fill('same') }, { value: [...UNIT_FRAMES.slice(0, 11), ' '] },
    { value: null }, { value: 'not-an-array' }, { value: {} },
  ])('rejects an unbound or malformed binding before texture access: $value', ({ value }) => {
    const scene = new SceneDouble(), renderer = new GatoSpriteRenderer(scene, value as readonly string[]);
    expect(renderer.draw(world())).toBe(false); expect(scene.images).toHaveLength(0); expect(scene.textures.exists).not.toHaveBeenCalled(); expect(scene.textures.get).not.toHaveBeenCalled();
  });
  it('copies the caller binding without retaining mutable external array state', () => {
    const frames = [...UNIT_FRAMES], scene = new SceneDouble(), renderer = new GatoSpriteRenderer(scene, frames); frames[0] = 'caller-edit';
    expect(renderer.draw(world())).toBe(true); expect(scene.images[0].frame).toBe(UNIT_FRAMES[0]);
  });
  it.each([{ runId: 'run-b', stage: 1 }, { runId: 'run-a', stage: 2 }])('rebuilds on the real context $runId / $stage', ({ runId, stage }) => {
    const scene = new SceneDouble(), renderer = adapter(scene); renderer.draw(world()); renderer.draw(world(boss(), runId, stage)); expect(scene.images.map(image => image.destroyed)).toEqual([1, 0]);
  });
  it('does not confuse the saved next stage with the rendered chapter', () => {
    const scene = new SceneDouble(), renderer = adapter(scene), snapshot = world(); renderer.draw(snapshot); renderer.draw({ ...snapshot, save: { ...snapshot.save, stage: 2 } } as GatoSpriteWorld);
    expect(scene.images).toHaveLength(1); expect(scene.images[0].destroyed).toBe(0);
  });
  it('keeps instances independent and destroys idempotently without later recreation', () => {
    const scene = new SceneDouble(), first = adapter(scene), second = adapter(scene); first.draw(world()); second.draw(world()); first.destroy(); first.destroy();
    expect(first.draw(world())).toBe(false); expect(scene.images.map(image => image.destroyed)).toEqual([1, 0]); expect(second.draw(world())).toBe(true); second.destroy(); expect(scene.images.map(image => image.destroyed)).toEqual([1, 1]);
  });
});

interface GatoAtlas {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; rotated: boolean; trimmed: boolean; spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; format: string; size: { w: number; h: number }; scale: string; frameTags: { name: string; from: number; to: number; direction: string }[]; layers: { name: string; opacity: number; blendMode: string }[] };
}
const nativeLayerNames = ['chassis', 'power', 'signal', 'brackets', 'paddle', 'arcade', 'upper-arm', 'forearm', 'press', 'terminal', 'paper'];
const nativeAtlas = () => JSON.parse(readFileSync(new URL(`../../public/${GATO_ASSET.atlas}`, import.meta.url), 'utf8')) as GatoAtlas;
// Read-only test decoder for the actual approved RGBA export. No new image is written.
function nativePixels() {
  const png = readFileSync(new URL(`../../public/${GATO_ASSET.image}`, import.meta.url)), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(png.toString('ascii', 12, 16)).toBe('IHDR');
  expect([width, height]).toEqual([1152, 96]); expect([png[24], png[25], png[26], png[27], png[28]]).toEqual([8, 6, 0, 0, 0]);
  const parts: Buffer[] = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset); if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
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
  return (frame: number, x: number, y: number) => rgba.subarray((y * width + frame * 96 + x) * 4, (y * width + frame * 96 + x) * 4 + 4);
}

describe('approved native Gato files, not an in-game acceptance claim', () => {
  it('publishes the actual twelve keys, cells, timings, individual tags and opaque normal layers', () => {
    expect(BOSS_ASSETS).toEqual([GATO_ASSET]); const atlas = nativeAtlas(); expect(atlas.frames).toHaveLength(12);
    expect(atlas.frames.map(frame => frame.filename)).toEqual(GATO_ASSET.frames); expect(new Set(GATO_ASSET.frames).size).toBe(12);
    expect(atlas.frames.map(frame => frame.duration)).toEqual(GATO_ASSET.frameDurations);
    for (const [index, frame] of atlas.frames.entries()) {
      expect(frame.frame).toEqual({ x: index * 96, y: 0, w: 96, h: 96 }); expect(frame.sourceSize).toEqual({ w: 96, h: 96 });
      expect(frame.spriteSourceSize).toEqual({ x: 0, y: 0, w: 96, h: 96 }); expect(frame.rotated).toBe(false); expect(frame.trimmed).toBe(false);
    }
    expect(atlas.meta).toMatchObject({ image: 'gato.png', format: 'RGBA8888', size: { w: 1152, h: 96 }, scale: '1' });
    const tags = ['paddle', 'arm', 'caption'].flatMap((form, phase) => GATO_POSES.map((pose, index) => ({ name: `${form}-${pose}`, from: phase * 4 + index, to: phase * 4 + index, direction: 'forward' })));
    expect(atlas.meta.frameTags.map(({ name, from, to, direction }) => ({ name, from, to, direction }))).toEqual(tags);
    expect(atlas.meta.layers).toEqual(nativeLayerNames.map(name => ({ name, opacity: 255, blendMode: 'normal' })));
  });
  it('verifies genuine source headers, palette, serialized cel ranges and full layer/cel opacity', () => {
    const source = readFileSync(new URL('../../assets/source/gato.aseprite', import.meta.url));
    expect(source.readUInt32LE(0)).toBe(source.length); expect(source.readUInt16LE(4)).toBe(0xa5e0);
    expect([source.readUInt16LE(6), source.readUInt16LE(8), source.readUInt16LE(10), source.readUInt16LE(12)]).toEqual([12, 96, 96, 32]);
    const layers: { name: string; opacity: number; type: number }[] = [], palettes: number[] = [], durations: number[] = [], celOpacity = new Set<number>(), layerFrames: Record<number, number[]> = {};
    let offset = 128;
    for (let frame = 0; frame < 12; frame++) {
      const end = offset + source.readUInt32LE(offset), chunks = source.readUInt32LE(offset + 12) || source.readUInt16LE(offset + 6);
      expect(end).toBeLessThanOrEqual(source.length); expect(source.readUInt16LE(offset + 4)).toBe(0xf1fa); durations.push(source.readUInt16LE(offset + 8));
      let chunk = offset + 16;
      for (let index = 0; index < chunks; index++) {
        const size = source.readUInt32LE(chunk), type = source.readUInt16LE(chunk + 4); expect(size).toBeGreaterThanOrEqual(6); expect(chunk + size).toBeLessThanOrEqual(end);
        if (type === 0x2004) { const length = source.readUInt16LE(chunk + 22); expect(24 + length).toBeLessThanOrEqual(size); layers.push({ name: source.toString('utf8', chunk + 24, chunk + 24 + length), opacity: source[chunk + 18], type: source.readUInt16LE(chunk + 8) }); }
        if (type === 0x2019) palettes.push(source.readUInt32LE(chunk + 6));
        if (type === 0x2005) { const layer = source.readUInt16LE(chunk + 6); (layerFrames[layer] ??= []).push(frame + 1); celOpacity.add(source[chunk + 12]); }
        chunk += size;
      }
      expect(chunk).toBe(end); offset = end;
    }
    expect(offset).toBe(source.length); expect(layers).toEqual(nativeLayerNames.map(name => ({ name, opacity: 255, type: 0 })));
    expect(palettes).toEqual([20]); expect([...celOpacity]).toEqual([255]); expect(durations).toEqual(GATO_ASSET.frameDurations);
    const ranges = Object.fromEntries(Object.entries(layerFrames).map(([index, frames]) => [layers[Number(index)].name, frames]));
    const all = Array.from({ length: 12 }, (_, index) => index + 1), paddle = [1, 2, 3, 4], arm = [5, 6, 7, 8], caption = [9, 10, 11, 12];
    expect(ranges).toEqual({ chassis: all, power: all, signal: all, brackets: paddle, paddle, arcade: paddle, 'upper-arm': arm, forearm: arm, press: arm, terminal: caption, paper: caption });
    // Serialized cel coverage is not a raster measurement of the design rig's joint/bone lengths.
  });
  it('preserves measured fifteen-color hard-alpha art wholly inside the unchanged 52×74 body envelope', () => {
    const at = nativePixels(), colors = new Set<string>(), alphas = new Set<number>(), areas: number[] = [], bounds: number[][] = [];
    for (let frame = 0; frame < 12; frame++) {
      let opaque = 0, reserved = 0, outside = 0, minX = 96, minY = 96, maxX = -1, maxY = -1;
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
        const pixel = at(frame, x, y), [r, g, b, a] = pixel; alphas.add(a); if (!a) continue;
        opaque++; colors.add(pixel.subarray(0, 3).toString('hex')); if (r === 217 && g === 119 && b === 87) reserved++;
        if (x < 22 || x >= 74 || y < 11 || y >= 85) outside++;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      expect(reserved).toBe(0); expect(outside).toBe(0); areas.push(opaque); bounds.push([minX, minY, maxX + 1, maxY + 1]);
    }
    expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]); expect(colors.size).toBe(15); expect(colors.size).toBeLessThanOrEqual(20);
    expect([...colors].sort()).toEqual(['0f191b', '24423b', '2c2330', '34354f', '426b50', '575c79', '783f4a', '858eb0', '8fa86b', '9dded1', 'b9905d', 'cbb696', 'd9ffea', 'e5c386', 'f5e8c8']);
    expect(areas).toEqual([2674, 2645, 2689, 2663, 1796, 1704, 1786, 1787, 3117, 3107, 3136, 3112]);
    expect(bounds).toEqual([[23, 11, 74, 85], [23, 11, 74, 85], [23, 11, 74, 85], [23, 11, 74, 85], [28, 14, 74, 85], [28, 11, 74, 85], [32, 13, 74, 85], [28, 15, 74, 85], [23, 12, 74, 85], [23, 12, 74, 85], [23, 12, 74, 85], [23, 12, 74, 85]]);
    // The body envelope also leaves the canvas exterior and the real gold indicator's x14..19 region transparent.
  });
  it('contains twelve visibly unique rasters rather than renamed duplicates or transparent-RGB differences', () => {
    const at = nativePixels(), rasters = new Set<string>();
    for (let frame = 0; frame < 12; frame++) {
      const bytes = Buffer.alloc(96 * 96 * 4);
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) { const pixel = at(frame, x, y); if (pixel[3]) pixel.copy(bytes, (y * 96 + x) * 4); }
      rasters.add(bytes.toString('hex'));
    }
    expect(rasters.size).toBe(12);
  });
  it('retains rear support without falsely requiring the arm to have the other forms front foot', () => {
    const at = nativePixels(), range = (from: number, to: number) => Array.from({ length: to - from }, (_, index) => from + index), rear = range(57, 69);
    for (let frame = 0; frame < 12; frame++) {
      const bottom = range(0, 96).filter(x => at(frame, x, 84)[3] !== 0);
      const expected = frame === 6 ? [...range(32, 56), ...rear] : frame >= 4 && frame <= 7 ? rear : [...range(35, 47), ...rear];
      expect(bottom).toEqual(expected);
    }
    // Frame 6 (one-based 7) also contacts this row with its press face, not a chassis front foot.
    expect(84 - GATO_ASSET.pivot.y).toBe(36);
  });
  it('uses the real default twelve-key binding and still reuses one image across phase/action and activation', () => {
    const scene = new SceneDouble(); scene.names.clear(); for (const frame of GATO_ASSET.frames) scene.names.add(frame);
    const renderer = new GatoSpriteRenderer(scene);
    for (const { phase, action, index } of poses) {
      expect(renderer.draw(world(boss({ phase, action, active: index !== 0 })))).toBe(true);
      expect(scene.images[0]).toMatchObject({ frame: GATO_ASSET.frames[index], origin: [48, 48], depth: 2, flipX: false, alpha: index === 0 ? GATO_ASSET.inactiveAlpha : 1 });
    }
    expect(scene.images).toHaveLength(1); expect(scene.images[0].destroyed).toBe(0);
  });
});

describe('actual Gato core boundaries, not a view-side replacement FSM', () => {
  it.each([1, 2, 3] as const)('keeps exact real tell/attack/recover timing for phase %s', phase => {
    const actual = actualWorld(phase), tellDuration = phase === 2 ? 850 : 650, recovery = phase === 3 ? 620 : 1050;
    const held = advanceEncounters(actual, 999.999); expect(held.boss.action).toBe('idle');
    const tell = advanceEncounters(actual, 1000); expect(tell.boss).toMatchObject({ action: 'tell', actionUntil: 1000 + tellDuration }); actual.boss = tell.boss;
    expect(advanceEncounters(actual, tell.boss.actionUntil - 0.001).boss.action).toBe('tell');
    const attack = advanceEncounters(actual, tell.boss.actionUntil); expect(attack.boss).toMatchObject({ action: 'attack', actionUntil: 1000 + tellDuration + 260 }); actual.boss = attack.boss;
    expect(advanceEncounters(actual, attack.boss.actionUntil - 0.001).boss.action).toBe('attack');
    const recover = advanceEncounters(actual, attack.boss.actionUntil); expect(recover.boss).toMatchObject({ action: 'recover', actionUntil: attack.boss.actionUntil + recovery });
    expect(GATO_ASSET.frameDurations[(phase - 1) * 4 + 1]).toBe(tellDuration); expect(GATO_ASSET.frameDurations[(phase - 1) * 4 + 2]).toBe(260); expect(GATO_ASSET.frameDurations[(phase - 1) * 4 + 3]).toBe(recovery);
  });
  it('never anticipates phase-2 targetX on attack or its home position on recovery', () => {
    const actual = actualWorld(2); actual.boss = { ...actual.boss, action: 'tell', actionUntil: 1000, targetX: 2500 };
    const scene = new SceneDouble(), renderer = adapter(scene), transition = advanceEncounters(actual, 1000);
    expect(transition.boss).toMatchObject({ action: 'attack', x: 2720, y: 244 }); renderer.draw({ ...actual, boss: transition.boss }); expect(scene.images[0]).toMatchObject({ x: 2720, y: 244, frame: UNIT_FRAMES[6] });
    actual.boss = transition.boss; const attack = advanceEncounters(actual, 1001); expect(attack.boss).toMatchObject({ x: 2500, y: 282 }); renderer.draw({ ...actual, boss: attack.boss }); expect(scene.images[0]).toMatchObject({ x: 2500, y: 282 });
    actual.boss = attack.boss; const recovery = advanceEncounters(actual, 1260); expect(recovery.boss).toMatchObject({ action: 'recover', x: 2500, y: 282 }); renderer.draw({ ...actual, boss: recovery.boss }); expect(scene.images[0]).toMatchObject({ x: 2500, y: 282, frame: UNIT_FRAMES[7] });
    actual.boss = recovery.boss; const home = advanceEncounters(actual, 1261); expect(home.boss).toMatchObject({ x: 2720, y: 244 }); renderer.draw({ ...actual, boss: home.boss }); expect(scene.images[0]).toMatchObject({ x: 2720, y: 244 });
  });
  it('reads the real phase-1 bob and phase-3 sine coordinates once, without a second visual oscillator', () => {
    const scene = new SceneDouble(), renderer = adapter(scene);
    for (const phase of [1, 3] as const) {
      const actual = actualWorld(phase), now = 1200; actual.boss.actionUntil = 10000;
      const moved = advanceEncounters(actual, now); renderer.draw({ ...actual, boss: moved.boss });
      expect(moved.boss.y).toBeCloseTo(phase === 1 ? 252 + Math.sin(now / 580) * 35 : 246 + Math.sin(now / 750) * 40);
      expect(moved.boss.x).toBeCloseTo(phase === 1 ? 2720 : 2720 + Math.sin(now / 1400) * 40);
      expect(scene.images[0].x).toBe(Math.round(moved.boss.x)); expect(scene.images[0].y).toBe(Math.round(moved.boss.y));
    }
  });
  it('keeps the true phase-2 112-wide 280ms impact plus two opposite ground waves', () => {
    const actual = actualWorld(2); actual.boss = { ...actual.boss, action: 'tell', actionUntil: 1000, targetX: 2500 };
    const result = advanceEncounters(actual, 1000); expect(result.shocks).toEqual([{ x: 2500, width: 112, until: 1280 }]); expect(result.bullets).toHaveLength(2);
    expect(result.bullets.map(bullet => bullet.kind)).toEqual(['impact', 'impact']); expect(result.bullets[0].vx).toBeCloseTo(-165); expect(result.bullets[1].vx).toBeCloseTo(165);
    for (const bullet of result.bullets) { expect(bullet.x).toBe(2500); expect(bullet.y).toBe(CHAPTER.floor - 7); expect(bullet.vy).toBeCloseTo(0); }
  });
  it('keeps seven real caption projectiles in phase three, without a sprite-driven extra volley', () => {
    const actual = actualWorld(3); actual.boss = { ...actual.boss, action: 'tell', actionUntil: 1000 };
    const result = advanceEncounters(actual, 1000); expect(result.bullets).toHaveLength(7); expect(result.bullets.every(bullet => bullet.kind === 'caption')).toBe(true); expect(new Set(result.bullets.map(bullet => bullet.id)).size).toBe(7);
    for (const bullet of result.bullets) expect(Math.hypot(bullet.vx, bullet.vy)).toBeCloseTo(135);
    actual.boss = result.boss; expect(advanceEncounters(actual, 1001).bullets).toHaveLength(0);
  });
  it.each([
    { phase: 1, action: 'tell', active: true, offset: -20, vx: 100, reflect: true },
    { phase: 1, action: 'tell', active: true, offset: 20, vx: -100, reflect: false },
    { phase: 1, action: 'tell', active: true, offset: -20, vx: -100, reflect: false },
    { phase: 1, action: 'tell', active: true, offset: 0, vx: 100, reflect: false },
    { phase: 1, action: 'idle', active: true, offset: -20, vx: 100, reflect: false },
    { phase: 1, action: 'attack', active: true, offset: -20, vx: 100, reflect: false },
    { phase: 1, action: 'recover', active: true, offset: -20, vx: 100, reflect: false },
    { phase: 2, action: 'tell', active: true, offset: -20, vx: 100, reflect: false },
    { phase: 3, action: 'tell', active: true, offset: -20, vx: 100, reflect: false },
    { phase: 1, action: 'tell', active: false, offset: -20, vx: 100, reflect: false },
  ] as const)('preserves real reflection at phase $phase/$action active=$active offset=$offset vx=$vx', ({ phase, action, active, offset, vx, reflect }) => {
    const actual = actualWorld(phase); actual.boss = { ...actual.boss, action, active }; const hp = actual.boss.hp;
    expect(canReflect(actual.boss)).toBe(phase === 1 && action === 'tell' && active);
    actual.bullets = [{ id: 99, faction: 'player', kind: 'dictionary', x: actual.boss.x + offset, y: actual.boss.y, vx, vy: 0, damage: 7, radius: 0, expiresAt: 2000 }];
    advanceCombat(actual, actual.player, [], 1000, 0);
    if (reflect) { expect(actual.boss.hp).toBe(hp); expect(actual.bullets[0]).toMatchObject({ faction: 'enemy', kind: 'dictionary', x: actual.boss.x - 32, damage: 18 }); }
    else if (active) { expect(actual.boss.hp).toBe(hp - 7); expect(actual.bullets).toHaveLength(0); }
    else { expect(actual.boss.hp).toBe(hp); expect(actual.bullets[0].faction).toBe('player'); }
  });
  it.each([
    { offset: 63.999, now: 1000, y: 286, hit: true }, { offset: 64, now: 1000, y: 286, hit: false },
    { offset: 0, now: 1280, y: 286, hit: false }, { offset: 0, now: 1000, y: 285, hit: false },
  ])('keeps actual shock edge/expiry at x+$offset now=$now y=$y', ({ offset, now, y, hit }) => {
    const actual = actualWorld(2); actual.boss.active = false; actual.player.x = 2500 + offset; actual.player.y = y; actual.player.invulnerableUntil = 0;
    actual.shocks = [{ x: 2500, width: 112, until: 1280 }]; const hp = actual.save.hp;
    advanceCombat(actual, actual.player, [], now, 0); expect(actual.save.hp).toBe(hit ? hp - 24 : hp);
  });
});
