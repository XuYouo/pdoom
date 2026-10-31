import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// Frozen terrain-source proof only; no props, production selector, renderer or admission oracle.
interface Pixels { width: number; height: number; rgba: Buffer }
interface TerrainExport {
  name: string; indexing: string; image: string; imageWidth: number; imageHeight: number;
  tileWidth: number; tileHeight: number; tileCount: number;
  columns: number; rows: number;
  map: { width: number; height: number; tiles: number[] };
}
const bytes = (path: string) => readFileSync(new URL(path, import.meta.url));
const PALETTE = [
  '00000000', '2c2330ff', 'd97757ff', 'eaa083ff', 'b55a4aff',
  '783f4aff', 'f5e8c8ff', 'cbb696ff', '34354fff', '575c79ff',
  '858eb0ff', '9dded1ff', 'd9ffeaff', '0f191bff', '24423bff',
  '426b50ff', '8fa86bff', 'b9905dff', 'e5c386ff', '723f68ff',
] as const;
const ALLOWED = new Set<string>(PALETTE);
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function decodePng(path: string): Pixels {
  const png = readFileSync(new URL(path, import.meta.url));
  expect(png.length).toBeGreaterThanOrEqual(33);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.toString('ascii', 12, 16)).toBe('IHDR');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  expect([png[24], png[25], png[26], png[27], png[28]]).toEqual([8, 6, 0, 0, 0]);
  expect(width).toBeGreaterThan(0); expect(height).toBeGreaterThan(0);
  const parts: Buffer[] = []; let offset = 8, ended = false;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    expect(offset + length + 12).toBeLessThanOrEqual(png.length);
    expect(png.readUInt32BE(offset + length + 8)).toBe(crc32(png.subarray(offset + 4, offset + length + 8)));
    if (type === 'IHDR') expect(length).toBe(13);
    if (type === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') { expect(length).toBe(0); ended = true; break; }
  }
  expect(ended).toBe(true); expect(offset).toBe(png.length); expect(parts.length).toBeGreaterThan(0);
  const raw = inflateSync(Buffer.concat(parts)), stride = width * 4, rgba = Buffer.alloc(width * height * 4);
  expect(raw.length).toBe(height * (stride + 1));
  const paeth = (a: number, b: number, c: number) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, left = x >= 4 ? rgba[index - 4] : 0, up = y ? rgba[index - stride] : 0, upperLeft = y && x >= 4 ? rgba[index - stride - 4] : 0;
      rgba[index] = (raw[y * (stride + 1) + 1 + x] + [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter]) & 255;
    }
  }
  return { width, height, rgba };
}
function crop(image: Pixels, x: number, y: number, width: number, height: number): Buffer {
  expect([x, y, width, height].every(Number.isInteger)).toBe(true);
  expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); expect(width).toBeGreaterThan(0); expect(height).toBeGreaterThan(0);
  expect(x + width).toBeLessThanOrEqual(image.width); expect(y + height).toBeLessThanOrEqual(image.height);
  const result = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) image.rgba.copy(result, row * width * 4, ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
  return result;
}
function statistics(rgba: Buffer) {
  const colors = new Set<string>(), alphas = new Set<number>(); let area = 0, orange = 0;
  for (let p = 0; p < rgba.length; p += 4) {
    const alpha = rgba[p + 3]; alphas.add(alpha);
    if (alpha !== 0 && alpha !== 255) throw Error('Soft alpha in source/export');
    if (!alpha) continue;
    const value = rgba.toString('hex', p, p + 4);
    if (!ALLOWED.has(value)) throw Error('Off-palette native pixel: ' + value);
    colors.add(value); area++; if (value === 'd97757ff') orange++;
  }
  expect(orange).toBe(0);
  return { colors, area, alphas };
}
function bounds(rgba: Buffer, width: number, height: number): number[] {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!rgba[(y * width + x) * 4 + 3]) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  expect(right).toBeGreaterThanOrEqual(left); expect(bottom).toBeGreaterThanOrEqual(top);
  return [left, top, right, bottom];
}

