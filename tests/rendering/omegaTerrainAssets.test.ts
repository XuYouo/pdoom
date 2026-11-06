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

interface TerrainAtlas {
  name: string; image: string; imageWidth: number; imageHeight: number; columns: number; rows: number;
  tileWidth: number; tileHeight: number; tileCount: number; map: { width: number; height: number; tiles: number[] };
}
const ROLES = [
  'corridor-top-left', 'corridor-top-mid-a', 'corridor-top-mid-b', 'corridor-top-right',
  'corridor-body-left', 'corridor-body-a', 'corridor-body-b', 'corridor-body-right',
  'corridor-foot-left', 'corridor-foot-a', 'corridor-foot-b', 'corridor-foot-right',
  'chamber-top-left', 'chamber-top-mid-a', 'chamber-top-mid-b', 'chamber-top-right',
  'chamber-body-left', 'chamber-body-a', 'chamber-body-b', 'chamber-body-right',
  'chamber-foot-left', 'chamber-foot-a', 'chamber-foot-b', 'chamber-foot-right',
  'observer-left', 'observer-mid-a', 'observer-mid-b', 'observer-right',
  'quiet-wall', 'rear-channel', 'rack-base', 'floor-recess',
];
const ase = file('../../assets/source/omega-tiles.aseprite'), png = file('../../public/game/omega-terrain.png');
const json = file('../../public/game/omega-terrain.json'), atlas = JSON.parse(json.toString()) as TerrainAtlas;
const native = decodeAse(ase), packed = decodePng(png);
function rawLayer(s: Native, layer: number): Pixels {
  const cells = s.cels.filter(c => c.frame === 0 && c.layer === layer);
  need(cells.length === 1 && cells[0].image, 'one source raster cel');
  const { image, x, y } = cells[0]; need(image, 'source raster');
  const target = { width: s.width, height: s.height, rgba: Buffer.alloc(s.width * s.height * 4) };
  paint(target, image, x, y); // Check alpha and bounds, then preserve even hidden RGB bytes.
  for (let row = 0; row < image.height; row++) image.rgba.copy(target.rgba,
    ((row + y) * target.width + x) * 4, row * image.width * 4, (row + 1) * image.width * 4);
  return target;
}
function layerIndex(name: string) {
  const indices = native.layers.flatMap((layer, i) => layer.name === name ? [i] : []);
  need(indices.length === 1, 'unique named source layer ' + name); return indices[0];
}
const LAYERS = { source: layerIndex('terrain'), repeats: layerIndex('repeat-tests'), tiled: layerIndex('omega-terrain') };
function sourceCel(layer: number) {
  const cels = native.cels.filter(c => c.frame === 0 && c.layer === layer);
  need(cels.length === 1, 'one named layer cel'); return cels[0];
}
const original = rawLayer(native, LAYERS.source), tiled = composite(native), tileCel = sourceCel(LAYERS.tiled);
const mother = (i: number) => crop(original, i % 8 * 16, Math.floor(i / 8) * 16, 16, 16);
const slot = (i: number) => crop(packed, i % 6 * 16, Math.floor(i / 6) * 16, 16, 16);
// Derive all128 map cells only from editable source pixels and the brief's32 mother coordinates.
// No producer JSON map, tile ids or production plan supplies this expected value.
const expectedMap = Array.from({ length: 128 }, (_, cell) => {
  const bytes = crop(original, cell % 16 * 16, Math.floor(cell / 16) * 16, 16, 16).rgba;
  if (bytes.equals(Buffer.alloc(1024))) return 0;
  const i = ROLES.findIndex((_, index) => mother(index).rgba.equals(bytes));
  need(i >= 0, 'unregistered source cell ' + cell); return i + 1;
});
function atlasContract(a: TerrainAtlas) {
  expect(a).toMatchObject({ name: 'omega-terrain', image: 'omega-terrain.png', imageWidth: 96, imageHeight: 96,
    columns: 6, rows: 6, tileWidth: 16, tileHeight: 16, tileCount: 32 });
  expect(a.map).toEqual({ width: 16, height: 8, tiles: expectedMap });
}
function alphaBand(image: Pixels, first: number, last: number, full = false) {
  for (let y = 0; y < image.height; y++) {
    const ink = statistics(crop(image, 0, y, image.width, 1)).ink;
    if (y < first || y > last) need(ink === 0, 'alpha outside band');
    else { need(ink > 0, 'missing authored row'); if (full) need(ink === image.width, 'incomplete body row'); }
  }
}
function variantPair(a: Pixels, b: Pixels) {
  need(!a.rgba.equals(b.rgba), 'distinct variants');
  for (const [x, y, w, h] of [[0, 0, 2, 16], [14, 0, 2, 16], [0, 0, 16, 2], [0, 14, 16, 2]]) {
    need(crop(a, x, y, w, h).rgba.equals(crop(b, x, y, w, h).rgba), 'corresponding borders');
  }
}
function bodyRepeat(a: Pixels, b: Pixels) {
  for (const source of [a, b]) {
    const base = source.rgba.subarray(0, 4);
    for (const [x, y, w, h] of [[0, 0, 2, 16], [14, 0, 2, 16], [0, 0, 16, 2], [0, 14, 16, 2]]) {
      const bytes = crop(source, x, y, w, h).rgba;
      for (let at = 0; at < bytes.length; at += 4) need(bytes.subarray(at, at + 4).equals(base), 'body uniform base border');
    }
  }
  const image = { width: 48, height: 48, rgba: Buffer.alloc(48 * 48 * 4) };
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) paint(image, (x + y) % 2 ? b : a, x * 16, y * 16);
  for (const edge of [16, 32]) {
    need(crop(image, edge - 2, 0, 2, 48).rgba.equals(crop(image, edge, 0, 2, 48).rgba), 'body horizontal seam');
    need(crop(image, 0, edge - 2, 48, 2).rgba.equals(crop(image, 0, edge, 48, 2).rgba), 'body vertical seam');
  }
  return image;
}
function floorAssembly(top: Pixels, body: Pixels, foot: Pixels) {
  need(crop(top, 0, 14, 16, 2).rgba.equals(crop(body, 0, 0, 16, 2).rgba), 'top/body native seam');
  need(crop(body, 0, 14, 16, 2).rgba.equals(crop(foot, 0, 0, 16, 2).rgba), 'body/foot native seam');
  const image = { width: 16, height: 40, rgba: Buffer.alloc(16 * 40 * 4) };
  paint(image, top, 0, 0); paint(image, body, 0, 16); paint(image, crop(foot, 0, 0, 16, 8), 0, 32);
  return image;
}
function stretched(image: Pixels, width: number, height: number) {
  const target = { width, height, rgba: Buffer.alloc(width * height * 4) };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.floor(x * image.width / width), sy = Math.floor(y * image.height / height);
    crop(image, sx, sy, 1, 1).rgba.copy(target.rgba, (y * width + x) * 4);
  }
  return target;
}
function changedPixel(image: Pixels, x: number, y: number) {
  const next = { ...image, rgba: Buffer.from(image.rgba) }, at = (y * image.width + x) * 4;
  const color = image.rgba.toString('hex', at, at + 4) === '34354fff' ? '24423bff' : '34354fff';
  Buffer.from(color, 'hex').copy(next.rgba, at); return next;
}

