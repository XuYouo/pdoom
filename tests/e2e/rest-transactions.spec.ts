import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';

const room = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const confirmation = (page: Page) => page.getByRole('dialog', { name: '确认奖励劫持？', exact: true });
const saved = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
const observations = new WeakMap<Page, { errors: string[]; writes: string[] }>();
test.setTimeout(45000);
test.beforeEach(({ page }) => {
  const value = { errors: [] as string[], writes: [] as string[] }; observations.set(page, value);
  page.on('pageerror', error => value.errors.push(error.message));
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) value.writes.push(request.url());
  });
});
test.afterEach(({ page }) => {
  expect(observations.get(page)!.errors).toEqual([]); expect(observations.get(page)!.writes).toEqual([]);
});

async function boot(page: Page, viewport: { width: number; height: number }, tokens: number) {
  const original: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 11, hp: 60, tokens, doom: 60, elapsedMs: 12000,
    inventory: ['constitutional', 'recursive', 'residual'] };
  expect(isGameSave(original)).toBe(true); await page.setViewportSize(viewport);
  await page.addInitScript(value => {
    const key = `rest-transactions.${value.runId}`;
    if (sessionStorage.getItem(key) === null) { localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(key, 'seeded'); }
  }, original);
  await page.goto('/'); const restore = page.getByRole('button', { name: '恢复检查点', exact: true });
  await expect(restore).toBeEnabled(); await restore.click(); await expect(room(page)).toBeVisible();
  await expect(room(page).getByRole('button', { name: '不再交易，继续前进', exact: true })).toBeFocused();
  const attempt = await assertCheckpointAttempt(page, original);
  const rows = await room(page).locator('.rest-offer').evaluateAll(offers => offers.map(offer => {
    const item = offer.getBoundingClientRect(), reason = offer.querySelector('.rest-offer-reason')?.getBoundingClientRect();
    return { label: offer.textContent, itemBottom: item.bottom, reasonBottom: reason?.bottom };
  }));
  for (const row of rows) if (row.reasonBottom !== undefined) expect(row.reasonBottom, `${row.label}: visible reason stays inside its own item`).toBeLessThanOrEqual(row.itemBottom - 4);
  return { attempt, bytes: await saved(page) };
}

