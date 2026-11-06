import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// Independent Omega source/export checks only: no producer summary, production selector,
// Phaser, browser, generator, animation or runtime-admission claim.
interface Pixels { width: number; height: number; rgba: Buffer }
interface Layer { name: string; flags: number; type: number; level: number; blend: number; opacity: number; tileset?: number }
interface Grid { width: number; height: number; bits: number; masks: number[]; ids: number[] }
interface Cel { frame: number; layer: number; x: number; y: number; opacity: number; type: number; z: number; image?: Pixels; grid?: Grid }
interface Tileset { id: number; flags: number; count: number; width: number; height: number; base: number; name: string; rgba: Buffer }
interface Chunk { frame: number; kind: number; start: number; length: number }
interface SliceKey { frame: number; bounds: Rect; center?: Rect; pivot?: { x: number; y: number } }
interface Slice { name: string; flags: number; keys: SliceKey[] }
interface Rect { x: number; y: number; w: number; h: number }
interface Native {
  width: number; height: number; frames: number; depth: number; flags: number; durations: number[];
  layers: Layer[]; cels: Cel[]; tilesets: Tileset[]; palette: string[]; paletteSizes: number[]; chunks: Chunk[]; slices: Slice[];
  tags: { name: string; from: number; to: number; direction: number; repeats: number }[];
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
    durations: [], layers: [], cels: [], tilesets: [], palette: [], paletteSizes: [], chunks: [], tags: [], slices: [],
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
        const layer: Layer = { name: name.text, flags: b.readUInt16LE(p + 6), type: b.readUInt16LE(p + 8), level: b.readUInt16LE(p + 10), blend: b.readUInt16LE(p + 16), opacity: b[p + 18] };
        if (layer.type === 2) { need(name.next + 4 === stop, 'ASE tilemap layer index'); layer.tileset = b.readUInt32LE(name.next); }
        else need(layer.type === 0 && name.next === stop, 'ASE raster layer');
        s.layers.push(layer);
      } else if (kind === 0x2019) {
        need(length >= 26, 'ASE palette header'); const size = b.readUInt32LE(p + 6), first = b.readUInt32LE(p + 10), last = b.readUInt32LE(p + 14);
        need(first <= last && last < size && size <= 256, 'ASE palette range'); s.paletteSizes.push(size); let q = p + 26;
        for (let i = first; i <= last; i++) {
          need(q + 6 <= stop, 'ASE palette color'); const flags = b.readUInt16LE(q); s.palette[i] = b.toString('hex', q + 2, q + 6); q += 6;
          if (flags & 1) q = aseString(b, q, stop).next;
        }
        need(q === stop, 'ASE palette end');
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
          if (flags & 2) {
            need(q + 8 <= stop, 'ASE slice pivot extent');
            key.pivot = { x: b.readInt32LE(q), y: b.readInt32LE(q + 4) }; q += 8;
          }
          slice.keys.push(key);
        }
        need(q === stop, 'ASE slice end'); s.slices.push(slice);
      } else if (kind === 0x2023) {
        need(length >= 40, 'ASE tileset header'); const name = aseString(b, p + 38, stop), flags = b.readUInt32LE(p + 10);
        need((flags & 3) === 2 && name.next + 4 <= stop, 'ASE embedded tileset');
        const compressed = b.readUInt32LE(name.next); need(name.next + 4 + compressed === stop, 'ASE tileset compressed extent');
        const width = b.readUInt16LE(p + 18), height = b.readUInt16LE(p + 20), count = b.readUInt32LE(p + 14);
        s.tilesets.push({ id: b.readUInt32LE(p + 6), flags, count, width, height, base: b.readInt16LE(p + 22), name: name.text,
          rgba: unzip(b.subarray(name.next + 4, stop), count * width * height * 4, 'ASE tileset') });
      } else if (kind === 0x2005) {
        need(length >= 26, 'ASE cel header'); const type = b.readUInt16LE(p + 13);
        need(type === 2 || type === 3, 'ASE compressed RGBA or tilemap cel');
        const cel: Cel = { frame, layer: b.readUInt16LE(p + 6), x: b.readInt16LE(p + 8), y: b.readInt16LE(p + 10), opacity: b[p + 12], type, z: b.readInt16LE(p + 15) };
        const width = b.readUInt16LE(p + 22), height = b.readUInt16LE(p + 24);
        if (type === 2) cel.image = { width, height, rgba: unzip(b.subarray(p + 26, stop), width * height * 4, 'ASE raster') };
        else {
          need(length >= 54, 'ASE tilemap header'); const bits = b.readUInt16LE(p + 26), masks = [28, 32, 36, 40].map(at => b.readUInt32LE(p + at));
          need(bits === 32 && masks.join(',') === '536870911,2147483648,1073741824,536870912', 'ASE tile masks');
          const data = unzip(b.subarray(p + 54, stop), width * height * 4, 'ASE tilemap'); const ids: number[] = [];
          for (let at = 0; at < data.length; at += 4) { const word = data.readUInt32LE(at); need((word & ~masks[0]) === 0, 'ASE transformed tile'); ids.push(word & masks[0]); }
          cel.grid = { width, height, bits, masks, ids };
        }
        s.cels.push(cel);
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
function composite(s: Native, frame = 0, selected?: number[]): Pixels {
  const target = { width: s.width, height: s.height, rgba: Buffer.alloc(s.width * s.height * 4) };
  for (const i of selected ?? s.layers.flatMap((layer, i) => layer.flags & 1 ? [i] : [])) {
    const layer = s.layers[i]; need(layer && layer.level === 0 && layer.blend === 0 && layer.opacity === 255, 'normal opaque layer');
    const matches = s.cels.filter(c => c.frame === frame && c.layer === i); need(matches.length === 1, 'one cel per layer/frame');
    const cel = matches[0]; need(cel.opacity === 255 && cel.z === 0, 'normal opaque cel');
    if (cel.image) { need(layer.type === 0, 'RGBA layer'); paint(target, cel.image, cel.x, cel.y); }
    else {
      const set = s.tilesets[layer.tileset ?? -1], grid = cel.grid;
      need(layer.type === 2 && set && grid && (set.flags & 4) !== 0, 'tilemap reference');
      for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
        const id = grid.ids[y * grid.width + x]; need(Number.isInteger(id) && id >= 0 && id < set.count, 'tile id bounds');
        if (id) paint(target, { width: set.width, height: set.height, rgba: set.rgba.subarray(id * set.width * set.height * 4, (id + 1) * set.width * set.height * 4) }, cel.x + x * set.width, cel.y + y * set.height);
      }
    }
  }
  return target;
}
function sourceContract(s: Native) {
  expect(s.flags).toBe(1); expect(s.depth).toBe(32); expect(s.paletteSizes).toEqual([20]); expect(s.palette).toEqual(PALETTE);
  for (const layer of s.layers) { expect(layer.level).toBe(0); expect(layer.blend).toBe(0); expect(layer.opacity).toBe(255); expect(layer.flags & 64).toBe(0); }
  for (const cel of s.cels) {
    expect(cel.layer).toBeLessThan(s.layers.length); expect(cel.opacity).toBe(255); expect(cel.z).toBe(0);
    if (cel.image) statistics(cel.image);
  }
  for (const set of s.tilesets) statistics({ width: set.width, height: set.height * set.count, rgba: set.rgba });
}

