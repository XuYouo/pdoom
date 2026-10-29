import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';

// Native acceptance, not the static art-review score. No Phaser/World globals,
// simulation writes, hidden DOM, clock substitution or replacement requestAnimationFrame.
const RESOURCE_PATHS = ['/game/chapter-one-terrain.png', '/game/chapter-one-props.png', '/game/chapter-one-props.json'] as const;
type Rect = { x: number; y: number; w: number; h: number };
type Layer = { source: 'terrain' | 'props'; frame: Rect; area: Rect; repeat: boolean; alpha: number };
type Probe = { name: string; area: Rect; under: Layer[]; target: Layer | null; minimumEvidence: number };
type Sources = { terrain: string; props: string; cabinet: Rect; window: Rect };
type ProbeResult = { name: string; pixels: number; matched: number; evidence: number; evidenceMatched: number; absentMatched: number; colors: number; checksum: number };

function watch(page: Page) {
  const errors: string[] = [], writes: string[] = [], loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push(`${request.method()} ${request.url()}`);
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 200 && (RESOURCE_PATHS as readonly string[]).includes(path)) loaded.add(path);
  });
  return { errors, writes, loaded };
}
const storedSave = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));

/** Read approved source pixels independently of runtime binding/plan code. */
async function sources(): Promise<Sources> {
  const [terrain, props, mapText, atlasText] = await Promise.all([
    readFile('public/game/chapter-one-terrain.png'), readFile('public/game/chapter-one-props.png'),
    readFile('public/game/chapter-one-terrain.json', 'utf8'), readFile('public/game/chapter-one-props.json', 'utf8'),
  ]);
  const map = JSON.parse(mapText) as { columns: number; tileWidth: number; tileHeight: number; tileCount: number; imageWidth: number; imageHeight: number };
  expect(map).toMatchObject({ columns: 6, tileWidth: 16, tileHeight: 16, tileCount: 32, imageWidth: 96, imageHeight: 96 });
  const atlas = JSON.parse(atlasText) as { frames: { filename: string; frame: Rect; trimmed: boolean; rotated: boolean }[]; meta: { frameTags: { name: string; from: number; to: number }[] } };
  const prop = (name: string) => {
    const tag = atlas.meta.frameTags.find(value => value.name === name); expect(tag).toBeDefined();
    expect(tag!.to).toBe(tag!.from);
    const frame = atlas.frames[tag!.from]; expect(frame).toBeDefined();
    expect(frame).toMatchObject({ trimmed: false, rotated: false, frame: { w: 64, h: 64 } });
    return frame.frame;
  };
  return { terrain: `data:image/png;base64,${terrain.toString('base64')}`, props: `data:image/png;base64,${props.toString('base64')}`, cabinet: prop('scroll-cabinet'), window: prop('lattice-window') };
}

/** Fixed independent first-room oracle, pinned after the final task-26 layout read.
 * Do not import the runtime Plan/binding as the expected answer. Slots below were
 * read from the approved 6-column native sheet: stone-top1/fill4/ledge17/wall22.
 * The window ROI has ONLY wall-quiet beneath it. The cabinet crop starts at x400
 * to exclude the separate column at x384..399. Neither overlaps signs or actors. */
