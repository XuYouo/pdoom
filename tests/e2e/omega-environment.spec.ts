import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { withCleanup } from './factory-navigation';
import { prepareOmega, flushOmegaPreparations, completeOmegaActions, type OmegaPreparationTicket, type OmegaPreparationProof } from './omega-controls';
import { omegaEnvironmentSource, omegaEnvironmentFrames, inspectOmegaEnvironment, nativeTail, sourceResidual,
  roomEvidence, reflectionEvidence, scanFootEvidence, type OmegaCapture, type OmegaSource, type OmegaView } from './omega-environment-pixels';

// Legal initial checkpoint slices, never a fresh continuous five-chapter journey.
// No private Phaser/World/clock access, simulation mutation, rAF replacement or production-plan imports.
test.setTimeout(120000);
const RESOURCES = ['/game/omega-terrain.png', '/game/omega-props.png', '/game/omega-props.json'];
const FAILURE = 'Omega 环境资源加载失败。请检查网络后刷新页面；本地检查点未改动。';
const paused = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
const rest = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
const observed = new WeakMap<Page, { errors: string[]; writes: string[]; loaded: Set<string>; captures: OmegaCapture[]; pending: OmegaPreparationTicket[]; preparationProofs: OmegaPreparationProof[] }>();
test.beforeEach(async ({ page }) => {
  const value = { errors: [] as string[], writes: [] as string[], loaded: new Set<string>(), captures: [] as OmegaCapture[], pending: [] as OmegaPreparationTicket[], preparationProofs: [] as OmegaPreparationProof[] };
  observed.set(page, value);
  page.on('pageerror', e => value.errors.push(e.message));
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) {
      value.writes.push(request.method() + ' ' + request.url());
    }
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 200 && RESOURCES.includes(path)) value.loaded.add(path);
  });
});
test.afterEach(async ({ page }, info) => {
  const value = observed.get(page)!, unflushed = value.pending.length;
  await completeOmegaActions([
    ...['a', 'd', 'Space', 'j', 'q', 'e', 'Shift'].map(key => ({ phase: 'release ' + key,
      run: async () => { if (!page.isClosed()) await page.keyboard.up(key); } })),
    { phase: 'failure native frames', run: async () => {
      if (info.status !== info.expectedStatus && !page.isClosed()) {
        try { await grab(page); } catch (error) { await info.attach('native-capture-error', { body: String(error), contentType: 'text/plain' }); }
        await keep(info, 'failure-all-acquired-real-frames', observed.get(page)!.captures);
      }
    } },
    { phase: 'page errors', run: () => expect(observed.get(page)!.errors).toEqual([]) },
    { phase: 'backend writes', run: () => expect(observed.get(page)!.writes).toEqual([]) },
    // All releases are attempted,not assumed successful. Remaining tickets are failed-case diagnostics only.
    { phase: 'preparation finalizers', run: () => flushOmegaPreparations(value.pending, async () => {}, proof => { value.preparationProofs.push(proof); }) },
    { phase: 'preparation attachments', run: () => completeOmegaActions(value.preparationProofs.flatMap(proof => {
      const name = 'omega-preparation-' + proof.goal, png = proof.png, abortedPng = proof.abortedPng;
      const actions = [{ phase: name + ' metadata', run: () => info.attach(name, { body: JSON.stringify({ ...proof, png: undefined, abortedPng: undefined }), contentType: 'application/json' }) }];
      if (png) actions.push({ phase: name + ' native PNG', run: () => info.attach(name + '-selected-native', { body: Buffer.from(png.split(',')[1], 'base64'), contentType: 'image/png' }) });
      if (abortedPng) actions.push({ phase: name + ' abort PNG', run: () => info.attach(name + '-aborted-native', { body: Buffer.from(abortedPng.split(',')[1], 'base64'), contentType: 'image/png' }) });
      return actions;
    })) },
    { phase: 'preparation boundary', run: () => {
      if (value.preparationProofs.length) info.annotations.push({ type: 'omega-preparation-budget', description: 'authorized-public-position,max5000ms-per-preparation,original120000-case-and-native-windows' });
      if (unflushed && info.status === info.expectedStatus) throw Error('Successful preparation did not reach its original measurement/pause boundary');
    } },
  ]);
});
async function fixture(page: Page, checkpoint: 0 | 12 = 0, radius: 5 | 8 = 5) {
  const save: GameSaveData = { ...createRun(randomUUID(), 42), stage: 5, checkpoint, tokens: 200, elapsedMs: 60000,
    upgrades: ['reinforced'], inventory: radius === 8 ? ['constitutional', 'interpretability'] : ['constitutional'],
    actionCounts: { shots: 0, dashes: 0, rewinds: 0, insights: 300 } };
  expect(isGameSave(save)).toBe(true);
  await page.addInitScript(value => {
    const marker = 'r25-omega-environment.fixture.' + value.runId;
    if (!sessionStorage.getItem(marker)) {
      localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(marker, 'once');
    }
  }, save);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/'); return save;
}
async function start(page: Page, checkpoint: 0 | 12 = 0, radius: 5 | 8 = 5) {
  const original = await fixture(page, checkpoint, radius);
  const button = page.getByRole('button', { name: '恢复检查点', exact: true });
  await expect(button).toBeEnabled({ timeout: 15000 }); await button.click();
  const attempt = await assertCheckpointAttempt(page, original);
  if (checkpoint === 12) await expect(rest(page)).toContainText('CHAPTER 05 / SAFE ROOM 02');
  return { original, attempt };
}
async function pause(page: Page) {
  await page.keyboard.press('Escape');
  const value = observed.get(page)!;
  await flushOmegaPreparations(value.pending, () => expect(paused(page)).toBeVisible(), proof => { value.preparationProofs.push(proof); });
}
async function resume(page: Page) {
  await paused(page).getByRole('button', { name: '继续训练', exact: true }).click(); await expect(paused(page)).toBeHidden();
}
async function grab(page: Page, duration = 0) {
  const frames = await omegaEnvironmentFrames(page, duration); observed.get(page)!.captures.push(...frames); return frames;
}
const one = async (page: Page) => (await grab(page))[0];
async function moveFor(page: Page, ms: number) {
  await page.keyboard.down('d'); try { await page.waitForTimeout(ms); } finally { await page.keyboard.up('d'); }
}
function summary(view: OmegaView) {
  return { at: view.capture.at, omega: view.capture.omega, objective: view.capture.objective, hero: view.hero,
    floor: view.floor, observers: view.observers, columns: view.columns, observerTiles: view.observerTiles, props: view.props };
}
async function keep(info: TestInfo, name: string, frames: readonly OmegaCapture[], metrics?: unknown) {
  const directory = info.outputPath(name); await mkdir(directory, { recursive: true });
  const manifest = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i], bytes = Buffer.from(frame.png.split(',')[1], 'base64'), file = `${String(i).padStart(3, '0')}.png`;
    await writeFile(directory + '/' + file, bytes, { flag: 'wx' });
    manifest.push({ file, at: frame.at, sha256: createHash('sha256').update(bytes).digest('hex'), omega: frame.omega, objective: frame.objective, hud: frame.hud });
  }
  const path = directory + '/evidence.json';
  await writeFile(path, JSON.stringify({ method: 'bounded real rAF PNG acquisition; then real pause/terminal-state; offline Node analysis', frames: manifest, metrics }, null, 2), { flag: 'wx' });
  await info.attach(name, { path, contentType: 'application/json' });
  if (frames.length) await info.attach(name + '-last-native', { path: directory + `/${String(frames.length - 1).padStart(3, '0')}.png`, contentType: 'image/png' });
}
function positive(view: OmegaView, minimumColumns = 20) {
  expect(view.hero, 'same-frame full native Clawd, not background orange or a detached DOM flag').not.toBeNull();
  expect(view.hero!.ratio).toBeGreaterThanOrEqual(0.98); expect(view.hero!.ink).toBeGreaterThan(100);
  expect(view.columns.length, 'literal source top/body/8pxfoot at the same native x').toBeGreaterThanOrEqual(minimumColumns);
  for (const column of view.columns) for (const hit of [column.top, column.body, column.foot]) expect(hit.ratio).toBeGreaterThanOrEqual(0.98);
  expect(view.floor.reduce((n, span) => n + span.width, 0)).toBeGreaterThanOrEqual(500);
}
function selected(frames: readonly OmegaCapture[], source: OmegaSource, predicate: (v: OmegaView) => boolean) {
  const rows = frames.map((frame, index) => ({ index, view: inspectOmegaEnvironment(frame, source) }));
  return { rows, first: rows.find(row => row.view.hero && predicate(row.view)) };
}

