import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import type { Page, TestInfo } from '@playwright/test';
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

// Literal native PNG oracle and ordinary canvas/DOM capture only. No World, Phaser or producer selector access.
export type ClawdForm = 'aligned' | 'masked' | 'foom';
export type ClawdPhase = 'base' | 'hurt' | 'fire' | 'recover';
interface Point { x: number; y: number; rgb: number }
interface Stamp { form: ClawdForm; frame: number; phase: ClawdPhase; base: number; flipped: boolean; points: Point[]; anchors: Point[]; colors: number }
export interface ClawdSource { stamps: Stamp[]; hashes: Record<string, string> }
export interface ClawdHit { form: ClawdForm; frame: number; phase: ClawdPhase; base: number; flipped: boolean; x: number; y: number; ink: number; matched: number; excluded: number; colors: number }
export interface ClawdCapture { png: string; at: number; hud: string[]; title: string; notice: string; objective: string; omega: string }
const color = (b: Buffer, p: number) => (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
let sourcePromise: Promise<ClawdSource> | undefined;
export const clawdSource = () => sourcePromise ??= loadClawd();
async function loadClawd(): Promise<ClawdSource> {
  const manifest = JSON.parse(await readFile('assets/clawd-attack-generation.json', 'utf8')) as { source: { path: string; sha256: string }; exports: Record<ClawdForm, { pngSha256: string; atlasSha256: string }> };
  const hashes: Record<string, string> = {}, stamps: Stamp[] = [];
  const check = async (path: string, expected: string) => { const bytes = await readFile(path); hashes[path] = createHash('sha256').update(bytes).digest('hex'); assert.equal(hashes[path], expected); return bytes; };
  await check(manifest.source.path, manifest.source.sha256);
  for (const form of ['aligned', 'masked', 'foom'] as const) {
    const sheet = png(await check(`public/game/clawd-${form}.png`, manifest.exports[form].pngSha256)); assert.deepEqual([sheet.width, sheet.height], [704, 32]);
    const atlas = JSON.parse((await check(`public/game/clawd-${form}.json`, manifest.exports[form].atlasSha256)).toString()) as { frames: { filename: string; frame: unknown; rotated: boolean; trimmed: boolean }[] };
    assert.equal(atlas.frames.length, 22);
    atlas.frames.forEach((f, index) => {
      assert.equal(f.filename, `clawd-svg ${index}.aseprite`); assert.deepEqual(f.frame, { x: index * 32, y: 0, w: 32, h: 32 }); assert(!f.rotated && !f.trimmed);
      const image = crop(sheet, index * 32, 0, 32, 32), points: Point[] = [], counts = new Map<number, number>();
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const at = (y * 32 + x) * 4, alpha = image.rgba[at + 3]; assert(alpha === 0 || alpha === 255);
        if (!alpha) continue; const rgb = color(image.rgba, at); points.push({ x, y, rgb }); counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
      }
      assert(points.length > 200); const sorted = [...points].sort((a, b) => counts.get(a.rgb)! - counts.get(b.rgb)!);
      const anchors = [sorted[0], sorted[Math.min(4, sorted.length - 1)], points[points.length - 1]];
      const phase: ClawdPhase = index === 7 ? 'hurt' : index < 8 ? 'base' : index < 15 ? 'fire' : 'recover';
      const base = index < 8 ? index : index < 15 ? index - 8 : index - 15;
      for (const flipped of [false, true]) {
        const mirror = (p: Point) => ({ ...p, x: flipped ? 31 - p.x : p.x });
        stamps.push({ form, frame: index, phase, base, flipped, points: points.map(mirror), anchors: anchors.map(mirror), colors: counts.size });
      }
    });
  }
  return { stamps, hashes };
}
/** Full opaque source, strict RGB equality, no masked hand/leg/face regions or near-hit acceptance. */
export function inspectClawd(bytes: Buffer, source: ClawdSource, form?: ClawdForm): ClawdHit[] {
  const image = png(bytes); assert.deepEqual([image.width, image.height], [640, 360]);
  const pixels = new Int32Array(640 * 360), positions = new Map<number, number[]>();
  for (let i = 0; i < pixels.length; i++) {
    const rgb = image.rgba[i * 4 + 3] === 255 ? color(image.rgba, i * 4) : -1; pixels[i] = rgb;
    const a = positions.get(rgb) ?? []; a.push(i); positions.set(rgb, a);
  }
  const result: ClawdHit[] = [];
  for (const s of source.stamps) {
    if (form && s.form !== form) continue;
    const a = s.anchors[0];
    for (const at of positions.get(a.rgb) ?? []) {
      const x = at % 640 - a.x, y = Math.floor(at / 640) - a.y;
      if (x < 0 || y < 0 || x + 32 > 640 || y + 32 > 360) continue;
      const matches = (p: Point) => pixels[(y + p.y) * 640 + x + p.x] === p.rgb;
      if (!s.anchors.every(matches) || !s.points.every(matches)) continue;
      result.push({ form: s.form, frame: s.frame, phase: s.phase, base: s.base, flipped: s.flipped, x, y, ink: s.points.length, matched: s.points.length, excluded: 0, colors: s.colors });
    }
  }
  return result;
}
export function oneClawdPhase(hits: ClawdHit[], phase: ClawdPhase, flipped?: boolean): ClawdHit {
  const found = hits.find(h => h.phase === phase && (flipped === undefined || h.flipped === flipped));
  assert(found, `Every opaque native pixel must match phase=${phase}, flip=${flipped}; got ${JSON.stringify(hits)}`);
  assert(!hits.some(h => h.x === found.x && h.y === found.y && h.phase !== phase), 'A competing phase also matched: not a distinctive attack signature');
  assert.equal(found.excluded, 0); assert.equal(found.matched, found.ink); return found;
}
export async function clawdFrames(page: Page, duration = 0): Promise<ClawdCapture[]> {
  assert(Number.isFinite(duration) && duration >= 0 && duration <= 4500);
  return page.evaluate(ms => new Promise<ClawdCapture[]>((resolve, reject) => {
    const frames: ClawdCapture[] = []; let start: number | null = null, last = -Infinity;
    const take = (at: number) => {
      try {
        const canvas = document.querySelector('canvas'); if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Native640x360 canvas missing'); start ??= at;
        if (at - last >= 12 || at - start >= ms) {
          frames.push({ png: canvas.toDataURL('image/png'), at, hud: [...document.querySelectorAll('.hud-cell')].map(n => n.textContent ?? ''),
            title: document.querySelector('.world-titlebar')?.textContent ?? '', objective: document.querySelector('.objective')?.textContent ?? '', omega: document.querySelector('.omega-readout')?.textContent ?? '', notice: [...document.querySelectorAll('[role="status"],.game-notice')].map(n => n.textContent ?? '').join('|') }); last = at;
        }
        if (at - start >= ms) resolve(frames); else requestAnimationFrame(take);
      } catch (error) { reject(error); }
    }; requestAnimationFrame(take);
  }), duration);
}
export const clawdBytes = (capture: ClawdCapture) => Buffer.from(capture.png.split(',')[1], 'base64');
export async function attachClawd(info: TestInfo, label: string, capture: ClawdCapture, hits: ClawdHit[]) {
  const path = info.outputPath(`${label}.png`); await mkdir(dirname(path), { recursive: true }); await writeFile(path, clawdBytes(capture), { flag: 'wx' });
  await info.attach(label, { path, contentType: 'image/png' }); await info.attach(label + '-literal-native-facts', { body: JSON.stringify({ at: capture.at, hud: capture.hud, hits, source: (await clawdSource()).hashes, mask: 'none', channelTolerance: 0 }), contentType: 'application/json' });
}
/** Invalid network fixture ONLY, not art and never a positive screenshot. */
export function wrongClawdPng(bytes: Buffer): Buffer {
  const source = png(bytes); assert.deepEqual([source.width, source.height], [704, 32]);
  const w = 704, h = 33, raw = Buffer.alloc(h * (w * 4 + 1)), header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 6;
  for (let y = 0; y < 32; y++) source.rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (type: string, data: Buffer) => { const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, b.length - 4)), b.length - 4); return b; };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Mutated real capture for counterexamples, in memory only; never attached as a positive screenshot. */