function firstRoomProbes(source: Sources): Probe[] {
  const tile = (slot: number, area: Rect, alpha = 1): Layer => ({ source: 'terrain', frame: { x: slot % 6 * 16, y: Math.floor(slot / 6) * 16, w: 16, h: 16 }, area, repeat: true, alpha });
  const wall = tile(22, { x: 0, y: 0, w: 2880, h: 320 }, 0.18);
  const top = tile(1, { x: 0, y: 320, w: 640, h: 16 });
  const fill = tile(4, { x: 0, y: 336, w: 640, h: 24 });
  const ledge = tile(17, { x: 240, y: 260, w: 110, h: 12 });
  const window: Layer = { source: 'props', frame: source.window, area: { x: 288, y: 112, w: 64, h: 64 }, repeat: false, alpha: 0.22 };
  const cabinet: Layer = { source: 'props', frame: source.cabinet, area: { x: 384, y: 256, w: 64, h: 64 }, repeat: false, alpha: 0.22 };
  return [
    { name: 'stone top begins at exact logical y320', area: { x: 192, y: 320, w: 32, h: 16 }, under: [wall], target: top, minimumEvidence: 400 },
    { name: 'stone fill extends through y359: exact 40px ground', area: { x: 192, y: 336, w: 32, h: 24 }, under: [wall], target: fill, minimumEvidence: 600 },
    { name: 'native timber ledge x240..349/y260..271: 110x12', area: { x: 240, y: 260, w: 110, h: 12 }, under: [wall], target: ledge, minimumEvidence: 500 },
    { name: 'native lattice-window motif over quiet wall', area: { x: 288, y: 112, w: 64, h: 64 }, under: [wall], target: window, minimumEvidence: 120 },
    { name: 'native cabinet motif and grounded foot at y319', area: { x: 400, y: 272, w: 32, h: 48 }, under: [wall], target: cabinet, minimumEvidence: 120 },
    { name: 'no ground extension above y320', area: { x: 192, y: 319, w: 32, h: 1 }, under: [wall], target: null, minimumEvidence: 0 },
    { name: 'no ledge ink above y260', area: { x: 240, y: 259, w: 110, h: 1 }, under: [wall], target: null, minimumEvidence: 0 },
    { name: 'no ledge ink below its 12px body', area: { x: 240, y: 272, w: 110, h: 1 }, under: [wall], target: null, minimumEvidence: 0 },
    { name: 'exact ledge left edge', area: { x: 239, y: 260, w: 1, h: 12 }, under: [wall], target: null, minimumEvidence: 0 },
    { name: 'exact ledge right edge', area: { x: 350, y: 260, w: 1, h: 12 }, under: [wall], target: null, minimumEvidence: 0 },
    { name: 'the next teaching sentence waits until it fits, not a clipped fragment', area: { x: 540, y: 124, w: 100, h: 30 }, under: [wall], target: null, minimumEvidence: 0 },
  ];
}

/** Canvas-only capture avoids the genuine pause dialog without hiding or changing it.
 * Read once after a REAL animation frame, so an unpreserved cleared WebGL buffer fails. */
async function nativeFrame(page: Page) {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) { reject(new Error('Missing actual game canvas')); return; }
      if (canvas.width !== 640 || canvas.height !== 360) { reject(new Error(`Unexpected logical canvas ${canvas.width}x${canvas.height}`)); return; }
      resolve(canvas.toDataURL('image/png'));
    });
  }));
}

/** Compare fixed local ROIs with the actual PNG texels, including alpha composition.
 * Evidence counts ONLY texels distinguishable from the background: a transparent RT
 * or flat Graphics cannot pass just because the untouched canvas is opaque. */
