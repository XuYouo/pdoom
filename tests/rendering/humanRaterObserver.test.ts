import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { assertRaterHit, inspectRater, raterSource, RATER_POSES } from '../e2e/human-rater-pixels';
const crc = (bytes: Buffer) => {
  let n = 0xffffffff;
  for (const byte of bytes) { n ^= byte; for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); }
  return (n ^ 0xffffffff) >>> 0;
};
function encode(width: number, height: number, rgba: Buffer) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const chunk = (type: string, data: Buffer) => {
    const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(type, 4); data.copy(b, 8);
    b.writeUInt32BE(crc(b.subarray(4, -4)), b.length - 4); return b;
  };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** In-memory TEST fixtures only, never evidence of browser rendering and never written as art. */
async function fixture(slot: number, scale = 1, eraseHand = false, maskedBox = false) {
  const source = await raterSource(), frame = source.frames[slot], rgba = Buffer.alloc(640 * 360 * 4);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if (eraseHand && x >= 36 && x <= 49 && y >= 24 && y <= 41 || maskedBox && x <= 20 && y >= 46) continue;
    const at = (y * 64 + x) * 4; if (frame.rgba[at + 3] !== 255) continue;
    for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) {
      frame.rgba.copy(rgba, ((80 + y * scale + yy) * 640 + 100 + x * scale + xx) * 4, at, at + 4);
    }
  }
  return { source, bytes: encode(640, 360, rgba) };
}
describe('literal pixel observer counterexamples, not screenshots', () => {
  it.each(RATER_POSES)('%s matches at native scale with all pairwise gesture pixels', async pose => {
    const { source, bytes } = await fixture(RATER_POSES.indexOf(pose));
    const hit = assertRaterHit(inspectRater(bytes, source, pose)); expect([hit.x, hit.y, hit.ratio]).toEqual([100, 80, 1]);
    expect(hit.excluded).toBe(0); expect(hit.distinctions).toHaveLength(3);
    for (const wrong of RATER_POSES.filter(p => p !== pose)) expect(() => assertRaterHit(inspectRater(bytes, source, wrong))).toThrow();
  });
  it.each(RATER_POSES)('%s cannot pass with a 2x enlarged drawing', async pose => {
    const { source, bytes } = await fixture(RATER_POSES.indexOf(pose), 2);
    expect(() => assertRaterHit(inspectRater(bytes, source, pose))).toThrow();
  });
  it.each(RATER_POSES)('%s cannot pass when the entire hand/gesture ROI is absent', async pose => {
    const { source, bytes } = await fixture(RATER_POSES.indexOf(pose), 1, true);
    expect(() => assertRaterHit(inspectRater(bytes, source, pose))).toThrow();
  });
  it('blank, constant-color and cropped canvases are rejected', async () => {
    const source = await raterSource(), rgba = Buffer.alloc(640 * 360 * 4, 255);
    for (const pose of RATER_POSES) expect(() => assertRaterHit(inspectRater(encode(640, 360, rgba), source, pose))).toThrow();
    expect(() => inspectRater(encode(639, 360, rgba.subarray(0, 639 * 360 * 4)), source, 'neutral')).toThrow();
  });
  it('no foreground mask can excuse absent desk, face or hand pixels', async () => {
    const { source, bytes } = await fixture(3, 1, false, true);
    expect(() => assertRaterHit(inspectRater(bytes, source, 'hacked'))).toThrow();
    const corrupt = await fixture(3, 1, true, true);
    expect(() => assertRaterHit(inspectRater(corrupt.bytes, corrupt.source, 'hacked'))).toThrow();
  });
});
