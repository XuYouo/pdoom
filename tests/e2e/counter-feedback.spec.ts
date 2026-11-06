import { randomUUID } from 'node:crypto';
import { counterApproach, sampleCounterControls, sampleCounterMotion, withCounterCleanup, type ControlSample } from './counter-controls';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { attachClawd, clawdBytes, clawdFrames, clawdSource, inspectClawd, rewindClawdSource } from './clawd-pixels';

test.setTimeout(90000);
const evidence = new WeakMap<Page, { errors: string[]; writes: string[]; observations: unknown[]; controls: ControlSample[]; cleanupErrors: string[] }>();
test.beforeEach(({ page }) => {
  const e = { errors: [] as string[], writes: [] as string[], observations: [] as unknown[], controls: [] as ControlSample[], cleanupErrors: [] as string[] }; evidence.set(page, e);
  page.on('pageerror', error => e.errors.push(error.message));
  page.on('request', request => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) e.writes.push(request.url()); });
});
test.afterEach(async ({ page }, info) => {
  await withCounterCleanup(async () => {}, [
    ...['a', 'd', 'j', 'q'].map(key => ({ name: `afterEach release ${key}`, run: () => page.keyboard.up(key) })),
    { name: 'pageerror guard', run: async () => { expect(evidence.get(page)!.errors).toEqual([]); } },
    { name: 'API-write guard', run: async () => { expect(evidence.get(page)!.writes).toEqual([]); } },
    { name: 'attach public evidence', run: () => info.attach('ordinary-input-public-canvas-evidence', { body: JSON.stringify(evidence.get(page)), contentType: 'application/json' }) },
    { name: 'retain cleanup annotations', run: async () => { for (const description of evidence.get(page)!.cleanupErrors) info.annotations.push({ type: 'counter-cleanup-error', description }); } },
  ], evidence.get(page)!.cleanupErrors);
});
// Loaded-build variant is an isGameSave-valid INITIAL fixture, not proof a fresh new run earned that loadout.
// No localStorage mutation after the live actor starts; immunity and charges are earned by ordinary Q.
async function boot(page: Page, lisp = false) {
  const save = { ...createRun(randomUUID(), 42), ...(lisp ? { inventory: ['constitutional', 'recursive', 'residual'] as const, actionCounts: { shots: 3, dashes: 0, rewinds: 0, insights: 0 } } : {}) };
  const value = { ...save, inventory: [...save.inventory] }; expect(isGameSave(value)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.emulateMedia({ reducedMotion: lisp ? 'reduce' : 'no-preference' });
  await page.addInitScript(original => {
    const marker = `r44.counter.${original.runId}`;
    if (!sessionStorage.getItem(marker)) { if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(original)); sessionStorage.setItem(marker, 'once'); }
  }, value);
  await page.goto('/'); const restore = page.getByRole('button', { name: '恢复检查点', exact: true });
  await expect(restore).toBeEnabled({ timeout: 15000 }); await restore.click(); await assertCheckpointAttempt(page, value);
  await expect(page.getByRole('button', { name: 'Ⅱ PAUSE / 暂停游戏', exact: true })).toBeVisible();
}
type CounterRawCapture = Awaited<ReturnType<typeof clawdFrames>>[number];
async function capture(page: Page, background?: string, scanAll = false, floorSignatures: number[][] = []) {
  return inspectCounterCapture(page, (await clawdFrames(page))[0], background, scanAll, floorSignatures);
}
async function inspectCounterCapture(page: Page, raw: CounterRawCapture, background?: string, scanAll = false, floorSignatures: number[][] = []) {
  const pixels = await page.evaluate(async ({ png, background, scanAll, floorSignatures }) => {
    const image = new Image(); image.src = png; await image.decode();
    if (image.width !== 640 || image.height !== 360) throw Error('Native640x360 required');
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); const data = ctx.getImageData(0, 0, 640, 360).data;
    const color = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= 640 || y >= 360) return -1;
      const p = (y * 640 + x) * 4; return data[p + 3] === 255 ? (data[p] << 16) | (data[p + 1] << 8) | data[p + 2] : -1;
    };
    const components = (rgb: number) => {
      const seen = new Uint8Array(640 * 360), result: { x: number; y: number; left: number; top: number; w: number; h: number; n: number }[] = [];
      for (let y = 100; y < 340; y++) for (let x = 0; x < 640; x++) {
        const id = y * 640 + x; if (seen[id] || color(x, y) !== rgb) continue;
        const stack = [id]; seen[id] = 1; let left = x, right = x, top = y, bottom = y, n = 0, sx = 0, sy = 0;
        while (stack.length) {
          const p = stack.pop()!, xx = p % 640, yy = Math.floor(p / 640); n++; sx += xx; sy += yy;
          left = Math.min(left, xx); right = Math.max(right, xx); top = Math.min(top, yy); bottom = Math.max(bottom, yy);
          for (const [nx, ny] of [[xx - 1, yy], [xx + 1, yy], [xx, yy - 1], [xx, yy + 1]]) {
            if (nx < 0 || nx >= 640 || ny < 100 || ny >= 340) continue;
            const next = ny * 640 + nx; if (!seen[next] && color(nx, ny) === rgb) { seen[next] = 1; stack.push(next); }
          }
        }
        result.push({ x: sx / n, y: sy / n, left, top, w: right - left + 1, h: bottom - top + 1, n });
      }
      return result;
    };
    const actors = components(0xd97757).filter(p => p.n >= 80 && p.w >= 14 && p.w <= 40 && p.h >= 12 && p.h <= 32);
    const actor = actors.length === 1 ? actors[0] : null;
    const circular = (p: { w: number; h: number; n: number }) => p.w >= 6 && p.w <= 11 && p.h >= 6 && p.h <= 11 && p.n >= 25 && p.n <= 90;
    const forward = (p: { x: number; y: number }) => !!actor && p.x > actor.x + 12 && Math.abs(p.y - actor.y + 3) < 15;
    const dictionary = components(0xeec76d).filter(circular), critical = components(0xffffff).filter(circular).filter(forward);
    const ordinary = components(0xf3aa78).filter(p => p.w >= 4 && p.w <= 9 && p.h >= 4 && p.h <= 9 && p.n >= 12 && p.n <= 50).filter(forward);
    const markers: { x: number; y: number; book: boolean; ticks: number; charges: number }[] = [];
    if (actor || scanAll) for (let y = scanAll ? 0 : Math.max(0, actor!.top - 45); y < (scanAll ? 338 : actor!.top - 5); y++) for (let x = scanAll ? 14 : Math.floor(actor!.x) - 18; x <= (scanAll ? 625 : Math.ceil(actor!.x) + 18); x++) {
      const book = Array.from({ length: 9 }, (_, i) => color(x - 4 + i, y) === 0x87e3cd).every(Boolean)
        && color(x, y + 11) === 0x87e3cd && color(x - 2, y + 5) === 0xeec76d && color(x + 2, y + 5) === 0xeec76d;
      if (!book && color(x - 13, y + 18) !== 0xffffff) continue;
      const slots = Array.from({ length: 6 }, (_, i) => {
        const px = x - 14 + i * 5, py = y + 17, c = color(px + 1, py + 1);
        const border = [[0, 0], [3, 0], [0, 3], [3, 3]].every(([dx, dy]) => color(px + dx, py + dy) === 0x0b111d);
        return border && [0xffffff, 0x34534e].includes(c) && [[1, 1], [1, 2], [2, 1], [2, 2]].every(([dx, dy]) => color(px + dx, py + dy) === c) ? c : -1;
      });
      const hasPips = slots.every(c => c >= 0) && slots.some(c => c === 0xffffff);
      if (!book && !hasPips) continue;
      const ticks = Array.from({ length: 10 }, (_, i) => color(x - 9 + i * 2, y + 13) === 0x87e3cd && color(x - 9 + i * 2, y + 14) === 0x87e3cd).filter(Boolean).length;
      markers.push({ x, y, book, ticks, charges: hasPips ? slots.filter(c => c === 0xffffff).length : 0 });
    }
    // Lisp is drawn at alpha .8, not literal opaque purple. Compare against a real preceding backdrop.
    const lispMatches: { x: number; y: number; before: number[]; after: number[] }[] = [];
    if (actor && background) {
      const before = new Image(); before.src = background; await before.decode();
      if (before.width !== 640 || before.height !== 360) throw Error('Native background size mismatch');
      const bc = document.createElement('canvas'); bc.width = 640; bc.height = 360; const bctx = bc.getContext('2d')!; bctx.drawImage(before, 0, 0);
      const base = bctx.getImageData(0, 0, 640, 360).data, tint = [187, 168, 208];
      for (let y = Math.max(100, actor.top - 6); y < Math.min(320, actor.top + actor.h + 6); y++) for (let x = Math.ceil(actor.x + 14); x < Math.min(640, actor.x + 210); x++) {
        const at = (y * 640 + x) * 4, a = [data[at], data[at + 1], data[at + 2]], b = [base[at], base[at + 1], base[at + 2]];
        if (data[at + 3] !== 255 || base[at + 3] !== 255 || !a.some((v, i) => Math.abs(v - b[i]) > 4)) continue;
        if (a.every((v, i) => Math.abs(v - Math.round(tint[i] * .8 + b[i] * .2)) <= 1)) lispMatches.push({ x, y, before: b, after: a });
      }
    }
    const palette = new Set<number>(); let opaque = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) { opaque++; palette.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]); }
    let floor: { row: number; supported: number; gaps: { left: number; right: number }[] } | null = null;
    if (floorSignatures.length) for (let row = 318; row <= 322; row++) {
      const mask = Array.from({ length: 640 }, (_, x) => floorSignatures.some(s => s.every((c, dy) => color(x, row + dy) === c)));
      const supported = mask.filter(Boolean).length, gaps: { left: number; right: number }[] = [];
      for (let x = 0; x < 640; x++) if (!mask[x]) { const left = x; while (x < 640 && !mask[x]) x++; if (x - left >= 70 && x - left <= 160) gaps.push({ left, right: x }); }
      if (!floor || supported > floor.supported) floor = { row, supported, gaps };
    }
    return { actor, actors: actors.length, dictionary, critical, ordinary, markers, lispPixels: lispMatches.length, lispMatches, opaque, paletteSize: palette.size, floor };
  }, { png: raw.png, background, scanAll, floorSignatures });
  evidence.get(page)!.observations.push({ at: raw.at, hud: raw.hud, notice: raw.notice, ...pixels });
  return { raw, ...pixels };
}
type Frame = Awaited<ReturnType<typeof capture>>;
function marker(frame: Frame) { expect(frame.actor).not.toBeNull(); expect(frame.markers).toHaveLength(1); return frame.markers[0]; }
async function show(info: TestInfo, label: string, frame: Frame) {
  const hits = inspectClawd(clawdBytes(frame.raw), await clawdSource(), 'aligned'); expect(hits.length).toBeGreaterThan(0);
  await attachClawd(info, label, frame.raw, hits);
}
async function ready(page: Page) { await expect(page.getByRole('button', { name: 'Q 回溯', exact: true })).toBeEnabled({ timeout: 12000 }); }
async function control(page: Page, floorSignatures: number[][] = []) {
  const sample = await page.evaluate(sampleCounterControls, { floorSignatures });
  evidence.get(page)!.controls.push(sample);
  if (sample.dialog?.includes('梯度归零')) throw Error('Ordinary counter control reached actual defeat; stop before losing its diagnostic trail');
  return sample;
}
async function earned(page: Page, info: TestInfo) {
  await ready(page); // Safe x72 is outside the parrot activation range, and the birth blink has ended.
  let f = await capture(page); expect(f.actor).not.toBeNull(); expect(f.markers).toEqual([]);
  // Release between bounded ordinary steps: PNG evidence work must not extend a held move.
  await withCounterCleanup(async () => { for (let i = 0; i < 30; i++) {
    const sample = await control(page); if (!sample.actor) { await page.waitForTimeout(30); continue; }
    const key = counterApproach(sample.actor.x); if (!key) break;
    await withCounterCleanup(async () => { await page.keyboard.down(key); await page.waitForTimeout(70); },
      [{ name: `position pulse release ${key}`, run: () => page.keyboard.up(key) }], evidence.get(page)!.cleanupErrors);
  } }, ['a', 'd'].map(key => ({ name: `position final release ${key}`, run: () => page.keyboard.up(key) })), evidence.get(page)!.cleanupErrors);
  await ready(page); await page.waitForTimeout(100);
  f = await capture(page); expect(f.actor!.x).toBeGreaterThanOrEqual(170); expect(f.actor!.x).toBeLessThan(220);
  let previous: Frame | null = null, incoming: Frame | null = null;
  for (let i = 0; i < 120; i++) {
    f = await capture(page); const actor = f.actor;
    if (actor) {
      const b = f.dictionary.find(p => p.x - actor.x >= 35 && p.x - actor.x <= 55 && Math.abs(p.y - actor.y) < 15);
      if (b && previous?.dictionary.some(p => p.x > b.x && p.x < b.x + 45 && Math.abs(p.y - b.y) < 5)) { incoming = f; break; }
    }
    previous = f; await page.waitForTimeout(25);
  }
  expect(incoming, 'Two actual yellow-bullet positions approach the stationary Clawd before Q').not.toBeNull();
  await page.keyboard.press('q');
  // The compact HUD intentionally omits old gradient notice prose; actual Q state and native rewards are the contract.
  await expect(page.getByRole('button', { name: 'Q 冷却', exact: true })).toBeDisabled({ timeout: 4000 });
  for (let i = 0; i < 45; i++) { f = await capture(page); if (f.actor && f.markers.length === 1) break; await page.waitForTimeout(30); }
  const m = marker(f); expect(m.book).toBe(true); expect(m.ticks).toBeGreaterThanOrEqual(9); expect(m.charges).toBe(2);
  await show(info, 'incoming-dictionary-before-real-q', incoming!); await show(info, 'actual-dictionary-reward', f);
  // Q ends with 180ms Core invulnerability/blinking. A first visible frame is not yet a stable shooting frame.
  // Two PUBLIC displayed seconds guarantee at least one simulated second; no wall-clock grace assumption.
  await expect.poll(async () => clock(await capture(page)), { timeout: 5000 }).toBeGreaterThanOrEqual(clock(f) + 2);
  const settled = await capture(page); expect(marker(settled).charges).toBe(2); expect(marker(settled).book).toBe(true);
  await show(info, 'settled-after-q-grace', settled);
  return f;
}
async function fireCounterShot(page: Page) {
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 600 / 640, box.y + box.height * 305 / 360);
  await page.keyboard.down('j'); await page.waitForTimeout(55); await page.keyboard.up('j');
}
async function shot(page: Page, background?: string) {
  await fireCounterShot(page);
  return capture(page, background);
}
async function motionShot(page: Page) {
  await fireCounterShot(page);
  return sampleCounterMotion({
    read: async () => (await clawdFrames(page))[0],
    gap: () => page.waitForTimeout(40),
    inspect: raw => inspectCounterCapture(page, raw),
  });
}
async function movingShot(info: TestInfo, frame: Frame, label: string, kind: 'critical' | 'ordinary', later: Frame) {
  expect(frame[kind].length).toBeGreaterThan(0);
  expect(later[kind].some(b => frame[kind].some(a => b.x > a.x + 5 && b.x < a.x + 160 && Math.abs(b.y - a.y) < 8))).toBe(true);
  await show(info, label + '-moving', later);
}
const clock = (f: Frame) => { const m = /(\d+):(\d{2})/.exec(f.raw.hud.at(-1)!); expect(m).not.toBeNull(); return Number(m![1]) * 60 + Number(m![2]); };

