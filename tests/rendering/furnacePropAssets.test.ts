import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// Frozen source/export integrity only. No production selector, Phaser or runtime claim.
// The ASE structure was inspected before these expectations were written; cels are
// decoded independently of the PNG, with native positions, links and alpha retained.
interface Pixels { width: number; height: number; rgba: Buffer }
interface Atlas {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; trimmed: boolean; rotated: boolean;
    spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; format: string; scale: string; size: { w: number; h: number };
    frameTags: { name: string; from: number; to: number; direction: string; color: string }[];
    layers: { name: string; opacity: number; blendMode: string }[]; slices: unknown[] };
}
interface Layer { name: string; flags: number; type: number; level: number; blend: number; opacity: number }
interface Cel { frame: number; layer: number; x: number; y: number; opacity: number; z: number; type: number; image?: Pixels; linked?: number }
interface NativeSource {
  width: number; height: number; frames: number; depth: number; flags: number; speed: number; durations: number[];
  headers: { legacy: number; modern: number; chunks: number; types: number[] }[];
  layers: Layer[]; cels: Cel[]; paletteSizes: number[]; palette: string[];
  tags: { name: string; from: number; to: number; direction: number; repeats: number; color: string }[];
}
function need(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const file = (path: string) => readFileSync(new URL(path, import.meta.url));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
function decodePng(bytes: Buffer): Pixels & { filters: number[]; chunks: string[] } {
  need(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG signature');
  let offset = 8, width = 0, height = 0, ended = false;
  const parts: Buffer[] = [], chunks: string[] = [];
  while (offset < bytes.length) {
    need(offset + 12 <= bytes.length, 'PNG chunk header');
    const length = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8), stop = offset + length + 12;
    need(stop <= bytes.length, 'PNG chunk extent');
    need(bytes.readUInt32BE(stop - 4) === crc32(bytes.subarray(offset + 4, stop - 4)), 'PNG CRC ' + kind);
    if (!chunks.length) need(kind === 'IHDR', 'PNG first IHDR');
    if (kind === 'IHDR') {
      need(!chunks.length && length === 13, 'PNG unique IHDR');
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
      need(width > 0 && height > 0 && width * height <= 1024 * 1024, 'PNG dimensions');
      need(bytes.subarray(offset + 16, offset + 21).equals(Buffer.from([8, 6, 0, 0, 0])), 'PNG RGBA8 noninterlaced profile');
    }
    if (kind === 'IDAT') parts.push(bytes.subarray(offset + 8, stop - 4));
    chunks.push(kind); offset = stop;
    if (kind === 'IEND') { need(length === 0, 'PNG empty IEND'); ended = true; break; }
  }
  need(ended && offset === bytes.length && parts.length > 0, 'PNG complete stream without trailing bytes');
  const raw = inflateSync(Buffer.concat(parts)), stride = width * 4, rgba = Buffer.alloc(width * height * 4), filters: number[] = [];
  need(raw.length === height * (stride + 1), 'PNG inflated scanline length');
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; need(filter <= 4, 'PNG filter'); filters.push(filter);
    for (let x = 0; x < stride; x++) {
      const p = y * stride + x, left = x >= 4 ? rgba[p - 4] : 0, up = y ? rgba[p - stride] : 0, upperLeft = y && x >= 4 ? rgba[p - stride - 4] : 0;
      rgba[p] = (raw[y * (stride + 1) + x + 1] + [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter]) & 255;
    }
  }
  return { width, height, rgba, filters, chunks };
}
function crop(image: Pixels, x: number, y: number, width: number, height: number): Buffer {
  need([x, y, width, height].every(Number.isInteger) && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= image.width && y + height <= image.height, 'crop geometry');
  const result = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) image.rgba.copy(result, row * width * 4, ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
  return result;
}
function decodeAse(bytes: Buffer): NativeSource {
  need(bytes.length >= 128 && bytes.readUInt32LE(0) === bytes.length && bytes.readUInt16LE(4) === 0xa5e0, 'ASE file header');
  const result: NativeSource = { width: bytes.readUInt16LE(8), height: bytes.readUInt16LE(10), frames: bytes.readUInt16LE(6), depth: bytes.readUInt16LE(12), flags: bytes.readUInt32LE(14), speed: bytes.readUInt16LE(18), durations: [], headers: [], layers: [], cels: [], paletteSizes: [], palette: [], tags: [] };
  need(result.depth === 32 && result.width > 0 && result.height > 0 && result.frames > 0, 'ASE RGB32 dimensions');
  let offset = 128;
  for (let frame = 0; frame < result.frames; frame++) {
    need(offset + 16 <= bytes.length, 'ASE frame header');
    const size = bytes.readUInt32LE(offset), end = offset + size, legacy = bytes.readUInt16LE(offset + 6), modern = bytes.readUInt32LE(offset + 12), count = legacy === 65535 ? modern : legacy;
    need(size >= 16 && end <= bytes.length && bytes.readUInt16LE(offset + 4) === 0xf1fa, 'ASE frame extent/magic');
    need(!modern || modern === count, 'ASE legacy/modern chunk counts');
    result.durations.push(bytes.readUInt16LE(offset + 8)); const types: number[] = [];
    result.headers.push({ legacy, modern, chunks: count, types }); let p = offset + 16;
    for (let chunk = 0; chunk < count; chunk++) {
      need(p + 6 <= end, 'ASE chunk header'); const length = bytes.readUInt32LE(p), kind = bytes.readUInt16LE(p + 4), stop = p + length;
      need(length >= 6 && stop <= end, 'ASE chunk extent'); types.push(kind);
      if (kind === 0x2004) {
        need(length >= 24, 'ASE layer header'); const n = bytes.readUInt16LE(p + 22); need(p + 24 + n <= stop, 'ASE layer name');
        result.layers.push({ name: bytes.toString('utf8', p + 24, p + 24 + n), flags: bytes.readUInt16LE(p + 6), type: bytes.readUInt16LE(p + 8), level: bytes.readUInt16LE(p + 10), blend: bytes.readUInt16LE(p + 16), opacity: bytes[p + 18] });
      } else if (kind === 0x2019) {
        need(length >= 26, 'ASE palette header'); const size = bytes.readUInt32LE(p + 6), first = bytes.readUInt32LE(p + 10), last = bytes.readUInt32LE(p + 14);
        need(first <= last && last < size, 'ASE palette range'); result.paletteSizes.push(size); let q = p + 26;
        for (let i = first; i <= last; i++) {
          need(q + 6 <= stop, 'ASE palette color'); const flags = bytes.readUInt16LE(q); result.palette[i] = bytes.toString('hex', q + 2, q + 6); q += 6;
          if (flags & 1) { need(q + 2 <= stop, 'ASE palette label'); q += 2 + bytes.readUInt16LE(q); }
          need(q <= stop, 'ASE palette label extent');
        }
        need(q === stop, 'ASE complete palette chunk');
      } else if (kind === 0x2018) {
        need(length >= 16, 'ASE tags header'); const count = bytes.readUInt16LE(p + 6); let q = p + 16;
        for (let i = 0; i < count; i++) {
          need(q + 19 <= stop, 'ASE tag header'); const n = bytes.readUInt16LE(q + 17); need(q + 19 + n <= stop, 'ASE tag name');
          result.tags.push({ name: bytes.toString('utf8', q + 19, q + 19 + n), from: bytes.readUInt16LE(q), to: bytes.readUInt16LE(q + 2), direction: bytes[q + 4], repeats: bytes.readUInt16LE(q + 5), color: bytes.toString('hex', q + 13, q + 16) }); q += 19 + n;
        }
        need(q === stop, 'ASE complete tags chunk');
      } else if (kind === 0x2005) {
        need(length >= 24, 'ASE cel header'); const type = bytes.readUInt16LE(p + 13); need([0, 1, 2].includes(type), 'ASE supported cel type');
        const cel: Cel = { frame, layer: bytes.readUInt16LE(p + 6), x: bytes.readInt16LE(p + 8), y: bytes.readInt16LE(p + 10), opacity: bytes[p + 12], z: bytes.readInt16LE(p + 15), type };
        if (type === 1) { need(length === 24, 'ASE linked cel size'); cel.linked = bytes.readUInt16LE(p + 22); }
        else {
          need(length >= 26, 'ASE raster cel header'); const width = bytes.readUInt16LE(p + 22), height = bytes.readUInt16LE(p + 24);
          const payload = bytes.subarray(p + 26, stop), rgba = type === 2 ? inflateSync(payload) : Buffer.from(payload);
          need(width > 0 && height > 0 && rgba.length === width * height * 4, 'ASE raster payload size'); cel.image = { width, height, rgba };
        }
        result.cels.push(cel);
      }
      p = stop;
    }
    need(p === end, 'ASE exact frame chunk consumption'); offset = end;
  }
  need(offset === bytes.length, 'ASE no trailing bytes');
  need(new Set(result.cels.map(cel => cel.frame + ':' + cel.layer)).size === result.cels.length, 'ASE duplicate cel');
  for (const cel of result.cels) need(cel.layer < result.layers.length, 'ASE cel layer index');
  return result;
}
function raster(source: NativeSource, cel: Cel, seen = new Set<Cel>()): Pixels {
  need(!seen.has(cel), 'ASE link cycle'); if (cel.image) return cel.image; seen.add(cel);
  need(cel.linked !== undefined && cel.linked < source.frames, 'ASE link frame');
  const target = source.cels.find(value => value.frame === cel.linked && value.layer === cel.layer); need(target, 'ASE missing linked cel');
  return raster(source, target, seen);
}
function composite(source: NativeSource, frame: number, skip = -1): Buffer {
  const result = Buffer.alloc(source.width * source.height * 4);
  source.layers.forEach((layer, index) => {
    if (!(layer.flags & 1) || index === skip) return;
    need(layer.type === 0 && layer.level === 0 && layer.blend === 0, 'ASE supported normal layer');
    const cel = source.cels.find(value => value.frame === frame && value.layer === index); if (!cel) return;
    need(cel.z === 0, 'ASE zero z profile'); const image = raster(source, cel);
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const p = (y * image.width + x) * 4, dx = cel.x + x, dy = cel.y + y;
      const alpha = image.rgba[p + 3] / 255 * cel.opacity / 255 * layer.opacity / 255;
      if (!alpha || dx < 0 || dy < 0 || dx >= source.width || dy >= source.height) continue;
      const q = (dy * source.width + dx) * 4, previous = result[q + 3] / 255, combined = alpha + previous * (1 - alpha);
      for (let c = 0; c < 3; c++) result[q + c] = Math.round((image.rgba[p + c] * alpha + result[q + c] * previous * (1 - alpha)) / combined);
      result[q + 3] = Math.round(combined * 255);
    }
  });
  return result;
}
function colors(bytes: Buffer) {
  const ink = new Set<string>(), alphas = new Set<number>(); let area = 0, orange = 0;
  for (let p = 0; p < bytes.length; p += 4) { const a = bytes[p + 3]; alphas.add(a); if (!a) continue;
    const rgb = bytes.toString('hex', p, p + 3); ink.add(rgb); area++; if (rgb === 'd97757') orange++;
  }
  return { ink: [...ink].sort(), alphas: [...alphas].sort((a, b) => a - b), area, orange };
}
function bounds(bytes: Buffer, width = 64): number[] {
  const points: [number, number][] = []; for (let p = 0; p < bytes.length; p += 4) if (bytes[p + 3]) points.push([p / 4 % width, Math.floor(p / 4 / width)]);
  need(points.length > 0, 'nonempty silhouette');
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
function difference(a: Buffer, b: Buffer, mask = false): number {
  need(a.length === b.length, 'same raster extent'); let count = 0;
  for (let p = 0; p < a.length; p += 4) if (mask ? a[p + 3] !== b[p + 3] : !a.subarray(p, p + 4).equals(b.subarray(p, p + 4))) count++;
  return count;
}
const ids = [0, 1, 2, 3, 4, 5];
const names = ['gpu-rack', 'coolant-manifold', 'power-bus', 'floor-exhaust', 'ceiling-aperture', 'lunar-porthole'];
const layerNames = ['housing', 'mechanism', 'details'];
const tagColors = ['426b50', '426b50', 'b9905d', '426b50', '575c79', '858eb0'];
const palette20 = ['00000000', '2c2330ff', 'd97757ff', 'eaa083ff', 'b55a4aff', '783f4aff', 'f5e8c8ff', 'cbb696ff', '34354fff', '575c79ff', '858eb0ff', '9dded1ff', 'd9ffeaff', '0f191bff', '24423bff', '426b50ff', '8fa86bff', 'b9905dff', 'e5c386ff', '723f68ff'];
const pngBytes = file('../../public/game/furnace-props.png');
const image = decodePng(pngBytes), source = decodeAse(file('../../assets/source/furnace-props.aseprite'));
const atlas = JSON.parse(file('../../public/game/furnace-props.json').toString('utf8')) as Atlas;
const frames = ids.map(index => crop(image, index * 64, 0, 64, 64));
const measured = [{"area":3100,"bounds":[4,3,59,63],"colors":["0f191b","24423b","34354f","426b50","575c79","858eb0","8fa86b","b9905d","e5c386"],"alphas":[0,255],"foot63":[8,9,10,11,12,13,14,15,48,49,50,51,52,53,54,55],"sha256":"f15bb63f6e1bcadb28a8cfbabb80285265fba3ba462488a1c5ff9cdb72dda183"},{"area":2019,"bounds":[6,5,57,63],"colors":["0f191b","24423b","34354f","426b50","575c79","9dded1","b9905d","e5c386"],"alphas":[0,255],"foot63":[8,9,10,11,12,13,22,23,24,25,26,27],"sha256":"38097fe9da6ce6b5199cfcac0033e068bd85ac8a37c13cba8f3ac4d6134d8d32"},{"area":2062,"bounds":[5,5,58,63],"colors":["0f191b","24423b","34354f","575c79","783f4a","858eb0","b9905d","e5c386"],"alphas":[0,255],"foot63":[10,11,12,13,14,15,48,49,50,51,52,53],"sha256":"f90e7624ca5a2a69dd489e92a9cd569249a27172d198a3fbbe869c5154e87c37"},{"area":1344,"bounds":[4,40,59,63],"colors":["0f191b","24423b","34354f","426b50","575c79","858eb0","8fa86b"],"alphas":[0,255],"foot63":[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59],"sha256":"f03a190f9ed257d3e28013a7cfa992807307afa987a89bb20f37fd1a7931e61a"},{"area":712,"bounds":[0,4,63,21],"colors":["0f191b","24423b","34354f","426b50","575c79","b9905d","e5c386"],"alphas":[0,255],"foot63":[],"sha256":"b151190d2b9adce79a3cc6ffcbfbd812442199e418c6f394208db436c1227278"},{"area":1264,"bounds":[12,6,51,45],"colors":["0f191b","24423b","34354f","426b50","575c79","858eb0","cbb696"],"alphas":[0,255],"foot63":[],"sha256":"b64bd2f44415f4751b0625658b232512e5de755520e508caa7e9a4024568c4bf"}] as const;
const celAreas = [[3100, 1518, 135], [1764, 1739, 57], [2062, 1606, 112], [1344, 325, 27], [712, 217, 12], [1264, 384, 23]];
const layerContribution = [[1492, 1271, 135], [269, 1633, 57], [456, 1494, 112], [992, 296, 27], [485, 215, 12], [857, 384, 23]];
const maskDifferences = [[0, 1105, 1042, 2068, 2740, 1836], [1105, 0, 1139, 1531, 2015, 1851], [1042, 1139, 0, 1142, 2400, 1756], [2068, 1531, 1142, 0, 2056, 2368], [2740, 2015, 2400, 2056, 0, 1600], [1836, 1851, 1756, 2368, 1600, 0]];
const rgbaDifferences = [[0, 2786, 2813, 2985, 3118, 2917], [2786, 0, 2243, 2308, 2209, 2469], [2813, 2243, 0, 2063, 2562, 2439], [2985, 2308, 2063, 0, 2056, 2480], [3118, 2209, 2562, 2056, 0, 1765], [2917, 2469, 2439, 2480, 1765, 0]];

const inkUnion = ['0f191b', '24423b', '34354f', '426b50', '575c79', '783f4a', '858eb0', '8fa86b', '9dded1', 'b9905d', 'cbb696', 'e5c386'];
const pairs = ids.flatMap(a => ids.filter(b => b > a).map(b => ({ a, b })));
function pixel(bytes: Buffer, x: number, y: number): string { const p = (y * 64 + x) * 4; return bytes.toString('hex', p, p + 4); }
function rowInk(bytes: Buffer, y: number): number[] { return Array.from({ length: 64 }, (_, x) => x).filter(x => bytes[(y * 64 + x) * 4 + 3] !== 0); }

describe('six frozen Furnace props: independent source/atlas evidence, not runtime acceptance', () => {
  it('exports the six exact full64px rectangles on a384x64 sheet', () => {
    expect([image.width, image.height]).toEqual([384, 64]); expect(atlas.frames).toHaveLength(6);
    expect(atlas.meta).toMatchObject({ image: 'furnace-props.png', format: 'RGBA8888', scale: '1', size: { w: 384, h: 64 }, slices: [] });
    expect(atlas.frames.map(frame => frame.filename)).toEqual(ids.map(i => 'furnace-props ' + i + '.aseprite'));
    atlas.frames.forEach((frame, i) => {
      expect(frame.frame).toEqual({ x: i * 64, y: 0, w: 64, h: 64 }); expect(frame.trimmed).toBe(false); expect(frame.rotated).toBe(false);
      expect(frame.sourceSize).toEqual({ w: 64, h: 64 }); expect(frame.spriteSourceSize).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    });
  });
  it('keeps all six named tags single-frame, including gpu-rack0..0, with100ms metadata', () => {
    expect(atlas.frames.map(frame => frame.duration)).toEqual([100, 100, 100, 100, 100, 100]); expect(source.durations).toEqual([100, 100, 100, 100, 100, 100]);
    expect(atlas.meta.frameTags).toEqual(names.map((name, i) => ({ name, from: i, to: i, direction: 'forward', color: '#' + tagColors[i] + 'ff' })));
    expect(source.tags).toEqual(names.map((name, i) => ({ name, from: i, to: i, direction: 0, repeats: 0, color: tagColors[i] })));
  });
  it('validates actual ASE file/frame/chunk structure rather than assuming a cel count', () => {
    expect([source.width, source.height, source.frames, source.depth, source.flags, source.speed]).toEqual([64, 64, 6, 32, 1, 100]);
    expect(source.headers.map(({ legacy, modern, chunks }) => [legacy, modern, chunks])).toEqual([[15, 15, 15], [3, 3, 3], [3, 3, 3], [3, 3, 3], [3, 3, 3], [3, 3, 3]]);
    expect(source.headers[0].types).toEqual([0x2007, 0x2019, 0x2018, 0x2020, 0x2020, 0x2020, 0x2020, 0x2020, 0x2020, 0x2004, 0x2004, 0x2004, 0x2005, 0x2005, 0x2005]);
    for (const header of source.headers.slice(1)) expect(header.types).toEqual([0x2005, 0x2005, 0x2005]);
  });
  it('retains real editable housing/mechanism/details layers in correct compositing order', () => {
    expect(source.layers).toEqual(layerNames.map(name => ({ name, flags: 3, type: 0, level: 0, blend: 0, opacity: 255 })));
    expect(atlas.meta.layers).toEqual(layerNames.map(name => ({ name, opacity: 255, blendMode: 'normal' })));
    expect(source.cels).toHaveLength(18); expect(source.cels.map(cel => cel.type)).toEqual(Array(18).fill(2));
    expect(source.cels.filter(cel => cel.linked !== undefined)).toHaveLength(0);
    expect(new Set(source.cels.map(cel => cel.image)).size).toBe(18);
  });
  it.each(ids)('frame%i retains its actual three native64px cels, origins, alpha and occupied areas', frame => {
    const cels = source.cels.filter(cel => cel.frame === frame); expect(cels.map(cel => cel.layer)).toEqual([0, 1, 2]);
    cels.forEach((cel, layer) => {
      expect(cel).toMatchObject({ x: 0, y: 0, opacity: 255, z: 0, type: 2 });
      const image = raster(source, cel); expect([image.width, image.height]).toEqual([64, 64]);
      expect(colors(image.rgba)).toMatchObject({ area: celAreas[frame][layer], alphas: [0, 255], orange: 0 });
    });
  });
  it('keeps the exact shared20 palette and hard-alpha legal ink even under occluding layers', () => {
    expect(source.paletteSizes).toEqual([20]); expect(source.palette).toEqual(palette20);
    const raw = colors(Buffer.concat(source.cels.map(cel => raster(source, cel).rgba)));
    expect(raw).toMatchObject({ ink: inkUnion, alphas: [0, 255], orange: 0 });
    for (const color of raw.ink) expect(palette20).toContain(color + 'ff');
    expect(colors(image.rgba)).toMatchObject({ ink: inkUnion, alphas: [0, 255], orange: 0 });
  });
  it.each(ids)('frame%i matches the native layer/cel RGBA composite byte-for-byte over the whole64x64', frame => {
    const rebuilt = composite(source, frame); expect(rebuilt).toHaveLength(64 * 64 * 4); expect(rebuilt).toEqual(frames[frame]);
    expect(hash(rebuilt)).toBe(measured[frame].sha256); expect(hash(frames[frame])).toBe(measured[frame].sha256);
  });
  it.each(ids.flatMap(frame => [0, 1, 2].map(layer => ({ frame, layer }))))('frame$frame layer$layer genuinely contributes visible pixels, not placeholder provenance', ({ frame, layer }) => {
    expect(difference(composite(source, frame, layer), frames[frame])).toBe(layerContribution[frame][layer]);
    expect(layerContribution[frame][layer]).toBeGreaterThan(0);
  });
  it.each(ids)('frame%i keeps measured bounds, occupied area, native colors and its anchor row', frame => {
    expect(bounds(frames[frame])).toEqual(measured[frame].bounds);
    expect(colors(frames[frame])).toEqual({ area: measured[frame].area, ink: measured[frame].colors, alphas: [0, 255], orange: 0 });
    expect(rowInk(frames[frame], 63)).toEqual(measured[frame].foot63);
  });
  it.each(pairs)('props$a/$b have independently measured different silhouettes, not recolored clones', ({ a, b }) => {
    expect(difference(frames[a], frames[b], true)).toBe(maskDifferences[a][b]); expect(maskDifferences[a][b]).toBeGreaterThan(1000);
    expect(difference(frames[a], frames[b])).toBe(rgbaDifferences[a][b]);
  });
  it.each([0, 1, 2])('standing frame%i has only its two measured feet on local row63', frame => {
    expect(rowInk(frames[frame], 63)).toEqual(measured[frame].foot63); expect(bounds(frames[frame])[3]).toBe(63);
    for (const x of measured[frame].foot63) expect(pixel(frames[frame], x, 63)).toBe(frame === 0 ? '34354fff' : '24423bff');
  });
  it('floor-exhaust occupies exactly y40..63 and never leaks into overhead padding', () => {
    expect(bounds(frames[3])).toEqual([4, 40, 59, 63]);
    expect(colors(crop({ width: 64, height: 64, rgba: frames[3] }, 0, 0, 64, 40)).area).toBe(0);
    expect(rowInk(frames[3], 63)).toEqual(Array.from({ length: 56 }, (_, i) => i + 4));
    for (const x of rowInk(frames[3], 63)) expect(pixel(frames[3], x, 63)).toBe('0f191bff');
  });
  it('ceiling-aperture remains entirely in y4..21, not a full-height floor prop', () => {
    expect(bounds(frames[4])).toEqual([0, 4, 63, 21]);
    expect(colors(crop({ width: 64, height: 64, rgba: frames[4] }, 0, 0, 64, 4)).area).toBe(0);
    expect(colors(crop({ width: 64, height: 64, rgba: frames[4] }, 0, 22, 64, 42)).area).toBe(0);
  });
  it('lunar-porthole remains within its40px y6..45 round window with empty corners and floor', () => {
    expect(bounds(frames[5])).toEqual([12, 6, 51, 45]);
    for (const [x, y] of [[12, 6], [51, 6], [12, 45], [51, 45]]) expect(frames[5][(y * 64 + x) * 4 + 3]).toBe(0);
    expect(colors(crop({ width: 64, height: 64, rgba: frames[5] }, 0, 0, 64, 6)).area).toBe(0);
    expect(colors(crop({ width: 64, height: 64, rgba: frames[5] }, 0, 46, 64, 18)).area).toBe(0);
  });
  it('preserves approved b2 GPU pixels as a secondary witness, in addition to independent ASE reconstruction', () => {
    const b2 = decodePng(file('../../artifacts/asset-review-r19/b2-native.png')); expect([b2.width, b2.height]).toEqual([64, 64]);
    expect(frames[0]).toEqual(b2.rgba); expect(composite(source, 0)).toEqual(b2.rgba);
  });
  it('counts alpha0 RGB payload as transparency, not forbidden orange or palette ink', () => {
    expect(colors(Buffer.from([217, 119, 87, 0, 255, 12, 34, 0]))).toEqual({ ink: [], alphas: [0], area: 0, orange: 0 });
    expect(colors(Buffer.from([217, 119, 87, 255])).orange).toBe(1);
  });
});

// Small in-memory codec controls: these never modify or regenerate the frozen files.
function pngChunk(name: string, payload: Buffer): Buffer {
  const bytes = Buffer.alloc(payload.length + 12); bytes.writeUInt32BE(payload.length); bytes.write(name, 4, 4, 'ascii'); payload.copy(bytes, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, bytes.length - 4)), bytes.length - 4); return bytes;
}
function samplePng(scanlines: Buffer): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(scanlines)), pngChunk('IEND', Buffer.alloc(0))]);
}
function aseChunk(kind: number, payload: Buffer): Buffer {
  const bytes = Buffer.alloc(payload.length + 6); bytes.writeUInt32LE(bytes.length); bytes.writeUInt16LE(kind, 4); payload.copy(bytes, 6); return bytes;
}
function aseFrame(chunks: Buffer[]): Buffer {
  const data = Buffer.concat(chunks), header = Buffer.alloc(16); header.writeUInt32LE(data.length + 16); header.writeUInt16LE(0xf1fa, 4);
  header.writeUInt16LE(chunks.length, 6); header.writeUInt16LE(100, 8); header.writeUInt32LE(chunks.length, 12); return Buffer.concat([header, data]);
}
function sampleAse(type: number, linked = 0, duplicate = false): Buffer {
  const layer = Buffer.alloc(19); layer.writeUInt16LE(3); layer[12] = 255; layer.writeUInt16LE(1, 16); layer.write('L', 18);
  const cel = Buffer.alloc(20); cel.writeInt16LE(-1, 2); cel[6] = 255; cel.writeUInt16LE(type, 7); cel.writeUInt16LE(2, 16); cel.writeUInt16LE(1, 18);
  const pixels = Buffer.from([0, 255, 0, 255, 255, 0, 0, 255]);
  const rasterChunk = aseChunk(0x2005, Buffer.concat([cel, type === 2 ? deflateSync(pixels) : pixels]));
  const link = Buffer.alloc(18); link.writeInt16LE(1, 2); link.writeInt16LE(1, 4); link[6] = 128; link.writeUInt16LE(1, 7); link.writeUInt16LE(linked, 16);
  const frames = [aseFrame([aseChunk(0x2004, layer), rasterChunk, ...(duplicate ? [rasterChunk] : [])]), aseFrame([aseChunk(0x2005, link)])];
  const header = Buffer.alloc(128); header.writeUInt32LE(128 + frames.reduce((sum, frame) => sum + frame.length, 0)); header.writeUInt16LE(0xa5e0, 4);
  header.writeUInt16LE(2, 6); header.writeUInt16LE(3, 8); header.writeUInt16LE(2, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(1, 14); header.writeUInt16LE(100, 18);
  return Buffer.concat([header, ...frames]);
}
const rawPixels = Buffer.from([10, 20, 30, 255, 40, 50, 60, 128, 15, 25, 35, 255, 45, 55, 65, 64]);
// Literal independent vectors, including byte wrapping and filter3, which the export may not use.
const filteredRows = [
  [[10, 20, 30, 255, 40, 50, 60, 128], [15, 25, 35, 255, 45, 55, 65, 64]],
  [[10, 20, 30, 255, 30, 30, 30, 129], [15, 25, 35, 255, 30, 30, 30, 65]],
  [[10, 20, 30, 255, 40, 50, 60, 128], [5, 5, 5, 0, 5, 5, 5, 192]],
  [[10, 20, 30, 255, 35, 40, 45, 1], [10, 15, 20, 128, 18, 18, 18, 129]],
  [[10, 20, 30, 255, 30, 30, 30, 129], [5, 5, 5, 0, 5, 5, 5, 192]],
];
describe('independent PNG/ASE decoder positive and negative controls', () => {
  it('checks the standard CRC32 vector and Paeth upper-left and tie choices', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926); expect(paeth(2, 8, 5)).toBe(5); expect(paeth(1, 1, 1)).toBe(1);
  });
  it.each([0, 1, 2, 3, 4])('PNG filter%i reconstructs a fixed literal two-row RGBA vector', filter => {
    const [a, b] = filteredRows[filter], decoded = decodePng(samplePng(Buffer.from([filter, ...a, filter, ...b])));
    expect(decoded.rgba).toEqual(rawPixels); expect(decoded.filters).toEqual([filter, filter]);
  });
  it.each(['IHDR', 'IDAT', 'IEND'])('rejects corrupted CRC in the actual exported %s chunk', target => {
    const bad = Buffer.from(pngBytes); let p = 8;
    while (bad.toString('ascii', p + 4, p + 8) !== target) p += bad.readUInt32BE(p) + 12;
    bad[p + bad.readUInt32BE(p) + 8] ^= 1;
    expect(() => decodePng(bad)).toThrow('PNG CRC ' + target);
  });
  it('rejects invalid PNG filter, row length, chunk extent and trailing content', () => {
    const a = filteredRows[0][0], b = filteredRows[0][1];
    expect(() => decodePng(samplePng(Buffer.from([5, ...a, 0, ...b])))).toThrow('PNG filter');
    expect(() => decodePng(samplePng(Buffer.from([0, ...a])))).toThrow('PNG inflated scanline length');
    const bad = Buffer.from(pngBytes); bad.writeUInt32BE(0xffffffff, 8); expect(() => decodePng(bad)).toThrow('PNG chunk extent');
    expect(() => decodePng(Buffer.concat([pngBytes, Buffer.from([0])]))).toThrow('PNG complete stream');
  });
  it.each([0, 2])('ASE type%i raster and a real linked cel preserve signed origins and per-cel alpha', type => {
    const sample = decodeAse(sampleAse(type)); expect(sample.cels.map(cel => cel.type)).toEqual([type, 1]);
    expect(sample.cels[0]).toMatchObject({ x: -1, y: 0, opacity: 255 }); expect(sample.cels[1]).toMatchObject({ x: 1, y: 1, opacity: 128, linked: 0 });
    const first = Buffer.alloc(24), second = Buffer.alloc(24); first.set([255, 0, 0, 255]); second.set([0, 255, 0, 128, 255, 0, 0, 128], 16);
    expect(composite(sample, 0)).toEqual(first); expect(composite(sample, 1)).toEqual(second);
    expect(raster(sample, sample.cels[1])).toBe(raster(sample, sample.cels[0]));
  });
  it('rejects malformed ASE headers, inconsistent counts, duplicate cels and cyclic links', () => {
    const bytes = file('../../assets/source/furnace-props.aseprite'), badSize = Buffer.from(bytes), badCount = Buffer.from(bytes), badChunk = Buffer.from(bytes);
    badSize.writeUInt32LE(bytes.length - 1); expect(() => decodeAse(badSize)).toThrow('ASE file header');
    badCount.writeUInt32LE(99, 128 + 12); expect(() => decodeAse(badCount)).toThrow('ASE legacy/modern chunk counts');
    badChunk.writeUInt32LE(0xffffffff, 128 + 16); expect(() => decodeAse(badChunk)).toThrow('ASE chunk extent');
    expect(() => decodeAse(sampleAse(2, 0, true))).toThrow('ASE duplicate cel');
    const cycle = decodeAse(sampleAse(2, 1)); expect(() => composite(cycle, 1)).toThrow('ASE link cycle');
  });
  it('normal compositing obeys layer order, both opacity fields and visibility instead of blindly copying RGB', () => {
    const sample = decodeAse(sampleAse(2));
    const layered: NativeSource = { ...sample, width: 2, height: 1, frames: 1,
      layers: [{ ...sample.layers[0] }, { ...sample.layers[0], name: 'top' }],
      cels: [{ frame: 0, layer: 0, x: 0, y: 0, opacity: 255, z: 0, type: 0, image: { width: 2, height: 1, rgba: Buffer.from([255, 0, 0, 255, 255, 0, 0, 255]) } },
        { frame: 0, layer: 1, x: 1, y: 0, opacity: 128, z: 0, type: 0, image: { width: 1, height: 1, rgba: Buffer.from([0, 0, 255, 255]) } }] };
    const mixed = Buffer.from([255, 0, 0, 255, 127, 0, 128, 255]); expect(composite(layered, 0)).toEqual(mixed);
    layered.cels[1].opacity = 255; layered.layers[1].opacity = 128; expect(composite(layered, 0)).toEqual(mixed);
    layered.layers[1].flags = 0; expect(composite(layered, 0)).toEqual(Buffer.from([255, 0, 0, 255, 255, 0, 0, 255]));
    layered.layers[0].flags = 0; expect(composite(layered, 0)).toEqual(Buffer.alloc(8));
  });
});
