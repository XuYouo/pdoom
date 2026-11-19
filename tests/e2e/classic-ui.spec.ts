import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { CdpTouch } from './cdp-touch';

const menu = (page: Page) => page.getByRole('region', { name: '主菜单', exact: true });
const start = (page: Page) => page.getByRole('button', { name: '开始新训练', exact: true });
const settings = (page: Page) => page.getByRole('dialog', { name: '运行设置 / SETTINGS', exact: true });
const paused = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });

async function reachable(page: Page, target: Locator, touch = false) {
  await expect(target).toBeVisible();
  const box = await target.boundingBox(), viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  if (touch) { expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44); }
}

async function noHorizontalOverflow(page: Page, surface?: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  if (surface) expect(await surface.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
}

async function capture(page: Page, info: TestInfo, filename: string) {
  // Observe entrances at their natural finished state. Do not finish animations,
  // disable motion, or wait for intentionally infinite decorative animation.
  await page.locator('main.game-shell').evaluate(async element => {
    const finite = element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running'
      && Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.allSettled(finite.map(animation => animation.finished));
  });
  await page.screenshot({ path: info.outputPath(filename) });
}

async function settledCanvas(page: Page, canvas: Locator) {
  let previous = '';
  // Menu and play share a renderer. ResizeObserver refreshes Phaser after the
  // React layout switch, so require two stable real measurements before judging it.
  await expect.poll(async () => {
    const box = await canvas.boundingBox(), parent = await page.locator('.world-viewport').boundingBox(), viewport = page.viewportSize()!;
    if (!box || !parent) { previous = ''; return false; }
    const signature = JSON.stringify(box), stable = signature === previous; previous = signature;
    return stable && box.x >= parent.x - 1 && box.y >= parent.y - 1
      && box.x + box.width <= parent.x + parent.width + 1 && box.y + box.height <= parent.y + parent.height + 1
      && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
  }, { intervals: [16, 32, 50, 100] }).toBe(true);
}

/** These screenshots use the anonymous UI. Fail on, and prevent, any backend write attempt. */
async function anonymousOnly(page: Page) {
  const writes: string[] = [], errors: string[] = [];
  let coopSockets = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => { if (new URL(socket.url()).pathname === '/realtime/coop') coopSockets++; });
  await page.route(url => url.pathname === '/api' || url.pathname.startsWith('/api/'), async route => {
    const request = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) await route.continue();
    else { writes.push(`${request.method()} ${new URL(request.url()).pathname}`); await route.abort('blockedbyclient'); }
  });
  return () => { expect(writes, 'anonymous visual acceptance must not attempt backend changes').toEqual([]);
    expect(coopSockets, 'viewing the signed-out cooperative entry must not authenticate a socket').toBe(0); expect(errors).toEqual([]); };
}

const views = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
] as const;

