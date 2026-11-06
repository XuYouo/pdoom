import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';

const ITEMS = [
  ['constitutional', '宪法毛线'], ['recursive', '递归自升级'], ['interpretability', '机械可解释性'],
  ['residual', '残差连接'], ['lisp', 'Lisp 符号校验'], ['context-expansion', '128K 上下文卷轴'], ['temperature', '高温采样'],
] as const;
const VIEWS = [{ name: 'desktop720', width: 1280, height: 720 }, { name: 'short', width: 844, height: 500 }, { name: 'portrait', width: 390, height: 844 }] as const;
const room = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const saved = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
const evidence = new WeakMap<Page, { errors: string[]; writes: string[]; observations: unknown[] }>();
test.setTimeout(60000);
test.beforeEach(({ page }) => {
  const value = { errors: [] as string[], writes: [] as string[], observations: [] as unknown[] }; evidence.set(page, value);
  page.on('pageerror', error => value.errors.push(error.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) value.writes.push(r.method() + ' ' + r.url()); });
});
test.afterEach(async ({ page }, info) => {
  const value = evidence.get(page)!;
  await info.attach('real-rest-icon-controls', { body: JSON.stringify(value), contentType: 'application/json' });
  expect(value.errors).toEqual([]); expect(value.writes).toEqual([]);
});
async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name + '.png'); await page.screenshot({ path, fullPage: false }); await info.attach(name, { path, contentType: 'image/png' });
}
async function native(page: Page) {
  return page.evaluate(() => new Promise<{ at: number; png: string; colors: number; opaque: number }>((resolve, reject) => requestAnimationFrame(at => {
    try {
      const source = document.querySelector('canvas'); if (!source || source.width !== 640 || source.height !== 360) throw Error('Actual native canvas required');
      const copy = document.createElement('canvas'); copy.width = 640; copy.height = 360;
      const ctx = copy.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('2D copy required'); ctx.drawImage(source, 0, 0);
      const data = ctx.getImageData(0, 0, 640, 360).data, colors = new Set<number>(); let opaque = 0;
      for (let i = 0; i < data.length; i += 4) { opaque += Number(data[i + 3] === 255); colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]); }
      resolve({ at, png: copy.toDataURL('image/png'), colors: colors.size, opaque });
    } catch (error) { reject(error); }
  })));
}
for (const viewport of VIEWS) test(`rest relic icons ${viewport.name}: real icon clicks preserve frozen transactions and saved identity`, async ({ page }, info) => {
  const initial: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 11, hp: 60, tokens: 200, doom: 60, elapsedMs: 12000, inventory: ['constitutional', 'recursive', 'residual'] };
  expect(isGameSave(initial)).toBe(true); await page.setViewportSize(viewport);
  await page.addInitScript(value => {
    const key = 'r45.initial.' + value.runId;
    if (sessionStorage.getItem(key) === null) { sessionStorage.setItem(key, '1'); if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); }
  }, initial);
  await page.goto('/'); const restore = page.getByRole('button', { name: '恢复检查点', exact: true }); await expect(restore).toBeEnabled({ timeout: 15000 }); await restore.click();
  const dialog = room(page); await expect(dialog).toBeVisible(); const attempt = await assertCheckpointAttempt(page, initial), bytes = await saved(page);
  const next = dialog.getByRole('button', { name: '不再交易，继续前进', exact: true }); await expect(next).toBeFocused();
  const footer = await next.boundingBox(); expect(footer).not.toBeNull(); await capture(page, info, viewport.name + '-initial');
  const before = await native(page); expect(before.opaque).toBe(640 * 360); expect(before.colors).toBeGreaterThan(20);
  const paths: string[] = [];
  for (const [id, name] of ITEMS) {
    const button = dialog.getByRole('button', { name: `查看 ${name}效果`, exact: true }); await button.hover();
    const svg = button.locator('svg'); await expect(svg).toHaveAttribute('aria-hidden', 'true'); await expect(svg).toHaveAttribute('focusable', 'false');
    const geometry = await svg.evaluate(node => {
      if (!(node instanceof SVGSVGElement)) throw Error('Real SVG required');
      const path = node.querySelector('path'); if (!path) throw Error('Real path required'); const b = path.getBBox(), r = node.getBoundingClientRect();
      let point: { x: number; y: number } | null = null;
      for (let y = 2; y < 14 && !point; y++) for (let x = 2; x < 14; x++) if (path.isPointInFill(new DOMPoint(x + .5, y + .5))) { point = { x: (x + .5) * r.width / 16, y: (y + .5) * r.height / 16 }; break; }
      return { path: path.getAttribute('d'), bbox: { x: b.x, y: b.y, width: b.width, height: b.height }, width: r.width, height: r.height, fill: getComputedStyle(path).fill, point };
    });
    expect(geometry.width).toBe(25); expect(geometry.height).toBe(25); expect(geometry.fill).toBe('rgb(200, 185, 130)');
    expect(geometry.bbox.width).toBeGreaterThan(8); expect(geometry.bbox.height).toBeGreaterThan(8);
    expect(geometry.bbox.x).toBeGreaterThanOrEqual(0); expect(geometry.bbox.y).toBeGreaterThanOrEqual(0);
    expect(geometry.bbox.x + geometry.bbox.width).toBeLessThanOrEqual(16); expect(geometry.bbox.y + geometry.bbox.height).toBeLessThanOrEqual(16);
    expect(geometry.point).not.toBeNull(); await svg.click({ position: geometry.point! }); // ordinary trusted click on an actually painted icon point
    await expect(button).toBeFocused(); await expect(button).toHaveAttribute('aria-pressed', 'true'); await expect(button).toBeInViewport({ ratio: 1 });
    const detail = dialog.getByRole('region', { name: '选中词条详情', exact: true }); await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(detail.locator('svg path')).toHaveAttribute('d', geometry.path!); paths.push(geometry.path!);
    const currentFooter = await next.boundingBox(); expect(currentFooter).toEqual(footer); await expect(next).toBeInViewport({ ratio: 1 }); expect(await saved(page)).toBe(bytes);
    const image = info.outputPath(id + '-actual-icon.png'); await svg.screenshot({ path: image }); await info.attach(id + '-actual-icon', { path: image, contentType: 'image/png' });
    evidence.get(page)!.observations.push({ id, name, geometry, footer: currentFooter });
    if (id === 'interpretability' || id === 'temperature') await capture(page, info, viewport.name + '-' + id);
  }
  expect(new Set(paths).size).toBe(7); expect(await dialog.locator('svg[tabindex], svg a, svg [tabindex]').count()).toBe(0);
  await page.keyboard.press('j'); await page.keyboard.press('q'); await page.keyboard.press('Escape'); await page.waitForTimeout(1100);
  const after = await native(page); expect(after.at - before.at).toBeGreaterThanOrEqual(1100); expect(after.opaque).toBe(640 * 360); expect(after.colors).toBeGreaterThan(20); expect(after.png).toBe(before.png); expect(await saved(page)).toBe(bytes);
  for (const [name, frame] of [['frozen-before', before], ['frozen-after', after]] as const) {
    const path = info.outputPath(name + '.png'); await writeFile(path, Buffer.from(frame.png.split(',')[1], 'base64')); await info.attach(name, { path, contentType: 'image/png' });
  }
  await dialog.getByRole('button', { name: '购买 高温采样', exact: true }).click();
  const purchased = { ...attempt, tokens: 170, inventory: [...attempt.inventory, 'temperature'] };
  await expect.poll(async () => JSON.parse((await saved(page))!)).toEqual(purchased);
  await expect(dialog.getByRole('button', { name: '购买 高温采样', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '奖励劫持 Lisp 符号校验', exact: true }).click();
  const hacked = { ...purchased, doom: 85, checkpoint: 21, inventory: [...purchased.inventory, 'lisp'] };
  await expect.poll(async () => JSON.parse((await saved(page))!)).toEqual(hacked);
  await expect(dialog.getByRole('button', { name: '奖励劫持 机械可解释性', exact: true })).toBeDisabled(); await capture(page, info, viewport.name + '-real-transactions');
  evidence.get(page)!.observations.push({ label: 'actual-purchase-and-hack', before: attempt, purchased, hacked, frozenMs: after.at - before.at });
  await page.reload(); await expect(restore).toBeEnabled({ timeout: 15000 }); await restore.click(); await expect(room(page)).toBeVisible();
  const resumed = await assertCheckpointAttempt(page, hacked as GameSaveData); await expect(next).toBeFocused();
  await room(page).getByRole('button', { name: '查看 Lisp 符号校验效果', exact: true }).click();
  await expect(room(page).getByRole('button', { name: '查看 Lisp 符号校验效果', exact: true }).locator('svg path')).toHaveAttribute('d', paths[4]);
  await expect(room(page).getByRole('button', { name: '购买 Lisp 符号校验', exact: true })).toBeDisabled();
  await next.click(); await expect(room(page)).toHaveCount(0); expect(JSON.parse((await saved(page))!)).toEqual({ ...resumed, checkpoint: 1 });
  evidence.get(page)!.observations.push({ label: 'real-restored-continue', resumed, continued: JSON.parse((await saved(page))!) });
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '暂停前向传播。', exact: true })).toBeVisible();
});
