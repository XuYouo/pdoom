import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo, type Route } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';

// Legal checkpoint acceptance only, never a fresh chapter journey. No world hooks,
// HP/clock injection, fake rAF, production pose-selector oracle or DOM concealment.
// Static matrix:12. Reachable:inactive idle1 plus three phases of tell/attack/recover.
const RESOURCES = ['/game/sydney.png', '/game/sydney.json'];
const NAMES = Array.from({ length: 12 }, (_, i) => 'sydney ' + i + '.aseprite');
const REACHABLE = [0, 1, 2, 3, 5, 6, 7, 9, 10, 11];
type Rect = { x: number; y: number; w: number; h: number };
type Source = { image: string; frames: Rect[] };
type Capture = { png: string; at: number };
type Part = Rect & { pixels: number };
type Body = { x: number; y: number; frame: number; ratio: number; ink: number; colors: number; occluded: number; witnesses: number; signature: number; checksum: number };
type View = { capture: Capture; body: Body | null; hp: Part | null; hpPixels: number; ring: number; dangerPixels: number; dialogue: Part[]; knives: Part[]; bubbles: Part[]; hero: { count: number; x: number | null; bottom: number | null }; ledges: { x: number; y: number; w: number }[]; opaque: number; colors: number };
type Tape = { latest: Capture | null; rows: unknown[]; serial: number; seen: Set<number> };
const tape = (): Tape => ({ latest: null, rows: [], serial: 0, seen: new Set() });
const pauseDialog = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
const objective = (page: Page) => page.locator('.objective').innerText();
const rawSave = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
const cleared = (page: Page) => page.getByRole('heading', { name: '回形针无尽工厂已突破。', exact: true });
function watch(page: Page) {
  const errors: string[] = [], writes: string[] = [], loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) writes.push(r.method() + ' ' + r.url()); });
  page.on('response', r => { const p = new URL(r.url()).pathname; if (r.status() === 200 && RESOURCES.includes(p)) loaded.add(p); });
  return { errors, writes, loaded };
}
async function sourceArt(): Promise<Source> {
  const [image, text] = await Promise.all([readFile('public/game/sydney.png'), readFile('public/game/sydney.json', 'utf8')]);
  const atlas = JSON.parse(text) as { frames: { filename: string; frame: Rect; rotated: boolean; trimmed: boolean; spriteSourceSize: Rect; sourceSize: { w: number; h: number } }[]; meta: { size: { w: number; h: number }; frameTags: { name: string; from: number; to: number }[] } };
  expect(atlas.frames.map(f => f.filename)).toEqual(NAMES); expect(atlas.meta.size).toEqual({ w: 1152, h: 96 });
  expect(atlas.meta.frameTags.map(({ name, from, to }) => ({ name, from, to }))).toEqual([{ name: 'dialogue', from: 0, to: 3 }, { name: 'knife', from: 4, to: 7 }, { name: 'control', from: 8, to: 11 }]);
  for (const f of atlas.frames) expect(f).toMatchObject({ trimmed: false, rotated: false, frame: { w: 96, h: 96 }, spriteSourceSize: { x: 0, y: 0, w: 96, h: 96 }, sourceSize: { w: 96, h: 96 } });
  return { image: 'data:image/png;base64,' + image.toString('base64'), frames: atlas.frames.map(f => f.frame) };
}
function fixture(): GameSaveData {
  const save: GameSaveData = { ...createRun(randomUUID(), 42), stage: 2, checkpoint: 2, tokens: 200, elapsedMs: 20000, donated: true };
  expect(isGameSave(save)).toBe(true); return save;
}
async function seedOnce(page: Page, save: GameSaveData) {
  await page.addInitScript(value => { const key = 'sydney-art.fixture.' + value.runId; if (sessionStorage.getItem(key) === null) { sessionStorage.setItem(key, 'once'); localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); } }, save);
  await page.goto('/');
}
async function nativeFrames(page: Page, duration = 0): Promise<Capture[]> {
  return page.evaluate(ms => new Promise<Capture[]>((resolve, reject) => {
    const frames: Capture[] = []; let first = -1;
    const sample = (now: number) => {
      try {
        const canvas = document.querySelector('canvas'); if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw new Error('Expected native640x360 canvas');
        if (first < 0) first = now; frames.push({ png: canvas.toDataURL('image/png'), at: now });
        if (now - first >= ms || frames.length >= 240) resolve(frames); else requestAnimationFrame(sample);
      } catch (error) { reject(error); }
    };
    requestAnimationFrame(sample);
  }), duration);
}
async function pause(page: Page) { if (!await pauseDialog(page).isVisible() && !await cleared(page).isVisible()) { await page.keyboard.press('Escape'); await expect.poll(async () => await pauseDialog(page).isVisible() || await cleared(page).isVisible(), { message: 'ordinary pause or natural chapter-clear, never a hidden state probe' }).toBe(true); } }
async function resume(page: Page) { if (await pauseDialog(page).isVisible()) await pauseDialog(page).getByRole('button', { name: '继续训练', exact: true }).click(); }
async function alive(page: Page) { await expect(page.getByRole('heading', { name: '这次，梯度归零。', exact: true })).toHaveCount(0); }

