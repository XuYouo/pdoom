import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CHAPTER } from '../../src/pages/GamePage/game/data/chapterOne';
import { ENVIRONMENT_ASSETS, ENVIRONMENT_BINDING, ENVIRONMENT_MUSHROOM_PIVOT, ENVIRONMENT_PROP_ROLES, ENVIRONMENT_PROP_SIZE, ENVIRONMENT_TILE_ROLES, ENVIRONMENT_TILE_SIZE, type EnvironmentPropRole, type EnvironmentTileRole } from '../../src/pages/GamePage/game/data/environmentAssets';

interface Pixels { width: number; height: number; rgba: Buffer }
interface TerrainExport {
  image: string; imageWidth: number; imageHeight: number; tileWidth: number; tileHeight: number;
  tileCount: number; columns: number; rows: number; map: { width: number; height: number; tiles: number[] };
}
interface PropsExport {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; rotated: boolean; trimmed: boolean; spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; format: string; size: { w: number; h: number }; scale: string; frameTags: { name: string; from: number; to: number; direction: string }[]; layers: { name: string; opacity: number; blendMode: string }[] };
}
const terrainMap = () => JSON.parse(readFileSync(new URL('../../public/game/chapter-one-terrain.json', import.meta.url), 'utf8')) as TerrainExport;
const propsAtlas = () => JSON.parse(readFileSync(new URL('../../public/game/chapter-one-props.json', import.meta.url), 'utf8')) as PropsExport;

// Local read-only RGBA PNG decoder, adapted from gatoSprites.test.ts. No image dependency or output file.
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
let cachedTerrain: Pixels | undefined, cachedProps: Pixels | undefined;
const terrainPixels = () => cachedTerrain ??= decodePng('../../public/game/chapter-one-terrain.png');
const propsPixels = () => cachedProps ??= decodePng('../../public/game/chapter-one-props.png');
function crop(image: Pixels, x: number, y: number, width: number, height: number): Buffer {
  expect([x, y, width, height].every(Number.isInteger)).toBe(true);
  expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); expect(width).toBeGreaterThan(0); expect(height).toBeGreaterThan(0);
  expect(x + width).toBeLessThanOrEqual(image.width); expect(y + height).toBeLessThanOrEqual(image.height);
  const result = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) image.rgba.copy(result, row * width * 4, ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
  return result;
}
function visibleRaster(bytes: Buffer): Buffer {
  const result = Buffer.from(bytes);
  for (let i = 0; i < result.length; i += 4) if (result[i + 3] === 0) result.fill(0, i, i + 4);
  return result;
}
function colors(bytes: Buffer) {
  const opaque = new Set<string>(), alphas = new Set<number>(); let orange = 0, area = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const alpha = bytes[i + 3]; alphas.add(alpha); if (!alpha) continue;
    const rgb = bytes.toString('hex', i, i + 3); opaque.add(rgb); area++; if (rgb === 'd97757') orange++;
  }
  return { opaque: [...opaque].sort(), alphas: [...alphas].sort((a, b) => a - b), orange, area };
}
function bounds(bytes: Buffer, width: number, height: number): readonly [number, number, number, number] {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (bytes[(y * width + x) * 4 + 3]) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  expect(maxX).toBeGreaterThanOrEqual(minX); expect(maxY).toBeGreaterThanOrEqual(minY);
  return [minX, minY, maxX, maxY]; // Inclusive, unlike the half-open atlas rectangles.
}

