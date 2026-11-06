import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
// Read-only ASE/PNG oracle; no game imports or art-writing path.
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
  need(Number.isInteger(x) && Number.isInteger(y), 'cel integer origin');
  for (let yy = 0; yy < image.height; yy++) for (let xx = 0; xx < image.width; xx++) {
    const at = (yy * image.width + xx) * 4, alpha = image.rgba[at + 3];
    need(alpha === 0 || alpha === 255, 'hard compositor alpha');
    if (!alpha) continue;
    const tx = x + xx, ty = y + yy;
    need(tx >= 0 && ty >= 0 && tx < target.width && ty < target.height, 'opaque cel clipped');
    image.rgba.copy(target.rgba, (ty * target.width + tx) * 4, at, at + 4);
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

export { file, hash, need, crc32, decodePng, crop, decodeAse, composite };
export type { Pixels, Rect, Layer, Cel, Native, Atlas };
