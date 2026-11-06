import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { inflateSync } from 'node:zlib';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
interface Raster { w: number; h: number; data: Buffer }
interface Rect { x: number; y: number; w: number; h: number }
interface Body { x: number; y: number; frame: number; ratio: number; signatureRatio: number; ink: number; colors: number }
interface View { bodies: Body[]; surface: { fill: number; exposed: number; registration: number } | null }
function png(bytes: Buffer): Raster {
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20), type = bytes[25], channels = type === 6 ? 4 : 3;
  expect(bytes[24]).toBe(8); expect([2, 6]).toContain(type); expect([...bytes.subarray(26, 29)]).toEqual([0, 0, 0]);
  const compressed: Buffer[] = [];
  for (let at = 8; at + 12 <= bytes.length;) {
    const n = bytes.readUInt32BE(at), tag = bytes.toString('ascii', at + 4, at + 8);
    expect(at + n + 12).toBeLessThanOrEqual(bytes.length);
    if (tag === 'IDAT') compressed.push(bytes.subarray(at + 8, at + 8 + n)); at += n + 12;
    if (tag === 'IEND') { expect(at).toBe(bytes.length); break; }
  }
  const stride = w * channels, raw = inflateSync(Buffer.concat(compressed)), decoded = Buffer.alloc(w * h * channels);
  expect(raw.length).toBe(h * (stride + 1));
  const paeth = (a: number, b: number, c: number) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]; expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, a = x >= channels ? decoded[at - channels] : 0, b = y ? decoded[at - stride] : 0, c = y && x >= channels ? decoded[at - stride - channels] : 0;
      decoded[at] = (raw[y * (stride + 1) + x + 1] + [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]) & 255;
    }
  }
  if (channels === 4) return { w, h, data: decoded };
  const data = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { decoded.copy(data, i * 4, i * 3, i * 3 + 3); data[i * 4 + 3] = 255; } return { w, h, data };
}
const raster = (path: string) => png(readFileSync(path));
const probe = raster('public/game/von-neumann-probe.png');
const terrain = raster('public/game/factory-terrain.png');
const original = raster('tests/fixtures/probe-native-compute-overlap.png');
const frames = [0, 1, 2, 3].map(i => ({ x: i * 32, y: 0, w: 32, h: 32 }));
const tile = (slot: number): Rect => ({ x: slot % 6 * 16, y: Math.floor(slot / 6) * 16, w: 16, h: 16 });
const source = { image: 'unit://probe', frames, terrain: { image: 'unit://terrain', protectedMiddle: tile(1), serviceMiddle: tile(5), wallA: tile(8), wallB: tile(18) } };
const rgba = (r: Raster, x: number, y: number) => [...r.data.subarray((y * r.w + x) * 4, (y * r.w + x) * 4 + 4)];
const points: { x: number; y: number; changing: boolean; values: number[][] }[] = [];
for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
  const radius = Math.hypot(x + .5 - 16, y + .5 - 16);
  if (radius >= 13 && radius <= 15 || Math.abs(x + .5 - 16) <= 1.5 && y >= 23) continue;
  const values = frames.map(f => rgba(probe, f.x + x, y));
  if (values.some(c => c[3] === 255)) points.push({ x, y, values, changing: new Set(values.map(c => c[3] ? c.join(',') : 'transparent')).size > 1 });
}
function synthetic(frame: number, commonOnly = false): Raster {
  // Algorithm-only in-memory fixtures. Never passed off as runtime or engine screenshots.
  const image: Raster = { w: 640, h: 360, data: Buffer.alloc(640 * 360 * 4) };
  for (let i = 0; i < 640 * 360; i++) image.data.set([1, 2, 3, 255], i * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const color = rgba(probe, frame * 32 + x, y), values = frames.map(f => rgba(probe, f.x + x, y));
    const common = values.every(c => c.join(',') === values[0].join(','));
    if (color[3] === 255 && (!commonOnly || common)) image.data.set(color, ((43 + y) * 640 + 64 + x) * 4);
  } return image;
}
function exactInspect(image: Raster): Promise<View> {
  // Execute the actual existing browser-oracle function, not a second scoring implementation.
  const text = readFileSync('tests/e2e/probe-art.spec.ts', 'utf8'), ast = ts.createSourceFile('probe-art.spec.ts', text, ts.ScriptTarget.ES2022, true);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'inspect');
  if (!declaration) throw Error('Actual inspect declaration missing');
  const code = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const inputs = new Map([['unit://actual', image], ['unit://probe', probe], ['unit://terrain', terrain]]);
  class RgbaImage {
    src = ''; value!: Raster;
    async decode() { const r = inputs.get(this.src); if (!r) throw Error('Unexpected unit image'); this.value = r; }
    get naturalWidth() { return this.value.w; } get naturalHeight() { return this.value.h; }
  }
  const document = { createElement(kind: string) {
    if (kind !== 'canvas') throw Error('Only an isolated RGBA reader is permitted'); let image: RgbaImage;
    return { width: 0, height: 0, getContext(type: string) {
      if (type !== '2d') throw Error('No engine/WebGL exists in this unit');
      return { imageSmoothingEnabled: false, drawImage(value: RgbaImage) { image = value; }, getImageData() { return { data: image.value.data }; } };
    } };
  } };
  const page = { evaluate: (fn: (argument: unknown) => Promise<unknown>, argument: unknown) => fn(argument) };
  const inspect = runInNewContext(code + '; inspect;', { Image: RgbaImage, document }, { timeout: 1000 }) as (port: typeof page, capture: { png: string; at: number }, source: unknown) => Promise<View>;
  return inspect(page, { png: 'unit://actual', at: 0 }, source);
}

