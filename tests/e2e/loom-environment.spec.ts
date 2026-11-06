import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { leviathanSource, inspectLeviathanPng } from './leviathan-pixels';
import { loomEnvironmentSource, loomEnvironmentFrames, loomGeometry, inspectLoomEnvironment,
  oldLoomBody, loomGhostCross, type LoomCapture, type LoomTop, type LoomView, type LoomTile } from './loom-environment-pixels';

// Legal checkpoint slices only. No fresh five-chapter journey or injected game state.
const RESOURCES = ['/game/loom-terrain.png', '/game/loom-props.png', '/game/loom-props.json'];
const FAILURE = 'Loom 环境资源加载失败。请检查网络后刷新页面；本地检查点未改动。';
const paused = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
const observed = new WeakMap<Page, { errors: string[]; writes: string[]; loaded: Set<string>; captures: LoomCapture[] }>();
test.beforeEach(async ({ page }) => {
  const value = { errors: [] as string[], writes: [] as string[], loaded: new Set<string>(), captures: [] as LoomCapture[] }; observed.set(page, value);
  page.on('pageerror', error => value.errors.push(error.message));
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) value.writes.push(request.method() + ' ' + request.url());
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname; if (response.status() === 200 && RESOURCES.includes(path)) value.loaded.add(path);
  });
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()) {
    try { await grab(page); }
    catch (error) { await info.attach('capture-failure', { body: String(error), contentType: 'text/plain' }); }
    await keep(info, 'failed-real-sequence', observed.get(page)!.captures);
  }
  expect(observed.get(page)!.errors).toEqual([]); expect(observed.get(page)!.writes).toEqual([]);
});
async function fixture(page: Page, checkpoint = 0) {
  const save = { ...createRun(randomUUID(), 42), stage: 4, checkpoint, hp: 100, tokens: 200, elapsedMs: 20000 };
  expect(isGameSave(save)).toBe(true);
  await page.addInitScript(value => {
    const marker = 'loom-environment.fixture.' + value.runId;
    if (!sessionStorage.getItem(marker)) { localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(marker, 'once'); }
  }, save);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/'); return save;
}
async function start(page: Page, checkpoint = 0) {
  const save = await fixture(page, checkpoint);
  const restore = page.getByRole('button', { name: '恢复检查点', exact: true });
  await expect(restore).toBeEnabled({ timeout: 15000 }); await restore.click();
  await assertCheckpointAttempt(page, save);
}
async function grab(page: Page, duration = 0) {
  const captures = await loomEnvironmentFrames(page, duration);
  observed.get(page)!.captures.push(...captures); return captures;
}
const one = async (page: Page) => (await grab(page))[0];
async function keep(info: TestInfo, name: string, captures: readonly LoomCapture[], report?: unknown) {
  const raw = info.outputPath(name + '-captures.json'); await writeFile(raw, JSON.stringify(captures));
  await info.attach(name + '-raw', { path: raw, contentType: 'application/json' });
  if (captures.length) {
    const path = info.outputPath(name + '.png'); await writeFile(path, Buffer.from(captures[captures.length - 1].png.split(',')[1], 'base64'));
    await info.attach(name, { path, contentType: 'image/png' });
  }
  if (report !== undefined) {
    const path = info.outputPath(name + '-pixels.json'); await writeFile(path, JSON.stringify(report, null, 2));
    await info.attach(name + '-pixels', { path, contentType: 'application/json' });
  }
}
function positive(view: LoomView) {
  expect(view.hero.count, 'actual hero, not an empty canvas').toBeGreaterThan(20);
  expect(view.tops.some(p => p.width >= 30), 'actual Core support top').toBe(true);
  expect(view.tiles.length, 'complete native source16x9 ink, not a Core rectangle').toBeGreaterThan(0);
  for (const tile of view.tiles) {
    expect(tile.ink).toBeGreaterThan(0); expect(tile.ratio).toBeGreaterThanOrEqual(0.98); expect(tile.colors).toBeGreaterThanOrEqual(3);
    expect(tile.sourcePoints).toBeGreaterThan(0); expect(tile.sourceRatio).toBeGreaterThanOrEqual(0.98);
    expect(tile.sourceColors).toBeGreaterThanOrEqual(3); expect(tile.sourcePoints + tile.overlayPoints).toBe(tile.ink);
  }
}