interface AseLayer {
  name: string; flags: number; type: number; level: number;
  blend: number; opacity: number; tilesetIndex?: number;
}
interface TileGrid { width: number; height: number; ids: number[]; bitsPerTile: number; idMask: number; xFlipMask: number; yFlipMask: number; diagonalMask: number }
interface AseCel {
  frame: number; layer: number; x: number; y: number; opacity: number; z: number;
  type: number; image?: Pixels; grid?: TileGrid; linked?: number;
}
interface AseTileset {
  id: number; flags: number; count: number; width: number; height: number;
  baseIndex: number; name: string; rgba: Buffer;
}
interface AseSource {
  flags: number; speed: number; frameHeaders: { legacy: number; modern: number; chunks: number }[];
  width: number; height: number; frames: number; durations: number[];
  layers: AseLayer[]; cels: AseCel[]; tilesets: AseTileset[];
  paletteSizes: number[]; palette: Map<number, string>;
  tags: { name: string; from: number; to: number; direction: number; repeats: number }[];
}
function aseString(file: Buffer, at: number, end: number) {
  expect(at + 2).toBeLessThanOrEqual(end);
  const stop = at + 2 + file.readUInt16LE(at);
  expect(stop).toBeLessThanOrEqual(end);
  return { text: file.toString('utf8', at + 2, stop), next: stop };
}

function decodeAse(path: string): AseSource {
  const file = bytes(path);
  expect(file.length).toBeGreaterThanOrEqual(128);
  expect(file.readUInt32LE(0)).toBe(file.length);
  expect(file.readUInt16LE(4)).toBe(0xa5e0);
  expect(file.readUInt16LE(12)).toBe(32);
  const result: AseSource = {
    flags: file.readUInt32LE(14), speed: file.readUInt16LE(18), frameHeaders: [],
    width: file.readUInt16LE(8), height: file.readUInt16LE(10),
    frames: file.readUInt16LE(6), durations: [], layers: [], cels: [], tilesets: [],
    paletteSizes: [], palette: new Map(), tags: [],
  };
  expect(result.frames).toBeGreaterThan(0);
  let offset = 128;
  for (let frame = 0; frame < result.frames; frame++) {
    expect(offset + 16).toBeLessThanOrEqual(file.length);
    const end = offset + file.readUInt32LE(offset);
    const legacy = file.readUInt16LE(offset + 6), modern = file.readUInt32LE(offset + 12);
    const count = legacy === 65535 ? modern : legacy; if (modern) expect(modern).toBe(count);
    result.frameHeaders.push({ legacy, modern, chunks: count });
    expect(file.readUInt16LE(offset + 4)).toBe(0xf1fa);
    expect(end).toBeGreaterThanOrEqual(offset + 16);
    expect(end).toBeLessThanOrEqual(file.length);
    result.durations.push(file.readUInt16LE(offset + 8));
    let start = offset + 16;
    for (let chunk = 0; chunk < count; chunk++) {
      expect(start + 6).toBeLessThanOrEqual(end);
      const length = file.readUInt32LE(start), type = file.readUInt16LE(start + 4);
      const stop = start + length;
      expect(length).toBeGreaterThanOrEqual(6);
      expect(stop).toBeLessThanOrEqual(end);
      if (type === 0x2004) {
        expect(length).toBeGreaterThanOrEqual(24);
        const name = aseString(file, start + 22, stop);
        const layer: AseLayer = {
          name: name.text, flags: file.readUInt16LE(start + 6),
          type: file.readUInt16LE(start + 8), level: file.readUInt16LE(start + 10),
          blend: file.readUInt16LE(start + 16), opacity: file[start + 18],
        };
        if (layer.type === 2) {
          expect(name.next + 4).toBeLessThanOrEqual(stop);
          layer.tilesetIndex = file.readUInt32LE(name.next);
        }
        result.layers.push(layer);
      }
      if (type === 0x2019) {
        expect(length).toBeGreaterThanOrEqual(26);
        const size = file.readUInt32LE(start + 6);
        const first = file.readUInt32LE(start + 10), last = file.readUInt32LE(start + 14);
        expect(first).toBeLessThanOrEqual(last); expect(last).toBeLessThan(size);
        result.paletteSizes.push(size);
        let p = start + 26;
        for (let index = first; index <= last; index++) {
          expect(p + 6).toBeLessThanOrEqual(stop);
          const flags = file.readUInt16LE(p);
          result.palette.set(index, file.toString('hex', p + 2, p + 6)); p += 6;
          if (flags & 1) p = aseString(file, p, stop).next;
        }
        expect(p).toBe(stop);
      }
      if (type === 0x2018) {
        expect(length).toBeGreaterThanOrEqual(16);
        const tags = file.readUInt16LE(start + 6); let p = start + 16;
        for (let index = 0; index < tags; index++) {
          expect(p + 19).toBeLessThanOrEqual(stop);
          const name = aseString(file, p + 17, stop);
          result.tags.push({
            name: name.text, from: file.readUInt16LE(p),
            to: file.readUInt16LE(p + 2), direction: file[p + 4], repeats: file.readUInt16LE(p + 5),
          });
          p = name.next;
        }
        expect(p).toBe(stop);
      }
      if (type === 0x2023) {
        // Embedded RGBA tileset, stacked vertically, including tile0.
        expect(length).toBeGreaterThanOrEqual(40);
        const flags = file.readUInt32LE(start + 10);
        expect(flags & 1, 'source must not depend on an external tileset').toBe(0);
        expect(flags & 2, 'embedded native tileset pixels').toBe(2);
        const name = aseString(file, start + 38, stop);
        expect(name.next + 4).toBeLessThanOrEqual(stop);
        const compressedLength = file.readUInt32LE(name.next);
        const imageStart = name.next + 4;
        expect(imageStart + compressedLength).toBe(stop);
        const set: AseTileset = {
          id: file.readUInt32LE(start + 6), flags,
          count: file.readUInt32LE(start + 14),
          width: file.readUInt16LE(start + 18), height: file.readUInt16LE(start + 20),
          baseIndex: file.readInt16LE(start + 22), name: name.text,
          rgba: inflateSync(file.subarray(imageStart, stop)),
        };
        expect(set.count).toBeGreaterThan(0);
        expect(set.width).toBeGreaterThan(0); expect(set.height).toBeGreaterThan(0);
        expect(set.rgba.length).toBe(set.count * set.width * set.height * 4);
        result.tilesets.push(set);
      }
      if (type === 0x2005) {
        expect(length).toBeGreaterThanOrEqual(24);
        const celType = file.readUInt16LE(start + 13);
        expect([0, 1, 2, 3]).toContain(celType);
        const cel: AseCel = {
          frame, layer: file.readUInt16LE(start + 6),
          x: file.readInt16LE(start + 8), y: file.readInt16LE(start + 10),
          opacity: file[start + 12], z: file.readInt16LE(start + 15), type: celType,
        };
        if (celType === 1) {
          const linked = file.readUInt16LE(start + 22);
          expect(linked).toBeLessThan(frame);
          const previous = result.cels.find(value => value.frame === linked && value.layer === cel.layer);
          if (!previous) throw Error('Invalid linked native cel');
          cel.linked = linked; cel.image = previous.image; cel.grid = previous.grid;
        } else if (celType === 0 || celType === 2) {
          expect(length).toBeGreaterThanOrEqual(26);
          const width = file.readUInt16LE(start + 22), height = file.readUInt16LE(start + 24);
          const payload = file.subarray(start + 26, stop);
          const rgba = celType === 2 ? inflateSync(payload) : Buffer.from(payload);
          expect(rgba.length).toBe(width * height * 4);
          cel.image = { width, height, rgba };
        } else {
          expect(length).toBeGreaterThanOrEqual(54);
          const width = file.readUInt16LE(start + 22), height = file.readUInt16LE(start + 24);
          const bitsPerTile = file.readUInt16LE(start + 26); expect(bitsPerTile).toBe(32);
          const idMask = file.readUInt32LE(start + 28);
          const xFlipMask = file.readUInt32LE(start + 32), yFlipMask = file.readUInt32LE(start + 36), diagonalMask = file.readUInt32LE(start + 40);
          const flipMask = (xFlipMask | yFlipMask | diagonalMask) >>> 0;
          const raw = inflateSync(file.subarray(start + 54, stop));
          expect(raw.length).toBe(width * height * 4);
          const ids: number[] = [];
          for (let p = 0; p < raw.length; p += 4) {
            const word = raw.readUInt32LE(p), id = (word & idMask) >>> 0;
            expect((word & flipMask) >>> 0, 'authored pack has no flipped cells').toBe(0);
            expect(word, 'no unhandled tile flags').toBe(id); ids.push(id);
          }
          cel.grid = { width, height, ids, bitsPerTile, idMask, xFlipMask, yFlipMask, diagonalMask };
        }
        result.cels.push(cel);
      }
      start = stop;
    }
    expect(start).toBe(end); offset = end;
  }
  expect(offset).toBe(file.length);
  return result;
}

