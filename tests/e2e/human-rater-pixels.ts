import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import type { Page, TestInfo } from '@playwright/test';
import { pickupFrames } from './pickup-pixels';
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



// Independent literal source and raw640x360 observation only: no Phaser, World or production selector access.
export const RATER_POSES = ['neutral', 'approved', 'disapproved', 'hacked'] as const;
export type RaterPose = typeof RATER_POSES[number];
interface Point { x: number; y: number; rgb: number }
export interface RaterSource { frames: Raster[]; hashes: Record<string, string> }
export interface RaterHit { x: number; y: number; pose: RaterPose; ink: number; matched: number; ratio: number; excluded: number; colors: number;
  distinctions: { other: RaterPose; ink: number; matched: number }[] }
const rgb = (b: Buffer, i: number) => (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
const close = (a: number, b: number) => Math.abs((a >>> 16) - (b >>> 16)) <= 2
  && Math.abs(((a >>> 8) & 255) - ((b >>> 8) & 255)) <= 2 && Math.abs((a & 255) - (b & 255)) <= 2;
let pending: Promise<RaterSource> | undefined;
export function raterSource() { return pending ??= load(); }
async function load(): Promise<RaterSource> {
  const frozen = {
    'assets/source/human-rater.aseprite': 'f54e21841d2dde8433d50181288abb5f057907d3a9b02b33dc500c4bddaa11fd',
    'public/game/human-rater.png': '26bea93f4201916e6af597f9386e3087ee617adb234fd8dd7004753e97c80b2f',
    'public/game/human-rater.json': '2c506ec8be37da8590fea4a83b650fbc0044332e29dd165681ac745dff9b0d45',
  };
  const hashes: Record<string, string> = {}, files = new Map<string, Buffer>();
  for (const [name, hash] of Object.entries(frozen)) {
    const bytes = await readFile(name); hashes[name] = createHash('sha256').update(bytes).digest('hex'); assert.equal(hashes[name], hash); files.set(name, bytes);
  }
  const sheet = png(files.get('public/game/human-rater.png')!); assert.deepEqual([sheet.width, sheet.height], [256, 64]);
  const atlas = JSON.parse(files.get('public/game/human-rater.json')!.toString()) as { frames: { filename: string; frame: unknown }[] };
  assert.equal(atlas.frames.length, 4);
  atlas.frames.forEach((f, i) => { assert.equal(f.filename, `human-rater #${RATER_POSES[i]}.aseprite`); assert.deepEqual(f.frame, { x: i * 64, y: 0, w: 64, h: 64 }); });
  return { frames: RATER_POSES.map((_, i) => crop(sheet, i * 64, 0, 64, 64)), hashes };
}
function points(image: Raster): Point[] {
  const values: Point[] = [];
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4; assert(image.rgba[i + 3] === 0 || image.rgba[i + 3] === 255);
    if (image.rgba[i + 3]) values.push({ x, y, rgb: rgb(image.rgba, i) });
  }
  return values;
}
/** Every opaque source pixel is checked; foreground clutter is not masked away. */
export function inspectRater(bytes: Buffer, source: RaterSource, pose: RaterPose, portrait = false): RaterHit[] {
  const screen = png(bytes); if (!portrait) assert.deepEqual([screen.width, screen.height], [640, 360]);
  const references = portrait ? source.frames.map(f => crop(f, 8, 4, 48, 48)) : source.frames;
  const slot = RATER_POSES.indexOf(pose); assert(slot >= 0); const reference = references[slot], all = points(reference);
  const ink = all;
  assert(ink.length > 500); const groups = new Map<number, Point[]>();
  for (const p of ink) { const a = groups.get(p.rgb) ?? []; a.push(p); groups.set(p.rgb, a); }
  const anchor = [...groups.values()].sort((a, b) => a.length - b.length)[0][0];
  const distinctions = references.map((other, i) => ({ other: RATER_POSES[i], points: ink.filter(p => {
    const at = (p.y * other.width + p.x) * 4; return other.rgba[at + 3] !== 255 || rgb(other.rgba, at) !== p.rgb;
  }) })).filter((_, i) => i !== slot);
  distinctions.forEach(d => assert(d.points.length >= 4, 'Different native gesture/body required'));
  const matches = (p: Point, x: number, y: number) => {
    const i = ((y + p.y) * screen.width + x + p.x) * 4;
    return screen.rgba[i + 3] === 255 && close(rgb(screen.rgba, i), p.rgb);
  };
  const result: RaterHit[] = [];
  for (let py = 0; py < screen.height; py++) for (let px = 0; px < screen.width; px++) {
    const at = (py * screen.width + px) * 4;
    if (!close(rgb(screen.rgba, at), anchor.rgb)) continue;
    const x = px - anchor.x, y = py - anchor.y;
    if (x < 0 || y < 0 || x + reference.width > screen.width || y + reference.height > screen.height) continue;
    const matched = ink.filter(p => matches(p, x, y));
    if (matched.length / ink.length < .97) continue; // Retain near hits for diagnostics; acceptance below is stricter.
    result.push({ x, y, pose, ink: ink.length, matched: matched.length, ratio: matched.length / ink.length, excluded: all.length - ink.length,
      colors: new Set(matched.map(p => p.rgb)).size,
      distinctions: distinctions.map(d => ({ other: d.other, ink: d.points.length, matched: d.points.filter(p => matches(p, x, y)).length })) });
  }
  return result.sort((a, b) => b.ratio - a.ratio);
}
export function assertRaterHit(hits: RaterHit[]): RaterHit {
  const hit = hits.find(h => h.matched === h.ink && h.distinctions.every(d => d.matched === d.ink));
  assert(hit, 'Every unoccluded native source pixel AND each pairwise gesture signature must match (per channel tolerance2)');
  assert(hit.colors >= 8); return hit;
}
export async function captureRaterCanvas(page: Page): Promise<Buffer> {
  const frames = await pickupFrames(page, 0); assert.equal(frames.length, 1);
  return Buffer.from(frames[0].png.split(',')[1], 'base64');
}
export async function captureRaterPortrait(page: Page): Promise<Buffer> {
  const mark = page.locator('.rest-station-mark'), image = mark.locator('.rest-station-portrait'), credit = mark.locator('.rest-station-credit');
  const m = await mark.boundingBox(), p = await image.boundingBox(), c = await credit.boundingBox(); assert(m && p && c);
  assert.deepEqual([m.width, m.height, p.width, p.height], [52, 60, 48, 48]);
  assert(Math.abs(c.y - p.y - 48) < .01); assert(c.y + c.height <= m.y + m.height - 2 + .01);
  const style = await image.evaluate(node => ({ size: getComputedStyle(node).backgroundSize, render: getComputedStyle(node).imageRendering }));
  assert.deepEqual(style, { size: '256px 64px', render: 'pixelated' });
  return mark.screenshot();
}
/** Deliberately invalid network fixture, never a positive sprite or screenshot. */
export function wrongRaterPng(bytes: Buffer): Buffer {
  const image = png(bytes); assert.deepEqual([image.width, image.height], [256, 64]);
  const w = 256, h = 65, raw = Buffer.alloc(h * (w * 4 + 1)), header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 6;
  for (let row = 0; row < 64; row++) image.rgba.copy(raw, row * (w * 4 + 1) + 1, row * w * 4, (row + 1) * w * 4);
  const chunk = (type: string, data: Buffer) => {
    const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(type, 4); data.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, b.length - 4)), b.length - 4); return b;
  };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export async function proveRater(page: Page, info: TestInfo, pose: RaterPose, label: string) {
  const source = await raterSource(), canvas = await captureRaterCanvas(page), portrait = await captureRaterPortrait(page);
  for (const [kind, bytes] of [['native', canvas], ['portrait', portrait]] as const) {
    const path = info.outputPath(`${label}-${kind}.png`); await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' }); await info.attach(`${label}-${kind}`, { path, contentType: 'image/png' });
  }
  const worldHits = inspectRater(canvas, source, pose), uiHits = inspectRater(portrait, source, pose, true);
  await info.attach(`${label}-pixel-facts`, { body: JSON.stringify({ worldHits, uiHits, hashes: source.hashes, mask: 'none' }), contentType: 'application/json' });
  const world = assertRaterHit(worldHits), ui = assertRaterHit(uiHits);
  return { world, ui, canvas };
}
