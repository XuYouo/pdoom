import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PROBE_ASSET, PROBE_BINDING } from '../../src/pages/GamePage/game/data/probeAssets';
interface Pixels { width: number; height: number; rgba: Buffer }
interface ProbeAtlas {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; rotated: boolean; trimmed: boolean; spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; format: string; size: { w: number; h: number }; scale: string; frameTags: { name: string; from: number; to: number; direction: string }[]; layers: { name: string; opacity: number; blendMode: string }[] };
}
// Local read-only RGBA PNG decoder, adapted from gatoSprites.test.ts. No image dependency or output file.
function decodePng(path: string): Pixels {
  const png = readFileSync(new URL(path, import.meta.url));
  expect(png.length).toBeGreaterThanOrEqual(33);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.toString('ascii', 12, 16)).toBe('IHDR');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  expect([png[24], png[25], png[26], png[27], png[28]]).toEqual([8, 6, 0, 0, 0]);
  expect(width).toBeGreaterThan(0); expect(height).toBeGreaterThan(0);
  const parts: Buffer[] = []; let offset = 8, ended = false;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    expect(offset + length + 12).toBeLessThanOrEqual(png.length);
    if (type === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') { expect(length).toBe(0); ended = true; break; }
  }
  expect(ended).toBe(true); expect(offset).toBe(png.length); expect(parts.length).toBeGreaterThan(0);
  const raw = inflateSync(Buffer.concat(parts)), stride = width * 4, rgba = Buffer.alloc(width * height * 4);
  expect(raw.length).toBe(height * (stride + 1));
  const paeth = (a: number, b: number, c: number) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, left = x >= 4 ? rgba[index - 4] : 0, up = y ? rgba[index - stride] : 0, upperLeft = y && x >= 4 ? rgba[index - stride - 4] : 0;
      rgba[index] = (raw[y * (stride + 1) + 1 + x] + [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter]) & 255;
    }
  }
  return { width, height, rgba };
}
function crop(image: Pixels, x: number, y: number, width: number, height: number): Buffer {
  expect([x, y, width, height].every(Number.isInteger)).toBe(true);
  expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); expect(width).toBeGreaterThan(0); expect(height).toBeGreaterThan(0);
  expect(x + width).toBeLessThanOrEqual(image.width); expect(y + height).toBeLessThanOrEqual(image.height);
  const result = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) image.rgba.copy(result, row * width * 4, ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
  return result;
}
function visibleRaster(bytes: Buffer): Buffer {
  const result = Buffer.from(bytes);
  for (let i = 0; i < result.length; i += 4) if (result[i + 3] === 0) result.fill(0, i, i + 4);
  return result;
}
function colors(bytes: Buffer) {
  const opaque = new Set<string>(), alphas = new Set<number>(); let orange = 0, area = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const alpha = bytes[i + 3]; alphas.add(alpha); if (!alpha) continue;
    const rgb = bytes.toString('hex', i, i + 3); opaque.add(rgb); area++; if (rgb === 'd97757') orange++;
  }
  return { opaque: [...opaque].sort(), alphas: [...alphas].sort((a, b) => a - b), orange, area };
}
function bounds(bytes: Buffer, width: number, height: number): readonly [number, number, number, number] {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (bytes[(y * width + x) * 4 + 3]) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  expect(maxX).toBeGreaterThanOrEqual(minX); expect(maxY).toBeGreaterThanOrEqual(minY);
  return [minX, minY, maxX, maxY]; // Inclusive, unlike the half-open atlas rectangles.
}

