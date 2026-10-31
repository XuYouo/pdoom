import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';

// Native browser acceptance, not the static 7/10 art review. Every run below is
// explicitly a legal initial checkpoint fixture, NOT a fresh chapter journey.
// No Phaser/World/React hooks, midway state injection, fake time/rAF or hidden DOM.
const RESOURCES = ['/game/von-neumann-probe.png', '/game/von-neumann-probe.json'];
const FRAME_NAMES = [0, 1, 2, 3].map(index => `von-neumann-probe ${index}.aseprite`);
type Rect = { x: number; y: number; w: number; h: number };
type TerrainSource = { image: string; protectedMiddle: Rect; serviceMiddle: Rect; wallA: Rect; wallB: Rect };
type Source = { image: string; frames: Rect[]; terrain: TerrainSource };
type Capture = { png: string; at: number };
type Body = { x: number; y: number; frame: number; ratio: number; signatureRatio: number; ink: number; colors: number; checksum: number };
type Surface = { top: number; registration: number; fill: number; exposed: number; backgroundControl: number; protectedControl: number; warning: number; pixels: number };
type View = { capture: Capture; bodies: Body[]; surface: Surface | null; opaque: number; colors: number; hero: { count: number; x: number | null; bottom: number | null } };
type Tape = { latest: Capture | null; rows: { label: string; at: number; bodies: Body[]; surface: Surface | null; opaque: number; colors: number; hero: View['hero'] }[] };
const tape = (): Tape => ({ latest: null, rows: [] });
const rawSave = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));

function watch(page: Page) {
  const errors: string[] = [], writes: string[] = [], loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push(`${request.method()} ${request.url()}`); });
  page.on('response', response => { const path = new URL(response.url()).pathname; if (response.status() === 200 && RESOURCES.includes(path)) loaded.add(path); });
  return { errors, writes, loaded };
}
/** Independent native source oracle: masters occupy the left8x4 of a16-column map. */
async function terrainArt(): Promise<TerrainSource> {
  const [image, text] = await Promise.all([readFile('public/game/factory-terrain.png'), readFile('public/game/factory-terrain.json', 'utf8')]);
  const atlas = JSON.parse(text) as { columns: number; rows: number; tileWidth: number; tileHeight: number; tileCount: number; imageWidth: number; imageHeight: number; map: { width: number; height: number; tiles: number[] } };
  expect(atlas).toMatchObject({ columns: 6, rows: 6, tileWidth: 16, tileHeight: 16, tileCount: 32, imageWidth: 96, imageHeight: 96 });
  expect(atlas.map).toMatchObject({ width: 16, height: 8 }); expect(atlas.map.tiles).toHaveLength(128);
  const packed = (x: number, y: number) => {
    const native = atlas.map.tiles[y * atlas.map.width + x];
    expect(Number.isInteger(native)).toBe(true); expect(native).toBeGreaterThanOrEqual(1); expect(native).toBeLessThanOrEqual(atlas.tileCount);
    return native - 1;
  };
  const slots = [packed(1, 0), packed(5, 0), packed(0, 2), packed(1, 2)];
  expect(slots).toEqual([1, 5, 8, 18]);
  const frame = (slot: number): Rect => ({ x: slot % atlas.columns * 16, y: Math.floor(slot / atlas.columns) * 16, w: 16, h: 16 });
  return { image: `data:image/png;base64,${image.toString('base64')}`, protectedMiddle: frame(slots[0]), serviceMiddle: frame(slots[1]), wallA: frame(slots[2]), wallB: frame(slots[3]) };
}
async function sourceArt(): Promise<Source> {
  const [image, text] = await Promise.all([readFile('public/game/von-neumann-probe.png'), readFile('public/game/von-neumann-probe.json', 'utf8')]);
  const atlas = JSON.parse(text) as { frames: { filename: string; frame: Rect; trimmed: boolean; rotated: boolean }[]; meta: { size: { w: number; h: number }; frameTags: { name: string; from: number; to: number }[] } };
  expect(atlas.meta.size).toEqual({ w: 128, h: 32 }); expect(atlas.frames.map(frame => frame.filename)).toEqual(FRAME_NAMES);
  expect(atlas.meta.frameTags.map(({ name, from, to }) => ({ name, from, to }))).toEqual([{ name: 'seek', from: 0, to: 1 }, { name: 'tell', from: 2, to: 2 }, { name: 'consume', from: 3, to: 3 }]);
  for (const frame of atlas.frames) expect(frame).toMatchObject({ trimmed: false, rotated: false, frame: { w: 32, h: 32 } });
  return { image: `data:image/png;base64,${image.toString('base64')}`, frames: atlas.frames.map(frame => frame.frame), terrain: await terrainArt() };
}
function legalFixture(checkpoint = 0): GameSaveData {
  const value: GameSaveData = { ...createRun(randomUUID(), 42), stage: 2, checkpoint, tokens: 200, elapsedMs: 20000, donated: true };
  expect(isGameSave(value)).toBe(true); return value;
}
async function seedOnce(page: Page, save: GameSaveData) {
  await page.addInitScript(value => {
    const marker = `probe-art.fixture.${value.runId}`;
    if (sessionStorage.getItem(marker) === null) {
      sessionStorage.setItem(marker, 'once');
      if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(value));
    }
  }, save);
}
async function openFixture(page: Page) {
  const original = legalFixture(); await seedOnce(page, original);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('canvas')).toHaveCount(1); return original;
}
async function release(page: Page) { await page.keyboard.up('Space'); await page.keyboard.up('a'); await page.keyboard.up('d'); await page.mouse.up(); }
const pauseDialog = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
async function pause(page: Page) { await page.keyboard.press('Escape'); await expect(pauseDialog(page)).toBeVisible(); }