// Tiny in-memory protocol controls; never saved or represented as native/game evidence.
function pngChunk(name: string, payload: Buffer) {
  const result = Buffer.alloc(payload.length + 12); result.writeUInt32BE(payload.length, 0); result.write(name, 4, 'ascii');
  payload.copy(result, 8); result.writeUInt32BE(crc32(result.subarray(4, result.length - 4)), result.length - 4); return result;
}
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
function parserControls(ase: Buffer, png: Buffer, s: Native) {
  describe('independent decoder boundary and geometry controls', () => {
    it('round-trips all five PNG filters with unequal channels, alpha and row history', () => {
      const image = { width: 4, height: 3, rgba: Buffer.from(Array.from({ length: 48 }, (_, i) => (i * 47 + 13) & 255)) };
      for (let filter = 0; filter <= 4; filter++) expect(decodePng(pngFixture(image, filter))).toEqual(image);
    });
    it('rejects damaged CRC, truncated chunks and trailing PNG bytes', () => {
      const bad = Buffer.from(png); bad[bad.length - 1] ^= 1;
      expect(() => decodePng(bad)).toThrow('PNG CRC');
      expect(() => decodePng(png.subarray(0, -1))).toThrow('PNG chunk header');
      const extent = Buffer.from(png); extent.writeUInt32BE(png.length, 8);
      expect(() => decodePng(extent)).toThrow('PNG chunk extent');
      expect(() => decodePng(Buffer.concat([png, Buffer.from([0])]))).toThrow('PNG complete stream');
    });
    it('rejects corrupt ASE file/frame/chunk bounds, palette ranges and unsupported cels', () => {
      expect(() => decodeAse(ase.subarray(0, -1))).toThrow('ASE header');
      const mutate = (change: (b: Buffer) => void, message: string) => { const b = Buffer.from(ase); change(b); expect(() => decodeAse(b)).toThrow(message); };
      mutate(b => b.writeUInt16LE(0, 4), 'ASE header');
      mutate(b => { b.writeUInt16LE(65535, 8); b.writeUInt16LE(65535, 10); }, 'ASE canvas budget');
      mutate(b => b.writeUInt32LE(15, 128), 'ASE frame extent/magic');
      mutate(b => b.writeUInt32LE(5, 144), 'ASE chunk extent');
      const palette = s.chunks.find(c => c.kind === 0x2019)!;
      mutate(b => b.writeUInt32LE(20, palette.start + 14), 'ASE palette range');
      const cel = s.chunks.find(c => c.kind === 0x2005 && ase.readUInt16LE(c.start + 13) === 2)!;
      mutate(b => b.writeUInt16LE(1, cel.start + 13), 'ASE compressed RGBA or tilemap cel');
      mutate(b => b.writeUInt16LE(1, cel.start + 22), 'ASE raster');
    });
    it('keeps offset/transparent overpainting exact and rejects lossy geometry or alpha', () => {
      const target = { width: 3, height: 2, rgba: Buffer.alloc(24) };
      const ink = { width: 1, height: 1, rgba: Buffer.from('34354fff', 'hex') };
      paint(target, ink, 2, 1); expect(target.rgba.toString('hex')).toBe('00000000'.repeat(5) + '34354fff');
      paint(target, { ...ink, rgba: Buffer.alloc(4) }, 2, 1); expect(crop(target, 2, 1, 1, 1).rgba).toEqual(ink.rgba);
      expect(() => paint(target, ink, -1, 0)).toThrow('cel canvas bounds');
      expect(() => crop(target, 0, 0, 4, 1)).toThrow('crop bounds');
      expect(() => paint(target, { ...ink, rgba: Buffer.from('34354f80', 'hex') }, 0, 0)).toThrow('hard compositor alpha');
    });
    it('rejects off-palette colors and reserved hero orange independently of metadata', () => {
      expect(() => statistics({ width: 1, height: 1, rgba: Buffer.from('010203ff', 'hex') })).toThrow('family palette');
      expect(() => statistics({ width: 1, height: 1, rgba: Buffer.from('d97757ff', 'hex') })).toThrow('reserved hero orange');
    });
  });
}

