import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// Frozen Leviathan source/export proof only; no runtime selector, provenance or browser oracle.
// Local codec infrastructure is adapted from the independently reviewed Furnace/Basilisk tests.
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
  const raw = inflateSync(Buffer.concat(parts), { maxOutputLength: height * (width * 4 + 1) }), stride = width * 4, rgba = Buffer.alloc(width * height * 4), filters: number[] = [];
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
  need(result.depth === 32 && result.width > 0 && result.height > 0 && result.frames > 0 && result.frames <= 64 && result.width * result.height <= 1024 * 1024, 'ASE RGB32 dimensions');
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
          need(width > 0 && height > 0 && width * height <= 1024 * 1024, 'ASE bounded cel dimensions');
          const payload = bytes.subarray(p + 26, stop), rgba = type === 2 ? inflateSync(payload, { maxOutputLength: width * height * 4 }) : Buffer.from(payload);
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
function bounds(bytes: Buffer, width = 160): number[] {
  const points: [number, number][] = []; for (let p = 0; p < bytes.length; p += 4) if (bytes[p + 3]) points.push([p / 4 % width, Math.floor(p / 4 / width)]);
  need(points.length > 0, 'nonempty silhouette');
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
function difference(a: Buffer, b: Buffer, mask = false): number {
  need(a.length === b.length, 'same raster extent'); let count = 0;
  for (let p = 0; p < a.length; p += 4) if (mask ? a[p + 3] !== b[p + 3] : !a.subarray(p, p + 4).equals(b.subarray(p, p + 4))) count++;
  return count;
}

const ids = [0, 1, 2, 3, 4, 5, 6, 7];
const phases = [0, 1, 2, 3];
const names = ['leviathan 0.aseprite', 'leviathan 1.aseprite', 'leviathan 2.aseprite', 'leviathan 3.aseprite',
  'leviathan 4.aseprite', 'leviathan 5.aseprite', 'leviathan 6.aseprite', 'leviathan 7.aseprite'];
const layerNames = ['anchors', 'outer-rotor', 'inner-rotor', 'iris'];
const palette20 = ['00000000', '2c2330ff', 'd97757ff', 'eaa083ff', 'b55a4aff', '783f4aff', 'f5e8c8ff', 'cbb696ff', '34354fff', '575c79ff', '858eb0ff', '9dded1ff', 'd9ffeaff', '0f191bff', '24423bff', '426b50ff', '8fa86bff', 'b9905dff', 'e5c386ff', '723f68ff'];
// These literals came from a separate struct/zlib ASE inspection, not the export or generation metadata.
const frameAreas = [
  12704,
  12716,
  12513,
  12715,
  12704,
  12716,
  12513,
  12715,
] as const;
const frameHashes = [
  "77a72a9393f06d88a068f1e7ed5805328f9c976500d65aa98b02c485425d750b",
  "aa3397505abf6906bbdfa2137e36755960159359f8784649b6286f5effc598c5",
  "97c775aa445c94c6edba200c997efd63002bf1259874bf4bd94f23057da61e66",
  "97c5e52087afcea7fce896b5680d4411c3f683edc14b9a5b599fa9ba859ea27f",
  "e839c63770d2ed6eca0342f691f0a95ec89d288b3205ebcc3f16eb7ae279c316",
  "bf3530aff62b87643220d2d04036240e52ab1256d209141d3bc6ccc3ee5ca21e",
  "b2310033444eb2d2981220da05fd7f4533f2e9e65e3a66f60174268c0d395c87",
  "cae9118bc750475465a797c0fed73cf817d6e5f52db4350c611ebe39cfb9492b",
] as const;
const layerAreas = [
  [2127,10687,4569,1095],
  [2127,10817,4565,1095],
  [2127,10687,4570,1095],
  [2127,10817,4565,1095],
  [2127,10687,4569,3465],
  [2127,10817,4565,3465],
  [2127,10687,4570,3465],
  [2127,10817,4565,3465],
] as const;
const layerBounds = [
  [[2,8,151,151],[23,14,137,146],[35,41,125,119],[51,56,109,105]],
  [[2,8,151,151],[16,16,144,144],[37,37,123,123],[51,56,109,105]],
  [[2,8,151,151],[14,23,146,137],[41,35,119,125],[51,56,109,105]],
  [[2,8,151,151],[16,16,144,144],[37,37,123,123],[51,56,109,105]],
  [[2,8,151,151],[23,14,137,146],[35,41,125,119],[42,43,118,117]],
  [[2,8,151,151],[16,16,144,144],[37,37,123,123],[42,43,118,117]],
  [[2,8,151,151],[14,23,146,137],[41,35,119,125],[42,43,118,117]],
  [[2,8,151,151],[16,16,144,144],[37,37,123,123],[42,43,118,117]],
] as const;
const layerHashes = [
  ["798a21538ce5fc682535ab8e797ea01bbdec749dadb04d4bff8770b1e540a60b","7ba724c8465086caf6bc2f730f4c7f70936c7639b1188d0389d3ee0e8531fc20","37b5cbeb1c22268012364865a16879b526cde9797bb289b308e4d045a02629cf","24e3ae810aa74d4b182559d0257fc8b5f5e35b20fd3339db336eadef649abebd"],
  ["798a21538ce5fc682535ab8e797ea01bbdec749dadb04d4bff8770b1e540a60b","4297c471778d523aab3312bd50820d76aedb0e8567936aa8f27acaa418bb2acf","0c71691e82a41fa1f91cddcb8dfc79d22c28bca8ef8458055d65a60f6b4a077d","24e3ae810aa74d4b182559d0257fc8b5f5e35b20fd3339db336eadef649abebd"],
  ["798a21538ce5fc682535ab8e797ea01bbdec749dadb04d4bff8770b1e540a60b","ee682776497378fa0361a970e3bb6a45cdfe2f62486d7fca8e9bc2319bc684b4","48c7e3870ca529743bc2d82ab483765579ccc5dc69ead8f3e443bfd5f15fb0a3","24e3ae810aa74d4b182559d0257fc8b5f5e35b20fd3339db336eadef649abebd"],
  ["798a21538ce5fc682535ab8e797ea01bbdec749dadb04d4bff8770b1e540a60b","9ad5f5fc09933995073d9e2809540802071331fbd3b85cb919ba7154d0584b27","cc010dd451aceef4abcca247c51daf52302c6e59ba4fbb8ba52e316fe7de991d","24e3ae810aa74d4b182559d0257fc8b5f5e35b20fd3339db336eadef649abebd"],
  ["798a21538ce5fc682535ab8e797ea01bbdec749dadb04d4bff8770b1e540a60b","7ba724c8465086caf6bc2f730f4c7f70936c7639b1188d0389d3ee0e8531fc20","37b5cbeb1c22268012364865a16879b526cde9797bb289b308e4d045a02629cf","46857afe15d187726bdd987f15e733f80d7fa8e4743e8bf22975a2b231a98a28"],
  ["798a21538ce5fc682535ab8e797ea01bbdec749dadb04d4bff8770b1e540a60b","4297c471778d523aab3312bd50820d76aedb0e8567936aa8f27acaa418bb2acf","0c71691e82a41fa1f91cddcb8dfc79d22c28bca8ef8458055d65a60f6b4a077d","46857afe15d187726bdd987f15e733f80d7fa8e4743e8bf22975a2b231a98a28"],
  ["798a21538ce5fc682535ab8e797ea01bbdec749dadb04d4bff8770b1e540a60b","ee682776497378fa0361a970e3bb6a45cdfe2f62486d7fca8e9bc2319bc684b4","48c7e3870ca529743bc2d82ab483765579ccc5dc69ead8f3e443bfd5f15fb0a3","46857afe15d187726bdd987f15e733f80d7fa8e4743e8bf22975a2b231a98a28"],
  ["798a21538ce5fc682535ab8e797ea01bbdec749dadb04d4bff8770b1e540a60b","9ad5f5fc09933995073d9e2809540802071331fbd3b85cb919ba7154d0584b27","cc010dd451aceef4abcca247c51daf52302c6e59ba4fbb8ba52e316fe7de991d","46857afe15d187726bdd987f15e733f80d7fa8e4743e8bf22975a2b231a98a28"],
] as const;
const layerContribution = [
  [2017,6077,2553,862],
  [1899,6157,2455,826],
  [1826,6017,2291,780],
  [1898,6153,2261,778],
  [2017,6077,924,1643],
  [1899,6157,841,1705],
  [1826,6017,739,1376],
  [1898,6153,734,1450],
] as const;
const frameDifferences = [
  [0,5629,6546,5925,2235,7061,7578,6864],
  [5629,0,6070,6679,7149,2323,7337,7624],
  [6546,6070,0,5843,7358,7029,2015,6792],
  [5925,6679,5843,0,6660,7332,6808,2031],
  [2235,7149,7358,6660,0,4826,5343,4629],
  [7061,2323,7029,7332,4826,0,5014,5301],
  [7578,7337,2015,6808,5343,5014,0,4777],
  [6864,7624,6792,2031,4629,5301,4777,0],
] as const;
const nozzleRows = [
  "........................",
  ".............###########",
  "............############",
  "...........#############",
  "..........##############",
  "..######################",
  "..######################",
  "..######################",
  "..######################",
  "..######################",
  "..######################",
  "..######################",
  "..........##############",
  "...........#############",
  "............############",
  ".............###########",
  "........................",
] as const;
const closedInk = ['0f191b', '24423b', '426b50', '8fa86b', '9dded1'];
const openInk = [...closedInk, 'b9905d', 'e5c386'];
const pngBytes = file('../../public/game/leviathan.png');
const aseBytes = file('../../assets/source/leviathan.aseprite');
const atlasBytes = file('../../public/game/leviathan.json');
const image = decodePng(pngBytes), source = decodeAse(aseBytes);
const atlas = JSON.parse(atlasBytes.toString('utf8')) as Atlas;
const frames = ids.map(i => crop(image, i * 160, 0, 160, 160));

const typeRows = [[2, 2, 2, 2], [1, 2, 2, 1], [1, 2, 2, 1], [1, 2, 2, 1],
  [1, 1, 1, 2], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]];