/** Collect actual render callbacks; no replacement rAF, timers or simulation stepping.
 * A bounded real-time burst is decoded AFTER normal UI pause, so short consume frames
 * cannot be lost to repeated browser protocol/image-decoding round trips. */
async function nativeFrames(page: Page, durationMs = 0): Promise<Capture[]> {
  return page.evaluate(duration => new Promise<Capture[]>((resolve, reject) => {
    const frames: Capture[] = []; let began: number | null = null;
    const take = () => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw new Error('Expected the real native640x360 canvas');
        const at = performance.now(); began ??= at;
        frames.push({ png: canvas.toDataURL('image/png'), at });
        if (at - began >= duration || frames.length >= 400) resolve(frames); else requestAnimationFrame(take);
      } catch (error) { reject(error); }
    };
    requestAnimationFrame(take);
  }), durationMs);
}

/** Independent source-texel matcher: no production role selector/binding imports.
 * The real warning ring and connector are deliberately outside the measured body
 * mask. We REQUIRE four distinguishable source signatures inside that mask, rather
 * than accepting common chassis colors as proof of the requested FSM pose. */
async function inspect(page: Page, capture: Capture, source: Source): Promise<View> {
  const result = await page.evaluate(async ({ capture, source }) => {
    async function decode(url: string) {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); if (!context) throw new Error('No screenshot reader');
      context.imageSmoothingEnabled = false; context.drawImage(image, 0, 0);
      return { w: canvas.width, h: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    }
    const [actual, art, terrain] = await Promise.all([decode(capture.png), decode(source.image), decode(source.terrain.image)]);
    if (actual.w !== 640 || actual.h !== 360 || art.w !== 128 || art.h !== 32 || terrain.w !== 96 || terrain.h !== 96) throw new Error('Unexpected actual/source native size');
    const pixel = (image: typeof actual, x: number, y: number) => { const at = (y * image.w + x) * 4; return [image.data[at], image.data[at + 1], image.data[at + 2], image.data[at + 3]]; };
    const equal = (a: number[], b: number[]) => a[3] === 255 && b[3] === 255 && Math.max(...a.slice(0, 3).map((v, i) => Math.abs(v - b[i]))) <= 2;
    const colorKey = (color: number[]) => color[3] ? color.join(',') : 'transparent';
    const points: { x: number; y: number; values: number[][]; changing: boolean }[] = [];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const radius = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
      if ((radius >= 13 && radius <= 15) || (Math.abs(x + 0.5 - 16) <= 1.5 && y >= 23)) continue;
      const values = source.frames.map(frame => pixel(art, frame.x + x, frame.y + y));
      if (values.some(value => value[3] !== 0 && value[3] !== 255)) throw new Error('Expected hard-alpha native source art');
      if (values.some(value => value[3] === 255)) points.push({ x, y, values, changing: new Set(values.map(colorKey)).size > 1 });
    }
    const signature = points.filter(point => point.changing);
    if (signature.length < 2 || new Set(source.frames.map((_, frame) => signature.map(point => colorKey(point.values[frame])).join('|'))).size !== 4) throw new Error('Measured source mask does not independently distinguish all four frames');
    const common = points.filter(point => !point.changing && point.values[0][3] === 255);
    if (common.length < 40) throw new Error('Too few native chassis positive-control texels');
    const frequency = new Map<string, number>();
    for (const point of common) { const key = colorKey(point.values[0]); frequency.set(key, (frequency.get(key) ?? 0) + 1); }
    common.sort((a, b) => frequency.get(colorKey(a.values[0]))! - frequency.get(colorKey(b.values[0]))!);
    const anchor = common[0], checks = [common[0], common[Math.floor(common.length / 3)], common[Math.floor(common.length * 2 / 3)], common[common.length - 1]];
    const bodies: Body[] = []; let opaque = 0, heroCount = 0, heroLeft = 640, heroRight = -1, heroBottom = -1;
    const colors = new Set<number>();
    for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
      const got = pixel(actual, x, y); if (got[3] === 255) opaque++;
      if (colors.size < 512) colors.add((got[0] << 16) | (got[1] << 8) | got[2]);
      if (got[0] === 217 && got[1] === 119 && got[2] === 87) { heroCount++; heroLeft = Math.min(heroLeft, x); heroRight = Math.max(heroRight, x); heroBottom = Math.max(heroBottom, y); }
      if (!equal(got, anchor.values[0])) continue;
      const left = x - anchor.x, top = y - anchor.y;
      if (left < 0 || top < 0 || left + 32 > 640 || top + 32 > 360 || checks.some(point => !equal(pixel(actual, left + point.x, top + point.y), point.values[0]))) continue;
      let best: Body | null = null;
      for (let frame = 0; frame < 4; frame++) {
        let matched = 0, signatureMatched = 0, ink = 0; const palette = new Set<string>();
        for (const point of points) {
          const expected = point.values[frame], value = pixel(actual, left + point.x, top + point.y);
          const hit = expected[3] === 255 ? equal(value, expected) : !point.values.some(other => other[3] === 255 && equal(value, other));
          if (hit) { matched++; if (point.changing) signatureMatched++; }
          if (expected[3] === 255 && hit) { ink++; palette.add(colorKey(expected)); }
        }
        const candidate: Body = { x: left, y: top, frame, ratio: matched / points.length, signatureRatio: signatureMatched / signature.length, ink, colors: palette.size, checksum: 0 };
        if (!best || candidate.ratio + candidate.signatureRatio > best.ratio + best.signatureRatio) best = candidate;
      }
      if (!best || best.ratio < 0.98 || best.signatureRatio < 0.98 || best.ink < 100 || best.colors < 4) continue;
      let checksum = 2166136261;
      for (let yy = top; yy < top + 32; yy++) for (let xx = left; xx < left + 32; xx++) for (const value of pixel(actual, xx, yy)) checksum = Math.imul(checksum ^ value, 16777619) >>> 0;
      best.checksum = checksum;
      if (!bodies.some(body => Math.abs(body.x - left) < 4 && Math.abs(body.y - top) < 4)) bodies.push(best);
    }
    bodies.sort((a, b) => a.x - b.x || a.y - b.y);
    // First side branch x30..129 and protected main x310..489 share world y1620.
    // Confirm the existing visible probe anchor using the actual protected stripe;
    // no +/-1 best-fit search or engine/World/camera access.
    const leftProbe = bodies.find(body => Math.abs(body.x + 16 - 80) < 2);
    let surface: Surface | null = null;
    if (leftProbe) {
      const top = Math.round(leftProbe.y + 16 + 22), width = 30, height = 6;
      const repeated = (frame: Rect, x: number, y: number) => pixel(terrain, frame.x + ((x % frame.w) + frame.w) % frame.w, frame.y + ((y % frame.h) + frame.h) % frame.h);
      const blend = (base: number[], color: number[], opacity: number) => {
        const alpha = color[3] / 255 * opacity;
        return base.map((value, channel) => channel === 3 ? 255 : Math.round(value * (1 - alpha) + color[channel] * alpha));
      };
      const background = (x: number, worldY: number) => {
        let result = blend([15, 25, 27, 255], repeated(source.terrain.wallA, x, worldY), 0.16);
        if (x >= 48 && x < 592 && worldY >= 16) {
          const bandY = 16 + Math.floor((worldY - 16) / 128) * 128;
          if (worldY < bandY + 96) result = blend(result, repeated(source.terrain.wallB, x - 48, worldY - bandY), 0.12);
        }
        return result;
      };
      const count = (xx: number, kind: 'service' | 'protected' | 'background') => {
        let result = 0;
        for (let y = top + 4; y < top + 4 + height; y++) for (let x = xx; x < xx + width; x++) {
          const worldY = 1620 + y - top;
          let expected = background(x, worldY);
          if (kind !== 'background') {
            const frame = kind === 'service' ? source.terrain.serviceMiddle : source.terrain.protectedMiddle;
            expected = blend(expected, repeated(frame, x - (kind === 'service' ? 46 : 326), worldY - 1620), 1);
          }
          if (equal(pixel(actual, x, y), expected)) result++;
        }
        return result;
      };
      let registered = 0;
      for (let y = top; y < top + 3; y++) for (let x = 340; x < 340 + width; x++) if (equal(pixel(actual, x, y), [144, 198, 176, 255])) registered++;
      let warning = 0;
      for (let y = top - 2; y <= top + 2; y++) for (let x = 32; x < 128; x++) {
        const color = pixel(actual, x, y); if (color[3] === 255 && color[0] > 130 && color[0] > color[1] * 1.35 && color[0] > color[2] * 1.4) warning++;
      }
      surface = { top, registration: registered / (width * 3), fill: count(54, 'service'), exposed: count(54, 'background'), backgroundControl: count(150, 'background'), protectedControl: count(340, 'protected'), warning, pixels: width * height };
    }
    return { bodies, surface, opaque: opaque / (640 * 360), colors: colors.size, hero: { count: heroCount, x: heroCount ? (heroLeft + heroRight + 1) / 2 : null, bottom: heroCount ? heroBottom : null } };
  }, { capture, source });
  return { capture, ...result };
}
function positive(view: View) {
  expect(view.opaque, 'actual opaque native buffer, not a cleared WebGL readback').toBeGreaterThan(0.99);
  expect(view.colors, 'nonempty multicolor factory and actors').toBeGreaterThan(12);
  expect(view.bodies.length, 'a genuine multicolor32px source-art body, not fallback Graphics').toBeGreaterThan(0);
  for (const body of view.bodies) { expect(body.ratio).toBeGreaterThanOrEqual(0.98); expect(body.signatureRatio).toBeGreaterThanOrEqual(0.98); expect(body.ink).toBeGreaterThanOrEqual(100); expect(body.colors).toBeGreaterThanOrEqual(4); }
}
async function observe(page: Page, source: Source, record: Tape, label: string, capture?: Capture) {
  const current = capture ?? (await nativeFrames(page))[0]; record.latest = current;
  const view = await inspect(page, current, source);
  record.rows.push({ label, at: current.at, bodies: view.bodies, surface: view.surface, opaque: view.opaque, colors: view.colors, hero: view.hero }); return view;
}
async function png(info: TestInfo, name: string, capture: Capture) {
  const path = info.outputPath(`${name}.png`); await writeFile(path, Buffer.from(capture.png.split(',')[1], 'base64'));
  await info.attach(name, { path, contentType: 'image/png' });
}
async function finishEvidence(info: TestInfo, record: Tape) {
  if (record.latest) await png(info, 'probe-last-native-observation', record.latest);
  const path = info.outputPath('probe-native-timeline.json'); await writeFile(path, JSON.stringify(record.rows, null, 2));
  await info.attach('probe-native-timeline', { path, contentType: 'application/json' });
}
function firstSurface(view: View) {
  positive(view); expect(view.surface).not.toBeNull(); const surface = view.surface!;
  expect(surface.registration, 'visible probe and protected stripe must agree; report shifts instead of relaxing').toBeGreaterThanOrEqual(0.98);
  expect(surface.backgroundControl / surface.pixels, 'untouched nonempty native factory background control').toBeGreaterThanOrEqual(0.98);
  expect(surface.protectedControl / surface.pixels, 'protected green main route remains solid').toBeGreaterThanOrEqual(0.98);
  return surface;
}

