import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';

test('actual loader progress is modal, and a failed asset retries without replacing the checkpoint', async ({ page }, info) => {
  const save = { ...createRun(randomUUID(), 42), stage: 2, checkpoint: 1, score: 456 };
  const bytes = JSON.stringify(save);
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', value), bytes);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/game/parrot.png', async route => { await held; await route.abort('failed'); });
  try {
    await page.goto('/');
    const loading = page.getByRole('dialog', { name: '正在连接训练终端', exact: true });
    await expect(loading).toBeVisible({ timeout: 15000 });
    const progress = page.getByRole('progressbar', { name: '资源加载进度' });
    await expect.poll(async () => Number(await progress.getAttribute('value'))).toBeGreaterThan(0);
    expect(Number(await progress.getAttribute('value'))).toBeLessThan(100);
    // Assert actual native modality and focus protection; role queries can still find inert elements.
    expect(await loading.evaluate(element => element.matches(':modal'))).toBe(true);
    const guide = page.getByRole('button', { name: '操作指南', exact: true });
    await guide.evaluate(element => element.focus());
    await expect(guide).not.toBeFocused();
    await page.screenshot({ path: info.outputPath('loading-progress.png') });
  } finally { release(); }
  const error = page.getByRole('alert', { name: '游戏资源加载失败' });
  await expect(error).toContainText('随机鹦鹉图集加载失败');
  await expect(error.getByRole('button', { name: '刷新并重试', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(bytes);
  await page.screenshot({ path: info.outputPath('loading-error.png') });
  await page.unroute('**/game/parrot.png');
  await error.getByRole('button', { name: '刷新并重试', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(bytes);
});

for (const secondPage of ['empty', 'error'] as const) {
  test(`leaderboard can return from a ${secondPage} page without closing the panel`, async ({ page }, info) => {
    // Controlled API fixtures test frontend recovery, not real backend acceptance.
    const offsets: number[] = [];
    await page.route('**/api/listleaderboardapi', route => {
      const offset = route.request().postDataJSON().offset as number;
      offsets.push(offset);
      if (offset === 10 && secondPage === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        entries: offset === 0 ? [{ rank: 1, username: 'fixture_player', score: 1234, stage: 2, doom: 24.5, ending: 'defeat', createdAt: '2026-11-07T00:00:00Z' }] : [],
        nextOffset: offset === 0 ? 10 : null,
      }) });
    });
    await page.goto('/');
    await page.getByRole('button', { name: '训练记录', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '训练记录 / LEADERBOARD' });
    await expect(dialog.getByRole('cell', { name: 'fixture_player' })).toBeVisible();
    await dialog.getByRole('button', { name: '下一页 →', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: secondPage === 'empty' ? '本页暂无记录' : '暂时无法读取记录' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '下一页 →', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '← 上一页', exact: true })).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`records-${secondPage}.png`) });
    await dialog.getByRole('button', { name: '← 上一页', exact: true }).click();
    await expect(dialog.getByRole('cell', { name: 'fixture_player' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '← 上一页', exact: true })).toBeDisabled();
    // React StrictMode may start and abort the initial read twice; navigation itself is ordered.
    expect(offsets.filter((offset, index) => index === 0 || offsets[index - 1] !== offset)).toEqual([0, 10, 0]);
  });
}
