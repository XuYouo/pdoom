import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { omegaEnvironmentSource, inspectOmegaEnvironment, roomEvidence, reflectionEvidence } from './omega-environment-pixels';
import { attachClawd, clawdBytes, clawdFrames, clawdSource, inspectClawd, oneClawdPhase, rewindClawdSource, corruptClawdCapture, wrongClawdPng, type ClawdCapture, type ClawdHit, type ClawdForm } from './clawd-pixels';
const failures = new WeakMap<Page, { errors: string[]; mutations: string[] }>();
test.setTimeout(60000);
test.beforeEach(({ page }) => {
  const f = { errors: [] as string[], mutations: [] as string[] }; failures.set(page, f);
  page.on('pageerror', e => f.errors.push(e.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) f.mutations.push(r.url()); });
});
test.afterEach(async ({ page }, info) => {
  await page.keyboard.up('j'); await page.keyboard.up('a'); await page.keyboard.up('d'); await page.keyboard.up('Space');
  await info.attach('ordinary-input-no-script-world-writes', { body: JSON.stringify(failures.get(page)), contentType: 'application/json' });
  expect(failures.get(page)!.errors).toEqual([]); expect(failures.get(page)!.mutations).toEqual([]);
});
async function fixture(page: Page, form: ClawdForm, where: { stage?: number; checkpoint?: number } = {}) {
  // A naturally safe CLOSED checkpoint, not a debug invulnerability or teleported live actor.
  const save = { ...createRun(randomUUID(), 42), checkpoint: 2, actionCounts: { shots: 97, dashes: 0, rewinds: 0, insights: 0 }, doom: { aligned: 8, masked: 60, foom: 85 }[form], elapsedMs: 12000, ...where };
  expect(isGameSave(save)).toBe(true);
  await page.addInitScript(value => {
    const marker = `r38-clawd.${value.runId}`;
    if (!sessionStorage.getItem(marker)) { if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(marker, 'once'); }
  }, save);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/'); return save;
}
async function restore(page: Page, original: Awaited<ReturnType<typeof fixture>>) {
  const button = page.getByRole('button', { name: '恢复检查点', exact: true }); await expect(button).toBeEnabled({ timeout: 15000 }); await button.click();
  const attempt = await assertCheckpointAttempt(page, original);
  await expect.poll(async () => { const m = /(\d+):(\d{2})/.exec(await page.locator('.hud-cell').last().innerText()); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; }).toBeGreaterThanOrEqual(Math.floor(original.elapsedMs / 1000) + 2);
  return attempt;
}
for (const form of ['aligned', 'masked', 'foom'] as const) test(`Clawd ${form} actual-shot source pixels distinguish fire, recover and calm`, async ({ page }, info) => {
  await restore(page, await fixture(page, form)); const source = await clawdSource();
  const first = (await clawdFrames(page))[0], firstHits = inspectClawd(clawdBytes(first), source, form); oneClawdPhase(firstHits, 'base');
  await attachClawd(info, 'before-shot', first, firstHits);
  const pending = clawdFrames(page, 650); await page.keyboard.down('j'); await page.waitForTimeout(65); await page.keyboard.up('j');
  const captures = await pending, observed = captures.map(c => ({ capture: c, hits: inspectClawd(clawdBytes(c), source, form) }));
  await info.attach('entire-pulse-native-observations', { body: JSON.stringify(observed.map(r => ({ at: r.capture.at, hits: r.hits }))), contentType: 'application/json' });
  for (const phase of ['fire', 'recover'] as const) {
    const found = observed.find(r => r.hits.some(h => h.phase === phase && !h.flipped));
    expect(found, `real ${form} ${phase} must appear after ordinary J`).toBeTruthy(); oneClawdPhase(found!.hits, phase, false);
    await attachClawd(info, phase, found!.capture, found!.hits);
    if (phase === 'fire') {
      const hit = oneClawdPhase(found!.hits, 'fire', false);
      expect(() => oneClawdPhase(firstHits, 'fire')).toThrow();
      for (const kind of ['channel', 'palm'] as const) expect(() => oneClawdPhase(inspectClawd(corruptClawdCapture(clawdBytes(found!.capture), source, hit, kind), source, form), 'fire')).toThrow();
      await info.attach('observer-counterexamples-not-browser-passes', { body: JSON.stringify({ idleAsFire: 'rejected', oneChannel: 'rejected', erasedPalm: 'rejected', memoryOnly: true }), contentType: 'application/json' });
    }
  }
  const final = observed[observed.length - 1]; oneClawdPhase(final.hits, 'base'); await attachClawd(info, 'after-recovery', final.capture, final.hits);
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).not.toContain('lastFiredAt'); await expect(page.locator('canvas')).toHaveCount(1);
});

