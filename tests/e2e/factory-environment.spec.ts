import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';

type Rect = { x: number; y: number; w: number; h: number };
type Sources = { terrain: string; props: string; tiles: Record<string, Rect> };
// Legal starting-checkpoint rendering slices, NOT a fresh chapter journey.
// No World/Phaser/debug access, fake clocks, gameplay writes or hidden DOM.
const RESOURCES = ['/game/factory-terrain.png', '/game/factory-props.png', '/game/factory-props.json'];
const pauseDialog = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
function watch(page: Page) {
  const errors: string[] = [], writes: string[] = [], loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.method() + ' ' + request.url());
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 200 && RESOURCES.includes(path)) loaded.add(path);
  });
  return { errors, writes, loaded };
}
async function sources(): Promise<Sources> {
  const [terrain, props, raw] = await Promise.all([
    readFile('public/game/factory-terrain.png'), readFile('public/game/factory-props.png'), readFile('public/game/factory-terrain.json', 'utf8'),
  ]);
  const map = JSON.parse(raw) as { columns: number; tileCount: number; map: { width: number; tiles: number[] } };
  expect(map).toMatchObject({ columns: 6, tileCount: 32, map: { width: 16 } });
  // Authored mother coordinates, not the production binding or plan.
  const rows = [
    ['protected-left', 'protected-middle', 'protected-right', 'protected-fill', 'service-left', 'service-middle', 'service-right', 'service-fill'],
    ['floor-left', 'floor-middle', 'floor-right', 'floor-fill-a', 'floor-fill-b', 'base-left', 'base-middle', 'base-right'],
    ['wall-a', 'wall-b', 'rail', 'rail-joint', 'conduit', 'conduit-elbow', 'vent', 'panel'],
    ['clip-fill-a', 'clip-fill-b', 'clip-fill-c', 'clip-surface-a', 'clip-surface-b', 'wall-left', 'wall-right', 'floor-fill-c'],
  ];
  const tiles: Record<string, Rect> = {};
  rows.forEach((row, y) => row.forEach((name, x) => {
    const slot = map.map.tiles[y * 16 + x] - 1; expect(slot).toBeGreaterThanOrEqual(0); expect(slot).toBeLessThan(32);
    tiles[name] = { x: slot % 6 * 16, y: Math.floor(slot / 6) * 16, w: 16, h: 16 };
  }));
  return { terrain: `data:image/png;base64,${terrain.toString('base64')}`, props: `data:image/png;base64,${props.toString('base64')}`, tiles };
}
async function fixture(page: Page) {
  const save = { ...createRun(randomUUID(), 42), stage: 2, checkpoint: 0, tokens: 200, donated: true, elapsedMs: 20000 };
  expect(isGameSave(save)).toBe(true);
  await page.addInitScript(value => {
    const marker = 'factory-environment.fixture.' + value.runId;
    if (!sessionStorage.getItem(marker)) {
      sessionStorage.setItem(marker, 'once'); localStorage.setItem('pdoom.save.v1', JSON.stringify(value));
    }
  }, save);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/'); return save;
}
async function nativeFrame(page: Page): Promise<string> {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas || canvas.width !== 640 || canvas.height !== 360) { reject(new Error('Expected real640x360 canvas')); return; }
      resolve(canvas.toDataURL('image/png'));
    });
  }));
}
async function attach(info: TestInfo, name: string, capture: string, report?: unknown) {
  const path = info.outputPath(name + '.png'); await writeFile(path, Buffer.from(capture.split(',')[1], 'base64'));
  await info.attach(name, { path, contentType: 'image/png' });
  if (report !== undefined) {
    const json = info.outputPath(name + '.json'); await writeFile(json, JSON.stringify(report, null, 2));
    await info.attach(name + '-pixels', { path: json, contentType: 'application/json' });
  }
}
async function inspect(page: Page, capture: string, source: Sources) {
  return page.evaluate(async ({ capture, source }) => {
    async function decode(url: string) {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); if (!context) throw Error('Missing pixel reader');
      context.imageSmoothingEnabled = false; context.drawImage(image, 0, 0);
      return { w: canvas.width, h: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    }
    const [actual, terrain, props] = await Promise.all([decode(capture), decode(source.terrain), decode(source.props)]);
    if (actual.w !== 640 || actual.h !== 360 || terrain.w !== 96 || terrain.h !== 96 || props.w !== 384 || props.h !== 64) throw Error('Wrong native dimensions');
    const pixel = (image: typeof actual, x: number, y: number) => {
      const i = (y * image.w + x) * 4; return Array.from(image.data.slice(i, i + 4));
    };
    const distance = (a: number[], b: number[]) => Math.max(...a.slice(0, 3).map((v, c) => Math.abs(v - b[c])));
    const equal = (a: number[], b: number[]) => a[3] === 255 && b[3] === 255 && distance(a, b) <= 2;
    const mod = (x: number, n: number) => ((x % n) + n) % n;
    const tile = (name: string, u: number, v: number) => { const r = source.tiles[name]; return pixel(terrain, r.x + mod(u, 16), r.y + mod(v, 16)); };
    const over = (a: number[], b: number[], opacity: number) => { const alpha = b[3] / 255 * opacity; return [0, 1, 2].map(c => Math.round(a[c] * (1 - alpha) + b[c] * alpha)).concat(255); };
    const background = (x: number, y: number) => {
      let color = over([15, 25, 27, 255], tile('wall-a', x, y), 0.16);
      if (x >= 48 && x < 592 && y >= 16 && mod(y - 16, 128) < 96) color = over(color, tile('wall-b', x - 48, y - 16), 0.12);
      return color;
    };
    const rows = (color: number[]) => {
      const found: number[] = [];
      for (let y = 0; y < 360; y++) {
        let count = 0; for (let x = 0; x < 640; x++) if (equal(pixel(actual, x, y), color)) count++;
        if (count >= 600) found.push(y);
      }
      return found;
    };
    const floorRows = rows([144, 198, 176, 255]), seaRows = rows([190, 212, 220, 255]);
    const floor = floorRows[0], sea = seaRows[0];
    if (floor === undefined || sea === undefined) throw Error('Missing visible full-width real floor/sea boundary');
    const cameraY = 1840 - floor;
    let opaque = 0; for (let i = 3; i < actual.data.length; i += 4) if (actual.data[i] === 255) opaque++;
    const check = (name: string, area: Rect, expected: (x: number, y: number, sy: number) => number[], minimum = 0) => {
      if (area.x < 0 || area.y < 0 || area.x + area.w > 640 || area.y + area.h > 360 || area.h <= 0) throw Error('Out of view ROI: ' + name);
      let matched = 0, evidence = 0, evidenceMatched = 0, absentMatched = 0, checksum = 2166136261;
      const colors = new Set<string>();
      for (let sy = area.y; sy < area.y + area.h; sy++) for (let x = area.x; x < area.x + area.w; x++) {
        const y = cameraY + sy, base = background(x, y), want = expected(x, y, sy), got = pixel(actual, x, sy), hit = equal(got, want);
        if (hit) matched++; for (const v of got) checksum = Math.imul(checksum ^ v, 16777619) >>> 0;
        if (minimum && distance(want, base) >= 6) {
          evidence++; colors.add(want.join(',')); if (hit) evidenceMatched++; if (equal(got, base)) absentMatched++;
        }
      }
      return { name, pixels: area.w * area.h, matched, evidence, evidenceMatched, absentMatched, colors: colors.size, checksum, minimum };
    };
    const results = [
      check('start floor one top16 below real three-pixel rule stripe', { x: 192, y: floor + 3, w: 32, h: 13 }, (x, y) => tile('floor-middle', x - 16, y - 1840), 350),
      check('28px floor body ends exactly at world1867', { x: 192, y: floor + 16, w: 32, h: 12 }, (x, y) => tile(x < 208 ? 'floor-fill-b' : 'floor-fill-c', x, y - 1856), 300),
      check('first protected180x12 ledge source including both caps', { x: 150, y: floor - 55 + 3, w: 180, h: 9 }, (x, y) => {
        const name = x < 166 ? 'protected-left' : x >= 314 ? 'protected-right' : 'protected-middle';
        return tile(name, x - (x < 166 ? 150 : x >= 314 ? 314 : 166), y - 1785);
      }, 1200),
      check('thin ledge no ink on row13', { x: 150, y: floor - 55 + 12, w: 180, h: 1 }, background),
      check('thin ledge no ink above', { x: 150, y: floor - 56, w: 180, h: 1 }, background),
      check('thin ledge exact left boundary', { x: 149, y: floor - 52, w: 1, h: 9 }, background),
      check('thin ledge exact right boundary', { x: 330, y: floor - 52, w: 1, h: 9 }, background),
      check('28px ground has no row29', { x: 192, y: floor + 28, w: 32, h: 1 }, background),
      check('native spool in rear dressing excluding the separate right rail', { x: 552, y: 1744 - cameraY, w: 56, h: 64 }, (x, y) => over(background(x, y), pixel(props, x - 552, y - 1744), 0.18), 300),
    ];
    const tops = ['a', 'a', 'b', 'a', 'b', 'b', 'a', 'b'];
    results.push(check('two native sea-surface variants below the actual lethal boundary', { x: 64, y: sea + 4, w: 128, h: 12 }, (x, _y, sy) => tile('clip-surface-' + tops[Math.floor(mod(x, 128) / 16)], x, sy - sea), 1400));
    const fills = ['a', 'b', 'c', 'a', 'c', 'b', 'b', 'a'], shifts = [0, 8, 4, 12];
    const fillHeight = Math.min(32, 360 - sea - 16);
    if (fillHeight < 8) throw Error('Too few actual sea-fill rows; no blank acceptance');
    results.push(check('mixed source-pixel clip mass anchored in world space', { x: 64, y: sea + 16, w: 128, h: fillHeight }, (x, y) => {
      const row = Math.floor(mod(y, 64) / 16), col = Math.floor((mod(x, 128) - shifts[row]) / 16);
      return tile('clip-fill-' + fills[mod(col + row * 3, 8)], x - shifts[row], y);
    }, fillHeight * 100));
    return { opaqueRatio: opaque / (640 * 360), floor, sea, floorRows, seaRows, cameraY, results };
  }, { capture, source });
}
function assertPixels(report: Awaited<ReturnType<typeof inspect>>) {
  expect(report.opaqueRatio).toBeGreaterThan(0.99);
  expect(report.seaRows).toHaveLength(3); expect(report.floorRows).toHaveLength(3);
  for (const r of report.results) {
    expect(r.matched / r.pixels, r.name).toBeGreaterThanOrEqual(0.98);
    if (!r.minimum) continue;
    expect(r.evidence, r.name).toBeGreaterThanOrEqual(r.minimum);
    expect(r.colors, r.name).toBeGreaterThanOrEqual(3);
    expect(r.evidenceMatched / r.evidence, r.name).toBeGreaterThanOrEqual(0.98);
    expect(r.absentMatched / r.evidence, r.name).toBeLessThan(0.05);
  }
}