async function legacyState(page: Page) {
  const capture = await one(page), g = loomGeometry(capture);
  return { capture, orange: g.hero, line: { count: g.line.count, x: g.line.x ?? 0 },
    platforms: g.tops.map(p => ({ ...p, left: p.x, right: p.x + p.width })) };
}
async function moveFor(page: Page, key: 'a' | 'd', duration: number, jump = false) {
  await page.keyboard.down(key);
  if (jump) await page.keyboard.down('Space');
  await page.waitForTimeout(duration);
  if (jump) await page.keyboard.up('Space');
  await page.keyboard.up(key);
  await page.waitForTimeout(85);
}

/** Navigate the last diamond using only screen pixels and ordinary keys. */
async function reachArena(page: Page) {
  const trace: unknown[] = []; let hasUsedBranch = false;
  for (let attempt = 0; attempt < 36; attempt++) {
    const objective = await page.locator('.objective').innerText();
    if (/Leviathan|吞噬预警|急转弯窗口|吸力窗口|SHARP LEFT/.test(objective)) return;
    if (objective.includes('运行中断')) break;
    const state = await legacyState(page);
    if (!state.orange.count) { await page.waitForTimeout(100); continue; }
    const foot = state.platforms.filter(p => p.left <= state.orange.x + 8 && p.right >= state.orange.x - 8 && Math.abs(p.y - state.orange.bottom) <= 6).sort((a, b) => b.width - a.width)[0];
    if (!foot) { await page.waitForTimeout(130); continue; }
    if (foot.kind === 'upper' || foot.kind === 'warning') hasUsedBranch = true;
    if (foot.kind === 'hub' && hasUsedBranch) {
      // The last island visibly ends above the arena floor, which is initially below this viewport.
      // Walk off its right exit in one normal movement rather than stalling just before the door.
      await moveFor(page, 'd', 950); continue;
    }
    const candidates = state.platforms.filter(p => p.kind !== 'lower' && p.right > foot.right + 26 && p.left <= foot.right + 56 && p.y >= foot.y - 66 && p.y <= foot.y + 182);
    const next = candidates.sort((a, b) => a.left - b.left || a.y - b.y)[0];
    trace.push({ actor: state.orange, foot, next });
    if (!next) { await moveFor(page, 'd', 90); continue; }
    if (next.y < foot.y - 8) {
      if (state.orange.x < foot.right - 42) await moveFor(page, 'd', Math.min(350, Math.max(65, (foot.right - 26 - state.orange.x) / 190 * 1000)));
      else await moveFor(page, 'd', 520, true);
    } else {
      await moveFor(page, 'd', Math.min(800, Math.max(150, ((next.left + next.right) / 2 - state.orange.x) / 190 * 1000)));
    }
  }
  throw new Error(`Normal-input pixel navigation failed: ${JSON.stringify(trace.slice(-14))}`);
}

