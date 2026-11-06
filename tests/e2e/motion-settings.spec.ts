import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
const KEY = 'pdoom.motion.v1';
const root = (page: Page) => page.locator('.game-shell');
async function ready(page: Page) {
  await page.goto('/'); await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeEnabled({ timeout: 15000 });
}
async function settings(page: Page) {
  await page.getByRole('button', { name: '音频设置', exact: true }).click();
  return page.getByRole('dialog', { name: '运行设置 / SETTINGS', exact: true });
}
async function stored(page: Page) { return page.evaluate(() => ({ save: localStorage.getItem('pdoom.save.v1'), audio: localStorage.getItem('pdoom.audio.v1'), motion: localStorage.getItem('pdoom.motion.v1') })); }
test.setTimeout(60000);
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', error => list.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

for (const [name, width, height] of [['desktop', 1280, 720], ['short', 800, 450]] as const) {
  test(`motion ${name}: real keyboard preference is local, persistent and never resumes a paused game`, async ({ page }, info) => {
    await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page);
    await expect(root(page)).toHaveAttribute('data-reduced-motion', 'false');
    await page.getByRole('button', { name: '开始新训练', exact: true }).click();
    await expect(page.locator('.hud-cell').nth(3)).toContainText('00:01');
    const dialog = await settings(page), before = await stored(page), clock = await page.locator('.hud-cell').nth(3).innerText();
    await dialog.getByRole('radio', { name: '跟随系统', exact: true }).focus(); await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('radio', { name: '减少动态效果', exact: true })).toBeChecked();
    await expect(root(page)).toHaveAttribute('data-reduced-motion', 'true');
    await expect(dialog.getByRole('region', { name: '动态效果设置' })).toContainText('当前：减少动态效果');
    await page.screenshot({ path: info.outputPath('motion-settings.png') });
    const image = await page.locator('canvas').screenshot(); await page.waitForTimeout(350);
    expect(await page.locator('canvas').screenshot()).toEqual(image); expect(await page.locator('.hud-cell').nth(3).innerText()).toBe(clock);
    const after = await stored(page); expect(after.save).toBe(before.save); expect(after.audio).toBe(before.audio);
    expect(JSON.parse(after.motion!)).toEqual({ version: 1, mode: 'reduced' });
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await expect(page.getByRole('heading', { name: '暂停前向传播。' })).toBeVisible();
    expect(await page.locator('.hud-cell').nth(3).innerText()).toBe(clock);
    await page.reload(); await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await expect(root(page)).toHaveAttribute('data-reduced-motion', 'true');
    const again = await settings(page); await expect(again.getByRole('radio', { name: '减少动态效果', exact: true })).toBeChecked();
    expect((await stored(page)).save).toBe(before.save);
  });
}

test('system motion changes are live without writing a forced preference or restarting the run', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page);
  const before = await stored(page); await expect(root(page)).toHaveAttribute('data-reduced-motion', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(root(page)).toHaveAttribute('data-reduced-motion', 'true');
  const dialog = await settings(page); await expect(dialog.getByRole('radio', { name: '跟随系统', exact: true })).toBeChecked();
  await expect(dialog).toContainText('系统已要求减少动态效果');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await expect(root(page)).toHaveAttribute('data-reduced-motion', 'false');
  expect(await stored(page)).toEqual(before);
  await dialog.getByRole('radio', { name: '减少动态效果', exact: true }).check();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root(page)).toHaveAttribute('data-reduced-motion', 'true');
});