test('native factory terrain, rear machinery and rising sea survive a real paused WebGL restoration', async ({ page }, info) => {
  test.setTimeout(60000);
  const observed = watch(page), source = await sources(), original = await fixture(page);
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  // Stay at the real starting floor; pause before the ~3s lethal sea budget.
  await page.waitForTimeout(1500); await page.keyboard.press('Escape'); await expect(pauseDialog(page)).toBeVisible();
  await assertCheckpointAttempt(page, original);
  const dimensions = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!, shell = document.querySelector('.game-shell')!;
    const c = canvas.getBoundingClientRect(), s = shell.getBoundingClientRect();
    return { canvas: [c.x, c.y, c.width, c.height], shell: [s.x, s.y, s.width, s.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
  });
  expect(dimensions).toEqual({ canvas: [0, 0, 1280, 720], shell: [0, 0, 1280, 720], scroll: [1280, 720] });
  const capture = await nativeFrame(page); await attach(info, 'factory-paused-source-native', capture);
  const before = await inspect(page, capture, source); await attach(info, 'factory-paused-source-native', capture, before); assertPixels(before);
  const counters = await page.locator('.hud-cell').allTextContents(); expect(counters).toHaveLength(4);
  const saved = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  await page.waitForTimeout(2800);
  const frozen = await nativeFrame(page); expect(frozen, 'normal pause freezes the actual native canvas').toBe(capture);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(counters);
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(saved);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const canvas = document.querySelector('canvas'); if (!canvas) { reject(Error('Missing game canvas')); return; }
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context'); if (!extension) { reject(Error('Missing real context-loss extension')); return; }
    const timeout = setTimeout(() => reject(Error('Real context did not restore')), 10000);
    canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timeout); resolve(); }, { once: true });
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 180);
  }));
  const restored = await nativeFrame(page), after = await inspect(page, restored, source);
  await attach(info, 'factory-restored-while-paused-native', restored, after); assertPixels(after);
  expect(after, 'all measured terrain, prop and both sea caches replay without a Core tick').toEqual(before);
  expect(restored).toBe(capture);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(counters);
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(saved);
  const ui = info.outputPath('factory-real-paused-ui.png'); await page.screenshot({ path: ui }); await info.attach('factory-real-paused-ui', { path: ui, contentType: 'image/png' });
  await pauseDialog(page).getByRole('button', { name: '继续训练', exact: true }).click();
  await page.keyboard.press('q'); // A normal rewind is not immunity to this actual rising sea.
  await expect(page.getByRole('heading', { name: '这次，梯度归零。', exact: true })).toBeVisible({ timeout: 7000 });
  await attach(info, 'factory-real-sea-death-native', await nativeFrame(page));
  expect([...observed.loaded].sort()).toEqual([...RESOURCES].sort());
  expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  await expect(page.locator('canvas')).toHaveCount(1);
});

for (const defect of ['missing-unused-frame', 'wrong-unused-dimensions'] as const) {
  test(`factory readiness refuses ${defect} without changing the saved run`, async ({ page }) => {
    const observed = watch(page);
    await page.route('**/game/factory-props.json', async route => {
      const response = await route.fetch();
      const atlas = await response.json() as { frames: { frame: Rect }[] };
      if (defect === 'missing-unused-frame') atlas.frames.splice(5, 1);
      else atlas.frames[5].frame.w = 63;
      await route.fulfill({ response, json: atlas });
    });
    const original = await fixture(page);
    await expect(page.getByLabel('游戏资源加载失败', { exact: true }).getByText('回形针工厂环境资源加载失败。请检查网络后刷新页面；本地检查点未改动。', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(original);
    expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  });
}
