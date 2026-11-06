import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { attachClawd, clawdBytes, clawdFrames, clawdSource, inspectClawd, type ClawdCapture, type ClawdHit } from './clawd-pixels';
import { observeMirrorRightWithDash } from './mirror-controls';
import { assertMirrorHud, eraseHudEdge, hudPng, inspectMirrorHud, type MirrorHudEvidence } from './mirror-hud-pixels';
const paused = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
const faults = new WeakMap<Page, { errors: string[]; mutations: string[] }>();
test.setTimeout(90000);
test.beforeEach(({ page }) => {
  const record = { errors: [] as string[], mutations: [] as string[] }; faults.set(page, record);
  page.on('pageerror', e => record.errors.push(e.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) record.mutations.push(r.url()); });
});
test.afterEach(async ({ page }, info) => {
  for (const key of ['a', 'd', 'j', 'Shift', 'Space']) await page.keyboard.up(key);
  await info.attach('no-private-world-writes-or-guest-mutations', { body: JSON.stringify(faults.get(page)), contentType: 'application/json' });
  expect(faults.get(page)!.errors).toEqual([]); expect(faults.get(page)!.mutations).toEqual([]);
});
async function fixture(page: Page, viewport: { width: number; height: number }) {
  const save = { ...createRun(randomUUID(), 42), stage: 5, checkpoint: 2, doom: 8, elapsedMs: 12000 };
  expect(isGameSave(save)).toBe(true);
  await page.addInitScript(value => {
    const key = `r39-mirror-hud.${value.runId}`;
    if (!sessionStorage.getItem(key)) { if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(key, 'once'); }
  }, save);
  await page.setViewportSize(viewport); await page.goto('/'); return save;
}
async function restore(page: Page, saved: Awaited<ReturnType<typeof fixture>>) {
  const button = page.getByRole('button', { name: '恢复检查点', exact: true }); await expect(button).toBeEnabled({ timeout: 15000 }); await button.click();
  const attempt = await assertCheckpointAttempt(page, saved);
  await expect.poll(async () => { const m = /(\d+):(\d{2})/.exec(await page.locator('.hud-cell').last().innerText()); return m ? +m[1] * 60 + +m[2] : 0; }).toBeGreaterThanOrEqual(14);
  return attempt;
}
async function room(page: Page) {
  await page.keyboard.down('d'); await expect(page.locator('.objective')).toContainText('空椅子与镜子', { timeout: 10000 });
  await page.waitForTimeout(600); await page.keyboard.up('d'); await page.waitForTimeout(180);
}
async function reveal(page: Page) {
  // Stop on the near side using actual native pixels. Waiting on narrative while holding D can walk through the mirror.
  const source = await clawdSource(), before = (await clawdFrames(page))[0];
  const hero = inspectClawd(clawdBytes(before), source, 'aligned')[0]; expect(hero).toBeTruthy();
  const distance = 450 - (hero.x + 16); expect(distance).toBeGreaterThan(0);
  await page.keyboard.down('d'); await page.waitForTimeout(distance / 190 * 1000); await page.keyboard.up('d');
  await expect(page.locator('.objective')).toContainText('Ilya看到的是你', { timeout: 8000 });
  await expect(page.locator('.omega-readout')).toContainText('现场模仿学习', { timeout: 5000 });
}
// Sample live motion first; native PNG decoding/negative controls must not leave an unattended fight running.
// Only ordinary Escape is used. The captured source bytes, predicates and action-window budgets are unchanged.
async function frozenRead<T>(page: Page, read: () => Promise<T>, heldKeys: string[] = []): Promise<T> {
  const alreadyPaused = await paused(page).isVisible();
  if (!alreadyPaused) { await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible(); }
  try { return await read(); }
  finally {
    if (!alreadyPaused) {
      await page.keyboard.press('Escape'); await expect(paused(page)).not.toBeVisible();
      // Scene resume correctly clears keys; re-send only the ordinary key this controller actually owns.
      for (const key of heldKeys) { await page.keyboard.up(key); await page.keyboard.down(key); }
    }
  }
}
interface Observed { frame: ClawdCapture; hit: ClawdHit; hud: MirrorHudEvidence; batch: ClawdCapture[] }
async function findActual(page: Page, info: TestInfo, label: string, where: (hit: ClawdHit) => boolean, windows = 10, windowMs = 400, heldKeys: string[] = []): Promise<Observed> {
  const source = await clawdSource(), observations: object[] = []; let last: ClawdCapture | undefined;
  for (let pass = 0; pass < windows; pass++) {
    const frames = await clawdFrames(page, windowMs);
    const found = await frozenRead(page, async () => {
      for (const frame of frames) {
        last = frame; const hits = inspectClawd(clawdBytes(frame), source, 'foom');
        observations.push({ at: frame.at, hits });
        const hit = hits.find(where);
        if (hit) {
          const hud = inspectMirrorHud(hudPng(clawdBytes(frame)), hit.y);
          await attachClawd(info, label, frame, hits);
          await info.attach(label + '-actual-hud-pixels', { body: JSON.stringify({ hud, observations }), contentType: 'application/json' });
          return { frame, hit, hud, batch: frames };
        }
      }
      return undefined;
    }, heldKeys);
    if (found) return found;
  }
  if (last) await attachClawd(info, label + '-not-found', last, inspectClawd(clawdBytes(last), source, 'foom'));
  throw Error(label + ': no complete source-matched actor reached the required real screen region');
}
async function naturalCenter(page: Page, info: TestInfo, batch: ClawdCapture[]): Promise<Observed> {
  const source = await clawdSource(), where = (h: ClawdHit) => h.x + 16 >= 560 && h.x + 16 <= 580;
  // This normal actor region puts the whole label over plain wall, clear of the physical mirror frame atx511.
  const cached = await frozenRead(page, async () => {
    for (const frame of batch) {
      const hits = inspectClawd(clawdBytes(frame), source, 'foom'), hit = hits.find(where);
      if (hit) {
        const hud = inspectMirrorHud(hudPng(clawdBytes(frame)), hit.y);
        await attachClawd(info, 'natural-center-reference', frame, hits);
        await info.attach('natural-center-whole-aa-glyphs', { body: JSON.stringify(hud), contentType: 'application/json' });
        return { frame, hit, hud, batch };
      }
    }
    return undefined;
  });
  if (cached) return cached;
  return findActual(page, info, 'natural-center-reference', where, 8, 4500);
}
for (const [name, width, height] of [['desktop', 1280, 720], ['compact', 800, 450]] as const) {
  test(`mirror HUD ${name} keeps the actual right-edge name and HP whole through pause and checkpoint retry`, async ({ page }, info) => {
    const attempt = await restore(page, await fixture(page, { width, height })); await room(page);
    await page.keyboard.down('j'); await page.waitForTimeout(650); await page.keyboard.up('j'); await reveal(page);
    const edge = await findActual(page, info, 'right-edge', h => h.x + 16 >= 610, 6, 4500); assertMirrorHud(edge.hud);
    await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
    const still = (await clawdFrames(page))[0]; await page.waitForTimeout(450); const held = (await clawdFrames(page))[0];
    expect(held.png).toBe(still.png); await info.attach('paused-browser-ui', { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape'); await expect(paused(page)).not.toBeVisible();
    const center = await naturalCenter(page, info, edge.batch);
    assertMirrorHud(center.hud); assertMirrorHud(edge.hud, center.hud.label.key);
    for (const part of ['bar', 'name'] as const) {
      const bad = eraseHudEdge(hudPng(clawdBytes(edge.frame)), edge.hud, part);
      expect(() => assertMirrorHud(inspectMirrorHud(bad, edge.hit.y), center.hud.label.key)).toThrow();
    }
    await info.attach('negative-controls', { body: JSON.stringify({ missingBarColumn: 'rejected', missingNameColumn: 'rejected', memoryOnly: true, completeNameComparedTo: 'actual naturally centered same-phase label, not a producer font/layout getter' }), contentType: 'application/json' });
    await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible(); await paused(page).getByRole('button', { name: '返回终端', exact: true }).click();
    // Title intentionally preserves the frozen backdrop. A real new checkpoint attempt must clear the old combat HUD.
    await restore(page, attempt);
    const fresh = (await clawdFrames(page))[0], source = await clawdSource();
    const hero = inspectClawd(clawdBytes(fresh), source, 'aligned')[0]; expect(hero).toBeTruthy();
    const cleared = inspectMirrorHud(hudPng(clawdBytes(fresh)), hero.y);
    expect(cleared.label.ink).toBe(0); expect(cleared.bar).toBeNull();
    await attachClawd(info, 'new-attempt-no-stale-combat-label', fresh, inspectClawd(clawdBytes(fresh), source, 'aligned'));
    await expect(page.locator('canvas')).toHaveCount(1);
  });
}

test('mirror HUD follows genuinely learned dashes to the actual left edge without moving the combat actor', async ({ page }, info) => {
  await restore(page, await fixture(page, { width: 1280, height: 720 })); await room(page);
  // Three successful ordinary dashes, alternating in the safe room; no invented action history.
  for (const key of ['d', 'a', 'd']) {
    await page.keyboard.down(key); await page.waitForTimeout(40); await page.keyboard.press('Shift');
    await page.waitForTimeout(180); await page.keyboard.up(key); await page.waitForTimeout(1000);
  }
  await reveal(page);
  const right = await observeMirrorRightWithDash(
    () => findActual(page, info, 'dash-right-edge', h => h.x + 16 >= 610),
    () => expect(page.locator('.omega-readout')).toContainText('冲刺'),
  );
  assertMirrorHud(right.hud);
  // Stay at the real left arena wall. Only the enemy's learned kinematic dash can bring its native image here.
  await page.keyboard.down('a');
  const left = await findActual(page, info, 'dash-left-edge', h => h.x + 16 >= 16 && h.x + 16 <= 50, 8, 4000, ['a']);
  await page.keyboard.up('a'); assertMirrorHud(left.hud, right.hud.label.key);
  const hp = /HP(\d+)\/100/.exec(left.frame.hud[0]); expect(hp).toBeTruthy(); expect(Number(hp![1])).toBeGreaterThan(0);
  expect(left.hit.matched).toBe(left.hit.ink); expect(left.hit.excluded).toBe(0);
  info.annotations.push({ type: 'mirror-dash-observation-order', description: JSON.stringify({
    order: 'concurrent-right-and-dash-confirmation,both-settled,left-input', originalRightWindowCap: 10, originalRightWindowMs: 400,
    right: { at: right.frame.at, omega: right.frame.omega, hit: right.hit, batchFirst: right.batch[0].at, batchLast: right.batch[right.batch.length - 1].at, selectedIndex: right.batch.indexOf(right.frame) },
    left: { at: left.frame.at, omega: left.frame.omega, hit: left.hit },
  }) });
});
