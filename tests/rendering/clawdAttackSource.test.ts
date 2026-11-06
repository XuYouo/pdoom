import { beforeAll, describe, expect, it } from 'vitest';
import { file, hash, need, decodeAse, decodePng, composite, crop, type Native, type Pixels, type Atlas } from './clawdAttackCodec';

// Literal source contract, independent of Phaser and runtime pose selection.
const FORMS = ['aligned', 'masked', 'foom'] as const;
type Form = typeof FORMS[number];
const LAYERS = ['tentacles-back', 'legs-far', 'arm-far', 'body', 'legs-near', 'arm-near', 'mask'];
const PALETTE = ['00000000', '2c2330ff', 'd97757ff', 'eaa083ff', 'b55a4aff', '783f4aff',
  'f5e8c8ff', 'cbb696ff', '34354fff', '575c79ff', '858eb0ff', '9dded1ff', 'd9ffeaff'];
const BASE_TIMES = [400, 600, 100, 70, 100, 70, 100, 120];
const TIMES = [...BASE_TIMES, ...Array<number>(7).fill(83), ...Array<number>(7).fill(50)];
const ARM_Y = [15, 15, 15, 14, 15, 16, 15];
const FRAMES = Array.from({ length: 22 }, (_, i) => i);
const BASE = Array.from({ length: 7 }, (_, i) => i);
const root = '../../assets/candidates/clawd-attack/';
const selected = (form: Form) => LAYERS.filter(l => l !== 'mask' || form !== 'aligned').filter(l => l !== 'tentacles-back' || form === 'foom');
const cell = (s: Native, f: number, name: string) => {
  const found = s.cels.filter(c => c.frame === f && s.layers[c.layer].name === name);
  need(found.length === 1, 'exactly one cel'); return found[0];
};
let native: Native, old: Native, ase: Buffer;
const sheets = {} as Record<Form, Pixels>, atlases = {} as Record<Form, Atlas>, oldSheets = {} as Record<Form, Pixels>;
beforeAll(() => {
  ase = file('../../assets/source/clawd-attack-candidate/clawd-svg.aseprite'); native = decodeAse(ase);
  old = decodeAse(file('../../assets/source/clawd-svg.aseprite'));
  FORMS.forEach(f => {
    sheets[f] = decodePng(file(root + `clawd-${f}.png`));
    atlases[f] = JSON.parse(file(root + `clawd-${f}.json`).toString());
    oldSheets[f] = decodePng(file(`../../public/game/clawd-${f}.png`));
  });
});
function nearArm(base: number, fire: boolean): Pixels {
  const rgba = Buffer.alloc(32 * 32 * 4), top = ARM_Y[base] - (fire ? 2 : 1), left = fire ? 27 : 28;
  for (let y = top; y < top + 4; y++) for (let x = left; x < 32; x++) {
    Buffer.from(y === top && x >= (fire ? 30 : 31) ? 'eaa083ff' : 'd97757ff', 'hex').copy(rgba, (y * 32 + x) * 4);
  }
  return { width: 32, height: 32, rgba };
}
function checkAtlas(a: Atlas, form: Form) {
  need(a.frames.length === 22, 'atlas frame count');
  need(a.meta.image === `clawd-${form}.png` && a.meta.format === 'RGBA8888' && a.meta.scale === '1', 'atlas image/profile');
  need(a.meta.size.w === 704 && a.meta.size.h === 32, 'atlas natural extent');
  a.frames.forEach((f, i) => {
    need(f.filename === `clawd-svg ${i}.aseprite`, 'atlas canonical name');
    need(f.frame.x === i * 32 && f.frame.y === 0 && f.frame.w === 32 && f.frame.h === 32, 'atlas native rectangle');
    need(!f.rotated && !f.trimmed && f.sourceSize.w === 32 && f.sourceSize.h === 32, 'atlas source size');
    need(f.spriteSourceSize.x === 0 && f.spriteSourceSize.y === 0 && f.spriteSourceSize.w === 32 && f.spriteSourceSize.h === 32, 'atlas full source');
    need(f.duration === TIMES[i], 'atlas timing');
  });
  expect(a.meta.layers).toEqual(selected(form).map(name => ({ name, opacity: 255, blendMode: 'normal' })));
  expect(a.meta.frameTags.map(t => [t.name, t.from, t.to, t.direction])).toEqual([
    ['idle', 0, 1, 'forward'], ['run', 2, 5, 'forward'], ['jump', 6, 6, 'forward'], ['hurt', 7, 7, 'forward'],
    ['shot-fire-variants', 8, 14, 'forward'], ['shot-recover-variants', 15, 21, 'forward'],
  ]);
}
function proveFrame(form: Form, index: number, image = sheets[form], a = atlases[form]) {
  checkAtlas(a, form); need(image.width === 704 && image.height === 32, 'actual PNG size');
  const r = a.frames[index].frame;
  need(crop(image, r.x, r.y, r.w, r.h).rgba.equals(composite(native, index, selected(form)).rgba), 'native RGBA differs');
}
function cloneNative() {
  return { ...native, layers: native.layers.map(l => ({ ...l })), cels: native.cels.map(c => ({ ...c, image: { ...c.image, rgba: Buffer.from(c.image.rgba) } })) };
}

