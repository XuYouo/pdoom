import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';
const VIEWS = [{ name: 'desktop720', width: 1280, height: 720 }, { name: 'short', width: 844, height: 500 }, { name: 'portrait', width: 390, height: 844 }] as const;
const room = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const saved = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
const observations = new WeakMap<Page, { errors: string[]; writes: string[]; rows: unknown[] }>();
test.setTimeout(60000);
test.beforeEach(({ page }) => {
  const record = { errors: [] as string[], writes: [] as string[], rows: [] as unknown[] }; observations.set(page, record);
  page.on('pageerror', error => record.errors.push(error.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) record.writes.push(r.method() + ' ' + r.url()); });
});
test.afterEach(async ({ page }, info) => {
  const record = observations.get(page)!; expect.soft(record.errors).toEqual([]); expect.soft(record.writes).toEqual([]);
  await info.attach('rest-style-observations', { body: JSON.stringify(record), contentType: 'application/json' });
});
async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name + '.png'); await page.screenshot({ path, fullPage: false }); await info.attach(name, { path, contentType: 'image/png' });
}
async function native(page: Page) {
  return page.evaluate(() => new Promise<{ png: string; at: number; colors: number; opaque: number }>((resolve, reject) => requestAnimationFrame(at => {
    try {
      const source = document.querySelector('canvas'); if (!source || source.width !== 640 || source.height !== 360) throw Error('Actual native canvas required');
      const copy = document.createElement('canvas'); copy.width = 640; copy.height = 360;
      const ctx = copy.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('copy context required'); ctx.drawImage(source, 0, 0);
      const rgba = ctx.getImageData(0, 0, 640, 360).data, colors = new Set<number>(); let opaque = 0;
      for (let i = 0; i < rgba.length; i += 4) { opaque += Number(rgba[i + 3] === 255); colors.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]); }
      resolve({ png: copy.toDataURL('image/png'), at, colors: colors.size, opaque });
    } catch (error) { reject(error); }
  })));
}
async function meter(page: Page, info: TestInfo, phase: string, used: number, capacity: number, overloaded: boolean) {
  const context = room(page).locator('.context-compact'), bar = context.getByRole('progressbar');
  await expect(bar).toHaveAttribute('data-overloaded', String(overloaded)); await expect(bar).toHaveAttribute('value', String(Math.min(used, capacity)));
  await expect(bar).toHaveAttribute('max', String(capacity)); await expect(bar).toHaveAttribute('aria-label', `上下文占用 ${used}K，容量 ${capacity}K`);
  await expect(bar).toHaveCSS('height', '5px'); await expect(context.getByText('窗口满载 · 中间词条失活', { exact: true })).toHaveCount(overloaded ? 1 : 0);
  const rect = await bar.boundingBox(); expect(rect).not.toBeNull(); await expect(bar).toBeInViewport({ ratio: 1 });
  const path = info.outputPath(phase + '-meter.png'); await bar.screenshot({ path }); await info.attach(phase + '-meter', { path, contentType: 'image/png' });
  // Pixel colors are independently decoded from this actual screenshot, not inferred from accentColor.
  observations.get(page)!.rows.push({ phase, used, capacity, overloaded, rect, screenshot: phase + '-meter', actualSave: JSON.parse((await saved(page))!) });
}
for (const view of VIEWS) test(`rest visual hierarchy ${view.name}: full and overflow warn, real expansion restores normal meter`, async ({ page }, info) => {
  const initial: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 11, hp: 60, tokens: 200, doom: 60, elapsedMs: 12000, inventory: ['constitutional', 'recursive', 'residual'] };
  expect(isGameSave(initial)).toBe(true); await page.setViewportSize(view);
  await page.addInitScript(value => { const key = 'r46.initial.' + value.runId;
    if (sessionStorage.getItem(key) === null) { sessionStorage.setItem(key, 'once'); if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); }
  }, initial);
  await page.goto('/'); const restore = page.getByRole('button', { name: '恢复检查点', exact: true }); await expect(restore).toBeEnabled({ timeout: 15000 }); await restore.click();
  const dialog = room(page); await expect(dialog).toBeVisible(); const attempt = await assertCheckpointAttempt(page, initial), bytes = await saved(page);
  const next = dialog.getByRole('button', { name: '不再交易，继续前进', exact: true }); await expect(next).toBeFocused(); const footer = await next.boundingBox(); expect(footer).not.toBeNull();
  await meter(page, info, 'full', 32, 32, true); await capture(page, info, view.name + '-full');
  const context = dialog.locator('.context-compact'); await expect(context.locator('li[data-active="false"]')).toHaveCount(1);
  await expect(context.locator('li[data-active="false"]')).toContainText('递归自升级');
  await expect(context.locator('li[data-active="false"]')).toHaveCSS('background-color', 'rgb(56, 41, 32)');
  await expect(context.locator('li[data-active="true"]').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const quiet = dialog.locator('.rest-offer:not(.is-selected)').first(); await expect(quiet).toHaveCSS('border-left-color', 'rgba(0, 0, 0, 0)'); await expect(quiet).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.keyboard.press('Tab'); const focus = await page.evaluate(() => { const node = document.activeElement!; const s = getComputedStyle(node); return { inside: !!node.closest('dialog[open]'), style: s.outlineStyle, width: s.outlineWidth }; });
  expect(focus.inside).toBe(true); expect(focus.style).toBe('solid'); expect(focus.width).toBe('2px');
  await dialog.getByRole('button', { name: '查看 宪法毛线效果', exact: true }).click();
  await expect(dialog.locator('.rest-offer.is-selected')).toHaveCSS('background-color', 'rgb(50, 56, 39)');
  expect(await saved(page)).toBe(bytes); expect(await next.boundingBox()).toEqual(footer);
  const before = await native(page); expect(before.opaque).toBe(230400); expect(before.colors).toBeGreaterThan(20);
  await page.keyboard.press('j'); await page.keyboard.press('q'); await page.keyboard.press('Escape'); await page.waitForTimeout(1100);
  const after = await native(page); expect(after.at - before.at).toBeGreaterThanOrEqual(1100); expect(after.opaque).toBe(230400); expect(after.colors).toBeGreaterThan(20); expect(after.png).toBe(before.png); expect(await saved(page)).toBe(bytes);
  for (const [label, frame] of [['frozen-before', before], ['frozen-after', after]] as const) await info.attach(label, { body: Buffer.from(frame.png.split(',')[1], 'base64'), contentType: 'image/png' });
  await context.getByRole('button', { name: '下移 宪法毛线', exact: true }).click();
  const reordered: GameSaveData = { ...attempt, inventory: ['recursive', 'constitutional', 'residual'] };
  await expect.poll(async () => JSON.parse((await saved(page))!)).toEqual(reordered);
  await expect(context.locator('li[data-active="false"]')).toHaveCount(1); await expect(context.locator('li[data-active="false"]')).toContainText('宪法毛线');
  await expect(context.locator('li[data-active="false"]')).toHaveCSS('background-color', 'rgb(56, 41, 32)');
  await dialog.getByRole('button', { name: '购买 高温采样', exact: true }).click();
  const overflow: GameSaveData = { ...reordered, tokens: 170, inventory: [...reordered.inventory, 'temperature'] };
  await expect.poll(async () => JSON.parse((await saved(page))!)).toEqual(overflow); await expect(context.locator('li[data-active="false"]')).toHaveCount(2);
  await meter(page, info, 'overflow', 42, 32, true); await capture(page, info, view.name + '-overflow');
  await dialog.getByRole('button', { name: '购买 128K 上下文卷轴', exact: true }).click();
  const expanded: GameSaveData = { ...overflow, tokens: 118, inventory: [...overflow.inventory, 'context-expansion'] };
  await expect.poll(async () => JSON.parse((await saved(page))!)).toEqual(expanded);
  await expect(context.locator('li[data-active="false"]')).toHaveCount(0); await expect(context.locator('li[data-active="true"]')).toHaveCount(5);
  await meter(page, info, 'expanded', 54, 128, false); await capture(page, info, view.name + '-expanded');
  expect(await next.boundingBox()).toEqual(footer); await expect(next).toBeInViewport({ ratio: 1 });
  await page.reload(); await expect(restore).toBeEnabled({ timeout: 15000 }); await restore.click(); await expect(room(page)).toBeVisible();
  const resumed = await assertCheckpointAttempt(page, expanded); await expect(next).toBeFocused(); await meter(page, info, 'restored', 54, 128, false);
  await next.click(); await expect(room(page)).toHaveCount(0); expect(JSON.parse((await saved(page))!)).toEqual({ ...resumed, checkpoint: 1 });
  observations.get(page)!.rows.push({ phase: 'actual-restored-continue', actualSave: JSON.parse((await saved(page))!), frozenMs: after.at - before.at });
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '暂停前向传播。', exact: true })).toBeVisible();
});