export function corruptClawdCapture(bytes: Buffer, source: ClawdSource, hit: ClawdHit, kind: 'channel' | 'palm'): Buffer {
  const image = png(bytes), stamp = source.stamps.find(s => s.form === hit.form && s.frame === hit.frame && s.flipped === hit.flipped); assert(stamp);
  const selected = kind === 'channel' ? [stamp.points[0]] : stamp.points.filter(p => (hit.flipped ? p.x <= 4 : p.x >= 27) && [0xd97757, 0xeaa083].includes(p.rgb));
  assert(selected.length > 0);
  for (const p of selected) {
    const at = ((hit.y + p.y) * image.width + hit.x + p.x) * 4;
    if (kind === 'channel') image.rgba[at] ^= 1; else image.rgba.fill(0, at, at + 3);
  }
  const w = image.width, h = image.height, raw = Buffer.alloc(h * (w * 4 + 1)), header = Buffer.alloc(13);
  header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 6;
  for (let y = 0; y < h; y++) image.rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (type: string, data: Buffer) => { const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, b.length - 4)), b.length - 4); return b; };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Explicit legacy multiplicative rewind tint; still checks every opaque native pixel. */
export function rewindClawdSource(source: ClawdSource): ClawdSource {
  const tint = (p: Point): Point => ({ ...p, rgb: (Math.round((p.rgb >>> 16) * 165 / 255) << 16) | (p.rgb & 0xff00) | Math.round((p.rgb & 255) * 241 / 255) });
  return { hashes: source.hashes, stamps: source.stamps.map(s => ({ ...s, points: s.points.map(tint), anchors: s.anchors.map(tint) })) };
}