test('CP0 actual native40px floor and12px observer end at the real60px gap where ordinary movement falls', async ({ page }, info) => {
  const source = await omegaEnvironmentSource(); await start(page);
  const initial = await grab(page, 1250); await pause(page);
  const startWindow = selected(initial, source, v => v.columns.length >= 30 && v.observerTiles.length >= 5);
  await keep(info, 'spawn-source-and-hero', initial, startWindow.rows.map(row => ({ index: row.index, ...summary(row.view) })));
  expect(startWindow.first, 'same-frame spawn positivity after actual native blink').toBeTruthy();
  const first = startWindow.first!.view; positive(first, 30);
  expect(first.hero!.feet).toBe(320); expect(first.observers).toContainEqual({ x: 400, y: 260, width: 120, color: 0x8caa83 });
  expect(first.observerTiles.every(tile => tile.y === 260 && tile.ink === 16 * 9)).toBe(true);
  await resume(page);
  await prepareOmega(page, source, 'gap-jump', observed.get(page)!.pending, async () => {
    await withCleanup(async () => {
      await page.keyboard.down('Space');
      await page.waitForTimeout(350); await page.keyboard.up('Space'); await page.waitForTimeout(550);
    }, () => page.keyboard.up('Space'));
  });
  await page.waitForTimeout(180); const acrossFrames = await grab(page, 400); await pause(page);
  const across = selected(acrossFrames, source, v => v.columns.length >= 20 && v.hero!.feet === 320 && v.props.some(p => p.slot === 1));
  await keep(info, 'ordinary-jump-across-and-native-cable', acrossFrames, across.rows.map(r => ({ index: r.index, ...summary(r.view) })));
  expect(across.first, 'normal jump really reaches the far support with native cable and actual grounded hero').toBeTruthy();
  positive(across.first!.view);
  await resume(page); await page.keyboard.down('a');
  let falling: OmegaCapture[];
  try { falling = await grab(page, 1400); } finally { await page.keyboard.up('a'); }
  // Death is a real frozen terminal state; never patch health/position to manufacture this.
  await expect(page.getByRole('heading', { name: '这次，梯度归零。', exact: true })).toBeVisible({ timeout: 5000 });
  const fallWindow = selected(falling, source, v => v.columns.length >= 20 && v.floor.length >= 2
    && v.hero!.feet > 325 && v.hero!.feet < 355);
  await keep(info, 'ordinary-gap-fall', falling, fallWindow.rows.map(row => ({ index: row.index, ...summary(row.view) })));
  expect(fallWindow.first, 'actual same-frame hero below the support plane, not a decorative gap').toBeTruthy();
  const proof = fallWindow.first!.view; positive(proof);
  const spans = [...proof.floor].sort((a, b) => a.x - b.x), edge = spans[0].x + spans[0].width;
  expect(spans[1].x - edge).toBe(60); expect(proof.hero!.centerX).toBeGreaterThan(edge); expect(proof.hero!.centerX).toBeLessThan(spans[1].x);
  // Native full16 right cap may anchor at the real edge; the unsnapped8px remainder precedes it.
  // This is not a demand to stretch or crop the cap merely to fit an inherited helper assumption.
  const tail = [nativeTail(proof.capture, source, 3, edge - 16, 320, 16, 16),
    nativeTail(proof.capture, source, 7, edge - 16, 336, 16, 16), nativeTail(proof.capture, source, 11, edge - 16, 352, 16, 8)];
  for (const [slots, y, height] of [[[1, 2], 320, 16], [[5, 6], 336, 16], [[9, 10], 352, 8]] as const) {
    const middle = slots.map(slot => nativeTail(proof.capture, source, slot, edge - 24, y, 8, height));
    tail.push(middle.sort((a, b) => b.ratio - a.ratio)[0]);
  }
  await keep(info, 'gap-native-tail-and-real-fall', [proof.capture], { view: summary(proof), tail });
  expect(tail.every(t => t.ratio >= 0.98 && t.ink > 0)).toBe(true);
});

