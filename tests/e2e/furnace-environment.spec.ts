import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { furnaceSource, furnaceFrames, inspectFurnace, type FurnaceCapture, type FurnaceView } from './furnace-pixels';

// Legal rendering/checkpoint slices, never a fresh continuous chapter journey.
const RESOURCES = ['/game/furnace-terrain.png', '/game/furnace-props.png', '/game/furnace-props.json'];
const paused = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
function watch(page: Page) {
  const errors: string[] = [], writes: string[] = [], loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.method() + ' ' + request.url());
  });
  page.on('response', response => { const path = new URL(response.url()).pathname; if (response.status() === 200 && RESOURCES.includes(path)) loaded.add(path); });
  return { errors, writes, loaded };
}
async function fixture(page: Page, checkpoint = 0) {
  const save = { ...createRun(randomUUID(), 42), stage: 3, checkpoint, hp: 100, tokens: 200, donated: true, elapsedMs: 20000 };
  expect(isGameSave(save)).toBe(true);
  await page.addInitScript(value => {
    const marker = 'furnace-environment.fixture.' + value.runId;
    if (!sessionStorage.getItem(marker)) { sessionStorage.setItem(marker, 'once'); localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); }
  }, save);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/'); return save;
}
async function attach(info: TestInfo, name: string, capture: FurnaceCapture, report?: unknown) {
  const path = info.outputPath(name + '.png'); await writeFile(path, Buffer.from(capture.png.split(',')[1], 'base64'));
  await info.attach(name, { path, contentType: 'image/png' });
  if (report !== undefined) { const json = info.outputPath(name + '.json'); await writeFile(json, JSON.stringify(report, null, 2)); await info.attach(name + '-pixels', { path: json, contentType: 'application/json' }); }
}
function assertNative(view: FurnaceView) {
  expect(view.rackPixels).toBeGreaterThan(1000);
  const complete = view.racks.filter(rack => rack.full); expect(complete.length).toBeGreaterThan(0);
  for (const rack of complete) { expect(rack.ratio).toBeGreaterThanOrEqual(0.98); expect(rack.pixels).toBeGreaterThanOrEqual(2700); }
  expect(view.floorY, 'same-frame actual native floor, not a fixed320 fallback').not.toBeNull(); expect(view.floorPixels).toBeGreaterThanOrEqual(500);
  expect(view.lift, 'actual complete120x12 source skin, not pole or static background').not.toBeNull();
  expect(view.lift!.ratio).toBeGreaterThanOrEqual(0.98); expect(view.lift!.ink).toBeGreaterThanOrEqual(1000);
  expect([view.lift!.width, view.lift!.height]).toEqual([120, 12]); expect(view.lift!.right - view.lift!.x).toBe(120);
}
const stable = (view: FurnaceView) => ({ rackPixels: view.rackPixels, racks: view.racks, floorY: view.floorY, floorPixels: view.floorPixels, lift: view.lift });

test('native furnace backdrop, exact ground and real lift survive paused WebGL restoration', async ({ page }, info) => {
  test.setTimeout(90000);
  const observed = watch(page), source = await furnaceSource(), original = await fixture(page);
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await assertCheckpointAttempt(page, original);
  // Ordinary movement brings the full physical lift into view; no camera or World hooks.
  await page.keyboard.down('j'); await page.keyboard.down('d'); await page.waitForTimeout(1600);
  await page.keyboard.up('d'); await page.keyboard.up('j'); await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
  const dimensions = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!, shell = document.querySelector('.game-shell')!;
    const c = canvas.getBoundingClientRect(), s = shell.getBoundingClientRect();
    return { canvas: [c.x, c.y, c.width, c.height], shell: [s.x, s.y, s.width, s.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
  });
  expect(dimensions).toEqual({ canvas: [0, 0, 1280, 720], shell: [0, 0, 1280, 720], scroll: [1280, 720] });
  const capture = (await furnaceFrames(page))[0], before = (await inspectFurnace(page, [capture], source))[0];
  await attach(info, 'furnace-paused-source-native', capture, before); assertNative(before);
  const hud = await page.locator('.hud-cell').allTextContents(); expect(hud).toHaveLength(4);
  const saved = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  await page.waitForTimeout(700);
  expect((await furnaceFrames(page))[0].png).toBe(capture.png);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud); expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(saved);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const canvas = document.querySelector('canvas'); if (!canvas) { reject(Error('Missing actual game canvas')); return; }
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context'); if (!extension) { reject(Error('Missing real context-loss extension')); return; }
    const timeout = setTimeout(() => reject(Error('Real context did not restore')), 10000);
    canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timeout); resolve(); }, { once: true });
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 180);
  }));
  const restored = (await furnaceFrames(page))[0], after = (await inspectFurnace(page, [restored], source))[0];
  await attach(info, 'furnace-restored-while-paused-native', restored, after); assertNative(after);
  expect(stable(after), 'owned caches replay without a Core tick').toEqual(stable(before)); expect(restored.png).toBe(capture.png);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud); expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(saved);
  await page.screenshot({ path: info.outputPath('furnace-real-paused-ui.png') });
  await paused(page).getByRole('button', { name: '继续训练', exact: true }).click(); await expect(paused(page)).toBeHidden();
  await page.waitForTimeout(350);
  const resumed = (await furnaceFrames(page))[0], moving = (await inspectFurnace(page, [resumed], source))[0];
  await attach(info, 'furnace-real-resumed-lift-native', resumed, moving); assertNative(moving);
  expect(Math.abs(moving.lift!.y - before.lift!.y), 'real lift movement resumes instead of an independent animation').toBeGreaterThan(2);
  // TIME is displayed in whole seconds; observe a real HUD tick, not a350ms display change.
  await expect.poll(() => page.locator('.hud-cell').allTextContents(), { timeout: 2500 }).not.toEqual(hud);
  await page.screenshot({ path: info.outputPath('furnace-real-playing-ui.png') });
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
  expect([...observed.loaded].sort()).toEqual([...RESOURCES].sort()); expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  await expect(page.locator('canvas')).toHaveCount(1);
});

