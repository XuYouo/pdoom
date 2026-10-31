import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

/** Independent literal-source observer. No production plans, World, DataManager or clock hooks. */
export interface FurnaceCapture { png: string; at: number }
export interface FurnaceRack { x: number; y: number; ratio: number; pixels: number; visibleInk: number; full: boolean }
export interface FurnaceLift { x: number; y: number; right: number; width: 120; height: 12; ratio: number; ink: number }
export interface FurnaceFloorBlock { x: number; y: number; kind: string; ratio: number; pixels: number; colors: number }
export interface FurnaceView {
  at: number; capture: FurnaceCapture; rackPixels: number; racks: FurnaceRack[]; fullRackCount: number;
  floorY: number | null; floorPixels: number; floorRows: [number, number]; floorBlocks: FurnaceFloorBlock[];
  lift: FurnaceLift | null;
}
interface Raster { width: number; height: number; rgba: Buffer }
interface Point { x: number; y: number; rgb: number }
interface Stamp { width: number; height: number; points: Point[]; anchors: Point[]; rare: number[]; colors: number[]; integral: Int32Array }
interface FloorSource { kind: string; stamp: Stamp; rows: number[][] }
export interface FurnaceSource { readonly gpu: Stamp; readonly floors: readonly FloorSource[]; readonly lift: Stamp }
const WIDTH = 640, HEIGHT = 360, TOLERANCE = 2, MIN_RATIO = 0.98;
const BACKGROUND = 0x0f191b, BACKGROUND_ALPHA = 0.60;
const rgb = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const close = (a: number, b: number) => a >= 0 && b >= 0
  && Math.abs((a >>> 16) - (b >>> 16)) <= TOLERANCE
  && Math.abs(((a >>> 8) & 255) - ((b >>> 8) & 255)) <= TOLERANCE
  && Math.abs((a & 255) - (b & 255)) <= TOLERANCE;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(data: Buffer): number {
  let value = 0xffffffff; for (const byte of data) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
/** Noninterlaced RGB/RGBA8 PNG, including browser canvas PNGs; no resizing or colour fitting. */
function png(file: Buffer): Raster {
  assert(file.length >= 33, 'Truncated PNG');
  assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(file.toString('ascii', 12, 16), 'IHDR');
  const width = file.readUInt32BE(16), height = file.readUInt32BE(20), channels = file[25] === 6 ? 4 : 3;
  assert(width > 0 && height > 0 && width <= 4096 && height <= 4096);
  assert.equal(file[24], 8); assert([2, 6].includes(file[25]), 'Expected RGB/RGBA8 PNG');
  assert.deepEqual([...file.subarray(26, 29)], [0, 0, 0]);
  const parts: Buffer[] = []; let offset = 8, ended = false;
  while (offset + 12 <= file.length) {
    const length = file.readUInt32BE(offset), type = file.toString('ascii', offset + 4, offset + 8);
    assert(offset + length + 12 <= file.length);
    assert.equal(file.readUInt32BE(offset + length + 8), crc32(file.subarray(offset + 4, offset + length + 8)));
    if (type === 'IHDR') assert.equal(length, 13);
    if (type === 'IDAT') parts.push(file.subarray(offset + 8, offset + length + 8));
    offset += length + 12;
    if (type === 'IEND') { assert.equal(length, 0); ended = true; break; }
  }
  assert(ended && offset === file.length && parts.length > 0);
  const stride = width * channels, raw = inflateSync(Buffer.concat(parts), { maxOutputLength: height * (stride + 1) });
  assert.equal(raw.length, height * (stride + 1)); const decoded = Buffer.alloc(width * height * channels);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; assert(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, left = x >= channels ? decoded[at - channels] : 0;
      const up = y ? decoded[at - stride] : 0, corner = y && x >= channels ? decoded[at - stride - channels] : 0;
      decoded[at] = (raw[y * (stride + 1) + x + 1] + [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter]) & 255;
    }
  }
  if (channels === 4) return { width, height, rgba: decoded };
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { decoded.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = 255; }
  return { width, height, rgba };
}
function crop(image: Raster, x: number, y: number, width: number, height: number): Raster {
  assert([x, y, width, height].every(Number.isInteger));
  assert(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= image.width && y + height <= image.height);
  const rgba = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) image.rgba.copy(rgba, row * width * 4, ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
  return { width, height, rgba };
}
function stamp(image: Raster, mixed = false, omitTop = 0): Stamp {
  const points: Point[] = [], groups = new Map<number, Point[]>();
  const integral = new Int32Array((image.width + 1) * (image.height + 1));
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const at = (y * image.width + x) * 4, alpha = image.rgba[at + 3]; assert(alpha === 0 || alpha === 255, 'Soft source alpha');
    const ink = alpha === 255 && y >= omitTop, p = (y + 1) * (image.width + 1) + x + 1;
    integral[p] = Number(ink) + integral[p - 1] + integral[p - image.width - 1] - integral[p - image.width - 2];
    if (!ink) continue;
    const values = [image.rgba[at], image.rgba[at + 1], image.rgba[at + 2]];
    const base = [BACKGROUND >>> 16, (BACKGROUND >>> 8) & 255, BACKGROUND & 255];
    const v = mixed ? values.map((value, channel) => Math.round(value * BACKGROUND_ALPHA + base[channel] * (1 - BACKGROUND_ALPHA))) : values;
    const point = { x, y, rgb: rgb(v[0], v[1], v[2]) }; points.push(point);
    const group = groups.get(point.rgb) ?? []; group.push(point); groups.set(point.rgb, group);
  }
  const rare = [...groups].sort((a, b) => a[1].length - b[1].length || a[0] - b[0]).slice(0, 3).map(([value]) => value);
  const anchors: Point[] = [];
  for (const value of rare) {
    const group = groups.get(value)!;
    for (const i of new Set([0, Math.floor(group.length / 2), group.length - 1])) anchors.push(group[i]);
  }
  assert(points.length > 0 && rare.length >= 3, 'Need rare multicolour source anchors');
  return { width: image.width, height: image.height, points, anchors, rare, colors: [...groups.keys()], integral };
}