test('CP0 source-positive pause/menu then new chapter removes old Omega source rather than leaving stale Images', async ({ page }, info) => {
  const source = await omegaEnvironmentSource(); await start(page);
  const beforeFrames = await grab(page, 1250); await pause(page);
  const before = selected(beforeFrames, source, v => v.columns.length >= 30 && v.props.length >= 1 && v.observerTiles.length >= 5);
  await keep(info, 'lifecycle-before-positive', beforeFrames, before.rows.map(row => ({ index: row.index, ...summary(row.view) })));
  expect(before.first).toBeTruthy(); const original = before.first!.view; positive(original, 30);
  const oldProps = original.props.filter(p => p.x > 1 && p.x + 64 < 639); expect(oldProps.length).toBeGreaterThan(0);
  const oldTile = original.observerTiles.find(t => t.x >= 400 && t.x < 500)!; expect(oldTile).toBeTruthy();
  await paused(page).getByRole('button', { name: '返回终端', exact: true }).click();
  // The menu intentionally freezes its current backdrop. Cleanup is required when normal new-training changes chapter.
  await page.getByRole('button', { name: '开始新训练', exact: true }).click();
  await expect(page.locator('.world-titlebar strong')).toHaveText('01');
  const afterFrames = await grab(page, 1250); await pause(page);
  const residuals = afterFrames.map((capture, index) => ({ index,
    props: oldProps.map(p => sourceResidual(capture, source, p, 'prop')),
    observer: sourceResidual(capture, source, oldTile, 'tile'), hero: inspectOmegaEnvironment(capture, source).hero }));
  await keep(info, 'lifecycle-after-all-frame-residuals', afterFrames, residuals);
  expect(residuals.some(row => row.hero && row.hero.ratio >= 0.98)).toBe(true);
  expect(Math.max(...residuals.flatMap(row => [...row.props.map(p => p.ratio), row.observer.ratio]))).toBeLessThan(0.8);
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('CP12 real saved-rest fullscreen native source and hero survive genuine WebGL loss/restore without advancing', async ({ page }, info) => {
  const source = await omegaEnvironmentSource(), original = await fixture(page, 12);
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '全屏显示', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click(); await assertCheckpointAttempt(page, original);
  await expect(rest(page)).toContainText('CHAPTER 05 / SAFE ROOM 02');
  const frozen = await one(page), view = inspectOmegaEnvironment(frozen, source); positive(view, 30);
  const save = await stored(page), hud = await page.locator('.hud-cell').allTextContents();
  await page.waitForTimeout(800); expect((await one(page)).png).toBe(frozen.png);
  expect(await stored(page)).toBe(save); expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const canvas = document.querySelector('canvas'); if (!canvas) throw Error('Missing real canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl'), extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Real WEBGL_lose_context extension is required');
    const timeout = setTimeout(() => reject(Error('Native context restore timeout')), 10000);
    canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timeout); resolve(); }, { once: true });
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 180);
  }));
  const restored = await one(page), restoredView = inspectOmegaEnvironment(restored, source); positive(restoredView, 30);
  await keep(info, 'rest-before-native', [frozen], summary(view)); await keep(info, 'rest-after-real-context-restore', [restored], summary(restoredView));
  expect(restored.png).toBe(frozen.png); expect(await stored(page)).toBe(save);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud);
  const dimensions = await page.locator('canvas').evaluate(canvas => {
    const c = canvas as HTMLCanvasElement, rect = c.getBoundingClientRect();
    return { backing: [c.width, c.height], ratio: rect.width / rect.height, viewport: [innerWidth, innerHeight], width: rect.width, height: rect.height };
  });
  expect(dimensions.backing).toEqual([640, 360]); expect(dimensions.ratio).toBeCloseTo(16 / 9, 6);
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport[0]); expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewport[1]);
  expect([...observed.get(page)!.loaded].sort()).toEqual([...RESOURCES].sort()); await expect(page.locator('canvas')).toHaveCount(1);
});


