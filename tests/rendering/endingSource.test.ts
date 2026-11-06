import { beforeAll, describe, expect, it } from 'vitest';
import { file, hash, need, decodeAse, decodePng, composite, crop, type Native, type Pixels, type Atlas } from './clawdAttackCodec';

// Independent read-only artifact contract; no Phaser, production hooks or image-writing code.
const TAGS = ['aligned', 'warden', 'foom'] as const;
const LAYERS = ['background', 'furniture', 'actor', 'narrative-props', 'accents'];
const FRAMES = [0, 1, 2];
const PALETTE = ['00000000', '2c2330ff', 'd97757ff', 'eaa083ff', 'b55a4aff', '783f4aff',
  'f5e8c8ff', 'cbb696ff', '34354fff', '575c79ff', '858eb0ff', '9dded1ff', 'd9ffeaff',
  '071417ff', '112726ff', '1c3b35ff', '33564aff', '557a5dff', '7fa97aff', '3c2936ff',
  '654052ff', '9e5979ff', 'd78c9bff', 'deb15eff', '8d6a43ff', '513e36ff', '91b7aeff',
  'e8dab0ff', '4e8f90ff', '315f65ff', '648da9ff', 'b1c4c8ff'];
const SOURCE = '../../assets/source/ending-scenes/ending-scenes.aseprite';
const PNG = '../../assets/candidates/ending-scenes/ending-scenes.png';
const ATLAS = '../../assets/candidates/ending-scenes/ending-scenes.json';
const HERO = [{ form: 'aligned', x: 88, opaque: 1728, sha: 'c82079381bd482d648c6ecd06c0605f8b54508eb8f121d700d718725669de0bc' },
  { form: 'foom', x: 92, opaque: 2184, sha: '60e408fe7161ee2ea48871663beaaf853b21fc04d4e22b102bb2dfbabcc6a300' }] as const;
let native: Native, image: Pixels, atlas: Atlas;
beforeAll(() => {
  native = decodeAse(file(SOURCE)); image = decodePng(file(PNG)); atlas = JSON.parse(file(ATLAS).toString());
});
const ink = (p: Pixels) => p.rgba.filter((v, i) => i % 4 === 3 && v > 0).length;
const pixel = (p: Pixels, x: number, y: number) => p.rgba.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4).toString('hex');
const clone = (): Native => ({ ...native, layers: native.layers.map(l => ({ ...l })), tags: native.tags.map(t => ({ ...t })),
  cels: native.cels.map(c => ({ ...c, image: { ...c.image, rgba: Buffer.from(c.image.rgba) } })) });
