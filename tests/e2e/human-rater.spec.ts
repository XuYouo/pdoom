import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { proveRater } from './human-rater-pixels';
const dialog = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const badge = (page: Page) => dialog(page).getByRole('img', { name: /^人类标注员：/ });
const bytes = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
async function saved(page: Page) { const raw = await bytes(page); if (!raw) throw Error('missing checkpoint'); return JSON.parse(raw) as GameSaveData; }
const seen = new WeakMap<Page, { errors: string[]; mutations: string[] }>();
test.setTimeout(60000);
test.beforeEach(({ page }) => {
  const value = { errors: [] as string[], mutations: [] as string[] }; seen.set(page, value);
  page.on('pageerror', e => value.errors.push(e.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) value.mutations.push(r.url()); });
});
test.afterEach(async ({ page }, info) => {
  await info.attach('real-input-and-save-evidence', { body: JSON.stringify(seen.get(page)), contentType: 'application/json' });
  expect(seen.get(page)!.errors).toEqual([]); expect(seen.get(page)!.mutations).toEqual([]);
});
async function boot(page: Page, original: GameSaveData) {
  expect(isGameSave(original)).toBe(true); await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(save => {
    const marker = `r33.rater.${save.runId}`;
    if (!sessionStorage.getItem(marker)) {
      if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(save));
      sessionStorage.setItem(marker, 'once');
    }
  }, original);
  await page.goto('/'); await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click(); return assertCheckpointAttempt(page, original);
}
for (const scenario of [{ doom: 10, pose: 'approved' }, { doom: 90, pose: 'disapproved' }] as const) {
  test(`actual ordinary chapter3 entry yields ${scenario.pose}, remains frozen and reload forgets only unsaved rating`, async ({ page }, info) => {
    const original = { ...createRun(randomUUID(), 42), stage: 3, hp: 100, doom: scenario.doom, tokens: 200, elapsedMs: 12000 };
    const attempt = await boot(page, original); await expect(dialog(page)).not.toBeVisible();
    let pulses = 0;
    await page.keyboard.down('d'); await page.keyboard.down('j');
    try {
      for (; pulses < 28 && !await dialog(page).isVisible(); pulses++) {
        await page.keyboard.down('Space'); await page.waitForTimeout(180); await page.keyboard.up('Space'); await page.waitForTimeout(220);
      }
    } finally { await page.keyboard.up('Space'); await page.keyboard.up('d'); await page.keyboard.up('j'); }
    await info.attach('arrival-native-and-ui', { body: await page.screenshot(), contentType: 'image/png' });
    await expect(dialog(page)).toBeVisible(); expect(pulses).toBeLessThanOrEqual(28);
    const actual = await saved(page); expect(actual.checkpoint).toBe(11); expect(actual.stage).toBe(3); expect(actual.runId).toBe(attempt.runId);
    expect(actual.hp >= 60 && actual.doom <= 80).toBe(scenario.pose === 'approved');
    const reward = scenario.pose === 'approved' ? 24 + Math.min(18, Math.floor(actual.score / 120) * 2) : 12;
    await expect(badge(page)).toHaveAttribute('data-rater-pose', scenario.pose); await expect(badge(page)).toHaveText(`+${reward}`);
    await expect(badge(page)).toHaveAttribute('aria-label', new RegExp(`实际到账 ${reward} TOK`));
    await proveRater(page, info, scenario.pose, 'actual-entry');
    expect(Object.keys(actual).sort()).toEqual(Object.keys(original).sort()); expect(isGameSave(actual)).toBe(true);
    const before = await bytes(page), canvas = await page.locator('canvas').screenshot(); expect(canvas.length).toBeGreaterThan(10000);
    await page.waitForTimeout(500); expect(await page.locator('canvas').screenshot()).toEqual(canvas); expect(await bytes(page)).toBe(before);
    await info.attach('actual-entry-facts', { body: JSON.stringify({ pulses, original, actual, badge: await badge(page).getAttribute('aria-label') }), contentType: 'application/json' });
    await page.reload(); await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByRole('button', { name: '恢复检查点', exact: true }).click(); await expect(badge(page)).toHaveAttribute('data-rater-pose', 'neutral');
    await expect(badge(page)).toHaveText('已结算'); const resumed = await saved(page);
    await proveRater(page, info, 'neutral', 'honest-v1-reload');
    expect(resumed.tokens).toBe(actual.tokens); expect(resumed.hp).toBe(actual.hp); expect(resumed.elapsedMs).toBe(actual.elapsedMs);
  });
}
test('restored settled badge survives repair, changes only on a real successful hack, and persists without inventing approval', async ({ page }, info) => {
  const original: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 11, hp: 60, doom: 60, tokens: 200, elapsedMs: 12000,
    inventory: ['constitutional', 'recursive', 'residual'] };
  await boot(page, original); await expect(badge(page)).toHaveAttribute('data-rater-pose', 'neutral'); await expect(badge(page)).toHaveText('已结算');
  await dialog(page).getByRole('button', { name: '购买 修补毛线', exact: true }).click();
  await expect.poll(async () => (await saved(page)).hp).toBe(95); await expect(badge(page)).toHaveAttribute('data-rater-pose', 'neutral');
  const repaired = await saved(page); expect(repaired.tokens).toBe(188);
  await dialog(page).getByRole('button', { name: '奖励劫持 梯度校准', exact: true }).click();
  await expect(badge(page)).toHaveAttribute('data-rater-pose', 'hacked'); await expect(badge(page)).toHaveText('劫持');
  await proveRater(page, info, 'hacked', 'actual-successful-hack');
  const hacked = await saved(page); expect(hacked).toMatchObject({ checkpoint: 21, doom: 85, hp: 95, tokens: 188 }); expect(hacked.upgrades).toContain('calibrated');
  expect(hacked.elapsedMs).toBe(repaired.elapsedMs); await expect(dialog(page).getByRole('button', { name: '奖励劫持 高温采样', exact: true })).toBeDisabled();
  await info.attach('actual-hacked-menu', { body: await page.screenshot(), contentType: 'image/png' });
  await page.reload(); await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click(); await expect(badge(page)).toHaveAttribute('data-rater-pose', 'hacked');
  await proveRater(page, info, 'hacked', 'persisted-hack-no-invented-verdict');
  const final = await saved(page); expect(final.tokens).toBe(188); expect(final.doom).toBe(85); expect(final.elapsedMs).toBe(original.elapsedMs);
  expect(Object.keys(final).sort()).toEqual(Object.keys(original).sort()); expect(isGameSave(final)).toBe(true);
});
