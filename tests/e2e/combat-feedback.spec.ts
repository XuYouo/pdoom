import { expect, test } from '@playwright/test';

const feedback = '[data-feedback]';

test('a real early Q explains missing history and its receipt expires with the running game', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  await page.keyboard.press('q');
  const receipt = page.locator(feedback);
  await expect(receipt).toHaveAttribute('data-feedback', 'recording');
  await expect(receipt).toContainText('先行动满 2 秒');
  const q = page.locator('.skill-button').filter({ has: page.locator('kbd', { hasText: /^Q$/ }) });
  await expect(q).toBeDisabled();
  await page.screenshot({ path: info.outputPath('rewind-recording-feedback.png') });
  await expect(q).toBeEnabled();
  await expect(receipt).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('.objective')).toBeVisible();
});

test('actual insight feedback freezes through pause and cannot reappear in a new attempt', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  await page.keyboard.press('e');
  const receipt = page.locator(feedback);
  await expect(receipt).toHaveAttribute('data-feedback', 'insight');
  await expect(receipt).toContainText('透视已开启');
  await page.screenshot({ path: info.outputPath('insight-event-feedback.png') });
  await page.keyboard.press('Escape');
  await expect(receipt).toHaveAttribute('data-feedback', 'insight');
  await page.waitForTimeout(3800);
  await expect(receipt).toHaveAttribute('data-feedback', 'insight');
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas')).toBeFocused();
  await expect(receipt).toHaveAttribute('data-feedback', 'insight');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '返回终端', exact: true }).click();
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  await page.getByRole('dialog', { name: '开始新的训练？', exact: true }).getByRole('button', { name: '替换并开始新训练', exact: true }).click();
  await expect(page.locator('canvas')).toBeFocused();
  await expect(receipt).toHaveCount(0);
  await expect(page.locator('.objective')).toBeVisible();
});