function paint(target: Pixels, image: Pixels, x: number, y: number) {
  expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
  expect(x + image.width).toBeLessThanOrEqual(target.width);
  expect(y + image.height).toBeLessThanOrEqual(target.height);
  for (let yy = 0; yy < image.height; yy++) for (let xx = 0; xx < image.width; xx++) {
    const from = (yy * image.width + xx) * 4, alpha = image.rgba[from + 3];
    if (alpha !== 0 && alpha !== 255) throw Error('Soft-alpha cel requires a different compositor');
    if (alpha) image.rgba.copy(target.rgba, ((y + yy) * target.width + x + xx) * 4, from, from + 4);
  }
}
function composite(source: AseSource, frame: number, selected?: readonly number[]): Pixels {
  const target: Pixels = {
    width: source.width, height: source.height,
    rgba: Buffer.alloc(source.width * source.height * 4),
  };
  const indices = selected ?? source.layers.flatMap((layer, index) => layer.flags & 1 ? [index] : []);
  for (const layerIndex of indices) {
    const layer = source.layers[layerIndex];
    expect(layer).toBeDefined(); expect(layer.level).toBe(0);
    expect(layer.opacity).toBe(255); expect(layer.blend).toBe(0);
    const cels = source.cels.filter(cel => cel.frame === frame && cel.layer === layerIndex);
    expect(cels).toHaveLength(1);
    const cel = cels[0]; expect(cel.opacity).toBe(255); expect(cel.z).toBe(0);
    if (cel.image) {
      expect(layer.type).toBe(0); paint(target, cel.image, cel.x, cel.y);
    } else {
      expect(layer.type).toBe(2); expect(cel.grid).toBeDefined();
      expect(layer.tilesetIndex).toBeDefined();
      const set = source.tilesets[layer.tilesetIndex!];
      expect(set).toBeDefined(); expect(set.flags & 4).toBe(4);
      const grid = cel.grid!, tileBytes = set.width * set.height * 4;
      for (let row = 0; row < grid.height; row++) for (let col = 0; col < grid.width; col++) {
        const id = grid.ids[row * grid.width + col];
        expect(id).toBeGreaterThanOrEqual(0); expect(id).toBeLessThan(set.count);
        if (id === 0) continue;
        const image = {
          width: set.width, height: set.height,
          rgba: set.rgba.subarray(id * tileBytes, (id + 1) * tileBytes),
        };
        paint(target, image, cel.x + col * set.width, cel.y + row * set.height);
      }
    }
  }
  return target;
}
function sourceContract(source: AseSource) {
  expect(source.paletteSizes.length).toBeGreaterThan(0);
  expect(source.paletteSizes.every(size => size === 20)).toBe(true);
  expect(Array.from({ length: 20 }, (_, index) => source.palette.get(index))).toEqual([...PALETTE]);
  for (const layer of source.layers) {
    expect(layer.name).not.toMatch(/reference|sketch/i);
    expect(layer.flags & 64, 'no Aseprite reference layer').toBe(0);
    expect(layer.level).toBe(0); expect(layer.blend).toBe(0); expect(layer.opacity).toBe(255);
  }
  for (const cel of source.cels) {
    expect(cel.layer).toBeLessThan(source.layers.length);
    expect(cel.opacity).toBe(255); expect(cel.z).toBe(0);
    if (cel.image) statistics(cel.image.rgba);
  }
  for (const set of source.tilesets) statistics(set.rgba);
}