describe('Clawd native source and promoted runtime exports', () => {
  it('preserves the original rig, palette and timings; appended roles are not a seven-frame attack loop', () => {
    expect([old.frames, native.width, native.height, native.frames, native.depth]).toEqual([8, 32, 32, 22, 32]);
    expect(native.layers).toEqual(old.layers); expect(native.layers.map(l => l.name)).toEqual(LAYERS);
    expect(native.palette).toEqual(PALETTE); native.palettes.forEach(p => expect(p).toEqual(PALETTE));
    expect(native.durations).toEqual(TIMES); expect(native.tags.slice(0, 4)).toEqual(old.tags);
    expect(native.tags.slice(4)).toEqual([
      { name: 'shot-fire-variants', from: 8, to: 14, direction: 0, repeats: 1 },
      { name: 'shot-recover-variants', from: 15, to: 21, direction: 0, repeats: 1 },
    ]);
    expect(native.cels).toHaveLength(154); expect(native.slices).toEqual(old.slices);
  });
  it('records native provenance and package admission without claiming whole-game completion', () => {
    const m = JSON.parse(file('../../assets/clawd-attack-generation.json').toString());
    expect(m).toMatchObject({ imageGenerationClaimed: false, nativeSourceReady: true, runtimeReady: true, productionReady: true, fullGddComplete: false });
    expect(m.source.sha256).toBe(hash(ase)); expect(m.source.pivot).toEqual([16, 27]);
    expect(m.sourceAncestor.sha256).toBe(hash(file('../../assets/source/clawd-svg.aseprite')));
    FORMS.forEach(f => {
      expect(m.exports[f].pngSha256).toBe(hash(file(root + `clawd-${f}.png`)));
      expect(m.exports[f].atlasSha256).toBe(hash(file(root + `clawd-${f}.json`)));
    });
    expect(m.review).toMatchObject({ notIndependent: true, freshColdReview: false, runtimeReview: true });
  });
  it.each(FRAMES.slice(0, 8))('retains every original layer pixel, position and alpha of old frame %i', f => {
    for (const name of LAYERS) {
      const a = cell(native, f, name), b = cell(old, f, name);
      expect([a.x, a.y, a.opacity, a.z]).toEqual([b.x, b.y, b.opacity, b.z]);
      expect(a.image).toEqual(b.image);
    }
  });
  it.each(BASE.flatMap(b => [[b, true], [b, false]] as const))('base %i fire=%s only changes the agreed recoil/arm parts', (b, fire) => {
    const index = b + (fire ? 8 : 15);
    for (const name of LAYERS.filter(l => l !== 'arm-near')) {
      const a = cell(native, index, name), previous = cell(old, b, name);
      const recoil = fire && (name === 'body' || name === 'mask');
      expect([a.x, a.y, a.opacity, a.z]).toEqual([previous.x - Number(recoil), previous.y, previous.opacity, previous.z]);
      expect(a.image).toEqual(previous.image);
    }
    expect(composite(native, index, ['arm-near'])).toEqual(nearArm(b, fire));
  });
  it.each(FRAMES)('frame %i has legal hidden/visible layer pixels, no clipped ink and clear ground margin', f => {
    native.cels.filter(c => c.frame === f).forEach(c => {
      for (let i = 0; i < c.image.rgba.length; i += 4) {
        const alpha = c.image.rgba[i + 3]; expect([0, 255]).toContain(alpha);
        if (alpha) expect(PALETTE).toContain(c.image.rgba.toString('hex', i, i + 4));
      }
    });
    const all = composite(native, f, LAYERS);
    for (let y = 27; y < 32; y++) for (let x = 0; x < 32; x++) expect(all.rgba[(y * 32 + x) * 4 + 3]).toBe(0);
  });
  it.each(FORMS)('%s exports all22 native untrimmed atlas roles and six tags', f => checkAtlas(atlases[f], f));
  it.each(FORMS.flatMap(f => FRAMES.map(i => [f, i] as const)))('%s frame %i agrees with independently composited ASE, every RGBA byte', (f, i) => proveFrame(f, i));
  it.each(FORMS.flatMap(f => FRAMES.slice(0, 8).map(i => [f, i] as const)))('%s original frame %i agrees with immutable original ASE and the promoted production prefix', (f, i) => {
    expect([oldSheets[f].width, oldSheets[f].height]).toEqual([704, 32]);
    expect(crop(sheets[f], i * 32, 0, 32, 32)).toEqual(composite(old, i, selected(f)));
    expect(crop(sheets[f], i * 32, 0, 32, 32)).toEqual(crop(oldSheets[f], i * 32, 0, 32, 32));
  });
  it.each(BASE)('base %i has distinguishable fire/recover poses and preserves both pairs of leg cels', b => {
    const variants = [b, b + 8, b + 15].map(i => composite(native, i, selected('aligned')));
    expect(new Set(variants.map(i => hash(i.rgba))).size).toBe(3);
    for (const name of ['legs-far', 'legs-near']) {
      const base = composite(old, b, [name]);
      expect(composite(native, b + 8, [name])).toEqual(base);
      expect(composite(native, b + 15, [name])).toEqual(base);
    }
  });
  it.each(FORMS)('%s promoted PNG and atlas are exact native candidate exports', f => {
    for (const ext of ['png', 'json']) expect(file(`../../public/game/clawd-${f}.${ext}`)).toEqual(file(root + `clawd-${f}.${ext}`));
  });
  it.each(FORMS)('%s keeps its existing visible-colour budget', f => {
    const colors = new Set<string>();
    for (let i = 0; i < sheets[f].rgba.length; i += 4) if (sheets[f].rgba[i + 3]) colors.add(sheets[f].rgba.toString('hex', i, i + 4));
    expect(colors.size).toBe({ aligned: 3, masked: 6, foom: 10 }[f]);
  });
});

