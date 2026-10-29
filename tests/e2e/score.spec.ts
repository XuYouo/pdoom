import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';

test.beforeEach(() => {
  test.skip(process.env.PDOOM_E2E_BACKEND !== '1', 'Requires this task’s explicitly provisioned Scala/PostgreSQL test cluster.');
});

test.afterEach(async ({ page }) => {
  // Fault-injection callbacks may outlive a browser-side abort; do not make context teardown wait on a dead route.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const password = 'score_fixture_password_2026';
const scoreEndpoint = '**/api/submitscoreapi';

async function endedRun(page: Page) {
  const runId = randomUUID();
  // Deterministic local checkpoint fixture; the real simulator emits its normal defeat RunResult.
  // No production debug hook or synthetic success response is installed.
  const save = { ...createRun(runId, 42), hp: 0, score: 2468, elapsedMs: 1500 };
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), save);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await expect(page.getByRole('region', { name: '本局成绩上传' })).toBeVisible({ timeout: 15000 });
  const attempt = await assertCheckpointAttempt(page, save);
  return attempt.runId;
}

async function registerThroughScore(page: Page) {
  const username = `score_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  await page.getByRole('region', { name: '本局成绩上传' }).getByRole('button', { name: '登录后上传' }).click();
  await page.getByRole('button', { name: '注册智能体', exact: true }).click();
  await page.getByLabel('玩家名称').fill(username);
  await page.getByLabel('密码', { exact: false }).fill(password);
  await page.getByRole('button', { name: '创建智能体' }).click();
  await expect(page.getByText('已认证智能体', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await expect(page.getByRole('region', { name: '本局成绩上传' }).getByRole('button', { name: '上传本局成绩', exact: true })).toBeVisible();
  return username;
}

async function serverPost(page: Page, action: string, body: Record<string, unknown>) {
  return page.evaluate(async ({ action, body }) => {
    const saved: unknown = JSON.parse(sessionStorage.getItem('pdoom.session.v1') ?? 'null');
    if (!saved || typeof saved !== 'object' || !('token' in saved) || typeof saved.token !== 'string') throw new Error('Missing test session');
    const response = await fetch(`/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saved.token}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { action, body });
}

