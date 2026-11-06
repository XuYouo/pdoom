import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { withCleanup } from './factory-navigation';
import { deferredPickupWindow, preparePickupWaypoint, completePickupActions, type PickupWaypointProof } from './pickup-controls';
import { prepareClearedObservation, visibleAim } from './observation-setup';
import { alignVisiblePickup, collectVisiblePickup, prepareNativeObservation, HEAL_OBSERVATION_RETREAT, type PickupMotion, type PickupPosition } from './pickup-navigation';
import { pickupSource, pickupFrames, inspectPickups, hudNumbers, C1, c1Hero, referenceItem, loomCamera, loomPickupLocation, loomLowerSlot, registeredResidual,
  wrongNaturalSizePng, type PickupCapture, type PickupSource, type PickupView, type C1Id, type ItemHit } from './pickup-pixels';

// Legal initial saves and actual ordinary input only; no post-start HP/position/clock writes.
// Every evidence window is acquired first, then the real world is paused, then pixels are decoded offline.
test.setTimeout(180000);
const FAILURE = '拾取物资源加载失败。请检查网络后刷新页面；本地检查点未改动。';
const RESOURCES = ['/game/pickup-items.png', '/game/pickup-items.json'];
const paused = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
const rest = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
const observed = new WeakMap<Page, { errors: string[]; writes: string[]; loaded: Set<string>; captures: PickupCapture[]; steps: number; navigation: unknown[]; preparations: PickupWaypointProof[] }>();
test.beforeEach(async ({ page }) => {
  const state = { errors: [] as string[], writes: [] as string[], loaded: new Set<string>(), captures: [] as PickupCapture[], steps: 0, navigation: [] as unknown[], preparations: [] as PickupWaypointProof[] };
  observed.set(page, state); page.on('pageerror', error => state.errors.push(error.message));
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) state.writes.push(request.method() + ' ' + request.url());
  });
  page.on('response', response => { const path = new URL(response.url()).pathname; if (response.status() === 200 && RESOURCES.includes(path)) state.loaded.add(path); });
});
test.afterEach(async ({ page }, info) => {
  await withCleanup(async () => {
  if (!page.isClosed()) for (const key of ['a', 'd', 'Space', 'r', 'j', 'q', 'e', 'Shift']) await page.keyboard.up(key);
  if (info.status !== info.expectedStatus && !page.isClosed()) {
    try { await grab(page); } catch (error) { await info.attach('real-capture-error', { body: String(error), contentType: 'text/plain' }); }
    await keep(info, 'failure-all-acquired-raw', observed.get(page)!.captures, { navigation: observed.get(page)!.navigation });
  } else await keep(info, 'all-acquired-raw-including-navigation', observed.get(page)!.captures,
    { heldKeyCapture: 'Go has bounded held-direction raw preparation, encoded only after real pause/final raw and saved separately; original measurement captures remain released-key/paused; legacy pulses use real RAF without held-key PNG', movementSteps: observed.get(page)!.steps, navigation: observed.get(page)!.navigation });
  expect(observed.get(page)!.errors).toEqual([]); expect(observed.get(page)!.writes).toEqual([]);
  }, () => completePickupActions(observed.get(page)!.preparations.map((proof, i) => ({
    phase: `waypoint preparation ${i}`, run: () => keep(info, `waypoint-preparation-${i}`, proof.snapshot ? [proof.snapshot] : [], { ...proof, snapshot: undefined }),
  }))));
});
async function fixture(page: Page, stage: 1 | 4 = 1, checkpoint = 0) {
  const save: GameSaveData = { ...createRun(randomUUID(), 42), stage, checkpoint, hp: 100, tokens: 100, elapsedMs: 20000 };
  expect(isGameSave(save)).toBe(true);
  await page.addInitScript(value => {
    const once = 'r26-pickup.fixture.' + value.runId;
    if (!sessionStorage.getItem(once)) { localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(once, 'once'); }
  }, save);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/'); return save;
}
async function start(page: Page, stage: 1 | 4 = 1, checkpoint = 0) {
  const original = await fixture(page, stage, checkpoint), button = page.getByRole('button', { name: '恢复检查点', exact: true });
  await expect(button).toBeEnabled({ timeout: 15000 }); await button.click(); return { original, attempt: await assertCheckpointAttempt(page, original) };
}
async function grab(page: Page, ms = 0) {
  const frames = await pickupFrames(page, ms); observed.get(page)!.captures.push(...frames); return frames;
}
const one = async (page: Page) => (await grab(page))[0];
async function freeze(page: Page) {
  if (await paused(page).isVisible() || await rest(page).isVisible()) return;
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
}
async function resume(page: Page) {
  await paused(page).getByRole('button', { name: '继续训练', exact: true }).click(); await expect(paused(page)).toBeHidden();
}
function summary(view: PickupView) {
  return { at: view.capture.at, hud: view.capture.hud, objective: view.capture.objective, title: view.capture.title,
    hero: view.hero, items: view.items, terrain: view.terrain, supports: view.supports };
}
async function keep(info: TestInfo, name: string, frames: readonly PickupCapture[], metrics?: unknown) {
  const directory = info.outputPath(name); await mkdir(directory, { recursive: true }); const manifest = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], bytes = Buffer.from(f.png.split(',')[1], 'base64'), file = `${String(i).padStart(3, '0')}.png`;
    await writeFile(directory + '/' + file, bytes, { flag: 'wx' });
    manifest.push({ ...f, png: file, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const path = directory + '/evidence.json'; await writeFile(path, JSON.stringify({ method: 'real boundedrAF -> realpause/rest -> offlineNode', frames: manifest, metrics }, null, 2), { flag: 'wx' });
  await info.attach(name, { path, contentType: 'application/json' });
  if (frames.length) await info.attach(name + '-last-native', { path: directory + `/${String(frames.length - 1).padStart(3, '0')}.png`, contentType: 'image/png' });
}
function positive(view: PickupView, source: PickupSource, item?: ItemHit) {
  expect(view.hero, 'Actual full nativeClawd in this same PNG').not.toBeNull();
  expect(view.hero!.ratio).toBeGreaterThanOrEqual(.98); expect(view.hero!.ink).toBeGreaterThan(100);
  expect(view.terrain.length, 'Actual native support source in this same PNG').toBeGreaterThanOrEqual(4);
  for (const terrain of view.terrain) { expect(terrain.ratio).toBeGreaterThanOrEqual(.98); expect(terrain.colors).toBeGreaterThanOrEqual(3); }
  const hit = item ?? view.items[0]; expect(hit, 'Nonempty native livepickup, never an empty shell').toBeTruthy();
  expect(hit.ratio).toBeGreaterThanOrEqual(.98); expect(hit.colors).toBeGreaterThanOrEqual(3);
  expect(hit.ink).toBe(source.items[hit.slot].points.length); // Coin88ink is intentional, not Hero100.
}
async function window(page: Page, source: PickupSource, stage: 1 | 4, ms = 400) {
  const frames = await grab(page, ms); await freeze(page); const pausedFinal = await one(page);
  return { frames, pausedFinal, views: frames.map(frame => inspectPickups(frame, source, stage)) };
}
async function state(page: Page, source: PickupSource, stage: 1 | 4) {
  await freeze(page); return inspectPickups(await one(page), source, stage);
}
/** Navigation only: select one whole actual capture, never fuse hero/HUD/source or replace final pause/gain evidence. */
function navigationState(page: Page, source: PickupSource, stage: 1 | 4, batch: { frames: PickupCapture[]; pausedFinal: PickupCapture }) {
  const candidates = [...batch.frames, batch.pausedFinal].filter(f => batch.pausedFinal.at - f.at >= 0 && batch.pausedFinal.at - f.at <= 200).reverse();
  const selected = candidates.map(capture => inspectPickups(capture, source, stage)).find(v => v.hero && v.terrain.length >= 4 && v.items.length > 0);
  expect(selected, 'A complete same-frame native navigation view within200ms is mandatory; no invisible-player fallback').toBeTruthy();
  const state = observed.get(page)!;
  state.navigation.push({ purpose: 'navigation only, not pause-final identity or pickup benefit', chosenIndex: state.captures.indexOf(selected!.capture),
    pausedFinalIndex: state.captures.indexOf(batch.pausedFinal), lagMs: batch.pausedFinal.at - selected!.capture.at,
    pausedFinalHero: inspectPickups(batch.pausedFinal, source, stage).hero, chosenView: summary(selected!) });
  return selected!;
}
async function action(page: Page, source: PickupSource, stage: 1 | 4, direction: 'a' | 'd', ms: number, jump = false, requireNavigation = true, waypoint?: { reference: C1Id; target: number; tolerance: number; allowRest: boolean }) {
  expect(++observed.get(page)!.steps, 'Fixed18 ordinary movement-stage budget, no retry-until-green').toBeLessThanOrEqual(stage === 1 ? 18 : 12);
  expect(ms).toBeLessThanOrEqual(1500); const before = await one(page); // Genuine paused-before frame, outside the held-key interval.
  if (waypoint) {
    if (stage !== 1 || jump || ms !== 1500) throw Error('Waypoint owns one original bounded C1 direction stage');
    const reference = C1[waypoint.reference], slot = ['token', 'compute', 'heal'].indexOf(reference.kind);
    const batch = await preparePickupWaypoint(page, {
      source: { hero: source.hero, terrain: source.terrain, ledges: source.ledges, reference: source.items[slot] },
      reference, target: waypoint.target, tolerance: waypoint.tolerance, direction, allowRest: waypoint.allowRest,
    }, {
      resume: () => resume(page), freeze: () => freeze(page),
      measure: async () => { const batch = await deferredPickupWindow(page, 180, () => freeze(page));
        observed.get(page)!.captures.push(...batch.frames, batch.pausedFinal); return batch; },
      remember: proof => { observed.get(page)!.preparations.push(proof);
        observed.get(page)!.navigation.push({ purpose: 'held-direction raw waypoint preparation, never acceptance', movementStep: observed.get(page)!.steps, reference: waypoint.reference, target: waypoint.target, direction, node: proof.node, result: proof.result }); },
    }, before);
    if (!requireNavigation || await rest(page).isVisible()) return inspectPickups(batch.pausedFinal, source, stage);
    return navigationState(page, source, stage, batch);
  }
  await resume(page); await page.keyboard.down(direction);
  if (jump) await page.keyboard.down('Space');
  try {
    if (jump) { await page.waitForTimeout(Math.min(ms, 550)); await page.keyboard.up('Space'); if (ms > 550) await page.waitForTimeout(ms - 550); }
    else await page.waitForTimeout(ms);
  } finally { await page.keyboard.up(direction); if (jump) await page.keyboard.up('Space'); }
  const frames = await grab(page, 180); await freeze(page); const pausedFinal = await one(page);
  if (!requireNavigation || await rest(page).isVisible()) return inspectPickups(pausedFinal, source, stage);
  return navigationState(page, source, stage, { frames, pausedFinal });
}
/** The real paused-final is mandatory here; no earlier navigation-frame selection. */
function pickupMotion(page: Page, source: PickupSource, stage: 1 | 4,
  locate: (view: PickupView) => PickupPosition): PickupMotion<PickupPosition & { view: PickupView }> {
  const frame = () => page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(resolve)));
  const measure = async () => {
    const view = await state(page, source, stage);
    await expect(rest(page)).toBeHidden();
    expect(hudNumbers(view.capture).hp).toBeGreaterThan(0);
    expect(view.hero, 'Actual paused-final native hero, never stale navigation').not.toBeNull();
    expect(view.hero!.ratio).toBeGreaterThanOrEqual(.98); expect(view.terrain.length).toBeGreaterThanOrEqual(4);
    expect(view.hero!.ink).toBeGreaterThan(100);
    for (const tile of view.terrain) { expect(tile.ratio).toBeGreaterThanOrEqual(.98); expect(tile.colors).toBeGreaterThanOrEqual(3); }
    const position = locate(view);
    observed.get(page)!.navigation.push({ purpose: 'bounded actual paused-final pickup feedback',
      movementSteps: observed.get(page)!.steps, ...position, view: summary(view) });
    return { ...position, view };
  };
  const port: PickupMotion<PickupPosition & { view: PickupView }> = {
    measure,
    pulse: async (key, ms, settle, frameAck = false) => {
      expect(++observed.get(page)!.steps, 'Every ordinary pulse uses the original18/12 global budget').toBeLessThanOrEqual(stage === 1 ? 18 : 12);
      expect(ms).toBeGreaterThanOrEqual(18); expect(ms).toBeLessThanOrEqual(130);
      observed.get(page)!.navigation.push({ purpose: 'ordinary feedback input', key, requestedMs: ms,
        settleAfterMs: settle ? 180 : 0, awaitActualFrame: frameAck, movementStep: observed.get(page)!.steps });
      await one(page);
      return withCleanup(async () => {
        await resume(page);
        await withCleanup(async () => {
          await page.keyboard.down(key);
          if (frameAck) await Promise.all([page.waitForTimeout(ms), frame()]); else await page.waitForTimeout(ms);
        }, () => page.keyboard.up(key));
        if (settle) await grab(page, 180);
        return measure();
      }, () => freeze(page));
    },
    coast: async ms => withCleanup(async () => {
      observed.get(page)!.navigation.push({ purpose: 'ordinary neutral brake, no held direction', ms, movementSteps: observed.get(page)!.steps });
      await resume(page); await Promise.all([page.waitForTimeout(ms), frame()]); return measure();
    }, () => freeze(page)),
  };
  return port;
}
async function travel(page: Page, source: PickupSource, view: PickupView, reference: C1Id, target: number, jump = false) {
  const before = c1Hero(view, reference), dx = target - before.x;
  return action(page, source, 1, dx < 0 ? 'a' : 'd', Math.min(1500, Math.max(20, Math.round(Math.abs(dx) / 190 * 1000))), jump);
}
async function go(page: Page, source: PickupSource, initial: PickupView, reference: C1Id, target: number, tolerance = 8, allowRest = false) {
  let view = initial;
  for (let step = 0; step < 3; step++) {
    const position = c1Hero(view, reference); if (Math.abs(position.x - target) <= tolerance) return view;
    view = await action(page, source, 1, target < position.x ? 'a' : 'd', 1500, false, true, { reference, target, tolerance, allowRest });
    if (allowRest && await rest(page).isVisible()) return view;
  }
  expect(Math.abs(c1Hero(view, reference).x - target), 'Bounded normal-input waypoint').toBeLessThanOrEqual(tolerance); return view;
}
function publicSeconds(capture: PickupCapture) {
  const clock = capture.hud[3]?.match(/(\d+):(\d{2})/); expect(clock, 'Actual public HUD clock').toBeTruthy();
  return Number(clock![1]) * 60 + Number(clock![2]);
}
/** Real mouse fire only. The later450ms absence window is neither inspected nor retried here. */
async function clearHealObservationThreats(page: Page, info: TestInfo, source: PickupSource) {
  const describe = (view: PickupView) => {
    const reference = referenceItem(view, 'compute2'); positive(view, source, reference.hit);
    return { ...hudNumbers(view.capture), seconds: publicSeconds(view.capture), x: c1Hero(view, 'compute2').x, heroRegistered: !!view.hero && view.hero.ratio >= .98,
      referenceRegistered: reference.hit.ratio >= .98, view, reference };
  };
  let current = describe(await state(page, source, 1));
  const result = await prepareClearedObservation({
    observe: async () => current,
    shoot: async (target, burst, milliseconds) => {
      const hero = current.view.hero!, offset = target.id === 'parrot2' ? [-12, 0, 12, 0][(burst - 1) % 4] : 0;
      const aim = visibleAim({ x: hero.centerX, y: hero.feet - 16 }, { x: target.x + offset - current.reference.scrollX, y: target.y });
      const canvas = await page.locator('canvas').boundingBox(); expect(canvas).not.toBeNull();
      observed.get(page)!.navigation.push({ purpose: 'bounded real mouse combat before absence acceptance', target, burst, milliseconds, aim, movementSteps: observed.get(page)!.steps });
      await withCleanup(async () => {
        await resume(page); await page.mouse.move(canvas!.x + aim.x * canvas!.width / 640, canvas!.y + aim.y * canvas!.height / 360);
        await withCleanup(async () => {
          await page.mouse.down();
          await Promise.all([page.waitForTimeout(milliseconds), page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(resolve)))]);
        }, () => page.mouse.up());
      }, async () => { await page.mouse.up(); });
      const batch = await deferredPickupWindow(page, 180, () => freeze(page));
      observed.get(page)!.captures.push(...batch.frames, batch.pausedFinal);
      await expect(rest(page)).toBeHidden(); expect(hudNumbers(batch.pausedFinal).hp).toBeGreaterThan(0);
      // Existing same-frame navigation registration, never a replacement for later acceptance or HP-gain evidence.
      current = describe(navigationState(page, source, 1, batch));
      await keep(info, `heal-threat-${target.id}-${burst}`, [...batch.frames, batch.pausedFinal], { target, burst, aim, navigation: summary(current.view), actualFinalHud: batch.pausedFinal.hud });
      return current;
    },
    drain: async seconds => {
      const start = current.seconds; await resume(page);
      await expect.poll(async () => {
        const clock = (await page.locator('.hud-cell').nth(3).innerText()).match(/(\d+):(\d{2})/); expect(clock).toBeTruthy();
        return Number(clock![1]) * 60 + Number(clock![2]);
      }, { timeout: 16000, intervals: [100] }).toBeGreaterThanOrEqual(start + seconds);
      const batch = await window(page, source, 1, 250); current = describe(inspectPickups(batch.pausedFinal, source, 1));
      await keep(info, 'heal-after-real-combat-drain', [...batch.frames, batch.pausedFinal], { actualStartSeconds: start, requiredAdvance: seconds, final: summary(current.view) });
      return current;
    },
  });
  expect(c1Hero(result.view, 'compute2').feet).toBe(258); await expect(rest(page)).toBeHidden();
}

