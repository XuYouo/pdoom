import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';

// Independent source-only decoder. No Phaser, producer plan/selector, normalization or runtime-admission claim.
interface Pixels { width: number; height: number; rgba: Buffer }
interface Rect { x: number; y: number; w: number; h: number }
interface Layer { name: string; flags: number; type: number; level: number; blend: number; opacity: number }
interface Cel { frame: number; layer: number; x: number; y: number; opacity: number; type: number; z: number; linkedFrom?: number; image: Pixels }
interface Chunk { frame: number; kind: number; start: number; length: number }
interface SliceKey { frame: number; bounds: Rect; center?: Rect; pivot?: { x: number; y: number } }
interface Slice { name: string; flags: number; keys: SliceKey[] }
interface Tag { name: string; from: number; to: number; direction: number; repeats: number }
interface Native {
  width: number; height: number; frames: number; depth: number; flags: number; durations: number[];
  layers: Layer[]; cels: Cel[]; palette: string[]; paletteSizes: number[]; palettes: string[][]; chunks: Chunk[]; slices: Slice[]; tags: Tag[];
}
const PALETTE = [
  '00000000', '2c2330ff', 'd97757ff', 'eaa083ff', 'b55a4aff', '783f4aff', 'f5e8c8ff', 'cbb696ff',
  '34354fff', '575c79ff', '858eb0ff', '9dded1ff', 'd9ffeaff', '0f191bff', '24423bff', '426b50ff',
  '8fa86bff', 'b9905dff', 'e5c386ff', '723f68ff',
];
const ALLOWED = new Set(PALETTE);
const file = (path: string) => readFileSync(new URL(path, import.meta.url));
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
function need(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
function crc32(b: Buffer) {
  let crc = 0xffffffff;
  for (const byte of b) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function paeth(a: number, b: number, c: number) {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
function unzip(payload: Buffer, length: number, label: string) {
  need(length > 0 && length <= 8 * 1024 * 1024, label + ' budget');
  let result: Buffer;
  try { result = inflateSync(payload, { maxOutputLength: length + 1 }); } catch { throw Error(label + ' invalid compression'); }
  need(result.length === length, label + ' size'); return result;
}
function decodePng(b: Buffer): Pixels {
  need(b.length >= 33 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG signature');
  let offset = 8, width = 0, height = 0, ended = false, seenHeader = false;
  const parts: Buffer[] = [];
  while (offset < b.length) {
    need(offset + 12 <= b.length, 'PNG chunk header');
    const length = b.readUInt32BE(offset), kind = b.toString('ascii', offset + 4, offset + 8), end = offset + length + 12;
    need(end <= b.length, 'PNG chunk extent');
    need(b.readUInt32BE(end - 4) === crc32(b.subarray(offset + 4, end - 4)), 'PNG CRC');
    if (!seenHeader) need(kind === 'IHDR', 'PNG first IHDR');
    if (kind === 'IHDR') {
      need(!seenHeader && length === 13, 'PNG unique IHDR'); seenHeader = true;
      width = b.readUInt32BE(offset + 8); height = b.readUInt32BE(offset + 12);
      need(width > 0 && height > 0 && width * height <= 1024 * 1024, 'PNG dimensions');
      need(b.subarray(offset + 16, offset + 21).equals(Buffer.from([8, 6, 0, 0, 0])), 'PNG RGBA8 profile');
    }
    if (kind === 'IDAT') parts.push(b.subarray(offset + 8, end - 4));
    offset = end;
    if (kind === 'IEND') { need(length === 0, 'PNG IEND'); ended = true; break; }
  }
  need(ended && offset === b.length && parts.length > 0, 'PNG complete stream');
  const stride = width * 4, raw = unzip(Buffer.concat(parts), height * (stride + 1), 'PNG inflated'), rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; need(filter <= 4, 'PNG filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= 4 ? rgba[i - 4] : 0, b = y ? rgba[i - stride] : 0, c = y && x >= 4 ? rgba[i - stride - 4] : 0;
      rgba[i] = (raw[y * (stride + 1) + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) & 255;
    }
  }
  return { width, height, rgba };
}
function crop(image: Pixels, x: number, y: number, width: number, height: number): Pixels {
  need([x, y, width, height].every(Number.isInteger) && x >= 0 && y >= 0 && width > 0 && height > 0, 'crop geometry');
  need(x + width <= image.width && y + height <= image.height, 'crop bounds');
  const rgba = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) image.rgba.copy(rgba, row * width * 4, ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
  return { width, height, rgba };
}
function statistics(image: Pixels) {
  let ink = 0, left = image.width, top = image.height, right = -1, bottom = -1;
  const colors = new Set<string>();
  need(image.rgba.length === image.width * image.height * 4, 'RGBA extent');
  for (let p = 0; p < image.rgba.length; p += 4) {
    const alpha = image.rgba[p + 3]; need(alpha === 0 || alpha === 255, 'hard alpha');
    if (!alpha) continue;
    const color = image.rgba.toString('hex', p, p + 4); need(ALLOWED.has(color), 'family palette'); need(color !== 'd97757ff', 'reserved hero orange');
    colors.add(color); ink++; const x = p / 4 % image.width, y = Math.floor(p / 4 / image.width);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { ink, colors: [...colors].sort(), bbox: ink ? [left, top, right, bottom] : null };
}


function aseString(b: Buffer, offset: number, end: number) {
  need(offset + 2 <= end, 'ASE string header'); const stop = offset + 2 + b.readUInt16LE(offset);
  need(stop <= end, 'ASE string extent'); return { text: b.toString('utf8', offset + 2, stop), next: stop };
}
function decodeAse(b: Buffer): Native {
  need(b.length >= 128 && b.readUInt32LE(0) === b.length && b.readUInt16LE(4) === 0xa5e0, 'ASE header');
  const s: Native = {
    width: b.readUInt16LE(8), height: b.readUInt16LE(10), frames: b.readUInt16LE(6), depth: b.readUInt16LE(12), flags: b.readUInt32LE(14),
    durations: [], layers: [], cels: [], palette: [], paletteSizes: [], palettes: [], chunks: [], slices: [], tags: [],
  };
  need(s.depth === 32 && s.width > 0 && s.height > 0 && s.frames > 0, 'ASE RGB32 geometry');
  need(s.width * s.height <= 1024 * 1024 && s.frames <= 256, 'ASE canvas budget');
  let offset = 128;
  for (let frame = 0; frame < s.frames; frame++) {
    need(offset + 16 <= b.length, 'ASE frame header');
    const end = offset + b.readUInt32LE(offset), legacy = b.readUInt16LE(offset + 6), modern = b.readUInt32LE(offset + 12);
    const count = legacy === 65535 ? modern : legacy;
    need(end >= offset + 16 && end <= b.length && b.readUInt16LE(offset + 4) === 0xf1fa, 'ASE frame extent/magic');
    need(count > 0 && (!modern || modern === count), 'ASE chunk count'); s.durations.push(b.readUInt16LE(offset + 8));
    let p = offset + 16;
    for (let c = 0; c < count; c++) {
      need(p + 6 <= end, 'ASE chunk header'); const length = b.readUInt32LE(p), kind = b.readUInt16LE(p + 4), stop = p + length;
      need(length >= 6 && stop <= end, 'ASE chunk extent'); s.chunks.push({ frame, kind, start: p, length });
      if (kind === 0x2004) {
        need(length >= 24, 'ASE layer header'); const name = aseString(b, p + 22, stop);
        const layer = { name: name.text, flags: b.readUInt16LE(p + 6), type: b.readUInt16LE(p + 8), level: b.readUInt16LE(p + 10),
          blend: b.readUInt16LE(p + 16), opacity: b[p + 18] };
        need(layer.type === 0 && name.next === stop, 'ASE raster layer'); s.layers.push(layer);
      } else if (kind === 0x2019) {
        need(length >= 26, 'ASE palette header'); const size = b.readUInt32LE(p + 6), first = b.readUInt32LE(p + 10), last = b.readUInt32LE(p + 14);
        need(first <= last && last < size && size <= 256, 'ASE palette range'); s.paletteSizes.push(size); let q = p + 26;
        for (let i = first; i <= last; i++) {
          need(q + 6 <= stop, 'ASE palette color'); const flags = b.readUInt16LE(q); s.palette[i] = b.toString('hex', q + 2, q + 6); q += 6;
          if (flags & 1) q = aseString(b, q, stop).next;
        }
        need(q === stop, 'ASE palette end'); s.palettes.push([...s.palette]);
      } else if (kind === 0x2018) {
        need(length >= 16, 'ASE tag header'); const n = b.readUInt16LE(p + 6); let q = p + 16;
        for (let i = 0; i < n; i++) {
          need(q + 19 <= stop, 'ASE tag extent'); const name = aseString(b, q + 17, stop);
          s.tags.push({ name: name.text, from: b.readUInt16LE(q), to: b.readUInt16LE(q + 2), direction: b[q + 4], repeats: b.readUInt16LE(q + 5) }); q = name.next;
        }
        need(q === stop, 'ASE tags end');
      } else if (kind === 0x2022) {
        need(length >= 20, 'ASE slice header');
        const count = b.readUInt32LE(p + 6), flags = b.readUInt32LE(p + 10), name = aseString(b, p + 18, stop);
        need(count > 0 && count <= s.frames && (flags & ~3) === 0, 'ASE slice flags/count');
        const slice: Slice = { name: name.text, flags, keys: [] }; let q = name.next;
        for (let i = 0; i < count; i++) {
          need(q + 20 <= stop, 'ASE slice key extent');
          const key: SliceKey = { frame: b.readUInt32LE(q), bounds: {
            x: b.readInt32LE(q + 4), y: b.readInt32LE(q + 8), w: b.readUInt32LE(q + 12), h: b.readUInt32LE(q + 16),
          } };
          need(key.frame < s.frames && (!i || key.frame > slice.keys[i - 1].frame), 'ASE slice key order');
          need(key.bounds.w > 0 && key.bounds.h > 0, 'ASE slice dimensions'); q += 20;
          if (flags & 1) {
            need(q + 16 <= stop, 'ASE slice center extent');
            key.center = { x: b.readInt32LE(q), y: b.readInt32LE(q + 4), w: b.readUInt32LE(q + 8), h: b.readUInt32LE(q + 12) }; q += 16;
          }
          if (flags & 2) { need(q + 8 <= stop, 'ASE slice pivot extent'); key.pivot = { x: b.readInt32LE(q), y: b.readInt32LE(q + 4) }; q += 8; }
          slice.keys.push(key);
        }
        need(q === stop, 'ASE slice end'); s.slices.push(slice);
      } else if (kind === 0x2005) {
        need(length >= 24, 'ASE cel header');
        const type = b.readUInt16LE(p + 13), layer = b.readUInt16LE(p + 6);
        need(layer < s.layers.length, 'ASE cel layer');
        const base = { frame, layer, x: b.readInt16LE(p + 8), y: b.readInt16LE(p + 10),
          opacity: b[p + 12], type, z: b.readInt16LE(p + 15) };
        if (type === 1) {
          need(length === 24, 'ASE link extent'); const linkedFrom = b.readUInt16LE(p + 22);
          need(linkedFrom < frame, 'ASE backward link only');
          const prior = s.cels.filter(c => c.layer === layer && c.frame === linkedFrom);
          need(prior.length === 1, 'ASE link target');
          s.cels.push({ ...base, linkedFrom, image: prior[0].image });
        } else {
          need((type === 0 || type === 2) && length >= 26, 'ASE raw or compressed cel');
          const width = b.readUInt16LE(p + 22), height = b.readUInt16LE(p + 24);
          need(width > 0 && height > 0 && width * height <= 1024 * 1024, 'ASE cel dimensions');
          const payload = b.subarray(p + 26, stop);
          const rgba = type === 2 ? unzip(payload, width * height * 4, 'ASE raster') : Buffer.from(payload);
          need(rgba.length === width * height * 4, 'ASE raw raster size');
          s.cels.push({ ...base, image: { width, height, rgba } });
        }
      }
      p = stop;
    }
    need(p === end, 'ASE frame end'); offset = end;
  }
  need(offset === b.length, 'ASE file end'); return s;
}
function paint(target: Pixels, image: Pixels, x: number, y: number) {
  need(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x + image.width <= target.width && y + image.height <= target.height, 'cel canvas bounds');
  for (let yy = 0; yy < image.height; yy++) for (let xx = 0; xx < image.width; xx++) {
    const at = (yy * image.width + xx) * 4, alpha = image.rgba[at + 3]; need(alpha === 0 || alpha === 255, 'hard compositor alpha');
    if (alpha) image.rgba.copy(target.rgba, ((y + yy) * target.width + x + xx) * 4, at, at + 4);
  }
}
function composite(s: Native, frame: number, selected?: readonly string[]): Pixels {
  need(Number.isInteger(frame) && frame >= 0 && frame < s.frames, 'composite frame');
  const target = { width: s.width, height: s.height, rgba: Buffer.alloc(s.width * s.height * 4) };
  for (const [i, layer] of s.layers.entries()) {
    if (selected ? !selected.includes(layer.name) : !(layer.flags & 1)) continue;
    need(layer.type === 0 && layer.level === 0 && layer.blend === 0 && layer.opacity === 255, 'normal opaque layer');
    const cels = s.cels.filter(c => c.frame === frame && c.layer === i); need(cels.length <= 1, 'unique layer/frame cel');
    for (const cel of cels) { need(cel.opacity === 255 && cel.z === 0, 'normal opaque cel'); paint(target, cel.image, cel.x, cel.y); }
  }
  return target;
}


interface Atlas {
  frames: { filename: string; frame: Rect; rotated: boolean; trimmed: boolean;
    spriteSourceSize: Rect; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; format: string; scale: string; size: { w: number; h: number };
    frameTags: { name: string; from: number; to: number; direction: string }[];
    layers: { name: string; opacity: number; blendMode: string }[] };
}
const POSES = ['neutral', 'approved', 'disapproved', 'hacked'] as const;
const LAYERS = ['legs', 'torso', 'head', 'arm-far', 'desk', 'gesture', 'tentacle'];
let ase: Buffer, native: Native, pngBytes: Buffer, sheet: Pixels, atlas: Atlas;
beforeAll(() => {
  ase = file('../../assets/source/human-rater.aseprite'); native = decodeAse(ase);
  pngBytes = file('../../public/game/human-rater.png'); sheet = decodePng(pngBytes);
  atlas = JSON.parse(file('../../public/game/human-rater.json').toString());
});
const alpha = (image: Pixels, x: number, y: number) => image.rgba[(y * image.width + x) * 4 + 3];
const layerImage = (name: string, frame: number) => composite(native, frame, [name]);
function checkAtlas(value: Atlas) {
  expect(value.frames).toHaveLength(4);
  expect(value.meta).toMatchObject({ image: 'human-rater.png', format: 'RGBA8888', scale: '1', size: { w: 256, h: 64 } });
  POSES.forEach((pose, i) => {
    expect(value.frames[i]).toEqual({ filename: `human-rater #${pose}.aseprite`, frame: { x: i * 64, y: 0, w: 64, h: 64 },
      rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 }, sourceSize: { w: 64, h: 64 }, duration: 100 });
  });
  expect(value.meta.frameTags.map(({ name, from, to, direction }) => ({ name, from, to, direction })))
    .toEqual(POSES.map((name, i) => ({ name, from: i, to: i, direction: 'forward' })));
  expect(value.meta.layers).toEqual(LAYERS.map(name => ({ name, opacity: 255, blendMode: 'normal' })));
}
function shifted(image: Pixels, dx: number): Pixels {
  const result = { width: image.width, height: image.height, rgba: Buffer.alloc(image.rgba.length) };
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (!alpha(image, x, y)) continue;
    need(x + dx >= 0 && x + dx < image.width, 'shift loses no ink');
    const p = (y * image.width + x) * 4;
    image.rgba.copy(result.rgba, (y * image.width + x + dx) * 4, p, p + 4);
  }
  return result;
}
function skinCount(image: Pixels, rect: Rect) {
  const area = crop(image, rect.x, rect.y, rect.w, rect.h); let count = 0;
  for (let p = 0; p < area.rgba.length; p += 4) if (['cbb696ff', 'f5e8c8ff'].includes(area.rgba.toString('hex', p, p + 4))) count++;
  return count;
}
describe('Human Rater native source, independently decoded; not runtime admission', () => {
  it('keeps 64-square RGB32 geometry, four independent static tags, and exactly the existing palette', () => {
    expect([native.width, native.height, native.frames, native.depth]).toEqual([64, 64, 4, 32]);
    expect(native.durations).toEqual([100, 100, 100, 100]);
    expect(native.palette).toEqual(PALETTE); expect(native.palettes.length).toBeGreaterThan(0);
    native.palettes.forEach(p => expect(p).toEqual(PALETTE));
    expect(native.tags).toEqual(POSES.map((name, i) => ({ name, from: i, to: i, direction: 0, repeats: 0 })));
    expect(native.layers.map(l => l.name)).toEqual(LAYERS);
    native.layers.forEach(l => { expect(l.flags & 1).toBe(1); expect([l.type, l.level, l.blend, l.opacity]).toEqual([0, 0, 0, 255]); });
  });
  it('records real native provenance and current file hashes with separate runtime admission and no imagegen or whole-game release claim', () => {
    const provenance = JSON.parse(file('../../assets/human-rater-generation.json').toString());
    expect(provenance).toMatchObject({ referenceMode: 'none-user-approved-native', imageGenerationClaimed: false,
      imageGenerationOutput: null, nativeSourceReady: true, productionReady: true, runtimeReady: true, fullGddComplete: false, projectReleaseReady: false });
    expect(provenance.sourceReview.runtimeReview).toBe(false);
    expect(provenance.runtimeAdmission).toMatchObject({ revision: 'R36', maskedPixels: false, fullBrowser: { uniquePassed: 153, actualExit: 0, retries: 0 } });
    expect(provenance.userDecision.questionId).toBe('human-rater-reference-path');
    expect(provenance.source.sha256).toBe(hash(ase));
    expect(provenance.export.png.sha256).toBe(hash(pngBytes));
    expect(provenance.export.atlas.sha256).toBe(hash(file('../../public/game/human-rater.json')));
    expect(provenance.source.pivot).toEqual([32, 60]); expect(provenance.source.portraitCrop).toEqual([8, 4, 48, 48]);
    expect(provenance.review).toMatchObject({ notIndependent: true, freshColdReview: false, runtimeReview: true });
  });
  it('exports actual 64-square rectangles, not padded-frame metadata with a different source size', () => checkAtlas(atlas));
  it('keeps a 256-by-64 native sheet without resizing', () => expect([sheet.width, sheet.height]).toEqual([256, 64]));
  it.each(POSES)('%s has binary alpha, palette legality and the fixed ground/pivot clearance', pose => {
    const frame = POSES.indexOf(pose), image = composite(native, frame), stats = statistics(image);
    expect(stats.ink).toBeGreaterThan(750); expect(stats.ink).toBeLessThan(2000);
    expect(stats.bbox).toEqual([5, 7, pose === 'hacked' ? 60 : 59, 59]);
    expect(statistics(crop(image, 0, 60, 64, 4)).ink).toBe(0);
    expect(statistics(crop(image, 0, 0, 64, 6)).ink).toBe(0);
    expect(statistics(crop(image, 0, 0, 4, 64)).ink).toBe(0);
    expect(statistics(crop(image, 61, 0, 3, 64)).ink).toBe(0);
  });
  it.each(POSES)('%s native visible-layer composite equals exported pixels byte for byte', pose => {
    const frame = POSES.indexOf(pose), source = composite(native, frame);
    expect(crop(sheet, frame * 64, 0, 64, 64).rgba.equals(source.rgba)).toBe(true);
  });
  it('makes all four whole poses and 48-square portraits distinct without resampling', () => {
    const images = POSES.map((_, i) => composite(native, i));
    expect(new Set(images.map(i => hash(i.rgba))).size).toBe(4);
    expect(new Set(images.map(i => hash(crop(i, 8, 4, 48, 48).rgba))).size).toBe(4);
  });
  it.each(['desk', 'legs'])('shares immutable %s cels across all four poses', name => {
    const layer = native.layers.findIndex(l => l.name === name);
    const cels = native.cels.filter(c => c.layer === layer);
    expect(cels).toHaveLength(4); expect([0, 2]).toContain(cels[0].type);
    cels.slice(1).forEach(c => { expect(c.type).toBe(1); expect(c.linkedFrom).toBe(0); });
    expect(new Set(POSES.map((_, i) => hash(layerImage(name, i).rgba))).size).toBe(1);
  });
  it('keeps ordinary torsos identical, and genuinely moves the hacked torso exactly seven pixels left', () => {
    const zero = layerImage('torso', 0);
    expect(layerImage('torso', 1).rgba.equals(zero.rgba)).toBe(true);
    expect(layerImage('torso', 2).rgba.equals(zero.rgba)).toBe(true);
    expect(layerImage('torso', 3).rgba.equals(shifted(zero, -7).rgba)).toBe(true);
  });
  it('keeps head silhouette volume; hacked expression changes color, not scale or alpha', () => {
    const zero = layerImage('head', 0), translated = shifted(zero, -7);
    for (let frame = 0; frame < 4; frame++) {
      const target = layerImage('head', frame), reference = frame === 3 ? translated : zero;
      for (let p = 3; p < target.rgba.length; p += 4) expect(target.rgba[p]).toBe(reference.rgba[p]);
    }
    expect(layerImage('head', 3).rgba.equals(translated.rgba)).toBe(false);
  });
  it.each(POSES)('%s hands do not cover the face and survive the unscaled portrait crop', pose => {
    const frame = POSES.indexOf(pose), head = layerImage('head', frame);
    for (const name of ['gesture', 'arm-far']) {
      const hand = layerImage(name, frame);
      for (let p = 3; p < head.rgba.length; p += 4) expect(Boolean(head.rgba[p] && hand.rgba[p])).toBe(false);
      expect(statistics(crop(hand, 8, 4, 48, 48)).ink).toBe(statistics(hand).ink);
    }
  });
  it('puts the approved thumb above its cuff and the disapproved thumb below, with upper-left skin light', () => {
    const up = layerImage('gesture', 1), down = layerImage('gesture', 2);
    expect(skinCount(up, { x: 47, y: 16, w: 8, h: 11 })).toBeGreaterThan(20);
    expect(skinCount(down, { x: 47, y: 16, w: 8, h: 11 })).toBe(0);
    expect(skinCount(down, { x: 50, y: 34, w: 4, h: 4 })).toBeGreaterThan(3);
    expect(skinCount(up, { x: 50, y: 34, w: 4, h: 4 })).toBe(0);
  });
  it('contains exactly one authored tentacle cel, only hacked, physically touching the mint button', () => {
    const layer = native.layers.findIndex(l => l.name === 'tentacle');
    expect(native.cels.filter(c => c.layer === layer).map(c => c.frame)).toEqual([3]);
    for (let i = 0; i < 3; i++) expect(statistics(layerImage('tentacle', i)).ink).toBe(0);
    const image = layerImage('tentacle', 3), stats = statistics(image);
    expect(stats.bbox).toEqual([48, 32, 60, 59]); expect(stats.colors).toContain('723f68ff');
    expect(alpha(image, 52, 40)).toBe(255); expect(alpha(layerImage('desk', 3), 52, 40)).toBe(255);
  });
});
describe('Human Rater decoder and package fail-closed controls', () => {
  it('rejects a damaged PNG CRC', () => { const bad = Buffer.from(pngBytes); bad[29] ^= 1; expect(() => decodePng(bad)).toThrow('PNG CRC'); });
  it('rejects declared extra source frames rather than accepting a truncated native file', () => {
    const bad = Buffer.from(ase); bad.writeUInt16LE(5, 6); expect(() => decodeAse(bad)).toThrow('ASE frame header');
  });
  it('rejects zero source geometry', () => { const bad = Buffer.from(ase); bad.writeUInt16LE(0, 8); expect(() => decodeAse(bad)).toThrow('ASE RGB32 geometry'); });
  it('rejects a forward/cyclic linked cel rather than guessing a substitute image', () => {
    const link = native.chunks.find(c => c.kind === 0x2005 && ase.readUInt16LE(c.start + 13) === 1)!;
    expect(link).toBeDefined(); const bad = Buffer.from(ase); bad.writeUInt16LE(99, link.start + 22);
    expect(() => decodeAse(bad)).toThrow('ASE backward link only');
  });
  it('rejects an out-of-canvas cel instead of silently normalizing away misplaced pixels', () => {
    const cel = native.chunks.find(c => c.kind === 0x2005)!;
    const bad = Buffer.from(ase); bad.writeInt16LE(-1, cel.start + 8);
    expect(() => composite(decodeAse(bad), 0)).toThrow('cel canvas bounds');
  });
  it('rejects soft cel opacity even when the PNG could look superficially similar', () => {
    const cel = native.chunks.find(c => c.kind === 0x2005)!;
    const bad = Buffer.from(ase); bad[cel.start + 12] = 128;
    expect(() => composite(decodeAse(bad), 0)).toThrow('normal opaque cel');
  });
  it('rejects the actual padding1 metadata mismatch that prompted native re-export', () => {
    const raw: Atlas = structuredClone(atlas);
    raw.meta.size = { w: 264, h: 66 };
    raw.frames.forEach((frame, i) => { frame.frame = { x: i * 66, y: 0, w: 66, h: 66 }; });
    expect(() => checkAtlas(raw)).toThrow();
  });
  it.each(POSES)('rejects an aliased or missing unused %s atlas record', pose => {
    const i = POSES.indexOf(pose), alias: Atlas = structuredClone(atlas);
    alias.frames[i].frame = { ...alias.frames[(i + 1) % 4].frame };
    expect(() => checkAtlas(alias)).toThrow();
    const missing: Atlas = structuredClone(atlas); missing.frames.splice(i, 1);
    expect(() => checkAtlas(missing)).toThrow();
  });
});