interface PropAtlas {
  frames: { filename: string; frame: Rect; rotated: boolean; trimmed: boolean;
    spriteSourceSize: Rect; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; format: string; scale: string; size: { w: number; h: number };
    slices: { name: string; keys: SliceKey[] }[];
    frameTags: { name: string; from: number; to: number; direction: string }[];
    layers: { name: string; opacity: number; blendMode: string }[] };
}
const ROLES = ['compute-bank', 'cable-arch', 'air-duct', 'empty-chair', 'final-door-frame', 'standing-mirror'];
const LAYERS = ['structure', 'material', 'details'];
const ase = file('../../assets/source/omega-props.aseprite'), png = file('../../public/game/omega-props.png');
const json = file('../../public/game/omega-props.json'), atlas = JSON.parse(json.toString()) as PropAtlas;
const native = decodeAse(ase), packed = decodePng(png);
const sheets = ROLES.map((_, i) => crop(packed, i * 64, 0, 64, 128));
// Independently measured from frozen PNG using bundled Pillow12.3.0, not producer metadata.
const DIGESTS = [
  '7fa18dc86d89c427b1e258db518a7aaaddae60d49462819216a25ef2c09ce4bf',
  'b06f475c403b753ae6c14bcf0025edd8adabe044431ac63da015659e65fba420',
  '423c38aed5b8c915030e5854a8b2f43d6258f7ea9d5695ef069300fbebdcf8b0',
  '4d22cfd2644f07ef707dc257c75a255ff4e60f16e4b4151c8d6463717c54e316',
  '89ee2d7db5580717be543df0d40d466c9803b1492d4c4073de2bb3d8cbc7c53a',
  '59e3eca36cb16528f6721a9364a6cb331bfe57a4a390479faafd3a0ed492db86',
];
const INK = [3284, 1471, 2143, 2255, 960, 1249];
const COLORS = [6, 5, 6, 9, 5, 5];
const BOXES = [[6, 56, 57, 119], [6, 60, 57, 119], [6, 66, 57, 119], [8, 40, 55, 119], [8, 20, 55, 119], [4, 18, 59, 123]];
const CANVAS = { x: 0, y: 0, w: 64, h: 128 }, PIVOT = { x: 32, y: 120 };
const OPENING = { x: 12, y: 24, w: 40, h: 96 }, GLASS = { x: 8, y: 22, w: 48, h: 98 };
const QUIET = { x: 20, y: 74, w: 24, h: 46 };
const GLINTS = [{ x: 8, y: 26, w: 6, h: 31 }, { x: 50, y: 64, w: 6, h: 25 }];
// Declared silhouette envelopes, not observed raster bboxes. Mirror has a four-pixel outsideglass foot.
const ENVELOPES: Rect[] = [
  { x: 4, y: 56, w: 56, h: 64 }, { x: 6, y: 60, w: 52, h: 60 }, { x: 6, y: 64, w: 52, h: 56 },
  { x: 8, y: 40, w: 48, h: 80 }, { x: 8, y: 20, w: 48, h: 100 }, { x: 4, y: 18, w: 56, h: 106 },
];
function inside(x: number, y: number, r: Rect) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
function region(image: Pixels, r: Rect) { return crop(image, r.x, r.y, r.w, r.h); }
function blank(image: Pixels, r: Rect, message: string) { need(statistics(region(image, r)).ink === 0, message); }
function requireEnvelope(image: Pixels, r: Rect) {
  need(image.width === 64 && image.height === 128, 'native tall canvas');
  const box = statistics(image).bbox; need(box, 'nonempty prop');
  need(inside(box[0], box[1], r) && inside(box[2], box[3], r), 'authored prop envelope');
  need(box[3] === r.y + r.h - 1, 'native authored baseline');
  need(box[0] < 32 && box[2] > 32, 'silhouette spans anchor');
}
function doorContract(image: Pixels) {
  requireEnvelope(image, ENVELOPES[4]); blank(image, OPENING, 'transparent40x96 door opening');
  const frame = [
    { x: 8, y: 20, w: 48, h: 4 }, { x: 8, y: 24, w: 4, h: 96 }, { x: 52, y: 24, w: 4, h: 96 },
  ];
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    if (image.rgba[(y * 64 + x) * 4 + 3]) need(frame.some(r => inside(x, y, r)), 'only static door frame');
  }
  for (let y = 24; y < 120; y++) {
    need(statistics(crop(image, 8, y, 4, 1)).ink > 0, 'left door post');
    need(statistics(crop(image, 52, y, 4, 1)).ink > 0, 'right door post');
  }
  for (let x = 8; x < 56; x++) need(statistics(crop(image, x, 20, 1, 4)).ink > 0, 'door lintel');
}
function mirrorContract(image: Pixels) {
  requireEnvelope(image, ENVELOPES[5]); blank(image, QUIET, 'transparent actor projection quiet area');
  const frame = [
    { x: 4, y: 18, w: 56, h: 4 }, { x: 4, y: 22, w: 4, h: 98 },
    { x: 56, y: 22, w: 4, h: 98 }, { x: 4, y: 120, w: 56, h: 4 },
  ];
  let glints = 0;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    if (!image.rgba[(y * 64 + x) * 4 + 3]) continue;
    if (inside(x, y, GLASS)) { need(GLINTS.some(r => inside(x, y, r)), 'only declared glass edge glints'); glints++; }
    else need(frame.some(r => inside(x, y, r)), 'only static mirror rim');
  }
  need(glints <= 24, 'sparse glass glint budget');
  for (let y = 22; y < 120; y++) {
    need(statistics(crop(image, 4, y, 4, 1)).ink > 0, 'left mirror rim');
    need(statistics(crop(image, 56, y, 4, 1)).ink > 0, 'right mirror rim');
  }
  for (let x = 4; x < 60; x++) {
    need(statistics(crop(image, x, 18, 1, 4)).ink > 0, 'mirror top rim');
    need(statistics(crop(image, x, 120, 1, 4)).ink > 0, 'mirror bottom outside glass');
  }
  return glints;
}
function atlasContract(a: PropAtlas) {
  expect(a.frames).toHaveLength(6);
  expect(a.meta).toMatchObject({ image: 'omega-props.png', format: 'RGBA8888', scale: '1', size: { w: 384, h: 128 } });
  expect(a.meta.layers).toEqual(LAYERS.map(name => ({ name, opacity: 255, blendMode: 'normal' })));
  a.frames.forEach((f, i) => {
    expect(f).toEqual({ filename: 'omega-props ' + i + '.aseprite', frame: { x: i * 64, y: 0, w: 64, h: 128 },
      rotated: false, trimmed: false, spriteSourceSize: CANVAS, sourceSize: { w: 64, h: 128 }, duration: 100 });
  });
  expect(a.meta.frameTags.map(t => ({ name: t.name, from: t.from, to: t.to, direction: t.direction }))).toEqual(
    ROLES.map((name, i) => ({ name, from: i, to: i, direction: 'forward' })),
  );
}
function sliceContract(s: Native, a: PropAtlas) {
  const key: SliceKey = { frame: 0, bounds: CANVAS, center: CANVAS, pivot: PIVOT };
  expect(s.slices).toEqual([{ name: 'prop-origin', flags: 3, keys: [key] }]);
  expect(a.meta.slices.map(slice => ({ name: slice.name, keys: slice.keys }))).toEqual([{ name: 'prop-origin', keys: [key] }]);
  for (let frame = 0; frame < 6; frame++) {
    const active = s.slices[0].keys.filter(item => item.frame <= frame).at(-1)!;
    expect(active.pivot).toEqual(PIVOT); expect(active.bounds).toEqual(CANVAS);
  }
}
function altered(image: Pixels, x: number, y: number) {
  const result = { ...image, rgba: Buffer.from(image.rgba) };
  Buffer.from('cbb696ff', 'hex').copy(result.rgba, (y * image.width + x) * 4); return result;
}