async function standRightOfLine(page: Page, stagingGap = 20) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const state = await legacyState(page);
    if (!state.orange.count || !state.line.count) { await page.waitForTimeout(120); continue; }
    const gap = state.orange.x - state.line.x;
    if (gap >= stagingGap - 2 && gap <= stagingGap + 2) {
      if (state.platforms.some(p => p.kind === 'arena' && p.left <= state.orange.x && p.right >= state.orange.x && Math.abs(p.y - state.orange.bottom) < 7)) return state;
      await page.waitForTimeout(90); continue;
    }
    const delta = state.line.x + stagingGap - state.orange.x;
    // Cross the wide approach in one held run during the tell, not many stop/read steps that outlast the warm-up.
    await moveFor(page, delta > 0 ? 'd' : 'a', Math.min(1400, Math.max(25, Math.abs(delta) / 190 * 1000)));
  }
  throw new Error('Could not reach the visible staging line using ordinary keys');
}
async function reachFragile(page: Page) {
  const trace: unknown[] = []; let hasUsedBranch = false;
  for (let attempt = 0; attempt < 36; attempt++) {
    const objective = await page.locator('.objective').innerText();
    if (/Leviathan|吞噬预警|急转弯窗口|吸力窗口|SHARP LEFT/.test(objective)) return;
    if (objective.includes('运行中断')) break;
    const state = await legacyState(page);
    if (!state.orange.count) { await page.waitForTimeout(100); continue; }
    const foot = state.platforms.filter(p => p.left <= state.orange.x + 8 && p.right >= state.orange.x - 8 && Math.abs(p.y - state.orange.bottom) <= 6).sort((a, b) => b.width - a.width)[0];
    if (!foot) { await page.waitForTimeout(130); continue; }
    if (foot.kind === 'warning') return { ...state, foot };
    if (foot.kind === 'upper' || foot.kind === 'warning') hasUsedBranch = true;
    if (foot.kind === 'hub' && hasUsedBranch) {
      // The last island visibly ends above the arena floor, which is initially below this viewport.
      // Walk off its right exit in one normal movement rather than stalling just before the door.
      await moveFor(page, 'd', 950); continue;
    }
    const candidates = state.platforms.filter(p => p.kind !== 'lower' && p.right > foot.right + 26 && p.left <= foot.right + 56 && p.y >= foot.y - 66 && p.y <= foot.y + 182);
    const next = candidates.sort((a, b) => a.left - b.left || a.y - b.y)[0];
    trace.push({ actor: state.orange, foot, next });
    if (!next) { await moveFor(page, 'd', 90); continue; }
    if (next.y < foot.y - 8) {
      if (state.orange.x < foot.right - 42) await moveFor(page, 'd', Math.min(350, Math.max(65, (foot.right - 26 - state.orange.x) / 190 * 1000)));
      else await moveFor(page, 'd', 520, true);
    } else {
      await moveFor(page, 'd', Math.min(800, Math.max(150, ((next.left + next.right) / 2 - state.orange.x) / 190 * 1000)));
    }
  }
  throw new Error(`Normal-input pixel navigation failed: ${JSON.stringify(trace.slice(-14))}`);
}


const inTop = (tile: LoomTile, top: LoomTop) => tile.x >= top.x && tile.x + 16 <= top.x + top.width && Math.abs(tile.y - top.y - 3) <= 1;
test('native Loom support follows real R and survives paused WebGL restore in fullscreen', async ({ page }, info) => {
  test.setTimeout(90000); const source = await loomEnvironmentSource(); await start(page);
  const spawnFrames = await grab(page, 1250);
  await keep(info, 'spawn-real-positive-window', spawnFrames);
  let ready: LoomView | null = null;
  for (const capture of [...spawnFrames].reverse()) {
    const view = inspectLoomEnvironment(capture, source);
    if (view.hero.count > 20 && view.tops.some(p => p.kind === 'hub' && p.width >= 170) && view.tiles.some(t => t.slot < 4)) { ready = view; break; }
  }
  expect(ready, 'actual same-frame hero/Core/source after native spawn blink').not.toBeNull();
  const before = ready!, beforeRaw = before.capture; positive(before);
  expect(before.tiles.every(t => t.overlayPoints === 0)).toBe(true);
  const hub = before.tops.find(p => p.kind === 'hub' && p.width >= 170)!;
  const old = before.tiles.find(t => t.slot < 4 && t.x > 2 && t.y > 2)!;
  expect(hub).toBeTruthy(); expect(old).toBeTruthy();
  await page.keyboard.press('r'); await expect(page.locator('.loom-readout')).toContainText('分支 B');
  const movedFrames = await grab(page, 650), afterRaw = movedFrames[movedFrames.length - 1];
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
  const after = inspectLoomEnvironment(afterRaw, source); positive(after);
  const movedHub = after.tops.find(p => p.kind === 'hub' && p.width >= 170)!; expect(movedHub).toBeTruthy();
  const removed = oldLoomBody(afterRaw, source, old, movedHub.x - hub.x, movedHub.y - hub.y);
  await keep(info, 'r-before-native', [beforeRaw], before); await keep(info, 'r-after-native', movedFrames, { after, removed });
  expect(after.tops.filter(p => p.kind === 'upper' || p.kind === 'lower')).not.toEqual(before.tops.filter(p => p.kind === 'upper' || p.kind === 'lower'));
  expect(removed.worst.ratio).toBeLessThan(0.8); expect(removed.topPixels).toBe(0);
  const frozen = await one(page), frozenView = inspectLoomEnvironment(frozen, source); positive(frozenView);
  const hud = await page.locator('.hud-cell').allTextContents(), saved = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  await page.waitForTimeout(700); expect((await one(page)).png).toBe(frozen.png);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud);
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(saved);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const canvas = document.querySelector('canvas'); if (!canvas) throw Error('Missing native canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl'), extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Real WebGL context-loss extension required');
    const timeout = setTimeout(() => reject(Error('Native context restore timeout')), 10000);
    canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timeout); resolve(); }, { once: true });
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 180);
  }));
  const restored = await one(page), restoredView = inspectLoomEnvironment(restored, source); positive(restoredView);
  await keep(info, 'paused-native', [frozen], frozenView); await keep(info, 'restored-native', [restored], restoredView);
  expect(restored.png).toBe(frozen.png); expect(restoredView.tiles).toEqual(frozenView.tiles);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud);
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(saved);
  const dimensions = await page.evaluate(() => {
    const c = document.querySelector('canvas')!.getBoundingClientRect(), s = document.querySelector('.game-shell')!.getBoundingClientRect();
    return { canvas: [c.x, c.y, c.width, c.height], shell: [s.x, s.y, s.width, s.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
  });
  expect(dimensions).toEqual({ canvas: [0, 0, 1280, 720], shell: [0, 0, 1280, 720], scroll: [1280, 720] });
  expect([...observed.get(page)!.loaded].sort()).toEqual([...RESOURCES].sort()); await expect(page.locator('canvas')).toHaveCount(1);
  await paused(page).getByRole('button', { name: '继续训练', exact: true }).click(); await expect(paused(page)).toBeHidden();
  await expect.poll(() => page.locator('.hud-cell').allTextContents(), { timeout: 2500 }).not.toEqual(hud);
});

