import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

interface Raster { width: number; height: number; rgba: Buffer }
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


// Source-only image observer: literal frozen PNG cuts, never a production plan/selector.
export interface OmegaCapture { png: string; at: number; omega: string; objective: string; hud: string[] }
interface Point { x: number; y: number; color: number }
interface Stamp { slot: number; width: number; height: number; points: Point[]; anchors: Point[]; colors: number; flipped: boolean }
export interface OmegaSource { tiles: Stamp[]; props: Stamp[]; hero: Stamp[]; foom: Stamp[]; hashes: Record<string, string> }
export interface NativeHit {
  slot: number; x: number; y: number; width: number; height: number; ink: number; matched: number;
  ratio: number; colors: number; flipped: boolean;
}
export interface HeroHit extends NativeHit { centerX: number; feet: number }
export interface CoreSpan { x: number; y: number; width: number; color: number }
export interface FloorColumn { x: number; top: NativeHit; body: NativeHit; foot: NativeHit }
export interface OmegaView {
  capture: OmegaCapture; floor: CoreSpan[]; observers: CoreSpan[]; columns: FloorColumn[];
  observerTiles: NativeHit[]; props: NativeHit[]; hero: HeroHit | null;
}
const W = 640, H = 360, PREFIX = 'data:image/png;base64,';
const close = (a: number, b: number, tolerance = 2) => a >= 0 && b >= 0
  && Math.abs((a >>> 16) - (b >>> 16)) <= tolerance
  && Math.abs(((a >>> 8) & 255) - ((b >>> 8) & 255)) <= tolerance
  && Math.abs((a & 255) - (b & 255)) <= tolerance;