describe('actual probe oracle respects pose-owned ink, not transparent background colours', () => {
  it('locks the original cue exclusion, all364 union points and independent50/50/56/34 ink signatures', () => {
    expect(points).toHaveLength(364); expect(points.filter(p => p.changing)).toHaveLength(104);
    expect(frames.map((_, f) => points.filter(p => p.changing && p.values[f][3] === 255).length)).toEqual([50, 50, 56, 34]);
    expect(new Set(frames.map((_, f) => points.filter(p => p.changing && p.values[f][3] === 255).map(p => [p.x, p.y, ...p.values[f]].join(',')).join('|'))).size).toBe(4);
  });
  it.each(frames.flatMap((_, actual) => frames.map((_, expected) => [actual, expected] as const)))('source pose%d against claimed pose%d has no cross-pose false positive', async (actual, expected) => {
    const view = await exactInspect(synthetic(actual));
    expect(view.bodies.some(b => b.frame === expected)).toBe(actual === expected);
    const body = view.bodies.find(b => b.frame === actual)!; expect(body).toBeDefined();
    expect(body.ratio).toBeGreaterThanOrEqual(.98); expect(body.signatureRatio).toBe(1); expect(body.ink).toBeGreaterThan(100); expect(body.colors).toBeGreaterThanOrEqual(4);
  });
  it('accepts all294 real source ink texels over the original new-compute background, without touching that PNG', async () => {
    const view = await exactInspect(original), consume = view.bodies.find(b => b.frame === 3 && b.x === 64 && b.y === 43);
    expect(consume, 'Actual immutable full129 failure screenshot, not a new runtime sample').toBeDefined();
    expect(consume!.ink).toBe(294); expect(consume!.ratio).toBeCloseTo(359 / 364, 12); expect(consume!.signatureRatio).toBe(1);
    expect(consume!.colors).toBeGreaterThanOrEqual(4); expect(view.bodies.filter(b => b.frame !== 3)).toHaveLength(0);
    expect(view.surface?.fill).toBe(0); expect(view.surface?.registration).toBeGreaterThanOrEqual(.98);
  });
  it.each(['blank', 'common-chassis', 'palette-slab'])('rejects %s algorithm-only negative fixture', async kind => {
    const image = synthetic(0, true);
    if (kind !== 'common-chassis') for (let y = 43; y < 75; y++) for (let x = 64; x < 96; x++) image.data.set(kind === 'blank' ? [1, 2, 3, 255] : [133, 142, 176, 255], (y * 640 + x) * 4);
    expect((await exactInspect(image)).bodies).toHaveLength(0);
  });
  it.each([0, 1, 2, 3])('rejects pose%d with2 corrupted opaque signature texels even while union remains>.98', async frame => {
    const image = synthetic(frame), changed = points.filter(p => p.changing && p.values[frame][3] === 255).slice(0, 2);
    expect(changed).toHaveLength(2);
    for (const p of changed) image.data.set([1, 2, 3, 255], ((43 + p.y) * 640 + 64 + p.x) * 4);
    expect((await exactInspect(image)).bodies.some(b => b.frame === frame)).toBe(false);
  });
});
