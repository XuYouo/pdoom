import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

/** Independent screenshot observer. No production selectors, private game objects or simulation clocks. */
export interface LeviathanCapture { png: string; at: number }
interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface LeviathanSource { readonly image: string; readonly frames: readonly Rect[] }
export interface LeviathanWitness { frame: number; available: number; visible: number; matched: number; ratio: number }
export interface LeviathanBody {
  x: number; y: number; frame: number; flip: false; ratio: number; signature: number; witnesses: number;
  ink: number; cropped: number; sourceInk: number; visibleInk: number; maskedInk: number; fullRatio: number; colors: number;
  otherWitnesses: LeviathanWitness[];
}
export interface LeviathanCues {
  hp: number; closedCore: number; openCore: number; voidShots: number; turnLine: number; turnLineX: number | null;
  hero: number; platforms: number; swallow: number;
}
export interface LeviathanView { capture: LeviathanCapture; body: LeviathanBody | null; cues: LeviathanCues }
interface Raster { w: number; h: number; rgba: Buffer }
interface Point { x: number; y: number; color: number; id: number }
interface Pose { whole: Point[]; points: Point[]; pixels: Int32Array; differences: Point[][] }
interface Prepared { poses: Pose[]; anchors: Point[]; probes: Point[] }
const WIDTH = 640, HEIGHT = 360, SIZE = 160, PREFIX = 'data:image/png;base64,';
const MIN_RATIO = 0.98, MIN_VISIBLE = 0.90, MIN_INK = 10000, MIN_OTHER_VISIBLE = 40, MIN_OTHER_MATCHED = 30;
// Independently decoded frozen PNG pixels, not a renderer/generation output.
const SOURCE_RGBA_SHA256 = '5b4bc2b0b3520e47a61e8406a9af90e558b744d8f2391b60832dd8dd65ded6a9';
const FRAMES: readonly Rect[] = Object.freeze([
  { x: 0, y: 0, w: 160, h: 160 }, { x: 160, y: 0, w: 160, h: 160 },
  { x: 320, y: 0, w: 160, h: 160 }, { x: 480, y: 0, w: 160, h: 160 },
  { x: 640, y: 0, w: 160, h: 160 }, { x: 800, y: 0, w: 160, h: 160 },
  { x: 960, y: 0, w: 160, h: 160 }, { x: 1120, y: 0, w: 160, h: 160 },
].map(frame => Object.freeze(frame)));
const NAMES = ['leviathan 0.aseprite', 'leviathan 1.aseprite', 'leviathan 2.aseprite', 'leviathan 3.aseprite',
  'leviathan 4.aseprite', 'leviathan 5.aseprite', 'leviathan 6.aseprite', 'leviathan 7.aseprite'];
const FORBIDDEN_CUES = [0xd97757, 0xf4d298, 0xffdba1, 0xebaa7b, 0x0e251f, 0xffd69b, 0xb4e2c6,
  0x90c6b0, 0xb9a4e8, 0x79c9c1, 0xe3c58e, 0xf4a07d, 0xed926c, 0xefb18c];
const close = (a: number, b: number, tolerance = 2) => a >= 0 && b >= 0
  && Math.abs((a >>> 16) - (b >>> 16)) <= tolerance
  && Math.abs(((a >>> 8) & 255) - ((b >>> 8) & 255)) <= tolerance && Math.abs((a & 255) - (b & 255)) <= tolerance;
