import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { assertDeceiverCaptureCompleted, keepDeceiverDiagnostic } from './deceiver-controls';
import { deceiverFrame, deceiverFrames, prepareDeceiverJump, nextDeceiverJumpFrame, finishDeceiverJump, keepDeceiverFrames, nativeBytes, type DeceiverAimFrame, type DeceiverCapturedFrame } from './deceiver-native';

/** Read only actual screenshot pixels; never inspect or set the engine's world. */
async function visiblePixels(page: Page, capture: Buffer) {
  return page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const probe = document.createElement('canvas'); probe.width = image.naturalWidth; probe.height = image.naturalHeight;
    const context = probe.getContext('2d'); if (!context) throw new Error('No screenshot pixel reader');
    context.drawImage(image, 0, 0);
    const { width, height } = probe, data = context.getImageData(0, 0, width, height).data;
    const sx = width / 640, sy = height / 360;
    let purple = 0, ivory = 0, coreCount = 0, cx = 0, cy = 0, minX = Infinity, maxX = -Infinity;
    let heroCount = 0, heroY = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      if (r === 217 && g === 119 && b === 87) { heroCount++; heroY += y / sy; }
      if (x < 300 * sx || x >= 430 * sx || y < 185 * sy || y >= 270 * sy) continue;
      if (r === 114 && g === 63 && b === 104) purple++;
      if (r === 245 && g === 232 && b === 200) ivory++;
      if (r === 251 && g === 136 && b === 111) { coreCount++; cx += x / sx; cy += y / sy; minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    }
    return { purple, ivory, coreCount, coreX: coreCount ? cx / coreCount : null, coreY: coreCount ? cy / coreCount : null,
      coreWidth: coreCount ? (maxX - minX + 1) / sx : 0, heroY: heroCount ? heroY / heroCount : null };
  }, capture.toString('base64'));
}
async function snapshot(page: Page) {
  const capture = await page.locator('canvas').screenshot();
  return { capture, pixels: await visiblePixels(page, capture) };
}
async function resumeAtActualCheckpoint(page: Page, upgraded = false) {
  // This supported DTO is an art/mechanic fixture, not a claimed fresh chapter playthrough.
  const original: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 1, elapsedMs: 10000,
    inventory: upgraded ? ['constitutional', 'interpretability'] : ['constitutional'] };
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), original);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await assertCheckpointAttempt(page, original);
  return original;
}

test('real E reveals the two-state sprite, stays alive through a long pause and expires back to the smile', async ({ page }) => {
  const errors: string[] = [], loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 200 && ['/game/deceiver.png', '/game/deceiver.json'].includes(path)) loaded.add(path);
  });
  await resumeAtActualCheckpoint(page);
  const friendly = await snapshot(page);
  expect(friendly.pixels.ivory).toBeGreaterThan(40); expect(friendly.pixels.purple).toBe(0); expect(friendly.pixels.coreCount).toBe(0);
  expect([...loaded].sort()).toEqual(['/game/deceiver.json', '/game/deceiver.png']);
  await writeFile('artifacts/browser/deceiver-friendly.png', friendly.capture);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).pixels.coreCount).toBeGreaterThan(30);
  const exposed = await snapshot(page); expect(exposed.pixels.purple).toBeGreaterThan(30);
  await writeFile('artifacts/browser/deceiver-revealed.png', exposed.capture);
  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
  await expect(pause).toBeVisible(); await page.waitForTimeout(200);
  const frozen = await page.locator('canvas').screenshot(), clock = await page.locator('.hud-cell').last().innerText();
  // Longer than the real 4-second default E duration: a wall-clock animation would expire here.
  await page.waitForTimeout(4300);
  expect(await page.locator('canvas').screenshot()).toEqual(frozen);
  expect(await page.locator('.hud-cell').last().innerText()).toBe(clock);
  await pause.getByRole('button', { name: '继续训练', exact: true }).click(); await expect(pause).toHaveCount(0);
  const resumed = await snapshot(page); expect(resumed.pixels.coreCount).toBeGreaterThan(30); expect(resumed.pixels.purple).toBeGreaterThan(30);
  await expect.poll(async () => (await snapshot(page)).pixels.coreCount, { timeout: 6000 }).toBe(0);
  const expired = await snapshot(page); expect(expired.pixels.purple).toBe(0); expect(expired.pixels.ivory).toBeGreaterThan(40);
  await writeFile('artifacts/browser/deceiver-expired.png', expired.capture);
  await expect(page.locator('canvas')).toHaveCount(1); expect(errors).toEqual([]);
  console.log('DECEIVER_NATIVE_E_FREEZE', { friendly: friendly.pixels, exposed: exposed.pixels, resumed: resumed.pixels, expired: expired.pixels, pausedPixelsIdentical: true });
});

