import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { inspectLoomEnvironment, loomEnvironmentSource, type LoomSource, type LoomTile } from './loom-environment-pixels';

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



// Independent actual-PNG observer. No production selector/plan, World, clock or Phaser access.
export type PickupKind = 'token' | 'compute' | 'heal';
export interface PickupCapture { png: string; at: number; hud: string[]; objective: string; title: string; notice: string }
interface Point { x: number; y: number; color: number }
interface Box { x: number; y: number; width: number; height: number }
interface Stamp { slot: number; width: number; height: number; points: Point[]; anchors: Point[]; colors: number; flipped: boolean; box: Box }
export interface PickupSource { items: Stamp[]; hero: Stamp[]; terrain: Stamp[]; ledges: Stamp[]; loom: LoomSource; hashes: Record<string, string> }
export interface PixelHit { slot: number; x: number; y: number; width: number; height: number; ink: number; matched: number; ratio: number; colors: number; flipped: boolean }
export interface ItemHit extends PixelHit { kind: PickupKind; centerX: number; centerY: number; box: Box }
export interface HeroHit extends PixelHit { centerX: number; feet: number }
export interface Support extends Box { kind: string }
export interface PickupView { capture: PickupCapture; hero: HeroHit | null; items: ItemHit[]; terrain: (PixelHit | LoomTile)[]; supports: Support[] }
const W = 640, H = 360, PREFIX = 'data:image/png;base64,', KINDS: PickupKind[] = ['token', 'compute', 'heal'];
const close = (a: number, b: number) => a >= 0 && b >= 0 && Math.abs((a >>> 16) - (b >>> 16)) <= 2
  && Math.abs(((a >>> 8) & 255) - ((b >>> 8) & 255)) <= 2 && Math.abs((a & 255) - (b & 255)) <= 2;