test('ordinary CP12 input keeps native empty chair and door/mirror domains while real leaf, reflection and grounded reveal change', async ({ page }, info) => {
  const source = await omegaEnvironmentSource(); await start(page, 12);
  await rest(page).getByRole('button', { name: '不再交易，继续前进', exact: true }).click();
  await prepareOmega(page, source, 'closed-door', observed.get(page)!.pending); await page.waitForTimeout(180);
  const closedFrames = await grab(page, 350); await pause(page);
  const closed = selected(closedFrames, source, v => v.columns.length >= 30 && roomEvidence(v).closedLeaf >= 1882);
  await keep(info, 'door-closed-source-and-real-leaf', closedFrames, closed.rows.map(r => ({ index: r.index, ...summary(r.view), room: roomEvidence(r.view) })));
  expect(closed.first).toBeTruthy(); positive(closed.first!.view, 30);
  const closedRoom = roomEvidence(closed.first!.view); expect(closedRoom.door!.ratio).toBeGreaterThanOrEqual(0.98); expect(closedRoom.oldDoor).toBe(0);
  await resume(page);
  const { measurement: gateFrames } = await prepareOmega(page, source, 'room-baseline', observed.get(page)!.pending,
    undefined, () => grab(page, 1200));
  await page.waitForTimeout(550); const roomFrames = await grab(page, 350); await pause(page);
  const opened = selected(gateFrames, source, v => v.columns.length >= 30 && roomEvidence(v).openLeaf >= 253);
  const settled = selected(roomFrames, source, v => v.columns.length >= 35 && !!roomEvidence(v).chair && !!roomEvidence(v).mirror
    && roomEvidence(v).camera === 2540 && v.hero!.centerX < 271);
  await keep(info, 'door-crossing-complete-window', gateFrames, opened.rows.map(r => ({ index: r.index, ...summary(r.view), room: roomEvidence(r.view) })));
  await keep(info, 'quiet-room-source-baseline', roomFrames, settled.rows.map(r => ({ index: r.index, ...summary(r.view), room: roomEvidence(r.view) })));
  expect(opened.first, 'actual open leaf within native transparent opening before the camera leaves the door').toBeTruthy();
  expect(settled.first, 'same fixed camera/native chair+mirror and actual hero before projected reflection').toBeTruthy();
  positive(opened.first!.view, 30); positive(settled.first!.view, 35);
  const baseline = settled.first!.view, room = roomEvidence(baseline);
  expect([room.chair!.x, room.chair!.y, room.mirror!.x, room.mirror!.y]).toEqual([228, 200, 453, 200]);
  expect([room.oldChair, room.oldMirror]).toEqual([0, 0]);
  expect(room.mirror!.ink).toBe(1025); //1249 source ink minus only the224-pixel lower rail hidden by floor.
  await resume(page); await prepareOmega(page, source, 'projection', observed.get(page)!.pending); await page.waitForTimeout(160);
  const reflectedFrames = await grab(page, 350); await pause(page);
  const reflected = reflectedFrames.map((capture, index) => {
    const view = inspectOmegaEnvironment(capture, source);
    return { index, view, reflection: reflectionEvidence(capture, baseline.capture, source, room.mirror!, 0.45) };
  });
  await keep(info, 'live-reversed-projected-clawd', reflectedFrames, reflected.map(r => ({ index: r.index, view: summary(r.view), reflection: r.reflection })));
  const reflection = reflected.find(r => r.view.hero && r.view.columns.length >= 35 && r.reflection.ratio >= 0.98 && r.reflection.changed > 100);
  expect(reflection, 'actual reversed native Clawd at .45 alpha, not source glass or geometric actor').toBeTruthy();
  positive(reflection!.view, 35); expect(reflection!.reflection.flipped).toBe(true);
  await resume(page); await prepareOmega(page, source, 'reveal', observed.get(page)!.pending);
  const revealFrames = await grab(page, 350); await pause(page);
  const reveal = revealFrames.map((capture, index) => {
    const view = inspectOmegaEnvironment(capture, source);
    return { index, view, reflection: reflectionEvidence(capture, baseline.capture, source, room.mirror!, 0.9) };
  });
  await keep(info, 'grounded-native-reveal', revealFrames, reveal.map(r => ({ index: r.index, view: summary(r.view), reflection: r.reflection })));
  const waking = reveal.find(r => r.view.hero?.feet === 320 && r.view.columns.length >= 35
    && r.view.capture.omega.includes('Ilya看到的你') && r.reflection.ratio >= 0.98 && r.reflection.changed > 100);
  expect(waking, 'normal grounded approach produces the live .9 foom reflection during real reveal').toBeTruthy();
  positive(waking!.view, 35);
  const frozen = await one(page), save = await stored(page), hud = await page.locator('.hud-cell').allTextContents();
  await page.waitForTimeout(1400); expect((await one(page)).png).toBe(frozen.png);
  expect(await stored(page)).toBe(save); expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud);
  await resume(page); await expect(page.locator('.omega-readout')).toContainText('现场模仿学习', { timeout: 3000 }); await pause(page);
});

