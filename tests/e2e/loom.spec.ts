import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { contextStates, nativeAudioEvidence, observeNativeContexts, waitForSwallowedGameFrame } from './audio-probe';
import { armDashMotionProbe, readDashMotion } from './loom-motion-probe';
import { assertCheckpointAttempt } from './checkpoint-attempt';

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
async function canvasState(page: Page, path?: string) {
  const base64 = path ? (await page.locator('canvas').screenshot({ path })).toString('base64')
    : await page.evaluate(() => new Promise<string>((resolve, reject) => requestAnimationFrame(() => {
      try {
        const canvas = document.querySelector('canvas'); if (!canvas) throw new Error('Missing rendered canvas');
        resolve(canvas.toDataURL('image/png').split(',')[1]); // Read this rendered frame before browser compositing clears WebGL.
      } catch (error) { reject(error); }
    })));
  return page.evaluate(async base64 => {
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
    return { orange: { count, x: (left + right) / 2 * sx, bottom: bottom * sy }, line: { count: lineCount, x: lineCount ? lineSum / lineCount : 0 }, platforms };
  }, base64);
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
