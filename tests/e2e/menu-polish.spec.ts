import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始新训练', exact: true }).evaluate(element => element.getAnimations().forEach(animation => animation.finish()));
}

test('native Clawd form previews teach risk without changing the saved run', async ({ page }, info) => {
  await ready(page);
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '返回终端', exact: true }).click();
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  const checkpoint = await page.getByLabel('当前检查点摘要').innerText();
  for (const [name, form] of [['面具 > 50%', 'masked'], ['FOOM > 80%', 'foom'], ['对齐 ≤ 50%', 'aligned']]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByLabel('Clawd 形态预览')).toHaveAttribute('data-form', form);
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storage);
    expect(await page.getByLabel('当前检查点摘要').innerText()).toBe(checkpoint);
  }
  await page.screenshot({ path: info.outputPath('saved-checkpoint-menu.png') });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await expect(page.getByRole('meter', { name: '末日概率' })).toHaveAttribute('aria-valuenow', '8');
});

for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
  test(`menu and manual remain reachable at ${width}x${height}`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await ready(page);
    const mainAction = page.getByRole('button', { name: '开始新训练', exact: true });
    const box = await mainAction.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThan(height);
    await page.getByRole('button', { name: 'FOOM > 80%', exact: true }).click();
    await expect(page.getByRole('button', { name: 'FOOM > 80%', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '操作指南', exact: true }).click();
    const guide = page.getByRole('dialog', { name: '操作手册 / FIELD MANUAL' });
    await expect(guide.getByLabel('基础操作')).toBeVisible();
    const rules = guide.locator('details').filter({ hasText: '回溯、透视与 Doom' });
    await rules.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(rules).toHaveAttribute('open', '');
    await expect(rules).toContainText('10 秒免疫');
    await page.keyboard.press('Space');
    await expect(rules).not.toHaveAttribute('open');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const bounds = await guide.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`manual-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '操作指南', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '训练记录', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`menu-${width}.png`) });
    expect(errors).toEqual([]);
  });
}

test('reduced motion removes menu entrances while keeping form controls usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await expect(page.locator('.game-shell')).toHaveAttribute('data-reduced-motion', 'true');
  await page.getByRole('button', { name: 'FOOM > 80%', exact: true }).click();
  expect(await page.locator('.specimen-sprite').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await expect(page.getByLabel('Clawd 形态预览')).toHaveAttribute('data-form', 'foom');
});
