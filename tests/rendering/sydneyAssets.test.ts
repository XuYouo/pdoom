import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SYDNEY_ASSET, SYDNEY_BINDING } from '../../src/pages/GamePage/game/data/sydneyAssets';
interface Pixels { width: number; height: number; rgba: Buffer }
interface SydneyAtlas {
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

interface SourceCel { frame: number; layer: number; x: number; y: number; opacity: number; z: number; image: Pixels; linked?: number }
interface NativeSource { width: number; height: number; frames: number; durations: number[]; paletteSizes: number[]; paletteColors: string[]; tags: { name: string; from: number; to: number; direction: number; repeats: number }[]; layers: { name: string; flags: number; type: number; blend: number; opacity: number }[]; rasterCels: SourceCel[] }
// Decode actual RGB/linked cels, never a provenance boolean or the PNG itself.
function nativeSource(path: string): NativeSource {
  const file = readFileSync(new URL(path, import.meta.url)); expect(file.length).toBeGreaterThanOrEqual(128);
  expect(file.readUInt32LE(0)).toBe(file.length); expect(file.readUInt16LE(4)).toBe(0xa5e0); expect(file.readUInt16LE(12)).toBe(32);
  const result: NativeSource = { width: file.readUInt16LE(8), height: file.readUInt16LE(10), frames: file.readUInt16LE(6), durations: [], paletteSizes: [], paletteColors: [], tags: [], layers: [], rasterCels: [] };
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
      if (type === 0x2004) { expect(length).toBeGreaterThanOrEqual(24); expect(24 + file.readUInt16LE(start + 22)).toBeLessThanOrEqual(length); result.layers.push({ name: file.toString('utf8', start + 24, start + 24 + file.readUInt16LE(start + 22)), flags: file.readUInt16LE(start + 6), type: file.readUInt16LE(start + 8), blend: file.readUInt16LE(start + 16), opacity: file[start + 18] }); }
      if (type === 0x2019) {
        expect(length).toBeGreaterThanOrEqual(26); const size = file.readUInt32LE(start + 6);
        const first = file.readUInt32LE(start + 10), last = file.readUInt32LE(start + 14);
        expect(first).toBeLessThanOrEqual(last); expect(last).toBeLessThan(size); result.paletteSizes.push(size);
        let p = start + 26;
        for (let i = first; i <= last; i++) {
          expect(p + 6).toBeLessThanOrEqual(stop); const flags = file.readUInt16LE(p);
          result.paletteColors.push(file.toString('hex', p + 2, p + 6)); p += 6;
          if (flags & 1) { expect(p + 2).toBeLessThanOrEqual(stop); p += 2 + file.readUInt16LE(p); }
          expect(p).toBeLessThanOrEqual(stop);
        }
        expect(p).toBe(stop);
      }
      if (type === 0x2018) {
        expect(length).toBeGreaterThanOrEqual(16); const count = file.readUInt16LE(start + 6);
        let p = start + 16;
        for (let i = 0; i < count; i++) {
          expect(p + 19).toBeLessThanOrEqual(stop); const size = file.readUInt16LE(p + 17);
          expect(p + 19 + size).toBeLessThanOrEqual(stop);
          result.tags.push({ name: file.toString('utf8', p + 19, p + 19 + size), from: file.readUInt16LE(p), to: file.readUInt16LE(p + 2), direction: file[p + 4], repeats: file.readUInt16LE(p + 5) });
          p += 19 + size;
        }
        expect(p).toBe(stop);
      }
      if (type === 0x2005) {
        expect(length).toBeGreaterThanOrEqual(24); const celType = file.readUInt16LE(start + 13);
        expect([0, 1, 2]).toContain(celType);
        if (celType === 1) {
          const linked = file.readUInt16LE(start + 22), layer = file.readUInt16LE(start + 6);
          expect(linked).toBeLessThan(frame);
          const previous = result.rasterCels.find(cel => cel.frame === linked && cel.layer === layer);
          if (!previous) throw new Error('Invalid native linked cel');
          result.rasterCels.push({ frame, layer, x: file.readInt16LE(start + 8), y: file.readInt16LE(start + 10), opacity: file[start + 12], z: file.readInt16LE(start + 15), image: previous.image, linked });
        }
        if (celType === 0 || celType === 2) {
          expect(length).toBeGreaterThanOrEqual(26);
          const width = file.readUInt16LE(start + 22), height = file.readUInt16LE(start + 24);
          const bytes = file.subarray(start + 26, stop), rgba = celType === 2 ? inflateSync(bytes) : Buffer.from(bytes);
          expect(rgba.length).toBe(width * height * 4);
          result.rasterCels.push({ frame, layer: file.readUInt16LE(start + 6), x: file.readInt16LE(start + 8), y: file.readInt16LE(start + 10), opacity: file[start + 12], z: file.readInt16LE(start + 15), image: { width, height, rgba } });
        }
      }
      start = stop;
    }
    expect(start).toBe(end); offset = end;
  }
  expect(offset).toBe(file.length); return result;
}

