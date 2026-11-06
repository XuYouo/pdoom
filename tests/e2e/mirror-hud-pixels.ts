import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
export interface Raster { width: number; height: number; rgba: Buffer }
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(data: Buffer): number {
  let value = 0xffffffff; for (const byte of data) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
/** Noninterlaced RGB/RGBA8 PNG, including browser canvas PNGs; no resizing or colour fitting. */
export function hudPng(file: Buffer): Raster {
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

interface Box { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface MirrorHudEvidence {
  bar: { x: number; y: number; width: number; height: number; filled: number } | null;
  label: Box & { ink: number; key: string; points: { x: number; y: number; color: number }[] };
}
const rgb = (image: Raster, x: number, y: number) => {
  const i = (y * image.width + x) * 4;
  return image.rgba[i] * 65536 + image.rgba[i + 1] * 256 + image.rgba[i + 2];
};
/** Actual canvas pixels and an independently source-matched actor origin, never a renderer/world getter. */
export function inspectMirrorHud(image: Raster, actorY: number): MirrorHudEvidence {
  assert.deepEqual([image.width, image.height], [640, 360]);
  const hp = (x: number, y: number) => [0x252b28, 0xebaa7b].includes(rgb(image, x, y));
  const bars: NonNullable<MirrorHudEvidence['bar']>[] = [];
  for (let y = Math.max(0, Math.round(actorY) - 17); y <= Math.min(356, Math.round(actorY) - 11); y++) {
    for (let x = 0; x < 640;) {
      if (!hp(x, y)) { x++; continue; }
      const left = x; while (x < 640 && hp(x, y)) x++;
      const width = x - left;
      if (width < 16) continue;
      let solid = true, filled = 0;
      for (let row = y; row < y + 4; row++) for (let col = left; col < x; col++) {
        if (!hp(col, row)) solid = false;
        if (rgb(image, col, row) === 0xebaa7b) filled++;
      }
      if (solid) bars.push({ x: left, y, width, height: 4, filled });
    }
  }
  // Tiny canvas glyphs are mostly antialiased: exact foreground alone sees only3 pixels of AGI.
  // Identify foreground blended over the observed plain Omega wall, then compare actual RGB samples exactly.
  assert.equal(rgb(image, 320, 180), 0x0f191b, 'Expected unchanged native Omega wall');
  const points: { x: number; y: number; color: number }[] = [];
  for (let y = Math.max(0, Math.round(actorY) - 35); y <= Math.min(359, Math.round(actorY) - 18); y++) {
    for (let x = 0; x < 640; x++) {
      const color = rgb(image, x, y), r = color >> 16, g = (color >> 8) & 255, b = color & 255;
      const alpha = (r - 15) / 230;
      if (alpha >= 0.02 && alpha <= 1 && Math.abs(g - (25 + alpha * 198)) <= 2 && Math.abs(b - (27 + alpha * 162)) <= 2) points.push({ x, y, color });
    }
  }
  const left = points.length ? Math.min(...points.map(p => p.x)) : -1, right = points.length ? Math.max(...points.map(p => p.x)) : -1;
  const top = points.length ? Math.min(...points.map(p => p.y)) : -1, bottom = points.length ? Math.max(...points.map(p => p.y)) : -1;
  return { bar: bars.sort((a, b) => b.width - a.width)[0] ?? null,
    label: { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1, ink: points.length,
      key: points.map(p => `${p.x - left},${p.y - top}:${p.color}`).join(';'), points } };
}
export function assertMirrorName(label: MirrorHudEvidence['label'], naturalCenterKey?: string) {
  assert(label.ink >= 400 && label.width >= 85 && label.width <= 100, 'Full blended name coverage missing; a few opaque initials are insufficient');
  assert(label.left >= 8 && label.right <= 631, 'Name touches a clipped edge');
  if (naturalCenterKey !== undefined) assert.equal(label.key, naturalCenterKey, 'All blended RGB glyph samples must equal the naturally centered full name');
}
export function assertMirrorHud(evidence: MirrorHudEvidence, naturalCenterKey?: string) {
  const { bar, label } = evidence; assert(bar, 'Real four-row HP bar missing');
  assert.equal(bar.width, 64, 'HP track must remain64 native pixels, not a clipped/scaled remainder');
  assert.equal(bar.height, 4); assert(bar.x >= 8 && bar.x + bar.width <= 632, 'HP outside safe edges');
  assertMirrorName(label, naturalCenterKey);
}
/** Memory-only negative controls. These rasters are never saved or attached as positive screenshots. */
export function eraseHudEdge(image: Raster, evidence: MirrorHudEvidence, part: 'bar' | 'name'): Raster {
  const result = { ...image, rgba: Buffer.from(image.rgba) };
  const points = part === 'bar' ? Array.from({ length: 4 }, (_, i) => ({ x: evidence.bar!.x + evidence.bar!.width - 1, y: evidence.bar!.y + i }))
    : evidence.label.points.filter(p => p.x === evidence.label.right);
  assert(points.length > 0);
  for (const p of points) { const i = (p.y * 640 + p.x) * 4; result.rgba.set([15, 25, 27, 255], i); }
  return result;
}