/** Compare literal source texels. Only a fixed tell annulus and bounded, geometrically
 * identified opaque projectiles may occlude a match; transparent pixels never
 * forgive arbitrary color errors. Every accepted pose has witnesses against ALL11 alternatives. */
async function inspectBatch(page: Page, captures: Capture[], source: Source): Promise<View[]> {
  const result = await page.evaluate(async ({ captures, source }) => {
    const decode = async (url: string) => { const image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const ctx = canvas.getContext('2d'); if (!ctx) throw Error('No pixel decoder'); ctx.drawImage(image, 0, 0); return { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data }; };
    const art = await decode(source.image);
    if (art.w !== 1152 || art.h !== 96) throw Error('Wrong native source buffer');
    const color = (buffer: Awaited<ReturnType<typeof decode>>, x: number, y: number) => { if (x < 0 || y < 0 || x >= buffer.w || y >= buffer.h) return -1; const i = (y * buffer.w + x) * 4; return buffer.data[i + 3] === 255 ? (buffer.data[i] << 16) | (buffer.data[i + 1] << 8) | buffer.data[i + 2] : -1; };
    const equal = (a: number, b: number) => a >= 0 && b >= 0 && Math.abs((a >> 16) - (b >> 16)) <= 2 && Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= 2 && Math.abs((a & 255) - (b & 255)) <= 2;
    type Texel = { x: number; y: number; values: number[] };
    const points: Texel[] = [];
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const radius = Math.hypot(x - 48, y - 48); if (radius >= 40 && radius <= 44) continue; // Real r42 tell only, not an alpha/color whitelist.
      const values = source.frames.map(f => color(art, f.x + x, f.y + y));
      for (const f of source.frames) { const alpha = art.data[((f.y + y) * art.w + f.x + x) * 4 + 3]; if (alpha !== 0 && alpha !== 255) throw Error('Source must use hard alpha'); }
      if (values.some(v => v >= 0)) points.push({ x, y, values });
    }
    const common = points.filter(p => p.values[0] >= 0 && p.values.every(v => v === p.values[0]));
    if (common.length < 100) throw Error('No substantial invariant native body');
    const frequency = new Map<number, number>(); for (const p of common) frequency.set(p.values[0], (frequency.get(p.values[0]) ?? 0) + 1);
    common.sort((a, b) => frequency.get(a.values[0])! - frequency.get(b.values[0])!);
    const anchor = common[0], checks = [anchor, common[Math.floor(common.length / 3)], common[Math.floor(common.length * 2 / 3)], common[common.length - 1]];
    const shapes = source.frames.map((_, frame) => points.filter(p => p.values[frame] >= 0));
    const witnesses = source.frames.map((_, frame) => source.frames.map((__, other) => frame === other ? [] : shapes[frame].filter(p => !equal(p.values[frame], p.values[other]))));
    for (let f = 0; f < 12; f++) for (let o = 0; o < 12; o++) if (f !== o && witnesses[f][o].length < 2) throw Error('Source mask cannot independently distinguish poses ' + f + '/' + o);
    const results: Omit<View, 'capture'>[] = [];
    for (const capture of captures) {
      const screen = await decode(capture.png);
      if (screen.w !== 640 || screen.h !== 360) throw Error('Wrong native canvas buffer');
      const rgb = new Int32Array(640 * 360), palette = new Set<number>(); let opaque = 0, heroCount = 0, heroLeft = 640, heroRight = -1, heroBottom = -1;
      for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) { const p = y * 640 + x, value = color(screen, x, y); rgb[p] = value; if (value >= 0) opaque++; if (palette.size < 512) palette.add(value); if (value === 0xd97757) { heroCount++; heroLeft = Math.min(heroLeft, x); heroRight = Math.max(heroRight, x); heroBottom = Math.max(heroBottom, y); } }
      type Pixels = Part & { points: number[] };
      const cache = new Map<number, Pixels[]>();
      const components = (value: number): Pixels[] => {
        if (cache.has(value)) return cache.get(value)!;
        const found: Pixels[] = [], visited = new Uint8Array(rgb.length);
        for (let p = 0; p < rgb.length; p++) {
          if (visited[p] || rgb[p] !== value) continue;
          const stack = [p], points: number[] = []; let l = 640, r = -1, t = 360, b = -1; visited[p] = 1;
          while (stack.length) { const at = stack.pop()!, x = at % 640, y = Math.floor(at / 640); points.push(at); l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy, q = ny * 640 + nx; if (nx >= 0 && nx < 640 && ny >= 0 && ny < 360 && !visited[q] && rgb[q] === value) { visited[q] = 1; stack.push(q); } }
          }
          found.push({ x: l, y: t, w: r - l + 1, h: b - t + 1, pixels: points.length, points });
        }
        found.sort((a, b) => b.pixels - a.pixels); cache.set(value, found); return found;
      };
      const plain = ({ x, y, w, h, pixels }: Pixels): Part => ({ x, y, w, h, pixels });
      const hpParts = components(0xebaa7b).filter(p => p.x > 400 && p.y < 280 && p.w <= 65 && p.h >= 3 && p.h <= 5);
      const hp = hpParts.length ? plain(hpParts[0]) : null;
      const dialogueParts = components(0x9dcbe4).filter(p => p.pixels >= 24 && p.pixels <= 1600 && p.w <= 90 && p.h <= 90);
      const knifeParts = components(0xff9ec3).filter(p => p.pixels >= 8 && p.pixels <= 120 && p.w <= 14 && p.h <= 20);
      const bubbles = components(0xffb2d2).filter(p => p.w >= 32 && p.w <= 38 && p.h >= 32 && p.h <= 38 && p.pixels >= 100).map(plain);
      const overlay = new Uint8Array(rgb.length);
      const mark = (parts: Pixels[]) => { for (const part of parts) for (const p of part.points) overlay[p] = 1; };
      mark(dialogueParts); mark(knifeParts);
      mark(components(0x214058).filter(p => p.w <= 22 && p.h <= 20 && dialogueParts.some(d => p.x >= d.x && p.y >= d.y && p.x + p.w <= d.x + d.w && p.y + p.h <= d.y + d.h)));
      for (const value of [0xf3aa78, 0xffffff]) mark(components(value).filter(p => p.w >= 4 && p.w <= 10 && p.h >= 4 && p.h <= 10 && p.pixels >= 10 && p.pixels <= 90));
      const origins = new Map<string, { x: number; y: number }>();
      const offer = (x: number, y: number) => { if (x >= 0 && y >= 0 && x + 96 <= 640 && y + 96 <= 360) origins.set(x + ',' + y, { x, y }); };
      if (hp) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) offer(hp.x - 16 + dx, hp.y + 3 + dy);
      for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
        if (!equal(rgb[y * 640 + x], anchor.values[0])) continue; const l = x - anchor.x, t = y - anchor.y;
        if (checks.filter(p => equal(color(screen, l + p.x, t + p.y), p.values[0])).length >= 3) offer(l, t);
      }
      let body: Body | null = null;
      for (const origin of origins.values()) for (let frame = 0; frame < 12; frame++) {
        const shape = shapes[frame]; let hits = 0, occluded = 0; const matchedColors = new Set<number>();
        for (const p of shape) { const at = (origin.y + p.y) * 640 + origin.x + p.x; if (overlay[at]) { occluded++; continue; } if (equal(rgb[at], p.values[frame])) { hits++; matchedColors.add(p.values[frame]); } }
        const ratio = hits / (shape.length - occluded); if (shape.length < 400 || occluded / shape.length > 0.18 || ratio < 0.98 || hits < 300 || matchedColors.size < 5) continue;
        let signature = 1, minimum = Infinity, valid = true;
        for (let other = 0; other < 12; other++) {
          if (other === frame) continue; const diff = witnesses[frame][other]; let visible = 0, matched = 0;
          for (const p of diff) { const at = (origin.y + p.y) * 640 + origin.x + p.x; if (!overlay[at]) { visible++; if (equal(rgb[at], p.values[frame])) matched++; } }
          if (visible / diff.length < 0.75 || matched < 2 || matched / visible < 0.95) { valid = false; break; }
          signature = Math.min(signature, matched / visible); minimum = Math.min(minimum, matched);
        }
        if (!valid) continue; let checksum = 2166136261;
        for (const p of shape) { const value = rgb[(origin.y + p.y) * 640 + origin.x + p.x]; checksum = Math.imul(checksum ^ value, 16777619) >>> 0; }
        const candidate: Body = { ...origin, frame, ratio, ink: hits, colors: matchedColors.size, occluded: occluded / shape.length, witnesses: minimum, signature, checksum };
        if (!body || candidate.ratio + candidate.signature > body.ratio + body.signature) body = candidate;
      }
      let ring = 0;
      if (body) for (let y = body.y; y < body.y + 96; y++) for (let x = body.x; x < body.x + 96; x++) { const radius = Math.hypot(x - body.x - 48, y - body.y - 48), value = rgb[y * 640 + x]; if (radius < 40 || radius > 44 || value < 0) continue; const r = value >> 16, g = (value >> 8) & 255, b = value & 255; if (r > g + 28 && b > g + 10) ring++; }
      // Independent of body/HP detection: Core arena center is510+/-34,200+/-24.
      // This expanded sweep contains every real r42 warning, including a stale circle
      // after the body is destroyed. The positive tells exercise this SAME detector.
      let dangerPixels = 0;
      for (let y = 120; y < 280; y++) for (let x = 420; x < 600; x++) { const value = rgb[y * 640 + x]; if (value < 0) continue; const r = value >> 16, g = (value >> 8) & 255, b = value & 255; if (r > g + 28 && b > g + 10) dangerPixels++; }
      const ledges: { x: number; y: number; w: number }[] = [];
      for (let y = 0; y < 360; y++) for (let x = 0; x < 640;) { if (rgb[y * 640 + x] !== 0x90c6b0) { x++; continue; } const start = x; while (x < 640 && rgb[y * 640 + x] === 0x90c6b0) x++; if (x - start >= 90 && !ledges.some(p => p.x === start && p.w === x - start && y - p.y < 5)) ledges.push({ x: start, y, w: x - start }); }
      results.push({ body, hp, hpPixels: components(0xebaa7b).reduce((n, p) => n + p.pixels, 0), ring, dangerPixels, dialogue: dialogueParts.map(plain), knives: knifeParts.map(plain), bubbles, hero: { count: heroCount, x: heroCount ? (heroLeft + heroRight + 1) / 2 : null, bottom: heroCount ? heroBottom : null }, ledges, opaque: opaque / rgb.length, colors: palette.size });
    }
    return results;
  }, { captures, source });
  return result.map((view, i) => ({ capture: captures[i], ...view }));
}
async function inspect(page: Page, capture: Capture, source: Source): Promise<View> {
  return (await inspectBatch(page, [capture], source))[0];
}