interface Atlas {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; rotated: boolean; trimmed: boolean;
    spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; size: { w: number; h: number }; format: string; scale: string;
    frameTags: { name: string; from: number; to: number; direction: string }[];
    layers: { name: string; opacity: number; blendMode: string }[] };
}
interface TileMap {
  image: string; imageWidth: number; imageHeight: number; columns: number; rows: number;
  tileWidth: number; tileHeight: number; tileCount: number; map: { width: number; height: number; tiles: number[] };
}
let loaded: Promise<FurnaceSource> | undefined;
export function furnaceSource(): Promise<FurnaceSource> { return loaded ??= loadSource(); }
async function loadSource(): Promise<FurnaceSource> {
  const [terrainBytes, terrainJson, propsBytes, propsJson] = await Promise.all([
    readFile('public/game/furnace-terrain.png'),
    readFile('public/game/furnace-terrain.json', 'utf8'),
    readFile('public/game/furnace-props.png'),
    readFile('public/game/furnace-props.json', 'utf8'),
  ]);
  const terrain = png(terrainBytes), props = png(propsBytes), map = JSON.parse(terrainJson) as TileMap, atlas = JSON.parse(propsJson) as Atlas;
  assert.deepEqual([terrain.width, terrain.height, props.width, props.height], [96, 96, 384, 64]);
  assert.deepEqual([map.image, map.imageWidth, map.imageHeight, map.columns, map.rows, map.tileWidth, map.tileHeight, map.tileCount], ['furnace-terrain.png', 96, 96, 6, 6, 16, 16, 32]);
  assert.deepEqual([map.map.width, map.map.height, map.map.tiles.length], [16, 8, 128]);
  assert(map.map.tiles.every(value => Number.isInteger(value) && value >= 0 && value <= 32));
  assert.deepEqual([...new Set(map.map.tiles)].sort((a, b) => a - b), Array.from({ length: 33 }, (_, i) => i));
  assert.equal(atlas.meta.image, 'furnace-props.png'); assert.deepEqual(atlas.meta.size, { w: 384, h: 64 });
  assert.equal(atlas.meta.format, 'RGBA8888'); assert.equal(atlas.meta.scale, '1'); assert.equal(atlas.frames.length, 6);
  atlas.frames.forEach((frame, i) => {
    assert.equal(frame.filename, `furnace-props ${i}.aseprite`);
    assert.deepEqual(frame.frame, { x: i * 64, y: 0, w: 64, h: 64 }); assert.equal(frame.rotated, false); assert.equal(frame.trimmed, false);
    assert.deepEqual(frame.spriteSourceSize, { x: 0, y: 0, w: 64, h: 64 }); assert.deepEqual(frame.sourceSize, { w: 64, h: 64 }); assert.equal(frame.duration, 100);
  });
  assert.deepEqual(atlas.meta.frameTags.map(({ name, from, to, direction }) => ({ name, from, to, direction })),
    ['gpu-rack', 'coolant-manifold', 'power-bus', 'floor-exhaust', 'ceiling-aperture', 'lunar-porthole'].map((name, i) => ({ name, from: i, to: i, direction: 'forward' })));
  assert.deepEqual(atlas.meta.layers, ['housing', 'mechanism', 'details'].map(name => ({ name, opacity: 255, blendMode: 'normal' })));
  for (const image of [terrain, props]) assert(image.rgba.every((value, index) => index % 4 !== 3 || value === 0 || value === 255));
  // Source mother coordinates plus actual JSON IDs; not a production binding import.
  const tile = (x: number, y: number, slot: number) => {
    assert.equal(map.map.tiles[y * 16 + x], slot + 1);
    return crop(terrain, slot % 6 * 16, Math.floor(slot / 6) * 16, 16, 16);
  };
  const gpu = stamp(crop(props, 0, 0, 64, 64), true);
  assert.equal(gpu.points.length, 3100); assert.equal(gpu.colors.length, 9);
  const floorImages = [tile(0, 0, 0), tile(1, 0, 1), tile(4, 1, 13)];
  const floors = floorImages.map((image, i) => {
    const shape = stamp(image); assert.equal(shape.points.length, 256); assert(shape.colors.length >= 3);
    const rows = [0, 1].map(y => Array.from({ length: 16 }, (_, x) => {
      const p = (y * 16 + x) * 4; return rgb(image.rgba[p], image.rgba[p + 1], image.rgba[p + 2]);
    }));
    return { kind: ['floor-top-a', 'floor-top-b', 'grate-top'][i], stamp: shape, rows };
  });
  const left = tile(1, 1, 10), middle = tile(2, 1, 11), right = tile(3, 1, 12), liftImage = { width: 120, height: 12, rgba: Buffer.alloc(120 * 12 * 4) };
  for (let y = 0; y < 12; y++) for (let x = 0; x < 120; x++) {
    const part = x < 16 ? left : x >= 104 ? right : middle, sx = x < 16 ? x : x >= 104 ? x - 104 : (x - 16) % 16;
    const p = (y * 16 + sx) * 4; part.rgba.copy(liftImage.rgba, (y * 120 + x) * 4, p, p + 4);
  }
  // Only the real protected-semantics strip y0..2 is excluded. No other adaptive mask.
  const lift = stamp(liftImage, false, 3); assert.equal(lift.points.length, 1080); assert(lift.colors.length >= 3);
  return { gpu, floors, lift };
}

