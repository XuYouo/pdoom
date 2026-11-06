import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';

// Independent source-only decoder. No Phaser, producer plan/selector, normalization or runtime-admission claim.
interface Pixels { width: number; height: number; rgba: Buffer }
interface Rect { x: number; y: number; w: number; h: number }
interface Layer { name: string; flags: number; type: number; level: number; blend: number; opacity: number }
interface Cel { frame: number; layer: number; x: number; y: number; opacity: number; type: number; z: number; image: Pixels }
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
        need(length >= 26, 'ASE cel header'); const type = b.readUInt16LE(p + 13);
        need(type === 0 || type === 2, 'ASE independent raw or compressed RGBA cel');
        const width = b.readUInt16LE(p + 22), height = b.readUInt16LE(p + 24);
        need(width > 0 && height > 0 && width * height <= 1024 * 1024, 'ASE cel dimensions');
        const payload = b.subarray(p + 26, stop), rgba = type === 2 ? unzip(payload, width * height * 4, 'ASE raster') : Buffer.from(payload);
        need(rgba.length === width * height * 4, 'ASE raw raster size');
        s.cels.push({ frame, layer: b.readUInt16LE(p + 6), x: b.readInt16LE(p + 8), y: b.readInt16LE(p + 10),
          opacity: b[p + 12], type, z: b.readInt16LE(p + 15), image: { width, height, rgba } });
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
    slices: { name: string; keys: SliceKey[] }[];
    frameTags: { name: string; from: number; to: number; direction: string }[];
    layers: { name: string; opacity: number; blendMode: string }[] };
}
const ROLES = ['token', 'compute', 'heal'] as const;
const ROLE_COLORS = [
  ['2c2330ff', '783f4aff', 'b9905dff', 'e5c386ff', 'f5e8c8ff'],
  ['34354fff', '575c79ff', '858eb0ff', '723f68ff', 'cbb696ff'],
  ['24423bff', '426b50ff', '9dded1ff', 'd9ffeaff'],
];
const BOXES = [[11, 11, 20, 20], [8, 7, 23, 24], [9, 9, 22, 22]];
const CANVAS = { x: 0, y: 0, w: 32, h: 32 }, PIVOT = { x: 16, y: 16 };
// Actual Lead-export candidate snapshot, independently checked below; not runtime admission.
const FROZEN_FILES = {
  '../../assets/source/pickup-items.aseprite': '8dbb67cb410b950aa4bb07486ad654216755669cb4dc3162b23400d67b780e08',
  '../../public/game/pickup-items.png': '11956e3e6df80d034490ebe2b2efc73cd984646c491644e7cb7effa530c2d358',
  '../../public/game/pickup-items.json': 'bd20d7af35385dc7747fec219b067dc128dad8b5088488ab309f42c675ed6068',
};
function equalRect(a: Rect, b: Rect) { return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h; }
function atlasContract(a: Atlas) {
  need(Array.isArray(a.frames) && a.frames.length === 3, 'all three frames eager');
  need(a.meta.image === 'pickup-items.png' && a.meta.format === 'RGBA8888' && a.meta.scale === '1', 'native atlas metadata');
  need(a.meta.size.w === 96 && a.meta.size.h === 32, 'atlas dimensions');
  for (const [i, frame] of a.frames.entries()) {
    need(frame.filename === `pickup-items ${i}.aseprite`, 'canonical filename');
    need(equalRect(frame.frame, { x: i * 32, y: 0, w: 32, h: 32 }), 'literal frame cut');
    need(frame.rotated === false && frame.trimmed === false && equalRect(frame.spriteSourceSize, CANVAS), 'untrimmed unrotated native frame');
    need(frame.sourceSize.w === 32 && frame.sourceSize.h === 32 && frame.duration === 100, 'static32 frame source size/duration');
  }
  need(a.meta.frameTags.length === 3 && new Set(a.meta.frameTags.map(t => t.name)).size === 3, 'three unique static tags');
  for (const [i, role] of ROLES.entries()) {
    const tag = a.meta.frameTags.find(t => t.name === role); need(tag && tag.from === i && tag.to === i && tag.direction === 'forward', 'role single-frame tag');
  }
  need(a.meta.slices.length === 1 && a.meta.slices[0].name === 'pickup-origin', 'one origin slice');
  const keys = a.meta.slices[0].keys; need(keys.length === 1 && keys[0].frame === 0 && equalRect(keys[0].bounds, CANVAS), 'slice frame/canvas');
  need(keys[0].center && equalRect(keys[0].center, CANVAS) && keys[0].pivot?.x === 16 && keys[0].pivot.y === 16, 'exact full-canvas center and native pivot');
  need(a.meta.layers.length === 3 && new Set(a.meta.layers.map(l => l.name)).size === 3, 'three unique source-only layers');
  for (const role of ROLES) {
    const layer = a.meta.layers.find(l => l.name === role); need(layer && layer.opacity === 255 && layer.blendMode === 'normal', 'named source layer');
  }
}
function roleContract(image: Pixels, index: number) {
  need(image.width === 32 && image.height === 32, 'native32 pickup canvas'); const result = statistics(image);
  need(result.ink > 0 && JSON.stringify(result.bbox) === JSON.stringify(BOXES[index]), 'exact authored pickup bbox');
  need(result.colors.length >= 3 && result.colors.length <= ROLE_COLORS[index].length, 'role colour budget');
  need(result.colors.every(c => ROLE_COLORS[index].includes(c)), 'role colour family');
  // Every role is a single hard, filled icon; no disconnected sparkles or translucent halo.
  const alpha = (x: number, y: number) => x >= 0 && y >= 0 && x < 32 && y < 32 && image.rgba[(y * 32 + x) * 4 + 3] === 255;
  need(alpha(15, 15) && alpha(16, 15) && alpha(15, 16) && alpha(16, 16), 'filled central face');
  const start = image.rgba.findIndex((value, at) => at % 4 === 3 && value === 255) >> 2;
  const seen = new Set<number>([start]), queue = [start];
  while (queue.length) {
    const at = queue.pop()!, x = at % 32, y = Math.floor(at / 32);
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const next = yy * 32 + xx; if (alpha(xx, yy) && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  need(seen.size === result.ink, 'one connected native icon'); return result;
}
const pngChunk = (name: string, payload: Buffer) => {
  const result = Buffer.alloc(payload.length + 12); result.writeUInt32BE(payload.length, 0); result.write(name, 4, 'ascii');
  payload.copy(result, 8); result.writeUInt32BE(crc32(result.subarray(4, result.length - 4)), result.length - 4); return result;
};
function pngFixture(image: Pixels, filter: number) {
  const stride = image.width * 4, data = Buffer.alloc(image.height * (stride + 1)), header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0); header.writeUInt32BE(image.height, 4); header[8] = 8; header[9] = 6;
  for (let y = 0; y < image.height; y++) {
    data[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= 4 ? image.rgba[i - 4] : 0, b = y ? image.rgba[i - stride] : 0, c = y && x >= 4 ? image.rgba[i - stride - 4] : 0;
      data[y * (stride + 1) + 1 + x] = (image.rgba[i] - [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) & 255;
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(data)), pngChunk('IEND', Buffer.alloc(0))]);
}
let ase: Buffer, png: Buffer, atlas: Atlas, native: Native, packed: Pixels, sheets: Pixels[];
beforeAll(() => {
  ase = file('../../assets/source/pickup-items.aseprite'); png = file('../../public/game/pickup-items.png');
  atlas = JSON.parse(file('../../public/game/pickup-items.json').toString()) as Atlas;
  native = decodeAse(ase); packed = decodePng(png); sheets = ROLES.map((_, i) => crop(packed, i * 32, 0, 32, 32));
});
describe('pickup items independent source-only package', () => {
  it('reads the three actually frozen artifact bytes', () => {
    for (const [name, digest] of Object.entries(FROZEN_FILES)) { expect(digest).toMatch(/^[a-f0-9]{64}$/); expect(hash(file(name))).toBe(digest); }
  });
  it('has exactly32x32 RGB and three static100ms source frames', () => {
    expect([native.width, native.height, native.depth, native.flags, native.frames]).toEqual([32, 32, 32, 1, 3]);
    expect(native.durations).toEqual([100, 100, 100]); expect([packed.width, packed.height]).toEqual([96, 32]);
  });
  it('retains the exact shared20 palette with no transient palette widening', () => {
    expect(native.paletteSizes.length).toBeGreaterThan(0); expect(native.paletteSizes.every(n => n === 20)).toBe(true);
    expect(native.palette).toEqual(PALETTE); for (const palette of native.palettes) expect(palette).toEqual(PALETTE);
  });
  it('binds three distinct visible normal role layers by name, not ordinal/editability', () => {
    expect(native.layers.map(l => l.name).sort()).toEqual([...ROLES].sort());
    for (const layer of native.layers) {
      expect([layer.type, layer.level, layer.blend, layer.opacity]).toEqual([0, 0, 0, 255]);
      expect(layer.flags & 1).toBe(1); expect(layer.flags & 64).toBe(0);
    }
    expect(new Set(native.cels.map(c => `${c.frame}/${c.layer}`)).size).toBe(native.cels.length);
    for (const cel of native.cels) { expect(cel.layer).toBeLessThan(3); expect(cel.opacity).toBe(255); expect(cel.z).toBe(0); statistics(cel.image); }
  });
  it('has exactly three independently addressed static native tags', () => {
    expect(native.tags).toHaveLength(3);
    for (const [i, role] of ROLES.entries()) expect(native.tags.filter(t => t.name === role)).toEqual([{ name: role, from: i, to: i, direction: 0, repeats: 0 }]);
  });
  it('keeps exact full-canvas metadata center and pivot16,16 without runtime stretching', () => {
    expect(native.slices).toEqual([{ name: 'pickup-origin', flags: 3, keys: [{ frame: 0, bounds: CANVAS, center: CANVAS, pivot: PIVOT }] }]);
  });
  it('validates the full atlas, including unused heal, before any role selection', () => { atlasContract(atlas); });
  for (const [index, role] of ROLES.entries()) describe(role, () => {
    it('matches every native RGBA byte to its literal PNG cut, including transparency', () => {
      expect(composite(native, index).rgba).toEqual(sheets[index].rgba);
    });
    it('owns ink only on its role frame and no other layer contributes there', () => {
      for (let frame = 0; frame < 3; frame++) {
        const image = composite(native, frame, [role]);
        if (frame === index) expect(image.rgba).toEqual(sheets[index].rgba); else expect(statistics(image).ink).toBe(0);
      }
      for (const other of ROLES.filter(name => name !== role)) expect(statistics(composite(native, index, [other])).ink).toBe(0);
    });
    it('keeps its exact hard silhouette, allowed source colours and real ink count', () => {
      const source = roleContract(sheets[index], index), direct = roleContract(composite(native, index, [role]), index);
      expect(direct).toEqual(source); expect(source.ink).toBeLessThanOrEqual((BOXES[index][2] - BOXES[index][0] + 1) * (BOXES[index][3] - BOXES[index][1] + 1));
    });
    it('has no ink outside its declared native envelope', () => {
      const box = BOXES[index], image = sheets[index];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        if (x < box[0] || y < box[1] || x > box[2] || y > box[3]) expect(image.rgba[(y * 32 + x) * 4 + 3]).toBe(0);
      }
    });
  });
  it('keeps three distinct source pictures, never a relabelled common sprite', () => { expect(new Set(sheets.map(image => hash(image.rgba))).size).toBe(3); });
  it('fills the token face instead of an empty ring; no arbitrary Hero100 threshold', () => {
    expect(statistics(crop(sheets[0], 13, 13, 6, 6)).ink).toBe(36); expect(statistics(sheets[0]).ink).toBeLessThanOrEqual(100);
  });
  it('uses the explicit6x14 plus14x6 mint repair cross, not a red badge or extra glow', () => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const filled = x >= 13 && x <= 18 && y >= 9 && y <= 22 || x >= 9 && x <= 22 && y >= 13 && y <= 18;
      expect(sheets[2].rgba[(y * 32 + x) * 4 + 3]).toBe(filled ? 255 : 0);
    }
    expect(statistics(sheets[2]).ink).toBe(132);
  });
});