function signal(view: View) { expect(view.opaque, 'nonempty opaque real WebGL readback').toBeGreaterThan(0.95); expect(view.colors).toBeGreaterThan(12); }
function nativeBody(view: View): Body {
  signal(view); expect(view.body, 'independently discriminated source-art pose').not.toBeNull(); const b = view.body!;
  expect(REACHABLE).toContain(b.frame); expect(b.ratio).toBeGreaterThanOrEqual(0.98); expect(b.ink).toBeGreaterThanOrEqual(300); expect(b.colors).toBeGreaterThanOrEqual(5);
  expect(b.occluded).toBeLessThanOrEqual(0.18); expect(b.signature).toBeGreaterThanOrEqual(0.95); expect(b.witnesses).toBeGreaterThanOrEqual(2); return b;
}
function liveBoss(view: View) {
  const b = nativeBody(view); expect(view.hp).not.toBeNull(); const hp = view.hp!;
  expect(hp.w).toBeGreaterThan(0); expect(hp.w).toBeLessThanOrEqual(65); expect(Math.abs(hp.h - 4)).toBeLessThan(1.5);
  expect(Math.abs(hp.x + 32 - b.x - 48)).toBeLessThan(2); expect(Math.abs(hp.y + 51 - b.y - 48)).toBeLessThan(2); return b;
}
async function png(info: TestInfo, label: string, capture: Capture) { const path = info.outputPath(label + '.png'); await writeFile(path, Buffer.from(capture.png.split(',')[1], 'base64')); return path; }
function remember(record: Tape, label: string, view: View): View {
  record.latest = view.capture; signal(view);
  const { capture: unusedCapture, ...summary } = view; void unusedCapture;
  record.rows.push({ label, at: view.capture.at, ...summary });
  if (view.body) { nativeBody(view); record.seen.add(view.body.frame); if (view.body.frame % 4 === 1) { liveBoss(view); expect(view.ring, 'real pink r42 tell above the native body').toBeGreaterThan(80); expect(view.dangerPixels, 'independent arena warning-sweep positive').toBeGreaterThan(80); } }
  return view;
}
async function observe(page: Page, source: Source, record: Tape, label: string, capture?: Capture) {
  const current = capture ?? (await nativeFrames(page))[0];
  return remember(record, label, await inspect(page, current, source));
}
async function finishEvidence(info: TestInfo, record: Tape) {
  if (record.latest) await info.attach('sydney-last-native-frame', { path: await png(info, 'sydney-last-native-frame', record.latest), contentType: 'image/png' });
  const path = info.outputPath('sydney-native-timeline.json'); await writeFile(path, JSON.stringify({ reachable: REACHABLE, observed: [...record.seen].sort((a, b) => a - b), rows: record.rows }, null, 2));
  await info.attach('sydney-native-timeline', { path, contentType: 'application/json' });
}
async function frozenView(page: Page, source: Source, record: Tape, label: string) { await pause(page); return observe(page, source, record, label); }
/** Capture first. Ordinary Escape freezes Core BEFORE any source decode or disk IO. */
async function burst(page: Page, source: Source, record: Tape, info: TestInfo, label: string, milliseconds: number, input?: () => Promise<void>) {
  await alive(page); await resume(page); let frames: Capture[] = [];
  try { [frames] = await Promise.all([nativeFrames(page, milliseconds), input ? input() : Promise.resolve()]); }
  finally { await page.mouse.up(); await page.keyboard.up('j'); await alive(page); await pause(page); }
  const serial = record.serial++; record.latest = frames[frames.length - 1] ?? record.latest;
  await Promise.all(frames.map((frame, i) => png(info, label + '-' + serial + '-' + String(i).padStart(3, '0'), frame)));
  record.rows.push({ label, serial, rawFrames: frames.length, firstAt: frames[0]?.at, lastAt: frames[frames.length - 1]?.at });
  // Paused batch decodes the fixed source/masks once, without game globals or skipping a frame.
  const views = await inspectBatch(page, frames, source);
  return views.map((view, i) => remember(record, label + ':' + i, view));
}
async function hold(page: Page, key: string, milliseconds: number) { await page.keyboard.down(key); try { await page.waitForTimeout(milliseconds); } finally { await page.keyboard.up(key); } }

