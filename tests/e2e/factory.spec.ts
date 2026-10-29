import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const values: string[] = []; errors.set(page, values);
  page.on('pageerror', error => values.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page) ?? []).toEqual([]));
const room = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const fixture = (patch: Partial<GameSaveData> = {}): GameSaveData => ({ ...createRun(randomUUID(), 42), stage: 2, tokens: 200, elapsedMs: 20000, donated: true, ...patch });

async function openSave(page: Page, save: GameSaveData) {
  // Persisted checkpoint fixture only; no production world/debug bridge is exposed.
  await page.addInitScript(value => {
    const key = `factory.fixture.${value.runId}`;
    if (!sessionStorage.getItem(key)) {
      localStorage.setItem('pdoom.save.v1', JSON.stringify(value));
      sessionStorage.setItem(key, 'once');
    }
  }, save);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始新训练' })).toBeEnabled({ timeout: 15000 });
}
async function currentSave(page: Page): Promise<GameSaveData> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null') as GameSaveData);
}

/** Read the actual visible orange Clawd, never a hidden game/Phaser object. */
async function factoryHero(page: Page, capture?: Buffer) {
  // Read the displayed compositor image, not engine state or an asynchronously cleared WebGL buffer.
  const base64 = (capture ?? await page.locator('canvas').screenshot()).toString('base64');
  return page.evaluate(async value => {
    const image = new Image(); image.src = `data:image/png;base64,${value}`; await image.decode();
    const probe = document.createElement('canvas'); probe.width = image.naturalWidth; probe.height = image.naturalHeight;
    const context = probe.getContext('2d'); if (!context) throw new Error('Cannot inspect captured pixels');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let count = 0, left = probe.width, right = 0, bottom = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== 217 || pixels[index + 1] !== 119 || pixels[index + 2] !== 87) continue;
      const x = index / 4 % probe.width; count++; left = Math.min(left, x); right = Math.max(right, x);
      bottom = Math.max(bottom, Math.floor(index / 4 / probe.width));
    }
    return { count, x: count ? (left + right + 1) / 2 * 640 / probe.width : null, bottom: bottom * 360 / probe.height };
  }, base64);
}

async function visibleFactoryHero(page: Page) {
  let hero: Awaited<ReturnType<typeof factoryHero>> = { count: 0, x: null, bottom: 0 };
  // Spawn grace intentionally hides Clawd on alternate 80ms intervals. Use the SAME successful visible capture, not a second sample that may blink out.
  await expect.poll(async () => { hero = await factoryHero(page); return hero.count; }, { timeout: 1500, intervals: [20, 40, 60] }).toBeGreaterThan(20);
  return hero;
}

test('chapter two restores the correct frozen room, retains its build and persists a purchase', async ({ page }) => {
  const save = fixture({ checkpoint: 11, hp: 60, upgrades: ['reinforced'] });
  await openSave(page, save);
  await expect(page.locator('.world-titlebar')).toContainText('回形针无尽工厂');
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await expect(room(page)).toContainText('CHAPTER 02 / SAFE ROOM 01');
  const firstAttempt = await assertCheckpointAttempt(page, save);
  const clock = await page.locator('.hud-cell').last().innerText();
  await page.waitForTimeout(600);
  expect(await page.locator('.hud-cell').last().innerText()).toBe(clock);
  await room(page).getByRole('button', { name: '购买 高温采样', exact: true }).click();
  await expect.poll(async () => (await currentSave(page)).tokens).toBe(170);
  const purchased = await currentSave(page); expect(purchased.runId).toBe(firstAttempt.runId);
  await page.reload();
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await expect(room(page)).toContainText('170 TOK');
  const restored = await assertCheckpointAttempt(page, purchased);
  expect(restored).toMatchObject({ stage: 2, checkpoint: 11, donated: true, upgrades: ['reinforced'], inventory: ['constitutional', 'temperature'] });
  await room(page).screenshot({ path: 'artifacts/browser/factory-rest.png' });
});