for (const radius of [5, 8] as const) {
  test(`real Core r${radius} warning and active scan remain visible over native floor below320 in one stationary-target window`, async ({ page }, info) => {
    const source = await omegaEnvironmentSource(); await start(page, 12, radius);
    await rest(page).getByRole('button', { name: '不再交易，继续前进', exact: true }).click();
    await moveFor(page, 4000); await page.waitForTimeout(450);
    await expect(page.locator('.omega-readout')).toContainText('空椅子与落地镜');
    await page.keyboard.down('d');
    try { await expect(page.locator('.omega-readout')).toContainText('Ilya看到的你', { timeout: 6000 }); }
    finally { await page.keyboard.up('d'); }
    await page.waitForTimeout(180); // Natural controller friction; no coordinate or velocity injection.
    await expect(page.locator('.omega-readout')).toContainText('现场模仿学习', { timeout: 3000 });
    const targetFrames = await grab(page, 160); await pause(page);
    const targetRows = selected(targetFrames, source, v => v.columns.length >= 35 && v.hero!.feet === 320);
    await keep(info, `r${radius}-actual-stationary-before-tell`, targetFrames, targetRows.rows.map(r => ({ index: r.index, ...summary(r.view) })));
    const heroes = targetRows.rows.flatMap(r => r.view.hero ? [r.view.hero] : []);
    expect(heroes.length).toBeGreaterThanOrEqual(2); expect(new Set(heroes.map(h => `${h.centerX},${h.feet}`)).size).toBe(1);
    expect(targetRows.first).toBeTruthy(); positive(targetRows.first!.view, 35);
    const target = { x: heroes[heroes.length - 1].centerX, feet: heroes[heroes.length - 1].feet };
    // Target stays locked to this ordinary stationary pre-tell position. Never follow a later moving actor to fit pixels.
    await resume(page); const frames = await grab(page, 4500); await pause(page);
    const rows = frames.map((capture, index) => {
      const view = inspectOmegaEnvironment(capture, source); return { index, view, evidence: scanFootEvidence(view, source, target, radius) };
    });
    await keep(info, `r${radius}-all-fixed-window-frames`, frames,
      { durationMs: 4500, target, rows: rows.map(r => ({ index: r.index, view: summary(r.view), scan: r.evidence })) });
    const valid = (r: typeof rows[number], kind: 'warning' | 'active') => r.evidence.stationary && r.view.columns.length >= 30
      && r.evidence[kind].ink >= 100 && r.evidence[kind].ratio >= 0.98 && r.evidence[kind].colors >= 2 && r.evidence[kind].rawRatio < 0.8;
    const warning = rows.find(r => valid(r, 'warning')), active = rows.find(r => valid(r, 'active'));
    expect(warning, 'literal warning alpha on actual source pixels belowfloor320 in the declared scan rect').toBeTruthy();
    expect(active, 'literal active alpha on actual source pixels belowfloor320, not an empty/background positive').toBeTruthy();
    positive(warning!.view, 30); positive(active!.view, 30); expect(warning!.index).toBeLessThan(active!.index);
    expect(warning!.evidence.rect.y + warning!.evidence.rect.height).toBe(radius === 5 ? 329 : 332);
    expect(warning!.evidence.roi.y).toBe(324); expect(warning!.evidence.rect.width).toBe(radius === 5 ? 50 : 56);
    await keep(info, `r${radius}-selected-warning`, [warning!.view.capture], warning!.evidence);
    await keep(info, `r${radius}-selected-active`, [active!.view.capture], active!.evidence);
  });
}