// Proven live compositor navigation only; native body acceptance remains640x360.
/** Read the actual visible orange Clawd, never a hidden game/Phaser object. */
async function navigationHero(page: Page, capture?: Buffer) {
  // Read the displayed compositor image, not engine state or an asynchronously cleared WebGL buffer.
  const base64 = (capture ?? await page.locator('canvas').screenshot()).toString('base64');
  return page.evaluate(async value => {
    const image = new Image(); image.src = `data:image/png;base64,${value}`; await image.decode();
    const probe = document.createElement('canvas'); probe.width = image.naturalWidth; probe.height = image.naturalHeight;
    const context = probe.getContext('2d'); if (!context) throw new Error('Cannot inspect captured pixels');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let count = 0, left = probe.width, right = 0, bottom = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== 217 || pixels[index + 1] !== 119 || pixels[index + 2] !== 87) continue;
      const x = index / 4 % probe.width; count++; left = Math.min(left, x); right = Math.max(right, x);
      bottom = Math.max(bottom, Math.floor(index / 4 / probe.width));
    }
    return { count, x: count ? (left + right + 1) / 2 * 640 / probe.width : null, bottom: bottom * 360 / probe.height };
  }, base64);
}

async function visibleNavigationHero(page: Page) {
  let hero: Awaited<ReturnType<typeof navigationHero>> = { count: 0, x: null, bottom: 0 };
  // Spawn grace intentionally hides Clawd on alternate 80ms intervals. Use the SAME successful visible capture, not a second sample that may blink out.
  await expect.poll(async () => { hero = await navigationHero(page); return hero.count; }, { timeout: 1500, intervals: [20, 40, 60] }).toBeGreaterThan(20);
  return hero;
}