describe('Omega terrain source-only contract; no runtime admission', () => {
  it('pins the frozen source/export bytes and independently Pillow-decoded complete RGBA', () => {
    expect(hash(ase)).toBe('ace8f39816c4bcae96218c43be5864e2ae6e47a1058e62c0d2d5dd1caab02c95');
    expect(hash(png)).toBe('80314bb9f3e3d5a75ed11cfdb2effde5b80f877ee6f7dc33335367c77ae0e605');
    expect(hash(json)).toBe('95b6c2ac8ba248a2daf3eb884bdad04adc6b0e8a9af5e75fe6a8f250043789c7');
    expect(hash(packed.rgba)).toBe('13e068fc7a55d844a7c3f6c16353a3daca17c766f346eddb77b05c586b856e44');
  });
  it('retains hidden editable terrain and repeat layers plus one visible native tilemap', () => {
    expect([native.width, native.height, native.frames, native.depth]).toEqual([256, 128, 1, 32]);
    expect(native.durations).toEqual([100]); expect(native.tags).toEqual([]); expect(native.slices).toEqual([]);
    // Hidden verification layers have no prescribed stack position. Bind exact names/types, not R22 ordinals.
    const roles = native.layers.map(l => [l.name, l.flags, l.type, l.tileset]);
    expect(roles.sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
      ['omega-terrain', 3, 2, 0], ['repeat-tests', 2, 0, undefined], ['terrain', 2, 0, undefined],
    ]);
    expect(native.cels).toHaveLength(3);
    for (const [layer, type] of [[LAYERS.source, 2], [LAYERS.repeats, 2], [LAYERS.tiled, 3]]) {
      expect(native.cels.filter(c => c.layer === layer).map(c => [c.frame, c.type, c.opacity, c.z])).toEqual([[0, type, 255, 0]]);
    }
    sourceContract(native); expect(composite(native, 0, [LAYERS.source]).rgba).toEqual(original.rgba);
    const repeats = composite(native, 0, [LAYERS.repeats]);
    expect(statistics(repeats).ink).toBeGreaterThan(0); expect(repeats.rgba.equals(original.rgba)).toBe(false);
    for (const layer of [LAYERS.source, LAYERS.repeats]) expect(statistics(sourceCel(layer).image!).ink).toBeGreaterThan(0);
  });
  it('decodes32 unique embedded tiles plus emptyzero and every unsigned map cell without flips', () => {
    expect(native.tilesets).toHaveLength(1); const set = native.tilesets[0];
    expect(set).toMatchObject({ flags: 6, count: 33, width: 16, height: 16, base: 1 });
    expect(set.rgba.length).toBe(33 * 1024); expect(set.rgba.subarray(0, 1024)).toEqual(Buffer.alloc(1024));
    expect(tileCel).toMatchObject({ x: 0, y: 0 });
    expect(tileCel.grid).toEqual({ width: 16, height: 8, bits: 32,
      masks: [0x1fffffff, 0x80000000, 0x40000000, 0x20000000], ids: expectedMap });
    for (let i = 0; i < 32; i++) expect(expectedMap[Math.floor(i / 8) * 16 + i % 8]).toBe(i + 1);
    expect(new Set(ROLES.map((_, i) => hash(mother(i).rgba))).size).toBe(32);
  });
  it('uses the96x96 six-column PNG with four truly transparent trailing slots', () => {
    expect([packed.width, packed.height]).toEqual([96, 96]); atlasContract(atlas); statistics(packed);
    for (let i = 32; i < 36; i++) expect(slot(i).rgba).toEqual(Buffer.alloc(1024));
  });
  it('reconstructs all128 source cells from independently decoded embedded and exported RGBA', () => {
    const exported = { width: 256, height: 128, rgba: Buffer.alloc(256 * 128 * 4) };
    for (let cell = 0; cell < 128; cell++) {
      const x = cell % 16, y = Math.floor(cell / 16), id = atlas.map.tiles[cell];
      const bytes = id ? slot(id - 1).rgba : Buffer.alloc(1024);
      expect(bytes, 'editable source cell ' + cell).toEqual(crop(original, x * 16, y * 16, 16, 16).rgba);
      expect(crop(tiled, x * 16, y * 16, 16, 16).rgba).toEqual(bytes);
      if (id) paint(exported, slot(id - 1), x * 16, y * 16);
    }
    expect(exported.rgba).toEqual(original.rgba); expect(tiled.rgba).toEqual(original.rgba);
  });
  it.each(ROLES.map((role, i) => ({ role, i })))('$role matches its ordinary mother, embeddedN+1 and PNGslotN with correct alpha', ({ i }) => {
    const image = mother(i), embedded = native.tilesets[0].rgba.subarray((i + 1) * 1024, (i + 2) * 1024);
    expect(image.rgba).toEqual(embedded); expect(image.rgba).toEqual(slot(i).rgba);
    expect(statistics(image).ink).toBeGreaterThan(0);
    if (i < 24) {
      const band = Math.floor(i % 12 / 4);
      if (band === 0) alphaBand(image, 3, 15);
      if (band === 1) alphaBand(image, 0, 15, true);
      if (band === 2) alphaBand(image, 0, 7);
    } else if (i < 28) alphaBand(image, 3, 11);
  });
  it.each([[1, 2], [5, 6], [9, 10], [13, 14], [17, 18], [21, 22], [25, 26]])('midA/B%s/%s differs inside and preserves corresponding outer2', (a, b) => {
    variantPair(mother(a), mother(b)); // This does not equate unlike caps or opposing lit edges.
  });
  it.each([['corridor', 5, 6], ['chamber', 17, 18]] as const)('%s body really wraps in3x3 with matching two-pixel seam strips', (_, a, b) => {
    const image = bodyRepeat(mother(a), mother(b)); expect(statistics(image).ink).toBe(48 * 48);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      expect(crop(image, x * 16, y * 16, 16, 16).rgba).toEqual(mother((x + y) % 2 ? b : a).rgba);
    }
  });
  it.each([['corridor', 0], ['chamber', 12]] as const)('%s40px floor is16+16+8 native pixels with no raised support or stretch', (_, base) => {
    for (const t of [1, 2]) for (const b of [5, 6]) for (const f of [9, 10]) {
      const image = floorAssembly(mother(base + t), mother(base + b), mother(base + f));
      alphaBand(image, 3, 39); expect(crop(image, 0, 32, 16, 8).rgba).toEqual(crop(mother(base + f), 0, 0, 16, 8).rgba);
      expect(image.rgba.equals(stretched(mother(base + t), 16, 40).rgba)).toBe(false);
    }
  });
  it('retains a130x12 observer strip and its two-pixel native tail without snapping or resampling', () => {
    const image = mother(25), twelve = crop(image, 0, 0, 16, 12);
    const strip = { width: 130, height: 12, rgba: Buffer.alloc(130 * 12 * 4) };
    for (let x = 0; x < 130; x += 16) paint(strip, crop(twelve, 0, 0, Math.min(16, 130 - x), 12), x, 0);
    alphaBand(strip, 3, 11); expect(crop(strip, 128, 0, 2, 12).rgba).toEqual(crop(image, 0, 0, 2, 12).rgba);
    expect(twelve.rgba.equals(stretched(image, 16, 12).rgba)).toBe(false);
    expect(statistics(crop(twelve, 0, 9, 16, 3)).ink).toBeGreaterThan(0);
    expect(statistics(crop(stretched(image, 16, 12), 0, 9, 16, 3)).ink).toBe(0);
  });
  it('rejects real-pixel alpha, pair-border, repeat-seam and top/body mutations while positives still pass', () => {
    expect(() => alphaBand(mother(9), 0, 7)).not.toThrow();
    expect(() => alphaBand(changedPixel(mother(9), 0, 8), 0, 7)).toThrow('alpha outside band');
    expect(() => variantPair(mother(5), mother(6))).not.toThrow();
    expect(() => variantPair(mother(5), mother(5))).toThrow('distinct variants');
    expect(() => variantPair(mother(5), changedPixel(mother(6), 0, 5))).toThrow('corresponding borders');
    expect(() => bodyRepeat(changedPixel(mother(5), 15, 5), mother(6))).toThrow('body uniform base border');
    const other = { ...mother(6), rgba: Buffer.from(mother(6).rgba) };
    const border = Buffer.from(mother(5).rgba.toString('hex', 0, 4) === '34354fff' ? '24423bff' : '34354fff', 'hex');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (x < 2 || x >= 14 || y < 2 || y >= 14) border.copy(other.rgba, (y * 16 + x) * 4);
    }
    expect(() => bodyRepeat(mother(5), other)).toThrow('body horizontal seam');
    expect(() => floorAssembly(changedPixel(mother(1), 7, 15), mother(5), mother(9))).toThrow('top/body native seam');
  });
  it('rejects metadata relabeling, missing cells and shifted or out-of-range ids against actualsource', () => {
    expect(() => atlasContract(atlas)).not.toThrow();
    const bad = () => structuredClone(atlas);
    const name = bad(); name.name = 'loom-terrain'; expect(() => atlasContract(name)).toThrow();
    const short = bad(); short.map.tiles.pop(); expect(() => atlasContract(short)).toThrow();
    const shifted = bad(); shifted.map.tiles[0] = 2; expect(() => atlasContract(shifted)).toThrow();
    const overflow = bad(); overflow.map.tiles[0] = 33; expect(() => atlasContract(overflow)).toThrow();
  });
  it('refuses transformed tile words and out-of-range embedded ids, never silently remapping', () => {
    const chunk = native.chunks.find(c => c.kind === 0x2005 && ase.readUInt16LE(c.start + 13) === 3)!;
    const mutate = (word: number) => {
      const header = Buffer.from(ase.subarray(chunk.start, chunk.start + 54));
      const words = inflateSync(ase.subarray(chunk.start + 54, chunk.start + chunk.length));
      words.writeUInt32LE(word, 0); const replacement = Buffer.concat([header, deflateSync(words)]); replacement.writeUInt32LE(replacement.length, 0);
      const b = Buffer.concat([ase.subarray(0, chunk.start), replacement, ase.subarray(chunk.start + chunk.length)]);
      b.writeUInt32LE(b.length, 0); b.writeUInt32LE(b.length - 128, 128); return b;
    };
    expect(() => decodeAse(mutate(0x80000001))).toThrow('ASE transformed tile');
    expect(() => composite(decodeAse(mutate(33)))).toThrow('tile id bounds');
  });
});
parserControls(ase, png, native);