test('score requires login, suppresses double click and retries a lost real commit idempotently', async ({ page }) => {
  const runId = await endedRun(page);
  const region = page.getByRole('region', { name: '本局成绩上传' });
  await expect(region.getByText(/登录后可上传/)).toBeVisible();
  await expect(region.getByRole('button', { name: '上传本局成绩', exact: true })).toHaveCount(0);
  const username = await registerThroughScore(page);
  const payloads: string[] = [];
  let committed: unknown = null;
  await page.route(scoreEndpoint, async route => {
    payloads.push(route.request().postData() ?? '');
    if (payloads.length === 1) {
      const response = await route.fetch(); // Actual Scala transaction commits before the response is lost.
      expect(response.status()).toBe(200);
      committed = await response.json();
      await response.dispose();
      await route.abort('failed');
    } else await route.continue();
  });
  await region.getByRole('button', { name: '上传本局成绩', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(region.getByRole('alert')).toContainText('无法连接云端');
  expect(payloads).toHaveLength(1);
  const retried = page.waitForResponse(response => response.url().endsWith('/api/submitscoreapi') && response.status() === 200);
  await region.getByRole('button', { name: '重试相同成绩' }).click();
  expect(await (await retried).json()).toEqual(committed);
  await expect(region.getByRole('status')).toContainText('云端已记录本局成绩');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toBe(payloads[1]);
  expect(JSON.parse(payloads[0])).toMatchObject({ runId, score: 2468, ending: 'defeat' });
  await expect(region.getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: '训练记录', exact: true }).click();
  // Other real final runs can outrank this fixture. Verify the whole real paginated UI, not an empty-database/first-page assumption.
  let occurrences = 0, reachedEnd = false;
  for (let pageIndex = 0; pageIndex <= 1000; pageIndex++) {
    await expect(page.locator('table.leaderboard tbody tr').first()).toBeVisible();
    occurrences += await page.getByRole('cell', { name: username, exact: true }).count();
    const next = page.getByRole('button', { name: '下一页 →', exact: true });
    if (await next.isDisabled()) { reachedEnd = true; break; }
    const previousRank = await page.locator('table.leaderboard tbody tr').first().getByRole('cell').first().textContent();
    const response = page.waitForResponse(value => value.url().endsWith('/api/listleaderboardapi') && value.request().method() === 'POST');
    await next.click(); expect((await response).status()).toBe(200);
    await expect(page.locator('table.leaderboard tbody tr').first().getByRole('cell').first()).not.toHaveText(previousRank!);
  }
  expect(reachedEnd).toBe(true); expect(occurrences).toBe(1);
});

test('a real revoked token returns 401, clears the session and can retry after login', async ({ page }) => {
  const runId = await endedRun(page);
  const username = await registerThroughScore(page);
  const revoked = await serverPost(page, 'logoutuserapi', {});
  expect(revoked.status).toBe(200);
  const payloads: string[] = [];
  await page.route(scoreEndpoint, route => { payloads.push(route.request().postData() ?? ''); return route.continue(); });
  const region = page.getByRole('region', { name: '本局成绩上传' });
  await region.getByRole('button', { name: '上传本局成绩', exact: true }).click();
  await expect(region.getByRole('alert')).toContainText('会话已失效');
  expect(await page.evaluate(() => sessionStorage.getItem('pdoom.session.v1') === null)).toBe(true);
  await region.getByRole('button', { name: '登录后上传' }).click();
  await page.getByLabel('玩家名称').fill(username);
  await page.getByLabel('密码', { exact: false }).fill(password);
  await page.getByRole('button', { name: '建立会话' }).click();
  await expect(page.getByText('已认证智能体', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await region.getByRole('button', { name: '重试相同成绩' }).click();
  await expect(region.getByRole('status')).toContainText('云端已记录本局成绩');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toBe(payloads[1]);
  expect(JSON.parse(payloads[1]).runId).toBe(runId);
});

test('a real 409 remains an honest conflict and retries cannot alter the run payload', async ({ page }) => {
  const runId = await endedRun(page);
  await registerThroughScore(page);
  const previous = await serverPost(page, 'submitscoreapi', { runId, score: 1, stage: 1, durationMs: 1000, doom: 8, ending: 'defeat' });
  expect(previous.status).toBe(200);
  const payloads: string[] = [];
  await page.route(scoreEndpoint, route => { payloads.push(route.request().postData() ?? ''); return route.continue(); });
  const region = page.getByRole('region', { name: '本局成绩上传' });
  await region.getByRole('button', { name: '上传本局成绩', exact: true }).click();
  await expect(region.getByRole('alert')).toContainText('已有不同结果，不能覆盖');
  const conflict = page.waitForResponse(response => response.url().endsWith('/api/submitscoreapi') && response.status() === 409);
  await region.getByRole('button', { name: '重试相同成绩' }).click();
  await conflict;
  await expect(region.getByRole('alert')).toContainText('不会更换 runId');
  await expect(region.getByText('云端已记录本局成绩。', { exact: false })).toHaveCount(0);
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toBe(payloads[1]);
  expect(JSON.parse(payloads[1]).runId).toBe(runId);
});

test('the component keeps its 10s timeout with an external signal and retries the real committed result', async ({ page }) => {
  test.setTimeout(40000);
  await endedRun(page);
  await registerThroughScore(page);
  const payloads: string[] = [];
  let release: () => void = () => undefined;
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  let committed: unknown = null;
  await page.route(scoreEndpoint, async route => {
    payloads.push(route.request().postData() ?? '');
    if (payloads.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committed = await response.json();
      await response.dispose();
      await responseGate; // Released only after the browser reports its own deadline cancellation.
      // The original browser request is already dead; issuing another route.abort can hang driver teardown.
    } else await route.continue();
  });
  const region = page.getByRole('region', { name: '本局成绩上传' });
  try {
    const cancelled = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/submitscoreapi'));
    await region.getByRole('button', { name: '上传本局成绩', exact: true }).click();
    await expect(region.getByRole('alert')).toContainText('超过 10 秒', { timeout: 15000 });
    await cancelled;
    release();
    const retried = page.waitForResponse(response => response.url().endsWith('/api/submitscoreapi') && response.status() === 200);
    await region.getByRole('button', { name: '重试相同成绩' }).click();
    expect(await (await retried).json()).toEqual(committed);
    await expect(region.getByRole('status')).toContainText('云端已记录本局成绩');
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toBe(payloads[1]);
  } finally { release(); }
});