const rgb = (p: Buffer, at: number) => (p[at] << 16) | (p[at + 1] << 8) | p[at + 2];
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); return value >>> 0;
});
function crc32(bytes: Buffer) {
  let crc = 0xffffffff; for (const value of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 255]; return (crc ^ 0xffffffff) >>> 0;
}
/** Strict native RGB/RGBA8 PNG decoder. No scaling, palette fitting or browser-state lookup. */
function png(bytes: Buffer): Raster {
  assert(bytes.length >= 33 && bytes.length <= 8 * 1024 * 1024, 'PNG byte bounds');
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG magic');
  let offset = 8, width = 0, height = 0, channels = 0, ended = false; const chunks: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8), end = offset + length + 12;
    assert(end <= bytes.length, 'PNG chunk bounds'); assert.equal(bytes.readUInt32BE(end - 4), crc32(bytes.subarray(offset + 4, end - 4)), 'PNG CRC');
    if (offset === 8) assert.equal(kind, 'IHDR');
    if (kind === 'IHDR') {
      assert(offset === 8 && length === 13, 'Unique IHDR'); width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
      assert(width > 0 && height > 0 && width <= 2048 && height <= 2048, 'PNG dimensions');
      assert.equal(bytes[offset + 16], 8); assert([2, 6].includes(bytes[offset + 17]), 'RGB/RGBA8 required');
      assert.deepEqual([...bytes.subarray(offset + 18, offset + 21)], [0, 0, 0]); channels = bytes[offset + 17] === 6 ? 4 : 3;
    }
    if (kind === 'IDAT') chunks.push(bytes.subarray(offset + 8, end - 4));
    offset = end;
    if (kind === 'IEND') { assert.equal(length, 0); ended = true; break; }
  }
  assert(ended && offset === bytes.length && chunks.length > 0, 'Complete PNG');
  const stride = width * channels, raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: height * (stride + 1) });
  assert.equal(raw.length, height * (stride + 1)); const decoded = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; assert(filter <= 4, 'PNG scanline filter');
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, left = x >= channels ? decoded[at - channels] : 0;
      const up = y ? decoded[at - stride] : 0, corner = y && x >= channels ? decoded[at - stride - channels] : 0;
      const p = left + up - corner, dl = Math.abs(p - left), du = Math.abs(p - up), dc = Math.abs(p - corner);
      const predictor = [0, left, up, (left + up) >> 1, dl <= du && dl <= dc ? left : du <= dc ? up : corner][filter];
      decoded[at] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  if (channels === 4) return { w: width, h: height, rgba: decoded };
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { decoded.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = 255; }
  return { w: width, h: height, rgba };
}
function decode(uri: string) { assert(typeof uri === 'string' && uri.startsWith(PREFIX), 'Original PNG data URI required'); return png(Buffer.from(uri.slice(PREFIX.length), 'base64')); }
/** Only the literal144-domain one-pixel contact stroke, with its one-pixel raster edge uncertainty. */
function contact(x: number, y: number) {
  return (x >= 7 && x <= 152 && ((y >= 7 && y <= 9) || (y >= 150 && y <= 152)))
    || (y >= 7 && y <= 152 && ((x >= 7 && x <= 9) || (x >= 150 && x <= 152)));
}
let cached: { uri: string; prepared: Prepared } | null = null;
function prepare(source: LeviathanSource): Prepared {
  assert.deepEqual(source.frames, FRAMES, 'Literal8 native atlas rectangles');
  if (cached?.uri === source.image) return cached.prepared;
  const sheet = decode(source.image); assert.deepEqual([sheet.w, sheet.h], [1280, 160]);
  assert.equal(createHash('sha256').update(sheet.rgba).digest('hex'), SOURCE_RGBA_SHA256, 'Frozen source pixels changed');
  const poses: Pose[] = FRAMES.map((rect, frame) => {
    const whole: Point[] = [], pixels = new Int32Array(SIZE * SIZE).fill(-1);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const at = (y * sheet.w + rect.x + x) * 4, alpha = sheet.rgba[at + 3]; assert(alpha === 0 || alpha === 255, 'Hard source alpha');
      if (x >= 67 && x < 93 && y >= 65 && y < 95) assert.equal(alpha, 0, 'Core is transparent source, not a masked cue region');
      if (alpha === 255) { const color = rgb(sheet.rgba, at), id = y * SIZE + x; pixels[id] = color; whole.push({ x, y, color, id }); }
    }
    const colors = new Set(whole.map(p => p.color)); assert.equal(colors.size, frame < 4 ? 5 : 7);
    for (const color of colors) assert(FORBIDDEN_CUES.every(cue => !close(color, cue, 4)), 'Source cannot impersonate cue/hero/platform colors');
    assert(whole.length >= 12000, 'Full source body'); return { whole, points: whole.filter(p => !contact(p.x, p.y)), pixels, differences: [] };
  });
  for (const pose of poses) pose.differences = poses.map(other => pose.points.filter(p => !close(p.color, other.pixels[p.id], 4)));
  for (let frame = 0; frame < 8; frame++) for (let other = 0; other < 8; other++) {
    if (frame !== other) assert(poses[frame].differences[other].length >= MIN_OTHER_VISIBLE, 'Seven other-pose witnesses required');
  }
  const common = poses[0].points.filter(p => poses.every(pose => pose.pixels[p.id] === p.color));
  const groups = new Map<number, Point[]>();
  for (const p of common) { const values = groups.get(p.color) ?? []; values.push(p); groups.set(p.color, values); }
  const sorted = [...groups.values()].sort((a, b) => a.length - b.length);
  // Source-only rare anchors seed translations. Admission still checks ALL exposed source ink and all seven poses.
  const anchors = sorted.slice(0, 3).flatMap(g => [g[0], g[Math.floor(g.length / 2)], g[g.length - 1]]);
  const probes = sorted.flatMap(g => [g[0], g[Math.floor(g.length / 4)], g[Math.floor(g.length / 2)], g[Math.floor(g.length * 3 / 4)], g[g.length - 1]]);
  assert(anchors.length >= 9 && probes.length >= 20);
  const prepared = { poses, anchors, probes }; cached = { uri: source.image, prepared }; return prepared;
}
export async function leviathanSource(): Promise<LeviathanSource> {
  const [image, text] = await Promise.all([readFile('public/game/leviathan.png'), readFile('public/game/leviathan.json', 'utf8')]);
  const atlas = JSON.parse(text) as { frames: { filename: string; frame: Rect; rotated: boolean; trimmed: boolean; duration: number; sourceSize: { w: number; h: number }; spriteSourceSize: Rect }[];
    meta: { image: string; size: { w: number; h: number }; scale: string; frameTags: { name: string; from: number; to: number; direction: string }[] } };
  assert.deepEqual(atlas.meta.size, { w: 1280, h: 160 }); assert.equal(atlas.meta.image, 'leviathan.png'); assert.equal(atlas.meta.scale, '1');
  assert.deepEqual(atlas.frames.map(f => f.filename), NAMES);
  atlas.frames.forEach((f, i) => {
    assert.deepEqual(f.frame, FRAMES[i]); assert.equal(f.rotated, false); assert.equal(f.trimmed, false); assert.equal(f.duration, 100);
    assert.deepEqual(f.sourceSize, { w: 160, h: 160 }); assert.deepEqual(f.spriteSourceSize, { x: 0, y: 0, w: 160, h: 160 });
  });
  assert.deepEqual(atlas.meta.frameTags.map(({ name, from, to, direction }) => ({ name, from, to, direction })),
    [{ name: 'closed', from: 0, to: 3, direction: 'forward' }, { name: 'open', from: 4, to: 7, direction: 'forward' }]);
  const source = Object.freeze({ image: PREFIX + image.toString('base64'), frames: FRAMES }); prepare(source); return source;
}