for (const upgraded of [false, true]) {
  test(`a normal jump and one mouse shot hit the visible ${upgraded ? 8 : 5}px core and actually defeat the disguised enemy`, async ({ page }, info) => {
    await resumeAtActualCheckpoint(page, upgraded);
    // Actual history readiness guarantees birth grace elapsed; no fixed wall wait or simulator mutation.
    await expect(page.getByRole('button', { name: 'Q 回溯', exact: true })).toBeEnabled({ timeout: 12000 });
    const alive = await deceiverFrame(page); expect(alive.pixels.ivory).toBeGreaterThan(40);
    await page.keyboard.press('e');
    await expect.poll(async () => (await deceiverFrame(page)).pixels.coreCount).toBeGreaterThan(30);
    const exposed = await deceiverFrame(page), p = exposed.pixels, radius = upgraded ? 8 : 5;
    expect(p.purple).toBeGreaterThan(30); expect(p.coreX).not.toBeNull(); expect(p.coreY).not.toBeNull();
    expect(p.coreWidth).toBeGreaterThan(radius * 2 - 1.5); expect(p.coreWidth).toBeLessThan(radius * 2 + 1.5);
    // One bounded ordinary jump; no repeat-until-success jump or extra shot.
    const box = await page.locator('canvas').boundingBox(); expect(box).not.toBeNull();
    const approach: DeceiverAimFrame[] = []; let airborne: DeceiverAimFrame | null = null;
    let capturedApproach: DeceiverCapturedFrame[] = [];
    let recording: Awaited<ReturnType<typeof prepareDeceiverJump>> | null = null;
    let proof: Awaited<ReturnType<typeof deceiverFrames>> | null = null;
    let failed = false, primary: unknown; const diagnosticErrors: Error[] = [];
    const keep = async (label: string, action: () => Promise<unknown>) => {
      await keepDeceiverDiagnostic(diagnosticErrors, label, action);
    };
    try {
      recording = await prepareDeceiverJump(page);
      await page.keyboard.down('Space');
      for (let attempt = 0; attempt < 40; attempt++) {
        const f = await nextDeceiverJumpFrame(recording); approach.push(f); const q = f.pixels;
        if (f.at - approach[0].at > 900) break; // Deadline is measured from first observed native frame, not the Space edge.
        if (q.heroY !== null && q.heroCount >= 80 && q.heroY < 245 && q.coreY !== null && q.heroY <= q.coreY + 12 && q.purple > 30 && q.coreCount > 30) { airborne = f; break; }
      }
      expect(airborne, 'Fresh visible native actor near jump apex, not an old CSS screenshot').not.toBeNull();
      const aim = airborne!.pixels; expect(aim.heroY).not.toBeNull(); expect(aim.heroY!).toBeLessThan(245);
      expect(aim.coreWidth).toBeGreaterThan(radius * 2 - 1.5); expect(aim.coreWidth).toBeLessThan(radius * 2 + 1.5);
      expect(airborne!.rect).toEqual(box); expect(aim.coreX).not.toBeNull(); expect(aim.coreY).not.toBeNull();
      // The first qualifying frame already armed the one900ms shot stream. No new handle or PNG here.
      // Same-frame observed node; actual input still exactly one20ms trusted click, no hidden aiming hooks.
      await page.mouse.click(box!.x + aim.coreX! * box!.width / 640, box!.y + aim.coreY! * box!.height / 360, { delay: 20 });
      await page.keyboard.up('Space');
      await expect(page.locator('.runtime-log')).toContainText('核心节点已击破', { timeout: 5000 });
      await expect.poll(async () => (await snapshot(page)).pixels.purple).toBe(0);
      const defeated = await snapshot(page); expect(defeated.pixels.coreCount).toBe(0);
      await writeFile(`artifacts/browser/deceiver-core-${radius}.png`, nativeBytes(exposed));
      await writeFile(`artifacts/browser/deceiver-defeated-${radius}.png`, defeated.capture);
      console.log('DECEIVER_NATIVE_ONE_SHOT', { radius, visibleCore: p, airborne: aim.heroY, after: defeated.pixels });
    } catch (error) { failed = true; primary = error; }
    finally {
      await keep('release Space', () => page.keyboard.up('Space'));
      if (recording) await keep('collect actual recording', async () => {
        const saved = await finishDeceiverJump(recording!); capturedApproach = saved.approach; proof = saved;
        if (airborne) {
          const original = capturedApproach[airborne.captureId];
          if (!original || JSON.stringify({ ...original, png: undefined }) !== JSON.stringify(airborne)) throw Error('Original qualifying capture changed');
          airborne = original;
        }
        info.annotations.push({ type: 'deceiver-capture-budget', description: JSON.stringify({ ...saved.budget,
          qualificationToPointerMs: airborne && saved.edges[0] ? saved.edges[0].at - airborne.sampledAt : null,
          problems: saved.problems, deferredOriginalRgbaEncoding: true,
        }) });
        assertDeceiverCaptureCompleted(saved);
      });
      await keep('save jump evidence', () => keepDeceiverFrames(info, 'native-single-jump', capturedApproach));
      if (proof) {
        await keep('save emitted-shot evidence', () => keepDeceiverFrames(info, 'native-actual-single-shot', proof!.frames));
        await keep('save pointer evidence', () => info.attach('native-single-shot-inputs', { body: JSON.stringify({ edges: proof!.edges, aim: airborne, box }), contentType: 'application/json' }));
      }
    }
    if (failed) {
      if (diagnosticErrors.length) throw Object.assign(Error(`Original failure: ${primary instanceof Error ? primary.stack : String(primary)}; diagnostic failures: ${diagnosticErrors.map(e => e.message).join('; ')}`), { primary, diagnosticErrors });
      throw primary;
    }
    if (diagnosticErrors.length) throw Object.assign(Error(diagnosticErrors.map(e => e.message).join('; ')), { diagnosticErrors });
    // Original game assertions and every diagnostic must pass; failures remain independently recorded.
    expect(proof).not.toBeNull();
    expect(proof!.edges.map(e => [e.type, e.trusted, e.button, e.target])).toEqual([['pointerdown', true, 0, 'CANVAS'], ['pointerup', true, 0, 'CANVAS']]);
    const heldMs = proof!.edges[1].at - proof!.edges[0].at; expect(heldMs).toBeGreaterThanOrEqual(0); expect(heldMs).toBeLessThan(185);
    const moving = proof!.frames.flatMap(f => f.pixels.shots.map(b => ({ at: f.at, ...b })));
    expect(moving.length).toBeGreaterThanOrEqual(2);
    expect(moving.some((b, i) => moving.slice(i + 1).some(c => c.x > b.x + 5 && c.x < b.x + 50 && Math.abs(c.y - b.y) <= 12 && c.at > b.at && c.at - b.at <= 100))).toBe(true);
    expect(proof!.frames.every(f => f.pixels.shots.length <= 1)).toBe(true);
  });
}

for (const fault of ['missing-image', 'missing-revealed-frame'] as const) {
  test(`deceiver ${fault} is explicit and preserves the original save through resource retry`, async ({ page }) => {
    const original = { ...createRun(randomUUID(), 42), checkpoint: 1, score: 77, tokens: 31 };
    const pattern = fault === 'missing-image' ? '**/game/deceiver.png*' : '**/game/deceiver.json*';
    if (fault === 'missing-image') await page.route(pattern, route => route.abort('failed'));
    else {
      const atlas = JSON.parse(await readFile('public/game/deceiver.json', 'utf8')) as { frames: unknown[] };
      await page.route(pattern, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...atlas, frames: atlas.frames.slice(0, 7) }) }));
    }
    await page.addInitScript(value => { if (!localStorage.getItem('pdoom.save.v1')) localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); }, original);
    await page.goto('/');
    const alert = page.getByRole('alert', { name: '游戏资源加载失败' });
    await expect(alert).toContainText('伪装者图集加载失败', { timeout: 15000 });
    await expect(page.getByRole('button', { name: '开始新训练' })).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(original);
    await page.unroute(pattern); await alert.getByRole('button', { name: '刷新并重试', exact: true }).click();
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(original);
  });
}