for (const failure of ['invalid', 'read-denied', 'write-denied'] as const) {
  test(`motion ${failure}: preference failure is isolated from the real checkpoint`, async ({ page }) => {
    const save = { ...createRun(randomUUID(), 42), checkpoint: 1, elapsedMs: 10000 };
    await page.addInitScript(({ save, failure, key }) => {
      localStorage.setItem('pdoom.save.v1', JSON.stringify(save));
      if (failure === 'invalid') localStorage.setItem(key, '{"version":9,"mode":"reduced"}');
      if (failure === 'read-denied') {
        const get = Storage.prototype.getItem;
        Storage.prototype.getItem = function (name) { if (name === key) throw new DOMException('denied', 'SecurityError'); return get.call(this, name); };
      }
      if (failure === 'write-denied') {
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('full', 'QuotaExceededError'); return set.call(this, name, value); };
      }
    }, { save, failure, key: KEY });
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page);
    const dialog = await settings(page); await expect(root(page)).toHaveAttribute('data-reduced-motion', 'false');
    if (failure !== 'write-denied') await expect(dialog).toContainText(failure === 'invalid' ? '格式无效' : '无法读取动态效果偏好');
    if (failure === 'invalid') expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe('{"version":9,"mode":"reduced"}');
    await dialog.getByRole('radio', { name: '减少动态效果', exact: true }).check(); await expect(root(page)).toHaveAttribute('data-reduced-motion', 'true');
    if (failure === 'write-denied') { await expect(dialog).toContainText('未能保存，仅在本页生效'); expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull(); }
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(save);
  });
}

test('unavailable system-motion query chooses the safe reduced view without hiding the controls', async ({ page }) => {
  await page.addInitScript(() => {
    const match = window.matchMedia.bind(window);
    window.matchMedia = query => { if (query === '(prefers-reduced-motion: reduce)') throw new Error('unsupported media query'); return match(query); };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page);
  await expect(root(page)).toHaveAttribute('data-reduced-motion', 'true');
  const dialog = await settings(page); await expect(dialog).toContainText('系统偏好不可用，采用安全的减少模式');
  await expect(dialog.getByRole('radio', { name: '跟随系统', exact: true })).toBeEnabled();
});

for (const source of ['forced', 'system'] as const) {
  test(`motion ${source}: real FOOM replay becomes fully legible without animation, score upload or save mutation`, async ({ page }, info) => {
    const save = { ...createRun(randomUUID(), 42), stage: 5, checkpoint: 90, doom: 88, hp: 67, score: 4567, elapsedMs: 123456 };
    const writes: string[] = []; page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.url()); });
    await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), save);
    await page.setViewportSize({ width: 1280, height: 720 }); await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page);
    await page.getByRole('button', { name: '回看结局', exact: true }).click();
    const ending = page.getByRole('dialog', { name: '最终结局', exact: true }); await expect(ending).toBeVisible();
    expect(await page.locator('.ending-paperclips span').first().evaluate(n => getComputedStyle(n).animationName)).not.toBe('none');
    if (source === 'forced') {
      await ending.getByRole('button', { name: '返回终端', exact: true }).click();
      const dialog = await settings(page); await dialog.getByRole('radio', { name: '减少动态效果', exact: true }).check();
      await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await page.getByRole('button', { name: '回看结局', exact: true }).click();
    } else await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(root(page)).toHaveAttribute('data-reduced-motion', 'true');
    const styles = await page.locator('.ending-stage').evaluate(stage => [...stage.querySelectorAll('*')].map(n => ({ animation: getComputedStyle(n).animationName, transform: getComputedStyle(n).transform })));
    expect(styles.length).toBeGreaterThan(24); expect(styles.every(s => s.animation === 'none' && s.transform === 'none')).toBe(true);
    await expect(page.locator('.ending-paperclips span')).toHaveCount(24);
    expect(await page.locator('.ending-smile').evaluate(n => getComputedStyle(n).opacity)).toBe('1');
    await expect(page.locator('.ending-smile')).toContainText('您的原子已重排完毕');
    await page.screenshot({ path: info.outputPath('reduced-foom.png') });
    await ending.getByRole('button', { name: '跳过演出 / 查看结算', exact: true }).click();
    await expect(ending.getByRole('heading', { name: '本局结算 · 结果已锁定' })).toBeFocused();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(save);
    expect(writes).toEqual([]); expect(page.context().pages()).toHaveLength(1); expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  });
}