const color = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const at = (pixels: Int32Array, x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H ? pixels[y * W + x] : -1;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function stamp(image: Raster, slot: number, visibleHeight = image.height): Stamp {
  const points: Point[] = [], groups = new Map<number, Point[]>();
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4, alpha = image.rgba[i + 3]; assert(alpha === 0 || alpha === 255);
    if (!alpha || y >= visibleHeight) continue;
    const p = { x, y, color: color(image.rgba[i], image.rgba[i + 1], image.rgba[i + 2]) };
    points.push(p); const group = groups.get(p.color) ?? []; group.push(p); groups.set(p.color, group);
  }
  assert(points.length > 0 && groups.size >= 2, 'Nonempty multicolour real source required');
  const anchors = [...groups.values()].sort((a, b) => a.length - b.length).slice(0, 3)
    .flatMap(group => [group[0], group[Math.floor(group.length / 2)], group[group.length - 1]]);
  return { slot, width: image.width, height: image.height, points, anchors, colors: groups.size, flipped: false };
}
function flipped(s: Stamp): Stamp {
  return { ...s, flipped: true, points: s.points.map(p => ({ ...p, x: s.width - 1 - p.x })),
    anchors: s.anchors.map(p => ({ ...p, x: s.width - 1 - p.x })) };
}
let loaded: Promise<OmegaSource> | undefined;
export function omegaEnvironmentSource() { return loaded ??= loadSource(); }
async function loadSource(): Promise<OmegaSource> {
  const expected: Record<string, string> = {
    'assets/source/omega-tiles.aseprite': 'ace8f39816c4bcae96218c43be5864e2ae6e47a1058e62c0d2d5dd1caab02c95',
    'assets/source/omega-props.aseprite': '81ee2b1cb70fed72af1c04dd42f47545140a06aa02b26fd664b49d091fa32d2d',
    'public/game/omega-terrain.png': '80314bb9f3e3d5a75ed11cfdb2effde5b80f877ee6f7dc33335367c77ae0e605',
    'public/game/omega-terrain.json': '95b6c2ac8ba248a2daf3eb884bdad04adc6b0e8a9af5e75fe6a8f250043789c7',
    'public/game/omega-props.png': 'bf900b539504a7404fb2885b4577e91ca214391bfe4161ac6344ec4960a7f7b4',
    'public/game/omega-props.json': 'e6de214a11320109f241d7325c08fef7dddcbafe9199f4f9429f50a110c04aa6',
  };
  const bytes = new Map<string, Buffer>(), hashes: Record<string, string> = {};
  for (const [name, digest] of Object.entries(expected)) {
    const file = await readFile(name); hashes[name] = sha(file); assert.equal(hashes[name], digest, name); bytes.set(name, file);
  }
  const terrain = png(bytes.get('public/game/omega-terrain.png')!), props = png(bytes.get('public/game/omega-props.png')!);
  assert.deepEqual([terrain.width, terrain.height, props.width, props.height], [96, 96, 384, 128]);
  const atlas = JSON.parse(bytes.get('public/game/omega-props.json')!.toString()) as { frames: { filename: string; frame: unknown }[] };
  assert.equal(atlas.frames.length, 6);
  atlas.frames.forEach((frame, i) => {
    assert.equal(frame.filename, `omega-props ${i}.aseprite`);
    assert.deepEqual(frame.frame, { x: i * 64, y: 0, w: 64, h: 128 });
  });
  const tiles = Array.from({ length: 32 }, (_, i) => stamp(crop(terrain, i % 6 * 16, Math.floor(i / 6) * 16, 16, 16), i));
  const furniture = Array.from({ length: 6 }, (_, i) => stamp(crop(props, i * 64, 0, 64, 128), i, i === 5 ? 120 : 128));
  // Only the mirror's already-agreed lower rail y120..123 is hidden by real floor320.
  const actors: Stamp[][] = [];
  for (const form of ['aligned', 'foom']) {
    const name = `public/game/clawd-${form}.png`, file = await readFile(name), image = png(file); hashes[name] = sha(file);
    assert.deepEqual([image.width, image.height], [704, 32]);
    actors.push(Array.from({ length: 22 }, (_, i) => stamp(crop(image, i * 32, 0, 32, 32), i)).flatMap(s => [s, flipped(s)]));
  }
  return { tiles, props: furniture, hero: actors[0], foom: actors[1], hashes };
}
let cachedPng = '', cachedPixels = new Int32Array(0), cachedIndex = new Map<number, number[]>();
function screen(capture: OmegaCapture) {
  assert(Number.isFinite(capture.at) && capture.at >= 0 && capture.png.startsWith(PREFIX));
  if (capture.png === cachedPng) return cachedPixels;
  const image = png(Buffer.from(capture.png.slice(PREFIX.length), 'base64'));
  assert.deepEqual([image.width, image.height], [W, H], 'Native640x360 backing capture, never rescaled');
  const pixels = new Int32Array(W * H), index = new Map<number, number[]>();
  for (let i = 0; i < pixels.length; i++) {
    const p = i * 4, c = image.rgba[p + 3] === 255 ? color(image.rgba[p], image.rgba[p + 1], image.rgba[p + 2]) : -1;
    pixels[i] = c; const group = index.get(c) ?? []; group.push(i); index.set(c, group);
  }
  cachedPng = capture.png; cachedPixels = pixels; cachedIndex = index; return pixels;
}
function score(pixels: Int32Array, s: Stamp, x: number, y: number, width = s.width, height = s.height): NativeHit {
  const points = s.points.filter(p => p.x < width && p.y < height); assert(points.length > 0);
  let matched = 0; const colors = new Set<number>();
  for (const p of points) if (close(at(pixels, x + p.x, y + p.y), p.color)) { matched++; colors.add(p.color); }
  return { slot: s.slot, x, y, width, height, ink: points.length, matched, ratio: matched / points.length, colors: colors.size, flipped: s.flipped };
}
const native = (hit: NativeHit, s: Stamp) => hit.ratio >= 0.98 && hit.colors >= Math.min(3, s.colors);
function find(pixels: Int32Array, s: Stamp, yOnly?: number): NativeHit[] {
  const a = s.anchors[0], result: NativeHit[] = [];
  for (const index of cachedIndex.get(a.color) ?? []) {
    const x = index % W - a.x, y = Math.floor(index / W) - a.y;
    if (x < 0 || y < 0 || x + s.width > W || y + s.height > H || yOnly !== undefined && y !== yOnly) continue;
    if (!s.anchors.every(p => close(at(pixels, x + p.x, y + p.y), p.color))) continue;
    const hit = score(pixels, s, x, y); if (native(hit, s)) result.push(hit);
  }
  return result;
}
function spans(pixels: Int32Array, y: number, color: number): CoreSpan[] {
  const result: CoreSpan[] = [];
  for (let x = 0; x < W;) {
    if (at(pixels, x, y) !== color) { x++; continue; }
    const start = x; while (x < W && at(pixels, x, y) === color) x++;
    if (x - start >= 20) result.push({ x: start, y, width: x - start, color });
  }
  return result;
}
function hero(pixels: Int32Array, source: OmegaSource): HeroHit | null {
  const markers = cachedIndex.get(0xd4b0ff) ?? [];
  const hits = source.hero.flatMap(s => find(pixels, s));
  const candidates = hits.filter(hit => !markers.some(i => Math.abs(i % W - hit.x - 16) < 22
    && Math.abs(Math.floor(i / W) + 66 - hit.y - 27) < 18));
  const best = candidates.sort((a, b) => b.ratio - a.ratio || b.matched - a.matched)[0];
  return best ? { ...best, centerX: best.x + 16, feet: best.y + 27 } : null;
}
export function inspectOmegaEnvironment(capture: OmegaCapture, source: OmegaSource): OmegaView {
  const pixels = screen(capture), floor = spans(pixels, 320, 0x90c6b0), observers = spans(pixels, 260, 0x8caa83);
  const columns: FloorColumn[] = [], seen = new Set<number>();
  for (const slot of [0, 1, 2, 3, 12, 13, 14, 15]) for (const top of find(pixels, source.tiles[slot], 320)) {
    if (seen.has(top.x)) continue;
    const body = score(pixels, source.tiles[slot + 4], top.x, 336), foot = score(pixels, source.tiles[slot + 8], top.x, 352, 16, 8);
    if (!native(body, source.tiles[slot + 4]) || !native(foot, source.tiles[slot + 8])) continue;
    if (!floor.some(span => top.x >= span.x - 1 && top.x + 16 <= span.x + span.width + 1)) continue;
    columns.push({ x: top.x, top, body, foot }); seen.add(top.x);
  }
  const observerTiles = source.tiles.slice(24, 28).flatMap(s => find(pixels, s, 260))
    .filter(hit => observers.some(span => hit.x >= span.x - 1 && hit.x + 16 <= span.x + span.width + 1));
  const props = source.props.flatMap(s => find(pixels, s, 200));
  return { capture, floor, observers, columns: columns.sort((a, b) => a.x - b.x), observerTiles, props, hero: hero(pixels, source) };
}
export function sourceResidual(capture: OmegaCapture, source: OmegaSource, hit: NativeHit, kind: 'prop' | 'tile') {
  const pixels = screen(capture), s = (kind === 'prop' ? source.props : source.tiles)[hit.slot];
  const candidates: NativeHit[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    candidates.push(score(pixels, s, hit.x + dx, hit.y + dy, hit.width, hit.height));
  }
  return candidates.sort((a, b) => b.ratio - a.ratio)[0];
}
export function nativeTail(capture: OmegaCapture, source: OmegaSource, slot: number, x: number, y: number, width: number, height: number) {
  assert(width > 0 && width <= 16 && [8, 12, 16].includes(height));
  const pixels = screen(capture), results: NativeHit[] = [];
  for (const dx of [-1, 0, 1]) results.push(score(pixels, source.tiles[slot], Math.round(x) + dx, y, width, height));
  return results.sort((a, b) => b.ratio - a.ratio)[0];
}
export async function omegaEnvironmentFrames(page: Page, duration = 0): Promise<OmegaCapture[]> {
  assert(Number.isFinite(duration) && duration >= 0 && duration <= 4500);
  return page.evaluate(ms => new Promise<OmegaCapture[]>((resolve, reject) => {
    const frames: OmegaCapture[] = []; let start: number | null = null, last = -Infinity;
    const take = (at: number) => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Native640x360 canvas missing');
        start ??= at;
        if (at - last >= 32 || at - start >= ms) {
          frames.push({ png: canvas.toDataURL('image/png'), at,
            omega: document.querySelector('.omega-readout')?.textContent ?? '',
            objective: document.querySelector('.objective')?.textContent ?? '',
            hud: [...document.querySelectorAll('.hud-cell')].map(node => node.textContent ?? '') }); last = at;
        }
        if (at - start >= ms) resolve(frames); else requestAnimationFrame(take);
      } catch (error) { reject(error); }
    };
    requestAnimationFrame(take);
  }), duration);
}