async function c1Absence(page: Page, info: TestInfo, source: PickupSource, id: C1Id, liveId: C1Id, name: string) {
  await resume(page); const acquired = await window(page, source, 1, 450);
  const rows = acquired.views.map((view, index) => {
    const reference = referenceItem(view, liveId);
    return { index, view, live: reference.hit, residual: registeredResidual(view, source, C1[id].kind, C1[id], reference) };
  });
  await keep(info, name, acquired.frames, rows.map(row => ({ index: row.index, view: summary(row.view), live: row.live, residual: row.residual })));
  expect(rows.every(row => !row.residual.obscuredByHero)).toBe(true);
  expect(Math.max(...rows.map(row => row.residual.maximum.ratio))).toBeLessThan(.8);
  const same = rows.find(row => row.view.hero && row.view.terrain.length >= 4); expect(same).toBeTruthy(); positive(same!.view, source, same!.live);
  return { ...acquired, last: await state(page, source, 1) };
}
async function firstToken(page: Page, info: TestInfo, source: PickupSource, prefix: string) {
  const initial = await window(page, source, 1, 1200), first = initial.views.find(v => v.hero && v.items.some(i => i.kind === 'token'))!;
  await keep(info, prefix + '-initial-source-and-hero', initial.frames, initial.views.map(summary)); positive(first, source, referenceItem(first, 'token1').hit);
  positive(first, source, referenceItem(first, 'compute1').hit); expect(hudNumbers(first.capture)).toEqual({ hp: 100, tokens: 100, doom: 8 });
  let view = await state(page, source, 1); view = await go(page, source, view, 'compute1', 210);
  view = await travel(page, source, view, 'compute1', 290, true); await go(page, source, view, 'compute1', 328);
  const after = await c1Absence(page, info, source, 'token1', 'compute1', prefix + '-token1-full-registered-negative');
  expect(hudNumbers(after.last.capture).tokens).toBe(112); return { first, view: after.last };
}


