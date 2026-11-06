import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { contextStates, nativeAudioEvidence, observeNativeContexts, waitForSwallowedGameFrame } from './audio-probe';
import { armDashMotionProbe, readDashMotion } from './loom-motion-probe';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { leviathanSource, leviathanFrames, inspectLeviathan } from './leviathan-pixels';
import { loomApproachDuration, moveLoomKeys, observeLoomActor, observeLoomStaging, observeWhileLeavingLoom } from './loom-controls';
import { withCleanup } from './factory-navigation';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const values: string[] = []; errors.set(page, values);
  page.on('pageerror', error => values.push(error.message));
  await observeNativeContexts(page);
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()) {
    const diagnostic = await nativeAudioEvidence(page);
    console.log('LOOM_NATIVE_AUDIO_DIAGNOSTIC', JSON.stringify(diagnostic));
    await info.attach('loom-native-audio-diagnostic', { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' });
  }
  expect(errors.get(page) ?? []).toEqual([]);
});
const room = (page: Page) => page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
const fixture = (patch: Partial<GameSaveData> = {}): GameSaveData => ({ ...createRun(randomUUID(), 42), stage: 4, tokens: 200, elapsedMs: 20000, ...patch });
async function openSave(page: Page, save: GameSaveData) {
  await page.addInitScript(value => {
    const key = `loom.fixture.${value.runId}`;
    if (!sessionStorage.getItem(key)) { localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(key, 'once'); }
  }, save);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  return assertCheckpointAttempt(page, save);
}

/** Actual captured pixels, not game state. Solid tops use a different color from their dim non-colliding graph edges. */
async function canvasState(page: Page, path?: string, arrowBottomHint?: number, defensiveActor = false) {
  const base64 = path ? (await page.locator('canvas').screenshot({ path })).toString('base64')
    : await page.evaluate(() => new Promise<string>((resolve, reject) => requestAnimationFrame(() => {
      try {
        const canvas = document.querySelector('canvas'); if (!canvas) throw new Error('Missing rendered canvas');
        resolve(canvas.toDataURL('image/png').split(',')[1]); // Read this rendered frame before browser compositing clears WebGL.
      } catch (error) { reject(error); }
    })));
  return page.evaluate(async ({ base64, arrowBottomHint, defensiveActor }) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Cannot inspect captured Loom frame');
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colorAt = (x: number, y: number) => { const i = (y * canvas.width + x) * 4; return data[i] * 65536 + data[i + 1] * 256 + data[i + 2]; };
    const sx = 640 / canvas.width, sy = 360 / canvas.height;
    let count = 0, left = canvas.width, right = 0, bottom = 0, lineCount = 0, lineSum = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const color = colorAt(x, y);
      if (color === 0xd97757) { count++; left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y); }
      if (color === 0xf4d298 && y * sy > 200) { lineCount++; lineSum += x * sx; }
    }
    const colors: Record<number, string> = { 0xb9a4e8: 'upper', 0x79c9c1: 'lower', 0xe3c58e: 'hub', 0x90c6b0: 'arena', 0xf4a07d: 'warning', 0xed926c: 'warning' };
    const platforms: Array<{ kind: string; left: number; right: number; y: number; width: number }> = [];
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width;) {
      const color = colorAt(x, y), kind = colors[color];
      if (!kind) { x++; continue; }
      const start = x; while (x < canvas.width && colorAt(x, y) === color) x++;
      const width = (x - start) * sx;
      if (width < 30) continue;
      const l = start * sx, r = x * sx, top = y * sy;
      if (!platforms.some(p => p.kind === kind && Math.abs(p.left - l) < 3 && Math.abs(p.right - r) < 3 && top - p.y < 5)) platforms.push({ kind, left: l, right: r, y: top, width });
    }
    const lineX = lineCount ? lineSum / lineCount : 0; let arrowPixels = 0;
    // The gold line occludes1-2 pixels of the solid top. Join only the adjacent same-height runs.
    const leftSupport = platforms.find(p => p.kind === 'arena' && p.left < lineX && p.right >= lineX - 2 && p.right <= lineX + 1);
    const rightSupport = leftSupport && platforms.find(p => p.kind === 'arena' && p.left >= lineX && p.left <= lineX + 3 && Math.abs(p.y - leftSupport.y) <= 1);
    const controlAnchor = leftSupport && rightSupport ? { kind: 'arena', left: leftSupport.left, right: rightSupport.right,
      y: Math.min(leftSupport.y, rightSupport.y), width: rightSupport.right - leftSupport.left } : undefined;
    let componentCount: number | undefined;
    if (defensiveActor) {
      // Steering only. The original turn-readiness observer below is unchanged by default.
      if (canvas.width !== 640 || canvas.height !== 360) throw Error('Defensive control requires native640 pixels');
      const candidates: { count: number; left: number; right: number; bottom: number }[] = [];
      if (controlAnchor && lineCount) {
        const x0 = Math.max(0, Math.floor(controlAnchor.left - 16)), x1 = Math.min(canvas.width - 1, Math.ceil(controlAnchor.right + 16));
        const y0 = Math.max(0, Math.floor(controlAnchor.y - 40)), y1 = Math.min(canvas.height - 1, Math.ceil(controlAnchor.y + 8));
        const seen = new Uint8Array(canvas.width * canvas.height);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const id: number = y * canvas.width + x;
          if (seen[id] || colorAt(x, y) !== 0xd97757 || data[id * 4 + 3] !== 255) continue;
          const stack: number[] = [id]; let n = 0, l = x, r = x, t = y, b = y;
          while (stack.length) {
            const at = stack.pop()!, px = at % canvas.width, py = Math.floor(at / canvas.width);
            if (px < x0 || px > x1 || py < y0 || py > y1 || seen[at]) continue;
            seen[at] = 1; if (colorAt(px, py) !== 0xd97757 || data[at * 4 + 3] !== 255) continue;
            n++; l = Math.min(l, px); r = Math.max(r, px); t = Math.min(t, py); b = Math.max(b, py);
            if (px > x0) stack.push(at - 1); if (px < x1) stack.push(at + 1);
            if (py > y0) stack.push(at - canvas.width); if (py < y1) stack.push(at + canvas.width);
          }
          if (n >= 60 && r - l + 1 >= 14 && r - l + 1 <= 40 && b - t + 1 >= 12 && b - t + 1 <= 32) candidates.push({ count: n, left: l, right: r, bottom: b });
        }
      }
      componentCount = candidates.length;
      // Bullets, ambiguity and blink are never a surrogate actor or readiness proof.
      const body = candidates.length === 1 ? candidates[0] : null;
      count = body?.count ?? 0; left = body?.left ?? canvas.width; right = body?.right ?? 0; bottom = body?.bottom ?? 0;
    }
    // Read the arrow from this PNG; a last-seen height only locates its ROI during a blink.
    // It never supplies an actor: turn readiness still requires a visible body in the same frame.
    const arrowBottom = defensiveActor ? controlAnchor ? controlAnchor.y - 6 : undefined : count ? bottom * sy : arrowBottomHint;
    if (arrowBottom !== undefined && lineCount) for (let y = Math.max(0, Math.floor((arrowBottom - 64) / sy)); y < Math.min(canvas.height, Math.ceil((arrowBottom - 30) / sy)); y++) {
      for (let x = Math.max(0, Math.floor((lineX - 42) / sx)); x < Math.min(canvas.width, Math.ceil((lineX + 28) / sx)); x++) {
        const at = (y * canvas.width + x) * 4;
        if (data[at + 3] === 255 && Math.abs(data[at] - 255) <= 2 && Math.abs(data[at + 1] - 219) <= 2 && Math.abs(data[at + 2] - 161) <= 2) arrowPixels++;
      }
    }
    return { orange: { count, x: (left + right) / 2 * sx, bottom: bottom * sy }, line: { count: lineCount, x: lineX }, platforms, arrowPixels: arrowPixels * sx * sy,
      controlAnchor, componentCount, png: defensiveActor ? `data:image/png;base64,${base64}` : undefined };
  }, { base64, arrowBottomHint, defensiveActor });
}