const color = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const at = (pixels: Int32Array, x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H ? pixels[y * W + x] : -1;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function stamp(image: Raster, slot: number): Stamp {
  const points: Point[] = [], groups = new Map<number, Point[]>();
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4, alpha = image.rgba[i + 3]; assert(alpha === 0 || alpha === 255);
    if (!alpha) continue;
    const p = { x, y, color: color(image.rgba[i], image.rgba[i + 1], image.rgba[i + 2]) };
    points.push(p); const group = groups.get(p.color) ?? []; group.push(p); groups.set(p.color, group);
  }
  assert(points.length > 0, 'Nonempty literal source');
  const anchors = [...groups.values()].sort((a, b) => a.length - b.length).slice(0, 3)
    .flatMap(group => [group[0], group[Math.floor(group.length / 2)], group[group.length - 1]]);
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  const box = { x, y, width: Math.max(...points.map(p => p.x)) - x + 1, height: Math.max(...points.map(p => p.y)) - y + 1 };
  return { slot, width: image.width, height: image.height, points, anchors, colors: groups.size, flipped: false, box };
}
function flipped(s: Stamp): Stamp {
  return { ...s, flipped: true, points: s.points.map(p => ({ ...p, x: s.width - 1 - p.x })),
    anchors: s.anchors.map(p => ({ ...p, x: s.width - 1 - p.x })), box: { ...s.box, x: s.width - s.box.x - s.box.width } };
}
let loaded: Promise<PickupSource> | undefined;
export function pickupSource() { return loaded ??= loadSource(); }
async function loadSource(): Promise<PickupSource> {
  const frozen: Record<string, string> = {
    'assets/source/pickup-items.aseprite': '8dbb67cb410b950aa4bb07486ad654216755669cb4dc3162b23400d67b780e08',
    'public/game/pickup-items.png': '11956e3e6df80d034490ebe2b2efc73cd984646c491644e7cb7effa530c2d358',
    'public/game/pickup-items.json': 'bd20d7af35385dc7747fec219b067dc128dad8b5088488ab309f42c675ed6068',
  };
  const hashes: Record<string, string> = {}, bytes = new Map<string, Buffer>();
  for (const [name, digest] of Object.entries(frozen)) {
    const b = await readFile(name); hashes[name] = sha(b); assert.equal(hashes[name], digest, name); bytes.set(name, b);
  }
  const image = png(bytes.get('public/game/pickup-items.png')!); assert.deepEqual([image.width, image.height], [96, 32]);
  const atlas = JSON.parse(bytes.get('public/game/pickup-items.json')!.toString()) as { frames: { filename: string; frame: unknown }[] };
  assert.equal(atlas.frames.length, 3);
  atlas.frames.forEach((f, i) => { assert.equal(f.filename, `pickup-items ${i}.aseprite`); assert.deepEqual(f.frame, { x: i * 32, y: 0, w: 32, h: 32 }); });
  const items = KINDS.map((_, i) => stamp(crop(image, i * 32, 0, 32, 32), i));
  assert.deepEqual(items.map(s => s.box), [{ x: 11, y: 11, width: 10, height: 10 }, { x: 8, y: 7, width: 16, height: 18 }, { x: 9, y: 9, width: 14, height: 14 }]);
  for (const item of items) { assert(item.colors >= 3); assert(!item.points.some(p => p.color === 0xd97757)); }
  const read = async (name: string) => { const b = await readFile(name); hashes[name] = sha(b); return png(b); };
  const clawd = await read('public/game/clawd-aligned.png'); assert.deepEqual([clawd.width, clawd.height], [704, 32]);
  const hero = Array.from({ length: 22 }, (_, i) => stamp(crop(clawd, i * 32, 0, 32, 32), i)).flatMap(s => [s, flipped(s)]);
  const chapter = await read('public/game/chapter-one-terrain.png'); assert.deepEqual([chapter.width, chapter.height], [96, 96]);
  const terrain = Array.from({ length: 16 }, (_, i) => stamp(crop(chapter, i % 6 * 16, Math.floor(i / 6) * 16, 16, 16), i));
  const ledges = Array.from({ length: 6 }, (_, n) => { const i = n + 16; return stamp(crop(chapter, i % 6 * 16, Math.floor(i / 6) * 16, 16, 12), i); });
  return { items, hero, terrain, ledges, loom: await loomEnvironmentSource(), hashes };
}
let cachedPng = '', cachedPixels = new Int32Array(0), cachedIndex = new Map<number, number[]>();
function screen(capture: PickupCapture) {
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
function score(pixels: Int32Array, s: Stamp, x: number, y: number, width = s.width, height = s.height): PixelHit {
  const points = s.points.filter(p => p.x < width && p.y < height); assert(points.length > 0);
  let matched = 0; const colors = new Set<number>();
  for (const p of points) if (close(at(pixels, x + p.x, y + p.y), p.color)) { matched++; colors.add(p.color); }
  return { slot: s.slot, x, y, width, height, ink: points.length, matched, ratio: matched / points.length, colors: colors.size, flipped: s.flipped };
}
const native = (hit: PixelHit) => hit.ratio >= 0.98 && hit.colors >= 3;
function find(pixels: Int32Array, s: Stamp, yOnly?: number): PixelHit[] {
  const a = s.anchors[0], result: PixelHit[] = [];
  for (const index of cachedIndex.get(a.color) ?? []) {
    const x = index % W - a.x, y = Math.floor(index / W) - a.y;
    if (x + s.box.x < 0 || y + s.box.y < 0 || x + s.box.x + s.box.width > W
      || y + s.box.y + s.box.height > H || yOnly !== undefined && y !== yOnly) continue;
    if (!s.anchors.every(p => close(at(pixels, x + p.x, y + p.y), p.color))) continue;
    const hit = score(pixels, s, x, y); if (native(hit)) result.push(hit);
  }
  return result;
}

function mergedSupports(tiles: PixelHit[], y: number): Support[] {
  const supports: Support[] = [];
  for (const tile of tiles.filter(t => t.y === y).sort((a, b) => a.x - b.x)) {
    const last = supports[supports.length - 1];
    if (last && tile.x <= last.x + last.width + 16) last.width = Math.max(last.width, tile.x + 16 - last.x);
    else supports.push({ kind: y === 320 ? 'floor' : 'ledge', x: tile.x, y, width: 16, height: y === 320 ? 40 : 12 });
  }
  return supports;
}
export function inspectPickups(capture: PickupCapture, source: PickupSource, stage: 1 | 4): PickupView {
  const pixels = screen(capture), actors = source.hero.flatMap(s => find(pixels, s));
  const actor = actors.sort((a, b) => b.ratio - a.ratio || b.matched - a.matched)[0];
  const hero = actor ? { ...actor, centerX: actor.x + 16, feet: actor.y + 27 } : null;
  const items = source.items.flatMap(s => find(pixels, s).map(hit => ({ ...hit, kind: KINDS[hit.slot], centerX: hit.x + 16, centerY: hit.y + 16,
    box: { ...s.box, x: s.box.x + hit.x, y: s.box.y + hit.y } })));
  if (stage === 4) {
    const loom = inspectLoomEnvironment(capture, source.loom);
    return { capture, hero, items, terrain: loom.tiles, supports: loom.tops.map(top => ({ ...top, height: 12 })) };
  }
  const terrain = source.terrain.flatMap(s => find(pixels, s, 320));
  for (const y of [192, 196, 202, 250, 252, 254, 258, 260]) for (const s of source.ledges) terrain.push(...find(pixels, s, y));
  const unique = [...new Map(terrain.map(t => [`${t.x}/${t.y}`, t])).values()];
  return { capture, hero, items, terrain: unique, supports: [...new Set(unique.map(t => t.y))].flatMap(y => mergedSupports(unique, y)) };
}
export const C1 = {
  token1: { kind: 'token', x: 290, y: 240, amount: 12 }, compute1: { kind: 'compute', x: 477, y: 180, amount: 28 },
  token2: { kind: 'token', x: 685, y: 233, amount: 16 }, compute2: { kind: 'compute', x: 1065, y: 172, amount: 28 },
  heal1: { kind: 'heal', x: 1380, y: 298, amount: 28 },
} as const;
export type C1Id = keyof typeof C1;
export function referenceItem(view: PickupView, id: C1Id) {
  const expected = C1[id], matches = view.items.filter(hit => hit.kind === expected.kind && Math.abs(hit.centerY - expected.y) <= 3);
  assert.equal(matches.length, 1, `Exactly one complete source reference ${id}`);
  const hit = matches[0], scrollX = expected.x - hit.centerX;
  assert(scrollX >= -1 && scrollX <= 2241); return { hit, scrollX, scrollY: 0 };
}
export function c1Hero(view: PickupView, id: C1Id) {
  assert(view.hero, 'Actual native hero required for navigation'); const reference = referenceItem(view, id);
  return { x: view.hero.centerX + reference.scrollX, feet: view.hero.feet, reference };
}
export function hudNumbers(capture: PickupCapture) {
  const text = capture.hud.join('|'), number = (pattern: RegExp) => {
    const value = text.match(pattern); assert(value, `Missing publicHUD ${pattern}: ${text}`); return Number(value[1].replace(/,/g, ''));
  };
  return { hp: number(/HP\s*([\d.]+)\s*\//), tokens: number(/TOKENS\s*([\d,]+)\s*TOK/), doom: number(/P\(DOOM\)\s*([\d.]+)%/) };
}
export function loomCamera(view: PickupView) {
  // The route is confined to the actual first diamond, not inferred from the procedural producer.
  const hubs = view.supports.filter(s => s.kind === 'hub'), candidates: { scrollX: number; scrollY: number; error: number }[] = [];
  for (const hub of hubs) for (const left of [10, 590]) {
    const scrollX = hub.x > 1 ? left - hub.x : left + 180 - hub.x - hub.width, scrollY = 360 - hub.y;
    if (scrollX < -1 || scrollX > 300) continue;
    let error = 0;
    for (const actual of hubs) {
      const best = Math.min(...[10, 590].map(worldX => {
        const x = Math.max(0, worldX - scrollX), end = Math.min(640, worldX + 180 - scrollX);
        return end > x ? Math.abs(actual.x - x) + Math.abs(actual.width - end + x) + Math.abs(actual.y - 360 + scrollY) : Infinity;
      })); error += best;
    }
    if (error <= 3) candidates.push({ scrollX, scrollY, error });
  }
  const best = candidates.sort((a, b) => a.error - b.error)[0]; assert(best, 'Real fixed first-diamond hub registration required'); return best;
}
export function registeredResidual(view: PickupView, source: PickupSource, kind: PickupKind,
  world: { x: number; y: number }, camera: { scrollX: number; scrollY: number }) {
  const pixels = screen(view.capture), s = source.items[KINDS.indexOf(kind)], x = Math.round(world.x - camera.scrollX) - 16,
    y = Math.round(world.y - camera.scrollY) - 16;
  const box = { x: x + s.box.x - 1, y: y + s.box.y - 3, width: s.box.width + 2, height: s.box.height + 6 };
  assert(box.x >= 2 && box.y >= 2 && box.x + box.width <= W - 2 && box.y + box.height <= H - 2, 'Whole registered bob/rigid domain must be onscreen');
  const h = view.hero, obscuredByHero = !h || h.x < box.x + box.width && h.x + 32 > box.x && h.y < box.y + box.height && h.y + 32 > box.y;
  const hits: PixelHit[] = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) hits.push(score(pixels, s, x + dx, y + dy));
  return { world, camera, box, obscuredByHero, maximum: hits.sort((a, b) => b.ratio - a.ratio)[0], candidates: hits.length };
}
export async function pickupFrames(page: Page, duration = 0): Promise<PickupCapture[]> {
  assert(Number.isFinite(duration) && duration >= 0 && duration <= 4500);
  return page.evaluate(ms => new Promise<PickupCapture[]>((resolve, reject) => {
    const frames: PickupCapture[] = []; let start: number | null = null, last = -Infinity;
    const take = (at: number) => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Native640x360 canvas missing');
        start ??= at;
        if (at - last >= 32 || at - start >= ms) {
          frames.push({ png: canvas.toDataURL('image/png'), at,
            hud: [...document.querySelectorAll('.hud-cell')].map(node => node.textContent ?? ''),
            objective: document.querySelector('.objective')?.textContent ?? '', title: document.querySelector('.world-titlebar')?.textContent ?? '',
            notice: [...document.querySelectorAll('[role="status"],.game-notice')].map(node => node.textContent ?? '').join('|') }); last = at;
        }
        if (at - start >= ms) resolve(frames); else requestAnimationFrame(take);
      } catch (error) { reject(error); }
    }; requestAnimationFrame(take);
  }), duration);
}
/** Invalid NETWORK fixture only. Never saved as art or used as a screenshot/positive oracle. */
export function wrongNaturalSizePng(bytes: Buffer) {
  const source = png(bytes); assert.deepEqual([source.width, source.height], [96, 32]);
  const width = 97, height = 32, data = Buffer.alloc(height * (width * 4 + 1)), header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  for (let row = 0; row < height; row++) source.rgba.copy(data, row * (width * 4 + 1) + 1, row * 96 * 4, (row + 1) * 96 * 4);
  const chunk = (type: string, payload: Buffer) => {
    const b = Buffer.alloc(payload.length + 12); b.writeUInt32BE(payload.length, 0); b.write(type, 4, 'ascii'); payload.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, b.length - 4)), b.length - 4); return b;
  };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]);
}

