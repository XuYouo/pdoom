import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { proveRater, captureRaterCanvas, wrongRaterPng } from './human-rater-pixels';
import { inspectPickups, pickupSource } from './pickup-pixels';
const rest = (p: Page) => p.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const saved = (p: Page) => p.evaluate(() => localStorage.getItem('pdoom.save.v1'));
const failures = new WeakMap<Page, { errors: string[]; mutations: string[] }>();
test.setTimeout(60000);
test.beforeEach(({ page }) => {
  const value = { errors: [] as string[], mutations: [] as string[] }; failures.set(page, value);
  page.on('pageerror', error => value.errors.push(error.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) value.mutations.push(r.url()); });
});
test.afterEach(async ({ page }, info) => {
  await info.attach('no-script-world-writes-or-api-mutations', { body: JSON.stringify(failures.get(page)), contentType: 'application/json' });
  expect(failures.get(page)!.errors).toEqual([]); expect(failures.get(page)!.mutations).toEqual([]);
});
async function fixture(page: Page, stage = 3, checkpoint = 11) {
  const save: GameSaveData = { ...createRun(randomUUID(), 42), stage, checkpoint, hp: 90, doom: 60, tokens: 200, elapsedMs: 12000,
    inventory: ['constitutional', 'recursive', 'residual'] };
  expect(isGameSave(save)).toBe(true);
  await page.addInitScript(value => {
    const marker = `r36-native-rater.${value.runId}`;
    if (!sessionStorage.getItem(marker)) { if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(marker, 'once'); }
  }, save);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/'); return save;
}
async function restore(page: Page, previous: GameSaveData) {
  const button = page.getByRole('button', { name: '恢复检查点', exact: true }); await expect(button).toBeEnabled({ timeout: 15000 });
  await button.click(); const attempt = await assertCheckpointAttempt(page, previous); await expect(rest(page)).toBeVisible(); return attempt;
}
for (const stage of [1, 2, 3, 4, 5]) for (const room of [1, 2]) test(`real chapter${stage} room${room} native workstation and48-square portrait share settled truth`, async ({ page }, info) => {
  const original = await fixture(page, stage, 10 + room), attempt = await restore(page, original);
  const proof = await proveRater(page, info, 'neutral', 'settled');
  const mark = rest(page).getByRole('img', { name: /^人类标注员：/ }); await expect(mark).toHaveText('已结算'); await expect(mark).toHaveAttribute('data-rater-pose', 'neutral');
  if (stage === 1 || stage === 4) {
    const capture = { png: 'data:image/png;base64,' + proof.canvas.toString('base64'), at: 0, hud: [], objective: '', title: '', notice: '' };
    const actual = inspectPickups(capture, await pickupSource(), stage), foot = { x: proof.world.x + 32, y: proof.world.y + 60 };
    expect(actual.supports.some(s => s.y === foot.y && proof.world.x + 7 >= s.x && proof.world.x + 59 <= s.x + s.width), 'Same raw PNG contains the native supporting surface beneath the desk feet').toBe(true);
    await info.attach('source-matched-visible-ground', { body: JSON.stringify({ foot, supports: actual.supports }), contentType: 'application/json' });
  }
  const before = await saved(page); await page.waitForTimeout(200); expect(await captureRaterCanvas(page)).toEqual(proof.canvas); expect(await saved(page)).toBe(before);
  expect(JSON.parse(before!)).toEqual(attempt); await expect(page.locator('canvas')).toHaveCount(1);
});
test('actual native portrait stays bounded on desktop while narrow and short menus retain reachable exits', async ({ page }, info) => {
  await restore(page, await fixture(page)); const before = await saved(page), pixels = await captureRaterCanvas(page);
  for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 800, height: 450 }]) {
    await page.setViewportSize(size); const continueButton = rest(page).getByRole('button', { name: '不再交易，继续前进', exact: true });
    await expect(continueButton).toBeVisible(); const box = await continueButton.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(size.height - 5);
    const bounded = await rest(page).evaluate(node => ({ scroll: node.scrollHeight, client: node.clientHeight, width: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(bounded.scroll).toBeLessThanOrEqual(bounded.client + 1); expect(bounded.width).toBeLessThanOrEqual(bounded.viewport);
    if (size.width === 1280) await proveRater(page, info, 'neutral', 'desktop');
    else await expect(page.locator('.rest-station-mark')).toBeHidden();
    await info.attach(`actual-menu-${size.width}x${size.height}`, { body: await page.screenshot(), contentType: 'image/png' });
    expect(await saved(page)).toBe(before); expect(await captureRaterCanvas(page)).toEqual(pixels);
  }
  await page.setViewportSize({ width: 1280, height: 720 }); await expect(rest(page).getByRole('button', { name: '不再交易，继续前进', exact: true })).toBeFocused();
});
const defects = ['png-request', 'json-request', 'unused-hacked-missing', 'unused-hacked-alias', 'unused-hacked-width', 'png-natural65'] as const;
for (const defect of defects) test(`rater ${defect} refuses both source and actual-attempt bytes then real retry restores native art`, async ({ page }, info) => {
  const pattern = defect.startsWith('png-') ? '**/game/human-rater.png' : '**/game/human-rater.json';
  const breakResource = async (route: Route) => {
    if (defect.endsWith('-request')) { await route.abort('failed'); return; }
    if (defect === 'png-natural65') { await route.fulfill({ contentType: 'image/png', body: wrongRaterPng(await readFile('public/game/human-rater.png')) }); return; }
    const response = await route.fetch(), atlas = await response.json() as { frames: { frame: { x: number; w: number } }[] };
    expect(atlas.frames).toHaveLength(4);
    if (defect === 'unused-hacked-missing') atlas.frames.pop();
    if (defect === 'unused-hacked-alias') atlas.frames[3].frame.x = 128;
    if (defect === 'unused-hacked-width') atlas.frames[3].frame.w = 63;
    await route.fulfill({ response, json: atlas });
  };
  const failure = async (bytes: string) => {
    await expect(page.getByLabel('游戏资源加载失败', { exact: true }).getByText('Human Rater 工作台资源加载失败。请检查网络后重试；本地检查点未改动。', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled(); expect(await saved(page)).toBe(bytes);
  };
  await page.route(pattern, breakResource); const original = await fixture(page), originalBytes = JSON.stringify(original); await failure(originalBytes);
  await page.unroute(pattern, breakResource); await page.getByRole('button', { name: '刷新并重试', exact: true }).click();
  const attempt = await restore(page, original); await proveRater(page, info, 'neutral', 'healthy-actual-attempt');
  const attemptBytes = (await saved(page))!;
  await page.route(pattern, breakResource); await page.reload(); await failure(attemptBytes);
  await page.unroute(pattern, breakResource); await page.getByRole('button', { name: '刷新并重试', exact: true }).click();
  const retried = await restore(page, attempt); await proveRater(page, info, 'neutral', 'healthy-new-retry');
  expect(JSON.parse((await saved(page))!)).toEqual(retried); await expect(page.locator('canvas')).toHaveCount(1);
});