function layerRaster(source: NativeSource, frame: number, layer: number): Buffer {
  const matches = source.rasterCels.filter(cel => cel.frame === frame && cel.layer === layer); expect(matches.length).toBeLessThanOrEqual(1);
  const result = Buffer.alloc(source.width * source.height * 4);
  if (!matches.length) return result; // Corruption intentionally has no cel in phase 1.
  const cel = matches[0]; expect(cel.z).toBe(0);
  expect(cel.opacity).toBe(255); expect(cel.x).toBeGreaterThanOrEqual(0); expect(cel.y).toBeGreaterThanOrEqual(0);
  expect(cel.x + cel.image.width).toBeLessThanOrEqual(source.width); expect(cel.y + cel.image.height).toBeLessThanOrEqual(source.height);
  for (let y = 0; y < cel.image.height; y++) for (let x = 0; x < cel.image.width; x++) {
    const from = (y * cel.image.width + x) * 4, alpha = cel.image.rgba[from + 3]; if (alpha !== 0 && alpha !== 255) throw new Error('Soft alpha in native cel');
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
const atlas = JSON.parse(readFileSync(new URL('../../public/game/sydney.json', import.meta.url), 'utf8')) as SydneyAtlas;
const image = decodePng('../../public/game/sydney.png');
const frames = atlas.frames.map(value => crop(image, value.frame.x, value.frame.y, value.frame.w, value.frame.h));
const source = nativeSource('../../assets/source/sydney.aseprite');
// Independent static oracle. Slots 4 and 8 are spare phase-2/3 idles, not native-run coverage.
const expectedNames = Array.from({ length: 12 }, (_, i) => `sydney ${i}.aseprite`);
const durations = [600, 1100, 300, 1500, 600, 1100, 300, 1500, 600, 900, 300, 1250];
const allFrames = Array.from({ length: 12 }, (_, i) => i);
const layerNames = ['veil-back', 'hair-back', 'skirt', 'torso', 'arm-left', 'arm-right', 'face', 'hair-front', 'veil-front', 'expression', 'corruption'];
const commonLayers = ['veil-back', 'hair-back', 'skirt', 'torso', 'face', 'hair-front', 'veil-front'];
const opaqueColors = ['2c2330', '34354f', '575c79', '723f68', '858eb0', '9dded1', 'cbb696', 'd9ffea', 'eaa083', 'f5e8c8'];
const tags = [{ name: 'dialogue', from: 0, to: 3 }, { name: 'knife', from: 4, to: 7 }, { name: 'control', from: 8, to: 11 }];
const layerIndex = (name: string) => { const index = source.layers.findIndex(layer => layer.name === name); expect(index).toBeGreaterThanOrEqual(0); return index; };
const rowPixels = (bytes: Buffer, y: number) => Array.from({ length: 96 }, (_, x) => x).filter(x => bytes[(y * 96 + x) * 4 + 3] !== 0);
const alphaMask = (bytes: Buffer) => Buffer.from(Array.from({ length: bytes.length / 4 }, (_, i) => bytes[i * 4 + 3]));
const withinColorBudget = (bytes: Buffer) => colors(bytes).opaque.length <= 10;
const countColor = (bytes: Buffer, hex: string) => { let count = 0; for (let p = 0; p < bytes.length; p += 4) if (bytes[p + 3] && bytes.toString('hex', p, p + 3) === hex) count++; return count; };

describe('Sydney twelve static native source poses, not twelve Core-reachable or in-game accepted poses', () => {
  it('binds only actual export names and immutable 96px centered descriptor data', () => {
    expect(SYDNEY_ASSET).toMatchObject({ kind: 'sydney', key: 'boss-sydney', image: 'game/sydney.png', atlas: 'game/sydney.json', frameWidth: 96, frameHeight: 96, frameCount: 12, pivot: { x: 48, y: 48 } });
    expect(SYDNEY_ASSET.frames).toEqual(expectedNames); expect(SYDNEY_ASSET.frameDurations).toEqual(durations);
    expect(SYDNEY_BINDING).toEqual({ key: 'boss-sydney', frames: expectedNames });
    for (const value of [SYDNEY_ASSET, SYDNEY_BINDING, SYDNEY_ASSET.frames, SYDNEY_ASSET.frameDurations, SYDNEY_ASSET.pivot]) expect(Object.isFrozen(value)).toBe(true);
  });
  it('publishes twelve full untrimmed, unrotated cells on the real 1152x96 sheet', () => {
    expect([image.width, image.height]).toEqual([1152, 96]);
    expect(atlas.meta).toMatchObject({ image: 'sydney.png', format: 'RGBA8888', size: { w: 1152, h: 96 }, scale: '1' });
    expect(atlas.frames.map(frame => frame.filename)).toEqual(expectedNames); expect(atlas.frames).toHaveLength(12);
    atlas.frames.forEach((frame, i) => {
      expect(frame.frame).toEqual({ x: i * 96, y: 0, w: 96, h: 96 }); expect(frame.rotated).toBe(false); expect(frame.trimmed).toBe(false);
      expect(frame.sourceSize).toEqual({ w: 96, h: 96 }); expect(frame.spriteSourceSize).toEqual({ x: 0, y: 0, w: 96, h: 96 });
    });
  });
  it('retains real preview durations and three phase tags without implying a runtime clock', () => {
    expect(atlas.frames.map(frame => frame.duration)).toEqual(durations); expect(source.durations).toEqual(durations);
    expect(atlas.meta.frameTags.map(({ name, from, to, direction }) => ({ name, from, to, direction }))).toEqual(tags.map(tag => ({ ...tag, direction: 'forward' })));
    expect(source.tags).toEqual(tags.map(tag => ({ ...tag, direction: 0, repeats: 0 })));
  });
  it('retains the measured eleven-layer editable rig, 128 cels and 105 native links', () => {
    expect([source.width, source.height, source.frames]).toEqual([96, 96, 12]);
    expect(source.layers).toEqual(layerNames.map(name => ({ name, flags: 3, type: 0, blend: 0, opacity: 255 })));
    expect(atlas.meta.layers).toEqual(layerNames.map(name => ({ name, opacity: 255, blendMode: 'normal' })));
    expect(source.layers.some(layer => /reference|sketch|guide/i.test(layer.name) || (layer.flags & 64) !== 0)).toBe(false);
    expect(source.rasterCels).toHaveLength(128); expect(source.rasterCels.filter(cel => cel.linked !== undefined)).toHaveLength(105);
    expect(source.rasterCels.filter(cel => cel.linked === undefined)).toHaveLength(23);
    const ranges = Object.fromEntries(source.layers.map((layer, index) => [layer.name, source.rasterCels.filter(cel => cel.layer === index).map(cel => cel.frame)]));
    expect(ranges).toEqual(Object.fromEntries(layerNames.map(name => [name, name === 'corruption' ? allFrames.slice(4) : allFrames])));
    expect([...new Set(source.rasterCels.map(cel => cel.opacity))]).toEqual([255]); expect([...new Set(source.rasterCels.map(cel => cel.z))]).toEqual([0]);
  });
  it('uses the 20-slot source palette but only ten measured opaque colors and hard alpha', () => {
    expect(source.paletteSizes).toEqual([20]); expect(source.paletteColors).toHaveLength(20); expect(new Set(source.paletteColors).size).toBe(20);
    for (const color of opaqueColors) expect(source.paletteColors).toContain(`${color}ff`);
    expect(colors(image.rgba)).toMatchObject({ opaque: opaqueColors, alphas: [0, 255], orange: 0 }); expect(withinColorBudget(image.rgba)).toBe(true);
    const nativeColors = new Set<string>();
    for (const cel of source.rasterCels) {
      const stats = colors(cel.image.rgba); expect(stats.alphas.every(alpha => alpha === 0 || alpha === 255)).toBe(true); expect(stats.orange).toBe(0);
      for (const color of stats.opaque) nativeColors.add(color);
    }
    expect([...nativeColors].sort()).toEqual(opaqueColors);
    // The shared palette may reserve D97757; the prohibition is on actual opaque pixels.
  });
  it('has a positive control that rejects an eleventh color instead of a vacuous budget', () => {
    const changed = Buffer.from(image.rgba); let p = 0; while (changed[p + 3] === 0) p += 4;
    expect(countColor(changed, changed.toString('hex', p, p + 3))).toBeGreaterThan(1);
    changed.set([1, 2, 3, 255], p);
    expect(colors(changed).opaque).toHaveLength(11); expect(withinColorBudget(changed)).toBe(false);
    changed.set([217, 119, 87, 255], p); expect(colors(changed).orange).toBe(1);
    changed[p + 3] = 128; expect(colors(changed).alphas).toContain(128);
    expect(colors(image.rgba)).toMatchObject({ opaque: opaqueColors, alphas: [0, 255], orange: 0 });
  });
  it.each(allFrames)('static frame %i is nonempty, multicolor and inside the unchanged body envelope', index => {
    const stats = colors(frames[index]), measured = bounds(frames[index], 96, 96);
    const expected = index % 4 === 1 || index % 4 === 2 ? [22, 14, 73, 84] : [26, 14, 70, 84];
    expect(measured).toEqual(expected);
    expect(measured[0]).toBeGreaterThanOrEqual(22); expect(measured[1]).toBeGreaterThanOrEqual(11); expect(measured[2]).toBeLessThanOrEqual(73); expect(measured[3]).toBeLessThanOrEqual(84);
    expect(stats.area).toBe([1928, 1950, 1926, 1861][index % 4]);
    expect(stats.opaque.length).toBe([9, 9, 9, 9, 8, 8, 9, 8, 10, 10, 10, 10][index]); expect(stats.opaque.length).toBeLessThanOrEqual(10);
    expect(stats.alphas).toEqual([0, 255]); expect(stats.orange).toBe(0);
  });
  it.each(allFrames)('static frame %i RGBA exactly equals independently reconstructed ASE cels', index => {
    expect(composite(source, index)).toEqual(frames[index]); // Includes transparent RGB, not just silhouettes.
  });
  it('contains twelve visibly unique static poses, including two spare idles', () => {
    expect(new Set(frames.map(bytes => visibleRaster(bytes).toString('hex'))).size).toBe(12);
    // Natural Core phase changes enter recover, not idle: slots 4/8 are not a 12-pose gameplay claim.
    expect(expectedNames.filter((_, index) => index !== 4 && index !== 8)).toHaveLength(10);
  });
  it.each(commonLayers)('keeps shared native %s pixel-identical and linked to frame one', name => {
    const layer = layerIndex(name), first = layerRaster(source, 0, layer);
    expect(colors(first).area).toBeGreaterThan(0);
    for (let frame = 1; frame < 12; frame++) {
      const cel = source.rasterCels.find(value => value.frame === frame && value.layer === layer);
      expect(cel?.linked).toBe(0); expect(layerRaster(source, frame, layer)).toEqual(first);
    }
  });
  it.each(['arm-left', 'arm-right'])('keeps %s hands and clothing byte-identical for the same pose across phases', name => {
    const layer = layerIndex(name), areas = name === 'arm-left' ? [87, 142, 138, 91] : [87, 143, 139, 92];
    const poseImages = [0, 1, 2, 3].map(frame => layerRaster(source, frame, layer));
    expect(new Set(poseImages.map(bytes => bytes.toString('hex'))).size).toBe(4);
    for (const frame of allFrames) {
      const cel = source.rasterCels.find(value => value.frame === frame && value.layer === layer);
      const pixels = layerRaster(source, frame, layer), stats = colors(pixels);
      expect(stats.area).toBe(areas[frame % 4]); expect(stats.opaque).toHaveLength(5); expect(pixels).toEqual(poseImages[frame % 4]);
      if (frame >= 4) expect(cel?.linked).toBe(frame % 4); else expect(cel?.linked).toBeUndefined();
    }
  });
  it('preserves all three tail tips and the lower garment without phase drift', () => {
    const lower = crop({ width: 96, height: 96, rgba: frames[0] }, 0, 72, 96, 24);
    for (const frame of allFrames) {
      expect(rowPixels(frames[frame], 80)).toEqual([36, 37, 38, 39, 46, 47, 48, 49, 59, 60, 61]);
      expect(rowPixels(frames[frame], 84)).toEqual([51]);
      expect(crop({ width: 96, height: 96, rgba: frames[frame] }, 0, 72, 96, 24)).toEqual(lower);
      expect(alphaMask(frames[frame])).toEqual(alphaMask(frames[frame % 4]));
    }
  });
  it.each(allFrames)('static frame %i keeps corruption in its real phase without covering the arms', frame => {
    const layer = layerIndex('corruption'), cel = source.rasterCels.find(value => value.frame === frame && value.layer === layer);
    const corrupt = layerRaster(source, frame, layer), left = layerRaster(source, frame, layerIndex('arm-left')), right = layerRaster(source, frame, layerIndex('arm-right'));
    expect(colors(corrupt).area).toBe(frame < 4 ? 0 : frame < 8 ? 64 : 96);
    if (frame < 4) expect(cel).toBeUndefined();
    else {
      expect(cel).toBeDefined(); expect(cel?.linked).toBe(frame % 4 === 0 ? undefined : frame < 8 ? 4 : 8);
      expect(bounds(corrupt, 96, 96)).toEqual(frame < 8 ? [40, 26, 55, 63] : [32, 22, 55, 70]);
    }
    let overlaps = 0;
    for (let p = 3; p < corrupt.length; p += 4) if (corrupt[p] && (left[p] || right[p])) overlaps++;
    expect(overlaps).toBe(0);
  });
});