const inside = (x: number, y: number) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
const at = (pixels: Int32Array, x: number, y: number) => inside(x, y) ? pixels[y * WIDTH + x] : -1;
function register(pixels: Int32Array, source: Prepared): LeviathanBody | null {
  const locations = new Map<number, number[]>(), origins = new Map<number, { x: number; y: number }>();
  for (const anchor of source.anchors) {
    let found = locations.get(anchor.color);
    if (!found) {
      found = []; for (let i = 0; i < pixels.length; i++) if (close(pixels[i], anchor.color)) found.push(i); locations.set(anchor.color, found);
    }
    for (const index of found) {
      const x = index % WIDTH - anchor.x, y = Math.floor(index / WIDTH) - anchor.y;
      if (x <= -SIZE || x >= WIDTH || y <= -SIZE || y >= HEIGHT) continue;
      const key = (y + SIZE) * 800 + x + SIZE; origins.set(key, { x, y });
    }
  }
  const matches: LeviathanBody[] = [];
  for (const { x, y } of origins.values()) {
    // Conservative candidate pruning only; no candidate passes without the exact full checks below.
    let probeHits = 0; const probeColors = new Set<number>();
    for (const p of source.probes) if (close(at(pixels, x + p.x, y + p.y), p.color)) { probeHits++; probeColors.add(p.color); }
    if (probeHits < 12 || probeColors.size < 3) continue;
    for (let frame = 0; frame < 8; frame++) {
      const pose = source.poses[frame], wholeVisible = pose.whole.filter(p => inside(x + p.x, y + p.y));
      if (wholeVisible.length / pose.whole.length < MIN_VISIBLE) continue;
      const registered = pose.points.filter(p => inside(x + p.x, y + p.y)); if (registered.length < MIN_INK) continue;
      const matched = new Uint8Array(SIZE * SIZE), colors = new Set<number>(); let hits = 0, misses = 0;
      for (const p of registered) {
        if (close(at(pixels, x + p.x, y + p.y), p.color)) { hits++; matched[p.id] = 1; colors.add(p.color); }
        else if (++misses > Math.floor(registered.length * (1 - MIN_RATIO) + 1e-9)) break;
      }
      const ratio = hits / registered.length; if (hits < MIN_INK || ratio < MIN_RATIO || colors.size < 3) continue;
      const otherWitnesses: LeviathanWitness[] = [];
      for (let other = 0; other < 8; other++) if (other !== frame) {
        const all = pose.differences[other], visible = all.filter(p => inside(x + p.x, y + p.y));
        const count = visible.reduce((sum, p) => sum + matched[p.id], 0);
        otherWitnesses.push({ frame: other, available: all.length, visible: visible.length, matched: count, ratio: count / visible.length });
      }
      if (otherWitnesses.length !== 7 || otherWitnesses.some(w => w.visible < MIN_OTHER_VISIBLE || w.matched < MIN_OTHER_MATCHED || w.ratio < MIN_RATIO)) continue;
      const masked = wholeVisible.filter(p => contact(p.x, p.y));
      const fullHits = hits + masked.reduce((sum, p) => sum + Number(close(at(pixels, x + p.x, y + p.y), p.color)), 0);
      matches.push({ x, y, frame, flip: false, ratio, signature: Math.min(...otherWitnesses.map(w => w.ratio)),
        witnesses: Math.min(...otherWitnesses.map(w => w.matched)), ink: hits, cropped: 1 - wholeVisible.length / pose.whole.length,
        sourceInk: pose.whole.length, visibleInk: wholeVisible.length, maskedInk: masked.length, fullRatio: fullHits / wholeVisible.length,
        colors: colors.size, otherWitnesses });
    }
  }
  // A scene has one body; ambiguous native bodies or poses are not proof of the intended one.
  return matches.length === 1 ? matches[0] : null;
}
function cues(pixels: Int32Array, body: LeviathanBody | null): LeviathanCues {
  const count = (color: number, rect?: { x: number; y: number; w: number; h: number }) => {
    if (!rect) { let total = 0; for (const p of pixels) if (close(p, color)) total++; return total; }
    let total = 0; for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (close(at(pixels, x, y), color)) total++; return total;
  };
  let turnLine = 0, lineX = 0;
  for (let x = 0; x < WIDTH; x++) {
    let run = 0, longest = 0;
    for (let y = 0; y < HEIGHT; y++) { run = close(pixels[y * WIDTH + x], 0xf4d298) ? run + 1 : 0; longest = Math.max(longest, run); }
    if (longest >= 20) { turnLine += longest; lineX += x * longest; }
  }
  // Only registered local core and HP areas count. The source has no opaque core/cue colors.
  const core = body && { x: body.x + 67, y: body.y + 65, w: 26, h: 30 };
  const hp = body && { x: body.x + 48, y: body.y - 2, w: 64, h: 4 };
  return { hp: hp ? count(0xebaa7b, hp) : 0, closedCore: core ? count(0x0e251f, core) : 0, openCore: core ? count(0xffd69b, core) : 0,
    voidShots: count(0xb4e2c6), turnLine, turnLineX: turnLine ? lineX / turnLine : null, hero: count(0xd97757),
    platforms: [0xb9a4e8, 0x79c9c1, 0xe3c58e, 0x90c6b0, 0xf4a07d, 0xed926c].reduce((sum, color) => sum + count(color), 0), swallow: count(0xefb18c) };
}
/** Pure supplied-PNG analysis. OFFLINE composites test only this oracle, never native gameplay. */
export function inspectLeviathanPng(capture: LeviathanCapture, source: LeviathanSource): LeviathanView {
  assert(Number.isFinite(capture.at) && capture.at >= 0, 'Capture rAF timestamp');
  const prepared = prepare(source), image = decode(capture.png); assert.deepEqual([image.w, image.h], [WIDTH, HEIGHT], 'Never rescale a non-native capture');
  const pixels = new Int32Array(WIDTH * HEIGHT);
  for (let i = 0; i < pixels.length; i++) pixels[i] = image.rgba[i * 4 + 3] === 255 ? rgb(image.rgba, i * 4) : -1;
  const body = register(pixels, prepared); return { capture, body, cues: cues(pixels, body) };
}
/** Read actual backing pixels within rAF; browser timestamp is metadata, never a pose oracle. */
export async function leviathanFrames(page: Page, duration = 0): Promise<LeviathanCapture[]> {
  assert(Number.isFinite(duration) && duration >= 0 && duration <= 8000, 'Bounded capture duration');
  return page.evaluate(ms => new Promise<LeviathanCapture[]>((resolve, reject) => {
    const captures: LeviathanCapture[] = []; let start: number | null = null;
    const take = (at: number) => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Expected actual640x360 backing canvas');
        start ??= at; captures.push({ png: canvas.toDataURL('image/png'), at });
        if (at - start >= ms || captures.length >= 540) resolve(captures); else requestAnimationFrame(take);
      } catch (error) { reject(error); }
    };
    requestAnimationFrame(take);
  }), duration);
}
export async function inspectLeviathan(page: Page, captures: readonly LeviathanCapture[], source: LeviathanSource): Promise<LeviathanView[]> {
  const size = await page.locator('canvas').first().evaluate(canvas => {
    if (!(canvas instanceof HTMLCanvasElement)) throw Error('Missing real canvas'); return [canvas.width, canvas.height];
  });
  assert.deepEqual(size, [WIDTH, HEIGHT], 'Expected native640x360 game backing canvas');
  return captures.map(capture => inspectLeviathanPng(capture, source));
}
