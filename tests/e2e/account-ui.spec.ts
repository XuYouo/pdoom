import { expect, test, type Page } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';

// UI/contract fixtures only. These tests do not claim a real Scala/PostgreSQL transaction.
const local = { ...createRun('93ba8343-72c5-4911-9938-7a99f941d51c', 42), score: 123, elapsedMs: 1500 };
const cloud = { ...createRun('7ba385be-fc6c-415b-a5e7-8e71d62e2e74', 77), stage: 4, checkpoint: 12, score: 2345, elapsedMs: 42000, hp: 76, doom: 54 };
const auth = { token: 'a'.repeat(43), expiresAt: '2099-01-01T00:00:00Z', user: { id: '15718307-82b0-4401-8b16-b40c68da4124', username: 'player_' + 'a'.repeat(25) } };
const dialog = (page: Page) => page.getByRole('dialog', { name: '智能体账户 / CLOUD TERMINAL', exact: true });
async function setup(page: Page, conflict = false) {
  const uploads: Array<{ expectedRevision: number; save: unknown }> = [];
  let revision = 7;
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), local);
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    let body: unknown;
    if (action === 'loginuserapi' || action === 'registeruserapi') body = auth;
    else if (action === 'getcurrentuserapi') body = { user: auth.user };
    else if (action === 'loadgameapi') body = { save: cloud, revision, updatedAt: '2026-11-06T12:00:00Z' };
    else if (action === 'savegameapi') {
      uploads.push(route.request().postDataJSON() as { expectedRevision: number; save: unknown });
      if (conflict && uploads.length === 1) {
        revision = 8;
        await route.fulfill({ status: 409, json: { code: 'conflict', message: '云端存档已在其他设备更新，请重新读取后再上传。' } }); return;
      }
      revision += 1; body = { revision, updatedAt: '2026-11-07T00:00:00Z' };
    } else if (action === 'logoutuserapi') body = { loggedOut: true };
    else { await route.fulfill({ status: 500, json: {} }); return; }
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: 'LOCAL AGENT / 云存档', exact: true }).click();
  return uploads;
}
async function login(page: Page) {
  await dialog(page).getByLabel('玩家名称', { exact: true }).fill(auth.user.username);
  await dialog(page).getByLabel('密码', { exact: true }).fill('ui_fixture_password_2026');
  await dialog(page).getByRole('button', { name: '建立会话', exact: false }).click();
  await expect(dialog(page).getByText('已认证智能体', { exact: true })).toBeVisible();
}