async function visibleHero(page: Page, source: Source, record: Tape, info: TestInfo, bossRequired = false) {
  for (let i = 0; i < 12; i++) { const view = await frozenView(page, source, record, 'visible-hero'); if (view.hero.count > 20 && view.hero.x !== null && (!bossRequired || view.body)) return view; await burst(page, source, record, info, 'normal-flicker-wait', 90); }
  throw Error('No visible orange Clawd after real damage/spawn flicker');
}
async function bodyView(page: Page, source: Source, record: Tape, info: TestInfo) {
  for (let i = 0; i < 8; i++) { const view = await frozenView(page, source, record, 'current-body'); if (view.body) return view; if (await cleared(page).isVisible()) return view; await burst(page, source, record, info, 'unoccluded-real-frame', 110); }
  throw Error('No substantial unoccluded source-specific body; do not weaken the matcher');
}
async function reachLip(page: Page, source: Source, record: Tape, info: TestInfo) {
  const original = fixture(); await seedOnce(page, original);
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  // Escape budget is real. Use proven lightweight visible navigation; full source matching stays paused.
  await page.keyboard.down('a'); await page.keyboard.down('Space');
  try { await page.waitForTimeout(330); await page.keyboard.up('a'); await page.waitForTimeout(270); }
  finally { await page.keyboard.up('a'); await page.keyboard.up('Space'); }
  const alignment: number[] = [];
  try {
    for (let n = 0; n < 12; n++) {
      await alive(page); const hero = await visibleNavigationHero(page); const x = hero.x!; alignment.push(x);
      if (Math.abs(x - 320) <= 4) break;
      await hold(page, x > 320 ? 'a' : 'd', Math.min(200, Math.max(18, (Math.abs(x - 320) - 2) / 190 * 1000)));
      await page.waitForTimeout(85);
    }
    const aligned = await visibleNavigationHero(page); alignment.push(aligned.x!);
    expect(Math.abs(aligned.x! - 320)).toBeLessThanOrEqual(4);
  } finally {
    record.rows.push({ label: 'compositor-navigation-only-not-native-proof', alignment });
    await pause(page); await observe(page, source, record, 'native-after-navigation');
  }
  const attempt = await assertCheckpointAttempt(page, original);
  expect(Math.abs((await visibleHero(page, source, record, info)).hero.x! - 320)).toBeLessThanOrEqual(4);
  for (let jump = 0; jump < 14; jump++) {
    await alive(page); let view = await visibleHero(page, source, record, info);
    const upperFloor = view.ledges.find(p => p.w >= 600 && view.hero.bottom! - p.y >= 45 && view.hero.bottom! - p.y <= 65);
    if (upperFloor) {
      // The real last ledge is already reached. Never jump again just because a transient view failed to match.
      for (let settle = 0; settle < 8 && view.body?.frame !== 0; settle++) {
        await png(info, 'last-ledge-unmatched-' + settle, view.capture);
        expect(await objective(page)).not.toMatch(/Sydney|精神控制/);
        await burst(page, source, record, info, 'last-ledge-camera-settle', 120);
        view = await visibleHero(page, source, record, info);
      }
      expect(view.body?.frame, 'real inactive idle1 before jumping across the trigger').toBe(0);

      nativeBody(view); expect(view.hp).toBeNull(); expect(view.ring).toBeLessThan(80);
      expect(await objective(page)).not.toMatch(/Sydney|精神控制/);
      await info.attach('sydney-real-inactive-idle1', { path: await png(info, 'sydney-real-inactive-idle1', view.capture), contentType: 'image/png' });
      return { original, attempt, idle: view };
    }
    expect(await objective(page), 'must stop below the actual arena trigger, not manufacture an idle pose').not.toMatch(/Sydney|精神控制/);
    await resume(page); await hold(page, 'Space', 600); await page.waitForTimeout(250); await pause(page);
  }
  throw Error('Did not visibly reach the last y355 step below the arena with normal jumps');
}
async function enterArena(page: Page, source: Source, record: Tape, info: TestInfo) {
  await resume(page); await hold(page, 'Space', 600); await page.waitForTimeout(180); await pause(page);
  const view = await bodyView(page, source, record, info); liveBoss(view); expect(view.hp!.w).toBeCloseTo(64, 0);
  expect(await objective(page)).toContain('Sydney'); return view;
}
async function releaseBubble(page: Page, source: Source, record: Tape, info: TestInfo) {
  const before = await bodyView(page, source, record, info); liveBoss(before);
  expect(await objective(page)).toContain('精神控制'); expect(before.bubbles.length, 'real bright outlined binding bubble').toBeGreaterThan(0);
  await page.mouse.up(); const shots = await burst(page, source, record, info, 'normal-j-breaks-pua', 650, () => hold(page, 'j', 620));
  const after = await bodyView(page, source, record, info); liveBoss(after); await alive(page);
  expect(after.bubbles, 'positive live bubble must disappear after real shots').toHaveLength(0); expect(await objective(page)).not.toContain('精神控制');
  await expect(page.locator('.runtime-log')).toContainText('控制解除');
  expect(shots.some(v => v.bubbles.length === 0), 'raw sequence contains actual release').toBe(true);
  return after;
}