async function visibleLoomActor(page: Page, info: TestInfo, label: string) {
  const result = await observeLoomActor(() => canvasState(page));
  info.annotations.push({ type: 'loom-actor-observations', description: JSON.stringify({ label, observations: result.observations }) });
  return result.value;
}

async function moveFor(page: Page, key: 'a' | 'd', duration: number, jump = false) {
  return moveLoomKeys({
    horizontalDown: () => page.keyboard.down(key),
    horizontalUp: () => page.keyboard.up(key),
    jumpDown: () => page.keyboard.down('Space'),
    jumpUp: () => page.keyboard.up('Space'),
    wait: () => page.waitForTimeout(duration),
    settle: () => page.waitForTimeout(85),
  }, jump);
}

/** Navigate the last diamond using only screen pixels and ordinary keys. */
async function reachArena(page: Page) {
  const trace: unknown[] = []; let hasUsedBranch = false;
  for (let attempt = 0; attempt < 36; attempt++) {
    const objective = await page.locator('.objective').innerText();
    if (/Leviathan|吞噬预警|急转弯窗口|吸力窗口|SHARP LEFT/.test(objective)) return;
    if (objective.includes('运行中断')) break;
    const state = await canvasState(page);
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
  await page.locator('canvas').screenshot({ path: 'artifacts/browser/loom-navigation-failed.png' });
  throw new Error(`Normal-input pixel navigation failed: ${JSON.stringify(trace.slice(-14))}`);
}

async function standRightOfLine(page: Page, stagingGap = 20) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const state = await canvasState(page);
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
const liveArenaSpan = (state: Awaited<ReturnType<typeof canvasState>>) => {
  const tops = state.platforms.filter(p => p.kind === 'arena' && Math.abs(p.y - state.orange.bottom) < 7);
  return tops.length ? Math.max(...tops.map(p => p.right)) - Math.min(...tops.map(p => p.left)) : 0;
};

async function expectTwoStemsSwallowed(page: Page) {
  let last = await nativeAudioEvidence(page);
  await expect.poll(async () => {
    last = await nativeAudioEvidence(page); const bus = last.buses[0];
    return { running: last.contexts.length === 1 && last.contexts[0].state === 'running' && last.closes.length === 0,
      cut: bus?.length === 4 && bus.slice(0, 2).every(stem => stem.target === 0 && stem.reached && stem.rms < 1e-7),
      retained: bus?.slice(2).every(stem => stem.target > 0 && stem.reached) === true };
  }, { timeout: 1500, intervals: [30, 50, 80] }).toEqual({ running: true, cut: true, retained: true });
  return last;
}
async function expectMusicRestored(page: Page) {
  const maxRms = [0, 0, 0, 0]; let last = await nativeAudioEvidence(page);
  await expect.poll(async () => {
    last = await nativeAudioEvidence(page); const bus = last.buses[0];
    const scheduled = bus?.length === 4 && bus.every(stem => stem.target > 0 && stem.reached);
    if (scheduled) bus.forEach((stem, index) => { maxRms[index] = Math.max(maxRms[index], stem.rms); });
    // Drums/bass contain rests: accumulate actual energy across a beat, never demand simultaneous nonzero samples.
    return scheduled && last.contexts[0]?.state === 'running' && last.closes.length === 0 && maxRms.every(value => value > 1e-7);
  }, { timeout: 2000, intervals: [30, 50, 80] }).toBe(true);
  return { evidence: last, maxRms };
}

test('fourth-chapter rest freezes world and real audio, preserving its snapshot across reload', async ({ page }) => {
  const save = fixture({ checkpoint: 11, hp: 68 });
  const attempt = await openSave(page, save);
  await expect(room(page)).toContainText('CHAPTER 04 / SAFE ROOM 01');
  await expect(room(page).getByRole('button', { name: '购买 蛇怪募捐箱', exact: true })).toBeDisabled();
  await expect.poll(() => contextStates(page)).toEqual(['suspended']);
  const clock = await page.locator('.hud-cell').last().innerText();
  await page.keyboard.press('r'); await page.waitForTimeout(600);
  expect(await page.locator('.hud-cell').last().innerText()).toBe(clock);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(attempt);
  await page.reload();
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await expect(room(page)).toContainText('CHAPTER 04 / SAFE ROOM 01');
  await assertCheckpointAttempt(page, attempt);
  await room(page).screenshot({ path: 'artifacts/browser/loom-rest.png' });
});

test('real R moves Clawd, changes visible collision terrain and resets the ready Q history', async ({ page }) => {
  await openSave(page, fixture());
  await expect(page.locator('.world-titlebar')).toContainText('命运织机');
  await expect(page.getByRole('button', { name: 'Q 回溯' })).toBeEnabled({ timeout: 5000 });
  const before = await canvasState(page, 'artifacts/browser/loom-branch.png');
  expect(before.orange.count).toBeGreaterThan(20);
  expect(before.platforms.some(value => value.kind === 'upper')).toBe(true);
  expect(before.platforms.some(value => value.kind === 'lower')).toBe(true);
  await page.keyboard.press('r');
  await expect(page.locator('.objective')).toContainText('已重roll到时间线B');
  await expect(page.getByRole('button', { name: 'Q 冷却' })).toBeDisabled();
  const after = await canvasState(page, 'artifacts/browser/loom-reroll.png');
  expect(after.orange.count).toBeGreaterThan(20);
  // R's visible ring crosses the middle of the island's top; the untouched left edge is the stable camera reference.
  const hubBefore = before.platforms.filter(p => p.kind === 'hub').sort((a, b) => a.left - b.left)[0];
  const hubAfter = after.platforms.filter(p => p.kind === 'hub').sort((a, b) => a.left - b.left)[0];
  expect(hubBefore).toBeTruthy(); expect(hubAfter).toBeTruthy();
  expect(Math.abs(hubBefore.left - hubAfter.left)).toBeLessThan(2); // The displacement is not a camera pan.
  expect(after.orange.x - before.orange.x).toBeGreaterThan(12);
  expect(after.orange.x - before.orange.x).toBeLessThan(26);
  expect(after.platforms.filter(p => p.kind === 'upper' || p.kind === 'lower')).not.toEqual(before.platforms.filter(p => p.kind === 'upper' || p.kind === 'lower'));
  await page.keyboard.press('Escape');
});

test('normal platforming reaches Leviathan and a real left dash restores the swallowed HUD and native music buses', async ({ page }, info) => {
  test.setTimeout(90000);
  await openSave(page, fixture({ checkpoint: 2 }));
  await reachArena(page);
  await page.waitForTimeout(350);
  const wide = await canvasState(page);
  expect(liveArenaSpan(wide)).toBeGreaterThan(500);
  let beforeTurn = wide;
  let firstCut = await nativeAudioEvidence(page);
  let attempts = 0;
  const motionTrace = process.env.PDOOM_MOTION_TRACE === '1';
  for (; attempts < 3; attempts++) {
    const objective = page.locator('.objective');
    if (attempts > 0) await expect(objective).not.toHaveText(/急转弯窗口|吸力窗口/, { timeout: 4500 });
    if (motionTrace) await armDashMotionProbe(page);
    beforeTurn = await standRightOfLine(page);
    // Keep every original condition, but observe them atomically: separate RPCs let suction move the player between assertions.
    firstCut = await waitForSwallowedGameFrame(page);
    // The staged pixel position is already valid; act immediately rather than estimating simulation ticks from wall time.
    await Promise.all([page.keyboard.down('a'), page.keyboard.down('Shift')]);
    await page.waitForTimeout(185);
    await page.keyboard.up('Shift'); await page.keyboard.up('a');
    await page.waitForTimeout(140);
    const result = await objective.innerText();
    console.log('LOOM_TURN_ATTEMPT', JSON.stringify({ attempt: attempts + 1, stagedGap: beforeTurn.orange.x - beforeTurn.line.x, result, motion: motionTrace ? await readDashMotion(page) : undefined }));
    if (result.includes('弱点已开')) break;
  }
  await expect(page.locator('.objective')).toContainText('弱点已开', { timeout: 500 });
  await expect(page.locator('.integrity-missing')).toHaveCount(0);
  await expect(page.locator('.integrity-track')).toHaveCount(1);
  const restored = await expectMusicRestored(page);
  const turned = await canvasState(page, 'artifacts/browser/leviathan-turn.png');
  expect(turned.orange.count).toBeGreaterThan(20);
  expect(beforeTurn.orange.x - turned.orange.x).toBeGreaterThan(32);
  expect(turned.orange.x).toBeLessThan(beforeTurn.line.x - 8);
  // With no shots, the next tell reclaims the readout/audio while retaining actual missing platforms.
  await expect(page.locator('.integrity-missing')).toBeVisible({ timeout: 5000 });
  const secondCut = await expectTwoStemsSwallowed(page);
  const proof = { attempts: attempts + 1, firstCut, restored, secondCut };
  console.log('LOOM_NATIVE_PCM_PROOF', JSON.stringify(proof));
  await info.attach('loom-native-pcm-proof', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
  const swallowed = await canvasState(page);
  expect(liveArenaSpan(swallowed)).toBeLessThan(liveArenaSpan(wide) - 70);
  await page.screenshot({ path: 'artifacts/browser/leviathan-swallowed.png', fullPage: true });
  await page.keyboard.press('Escape');
});


// Legal CP2 art slice. The three earlier mechanic/audio cases and their thresholds stay unchanged.
const paused = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
type NativeLeviathanView = Awaited<ReturnType<typeof inspectLeviathan>>[number];
async function saveLeviathanWitness(info: TestInfo, name: string, view: NativeLeviathanView) {
  const path = info.outputPath(name + '.png');
  await writeFile(path, Buffer.from(view.capture.png.split(',')[1], 'base64'));
  await info.attach(name, { path, contentType: 'image/png' });
  const pixels = { body: view.body, cues: view.cues };
  const report = info.outputPath(name + '.json');
  await writeFile(report, JSON.stringify(pixels, null, 2));
}
function assertLeviathanSource(view: NativeLeviathanView) {
  expect(view.body, 'independent multicolour source registration, not a green rectangle').not.toBeNull();
  expect(view.body!.ratio).toBeGreaterThanOrEqual(0.98);
  expect(view.body!.signature).toBeGreaterThanOrEqual(0.98);
  expect(view.body!.witnesses).toBeGreaterThanOrEqual(30);
  expect(view.body!.ink).toBeGreaterThanOrEqual(10000);
  expect(view.body!.cropped).toBeLessThanOrEqual(0.1);
}

test('native Leviathan eight source poses follow the real left-turn opening and paused WebGL restore', async ({ page }, info) => {
  test.setTimeout(90000);
  const loaded = new Set<string>();
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 200 && /^\/game\/leviathan\.(png|json)$/.test(path)) loaded.add(path);
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  const source = await leviathanSource();
  await openSave(page, fixture({ checkpoint: 2 }));
  await reachArena(page); await page.waitForTimeout(250);
  const closed = await leviathanFrames(page, 720);
  let beforeTurn = await canvasState(page);
  expect(liveArenaSpan(beforeTurn)).toBeGreaterThan(500);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await expect(page.locator('.objective')).not.toHaveText(/急转弯窗口|吸力窗口/, { timeout: 4500 });
    beforeTurn = await standRightOfLine(page);
    await waitForSwallowedGameFrame(page);
    await Promise.all([page.keyboard.down('a'), page.keyboard.down('Shift')]);
    await page.waitForTimeout(185);
    await page.keyboard.up('Shift'); await page.keyboard.up('a');
    await page.waitForTimeout(140);
    if ((await page.locator('.objective').innerText()).includes('弱点已开')) break;
  }
  await expect(page.locator('.objective')).toContainText('弱点已开', { timeout: 500 });
  const opened = await leviathanFrames(page, 720);
  const turned = await canvasState(page);
  expect(beforeTurn.orange.x - turned.orange.x).toBeGreaterThan(32);
  expect(turned.orange.x).toBeLessThan(beforeTurn.line.x - 8);
  await page.screenshot({ path: info.outputPath('leviathan-real-open-window.png') });
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
  const frozen = (await leviathanFrames(page))[0];
  const hud = await page.locator('.hud-cell').allTextContents();
  const saved = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  const closedViews = await inspectLeviathan(page, closed, source);
  const openViews = await inspectLeviathan(page, opened, source);
  await writeFile(info.outputPath('initial-closed-real-captures.json'), JSON.stringify({ source, captures: closed }));
  await writeFile(info.outputPath('initial-pose-reports.json'), JSON.stringify({ closed: closedViews.map(v => v.body), opened: openViews.map(v => v.body) }, null, 2));
  for (const v of closedViews) if (v.body) expect(v.body.frame).toBeLessThan(4);
  expect([...new Set(openViews.flatMap(v => v.body ? [v.body.frame] : []))].sort()).toEqual([4, 5, 6, 7]);
  for (let frame = 4; frame < 8; frame++) {
    const witness = openViews.find(v => v.body?.frame === frame)!;
    assertLeviathanSource(witness);
    expect(witness.cues.hp).toBeGreaterThanOrEqual(240);
    if (frame < 4) expect(witness.cues.closedCore).toBeGreaterThanOrEqual(500);
    else expect(witness.cues.openCore).toBeGreaterThanOrEqual(600);
    await saveLeviathanWitness(info, 'leviathan-source-pose-' + frame, witness);
  }
  const before = (await inspectLeviathan(page, [frozen], source))[0]; assertLeviathanSource(before);
  expect(before.body!.frame).toBeGreaterThanOrEqual(4);
  await saveLeviathanWitness(info, 'leviathan-paused-open-native', before);
  await page.waitForTimeout(700);
  expect((await leviathanFrames(page))[0].png).toBe(frozen.png);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud);
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(saved);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const canvas = document.querySelector('canvas'); if (!canvas) throw Error('Missing game canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) { reject(Error('Missing actual WebGL context-loss extension')); return; }
    const timeout = setTimeout(() => reject(Error('Native context did not restore')), 10000);
    canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timeout); resolve(); }, { once: true });
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 180);
  }));
  const restored = (await leviathanFrames(page))[0];
  const after = (await inspectLeviathan(page, [restored], source))[0]; assertLeviathanSource(after);
  await saveLeviathanWitness(info, 'leviathan-restored-open-native', after);
  expect(restored.png).toBe(frozen.png);
  expect(after.body).toEqual(before.body);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud);
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(saved);
  const dimensions = await page.evaluate(() => {
    const c = document.querySelector('canvas')!.getBoundingClientRect();
    const s = document.querySelector('.game-shell')!.getBoundingClientRect();
    return { canvas: [c.x, c.y, c.width, c.height], shell: [s.x, s.y, s.width, s.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
  });
  expect(dimensions).toEqual({ canvas: [0, 0, 1280, 720], shell: [0, 0, 1280, 720], scroll: [1280, 720] });
  await paused(page).getByRole('button', { name: '继续训练', exact: true }).click();
  await expect(paused(page)).toBeHidden();
  await expect.poll(async () => {
    const v = (await inspectLeviathan(page, await leviathanFrames(page), source))[0];
    return v.body?.frame ?? before.body!.frame;
  }, { timeout: 2000 }).not.toBe(before.body!.frame);
  // No shots: a genuine later tell closes the mouth and takes the HP readout again.
  await expect(page.locator('.integrity-missing')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.objective')).not.toContainText('弱点已开');
  const reclosedCaptures = await leviathanFrames(page, 720);
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
  const reclosedViews = await inspectLeviathan(page, reclosedCaptures, source);
  const closedAgain = reclosedViews.find(v => v.body)!;
  expect(closedAgain).toBeTruthy(); assertLeviathanSource(closedAgain);
  expect(closedAgain.body!.frame).toBeLessThan(4);
  expect(closedAgain.cues.closedCore).toBeGreaterThanOrEqual(500);
  await saveLeviathanWitness(info, 'leviathan-real-reclosed-native', closedAgain);
  // Real A/B reroll changes collision geometry, never the Boss anchor. Sample both natural cue layouts.
  const geometryA = await canvasState(page);
  await paused(page).getByRole('button', { name: '继续训练', exact: true }).click();
  await page.keyboard.press('r');
  await expect(page.locator('.loom-readout')).toContainText('分支 B');
  const branchBCaptures = await leviathanFrames(page, 720);
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
  const branchBViews = await inspectLeviathan(page, branchBCaptures, source);
  await writeFile(info.outputPath('reclosed-real-captures.json'), JSON.stringify({ source, captures: [...reclosedCaptures, ...branchBCaptures] }));
  const branchB = [...branchBViews].reverse().find(v => v.body)!;
  expect(branchB).toBeTruthy(); assertLeviathanSource(branchB);
  expect([branchB.body!.x, branchB.body!.y]).toEqual([closedAgain.body!.x, closedAgain.body!.y]);
  const geometryB = await canvasState(page);
  expect(geometryB.platforms.filter(p => p.kind === 'arena')).not.toEqual(geometryA.platforms.filter(p => p.kind === 'arena'));
  await saveLeviathanWitness(info, 'leviathan-real-branch-b-native', branchB);
  const allClosed = [...closedViews, ...reclosedViews, ...branchBViews];
  await writeFile(info.outputPath('all-closed-pose-reports.json'), JSON.stringify(allClosed.map(v => v.body), null, 2));
  expect([...new Set(allClosed.flatMap(v => v.body ? [v.body.frame] : []))].sort()).toEqual([0, 1, 2, 3]);
  for (let frame = 0; frame < 4; frame++) {
    const witness = allClosed.find(v => v.body?.frame === frame)!; assertLeviathanSource(witness);
    expect(witness.cues.hp).toBeGreaterThanOrEqual(240);
    expect(witness.cues.closedCore).toBeGreaterThanOrEqual(500);
    await saveLeviathanWitness(info, 'leviathan-source-pose-' + frame, witness);
  }
  expect([...loaded].sort()).toEqual(['/game/leviathan.json', '/game/leviathan.png']);
  await expect(page.locator('canvas')).toHaveCount(1);
});

for (const defect of ['missing-png', 'missing-unused-open', 'aliased-unused-open'] as const) {
  test(`Leviathan ${defect} blocks readiness and preserves the legal checkpoint through retry`, async ({ page }, info) => {
    let intercepted = 0;
    const routePattern = defect === 'missing-png' ? '**/game/leviathan.png' : '**/game/leviathan.json';
    await page.route(routePattern, async route => {
      intercepted++;
      if (defect === 'missing-png') { await route.abort('failed'); return; }
      const response = await route.fetch();
      const atlas = await response.json() as { frames: { frame: { x: number } }[] };
      if (defect === 'missing-unused-open') atlas.frames.splice(7, 1);
      else atlas.frames[7].frame.x = 960;
      await route.fulfill({ response, json: atlas });
    });
    const original = fixture({ checkpoint: 2, hp: 68 });
    await page.addInitScript(value => {
      const marker = 'leviathan-resource.fixture.' + value.runId;
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem('pdoom.save.v1', JSON.stringify(value)); sessionStorage.setItem(marker, 'once');
      }
    }, original);
    await page.goto('/');
    const message = 'Leviathan 吞噬者图集加载失败。请检查网络后刷新页面；本地检查点未改动。';
    await expect(page.getByLabel('游戏资源加载失败', { exact: true }).getByText(message, { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(original);
    expect(intercepted).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(defect + '.png') });
    await page.unroute(routePattern); await page.reload();
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
    await assertCheckpointAttempt(page, original);
    await page.keyboard.press('Escape');
  });
}


type LoomNativeCapture = Awaited<ReturnType<typeof leviathanFrames>>[number];
async function rawLoomCueCounts(page: Page, capture: LoomNativeCapture, origin: { x: number; y: number }, actor: { x: number; bottom: number }) {
  return page.evaluate(async ({ capture, origin, actor }) => {
    const image = new Image(); image.src = capture.png; await image.decode();
    if (image.naturalWidth !== 640 || image.naturalHeight !== 360) throw Error('Expected actual native capture');
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const g = canvas.getContext('2d'); if (!g) throw Error('Missing independent decoder');
    g.drawImage(image, 0, 0); const bytes = g.getImageData(0, 0, 640, 360).data;
    const count = (color: number, x: number, y: number, w: number, h: number) => {
      let total = 0;
      for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
        const at = (py * 640 + px) * 4;
        if (bytes[at + 3] === 255 && Math.abs(bytes[at] - (color >>> 16)) <= 2
          && Math.abs(bytes[at + 1] - ((color >>> 8) & 255)) <= 2 && Math.abs(bytes[at + 2] - (color & 255)) <= 2) total++;
      }
      return total;
    };
    const orange = count(0xd97757, 0, 0, 640, 360);
    const inActor = count(0xd97757, Math.floor(actor.x - 20), Math.floor(actor.bottom - 36), 40, 40);
    return { orangeOutsideActor: orange - inActor, hp: count(0xebaa7b, origin.x + 48, origin.y - 2, 64, 4),
      closedCore: count(0x0e251f, origin.x + 67, origin.y + 65, 26, 30),
      openCore: count(0xffd69b, origin.x + 67, origin.y + 65, 26, 30),
      voidShots: count(0xb4e2c6, 0, 0, 640, 360), criticalShots: count(0xffffff, 0, 0, 640, 360) };
  }, { capture, origin, actor });
}