async function inspectPixels(page: Page, capture: string, source: Sources, probes: Probe[]) {
  return page.evaluate(async ({ capture, source, probes }) => {
    async function decode(url: string) {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); if (!context) throw new Error('No pixel reader');
      context.imageSmoothingEnabled = false; context.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, bytes: context.getImageData(0, 0, canvas.width, canvas.height).data };
    }
    const [actual, terrain, props] = await Promise.all([decode(capture), decode(source.terrain), decode(source.props)]);
    if (actual.width !== 640 || actual.height !== 360 || terrain.width !== 96 || terrain.height !== 96 || props.width !== 512 || props.height !== 64) throw new Error('Unexpected native/source image dimensions');
    const pixel = (image: typeof actual, x: number, y: number) => {
      const at = (y * image.width + x) * 4;
      return [image.bytes[at], image.bytes[at + 1], image.bytes[at + 2], image.bytes[at + 3]];
    };
    const distance = (a: number[], b: number[]) => Math.max(...a.slice(0, 3).map((channel, index) => Math.abs(channel - b[index])));
    const contains = (rect: Rect, x: number, y: number) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
    function composite(base: number[], layer: Layer, x: number, y: number) {
      if (!contains(layer.area, x, y)) return base;
      const dx = x - layer.area.x, dy = y - layer.area.y;
      const sx = layer.frame.x + (layer.repeat ? dx % layer.frame.w : dx);
      const sy = layer.frame.y + (layer.repeat ? dy % layer.frame.h : dy);
      const color = pixel(layer.source === 'terrain' ? terrain : props, sx, sy), alpha = color[3] / 255 * layer.alpha;
      return base.map((value, channel) => channel === 3 ? 255 : Math.round(value * (1 - alpha) + color[channel] * alpha));
    }
    let opaque = 0;
    for (let i = 3; i < actual.bytes.length; i += 4) if (actual.bytes[i] === 255) opaque++;
    const results: ProbeResult[] = probes.map(probe => {
      let matched = 0, evidence = 0, evidenceMatched = 0, absentMatched = 0, checksum = 2166136261;
      const colors = new Set<string>();
      for (let y = probe.area.y; y < probe.area.y + probe.area.h; y++) for (let x = probe.area.x; x < probe.area.x + probe.area.w; x++) {
        let base = [15, 25, 27, 255];
        for (const layer of probe.under) base = composite(base, layer, x, y);
        const expected = probe.target ? composite(base, probe.target, x, y) : base, got = pixel(actual, x, y);
        const matches = got[3] === 255 && distance(got, expected) <= 2;
        if (matches) matched++;
        for (const value of got) checksum = Math.imul(checksum ^ value, 16777619) >>> 0;
        if (probe.target && distance(base, expected) >= 6) {
          evidence++; colors.add(expected.slice(0, 3).join(','));
          if (matches) evidenceMatched++;
          if (got[3] === 255 && distance(got, base) <= 2) absentMatched++;
        }
      }
      return { name: probe.name, pixels: probe.area.w * probe.area.h, matched, evidence, evidenceMatched, absentMatched, colors: colors.size, checksum };
    });
    return { opaqueRatio: opaque / (actual.width * actual.height), results };
  }, { capture, source, probes });
}
function assertPixels(report: Awaited<ReturnType<typeof inspectPixels>>, probes: Probe[]) {
  expect(report.opaqueRatio, 'the actual WebGL buffer, not a blank/unpreserved capture').toBeGreaterThan(0.99);
  for (const [index, result] of report.results.entries()) {
    expect(result.matched / result.pixels, `${result.name}: source texel/location/alpha match`).toBeGreaterThanOrEqual(0.98);
    if (!probes[index].target) continue;
    expect(result.evidence, `${result.name}: non-background positive-control texels`).toBeGreaterThanOrEqual(probes[index].minimumEvidence);
    expect(result.colors, `${result.name}: source-specific multicolor motif, not a flat rectangle`).toBeGreaterThanOrEqual(3);
    expect(result.evidenceMatched / result.evidence, `${result.name}: positive-control agreement`).toBeGreaterThanOrEqual(0.98);
    expect(result.absentMatched / result.evidence, `${result.name}: reject missing native layer`).toBeLessThan(0.05);
  }
}
async function attachFrame(info: TestInfo, name: string, capture: string, report: Awaited<ReturnType<typeof inspectPixels>>) {
  const imagePath = info.outputPath(name), evidencePath = info.outputPath(`${name}-local-pixel-evidence.json`);
  await writeFile(imagePath, Buffer.from(capture.split(',')[1], 'base64'));
  await writeFile(evidencePath, JSON.stringify(report, null, 2));
  await info.attach(name, { path: imagePath, contentType: 'image/png' });
  await info.attach(`${name}-local-pixel-evidence`, { path: evidencePath, contentType: 'application/json' });
}