// Role coordinates describe the SOURCE mother grid, never packed ordinals.
const MASTER_ROWS = [
  ['floor-top-a', 'floor-top-b', 'floor-body-a', 'floor-body-b', 'floor-foot', 'rack-header-mid', 'ledge-left', 'ledge-mid'],
  ['ledge-right', 'lift-left', 'lift-mid', 'lift-right', 'grate-top', 'grate-body', 'bulkhead-a', 'bulkhead-b'],
  ['rack-left', 'rack-right', 'rack-header-left', 'rack-header-right', 'rack-foot-left', 'rack-foot-right', 'conduit-v', 'conduit-h'],
  ['conduit-elbow', 'conduit-tee', 'service-panel', 'rack-foot-mid', 'candle-a', 'candle-b', 'ceiling-left', 'ceiling-right'],
] as const;
type Role = typeof MASTER_ROWS[number][number];
const MOTHERS = MASTER_ROWS.flatMap((row, y) => row.map((role, x) => ({ role, x, y })));
const H_SEAMS = [
  ['floor-top-a', 'floor-top-a'],
  ['floor-top-a', 'floor-top-b'],
  ['floor-top-b', 'floor-top-a'],
  ['floor-top-b', 'floor-top-b'],
  ['floor-body-a', 'floor-body-a'],
  ['floor-body-a', 'floor-body-b'],
  ['floor-body-b', 'floor-body-a'],
  ['floor-body-b', 'floor-body-b'],
  ['bulkhead-a', 'bulkhead-a'],
  ['bulkhead-a', 'bulkhead-b'],
  ['bulkhead-b', 'bulkhead-a'],
  ['bulkhead-b', 'bulkhead-b'],
  ['candle-a', 'candle-a'],
  ['candle-a', 'candle-b'],
  ['candle-b', 'candle-a'],
  ['candle-b', 'candle-b'],
  ['ledge-left', 'ledge-mid'],
  ['lift-left', 'lift-mid'],
  ['rack-header-left', 'rack-header-mid'],
  ['rack-foot-left', 'rack-foot-mid'],
  ['ledge-mid', 'ledge-right'],
  ['lift-mid', 'lift-right'],
  ['rack-header-mid', 'rack-header-right'],
  ['rack-foot-mid', 'rack-foot-right'],
  ['rack-left', 'bulkhead-a'],
  ['bulkhead-a', 'rack-right'],
  ['floor-foot', 'floor-foot'],
  ['conduit-h', 'conduit-h'],
  ['conduit-elbow', 'conduit-h'],
  ['conduit-tee', 'conduit-h'],
  ['ledge-mid', 'ledge-mid'],
  ['lift-mid', 'lift-mid'],
  ['rack-header-mid', 'rack-header-mid'],
  ['rack-foot-mid', 'rack-foot-mid'],
] as const;
const V_SEAMS = [
  ['rack-header-left', 'rack-left'],
  ['rack-left', 'rack-foot-left'],
  ['rack-header-right', 'rack-right'],
  ['rack-right', 'rack-foot-right'],
  ['rack-header-mid', 'bulkhead-a'],
  ['bulkhead-a', 'rack-foot-mid'],
  ['grate-top', 'grate-body'],
  ['conduit-v', 'conduit-v'],
  ['floor-body-a', 'floor-body-a'],
  ['floor-body-a', 'floor-body-b'],
  ['floor-body-b', 'floor-body-a'],
  ['floor-body-b', 'floor-body-b'],
  ['bulkhead-a', 'bulkhead-a'],
  ['bulkhead-a', 'bulkhead-b'],
  ['bulkhead-b', 'bulkhead-a'],
  ['bulkhead-b', 'bulkhead-b'],
  ['candle-a', 'candle-a'],
  ['candle-a', 'candle-b'],
  ['candle-b', 'candle-a'],
  ['candle-b', 'candle-b'],
  ['floor-top-a', 'floor-body-a'],
  ['floor-top-a', 'floor-body-b'],
  ['floor-top-b', 'floor-body-a'],
  ['floor-top-b', 'floor-body-b'],
  ['floor-body-a', 'floor-foot'],
  ['floor-body-b', 'floor-foot'],
  ['conduit-v', 'conduit-elbow'],
  ['conduit-v', 'conduit-tee'],
  ['conduit-tee', 'conduit-v'],
  ['grate-body', 'grate-body'],
] as const;
const VARIANTS = [
  ['floor-top-a', 'floor-top-b'],
  ['floor-body-a', 'floor-body-b'],
  ['bulkhead-a', 'bulkhead-b'],
  ['candle-a', 'candle-b'],
] as const;
const THIN: readonly Role[] = ['ledge-left', 'ledge-mid', 'ledge-right', 'lift-left', 'lift-mid', 'lift-right'];
const EXPECTED_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 0, 9, 9, 9, 0, 3, 3, 3, 10, 11, 12, 13, 14, 15, 9, 16, 0, 9, 16, 9, 0, 3, 4, 3, 17, 18, 19, 20, 21, 22, 23, 24, 0, 9, 9, 9, 0, 3, 3, 3, 25, 26, 27, 28, 29, 30, 31, 32, 0, 0, 0, 0, 0, 0, 0, 0, 7, 8, 8, 10, 11, 12, 12, 13, 0, 29, 29, 29, 0, 19, 6, 20, 1, 2, 1, 2, 14, 14, 1, 2, 0, 29, 30, 29, 0, 17, 9, 18, 3, 4, 3, 4, 15, 15, 3, 4, 0, 29, 29, 29, 0, 21, 28, 22, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0];
const EXPECTED_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 8, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];
const OPAQUE_COLORS = ['0f191bff', '24423bff', '34354fff', '426b50ff', '575c79ff', '858eb0ff', '8fa86bff', 'b9905dff'];
const terrainMap = JSON.parse(bytes('../../public/game/furnace-terrain.json').toString()) as TerrainExport;
const terrainImage = decodePng('../../public/game/furnace-terrain.png');
const terrainSource = decodeAse('../../assets/source/furnace-tiles.aseprite');
function master(role: Role) {
  const cell = MOTHERS.find(value => value.role === role);
  if (!cell) throw Error('Unknown mother-cell role: ' + role);
  return cell;
}
function slot(role: Role): number {
  const cell = master(role);
  const index = terrainMap.map.tiles[cell.y * terrainMap.map.width + cell.x];
  expect(index).toBeGreaterThan(0); expect(index).toBeLessThanOrEqual(terrainMap.tileCount);
  return index - 1;
}
function packedTile(index: number): Pixels {
  expect(Number.isInteger(index)).toBe(true);
  expect(index).toBeGreaterThanOrEqual(0); expect(index).toBeLessThan(terrainMap.tileCount);
  return {
    width: 16, height: 16,
    rgba: crop(terrainImage, index % terrainMap.columns * 16,
      Math.floor(index / terrainMap.columns) * 16, 16, 16),
  };
}
function tile(role: Role) { return packedTile(slot(role)); }
function exportedMap(): Pixels {
  const map = terrainMap.map;
  const result = { width: map.width * 16, height: map.height * 16,
    rgba: Buffer.alloc(map.width * map.height * 16 * 16 * 4) };
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const id = map.tiles[y * map.width + x];
    if (id !== 0) paint(result, packedTile(id - 1), x * 16, y * 16);
  }
  return result;
}
function hiddenMockup(): Pixels {
  const layers = terrainSource.layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.type === 0 && !(layer.flags & 1));
  expect(layers).toHaveLength(1);
  return composite(terrainSource, 0, [layers[0].index]);
}
const nativeImage = composite(terrainSource, 0);
const mockup = hiddenMockup();
const reconstruction = exportedMap();
function boundary(role: Role, side: 'left' | 'right' | 'top' | 'bottom'): Buffer {
  const image = tile(role);
  if (side === 'left' || side === 'right') return crop(image, side === 'left' ? 0 : 15, 0, 1, 16);
  return crop(image, 0, side === 'top' ? 0 : 15, 16, 1);
}
function border(role: Role): Buffer {
  const image = tile(role);
  return Buffer.concat([crop(image, 0, 0, 16, 2), crop(image, 0, 14, 16, 2), crop(image, 0, 2, 2, 12), crop(image, 14, 2, 2, 12)]);
}
const REPEATS = [
  { name: 'bulkhead', x: 9, y: 0, roles: ['bulkhead-a', 'bulkhead-a', 'bulkhead-a', 'bulkhead-a', 'bulkhead-b', 'bulkhead-a', 'bulkhead-a', 'bulkhead-a', 'bulkhead-a'] },
  { name: 'floor body', x: 13, y: 0, roles: ['floor-body-a', 'floor-body-a', 'floor-body-a', 'floor-body-a', 'floor-body-b', 'floor-body-a', 'floor-body-a', 'floor-body-a', 'floor-body-a'] },
  { name: 'candle', x: 9, y: 4, roles: ['candle-a', 'candle-a', 'candle-a', 'candle-a', 'candle-b', 'candle-a', 'candle-a', 'candle-a', 'candle-a'] },
  { name: 'rack corners', x: 13, y: 4, roles: ['rack-header-left', 'rack-header-mid', 'rack-header-right', 'rack-left', 'bulkhead-a', 'rack-right', 'rack-foot-left', 'rack-foot-mid', 'rack-foot-right'] },
] as const;