test('fixture API: keyboard account tabs, read-before-write, cancel and explicit cloud restore', async ({ page }) => {
  const uploads = await setup(page);
  const loginTab = dialog(page).getByRole('tab', { name: '登录', exact: true });
  await loginTab.focus(); await page.keyboard.press('ArrowRight');
  await expect(dialog(page).getByRole('tab', { name: '注册智能体', exact: true })).toBeFocused();
  await expect(dialog(page).getByLabel('密码', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
  await page.keyboard.press('Home'); await expect(loginTab).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: 'artifacts/ui-maturity-20261107/account-login.png' });
  await login(page);
  await expect(dialog(page).getByRole('button', { name: '本地 → 云端', exact: true })).toBeDisabled();
  await expect(dialog(page).getByRole('button', { name: '云端 → 本地', exact: true })).toBeDisabled();
  await dialog(page).getByRole('button', { name: '读取云存档', exact: true }).click();
  const cloudRegion = dialog(page).getByRole('region', { name: '云端检查点', exact: true });
  for (const text of ['CH 04', '2,345', '00:42', '版本 7']) await expect(cloudRegion).toContainText(text);
  await page.screenshot({ path: 'artifacts/ui-maturity-20261107/account-cloud-fixture.png' });
  const restore = dialog(page).getByRole('button', { name: '云端 → 本地', exact: true });
  await restore.click();
  const confirm = page.getByRole('dialog', { name: '载入云端检查点？', exact: true });
  await expect(confirm.getByRole('button', { name: '取消，保留本地', exact: true })).toBeFocused();
  await expect(confirm).toContainText('将退出当前战斗并返回终端');
  await page.screenshot({ path: 'artifacts/ui-maturity-20261107/account-confirm-fixture.png' });
  await page.keyboard.press('Escape'); await expect(confirm).toHaveCount(0);
  await expect(dialog(page)).toBeVisible(); await expect(restore).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(local);
  await restore.click(); await confirm.getByRole('button', { name: '取消，保留本地', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(local);
  await restore.click(); await confirm.getByRole('button', { name: '载入云端并返回终端', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.title-menu')).toBeVisible();
  await expect(page.locator('.game-hud-layer')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(cloud);
  expect(uploads).toEqual([]);
});

test('fixture API: an upload conflict stays an error until a freshly read version is explicitly uploaded', async ({ page }) => {
  const uploads = await setup(page, true); await login(page);
  await dialog(page).getByRole('button', { name: '读取云存档', exact: true }).click();
  await dialog(page).getByRole('button', { name: '本地 → 云端', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('重新读取');
  await expect(dialog(page)).not.toContainText('云端保存成功');
  expect(uploads).toEqual([{ save: local, expectedRevision: 7 }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(local);
  await dialog(page).getByRole('button', { name: '读取云存档', exact: true }).click();
  await expect(dialog(page).getByRole('region', { name: '云端检查点', exact: true })).toContainText('版本 8');
  await dialog(page).getByRole('button', { name: '本地 → 云端', exact: true }).click();
  await expect(dialog(page).getByRole('status')).toContainText('云端保存成功');
  expect(uploads).toEqual([{ save: local, expectedRevision: 7 }, { save: local, expectedRevision: 8 }]);
});

test('fixture API: cloud restore cancellation preserves the paused battle until an explicit confirmation', async ({ page }) => {
  const uploads = await setup(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await expect(page.locator('.game-hud-layer')).toBeVisible();
  await assertCheckpointAttempt(page, local);
  await page.keyboard.press('Escape');
  const paused = page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
  await expect(paused).toBeVisible();
  const attemptBytes = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  const metrics = await paused.locator('.run-metrics').innerText();
  const hud = page.locator('.hud-grid[aria-label="训练状态"]');
  const hudText = await hud.innerText();
  await paused.getByRole('button', { name: 'LOCAL AGENT / 云存档', exact: true }).click();
  await login(page);
  await dialog(page).getByRole('button', { name: '读取云存档', exact: true }).click();
  await dialog(page).getByRole('button', { name: '云端 → 本地', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '载入云端检查点？', exact: true });
  await expect(confirm.getByRole('button', { name: '取消，保留本地', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(attemptBytes);
  await dialog(page).getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(paused).toBeVisible();
  await expect(page.locator('.title-menu')).toHaveCount(0);
  expect(await paused.locator('.run-metrics').innerText()).toBe(metrics);
  expect(await hud.innerText()).toBe(hudText);
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(attemptBytes);
  await page.screenshot({ path: 'artifacts/ui-maturity-20261107/account-paused-cancel-fixture.png' });
  await paused.getByRole('button', { name: 'LOCAL AGENT / 云存档', exact: true }).click();
  await expect(dialog(page).getByText('已认证智能体', { exact: true })).toBeVisible();
  await dialog(page).getByRole('button', { name: '读取云存档', exact: true }).click();
  await dialog(page).getByRole('button', { name: '云端 → 本地', exact: true }).click();
  await confirm.getByRole('button', { name: '载入云端并返回终端', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.title-menu')).toBeVisible();
  await expect(page.locator('.game-hud-layer')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(cloud);
  expect(uploads).toEqual([]);
  await page.screenshot({ path: 'artifacts/ui-maturity-20261107/account-paused-restored-fixture.png', animations: 'disabled' });
});

for (const [name, width, height] of [['portrait', 390, 844], ['short', 844, 390]] as const) {
  test(`fixture API: ${name} cloud comparison and confirmation stay inside the viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await setup(page); await login(page);
    await dialog(page).getByRole('button', { name: '读取云存档', exact: true }).click();
    await expect(dialog(page)).toContainText('版本 7');
    expect(await dialog(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `artifacts/ui-maturity-20261107/account-${name}-fixture.png` });
    await dialog(page).getByRole('button', { name: '云端 → 本地', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: '载入云端检查点？', exact: true });
    await expect(confirm.getByRole('button', { name: '取消，保留本地', exact: true })).toBeFocused();
    expect(await confirm.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const warning = await confirm.locator('.cloud-confirm-warning').boundingBox();
    const confirmAction = await confirm.getByRole('button', { name: '载入云端并返回终端', exact: true }).boundingBox();
    expect(warning?.y).toBeGreaterThanOrEqual(0);
    expect(confirmAction && confirmAction.y + confirmAction.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: `artifacts/ui-maturity-20261107/account-${name}-confirm-fixture.png` });
    await confirm.getByRole('button', { name: '取消，保留本地', exact: true }).click();
    await expect(dialog(page)).toBeVisible();
  });
}
