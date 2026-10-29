import { expect, test } from '@playwright/test';

test('boots once, plays with keyboard, pauses, and restarts cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const start = page.getByRole('button', { name: '开始新训练' });
  await expect(start).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/browser/menu-desktop.png', fullPage: true });
  await start.click();
  await page.keyboard.down('d');
  await page.keyboard.down('j');
  await page.waitForTimeout(1400);
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  await page.keyboard.up('j');
  await expect(page.getByText('00:02', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '暂停前向传播。' })).toBeVisible();
  const time = await page.locator('.hud-cell').last().innerText();
  await page.waitForTimeout(400);
  expect(await page.locator('.hud-cell').last().innerText()).toBe(time);
  await page.screenshot({ path: 'artifacts/browser/paused-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '继续训练' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Ⅱ PAUSE' }).click();
  await page.getByRole('button', { name: '返回终端' }).click();
  await start.click();
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('account inputs work, guide closes by escape, and small screens do not overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始新训练' })).toBeEnabled();
  await page.getByRole('button', { name: 'LOCAL AGENT' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('玩家名称').fill('test_agent');
  await page.getByLabel('密码', { exact: false }).fill('a_long_test_password');
  await expect(page.getByLabel('玩家名称')).toHaveValue('test_agent');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /操作指南/ }).click();
  await expect(page.getByRole('dialog')).toContainText('回溯不是普通闪避');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/browser/menu-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('corrupt local data does not prevent starting a new run', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdoom.save.v1', '{broken'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始新训练' })).toBeEnabled();
  await page.getByRole('button', { name: '开始新训练' }).click();
  const raw = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  expect(JSON.parse(raw ?? '{}').schemaVersion).toBe(1);
});
