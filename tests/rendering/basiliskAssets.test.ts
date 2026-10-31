import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
interface Pixels { width: number; height: number; rgba: Buffer }
interface BasiliskAtlas {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; rotated: boolean; trimmed: boolean; spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }[];
  meta: { image: string; format: string; size: { w: number; h: number }; scale: string; frameTags: { name: string; from: number; to: number; direction: string; color: string }[]; layers: { name: string; opacity: number; blendMode: string }[] };
}
// Local PNG/ASE decoders adapted from the independent probe/Sydney tests. No image dependency or output file.
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
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
    expect(png.readUInt32BE(offset + length + 8)).toBe(crc32(png.subarray(offset + 4, offset + length + 8)));
    if (type === 'IHDR') expect(length).toBe(13);
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

interface SourceCel { frame: number; layer: number; x: number; y: number; opacity: number; z: number; type: number; image: Pixels; linked?: number }
interface NativeSource { flags: number; speed: number; frameHeaders: { legacy: number; modern: number; chunks: number }[]; width: number; height: number; frames: number; durations: number[]; paletteSizes: number[]; paletteColors: string[]; tags: { name: string; from: number; to: number; direction: number; repeats: number; color: string }[]; layers: { name: string; flags: number; type: number; level: number; blend: number; opacity: number }[]; rasterCels: SourceCel[] }
// Decode actual RGB/linked cels, never a provenance boolean or the PNG itself.
function nativeSource(path: string): NativeSource {
  const file = readFileSync(new URL(path, import.meta.url)); expect(file.length).toBeGreaterThanOrEqual(128);
  expect(file.readUInt32LE(0)).toBe(file.length); expect(file.readUInt16LE(4)).toBe(0xa5e0); expect(file.readUInt16LE(12)).toBe(32);
  const result: NativeSource = { flags: file.readUInt32LE(14), speed: file.readUInt16LE(18), frameHeaders: [], width: file.readUInt16LE(8), height: file.readUInt16LE(10), frames: file.readUInt16LE(6), durations: [], paletteSizes: [], paletteColors: [], tags: [], layers: [], rasterCels: [] };
  let offset = 128;
  for (let frame = 0; frame < result.frames; frame++) {
    expect(offset + 16).toBeLessThanOrEqual(file.length);
    const size = file.readUInt32LE(offset), legacy = file.readUInt16LE(offset + 6), modern = file.readUInt32LE(offset + 12);
    const chunks = legacy === 65535 ? modern : legacy, end = offset + size;
    expect(size).toBeGreaterThanOrEqual(16); if (modern) expect(modern).toBe(chunks); result.frameHeaders.push({ legacy, modern, chunks });
    expect(file.readUInt16LE(offset + 4)).toBe(0xf1fa); expect(end).toBeLessThanOrEqual(file.length); result.durations.push(file.readUInt16LE(offset + 8));
    let start = offset + 16;
    for (let chunk = 0; chunk < chunks; chunk++) {
      expect(start + 6).toBeLessThanOrEqual(end);
      const length = file.readUInt32LE(start), type = file.readUInt16LE(start + 4), stop = start + length;
      expect(length).toBeGreaterThanOrEqual(6); expect(stop).toBeLessThanOrEqual(end);
      if (type === 0x2004) { expect(length).toBeGreaterThanOrEqual(24); expect(24 + file.readUInt16LE(start + 22)).toBeLessThanOrEqual(length); result.layers.push({ name: file.toString('utf8', start + 24, start + 24 + file.readUInt16LE(start + 22)), flags: file.readUInt16LE(start + 6), type: file.readUInt16LE(start + 8), level: file.readUInt16LE(start + 10), blend: file.readUInt16LE(start + 16), opacity: file[start + 18] }); }
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
          result.tags.push({ name: file.toString('utf8', p + 19, p + 19 + size), from: file.readUInt16LE(p), to: file.readUInt16LE(p + 2), direction: file[p + 4], repeats: file.readUInt16LE(p + 5), color: file.toString('hex', p + 13, p + 16) });
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
          result.rasterCels.push({ frame, layer, x: file.readInt16LE(start + 8), y: file.readInt16LE(start + 10), opacity: file[start + 12], z: file.readInt16LE(start + 15), type: celType, image: previous.image, linked });
        }
        if (celType === 0 || celType === 2) {
          expect(length).toBeGreaterThanOrEqual(26);
          const width = file.readUInt16LE(start + 22), height = file.readUInt16LE(start + 24);
          const bytes = file.subarray(start + 26, stop), rgba = celType === 2 ? inflateSync(bytes) : Buffer.from(bytes);
          expect(rgba.length).toBe(width * height * 4);
          result.rasterCels.push({ frame, layer: file.readUInt16LE(start + 6), x: file.readInt16LE(start + 8), y: file.readInt16LE(start + 10), opacity: file[start + 12], z: file.readInt16LE(start + 15), type: celType, image: { width, height, rgba } });
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
  const result = Buffer.alloc(source.width * source.height * 4);
  const cel = matches[0]; expect(cel.z).toBe(0);
  expect(cel.opacity).toBe(255); expect([cel.x, cel.y].every(Number.isInteger)).toBe(true);
  expect(cel.image.width).toBeGreaterThan(0); expect(cel.image.height).toBeGreaterThan(0);
  for (let y = 0; y < cel.image.height; y++) for (let x = 0; x < cel.image.width; x++) {
    const from = (y * cel.image.width + x) * 4, alpha = cel.image.rgba[from + 3]; if (alpha !== 0 && alpha !== 255) throw new Error('Soft alpha in native cel');
    const dx = cel.x + x, dy = cel.y + y;
    // Full-canvas native cels may shift over an edge, but only transparent padding may leave it.
    if (dx < 0 || dy < 0 || dx >= source.width || dy >= source.height) { expect(alpha).toBe(0); continue; }
    if (alpha) cel.image.rgba.copy(result, (dy * source.width + dx) * 4, from, from + 4);
  }
  return result;
}
function composite(source: NativeSource, frame: number, includeHidden = false): Buffer {
  const result = Buffer.alloc(source.width * source.height * 4);
  source.layers.forEach((layer, index) => {
    if (!(layer.flags & 1) && !includeHidden) return;
    expect(layer.type).toBe(0); expect(layer.blend).toBe(0); expect(layer.opacity).toBe(255);
    const bytes = layerRaster(source, frame, index);
    for (let p = 0; p < bytes.length; p += 4) if (bytes[p + 3]) bytes.copy(result, p, p, p + 4);
  });
  return result;
}
// Independent frozen-source evidence: no generation report or runtime binding is an oracle.
const atlas = JSON.parse(readFileSync(new URL('../../public/game/basilisk.json', import.meta.url), 'utf8')) as BasiliskAtlas;
const image = decodePng('../../public/game/basilisk.png');
const frames = atlas.frames.map(frame => crop(image, frame.frame.x, frame.frame.y, frame.frame.w, frame.frame.h));
const source = nativeSource('../../assets/source/basilisk.aseprite');
const allFrames = Array.from({ length: 8 }, (_, i) => i);
const tagNames = ['normal-idle', 'normal-tell', 'normal-attack', 'normal-recover', 'enraged-idle', 'enraged-tell', 'enraged-attack', 'enraged-recover'];
const tagColors = ['8fa86b', 'e5c386', '9dded1', '426b50', '783f4a', 'eaa083', 'b55a4a', '723f68'];
const sharedPalette = ['00000000', '2c2330ff', 'd97757ff', 'eaa083ff', 'b55a4aff', '783f4aff', 'f5e8c8ff', 'cbb696ff', '34354fff', '575c79ff', '858eb0ff', '9dded1ff', 'd9ffeaff', '0f191bff', '24423bff', '426b50ff', '8fa86bff', 'b9905dff', 'e5c386ff', '723f68ff'];
const opaqueColors = ['24423b', '2c2330', '34354f', '426b50', '783f4a', '8fa86b', '9dded1', 'b55a4a', 'b9905d', 'cbb696', 'd9ffea', 'e5c386', 'eaa083', 'f5e8c8'];
const visibleLayers = ['tail', 'coil-back', 'hood', 'neck', 'head', 'jaw', 'eye', 'coil-front', 'crest'];
const staticLayers = ['tail', 'coil-back', 'hood', 'neck', 'head', 'coil-front'];
const expectedArea = [2834, 2864, 2867, 2842, 2834, 2864, 2867, 2842];
const expectedColorCount = [11, 9, 11, 10, 11, 11, 11, 11];
const expectedTop = [10, 9, 9, 10, 10, 9, 9, 10];
const expectedFullDifference = [[0, 320, 399, 272, 343, 572, 603, 496], [320, 0, 407, 393, 572, 343, 617, 600], [399, 407, 0, 493, 603, 617, 343, 649], [272, 393, 493, 0, 496, 600, 649, 343], [343, 572, 603, 496, 0, 310, 399, 272], [572, 343, 617, 600, 310, 0, 405, 388], [603, 617, 343, 649, 399, 405, 0, 493], [496, 600, 649, 343, 272, 388, 493, 0]];
const expectedCrestDifference = [[0, 214, 286, 262, 314, 451, 478, 466], [214, 0, 264, 286, 451, 314, 468, 478], [286, 264, 0, 374, 478, 468, 314, 523], [262, 286, 374, 0, 466, 478, 523, 314], [314, 451, 478, 466, 0, 214, 286, 262], [451, 314, 468, 478, 214, 0, 264, 286], [478, 468, 314, 523, 286, 264, 0, 374], [466, 478, 523, 314, 262, 286, 374, 0]];
const expectedKernelDifference = [[0, 96, 136, 108, 131, 190, 209, 190], [96, 0, 109, 133, 190, 131, 192, 205], [136, 109, 0, 175, 209, 192, 134, 225], [108, 133, 175, 0, 190, 205, 225, 126], [131, 190, 209, 190, 0, 96, 136, 108], [190, 131, 192, 205, 96, 0, 109, 133], [209, 192, 134, 225, 136, 109, 0, 175], [190, 205, 225, 126, 108, 133, 175, 0]];
const nativeOffsets = {"jaw": [[0, 0], [0, -1], [0, 1], [0, 0], [0, 0], [0, -1], [0, 1], [0, 0]], "eye": [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], "crest": [[0, 0], [0, -1], [-1, -1], [1, 0], [0, 0], [0, 0], [0, 0], [0, 0]]} as const;
// Primary witness is XYWH(28,8,53,32), i.e. half-open [28,8,81,40).
const crestArea = { x: 28, y: 8, w: 53, h: 32 };
// Additional smaller witness is the distinct half-open box [28,8,53,32).
const kernelArea = { x: 28, y: 8, w: 25, h: 24 };
const frameImage = (rgba: Buffer): Pixels => ({ width: 96, height: 96, rgba });
const layerIndex = (name: string) => { const index = source.layers.findIndex(layer => layer.name === name); expect(index).toBeGreaterThanOrEqual(0); return index; };
function changed(a: Buffer, b: Buffer, area = { x: 0, y: 0, w: 96, h: 96 }): number {
  let count = 0;
  for (let y = area.y; y < area.y + area.h; y++) for (let x = area.x; x < area.x + area.w; x++) { const p = (y * 96 + x) * 4; if (!a.subarray(p, p + 4).equals(b.subarray(p, p + 4))) count++; }
  return count;
}
const pairs = allFrames.flatMap(a => allFrames.filter(b => b > a).map(b => ({ a, b })));

describe('Basilisk eight frozen source poses, not eight naturally observed gameplay states', () => {
  it('exports eight exact named96px cells without padding, trimming, rotation or scaling', () => {
    expect([image.width, image.height]).toEqual([768, 96]); expect(atlas.frames).toHaveLength(8);
    expect(atlas.meta).toMatchObject({ image: 'basilisk.png', format: 'RGBA8888', size: { w: 768, h: 96 }, scale: '1' });
    expect(atlas.frames.map(frame => frame.filename)).toEqual(allFrames.map(i => `basilisk ${i}.aseprite`));
    atlas.frames.forEach((frame, i) => {
      expect(frame.frame).toEqual({ x: i * 96, y: 0, w: 96, h: 96 }); expect(frame.rotated).toBe(false); expect(frame.trimmed).toBe(false);
      expect(frame.sourceSize).toEqual({ w: 96, h: 96 }); expect(frame.spriteSourceSize).toEqual({ x: 0, y: 0, w: 96, h: 96 });
    });
  });
  it('retains eight single-frame normal/enraged tags and100ms metadata, not a gameplay clock', () => {
    expect(atlas.frames.map(frame => frame.duration)).toEqual(Array(8).fill(100)); expect(source.durations).toEqual(Array(8).fill(100));
    expect(atlas.meta.frameTags).toEqual(tagNames.map((name, i) => ({ name, from: i, to: i, direction: 'forward', color: `#${tagColors[i]}ff` })));
    expect(source.tags).toEqual(tagNames.map((name, i) => ({ name, from: i, to: i, direction: 0, repeats: 0, color: tagColors[i] })));
  });
  it('retains complete RGB ASE file/frame headers and mutually consistent chunk counts', () => {
    expect([source.width, source.height, source.frames, source.flags, source.speed]).toEqual([96, 96, 8, 1, 100]);
    expect(source.frameHeaders).toEqual([31, 10, 10, 10, 10, 10, 10, 10].map(chunks => ({ chunks, legacy: chunks, modern: chunks })));
  });
  it('retains the nine visible parts in real compositing order and a hidden non-reference sketch', () => {
    expect(source.layers.map(layer => layer.name)).toEqual(['sketch', ...visibleLayers]); expect(source.layers.map(layer => layer.flags)).toEqual([0, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    for (const layer of source.layers) expect(layer).toMatchObject({ type: 0, level: 0, blend: 0, opacity: 255 });
    expect(atlas.meta.layers).toEqual(visibleLayers.map(name => ({ name, opacity: 255, blendMode: 'normal' })));
  });
  it('keeps the shared20 palette and source cels hard-alpha, palette-legal and free of hero-orange ink', () => {
    expect(source.paletteSizes).toEqual([20]); expect(source.paletteColors).toEqual(sharedPalette);
    const ink = colors(Buffer.concat(source.rasterCels.map(cel => cel.image.rgba)));
    expect(ink).toMatchObject({ opaque: opaqueColors, alphas: [0, 255], orange: 0 }); for (const color of ink.opaque) expect(sharedPalette).toContain(`${color}ff`);
  });
  it('exports the independently measured14-color union, without counting alpha0 RGB as ink', () => {
    expect(colors(image.rgba)).toMatchObject({ opaque: opaqueColors, alphas: [0, 255], orange: 0 });
  });
  it.each(allFrames)('frame%i preserves measured silhouette area,9-11 colors and the same foot baseline', index => {
    expect(bounds(frames[index], 96, 96)).toEqual([15, expectedTop[index], 85, 87]);
    expect(colors(frames[index])).toMatchObject({ area: expectedArea[index], alphas: [0, 255], orange: 0 });
    expect(colors(frames[index]).opaque).toHaveLength(expectedColorCount[index]); expect(expectedColorCount[index]).toBeGreaterThanOrEqual(9); expect(expectedColorCount[index]).toBeLessThanOrEqual(11);
  });
  it.each(allFrames)('frame%i is exact RGBA reconstruction from the real layers/cels/links and signed origins', index => {
    expect(composite(source, index)).toEqual(frames[index]);
  });
  it.each(allFrames)('frame%i excludes the real2754px sketch and fails the include-hidden negative control', index => {
    expect(colors(layerRaster(source, index, layerIndex('sketch'))).area).toBe(2754);
    expect(changed(composite(source, index, true), frames[index])).toBe([174, 152, 182, 175, 174, 152, 182, 175][index]);
  });
  it('has exactly80 native cels:42 linked and38 compressed rasters, ten per frame', () => {
    expect(source.rasterCels).toHaveLength(80); expect(source.rasterCels.filter(cel => cel.type === 1)).toHaveLength(42); expect(source.rasterCels.filter(cel => cel.type === 2)).toHaveLength(38);
    for (const frame of allFrames) expect(source.rasterCels.filter(cel => cel.frame === frame)).toHaveLength(10);
    for (const cel of source.rasterCels) expect([cel.image.width, cel.image.height, cel.opacity, cel.z]).toEqual([96, 96, 255, 0]);
  });
  it.each(staticLayers)('%s has seven actual links to frame0, with fixed origins and identical rendered pixels', name => {
    const index = layerIndex(name), cels = source.rasterCels.filter(cel => cel.layer === index); expect(cels).toHaveLength(8);
    expect(cels[0].type).toBe(2); expect(cels[0].linked).toBeUndefined();
    for (const cel of cels) expect(cel).toMatchObject({ x: 0, y: 0, z: 0, opacity: 255 });
    for (const frame of allFrames.slice(1)) {
      expect(cels[frame]).toMatchObject({ type: 1, linked: 0 }); expect(cels[frame].image).toBe(cels[0].image);
      expect(layerRaster(source, frame, index)).toEqual(layerRaster(source, 0, index));
    }
  });
  it.each(['jaw', 'eye', 'crest'] as const)('%s remains pose-local with its actual native positions, not falsely eight unique raw buffers', name => {
    const index = layerIndex(name), cels = source.rasterCels.filter(cel => cel.layer === index); expect(cels).toHaveLength(8);
    expect(cels.every(cel => cel.type === 2 && cel.linked === undefined)).toBe(true); expect(new Set(cels.map(cel => cel.image)).size).toBe(8);
    expect(cels.map(cel => [cel.x, cel.y])).toEqual(nativeOffsets[name]);
    expect(new Set(cels.map(cel => cel.image.rgba.toString('hex'))).size).toBe({ jaw: 1, eye: 8, crest: 5 }[name]);
    expect(new Set(allFrames.map(frame => layerRaster(source, frame, index).toString('hex'))).size).toBe({ jaw: 3, eye: 8, crest: 8 }[name]);
  });
  it('keeps eight independent hidden sketch copies without inventing links or empty-source provenance', () => {
    const cels = source.rasterCels.filter(cel => cel.layer === layerIndex('sketch')); expect(cels).toHaveLength(8);
    expect(cels.every(cel => cel.type === 2 && cel.linked === undefined)).toBe(true); expect(new Set(cels.map(cel => cel.image)).size).toBe(8);
    expect(new Set(cels.map(cel => cel.image.rgba.toString('hex'))).size).toBe(1);
  });
  it('holds both foot rows byte-identical and maps measured row87 to world319, without enlarging the52x74 Core box', () => {
    const foot = frames[0].subarray(86 * 96 * 4, 88 * 96 * 4);
    for (const bytes of frames) {
      expect(bytes.subarray(86 * 96 * 4, 88 * 96 * 4)).toEqual(foot);
      expect(Array.from({ length: 96 }, (_, x) => x).filter(x => bytes[(87 * 96 + x) * 4 + 3])).toEqual(Array.from({ length: 30 }, (_, i) => 34 + i));
      expect(280 + bounds(bytes, 96, 96)[3] - 48).toBe(319);
    }
    // Fixed Core center280 and y+/-37 give local rows11..84; art adds3 decorative foot rows, not collision.
    expect(87 - (48 + 37 - 1)).toBe(3);
  });
  it('holds the low eye and beam socket at their measured source landmarks with centered48px presentation', () => {
    const centers = ['9dded1ff', 'e5c386ff', 'd9ffeaff', '9dded1ff', 'eaa083ff', 'eaa083ff', 'f5e8c8ff', 'eaa083ff'];
    for (const index of allFrames) {
      expect(bounds(layerRaster(source, index, layerIndex('eye')), 96, 96)).toEqual([24, 59, 31, 66]);
      expect(crop(frameImage(frames[index]), 28, 63, 1, 1).toString('hex')).toBe(centers[index]);
      expect(crop(frameImage(frames[index]), 22, 63, 1, 1).toString('hex')).toBe('426b50ff');
    }
    expect([28 - 48, 63 - 48, (96 - 28) - 48, 22 - 48]).toEqual([-20, 15, 20, -26]);
  });
  it('has eight different complete frames and eight witnesses in BOTH explicitly different crest rectangles', () => {
    expect(new Set(frames.map(bytes => bytes.toString('hex'))).size).toBe(8);
    for (const area of [crestArea, kernelArea]) expect(new Set(frames.map(bytes => crop(frameImage(bytes), area.x, area.y, area.w, area.h).toString('hex'))).size).toBe(8);
  });
  it.each(pairs)('frames$a/$b retain independently measured full-frame, primary-crest and small-kernel differences', ({ a, b }) => {
    expect(changed(frames[a], frames[b])).toBe(expectedFullDifference[a][b]);
    expect(changed(frames[a], frames[b], crestArea)).toBe(expectedCrestDifference[a][b]);
    expect(changed(frames[a], frames[b], kernelArea)).toBe(expectedKernelDifference[a][b]);
    expect(expectedFullDifference[a][b]).toBeGreaterThan(0); expect(expectedCrestDifference[a][b]).toBeGreaterThanOrEqual(214); expect(expectedKernelDifference[a][b]).toBeGreaterThanOrEqual(96);
  });
  it('fails independently if native cel positions are discarded instead of applied once during source composition', () => {
    const wrong: NativeSource = { ...source, rasterCels: source.rasterCels.map(cel => ({ ...cel, x: 0, y: 0 })) };
    expect(allFrames.map(index => changed(composite(wrong, index), frames[index]))).toEqual([0, 306, 382, 262, 0, 92, 96, 0]);
  });
  it('does not count invisible RGB payload as palette or hero-orange pollution', () => {
    expect(colors(Buffer.from([217, 119, 87, 0, 12, 34, 56, 0]))).toEqual({ opaque: [], alphas: [0], orange: 0, area: 0 });
  });
});