test('a truly ready empty Q has no invented type shield or critical charge', async ({ page }, info) => {
  await boot(page); await ready(page); const before = await capture(page); expect(before.markers).toEqual([]); expect(before.dictionary).toEqual([]);
  const pending = clawdFrames(page, 850); await page.keyboard.press('q'); const frames = await pending;
  const tinted = rewindClawdSource(await clawdSource());
  const actual = frames.find((f, i) => i % 3 === 0 && inspectClawd(clawdBytes(f), tinted, 'aligned').length > 0);
  expect(actual, 'Accepted empty rewind has literal native tinted Clawd, not a not-ready Q').toBeTruthy();
  await attachClawd(info, 'real-empty-rewind', actual!, inspectClawd(clawdBytes(actual!), tinted, 'aligned'));
  const after = await capture(page); expect(after.markers).toEqual([]); expect(after.dictionary).toEqual([]);
  await show(info, 'empty-q-no-reward', after);
});
for (const lisp of [false, true]) test(`ordinary dictionary Q reward ${lisp ? 'loaded 32K fixture reduced motion Lisp keeps charges then new run clears' : 'real critical spend pause resume and exact expiry'}`, async ({ page }, info) => {
  await boot(page, lisp); const absorbed = await earned(page, info);
  if (lisp) {
    const quiet = await capture(page, absorbed.raw.png); expect(quiet.lispPixels).toBe(0); expect(marker(quiet).charges).toBe(2);
    await show(info, 'quiet-before-lisp', quiet);
    let harmless = await shot(page, quiet.raw.png);
    for (let i = 0; i < 5 && harmless.lispPixels <= 6; i++) { await page.waitForTimeout(25); harmless = await capture(page, quiet.raw.png); }
    expect(marker(harmless).charges).toBe(2); expect(harmless.lispPixels).toBeGreaterThan(6); expect(harmless.critical).toEqual([]);
    await expect(page.locator('.runtime-log')).toContainText('上一发：无伤括号'); await show(info, 'actual-lisp-preserves-two', harmless);
    await expect.poll(async () => clock(await capture(page)), { timeout: 5000 }).toBeGreaterThanOrEqual(clock(harmless) + 2);
  }
  const spentPair = await motionShot(page), spent = spentPair.frame; expect(marker(spent).charges).toBe(1); expect(spent.critical.length).toBeGreaterThan(0);
  await movingShot(info, spent, 'first-white-critical', 'critical', spentPair.later); await show(info, 'actual-critical-spends-one', spent);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '暂停前向传播。', exact: true })).toBeVisible();
  const paused = await capture(page); expect(marker(paused).charges).toBe(1); await show(info, 'paused-positive-reward', paused);
  await page.waitForTimeout(1100); const held = await capture(page);
  expect(held.raw.png).toBe(paused.raw.png); expect(held.raw.hud).toEqual(paused.raw.hud); expect(marker(held)).toEqual(marker(paused));
  await show(info, 'paused-positive-reward-held', held);
  if (lisp) {
    await page.getByRole('button', { name: '返回终端', exact: true }).click();
    await page.getByRole('button', { name: '开始新训练', exact: true }).click(); await ready(page);
    const reset = await capture(page); expect(reset.markers).toEqual([]); await show(info, 'new-run-no-old-reward', reset);
    const saved = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
    expect(saved).not.toContain('criticalCharges'); expect(saved).not.toContain('immunity'); return;
  }
  await page.getByRole('button', { name: '继续训练', exact: true }).click();
  await expect.poll(async () => marker(await capture(page)).ticks, { timeout: 5000 }).toBeLessThan(marker(paused).ticks);
  const resumed = await capture(page); expect(marker(resumed).ticks).toBeLessThan(marker(paused).ticks); expect(marker(resumed).charges).toBe(1);
  let expired: Frame | null = null;
  for (let i = 0; i < 100; i++) { const f = await capture(page); if (f.actor && f.markers.length === 1 && !f.markers[0].book) { expired = f; break; } await page.waitForTimeout(130); }
  expect(expired).not.toBeNull(); expect(clock(expired!) - clock(absorbed)).toBeGreaterThanOrEqual(9);
  expect(clock(expired!) - clock(absorbed)).toBeLessThanOrEqual(11); // Public HUD is whole-second quantized, not a10.000s calibration.
  expect(marker(expired!)).toMatchObject({ book: false, ticks: 0, charges: 1 }); await show(info, 'actual-immunity-expired-charge-retained', expired!);
  const spentAllPair = await motionShot(page), spentAll = spentAllPair.frame; expect(spentAll.markers).toEqual([]); expect(spentAll.critical.length).toBeGreaterThan(0); await movingShot(info, spentAll, 'last-white-critical', 'critical', spentAllPair.later); await show(info, 'actual-second-critical-no-charges', spentAll);
  await expect.poll(async () => clock(await capture(page)), { timeout: 4000 }).toBeGreaterThanOrEqual(clock(spentAll) + 2);
  const normalPair = await motionShot(page), normal = normalPair.frame; expect(normal.markers).toEqual([]); expect(normal.critical).toEqual([]); expect(normal.ordinary.length).toBeGreaterThan(0);
  await movingShot(info, normal, 'ordinary-orange', 'ordinary', normalPair.later); await show(info, 'actual-next-shot-is-ordinary', normal);
});

