import { expect, test, type Page } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';

// Explicit UI fixtures: the normal simulator emits defeat, while only the score API is stubbed.
// No result here is evidence of a Scala/PostgreSQL write.
async function defeat(page: Page, elapsedMs: number) {
  const save = { ...createRun('a3b042b8-7649-40d4-9c09-b970c97beecf', 42), hp: 0, score: 1234, elapsedMs };
  await page.addInitScript(({ save }) => {
    localStorage.setItem('pdoom.save.v1', JSON.stringify(save));
    sessionStorage.setItem('pdoom.session.v1', JSON.stringify({ token: 'a'.repeat(43), expiresAt: '2099-01-01T00:00:00Z', user: { id: 'b7f03c8a-306f-4733-8797-dbd65cb18143', username: 'score_fixture' } }));
  }, { save });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  const score = page.getByRole('region', { name: '本局成绩上传', exact: true });
  await expect(score).toBeVisible(); return score;
}

test('fixture API: score stays manual and retries identical data after an unconfirmed response', async ({ page }) => {
  const payloads: string[] = [];
  await page.route('**/api/submitscoreapi', async route => {
    payloads.push(route.request().postData() ?? '');
    if (payloads.length === 1) await route.abort('failed');
    else await route.fulfill({ status: 200, json: { scoreId: '665770a8-f2fa-4e9d-a33f-f21c8d4a89a4', personalBest: true } });
  });
  const score = await defeat(page, 1500);
  await expect(score).toContainText('不会自动提交'); await expect(score).toContainText('非竞技训练榜');
  await expect(score).not.toContainText('runId'); expect(payloads).toEqual([]);
  await score.getByRole('button', { name: '上传本局成绩', exact: true }).click();
  await expect(score.getByRole('alert')).toContainText('无法连接云端');
  await expect(score).not.toContainText('云端已记录本局成绩');
  await page.screenshot({ path: 'artifacts/ui-maturity-20261107/score-retry-fixture.png' });
  await score.getByRole('button', { name: '重试相同成绩', exact: true }).click();
  await expect(score.getByRole('status')).toContainText('云端已记录本局成绩');
  expect(payloads).toHaveLength(2); expect(payloads[1]).toBe(payloads[0]);
  await expect(score.getByRole('button')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/ui-maturity-20261107/score-submitted-fixture.png' });
});

test('fixture UI: a sub-second defeat keeps its real duration and cannot be submitted', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/submitscoreapi')) requests.push(request.postData() ?? ''); });
  const score = await defeat(page, 0);
  await expect(score.getByRole('alert')).toContainText('不足 1 秒');
  await expect(score.getByRole('button')).toHaveCount(0); expect(requests).toEqual([]);
});