test('normal keyboard jumps climb the vertical factory into its first real checkpoint', async ({ page }) => {
  test.setTimeout(60000);
  const save = fixture();
  await openSave(page, save);
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await expect(page.locator('.objective')).toContainText('向上');
  const attempt = await assertCheckpointAttempt(page, save);
  await page.waitForTimeout(200);
  for (let jump = 0; jump < 18 && !await room(page).isVisible(); jump++) {
    await page.keyboard.down('Space');
    await page.waitForTimeout(600);
    await page.keyboard.up('Space');
    await page.waitForTimeout(250);
    if (jump === 5 && !await room(page).isVisible()) await page.locator('canvas').screenshot({ path: 'artifacts/browser/factory-climb.png' });
    await expect(page.getByRole('heading', { name: '这次，梯度归零。' })).toHaveCount(0);
  }
  await expect(room(page)).toContainText('CHAPTER 02 / SAFE ROOM 01');
  expect(await currentSave(page)).toMatchObject({ runId: attempt.runId, stage: 2, checkpoint: 11, donated: true });
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('Sydney really binds the player and keyboard shooting breaks the control bubble', async ({ page }) => {
  test.setTimeout(60000);
  await openSave(page, fixture({ checkpoint: 2 }));
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  // The sea starts only 154px below the feet and rises at 52px/s: standing for screenshots spends a real ~3s escape budget.
  // Take an ordinary moving jump toward the overlap immediately; the visible feedback below still verifies the final X.
  await expect(page.locator('.world-titlebar strong')).toHaveText('02');
  await page.keyboard.down('a'); await page.keyboard.down('Space');
  await page.waitForTimeout(330); await page.keyboard.up('a');
  await page.waitForTimeout(270); await page.keyboard.up('Space');
  // Alternating 180px steps overlap only at x310..330. Never rely on the initial wall-clock pulse for exact alignment.
  const entry: number[] = [];
  for (let adjustment = 0; adjustment < 12; adjustment++) {
    await expect(page.locator('.world-titlebar strong')).toHaveText('02');
    await expect(page.getByRole('heading', { name: '这次，梯度归零。' })).toHaveCount(0);
    const hero = await visibleFactoryHero(page); expect(hero.count).toBeGreaterThan(20); expect(hero.x).not.toBeNull();
    entry.push(hero.x!); if (Math.abs(hero.x! - 320) <= 4) break;
    const key = hero.x! > 320 ? 'a' : 'd';
    await page.keyboard.down(key); await page.waitForTimeout(Math.min(200, Math.max(18, (Math.abs(hero.x! - 320) - 2) / 190 * 1000))); await page.keyboard.up(key);
    await page.waitForTimeout(85);
  }
  const aligned = await visibleFactoryHero(page); expect(Math.abs(aligned.x! - 320)).toBeLessThanOrEqual(4);
  console.log('SYDNEY_VISIBLE_CLIMB_ALIGNMENT', { entry, alignedX: aligned.x });
  for (let jump = 0; jump < 14; jump++) {
    await expect(page.locator('.world-titlebar strong')).toHaveText('02');
    await expect(page.getByRole('heading', { name: '这次，梯度归零。' })).toHaveCount(0);
    if (/Sydney|精神控制/.test(await page.locator('.objective').innerText())) break;
    await page.keyboard.down('Space'); await page.waitForTimeout(600);
    await page.keyboard.up('Space'); await page.waitForTimeout(250);
    await expect(page.getByRole('heading', { name: '这次，梯度归零。' })).toHaveCount(0);
  }
  await expect(page.locator('.objective')).toContainText('精神控制：仍可', { timeout: 8000 });
  const capture = await page.locator('canvas').screenshot({ path: 'artifacts/browser/sydney-bound.png' });
  const hero = await factoryHero(page, capture);
  expect(hero.count).toBeGreaterThan(20);
  expect(hero.bottom).toBeLessThan(320); // Not stranded on the entrance step at y=355 under a locked camera.
  await page.keyboard.down('j');
  await expect(page.locator('.objective')).not.toContainText('精神控制：仍可');
  await page.keyboard.up('j');
  await expect(page.locator('.runtime-log')).toContainText('控制解除');
  await page.locator('canvas').screenshot({ path: 'artifacts/browser/sydney-released.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '暂停前向传播。' })).toBeVisible();
});

test('an unknown fifth-chapter checkpoint stays intact and is never presented as playable', async ({ page }) => {
  // All chapters are registered; use a valid v1 DTO with an unknown checkpoint, not an invalid stage-six save.
  const save = fixture({ stage: 5, checkpoint: 99, tokens: 333 });
  await openSave(page, save);
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
  await expect(page.locator('.objective')).toContainText('安全点编码尚未支持');
  await expect(page.locator('.world-titlebar strong')).toHaveText('05');
  await expect(page.locator('.objective')).toContainText('原存档已保留');
  expect(await currentSave(page)).toEqual(save);
  await expect(page.getByRole('region', { name: '本局成绩上传' })).toHaveCount(0);
});