export function loomPickupLocation(view: PickupView, item: ItemHit) {
  const camera = loomCamera(view), support = view.supports.find(p => item.centerX >= p.x && item.centerX <= p.x + p.width
    && Math.abs(p.y - item.centerY - 18) <= 3);
  assert(support, 'Pickup must be tied to an actual visible support, not a procedural expected plan');
  return { x: item.centerX + camera.scrollX, y: support.y + camera.scrollY - 18 };
}
export function loomLowerSlot(view: PickupView) {
  const camera = loomCamera(view), lower = view.supports.filter(p => ['lower', 'warning'].includes(p.kind));
  const shallow = lower.filter(p => p.y + camera.scrollY > 390 && p.y + camera.scrollY < 430
    && p.x > 2 && p.x + p.width < 638 && p.width >= 122 && p.width <= 136);
  assert(shallow.length > 0, 'A complete same-branch shallow node supplies the actual node width');
  const widths = shallow.map(p => p.width); assert(Math.max(...widths) - Math.min(...widths) <= 1);
  const deep = lower.filter(p => p.y + camera.scrollY >= 430).sort((a, b) => a.x - b.x)[0];
  assert(deep && deep.x > 2, 'Visible left edge of the first deep lower node required');
  // Adjacent equal-height nodes can merge their Core top line. The independently visible shallow node fixes their width.
  return { x: deep.x + widths[0] / 2 + camera.scrollX, y: deep.y + camera.scrollY - 18,
    nodeWidth: widths[0], actualShallow: shallow, actualDeep: deep, camera };
}