function phaseEvidence(record: Tape, phase: number) {
  const measured = record.rows.filter((row): row is Omit<View, 'capture'> => typeof row === 'object' && row !== null && 'body' in row && 'dialogue' in row);
  const views = measured.filter(v => v.body && Math.floor(v.body.frame / 4) + 1 === phase);
  const freshDialogue = phase === 2 || views.some(v => v.body!.frame % 4 === 2 && v.dialogue.some(p => Math.hypot(p.x + p.w / 2 - v.body!.x - 48, p.y + p.h / 2 - v.body!.y - 48) < 65));
  const freshKnives = phase === 1 || views.some(v => {
    if (v.body!.frame % 4 !== 2) return false;
    const fresh = v.knives.filter(p => p.y >= 72 && p.y < 112);
    const lanes = new Set(fresh.map(p => Math.round((p.x + p.w / 2 - 65) / 82)));
    return fresh.length === 6 && lanes.size === 6 && [0, 1, 3, 5, 6].every(n => lanes.has(n)) && (lanes.has(2) !== lanes.has(4));
  });
  // Same-origin dialogue boxes cannot be counted separately in the first attack frame.
  // Use the same phase's later real, separated wave within210px of the body; old waves
  // and old-phase projectiles cannot substitute for the NEW attack-origin positive.
  const fan = phase === 2 || views.some(v => v.dialogue.filter(p => p.w >= 13 && p.w <= 15 && p.h >= 13 && p.h <= 15 && p.pixels >= 140 && Math.hypot(p.x + p.w / 2 - v.body!.x - 48, p.y + p.h / 2 - v.body!.y - 48) < 210).length === (phase === 3 ? 7 : 5));
  const poses = [1, 2, 3].every(action => record.seen.has((phase - 1) * 4 + action));
  return { poses, freshDialogue, freshKnives, fan };
}
async function collectPhase(page: Page, source: Source, record: Tape, info: TestInfo, phase: number) {
  for (let n = 0; n < 16; n++) {
    const proof = phaseEvidence(record, phase);
    if (Object.values(proof).every(Boolean)) { record.rows.push({ label: 'phase-' + phase + '-complete', proof }); return; }
    if ((await objective(page)).includes('精神控制')) await releaseBubble(page, source, record, info);
    else await burst(page, source, record, info, 'phase-' + phase + '-cycle', 800);
  }
  expect(phaseEvidence(record, phase), 'real phase poses, new emissions and separate native bullet geometry').toEqual({ poses: true, freshDialogue: true, freshKnives: true, fan: true });
}
async function shootTo(page: Page, source: Source, record: Tape, info: TestInfo, phase: 2 | 3 | 'clear') {
  for (let n = 0; n < 75; n++) {
    if (await cleared(page).isVisible()) { expect(phase).toBe('clear'); return; }
    await alive(page);
    if ((await objective(page)).includes('精神控制')) { await releaseBubble(page, source, record, info); continue; }
    const view = await bodyView(page, source, record, info);
    if (await cleared(page).isVisible()) { expect(phase).toBe('clear'); return; }
    const body = liveBoss(view), actualPhase = Math.floor(body.frame / 4) + 1;
    if (phase !== 'clear' && actualPhase >= phase) {
      expect(actualPhase, 'stop ordinary firing at the requested phase, never skip it').toBe(phase);
      expect(view.hp!.w).toBeLessThanOrEqual(64 * (phase === 2 ? 2 : 1) / 3 + 1);
      if (phase === 2) expect(view.hp!.w).toBeGreaterThan(64 / 3 - 1);
      return;
    }
    // Derive aim from the measured body/left-anchored HP, never the player x320.
    const box = await page.locator('canvas').boundingBox(); expect(box).not.toBeNull();
    const pointer = { x: box!.x + (view.hp!.x + 32) * box!.width / 640, y: box!.y + (view.hp!.y + 51) * box!.height / 360 };
    await burst(page, source, record, info, 'normal-mouse-to-' + phase, 430, async () => {
      await page.mouse.move(pointer.x, pointer.y); await page.mouse.down(); try { await page.waitForTimeout(390); } finally { await page.mouse.up(); }
    });
  }
  throw Error('No requested natural phase/victory from ordinary mouse combat: ' + phase);
}
async function releaseInputs(page: Page) { await page.mouse.up(); for (const key of ['a', 'd', 'Space', 'j', 'Shift', 'q']) await page.keyboard.up(key); }