// Approach from the right while holdingA: this also counter-steers live suction instead of assuming an85ms neutral pause is safe.
async function stageCombatLoomTurn(page: Page, requireCurrentArrow = false, compactCombatBand = false) {
  // Keep the verified phase1 lifecycle band; later combat must fit the shorter phase3 dash.
  // Both live policies require the arrow, support and right-side actor in ONE captured frame.
  const minimumGap = compactCombatBand ? 24 : requireCurrentArrow ? 32 : 16;
  const maximumGap = compactCombatBand ? 34 : requireCurrentArrow ? 42 : 22;
  const turnBackAt = compactCombatBand ? 40 : requireCurrentArrow ? 48 : 28;
  let held: 'a' | 'd' | null = null;
  let lastSeen: { at: number; gap: number; bottom: number; supported: boolean } | null = null;
  let defensiveRewindUsed = false;
  const decisions: object[] = [];
  const release = async () => { if (held) await page.keyboard.up(held); held = null; };
  return withCleanup(async () => {
    for (let step = 0; step < 100; step++) {
      const state = await observeLoomStaging({ held, release,
        observe: () => canvasState(page, undefined, compactCombatBand ? lastSeen?.bottom : undefined) });
      if (!state.orange.count || !state.line.count) {
        // Damage blink is not permission to let suction pull the actor into the boss.
        // Counter-steer briefly ONLY with a current arrow and a recent supported right-side observation.
        // This never satisfies readiness: the return below still needs the visible actor in this frame.
        const counterSteer = compactCombatBand && state.line.count && state.arrowPixels >= 80 && lastSeen?.supported
          && lastSeen.gap >= minimumGap && performance.now() - lastSeen.at <= 750;
        if (counterSteer) {
          const rewind = page.getByRole('button', { name: 'Q 回溯', exact: true });
          if (!defensiveRewindUsed && await rewind.isVisible() && await rewind.isEnabled()) {
            // Ordinary defensive Q follows the recorded route; it cannot count as the later left dash.
            await release(); await page.keyboard.press('q'); defensiveRewindUsed = true; lastSeen = null;
            continue;
          }
          if (held !== 'a') { await release(); await page.keyboard.down('a'); held = 'a'; }
        } else await release();
        await page.waitForTimeout(45); continue;
      }
      const gap = state.orange.x - state.line.x;
      const supported = state.platforms.some(p => p.kind === 'arena' && p.left <= state.orange.x && p.right >= state.orange.x && Math.abs(p.y - state.orange.bottom) < 7);
      lastSeen = { at: performance.now(), gap, bottom: state.orange.bottom, supported };
      if (held === 'a' && gap >= minimumGap && gap <= maximumGap && supported && (!requireCurrentArrow || state.arrowPixels >= 80)) return state;
      // With live suction, gap38 must not keep D merely because the old turnaround was40.
      // Readiness remains the original24..34, heldA, current arrow and support in one real frame.
      const brakingGap = compactCombatBand && state.arrowPixels >= 80 ? maximumGap : turnBackAt;
      const next: 'a' | 'd' = held === 'd' ? gap < brakingGap ? 'd' : 'a' : held === null && gap < brakingGap || gap < minimumGap ? 'd' : 'a';
      const coarseMs = loomApproachDuration(gap, supported);
      decisions.push({ step, sampledAt: performance.now(), gap, bottom: state.orange.bottom, supported, arrow: state.arrowPixels, held, next, brakingGap, coarseMs });
      if (coarseMs > 0) {
        // Finish and release this finite stroke before the next PNG read.
        // Never reuse this pre-move frame for readiness; the next loop captures anew.
        await release(); await moveFor(page, 'd', coarseMs);
        console.info('LOOM_COARSE_APPROACH_COMPLETED', JSON.stringify({ step, gap, supported, requestedMs: coarseMs }));
      } else if (held !== next) { await release(); await page.keyboard.down(next); held = next; }
      await page.waitForTimeout(30);
    }
    console.info('LOOM_STAGING_DECISIONS_FAILED', JSON.stringify(decisions));
    throw Error('Actual actor/line could not stage a normal combat turn');
  }, release);
}

