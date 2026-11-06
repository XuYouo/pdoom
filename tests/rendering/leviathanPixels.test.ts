import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { inspectLeviathanPng, leviathanSource, type LeviathanSource } from '../e2e/leviathan-pixels';

// OFFLINE ORACLE CONTROLS ONLY. All composites stay in memory; none is browser/gameplay evidence.
const file = readFileSync(new URL('../../public/game/leviathan.png', import.meta.url));
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const WHOLE = [12704, 12716, 12513, 12715, 12704, 12716, 12513, 12715];
const INK = [12619, 12631, 12428, 12630, 12619, 12631, 12428, 12630];
const CASES = [[0, 17, 23], [1, 413, 177], [2, 0, 0], [3, 480, 200], [4, 200, 115], [5, 37, 174], [6, 380, 30], [7, 255, 140]] as const;
// Separate fixture decoder, independently pinned to the PIL-observed RGBA digest.
function fixturePixels(bytes: Buffer) {
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20), parts: Buffer[] = [];
  expect([w, h, bytes[24], bytes[25]]).toEqual([1280, 160, 8, 6]);
  for (let p = 8; p < bytes.length;) {
    const n = bytes.readUInt32BE(p), tag = bytes.toString('ascii', p + 4, p + 8); if (tag === 'IDAT') parts.push(bytes.subarray(p + 8, p + 8 + n)); p += n + 12;
  }
  const raw = inflateSync(Buffer.concat(parts)), rgba = Buffer.alloc(w * h * 4), stride = w * 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < stride; x++) {
    const at = y * stride + x, f = raw[y * (stride + 1)], a = x < 4 ? 0 : rgba[at - 4], b = y ? rgba[at - stride] : 0, c = x < 4 || !y ? 0 : rgba[at - stride - 4];
    const s = a + b - c, candidates = [a, b, c], distances = candidates.map(v => Math.abs(s - v));
    const paeth = candidates[distances.indexOf(Math.min(...distances))];
    rgba[at] = (raw[y * (stride + 1) + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth][f]) % 256;
  }
  expect(sha(rgba)).toBe('5b4bc2b0b3520e47a61e8406a9af90e558b744d8f2391b60832dd8dd65ded6a9'); return rgba;
}
const art = fixturePixels(file);
function crc(bytes: Buffer) {
  let value = 0xffffffff;
  for (const b of bytes) { value ^= b; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(name: string, data: Buffer) {
  const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); out.write(name, 4); data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, -4)), out.length - 4); return out;
}
function encode(rgba: Buffer, w = 640, h = 360, rgbOnly = false) {
  const channels = rgbOnly ? 3 : 4, raw = Buffer.alloc(h * (w * channels + 1)), header = Buffer.alloc(13);
  header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = rgbOnly ? 2 : 6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.copy(raw, y * (w * channels + 1) + 1 + x * channels, (y * w + x) * 4, (y * w + x) * 4 + channels);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const capture = (rgba: Buffer, at = 0) => ({ png: 'data:image/png;base64,' + encode(rgba).toString('base64'), at });
function paint(rgba: Buffer, x: number, y: number, color: number) {
  if (x < 0 || x >= 640 || y < 0 || y >= 360) return;
  const p = (y * 640 + x) * 4; rgba[p] = color >>> 16; rgba[p + 1] = color >>> 8; rgba[p + 2] = color; rgba[p + 3] = 255;
}
function rect(rgba: Buffer, x: number, y: number, w: number, h: number, color: number) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) paint(rgba, i, j, color);
}
function blank() { const rgba = Buffer.alloc(640 * 360 * 4); rect(rgba, 0, 0, 640, 360, 0x0f191b); return rgba; }
function sourcePixel(frame: number, x: number, y: number) {
  const i = (y * 1280 + frame * 160 + x) * 4; return [...art.subarray(i, i + 4)];
}
function stamp(rgba: Buffer, frame: number, ox: number, oy: number, mode = '') {
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
    const p = sourcePixel(mode === 'hybrid' && x >= 80 ? 1 : frame, x, y); if (!p[3]) continue;
    const values = p.slice(0, 3).map((v, c) => mode === 'muted' ? Math.round(v * 0.55 + [15, 25, 27][c] * 0.45) : mode === 'plus2' ? v + 2 : mode === 'plus3' ? v + 3 : v);
    const color = mode === 'mono' ? 0x426b50 : (values[0] << 16) | (values[1] << 8) | values[2];
    paint(rgba, ox + (mode === 'mirror' ? 159 - x : x), oy + y, color);
  }
}
let source: LeviathanSource;
beforeAll(async () => { source = await leviathanSource(); });
describe('OFFLINE Leviathan pixel-oracle controls, NOT game evidence', () => {
  it('pins independently observed frozen source pixels, 8 literal cuts, hard alpha and a truly transparent26x30 core', () => {
    expect(sha(file)).toBe('105ec83d223e56b5e77f0878079c4273dec469cd7bcb502fcecbfe5cfb2bbe9d');
    expect(source.frames.map(f => [f.x, f.y, f.w, f.h])).toEqual([0, 160, 320, 480, 640, 800, 960, 1120].map(x => [x, 0, 160, 160]));
    expect(Object.isFrozen(source)).toBe(true); expect(source.frames.every(Object.isFrozen)).toBe(true);
    for (let frame = 0; frame < 8; frame++) {
      let ink = 0; const colors = new Set<string>(), alphas = new Set<number>(), coreAlphas = new Set<number>();
      for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
        const p = sourcePixel(frame, x, y); alphas.add(p[3]);
        if (x >= 67 && x <= 92 && y >= 65 && y <= 94) coreAlphas.add(p[3]);
        if (p[3]) { ink++; colors.add(p.slice(0, 3).join(',')); }
      }
      expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]); expect([...coreAlphas]).toEqual([0]);
      expect(ink).toBe(WHOLE[frame]); expect(colors.size).toBe(frame < 4 ? 5 : 7);
    }
  });
  it.each(CASES)('registers source pose%s at independent(%s,%s), not a fixed camera or assumed time', (frame, x, y) => {
    const rgba = blank(); stamp(rgba, frame, x, y); const image = capture(rgba, 0), before = image.png;
    const view = inspectLeviathanPng(image, source);
    expect(view.body).toMatchObject({ x, y, frame, flip: false, ratio: 1, signature: 1, ink: INK[frame], cropped: 0, sourceInk: WHOLE[frame] });
    expect(view.body!.otherWitnesses.map(w => w.frame)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].filter(i => i !== frame));
    for (const w of view.body!.otherWitnesses) { expect(w.visible).toBeGreaterThanOrEqual(40); expect(w.matched).toBeGreaterThanOrEqual(30); expect(w.ratio).toBe(1); }
    expect(view.cues).toEqual({ hp: 0, closedCore: 0, openCore: 0, voidShots: 0, turnLine: 0, turnLineX: null, hero: 0, platforms: 0, swallow: 0 });
    expect(image.png).toBe(before); expect(view.capture).toBe(image);
  });
  it.each([0, 4])('only permitted contact-edge occlusion and transparent core/real cue colors preserve pose%i', frame => {
    const rgba = blank(), x = 200, y = 100; stamp(rgba, frame, x, y);
    rect(rgba, x + 7, y + 7, 146, 3, 0xff00ff); rect(rgba, x + 7, y + 150, 146, 3, 0xff00ff);
    rect(rgba, x + 7, y + 7, 3, 146, 0xff00ff); rect(rgba, x + 150, y + 7, 3, 146, 0xff00ff);
    const color = frame === 4 ? 0xffd69b : 0x0e251f, border = frame === 4 ? 0xfff1c4 : 0x92cbb5;
    rect(rgba, x + 67, y + 65, 26, 30, border); rect(rgba, x + 68, y + 66, 24, 28, color);
    if (!frame) rect(rgba, x + 70, y + 79, 20, 2, 0x68a991);
    rect(rgba, x + 48, y - 2, 64, 4, 0xebaa7b); rect(rgba, 80, 222, 1, 60, 0xf4d298);
    rect(rgba, 40, 300, 5, 5, 0xb4e2c6); rect(rgba, 20, 300, 16, 22, 0xd97757);
    const view = inspectLeviathanPng(capture(rgba), source);
    expect(view.body).toMatchObject({ x, y, frame, ratio: 1, signature: 1, ink: INK[frame] }); expect(view.body!.fullRatio).toBeLessThan(1);
    expect(view.cues).toMatchObject({ hp: 256, closedCore: frame === 0 ? 632 : 0, openCore: frame === 4 ? 672 : 0, voidShots: 25, turnLine: 60, turnLineX: 80, hero: 352 });
  });
  it('accepts per-channel2 native lossless comparison and rejects3 instead of fitting a tint', () => {
    const near = blank(), far = blank(); stamp(near, 0, 300, 110, 'plus2'); stamp(far, 0, 300, 110, 'plus3');
    expect(inspectLeviathanPng(capture(near), source).body).toMatchObject({ frame: 0, ratio: 1 });
    expect(inspectLeviathanPng(capture(far), source).body).toBeNull();
  });
  it.each(['empty', 'mirror', 'mono', 'muted', 'hybrid', 'crop', 'unknown-overlay'])('rejects offline%s control without an unknown-color whitelist or threshold relaxation', mode => {
    const rgba = blank(); if (mode !== 'empty') stamp(rgba, 0, mode === 'crop' ? -65 : 200, 100, mode);
    if (mode === 'unknown-overlay') rect(rgba, 240, 140, 40, 40, 0xefb18c);
    expect(inspectLeviathanPng(capture(rgba), source).body).toBeNull();
  });
  it('rejects loss of one other-pose signature even though over99percent of full ink still matches', () => {
    const rgba = blank(); stamp(rgba, 0, 200, 100); let erased = 0;
    for (let y = 20; y < 140 && erased < 80; y++) for (let x = 20; x < 140 && erased < 80; x++) {
      const a = sourcePixel(0, x, y), b = sourcePixel(4, x, y);
      if (a[3] && a.some((v, i) => i < 3 && Math.abs(v - b[i]) > 4)) { paint(rgba, 200 + x, 100 + y, 0xff00ff); erased++; }
    }
    expect(erased).toBe(80); expect((12619 - 80) / 12619).toBeGreaterThan(0.99);
    expect(inspectLeviathanPng(capture(rgba), source).body).toBeNull();
  });
  it('supports modest visible-source cropping while still demanding90percent and10000 matching ink', () => {
    const rgba = blank(); stamp(rgba, 7, -20, -20); const body = inspectLeviathanPng(capture(rgba), source).body;
    expect(body).toMatchObject({ x: -20, y: -20, frame: 7, ratio: 1, signature: 1 }); expect(body!.cropped).toBeGreaterThan(0);
    expect(body!.cropped).toBeLessThanOrEqual(0.1); expect(body!.ink).toBeGreaterThanOrEqual(10000);
  });
  it('reads supplied pixels rather than capture timestamps and accepts native RGB PNG without scaling', () => {
    const rgba = blank(); stamp(rgba, 7, 280, 40); const image = capture(rgba, 0);
    expect(inspectLeviathanPng({ ...image, at: 999999 }, source).body).toMatchObject({ frame: 7 });
    const rgb = { png: 'data:image/png;base64,' + encode(rgba, 640, 360, true).toString('base64'), at: 17 };
    expect(inspectLeviathanPng(rgb, source).body).toMatchObject({ frame: 7, ratio: 1 });
  });
  it('fails closed on source replacement, malformed atlas, CRC corruption and non-native backing dimensions', () => {
    const rgba = blank(); stamp(rgba, 0, 200, 100); const image = capture(rgba), changed = Buffer.from(art); changed[4 * (12 * 1280 + 12)] ^= 1;
    const replacement = { ...source, image: 'data:image/png;base64,' + encode(changed, 1280, 160).toString('base64') };
    expect(() => inspectLeviathanPng(image, replacement)).toThrow(/Frozen source/);
    expect(() => inspectLeviathanPng(image, { ...source, frames: source.frames.slice(1) })).toThrow(/Literal8/);
    const corrupt = encode(rgba); corrupt[corrupt.length - 5] ^= 1;
    expect(() => inspectLeviathanPng({ ...image, png: 'data:image/png;base64,' + corrupt.toString('base64') }, source)).toThrow(/CRC/);
    const wrong = 'data:image/png;base64,' + encode(Buffer.alloc(320 * 180 * 4), 320, 180).toString('base64');
    expect(() => inspectLeviathanPng({ ...image, png: wrong }, source)).toThrow(/non-native/);
  });
});
