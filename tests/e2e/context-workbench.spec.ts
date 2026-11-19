import { expect, test } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';

// Legal persisted safe-room fixtures; interactions use the actual engine and public UI.
// This is not a claim that these checkpoints were reached through natural chapter play.
const original = { ...createRun('f2e15739-20e5-49b1-aa0c-0dad68472a6f', 42), checkpoint: 11, tokens: 100, inventory: ['constitutional', 'recursive', 'residual'] as const };

for (const viewport of [{ name: 'desktop', width: 1440, height: 1080 }, { name: 'portrait', width: 390, height: 844 }, { name: 'short', width: 844, height: 390 }]) {
  test(`context workbench keeps real capacity and keyboard reorder focus at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const save = { ...original, inventory: [...original.inventory] };
    await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), save);
    await page.goto('/');
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByRole('button', { name: '上下文详情', exact: true }).click();
    const context = page.getByRole('dialog', { name: '上下文窗口 / CONTEXT WINDOW', exact: true });
    await expect(context).toContainText('32K / 32K');
    await expect(context.getByRole('meter')).toHaveAttribute('aria-valuetext', '基础技能 8K，遗物 24K；剩余 0K');
    await expect(context.getByRole('button', { name: '上移 递归自升级', exact: true })).toBeDisabled();
    await expect(context.locator('.context-reorder-feedback')).toBeEmpty();
    expect(await context.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `artifacts/ui-workbench-20261107/context-${viewport.name}.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
    const rest = page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
    await expect(rest).toBeVisible();
    const attempt = await assertCheckpointAttempt(page, save);
    const panel = rest.locator('.context-panel');
    const moveUp = panel.getByRole('button', { name: '上移 递归自升级', exact: true });
    await moveUp.focus(); await page.keyboard.press('Enter');
    await expect(panel.getByRole('listitem').first()).toContainText('递归自升级');
    await expect(panel.getByRole('button', { name: '下移 递归自升级', exact: true })).toBeFocused();
    await expect(panel.getByRole('status')).toHaveText('递归自升级已移至第 1 位，已生效。');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual({ ...attempt, inventory: ['recursive', 'constitutional', 'residual'] });
    await page.keyboard.press('Space');
    await expect(panel.getByRole('listitem').nth(1)).toContainText('递归自升级');
    await expect(panel.getByRole('button', { name: '下移 递归自升级', exact: true })).toBeFocused();
    await expect(panel.getByRole('status')).toHaveText('递归自升级已移至第 2 位，中间迷失，仍失活。');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(attempt);
    expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await rest.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `artifacts/ui-workbench-20261107/context-${viewport.name}-reordered.png`, animations: 'disabled' });
  });
}