/** Original1600ms native recording remains the deadline; ordinary A only counters visible suction. */
async function drainOnAnchor(page: Page, info: TestInfo, turn: number) {
  let done = false, heldA = false, recordingError: unknown, witness: string | undefined;
  const decisions: { x: number; bottom: number; supported: boolean; arrow: number; candidates: number | undefined; nextA: boolean }[] = [];
  const recording = leviathanFrames(page, 1600).then(captures => { done = true; return captures; }, error => { done = true; recordingError = error; return []; });
  try {
    while (!done) {
      const state = await canvasState(page, undefined, undefined, true);
      if (done) break;
      const anchor = state.controlAnchor;
      const supported = !!anchor && state.orange.count >= 60 && state.orange.x >= anchor.left && state.orange.x <= anchor.right
        && Math.abs(anchor.y - state.orange.bottom) < 7;
      const nextA: boolean = !!anchor && supported && state.arrowPixels >= 80
        && state.orange.x > anchor.left + anchor.width * (heldA ? 0.24 : 0.34);
      decisions.push({ x: state.orange.x, bottom: state.orange.bottom, supported, arrow: state.arrowPixels, candidates: state.componentCount, nextA });
      if (nextA !== heldA) {
        if (nextA) { await page.keyboard.down('a'); witness ??= state.png; }
        else await page.keyboard.up('a');
        heldA = nextA;
      }
      if (!done) await page.waitForTimeout(30);
    }
    const captures = await recording; if (recordingError) throw recordingError;
    return { captures, decisions };
  } finally {
    done = true; if (heldA) await page.keyboard.up('a');
    await recording;
    await info.attach(`drain-support-${turn}`, { body: JSON.stringify({ nominalCaptureMs: 1600, decisions }), contentType: 'application/json' });
    if (witness) {
      const path = info.outputPath(`drain-counter-steer-${turn}.png`);
      await writeFile(path, Buffer.from(witness.split(',')[1], 'base64'));
      await info.attach(`drain-counter-steer-${turn}`, { path, contentType: 'image/png' });
    }
  }
}