const linkRows = [[-1, -1, -1, -1], [0, -1, -1, 0], [0, -1, -1, 0], [0, -1, -1, 0],
  [0, 0, 0, -1], [0, 1, 1, 4], [0, 2, 2, 4], [0, 3, 3, 4]];
const tagNames = ['closed', 'open'], tagColors = ['426b50', 'e5c386'];
function rectIs(actual: { x: number; y: number; w: number; h: number }, x: number, y: number, w: number, h: number): boolean {
  return actual?.x === x && actual?.y === y && actual?.w === w && actual?.h === h;
}
function validateAtlas(a: Atlas): void {
  need(Array.isArray(a.frames) && a.frames.length === 8, 'atlas frame count');
  need(a.meta?.image === 'leviathan.png' && a.meta.format === 'RGBA8888' && a.meta.scale === '1', 'atlas image profile');
  need(a.meta.size?.w === 1280 && a.meta.size.h === 160, 'atlas sheet dimensions');
  a.frames.forEach((f, i) => {
    need(f.filename === names[i] && /^[\x20-\x7e]+$/.test(f.filename), 'atlas ASCII frame name');
    need(rectIs(f.frame, i * 160, 0, 160, 160), 'atlas frame cut');
    need(f.rotated === false && f.trimmed === false, 'atlas untrimmed unrotated');
    need(rectIs(f.spriteSourceSize, 0, 0, 160, 160), 'atlas spriteSourceSize');
    need(f.sourceSize?.w === 160 && f.sourceSize.h === 160, 'atlas sourceSize');
    need(f.duration === 100, 'atlas duration');
  });
  need(a.meta.frameTags.length === 2, 'atlas tag count');
  a.meta.frameTags.forEach((t, i) => need(t.name === tagNames[i] && t.from === i * 4 && t.to === i * 4 + 3 &&
    t.direction === 'forward' && t.color === '#' + tagColors[i] + 'ff', 'atlas tag range/direction/color'));
  need(a.meta.layers.length === 4, 'atlas layer count');
  a.meta.layers.forEach((l, i) => need(l.name === layerNames[i] && l.opacity === 255 && l.blendMode === 'normal', 'atlas layer profile'));
  need(Array.isArray(a.meta.slices) && a.meta.slices.length === 0, 'atlas no accidental slices');
}
function validateInk(bytes: Buffer): void {
  need(bytes.length % 4 === 0, 'RGBA extent');
  const c = colors(bytes);
  need(c.alphas.every(a => a === 0 || a === 255), 'hard alpha');
  need(c.orange === 0, 'hero orange absent');
  need(c.ink.every(rgb => palette20.includes(rgb + 'ff')), 'palette legal ink');
}
function layerCanvas(s: NativeSource, frame: number, layer: number): Buffer {
  need(s.cels.filter(c => c.frame === frame && c.layer === layer).length === 1, 'one cel per layer/frame');
  return composite({ ...s, layers: s.layers.map((l, i) => ({ ...l, flags: i === layer ? l.flags | 1 : 0 })) }, frame);
}
function coreClear(bytes: Buffer): void {
  for (let y = 65; y < 95; y++) for (let x = 67; x < 93; x++) need(bytes[(y * 160 + x) * 4 + 3] === 0, 'Core aperture clear');
}
function validateSource(s: NativeSource): void {
  need(s.width === 160 && s.height === 160 && s.frames === 8 && s.depth === 32 && s.flags === 1 && s.speed === 100, 'ASE profile');
  need(s.durations.length === 8 && s.durations.every(d => d === 100), 'ASE duration');
  need(s.layers.length === 4 && s.cels.length === 32, 'ASE rig cardinality');
  s.layers.forEach((l, i) => need(l.name === layerNames[i] && l.flags === 3 && l.type === 0 && l.level === 0 && l.blend === 0 && l.opacity === 255, 'ASE layer profile'));
  need(JSON.stringify(s.paletteSizes) === '[20]' && JSON.stringify(s.palette) === JSON.stringify(palette20), 'ASE palette20');
  need(s.tags.length === 2, 'ASE tags count');
  s.tags.forEach((t, i) => need(t.name === tagNames[i] && t.from === i * 4 && t.to === i * 4 + 3 && t.direction === 0 && t.repeats === 0 && t.color === tagColors[i], 'ASE tags'));
  for (const c of s.cels) {
    need(c.x === 0 && c.y === 0 && c.z === 0 && c.opacity === 255, 'ASE cel origin/opacity/z');
    const r = raster(s, c); need(r.width === 160 && r.height === 160, 'ASE native cel dimensions');
    validateInk(r.rgba);
  }
  for (const f of ids) for (const l of phases) coreClear(layerCanvas(s, f, l));
}
function validateExport(png: Pixels): void {
  need(png.width === 1280 && png.height === 160, 'PNG sheet dimensions'); validateInk(png.rgba);
  const cells = ids.map(i => crop(png, i * 160, 0, 160, 160));
  need(new Set(cells.map(hash)).size === 8, 'PNG eight unique frames');
  cells.forEach((c, i) => { coreClear(c); need(hash(c) === frameHashes[i], 'PNG frozen frame ' + i); });
}
function alphaRows(bytes: Buffer, x: number, y: number, w: number, h: number): string[] {
  return Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => bytes[((y + j) * 160 + x + i) * 4 + 3] ? '#' : '.').join(''));
}
function nearestGreenSquared(bytes: Buffer): number {
  let nearest = Infinity;
  for (let p = 0; p < bytes.length; p += 4) if (bytes[p + 3] && ['426b50', '8fa86b', '9dded1'].includes(bytes.toString('hex', p, p + 3))) {
    const x = p / 4 % 160 - 80, y = Math.floor(p / 4 / 160) - 80; nearest = Math.min(nearest, x * x + y * y);
  }
  return nearest;
}
const asFrame = (rgba: Buffer): Pixels => ({ width: 160, height: 160, rgba });
const pairs = ids.flatMap(a => ids.filter(b => b > a).map(b => ({ a, b })));
const layerCases = ids.flatMap(frame => phases.map(layer => ({ frame, layer })));

