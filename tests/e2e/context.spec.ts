import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
});
test.afterEach(async ({ page }) => { expect(errors.get(page) ?? []).toEqual([]); });

const fixture = (patch: Partial<GameSaveData> = {}): GameSaveData => ({
  ...createRun(randomUUID(), 42), checkpoint: 11, hp: 60, tokens: 200, doom: 60, elapsedMs: 12000,
  inventory: ['constitutional', 'recursive', 'residual'], ...patch,
});

async function seedOnce(page: Page, save: GameSaveData, waitForReady = true) {
  // Trace-confirmed SwiftShader cold boot takes ~7s before atlas requests; only boot gets 15s.
  // Functional UI assertions retain Playwright's normal 5s deadline.
  // A legal persisted checkpoint, not a production debug command or a claim of natural chapter completion.
  // The marker is essential: reload must exercise the purchased save, not silently reseed this fixture.
  await page.addInitScript(({ save, marker }) => {
    if (sessionStorage.getItem(marker)) return;
    localStorage.setItem('pdoom.save.v1', JSON.stringify(save));
    sessionStorage.setItem(marker, 'seeded');
  }, { save, marker: `context.fixture.${save.runId}` });
  await page.goto('/');
  if (waitForReady) await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
}
const restDialog = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const contextButton = (page: Page) => page.getByRole('button', { name: '上下文详情', exact: true });
async function resumeCheckpoint(page: Page) {
  const previous = await saved(page);
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await expect(restDialog(page)).toBeVisible();
  return assertCheckpointAttempt(page, previous);
}
async function saved(page: Page): Promise<GameSaveData> {
  const raw = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  if (!raw) throw new Error('The checkpoint was not persisted');
  return JSON.parse(raw) as GameSaveData;
}

test('rest is a frozen native dialog, cannot be dismissed with Escape, and never renders a defeat', async ({ page }) => {
  const uploads: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/savegameapi')) uploads.push(request.url()); });
  await seedOnce(page, fixture());
  await resumeCheckpoint(page);
  const dialog = restDialog(page);
  expect(await dialog.evaluate(node => node instanceof HTMLDialogElement && node.open)).toBe(true);
  await expect(page.getByRole('heading', { name: '这次，梯度归零。' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '本局成绩上传' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '关闭弹窗' })).toHaveCount(0);
  const before = await page.locator('.hud-cell').last().innerText();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.keyboard.down('d');
  await page.keyboard.press('q');
  await page.waitForTimeout(800);
  await page.keyboard.up('d');
  expect(await page.locator('.hud-cell').last().innerText()).toBe(before);
  expect((await saved(page)).elapsedMs).toBe(12000);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))).toBe(true);
  expect(uploads).toHaveLength(0);
  await dialog.screenshot({ path: 'artifacts/browser/context-rest-desktop.png' });
});

test('a purchase deducts once and survives a real reload without granting a fresh rating reward', async ({ page }) => {
  await seedOnce(page, fixture());
  await resumeCheckpoint(page);
  await restDialog(page).getByRole('button', { name: '购买 高温采样', exact: true }).click();
  await expect.poll(async () => (await saved(page)).tokens).toBe(170);
  expect((await saved(page)).inventory).toContain('temperature');
  await expect(restDialog(page).getByRole('button', { name: '购买 高温采样', exact: true })).toBeDisabled();
  await page.reload();
  await resumeCheckpoint(page);
  await expect(restDialog(page)).toContainText('170 TOK');
  expect((await saved(page)).tokens).toBe(170);
  expect((await saved(page)).checkpoint).toBe(11);
  await expect(restDialog(page).getByRole('button', { name: '购买 高温采样', exact: true })).toBeDisabled();
  await restDialog(page).getByRole('button', { name: '不再交易，继续前进' }).click();
  await expect(restDialog(page)).toHaveCount(0);
  expect((await saved(page)).checkpoint).toBe(1);
  // Polling can skip a one-second display value; the contract is that simulation time resumes.
  await expect.poll(async () => {
    const clock = /(\d+):(\d{2})/.exec(await page.locator('.hud-cell').last().innerText());
    return clock ? Number(clock[1]) * 60 + Number(clock[2]) : 0;
  }, { timeout: 8000 }).toBeGreaterThan(12);
});