async function captureConfirmation(page: Page, info: TestInfo, name: string) {
  const value = await confirmation(page).evaluate(dialog => {
    const rect = dialog.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight,
      scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth,
      controls: Array.from(dialog.querySelectorAll('button')).map(button => {
        const r = button.getBoundingClientRect(); const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { label: button.textContent, y: r.y, bottom: r.bottom, reachable: target === button || button.contains(target) };
      }) };
  });
  expect(value.x).toBeGreaterThanOrEqual(0); expect(value.y).toBeGreaterThanOrEqual(0);
  expect(value.right).toBeLessThanOrEqual(value.width + 1); expect(value.bottom).toBeLessThanOrEqual(value.height + 1);
  expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth + 1);
  for (const control of value.controls) {
    expect(control.y).toBeGreaterThanOrEqual(0); expect(control.bottom).toBeLessThanOrEqual(value.height); expect(control.reachable).toBe(true);
  }
  await info.attach('confirmation-geometry', { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}

async function assertDetailFits(page: Page) {
  const detail = await room(page).locator('.rest-selection').evaluate(node => ({
    bottom: node.getBoundingClientRect().bottom,
    textBottom: Math.max(...Array.from(node.querySelectorAll('p, small')).map(child => child.getBoundingClientRect().bottom)),
  }));
  expect(detail.textBottom, 'Selected offer explanations stay within the inspector border').toBeLessThanOrEqual(detail.bottom - 4);
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'short', width: 844, height: 500 }]) {
  test(`${viewport.name}: risky free hack is cancellable, traps only its own keys and applies once on confirmation`, async ({ page }, info) => {
    if (viewport.name === 'mobile') await page.emulateMedia({ reducedMotion: 'reduce' });
    const { attempt, bytes } = await boot(page, viewport, 0);
    const offer = room(page).getByRole('button', { name: '奖励劫持 梯度校准', exact: true });
    await expect(room(page).getByRole('button', { name: '购买 梯度校准', exact: true })).toBeDisabled();
    await offer.click(); const confirm = confirmation(page);
    const cancel = confirm.getByRole('button', { name: '取消劫持', exact: true });
    const accept = confirm.getByRole('button', { name: '确认劫持 梯度校准', exact: true });
    await expect(cancel).toBeFocused(); await expect(confirm).toContainText('将跨过 80% 阈值，进入 FOOM 形态');
    await expect(confirm.locator('.rest-hack-change')).toHaveAttribute('aria-label', 'P(Doom) 从 60.00% 变为 85.00%');
    if (viewport.name === 'mobile') await expect(confirm).toHaveCSS('animation-name', 'none');
    for (let index = 0; index < 3; index++) {
      await page.keyboard.press('Shift+Tab'); await expect(accept).toBeFocused();
      await page.keyboard.press('Tab'); await expect(cancel).toBeFocused();
    }
    expect(await saved(page)).toBe(bytes);
    await captureConfirmation(page, info, `${viewport.name}-hack-confirmation`);
    await page.keyboard.press('Enter'); await expect(confirm).toHaveCount(0); expect(await saved(page)).toBe(bytes);
    await expect(offer).toBeFocused();
    await offer.click(); await page.keyboard.press('Escape'); await expect(confirm).toHaveCount(0); await expect(room(page)).toBeVisible();
    await page.keyboard.press('Escape'); await expect(room(page)).toBeVisible(); expect(await saved(page)).toBe(bytes);
    await expect(room(page).getByRole('button', { name: '关闭弹窗', exact: true })).toHaveCount(0);
    await offer.click(); await expect(cancel).toBeFocused(); await page.keyboard.press('Tab'); await expect(accept).toBeFocused(); await page.keyboard.press('Enter');
    const expected: GameSaveData = { ...attempt, doom: 85, checkpoint: 21, upgrades: ['calibrated'] };
    await expect.poll(async () => JSON.parse((await saved(page))!)).toEqual(expected);
    await expect(confirm).toHaveCount(0); await expect(offer).toBeDisabled();
    await expect(room(page).getByRole('button', { name: '不再交易，继续前进', exact: true })).toBeFocused();
    await expect(room(page)).toContainText('本休息室的奖励劫持已使用');
    await assertDetailFits(page);
    await page.screenshot({ path: info.outputPath(`${viewport.name}-hack-applied.png`) });
    await page.reload(); const restore = page.getByRole('button', { name: '恢复检查点', exact: true }); await expect(restore).toBeEnabled(); await restore.click();
    await expect(room(page)).toBeVisible(); const resumed = await assertCheckpointAttempt(page, expected);
    expect(resumed.doom).toBe(85); expect(resumed.tokens).toBe(0); expect(resumed.upgrades).toEqual(['calibrated']); await expect(offer).toBeDisabled();
  });
}

test('mobile: purchase and hack effects remain live while failed storage is clearly reported', async ({ page }, info) => {
  const { bytes } = await boot(page, { width: 390, height: 844 }, 200);
  // Exercise actual transactions and only fault the public storage boundary.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('pdoom.save.')) throw new DOMException('Rest quota is full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await room(page).getByRole('button', { name: '购买 修补毛线', exact: true }).click();
  const warning = room(page).getByRole('alert', { name: '休息室进度未保存', exact: true });
  await expect(warning).toBeVisible(); await expect(warning).toContainText('当前变更仍在本局生效');
  await expect(warning).toContainText('刷新或离开可能恢复旧检查点'); await expect(warning).toContainText('Rest quota is full');
  await expect(room(page).locator('.rest-stat--hp')).toContainText('95'); await expect(room(page).locator('.rest-stat--tokens')).toContainText('188 TOK');
  await expect(confirmation(page)).toHaveCount(0); expect(await saved(page)).toBe(bytes);
  await room(page).getByRole('button', { name: '奖励劫持 梯度校准', exact: true }).click();
  await confirmation(page).getByRole('button', { name: '确认劫持 梯度校准', exact: true }).click();
  await expect(warning).toBeVisible(); await expect(room(page).locator('.rest-stat--doom')).toContainText('85.00');
  await expect(room(page).getByRole('button', { name: '购买 梯度校准', exact: true })).toBeDisabled();
  await expect(room(page).locator('.rest-stat--tokens')).toContainText('188 TOK'); expect(await saved(page)).toBe(bytes);
  await expect(room(page)).not.toContainText('本次扣款/奖励已在同一检查点保存');
  await assertDetailFits(page);
  await page.screenshot({ path: info.outputPath('mobile-rest-save-failure.png') });
  const next = room(page).getByRole('button', { name: '不再交易，继续前进', exact: true });
  await expect(next).toBeInViewport({ ratio: 1 }); await expect(next).toBeEnabled();
});
