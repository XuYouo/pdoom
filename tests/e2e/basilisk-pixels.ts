import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { furnaceSource, inspectFurnace } from './furnace-pixels';

export type BasiliskCapture = { png: string; at: number };
export type BasiliskSource = { image: string; frames: { x: number; y: number; w: number; h: number }[] };
export type BasiliskBody = { x: number; y: number; frame: number; flip: boolean; ratio: number; signature: number; witnesses: number; ink: number; cropped: number; fullRatio: number; eyeX: number; headRatio: number; headPixels: number; laserCover: number; ray: number; hpPixels: number };
type Actor = { count: number; x: number; bottom: number };
export type BasiliskView = { capture: BasiliskCapture; body: BasiliskBody | null; orange: Actor; stone: Actor; opaque: number; colors: number; rack: number; floorY: number | null; floorPixels: number; cues: { hp: number; activeBeam: number; tellTip: number; causal: number } };

export async function basiliskSource(): Promise<BasiliskSource> {
  const [image, text] = await Promise.all([readFile('public/game/basilisk.png'), readFile('public/game/basilisk.json', 'utf8')]);
  const atlas = JSON.parse(text) as { frames: { filename: string; frame: BasiliskSource['frames'][number]; trimmed: boolean; rotated: boolean }[]; meta: { size: { w: number; h: number } } };
  expect(atlas.meta.size).toEqual({ w: 768, h: 96 });
  expect(atlas.frames.map(f => f.filename)).toEqual(Array.from({ length: 8 }, (_, i) => `basilisk ${i}.aseprite`));
  atlas.frames.forEach((f, i) => expect(f).toMatchObject({ frame: { x: i * 96, y: 0, w: 96, h: 96 }, trimmed: false, rotated: false }));
  return { image: `data:image/png;base64,${image.toString('base64')}`, frames: atlas.frames.map(f => f.frame) };
}
export async function basiliskFrames(page: Page, duration = 0): Promise<BasiliskCapture[]> {
  return page.evaluate(ms => new Promise<BasiliskCapture[]>((resolve, reject) => {
    const frames: BasiliskCapture[] = []; let first = -1;
    const take = (at: number) => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Expected actual640x360 canvas');
        if (first < 0) first = at; frames.push({ png: canvas.toDataURL('image/png'), at });
        if (at - first >= ms || frames.length >= 540) resolve(frames); else requestAnimationFrame(take);
      } catch (error) { reject(error); }
    };
    requestAnimationFrame(take);
  }), duration);
}
/** Literal source registration, never production selectors or private engine state.
 * The fixed real laser band (localY50..76) is omitted from registration, not forgiven
 * by a colour whitelist. Upper crest witnesses discriminate every other pose.
 * Offscreen ink is counted explicitly; no claim that an inactive96px canvas fits. */