const cloneAtlas = (): Atlas => JSON.parse(JSON.stringify(atlas));
function structure(s: Native) {
  need(s.width === 256 && s.height === 128 && s.frames === 3 && s.depth === 32, 'native geometry');
  need(JSON.stringify(s.layers.map(l => l.name)) === JSON.stringify(LAYERS), 'only five ordered art layers');
  need(s.layers.every(l => (l.flags & 1) && l.type === 0 && l.level === 0 && l.blend === 0 && l.opacity === 255), 'visible normal layers');
  need(JSON.stringify(s.durations) === '[1000,1000,1000]', 'static frame metadata');
  need(s.tags.length === 3 && s.tags.every((t, i) => t.name === TAGS[i] && t.from === i && t.to === i && t.direction === 0 && t.repeats === 0), 'single-frame outcome tags');
}
function palette(s: Native) {
  need(JSON.stringify(s.palette) === JSON.stringify(PALETTE) && new Set(s.palette).size === 32, 'literal unique palette');
  need(s.paletteSizes.every(n => n === 32) && s.palettes.every(p => JSON.stringify(p) === JSON.stringify(PALETTE)), 'stable palette');
  const allowed = new Set(PALETTE);
  for (const c of s.cels) for (let at = 0; at < c.image.rgba.length; at += 4) {
    const a = c.image.rgba[at + 3]; need(a === 0 || a === 255, 'hard alpha');
    if (a) need(allowed.has(c.image.rgba.subarray(at, at + 4).toString('hex')), 'off-palette pixel');
  }
}
function checkAtlas(a: Atlas) {
  need(a.frames.length === 3 && a.meta.image === 'ending-scenes.png' && a.meta.scale === '1', 'atlas identity');
  need(a.meta.format === 'RGBA8888' && a.meta.size.w === 768 && a.meta.size.h === 128, 'atlas dimensions');
  need(a.meta.frameTags.length === 3 && a.meta.frameTags.every((t, i) => t.name === TAGS[i] && t.from === i && t.to === i && t.direction === 'forward'), 'atlas tags');
  need(JSON.stringify(a.meta.layers) === JSON.stringify(LAYERS.map(name => ({ name, opacity: 255, blendMode: 'normal' }))), 'atlas art layers');
  a.frames.forEach((f, i) => {
    need(f.filename === `ending-scenes #${TAGS[i]}.aseprite`, 'atlas named outcome');
    need(f.frame.x === i * 256 && f.frame.y === 0 && f.frame.w === 256 && f.frame.h === 128, 'atlas rectangle');
    need(!f.rotated && !f.trimmed && f.duration === 1000, 'no trim rotate or animation timing');
    need(f.sourceSize.w === 256 && f.sourceSize.h === 128 && f.spriteSourceSize.x === 0 && f.spriteSourceSize.y === 0 && f.spriteSourceSize.w === 256 && f.spriteSourceSize.h === 128, 'full source rectangle');
  });
}
function proveFrame(s: Native, png: Pixels, a: Atlas, f: number) {
  structure(s); palette(s); checkAtlas(a);
  need(png.width === 768 && png.height === 128, 'actual PNG dimensions');
  const rebuilt = composite(s, f), actual = crop(png, f * 256, 0, 256, 128);
  need(ink(rebuilt) === 256 * 128 && actual.rgba.equals(rebuilt.rgba), 'exact nonblank native RGBA');
}
function canonical(f: number): Pixels {
  const h = HERO[f]; need(h, 'only two actor outcomes');
  const bytes = file(`../../public/game/clawd-${h.form}.png`); need(hash(bytes) === h.sha, 'frozen public actor source');
  const tile = crop(decodePng(bytes), 0, 0, 32, 32), rgba = Buffer.alloc(256 * 128 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const source = (Math.floor(y / 2) * 32 + Math.floor(x / 2)) * 4;
    tile.rgba.copy(rgba, ((44 + y) * 256 + h.x + x) * 4, source, source + 4);
  }
  return { width: 256, height: 128, rgba };
}
function proveActor(s: Native, f: number) {
  const actual = composite(s, f, ['actor']);
  need(actual.rgba.equals(canonical(f).rgba) && ink(actual) === HERO[f].opaque, 'exact canonical actor');
}
function noOverlap(s: Native, f: number, first: string, second: string) {
  const a = composite(s, f, [first]).rgba, b = composite(s, f, [second]).rgba;
  for (let i = 3; i < a.length; i += 4) need(!(a[i] && b[i]), 'opaque layers overlap');
}
function components(p: Pixels, diagonal: boolean) {
  const pending = new Set(Array.from({ length: p.width * p.height }, (_, i) => i).filter(i => p.rgba[i * 4 + 3]));
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], ...(diagonal ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [])];
  let count = 0;
  while (pending.size) {
    const first = pending.values().next().value; need(first !== undefined, 'component seed');
    const todo = [first]; pending.delete(first); count++;
    while (todo.length) {
      const at = todo.pop(); need(at !== undefined, 'component item'); const x = at % p.width, y = Math.floor(at / p.width);
      for (const [dx, dy] of steps) {
        const xx = x + dx, yy = y + dy, i = yy * p.width + xx;
        if (xx >= 0 && yy >= 0 && xx < p.width && yy < p.height && pending.delete(i)) todo.push(i);
      }
    }
  }
  return count;
}
function put(s: Native, f: number, name: string, x: number, y: number, hex: string) {
  const layer = s.layers.findIndex(l => l.name === name), image = composite(s, f, [name]);
  need(layer >= 0, 'test layer'); Buffer.from(hex, 'hex').copy(image.rgba, (y * image.width + x) * 4);
  s.cels = s.cels.filter(c => c.frame !== f || c.layer !== layer);
  s.cels.push({ frame: f, layer, x: 0, y: 0, type: 2, opacity: 255, z: 0, image });
}