describe('Clawd independent source oracle counterexamples (not browser evidence)', () => {
  it.each(['alias', 'width', 'missing-unused', 'trim', 'rename'])('rejects unused-role atlas damage: %s', fault => {
    const bad = structuredClone(atlases.aligned);
    if (fault === 'alias') bad.frames[21].frame.x = bad.frames[20].frame.x;
    if (fault === 'width') bad.frames[21].frame.w = 31;
    if (fault === 'missing-unused') bad.frames.pop();
    if (fault === 'trim') bad.frames[21].trimmed = true;
    if (fault === 'rename') bad.frames[21].filename = 'not-a-Clawd-frame';
    expect(() => proveFrame('aligned', 0, sheets.aligned, bad)).toThrow();
  });
  it('rejects a correctly sized wrong-form sheet', () => expect(() => proveFrame('foom', 8, sheets.aligned)).toThrow(/native RGBA/));
  it('rejects a sheet whose actual size disagrees with its correct atlas', () => {
    expect(() => proveFrame('aligned', 8, { ...sheets.aligned, height: 33 })).toThrow(/actual PNG size/);
  });
  it('rejects removal of the raised palm, rather than masking it', () => {
    const bad = { ...sheets.aligned, rgba: Buffer.from(sheets.aligned.rgba) };
    for (let y = 13; y < 17; y++) for (let x = 27; x < 32; x++) bad.rgba.fill(0, (y * 704 + 8 * 32 + x) * 4, (y * 704 + 8 * 32 + x) * 4 + 4);
    expect(() => proveFrame('aligned', 8, bad)).toThrow(/native RGBA/);
  });
  it('rejects even one opaque colour-channel error', () => {
    const bad = { ...sheets.aligned, rgba: Buffer.from(sheets.aligned.rgba) };
    bad.rgba[(13 * 704 + 8 * 32 + 31) * 4] ^= 1;
    expect(() => proveFrame('aligned', 8, bad)).toThrow(/native RGBA/);
  });
  it('rejects an original idle frame relabelled as a fire pose', () => {
    const bad = { ...sheets.aligned, rgba: Buffer.from(sheets.aligned.rgba) };
    for (let y = 0; y < 32; y++) sheets.aligned.rgba.copy(bad.rgba, (y * 704 + 8 * 32) * 4, y * 704 * 4, (y * 704 + 32) * 4);
    expect(() => proveFrame('aligned', 8, bad)).toThrow(/native RGBA/);
  });
  it('rejects linked-cel positional flattening of a run variant', () => {
    const bad = cloneNative(); cell(bad, 11, 'arm-near').y = 1;
    expect(() => need(composite(bad, 11, ['arm-near']).rgba.equals(nearArm(3, true).rgba), 'arm gait flattened')).toThrow(/gait flattened/);
  });
  it('rejects a shifted opaque pixel leaving the canvas, while permitting transparent cel margins', () => {
    const bad = cloneNative(); cell(bad, 8, 'body').x = -10;
    expect(() => composite(bad, 8, ['body'])).toThrow(/opaque cel clipped/);
  });
  it('rejects soft alpha in an otherwise correct cel', () => {
    const bad = cloneNative(), image = cell(bad, 8, 'arm-near').image;
    const pixel = image.rgba.findIndex((v, i) => i % 4 === 3 && v === 255); need(pixel >= 0, 'palm ink'); image.rgba[pixel] = 128;
    expect(() => composite(bad, 8, ['arm-near'])).toThrow(/hard compositor alpha/);
  });
  it('rejects non-normal layer blending', () => {
    const bad = cloneNative(); bad.layers[3].blend = 1;
    expect(() => composite(bad, 0, ['body'])).toThrow(/normal opaque layer/);
  });
  it('rejects truncated source data and a false source size', () => {
    expect(() => decodeAse(ase.subarray(0, -1))).toThrow(/ASE header/);
    const bad = Buffer.from(ase); bad.writeUInt32LE(1, 128);
    expect(() => decodeAse(bad)).toThrow(/frame extent/);
  });
  it('rejects a self/forward link instead of silently inventing pixels', () => {
    const bad = Buffer.from(ase), link = native.chunks.find(c => c.kind === 0x2005 && ase.readUInt16LE(c.start + 13) === 1);
    need(link, 'real linked cel'); bad.writeUInt16LE(link.frame, link.start + 22);
    expect(() => decodeAse(bad)).toThrow(/backward link/);
  });
  it('rejects PNG CRC corruption before decoding pixel data', () => {
    const bad = Buffer.from(file(root + 'clawd-aligned.png')); bad[45] ^= 1;
    expect(() => decodePng(bad)).toThrow(/PNG CRC/);
  });
});