test('native probe warns, freezes on a long pause, consumes the actual side platform and resumes both seek frames', async ({ page }, info) => {
  test.setTimeout(60000);
  const observed = watch(page), source = await sourceArt(), record = tape();
  try {
    const original = await openFixture(page);
    await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
    // Ordinary first55px step exposes the first side branch above the entrance.
    // Standing at the entrance would spend the real sea escape budget and clip the probe.
    await page.keyboard.down('Space'); try { await page.waitForTimeout(600); } finally { await page.keyboard.up('Space'); }
    await page.waitForTimeout(120);
    const tellCapture = (await nativeFrames(page))[0]; record.latest = tellCapture;
    await pause(page); // Ordinary UI pause BEFORE offline source comparison/attachments.
    await assertCheckpointAttempt(page, original);
    const tell = await observe(page, source, record, 'real-warning-before-pause', tellCapture);
    await png(info, 'probe-real-tell-and-target', tell.capture);
    expect(tell.bodies.some(body => body.frame === 2 && Math.abs(body.x + 16 - 80) < 2)).toBe(true);
    const warned = firstSurface(tell);
    expect(warned.fill / warned.pixels, 'actual side-platform interior before consumption').toBeGreaterThanOrEqual(0.98);
    expect(warned.warning, 'real red target outline, separate from the native body').toBeGreaterThan(80);
    const frozen = await observe(page, source, record, 'paused-tell-start'); firstSurface(frozen);
    expect(frozen.bodies.some(body => body.frame === 2)).toBe(true);
    const counters = await page.locator('.hud-cell').allTextContents(), saved = await rawSave(page);
    expect(counters).toHaveLength(4);
    await page.waitForTimeout(3000); // Longer than the real1800ms tell+500ms consume; no fake clock.
    const still = await observe(page, source, record, 'paused-tell-after-three-real-seconds'); firstSurface(still);
    expect(still.bodies).toEqual(frozen.bodies); expect(still.surface).toEqual(frozen.surface);
    expect(await page.locator('.hud-cell').allTextContents()).toEqual(counters); expect(await rawSave(page)).toBe(saved);
    await png(info, 'probe-paused-native-body', still.capture);
    await pauseDialog(page).getByRole('button', { name: '继续训练', exact: true }).click();
    const frames = await nativeFrames(page, 2200); record.latest = frames[frames.length - 1];
    await pause(page); // Do not stand in the rising sea while decoding the captured sequence.
    expect(frames.length).toBeGreaterThan(12); expect(frames[frames.length - 1].at - frames[0].at).toBeGreaterThanOrEqual(2100);
    const phases = new Map<number, View>();
    for (const capture of frames) {
      const view = await observe(page, source, record, 'actual-unpaused-state-sequence', capture);
      const body = view.bodies.find(value => Math.abs(value.x + 16 - 80) < 2);
      if (!body || phases.has(body.frame)) continue;
      positive(view); phases.set(body.frame, view); await png(info, `probe-source-frame-${body.frame}`, capture);
    }
    expect(phases.has(3), 'actual consume frame, not just a disappearing color').toBe(true);
    expect(phases.has(0), 'actual seek-a source pixels').toBe(true); expect(phases.has(1), 'actual seek-b source pixels').toBe(true);
    const consumed = firstSurface(phases.get(3)!);
    expect(consumed.fill, 'the real side platform has been removed').toBe(0);
    expect(consumed.exposed / consumed.pixels, 'its vacated interior reveals positive factory background pixels').toBeGreaterThanOrEqual(0.98);
    expect(consumed.warning, 'the old target outline is gone after actual collapse').toBe(0);
    for (const frame of [0, 1]) {
      const seeking = firstSurface(phases.get(frame)!);
      expect(seeking.fill).toBe(0); expect(seeking.exposed / seeking.pixels).toBeGreaterThanOrEqual(0.98);
    }
    await expect(page.getByRole('heading', { name: '这次，梯度归零。' })).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1);
    expect([...observed.loaded].sort()).toEqual([...RESOURCES].sort()); expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  } finally { await release(page); await finishEvidence(info, record); }
});