function blend(base: number, overlay: number, alpha: number): number {
  return color(Math.round((base >>> 16) * (1 - alpha) + (overlay >>> 16) * alpha),
    Math.round(((base >>> 8) & 255) * (1 - alpha) + ((overlay >>> 8) & 255) * alpha),
    Math.round((base & 255) * (1 - alpha) + (overlay & 255) * alpha));
}
export function colorCount(capture: OmegaCapture, rect: { x: number; y: number; width: number; height: number }, colors: readonly number[]) {
  const pixels = screen(capture); let found = 0;
  assert(Object.values(rect).every(Number.isInteger));
  for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) {
    if (colors.includes(at(pixels, x, y))) found++;
  }
  return found;
}
export function roomEvidence(view: OmegaView) {
  const chair = view.props.find(p => p.slot === 3), mirror = view.props.find(p => p.slot === 5);
  const door = view.props.find(p => p.slot === 4);
  const camera = mirror ? 2993 - mirror.x : chair ? 2768 - chair.x : door ? 2468 - door.x : null;
  const oldColors = [0x8e9b91, 0xaebbb0, 0x87918d, 0x586a6b, 0xa6aca0, 0x2c4651, 0x1f343f, 0xc6bea9];
  const old = (p: NativeHit) => colorCount(view.capture, { x: p.x + 8, y: 220, width: 48, height: 99 }, oldColors);
  const closedLeaf = door ? colorCount(view.capture, { x: door.x + 18, y: 232, width: 24, height: 80 }, [0x5f7774]) : 0;
  const openLeaf = door ? colorCount(view.capture, { x: door.x + 17, y: 230, width: 3, height: 86 }, [0x334d50]) : 0;
  return { camera, chair, mirror, door, oldChair: chair ? old(chair) : null,
    oldMirror: mirror ? old(mirror) : null, oldDoor: door ? old(door) : null, closedLeaf, openLeaf };
}
export function reflectionEvidence(capture: OmegaCapture, baseline: OmegaCapture, source: OmegaSource,
  mirror: NativeHit, alpha: 0.45 | 0.9) {
  const actual = screen(capture), base = screen(baseline), x = mirror.x + 16, y = 293;
  const stamps = (alpha === 0.45 ? source.hero : source.foom).filter(s => s.flipped);
  const results = stamps.map(s => {
    let matched = 0, changed = 0; const colors = new Set<number>();
    for (const p of s.points) {
      const background = at(base, x + p.x, y + p.y), value = at(actual, x + p.x, y + p.y);
      const expected = blend(background, p.color, alpha);
      if (close(value, expected)) { matched++; colors.add(p.color); }
      if (!close(value, background)) changed++;
    }
    return { slot: s.slot, flipped: s.flipped, x, y, alpha, ink: s.points.length, matched, ratio: matched / s.points.length, changed, colors: colors.size };
  });
  return results.sort((a, b) => b.ratio - a.ratio)[0];
}
export interface ScanTarget { x: number; feet: number }
export function scanFootEvidence(view: OmegaView, source: OmegaSource, target: ScanTarget, radius: 5 | 8) {
  const pixels = screen(view.capture), rect = { x: target.x - 20 - radius, y: target.feet - 26 - radius,
    width: 40 + radius * 2, height: 30 + radius * 2 };
  // Native2px bottom stroke occupies bottom-1 and bottom; bottom-2 is still interior.
  const rowEnd = rect.y + rect.height - 2, roi = { x: rect.x + 3, y: 324, width: rect.width - 6, height: rowEnd - 324 + 1 };
  assert.equal(target.feet, 320); assert([329, 332].includes(rect.y + rect.height));
  const residues = new Map<number, number>();
  for (const column of view.columns) residues.set(column.x % 16, (residues.get(column.x % 16) ?? 0) + 1);
  const residue = [...residues].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const family = view.columns.filter(c => c.top.slot >= 12).length > view.columns.length / 2 ? 12 : 0;
  const evaluate = (kind: 'warning' | 'active') => {
    const tint = kind === 'warning' ? 0xf4d298 : 0xef9fca, alpha = kind === 'warning' ? 0.1 : 0.3;
    let ink = 0, matched = 0, rawMatched = 0; const colors = new Set<number>();
    const tiles: { slot: number; x: number; ink: number; matched: number; rawMatched: number }[] = [];
    if (residue !== null) for (let x = residue - 16; x < W; x += 16) {
      if (x + 16 <= roi.x || x >= roi.x + roi.width) continue;
      const options = source.tiles.slice(family + 1, family + 3).map(s => {
        const points = s.points.filter(p => x + p.x >= roi.x && x + p.x < roi.x + roi.width
          && p.y + 320 >= roi.y && p.y + 320 < roi.y + roi.height);
        let matches = 0, raw = 0; const hues = new Set<number>();
        for (const p of points) {
          const value = at(pixels, x + p.x, 320 + p.y), expected = blend(p.color, tint, alpha);
          if (close(value, expected)) { matches++; hues.add(p.color); }
          if (close(value, p.color)) raw++;
        }
        return { slot: s.slot, x, ink: points.length, matched: matches, rawMatched: raw, hues };
      }).sort((a, b) => b.matched - a.matched);
      const best = options[0]; ink += best.ink; matched += best.matched; rawMatched += best.rawMatched;
      best.hues.forEach(c => colors.add(c)); tiles.push({ slot: best.slot, x, ink: best.ink, matched: best.matched, rawMatched: best.rawMatched });
    }
    return { kind, tint, alpha, ink, matched, ratio: ink ? matched / ink : 0,
      rawMatched, rawRatio: ink ? rawMatched / ink : 0, colors: colors.size, tiles };
  };
  return { target, rect, roi, borderExclusion: 2, residue, family, hero: view.hero,
    stationary: !!view.hero && Math.abs(view.hero.centerX - target.x) <= 1 && view.hero.feet === target.feet,
    sourceColumns: view.columns.length, warning: evaluate('warning'), active: evaluate('active') };
}
