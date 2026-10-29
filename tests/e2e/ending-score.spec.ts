import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';

test.setTimeout(90000);
test.beforeEach(() => test.skip(process.env.PDOOM_E2E_BACKEND !== '1', 'Requires the explicitly provisioned isolated Scala/PostgreSQL server.'));

// Completed-save fixtures exercise the real final-result UI/API path, not a claimed combat playthrough.
for (const [ending, doom] of [['aligned', 8], ['warden', 55], ['foom', 88]] as const) {
  test(`real ${ending} score and terminal cloud save remain identical after another local run and replay`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const save = { ...createRun(randomUUID(), 77), stage: 5, checkpoint: 90, hp: 67, doom, tokens: 123, score: 4567,
      elapsedMs: 123456, donated: true, inventory: ['constitutional', 'residual', 'lisp'], upgrades: ['reinforced', 'calibrated'],
      actionCounts: { shots: 77, dashes: 32, rewinds: 12, insights: 5 } };
    await page.addInitScript(value => {
      const flag = `ending.cloud.fixture.${value.runId}`;
      if (!sessionStorage.getItem(flag)) { localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(flag, 'once'); }
    }, save);
    await page.goto('/');
    await expect(page.getByRole('button', { name: '回看结局', exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByRole('button', { name: '回看结局', exact: true }).click();
    const endingDialog = page.getByRole('dialog', { name: '最终结局', exact: true });
    await endingDialog.getByRole('button', { name: /查看结算/ }).click();
    const score = page.getByRole('region', { name: '本局成绩上传' });
    await score.getByRole('button', { name: '登录后上传' }).click();
    await page.getByRole('button', { name: '注册智能体', exact: true }).click();
    await page.getByLabel('玩家名称').fill(`end_${randomUUID().replace(/-/g, '').slice(0, 20)}`);
    await page.getByLabel('密码', { exact: false }).fill('isolated_ending_password_2026');
    await page.getByRole('button', { name: '创建智能体' }).click();
    await expect(page.getByText('已认证智能体', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭弹窗' }).click();
    const expectedPayload = { runId: save.runId, score: save.score, stage: 5, durationMs: save.elapsedMs, doom, ending };
    const firstResponse = page.waitForResponse(response => response.url().endsWith('/api/submitscoreapi') && response.request().method() === 'POST');
    await score.getByRole('button', { name: '上传本局成绩', exact: true }).click();
    const first = await firstResponse; expect(first.status()).toBe(200); expect(first.request().postDataJSON()).toEqual(expectedPayload);
    const firstBody = await first.json();
    await expect(score.getByRole('status')).toContainText('云端已记录本局成绩');
    await page.getByRole('button', { name: 'LOCAL AGENT' }).click();
    await page.getByRole('button', { name: '读取云存档', exact: true }).click();
    await expect(page.getByText('云端暂无存档，可以上传本地检查点。')).toBeVisible();
    await page.getByRole('button', { name: '本地 → 云端', exact: true }).click();
    await expect(page.getByText('CH 5 · REV 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭弹窗' }).click();
    await endingDialog.getByRole('button', { name: '返回终端', exact: true }).click();
    await page.getByRole('button', { name: '开始新训练' }).click();
    await page.getByRole('button', { name: 'Ⅱ PAUSE' }).click();
    await page.getByRole('button', { name: '返回终端', exact: true }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null').stage)).toBe(1);
    await page.reload();
    await expect(page.getByRole('button', { name: '开始新训练' })).toBeEnabled({ timeout: 15000 });
    await page.getByRole('button', { name: 'LOCAL AGENT' }).click();
    await page.getByRole('button', { name: '读取云存档', exact: true }).click();
    await expect(page.getByText('CH 5 · REV 1', { exact: true })).toBeVisible();
    page.once('dialog', dialog => { expect(dialog.message()).toContain('用云端检查点替换'); void dialog.accept(); });
    await page.getByRole('button', { name: '云端 → 本地', exact: true }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(save);
    await page.getByRole('button', { name: '回看结局', exact: true }).click();
    await endingDialog.getByRole('button', { name: /查看结算/ }).click();
    const retriedResponse = page.waitForResponse(response => response.url().endsWith('/api/submitscoreapi') && response.request().method() === 'POST');
    await score.getByRole('button', { name: '上传本局成绩', exact: true }).click();
    const retried = await retriedResponse;
    expect(retried.status()).toBe(200); expect(retried.request().postDataJSON()).toEqual(expectedPayload); expect(await retried.json()).toEqual(firstBody);
    await expect(score.getByRole('status')).toContainText('云端已记录本局成绩');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(save);
    await page.screenshot({ path: `artifacts/browser/ending-${ending}-cloud-score.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
