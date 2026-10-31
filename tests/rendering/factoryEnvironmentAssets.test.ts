import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// Native-file checks only, not browser admission or a production-renderer oracle.
// No production descriptor, generated reference image or provenance pass boolean.
interface Pixels { width: number; height: number; rgba: Buffer }
interface Rect { x: number; y: number; w: number; h: number }
interface TerrainExport {
  image: string; imageWidth: number; imageHeight: number;
  tileWidth: number; tileHeight: number; tileCount: number;
  columns: number; rows: number;
  map: { width: number; height: number; tiles: number[] };
}
interface PropsExport {
  frames: {
    filename: string; frame: Rect; rotated: boolean; trimmed: boolean;
    spriteSourceSize: Rect; sourceSize: { w: number; h: number }; duration: number;
  }[];
  meta: {
    image: string; size: { w: number; h: number }; scale: string; format: string;
    frameTags: { name: string; from: number; to: number; direction: string }[];
    layers: { name: string; opacity: number; blendMode: string }[];
  };
}
const bytes = (path: string) => readFileSync(new URL(path, import.meta.url));
const terrainMap = JSON.parse(bytes('../../public/game/factory-terrain.json').toString()) as TerrainExport;
const propsAtlas = JSON.parse(bytes('../../public/game/factory-props.json').toString()) as PropsExport;
const PALETTE = [
  '00000000', '2c2330ff', 'd97757ff', 'eaa083ff', 'b55a4aff',
  '783f4aff', 'f5e8c8ff', 'cbb696ff', '34354fff', '575c79ff',
  '858eb0ff', '9dded1ff', 'd9ffeaff', '0f191bff', '24423bff',
  '426b50ff', '8fa86bff', 'b9905dff', 'e5c386ff', '723f68ff',
] as const;
const ALLOWED = new Set<string>(PALETTE);
// SOURCE coordinates in the left8x4 mother grid, never packed ordinals.
const MASTER_ROWS = [
  ['protected-left', 'protected-middle', 'protected-right', 'protected-fill',
    'service-left', 'service-middle', 'service-right', 'service-fill'],
  ['floor-left', 'floor-middle', 'floor-right', 'floor-fill-a',
    'floor-fill-b', 'base-left', 'base-middle', 'base-right'],
  ['wall-a', 'wall-b', 'rail', 'rail-joint',
    'conduit', 'conduit-elbow', 'vent', 'panel'],
  ['clip-fill-a', 'clip-fill-b', 'clip-fill-c', 'clip-surface-a',
    'clip-surface-b', 'wall-left', 'wall-right', 'floor-fill-c'],
] as const;
type Role = typeof MASTER_ROWS[number][number];
const MOTHERS = MASTER_ROWS.flatMap((row, y) => row.map((role, x) => ({ role, x, y })));
const THIN: Role[] = [
  'protected-left', 'protected-middle', 'protected-right',
  'service-left', 'service-middle', 'service-right',
];
const SEAMS: readonly (readonly [Role, Role])[] = [
  ['clip-fill-a', 'clip-fill-b'], ['clip-fill-a', 'clip-fill-c'],
  ['wall-a', 'wall-b'],
];
const PROP_NAMES = [
  'wire-spool', 'clip-press', 'clip-hopper', 'service-cabinet',
  'conduit-junction', 'inspection-grille',
];
const PROP_CASES = PROP_NAMES.map((name, frame) => ({ name, frame }));
const PROP_BOUNDS = [
  [5, 9, 58, 61], [8, 6, 59, 61], [8, 6, 55, 61],
  [12, 5, 59, 61], [2, 0, 61, 63], [8, 7, 55, 61],
];