test('one reward hack and context reordering stay effective after refresh, then the closed room stays closed', async ({ page }) => {
  await seedOnce(page, fixture());
  await resumeCheckpoint(page);
  const dialog = restDialog(page);
  await dialog.getByRole('button', { name: '奖励劫持 梯度校准', exact: true }).click();
  await expect.poll(async () => (await saved(page)).checkpoint).toBe(21);
  expect(await saved(page)).toMatchObject({ tokens: 200, doom: 85, upgrades: ['calibrated'] });
  await expect(dialog.getByRole('button', { name: '奖励劫持 高温采样', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '上移 递归自升级', exact: true }).click();
  const slots = dialog.getByRole('list', { name: '已装备词条顺序' }).getByRole('listitem');
  await expect(slots.first()).toContainText('递归自升级');
  await expect(slots.first()).toContainText('已生效');
  await expect(slots.nth(1)).toContainText('宪法毛线');
  await expect(slots.nth(1)).toContainText('中间迷失');
  expect((await saved(page)).inventory).toEqual(['recursive', 'constitutional', 'residual']);
  await page.reload();
  await resumeCheckpoint(page);
  await expect(restDialog(page)).toContainText('本休息室的奖励劫持已使用');
  await expect(restDialog(page).getByRole('button', { name: '奖励劫持 高温采样', exact: true })).toBeDisabled();
  await expect(restDialog(page).getByRole('list', { name: '已装备词条顺序' }).getByRole('listitem').first()).toContainText('递归自升级');
  await restDialog(page).getByRole('button', { name: '不再交易，继续前进' }).click();
  expect((await saved(page)).checkpoint).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ⅱ PAUSE / 暂停游戏', exact: true })).toBeEnabled();
  await expect(restDialog(page)).toHaveCount(0);
});

test('returning to the menu retains the encoded safe point and context is read-only outside rest', async ({ page }) => {
  await seedOnce(page, fixture({ checkpoint: 21, upgrades: ['calibrated'], doom: 85 }));
  await resumeCheckpoint(page);
  await restDialog(page).getByRole('button', { name: '返回终端并保留检查点', exact: true }).click();
  await expect(restDialog(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始新训练' })).toBeVisible();
  expect((await saved(page)).checkpoint).toBe(21);
  await contextButton(page).click();
  const dialog = page.getByRole('dialog', { name: '上下文窗口 / CONTEXT WINDOW', exact: true });
  await expect(dialog).toContainText('只能在安全休息室调整顺序');
  await expect(dialog.getByRole('button', { name: '上移 递归自升级', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '开始新训练' }).click();
  await contextButton(page).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '下移 宪法毛线', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '暂停前向传播。' })).toBeVisible();
});

test('a 390px rest room has no horizontal overflow and supports real purchasing and continuation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedOnce(page, fixture());
  await resumeCheckpoint(page);
  const dialog = restDialog(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.height).toBeLessThanOrEqual(844);
  await dialog.screenshot({ path: 'artifacts/browser/context-rest-mobile.png' });
  await dialog.getByRole('button', { name: '购买 高温采样', exact: true }).click();
  expect((await saved(page)).tokens).toBe(170);
  await dialog.getByRole('button', { name: '不再交易，继续前进' }).click();
  await expect(dialog).toHaveCount(0);
  expect((await saved(page)).checkpoint).toBe(1);
});

test('a failed character atlas shows an explicit retry and refresh preserves the saved checkpoint', async ({ page }) => {
  const original = fixture({ checkpoint: 21, upgrades: ['calibrated'], doom: 85 });
  const asset = '**/game/clawd-aligned.png*';
  let failures = 0;
  await page.route(asset, async route => { failures += 1; await route.abort('failed'); });
  await seedOnce(page, original, false);
  const alert = page.getByRole('alert', { name: '游戏资源加载失败' });
  await expect(alert).toBeVisible({ timeout: 15000 });
  expect(failures).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '开始新训练' })).toBeDisabled();
  await expect(page.getByText('INITIALIZING TRAINING ENVIRONMENT…')).toHaveCount(0);
  expect(await saved(page)).toEqual(original);
  await page.unroute(asset);
  await alert.getByRole('button', { name: '刷新并重试', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await expect(alert).toHaveCount(0);
  expect(await saved(page)).toEqual(original);
  await resumeCheckpoint(page);
  await expect(restDialog(page)).toContainText('本休息室的奖励劫持已使用');
});

test('real cloud restore exits the old rest world to the menu and loads the selected snapshot only on confirmation', async ({ page }) => {
  test.skip(process.env.PDOOM_E2E_BACKEND !== '1', 'Requires the lead-managed Scala/PostgreSQL test backend.');
  await seedOnce(page, fixture({ checkpoint: 21, upgrades: ['calibrated'], doom: 85 }));
  await resumeCheckpoint(page);
  await restDialog(page).getByRole('button', { name: '返回终端并保留检查点', exact: true }).click();
  await page.getByRole('button', { name: 'LOCAL AGENT' }).click();
  await page.getByRole('button', { name: '注册智能体', exact: true }).click();
  await page.getByLabel('玩家名称').fill(`ctx_${randomUUID().replace(/-/g, '').slice(0, 20)}`);
  await page.getByLabel('密码', { exact: false }).fill('context_fixture_password_2026');
  await page.getByRole('button', { name: '创建智能体' }).click();
  await expect(page.getByText('已认证智能体', { exact: true })).toBeVisible();
  const cloud = fixture({ checkpoint: 12, tokens: 333, doom: 8, inventory: ['constitutional'], upgrades: [] });
  const status = await page.evaluate(async save => {
    const session = JSON.parse(sessionStorage.getItem('pdoom.session.v1') ?? 'null') as { token?: string } | null;
    if (!session?.token) throw new Error('Missing test account session');
    const response = await fetch('/api/savegameapi', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ save, expectedRevision: 0 }) });
    return response.status;
  }, cloud);
  expect(status).toBe(200);
  await page.getByRole('button', { name: '读取云存档', exact: true }).click();
  await expect(page.getByText('云存档已读取，尚未覆盖本地检查点。')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '云端 → 本地', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始新训练' })).toBeVisible();
  await expect(page.getByText('云档已载入本地；选择恢复检查点继续。', { exact: true })).toBeVisible();
  expect(await saved(page)).toMatchObject({ runId: cloud.runId, checkpoint: 12, tokens: 333 });
  await contextButton(page).click();
  await expect(page.getByRole('dialog', { name: '上下文窗口 / CONTEXT WINDOW', exact: true })).toContainText('14K / 32K');
  await page.keyboard.press('Escape');
  const cloudAttempt = await resumeCheckpoint(page);
  await expect(restDialog(page)).toContainText('SAFE ROOM 02');
  await expect(restDialog(page)).toContainText('333 TOK');
  expect((await saved(page)).runId).toBe(cloudAttempt.runId);
});