test('Sydney legal cp2 idle1, real tell, PUA shooting release and long-pause native freeze', async ({ page }, info) => {
  test.setTimeout(180000); const observed = watch(page), source = await sourceArt(), record = tape();
  try {
    await reachLip(page, source, record, info); await enterArena(page, source, record, info);
    let tell: View | null = null;
    for (let n = 0; n < 12 && !tell; n++) {
      await burst(page, source, record, info, 'seek-real-first-tell', 250); const current = await frozenView(page, source, record, 'paused-current-tell');
      if (current.body?.frame === 1) tell = current;
    }
    expect(tell, 'real phase1 tell before freezing').not.toBeNull(); liveBoss(tell!); expect(tell!.ring).toBeGreaterThan(80); expect(tell!.hp!.w).toBeCloseTo(64, 0);
    const clock = await page.locator('.hud-cell').allTextContents(), saved = await rawSave(page);
    const frozen = await observe(page, source, record, 'long-pause-before'); await page.waitForTimeout(3400);
    const afterPause = await observe(page, source, record, 'long-pause-after');
    expect(afterPause.capture.png).toBe(frozen.capture.png); expect(afterPause.body).toEqual(frozen.body); expect(afterPause.hp).toEqual(frozen.hp); expect(afterPause.ring).toBe(frozen.ring);
    expect(await page.locator('.hud-cell').allTextContents()).toEqual(clock); expect(await rawSave(page)).toBe(saved);
    for (let n = 0; n < 12 && !(await objective(page)).includes('精神控制'); n++) await burst(page, source, record, info, 'actual-pua-onset', 250);
    const bound = await visibleHero(page, source, record, info, true); liveBoss(bound); expect(bound.bubbles.length).toBeGreaterThan(0); expect(await objective(page)).toContain('精神控制');
    const x = bound.hero.x!; await burst(page, source, record, info, 'bound-normal-d-input', 240, () => hold(page, 'd', 220));
    const stillBound = await visibleHero(page, source, record, info, true); expect(Math.abs(stillBound.hero.x! - x)).toBeLessThan(3); expect(stillBound.bubbles.length).toBeGreaterThan(0);
    await info.attach('sydney-real-pua-positive', { path: await png(info, 'sydney-real-pua-positive', stillBound.capture), contentType: 'image/png' });
    await releaseBubble(page, source, record, info); // Release requires a live boss, not an exact post-input HP or shot count.
    const beforeMove = await visibleHero(page, source, record, info, true);
    await burst(page, source, record, info, 'released-normal-d-input', 240, () => hold(page, 'd', 220));
    const moved = await visibleHero(page, source, record, info, true); liveBoss(moved); expect(moved.hero.x! - beforeMove.hero.x!).toBeGreaterThan(15); expect(moved.bubbles).toHaveLength(0);
    // A true first emission may cover the discriminating pixels. Observe an ordinary full cycle, never infer attack from PUA.
    await collectPhase(page, source, record, info, 1);
    for (const frame of [0, 1, 2, 3]) expect(record.seen.has(frame), 'actual phase1 source pose ' + frame).toBe(true);
    expect([...observed.loaded].sort()).toEqual([...RESOURCES].sort()); expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  } finally { try { await releaseInputs(page); } finally { await finishEvidence(info, record); } }
});