describe('independent decoder and contract counterexamples, never rendered evidence', () => {
  it.each([0, 1, 2, 3, 4])('reconstructs PNG filter%i with unequal RGBA channels and row history', filter => {
    const image = { width: 4, height: 3, rgba: Buffer.from(Array.from({ length: 48 }, (_, i) => (i * 47 + 13) & 255)) };
    expect(decodePng(pngFixture(image, filter))).toEqual(image);
  });
  it('rejects damaged CRC, chunk overflow, truncation and trailing PNG bytes', () => {
    const crc = Buffer.from(png); crc[crc.length - 1] ^= 1; expect(() => decodePng(crc)).toThrow('PNG CRC');
    expect(() => decodePng(png.subarray(0, -1))).toThrow();
    const extent = Buffer.from(png); extent.writeUInt32BE(png.length, 8); expect(() => decodePng(extent)).toThrow('PNG chunk extent');
    expect(() => decodePng(Buffer.concat([png, Buffer.from([0])]))).toThrow('PNG complete stream');
  });
  it('rejects invalid ASE headers, dimensions, frame/chunk budgets and palette ranges', () => {
    const mutate = (change: (b: Buffer) => void, message: string) => { const b = Buffer.from(ase); change(b); expect(() => decodeAse(b)).toThrow(message); };
    expect(() => decodeAse(ase.subarray(0, -1))).toThrow('ASE header');
    mutate(b => b.writeUInt16LE(0, 4), 'ASE header');
    mutate(b => b.writeUInt16LE(0, 6), 'ASE RGB32 geometry');
    mutate(b => { b.writeUInt16LE(65535, 8); b.writeUInt16LE(65535, 10); }, 'ASE canvas budget');
    mutate(b => b.writeUInt32LE(15, 128), 'ASE frame extent/magic');
    mutate(b => b.writeUInt32LE(5, 144), 'ASE chunk extent');
    const palette = native.chunks.find(c => c.kind === 0x2019)!;
    mutate(b => b.writeUInt32LE(20, palette.start + 14), 'ASE palette range');
  });
  it('rejects unsupported cel references and decompressed-size substitutions', () => {
    const cel = native.chunks.find(c => c.kind === 0x2005 && ase.readUInt16LE(c.start + 13) === 2)!;
    const link = Buffer.from(ase); link.writeUInt16LE(1, cel.start + 13);
    expect(() => decodeAse(link)).toThrow('ASE independent raw or compressed RGBA cel');
    const size = Buffer.from(ase); size.writeUInt16LE(1, cel.start + 22); expect(() => decodeAse(size)).toThrow('ASE raster');
  });
  it('preserves transparent offset compositing and rejects soft alpha/lossy bounds', () => {
    const target = { width: 3, height: 2, rgba: Buffer.alloc(24) }, ink = { width: 1, height: 1, rgba: Buffer.from('34354fff', 'hex') };
    paint(target, ink, 2, 1); expect(target.rgba.toString('hex')).toBe('00000000'.repeat(5) + '34354fff');
    paint(target, { ...ink, rgba: Buffer.alloc(4) }, 2, 1); expect(crop(target, 2, 1, 1, 1).rgba).toEqual(ink.rgba);
    expect(() => paint(target, ink, -1, 0)).toThrow('cel canvas bounds');
    expect(() => crop(target, 0, 0, 4, 1)).toThrow('crop bounds');
    expect(() => paint(target, { ...ink, rgba: Buffer.from('34354f80', 'hex') }, 0, 0)).toThrow('hard compositor alpha');
    const duplicate = { ...native, cels: [...native.cels, native.cels[0]] };
    expect(() => composite(duplicate, native.cels[0].frame)).toThrow('unique layer/frame cel');
  });
  it('rejects off-palette, reserved orange, shifted role bounds and missing central face', () => {
    expect(() => statistics({ width: 1, height: 1, rgba: Buffer.from('010203ff', 'hex') })).toThrow('family palette');
    expect(() => statistics({ width: 1, height: 1, rgba: Buffer.from('d97757ff', 'hex') })).toThrow('reserved hero orange');
    const shifted = { width: 32, height: 32, rgba: Buffer.alloc(32 * 32 * 4) };
    paint(shifted, crop(sheets[0], 11, 11, 10, 10), 12, 11); expect(() => roleContract(shifted, 0)).toThrow('exact authored pickup bbox');
    const hollow = { ...sheets[0], rgba: Buffer.from(sheets[0].rgba) }; hollow.rgba.fill(0, (15 * 32 + 15) * 4, (15 * 32 + 15) * 4 + 4);
    expect(() => roleContract(hollow, 0)).toThrow('filled central face');
  });
  it('rejects even unused last-frame omission, size/cut/trim and natural-sheet metadata faults', () => {
    const broken = (change: (copy: Atlas) => void, message: string) => {
      const copy = JSON.parse(JSON.stringify(atlas)) as Atlas; change(copy); expect(() => atlasContract(copy)).toThrow(message);
    };
    broken(a => a.frames.pop(), 'all three frames eager');
    broken(a => { a.frames[2].frame.w = 31; }, 'literal frame cut');
    broken(a => { a.frames[2].frame.x = 63; }, 'literal frame cut');
    broken(a => { a.frames[2].trimmed = true; }, 'untrimmed unrotated native frame');
    broken(a => { a.frames[2].sourceSize.w = 31; }, 'static32 frame source size/duration');
    broken(a => { a.meta.size.w = 97; }, 'atlas dimensions');
    broken(a => { a.meta.frameTags[2].from = 1; }, 'role single-frame tag');
    broken(a => { a.meta.slices[0].keys[0].pivot = { x: 15, y: 16 }; }, 'exact full-canvas center and native pivot');
    broken(a => { a.meta.slices[0].keys[0].center = { x: 0, y: 0, w: 31, h: 32 }; }, 'exact full-canvas center and native pivot');
  });
});