test('ordinary platforming collapses a real fragile body while retaining ghost and live positive controls', async ({ page }, info) => {
  test.setTimeout(90000); const source = await loomEnvironmentSource(); await start(page);
  const reached = await reachFragile(page); expect(reached).toBeTruthy();
  const navigation = [...observed.get(page)!.captures];
  // Capture the live countdown first. Warning-state Core brown legitimately covers the native body.
  const captures = await grab(page, 2600);
  await keep(info, 'fragile-navigation-raw', navigation); await keep(info, 'fragile-real-sequence', captures);
  const foot = reached!.foot;
  const stable = (tops: LoomTop[], width?: number) => tops.filter(t => t.kind === 'upper' && t.width >= 120 && t.width <= 136
    && (width === undefined || Math.abs(t.width - width) <= 2)).sort((a, b) => a.x - b.x)[0];
  const warningAnchor = stable(reached!.platforms);
  expect(warningAnchor, 'left surviving upper, not the covered fragile body').toBeTruthy();
  const relativeX = foot.x + foot.width / 2 - warningAnchor.x - warningAnchor.width / 2;
  const relativeY = foot.y - warningAnchor.y;
  let baseline: { view: LoomView; anchor: LoomTop; foot: LoomTop; old: LoomTile } | null = null;
  for (const capture of [...navigation].reverse()) {
    const view = inspectLoomEnvironment(capture, source); if (view.hero.count <= 20) continue;
    const anchor = stable(view.tops, warningAnchor.width); if (!anchor) continue;
    const target = view.tops.find(t => t.kind === 'upper' && Math.abs(t.width - anchor.width) <= 2
      && Math.abs(t.x + t.width / 2 - anchor.x - anchor.width / 2 - relativeX) <= 3
      && Math.abs(t.y - anchor.y - relativeY) <= 4);
    if (!target) continue;
    const old = view.tiles.find(t => t.slot < 4 && inTop(t, target) && t.x > 2 && t.y > 2);
    if (old) { baseline = { view, anchor, foot: target, old }; break; }
  }
  expect(baseline, 'actual earlier raw shows this same fragile support before its Core warning').not.toBeNull();
  const base = baseline!; positive(base.view);
  await keep(info, 'fragile-prewarning-source', [base.view.capture], base);
  let proof: { view: LoomView; removed: ReturnType<typeof oldLoomBody>; ghost: ReturnType<typeof loomGhostCross> } | null = null;
  for (const capture of captures) {
    const g = loomGeometry(capture), same = stable(g.tops, base.anchor.width);
    if (!same || g.hero.count <= 20) continue;
    const dx = same.x - base.anchor.x, dy = same.y - base.anchor.y, old = base.old;
    if (old.x + dx < 2 || old.y + dy < 2 || old.x + dx + 18 > 640 || old.y + dy + 11 > 360) continue;
    const removed = oldLoomBody(capture, source, old, dx, dy);
    if (removed.worst.ratio >= 0.8 || removed.topPixels !== 0) continue;
    const ghost = loomGhostCross(capture, base.foot.x + base.foot.width / 2 + dx, base.foot.y + dy);
    if (ghost.a < 4 || ghost.b < 4) continue;
    const view = inspectLoomEnvironment(capture, source); if (!view.tiles.length) continue;
    proof = { view, removed, ghost }; break;
  }
  expect(proof, 'one actual frame: original source removed, ghost X remains, hero and other real skin visible').not.toBeNull();
  positive(proof!.view); await keep(info, 'fragile-same-frame-proof', [proof!.view.capture], proof);
});