const DEFECTS = ['missing-terrain-png', 'missing-props-png', 'missing-props-json', 'unused-mirror-width', 'unused-mirror-cut'] as const;
for (const defect of DEFECTS) {
  test(`Omega ${defect} fails closed for both original checkpoint and actual attempt without storage mutation`, async ({ page }, info) => {
    const pattern = defect === 'missing-terrain-png' ? '**/game/omega-terrain.png'
      : defect === 'missing-props-png' ? '**/game/omega-props.png' : '**/game/omega-props.json';
    const breakResource = async (route: Route) => {
      if (defect.startsWith('missing-')) { await route.abort('failed'); return; }
      const response = await route.fetch(), atlas = await response.json() as { frames: { frame: { x: number; w: number } }[] };
      expect(atlas.frames).toHaveLength(6);
      // Source frame5 is completely outside CP0. Validate unused resources before ready, not when first drawn.
      if (defect === 'unused-mirror-width') atlas.frames[5].frame.w = 63; else atlas.frames[5].frame.x = 321;
      await route.fulfill({ response, json: atlas });
    };
    const failure = async (bytes: string) => {
      await expect(page.getByLabel('游戏资源加载失败', { exact: true }).getByText(FAILURE, { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
      expect(await stored(page)).toBe(bytes);
    };
    await page.route(pattern, breakResource); const original = await fixture(page), originalBytes = JSON.stringify(original);
    await failure(originalBytes);
    await page.unroute(pattern, breakResource); await page.reload();
    const restore = page.getByRole('button', { name: '恢复检查点', exact: true }); await expect(restore).toBeEnabled({ timeout: 15000 });
    expect(await stored(page)).toBe(originalBytes); await restore.click();
    const attempt = await assertCheckpointAttempt(page, original); await pause(page);
    const attemptBytes = (await stored(page))!; expect(JSON.parse(attemptBytes)).toEqual(attempt);
    await page.route(pattern, breakResource); await page.reload(); await failure(attemptBytes);
    await page.unroute(pattern, breakResource); await page.reload(); await expect(restore).toBeEnabled({ timeout: 15000 });
    expect(await stored(page)).toBe(attemptBytes); await expect(page.locator('canvas')).toHaveCount(1);
    await keep(info, 'source-checkpoint-and-attempt-integrity', [], { defect, original, attempt, originalBytes, attemptBytes, failure: FAILURE });
  });
}