test('ordinary factory jumps reveal a newly replicated native body beside its live parent', async ({ page }, info) => {
  test.setTimeout(45000);
  const observed = watch(page), source = await sourceArt(), record = tape();
  try {
    const original = await openFixture(page);
    await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
    // The existing Factory route uses the real overlapping green steps at x310.
    // Six ordinary pulses keep the player ahead of the sea and the first parent in
    // view. No horizontal teleport, held-input decoding, shooting or retry fixture.
    for (let step = 0; step < 6; step++) {
      await page.keyboard.down('Space'); try { await page.waitForTimeout(600); } finally { await page.keyboard.up('Space'); }
      await page.waitForTimeout(250);
      await expect(page.getByRole('heading', { name: '这次，梯度归零。' })).toHaveCount(0);
    }
    const before = await observe(page, source, record, 'six-normal-jumps-before-copy'); positive(before);
    expect(before.hero.count).toBeGreaterThan(20); expect(before.hero.x).toBeGreaterThan(295); expect(before.hero.x).toBeLessThan(330);
    expect(before.bodies, 'one full source-positive parent BEFORE the new body appears').toHaveLength(1);
    const parent = before.bodies[0]; expect(parent.x + 16).toBeGreaterThan(400); expect(parent.x + 16).toBeLessThan(580);
    let copied: View | null = null;
    const deadline = Date.now() + 2600;
    do {
      const view = await observe(page, source, record, 'watch-actual-replication');
      const pair = view.bodies.some(a => Math.abs(a.x - parent.x) < 3 && view.bodies.some(b => b !== a && Math.abs(b.x - a.x - 28) <= 1 && Math.abs(b.y - a.y + 24) <= 1));
      if (view.bodies.length === 2 && pair) { copied = view; break; }
      await page.waitForTimeout(30);
    } while (Date.now() < deadline);
    await pause(page); // Preserve the real observation before artifact I/O spends sea time.
    await assertCheckpointAttempt(page, original);
    await png(info, 'probe-single-parent-after-normal-climb', before.capture);
    expect(copied, 'new source-positive body at the real +28,-24 replication offset; no hidden counter fallback').not.toBeNull();
    positive(copied!); expect(copied!.bodies).toHaveLength(2);
    expect(copied!.bodies.every(body => body.frame === 0 || body.frame === 1)).toBe(true);
    await png(info, 'probe-real-parent-and-new-copy', copied!.capture);
    const seekFrozen = await observe(page, source, record, 'real-seek-pair-paused'); positive(seekFrozen);
    expect(seekFrozen.bodies).toHaveLength(2);
    const frozenCounters = await page.locator('.hud-cell').allTextContents();
    await page.waitForTimeout(650); // More than two actual240ms seek frame periods.
    const seekStill = await observe(page, source, record, 'real-seek-pair-still-paused'); positive(seekStill);
    expect(seekStill.bodies).toEqual(seekFrozen.bodies);
    expect(await page.locator('.hud-cell').allTextContents()).toEqual(frozenCounters);
    await png(info, 'probe-seek-animation-paused', seekStill.capture);
    // compactNotice deliberately suppresses the Core's long replication message.
    // Do not manufacture a DOM notice or treat its absence as failed replication.
    // The actual new body, positive source signatures and relative geometry are the proof.
    await expect(page.getByRole('heading', { name: '这次，梯度归零。' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '本局成绩上传', exact: true })).toHaveCount(0);
    expect([...observed.loaded].sort()).toEqual([...RESOURCES].sort()); expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  } finally { await release(page); await finishEvidence(info, record); }
});