test('earned counter survives browser blur event and real WebGL restore, then death retry clears it', async ({ page }, info) => {
  await boot(page); await earned(page, info);
  const stored = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  // Explicit standard DOM blur-event coverage, not a claim headless OS tab switching delivered blur.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('dialog', { name: '暂停前向传播。', exact: true })).toBeVisible();
  const paused = await capture(page); expect(marker(paused).book).toBe(true); expect(marker(paused).charges).toBe(2);
  await show(info, 'blur-earned-positive', paused);
  await page.keyboard.press('j'); await page.waitForTimeout(1100);
  const held = await capture(page); expect(held.raw.png).toBe(paused.raw.png); expect(held.raw.hud).toEqual(paused.raw.hud);
  expect(marker(held)).toEqual(marker(paused)); expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(stored);
  const context = await page.evaluate(() => new Promise<{ lost: boolean; restored: boolean; stillLost: boolean }>((resolve, reject) => {
    const canvas = document.querySelector('canvas')!;
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl'), extension = gl?.getExtension('WEBGL_lose_context');
    if (!gl || !extension) throw Error('Actual context-loss extension required'); let lost = false;
    const timeout = setTimeout(() => reject(Error('Actual context restore timeout')), 10000);
    canvas.addEventListener('webglcontextlost', () => { lost = true; }, { once: true });
    canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timeout); resolve({ lost, restored: true, stillLost: gl.isContextLost() }); }, { once: true });
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 180);
  }));
  expect(context).toEqual({ lost: true, restored: true, stillLost: false });
  const restored = await capture(page); expect(marker(restored)).toEqual(marker(paused)); expect(restored.raw.png).toBe(paused.raw.png);
  expect(restored.raw.hud).toEqual(paused.raw.hud); await show(info, 'genuine-gl-restored-earned-positive', restored);
  await info.attach('actual-context-events', { body: JSON.stringify(context), contentType: 'application/json' });
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(stored);
  await page.getByRole('button', { name: '继续训练', exact: true }).click();
  await expect.poll(async () => marker(await capture(page)).ticks, { timeout: 5000 }).toBeLessThan(marker(paused).ticks);
  // Ordinary D walks into the authored first pit, with no teleport or live-state mutation.
  await page.keyboard.down('d');
  try { await expect(page.getByRole('dialog', { name: '这次，梯度归零。', exact: true })).toBeVisible({ timeout: 9000 }); }
  finally { await page.keyboard.up('d'); }
  const dead = await capture(page, undefined, true); expect(dead.markers).toEqual([]);
  expect(dead.opaque).toBeGreaterThan(200000); expect(dead.paletteSize).toBeGreaterThan(20);
  await info.attach('actual-death-nonempty-no-cue', { body: clawdBytes(dead.raw), contentType: 'image/png' });
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(stored);
  await page.getByRole('button', { name: '从检查点恢复', exact: true }).click();
  await assertCheckpointAttempt(page, JSON.parse(stored!)); await ready(page);
  const fresh = await capture(page, undefined, true); expect(fresh.markers).toEqual([]); await show(info, 'death-retry-new-attempt-no-old-reward', fresh);
});

