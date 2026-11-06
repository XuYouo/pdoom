import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';
// Actual UI from legal initial rest. No private World, fake DOM or post-start save mutation.
const OFFERS = ['修补毛线', '宪法毛线', '递归自升级', '机械可解释性', '残差连接', 'Lisp 符号校验',
  '128K 上下文卷轴', '高温采样', '加固安全围栏', 'GPU 超频', '永久内存扩容', '梯度校准', '蛇怪募捐箱'];
const VIEWS = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'desktop720', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 }, { name: 'short', width: 844, height: 500 }] as const;
const room = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const next = (page: Page) => room(page).getByRole('button', { name: '不再交易，继续前进', exact: true });
const saved = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
const observations = new WeakMap<Page, { errors: string[]; writes: string[]; metrics: unknown[] }>();
test.setTimeout(60000);
test.beforeEach(({ page }) => {
  const value = { errors: [] as string[], writes: [] as string[], metrics: [] as unknown[] }; observations.set(page, value);
  page.on('pageerror', error => value.errors.push(error.message));
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) value.writes.push(`${request.method()} ${request.url()}`);
  });
});
test.afterEach(async ({ page }, info) => {
  const value = observations.get(page)!, path = info.outputPath('rest-layout-metrics.json');
  await writeFile(path, JSON.stringify({ method: 'Actual modal, ordinary input, native DOM geometry and screenshots', ...value }, null, 2));
  await info.attach('layout-metrics', { path, contentType: 'application/json' }); expect(value.errors).toEqual([]); expect(value.writes).toEqual([]);
});
async function boot(page: Page, viewport: { width: number; height: number }) {
  const original: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 11, hp: 60, tokens: 200, doom: 60, elapsedMs: 12000,
    inventory: ['constitutional', 'recursive', 'residual'] };
  expect(isGameSave(original)).toBe(true); await page.setViewportSize(viewport);
  await page.addInitScript(value => {
    const marker = `r27.rest-layout.${value.runId}`;
    if (sessionStorage.getItem(marker) === null) {
      sessionStorage.setItem(marker, 'once');
      if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(value));
    }
  }, original);
  await page.goto('/'); await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click(); await expect(room(page)).toBeVisible();
  expect(await room(page).evaluate(node => node instanceof HTMLDialogElement && node.open)).toBe(true);
  const attempt = await assertCheckpointAttempt(page, original), bytes = await saved(page); expect(bytes).not.toBeNull();
  await expect(next(page)).toHaveCount(1); await expect(next(page)).toBeFocused();
  await expect(room(page).getByRole('button', { name: '关闭弹窗', exact: true })).toHaveCount(0); return { attempt, bytes };
}
async function geometry(page: Page, label: string) {
  const value = await room(page).evaluate(node => {
    const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const element = (selector: string) => { const result = node.querySelector(selector); if (!(result instanceof HTMLElement)) throw Error(`Missing actual element ${selector}`); return result; };
    const header = element(':scope > header'), footer = element('.rest-footer'), button = element('button[aria-label="不再交易，继续前进"]');
    const offers = element('.rest-offers'), body = element('.rest-body'), b = button.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2), popup = node.querySelector('.rest-rules[open] > div');
    return { viewport: { width: innerWidth, height: innerHeight }, dialog: rect(node), header: rect(header), footer: rect(footer), button: rect(button),
      body: rect(body), popup: popup ? rect(popup) : null, documentWidth: document.documentElement.scrollWidth,
      dialogWidth: node.scrollWidth, dialogClientWidth: node.clientWidth, dialogScrollTop: node.scrollTop,
      offersScrollTop: offers.scrollTop, offersScrollHeight: offers.scrollHeight, offersClientHeight: offers.clientHeight,
      continueCenterHit: !!hit && (hit === button || button.contains(hit)) };
  });
  observations.get(page)!.metrics.push({ label, geometry: value }); return value;
}
type Geometry = Awaited<ReturnType<typeof geometry>>;
function bounded(value: Geometry) {
  const { dialog, footer, button, viewport } = value;
  expect(dialog.width).toBeGreaterThan(0); expect(dialog.height).toBeGreaterThan(0);
  expect(dialog.x).toBeGreaterThanOrEqual(0); expect(dialog.y).toBeGreaterThanOrEqual(0);
  expect(dialog.right).toBeLessThanOrEqual(viewport.width + 1); expect(dialog.bottom).toBeLessThanOrEqual(viewport.height + 1);
  expect(value.documentWidth).toBeLessThanOrEqual(viewport.width + 1); expect(value.dialogWidth).toBeLessThanOrEqual(value.dialogClientWidth + 1);
  expect(value.body.height).toBeGreaterThan(60); expect(value.offersClientHeight).toBeGreaterThan(40);
  expect(footer.y).toBeGreaterThanOrEqual(dialog.y); expect(Math.abs(footer.bottom - dialog.bottom), 'Footer at bounded modal bottom').toBeLessThanOrEqual(3);
  expect(button.x).toBeGreaterThanOrEqual(dialog.x); expect(button.right).toBeLessThanOrEqual(dialog.right + 1);
  expect(button.y).toBeGreaterThanOrEqual(footer.y); expect(button.bottom).toBeLessThanOrEqual(footer.bottom + 1);
  expect(value.continueCenterHit, 'Actual continue center must remain unobscured').toBe(true);
  if (value.popup) {
    expect(value.popup.x).toBeGreaterThanOrEqual(0); expect(value.popup.y).toBeGreaterThanOrEqual(0);
    expect(value.popup.right).toBeLessThanOrEqual(viewport.width + 1); expect(value.popup.bottom).toBeLessThanOrEqual(viewport.height + 1);
  }
}
function fixed(before: Geometry, after: Geometry) {
  for (const part of ['header', 'footer'] as const) {
    expect(Math.abs(after[part].y - before[part].y), `${part} must not scroll away`).toBeLessThanOrEqual(1);
    expect(Math.abs(after[part].bottom - before[part].bottom)).toBeLessThanOrEqual(1);
  }
  expect(after.dialogScrollTop).toBe(0); bounded(after);
}
async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`); await page.screenshot({ path, fullPage: false });
  await info.attach(name, { path, contentType: 'image/png' });
}
for (const viewport of VIEWS) test(`rest menu ${viewport.name} ${viewport.width}x${viewport.height}: fixed actions, selection and zero-spend continue`, async ({ page }, info) => {
  const { attempt, bytes } = await boot(page, viewport), dialog = room(page);
  await expect(dialog).toContainText('CHAPTER 01 / SAFE ROOM 01'); await expect(dialog).toContainText('200 TOK');
  await expect(dialog.getByRole('list', { name: '已装备词条顺序', exact: true }).getByRole('listitem')).toHaveCount(3);
  await expect(dialog.locator('.rest-offer-select')).toHaveCount(13);
  const start = await geometry(page, 'initial'); bounded(start); await capture(page, info, `${viewport.name}-initial`);
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible(); expect(await saved(page)).toBe(bytes);
  // Actual wheel/Tab, never assigning scrollTop or overriding CSS.
  expect(start.offersScrollHeight).toBeGreaterThan(start.offersClientHeight);
  await dialog.locator('.rest-offers').hover(); await page.mouse.wheel(0, 1600);
  await expect.poll(() => dialog.locator('.rest-offers').evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  fixed(start, await geometry(page, 'list-wheel'));
  const budget = await dialog.locator('button:not([disabled]), summary').count(); expect(budget).toBeGreaterThan(13); expect(budget).toBeLessThanOrEqual(80);
  const reached = new Set<string>();
  for (let i = 0; i <= budget; i++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ inside: !!document.activeElement?.closest('dialog[open]'), name: document.activeElement?.getAttribute('aria-label') ?? '' }));
    expect(focus.inside, `Native Tab${i} stays in modal`).toBe(true);
    const match = /^查看 (.+)效果$/.exec(focus.name);
    if (match) {
      reached.add(match[1]); const selector = dialog.getByRole('button', { name: focus.name, exact: true });
      await expect(selector).toHaveAttribute('aria-pressed', 'true'); await expect(selector).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole('region', { name: '选中词条详情', exact: true }).getByRole('heading', { name: match[1], exact: true })).toBeVisible();
    }
  }
  expect([...reached].sort()).toEqual([...OFFERS].sort()); observations.get(page)!.metrics.push({ label: 'keyboard-offers', budget, reached: [...reached] });
  expect(await saved(page), 'Keyboard selection cannot transact').toBe(bytes); fixed(start, await geometry(page, 'keyboard-tour'));
  await dialog.getByRole('button', { name: '查看 高温采样效果', exact: true }).click();
  const detail = dialog.getByRole('region', { name: '选中词条详情', exact: true });
  await expect(detail.getByRole('heading', { name: '高温采样', exact: true })).toBeVisible(); await expect(detail).toContainText('185ms → 148ms');
  await expect(dialog.getByRole('button', { name: '购买 高温采样', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: '购买 宪法毛线', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '奖励劫持 梯度校准', exact: true })).toBeEnabled();
  expect(await saved(page), 'Pointer selection cannot purchase/hack').toBe(bytes); fixed(start, await geometry(page, 'pointer-selection'));
  const rules = dialog.locator('.rest-rules'); await rules.locator('summary').click(); await expect(rules).toHaveAttribute('open', '');
  fixed(start, await geometry(page, 'rules-open')); await capture(page, info, `${viewport.name}-rules`);
  await rules.locator('summary').click(); await expect(rules).not.toHaveAttribute('open', ''); fixed(start, await geometry(page, 'rules-closed'));
  expect(await saved(page)).toBe(bytes); await capture(page, info, `${viewport.name}-menu`);
  await next(page).click(); await expect(dialog).toHaveCount(0);
  const continued = JSON.parse((await saved(page))!) as GameSaveData; expect(continued).toEqual({ ...attempt, checkpoint: 1 });
  observations.get(page)!.metrics.push({ label: 'actual-zero-spend-continue', before: attempt, after: continued });
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '暂停前向传播。', exact: true })).toBeVisible();
});
