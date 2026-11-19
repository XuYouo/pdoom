import { expect, test, type Page } from '@playwright/test';
import { clawdBytes, clawdFrames, clawdSource, inspectClawd } from './clawd-pixels';

const canvas = (page: Page) => page.locator('.game-canvas canvas');
const insight = (page: Page) => page.locator('.game-actions .skill-button').filter({ has: page.locator('kbd', { hasText: /^E$/ }) });
const rewind = (page: Page) => page.locator('.game-actions .skill-button').filter({ has: page.locator('kbd', { hasText: /^Q$/ }) });
const pause = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  await expect(canvas(page)).toBeFocused();
  // Let the real initial invulnerability blink settle, without changing the world.
  await expect.poll(async () => {
    const value = /(\d+):(\d{2})/.exec(await page.locator('.hud-cell').last().innerText());
    return value ? Number(value[1]) * 60 + Number(value[2]) : 0;
  }).toBeGreaterThanOrEqual(1);
}

async function hero(page: Page) {
  const source = await clawdSource();
  const frame = (await clawdFrames(page))[0];
  const hits = inspectClawd(clawdBytes(frame), source, 'aligned');
  expect(hits.length, 'the actual starting Clawd is visible at native resolution').toBeGreaterThan(0);
  // Symmetric idle poses match both facing directions at the same native position.
  expect(new Set(hits.map(hit => `${hit.x},${hit.y}`)).size).toBe(1);
  return hits[0];
}

test('pointer skills return to the canvas and ordinary movement, shooting and rewind still work', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await insight(page).click();
  await expect(canvas(page)).toBeFocused();
  await expect(insight(page)).toHaveAttribute('aria-pressed', 'true');
  const before = await hero(page);
  await page.keyboard.press('d', { delay: 160 });
  const right = await hero(page);
  expect(right.x).toBeGreaterThan(before.x + 15);
  await page.keyboard.press('a', { delay: 120 });
  const left = await hero(page);
  expect(left.x).toBeLessThan(right.x - 10);

  const firing = clawdFrames(page, 400);
  await page.keyboard.press('j', { delay: 120 });
  const source = await clawdSource();
  const shots = (await firing).flatMap(frame => inspectClawd(clawdBytes(frame), source, 'aligned'));
  expect(shots.some(hit => hit.phase === 'fire'), 'J actually emits a shot pose after clicking a skill').toBe(true);

  await expect(rewind(page)).toBeEnabled();
  await page.keyboard.press('q');
  await expect(rewind(page)).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(pause(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pause(page)).toHaveCount(0);
  await expect(canvas(page)).toBeFocused();
  await page.screenshot({ path: info.outputPath('pointer-skill-keyboard-recovery.png') });
  expect(errors).toEqual([]);
});

test('keyboard skill activation keeps Tab focus and does not leak Space into jumping', async ({ page }, info) => {
  await start(page);
  await insight(page).focus();
  await page.keyboard.press('e');
  await expect(insight(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(insight(page)).toBeFocused();
  const before = await hero(page);
  const duringActivation = clawdFrames(page, 500);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space', { delay: 180 });
  const source = await clawdSource();
  const positions = (await duringActivation).flatMap(frame => inspectClawd(clawdBytes(frame), source, 'aligned'));
  expect(positions.length).toBeGreaterThan(2);
  expect(positions.every(hit => hit.y === before.y && hit.phase === 'base'), 'control activation must not jump or shoot').toBe(true);
  await expect(insight(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '上下文详情', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(insight(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pause(page)).toBeVisible();
  await page.screenshot({ path: info.outputPath('keyboard-skill-pause.png') });
});

test('Shift+Tab navigates HUD controls without dashing, while canvas Shift still dashes', async ({ page }, info) => {
  await start(page);
  await expect(rewind(page)).toBeEnabled();
  const before = await hero(page);
  await insight(page).focus();
  const navigating = clawdFrames(page, 400);
  await page.keyboard.press('Shift+Tab');
  await expect(rewind(page)).toBeFocused();
  const source = await clawdSource();
  const positions = (await navigating).flatMap(frame => inspectClawd(clawdBytes(frame), source, 'aligned'));
  expect(positions.length).toBeGreaterThan(2);
  expect(positions.every(hit => hit.x === before.x && hit.y === before.y), 'reverse Tab navigation must not move the actual Clawd').toBe(true);
  await canvas(page).focus();
  await page.keyboard.press('Shift');
  await expect.poll(async () => (await hero(page)).x).toBeGreaterThan(before.x + 15);
  await page.screenshot({ path: info.outputPath('shift-navigation-and-canvas-dash.png') });
});

test('closing a menu panel restores its opener and nested pause panels remain paused', async ({ page }, info) => {
  await page.goto('/');
  const startButton = page.getByRole('button', { name: '开始新训练', exact: true });
  await expect(startButton).toBeFocused();
  const settings = page.getByRole('button', { name: '音频设置', exact: true });
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '运行设置 / SETTINGS', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(settings).toBeFocused();
  await startButton.click();
  await page.keyboard.press('Escape');
  await expect(pause(page)).toBeVisible();
  const guide = pause(page).getByRole('button', { name: '操作指南', exact: true });
  await guide.click();
  await expect(page.getByRole('dialog', { name: '操作手册 / FIELD MANUAL', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pause(page)).toBeVisible();
  await expect(guide).toBeFocused();
  const time = await page.locator('.hud-cell').last().innerText();
  await page.waitForTimeout(250);
  expect(await page.locator('.hud-cell').last().innerText()).toBe(time);
  await page.keyboard.press('Escape');
  await expect(pause(page)).toHaveCount(0);
  await expect(canvas(page)).toBeFocused();
  await page.screenshot({ path: info.outputPath('nested-panel-resumed.png') });
});