for (const fault of ['missing-png', 'missing-consume-frame'] as const) {
  test(`probe ${fault} fails explicitly and preserves the legal checkpoint through refresh`, async ({ page }, info) => {
    const original = { ...legalFixture(1), score: 77, tokens: 31 }; expect(isGameSave(original)).toBe(true);
    const observed = watch(page), pattern = fault === 'missing-png' ? '**/game/von-neumann-probe.png*' : '**/game/von-neumann-probe.json*';
    let intercepted = 0, brokenAtlas: string | null = null;
    if (fault === 'missing-consume-frame') {
      const atlas = JSON.parse(await readFile('public/game/von-neumann-probe.json', 'utf8')) as { frames: { filename: string }[] };
      expect(atlas.frames.map(frame => frame.filename)).toEqual(FRAME_NAMES);
      // Remove ONLY the actual required fourth entry, retaining the other metadata
      // values and real source-frame entries; no invented atlas.
      brokenAtlas = JSON.stringify({ ...atlas, frames: atlas.frames.filter(frame => frame.filename !== FRAME_NAMES[3]) });
    }
    const intercept = async (route: Route) => {
      intercepted++;
      if (fault === 'missing-png') await route.abort('failed');
      else await route.fulfill({ contentType: 'application/json', body: brokenAtlas! });
    };
    await page.route(pattern, intercept); await seedOnce(page, original); await page.goto('/');
    const alert = page.getByRole('alert', { name: '游戏资源加载失败', exact: true });
    await expect(alert).toContainText('冯·诺依曼探针图集加载失败。请检查网络后刷新页面；本地检查点未改动。', { timeout: 15000 });
    await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
    expect(intercepted).toBeGreaterThan(0); expect(await rawSave(page)).toBe(JSON.stringify(original));
    await expect(page.getByRole('region', { name: '本局成绩上传', exact: true })).toHaveCount(0); expect(observed.writes).toEqual([]);
    const failure = info.outputPath(`probe-${fault}-visible-failure.png`); await page.screenshot({ path: failure });
    await info.attach(`probe-${fault}-visible-failure`, { path: failure, contentType: 'image/png' });
    await page.unroute(pattern, intercept);
    const resource = fault === 'missing-png' ? RESOURCES[0] : RESOURCES[1];
    const reloaded = page.waitForResponse(response => new URL(response.url()).pathname === resource && response.status() === 200);
    await alert.getByRole('button', { name: '刷新并重试', exact: true }).click(); await reloaded;
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeEnabled(); await expect(alert).toHaveCount(0);
    // No restore/start click after retry: all persisted counters and run identity stay exact.
    expect(await rawSave(page)).toBe(JSON.stringify(original)); await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByRole('region', { name: '本局成绩上传', exact: true })).toHaveCount(0);
    expect([...observed.loaded].sort()).toEqual([...RESOURCES].sort()); expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
    const evidence = info.outputPath(`probe-${fault}-retry.json`);
    await writeFile(evidence, JSON.stringify({ fault, intercepted, savedCheckpoint: original, loaded: [...observed.loaded], writes: observed.writes }, null, 2));
    await info.attach(`probe-${fault}-retry`, { path: evidence, contentType: 'application/json' });
  });
}