// Ordinary keyboard/mouse controller; decisions use visible UI/pixels, never private World or a simulation clock.
test('ordinary aim and repeated real left turns defeat all Leviathan HP phases and clear native cues before chapter five', async ({ page }, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const source = await leviathanSource(), original = fixture({ checkpoint: 2 });
  const attempt = await openSave(page, original); await reachArena(page);
  const clear = page.getByRole('heading', { name: '命运织机与多元分岔树已突破。', exact: true });
  const death = page.getByRole('heading', { name: '这次，梯度归零。', exact: true });
  const streams: LoomNativeCapture[] = [], openings: NativeLeviathanView[] = [];
  const drainControls: Awaited<ReturnType<typeof drainOnAnchor>>['decisions'] = [];
  const turns: { attempt: number; beforeX: number; afterX: number; lineX: number; opened: boolean; stagedArrow: number; stagingGap: number }[] = [];
  let origin: { x: number; y: number } | null = null;
  for (let turn = 0; turn < 9 && !(await clear.isVisible()); turn++) {
    expect(await death.isVisible(), 'ordinary control must survive, not inject HP').toBe(false);
    await expect(page.locator('.objective')).not.toContainText('弱点已开', { timeout: 5000 });
    const staged = await stageCombatLoomTurn(page, true, true);
    // Later phases swallow3/4 stems: the phase1 two-stem-only audio helper is intentionally not reused.
    const arrow = { pixels: staged.arrowPixels }; expect(arrow.pixels).toBeGreaterThanOrEqual(80);
    await Promise.all([page.keyboard.down('a'), page.keyboard.down('Shift')]);
    await page.waitForTimeout(185); await page.keyboard.up('Shift'); await page.keyboard.up('a');
    await page.waitForTimeout(140);
    const opened = (await page.locator('.objective').innerText()).includes('弱点已开');
    const moved = await visibleLoomActor(page, info, 'combat-turn-' + (turn + 1));
    turns.push({ attempt: turn + 1, beforeX: staged.orange.x, afterX: moved.orange.x, lineX: staged.line.x, opened,
      stagedArrow: staged.arrowPixels, stagingGap: staged.orange.x - staged.line.x });
    if (!opened) continue;
    expect(staged.orange.x - moved.orange.x).toBeGreaterThan(32);
    expect(moved.orange.x).toBeLessThan(staged.line.x - 8);
    const opening = (await inspectLeviathan(page, await leviathanFrames(page), source))[0];
    assertLeviathanSource(opening); expect(opening.body!.frame).toBeGreaterThanOrEqual(4);
    expect(opening.cues.openCore).toBeGreaterThanOrEqual(600); openings.push(opening);
    origin = { x: opening.body!.x, y: opening.body!.y };
    const canvas = await page.locator('canvas').boundingBox(); expect(canvas).not.toBeNull();
    await page.mouse.move(canvas!.x + (origin.x + 80) * canvas!.width / 640, canvas!.y + (origin.y + 80) * canvas!.height / 360);
    await page.mouse.down();
    try {
      const captures = await leviathanFrames(page, 2500);
      streams.push(...captures.filter((_, index) => index % 4 === 0));
    } finally { await page.mouse.up(); }
    // Orange bullets share the actor colour. Let the real1500ms TTL drain before global-orange navigation.
    if (!(await clear.isVisible())) {
      const draining = await drainOnAnchor(page, info, turn + 1);
      drainControls.push(...draining.decisions);
      streams.push(...draining.captures.filter((_, index) => index % 4 === 0));
    }
    await writeFile(info.outputPath('leviathan-ordinary-progress.json'), JSON.stringify({ turns, source, captures: streams }));
  }
  await expect(clear).toBeVisible({ timeout: 1500 }); expect(origin).not.toBeNull();
  const clearedCapture = (await leviathanFrames(page))[0];
  const cleared = (await inspectLeviathan(page, [clearedCapture], source))[0];
  expect(cleared.body).toBeNull(); expect(cleared.cues.hero).toBeGreaterThan(20); expect(cleared.cues.platforms).toBeGreaterThan(100);
  const clearActor = await canvasState(page);
  const gone = await rawLoomCueCounts(page, clearedCapture, origin!, { x: turns.at(-1)!.afterX, bottom: clearActor.orange.bottom });
  expect(gone).toEqual({ hp: 0, closedCore: 0, openCore: 0, voidShots: 0, criticalShots: 0, orangeOutsideActor: 0 });
  await saveLeviathanWitness(info, 'leviathan-actual-cleared-native', cleared);
  await page.screenshot({ path: info.outputPath('leviathan-actual-cleared-ui.png') });
  const views = await inspectLeviathan(page, streams, source);
  const phase2 = views.find(v => v.body && v.body.frame < 4 && v.cues.hp >= 164 && v.cues.hp <= 176);
  const phase3 = views.find(v => v.body && v.body.frame < 4 && v.cues.hp >= 80 && v.cues.hp <= 92);
  const finalDamage = views.find(v => v.body && v.body.frame >= 4 && v.cues.hp > 0 && v.cues.hp < 80);
  // Some legal runs never reopen suction during a drain. No cue must mean no defensive input.
  expect(drainControls.some(d => d.supported && d.candidates === 1), 'drain observer saw a real supported body').toBe(true);
  expect(drainControls.every(d => !d.nextA || d.supported && d.arrow >= 80 && d.candidates === 1), 'defensive inputs require current visible support and suction').toBe(true);
  const summary = { turns, drainControls, defensiveInputSamples: drainControls.filter(d => d.nextA).length, openings: openings.map(v => ({ body: v.body, cues: v.cues })),
    samples: views.map(v => ({ at: v.capture.at, body: v.body, cues: v.cues })), gone };
  await writeFile(info.outputPath('leviathan-ordinary-input-proof.json'), JSON.stringify(summary, null, 2));
  await writeFile(info.outputPath('leviathan-ordinary-real-captures.json'), JSON.stringify({ source, captures: streams }));
  expect(phase2, 'real source/body plus closed280/420 HP floor').toBeTruthy();
  expect(phase3, 'real source/body plus closed140/420 HP floor').toBeTruthy();
  expect(finalDamage, 'actual weak phase3 takes damage below140, not direct defeat injection').toBeTruthy();
  expect(turns.filter(v => v.opened).length).toBeGreaterThanOrEqual(3);
  for (const [name, view] of [['phase2-closed-floor', phase2!], ['phase3-closed-floor', phase3!], ['phase3-real-damage', finalDamage!]] as const) {
    assertLeviathanSource(view); await saveLeviathanWitness(info, 'leviathan-' + name, view);
  }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'));
  expect(saved).toMatchObject({ runId: attempt.runId, seed: 42, stage: 5, checkpoint: 0, schemaVersion: 1 });
  expect(saved.actionCounts.shots).toBeGreaterThan(12); expect(saved.actionCounts.dashes).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(700); const clearAfter = (await leviathanFrames(page))[0]; expect(clearAfter.png).toBe(clearedCapture.png);
  await writeFile(info.outputPath('leviathan-clear-save-and-freeze.json'), JSON.stringify({ saved, before: clearedCapture, after: clearAfter }));
  await page.getByRole('button', { name: '进入第五章', exact: true }).click();
  await expect(page.locator('.world-titlebar')).toContainText('欧米茄点'); await expect(clear).toBeHidden();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.waitForTimeout(250);
  // New-world1000ms invulnerability flashes the actual actor every80ms. Observe, do not invent a fixed opaque entry frame.
  const enteringCaptures = await leviathanFrames(page, 1100);
  const entering = await inspectLeviathan(page, enteringCaptures, source);
  await writeFile(info.outputPath('leviathan-chapter5-entry-real-captures.json'), JSON.stringify({ source, captures: enteringCaptures }));
  expect(entering.every(v => v.body === null)).toBe(true);
  const next = entering.find(v => v.cues.hero > 20); expect(next).toBeTruthy();
  await saveLeviathanWitness(info, 'leviathan-chapter5-native', next!);
  await page.screenshot({ path: info.outputPath('omega-entry-text-consolidated-ui.png') });
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
});


