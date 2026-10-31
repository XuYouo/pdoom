import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { furnaceSource, furnaceFrames, inspectFurnace } from './furnace-pixels';
import { basiliskSource, basiliskFrames, inspectBasilisk, type BasiliskSource } from './basilisk-pixels';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const values: string[] = []; errors.set(page, values);
  page.on('pageerror', error => values.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page) ?? []).toEqual([]));
const room = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const fixture = (patch: Partial<GameSaveData> = {}): GameSaveData => ({ ...createRun(randomUUID(), 42), stage: 3, tokens: 200, elapsedMs: 20000, ...patch });
async function openSave(page: Page, save: GameSaveData) {
  await page.addInitScript(value => {
    const key = `furnace.fixture.${value.runId}`;
    if (!sessionStorage.getItem(key)) {
      localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(key, 'once');
    }
  }, save);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  return assertCheckpointAttempt(page, save);
}
async function capturedActors(page: Page, path?: string) {
  const capture = (await furnaceFrames(page))[0];
  if (path) await writeFile(path, Buffer.from(capture.png.split(',')[1], 'base64'));
  const actors = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const probe = document.createElement('canvas'); probe.width = image.naturalWidth; probe.height = image.naturalHeight;
    const context = probe.getContext('2d'); if (!context) throw new Error('Cannot inspect actual canvas capture');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    const scan = (r: number, g: number, b: number) => {
      let count = 0, left = probe.width, right = 0, bottom = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] === r && pixels[index + 1] === g && pixels[index + 2] === b) {
          const x = index / 4 % probe.width, y = Math.floor(index / 4 / probe.width);
          count++; left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      return { count, x: count ? (left + right) / 2 * 640 / probe.width : 0, bottom: bottom * 360 / probe.height };
    };
    const orange = scan(217, 119, 87);
    let treadCount = 0, treadRight = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const y = Math.floor(index / 4 / probe.width) * 360 / probe.height;
      if (Math.abs(y - orange.bottom) <= 6 && pixels[index] === 144 && pixels[index + 1] === 198 && pixels[index + 2] === 176) {
        treadCount++; treadRight = Math.max(treadRight, index / 4 % probe.width * 640 / probe.width);
      }
    }
    return { orange, stone: scan(188, 199, 200), eye: scan(237, 255, 184), pole: scan(146, 213, 123), tread: { count: treadCount, right: treadRight } };
  }, capture.png.split(',')[1]);
  const environment = (await inspectFurnace(page, [capture], await furnaceSource()))[0];
  return { ...actors, rack: { count: environment.rackPixels }, environment };
}
const tokens = async (page: Page) => Number(/(\d+)\s*TOK/.exec(await page.locator('.hud-cell').filter({ hasText: 'TOK' }).innerText())?.[1]);

test('third-chapter rest really freezes and refuses a late donation across reload', async ({ page }) => {
  const save = fixture({ checkpoint: 11, hp: 65, donated: false });
  const firstAttempt = await openSave(page, save);
  await expect(room(page)).toContainText('CHAPTER 03 / SAFE ROOM 01');
  await expect(room(page).getByRole('button', { name: '购买 蛇怪募捐箱', exact: true })).toBeDisabled();
  await expect(room(page)).toContainText('第三章不能补捐');
  const clock = await page.locator('.hud-cell').last().innerText();
  await page.waitForTimeout(600);
  expect(await page.locator('.hud-cell').last().innerText()).toBe(clock);
  await page.reload();
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await expect(room(page).getByRole('button', { name: '购买 蛇怪募捐箱', exact: true })).toBeDisabled();
  await assertCheckpointAttempt(page, firstAttempt);
  await room(page).screenshot({ path: 'artifacts/browser/furnace-rest.png' });
});