test('C1 actual token and compute collection retain live controls and checkpoint score', async ({ page }, info) => {
  const source = await pickupSource(); await start(page);
  let { view } = await firstToken(page, info, source, 'token-compute');
  positive(view, source, referenceItem(view, 'compute1').hit);
  await keep(info, 'compute-before-positive', [view.capture], summary(view));
  view = await travel(page, source, view, 'compute1', 475, true);
  view = await go(page, source, view, 'token2', 520);
  const compute = await c1Absence(page, info, source, 'compute1', 'token2', 'compute-complete-registered-negative');
  expect(hudNumbers(compute.last.capture)).toMatchObject({ tokens: 120, doom: 36 });
  view = await go(page, source, compute.last, 'token2', 620);
  positive(view, source, referenceItem(view, 'token2').hit); await keep(info, 'second-token-before-positive', [view.capture], summary(view));
  view = await travel(page, source, view, 'token2', 715);
  const token2 = await c1Absence(page, info, source, 'token2', 'compute2', 'second-token-registered-negative');
  expect(hudNumbers(token2.last.capture).tokens).toBe(136);
  view = await go(page, source, token2.last, 'compute2', 1150);
  view = await travel(page, source, view, 'compute2', 1260, true);
  // A real visit to the checkpoint is the score oracle. Old paused localStorage is not live Core state.
  await go(page, source, view, 'heal1', 1400, 8, true); await expect(rest(page)).toContainText('CHAPTER 01 / SAFE ROOM 01');
  const saved = JSON.parse((await stored(page))!) as GameSaveData; expect(isGameSave(saved)).toBe(true);
  expect(saved).toMatchObject({ stage: 1, checkpoint: 11, score: 56, doom: 36 });
  expect(saved.tokens).toBe(136 + (saved.hp >= 60 ? 24 : 12));
  await keep(info, 'actual-checkpoint-score-not-live-localstorage', [await one(page)], { saved, collected: ['token1:12', 'compute1:28', 'token2:16'], ordinarySteps: observed.get(page)!.steps });
});