type Observed = { capture: ClawdCapture; hits: ClawdHit[] };
async function observe(captures: ClawdCapture[], form: ClawdForm): Promise<Observed[]> {
  const source = await clawdSource(); return captures.map(c => ({ capture: c, hits: inspectClawd(clawdBytes(c), source, form) }));
}
async function proveObserved(info: TestInfo, label: string, rows: Observed[], predicate: (h: ClawdHit) => boolean) {
  const found = rows.find(r => r.hits.some(predicate));
  await info.attach(label + '-all-frame-facts', { body: JSON.stringify(rows.map(r => ({ at: r.capture.at, hud: r.capture.hud, hits: r.hits }))), contentType: 'application/json' });
  if (!found) for (let i = 0; i < rows.length; i++) await attachClawd(info, `${label}-failure-${i}`, rows[i].capture, rows[i].hits);
  expect(found, label + ': a complete native actor must actually appear').toBeTruthy();
  const hit = found!.hits.find(predicate)!; oneClawdPhase(found!.hits, hit.phase, hit.flipped);
  await attachClawd(info, label, found!.capture, found!.hits); return hit;
}
for (const form of ['aligned', 'masked', 'foom'] as const) test(`Clawd ${form} real left-right running and airborne shots keep native gait`, async ({ page }, info) => {
  await restore(page, await fixture(page, form));
  for (const key of ['a', 'd']) {
    const pending = clawdFrames(page, 720); await page.keyboard.down(key); await page.keyboard.down('j');
    await page.waitForTimeout(600); await page.keyboard.up('j'); await page.keyboard.up(key);
    const rows = await observe(await pending, form), flip = key === 'a';
    for (const phase of ['fire', 'recover'] as const) await proveObserved(info, `${key}-run-${phase}`, rows, h => h.phase === phase && h.flipped === flip && h.base >= 2 && h.base <= 5);
    expect(new Set(rows.flatMap(r => r.hits.filter(h => ['fire', 'recover'].includes(h.phase) && h.flipped === flip && h.base >= 2 && h.base <= 5).map(h => h.base))).size).toBeGreaterThanOrEqual(2);
  }
  const pending = clawdFrames(page, 800); await page.keyboard.down('Space'); await page.keyboard.down('j');
  await page.waitForTimeout(160); await page.keyboard.up('Space'); await page.waitForTimeout(190); await page.keyboard.up('j');
  const rows = await observe(await pending, form);
  for (const phase of ['fire', 'recover'] as const) await proveObserved(info, `jump-${phase}`, rows, h => h.phase === phase && h.base === 6 && !h.flipped);
});
const defects = ['png-request', 'json-request', 'unused-last-missing', 'unused-last-alias', 'unused-last-width', 'png-natural33'] as const;
for (const defect of defects) test(`Clawd ${defect} in unused FOOM refuses and preserves both save identities before real retry`, async ({ page }, info) => {
  const pattern = defect.startsWith('png-') ? '**/game/clawd-foom.png' : '**/game/clawd-foom.json';
  const breakResource = async (route: Route) => {
    if (defect.endsWith('-request')) { await route.abort('failed'); return; }
    if (defect === 'png-natural33') { await route.fulfill({ contentType: 'image/png', body: wrongClawdPng(await readFile('public/game/clawd-foom.png')) }); return; }
    const response = await route.fetch(), atlas = await response.json() as { frames: { frame: { x: number; w: number } }[] };
    expect(atlas.frames).toHaveLength(22);
    if (defect === 'unused-last-missing') atlas.frames.pop();
    if (defect === 'unused-last-alias') atlas.frames[21].frame.x = 640;
    if (defect === 'unused-last-width') atlas.frames[21].frame.w = 31;
    await route.fulfill({ response, json: atlas });
  };
  const saved = () => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  const failure = async (bytes: string) => {
    await expect(page.getByLabel('游戏资源加载失败', { exact: true }).getByText('Clawd 角色资源加载失败。请检查网络后刷新页面；本地检查点未改动。', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled(); expect(await saved()).toBe(bytes);
  };
  await page.route(pattern, breakResource); const original = await fixture(page, 'aligned'); await failure(JSON.stringify(original));
  await page.unroute(pattern, breakResource); await page.getByRole('button', { name: '刷新并重试', exact: true }).click();
  const attempt = await restore(page, original), source = await clawdSource(), first = (await clawdFrames(page))[0];
  const firstHits = inspectClawd(clawdBytes(first), source, 'aligned'); oneClawdPhase(firstHits, 'base'); await attachClawd(info, 'healthy-actual-attempt', first, firstHits);
  const attemptBytes = (await saved())!; await page.route(pattern, breakResource); await page.reload(); await failure(attemptBytes);
  await page.unroute(pattern, breakResource); await page.getByRole('button', { name: '刷新并重试', exact: true }).click();
  const retry = await restore(page, attempt), second = (await clawdFrames(page))[0], hits = inspectClawd(clawdBytes(second), source, 'aligned');
  oneClawdPhase(hits, 'base'); await attachClawd(info, 'healthy-new-retry', second, hits);
  expect(JSON.parse((await saved())!)).toEqual(retry); await expect(page.locator('canvas')).toHaveCount(1);
});

const paused = (p: Page) => p.getByRole('dialog', { name: '暂停前向传播。', exact: true });
for (const trigger of ['pause', 'blur'] as const) test(`Clawd ${trigger === 'blur' ? 'browser blur event' : 'real pause'} freezes the actual shot pose and cannot replay it on a fresh attempt`, async ({ page }, info) => {
    const attempt = await restore(page, await fixture(page, 'foom')); const source = await clawdSource();
    await page.keyboard.down('j'); await page.waitForTimeout(35);
    // Headless tab switching did not deliver a window blur. Exercise the standard DOM event, not private Game/World hooks.
    if (trigger === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press('Escape');
    await page.keyboard.up('j'); await expect(paused(page)).toBeVisible();
    const first = (await clawdFrames(page))[0], hits = inspectClawd(clawdBytes(first), source, 'foom');
    const shot = hits.find(h => h.phase === 'fire' || h.phase === 'recover'); expect(shot, 'freeze occurs during an actually emitted shot').toBeTruthy(); oneClawdPhase(hits, shot!.phase);
    await attachClawd(info, 'real-frozen-shot', first, hits);
    const bytes = await page.evaluate(() => localStorage.getItem('pdoom.save.v1')); await page.keyboard.press('j'); await page.waitForTimeout(250);
    expect((await clawdFrames(page))[0].png).toBe(first.png); expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(bytes);
    await paused(page).getByRole('button', { name: '继续训练', exact: true }).click(); await page.waitForTimeout(220);
    const settled = (await clawdFrames(page))[0]; oneClawdPhase(inspectClawd(clawdBytes(settled), source, 'foom'), 'base');
    await page.reload(); await restore(page, attempt); const fresh = (await clawdFrames(page))[0], freshHits = inspectClawd(clawdBytes(fresh), source, 'foom');
    oneClawdPhase(freshHits, 'base'); await attachClawd(info, 'new-attempt-no-old-pulse', fresh, freshHits);
});
test('Clawd real safe-room controls preserve calm native actor, frozen time and saved progress', async ({ page }, info) => {
  const original = await fixture(page, 'masked', { checkpoint: 12 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click(); await assertCheckpointAttempt(page, original);
  const rest = page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true }); await expect(rest).toBeVisible();
  const source = await clawdSource(), first = (await clawdFrames(page))[0], hits = inspectClawd(clawdBytes(first), source, 'masked'); oneClawdPhase(hits, 'base');
  const bytes = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  await page.keyboard.down('j'); await page.waitForTimeout(200); await page.keyboard.up('j');
  expect((await clawdFrames(page))[0].png).toBe(first.png); expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(bytes);
  await attachClawd(info, 'native-rest-is-not-an-attack', first, hits); await expect(rest).toBeVisible();
});
test('Clawd actual Q suppresses the shot while preserving native rewind tint and does not replay on release', async ({ page }, info) => {
  await restore(page, await fixture(page, 'aligned')); const source = await clawdSource(), tinted = rewindClawdSource(source);
  const pending = clawdFrames(page, 1100); await page.keyboard.down('j'); await page.waitForTimeout(35); await page.keyboard.press('q');
  await page.waitForTimeout(100); await page.keyboard.up('j'); const captures = await pending;
  const rows = captures.map(c => ({ capture: c, hits: inspectClawd(clawdBytes(c), tinted, 'aligned') }));
  await info.attach('Q-explicit-color-projection', { body: JSON.stringify({ tint: 'a5fff1', method: 'round each native RGB channel times the literal legacy tint /255', actorMask: 'none' }), contentType: 'application/json' });
  await proveObserved(info, 'actual-Q-native-tinted-base', rows, h => h.phase === 'base');
  expect(rows.every(r => r.hits.every(h => h.phase !== 'fire' && h.phase !== 'recover'))).toBe(true);
  const last = captures[captures.length - 1], hits = inspectClawd(clawdBytes(last), source, 'aligned'); oneClawdPhase(hits, 'base');
  await attachClawd(info, 'Q-ended-no-delayed-pulse', last, hits);
});

test('Clawd ordinary Omega approach shows genuine quiet reflected shots and independent hostile mirror shots', async ({ page }, info) => {
  await restore(page, await fixture(page, 'aligned', { stage: 5 })); const source = await clawdSource(), environment = await omegaEnvironmentSource();
  await page.keyboard.down('d'); await expect(page.locator('.objective')).toContainText('空椅子与镜子', { timeout: 10000 });
  await page.waitForTimeout(600); await page.keyboard.up('d'); await page.waitForTimeout(180);
  const baseline = (await clawdFrames(page))[0], view = inspectOmegaEnvironment(baseline, environment), room = roomEvidence(view);
  expect(room.camera).toBe(2540); expect(room.mirror).toBeTruthy(); expect(view.hero).toBeTruthy(); expect(view.hero!.centerX).toBeLessThan(271);
  await attachClawd(info, 'quiet-room-before-reflection', baseline, inspectClawd(clawdBytes(baseline), source, 'aligned'));
  // Walk toward an image-observed target; no coordinates or clocks are written into the simulator.
  await page.keyboard.down('d'); await page.waitForTimeout(Math.max(0, (315 - view.hero!.centerX) / 190 * 1000)); await page.keyboard.up('d'); await page.waitForTimeout(180);
  const atGlass = (await clawdFrames(page))[0], actual = inspectOmegaEnvironment(atGlass, environment); expect(actual.hero!.centerX).toBeGreaterThan(271); expect(actual.hero!.centerX).toBeLessThan(370);
  const pulse = clawdFrames(page, 650); await page.keyboard.down('j'); await page.waitForTimeout(65); await page.keyboard.up('j');
  const captures = await pulse, reflected = captures.map(c => ({ capture: c, evidence: reflectionEvidence(c, baseline, environment, room.mirror!, 0.45) }));
  await info.attach('all-quiet-reflection-facts', { body: JSON.stringify(reflected.map(r => ({ at: r.capture.at, evidence: r.evidence }))), contentType: 'application/json' });
  for (const [phase, lo, hi] of [['fire', 8, 14], ['recover', 15, 21]] as const) {
    const found = reflected.find(r => r.evidence.slot >= lo && r.evidence.slot <= hi && r.evidence.matched === r.evidence.ink && r.evidence.changed > 100);
    expect(found, `actual .45-alpha reversed ${phase} must match all source ink against the same real background`).toBeTruthy(); expect(found!.evidence.flipped).toBe(true);
    await attachClawd(info, `quiet-reflection-${phase}`, found!.capture, inspectClawd(clawdBytes(found!.capture), source, 'aligned'));
  }
  // Two more real successful emissions teach a genuine current-run sequence instead of inventing one from counts.
  await page.keyboard.down('j'); await page.waitForTimeout(420); await page.keyboard.up('j');
  await page.keyboard.down('d'); await expect(page.locator('.objective')).toContainText('Ilya看到的是你', { timeout: 6000 }); await page.keyboard.up('d');
  await expect(page.locator('.omega-readout')).toContainText('现场模仿学习', { timeout: 5000 });
  const duel = await observe(await clawdFrames(page, 4000), 'foom');
  for (const phase of ['fire', 'recover'] as const) await proveObserved(info, `real-hostile-mirror-${phase}`, duel, h => h.phase === phase);
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
});

test('Clawd genuine incoming damage interrupts firing with the immutable native hurt pose', async ({ page }, info) => {
  await restore(page, await fixture(page, 'aligned', { checkpoint: 0 }));
  const pending = clawdFrames(page, 4200); await page.keyboard.down('d'); await page.keyboard.down('j');
  await page.waitForTimeout(950); await page.keyboard.up('d'); await page.waitForTimeout(2000); await page.keyboard.up('j'); const captures = await pending, rows = await observe(captures, 'aligned');
  await proveObserved(info, 'real-hit-native-hurt', rows, h => h.phase === 'hurt' && h.frame === 7);
  expect(captures.some(c => { const m = /HP(\d+)\/100/.exec(c.hud[0]); return m && Number(m[1]) < 100; }), 'the ordinary HUD also records real damage, without a scripted HP change').toBe(true);
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
});