describe('Omega64x128 static props source-only contract; no runtime admission', () => {
  it('pins the frozen source/export bytes and independently Pillow-decoded complete RGBA', () => {
    expect(hash(ase)).toBe('81ee2b1cb70fed72af1c04dd42f47545140a06aa02b26fd664b49d091fa32d2d');
    expect(hash(png)).toBe('bf900b539504a7404fb2885b4577e91ca214391bfe4161ac6344ec4960a7f7b4');
    expect(hash(json)).toBe('e6de214a11320109f241d7325c08fef7dddcbafe9199f4f9429f50a110c04aa6');
    expect(hash(packed.rgba)).toBe('35d52491f2d79977547e8e9c13645dc4d1f53dbf26b6c2490b86bbf1f172253f');
  });
  it('reads six100ms frames and18 nonempty editable normal RGBA cels', () => {
    expect([native.width, native.height, native.frames, native.depth]).toEqual([64, 128, 6, 32]);
    expect(native.durations).toEqual([100, 100, 100, 100, 100, 100]); expect(native.tilesets).toEqual([]);
    expect(native.layers.map(l => [l.name, l.flags, l.type])).toEqual(LAYERS.map(name => [name, 3, 0]));
    expect(native.cels).toHaveLength(18); sourceContract(native);
    for (let frame = 0; frame < 6; frame++) {
      const cels = native.cels.filter(c => c.frame === frame); expect(cels.map(c => [c.layer, c.type])).toEqual([[0, 2], [1, 2], [2, 2]]);
      for (const cel of cels) {
        expect(statistics(cel.image!).ink).toBeGreaterThan(0);
        expect(() => composite(native, frame, [cel.layer])).not.toThrow(); // Native trimmed cel offsets are independently composed.
      }
    }
  });
  it('keeps all six384x128 atlas slots native64x128, untrimmed and unrotated', () => {
    expect([packed.width, packed.height]).toEqual([384, 128]); atlasContract(atlas); statistics(packed);
  });
  it('reads six single-frame static role tags from ASE instead of trusting exported labels', () => {
    expect(native.tags).toEqual(ROLES.map((name, i) => ({ name, from: i, to: i, direction: 0, repeats: 0 })));
    atlasContract(atlas);
  });
  it('requires real ASE and JSON prop-origin slice keys with shared32,120 pivot for everyframe', () => {
    sliceContract(native, atlas);
    const project = (r: Rect, worldX: number) => ({ x: worldX - PIVOT.x + r.x, y: 320 - PIVOT.y + r.y, w: r.w, h: r.h });
    expect(project(OPENING, 2500)).toEqual({ x: 2480, y: 224, w: 40, h: 96 });
    expect(project(GLASS, 3025)).toEqual({ x: 3001, y: 222, w: 48, h: 98 });
    // A fullcanvas9-slice center in the saved metadata is not permission to stretch the source.
  });
  it.each(ROLES.map((role, i) => ({ role, i })))('$role reconstructs every exported RGBA pixel from its three source layers', ({ i }) => {
    const image = composite(native, i); expect(image.rgba).toEqual(sheets[i].rgba);
    requireEnvelope(image, ENVELOPES[i]); const stats = statistics(image);
    expect(hash(image.rgba)).toBe(DIGESTS[i]); expect(stats.ink).toBe(INK[i]);
    expect(stats.colors).toHaveLength(COLORS[i]); expect(stats.bbox).toEqual(BOXES[i]);
    for (const layer of [0, 1, 2]) statistics(composite(native, i, [layer]));
  });
  it('keeps six nonempty outputs distinct rather than aliasing spritesheet cells', () => {
    expect(new Set(sheets.map(image => hash(image.rgba))).size).toBe(6);
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) expect(composite(native, a).rgba.equals(composite(native, b).rgba)).toBe(false);
  });
  it('leaves the full40x96 door opening alpha0 on everylayer without leaf, handle or threshold', () => {
    doorContract(sheets[4]);
    for (const layer of [0, 1, 2]) blank(composite(native, 4, [layer]), OPENING, 'source-layer door opening');
    expect(statistics(region(sheets[4], OPENING)).ink).toBe(0);
    blank(sheets[4], { x: 0, y: 120, w: 64, h: 8 }, 'no door threshold below opening');
  });
  it('reserves the whole actor projection and allows at most24glass pixels only in two edge bands', () => {
    const glints = mirrorContract(sheets[5]); expect(statistics(region(sheets[5], GLASS)).ink).toBe(glints);
    for (const layer of [0, 1, 2]) blank(composite(native, 5, [layer]), QUIET, 'source-layer mirror quiet area');
    expect(statistics(region(sheets[5], QUIET)).ink).toBe(0);
    expect(statistics(crop(sheets[5], 4, 120, 56, 4)).ink).toBeGreaterThan(0); // Outsideglass base, not hidden projection ink.
  });
  it('detects palettelegal door paint, central projection, extra glints and budget excess with valid positives', () => {
    expect(() => doorContract(sheets[4])).not.toThrow(); expect(() => mirrorContract(sheets[5])).not.toThrow();
    expect(() => doorContract(altered(sheets[4], 12, 24))).toThrow('transparent40x96 door opening');
    expect(() => mirrorContract(altered(sheets[5], 20, 74))).toThrow('transparent actor projection quiet area');
    expect(() => mirrorContract(altered(sheets[5], 30, 30))).toThrow('only declared glass edge glints');
    let crowded = { ...sheets[5], rgba: Buffer.from(sheets[5].rgba) };
    for (let y = 26; y < 31; y++) for (let x = 8; x < 14; x++) crowded = altered(crowded, x, y);
    expect(() => mirrorContract(crowded)).toThrow('sparse glass glint budget');
  });
  it('rejects wrongframes, trimming, rotation, shiftedcuts and absent or displaced real slice metadata', () => {
    expect(() => atlasContract(atlas)).not.toThrow(); expect(() => sliceContract(native, atlas)).not.toThrow();
    const bad = () => structuredClone(atlas);
    const small = bad(); small.frames[5].sourceSize.h = 64; expect(() => atlasContract(small)).toThrow();
    const trimmed = bad(); trimmed.frames[4].trimmed = true; expect(() => atlasContract(trimmed)).toThrow();
    const rotated = bad(); rotated.frames[4].rotated = true; expect(() => atlasContract(rotated)).toThrow();
    const shifted = bad(); shifted.frames[5].frame.x--; expect(() => atlasContract(shifted)).toThrow();
    const missing = bad(); missing.meta.slices = []; expect(() => sliceContract(native, missing)).toThrow();
    const moved = bad(); moved.meta.slices[0].keys[0].pivot!.y = 64; expect(() => sliceContract(native, moved)).toThrow();
    expect(() => sliceContract({ ...native, slices: [] }, atlas)).toThrow();
  });
  it('rejects invalid slice chunks, nonnormal blending, faded layers and duplicate cel ownership', () => {
    const chunk = native.chunks.find(c => c.kind === 0x2022)!; need(chunk, 'required slice chunk');
    const invalid = Buffer.from(ase); invalid.writeUInt32LE(4, chunk.start + 10);
    expect(() => decodeAse(invalid)).toThrow('ASE slice flags/count');
    const name = aseString(ase, chunk.start + 18, chunk.start + chunk.length);
    const order = Buffer.from(ase); order.writeUInt32LE(6, name.next); expect(() => decodeAse(order)).toThrow('ASE slice key order');
    const withLayer = (patch: Partial<Layer>) => ({ ...native, layers: native.layers.map((l, i) => i ? l : { ...l, ...patch }) });
    expect(() => composite(withLayer({ blend: 1 }))).toThrow('normal opaque layer');
    expect(() => composite(withLayer({ opacity: 128 }))).toThrow('normal opaque layer');
    expect(() => composite({ ...native, cels: [...native.cels, native.cels[0]] })).toThrow('one cel per layer/frame');
  });
});
parserControls(ase, png, native);