export async function furnaceFrames(page: Page, duration = 0): Promise<FurnaceCapture[]> {
  assert(Number.isFinite(duration) && duration >= 0, 'Capture duration must be finite and nonnegative');
  return page.evaluate(ms => new Promise<FurnaceCapture[]>((resolve, reject) => {
    const captures: FurnaceCapture[] = []; let first = -1;
    const take = (at: number) => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Expected actual native640x360 canvas');
        if (first < 0) first = at; captures.push({ png: canvas.toDataURL('image/png'), at });
        if (at - first >= ms) resolve(captures); else requestAnimationFrame(take);
      } catch (error) { reject(error); }
    };
    requestAnimationFrame(take);
  }), duration);
}

interface Screen { pixels: Int32Array; locations: Map<number, number[]> }
interface Hit { x: number; y: number; ratio: number; pixels: number; visibleInk: number; colors: number; indices: number[]; full: boolean }
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
const at = (screen: Screen, x: number, y: number) => inside(x, y) ? screen.pixels[y * WIDTH + x] : -1;
function visibleInk(shape: Stamp, x: number, y: number): number {
  const left = Math.max(0, -x), top = Math.max(0, -y), right = Math.min(shape.width, WIDTH - x), bottom = Math.min(shape.height, HEIGHT - y);
  if (left >= right || top >= bottom) return 0;
  const p = shape.integral, stride = shape.width + 1;
  return p[bottom * stride + right] - p[top * stride + right] - p[bottom * stride + left] + p[top * stride + left];
}
function match(screen: Screen, shape: Stamp, x: number, y: number, cropped: boolean, minimum: number, minimumColors: number): Hit | null {
  if (!cropped && (x < 0 || y < 0 || x + shape.width > WIDTH || y + shape.height > HEIGHT)) return null;
  const visible = visibleInk(shape, x, y);
  if (visible < Math.ceil(shape.points.length * 0.90) || visible < minimum) return null;
  let anchors = 0; const anchorColors = new Set<number>();
  for (const point of shape.anchors) if (close(at(screen, x + point.x, y + point.y), point.rgb)) { anchors++; anchorColors.add(point.rgb); }
  if (anchors < 4 || anchorColors.size < 2) return null;
  const indices: number[] = [], matchedColors = new Set<number>(); let misses = 0;
  const allowed = Math.floor(visible * (1 - MIN_RATIO) + 1e-9);
  for (const point of shape.points) {
    const sx = x + point.x, sy = y + point.y; if (!inside(sx, sy)) continue;
    if (close(screen.pixels[sy * WIDTH + sx], point.rgb)) { indices.push(sy * WIDTH + sx); matchedColors.add(point.rgb); }
    else if (++misses > allowed) return null;
  }
  const ratio = indices.length / visible;
  if (ratio < MIN_RATIO || indices.length < minimum || matchedColors.size < minimumColors) return null;
  return { x, y, ratio, pixels: indices.length, visibleInk: visible, colors: matchedColors.size, indices, full: visible === shape.points.length };
}
function locations(screen: Screen, value: number): number[] {
  const old = screen.locations.get(value); if (old) return old;
  const result: number[] = []; for (let i = 0; i < screen.pixels.length; i++) if (close(screen.pixels[i], value)) result.push(i);
  screen.locations.set(value, result); return result;
}
function find(screen: Screen, shape: Stamp, cropped: boolean, minimum: number, minimumColors: number): Hit[] {
  const tested = new Set<number>(), result: Hit[] = [], stride = WIDTH + 2 * shape.width;
  // Two rare colours seed translations; all rare multicolour anchors and the full ink mask verify them.
  for (const anchor of shape.anchors.filter(point => shape.rare.slice(0, 2).includes(point.rgb))) {
    for (const position of locations(screen, anchor.rgb)) {
      const x = position % WIDTH - anchor.x, y = Math.floor(position / WIDTH) - anchor.y;
      if (x <= -shape.width || x >= WIDTH || y <= -shape.height || y >= HEIGHT) continue;
      const key = (y + shape.height) * stride + x + shape.width; if (tested.has(key)) continue; tested.add(key);
      const found = match(screen, shape, x, y, cropped, minimum, minimumColors); if (found) result.push(found);
    }
  }
  result.sort((a, b) => b.ratio - a.ratio || b.pixels - a.pixels || a.y - b.y || a.x - b.x);
  const unique: Hit[] = [];
  for (const hit of result) if (!unique.some(other => Math.abs(hit.x - other.x) < shape.width / 2 && Math.abs(hit.y - other.y) < shape.height / 2)) unique.push(hit);
  return unique;
}
function floor(screen: Screen, source: FurnaceSource): Pick<FurnaceView, 'floorY' | 'floorPixels' | 'floorRows' | 'floorBlocks'> {
  // Source-derived header is only a candidate filter. Four nonoverlapping whole multicolour tiles are mandatory.
  const headers = [0, 1].map(row => [...new Set(source.floors.slice(0, 2).flatMap(shape => shape.rows[row]))]);
  for (let y = 300; y <= 333; y++) {
    const counts: [number, number] = [0, 0];
    for (let row = 0; row < 2; row++) for (let x = 0; x < WIDTH; x++) if (headers[row].some(value => close(at(screen, x, y + row), value))) counts[row]++;
    if (counts[0] < 500 || counts[1] < 500) continue;
    const candidates: FurnaceFloorBlock[] = [];
    for (let x = 0; x <= WIDTH - 16; x++) for (const shape of source.floors) {
      const found = match(screen, shape.stamp, x, y, false, Math.ceil(256 * MIN_RATIO), 3);
      if (found) candidates.push({ x, y, kind: shape.kind, ratio: found.ratio, pixels: found.pixels, colors: found.colors });
    }
    candidates.sort((a, b) => b.ratio - a.ratio || a.x - b.x);
    const blocks: FurnaceFloorBlock[] = [];
    for (const candidate of candidates) if (blocks.every(block => Math.abs(candidate.x - block.x) >= 16)) blocks.push(candidate);
    if (blocks.length >= 4) return { floorY: y, floorPixels: Math.min(...counts), floorRows: counts, floorBlocks: blocks.sort((a, b) => a.x - b.x) };
  }
  return { floorY: null, floorPixels: 0, floorRows: [0, 0], floorBlocks: [] };
}
/** Pure PNG analyser for same-capture reuse and OFFLINE algorithm controls, not gameplay evidence. */
export function inspectFurnacePng(capture: FurnaceCapture, source: FurnaceSource): FurnaceView {
  assert(Number.isFinite(capture.at)); assert(capture.png.startsWith('data:image/png;base64,'), 'Expected original PNG capture');
  const image = png(Buffer.from(capture.png.slice('data:image/png;base64,'.length), 'base64'));
  assert.deepEqual([image.width, image.height], [WIDTH, HEIGHT], 'Never rescale a non-native capture');
  const pixels = new Int32Array(WIDTH * HEIGHT);
  for (let i = 0; i < pixels.length; i++) {
    const p = i * 4; pixels[i] = image.rgba[p + 3] === 255 ? rgb(image.rgba[p], image.rgba[p + 1], image.rgba[p + 2]) : -1;
  }
  const screen: Screen = { pixels, locations: new Map() };
  const found = find(screen, source.gpu, true, 2700, 7), fullRackCount = found.filter(hit => hit.full).length;
  const admitted = fullRackCount > 0 ? found : [], union = new Uint8Array(WIDTH * HEIGHT); let rackPixels = 0;
  for (const hit of admitted) for (const index of hit.indices) if (!union[index]) { union[index] = 1; rackPixels++; }
  const racks = admitted.map(({ x, y, ratio, pixels, visibleInk, full }) => ({ x, y, ratio, pixels, visibleInk, full }));
  const candidate = find(screen, source.lift, false, 1000, 3)[0];
  const lift: FurnaceLift | null = candidate ? { x: candidate.x, y: candidate.y, right: candidate.x + 120, width: 120, height: 12, ratio: candidate.ratio, ink: candidate.pixels } : null;
  return { at: capture.at, capture, rackPixels, racks, fullRackCount, ...floor(screen, source), lift };
}
export async function inspectFurnace(page: Page, captures: readonly FurnaceCapture[], source: FurnaceSource): Promise<FurnaceView[]> {
  const size = await page.locator('canvas').first().evaluate(canvas => {
    if (!(canvas instanceof HTMLCanvasElement)) throw Error('Missing real game canvas');
    return [canvas.width, canvas.height];
  });
  assert.deepEqual(size, [WIDTH, HEIGHT], 'Expected native game backing canvas');
  // Every result reads its supplied PNG, not the current game state or a different live frame.
  return captures.map(capture => inspectFurnacePng(capture, source));
}