test('full-health C1 suffers real enemy damage before collecting heal with registered absence and live compute', async ({ page }, info) => {
  const source = await pickupSource(); await start(page);
  const initial = await window(page, source, 1, 1200), before = initial.views.find(v => v.hero)!;
  expect(hudNumbers(before.capture).hp).toBe(100); positive(before, source, referenceItem(before, 'token1').hit);
  let view = await state(page, source, 1); view = await go(page, source, view, 'compute1', 480);
  if (hudNumbers(await one(page)).hp === 100) {
    await resume(page); const damaged = await window(page, source, 1, 3000); view = navigationState(page, source, 1, damaged);
  }
  const damagedFinal = await one(page);
  await keep(info, 'full-health-start-and-actual-enemy-damage', [...observed.get(page)!.captures], { navigationView: summary(view), actualFinal: damagedFinal.hud });
  expect(hudNumbers(damagedFinal).hp).toBeLessThan(100); expect(hudNumbers(damagedFinal).hp).toBeGreaterThan(0);
  view = await go(page, source, view, 'compute1', 540);
  view = await travel(page, source, view, 'compute1', 620, true);
  expect(c1Hero(view, 'token2').feet, 'Actual native foot must land on the590/y254 ledge before crossing the gap').toBe(254);
  view = await travel(page, source, view, 'token2', 715);
  view = await go(page, source, view, 'compute2', 1150);
  view = await travel(page, source, view, 'compute2', 1260, true);
  positive(view, source, referenceItem(view, 'heal1').hit); positive(view, source, referenceItem(view, 'compute2').hit);
  await keep(info, 'heal-and-live-compute-before-collection', [view.capture], summary(view));
  view = await go(page, source, view, 'heal1', 1344, 4);
  await resume(page); const settled = await window(page, source, 1, 250); view = navigationState(page, source, 1, settled);
  const preHp = hudNumbers(settled.pausedFinal).hp; expect(preHp).toBeLessThan(100); expect(c1Hero(view, 'heal1').feet).toBe(320);
  const pre = c1Hero(view, 'heal1'); expect(pre.x).toBeGreaterThanOrEqual(1338); expect(pre.x).toBeLessThanOrEqual(1348);
  // Fixed130ms can stop atx1356, outside the actual collection radius. Observe each
  // ordinary pulse instead; all count in the unchanged18-stage budget. No checkpoint benefit.
  await collectVisiblePickup(pickupMotion(page, source, 1, current => {
    const heal = current.items.find(item => item.kind === 'heal');
    return { x: heal ? c1Hero(current, 'heal1').x : null, targetPresent: !!heal };
  }), 1363);
  await expect(rest(page)).toBeHidden();
  const healedFinal = await one(page), healed = hudNumbers(healedFinal).hp; expect(healed).toBeGreaterThan(preHp); expect(healed).toBeLessThanOrEqual(Math.min(100, preHp + 28));
  await keep(info, 'actual-heal-hp-before-rest', [settled.pausedFinal, healedFinal], { preHp, healed, before: pre, benefitSource: 'actual final HUD captures, never navigation selection' });
  const retreat = HEAL_OBSERVATION_RETREAT;
  observed.get(page)!.navigation.push({ purpose: 'ordinary jump retreat to the real upper forest platform, not longer recovery waiting',
    key: retreat.direction, ms: retreat.ms, jump: retreat.jump, expectedFeet: retreat.feet, movementStep: observed.get(page)!.steps + 1 });
  await action(page, source, 1, retreat.direction, retreat.ms, retreat.jump, false); await expect(rest(page)).toBeHidden();
  // A later genuine hit may start the normal750ms blink. Prepare a visible actor,
  // never reinterpret a missing hero as non-obscuring or discard acceptance frames.
  await prepareNativeObservation(async attempt => {
    await resume(page); const batch = await window(page, source, 1, 250);
    const views = [...batch.views, inspectPickups(batch.pausedFinal, source, 1)];
    const rows = views.map(current => ({ heroVisible: !!current.hero && current.hero.ratio >= .98, hp: hudNumbers(current.capture).hp }));
    await keep(info, 'heal-recovery-preparation-' + attempt, [...batch.frames, batch.pausedFinal], { purpose: 'actor readiness only, not pickup absence acceptance', rows });
    return rows;
  });
  const elevated = await state(page, source, 1), safePosition = c1Hero(elevated, 'compute2');
  expect(safePosition.feet, 'Actual upper platform reached by ordinary jump; never a predicted or injected position').toBe(retreat.feet);
  expect(safePosition.x).toBeGreaterThanOrEqual(1180); expect(safePosition.x).toBeLessThanOrEqual(1325);
  observed.get(page)!.navigation.push({ purpose: 'actual native elevated observation location', position: safePosition, view: summary(elevated) });
  await clearHealObservationThreats(page, info, source);
  const absent = await c1Absence(page, info, source, 'heal1', 'compute2', 'heal-all-frame-registered-negative');
  positive(absent.last, source, referenceItem(absent.last, 'compute2').hit);
});