describe('Leviathan eight frozen source poses, not runtime or whole-GDD admission', () => {
  it('checks all eight exact ASCII atlas slots, complete dimensions, layers, tags and100ms', () => {
    validateAtlas(atlas); validateExport(image); validateSource(source);
  });
  it('retains real RGB ASE headers and complete native frame chunk consumption', () => {
    expect(source.headers.map(h => [h.legacy, h.modern, h.chunks])).toEqual([13, 4, 4, 4, 4, 4, 4, 4].map(n => [n, n, n]));
    expect(source.headers[0].types).toEqual([0x2007, 0x2019, 0x2018, 0x2020, 0x2020,
      0x2004, 0x2004, 0x2004, 0x2004, 0x2005, 0x2005, 0x2005, 0x2005]);
    for (const h of source.headers.slice(1)) expect(h.types).toEqual([0x2005, 0x2005, 0x2005, 0x2005]);
  });
  it('contains the measured32 cels:11 compressed rasters and21 actual links, not placeholder claims', () => {
    expect(source.cels).toHaveLength(32);
    expect(source.cels.filter(c => c.type === 2)).toHaveLength(11);
    expect(source.cels.filter(c => c.type === 1)).toHaveLength(21);
    expect(new Set(source.cels.filter(c => c.image).map(c => c.image)).size).toBe(11);
    for (const f of ids) {
      const cels = source.cels.filter(c => c.frame === f);
      expect(cels.map(c => c.layer)).toEqual([0, 1, 2, 3]);
      expect(cels.map(c => c.type)).toEqual(typeRows[f]);
      expect(cels.map(c => c.linked ?? -1)).toEqual(linkRows[f]);
    }
  });
  it('uses the exact20 family palette but only seven legal opaque colors and no hero orange', () => {
    expect(source.palette).toEqual(palette20); expect(source.paletteSizes).toEqual([20]);
    const raw = Buffer.concat(source.cels.map(c => raster(source, c).rgba));
    expect(colors(raw)).toMatchObject({ ink: openInk, alphas: [0, 255], orange: 0 });
    expect(colors(image.rgba)).toMatchObject({ ink: openInk, alphas: [0, 255], orange: 0 });
  });
  it.each(ids)('frame%i is exact whole160x160 RGBA reconstruction from true cels/links/origins', f => {
    const rebuilt = composite(source, f);
    expect(rebuilt.length).toBe(160 * 160 * 4);
    expect(rebuilt.equals(frames[f])).toBe(true);
    expect(hash(rebuilt)).toBe(frameHashes[f]); expect(hash(frames[f])).toBe(frameHashes[f]);
  });
  it.each(layerCases)('frame$frame layer$layer retains exact native ink, geometry, and clear Core rectangle', ({ frame: f, layer: l }) => {
    const bytes = layerCanvas(source, f, l), cel = source.cels.find(c => c.frame === f && c.layer === l)!;
    expect([cel.x, cel.y, cel.z, cel.opacity]).toEqual([0, 0, 0, 255]);
    expect([raster(source, cel).width, raster(source, cel).height]).toEqual([160, 160]);
    expect(colors(bytes)).toMatchObject({ area: layerAreas[f][l], alphas: [0, 255], orange: 0 });
    expect(bounds(bytes)).toEqual(layerBounds[f][l]); expect(hash(bytes)).toBe(layerHashes[f][l]);
    coreClear(bytes); coreClear(raster(source, cel).rgba);
  });
  it.each(layerCases)('frame$frame layer$layer actually contributes visible pixels to the export', ({ frame, layer }) => {
    expect(difference(composite(source, frame, layer), frames[frame])).toBe(layerContribution[frame][layer]);
    expect(layerContribution[frame][layer]).toBeGreaterThan(0);
  });
  it.each(ids)('frame%i retains measured phase volume/bounds and five-closed or seven-open colors', f => {
    expect(colors(frames[f])).toEqual({ area: frameAreas[f], ink: f < 4 ? closedInk : openInk, alphas: [0, 255], orange: 0 });
    expect(bounds(frames[f])).toEqual([2, 8, 151, 151]); coreClear(frames[f]);
  });
  it('keeps four distinct source rotor phases with independently measured area ranges', () => {
    const actualAreas = phases.map(f => colors(frames[f]).area);
    expect(Math.max(...actualAreas) - Math.min(...actualAreas)).toBe(203);
    for (const l of [1, 2]) expect(new Set(phases.map(f => hash(layerCanvas(source, f, l)))).size).toBe(4);
    expect(phases.map(f => colors(layerCanvas(source, f, 1)).area)).toEqual([10687, 10817, 10687, 10817]);
    expect(phases.map(f => colors(layerCanvas(source, f, 2)).area)).toEqual([4569, 4565, 4570, 4565]);
  });
  it.each(phases)('phase%i has the same two native rotor images across the closed/open source states', f => {
    for (const l of [1, 2]) {
      expect(layerCanvas(source, f, l).equals(layerCanvas(source, f + 4, l))).toBe(true);
      const closed = source.cels.find(c => c.frame === f && c.layer === l)!;
      const open = source.cels.find(c => c.frame === f + 4 && c.layer === l)!;
      expect(open).toMatchObject({ type: 1, linked: f }); expect(raster(source, open)).toBe(raster(source, closed));
    }
  });
  it('keeps anchors identical in all8 and each iris state identical across its four phases', () => {
    expect(new Set(ids.map(f => hash(layerCanvas(source, f, 0)))).size).toBe(1);
    for (const state of [0, 4]) expect(new Set(phases.map(f => hash(layerCanvas(source, state + f, 3)))).size).toBe(1);
  });
  it('open iris really changes layer geometry and retracts the nearest green surface, not a color swap', () => {
    const closed = layerCanvas(source, 0, 3), open = layerCanvas(source, 4, 3);
    expect([colors(closed).area, colors(open).area]).toEqual([1095, 3465]);
    expect([bounds(closed), bounds(open)]).toEqual([[51, 56, 109, 105], [42, 43, 118, 117]]);
    expect(difference(closed, open, true)).toBe(2370); expect(difference(closed, open)).toBe(3229);
    expect([nearestGreenSquared(closed), nearestGreenSquared(open)]).toEqual([229, 557]);
    expect(nearestGreenSquared(open)).toBeGreaterThan(nearestGreenSquared(closed));
    // Dark material remains opaque: whole-body alpha need not and DOES NOT shrink.
    for (const f of phases) expect(difference(frames[f], frames[f + 4], true)).toBe(0);
  });
  it.each(ids)('frame%i preserves all four square-domain corner witnesses, not only a hexagonal hit silhouette', f => {
    for (const [x, y] of [[8, 8], [151, 8], [8, 151], [151, 151]]) {
      const p = (y * 160 + x) * 4;
      expect(frames[f].toString('hex', p, p + 4)).toBe('0f191bff');
    }
    for (const [x, y] of [[8, 8], [136, 8], [8, 136], [136, 136]]) {
      expect(colors(crop(asFrame(layerCanvas(source, f, 0)), x, y, 16, 16)).area).toBe(204);
    }
  });
  it.each(ids)('frame%i keeps the actual left origin2,80 inside the independently measured nozzle mask', f => {
    const anchors = layerCanvas(source, f, 0), p = (80 * 160 + 2) * 4;
    expect(alphaRows(anchors, 0, 72, 24, 17)).toEqual(nozzleRows);
    // Only x0..13 is the unobscured nozzle witness; the turning rotor may enter x14..23.
    expect(alphaRows(frames[f], 0, 72, 14, 17)).toEqual(nozzleRows.map(row => row.slice(0, 14)));
    expect(anchors.toString('hex', p, p + 4)).toBe('0f191bff');
    expect(frames[f].toString('hex', p, p + 4)).toBe('0f191bff');
  });
  it.each(pairs)('source frames$a/$b have their independently frozen RGBA differences', ({ a, b }) => {
    expect(difference(frames[a], frames[b])).toBe(frameDifferences[a][b]);
    expect(frameDifferences[a][b]).toBeGreaterThan(0);
  });
  it('counts alpha0 RGB as invisible, without accepting soft alpha or opaque hero orange', () => {
    expect(colors(Buffer.from([217, 119, 87, 0, 12, 34, 56, 0]))).toEqual({ ink: [], alphas: [0], area: 0, orange: 0 });
    validateInk(Buffer.from([217, 119, 87, 0]));
    expect(() => validateInk(Buffer.from([217, 119, 87, 255]))).toThrow('hero orange');
    expect(() => validateInk(Buffer.from([15, 25, 27, 128]))).toThrow('hard alpha');
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

function encodedPng(png: Pixels): Buffer {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(png.width); ihdr.writeUInt32BE(png.height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc(png.height * (png.width * 4 + 1));
  for (let y = 0; y < png.height; y++) png.rgba.copy(rows, y * (png.width * 4 + 1) + 1, y * png.width * 4, (y + 1) * png.width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))]);
}
function agreement(s: NativeSource, png: Pixels): void {
  validateSource(s); validateExport(png);
  for (const f of ids) need(composite(s, f).equals(crop(png, f * 160, 0, 160, 160)), 'ASE/PNG RGBA disagreement frame ' + f);
}
function layerWitness(s: NativeSource): void {
  for (const f of ids) for (const l of phases) need(hash(layerCanvas(s, f, l)) === layerHashes[f][l], 'ASE frozen layer witness');
}
function locations(bytes: Buffer): { frames: number[]; chunks: { frame: number; type: number; offset: number }[] } {
  const frames: number[] = [], chunks: { frame: number; type: number; offset: number }[] = []; let p = 128;
  while (p < bytes.length) {
    const f = frames.length, end = p + bytes.readUInt32LE(p); frames.push(p); let c = p + 16;
    while (c < end) { chunks.push({ frame: f, type: bytes.readUInt16LE(c + 4), offset: c }); c += bytes.readUInt32LE(c); }
    need(c === end && end > p, 'mutation locator frame'); p = end;
  }
  return { frames, chunks };
}
const offsets = locations(aseBytes);
const mutations: { name: string; error: string; change: (a: Atlas) => void }[] = [
  { name: 'unused frame7 name alias', error: 'ASCII frame name', change: a => { a.frames[7].filename = a.frames[0].filename; } },
  { name: 'unused frame7 Unicode name', error: 'ASCII frame name', change: a => { a.frames[7].filename = 'leviathan ７.aseprite'; } },
  { name: 'unused frame7 cut alias', error: 'frame cut', change: a => { a.frames[7].frame.x = 0; } },
  { name: 'unused frame7 cut shift', error: 'frame cut', change: a => { a.frames[7].frame.y = 1; } },
  { name: 'unused frame7 width', error: 'frame cut', change: a => { a.frames[7].frame.w = 159; } },
  { name: 'unused frame7 height', error: 'frame cut', change: a => { a.frames[7].frame.h = 159; } },
  { name: 'unused frame7 sourceSize', error: 'sourceSize', change: a => { a.frames[7].sourceSize.h = 159; } },
  { name: 'unused frame7 spriteSourceSize', error: 'spriteSourceSize', change: a => { a.frames[7].spriteSourceSize.x = 1; } },
  { name: 'unused frame7 trim', error: 'untrimmed', change: a => { a.frames[7].trimmed = true; } },
  { name: 'unused frame7 rotation', error: 'unrotated', change: a => { a.frames[7].rotated = true; } },
  { name: 'unused frame7 duration', error: 'duration', change: a => { a.frames[7].duration = 101; } },
  { name: 'closed tag missing phase3', error: 'tag range', change: a => { a.meta.frameTags[0].to = 2; } },
  { name: 'open tag overlaps closed', error: 'tag range', change: a => { a.meta.frameTags[1].from = 3; } },
  { name: 'open tag loses frame7', error: 'tag range', change: a => { a.meta.frameTags[1].to = 6; } },
  { name: 'pingpong instead of forward', error: 'tag range', change: a => { a.meta.frameTags[1].direction = 'pingpong'; } },
  { name: 'incorrect atlas dimensions', error: 'sheet dimensions', change: a => { a.meta.size.w = 1279; } },
  { name: 'missing last frame', error: 'frame count', change: a => { a.frames.pop(); } },
  { name: 'incorrect rig layer', error: 'layer profile', change: a => { a.meta.layers[3].name = 'mouth'; } },
];
describe('real exported asset mutations, never written back to disk', () => {
  it('first accepts the intact independently decoded source, atlas and PNG through the same guards', () => {
    validateAtlas(atlas); agreement(source, image); layerWitness(source);
  });
  it.each(mutations)('rejects $name even when that slot is not the selected pose', ({ change, error }) => {
    const bad = JSON.parse(atlasBytes.toString('utf8')) as Atlas; change(bad);
    expect(() => validateAtlas(bad)).toThrow(error);
  });
  it('rejects an actual unused PNG cell aliased to its neighbor, despite a valid new CRC', () => {
    const altered = { ...image, rgba: Buffer.from(image.rgba) };
    for (let y = 0; y < 160; y++) frames[6].copy(altered.rgba, (y * 1280 + 1120) * 4, y * 160 * 4, (y + 1) * 160 * 4);
    const bad = decodePng(encodedPng(altered)); expect(() => validateExport(bad)).toThrow('eight unique frames');
  });
  it('rejects one actual frame7 half-alpha pixel after PNG recompression and valid CRC', () => {
    const altered = { ...image, rgba: Buffer.from(image.rgba) }, p = ((80 * 1280) + 1120 + 2) * 4 + 3;
    expect(altered.rgba[p]).toBe(255); altered.rgba[p] = 128;
    const bad = decodePng(encodedPng(altered)); expect(() => validateExport(bad)).toThrow('hard alpha');
  });
  it('rejects an actual palette-legal Core pixel, not just wrong-color or wrong-alpha contamination', () => {
    const bad = Buffer.from(frames[7]), p = (80 * 160 + 80) * 4;
    expect(bad[p + 3]).toBe(0); bad.set([15, 25, 27, 255], p);
    expect(() => coreClear(bad)).toThrow('Core aperture clear');
    const native = decodeAse(aseBytes), cel = native.cels.find(c => c.frame === 0 && c.layer === 0)!;
    cel.image!.rgba.set([15, 25, 27, 255], p); expect(() => validateSource(native)).toThrow('Core aperture clear');
  });

  it.each(['out-of-range', 'self-cycle'])('rejects an actual frame7 linked cel %s', mode => {
    const at = offsets.chunks.find(c => c.frame === 7 && c.type === 0x2005 && aseBytes.readUInt16LE(c.offset + 6) === 0)!.offset;
    expect(aseBytes.readUInt16LE(at + 13)).toBe(1);
    const bad = Buffer.from(aseBytes); bad.writeUInt16LE(mode === 'out-of-range' ? 8 : 7, at + 22);
    const corrupted = decodeAse(bad);
    expect(() => composite(corrupted, 7)).toThrow(mode === 'out-of-range' ? 'ASE link frame' : 'ASE link cycle');
  });
  it('rejects a valid but wrong earlier rotor link in actual unused frame7 by RGBA reconstruction', () => {
    const at = offsets.chunks.find(c => c.frame === 7 && c.type === 0x2005 && aseBytes.readUInt16LE(c.offset + 6) === 1)!.offset;
    expect(aseBytes.readUInt16LE(at + 22)).toBe(3);
    const bad = Buffer.from(aseBytes); bad.writeUInt16LE(2, at + 22);
    expect(() => agreement(decodeAse(bad), image)).toThrow('ASE/PNG RGBA disagreement frame 7');
  });
  it.each(['magic', 'frame-size', 'chunk-count', 'duration'])('rejects actual final ASE frame corruption: %s', kind => {
    const bad = Buffer.from(aseBytes), at = offsets.frames[7];
    if (kind === 'magic') bad.writeUInt16LE(0, at + 4);
    else if (kind === 'frame-size') bad.writeUInt32LE(0xffffffff, at);
    else if (kind === 'chunk-count') bad.writeUInt32LE(3, at + 12);
    else bad.writeUInt16LE(101, at + 8);
    expect(() => validateSource(decodeAse(bad))).toThrow(kind === 'duration' ? 'ASE duration' : kind === 'chunk-count' ? 'ASE legacy/modern' : 'ASE frame extent');
  });
  it('rejects an actual duplicate frame7 layer and a truncated native frame count', () => {
    const bad = Buffer.from(aseBytes), at = offsets.chunks.filter(c => c.frame === 7 && c.type === 0x2005).slice(-1)[0]!.offset;
    bad.writeUInt16LE(2, at + 6); expect(() => decodeAse(bad)).toThrow('ASE duplicate cel');
    const truncated = Buffer.from(aseBytes); truncated.writeUInt16LE(7, 6);
    expect(() => decodeAse(truncated)).toThrow('ASE no trailing bytes');
  });
  it('retains independently frozen source-layer evidence even when a corrupted raw pixel is occluded', () => {
    const bad = decodeAse(aseBytes), outer = bad.cels.find(c => c.frame === 0 && c.layer === 1)!.image!.rgba;
    const inner = layerCanvas(bad, 0, 2); let p = 0;
    while (p < outer.length && !(outer[p + 3] && inner[p + 3])) p += 4;
    expect(p).toBeLessThan(outer.length); expect(outer.toString('hex', p, p + 3)).not.toBe('2c2330');
    outer.set([44, 35, 48, 255], p); validateSource(bad);
    expect(composite(bad, 0).equals(frames[0])).toBe(true);
    expect(() => layerWitness(bad)).toThrow('ASE frozen layer witness');
  });
  it('rejects real source soft alpha, changed cel origin and layer opacity even if hidden elsewhere', () => {
    const bad = decodeAse(aseBytes), anchor = bad.cels[0];
    anchor.image!.rgba[(8 * 160 + 8) * 4 + 3] = 128;
    expect(() => validateSource(bad)).toThrow('hard alpha');
    const moved = decodeAse(aseBytes); moved.cels[0].x = 1;
    expect(() => validateSource(moved)).toThrow('ASE cel origin');
    const faded = decodeAse(aseBytes); faded.layers[0].opacity = 254;
    expect(() => validateSource(faded)).toThrow('ASE layer profile');
  });
  it('does not mistake same-mask recoloring for the measured iris geometry change', () => {
    const closed = layerCanvas(source, 0, 3), recolored = Buffer.from(closed);
    for (let p = 0; p < recolored.length; p += 4) if (recolored[p + 3]) recolored.set([185, 144, 93], p);
    expect(difference(closed, recolored, true)).toBe(0);
    expect(difference(closed, recolored, true)).not.toBe(2370);
    expect(difference(closed, layerCanvas(source, 4, 3), true)).toBe(2370);
  });
});
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
    const bytes = file('../../assets/source/leviathan.aseprite'), badSize = Buffer.from(bytes), badCount = Buffer.from(bytes), badChunk = Buffer.from(bytes);
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