function bossPositive(view: ReturnType<typeof inspectLeviathanPng>) {
  expect(view.body).not.toBeNull(); const b = view.body!;
  expect(b.ratio).toBeGreaterThanOrEqual(0.98); expect(b.signature).toBeGreaterThanOrEqual(0.98);
  expect(b.ink).toBeGreaterThanOrEqual(10000); expect(b.witnesses).toBeGreaterThanOrEqual(30);
  expect(b.cropped).toBeLessThanOrEqual(0.1); expect(b.otherWitnesses).toHaveLength(7);
}
test('first real swallow removes native outer support and real R cannot restore eaten cells', async ({ page }, info) => {
  test.setTimeout(90000); const source = await loomEnvironmentSource(), bossSource = await leviathanSource(); await start(page, 2);
  await reachArena(page);
  // Observe the intact baseline before optional repositioning spends the first tell.
  // Fixed native windows, not retries until success. Do all live input/capture before decoding.
  const beforeFrames = await grab(page, 450);
  await standRightOfLine(page, -40);
  await expect(page.locator('.integrity-missing')).toBeVisible({ timeout: 6000 });
  const eatenFrames = await grab(page, 400);
  await page.keyboard.press('r'); await expect(page.locator('.loom-readout')).toContainText('分支 B');
  const rerolledFrames = await grab(page, 500);
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
  await keep(info, 'swallow-before-raw', beforeFrames); await keep(info, 'swallow-eaten-raw', eatenFrames);
  await keep(info, 'swallow-r-raw', rerolledFrames);
  const select = (frames: LoomCapture[], requireOuter: boolean) => {
    const samples = frames.map((capture, index) => {
      const view = inspectLoomEnvironment(capture, source), boss = inspectLeviathanPng(capture, bossSource), b = boss.body;
      const strictBoss = !!b && b.ratio >= 0.98 && b.signature >= 0.98 && b.ink >= 10000
        && b.witnesses >= 30 && b.cropped <= 0.1 && b.otherWitnesses.length === 7;
      const native = view.hero.count > 20 && view.tops.some(t => t.width >= 30) && view.tiles.length > 0
        && view.tiles.every(t => t.ink > 0 && t.ratio >= 0.98 && t.colors >= 3 && t.sourcePoints > 0
          && t.sourceRatio >= 0.98 && t.sourceColors >= 3 && t.sourcePoints + t.overlayPoints === t.ink);
      const anchor = b ? view.tiles.find(t => t.slot >= 12 && Math.abs(t.x + 8 - (b.x - 170)) < 64) : undefined;
      const outer = b ? view.tiles.find(t => t.slot < 4 && t.x >= b.x - 454 && t.x + 16 <= b.x - 386) : undefined;
      const ready = native && strictBoss && !!anchor && (!requireOuter || (arenaSpan(view) > 500 && !!outer));
      return { index, capture, view, boss, anchor, outer, ready };
    });
    return { selected: samples.find(s => s.ready), report: samples.map(s => ({ index: s.index, at: s.capture.at,
      hero: s.view.hero.count, topCount: s.view.tops.length, nativeTiles: s.view.tiles.length,
      arenaSpan: arenaSpan(s.view), boss: s.boss.body, anchor: s.anchor, outer: s.outer, ready: s.ready })) };
  };
  const firstWindow = select(beforeFrames, true), eatenWindow = select(eatenFrames, false), rWindow = select(rerolledFrames, false);
  await keep(info, 'swallow-bounded-window-selection', [], {
    windowsMs: [450, 400, 500], selected: [firstWindow.selected?.index, eatenWindow.selected?.index, rWindow.selected?.index],
    before: firstWindow.report, eaten: eatenWindow.report, rerolled: rWindow.report,
  });
  expect(firstWindow.selected, 'bounded pre-swallow window must contain strict Boss, hero, native anchor and still-live outer support').toBeTruthy();
  expect(eatenWindow.selected, 'bounded eaten window must contain strict same-frame positives').toBeTruthy();
  expect(rWindow.selected, 'bounded real-R window must contain strict same-frame positives').toBeTruthy();
  const first = firstWindow.selected!, before = first.view, b0 = first.boss, anchor0 = first.anchor!, old = first.outer!;
  positive(before); bossPositive(b0); expect(arenaSpan(before)).toBeGreaterThan(500);
  await keep(info, 'swallow-selected-before', [first.capture], { index: first.index, view: before, boss: b0 });
  for (const [name, selected] of [['eaten', eatenWindow.selected!], ['eaten-after-r', rWindow.selected!]] as const) {
    const { capture, view, boss, anchor } = selected; positive(view); bossPositive(boss);
    const removed = oldLoomBody(capture, source, old, boss.body!.x - b0.body!.x, anchor!.y - anchor0.y);
    const ghost = loomGhostCross(capture, boss.body!.x - 420, anchor!.y - 3);
    await keep(info, name + '-native-proof', [capture], { selectedIndex: selected.index, view, boss, removed, ghost });
    expect(removed.worst.ratio).toBeLessThan(0.8); expect(removed.topPixels).toBe(0);
    expect(ghost.a).toBeGreaterThanOrEqual(4); expect(ghost.b).toBeGreaterThanOrEqual(4);
    expect(arenaSpan(view)).toBeLessThan(arenaSpan(before) - 70);
  }
});