// These are source master-cell roles, NOT packed slot numbers. Packing scans the entire 16x8 mockup.
const MASTER_ROWS = [
  ['stone-top-left', 'stone-top', 'stone-top-right', 'stone-side-left', 'stone-fill', 'stone-side-right', 'stone-fill-alt', 'stone-fill-worn'],
  ['moss-top-left', 'moss-top', 'moss-top-right', 'soil-side-left', 'soil-fill', 'soil-side-right', 'soil-fill-alt', 'soil-fill-root'],
  ['timber-ledge-left', 'timber-ledge', 'timber-ledge-right', 'root-ledge-left', 'root-ledge', 'root-ledge-right', 'wall-quiet', 'wall-blocks'],
  ['timber-column', 'timber-beam', 'timber-bracket', 'wall-fret', 'wall-recess', 'wall-moss', 'stone-top-alt', 'moss-top-alt'],
] as const;
const MASTER_CELLS = MASTER_ROWS.flatMap((row, y) => row.map((role, x) => ({ role, x, y })));
function tile(role: EnvironmentTileRole): Buffer {
  const map = terrainMap(), slot = Number(ENVIRONMENT_BINDING.terrain.frames[role]);
  expect(Number.isInteger(slot) && slot >= 0 && slot < map.tileCount).toBe(true);
  return crop(terrainPixels(), (slot % map.columns) * 16, Math.floor(slot / map.columns) * 16, 16, 16);
}
function prop(role: EnvironmentPropRole): Buffer {
  const key = ENVIRONMENT_BINDING.props.frames[role], frame = propsAtlas().frames.find(value => value.filename === key);
  if (!frame) throw new Error(`Missing published prop frame for ${role}`);
  return crop(propsPixels(), frame.frame.x, frame.frame.y, frame.frame.w, frame.frame.h);
}

interface SourceCel { frame: number; layer: number; x: number; y: number; opacity: number; image: Pixels }
interface NativeSource { width: number; height: number; frames: number; durations: number[]; paletteSizes: number[]; layers: { type: number; opacity: number }[]; rasterCels: SourceCel[] }
// Read the retained native raster layer, not a provenance boolean or the packed tilemap's own image.
function nativeSource(path: string): NativeSource {
  const file = readFileSync(new URL(path, import.meta.url)); expect(file.length).toBeGreaterThanOrEqual(128);
  expect(file.readUInt32LE(0)).toBe(file.length); expect(file.readUInt16LE(4)).toBe(0xa5e0); expect(file.readUInt16LE(12)).toBe(32);
  const result: NativeSource = { width: file.readUInt16LE(8), height: file.readUInt16LE(10), frames: file.readUInt16LE(6), durations: [], paletteSizes: [], layers: [], rasterCels: [] };
  let offset = 128;
  for (let frame = 0; frame < result.frames; frame++) {
    expect(offset + 16).toBeLessThanOrEqual(file.length);
    const end = offset + file.readUInt32LE(offset), chunks = file.readUInt32LE(offset + 12) || file.readUInt16LE(offset + 6);
    expect(file.readUInt16LE(offset + 4)).toBe(0xf1fa); expect(end).toBeLessThanOrEqual(file.length); result.durations.push(file.readUInt16LE(offset + 8));
    let start = offset + 16;
    for (let chunk = 0; chunk < chunks; chunk++) {
      expect(start + 6).toBeLessThanOrEqual(end);
      const length = file.readUInt32LE(start), type = file.readUInt16LE(start + 4), stop = start + length;
      expect(length).toBeGreaterThanOrEqual(6); expect(stop).toBeLessThanOrEqual(end);
      if (type === 0x2004) { expect(length).toBeGreaterThanOrEqual(24); result.layers.push({ type: file.readUInt16LE(start + 8), opacity: file[start + 18] }); }
      if (type === 0x2019) { expect(length).toBeGreaterThanOrEqual(26); result.paletteSizes.push(file.readUInt32LE(start + 6)); }
      if (type === 0x2005) {
        expect(length).toBeGreaterThanOrEqual(24); const celType = file.readUInt16LE(start + 13);
        if (celType === 0 || celType === 2) {
          expect(length).toBeGreaterThanOrEqual(26);
          const width = file.readUInt16LE(start + 22), height = file.readUInt16LE(start + 24);
          const bytes = file.subarray(start + 26, stop), rgba = celType === 2 ? inflateSync(bytes) : Buffer.from(bytes);
          expect(rgba.length).toBe(width * height * 4);
          result.rasterCels.push({ frame, layer: file.readUInt16LE(start + 6), x: file.readInt16LE(start + 8), y: file.readInt16LE(start + 10), opacity: file[start + 12], image: { width, height, rgba } });
        }
      }
      start = stop;
    }
    expect(start).toBe(end); offset = end;
  }
  expect(offset).toBe(file.length); return result;
}
function sourceRaster(source: NativeSource, frame: number): Pixels {
  const cels = source.rasterCels.filter(cel => cel.frame === frame && source.layers[cel.layer]?.type === 0);
  expect(cels).toHaveLength(1); const cel = cels[0]; expect(cel.opacity).toBe(255); expect(source.layers[cel.layer].opacity).toBe(255);
  expect(cel.x).toBeGreaterThanOrEqual(0); expect(cel.y).toBeGreaterThanOrEqual(0); expect(cel.x + cel.image.width).toBeLessThanOrEqual(source.width); expect(cel.y + cel.image.height).toBeLessThanOrEqual(source.height);
  const rgba = Buffer.alloc(source.width * source.height * 4);
  for (let y = 0; y < cel.image.height; y++) cel.image.rgba.copy(rgba, ((cel.y + y) * source.width + cel.x) * 4, y * cel.image.width * 4, (y + 1) * cel.image.width * 4);
  return { width: source.width, height: source.height, rgba };
}

