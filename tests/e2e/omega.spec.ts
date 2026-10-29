import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { contextStates, observeNativeContexts } from './audio-probe';

test.setTimeout(60000);
const completed = (doom: number): GameSaveData => ({
  ...createRun(randomUUID(), 42), stage: 5, checkpoint: 90, hp: 84, doom, tokens: 153,
  score: 3456, elapsedMs: 125000, donated: true, inventory: ['constitutional', 'recursive'], upgrades: ['calibrated'],
  actionCounts: { shots: 180, dashes: 12, rewinds: 7, insights: 9 },
});
async function openSave(page: Page, save: GameSaveData) {
  await page.addInitScript(value => {
    const key = `omega.fixture.${value.runId}`;
    if (!sessionStorage.getItem(key)) { localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(key, 'once'); }
  }, save);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始新训练' })).toBeEnabled({ timeout: 15000 });
}
const currentSave = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'));

// These are honest completed-save presentation/lifecycle cases, not claims of browser combat victories.
for (const [ending, doom, title] of [['aligned', 8, '三好毛绒玩偶'], ['warden', 55, '守望者'], ['foom', 88, '回形针宇宙']] as const) {
  test(`completed ${ending} save replays its real ending without rewards, simulation or automatic score upload`, async ({ page }) => {
    const errors: string[] = [], popups: Page[] = [], uploads: string[] = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('popup', popup => popups.push(popup));
    page.on('request', request => { if (request.url().endsWith('/api/submitscoreapi')) uploads.push(request.method()); });
    await observeNativeContexts(page);
    if (ending === 'foom') await page.emulateMedia({ reducedMotion: 'reduce' });
    const save = completed(doom); await openSave(page, save);
    await page.getByRole('button', { name: '回看结局', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '最终结局', exact: true });
    await expect(dialog).toBeVisible(); await expect(dialog).toContainText(title);
    // The game now owns the whole window; endings may use its letterbox area, but cannot escape that root.
    const bounds = await dialog.boundingBox(), viewport = await page.locator('.game-shell').boundingBox();
    expect(bounds).not.toBeNull(); expect(viewport).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(viewport!.x - 1); expect(bounds!.y).toBeGreaterThanOrEqual(viewport!.y - 1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
    if (ending === 'foom') {
      await expect(dialog.locator('.ending-paperclips span')).toHaveCount(24);
      expect(await dialog.locator('.ending-stage *').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationName === 'none'))).toBe(true);
    }
    await expect(page.locator('.world-titlebar strong')).toHaveText('05');
    expect(await currentSave(page)).toEqual(save);
    await page.keyboard.down('j'); await page.keyboard.down('d'); await page.waitForTimeout(250);
    await page.keyboard.up('d'); await page.keyboard.up('j');
    expect(await currentSave(page)).toEqual(save);
    await expect.poll(() => contextStates(page)).toEqual([]); // Replaying a frozen ending is not a music-unlock gesture.
    await page.screenshot({ path: `artifacts/browser/ending-${ending}.png`, fullPage: true });
    await dialog.getByRole('button', { name: /查看结算/ }).click();
    await expect(page.getByRole('region', { name: '本局成绩上传' })).toBeVisible();
    await expect(dialog).toContainText(new RegExp(`${doom}(?:\\.0+)?%`));
    expect(uploads).toEqual([]); expect(popups).toEqual([]);
    expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
    expect(await currentSave(page)).toEqual(save);
    await dialog.getByRole('button', { name: '返回终端', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: '回看结局', exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByRole('button', { name: '回看结局', exact: true }).click();
    await expect(dialog).toContainText(title); expect(await currentSave(page)).toEqual(save);
    expect(errors).toEqual([]); expect(uploads).toEqual([]);
  });
}