function decodePng(path: string): Pixels {
  const file = bytes(path);
  expect(file.length).toBeGreaterThanOrEqual(33);
  expect([...file.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(file.toString('ascii', 12, 16)).toBe('IHDR');
  expect([...file.subarray(24, 29)]).toEqual([8, 6, 0, 0, 0]);
  const width = file.readUInt32BE(16), height = file.readUInt32BE(20);
  expect(width).toBeGreaterThan(0); expect(height).toBeGreaterThan(0);
  const parts: Buffer[] = []; let offset = 8, ended = false;
  while (offset + 12 <= file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    expect(offset + length + 12).toBeLessThanOrEqual(file.length);
    if (type === 'IDAT') parts.push(file.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') { expect(length).toBe(0); ended = true; break; }
  }
  expect(ended).toBe(true); expect(offset).toBe(file.length);
  expect(parts.length).toBeGreaterThan(0);
  const raw = inflateSync(Buffer.concat(parts)), stride = width * 4;
  expect(raw.length).toBe(height * (stride + 1));
  const rgba = Buffer.alloc(width * height * 4);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const left = x >= 4 ? rgba[at - 4] : 0, up = y ? rgba[at - stride] : 0;
      const upperLeft = y && x >= 4 ? rgba[at - stride - 4] : 0;
      const prediction = [0, left, up, (left + up) >> 1, paeth(left, up, upperLeft)][filter];
      rgba[at] = (raw[y * (stride + 1) + 1 + x] + prediction) & 255;
    }
  }
  return { width, height, rgba };
}
function crop(image: Pixels, x: number, y: number, width: number, height: number): Buffer {
  expect([x, y, width, height].every(Number.isInteger)).toBe(true);
  expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
  expect(width).toBeGreaterThan(0); expect(height).toBeGreaterThan(0);
  expect(x + width).toBeLessThanOrEqual(image.width);
  expect(y + height).toBeLessThanOrEqual(image.height);
  const rgba = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) {
    const begin = ((y + row) * image.width + x) * 4;
    image.rgba.copy(rgba, row * width * 4, begin, begin + width * 4);
  }
  return rgba;
}
// Only invisible RGB under alpha0 is canonicalized; every visible RGBA byte is exact.
function visible(input: Buffer): Buffer {
  const result = Buffer.from(input);
  for (let p = 0; p < result.length; p += 4) {
    if (result[p + 3] !== 0 && result[p + 3] !== 255) throw Error('Soft alpha in native art');
    if (result[p + 3] === 0) result.fill(0, p, p + 4);
  }
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
interface TileGrid { width: number; height: number; ids: number[] }
interface AseCel {
  frame: number; layer: number; x: number; y: number; opacity: number; z: number;
  image?: Pixels; grid?: TileGrid; linked?: number;
}
interface AseTileset {
  id: number; flags: number; count: number; width: number; height: number;
  baseIndex: number; name: string; rgba: Buffer;
}
interface AseSource {
  width: number; height: number; frames: number; durations: number[];
  layers: AseLayer[]; cels: AseCel[]; tilesets: AseTileset[];
  paletteSizes: number[]; palette: Map<number, string>;
  tags: { name: string; from: number; to: number; direction: number }[];
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
    width: file.readUInt16LE(8), height: file.readUInt16LE(10),
    frames: file.readUInt16LE(6), durations: [], layers: [], cels: [], tilesets: [],
    paletteSizes: [], palette: new Map(), tags: [],
  };
  expect(result.frames).toBeGreaterThan(0);
  let offset = 128;
  for (let frame = 0; frame < result.frames; frame++) {
    expect(offset + 16).toBeLessThanOrEqual(file.length);
    const end = offset + file.readUInt32LE(offset);
    const count = file.readUInt32LE(offset + 12) || file.readUInt16LE(offset + 6);
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
            to: file.readUInt16LE(p + 2), direction: file[p + 4],
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
          opacity: file[start + 12], z: file.readInt16LE(start + 15),
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
          expect(file.readUInt16LE(start + 26)).toBe(32);
          const idMask = file.readUInt32LE(start + 28);
          const flipMask = (file.readUInt32LE(start + 32)
            | file.readUInt32LE(start + 36) | file.readUInt32LE(start + 40)) >>> 0;
          const raw = inflateSync(file.subarray(start + 54, stop));
          expect(raw.length).toBe(width * height * 4);
          const ids: number[] = [];
          for (let p = 0; p < raw.length; p += 4) {
            const word = raw.readUInt32LE(p), id = (word & idMask) >>> 0;
            expect((word & flipMask) >>> 0, 'authored pack has no flipped cells').toBe(0);
            expect(word, 'no unhandled tile flags').toBe(id); ids.push(id);
          }
          cel.grid = { width, height, ids };
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
    expect(cels.length).toBeLessThanOrEqual(1);
    if (!cels.length) continue;
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
const terrainImage = decodePng('../../public/game/factory-terrain.png');
const propsImage = decodePng('../../public/game/factory-props.png');
const terrainSource = decodeAse('../../assets/source/factory-tiles.aseprite');
const propsSource = decodeAse('../../assets/source/factory-props.aseprite');
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
function prop(frame: number): Pixels {
  const box = propsAtlas.frames[frame].frame;
  return { width: box.w, height: box.h,
    rgba: crop(propsImage, box.x, box.y, box.w, box.h) };
}

describe('factory terrain native files, not an engine-admission claim', () => {
  it('reads the actual packed6-column map and excludes four empty trailing slots', () => {
    expect(terrainMap).toMatchObject({
      image: 'factory-terrain.png', imageWidth: 96, imageHeight: 96,
      tileWidth: 16, tileHeight: 16, tileCount: 32, columns: 6, rows: 6,
    });
    expect([terrainImage.width, terrainImage.height]).toEqual([96, 96]);
    expect(terrainMap.map).toMatchObject({ width: 16, height: 8 });
    expect(terrainMap.map.tiles).toHaveLength(128);
    expect(terrainMap.map.tiles).toContain(0);
    expect(terrainMap.map.tiles.every(id => Number.isInteger(id) && id >= 0 && id <= 32)).toBe(true);
    expect([...new Set(terrainMap.map.tiles.filter(id => id !== 0))].sort((a, b) => a - b))
      .toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    for (let index = 32; index < 36; index++) {
      const rgba = crop(terrainImage, index % 6 * 16, Math.floor(index / 6) * 16, 16, 16);
      expect(statistics(rgba).area, 'unused packed slot ' + index).toBe(0);
    }
  });
  it('retains a native hidden raster mockup and a visible embedded tilemap, without references', () => {
    expect([terrainSource.width, terrainSource.height, terrainSource.frames]).toEqual([256, 128, 1]);
    expect(terrainSource.durations).toHaveLength(1);
    expect(terrainSource.durations[0]).toBeGreaterThan(0);
    sourceContract(terrainSource);
    expect(terrainSource.layers).toHaveLength(2);
    const raster = terrainSource.layers.filter(layer => layer.type === 0);
    const maps = terrainSource.layers.filter(layer => layer.type === 2);
    expect(raster).toHaveLength(1); expect(maps).toHaveLength(1);
    expect(raster[0].flags & 1).toBe(0); expect(maps[0].flags & 1).toBe(1);
    expect(terrainSource.tilesets).toHaveLength(1);
    const set = terrainSource.tilesets[0];
    expect([set.width, set.height, set.count]).toEqual([16, 16, 33]);
    expect(set.flags & 4, 'native tile0 is the empty tile').toBe(4);
    expect(statistics(set.rgba.subarray(0, 16 * 16 * 4)).area).toBe(0);
  });
  it('independently reconstructs native tilemap, hidden raster and exported PNG+map identically', () => {
    const nativeMaps = terrainSource.cels.filter(cel => cel.grid);
    expect(nativeMaps).toHaveLength(1);
    const cel = nativeMaps[0];
    expect(cel).toMatchObject({ frame: 0, x: 0, y: 0, opacity: 255, z: 0 });
    expect(cel.grid).toEqual({ width: 16, height: 8, ids: terrainMap.map.tiles });
    const raster = hiddenMockup();
    const nativeComposite = composite(terrainSource, 0);
    const exportComposite = exportedMap();
    expect([exportComposite.width, exportComposite.height]).toEqual([256, 128]);
    expect(visible(nativeComposite.rgba).equals(visible(raster.rgba))).toBe(true);
    expect(visible(exportComposite.rgba).equals(visible(raster.rgba))).toBe(true);
    expect(statistics(raster.rgba).area).toBeGreaterThan(20000);
  });
  it.each(MOTHERS)('maps source mother $role at ($x,$y) to its real packed slot', ({ role, x, y }) => {
    const id = terrainMap.map.tiles[y * terrainMap.map.width + x];
    expect(slot(role)).toBe(id - 1);
    const actual = tile(role).rgba;
    const original = crop(hiddenMockup(), x * 16, y * 16, 16, 16);
    expect(statistics(actual).area).toBeGreaterThan(0);
    expect(visible(actual).equals(visible(original))).toBe(true);
  });
  it('keeps all32 source mothers and packed tiles genuinely distinct', () => {
    const raster = hiddenMockup();
    const original = MOTHERS.map(({ x, y }) => visible(crop(raster, x * 16, y * 16, 16, 16)).toString('hex'));
    const packed = MOTHERS.map(({ role }) => visible(tile(role).rgba).toString('hex'));
    expect(new Set(original).size).toBe(32);
    expect(new Set(packed).size).toBe(32);
    expect(new Set(MOTHERS.map(({ role }) => slot(role))).size).toBe(32);
  });
  it('does not confuse semantic mother order with whole-mockup packing order', () => {
    expect(master('wall-a')).toMatchObject({ x: 0, y: 2 });
    expect(master('clip-fill-a')).toMatchObject({ x: 0, y: 3 });
    expect(master('floor-left')).toMatchObject({ x: 0, y: 1 });
    expect(slot('wall-a')).toBe(8);
    expect(slot('clip-fill-a')).toBe(9);
    expect(slot('floor-left')).toBe(10);
    expect(terrainMap.map.tiles[9]).toBe(9);
    expect(terrainMap.map.tiles[13]).toBe(10);
    expect(terrainMap.map.tiles[16]).toBe(11);
  });
  it.each(THIN)('%s is exactly12px opaque art plus4 transparent rows', role => {
    const rgba = tile(role).rgba;
    for (let y = 0; y < 16; y++) {
      const alphas = Array.from({ length: 16 }, (_, x) => rgba[(y * 16 + x) * 4 + 3]);
      expect(alphas).toEqual(Array(16).fill(y < 12 ? 255 : 0));
    }
    expect(statistics(rgba).area).toBe(16 * 12);
  });
  it.each(SEAMS)('%s and %s retain an identical outer2px RGBA seam', (first, second) => {
    const a = visible(tile(first).rgba), b = visible(tile(second).rgba);
    expect(a.equals(b), 'variants must not be duplicate tiles').toBe(false);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (x >= 2 && x < 14 && y >= 2 && y < 14) continue;
      const offset = (y * 16 + x) * 4;
      expect(a.subarray(offset, offset + 4).equals(b.subarray(offset, offset + 4))).toBe(true);
    }
  });
  it('uses12 opaque palette colors, hard alpha and no reserved hero-orange pixels', () => {
    const exported = statistics(terrainImage.rgba);
    const original = statistics(hiddenMockup().rgba);
    const native = statistics(composite(terrainSource, 0).rgba);
    expect(exported.colors.size).toBe(12);
    expect(original.colors.size).toBe(12); expect(native.colors.size).toBe(12);
    expect([...exported.colors].sort()).toEqual([...original.colors].sort());
    expect([...native.colors].sort()).toEqual([...original.colors].sort());
    expect([...exported.alphas].sort((a, b) => a - b)).toEqual([0, 255]);
  });
});

describe('factory static prop native files, not animation or runtime admission', () => {
  it('publishes six real untrimmed64px frames and six single-frame600ms tags', () => {
    expect([propsImage.width, propsImage.height]).toEqual([384, 64]);
    expect(propsAtlas.meta).toMatchObject({
      image: 'factory-props.png', format: 'RGBA8888', size: { w: 384, h: 64 }, scale: '1',
    });
    expect(propsAtlas.frames.map(frame => frame.filename))
      .toEqual(Array.from({ length: 6 }, (_, frame) => 'factory-props ' + frame + '.aseprite'));
    propsAtlas.frames.forEach((frame, index) => {
      expect(frame).toMatchObject({
        frame: { x: index * 64, y: 0, w: 64, h: 64 },
        trimmed: false, rotated: false, duration: 600,
        spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 }, sourceSize: { w: 64, h: 64 },
      });
    });
    const tags = propsAtlas.meta.frameTags.map(({ name, from, to, direction }) => ({ name, from, to, direction }));
    expect(tags).toEqual(PROP_NAMES.map((name, frame) => ({ name, from: frame, to: frame, direction: 'forward' })));
    expect(propsAtlas.meta.layers).toEqual(['housing', 'mechanism', 'details'].map(name => ({
      name, opacity: 255, blendMode: 'normal',
    })));
  });
  it('reads the actual three-layer source, durations and static tags without reference/sketch layers', () => {
    expect([propsSource.width, propsSource.height, propsSource.frames]).toEqual([64, 64, 6]);
    expect(propsSource.durations).toEqual(Array(6).fill(600));
    sourceContract(propsSource);
    expect(propsSource.layers.map(layer => layer.name)).toEqual(['housing', 'mechanism', 'details']);
    for (const layer of propsSource.layers) {
      expect(layer.type).toBe(0); expect(layer.flags & 1).toBe(1);
    }
    expect(propsSource.tilesets).toHaveLength(0);
    expect(propsSource.cels.every(cel => !!cel.image && !cel.grid)).toBe(true);
    expect([...propsSource.tags].sort((a, b) => a.from - b.from))
      .toEqual(PROP_NAMES.map((name, frame) => ({ name, from: frame, to: frame, direction: 0 })));
  });
  it.each(PROP_CASES)('$name native layer composite equals its exported PNG frame and inclusive bounds', ({ frame }) => {
    const original = composite(propsSource, frame), exported = prop(frame);
    expect(visible(original.rgba).equals(visible(exported.rgba))).toBe(true);
    expect(statistics(exported.rgba).area).toBeGreaterThan(0);
    expect(bounds(original.rgba, 64, 64)).toEqual(PROP_BOUNDS[frame]);
    expect(bounds(exported.rgba, 64, 64)).toEqual(PROP_BOUNDS[frame]);
  });
  it('uses exactly11 opaque colors across the six native props with hard alpha and hero orange reserved', () => {
    const exported = statistics(propsImage.rgba), original = new Set<string>();
    for (let frame = 0; frame < 6; frame++) {
      const data = statistics(composite(propsSource, frame).rgba);
      for (const value of data.colors) original.add(value);
    }
    expect(exported.colors.size).toBe(11); expect(original.size).toBe(11);
    expect([...exported.colors].sort()).toEqual([...original].sort());
    expect([...exported.alphas].sort((a, b) => a - b)).toEqual([0, 255]);
  });
  it('matches the conduit full top/bottom RGBA rows with only eight opaque columns', () => {
    const conduit = prop(4);
    expect(propsAtlas.meta.frameTags[4].name).toBe('conduit-junction');
    const top = crop(conduit, 0, 0, 64, 1), bottom = crop(conduit, 0, 63, 64, 1);
    expect(top.equals(bottom), 'the complete64px RGBA boundary, not an eight-pixel crop').toBe(true);
    expect(statistics(top).area).toBe(8); expect(statistics(bottom).area).toBe(8);
    const native = composite(propsSource, 4);
    expect(crop(native, 0, 0, 64, 1).equals(crop(native, 0, 63, 64, 1))).toBe(true);
  });
  it('keeps the six static machinery silhouettes as distinct real images', () => {
    const images = PROP_CASES.map(({ frame }) => visible(prop(frame).rgba).toString('hex'));
    expect(new Set(images).size).toBe(6);
  });
});
