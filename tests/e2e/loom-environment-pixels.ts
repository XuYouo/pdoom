import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

// Literal-source observer. No production plans, selectors, Phaser or simulation state.
export interface LoomCapture { png: string; at: number }
export interface LoomTop { kind: string; x: number; y: number; width: number }
export interface LoomTile {
  slot: number; x: number; y: number; ink: number; matched: number; ratio: number; colors: number;
  overlayPoints: number; overlayRow: number | null;
  sourcePoints: number; sourceMatched: number; sourceRatio: number; sourceColors: number;
}
export interface LoomGeometry {
  tops: LoomTop[];
  hero: { count: number; x: number; bottom: number };
  line: { count: number; x: number | null };
}
interface Raster { width: number; height: number; rgba: Buffer }
interface Point { x: number; y: number; color: number }
interface Stamp { slot: number; points: Point[]; anchors: Point[]; colors: number }
export interface LoomSource { tiles: readonly Stamp[] }
export interface LoomView extends LoomGeometry { capture: LoomCapture; tiles: LoomTile[] }
const W = 640, H = 360, PREFIX = 'data:image/png;base64,';
const close = (a: number, b: number, tolerance = 2) => a >= 0 && b >= 0
  && Math.abs((a >>> 16) - (b >>> 16)) <= tolerance
  && Math.abs(((a >>> 8) & 255) - ((b >>> 8) & 255)) <= tolerance
  && Math.abs((a & 255) - (b & 255)) <= tolerance;
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

function makeStamp(image: Raster, slot: number): Stamp {
  const points: Point[] = [], groups = new Map<number, Point[]>();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4, a = image.rgba[i + 3]; assert(a === 0 || a === 255);
    if (!a) continue;
    const color = (image.rgba[i] << 16) | (image.rgba[i + 1] << 8) | image.rgba[i + 2];
    const p = { x, y, color }; points.push(p);
    const list = groups.get(color) ?? []; list.push(p); groups.set(color, list);
  }
  assert(points.length > 0 && groups.size >= 3, 'Source16x9 must contain real multicolour ink');
  const anchors = [...groups.values()].sort((a, b) => a.length - b.length).slice(0, 3)
    .flatMap(group => [group[0], group[Math.floor(group.length / 2)], group[group.length - 1]]);
  return { slot, points, anchors, colors: groups.size };
}
let loaded: Promise<LoomSource> | undefined;
export function loomEnvironmentSource(): Promise<LoomSource> { return loaded ??= loadSource(); }
async function loadSource(): Promise<LoomSource> {
  const files = ['loom-terrain.png', 'loom-terrain.json', 'loom-props.png', 'loom-props.json'];
  const hashes = [
    '441734201ed497c5013c153c89a0828bda80decb4e8ea8ee9d2a09a6d3ee1cb2',
    '208dd4abf5b4d13b1093b7d4ed4bada678a53b011bdb79c8da68de4a105e2ad3',
    'f159173241559365fcfeff0ccb9b8a26c97d466cc9b4c3f09e5ad8b067cd7340',
    '76eb8af3ea05d0cf52014197b367bc53c382b9236e7bcd3c760fc409a9ffa3dc',
  ];
  const bytes = await Promise.all(files.map(file => readFile('public/game/' + file)));
  bytes.forEach((b, i) => assert.equal(createHash('sha256').update(b).digest('hex'), hashes[i], files[i]));
  const terrain = png(bytes[0]), props = png(bytes[2]), map = JSON.parse(bytes[1].toString());
  assert.deepEqual([terrain.width, terrain.height, props.width, props.height], [96, 96, 384, 64]);
  assert.deepEqual([map.columns, map.tileWidth, map.tileHeight, map.tileCount], [6, 16, 16, 32]);
  const atlas = JSON.parse(bytes[3].toString()) as { frames: { filename: string; frame: { x: number; y: number; w: number; h: number } }[] };
  assert.equal(atlas.frames.length, 6);
  atlas.frames.forEach((f, i) => {
    assert.equal(f.filename, `loom-props ${i}.aseprite`);
    assert.deepEqual(f.frame, { x: i * 64, y: 0, w: 64, h: 64 });
  });
  const tiles = Array.from({ length: 16 }, (_, slot) => {
    const tile = crop(terrain, slot % 6 * 16, Math.floor(slot / 6) * 16, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const a = tile.rgba[(y * 16 + x) * 4 + 3]; assert(a === 0 || a === 255);
      if (y < 3 || y >= 12) assert.equal(a, 0, 'No opaque fake support top or skirt');
    }
    return makeStamp(crop(tile, 0, 3, 16, 9), slot);
  });
  return { tiles };
}
let cachedPng = '', cachedPixels = new Int32Array(0);
function screen(capture: LoomCapture): Int32Array {
  assert(Number.isFinite(capture.at) && capture.at >= 0);
  assert(capture.png.startsWith(PREFIX), 'Actual canvas PNG is required');
  if (capture.png === cachedPng) return cachedPixels;
  const image = png(Buffer.from(capture.png.slice(PREFIX.length), 'base64'));
  assert.deepEqual([image.width, image.height], [W, H], 'Never scale a non-native capture');
  const pixels = new Int32Array(W * H);
  for (let i = 0; i < pixels.length; i++) {
    const p = i * 4;
    pixels[i] = image.rgba[p + 3] === 255 ? (image.rgba[p] << 16) | (image.rgba[p + 1] << 8) | image.rgba[p + 2] : -1;
  }
  cachedPng = capture.png; cachedPixels = pixels; return pixels;
}
const topColors = new Map([[0xb9a4e8, 'upper'], [0x79c9c1, 'lower'], [0xe3c58e, 'hub'],
  [0x90c6b0, 'arena'], [0xf4a07d, 'warning'], [0xed926c, 'warning']]);
