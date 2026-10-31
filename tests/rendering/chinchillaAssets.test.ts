import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
interface Pixels { width: number; height: number; rgba: Buffer }
interface ChinchillaAtlas {
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

interface SourceCel { frame: number; layer: number; x: number; y: number; opacity: number; z: number; image: Pixels; linked?: number }
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
  const matches = source.rasterCels.filter(cel => cel.frame === frame && cel.layer === layer); expect(matches).toHaveLength(1);
  const result = Buffer.alloc(source.width * source.height * 4);
  const cel = matches[0]; expect(cel.z).toBe(0);
  expect(cel.opacity).toBe(255); expect(cel.x).toBeGreaterThanOrEqual(0); expect(cel.y).toBeGreaterThanOrEqual(0);
  expect(cel.x + cel.image.width).toBeLessThanOrEqual(source.width); expect(cel.y + cel.image.height).toBeLessThanOrEqual(source.height);
  for (let y = 0; y < cel.image.height; y++) for (let x = 0; x < cel.image.width; x++) {
    const from = (y * cel.image.width + x) * 4, alpha = cel.image.rgba[from + 3]; if (alpha !== 0 && alpha !== 255) throw new Error('Soft alpha in native cel');
    if (alpha) cel.image.rgba.copy(result, ((cel.y + y) * source.width + cel.x + x) * 4, from, from + 4);
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
// Static source evidence only: no runtime binding/helper imports and no gameplay reachability claim.
const atlas = JSON.parse(readFileSync(new URL('../../public/game/chinchilla.json', import.meta.url), 'utf8')) as ChinchillaAtlas;
const image = decodePng('../../public/game/chinchilla.png');
const frames = atlas.frames.map(frame => crop(image, frame.frame.x, frame.frame.y, frame.frame.w, frame.frame.h));
const source = nativeSource('../../assets/source/chinchilla.aseprite');
const phases = ['idle', 'tell', 'recover'] as const;
const visibleLayers = ['tail', 'far-limbs', 'body', 'head', 'near-limbs'];
const sharedPalette = ['00000000', '2c2330ff', 'd97757ff', 'eaa083ff', 'b55a4aff', '783f4aff', 'f5e8c8ff', 'cbb696ff', '34354fff', '575c79ff', '858eb0ff', '9dded1ff', 'd9ffeaff', '0f191bff', '24423bff', '426b50ff', '8fa86bff', 'b9905dff', 'e5c386ff', '723f68ff'];
const opaqueColors = ['2c2330', '34354f', '575c79', '723f68', '858eb0', 'cbb696', 'f5e8c8'];
const layerIndex = (name: string) => { const index = source.layers.findIndex(layer => layer.name === name); expect(index).toBeGreaterThanOrEqual(0); return index; };
function changed(a: Buffer, b: Buffer, area = { x: 0, y: 0, w: 32, h: 32 }): number {
  let count = 0;
  for (let y = area.y; y < area.y + area.h; y++) for (let x = area.x; x < area.x + area.w; x++) { const p = (y * 32 + x) * 4; if (!a.subarray(p, p + 4).equals(b.subarray(p, p + 4))) count++; }
  return count;
}
const core = { x: 10, y: 10, w: 12, h: 12 };

describe('Chinchilla three static native source poses, not natural gameplay reachability', () => {
  it('exports exactly three full unrotated 32px cells with real names on a 96x32 sheet', () => {
    expect([image.width, image.height]).toEqual([96, 32]); expect(atlas.frames).toHaveLength(3);
    expect(atlas.meta).toMatchObject({ image: 'chinchilla.png', format: 'RGBA8888', size: { w: 96, h: 32 }, scale: '1' });
    expect(atlas.frames.map(frame => frame.filename)).toEqual(['chinchilla 0.aseprite', 'chinchilla 1.aseprite', 'chinchilla 2.aseprite']);
    atlas.frames.forEach((frame, i) => {
      expect(frame.frame).toEqual({ x: i * 32, y: 0, w: 32, h: 32 }); expect(frame.rotated).toBe(false); expect(frame.trimmed).toBe(false);
      expect(frame.sourceSize).toEqual({ w: 32, h: 32 }); expect(frame.spriteSourceSize).toEqual({ x: 0, y: 0, w: 32, h: 32 });
    });
  });
  it('keeps single-frame idle/tell/recover tags and 100ms export metadata without inventing a Core clock', () => {
    const tagColors = ['858eb0', 'e5c386', '723f68'];
    expect(atlas.frames.map(frame => frame.duration)).toEqual([100, 100, 100]); expect(source.durations).toEqual([100, 100, 100]);
    expect(atlas.meta.frameTags).toEqual(phases.map((name, i) => ({ name, from: i, to: i, direction: 'forward', color: `#${tagColors[i]}ff` })));
    expect(source.tags).toEqual(phases.map((name, i) => ({ name, from: i, to: i, direction: 0, repeats: 0, color: tagColors[i] })));
  });
  it('retains a 32bit three-frame ASE header and consistent old/new chunk counts', () => {
    expect([source.width, source.height, source.frames, source.flags, source.speed]).toEqual([32, 32, 3, 1, 100]);
    expect(source.frameHeaders).toEqual([{ legacy: 18, modern: 18, chunks: 18 }, { legacy: 6, modern: 6, chunks: 6 }, { legacy: 6, modern: 6, chunks: 6 }]);
  });
  it('retains the five visible editable parts and a real hidden sketch, not a flattened replacement', () => {
    expect(source.layers.map(layer => layer.name)).toEqual(['sketch', ...visibleLayers]);
    expect(source.layers.map(layer => layer.flags)).toEqual([0, 3, 3, 3, 3, 3]);
    for (const layer of source.layers) expect(layer).toMatchObject({ type: 0, level: 0, blend: 0, opacity: 255 });
    expect(atlas.meta.layers).toEqual(visibleLayers.map(name => ({ name, opacity: 255, blendMode: 'normal' })));
  });
  it('uses the exact shared20 palette and no off-palette or hero-orange ink, even in retained hidden cels', () => {
    expect(source.paletteSizes).toEqual([20]); expect(source.paletteColors).toEqual(sharedPalette);
    const ink = colors(Buffer.concat(source.rasterCels.map(cel => cel.image.rgba)));
    expect(ink).toMatchObject({ opaque: opaqueColors, alphas: [0, 255], orange: 0 });
    for (const color of ink.opaque) expect(sharedPalette).toContain(`${color}ff`);
  });
  it('exports seven opaque colors in total, hard alpha and zero hero-orange pixels', () => {
    expect(colors(image.rgba)).toMatchObject({ opaque: opaqueColors, alphas: [0, 255], orange: 0 });
  });
  it.each([0, 1, 2])('frame%i has the measured17x16 silhouette and no ink beyond the fixed foot row21', index => {
    expect(bounds(frames[index], 32, 32)).toEqual([10, 6, 26, 21]);
    expect(colors(frames[index])).toMatchObject({ area: [192, 193, 192][index], alphas: [0, 255], orange: 0 });
    expect(colors(frames[index]).opaque).toHaveLength([7, 7, 6][index]);
    const feet = Array.from({ length: 32 }, (_, x) => x).filter(x => frames[index][(21 * 32 + x) * 4 + 3]);
    expect(feet).toEqual([10, 11, 12, 13, 14, 17, 18, 19, 20, 21]);
  });
  it.each([0, 1, 2])('frame%i equals independently reconstructed ASE RGBA byte for byte', index => {
    expect(composite(source, index)).toEqual(frames[index]);
  });
  it.each([0, 1, 2])('frame%i genuinely omits its185px hidden sketch from the export', index => {
    expect(colors(layerRaster(source, index, layerIndex('sketch'))).area).toBe(185);
    expect(changed(composite(source, index, true), frames[index])).toBe([5, 7, 5][index]);
  });
  it('contains eighteen native cels with exactly six links to the first frame', () => {
    expect(source.rasterCels).toHaveLength(18); expect(source.rasterCels.filter(cel => cel.linked === undefined)).toHaveLength(12);
    expect(source.rasterCels.filter(cel => cel.linked !== undefined).map(cel => [cel.frame, source.layers[cel.layer].name, cel.linked])).toEqual([
      [1, 'tail', 0], [1, 'far-limbs', 0], [1, 'body', 0], [2, 'tail', 0], [2, 'far-limbs', 0], [2, 'body', 0],
    ]);
  });
  it.each(['tail', 'far-limbs', 'body'])('%s is truly linked, fixed in place and raster-identical in all poses', name => {
    const index = layerIndex(name), cels = source.rasterCels.filter(cel => cel.layer === index); expect(cels).toHaveLength(3);
    expect(cels[0].linked).toBeUndefined();
    for (const cel of cels) expect(cel).toMatchObject({ x: 0, y: 0, opacity: 255, z: 0 });
    for (const frame of [1, 2]) {
      expect(cels[frame].linked).toBe(0); expect(cels[frame].image).toBe(cels[0].image);
      expect(layerRaster(source, frame, index)).toEqual(layerRaster(source, 0, index));
    }
  });
  it.each(['head', 'near-limbs'])('%s has three independent distinct raster cels, not alias copies', name => {
    const index = layerIndex(name), cels = source.rasterCels.filter(cel => cel.layer === index); expect(cels).toHaveLength(3);
    expect(cels.every(cel => cel.linked === undefined)).toBe(true); expect(new Set(cels.map(cel => cel.image)).size).toBe(3);
    expect(new Set([0, 1, 2].map(frame => layerRaster(source, frame, index).toString('hex'))).size).toBe(3);
  });
  it('keeps the entire two-row foot raster fixed, not just a coincident bounding box', () => {
    const rows = frames.map(bytes => bytes.subarray(20 * 32 * 4, 22 * 32 * 4));
    expect(rows[1]).toEqual(rows[0]); expect(rows[2]).toEqual(rows[0]);
  });
  it('keeps every full pose and every main12x12 core pose unique', () => {
    expect(new Set(frames.map(bytes => bytes.toString('hex'))).size).toBe(3);
    const cores = frames.map(rgba => crop({ width: 32, height: 32, rgba }, 10, 10, 12, 12).toString('hex')); expect(new Set(cores).size).toBe(3);
  });
  it.each([{ a: 0, b: 1, total: 22, inside: 13 }, { a: 0, b: 2, total: 9, inside: 9 }, { a: 1, b: 2, total: 26, inside: 17 }])('poses$a/$b differ inside the main body, not merely ears/tail', ({ a, b, total, inside }) => {
    expect(changed(frames[a], frames[b])).toBe(total); expect(changed(frames[a], frames[b], core)).toBe(inside); expect(inside).toBeGreaterThanOrEqual(9);
  });
  it('does not count alpha0 RGB payload as palette ink or hero-orange pollution', () => {
    expect(colors(Buffer.from([217, 119, 87, 0, 12, 34, 56, 0]))).toEqual({ opaque: [], alphas: [0], orange: 0, area: 0 });
  });
});