const TERRAIN_COLORS = ['0f191b', '24423b', '2c2330', '34354f', '426b50', '575c79', '783f4a', '858eb0', '8fa86b', 'b55a4a', 'cbb696'];
const PROP_COLORS = ['0f191b', '24423b', '2c2330', '34354f', '426b50', '575c79', '723f68', '783f4a', '858eb0', '8fa86b', '9dded1', 'b55a4a', 'b9905d', 'cbb696', 'd9ffea', 'f5e8c8'];
const LEDGES = ['timber-ledge-left', 'timber-ledge', 'timber-ledge-right', 'root-ledge-left', 'root-ledge', 'root-ledge-right'] as const;
const VARIANTS = [
  ['stone-fill', 'stone-fill-alt'], ['stone-fill', 'stone-fill-worn'], ['soil-fill', 'soil-fill-alt'], ['soil-fill', 'soil-fill-root'],
  ['wall-quiet', 'wall-blocks'], ['wall-quiet', 'wall-moss'], ['stone-top', 'stone-top-alt'], ['moss-top', 'moss-top-alt'],
] as const;
const PROP_BOUNDS = {
  'scroll-cabinet': [12, 1, 51, 63], 'lattice-window': [2, 2, 61, 61], 'hanging-lantern': [21, 0, 42, 62], 'forest-trunk': [12, 0, 55, 63],
  'forest-canopy': [0, 4, 63, 63], 'stone-lantern': [10, 1, 53, 63], 'root-clump': [2, 40, 61, 63], mushroom: [22, 24, 41, 40],
} as const;