const at = (pixels: Int32Array, x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H ? pixels[y * W + x] : -1;
export function loomGeometry(capture: LoomCapture): LoomGeometry {
  const pixels = screen(capture), tops: LoomTop[] = [];
  let count = 0, left = W, right = 0, bottom = 0, lineCount = 0, lineSum = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const color = pixels[y * W + x];
    if (color === 0xd97757) { count++; left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    if (color === 0xf4d298 && y > 200) { lineCount++; lineSum += x; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W;) {
    const color = pixels[y * W + x], kind = topColors.get(color);
    if (!kind) { x++; continue; }
    const start = x; while (x < W && pixels[y * W + x] === color) x++;
    const width = x - start; if (width < 30) continue;
    if (!tops.some(p => p.kind === kind && Math.abs(p.x - start) < 3 && Math.abs(p.width - width) < 3 && y - p.y < 5)) {
      tops.push({ kind, x: start, y, width });
    }
  }
  return { tops, hero: { count, x: count ? (left + right) / 2 : 0, bottom },
    line: { count: lineCount, x: lineCount ? lineSum / lineCount : null } };
}
// Frozen existing Core narrow-boundary line: RGB#9acfb7, alpha.38, one native row.
// Literal alpha composition only; no fitted colour, generic mask or producer-plan import.
const coreBoundaryColor = (color: number) =>
  (Math.floor((color >>> 16) * 0.62 + 154 * 0.38) << 16)
  | (Math.floor(((color >>> 8) & 255) * 0.62 + 207 * 0.38) << 8)
  | Math.floor((color & 255) * 0.62 + 183 * 0.38);
function score(pixels: Int32Array, stamp: Stamp, x: number, y: number, overlayY: number | null = null): LoomTile {
  assert(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x + 16 <= W && y + 9 <= H, 'Complete16x9 required');
  let matched = 0, overlayPoints = 0, sourcePoints = 0, sourceMatched = 0;
  const colors = new Set<number>(), sourceColors = new Set<number>();
  for (const p of stamp.points) {
    const overlay = y + p.y === overlayY, expected = overlay ? coreBoundaryColor(p.color) : p.color;
    if (overlay) overlayPoints++; else sourcePoints++;
    if (close(at(pixels, x + p.x, y + p.y), expected)) {
      matched++; colors.add(expected);
      if (!overlay) { sourceMatched++; sourceColors.add(p.color); }
    }
  }
  return { slot: stamp.slot, x, y, ink: stamp.points.length, matched,
    ratio: matched / stamp.points.length, colors: colors.size, overlayPoints,
    overlayRow: overlayPoints ? overlayY! - y : null, sourcePoints, sourceMatched,
    sourceRatio: sourcePoints ? sourceMatched / sourcePoints : 0, sourceColors: sourceColors.size };
}
export function inspectLoomEnvironment(capture: LoomCapture, source: LoomSource): LoomView {
  const pixels = screen(capture), geometry = loomGeometry(capture), found = new Map<string, LoomTile>();
  for (const top of geometry.tops) {
    const overlayY = top.kind === 'arena' ? top.y + 10 : null;
    const base = ({ upper: 0, lower: 4, hub: 8, arena: 12 } as Record<string, number>)[top.kind];
    const stamps = top.kind === 'arena' ? [...source.tiles.slice(0, 4), ...source.tiles.slice(12, 16)]
      : base === undefined ? source.tiles : source.tiles.slice(base, base + 4);
    for (let y = top.y + 2; y <= top.y + 4; y++) for (let x = top.x; x + 16 <= top.x + top.width; x++) {
      if (x < 0 || y < 0 || x + 16 > W || y + 9 > H) continue;
      for (const stamp of stamps) {
        if (!stamp.anchors.every(p => close(at(pixels, x + p.x, y + p.y), y + p.y === overlayY ? coreBoundaryColor(p.color) : p.color))) continue;
        const hit = score(pixels, stamp, x, y, overlayY), key = x + ',' + y;
        if (hit.ratio >= 0.98 && hit.colors >= 3 && hit.sourcePoints > 0 && hit.sourceRatio >= 0.98 && hit.sourceColors >= 3 && (!found.has(key) || found.get(key)!.ratio < hit.ratio)) found.set(key, hit);
      }
    }
  }
  return { capture, ...geometry, tiles: [...found.values()] };
}
/** Use the strongest residual over fixed1px raster uncertainty: cannot hide stale art by shifting the probe. */
export function oldLoomBody(capture: LoomCapture, source: LoomSource, tile: LoomTile, dx: number, dy: number) {
  const pixels = screen(capture), stamp = source.tiles[tile.slot], results: LoomTile[] = [];
  const x = Math.round(tile.x + dx), y = Math.round(tile.y + dy);
  assert(x >= 1 && y >= 1 && x + 17 <= W && y + 10 <= H, 'Disappearance needs a fully visible old region');
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) results.push(score(pixels, stamp, x + ox, y + oy));
  let topPixels = 0;
  for (let sy = y - 4; sy <= y; sy++) for (let sx = x; sx < x + 16; sx++) if (topColors.has(at(pixels, sx, sy))) topPixels++;
  return { worst: results.sort((a, b) => b.ratio - a.ratio)[0], topPixels };
}
/** Actual low-alpha Core X: two rising pink ridges against neighbouring pixels, not an empty-area success. */
export function loomGhostCross(capture: LoomCapture, cx: number, top: number) {
  const pixels = screen(capture);
  let best = { a: 0, b: 0, x: 0, y: 0, pattern: 'unmatched', secondDiagonalOffset: null as -1 | 0 | null };
  const ridge = (x: number, y: number) => {
    const c = at(pixels, x, y), l = at(pixels, x - 2, y), r = at(pixels, x + 2, y);
    if (c < 0 || l < 0 || r < 0) return false;
    const red = c >>> 16, green = (c >>> 8) & 255, blue = c & 255;
    return red - Math.min(l >>> 16, r >>> 16) >= 8 && red - green >= 4 && blue - green >= 2;
  };
  // Two whole-line WebGL raster templates. Never move individual sample points.
  // Keep the original template first so an equally strong existing proof stays unchanged.
  for (const secondDiagonalOffset of [0, -1] as const) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = Math.round(cx) + dx, y = Math.round(top) + dy; let a = 0, b = 0;
    for (const row of [0, 1, 2, 3, 6, 7, 8]) {
      if (ridge(x - 4 + row, y + row)) a++;
      if (ridge(x + 4 - row + secondDiagonalOffset, y + row)) b++;
    }
    if (Math.min(a, b) > Math.min(best.a, best.b)) best = { a, b, x, y, secondDiagonalOffset, pattern: secondDiagonalOffset === 0 ? 'original-diagonals' : 'integer-second-diagonal' };
  }
  return best;
}
export async function loomEnvironmentFrames(page: Page, duration = 0): Promise<LoomCapture[]> {
  assert(Number.isFinite(duration) && duration >= 0 && duration <= 5000);
  return page.evaluate(ms => new Promise<LoomCapture[]>((resolve, reject) => {
    const captures: LoomCapture[] = []; let start: number | null = null;
    const take = (at: number) => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Expected native640x360 canvas');
        start ??= at; captures.push({ png: canvas.toDataURL('image/png'), at });
        if (at - start >= ms || captures.length >= 320) resolve(captures); else requestAnimationFrame(take);
      } catch (error) { reject(error); }
    };
    requestAnimationFrame(take);
  }), duration);
}
