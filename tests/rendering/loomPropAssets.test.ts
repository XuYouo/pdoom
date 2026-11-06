import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// Independent frozen-source evidence only: no producer summary, production selector,
// Phaser, browser, generator, animation or runtime-admission claim.
interface Pixels { width: number; height: number; rgba: Buffer }
interface Layer { name: string; flags: number; type: number; level: number; blend: number; opacity: number; tileset?: number }
interface Grid { width: number; height: number; bits: number; masks: number[]; ids: number[] }
interface Cel { frame: number; layer: number; x: number; y: number; opacity: number; type: number; z: number; image?: Pixels; grid?: Grid }
interface Tileset { id: number; flags: number; count: number; width: number; height: number; base: number; name: string; rgba: Buffer }
interface Chunk { frame: number; kind: number; start: number; length: number }
interface Native {
  width: number; height: number; frames: number; depth: number; flags: number; durations: number[];
  layers: Layer[]; cels: Cel[]; tilesets: Tileset[]; palette: string[]; paletteSizes: number[]; chunks: Chunk[];
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
    durations: [], layers: [], cels: [], tilesets: [], palette: [], paletteSizes: [], chunks: [], tags: [],
  };
  need(s.depth === 32 && s.width > 0 && s.height > 0 && s.frames > 0, 'ASE RGB32 geometry');
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
      mutate(b => b.writeUInt32LE(15, 128), 'ASE frame extent/magic');
      mutate(b => b.writeUInt32LE(5, 144), 'ASE chunk extent');
      const palette = s.chunks.find(c => c.kind === 0x2019)!;
      mutate(b => b.writeUInt32LE(20, palette.start + 14), 'ASE palette range');
      const cel = s.chunks.find(c => c.kind === 0x2005)!;
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
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; rotated: boolean; trimmed: boolean;
    spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; format: string; scale: string; size: { w: number; h: number }; slices: unknown[];
    frameTags: { name: string; from: number; to: number; direction: string }[];
    layers: { name: string; opacity: number; blendMode: string }[] };
}
const ase = file('../../assets/source/loom-props.aseprite'), png = file('../../public/game/loom-props.png');
const json = file('../../public/game/loom-props.json'), atlas = JSON.parse(json.toString()) as PropAtlas;
const native = decodeAse(ase), packed = decodePng(png);
const ROLES = ['fork-spindle', 'split-reel', 'shuttle-bank', 'branch-coupler', 'broken-loom', 'distant-fork-tree'];
const sheets = ROLES.map((_, i) => crop(packed, i * 64, 0, 64, 64));
// Independently measured from PNG with bundled Pillow, not producer metadata.
const DIGESTS = [
  '01bc4c85bf8da90dae275a8ebfca93c9be6520811930a5fce5336f9c5917ceff',
  'e28bf24288cf82e238bdda4e58aa71a66ecfc6d22fd51ef539ce7e17b16cbb7d',
  'e4538adda97a2a773f9d85a7454ebf40c125b561c3e6b176ff0bcf63fcb761b4',
  'cd3a10ec99f2fb74520ed589145fd8e0e103c5c75f6ebabb9a05a148fd7ebbd0',
  '28762f8e789bce011e1bfbf92e7735ef834c46302a5373e94df178448e57d861',
  '73ac065e3b7e786b2603b3864f24171e9774ef60e09dbc3e82b4b6c1a8fe818f',
];
const INK = [1789, 1413, 1713, 1181, 1315, 867], COLORS = [8, 8, 7, 6, 8, 2];
const BOXES = [[6, 6, 58, 59], [7, 15, 57, 60], [5, 7, 59, 60], [6, 7, 58, 59], [6, 6, 58, 59], [6, 6, 58, 60]];