for (const defect of ['missing-unused-frame', 'wrong-unused-dimensions', 'wrong-unused-cut'] as const) {
  test(`furnace readiness refuses ${defect} without changing the saved run`, async ({ page }) => {
    const observed = watch(page);
    await page.route('**/game/furnace-props.json', async route => {
      const response = await route.fetch();
      const atlas = await response.json() as { frames: { frame: { x: number; y: number; w: number; h: number } }[] };
      if (defect === 'missing-unused-frame') atlas.frames.splice(5, 1);
      else if (defect === 'wrong-unused-dimensions') atlas.frames[5].frame.w = 63;
      else atlas.frames[5].frame.x = 256;
      await route.fulfill({ response, json: atlas });
    });
    const original = await fixture(page);
    await expect(page.getByLabel('游戏资源加载失败', { exact: true }).getByText('大炼丹炉环境资源加载失败。请检查网络后刷新页面；本地检查点未改动。', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(original);
    expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  });
}

test('native furnace skin preserves the three real heat phases and their paused state', async ({ page }, info) => {
  test.setTimeout(60000);
  const observed = watch(page), source = await furnaceSource(), original = await fixture(page, 1);
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click(); await assertCheckpointAttempt(page, original);
  const captures = await furnaceFrames(page, 4000);
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
  const phases = await page.evaluate(async frames => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext('2d'); if (!context) throw Error('Missing independent PNG decoder');
    const rows: { index: number; cool: number; tell: number; active: number }[] = [];
    for (let index = 0; index < frames.length; index += 4) {
      const image = new Image(); image.src = frames[index].png; await image.decode();
      if (image.naturalWidth !== 640 || image.naturalHeight !== 360) throw Error('Wrong native capture size');
      context.clearRect(0, 0, 640, 360); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, 640, 360).data, counts = { index, cool: 0, tell: 0, active: 0 };
      // Actual opaque Core warning borders/hatching, not a state flag or fitted tint.
      for (let y = 298; y < 320; y++) for (let x = 400; x < 640; x++) {
        const at = (y * 640 + x) * 4, color = pixels[at] * 65536 + pixels[at + 1] * 256 + pixels[at + 2];
        if (pixels[at + 3] !== 255) continue;
        if (color === 0x62876c) counts.cool++;
        else if (color === 0xe9c879) counts.tell++;
        else if (color === 0xe68a5b) counts.active++;
      }
      rows.push(counts);
    }
    return rows;
  }, captures);
  for (const phase of ['cool', 'tell', 'active'] as const) {
    const witness = phases.find(row => row[phase] >= (phase === 'cool' ? 60 : 80));
    expect(witness, `real ${phase} heat projection appears in the captured cycle`).toBeDefined();
    const capture = captures[witness!.index], view = (await inspectFurnace(page, [capture], source))[0];
    expect(view.rackPixels).toBeGreaterThan(1000); expect(view.floorY).not.toBeNull(); expect(view.floorPixels).toBeGreaterThanOrEqual(500);
    expect(view.lift).toBeNull();
    await attach(info, `furnace-real-heat-${phase}-native`, capture, { pixels: witness, environment: view });
  }
  const frozen = (await furnaceFrames(page))[0], hud = await page.locator('.hud-cell').allTextContents();
  const saved = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  await page.waitForTimeout(700); expect((await furnaceFrames(page))[0].png).toBe(frozen.png);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud); expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(saved);
  expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
});
