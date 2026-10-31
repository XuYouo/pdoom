import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { basiliskSource, basiliskFrames, inspectBasilisk, type BasiliskView } from './basilisk-pixels';

// Legal checkpoint slices, not a fresh journey. No World/clock/HP injection,
// fake rAF, DOM hiding, synthetic effects or production pose-selector oracle.
const files = ['/game/basilisk.png', '/game/basilisk.json'];
const names = Array.from({ length: 8 }, (_, i) => `basilisk ${i}.aseprite`);
const dialog = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
const rawSave = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
function fixture(donated: boolean): GameSaveData {
  const save: GameSaveData = { ...createRun(randomUUID(), 42), stage: 3, checkpoint: 2, donated, tokens: 200, elapsedMs: 20000 };
  expect(isGameSave(save)).toBe(true); return save;
}
function watch(page: Page) {
  const errors: string[] = [], writes: string[] = [], loaded = new Set<string>();
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) writes.push(r.url()); });
  page.on('response', r => { const path = new URL(r.url()).pathname; if (r.status() === 200 && files.includes(path)) loaded.add(path); });
  return { errors, writes, loaded };
}
async function seed(page: Page, save: GameSaveData) {
  await page.addInitScript(value => {
    const key = `basilisk-native.${value.runId}`;
    if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, 'once'); if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); }
  }, save);
}
async function pause(page: Page) { await page.getByRole('button', { name: 'Ⅱ PAUSE / 暂停游戏', exact: true }).click(); await expect(dialog(page)).toBeVisible(); }
function positive(view: BasiliskView) {
  expect(view.opaque).toBeGreaterThan(0.99); expect(view.colors).toBeGreaterThan(12); expect(view.rack).toBeGreaterThan(1000);
  expect(view.orange.count + view.stone.count).toBeGreaterThan(30);
}
for (const donated of [true, false]) {
  test(`native Basilisk ${donated ? 'normal' : 'enraged'} four static poses, live gaze over body and pause`, async ({ page }, info) => {
    test.setTimeout(120000);
    const seen = watch(page), source = await basiliskSource(), save = fixture(donated); await seed(page, save);
    await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/');
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
    await page.waitForTimeout(900); // Let real spawn invulnerability blink finish, not remove it.
    // Approach with ordinary short taps, settling the actual camera between them.
    // Every accepted idle keeps the same strict source/coverage witnesses as combat.
    await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d');
    await page.waitForTimeout(600);
    let idle: BasiliskView | undefined;
    const probes: Omit<BasiliskView, 'capture'>[] = [];
    for (let attempt = 0; attempt < 9; attempt++) {
      const capture = (await basiliskFrames(page))[0];
      const view = (await inspectBasilisk(page, [capture], source))[0];
      probes.push({ body: view.body, orange: view.orange, stone: view.stone, opaque: view.opaque, colors: view.colors, rack: view.rack, floorY: view.floorY, floorPixels: view.floorPixels, cues: view.cues });
      await writeFile(info.outputPath('idle-navigation-last.png'), Buffer.from(capture.png.split(',')[1], 'base64'));
      if (view.body?.frame === (donated ? 0 : 4) && view.body.fullRatio >= 0.98 && view.body.headRatio >= 0.98) { idle = view; break; }
      await expect(page.locator('.objective')).not.toContainText('已锁向');
      await page.keyboard.press('d', { delay: 40 }); await page.waitForTimeout(400);
    }
    await writeFile(info.outputPath('idle-navigation.json'), JSON.stringify(probes, null, 2));
    expect(idle, 'source-positive inactive pose after natural camera settling').toBeDefined(); positive(idle!);
    const stream = basiliskFrames(page, 6500);
    await page.keyboard.down('d'); await page.waitForTimeout(900); await page.keyboard.up('d');
    const captures = await stream; await pause(page); await assertCheckpointAttempt(page, save);
    await writeFile(info.outputPath('last-native.png'), Buffer.from(captures.at(-1)!.png.split(',')[1], 'base64'));
    const views = [idle!, ...await inspectBasilisk(page, captures.filter((_, i) => i % 2 === 0), source)];
    await writeFile(info.outputPath('native-observations.json'), JSON.stringify(views.map(({ capture, ...v }) => ({ at: capture.at, ...v })), null, 2));
    const offset = donated ? 0 : 4, chosen = new Map<number, BasiliskView>();
    for (const view of views) {
      if (!view.body || view.orange.count + view.stone.count <= 30) continue;
      positive(view); expect(view.body.flip).toBe(false);
      expect(view.body.frame).toBeGreaterThanOrEqual(offset); expect(view.body.frame).toBeLessThan(offset + 4);
      const uncoveredPose = view.body.frame === offset || view.body.frame === offset + 3;
      if (!chosen.has(view.body.frame) && (!uncoveredPose || (view.body.fullRatio >= 0.98 && view.body.headRatio >= 0.98))) chosen.set(view.body.frame, view);
    }
    expect([...chosen.keys()].sort(), 'all four real poses, including visible registered inactive ink').toEqual([offset, offset + 1, offset + 2, offset + 3]);
    for (const [frame, view] of chosen) {
      const body = view.body!; expect(body.ratio).toBeGreaterThanOrEqual(0.98); expect(body.signature).toBeGreaterThanOrEqual(0.98);
      expect(body.ink).toBeGreaterThanOrEqual(900); expect(body.witnesses).toBeGreaterThanOrEqual(30); expect(body.cropped).toBeLessThanOrEqual(0.1);
      expect(view.floorY).not.toBeNull(); expect(view.floorPixels).toBeGreaterThanOrEqual(500);
      expect(body.y + 87).toBe(view.floorY! - 1); // Same-frame floor relation survives real impact shake.
      await writeFile(info.outputPath(`pose-${frame}.png`), Buffer.from(view.capture.png.split(',')[1], 'base64'));
    }
    const active = views.find(v => v.body?.frame === offset + 2 && v.body.laserCover >= 6 && v.body.ray >= 100 && v.stone.count > 20);
    expect(active, 'actual opaque laser line covers source-opaque head and visibly petrifies the real player').toBeDefined();
    positive(active!); expect(active!.body!.hpPixels).toBeGreaterThan(100);
    const headPositive = (v: BasiliskView) => v.body !== null && v.body.headPixels >= 12 && v.body.headRatio >= 0.98 && v.body.fullRatio >= 0.98;
    const beforeHead = views.filter(v => v.capture.at < active!.capture.at && headPositive(v)).at(-1);
    const afterHead = views.find(v => v.capture.at > active!.capture.at && headPositive(v));
    expect(beforeHead, 'source-positive opaque muzzle before real beam').toBeDefined();
    expect(afterHead, 'source-positive opaque muzzle after real beam').toBeDefined();
    await writeFile(info.outputPath('head-overlap-proof.json'), JSON.stringify({ before: beforeHead!.body, active: active!.body, after: afterHead!.body }, null, 2));
    await writeFile(info.outputPath('gaze-over-native-head.png'), Buffer.from(active!.capture.png.split(',')[1], 'base64'));
    const frozen = (await basiliskFrames(page))[0], hud = await page.locator('.hud-cell').allTextContents(), saved = await rawSave(page);
    await page.waitForTimeout(1800);
    expect((await basiliskFrames(page))[0].png).toBe(frozen.png); expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud); expect(await rawSave(page)).toBe(saved);
    await dialog(page).getByRole('button', { name: '继续训练', exact: true }).click();
    await expect.poll(async () => (await basiliskFrames(page))[0].png).not.toBe(frozen.png); await pause(page);
    expect([...seen.loaded].sort()).toEqual([...files].sort()); expect(seen.errors).toEqual([]); expect(seen.writes).toEqual([]);
    await expect(page.getByRole('heading', { name: '这次，梯度归零。', exact: true })).toHaveCount(0);
  });
}
const failures: { name: string; route: (route: Route) => Promise<void> }[] = [
  { name: 'missing PNG', route: async route => { if (new URL(route.request().url()).pathname.endsWith('.png')) await route.abort(); else await route.continue(); } },
  { name: 'missing unused enraged recovery', route: async route => {
    if (!new URL(route.request().url()).pathname.endsWith('.json')) { await route.continue(); return; }
    const response = await route.fetch(), value = await response.json() as { frames: { filename: string }[] };
    value.frames = value.frames.filter(f => f.filename !== names[7]); await route.fulfill({ response, json: value });
  } },
  { name: 'aliased unused final rectangle', route: async route => {
    if (!new URL(route.request().url()).pathname.endsWith('.json')) { await route.continue(); return; }
    const response = await route.fetch(), value = await response.json() as { frames: { filename: string; frame: { x: number } }[] };
    value.frames.find(f => f.filename === names[7])!.frame.x = 0; await route.fulfill({ response, json: value });
  } },
];
for (const failure of failures) test(`Basilisk ${failure.name} blocks readiness and preserves checkpoint through reload`, async ({ page }) => {
  const seen = watch(page), save = fixture(true); await seed(page, save); await page.route('**/game/basilisk.*', failure.route); await page.goto('/');
  for (let round = 0; round < 2; round++) {
    await expect(page.getByRole('alert').filter({ hasText: 'Basilisk 因果律蛇怪图集加载失败' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
    expect(await rawSave(page)).toBe(JSON.stringify(save)); if (!round) await page.reload();
  }
  expect(seen.errors).toEqual([]); expect(seen.writes).toEqual([]);
});

test('native Basilisk right lock, historical Q flank and same-arena body cleanup after real defeat', async ({ page }, info) => {
  test.setTimeout(120000);
  const seen = watch(page), source = await basiliskSource(), save = fixture(true); await seed(page, save); await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click(); const attempt = await assertCheckpointAttempt(page, save);
  await page.waitForTimeout(900);
  await page.keyboard.down('d'); await page.waitForTimeout(3150); await page.keyboard.up('d');
  const before = (await inspectBasilisk(page, await basiliskFrames(page), source))[0];
  await writeFile(info.outputPath('right-lock-before-Q.png'), Buffer.from(before.capture.png.split(',')[1], 'base64'));
  positive(before); expect(before.body).not.toBeNull(); expect(before.body!.flip).toBe(true); expect(before.body!.frame).toBe(1);
  expect(before.orange.x).toBeGreaterThan(before.body!.x + 48 + 40);
  expect(before.cues.hp).toBeGreaterThan(200); expect(before.cues.tellTip).toBeGreaterThan(10);
  await page.keyboard.press('q', { delay: 50 }); await page.waitForTimeout(1000);
  const after = (await inspectBasilisk(page, await basiliskFrames(page), source))[0];
  await writeFile(info.outputPath('historical-Q-behind.png'), Buffer.from(after.capture.png.split(',')[1], 'base64'));
  positive(after); expect(after.body).not.toBeNull(); expect(after.body!.flip).toBe(true); expect(after.stone.count).toBe(0);
  expect(after.orange.x).toBeLessThan(after.body!.x + 48 - 40);
  expect(after.body!.eyeX - after.orange.x).toBeGreaterThan(before.body!.eyeX - before.orange.x + 120);
  const box = await page.locator('canvas').boundingBox(); if (!box) throw Error('Missing canvas');
  // Aim through the public pointer into the registered opaque back-spine, within the unchanged collision box.
  await page.mouse.move(box.x + (after.body!.x + 29) * box.width / 640, box.y + (after.body!.y + 44) * box.height / 360);
  const stream = basiliskFrames(page, 7000); await page.mouse.down();
  let captures: Awaited<ReturnType<typeof basiliskFrames>>;
  try { captures = await stream; } finally { await page.mouse.up(); }
  const last = (await basiliskFrames(page))[0];
  await writeFile(info.outputPath('same-arena-final.png'), Buffer.from(last.png.split(',')[1], 'base64'));
  const views = await inspectBasilisk(page, [...captures.filter((_, i) => i % 2 === 0), last], source);
  await writeFile(info.outputPath('right-flank-observations.json'), JSON.stringify(views.map(({ capture, ...v }) => ({ at: capture.at, ...v })), null, 2));
  const rightAttack = views.find(v => v.body?.frame === 2 && v.body.flip && v.body.laserCover >= 6 && v.body.ray >= 100);
  expect(rightAttack, 'actual mirrored attack and beam, not a unit stub').toBeDefined(); positive(rightAttack!);
  expect(rightAttack!.cues.activeBeam).toBeGreaterThan(100); expect(views.some(v => v.cues.causal > 10)).toBe(true);
  await writeFile(info.outputPath('mirrored-active-gaze.png'), Buffer.from(rightAttack!.capture.png.split(',')[1], 'base64'));
  const live = views.filter(v => v.body !== null);
  expect(live.some(v => v.body!.hpPixels > 85 && v.body!.hpPixels < 170), 'actual middle HP band').toBe(true);
  expect(live.some(v => v.body!.hpPixels > 0 && v.body!.hpPixels < 85), 'actual final HP band').toBe(true);
  const cleared = page.getByRole('heading', { name: '十万卡炼丹炉已突破。', exact: true }); await expect(cleared).toBeVisible();
  const final = views.at(-1)!; positive(final); expect(final.body).toBeNull();
  expect(final.cues, 'full-canvas cues are scanned even when body is absent').toEqual({ hp: 0, activeBeam: 0, tellTip: 0, causal: 0 });
  expect(final.floorY).not.toBeNull(); expect(final.floorPixels).toBeGreaterThanOrEqual(500);
  // The canvas remains the furnace, not a hidden/blank canvas or a switched chapter.
  const persisted: unknown = JSON.parse(await rawSave(page) ?? 'null'); expect(isGameSave(persisted)).toBe(true);
  if (!isGameSave(persisted)) throw Error('Malformed actual checkpoint');
  expect(persisted).toMatchObject({ stage: 4, checkpoint: 0, donated: true, runId: attempt.runId });
  expect(persisted.actionCounts.rewinds).toBeGreaterThanOrEqual(1); expect(persisted.actionCounts.shots).toBeGreaterThan(20);
  expect([...seen.loaded].sort()).toEqual([...files].sort()); expect(seen.errors).toEqual([]); expect(seen.writes).toEqual([]);
});