async function attachUi(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name); await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}
async function fullWindow(page: Page) {
  const dimensions = await page.evaluate(() => {
    const root = document.querySelector('.game-shell'), canvas = document.querySelector('canvas');
    if (!root || !canvas) throw new Error('Missing real game shell/canvas');
    const rect = (element: Element) => { const value = element.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height }; };
    return { root: rect(root), canvas: rect(canvas), window: [innerWidth, innerHeight], backing: [canvas.width, canvas.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
  });
  expect(dimensions.window).toEqual([1280, 720]); expect(dimensions.backing).toEqual([640, 360]);
  expect(dimensions.root).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  expect(dimensions.canvas).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  expect(dimensions.scroll).toEqual([1280, 720]);
  await expect(page.locator('canvas')).toHaveCount(1);
}
async function pausedFirstRoom(page: Page, info: TestInfo) {
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/');
  await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  await expect(page.locator('.hud-cell')).toHaveCount(4);
  await attachUi(page, info, 'environment-playing-real-ui.png');
  await expect.poll(() => page.locator('.hud-cell').last().innerText()).not.toContain('00:00');
  // An ordinary fresh first-room rendering slice, NOT a claimed chapter playthrough.
  // No movement, aim or gameplay state is injected; the initial camera is at the authored entrance.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '暂停前向传播。', exact: true })).toBeVisible();
  await fullWindow(page);
}

test('first room renders source-specific terrain, a 12px ledge and native props in the full-window stage', async ({ page }, info) => {
  const observed = watch(page), source = await sources();
  await pausedFirstRoom(page, info);
  const probes = firstRoomProbes(source), capture = await nativeFrame(page), report = await inspectPixels(page, capture, source, probes);
  await attachFrame(info, 'environment-first-room-native.png', capture, report);
  assertPixels(report, probes);
  expect([...observed.loaded].sort()).toEqual([...RESOURCE_PATHS].sort());
  await attachUi(page, info, 'environment-first-room-real-ui.png');
  expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
});

test('actual WebGL loss and restore preserve paused counters and both native terrain and prop pixels', async ({ page }, info) => {
  test.setTimeout(45000);
  const observed = watch(page), source = await sources();
  await pausedFirstRoom(page, info);
  const probes = firstRoomProbes(source), beforeCapture = await nativeFrame(page), before = await inspectPixels(page, beforeCapture, source, probes);
  await attachFrame(info, 'environment-before-native-context-loss.png', beforeCapture, before);
  assertPixels(before, probes);
  const counters = await page.locator('.hud-cell').allTextContents(), checkpoint = await storedSave(page);
  expect(checkpoint).not.toBeNull(); expect(isGameSave(JSON.parse(checkpoint!))).toBe(true);
  await page.waitForTimeout(400);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(counters);

  // Retain ONLY real DOM/WebGL objects through a JSHandle. No global engine handle,
  // private World lookup, fake context-restored event or replacement renderer.
  const native = await page.evaluateHandle(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!canvas || !gl || !extension) throw new Error('Expected the real WEBGL_lose_context extension');
    const events: string[] = [];
    const onLost = () => { events.push('lost'); };
    const onRestored = () => { events.push('restored'); };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return { canvas, gl, extension, events, onLost, onRestored };
  });
  try {
    expect(await native.evaluate(value => value.gl.isContextLost())).toBe(false);
    await native.evaluate(value => value.extension.loseContext());
    await expect.poll(() => native.evaluate(value => ({ events: [...value.events], lost: value.gl.isContextLost() })), { timeout: 10000 }).toEqual({ events: ['lost'], lost: true });
    const pause = page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
    await expect(pause).toBeVisible(); expect(await page.locator('.hud-cell').allTextContents()).toEqual(counters);
    expect(await storedSave(page)).toBe(checkpoint);
    await native.evaluate(value => value.extension.restoreContext());
    await expect.poll(() => native.evaluate(value => ({ events: [...value.events], lost: value.gl.isContextLost() })), { timeout: 15000 }).toEqual({ events: ['lost', 'restored'], lost: false });
    expect(await native.evaluate(value => value.canvas === document.querySelector('canvas') && value.canvas.isConnected)).toBe(true);
    await expect(pause).toBeVisible(); await fullWindow(page);
    const afterCapture = await nativeFrame(page), after = await inspectPixels(page, afterCapture, source, probes);
    await attachFrame(info, 'environment-paused-native-context-restored.png', afterCapture, after);
    // Both sides must match native source motifs. Equal empty/transparent buffers cannot pass.
    assertPixels(after, probes);
    expect(after.results.map(result => [result.name, result.checksum])).toEqual(before.results.map(result => [result.name, result.checksum]));
    await page.waitForTimeout(400);
    expect(await page.locator('.hud-cell').allTextContents()).toEqual(counters); expect(await storedSave(page)).toBe(checkpoint);
    await info.attach('environment-real-context-events', { body: JSON.stringify(await native.evaluate(value => value.events)), contentType: 'application/json' });
    await attachUi(page, info, 'environment-restored-real-pause-ui.png');
    await pause.getByRole('button', { name: '继续训练', exact: true }).click(); await expect(pause).toHaveCount(0);
    await expect.poll(() => page.locator('.hud-cell').last().textContent()).not.toBe(counters[counters.length - 1]);
    expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  } finally {
    await native.evaluate(value => {
      value.canvas.removeEventListener('webglcontextlost', value.onLost);
      value.canvas.removeEventListener('webglcontextrestored', value.onRestored);
      if (value.gl.isContextLost()) value.extension.restoreContext();
    });
    await native.dispose();
  }
});