describe('formal chapter-one environment files, not an in-game acceptance claim', () => {
  it('publishes the exact native Loader contracts and excludes the four empty trailing terrain slots', () => {
    expect(ENVIRONMENT_TILE_SIZE).toBe(16); expect(ENVIRONMENT_PROP_SIZE).toBe(64); expect(ENVIRONMENT_ASSETS).toHaveLength(2);
    const terrain = ENVIRONMENT_ASSETS.find(asset => asset.key === ENVIRONMENT_BINDING.terrain.key), props = ENVIRONMENT_ASSETS.find(asset => asset.key === ENVIRONMENT_BINDING.props.key);
    expect(terrain).toMatchObject({ key: 'environment-chapter-one-terrain', image: 'game/chapter-one-terrain.png', load: 'spritesheet', frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, startFrame: 0, endFrame: 31 });
    expect(props).toMatchObject({ key: 'environment-chapter-one-props', image: 'game/chapter-one-props.png', atlas: 'game/chapter-one-props.json', load: 'atlas', frameWidth: 64, frameHeight: 64 });
    expect(terrain?.frames).toEqual(ENVIRONMENT_TILE_ROLES.map(role => ENVIRONMENT_BINDING.terrain.frames[role]));
    expect(props?.frames).toEqual(ENVIRONMENT_PROP_ROLES.map(role => ENVIRONMENT_BINDING.props.frames[role]));
    expect(new Set(terrain?.frames).size).toBe(32); expect(new Set(props?.frames).size).toBe(8);
    expect(Object.values(ENVIRONMENT_BINDING.terrain.frames).every(value => typeof value === 'string')).toBe(true);
    expect(Object.values(ENVIRONMENT_BINDING.terrain.frames).map(Number).sort((a, b) => a - b)).toEqual(Array.from({ length: 32 }, (_, index) => index));
    for (let slot = 32; slot < 36; slot++) expect(colors(crop(terrainPixels(), slot % 6 * 16, Math.floor(slot / 6) * 16, 16, 16)).area).toBe(0);
  });
  it('reads the exported atlas and 16x8 map dimensions instead of inventing a semantic-order packing', () => {
    const map = terrainMap(), image = terrainPixels(); expect(map).toMatchObject({ image: 'chapter-one-terrain.png', imageWidth: 96, imageHeight: 96, tileWidth: 16, tileHeight: 16, tileCount: 32, columns: 6, rows: 6 });
    expect([image.width, image.height]).toEqual([96, 96]); expect(map.map).toMatchObject({ width: 16, height: 8 }); expect(map.map.tiles).toHaveLength(128);
    expect(map.map.tiles.every(index => Number.isInteger(index) && index >= 0 && index <= 32)).toBe(true);
    expect(ENVIRONMENT_TILE_ROLES).toEqual(MASTER_ROWS.flat()); expect(new Set(MASTER_CELLS.map(cell => map.map.tiles[cell.y * 16 + cell.x])).size).toBe(32);
    expect(ENVIRONMENT_BINDING.terrain.frames['soil-fill']).toBe('8'); expect(ENVIRONMENT_BINDING.terrain.frames['moss-top-left']).toBe('9');
    expect(map.map.tiles[1 * 16 + 4]).toBe(9); expect(map.map.tiles[1 * 16]).toBe(10);
  });
  it.each(MASTER_CELLS)('binds $role to the actual source cell ($x,$y), not its semantic ordinal', ({ role, x, y }) => {
    const index = terrainMap().map.tiles[y * 16 + x]; expect(index).toBeGreaterThan(0); expect(ENVIRONMENT_BINDING.terrain.frames[role]).toBe(String(index - 1));
    expect(colors(tile(role)).area).toBeGreaterThan(0);
  });
  it('reconstructs the retained native source raster byte-for-byte from the exported tile map and packed PNG', () => {
    const source = nativeSource('../../assets/source/chapter-one-tiles.aseprite'); expect([source.frames, source.width, source.height]).toEqual([1, 256, 128]);
    expect(source.paletteSizes.length).toBeGreaterThan(0); expect(source.paletteSizes.every(size => size === 20)).toBe(true);
    const original = sourceRaster(source, 0), map = terrainMap(), rebuilt = Buffer.alloc(256 * 128 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
      const index = map.map.tiles[y * 16 + x]; if (index === 0) continue;
      const slot = index - 1, bytes = crop(terrainPixels(), slot % 6 * 16, Math.floor(slot / 6) * 16, 16, 16);
      for (let row = 0; row < 16; row++) bytes.copy(rebuilt, ((y * 16 + row) * 256 + x * 16) * 4, row * 16 * 4, (row + 1) * 16 * 4);
    }
    expect(colors(original.rgba).area).toBeGreaterThan(0); expect(Buffer.compare(rebuilt, original.rgba)).toBe(0);
    for (const { role, x, y } of MASTER_CELLS) expect(Buffer.compare(tile(role), crop(original, x * 16, y * 16, 16, 16))).toBe(0);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      expect(Buffer.compare(crop(original, (9 + x) * 16, y * 16, 16, 16), tile('stone-fill'))).toBe(0);
      expect(Buffer.compare(crop(original, (13 + x) * 16, y * 16, 16, 16), tile('soil-fill'))).toBe(0);
    }
  });
  it.each([{ name: 'terrain', get: terrainPixels, expected: TERRAIN_COLORS }, { name: 'props', get: propsPixels, expected: PROP_COLORS }])('measures $name hard alpha, native opaque colors and zero reserved Clawd orange', ({ get, expected }) => {
    const measured = colors(get().rgba); expect(measured.area).toBeGreaterThan(0); expect(measured.alphas).toEqual([0, 255]); expect(measured.orange).toBe(0);
    expect(measured.opaque).toEqual(expected); expect(measured.opaque.length).toBeLessThanOrEqual(20);
  });
  it('contains thirty-two visible distinct native tile rasters, not hidden-RGB variations', () => { expect(new Set(ENVIRONMENT_TILE_ROLES.map(role => visibleRaster(tile(role)).toString('hex'))).size).toBe(32); });
  it.each(LEDGES)('%s has twelve full opaque rows and four transparent padding rows at native scale', role => {
    const bytes = tile(role);
    for (let y = 0; y < 16; y++) expect(Array.from({ length: 16 }, (_, x) => bytes[(y * 16 + x) * 4 + 3])).toEqual(Array(16).fill(y < 12 ? 255 : 0));
    expect(colors(bytes).area).toBe(16 * 12); expect(bounds(bytes, 16, 16)).toEqual([0, 0, 15, 11]);
  });
  it.each(VARIANTS)('%s and %s retain identical two-pixel borders while changing interior pixels', (base, variant) => {
    const border = (bytes: Buffer) => { const pixels: Buffer[] = []; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x < 2 || x >= 14 || y < 2 || y >= 14) pixels.push(bytes.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 4)); return Buffer.concat(pixels); };
    const a = tile(base), b = tile(variant); expect(border(a)).toHaveLength(112 * 4); expect(Buffer.compare(border(a), border(b))).toBe(0); expect(Buffer.compare(visibleRaster(a), visibleRaster(b))).not.toBe(0);
  });

  it('keeps eight actual 64px untrimmed/unrotated static frame keys and single-frame tags with 600ms metadata', () => {
    const atlas = propsAtlas(), image = propsPixels(); expect([image.width, image.height]).toEqual([512, 64]); expect(atlas.frames).toHaveLength(8); expect(atlas.meta.frameTags).toHaveLength(8);
    expect(atlas.meta).toMatchObject({ image: 'chapter-one-props.png', format: 'RGBA8888', size: { w: 512, h: 64 }, scale: '1' });
    expect(atlas.meta.layers).toEqual([{ name: 'props', opacity: 255, blendMode: 'normal' }]);
    expect(new Set(atlas.frames.map(frame => frame.filename)).size).toBe(8); expect(new Set(atlas.meta.frameTags.map(tag => tag.name)).size).toBe(8);
    expect(atlas.meta.frameTags.map(tag => tag.name)).toEqual(ENVIRONMENT_PROP_ROLES);
    for (const [index, frame] of atlas.frames.entries()) {
      expect(frame.frame).toEqual({ x: index * 64, y: 0, w: 64, h: 64 }); expect(frame.sourceSize).toEqual({ w: 64, h: 64 }); expect(frame.spriteSourceSize).toEqual({ x: 0, y: 0, w: 64, h: 64 });
      expect(frame.trimmed).toBe(false); expect(frame.rotated).toBe(false); expect(frame.duration).toBe(600);
    }
    for (const role of ENVIRONMENT_PROP_ROLES) {
      const tag = atlas.meta.frameTags.find(value => value.name === role); if (!tag) throw new Error(`Missing static tag ${role}`);
      expect(tag.from).toBe(tag.to); expect(tag.direction).toBe('forward'); expect(tag.from).toBeGreaterThanOrEqual(0); expect(tag.from).toBeLessThan(8);
      expect(ENVIRONMENT_BINDING.props.frames[role]).toBe(atlas.frames[tag.from].filename);
    }
    expect(ENVIRONMENT_PROP_ROLES.filter(role => role.includes('mushroom'))).toEqual(['mushroom']);
    // Source timeline duration is export metadata, not permission to create a dim/bright gameplay animation.
  });
  it('checks eight native source rasters and the twenty-entry palette against actual exported pixels', () => {
    const source = nativeSource('../../assets/source/chapter-one-props.aseprite'); expect([source.frames, source.width, source.height]).toEqual([8, 64, 64]); expect(source.durations).toEqual(Array(8).fill(600));
    expect(source.paletteSizes.length).toBeGreaterThan(0); expect(source.paletteSizes.every(size => size === 20)).toBe(true); expect(source.layers).toEqual([{ type: 0, opacity: 255 }]);
    for (const [index, role] of ENVIRONMENT_PROP_ROLES.entries()) expect(Buffer.compare(sourceRaster(source, index).rgba, prop(role))).toBe(0);
    expect(new Set(ENVIRONMENT_PROP_ROLES.map(role => visibleRaster(prop(role)).toString('hex'))).size).toBe(8);
  });
  it.each(ENVIRONMENT_PROP_ROLES)('measures the actual inclusive ink bounds of %s from PNG alpha', role => { expect(bounds(prop(role), 64, 64)).toEqual(PROP_BOUNDS[role]); });
  it('verifies trunk top, trunk bottom and canopy bottom full RGBA rows, with a nonempty ten-pixel socket control', () => {
    const trunk = prop('forest-trunk'), canopy = prop('forest-canopy'), row = (bytes: Buffer, y: number) => bytes.subarray(y * 64 * 4, (y + 1) * 64 * 4);
    const socket = row(trunk, 0); expect(Buffer.compare(socket, row(trunk, 63))).toBe(0); expect(Buffer.compare(socket, row(canopy, 63))).toBe(0);
    const opaque = Array.from({ length: 64 }, (_, x) => x).filter(x => socket[x * 4 + 3] !== 0); expect(opaque).toEqual(Array.from({ length: 10 }, (_, index) => index + 26));
    expect(opaque.map(x => socket.toString('hex', x * 4, x * 4 + 3))).toEqual(['2c2330', 'b55a4a', ...Array(6).fill('783f4a'), '34354f', '2c2330']);
    expect(opaque.map(x => socket[x * 4 + 3])).toEqual(Array(10).fill(255));
  });
  it('keeps root ink ground-aligned when the last native trunk/root frame starts at floor minus 64', () => {
    const root = bounds(prop('root-clump'), 64, 64), trunk = bounds(prop('forest-trunk'), 64, 64), y = CHAPTER.floor - ENVIRONMENT_PROP_SIZE;
    expect(y).toBe(256); expect(y + root[1]).toBe(296); expect(y + root[3] + 1).toBe(CHAPTER.floor); expect(y + trunk[3] + 1).toBe(CHAPTER.floor);
    // Root row40 overlaps the trunk body; it is NOT specified to equal any trunk row byte-for-byte.
  });
  it('keeps the one real mushroom at 20x17 ink with its unchanged 32/32 pivot', () => {
    const mushroom = prop('mushroom'), box = bounds(mushroom, 64, 64); expect(box).toEqual([22, 24, 41, 40]); expect([box[2] - box[0] + 1, box[3] - box[1] + 1]).toEqual([20, 17]);
    expect(ENVIRONMENT_MUSHROOM_PIVOT).toEqual({ x: 32, y: 32 }); expect([box[0] - 32, box[1] - 32, box[2] - 32, box[3] - 32]).toEqual([-10, -8, 9, 8]); expect(colors(mushroom).area).toBeGreaterThan(0);
  });
});
