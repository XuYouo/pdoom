import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';

const paused = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
const defeated = (page: Page) => page.getByRole('dialog', { name: '这次，梯度归零。', exact: true });
async function fixture(page: Page, stage = 3, hp = 73) {
  const save = { ...createRun(randomUUID(), 42), stage, hp, doom: 62, tokens: 137, score: 4567, elapsedMs: 80000 };
  expect(isGameSave(save)).toBe(true);
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), save);
  await page.goto('/');
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  return save;
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`pause debrief remains frozen and its primary action is reachable at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await fixture(page);
    await page.keyboard.press('Escape');
    const dialog = paused(page);
    await expect(dialog).toBeVisible();
    const resume = dialog.getByRole('button', { name: '继续训练', exact: true });
    await expect(resume).toBeFocused(); await expect(resume).toBeInViewport();
    await expect(dialog.getByRole('region', { name: '当前训练快照' })).toContainText('十万卡炼丹炉');
    await expect(dialog).toContainText('返回终端只保留最近检查点');
    const metrics = await dialog.locator('.run-metrics').innerText();
    await page.waitForTimeout(220); expect(await dialog.locator('.run-metrics').innerText()).toBe(metrics);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`pause-${viewport.width}x${viewport.height}.png`) });
    if (viewport.height < 450) {
      const display = dialog.getByRole('button', { name: '全屏显示', exact: true });
      await display.scrollIntoViewIfNeeded(); await expect(display).toBeInViewport();
      expect(await dialog.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await page.screenshot({ path: info.outputPath('pause-short-screen-scrolled.png') });
    }
    await dialog.getByRole('button', { name: '操作指南', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.game-canvas canvas')).toBeFocused();
  });
}

test('a real defeat retains its checkpoint and explains a blocked restore without leaving the result', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const saved = await fixture(page, 1, 1);
  const original = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  // Ordinary movement into the first enemy or gap. No live world state is modified.
  await page.keyboard.down('d');
  try { await expect(defeated(page)).toBeVisible({ timeout: 15000 }); }
  finally { await page.keyboard.up('d'); }
  const dialog = defeated(page);
  await expect(dialog.getByRole('region', { name: '本次失败结果' })).toContainText('中文房间');
  await expect(dialog.getByRole('region', { name: '保留的安全检查点' })).toContainText('恢复时：HP 1');
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(original);
  await expect(dialog.getByRole('button', { name: '从检查点恢复', exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath('defeat-checkpoint.png') });

  await page.evaluate(() => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('pdoom.save.')) throw new DOMException('Test quota is full', 'QuotaExceededError');
      originalSet.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: '从检查点恢复', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('新尝试未开始');
  await expect(dialog.getByRole('alert')).toContainText('原检查点保留');
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(original);
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath('defeat-restore-storage-error.png') });
  await dialog.getByRole('button', { name: '新一轮训练', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '开始新的训练？', exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '保留当前进度', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('pdoom.save.v1')))!)).toMatchObject({ stage: saved.stage, hp: saved.hp, checkpoint: 0 });
});

/** Read the original Gato HP strip from the native canvas, not an engine/world position. */
async function gatoAim(page: Page) {
  return page.evaluate(() => new Promise<{ x: number; y: number } | null>((resolve, reject) => {
    requestAnimationFrame(async () => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Expected the native game canvas');
        const image = new Image(); image.src = canvas.toDataURL('image/png'); await image.decode();
        const probe = document.createElement('canvas'); probe.width = 640; probe.height = 360;
        const context = probe.getContext('2d'); if (!context) throw Error('No public screenshot reader');
        context.drawImage(image, 0, 0); const data = context.getImageData(0, 0, 640, 360).data;
        const hp = (x: number, y: number) => { const i = (y * 640 + x) * 4; return data[i] === 235 && data[i + 1] === 170 && data[i + 2] === 123 && data[i + 3] === 255; };
        let best: { x: number; y: number; width: number } | null = null;
        for (let y = 80; y < 300; y++) for (let x = 0; x < 640; x++) {
          if (!hp(x, y)) continue;
          const left = x; while (x + 1 < 640 && hp(x + 1, y)) x++;
          const width = x - left + 1;
          if (width >= 3 && width <= 64 && hp(left, y + 3) && (!best || width > best.width)) best = { x: left, y, width };
        }
        resolve(best ? { x: best.x + 32, y: best.y + 51 } : null);
      } catch (error) { reject(error); }
    });
  }));
}

test('ordinary Gato checkpoint combat opens the chapter debrief and Enter continues the same attempt', async ({ page }, info) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 1280, height: 800 });
  // A supported saved build, not a fresh campaign or a claimed earned progression path.
  const original: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 2, elapsedMs: 10000, doom: 85, tokens: 137, score: 4567,
    inventory: ['constitutional', 'recursive', 'temperature'], upgrades: ['reinforced', 'overclocked', 'expanded'], donated: true };
  expect(isGameSave(original)).toBe(true);
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), original);
  await page.goto('/'); await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  const attempt = await assertCheckpointAttempt(page, original);
  await page.keyboard.press('d', { delay: 3400 });
  const next = page.getByRole('button', { name: '进入第二章', exact: true });
  const observedPhases = new Set<string>();
  const box = await page.locator('canvas').boundingBox(); expect(box).not.toBeNull();
  let aiming = false;
  try {
    for (let step = 0; step < 100 && !await next.isVisible(); step++) {
      await expect(defeated(page)).toHaveCount(0);
      observedPhases.add(await page.locator('.mission-console .objective').innerText());
      const aim = await gatoAim(page);
      if (aim) {
        await page.mouse.move(box!.x + aim.x * box!.width / 640, box!.y + aim.y * box!.height / 360);
        if (!aiming) { await page.mouse.down(); aiming = true; }
      }
      await page.waitForTimeout(60);
    }
    await expect(next).toBeVisible();
  } finally { await page.mouse.up(); await page.keyboard.up('d'); }
  const dialog = page.getByRole('dialog', { name: '中文房间与迷幻森林已突破。', exact: true });
  await expect(dialog).toBeVisible(); await expect(next).toBeFocused(); await expect(next).toBeInViewport();
  await expect(dialog.getByRole('list', { name: '五章进度' }).locator('li')).toHaveCount(5);
  await expect(dialog.locator('.run-chapter-route li[data-state="complete"]')).toHaveCount(1);
  await expect(dialog.locator('.run-chapter-route li[data-state="next"]')).toHaveCount(1);
  await expect(dialog).toContainText('下一站：回形针无尽工厂。');
  const won: GameSaveData = await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!));
  expect(won).toMatchObject({ runId: attempt.runId, seed: original.seed, stage: 2, checkpoint: 0, donated: original.donated, inventory: original.inventory, upgrades: original.upgrades });
  expect(won.hp).toBeGreaterThan(0); expect(won.actionCounts.shots).toBeGreaterThan(0); expect(won.elapsedMs).toBeGreaterThan(original.elapsedMs);
  await info.attach('supported-checkpoint-combat-evidence', { body: JSON.stringify({ scope: 'supported stage1 checkpoint2 combat, not a fresh full campaign', original, attempt, won, observedPhases: [...observedPhases] }), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('chapter-clear-real-gato.png') });
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.world-titlebar')).toContainText('回形针无尽工厂');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!).runId)).toBe(attempt.runId);
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
  await expect(paused(page)).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('chapter-two-same-attempt.png') });
});
