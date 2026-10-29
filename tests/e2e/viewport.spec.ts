import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeEnabled({ timeout: 15000 });
}
async function fittedViewport(page: Page) {
  const dimensions = await page.evaluate(() => {
    const root = document.querySelector('.game-shell')!, canvas = document.querySelector('canvas')!;
    const rect = (node: Element) => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
    return { root: rect(root), canvas: rect(canvas), width: innerWidth, height: innerHeight, backing: [canvas.width, canvas.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
  });
  expect(dimensions.root.x).toBe(0); expect(dimensions.root.y).toBe(0);
  expect(dimensions.root.width).toBe(dimensions.width); expect(dimensions.root.height).toBe(dimensions.height);
  const scale = Math.min(dimensions.width / 640, dimensions.height / 360);
  expect(Math.abs(dimensions.canvas.width - 640 * scale)).toBeLessThan(2);
  expect(Math.abs(dimensions.canvas.height - 360 * scale)).toBeLessThan(2);
  expect(Math.abs(dimensions.canvas.x - (dimensions.width - dimensions.canvas.width) / 2)).toBeLessThan(2);
  expect(Math.abs(dimensions.canvas.y - (dimensions.height - dimensions.canvas.height) / 2)).toBeLessThan(2);
  expect(dimensions.backing).toEqual([640, 360]);
  expect(dimensions.scroll[0]).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.scroll[1]).toBeLessThanOrEqual(dimensions.height + 1);
  return dimensions;
}

test('the game owns the whole window and keeps one uncropped canvas across desktop ratios', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await ready(page);
  const original = await page.locator('canvas').elementHandle(); expect(original).not.toBeNull();
  for (const [width, height] of [[1280, 720], [1440, 900], [2560, 1080]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(600);
    await fittedViewport(page);
    expect(await original!.evaluate(node => node === document.querySelector('canvas') && node.isConnected)).toBe(true);
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.locator('.topbar,.title-row,.game-layout,.footer,.chapter-list,.mission-console')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(600);
  expect((await page.locator('.title-menu').innerText()).length).toBeLessThan(260);
  await page.screenshot({ path: 'artifacts/browser/fullscreen-title.png' });
});

test('compact gameplay UI has working keyboard pause and a real modal settings stack', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 }); await ready(page);
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0); await expect(page.locator('.hud-cell')).toHaveCount(4);
  await expect(page.locator('.objective')).toHaveCount(1);
  expect((await page.locator('.objective').innerText()).length).toBeLessThan(55);
  await fittedViewport(page);
  await page.keyboard.down('d'); await page.waitForTimeout(250); await page.keyboard.up('d');
  await page.waitForTimeout(850);
  await page.screenshot({ path: 'artifacts/browser/fullscreen-play.png' });
  await page.getByRole('button', { name: /暂停游戏/ }).focus();
  await page.keyboard.press('Space');
  const pause = page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
  await expect(pause).toBeVisible();
  const clock = await page.locator('.hud-cell').last().innerText();
  await page.waitForTimeout(350); expect(await page.locator('.hud-cell').last().innerText()).toBe(clock);
  await pause.getByRole('button', { name: '音频设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '运行设置 / SETTINGS', exact: true });
  await expect(settings).toBeVisible(); await settings.getByRole('button', { name: '关闭弹窗' }).click();
  await expect(pause).toBeVisible(); expect(await page.locator('.hud-cell').last().innerText()).toBe(clock);
  await page.screenshot({ path: 'artifacts/browser/fullscreen-pause.png' });
  await page.keyboard.press('Escape'); await expect(pause).toHaveCount(0);
  await expect.poll(() => page.locator('.hud-cell').last().innerText()).not.toBe(clock);
  await expect(page.locator('canvas')).toHaveCount(1); expect(errors).toEqual([]);
});

test('the optional fullscreen button uses the real browser API and exits cleanly', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await ready(page);
  expect(await page.evaluate(() => document.fullscreenEnabled)).toBe(true);
  await page.getByRole('button', { name: '全屏显示', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('game-shell') ?? false)).toBe(true);
  await page.waitForTimeout(600); await fittedViewport(page);
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.waitForTimeout(600); await fittedViewport(page); await expect(page.locator('canvas')).toHaveCount(1);
});

test('portrait menu fits the device and honestly recommends landscape keyboard play', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
  await fittedViewport(page); await expect(page.locator('.menu-device-hint')).toBeVisible();
  const start = await page.getByRole('button', { name: '开始新训练', exact: true }).boundingBox();
  expect(start!.x).toBeGreaterThanOrEqual(0); expect(start!.x + start!.width).toBeLessThanOrEqual(390);
  expect(start!.y + start!.height).toBeLessThan(844);
  await page.screenshot({ path: 'artifacts/browser/fullscreen-portrait-menu.png' });
});

test('one Escape opens pause without immediately cancelling it, and a second Escape resumes', async ({ page }) => {
  const cancellations: string[] = [];
  page.on('console', message => { if (message.text().startsWith('NATIVE_PAUSE_CANCEL')) cancellations.push(message.text()); });
  await ready(page);
  await page.evaluate(() => document.addEventListener('cancel', event => {
    if (event.target instanceof HTMLDialogElement) console.info('NATIVE_PAUSE_CANCEL', event.target.getAttribute('aria-label'));
  }, true));
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
  try {
    await expect(pause).toBeVisible();
    const clock = await page.locator('.hud-cell').last().innerText();
    await page.waitForTimeout(350); await expect(pause).toBeVisible();
    expect(await page.locator('.hud-cell').last().innerText()).toBe(clock);
    expect(cancellations).toEqual([]);
    await page.keyboard.press('Escape'); await expect(pause).toHaveCount(0);
    await expect.poll(() => page.locator('.hud-cell').last().innerText()).not.toBe(clock);
    expect(cancellations).toEqual(['NATIVE_PAUSE_CANCEL 暂停前向传播。']);
  } finally { console.info('NATIVE_ESCAPE_DEFAULT_EVENTS', cancellations); }
});
