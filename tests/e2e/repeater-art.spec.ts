import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';

/** Relative visible landmarks, not a world/renderer hook; camera translation cancels out. */
async function machinePixels(page: Page, capture: Buffer) {
  return page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const probe = document.createElement('canvas'); probe.width = image.naturalWidth; probe.height = image.naturalHeight;
    const context = probe.getContext('2d'); if (!context) throw new Error('Cannot read actual capture');
    context.drawImage(image, 0, 0);
    const { width, height } = probe, rgba = context.getImageData(0, 0, width, height).data;
    const sx = width / 640, sy = height / 360;
    const metal: { x: number; y: number }[] = [];
    for (let y = Math.floor(270 * sy); y < Math.min(height, 325 * sy); y++) for (let x = Math.floor(400 * sx); x < Math.min(width, 630 * sx); x++) {
      const i = (y * width + x) * 4;
      if (rgba[i] === 133 && rgba[i + 1] === 142 && rgba[i + 2] === 176) metal.push({ x, y });
    }
    if (!metal.length) return { metal: 0, handle: 0, grille: 0, extension: null };
    const top = Math.min(...metal.map(pixel => pixel.y));
    const handle = metal.filter(pixel => pixel.y < top + sy);
    const hx = handle.reduce((sum, pixel) => sum + pixel.x, 0) / handle.length;
    const hy = handle.reduce((sum, pixel) => sum + pixel.y, 0) / handle.length;
    const grille = metal.filter(pixel => pixel.y >= hy + 18 * sy && pixel.y < hy + 25 * sy && pixel.x < hx + 8 * sx);
    return { metal: metal.length, handle: handle.length, grille: grille.length, extension: grille.length ? (hx - Math.min(...grille.map(pixel => pixel.x))) / sx : null };
  }, capture.toString('base64'));
}

test('the real repeater extends its speaker relative to the rigid handle and freezes on pause', async ({ page }) => {
  const errors: string[] = [], loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 200 && ['/game/repeater.png', '/game/repeater.json'].includes(path)) loaded.add(path);
  });
  // A real supported checkpoint fixture, for art/state inspection only; not a claim of a fresh full-game journey.
  const original = { ...createRun(randomUUID(), 42), checkpoint: 1, elapsedMs: 10000 };
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), original);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  expect([...loaded].sort()).toEqual(['/game/repeater.json', '/game/repeater.png']);
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await assertCheckpointAttempt(page, original);
  const samples: { extension: number; capture: Buffer; metal: number }[] = [];
  for (let index = 0; index < 10; index++) {
    const capture = await page.locator('canvas').screenshot(), pixels = await machinePixels(page, capture);
    expect(pixels.metal).toBeGreaterThan(40); expect(pixels.handle).toBeGreaterThan(8); expect(pixels.grille).toBeGreaterThan(8);
    expect(pixels.extension).not.toBeNull();
    samples.push({ extension: pixels.extension!, capture, metal: pixels.metal });
    await page.waitForTimeout(100);
  }
  samples.sort((a, b) => a.extension - b.extension);
  const closed = samples[0], open = samples[samples.length - 1];
  expect(open.extension - closed.extension).toBeGreaterThan(2.1);
  expect(open.extension - closed.extension).toBeLessThan(4.1);
  await writeFile('artifacts/browser/repeater-tell.png', open.capture);
  await writeFile('artifacts/browser/repeater-recover.png', closed.capture);
  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: '暂停前向传播。' });
  await expect(pause).toBeVisible(); await page.waitForTimeout(250);
  const frozen = await page.locator('canvas').screenshot(), clock = await page.locator('.hud-cell').last().innerText();
  await page.waitForTimeout(450);
  expect(await page.locator('canvas').screenshot()).toEqual(frozen);
  expect(await page.locator('.hud-cell').last().innerText()).toBe(clock);
  await pause.getByRole('button', { name: '继续训练' }).click(); await expect(pause).toHaveCount(0);
  expect(errors).toEqual([]); await expect(page.locator('canvas')).toHaveCount(1);
  console.log('REPEATER_NATIVE_PIXEL_PROOF', { samples: samples.length, closed: closed.extension, open: open.extension, metal: open.metal, pausedPixelsIdentical: true });
});

for (const fault of ['missing-image', 'missing-frame'] as const) {
  test(`repeater ${fault} is explicit and preserves the saved checkpoint through retry`, async ({ page }) => {
    const original = { ...createRun(randomUUID(), 42), checkpoint: 1, score: 77, tokens: 31 };
    const pattern = fault === 'missing-image' ? '**/game/repeater.png*' : '**/game/repeater.json*';
    if (fault === 'missing-image') await page.route(pattern, route => route.abort('failed'));
    else {
      const atlas = JSON.parse(await readFile('public/game/repeater.json', 'utf8')) as { frames: unknown[] };
      await page.route(pattern, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...atlas, frames: atlas.frames.slice(0, 3) }) }));
    }
    await page.addInitScript(value => { if (!localStorage.getItem('pdoom.save.v1')) localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); }, original);
    await page.goto('/');
    const alert = page.getByRole('alert', { name: '游戏资源加载失败' });
    await expect(alert).toContainText('复读机图集加载失败', { timeout: 15000 });
    await expect(page.getByRole('button', { name: '开始新训练' })).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(original);
    await page.unroute(pattern); await alert.getByRole('button', { name: '刷新并重试', exact: true }).click();
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(original);
  });
}