export async function inspectBasilisk(page: Page, captures: BasiliskCapture[], source: BasiliskSource): Promise<BasiliskView[]> {
  const result = await page.evaluate(async ({ captures, source }) => {
    const decode = async (url: string) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const g = canvas.getContext('2d'); if (!g) throw Error('No independent pixel decoder');
      g.imageSmoothingEnabled = false; g.drawImage(image, 0, 0);
      return { w: canvas.width, h: canvas.height, data: g.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const art = await decode(source.image);
    if (art.w !== 768 || art.h !== 96) throw Error('Wrong source dimensions');
    const color = (im: Awaited<ReturnType<typeof decode>>, x: number, y: number) => {
      if (x < 0 || y < 0 || x >= im.w || y >= im.h) return -1;
      const at = (y * im.w + x) * 4; return im.data[at + 3] === 255 ? (im.data[at] << 16) | (im.data[at + 1] << 8) | im.data[at + 2] : -1;
    };
    const equal = (a: number, b: number) => a >= 0 && b >= 0 && Math.abs((a >> 16) - (b >> 16)) <= 2 && Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= 2 && Math.abs((a & 255) - (b & 255)) <= 2;
    type Point = { x: number; y: number; values: number[] };
    const all: Point[] = [];
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const values = source.frames.map(f => color(art, f.x + x, f.y + y));
      if (values.some(v => v >= 0)) all.push({ x, y, values });
    }
    const safe = all.filter(p => p.y < 50 || p.y > 76);
    const common = safe.filter(p => p.values[0] >= 0 && p.values.every(v => v === p.values[0]));
    if (common.length < 700) throw Error('Insufficient invariant source body');
    const frequency = new Map<number, number>();
    for (const p of common) frequency.set(p.values[0], (frequency.get(p.values[0]) ?? 0) + 1);
    common.sort((a, b) => frequency.get(a.values[0])! - frequency.get(b.values[0])!);
    const anchor = common[0], checks = [anchor, common[Math.floor(common.length / 3)], common[Math.floor(common.length * 2 / 3)], common[common.length - 1]];
    const shapes = source.frames.map((_, frame) => safe.filter(p => p.values[frame] >= 0));
    const complete = source.frames.map((_, frame) => all.filter(p => p.values[frame] >= 0));
    const witnesses = source.frames.map((_, frame) => source.frames.map((__, other) => frame === other ? [] : shapes[frame].filter(p => p.y < 50 && !equal(p.values[frame], p.values[other]))));
    for (let f = 0; f < 8; f++) for (let o = 0; o < 8; o++) if (f !== o && witnesses[f][o].length < 40) throw Error('Insufficient distinct upper-source witnesses');
    const results: Omit<BasiliskView, 'capture' | 'rack' | 'floorY' | 'floorPixels'>[] = [];
    for (const capture of captures) {
      const screen = await decode(capture.png); if (screen.w !== 640 || screen.h !== 360) throw Error('Expected native screen');
      const rgb = new Int32Array(640 * 360), palette = new Set<number>(); let opaque = 0;
      const cues = { hp: 0, activeBeam: 0, tellTip: 0, causal: 0 };
      const actor = () => ({ count: 0, left: 640, right: -1, bottom: 0 }); const orange = actor(), stone = actor();
      for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
        const value = color(screen, x, y); rgb[y * 640 + x] = value;
        if (value >= 0) opaque++; if (palette.size < 512) palette.add(value);
        if (equal(value, 0xebaa7b)) cues.hp++; if (equal(value, 0xf0ffd8)) cues.activeBeam++;
        if (equal(value, 0xe6ca83)) cues.tellTip++; if (equal(value, 0xb7ef83)) cues.causal++;
        const target = value === 0xd97757 ? orange : value === 0xbcc7c8 ? stone : null;
        if (target) { target.count++; target.left = Math.min(target.left, x); target.right = Math.max(target.right, x); target.bottom = Math.max(target.bottom, y); }
      }
      const at = (x: number, y: number) => x >= 0 && x < 640 && y >= 0 && y < 360 ? rgb[y * 640 + x] : -1;
      const origins = new Map<string, { x: number; y: number; flip: boolean }>();
      for (let y = 220; y < 325; y++) for (let x = 0; x < 640; x++) {
        if (!equal(at(x, y), anchor.values[0])) continue;
        for (const flip of [false, true]) {
          const left = x - (flip ? 95 - anchor.x : anchor.x), top = y - anchor.y;
          if (left <= -96 || left >= 640 || top < 220 || top > 244) continue;
          if (checks.filter(p => equal(at(left + (flip ? 95 - p.x : p.x), top + p.y), p.values[0])).length >= 3) origins.set(`${left},${top},${flip}`, { x: left, y: top, flip });
        }
      }
      let body: BasiliskBody | null = null;
      for (const origin of origins.values()) for (let frame = 0; frame < 8; frame++) {
        const xAt = (p: Point) => origin.x + (origin.flip ? 95 - p.x : p.x);
        const visible = (p: Point) => xAt(p) >= 0 && xAt(p) < 640;
        const points = shapes[frame].filter(visible), whole = complete[frame].filter(visible);
        if (points.length / shapes[frame].length < 0.9 || whole.length / complete[frame].length < 0.9) continue;
        const hits = points.filter(p => equal(at(xAt(p), origin.y + p.y), p.values[frame])).length;
        const ratio = hits / points.length; if (hits < 900 || ratio < 0.98) continue;
        let signature = 1, minimum = Infinity, valid = true;
        for (let other = 0; other < 8; other++) {
          if (other === frame) continue;
          const full = witnesses[frame][other], exposed = full.filter(visible);
          const matched = exposed.filter(p => equal(at(xAt(p), origin.y + p.y), p.values[frame])).length;
          if (exposed.length / full.length < 0.75 || matched < 30 || matched / exposed.length < 0.98) { valid = false; break; }
          signature = Math.min(signature, matched / exposed.length); minimum = Math.min(minimum, matched);
        }
        if (!valid) continue;
        const fullRatio = whole.filter(p => equal(at(xAt(p), origin.y + p.y), p.values[frame])).length / whole.length;
        const head = complete[frame].filter(p => p.y >= 62 && p.y <= 64 && p.x <= 22);
        const headRatio = head.filter(p => equal(at(xAt(p), origin.y + p.y), p.values[frame])).length / head.length;
        const laserCover = head.filter(p => equal(at(xAt(p), origin.y + p.y), 0xf0ffd8)).length;
        const muzzle = origin.x + (origin.flip ? 74 : 22); let ray = 0, hpPixels = 0;
        for (let d = 0; d <= 440; d++) if (equal(at(muzzle + (origin.flip ? d : -d), origin.y + 63), 0xf0ffd8)) ray++;
        for (let y = origin.y - 3; y < origin.y + 1; y++) for (let x = origin.x + 16; x < origin.x + 80; x++) if (equal(at(x, y), 0xebaa7b)) hpPixels++;
        const candidate = { ...origin, frame, ratio, signature, witnesses: minimum, ink: hits, cropped: 1 - whole.length / complete[frame].length, fullRatio, eyeX: origin.x + (origin.flip ? 68 : 28), headRatio, headPixels: head.length, laserCover, ray, hpPixels };
        if (!body || ratio + signature > body.ratio + body.signature) body = candidate;
      }
      const summary = (a: typeof orange) => ({ count: a.count, x: a.count ? (a.left + a.right) / 2 : 0, bottom: a.bottom });
      results.push({ body, orange: summary(orange), stone: summary(stone), opaque: opaque / rgb.length, colors: palette.size, cues });
    }
    return results;
  }, { captures, source });
  const environment = await inspectFurnace(page, captures, await furnaceSource());
  return result.map((view, index) => ({ ...view, capture: captures[index], rack: environment[index].rackPixels, floorY: environment[index].floorY, floorPixels: environment[index].floorPixels }));
}
