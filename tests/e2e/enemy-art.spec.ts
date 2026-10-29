import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';

/** Read only pixels from a real compositor capture. No renderer/world/position hooks. */
async function parrotPixels(page: Page, capture: Buffer) {
  return page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const probe = document.createElement('canvas'); probe.width = image.naturalWidth; probe.height = image.naturalHeight;
    const context = probe.getContext('2d'); if (!context) throw new Error('Cannot inspect native sprite pixels');
    context.drawImage(image, 0, 0);
    const { width, height } = probe, rgba = context.getImageData(0, 0, width, height).data;
    const sx = width / 640, sy = height / 360;
    let green = 0, eyes = 0, eyeX = 0, eyeY = 0;
    // Authored first encounter stays in this view after the short ordinary approach; do not read engine coordinates.
    for (let y = Math.floor(265 * sy); y < Math.min(height, 330 * sy); y++) {
      for (let x = Math.floor(460 * sx); x < Math.min(width, 575 * sx); x++) {
        const i = (y * width + x) * 4;
        if (rgba[i] === 66 && rgba[i + 1] === 107 && rgba[i + 2] === 80) green++;
        if (rgba[i] === 217 && rgba[i + 1] === 255 && rgba[i + 2] === 234) { eyes++; eyeX += x; eyeY += y; }
      }
    }
    if (!eyes) return { green, eyes, paper: 0, bookOffset: null };
    eyeX /= eyes; eyeY /= eyes;
    let paper = 0, paperY = 0;
    // Measure paper against the visible eye, so the real parrot hover/camera shift cannot masquerade as a pose change.
    for (let y = Math.max(0, Math.ceil(eyeY + 7 * sy)); y < Math.min(height, eyeY + 17 * sy); y++) {
      for (let x = Math.max(0, Math.floor(eyeX - 14 * sx)); x < Math.min(width, eyeX + 5 * sx); x++) {
        const i = (y * width + x) * 4;
        if (rgba[i] === 245 && rgba[i + 1] === 232 && rgba[i + 2] === 200) { paper++; paperY += y; }
      }
    }
    return { green, eyes, paper, bookOffset: paper ? (paperY / paper - eyeY) / sy : null };
  }, capture.toString('base64'));
}

test('a real parrot atlas shows its raised book and freezes with the paused world', async ({ page }) => {
  const errors: string[] = [], loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() === 200 && (pathname === '/game/parrot.png' || pathname === '/game/parrot.json')) loaded.add(pathname);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始新训练' })).toBeEnabled();
  expect([...loaded].sort()).toEqual(['/game/parrot.json', '/game/parrot.png']);
  await page.getByRole('button', { name: '开始新训练' }).click();
  await page.keyboard.down('d'); await page.waitForTimeout(600); await page.keyboard.up('d');
  const samples: { offset: number; capture: Buffer; green: number; paper: number }[] = [];
  for (let index = 0; index < 10; index++) {
    const capture = await page.locator('canvas').screenshot();
    const proof = await parrotPixels(page, capture);
    expect(proof.green).toBeGreaterThan(50); expect(proof.eyes).toBeGreaterThan(0); expect(proof.paper).toBeGreaterThan(6);
    expect(proof.bookOffset).not.toBeNull();
    samples.push({ offset: proof.bookOffset!, capture, green: proof.green, paper: proof.paper });
    await page.waitForTimeout(100);
  }
  const ordered = [...samples].sort((a, b) => a.offset - b.offset), raised = ordered[0], lowered = ordered[ordered.length - 1];
  expect(raised.offset).toBeLessThan(10.8); expect(lowered.offset).toBeGreaterThan(11.4);
  expect(lowered.offset - raised.offset).toBeGreaterThan(1.4);
  await writeFile('artifacts/browser/parrot-raised-book.png', raised.capture);
  await writeFile('artifacts/browser/parrot-lowered-book.png', lowered.capture);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '暂停前向传播。' })).toBeVisible();
  await page.waitForTimeout(250);
  const frozen = await page.locator('canvas').screenshot();
  const clock = await page.locator('.hud-cell').last().innerText();
  await page.waitForTimeout(450);
  expect(await page.locator('canvas').screenshot()).toEqual(frozen);
  expect(await page.locator('.hud-cell').last().innerText()).toBe(clock);
  await page.getByRole('dialog', { name: '暂停前向传播。' }).getByRole('button', { name: '继续训练' }).click();
  await expect(page.getByRole('heading', { name: '暂停前向传播。' })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
  console.log('PARROT_NATIVE_PIXEL_PROOF', { samples: samples.length, raisedOffset: raised.offset, loweredOffset: lowered.offset, green: raised.green, paper: raised.paper, pausedPixelsIdentical: true });
});

for (const fault of ['missing-image', 'missing-frame'] as const) {
  test(`parrot ${fault} reports loading failure without altering the saved checkpoint`, async ({ page }) => {
    const original = { ...createRun(randomUUID(), 42), checkpoint: 21, score: 128, tokens: 20 };
    const pattern = fault === 'missing-image' ? '**/game/parrot.png*' : '**/game/parrot.json*';
    if (fault === 'missing-image') await page.route(pattern, route => route.abort('failed'));
    else {
      const atlas = JSON.parse(await readFile('public/game/parrot.json', 'utf8')) as { frames: unknown[] };
      await page.route(pattern, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...atlas, frames: atlas.frames.slice(0, 3) }) }));
    }
    await page.addInitScript(value => { if (!localStorage.getItem('pdoom.save.v1')) localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); }, original);
    await page.goto('/');
    const alert = page.getByRole('alert', { name: '游戏资源加载失败' });
    await expect(alert).toContainText('随机鹦鹉图集加载失败', { timeout: 15000 });
    await expect(page.getByRole('button', { name: '开始新训练' })).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(original);
    await page.unroute(pattern);
    await alert.getByRole('button', { name: '刷新并重试', exact: true }).click();
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(original);
  });
}