function arenaSpan(view: LoomView) {
  const tops = view.tops.filter(t => t.kind === 'arena');
  return tops.length ? Math.max(...tops.map(t => t.x + t.width)) - Math.min(...tops.map(t => t.x)) : 0;
}
for (const defect of ['missing-png', 'missing-unused-props-frame', 'wrong-unused-cut'] as const) {
  test(`Loom environment ${defect} fails closed and preserves exact checkpoint bytes through retry`, async ({ page }) => {
    const pattern = defect === 'missing-png' ? '**/game/loom-terrain.png' : '**/game/loom-props.json';
    await page.route(pattern, async route => {
      if (defect === 'missing-png') { await route.abort('failed'); return; }
      const response = await route.fetch();
      const atlas = await response.json() as { frames: { frame: { x: number; y: number; w: number; h: number } }[] };
      // Frame3 belongs to a later hub and is absent from this initial CP0 view.
      if (defect === 'missing-unused-props-frame') atlas.frames.splice(3, 1);
      else atlas.frames[3].frame.x = 128;
      await route.fulfill({ response, json: atlas });
    });
    const original = await fixture(page), bytes = JSON.stringify(original);
    await expect(page.getByLabel('游戏资源加载失败', { exact: true }).getByText(FAILURE, { exact: true })).toBeVisible({ timeout: 15000 });
    const restore = page.getByRole('button', { name: '恢复检查点', exact: true }); await expect(restore).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(bytes);
    await page.unroute(pattern); await page.reload(); await expect(restore).toBeEnabled({ timeout: 15000 });
    expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(bytes);
    await expect(page.locator('canvas')).toHaveCount(1);
  });
}
