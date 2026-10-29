import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';

for (const [form, doom] of [['aligned', 8], ['masked', 60], ['foom', 85]] as const) {
  test(`the SVG-based ${form} Clawd loads real atlases and renders in the running scene`, async ({ page }) => {
    const errors: string[] = [];
    const failedAssets: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().includes('/game/clawd-') && response.status() >= 400) failedAssets.push(response.url());
    });
    // Closed checkpoint 2 is a naturally safe pose-inspection location. No invincibility/kill debug hook.
    // This fixture verifies presentation, not natural completion of the chapter.
    const save = { ...createRun(randomUUID(), 42), checkpoint: 2, doom, elapsedMs: 10000 };
    await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), save);
    await page.goto('/');
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
    await expect.poll(async () => {
      const clock = /(\d+):(\d{2})/.exec(await page.locator('.hud-cell').last().innerText());
      return clock ? Number(clock[1]) * 60 + Number(clock[2]) : 0;
    }).toBeGreaterThanOrEqual(11);
    // The one-second spawn blink has ended; no enemies remain before this closed safety point.
    await page.waitForTimeout(300);
    await expect(page.locator('canvas')).toHaveCount(1);
    const screenshot = await page.locator('canvas').screenshot({ path: `artifacts/browser/clawd-${form}-game.png` });
    // Decode the real browser capture offscreen. A loaded but invisible/missing sprite cannot pass.
    const colors = await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const probe = document.createElement('canvas');
      probe.width = image.naturalWidth; probe.height = image.naturalHeight;
      const context = probe.getContext('2d');
      if (!context) throw new Error('Cannot inspect captured pixels');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
      const counts = { orange: 0, mask: 0, tentacle: 0 };
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
        if (r === 217 && g === 119 && b === 87) counts.orange++;
        if (r === 245 && g === 232 && b === 200) counts.mask++;
        if (r === 87 && g === 92 && b === 121) counts.tentacle++;
      }
      return counts;
    }, screenshot.toString('base64'));
    expect(colors.orange).toBeGreaterThan(20);
    if (form !== 'aligned') expect(colors.mask).toBeGreaterThan(20);
    if (form === 'foom') expect(colors.tentacle).toBeGreaterThan(5);
    expect(errors).toEqual([]);
    expect(failedAssets).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: '暂停前向传播。' })).toBeVisible();
  });
}