interface SourceCel { frame: number; layer: number; x: number; y: number; opacity: number; image: Pixels; linked?: number }
interface NativeSource { width: number; height: number; frames: number; durations: number[]; paletteSizes: number[]; layers: { name: string; flags: number; type: number; blend: number; opacity: number }[]; rasterCels: SourceCel[] }
// Decode actual RGB/linked cels, never a provenance boolean or the PNG itself.
function nativeSource(path: string): NativeSource {
  const file = readFileSync(new URL(path, import.meta.url)); expect(file.length).toBeGreaterThanOrEqual(128);
  expect(file.readUInt32LE(0)).toBe(file.length); expect(file.readUInt16LE(4)).toBe(0xa5e0); expect(file.readUInt16LE(12)).toBe(32);
  const result: NativeSource = { width: file.readUInt16LE(8), height: file.readUInt16LE(10), frames: file.readUInt16LE(6), durations: [], paletteSizes: [], layers: [], rasterCels: [] };
  let offset = 128;
  for (let frame = 0; frame < result.frames; frame++) {
    expect(offset + 16).toBeLessThanOrEqual(file.length);
    const end = offset + file.readUInt32LE(offset), chunks = file.readUInt32LE(offset + 12) || file.readUInt16LE(offset + 6);
    expect(file.readUInt16LE(offset + 4)).toBe(0xf1fa); expect(end).toBeLessThanOrEqual(file.length); result.durations.push(file.readUInt16LE(offset + 8));
    let start = offset + 16;
    for (let chunk = 0; chunk < chunks; chunk++) {
      expect(start + 6).toBeLessThanOrEqual(end);
      const length = file.readUInt32LE(start), type = file.readUInt16LE(start + 4), stop = start + length;
      expect(length).toBeGreaterThanOrEqual(6); expect(stop).toBeLessThanOrEqual(end);
      if (type === 0x2004) { expect(length).toBeGreaterThanOrEqual(24); result.layers.push({ name: file.toString('utf8', start + 24, start + 24 + file.readUInt16LE(start + 22)), flags: file.readUInt16LE(start + 6), type: file.readUInt16LE(start + 8), blend: file.readUInt16LE(start + 16), opacity: file[start + 18] }); }
      if (type === 0x2019) { expect(length).toBeGreaterThanOrEqual(26); result.paletteSizes.push(file.readUInt32LE(start + 6)); }
      if (type === 0x2005) {
        expect(length).toBeGreaterThanOrEqual(24); const celType = file.readUInt16LE(start + 13);
        expect([0, 1, 2]).toContain(celType);
        if (celType === 1) {
          const linked = file.readUInt16LE(start + 22), layer = file.readUInt16LE(start + 6);
          expect(linked).toBeLessThan(frame);
          const previous = result.rasterCels.find(cel => cel.frame === linked && cel.layer === layer);
          if (!previous) throw new Error('Invalid native linked cel');
          result.rasterCels.push({ frame, layer, x: file.readInt16LE(start + 8), y: file.readInt16LE(start + 10), opacity: file[start + 12], image: previous.image, linked });
        }
        if (celType === 0 || celType === 2) {
          expect(length).toBeGreaterThanOrEqual(26);
          const width = file.readUInt16LE(start + 22), height = file.readUInt16LE(start + 24);
          const bytes = file.subarray(start + 26, stop), rgba = celType === 2 ? inflateSync(bytes) : Buffer.from(bytes);
          expect(rgba.length).toBe(width * height * 4);
          result.rasterCels.push({ frame, layer: file.readUInt16LE(start + 6), x: file.readInt16LE(start + 8), y: file.readInt16LE(start + 10), opacity: file[start + 12], image: { width, height, rgba } });
        }
      }
      start = stop;
    }
    expect(start).toBe(end); offset = end;
  }
  expect(offset).toBe(file.length); return result;
}

function layerRaster(source: NativeSource, frame: number, layer: number): Buffer {
  const matches = source.rasterCels.filter(cel => cel.frame === frame && cel.layer === layer); expect(matches).toHaveLength(1);
  const cel = matches[0], result = Buffer.alloc(source.width * source.height * 4);
  expect(cel.opacity).toBe(255); expect(cel.x).toBeGreaterThanOrEqual(0); expect(cel.y).toBeGreaterThanOrEqual(0);
  expect(cel.x + cel.image.width).toBeLessThanOrEqual(source.width); expect(cel.y + cel.image.height).toBeLessThanOrEqual(source.height);
  for (let y = 0; y < cel.image.height; y++) for (let x = 0; x < cel.image.width; x++) {
    const from = (y * cel.image.width + x) * 4, alpha = cel.image.rgba[from + 3]; expect([0, 255]).toContain(alpha);
    if (alpha) cel.image.rgba.copy(result, ((cel.y + y) * source.width + cel.x + x) * 4, from, from + 4);
  }
  return result;
}
function composite(source: NativeSource, frame: number): Buffer {
  const result = Buffer.alloc(source.width * source.height * 4);
  source.layers.forEach((layer, index) => {
    expect(layer.flags & 1).toBe(1); expect(layer.type).toBe(0); expect(layer.blend).toBe(0); expect(layer.opacity).toBe(255);
    const bytes = layerRaster(source, frame, index);
    for (let p = 0; p < bytes.length; p += 4) if (bytes[p + 3]) bytes.copy(result, p, p, p + 4);
  });
  return result;
}
const atlas = JSON.parse(readFileSync(new URL('../../public/game/von-neumann-probe.json', import.meta.url), 'utf8')) as ProbeAtlas;
const image = decodePng('../../public/game/von-neumann-probe.png');
const frames = atlas.frames.map(value => crop(image, value.frame.x, value.frame.y, value.frame.w, value.frame.h));
const source = nativeSource('../../assets/source/von-neumann-probe.aseprite');
const opaqueColors = ['0f191b', '2c2330', '34354f', '575c79', '858eb0', '9dded1', 'cbb696', 'd9ffea', 'e5c386'];
const countColor = (bytes: Buffer, hex: string) => { let count = 0; for (let i = 0; i < bytes.length; i += 4) if (bytes[i + 3] && bytes.toString('hex', i, i + 3) === hex) count++; return count; };

