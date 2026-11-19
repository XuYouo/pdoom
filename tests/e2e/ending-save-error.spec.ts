import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';

test('completed-save replay explains a failed local write and keeps manual score actions available', async ({ page }, info) => {
  const completed = { ...createRun(randomUUID(), 42), stage: 5, checkpoint: 90, hp: 67, doom: 55, score: 4567, elapsedMs: 123456 };
  const previous = { ...completed, checkpoint: 2, score: 4000, elapsedMs: 120000 };
  expect(isGameSave(completed)).toBe(true); expect(isGameSave(previous)).toBe(true);
  const errors: string[] = [], writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.url()); });
  await page.setViewportSize({ width: 1280, height: 900 });
  // A supported completed-save replay exercises the actual ended/persist path, not a Boss-playthrough claim.
  await page.addInitScript(save => localStorage.setItem('pdoom.save.v1', JSON.stringify(save)), completed);
  await page.goto('/');
  const replay = page.getByRole('button', { name: '回看结局', exact: true });
  await expect(replay).toBeEnabled();
  // Keep an older valid slot on disk while the already-loaded result remains in memory.
  // Only the public storage boundary is faulted; no Scene, bridge, or run result is changed.
  await page.evaluate(save => {
    localStorage.setItem('pdoom.save.v1', JSON.stringify(save));
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('pdoom.save.')) throw new DOMException('Completion quota is full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  }, previous);
  await replay.click();
  const ending = page.getByRole('dialog', { name: '最终结局', exact: true });
  const warning = ending.getByRole('alert', { name: '完成记录未能保存', exact: true });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('本地可能仍是旧检查点');
  await expect(warning).toContainText('刷新或离开页面可能失去这次结果');
  await expect(warning).toContainText('云端不会自动保存');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(previous);
  expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath('ending-save-error-theatre.png') });

  await ending.getByRole('button', { name: '跳过演出 / 查看结算', exact: true }).click();
  await expect(warning).toBeVisible();
  await expect(ending.getByRole('region', { name: '最终结算' })).toContainText('第五章 / 已完成（未保存）');
  await expect(ending.getByRole('region', { name: '最终结算' })).toContainText('4567');
  const score = ending.getByRole('region', { name: '本局成绩上传' });
  const login = score.getByRole('button', { name: '登录后上传', exact: true });
  await expect(login).toBeEnabled();
  await page.screenshot({ path: info.outputPath('ending-save-error-summary.png') });
  await login.click();
  const account = page.getByRole('dialog', { name: '智能体账户 / CLOUD TERMINAL', exact: true });
  await expect(account).toBeVisible();
  await account.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await expect(warning).toBeVisible(); await expect(login).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(previous);
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});