test('real C4 saved-rest fullscreen and native WebGL restore preserve nonempty pickup and hero', async ({ page }, info) => {
  const source = await pickupSource(), original = await fixture(page, 4, 11);
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '全屏显示', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click(); await assertCheckpointAttempt(page, original);
  await expect(rest(page)).toContainText('CHAPTER 04 / SAFE ROOM 01');
  const frozen = await one(page), view = inspectPickups(frozen, source, 4); positive(view, source);
  const save = await stored(page), hud = frozen.hud; await page.waitForTimeout(750);
  expect((await one(page)).png).toBe(frozen.png); expect(await stored(page)).toBe(save);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const canvas = document.querySelector('canvas'); if (!canvas) throw Error('Missing actual canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl'), extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Actual WEBGL_lose_context required');
    const timeout = setTimeout(() => reject(Error('Real context restore timeout')), 10000);
    canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timeout); resolve(); }, { once: true });
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 180);
  }));
  const restored = await one(page), after = inspectPickups(restored, source, 4); positive(after, source);
  await keep(info, 'rest-native-before', [frozen], summary(view)); await keep(info, 'rest-after-genuine-context-restore', [restored], summary(after));
  expect(restored.png).toBe(frozen.png); expect(restored.hud).toEqual(hud); expect(await stored(page)).toBe(save);
  const dimensions = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height, ratio: c.getBoundingClientRect().width / c.getBoundingClientRect().height }));
  expect(dimensions).toEqual({ width: 640, height: 360, ratio: 16 / 9 });
  await rest(page).getByRole('button', { name: '不再交易，继续前进', exact: true }).click();
  const continued = await window(page, source, 4, 1200);
  await keep(info, 'rest-continue-normal-invulnerability-expiry', continued.frames, continued.views.map(summary));
  const pausedFrame = await one(page), pausedView = inspectPickups(pausedFrame, source, 4); positive(pausedView, source);
  await page.waitForTimeout(750); expect((await one(page)).png).toBe(pausedFrame.png);
  await keep(info, 'real-pause-nonempty-native', [pausedFrame], summary(pausedView));
  expect([...observed.get(page)!.loaded].sort()).toEqual([...RESOURCES].sort());
});