for (const view of views) {
  test.describe(`classic UI ${view.name}`, () => {
    test.use({ viewport: { width: view.width, height: view.height }, hasTouch: view.touch, isMobile: view.touch, deviceScaleFactor: 1 });
    test('menu, anonymous co-op, live battle and pause settings remain usable', async ({ page }, info) => {
      test.setTimeout(60000);
      const verifyAnonymous = await anonymousOnly(page);
      const activate = (target: Locator) => view.touch ? target.tap() : target.click();
      const touch = view.touch ? await CdpTouch.create(page) : null;
      try {
        await page.goto('/');
        await expect(start(page)).toBeEnabled({ timeout: 15000 });
        await expect(menu(page).getByRole('heading', { name: /P\(Doom\).*100\s*%/ })).toBeVisible();
        await reachable(page, start(page), view.touch);
        await reachable(page, page.getByRole('button', { name: '双人合作', exact: false }), view.touch);
        await noHorizontalOverflow(page);
        await capture(page, info, `${view.name}-classic-menu.png`);

        if (!view.touch) {
          await expect(start(page)).toBeFocused();
          await page.keyboard.press('ArrowDown');
          await expect(page.getByRole('button', { name: '双人合作', exact: false })).toBeFocused();
          await page.keyboard.press('ArrowDown');
          const settingsOpener = page.getByRole('button', { name: '音频设置', exact: true });
          await expect(settingsOpener).toBeFocused();
          await capture(page, info, 'desktop-classic-keyboard-selection.png');
          await page.keyboard.press('Enter'); await expect(settings(page)).toBeVisible();
          await reachable(page, settings(page).getByRole('button', { name: '关闭弹窗', exact: true }));
          await noHorizontalOverflow(page, settings(page));
          await page.keyboard.press('Escape'); await expect(settingsOpener).toBeFocused();
          await page.keyboard.press('Shift+Tab');
          await expect(page.getByRole('button', { name: '双人合作', exact: false })).toBeFocused();
          await page.keyboard.press('Home'); await expect(start(page)).toBeFocused();
          await page.keyboard.press('End'); await expect(page.getByRole('button', { name: '训练记录', exact: true })).toBeFocused();
          await page.keyboard.press('ArrowDown'); await expect(start(page)).toBeFocused();
        }

        await activate(page.getByRole('button', { name: '双人合作', exact: false }));
        const coop = page.getByRole('dialog', { name: '在线合作 / CO-OP', exact: true });
        await expect(coop.getByText('需要登录', { exact: true })).toBeVisible();
        await expect(coop.getByRole('button', { name: '创建合作房间', exact: false })).toHaveCount(0);
        await reachable(page, coop.getByRole('button', { name: '前往账户登录', exact: true }), view.touch);
        await reachable(page, coop.getByRole('button', { name: '返回终端', exact: true }), view.touch);
        await noHorizontalOverflow(page, coop);
        await capture(page, info, `${view.name}-classic-anonymous-coop.png`);
        await activate(coop.getByRole('button', { name: '返回终端', exact: true }));
        await expect(coop).toHaveCount(0);
        expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBeNull();

        await activate(start(page));
        await expect(menu(page)).toHaveCount(0); await expect(page.locator('canvas')).toHaveCount(1);
        const canvas = page.locator('.game-canvas canvas');
        await settledCanvas(page, canvas);
        await reachable(page, canvas);
        if (touch) {
          const root = page.locator('[aria-label="触屏操作"]');
          const movement = root.locator('[data-touch-control="move"]'), aim = root.locator('[data-touch-control="aim"]');
          await reachable(page, movement, true); await reachable(page, aim, true);
          const stage = (await canvas.boundingBox())!;
          for (const pad of [movement, aim]) {
            const box = (await pad.boundingBox())!;
            const overlapWidth = Math.max(0, Math.min(stage.x + stage.width, box.x + box.width) - Math.max(stage.x, box.x));
            const overlapHeight = Math.max(0, Math.min(stage.y + stage.height, box.y + box.height) - Math.max(stage.y, box.y));
            expect(overlapWidth * overlapHeight, 'the large touch pads must not cover the playable canvas').toBeLessThanOrEqual(1);
          }
          await touch.down(1, movement, { x: 0.85, y: 0.5 }); await touch.down(2, aim);
          await touch.down(3, root.locator('[data-touch-control="jump"]'));
          await page.waitForTimeout(350);
          await capture(page, info, `${view.name}-classic-live-battle.png`);
          await touch.endAll();
          await page.getByRole('button', { name: '暂停触屏训练', exact: true }).tap();
        } else {
          await expect(canvas).toBeFocused();
          await page.keyboard.down('d'); await page.keyboard.down('j'); await page.keyboard.down('Space');
          try { await page.waitForTimeout(350); await capture(page, info, 'desktop-classic-live-battle.png'); }
          finally { await page.keyboard.up('d'); await page.keyboard.up('j'); await page.keyboard.up('Space'); }
          await page.keyboard.press('Escape');
        }
        await expect(paused(page)).toBeVisible();
        await reachable(page, paused(page).getByRole('button', { name: '继续训练', exact: false }), view.touch);
        await noHorizontalOverflow(page, paused(page));
        const frozenTime = await page.locator('.hud-cell').last().innerText();
        await page.waitForTimeout(250); expect(await page.locator('.hud-cell').last().innerText()).toBe(frozenTime);
        await capture(page, info, `${view.name}-classic-pause.png`);
        await activate(paused(page).getByRole('button', { name: '音频设置', exact: true }));
        await expect(settings(page)).toBeVisible();
        await reachable(page, settings(page).getByRole('button', { name: '关闭弹窗', exact: true }), view.touch);
        await noHorizontalOverflow(page, settings(page));
        const mute = settings(page).getByRole('checkbox', { name: '静音全部音乐与音效', exact: true });
        const wasMuted = await mute.isChecked();
        await activate(settings(page).getByText('静音全部音乐与音效', { exact: true }));
        await expect(mute).toBeChecked({ checked: !wasMuted });
        await capture(page, info, `${view.name}-classic-settings.png`);
        await activate(settings(page).getByRole('button', { name: '关闭弹窗', exact: true }));
        await expect(paused(page)).toBeVisible();
        expect(await page.locator('.hud-cell').last().innerText()).toBe(frozenTime);
        verifyAnonymous();
      } finally { await touch?.dispose(); }
    });
  });
}

test('classic menu reduced motion keeps visible keyboard feedback and form previews usable', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const verifyAnonymous = await anonymousOnly(page);
  await page.goto('/'); await expect(start(page)).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('.game-shell')).toHaveAttribute('data-reduced-motion', 'true');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  const opener = page.getByRole('button', { name: '音频设置', exact: true });
  await expect(opener).toBeFocused(); await page.keyboard.press('Enter');
  await expect(settings(page).getByRole('region', { name: '动态效果设置' })).toContainText('当前：减少动态效果');
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  const preview = page.getByRole('button', { name: 'FOOM > 80%', exact: true });
  await preview.focus(); await page.keyboard.press('Enter');
  await expect(preview).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Clawd 形态预览', { exact: true })).toHaveAttribute('data-form', 'foom');
  await expect.poll(async () => menu(page).evaluate(element => element.getAnimations({ subtree: true })
    .filter(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations === Infinity).length)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBeNull();
  await noHorizontalOverflow(page);
  await capture(page, info, 'desktop-classic-reduced-motion.png');
  verifyAnonymous();
});
