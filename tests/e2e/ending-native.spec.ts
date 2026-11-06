import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { captureNativeEnding, type NativeEnding } from './ending-native-probe';

test.setTimeout(60000);
const scenarios = [
  { kind: 'aligned', doom: 8, symbol: '0%' }, { kind: 'warden', doom: 55, symbol: '50%' }, { kind: 'foom', doom: 88, symbol: '100%' },
] as const;
const screens = [{ name: 'desktop', width: 1280, height: 720, scale: 2 }, { name: 'short', width: 800, height: 450, scale: 1 }, { name: 'portrait', width: 390, height: 844, scale: 1 }] as const;
async function replay(page: Page, kind: NativeEnding, mode: 'normal' | 'forced' = 'normal') {
  const doom = scenarios.find(s => s.kind === kind)!.doom;
  const save = { ...createRun(randomUUID(), 42), stage: 5, checkpoint: 90, doom, hp: 67, score: 4567, elapsedMs: 123456 };
  await page.addInitScript(({ save, mode }) => {
    const flag = `ending.native.fixture.${save.runId}`;
    if (!sessionStorage.getItem(flag)) {
      localStorage.setItem('pdoom.save.v1', JSON.stringify(save)); sessionStorage.setItem(flag, 'once');
      if (mode === 'forced') localStorage.setItem('pdoom.motion.v1', JSON.stringify({ version: 1, mode: 'reduced' }));
    }
  }, { save, mode });
  await page.goto('/'); await expect(page.getByRole('button', { name: '回看结局', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '回看结局', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '最终结局', exact: true })).toBeVisible();
  return save;
}
function observe(page: Page) {
  const errors: string[] = [], writes: string[] = [], popups: Page[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('popup', p => popups.push(p));
  page.on('request', r => { if (!['GET', 'HEAD'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) writes.push(r.url()); });
  return { errors, writes, popups };
}
async function unchanged(page: Page, save: unknown) {
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!))).toEqual(save);
  expect(page.context().pages()).toHaveLength(1); expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
}
// Legal completed-save UI fixtures, not claims that these cases defeated the mirror in live combat.
for (const scene of scenarios) for (const screen of screens) {
  test(`native ending ${scene.kind} ${screen.name}: exact scene pixels, bounded controls and immutable result`, async ({ page }, info) => {
    const seen = observe(page); await page.setViewportSize(screen); await page.emulateMedia({ reducedMotion: 'no-preference' });
    const save = await replay(page, scene.kind), dialog = page.getByRole('dialog', { name: '最终结局', exact: true });
    const skip = dialog.getByRole('button', { name: '跳过演出 / 查看结算', exact: true }); await expect(skip).toBeFocused();
    await captureNativeEnding(page, info, scene.kind, screen.scale, `${scene.kind}-${screen.name}`);
    await expect(skip).toBeInViewport({ ratio: 1 }); await expect(dialog.locator('.ending-doom')).toBeInViewport({ ratio: 1 });
    await expect(dialog.locator('.ending-doom')).toContainText(`${scene.doom}%`); await expect(dialog.locator('.ending-doom')).toContainText(`叙事标签 ${scene.symbol}`);
    expect(await dialog.evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true);
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: '开始新训练', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(skip).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog.getByRole('heading', { name: '本局结算 · 结果已锁定' })).toBeFocused();
    await expect(page.locator('.ending-native-main')).toHaveCount(0); await unchanged(page, save);
    expect(seen).toEqual({ errors: [], writes: [], popups: [] });
  });
}
test('native ending resize keeps the same decoded image at integer scales including odd and minimum widths', async ({ page }, info) => {
  const seen = observe(page); await page.emulateMedia({ reducedMotion: 'reduce' }); const save = await replay(page, 'warden');
  const image = await page.locator('.ending-native-main img').elementHandle(); expect(image).not.toBeNull();
  for (const [width, height, scale] of [[1373, 769, 2], [700, 900, 2], [320, 568, 1], [800, 360, 1], [1280, 720, 2]] as const) {
    await page.setViewportSize({ width, height });
    await captureNativeEnding(page, info, 'warden', scale, `resize-${width}-${height}`);
    expect(await image!.evaluate(n => n.isConnected && n === document.querySelector('.ending-native-main img'))).toBe(true);
  }
  await unchanged(page, save); expect(seen).toEqual({ errors: [], writes: [], popups: [] });
});
for (const mode of ['forced', 'system'] as const) {
  test(`native ending ${mode} reduction preserves FOOM atlas crop and all24 visible native clips`, async ({ page }, info) => {
    const seen = observe(page); await page.setViewportSize({ width: 1280, height: 720 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
    const save = await replay(page, 'foom', mode === 'forced' ? 'forced' : 'normal');
    if (mode === 'system') await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.game-shell')).toHaveAttribute('data-reduced-motion', 'true');
    await captureNativeEnding(page, info, 'foom', 2, `foom-${mode}`);
    expect(await page.locator('.ending-stage').evaluate(n => [...n.querySelectorAll('*')].every(e => getComputedStyle(e).transform === 'none' && getComputedStyle(e).animationName === 'none'))).toBe(true);
    await unchanged(page, save); expect(seen).toEqual({ errors: [], writes: [], popups: [] });
  });
}
test('native ending loading can be skipped and a late image does not steal summary focus or mutate the result', async ({ page }, info) => {
  const seen = observe(page); let release = () => {}, requested = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/game/ending-scenes.png*', async route => { requested = true; await gate; await route.continue(); });
  const delivery = page.waitForResponse(response => new URL(response.url()).pathname === '/game/ending-scenes.png');
  let save: unknown;
  try {
    save = await replay(page, 'aligned'); await expect.poll(() => requested).toBe(true);
    await expect(page.locator('.ending-native-main')).toHaveAttribute('data-art-state', 'loading');
    await expect(page.getByRole('status')).toContainText('读取原生分镜');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: '本局结算 · 结果已锁定' })).toBeFocused();
  } finally { release(); }
  const late = await delivery; expect(late.status()).toBe(200); expect(await late.finished()).toBeNull();
  const bytes = await late.body(); expect(bytes.equals(readFileSync(resolve('public/game/ending-scenes.png')))).toBe(true);
  await info.attach('late-image-delivery', { body: JSON.stringify({ bytes: bytes.length, status: 200, summaryAlreadyFocused: true }), contentType: 'application/json' });
  await page.unroute('**/game/ending-scenes.png*');
  await expect(page.locator('.ending-native-main')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '本局结算 · 结果已锁定' })).toBeFocused();
  await unchanged(page, save); expect(seen).toEqual({ errors: [], writes: [], popups: [] });
});
for (const failure of ['missing', 'wrong-size'] as const) {
  test(`native ending ${failure} scene rejects the asset, keeps exits and recovers only on explicit retry`, async ({ page }, info) => {
    const seen = observe(page); await page.setViewportSize({ width: 1280, height: 720 });
    const wrong = readFileSync(resolve('public/game/clawd-aligned.png'));
    await page.route('**/game/ending-scenes.png*', route => route.fulfill(failure === 'missing' ? { status: 404, body: 'missing' } : { status: 200, contentType: 'image/png', body: wrong }));
    const save = await replay(page, 'warden'); await expect(page.locator('.ending-native-main')).toHaveAttribute('data-art-state', 'error');
    await expect(page.getByRole('status')).toContainText('结算不受影响');
    await expect(page.getByRole('button', { name: '跳过演出 / 查看结算', exact: true })).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`${failure}-visible-error.png`) });
    await page.unroute('**/game/ending-scenes.png*');
    await page.getByRole('button', { name: '重载原生分镜', exact: true }).click();
    await captureNativeEnding(page, info, 'warden', 2, `${failure}-recovered`);
    await expect(page.getByRole('button', { name: '跳过演出 / 查看结算', exact: true })).toBeFocused();
    await expect(page.locator('.ending-native-main img')).toHaveAttribute('src', /ending-retry=1$/);
    await unchanged(page, save); expect(seen).toEqual({ errors: [], writes: [], popups: [] });
  });
}
test('native ending damaged clip bytes leave the real FOOM scene and controls usable, then retry restores all24 clips', async ({ page }, info) => {
  const seen = observe(page); await page.setViewportSize({ width: 1280, height: 720 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/game/ending-clips.png*', route => route.fulfill({ status: 200, contentType: 'image/png', body: 'not-a-png' }));
  const save = await replay(page, 'foom'); await expect(page.locator('.ending-clip-cloud')).toHaveAttribute('data-art-state', 'error');
  await expect(page.getByRole('status')).toContainText('回形针素材加载失败');
  await captureNativeEnding(page, info, 'foom', 2, 'clip-failure-scene-retained', false);
  await page.unroute('**/game/ending-clips.png*'); await page.getByRole('button', { name: '重载回形针素材', exact: true }).click();
  await captureNativeEnding(page, info, 'foom', 2, 'clip-recovered');
  await expect(page.getByRole('button', { name: '跳过演出 / 查看结算', exact: true })).toBeFocused();
  await unchanged(page, save); expect(seen).toEqual({ errors: [], writes: [], popups: [] });
});
