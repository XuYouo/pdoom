import { expect, test, type Page } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';

const saved: GameSaveData = {
  ...createRun('4ddf9c9e-1faa-4826-a512-a7e53805f379', 42),
  stage: 2, checkpoint: 11, hp: 68, doom: 42.4, tokens: 123, score: 4200, elapsedMs: 182000,
};
const primarySave = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
async function selectSave(page: Page, save: GameSaveData) {
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), save);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeEnabled();
}

test('a first run starts directly without a replacement confirmation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.game-canvas canvas')).toBeFocused();
  expect(JSON.parse((await primarySave(page))!)).toMatchObject({ stage: 1, checkpoint: 0 });
});

test('cancel and Escape preserve a real selected checkpoint; only explicit replacement starts a new run', async ({ page }, info) => {
  await selectSave(page, saved);
  const original = await primarySave(page);
  const start = page.getByRole('button', { name: '开始新训练', exact: true });
  await start.click();
  const dialog = page.getByRole('dialog', { name: '开始新的训练？', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '保留当前进度', exact: true })).toBeFocused();
  await expect(dialog).toContainText('回形针无尽工厂');
  await expect(dialog).toContainText('安全休息室 01');
  await expect(dialog).toContainText('03:02');
  await expect(dialog).toContainText('4,200');
  expect(await primarySave(page)).toBe(original);
  await page.screenshot({ path: info.outputPath('checkpoint-replacement-confirmation.png') });
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(start).toBeFocused();
  expect(await primarySave(page)).toBe(original);
  await start.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(start).toBeFocused();
  expect(await primarySave(page)).toBe(original);
  await start.click();
  await dialog.getByRole('button', { name: '替换并开始新训练', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.title-menu')).toHaveCount(0);
  await expect(page.locator('.game-canvas canvas')).toBeFocused();
  const replacement = JSON.parse((await primarySave(page))!);
  expect(replacement).toMatchObject({ stage: 1, checkpoint: 0, elapsedMs: 0, score: 0, doom: 8 });
  expect(replacement.runId).not.toBe(saved.runId);
});

test('a completed outcome remains replayable after declining a new run', async ({ page }) => {
  await selectSave(page, { ...saved, stage: 5, checkpoint: 90 });
  const original = await primarySave(page);
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '开始新的训练？', exact: true });
  await expect(dialog).toContainText('当前结局将无法再从本地回看');
  await expect(dialog).toContainText('已完成 · 可回看结局');
  await dialog.getByRole('button', { name: '保留当前进度', exact: true }).click();
  expect(await primarySave(page)).toBe(original);
  await page.getByRole('button', { name: '回看结局', exact: true }).click();
  const ending = page.getByRole('dialog', { name: '最终结局', exact: true });
  await expect(ending).toBeVisible();
  expect(await primarySave(page)).toBe(original);
  const restart = ending.getByRole('button', { name: '开始新训练', exact: true });
  await restart.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(restart).toBeFocused();
  await expect(ending.getByRole('button', { name: '跳过演出 / 查看结算', exact: true })).toBeVisible();
  await expect(ending.getByLabel('最终结算')).toHaveCount(0);
  expect(await primarySave(page)).toBe(original);
  await restart.click();
  await dialog.getByRole('button', { name: '替换并开始新训练', exact: true }).click();
  await expect(ending).toHaveCount(0);
  await expect(page.locator('.game-canvas canvas')).toBeFocused();
  expect(JSON.parse((await primarySave(page))!)).toMatchObject({ stage: 1, checkpoint: 0 });
});

test('replacement confirmation stays reachable in short landscape and portrait', async ({ page }, info) => {
  await selectSave(page, saved);
  for (const [width, height] of [[844, 390], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: '开始新训练', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '开始新的训练？', exact: true });
    const cancel = dialog.getByRole('button', { name: '保留当前进度', exact: true });
    await expect(cancel).toBeFocused();
    await dialog.getByRole('button', { name: '替换并开始新训练', exact: true }).scrollIntoViewIfNeeded();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: info.outputPath(`replacement-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});