describe('ending native static outcome sources', () => {
  it('has only five visible layers and three independent one-frame tags', () => { structure(native); expect(native.slices).toEqual([]); });
  it('keeps32 unique entries and hard legal pixels including hidden-transparent data', () => palette(native));
  it('links only the shared room backdrop without inventing an animation loop', () => {
    const room = native.cels.find(c => c.frame === 1 && native.layers[c.layer].name === 'background');
    expect(room?.linkedFrom).toBe(0);
    expect(composite(native, 0, ['background']).rgba.equals(composite(native, 1, ['background']).rgba)).toBe(true);
  });
  it.each(FRAMES)('reconstructs every RGBA byte of outcome %i from ASE into its actual PNG rectangle', f => proveFrame(native, image, atlas, f));
  it.each([0, 1])('reuses canonical actor %i at exact integer2x without changing eyes, arms or four legs', f => {
    proveActor(native, f);
    const actor = composite(native, f, ['actor']), x = HERO[f].x;
    const occupied = Array.from({ length: 64 }, (_, dx) => dx).filter(dx => actor.rgba[(96 * 256 + x + dx) * 4 + 3]);
    expect(occupied).toEqual([12, 13, 14, 15, 20, 21, 22, 23, 40, 41, 42, 43, 48, 49, 50, 51]);
  });
  it('keeps actor ink only in the first two scenes and clip ink only in FOOM', () => {
    expect(ink(composite(native, 2, ['actor']))).toBe(0);
    [0, 1].forEach(f => expect(ink(composite(native, f, ['accents']))).toBe(0));
    for (const name of ['background', 'furniture', 'narrative-props']) FRAMES.forEach(f => expect(ink(composite(native, f, [name]))).toBeGreaterThan(0));
  });
  it('has twelve connected native clip silhouettes, with no clip covering the smile', () => {
    const clips = composite(native, 2, ['accents']);
    expect(components(clips, false)).toBe(12); expect(components(clips, true)).toBe(12);
    noOverlap(native, 2, 'accents', 'narrative-props');
  });
  it.each(FRAMES)('does not cover canonical actors with foreground props or clips in outcome %i', f => {
    noOverlap(native, f, 'actor', 'narrative-props'); noOverlap(native, f, 'actor', 'accents');
  });
  it('retains a physically down lever, separated shield/eye and a native smile', () => {
    const a = composite(native, 0, ['narrative-props']), w = composite(native, 1, ['narrative-props']), f = composite(native, 2, ['narrative-props']);
    expect(pixel(a, 186, 98)).toBe('b55a4aff'); expect(pixel(a, 186, 85)).toBe('071417ff');
    expect(pixel(w, 186, 64)).toBe('9dded1ff'); expect(pixel(w, 221, 60)).toBe('071417ff');
    expect(pixel(f, 115, 62)).toBe('2c2330ff'); expect(pixel(f, 140, 62)).toBe('2c2330ff');
    expect(pixel(f, 128, 77)).toBe('2c2330ff'); expect(pixel(f, 128, 68)).toBe('f5e8c8ff');
  });
  it('records exact files and the late reference honestly without runtime or full-GDD admission', () => {
    const m = JSON.parse(file('../../assets/ending-scenes-generation.json').toString());
    expect(m).toMatchObject({ stage: 'native-source-only', runtimeReady: false, fullGddComplete: false });
    for (const [path, value] of Object.entries(m.files) as [string, { bytes: number; sha256: string }][]) {
      const bytes = file('../../' + path); expect([bytes.length, hash(bytes)]).toEqual([value.bytes, value.sha256]);
    }
    expect(m.imageReference).toMatchObject({ timing: 'after native export', usedToDrawNativePixels: false, earlierClaimsAccepted: false });
    expect(hash(file('../../' + m.imageReference.path))).toBe(m.imageReference.sha256);
    expect(m.review).toMatchObject({ sameLead: true, freshColdReview: false, independentScore: null });
  });
});

describe('ending artifact negative controls', () => {
  it.each(FRAMES)('rejects a one-channel PNG change in outcome %i', f => {
    const bad = { ...image, rgba: Buffer.from(image.rgba) }; bad.rgba[(10 * 768 + f * 256 + 10) * 4] ^= 1;
    expect(() => proveFrame(native, bad, atlas, f)).toThrow('RGBA');
  });
  it.each(FRAMES)('rejects aliased atlas rectangle %i even if a plausible picture remains', f => {
    const bad = cloneAtlas(); bad.frames[f].frame.x = ((f + 1) % 3) * 256;
    expect(() => proveFrame(native, image, bad, f)).toThrow('atlas rectangle');
  });
  it.each(['background', 'actor', 'narrative-props'])('rejects hidden required layer %s', name => {
    const bad = clone(); const l = bad.layers.find(l => l.name === name); need(l, 'test layer'); l.flags &= ~1;
    expect(() => structure(bad)).toThrow('visible');
  });
  it.each([0, 1])('rejects one changed canonical pixel in actor %i', f => {
    const bad = clone(); put(bad, f, 'actor', HERO[f].x + 12, 64, 'd9ffeaff');
    expect(() => proveActor(bad, f)).toThrow('canonical');
  });
  it('rejects a missing actor instead of accepting transparent silence', () => {
    const bad = clone(); bad.cels = bad.cels.filter(c => c.frame !== 0 || bad.layers[c.layer].name !== 'actor');
    expect(() => proveActor(bad, 0)).toThrow('canonical');
  });
  it('rejects a clip pixel over the smile even if the rest of the art remains', () => {
    const bad = clone(); put(bad, 2, 'accents', 128, 68, '858eb0ff');
    expect(() => noOverlap(bad, 2, 'accents', 'narrative-props')).toThrow('overlap');
  });
  it('rejects off-palette and soft pixels independently of PNG agreement', () => {
    const bad = clone(); put(bad, 0, 'actor', 100, 64, '010203ff'); expect(() => palette(bad)).toThrow('off-palette');
    const soft = clone(); put(soft, 0, 'actor', 100, 64, 'd9775780'); expect(() => palette(soft)).toThrow('hard alpha');
  });
  it('rejects construction-layer leaks and swapped outcome names', () => {
    const bad = clone(); bad.layers.push({ name: 'layout', flags: 3, type: 0, level: 0, blend: 0, opacity: 255 });
    expect(() => structure(bad)).toThrow('five');
    const tags = clone(); tags.tags[0].name = 'foom'; expect(() => structure(tags)).toThrow('outcome tags');
  });
});