test('ordinary C4 lower-token collection then one R remaps the live upper token without reviving the spent id', async ({ page }, info) => {
  const source = await pickupSource(); await start(page, 4, 0);
  const initial = await window(page, source, 4, 1200), first = initial.views.find(v => v.hero && v.items.filter(i => i.kind === 'token').length >= 2)!;
  positive(first, source); await keep(info, 'loom-initial-two-live-tokens', initial.frames, initial.views.map(summary));
  let view = await state(page, source, 4);
  const moveTo = async (target: number) => {
    const position = view.hero!.centerX + loomCamera(view).scrollX, dx = target - position;
    view = await action(page, source, 4, dx < 0 ? 'a' : 'd', Math.min(1500, Math.max(20, Math.round(Math.abs(dx) / 190 * 1000 + 25))));
  };
  await moveTo(190); // Normal walk to the real hub edge expands the first diamond; no generated-plan oracle.
  let camera = loomCamera(view);
  const lower = view.items.find(i => i.kind === 'token' && i.centerY + camera.scrollY > 400)!;
  positive(view, source, lower); const oldSlot = loomPickupLocation(view, lower), candidate = loomLowerSlot(view);
  expect(Math.abs(candidate.x - oldSlot.x)).toBeLessThanOrEqual(1); expect(candidate.y).toBe(oldSlot.y);
  await moveTo(oldSlot.x - 40);
  camera = loomCamera(view); const beforeLower = view.items.find(i => i.kind === 'token' && i.centerY + camera.scrollY > 400)!;
  const beforeUpper = view.items.find(i => i.kind === 'token' && i.centerY + camera.scrollY < 330)!;
  positive(view, source, beforeLower); positive(view, source, beforeUpper);
  const oldUpper = loomPickupLocation(view, beforeUpper), tokens = hudNumbers(view.capture).tokens;
  await keep(info, 'loom-two-native-sources-before-ordinary-collection', [view.capture], { oldSlot, oldUpper, view: summary(view) });
  await moveTo(oldSlot.x + 50); expect(hudNumbers(await one(page)).tokens).toBe(tokens + 12);
  // Bounded ordinary corrections beforeR only, each charged to the original12-stage budget.
  // The still-live upper's worldX came from the earlier REAL hub registration.
  const oldBeacon = (current: PickupView) => {
    const upper = current.items.filter(i => i.kind === 'token' && i.centerY < 150); expect(upper).toHaveLength(1);
    expect(current.hero).not.toBeNull(); return current.hero!.centerX + oldUpper.x - upper[0].centerX;
  };
  const residualDistance = oldSlot.x + 50 - oldBeacon(view);
  const stepsBefore = observed.get(page)!.steps;
  const aligned = await alignVisiblePickup(pickupMotion(page, source, 4,
    current => ({ x: oldBeacon(current), targetPresent: true })), oldSlot.x + 50);
  view = aligned.view;
  const actualResidual = oldBeacon(view) - oldSlot.x - 50;
  observed.get(page)!.navigation.push({ purpose: 'preR native feedback, actual60Hz quantization measured',
    before: residualDistance, actualResidual, maximumCorrections: 8,
    actualMovementPulses: observed.get(page)!.steps - stepsBefore, globalBudget: 12 });
  expect(Math.abs(actualResidual)).toBeLessThanOrEqual(4);
  // Never call oldBeacon after R. Every negative frame, and every postR location, still requires an actual real hub.

  const inspectNegative = async (label: string, destination: { x: number; y: number }) => {
    await resume(page); const batch = await window(page, source, 4, 250);
    const rows = batch.views.map((v, index) => {
      const registered = loomCamera(v), upper = v.items.find(i => i.kind === 'token' && i.centerY + registered.scrollY < 330)!;
      return { index, view: v, upper, residual: registeredResidual(v, source, 'token', destination, registered) };
    });
    await keep(info, label, batch.frames, rows.map(row => ({ index: row.index, view: summary(row.view), upper: row.upper, residual: row.residual })));
    expect(rows.every(row => row.upper && !row.residual.obscuredByHero)).toBe(true);
    expect(Math.max(...rows.map(row => row.residual.maximum.ratio))).toBeLessThan(.8);
    const same = rows.find(row => row.view.hero && row.view.terrain.length >= 4)!; positive(same.view, source, same.upper);
    view = await state(page, source, 4);
  };
  await inspectNegative('loom-consumed-token-all-frames-negative', oldSlot);
  const beforeR = view, beforeRToken = hudNumbers(view.capture).tokens;
  await resume(page); await page.keyboard.press('r'); const reroll = await window(page, source, 4, 200);
  view = await state(page, source, 4); const newSlot = loomLowerSlot(view), nextCamera = loomCamera(view);
  const upper = view.items.find(i => i.kind === 'token' && i.centerY + nextCamera.scrollY < 330)!;
  positive(view, source, upper); const newUpper = loomPickupLocation(view, upper);
  expect(newUpper.y).not.toBe(oldUpper.y); expect(Math.abs(newUpper.y - oldUpper.y)).toBeGreaterThanOrEqual(8);
  expect(newSlot.y).not.toBe(oldSlot.y); expect(hudNumbers(view.capture).tokens).toBe(beforeRToken);
  await keep(info, 'loom-genuine-R-raw', reroll.frames, { before: summary(beforeR), after: summary(view), oldSlot, newSlot, oldUpper, newUpper });
  const heroX = view.hero!.centerX + nextCamera.scrollX;
  if (Math.abs(heroX - newSlot.x) < 36) await moveTo(newSlot.x + 40);
  await inspectNegative('loom-after-R-spent-slot-never-reappears-whole-window', newSlot);
  expect(hudNumbers(view.capture).tokens).toBe(beforeRToken); expect(observed.get(page)!.steps).toBeLessThanOrEqual(12);
});