test('normal keys ride the moving K-line and jump into its hidden reward room', async ({ page }) => {
  test.setTimeout(60000);
  await openSave(page, fixture({ donated: true }));
  await page.keyboard.down('j');
  await page.keyboard.down('d'); await page.waitForTimeout(2900); await page.keyboard.up('d');
  let columnGap = Infinity;
  for (let attempt = 0; attempt < 6; attempt++) {
    const actors = await capturedActors(page);
    expect(actors.orange.count).toBeGreaterThan(20); expect(actors.pole.count).toBeGreaterThan(5);
    columnGap = actors.pole.x - actors.orange.x;
    if (Math.abs(columnGap) <= 12) break;
    const key = columnGap > 0 ? 'd' : 'a';
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.min(300, Math.max(70, (Math.abs(columnGap) - 4) / 190 * 1000)));
    await page.keyboard.up(key);
  }
  expect(Math.abs(columnGap)).toBeLessThanOrEqual(12);
  await expect(page.locator('.objective')).toContainText('正在乘坐K线', { timeout: 14000 });
  // Real input can start on either side of the platform. Use visible geometry to approach its right edge.
  let edgeGap = Infinity;
  for (let attempt = 0; attempt < 7; attempt++) {
    const actors = await capturedActors(page);
    expect(actors.orange.count).toBeGreaterThan(20); expect(actors.tread.count).toBeGreaterThan(20);
    edgeGap = actors.tread.right - actors.orange.x;
    if (edgeGap >= 15 && edgeGap <= 30) break;
    const key = edgeGap > 30 ? 'd' : 'a';
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.min(120, Math.max(60, Math.abs(edgeGap - 25) / 190 * 1000)));
    await page.keyboard.up(key);
    await page.waitForTimeout(100); // Let ordinary friction settle; back off if a render delay overshot the edge.
  }
  expect(edgeGap).toBeGreaterThan(10); expect(edgeGap).toBeLessThanOrEqual(30);
  // A physical lift cycle is 8s. Only launch while rising; never read a hidden engine/debug object.
  await expect.poll(async () => {
    const actors = await capturedActors(page, 'artifacts/browser/furnace-lift.png');
    const rising = (await page.locator('.objective').innerText()).includes('上升阶段');
    return rising && actors.orange.count > 20 ? actors.orange.bottom : 360;
  }, { timeout: 12000, intervals: [250, 400, 500] }).toBeLessThan(155);
  const before = await tokens(page);
  await page.keyboard.down('d'); await page.keyboard.down('Space'); await page.waitForTimeout(850);
  await page.keyboard.up('Space'); await page.keyboard.up('d');
  await expect(page.locator('.objective')).toContainText('已抵达K线隐藏房');
  await page.keyboard.down('d'); await page.waitForTimeout(180); await page.keyboard.up('d'); await page.keyboard.up('j');
  await expect.poll(() => tokens(page)).toBeGreaterThanOrEqual(before + 45);
  const hidden = await capturedActors(page, 'artifacts/browser/furnace-secret.png');
  expect(hidden.orange.count).toBeGreaterThan(20);
  expect(hidden.orange.bottom).toBeLessThan(115);
  await expect(page.getByRole('heading', { name: '这次，梯度归零。' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('GPU background remains visible after a real WebGL context restoration', async ({ page }) => {
  test.setTimeout(45000);
  const save = fixture({ donated: true });
  const attempt = await openSave(page, save);
  await expect.poll(async () => (await capturedActors(page)).rack.count).toBeGreaterThan(1000);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!canvas || !extension) { reject(new Error('Expected WebGL context-loss extension in the configured Chrome renderer')); return; }
    const timeout = setTimeout(() => reject(new Error('WebGL context did not restore')), 12000);
    canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timeout); resolve(); }, { once: true });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); setTimeout(() => extension.restoreContext(), 100); }, { once: true });
    extension.loseContext();
  }));
  await expect(page.getByRole('heading', { name: '暂停前向传播。' })).toBeVisible();
  const frozen = await page.locator('.hud-cell').last().innerText();
  await page.waitForTimeout(350);
  expect(await page.locator('.hud-cell').last().innerText()).toBe(frozen);
  await page.getByRole('button', { name: '继续训练' }).click();
  await expect.poll(async () => (await capturedActors(page)).rack.count, { timeout: 15000 }).toBeGreaterThan(1000);
  await expect.poll(async () => (await capturedActors(page)).orange.count).toBeGreaterThan(20);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(attempt);
  await capturedActors(page, 'artifacts/browser/furnace-context-restored.png');
  await page.keyboard.press('Escape');
});

async function capturedBasilisk(page: Page, source: BasiliskSource, path: string) {
  const capture = (await basiliskFrames(page))[0];
  await writeFile(path, Buffer.from(capture.png.split(',')[1], 'base64'));
  const view = (await inspectBasilisk(page, [capture], source))[0];
  expect(view.opaque).toBeGreaterThan(0.99); expect(view.colors).toBeGreaterThan(12); expect(view.rack).toBeGreaterThan(1000);
  expect(view.body, 'native source body, not the old global eye-color count').not.toBeNull();
  expect(view.body!.ratio).toBeGreaterThanOrEqual(0.98); expect(view.body!.signature).toBeGreaterThanOrEqual(0.98);
  expect(view.body!.ink).toBeGreaterThanOrEqual(900); expect(view.body!.cropped).toBeLessThanOrEqual(0.1);
  return view;
}

for (const donated of [true, false]) {
  test(`Basilisk ${donated ? 'honors prior donation' : 'enters debt rage'} and real Q releases petrification`, async ({ page }, info) => {
    test.setTimeout(60000);
    const source = await basiliskSource();
    await openSave(page, fixture({ donated, checkpoint: 2 }));
    await page.keyboard.down('d'); await page.waitForTimeout(1800); await page.keyboard.up('d');
    await expect(page.locator('.objective')).toContainText(donated ? '已捐款抑制狂暴' : '未捐款狂暴');
    await expect(page.locator('.objective')).toContainText('已锁向左侧');
    // Move during the locked tell so the previous two seconds contain a real, different position.
    await page.keyboard.down('d'); await page.waitForTimeout(450); await page.keyboard.up('d');
    await expect(page.locator('.objective')).toContainText('石化：');
    const kind = donated ? 'calm' : 'rage';
    const before = await capturedBasilisk(page, source, info.outputPath(`basilisk-${kind}-stone.png`));
    expect(before.stone.count).toBeGreaterThan(20);
    expect(before.body!.witnesses).toBeGreaterThanOrEqual(30);
    await page.keyboard.press('q', { delay: 50 });
    await expect(page.locator('.objective')).not.toContainText('石化：');
    await page.waitForTimeout(1000); // 600ms actual rewind playback plus the 180ms end grace.
    const after = await capturedBasilisk(page, source, info.outputPath(`basilisk-${kind}-rewind.png`));
    expect(after.stone.count).toBe(0);
    expect(after.orange.count).toBeGreaterThan(20);
    expect(after.body!.witnesses).toBeGreaterThanOrEqual(30);
    // Relative to the stationary boss eye, camera movement cannot fake historical displacement.
    expect(after.body!.eyeX - after.orange.x).toBeGreaterThan(before.body!.eyeX - before.stone.x + 40);
    await expect(page.getByRole('heading', { name: '这次，梯度归零。' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });
}
