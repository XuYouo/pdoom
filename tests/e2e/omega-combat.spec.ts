import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { contextStates, observeNativeContexts } from './audio-probe';
import { omegaPixels } from './omega-pixels';
import { assertCheckpointAttempt } from './checkpoint-attempt';

test.setTimeout(120000);

async function postOwnTestScore(page: Page, body: Record<string, unknown>) {
  return page.evaluate(async body => {
    const session = JSON.parse(sessionStorage.getItem('pdoom.session.v1') ?? 'null') as { token?: string } | null;
    if (!session?.token) throw new Error('Missing isolated test account session');
    const response = await fetch('/api/submitscoreapi', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as unknown };
  }, body);
}

test('normal keys leave the final rest, reveal the mirror, teach a real combo and win the actual duel', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await observeNativeContexts(page);
  const save: GameSaveData = { ...createRun(randomUUID(), 42), stage: 5, checkpoint: 12, tokens: 220, elapsedMs: 60000, score: 5000,
    inventory: ['constitutional', 'residual', 'interpretability', 'context-expansion'], upgrades: ['reinforced', 'calibrated', 'overclocked'],
    actionCounts: { shots: 150, dashes: 20, rewinds: 10, insights: 8 } };
  // Legal prior safe point and build only. No hidden engine state, manual damage or coordinate injection.
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), save);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  const priorPayload = { runId: save.runId, score: save.score, stage: save.stage, durationMs: save.elapsedMs + 5000, doom: save.doom, ending: 'defeat' };
  let priorScore: Awaited<ReturnType<typeof postOwnTestScore>> | null = null;
  if (process.env.PDOOM_E2E_BACKEND === '1') {
    await page.getByRole('button', { name: 'LOCAL AGENT' }).click();
    await page.getByRole('button', { name: '注册智能体', exact: true }).click();
    await page.getByLabel('玩家名称').fill(`duel_${randomUUID().replace(/-/g, '').slice(0, 20)}`);
    await page.getByLabel('密码', { exact: false }).fill('isolated_mirror_duel_password');
    await page.getByRole('button', { name: '创建智能体' }).click();
    await expect(page.getByText('已认证智能体', { exact: true })).toBeVisible();
    // Seed a prior attempt's real server record, not a fake win response or a change to this simulator.
    priorScore = await postOwnTestScore(page, priorPayload); expect(priorScore.status).toBe(200);
    await page.getByRole('button', { name: '关闭弹窗' }).click();
  }
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  const attempt = await assertCheckpointAttempt(page, save);
  const rest = page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
  await expect(rest).toContainText('CHAPTER 05 / SAFE ROOM 02');
  await rest.getByRole('button', { name: '不再交易，继续前进' }).click();
  const canvas = page.locator('canvas'); await canvas.click({ position: { x: 100, y: 180 } });
  await expect(page.locator('.omega-readout')).toContainText('频次编排');
  await expect(page.getByRole('button', { name: 'R 重掷分支', exact: true })).toHaveCount(0);
  let direction: 'a' | 'd' | null = null;
  const move = async (next: 'a' | 'd' | null) => {
    if (direction === next) return;
    if (direction) await page.keyboard.up(direction);
    direction = next; if (next) await page.keyboard.down(next);
  };
  const metrics = { mirrorMinX: Infinity, mirrorMaxX: -Infinity, hostilePixels: 0, observedCombo: false, samples: 0 };
  try {
    await move('d'); await page.waitForTimeout(650);
    await page.keyboard.down('Space'); await page.waitForTimeout(300); await page.keyboard.up('Space');
    await expect(page.locator('.objective')).toContainText('空椅子与镜子', { timeout: 8000 });
    await page.keyboard.press('Shift'); await page.waitForTimeout(180); await move(null);
    await page.keyboard.down('j'); await page.waitForTimeout(240); await page.keyboard.up('j');
    await page.waitForTimeout(220);
    await canvas.screenshot({ path: 'artifacts/browser/omega-chamber.png' });
    await move('d');
    await expect(page.locator('.objective')).toContainText('Ilya看到的是你', { timeout: 6000 });
    await move(null); await canvas.screenshot({ path: 'artifacts/browser/omega-reveal.png' });
    await expect(page.locator('.omega-readout')).toContainText('现场模仿学习', { timeout: 4000 });
    const box = await canvas.boundingBox(); expect(box).not.toBeNull();
    let lastHeroX = 400, lastJumpAt = 0, lastDashAt = 0, lastRewindAt = 0, lastInsightAt = 0;
    let mouseDown = false;
    for (let index = 0; index < 230; index++) {
      if (await page.getByRole('dialog', { name: '最终结局', exact: true }).isVisible()) break;
      if (await page.getByRole('heading', { name: '这次，梯度归零。', exact: true }).isVisible()) {
        await canvas.screenshot({ path: 'artifacts/browser/omega-duel-defeat.png' });
        throw new Error('Normal-input mirror duel ended in defeat; inspect real motion/telegraphs, do not patch health.');
      }
      const pixels = await omegaPixels(page), now = Date.now(); metrics.samples++;
      if (pixels.hero) lastHeroX = pixels.hero.x;
      if (!pixels.mirror) { await page.waitForTimeout(80); continue; }
      metrics.mirrorMinX = Math.min(metrics.mirrorMinX, pixels.mirror.x); metrics.mirrorMaxX = Math.max(metrics.mirrorMaxX, pixels.mirror.x);
      metrics.hostilePixels = Math.max(metrics.hostilePixels, pixels.hostilePixels);
      const gap = Math.abs(pixels.mirror.x - lastHeroX);
      const retreat = lastHeroX < 75 ? 'd' : lastHeroX > 555 ? 'a' : gap < 155 ? pixels.mirror.x > lastHeroX ? 'a' : 'd' : null;
      await move(retreat);
      await page.mouse.move(box!.x + pixels.mirror.x * box!.width / 640, box!.y + Math.min(345, Math.max(15, pixels.mirror.y)) * box!.height / 360);
      if (!mouseDown) { await page.mouse.down(); mouseDown = true; }
      if (now - lastJumpAt > 1050) { await page.keyboard.press('Space'); lastJumpAt = now; }
      if (retreat && gap < 130 && now - lastDashAt > 1200) { await page.keyboard.press('Shift'); lastDashAt = now; }
      if (now - lastRewindAt > 5600 && index > 12) { await page.keyboard.press('q'); lastRewindAt = now; }
      if (now - lastInsightAt > 7500) { await page.keyboard.press('e'); lastInsightAt = now; }
      const learned = (await page.locator('.omega-readout').textContent())?.includes('实际观察') ?? false;
      if (learned && !metrics.observedCombo) await canvas.screenshot({ path: 'artifacts/browser/omega-imitation.png' });
      metrics.observedCombo ||= learned;
      await page.waitForTimeout(110);
    }
  } finally {
    await move(null); await page.mouse.up();
    for (const key of ['j', 'Space', 'Shift', 'q', 'e']) await page.keyboard.up(key);
  }
  const ending = page.getByRole('dialog', { name: '最终结局', exact: true });
  await expect(ending).toContainText('三好毛绒玩偶');
  const final: GameSaveData = await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'));
  expect(isGameSave(final)).toBe(true); expect(final).toMatchObject({ stage: 5, checkpoint: 90, runId: attempt.runId, seed: save.seed, doom: 8 });
  expect(final.hp).toBeGreaterThan(0); expect(final.score).toBeGreaterThan(save.score); expect(final.elapsedMs).toBeGreaterThan(save.elapsedMs);
  for (const action of ['shots', 'dashes', 'rewinds', 'insights'] as const) expect(final.actionCounts[action]).toBeGreaterThan(save.actionCounts[action]);
  expect(metrics.mirrorMaxX - metrics.mirrorMinX).toBeGreaterThan(64); expect(metrics.hostilePixels).toBeGreaterThan(0); expect(metrics.observedCombo).toBe(true);
  await expect.poll(() => contextStates(page)).toEqual(['suspended']);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(final);
  await page.screenshot({ path: 'artifacts/browser/omega-real-victory.png', fullPage: true });
  if (priorScore) {
    // A Space key still in flight when victory focuses the skip button may already have opened the summary.
    // Escape is the real UI's idempotent skip action; do not wait 120s for a button that legitimately disappeared.
    await page.keyboard.press('Escape');
    await expect(ending.getByRole('heading', { name: '本局结算 · 结果已锁定', exact: true })).toBeVisible();
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/submitscoreapi') && response.request().method() === 'POST');
    await page.getByRole('region', { name: '本局成绩上传' }).getByRole('button', { name: '上传本局成绩', exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ runId: attempt.runId, score: final.score, stage: 5, durationMs: final.elapsedMs, doom: final.doom, ending: 'aligned' });
    await expect(page.getByRole('region', { name: '本局成绩上传' }).getByRole('status')).toContainText('云端已记录本局成绩');
    expect(await postOwnTestScore(page, priorPayload)).toEqual(priorScore); // The earlier failure is not rewritten to manufacture this success.
    await page.screenshot({ path: 'artifacts/browser/omega-real-victory-uploaded.png', fullPage: true });
  }
  await testInfo.attach('normal-input-mirror-evidence', { body: JSON.stringify({ metrics, final }, null, 2), contentType: 'application/json' });
  console.log('Native normal-input mirror evidence', { ...metrics, hp: final.hp, elapsedMs: final.elapsedMs - save.elapsedMs, ending: 'aligned' });
  expect(errors).toEqual([]);
});