test('ordinary collected token returns after real menu and a new training run, not a frozen menu backdrop', async ({ page }, info) => {
  const source = await pickupSource(), { attempt } = await start(page);
  await firstToken(page, info, source, 'new-run-lifecycle');
  await paused(page).getByRole('button', { name: '返回终端', exact: true }).click();
  const button = page.getByRole('button', { name: '开始新训练', exact: true }); await expect(button).toBeVisible(); await button.click();
  const acquired = await window(page, source, 1, 1200), view = acquired.views.find(v => v.hero && v.items.some(i => i.kind === 'token'))!;
  const next = JSON.parse((await stored(page))!) as GameSaveData; expect(next.runId).not.toBe(attempt.runId); expect(next.stage).toBe(1);
  positive(view, source, referenceItem(view, 'token1').hit); positive(view, source, referenceItem(view, 'compute1').hit);
  expect(hudNumbers(view.capture).tokens).toBe(0); await expect(page.locator('canvas')).toHaveCount(1);
  await keep(info, 'new-run-recreated-native-pickups-and-hero', acquired.frames, { previousAttempt: attempt.runId, next, rows: acquired.views.map(summary) });
});

const DEFECTS = ['png-request', 'unused-heal-omitted', 'unused-heal-width', 'unused-heal-cut', 'png-natural97'] as const;
for (const defect of DEFECTS) test(`pickup ${defect} fails closed for source and actual attempt, then healthy native restore`, async ({ page }, info) => {
  const source = await pickupSource(), pattern = defect.startsWith('png-') ? '**/game/pickup-items.png' : '**/game/pickup-items.json';
  const breakResource = async (route: Route) => {
    if (defect === 'png-request') { await route.abort('failed'); return; }
    if (defect === 'png-natural97') {
      await route.fulfill({ contentType: 'image/png', body: wrongNaturalSizePng(await readFile('public/game/pickup-items.png')) }); return;
    }
    const response = await route.fetch(), atlas = await response.json() as { frames: { frame: { x: number; w: number } }[] };
    expect(atlas.frames).toHaveLength(3);
    if (defect === 'unused-heal-omitted') atlas.frames.pop();
    else if (defect === 'unused-heal-width') atlas.frames[2].frame.w = 31; else atlas.frames[2].frame.x = 63;
    await route.fulfill({ response, json: atlas });
  };
  const failure = async (bytes: string) => {
    await expect(page.getByLabel('游戏资源加载失败', { exact: true }).getByText(FAILURE, { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled(); expect(await stored(page)).toBe(bytes);
  };
  await page.route(pattern, breakResource); const original = await fixture(page), originalBytes = JSON.stringify(original); await failure(originalBytes);
  await page.unroute(pattern, breakResource); await page.reload();
  const restore = page.getByRole('button', { name: '恢复检查点', exact: true }); await expect(restore).toBeEnabled({ timeout: 15000 });
  expect(await stored(page)).toBe(originalBytes); await restore.click(); const attempt = await assertCheckpointAttempt(page, original);
  const healthy = await window(page, source, 1, 250), native = healthy.views.find(v => v.hero && v.items.length >= 2)!;
  positive(native, source, referenceItem(native, 'token1').hit); positive(native, source, referenceItem(native, 'compute1').hit);
  await keep(info, 'healthy-restore-is-actual-nonempty-art-not-ready-flag', healthy.frames, healthy.views.map(summary));
  const attemptBytes = (await stored(page))!; expect(JSON.parse(attemptBytes)).toEqual(attempt);
  await page.route(pattern, breakResource); await page.reload(); await failure(attemptBytes);
  await page.unroute(pattern, breakResource); await page.reload(); await expect(restore).toBeEnabled({ timeout: 15000 });
  expect(await stored(page)).toBe(attemptBytes); await restore.click(); const retry = await assertCheckpointAttempt(page, attempt);
  const retried = await window(page, source, 1, 250), again = retried.views.find(v => v.hero && v.items.length >= 2)!;
  positive(again, source, referenceItem(again, 'token1').hit); positive(again, source, referenceItem(again, 'compute1').hit);
  await expect(page.locator('canvas')).toHaveCount(1);
  await keep(info, 'healthy-retry-and-both-checkpoint-byte-identities', retried.frames,
    { defect, original, attempt, retry, originalBytes, attemptBytes, failure: FAILURE, rows: retried.views.map(summary) });
});