test('Sydney real ordinary combat reaches all nine active poses and cleans the same arena before chapter three', async ({ page }, info) => {
  test.setTimeout(240000); const observed = watch(page), source = await sourceArt(), record = tape();
  try {
    const { attempt } = await reachLip(page, source, record, info); await enterArena(page, source, record, info);
    await collectPhase(page, source, record, info, 1);
    await shootTo(page, source, record, info, 2); await collectPhase(page, source, record, info, 2);
    await shootTo(page, source, record, info, 3); await collectPhase(page, source, record, info, 3);
    const positive = await bodyView(page, source, record, info); liveBoss(positive); expect(Math.floor(positive.body!.frame / 4) + 1).toBe(3);
    await info.attach('sydney-live-before-defeat', { path: await png(info, 'sydney-live-before-defeat', positive.capture), contentType: 'image/png' });
    await shootTo(page, source, record, info, 'clear'); await expect(cleared(page)).toBeVisible();
    const won: GameSaveData = JSON.parse(await rawSave(page) ?? 'null');
    expect(isGameSave(won)).toBe(true); expect(won).toMatchObject({ runId: attempt.runId, seed: 42, stage: 3, checkpoint: 0, doom: 8, inventory: attempt.inventory, upgrades: attempt.upgrades, donated: true });
    expect(won.hp).toBeGreaterThan(0); expect(won.actionCounts.shots).toBeGreaterThan(attempt.actionCounts.shots); expect(won.elapsedMs).toBeGreaterThan(attempt.elapsedMs);
    const gone = await observe(page, source, record, 'same-arena-defeated-before-next-button');
    signal(gone); expect(gone.body).toBeNull(); expect(gone.hpPixels).toBe(0); expect(gone.dangerPixels, 'independent warning sweep is clear without needing a body anchor').toBe(0); expect(gone.bubbles).toHaveLength(0);
    // A nonempty raw canvas, NOT the overlaid DOM screenshot, is the cleanup proof.
    await info.attach('sydney-defeated-raw-canvas', { path: await png(info, 'sydney-defeated-raw-canvas', gone.capture), contentType: 'image/png' });
    expect([...record.seen].sort((a, b) => a - b)).toEqual(REACHABLE);
    await page.getByRole('button', { name: '进入第三章', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await page.waitForTimeout(120); await pause(page);
    const next = await observe(page, source, record, 'next-chapter-no-sydney'); signal(next); expect(next.body).toBeNull();
    await expect(page.locator('.world-titlebar strong')).toHaveText('03');
    expect([...observed.loaded].sort()).toEqual([...RESOURCES].sort()); expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  } finally { try { await releaseInputs(page); } finally { await finishEvidence(info, record); } }
});

for (const fault of ['missing-png', 'missing-unused-idle2'] as const) {
  test('Sydney ' + fault + ' preserves exact legal checkpoint through explicit refresh', async ({ page }, info) => {
    const original = { ...fixture(), score: 77, tokens: 31 }; expect(isGameSave(original)).toBe(true);
    const observed = watch(page), pattern = fault === 'missing-png' ? '**/game/sydney.png*' : '**/game/sydney.json*';
    let intercepted = 0, brokenAtlas: string | null = null;
    if (fault === 'missing-unused-idle2') {
      const atlas = JSON.parse(await readFile('public/game/sydney.json', 'utf8')) as { frames: { filename: string }[] };
      expect(atlas.frames.map(f => f.filename)).toEqual(NAMES);
      // Real exported frame4 is mandatory at load, although Core never plays idle2.
      brokenAtlas = JSON.stringify({ ...atlas, frames: atlas.frames.filter(f => f.filename !== 'sydney 4.aseprite') });
    }
    const intercept = async (route: Route) => { intercepted++; if (fault === 'missing-png') await route.abort('failed'); else await route.fulfill({ contentType: 'application/json', body: brokenAtlas! }); };
    await page.route(pattern, intercept); await seedOnce(page, original);
    const alert = page.getByRole('alert', { name: '游戏资源加载失败', exact: true });
    await expect(alert).toContainText('Sydney 幽灵新娘图集加载失败。请检查网络后刷新页面；本地检查点未改动。', { timeout: 15000 });
    for (const name of ['开始新训练', '恢复检查点']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    expect(intercepted).toBeGreaterThan(0); expect(await rawSave(page)).toBe(JSON.stringify(original)); expect(observed.writes).toEqual([]);
    await expect(page.getByRole('region', { name: '本局成绩上传', exact: true })).toHaveCount(0);
    const image = info.outputPath(fault + '-visible-error.png'); await page.screenshot({ path: image }); await info.attach(fault + '-visible-error', { path: image, contentType: 'image/png' });
    await page.unroute(pattern, intercept); const resource = RESOURCES[fault === 'missing-png' ? 0 : 1];
    const response = page.waitForResponse(r => new URL(r.url()).pathname === resource && r.status() === 200);
    await alert.getByRole('button', { name: '刷新并重试', exact: true }).click(); await response;
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeEnabled(); await expect(alert).toHaveCount(0);
    // No restore/start click after retry: no identity/counter exception is allowed here.
    expect(await rawSave(page)).toBe(JSON.stringify(original)); await expect(page.locator('canvas')).toHaveCount(1);
    expect([...observed.loaded].sort()).toEqual([...RESOURCES].sort()); expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
    const report = info.outputPath(fault + '-exact-retry.json'); await writeFile(report, JSON.stringify({ fault, intercepted, original, loaded: [...observed.loaded], writes: observed.writes }, null, 2));
    await info.attach(fault + '-exact-retry', { path: report, contentType: 'application/json' });
  });
}