describe('Furnace terrain native files, not props, renderer integration or game admission', () => {
  it('reads the exact six-column32-tile export and four truly empty trailing slots', () => {
    expect(terrainMap).toMatchObject({ name: 'furnace-terrain', image: 'furnace-terrain.png', imageWidth: 96, imageHeight: 96, tileWidth: 16, tileHeight: 16, tileCount: 32, columns: 6, rows: 6 });
    expect([terrainImage.width, terrainImage.height]).toEqual([96, 96]);
    expect(terrainMap.indexing).toContain('0 means empty'); expect(terrainMap.indexing).toContain('N-1');
    for (let index = 32; index < 36; index++) expect(crop(terrainImage, index % 6 * 16, Math.floor(index / 6) * 16, 16, 16)).toEqual(Buffer.alloc(1024));
  });
  it('reads actual RGB32 file/frame headers, palette and the single static source tag', () => {
    expect([terrainSource.width, terrainSource.height, terrainSource.frames, terrainSource.flags, terrainSource.speed]).toEqual([256, 128, 1, 1, 100]);
    expect(terrainSource.frameHeaders).toEqual([{ legacy: 43, modern: 43, chunks: 43 }]); expect(terrainSource.durations).toEqual([100]);
    expect(terrainSource.tags).toEqual([{ name: 'terrain-mockup', from: 0, to: 0, direction: 0, repeats: 0 }]);
    expect(terrainSource.paletteSizes).toEqual([20]); sourceContract(terrainSource);
  });
  it('retains a hidden raster and a visible real tilemap, with both native cels and no external dependency', () => {
    expect(terrainSource.layers).toEqual([
      { name: 'mockup', flags: 2, type: 0, level: 0, blend: 0, opacity: 255 },
      { name: 'terrain', flags: 3, type: 2, level: 0, blend: 0, opacity: 255, tilesetIndex: 0 },
    ]);
    expect(terrainSource.cels).toHaveLength(2);
    expect(terrainSource.cels.map(({ frame, layer, type, x, y, z, opacity, linked }) => [frame, layer, type, x, y, z, opacity, linked])).toEqual([[0, 0, 2, 0, 0, 0, 255, undefined], [0, 1, 3, 0, 0, 0, 255, undefined]]);
    expect(terrainSource.cels[0].image).toMatchObject({ width: 256, height: 128 });
    expect(terrainSource.tilesets).toHaveLength(1); expect(terrainSource.tilesets[0]).toMatchObject({ id: 0, flags: 6, count: 33, width: 16, height: 16, baseIndex: 1, name: '' });
    expect(terrainSource.tilesets[0].rgba.subarray(0, 1024)).toEqual(Buffer.alloc(1024));
  });
  it('decodes actual32bit tile records, the exact ID/flip masks and all128 grid cells', () => {
    expect(terrainMap.map).toEqual({ width: 16, height: 8, tiles: EXPECTED_IDS });
    expect(terrainSource.cels[1].grid).toEqual({ width: 16, height: 8, ids: EXPECTED_IDS, bitsPerTile: 32, idMask: 0x1fffffff, xFlipMask: 0x80000000, yFlipMask: 0x40000000, diagonalMask: 0x20000000 });
    expect(EXPECTED_IDS.filter(id => id !== 0)).toHaveLength(100); expect(new Set(EXPECTED_IDS).size).toBe(33);
  });
  it('independently reconstructs the full native tilemap, raw hidden raster and PNG+JSON map exactly', () => {
    expect([reconstruction.width, reconstruction.height]).toEqual([256, 128]);
    expect(nativeImage.rgba.equals(mockup.rgba)).toBe(true); expect(reconstruction.rgba.equals(mockup.rgba)).toBe(true);
    expect(terrainSource.cels[0].image!.rgba.equals(mockup.rgba)).toBe(true);
    expect(statistics(nativeImage.rgba).area).toBe(23310);
  });
  it.each(MOTHERS)('mother $role at($x,$y) is exact source RGBA, exact embedded tile and exact packed slot', ({ role, x, y }) => {
    const ordinal = y * 8 + x, index = slot(role), actual = tile(role).rgba; expect(index).toBe(EXPECTED_SLOTS[ordinal]);
    expect(actual).toEqual(crop(mockup, x * 16, y * 16, 16, 16));
    expect(actual).toEqual(terrainSource.tilesets[0].rgba.subarray((index + 1) * 1024, (index + 2) * 1024));
    expect(statistics(actual).area).toBeGreaterThan(0);
  });
  it('has32 genuinely different mother tiles and covers every nonempty packed slot exactly once', () => {
    expect(new Set(MOTHERS.map(({ role }) => tile(role).rgba.toString('hex'))).size).toBe(32);
    expect(MOTHERS.map(({ role }) => slot(role)).sort((a, b) => a - b)).toEqual(Array.from({ length: 32 }, (_, i) => i));
  });
  it('does not mistake source mother order for the actual pack traversal', () => {
    expect(master('bulkhead-a')).toEqual({ role: 'bulkhead-a', x: 6, y: 1 });
    expect(slot('bulkhead-a')).toBe(8); expect(slot('ledge-right')).toBe(9); expect(terrainMap.map.tiles[9]).toBe(9); expect(terrainMap.map.tiles[16]).toBe(10);
    expect(tile('bulkhead-a').rgba).not.toEqual(tile('ledge-right').rgba);
  });
  it('uses exactly eight opaque shared-palette colors, hard alpha and zero hero-orange in source and export', () => {
    for (const rgba of [terrainImage.rgba, nativeImage.rgba, mockup.rgba, terrainSource.tilesets[0].rgba]) {
      const data = statistics(rgba); expect([...data.colors].sort()).toEqual(OPAQUE_COLORS); expect([...data.alphas].sort((a, b) => a - b)).toEqual([0, 255]);
    }
    expect(statistics(terrainImage.rgba).area).toBe(7438);
  });
  it.each(THIN)('%s is exactly12 opaque rows plus4 transparent rows, not a16px collision surrogate', role => {
    const data = tile(role); expect(bounds(data.rgba, 16, 16)).toEqual([0, 0, 15, 11]); expect(statistics(data.rgba).area).toBe(192);
    for (let y = 0; y < 16; y++) expect(Array.from({ length: 16 }, (_, x) => data.rgba[(y * 16 + x) * 4 + 3])).toEqual(Array(16).fill(y < 12 ? 255 : 0));
  });
  it('stores an8px-ink floor foot so two full rows plus the foot cover40px, not48px', () => {
    const data = tile('floor-foot'); expect(bounds(data.rgba, 16, 16)).toEqual([0, 0, 15, 7]); expect(statistics(data.rgba).area).toBe(128);
    expect(crop(data, 0, 8, 16, 8)).toEqual(Buffer.alloc(16 * 8 * 4));
  });
  it.each([{ name: 'ledge', x: 0 }, { name: 'lift', x: 64 }])('authored $name sample at y64 is64x12 with a4px air gap', ({ name, x }) => {
    const sample = crop(nativeImage, x, 64, 64, 16); expect(bounds(sample, 64, 16)).toEqual([0, 0, 63, 11]); expect(statistics(sample).area).toBe(64 * 12);
    const roles = (name === 'ledge' ? ['ledge-left', 'ledge-mid', 'ledge-mid', 'ledge-right'] : ['lift-left', 'lift-mid', 'lift-mid', 'lift-right']) as Role[];
    roles.forEach((role, i) => expect(crop(nativeImage, x + i * 16, 64, 16, 16)).toEqual(tile(role).rgba));
    expect(crop(nativeImage, x, 76, 64, 4)).toEqual(Buffer.alloc(64 * 4 * 4));
  });
  it('authors an exact128x40 solid from y80 through119, with flush grilles and no opaque ink below', () => {
    const data = crop(nativeImage, 0, 80, 128, 48); expect(bounds(data, 128, 48)).toEqual([0, 0, 127, 39]); expect(statistics(data).area).toBe(128 * 40);
    for (let y = 0; y < 48; y++) expect(Array.from({ length: 128 }, (_, x) => data[(y * 128 + x) * 4 + 3])).toEqual(Array(128).fill(y < 40 ? 255 : 0));
    for (const x of [64, 80]) { expect(crop(nativeImage, x, 80, 16, 16)).toEqual(tile('grate-top').rgba); expect(crop(nativeImage, x, 96, 16, 16)).toEqual(tile('grate-body').rgba); }
  });
  it.each(VARIANTS)('%s and %s differ inside but preserve every outer2px RGBA byte', (a, b) => {
    expect(tile(a).rgba).not.toEqual(tile(b).rgba); expect(border(a)).toEqual(border(b));
  });
  it.each(H_SEAMS)('allowed horizontal join %s -> %s has identical boundary RGBA', (a, b) => {
    expect(boundary(a, 'right')).toEqual(boundary(b, 'left'));
  });
  it.each(V_SEAMS)('allowed vertical join %s -> %s has identical boundary RGBA', (a, b) => {
    expect(boundary(a, 'bottom')).toEqual(boundary(b, 'top'));
  });
  it('keeps the tee right-facing and elbow top-to-right instead of pretending closed sides are connectors', () => {
    expect(boundary('conduit-h', 'right')).not.toEqual(boundary('conduit-tee', 'left'));
    expect(boundary('conduit-elbow', 'bottom')).not.toEqual(boundary('conduit-v', 'top'));
  });
  it.each(REPEATS)('rebuilds the authored3x3 $name proof from actual source roles at($x,$y)', ({ x, y, roles }) => {
    const sample: Pixels = { width: 48, height: 48, rgba: Buffer.alloc(48 * 48 * 4) };
    roles.forEach((role, i) => paint(sample, tile(role), i % 3 * 16, Math.floor(i / 3) * 16));
    expect(sample.rgba).toEqual(crop(nativeImage, x * 16, y * 16, 48, 48));
    expect(sample.rgba).toEqual(crop(mockup, x * 16, y * 16, 48, 48));
  });
  it('honors hidden-layer visibility even if an in-memory mockup copy is deliberately poisoned in an empty gutter', () => {
    const cel = terrainSource.cels[0], image = cel.image!; const changed = Buffer.from(image.rgba);
    expect(terrainMap.map.tiles[8]).toBe(0); Buffer.from('0f191bff', 'hex').copy(changed, 128 * 4);
    const altered: AseSource = { ...terrainSource, cels: [{ ...cel, image: { ...image, rgba: changed } }, terrainSource.cels[1]] };
    expect(composite(altered, 0).rgba.equals(nativeImage.rgba)).toBe(true);
    expect(composite(altered, 0, [0, 1]).rgba.equals(nativeImage.rgba)).toBe(false);
    expect(statistics(composite(altered, 0, [0, 1]).rgba).area).toBe(23311);
  });
  it('excludes alpha0 RGB payload from palette and hero-orange usage', () => {
    const data = statistics(Buffer.from('d977570012345600', 'hex')); expect(data.area).toBe(0); expect(data.colors.size).toBe(0); expect([...data.alphas]).toEqual([0]);
  });
});