for (const resource of ['/game/chapter-one-terrain.png', '/game/chapter-one-props.json'] as const) {
  test(`missing formal environment ${resource.endsWith('.png') ? 'PNG' : 'atlas'} is explicit and preserves the checkpoint through retry`, async ({ page }) => {
    // Supported persisted-resource fixture, NOT a fresh journey or a combat result.
    const original: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 1, elapsedMs: 10000, score: 77, tokens: 31 };
    expect(isGameSave(original)).toBe(true);
    const observed = watch(page), pattern = `**${resource}*`; let intercepted = 0;
    const abort = async (route: Route) => { intercepted++; await route.abort('failed'); };
    await page.route(pattern, abort);
    await page.addInitScript(value => {
      // Seed this fixture once per test tab, not on retry; even deletion of the
      // checkpoint during reload must remain visible to the preservation assertion.
      const seeded = 'pdoom.environment-resource-fixture.seeded';
      if (sessionStorage.getItem(seeded) === null) {
        sessionStorage.setItem(seeded, '1');
        if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(value));
      }
    }, original);
    await page.goto('/');
    const alert = page.getByRole('alert', { name: '游戏资源加载失败', exact: true });
    await expect(alert).toContainText('第一章地形与场景资源加载失败', { timeout: 15000 });
    await expect(alert).toContainText('本地检查点未改动');
    await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
    await expect(page.getByRole('region', { name: '本局成绩上传', exact: true })).toHaveCount(0);
    expect(intercepted).toBeGreaterThan(0); expect(await storedSave(page)).toBe(JSON.stringify(original));
    expect(observed.writes).toEqual([]);
    await page.unroute(pattern, abort);
    const response = page.waitForResponse(value => new URL(value.url()).pathname === resource && value.status() === 200);
    await alert.getByRole('button', { name: '刷新并重试', exact: true }).click(); await response;
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeEnabled();
    await expect(alert).toHaveCount(0); await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByRole('region', { name: '本局成绩上传', exact: true })).toHaveCount(0);
    // Explicit retry only, no restore/new-run click and no automatic score upload.
    expect(await storedSave(page)).toBe(JSON.stringify(original));
    expect([...observed.loaded].sort()).toEqual([...RESOURCE_PATHS].sort());
    expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  });
}

test('a normal checkpoint approach preserves both halves of the native window across the2560 texture seam', async ({ page }, info) => {
  test.setTimeout(45000);
  // Supported checkpoint fixture, not a claimed fresh chapter traversal.
  const original: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 2, elapsedMs: 10000 };
  const observed = watch(page), source = await sources();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), original);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await assertCheckpointAttempt(page, original);
  // Ordinary keyboard input enters the real arena; the authored camera then settles at2240.
  try { await page.keyboard.down('d'); await page.waitForTimeout(450); } finally { await page.keyboard.up('d'); }
  const wall: Layer = { source: 'terrain', frame: { x: 64, y: 48, w: 16, h: 16 }, area: { x: -2240, y: 0, w: 2880, h: 320 }, repeat: true, alpha: 0.18 };
  const window: Layer = { source: 'props', frame: source.window, area: { x: 304, y: 128, w: 64, h: 64 }, repeat: false, alpha: 0.22 };
  const probes: Probe[] = [
    { name: 'native window left16px before world2560', area: { x: 304, y: 128, w: 16, h: 64 }, under: [wall], target: window, minimumEvidence: 60 },
    { name: 'native window right48px after world2560', area: { x: 320, y: 128, w: 48, h: 64 }, under: [wall], target: window, minimumEvidence: 100 },
  ];
  await expect.poll(async () => {
    const report = await inspectPixels(page, await nativeFrame(page), source, probes);
    return Math.min(...report.results.map(result => result.matched / result.pixels));
  }, { timeout: 5000, intervals: [60, 100, 150] }).toBeGreaterThanOrEqual(0.98);
  await attachUi(page, info, 'environment-arena-playing-real-ui.png');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '暂停前向传播。', exact: true })).toBeVisible();
  const capture = await nativeFrame(page), report = await inspectPixels(page, capture, source, probes);
  await attachFrame(info, 'environment-arena-window-seam-native.png', capture, report);
  assertPixels(report, probes); await fullWindow(page);
  expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
});