test('ordinarily earned charge crosses both real pits into rest, freezes through controls and persists on Continue', async ({ page }, info) => {
  await boot(page); await earned(page, info); const firedPair = await motionShot(page), fired = firedPair.frame; expect(marker(fired).charges).toBe(1);
  await movingShot(info, fired, 'rest-route-kill-first-parrot', 'critical', firedPair.later);
  const source = (await readFile('public/game/chapter-one-terrain.png')).toString('base64');
  const signatures = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    if (image.width !== 96 || image.height !== 96) throw Error('Approved native terrain dimensions required');
    const c = document.createElement('canvas'); c.width = 96; c.height = 96; const ctx = c.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, 96, 96).data, columns: number[][] = [];
    // Literal approved native slots, not runtime Plan/World/platform getters: stone and moss top edges/alternates.
    for (const slot of [0, 1, 2, 9, 10, 11, 30, 31]) for (let x = 0; x < 16; x++) {
      const values = Array.from({ length: 4 }, (_, y) => {
        const p = (((Math.floor(slot / 6) * 16 + y) * 96) + slot % 6 * 16 + x) * 4;
        return rgba[p + 3] === 255 ? (rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2] : -1;
      }); if (values.every(v => v >= 0)) columns.push(values);
    }
    return columns;
  }, source);
  expect(signatures.length).toBeGreaterThan(60);
  const rest = page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true });
  const ground = (await capture(page)).actor!.y, route: unknown[] = []; let jumping = false, dashed = false, crossings = 0;
  await withCounterCleanup(async () => {
    await page.keyboard.down('d');
    for (let step = 0; step < 180 && !await rest.isVisible(); step++) {
      const f = await control(page, signatures), a = f.actor;
      const gap = a && f.floor?.gaps.find(g => g.left - a.x >= 10 && g.left - a.x <= 48 && g.right < 638);
      route.push({ at: f.at, actor: a, floor: f.floor, gap, jumping, dashed, observerReadMs: f.readMs });
      if (a && !jumping && Math.abs(a.y - ground) <= 4 && gap) {
        await page.keyboard.down('Space'); jumping = true; dashed = false; crossings++;
      } else if (a && jumping && !dashed && a.y <= ground - 60) {
        await page.keyboard.press('Shift'); dashed = true;
      } else if (a && jumping && dashed && Math.abs(a.y - ground) <= 4) { await page.keyboard.up('Space'); jumping = false; }
      await page.waitForTimeout(15);
    }
  }, [
    ...['d', 'Space', 'Shift'].map(key => ({ name: `route release ${key}`, run: () => page.keyboard.up(key) })),
    { name: 'attach ordinary route', run: () => info.attach('ordinary-two-pit-native-route', { body: JSON.stringify(route), contentType: 'application/json' }) },
  ], evidence.get(page)!.cleanupErrors);
  await expect(rest).toBeVisible(); expect(crossings).toBe(2);
  await expect(rest).toContainText('CHAPTER 01 / SAFE ROOM 01');
  const frozen = await capture(page); expect(marker(frozen).charges).toBe(1); await show(info, 'earned-charge-in-real-rest', frozen);
  const saved = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
  expect(JSON.parse(saved!).checkpoint).toBe(11); expect(saved).not.toContain('criticalCharges'); expect(saved).not.toContain('immunity');
  await page.keyboard.press('j'); await page.keyboard.press('q'); await page.keyboard.press('Escape'); await page.waitForTimeout(1100);
  const held = await capture(page); expect(held.raw.png).toBe(frozen.raw.png); expect(held.raw.hud).toEqual(frozen.raw.hud); expect(marker(held)).toEqual(marker(frozen));
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(saved); await expect(rest).toBeVisible();
  await show(info, 'real-rest-earned-cue-held', held);
  await rest.getByRole('button', { name: '不再交易，继续前进', exact: true }).click(); await expect(rest).not.toBeVisible();
  await expect.poll(async () => clock(await capture(page)), { timeout: 5000 }).toBeGreaterThanOrEqual(clock(frozen) + 2);
  let continued: Frame | null = null;
  for (let i = 0; i < 30; i++) { const f = await capture(page); if (f.actor && f.markers.length === 1) { continued = f; break; } await page.waitForTimeout(30); }
  expect(continued).not.toBeNull(); expect(marker(continued!).charges).toBe(1); await show(info, 'real-continue-keeps-earned-charge', continued!);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1')!)); expect(after).toEqual({ ...JSON.parse(saved!), checkpoint: 1 });
});


