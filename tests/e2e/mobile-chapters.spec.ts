import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';

test.use({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

for (const stage of [4, 5]) {
  test(`mobile chapter ${stage}: checkpoint details and chapter controls remain reachable`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    // Public, valid checkpoint slices; this is not a continuous five-chapter playthrough.
    const save = { ...createRun(randomUUID(), 42), stage, elapsedMs: 20000, tokens: 200 };
    expect(isGameSave(save)).toBe(true);
    await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), save);
    await page.goto('/');
    const menuFullscreen = page.getByRole('button', { name: '全屏显示', exact: true });
    const menuTarget = await menuFullscreen.boundingBox();
    expect(menuTarget!.width).toBeGreaterThanOrEqual(44);
    expect(menuTarget!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: '恢复检查点', exact: true }).tap();
    const details = page.locator(stage === 4 ? '.loom-details' : '.omega-details');
    const summary = details.locator('summary');
    await expect(summary).toBeVisible();
    const box = await summary.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(361);
    const reroll = page.getByRole('button', { name: '触屏重掷', exact: true });
    if (stage === 4) {
      await expect(summary).toContainText('分支 A');
      await expect(reroll).toHaveAttribute('aria-disabled', 'false');
      await reroll.tap();
      await expect(summary).toContainText('分支 B');
      await expect(reroll).toHaveAttribute('aria-disabled', 'true');
    } else await expect(reroll).toHaveCount(0);
    await summary.tap();
    await expect(details).toHaveAttribute('open', '');
    await expect(details.getByLabel('展开的状态详情', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`chapter-${stage}-touch-details.png`) });
    await summary.tap();
    await expect(details).not.toHaveAttribute('open', '');
    await page.getByRole('button', { name: '暂停触屏训练', exact: true }).tap();
    const paused = page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
    await expect(paused).toBeVisible();
    await paused.getByRole('button', { name: '音频设置', exact: true }).tap();
    const settings = page.getByRole('dialog', { name: '运行设置 / SETTINGS', exact: true });
    const close = settings.getByRole('button', { name: '关闭弹窗', exact: true });
    const closeTarget = await close.boundingBox();
    expect(closeTarget!.width).toBeGreaterThanOrEqual(44);
    expect(closeTarget!.height).toBeGreaterThanOrEqual(44);
    await close.tap();
    await expect(paused).toBeVisible();
    expect(errors).toEqual([]);
  });
}