test('ordinary void defeat freezes the living Leviathan and checkpoint retry resets weak art and swallowed state', async ({ page }, info) => {
  test.setTimeout(100000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const source = await leviathanSource(), original = fixture({ checkpoint: 2 });
  const firstAttempt = await openSave(page, original); await reachArena(page);
  const staged = await stageCombatLoomTurn(page, true); expect(staged.arrowPixels).toBeGreaterThanOrEqual(80);
  await Promise.all([page.keyboard.down('a'), page.keyboard.down('Shift')]);
  await page.waitForTimeout(185); await page.keyboard.up('Shift'); await page.keyboard.up('a');
  await page.waitForTimeout(140); await expect(page.locator('.objective')).toContainText('弱点已开');
  const crossed = await visibleLoomActor(page, info, 'void-preparation');
  expect(staged.orange.x - crossed.orange.x).toBeGreaterThan(32); expect(crossed.orange.x).toBeLessThan(staged.line.x - 8);
  const open = (await inspectLeviathan(page, await leviathanFrames(page), source))[0];
  assertLeviathanSource(open); expect(open.body!.frame).toBeGreaterThanOrEqual(4); expect(open.cues.openCore).toBeGreaterThanOrEqual(600);
  const aimCanvas = await page.locator('canvas').boundingBox(); expect(aimCanvas).not.toBeNull();
  await page.mouse.move(aimCanvas!.x + (open.body!.x + 80) * aimCanvas!.width / 640, aimCanvas!.y + (open.body!.y + 80) * aimCanvas!.height / 360);
  const dead = page.getByRole('heading', { name: '这次，梯度归零。', exact: true });
  // Preserve the300ms shooting and600ms complete stream, but leave by ordinary A while they run.
  // Archive the already-captured open witness after the live operation, also on failure.
  const { damageCaptures, checkpoint } = await withCleanup(() => observeWhileLeavingLoom({
    leftDown: () => page.keyboard.down('a'), leftUp: () => page.keyboard.up('a'),
    observe: async () => {
      await withCleanup(async () => { await page.mouse.down(); await page.waitForTimeout(300); }, () => page.mouse.up());
      const damageCaptures = await leviathanFrames(page, 600);
      const checkpoint: GameSaveData = await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'));
      expect(checkpoint).toEqual(firstAttempt);
      return { damageCaptures, checkpoint };
    },
    waitForDeath: async () => { await expect(dead).toBeVisible({ timeout: 7000 }); },
  }), () => saveLeviathanWitness(info, 'leviathan-before-ordinary-void', open));
  const frozen = await leviathanFrames(page, 700);
  // Decode the damage stream after real defeat; bulk source matching must not consume the live3200ms weak deadline.
  const damageViews = await inspectLeviathan(page, damageCaptures, source);
  const damaged = [...damageViews].reverse().find(v => v.body && v.body.frame >= 4 && v.cues.hp > 172 && v.cues.hp < 256);
  expect(damaged, 'ordinary mouse shots must actually damage the Boss before void defeat').toBeTruthy();
  assertLeviathanSource(damaged!); await saveLeviathanWitness(info, 'leviathan-hurt-before-ordinary-void', damaged!);

  expect(new Set(frozen.map(v => v.png)).size).toBe(1);
  const stillAlive = (await inspectLeviathan(page, [frozen[0]], source))[0];
  // A player's death is not the Boss's death: its still-live weak body should freeze behind the dialog.
  assertLeviathanSource(stillAlive); expect(stillAlive.body!.frame).toBeGreaterThanOrEqual(4);
  expect(stillAlive.cues.hp).toBe(damaged!.cues.hp); expect(stillAlive.cues.voidShots).toBe(0);
  await saveLeviathanWitness(info, 'leviathan-player-defeat-frozen-native', stillAlive);
  await page.screenshot({ path: info.outputPath('leviathan-actual-void-defeat-ui.png') });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'))).toEqual(checkpoint);
  await page.getByRole('button', { name: '从检查点恢复', exact: true }).click();
  const retried = await assertCheckpointAttempt(page, checkpoint); expect(retried.runId).not.toBe(firstAttempt.runId);
  await expect(dead).toBeHidden(); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.integrity-track')).toBeVisible();
  const entryCaptures = await leviathanFrames(page, 1100);
  const entry = await inspectLeviathan(page, entryCaptures, source);
  expect(entry.every(v => v.body === null)).toBe(true); expect(entry.some(v => v.cues.hero > 20)).toBe(true);
  await reachArena(page);
  const returnedCaptures = await leviathanFrames(page, 700);
  // The full live reentry sample is complete. Offline decoding/archiving must not leave a living Boss advancing.
  await page.keyboard.press('Escape'); await expect(paused(page)).toBeVisible();
  const returned = await inspectLeviathan(page, returnedCaptures, source);
  const closed = returned.find(v => v.body && v.body.frame < 4 && v.cues.hp === 256 && v.cues.closedCore >= 600);
  expect(closed, 'new ordinary attempt restores full closed body, not old frozen weak iris').toBeTruthy();
  expect(returned.filter(v => v.body).every(v => v.body!.frame < 4 && v.cues.openCore === 0)).toBe(true);
  assertLeviathanSource(closed!); await saveLeviathanWitness(info, 'leviathan-retry-reset-closed-native', closed!);
  await writeFile(info.outputPath('leviathan-actual-retry-proof.json'), JSON.stringify({
    firstAttempt, checkpoint, retried, preparation: { staged, crossed }, open: { body: open.body, cues: open.cues },
    damaged: { body: damaged!.body, cues: damaged!.cues },
    frozen: { body: stillAlive.body, cues: stillAlive.cues, frames: frozen.length },
    closed: { body: closed!.body, cues: closed!.cues }, registeredReentrySamples: returned.filter(v => v.body).length,
  }, null, 2));
  await writeFile(info.outputPath('leviathan-lifecycle-real-captures.json'), JSON.stringify({ source, open: open.capture, damage: damageCaptures, frozen, entry: entryCaptures, returned: returnedCaptures }));
});