describe('Loom static props frozen native source/export contract, not runtime acceptance', () => {
  it('pins the three frozen source/export files without trusting metadata summaries', () => {
    expect(hash(ase)).toBe('2e6e22c4941b5c2279066927128a58c6bd9a6ef32dfb4db19aaaa36a9783f229');
    expect(hash(png)).toBe('f159173241559365fcfeff0ccb9b8a26c97d466cc9b4c3f09e5ad8b067cd7340');
    expect(hash(json)).toBe('76eb8af3ea05d0cf52014197b367bc53c382b9236e7bcd3c760fc409a9ffa3dc');
  });
  it('decodes18 editable RGBA cels on three visible normal layers at full opacity', () => {
    expect([native.width, native.height, native.frames, native.depth]).toEqual([64, 64, 6, 32]);
    expect(native.durations).toEqual([100, 100, 100, 100, 100, 100]); expect(native.tilesets).toEqual([]);
    expect(native.layers.map(l => [l.name, l.flags, l.type])).toEqual([['structure', 3, 0], ['thread', 3, 0], ['details', 3, 0]]);
    expect(native.cels).toHaveLength(18); sourceContract(native);
    for (let frame = 0; frame < 6; frame++) {
      expect(native.cels.filter(c => c.frame === frame).map(c => [c.layer, c.type, c.x, c.y, c.image!.width, c.image!.height])).toEqual([
        [0, 2, 0, 0, 64, 64], [1, 2, 0, 0, 64, 64], [2, 2, 0, 0, 64, 64],
      ]);
    }
  });
  it('keeps full64px unrotated/untrimmed slots and an implicit32,32 pivot', () => {
    expect([packed.width, packed.height]).toEqual([384, 64]); expect(atlas.frames).toHaveLength(6);
    expect(atlas.meta).toMatchObject({ image: 'loom-props.png', format: 'RGBA8888', scale: '1', size: { w: 384, h: 64 }, slices: [] });
    expect(atlas.meta.layers).toEqual(['structure', 'thread', 'details'].map(name => ({ name, opacity: 255, blendMode: 'normal' })));
    atlas.frames.forEach((f, i) => {
      expect(f).toEqual({ filename: 'loom-props ' + i + '.aseprite', frame: { x: i * 64, y: 0, w: 64, h: 64 }, rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 }, sourceSize: { w: 64, h: 64 }, duration: 100 });
      expect([f.sourceSize.w / 2, f.sourceSize.h / 2]).toEqual([32, 32]);
    });
  });
  it('reads six single-frame static tags directly from ASE and independently from JSON', () => {
    expect(native.tags).toEqual(ROLES.map((name, i) => ({ name, from: i, to: i, direction: 0, repeats: 0 })));
    expect(atlas.meta.frameTags.map(t => ({ name: t.name, from: t.from, to: t.to, direction: t.direction }))).toEqual(
      ROLES.map((name, i) => ({ name, from: i, to: i, direction: 'forward' })),
    );
  });
  it.each(ROLES.map((role, i) => ({ role, i })))('$role reconstructs the exported RGBA from its three native cels', ({ i }) => {
    const rendered = composite(native, i), exported = sheets[i], stats = statistics(rendered);
    expect(rendered.rgba).toEqual(exported.rgba); expect(hash(rendered.rgba)).toBe(DIGESTS[i]);
    expect(stats.ink).toBe(INK[i]); expect(stats.colors).toHaveLength(COLORS[i]); expect(stats.bbox).toEqual(BOXES[i]);
    expect(stats.bbox![0]).toBeGreaterThan(0); expect(stats.bbox![1]).toBeGreaterThan(0);
    expect(stats.bbox![2]).toBeLessThan(63); expect(stats.bbox![3]).toBeLessThan(63);
    // Pivot is canvas geometry, not a claim that the centre pixel must contain ink.
    expect(stats.bbox![0]).toBeLessThan(32); expect(stats.bbox![2]).toBeGreaterThan(32);
    expect(stats.bbox![1]).toBeLessThan(32); expect(stats.bbox![3]).toBeGreaterThan(32);
  });
  it('keeps all six nonempty outputs distinct, not aliased atlas frames', () => {
    expect(new Set(sheets.map(image => hash(image.rgba))).size).toBe(6);
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) expect(composite(native, a).rgba.equals(composite(native, b).rgba)).toBe(false);
  });
  it('uses exactly two hard opaque family colors for the distant fork, not alpha dimming', () => {
    expect(statistics(sheets[5]).colors).toEqual(['2c2330ff', '34354fff']); expect(statistics(sheets[5]).ink).toBe(867);
  });
  it('rejects nonnormal blending, faded layers and duplicate native cel ownership', () => {
    const withLayer = (patch: Partial<Layer>) => ({ ...native, layers: native.layers.map((l, i) => i ? l : { ...l, ...patch }) });
    expect(() => composite(withLayer({ blend: 1 }))).toThrow('normal opaque layer');
    expect(() => composite(withLayer({ opacity: 128 }))).toThrow('normal opaque layer');
    expect(() => composite({ ...native, cels: [...native.cels, native.cels[0]] })).toThrow('one cel per layer/frame');
  });
});
parserControls(ase, png, native);