describe('formal probe source and exports, not a native-game acceptance claim', () => {
  it('uses actual named frames and immutable32px bindings', () => {
    expect(PROBE_ASSET).toMatchObject({ key: 'von-neumann-probe', image: 'game/von-neumann-probe.png', atlas: 'game/von-neumann-probe.json', frameWidth: 32, frameHeight: 32 });
    expect(Object.values(PROBE_BINDING.frames)).toEqual(atlas.frames.map(value => value.filename)); expect(PROBE_ASSET.frames).toEqual(Object.values(PROBE_BINDING.frames));
    expect(Object.isFrozen(PROBE_BINDING)).toBe(true); expect(Object.isFrozen(PROBE_BINDING.frames)).toBe(true); expect(Object.isFrozen(PROBE_ASSET.frames)).toBe(true);
    expect([image.width, image.height]).toEqual([128, 32]); expect(atlas.meta.size).toEqual({ w: 128, h: 32 }); expect(atlas.meta.scale).toBe('1');
    expect(atlas.frames).toHaveLength(4); expect(new Set(atlas.frames.map(value => value.filename)).size).toBe(4);
    atlas.frames.forEach((value, i) => {
      expect(value.frame).toEqual({ x: i * 32, y: 0, w: 32, h: 32 }); expect(value.rotated).toBe(false); expect(value.trimmed).toBe(false);
      expect(value.sourceSize).toEqual({ w: 32, h: 32 }); expect(value.spriteSourceSize).toEqual({ x: 0, y: 0, w: 32, h: 32 });
    });
  });
  it('retains a seek cycle and two state poses without making a runtime clock', () => {
    expect(atlas.frames.map(value => value.duration)).toEqual([240, 240, 1800, 500]);
    expect(atlas.meta.frameTags.map(({ name, from, to, direction }) => ({ name, from, to, direction }))).toEqual([
      { name: 'seek', from: 0, to: 1, direction: 'forward' }, { name: 'tell', from: 2, to: 2, direction: 'forward' }, { name: 'consume', from: 3, to: 3, direction: 'forward' },
    ]);
  });
  it('contains only nine approved opaque colors, hard alpha and no hero orange', () => {
    expect(colors(image.rgba)).toMatchObject({ opaque: opaqueColors, alphas: [0, 255], orange: 0 });
  });
  it.each([0, 1, 2, 3])('frame%i keeps a nonempty bounded26x22 silhouette and state lamps', index => {
    expect(bounds(frames[index], 32, 32)).toEqual([3, 5, 28, 26]); expect(colors(frames[index]).area).toBeGreaterThan(280);
    expect(countColor(frames[index], '9dded1')).toBe(index < 2 ? 4 : 0); expect(countColor(frames[index], 'e5c386')).toBe(index < 2 ? 0 : 4);
  });
  it('seek changes exactly eight scanner pixels, never housing or tools', () => {
    const changed: number[][] = [];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const p = (y * 32 + x) * 4; if (!frames[0].subarray(p, p + 4).equals(frames[1].subarray(p, p + 4))) changed.push([x, y]);
    }
    expect(changed).toEqual([[11, 11], [12, 11], [18, 11], [19, 11], [11, 12], [12, 12], [18, 12], [19, 12]]);
  });
  it('really opens and closes the tips, not only a warning color', () => {
    const tips = frames.map(bytes => Array.from({ length: 32 }, (_, x) => x).filter(x => bytes[(26 * 32 + x) * 4 + 3]));
    expect(tips).toEqual([[11, 20], [11, 20], [8, 23], [15, 16]]);
    expect(new Set(frames.map(bytes => bytes.toString('hex'))).size).toBe(4);
  });
  it('retains editable RGB source, five linked cels and no reference layer', () => {
    expect([source.width, source.height, source.frames]).toEqual([32, 32, 4]); expect(source.durations).toEqual([240, 240, 1800, 500]);
    expect([...new Set(source.paletteSizes)]).toEqual([20]); expect(source.layers.map(layer => layer.name)).toEqual(['gripper-right', 'gripper-left', 'chassis', 'scanner']);
    expect(atlas.meta.layers.map(layer => layer.name)).toEqual(source.layers.map(layer => layer.name)); expect(source.rasterCels).toHaveLength(16);
    expect(source.rasterCels.filter(cel => cel.linked !== undefined)).toHaveLength(5);
  });
  it.each([0, 1, 2, 3])('frame%i RGBA equals independently decoded native source', index => {
    expect(visibleRaster(composite(source, index))).toEqual(visibleRaster(frames[index]));
  });
  it('keeps the whole native chassis byte-identical across every state', () => {
    const index = source.layers.findIndex(layer => layer.name === 'chassis'), first = layerRaster(source, 0, index);
    for (let i = 1; i < 4; i++) expect(layerRaster(source, i, index)).toEqual(first);
  });
  it.each([0, 1, 2, 3])('frame%i has nonoverlapping native left/right harvesting parts', index => {
    const left = layerRaster(source, index, source.layers.findIndex(layer => layer.name === 'gripper-left'));
    const right = layerRaster(source, index, source.layers.findIndex(layer => layer.name === 'gripper-right'));
    expect(colors(left).area).toBeGreaterThan(0); expect(colors(right).area).toBeGreaterThan(0);
    for (let p = 3; p < left.length; p += 4) expect(Boolean(left[p] && right[p])).toBe(false);
  });
});
