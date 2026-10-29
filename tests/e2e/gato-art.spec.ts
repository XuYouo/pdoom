import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';

const PALETTE = { gold: 0xe4cd7e, dictionary: 0xeec76d, landing: 0xef9e77, impact: 0xee866a, caption: 0xda91ca, cassette: 0xb9905d, hp: 0xebaa7b, hero: 0xd97757 } as const;
type Color = keyof typeof PALETTE;
type Component = { x: number; y: number; w: number; h: number; pixels: number };
type Pixels = Record<Color, Component[]>;
type View = { capture: Buffer; pixels: Pixels };
/** Eight-connected components of actual browser screenshot pixels. No engine/world/frame access. */
async function visiblePixels(page: Page, capture: Buffer): Promise<Pixels> {
  return page.evaluate(async ({ base64, palette }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
    const probe = document.createElement('canvas'); probe.width = image.naturalWidth; probe.height = image.naturalHeight;
    const ctx = probe.getContext('2d'); if (!ctx) throw new Error('No screenshot pixel reader');
    ctx.drawImage(image, 0, 0); const w = probe.width, h = probe.height, data = ctx.getImageData(0, 0, w, h).data;
    const sx = w / 640, sy = h / 360, names = Object.keys(palette) as Color[];
    const ids = new Map<number, number>(names.map((name, i) => [palette[name], i + 1]));
    const mask = new Uint8Array(w * h), seen = new Uint8Array(w * h);
    const out: Pixels = { gold: [], dictionary: [], landing: [], impact: [], caption: [], cassette: [], hp: [], hero: [] };
    for (let y = Math.floor(80 * sy); y < Math.min(h, 330 * sy); y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4; mask[p] = ids.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) ?? 0;
    }
    for (let p = 0; p < mask.length; p++) {
      const key = mask[p]; if (!key || seen[p]) continue;
      const stack = [p]; let count = 0, minX = w, minY = h, maxX = 0, maxY = 0; seen[p] = 1;
      while (stack.length) {
        const at = stack.pop()!, x = at % w, y = Math.floor(at / w); count++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const neighbor = ny * w + nx; if (!seen[neighbor] && mask[neighbor] === key) { seen[neighbor] = 1; stack.push(neighbor); }
        }
      }
      if (count / (sx * sy) >= 2) out[names[key - 1]].push({ x: minX / sx, y: minY / sy, w: (maxX - minX + 1) / sx, h: (maxY - minY + 1) / sy, pixels: count / (sx * sy) });
    }
    for (const parts of Object.values(out)) parts.sort((a, b) => b.pixels - a.pixels); return out;
  }, { base64: capture.toString('base64'), palette: PALETTE });
}
async function snapshot(page: Page): Promise<View> {
  const capture = await page.locator('canvas').screenshot(); return { capture, pixels: await visiblePixels(page, capture) };
}
/** Read the public canvas once after a real animation-frame render; never replace rAF or inspect Phaser. */
async function actualCanvasFrame(page: Page): Promise<View> {
  const url = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) { reject(new Error('No actual game canvas')); return; }
      resolve(canvas.toDataURL('image/png'));
    });
  }));
  return inspectActualFrame(page, url);
}
async function inspectActualFrame(page: Page, url: string): Promise<View> {
  const capture = Buffer.from(url.split(',')[1], 'base64');
  const signal = await page.evaluate(async source => {
    const image = new Image(); image.src = source; await image.decode();
    const probe = document.createElement('canvas'); probe.width = image.naturalWidth; probe.height = image.naturalHeight;
    const ctx = probe.getContext('2d'); if (!ctx) throw new Error('No canvas signal reader'); ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data, colors = new Set<number>(); let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 255) opaque++;
      if (colors.size < 256) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return { opaqueRatio: opaque / (probe.width * probe.height), colors: colors.size };
  }, url);
  expect(signal.opaqueRatio, 'reject a cleared/unpreserved WebGL buffer').toBeGreaterThan(0.95);
  expect(signal.colors, 'actual nonempty multicolor arena background').toBeGreaterThan(12);
  return { capture, pixels: await visiblePixels(page, capture) };
}


/** Capture transient evidence on consecutive REAL frames, then decode without protocol gaps. */
async function actualCanvasBurst(page: Page, count: number): Promise<string[]> {
  return page.evaluate(length => new Promise<string[]>((resolve, reject) => {
    const frames: string[] = [];
    const sample = () => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw new Error('No native game canvas');
        frames.push(canvas.toDataURL('image/png'));
        if (frames.length === length) resolve(frames); else requestAnimationFrame(sample);
      } catch (error) { reject(error); }
    };
    requestAnimationFrame(sample);
  }), count);
}

const goldBar = (view: View) => view.pixels.gold.find(part => part.w > 5 && part.w < 7 && part.h > 84);
const landing = (view: View) => view.pixels.landing.find(part => part.w > 110 && part.w < 116 && part.h > 13);
const captionRects = (view: View) => view.pixels.caption.filter(part => part.w > 12 && part.w < 16 && part.h > 4 && part.h < 8);
const ink = (view: View, color: Color) => view.pixels[color].reduce((sum, part) => sum + part.pixels, 0);

function watch(page: Page) {
  const errors: string[] = [], writes: string[] = [], loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.method() + ' ' + request.url()); });
  page.on('response', response => { const name = new URL(response.url()).pathname; if (response.status() === 200 && ['/game/gato.png', '/game/gato.json'].includes(name)) loaded.add(name); });
  return { errors, writes, loaded };
}
async function resumeCheckpoint(page: Page) {
  // Supported checkpoint fixture, not a fresh chapter or five-chapter journey. No state writes after loading.
  const original: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 2, elapsedMs: 10000 };
  await page.addInitScript(value => localStorage.setItem('pdoom.save.v1', JSON.stringify(value)), original);
  await page.goto('/'); await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  return assertCheckpointAttempt(page, original);
}
async function hold(page: Page, key: string, milliseconds: number) {
  await page.keyboard.down(key); try { await page.waitForTimeout(milliseconds); } finally { await page.keyboard.up(key); }
}
async function walkTo(page: Page, screenX: number) {
  for (let i = 0; i < 18; i++) {
    const view = await snapshot(page), hero = view.pixels.hero.find(part => part.w > 20 && part.pixels > 100);
    if (!hero) { await page.waitForTimeout(60); continue; } // Real damage flicker, never substitute a hidden position.
    const x = hero.x + hero.w / 2; if (Math.abs(x - screenX) < 5) return view;
    await hold(page, x < screenX ? 'd' : 'a', Math.min(140, Math.max(25, Math.abs(x - screenX) / 190 * 1000)));
  }
  throw new Error('Did not visibly reach the requested flank with normal keys');
}
function bodyAt(view: View) {
  const hp = view.pixels.hp[0]; expect(hp, 'actual un-tinted boss HP anchor').toBeTruthy();
  return { x: hp.x + 32, y: hp.y + 51, hp }; // Do not use the midpoint of a shrinking fill.
}
async function aimBody(page: Page, view: View) {
  const body = bodyAt(view), box = await page.locator('canvas').boundingBox(); expect(box).not.toBeNull();
  await page.mouse.move(box!.x + body.x * box!.width / 640, box!.y + body.y * box!.height / 360);
}
async function waitView(page: Page, predicate: (view: View) => boolean, label: string, limit = 35, readFrame: (page: Page) => Promise<View> = snapshot) {
  for (let i = 0; i < limit; i++) { const view = await readFrame(page); if (predicate(view)) return view; await page.waitForTimeout(25); }
  throw new Error('No actual screenshot evidence for ' + label);
}
async function shootUntil(page: Page, word: string, observe?: (view: View) => void) {
  await aimBody(page, await snapshot(page)); await page.mouse.down();
  try {
    for (let i = 0; i < 100; i++) {
      if ((await page.locator('.mission-console .objective').innerText()).includes(word)) return;
      const view = await snapshot(page); observe?.(view);
      if (!view.pixels.hp.length) await writeFile('artifacts/browser/gato-missing-anchor.png', view.capture);
      await aimBody(page, view); await page.waitForTimeout(35);
    }
    throw new Error('No real visible phase transition to ' + word);
  } finally { await page.mouse.up(); }
}

test('Gato real front reflector survives a long pause and reflects a real mouse-fired projectile', async ({ page }, info) => {
  test.setTimeout(60000); const observed = watch(page); await resumeCheckpoint(page);
  await hold(page, 'd', 2300); await walkTo(page, 400);
  let sawClear = false;
  const tell = await waitView(page, view => { if (!goldBar(view)) sawClear = true; return sawClear && !!goldBar(view); }, 'fresh real gold bar', 60, actualCanvasFrame);
  expect(ink(tell, 'cassette')).toBeGreaterThan(20); expect(bodyAt(tell).hp.w).toBeCloseTo(64, 0);
  expect([...observed.loaded].sort()).toEqual(['/game/gato.json', '/game/gato.png']);
  await writeFile('artifacts/browser/gato-reflection-tell.png', tell.capture);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '暂停前向传播。' })).toBeVisible();
  await page.waitForTimeout(200); const paused = await page.locator('canvas').screenshot(), clock = await page.locator('.hud-cell').last().innerText();
  await page.waitForTimeout(4400); expect(await page.locator('canvas').screenshot()).toEqual(paused);
  expect(await page.locator('.hud-cell').last().innerText()).toBe(clock);
  await writeFile('artifacts/browser/gato-paused.png', paused);
  // Prepare the aim while simulation is frozen. Decoding a resumed screenshot can spend
  // much of the real650ms shield window before the mouse could fire.
  const aim = bodyAt(tell), canvasBox = await page.locator('canvas').boundingBox(); expect(canvasBox).not.toBeNull();
  const pointer = { x: canvasBox!.x + aim.x * canvasBox!.width / 640, y: canvasBox!.y + aim.y * canvasBox!.height / 360 };
  await page.getByRole('button', { name: '继续训练', exact: true }).click();
  const [frames] = await Promise.all([actualCanvasBurst(page, 24), (async () => {
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down();
    try {
      // Ordinary held mouse input through two real render callbacks. This does not
      // assert an exact emitted-shot count or replace/advance the game clock.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    } finally { await page.mouse.up(); }
  })()]);
  await Promise.all(frames.map((url, index) => writeFile(info.outputPath(`gato-shot-frame-${String(index).padStart(2, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'))));
  const resumed = await inspectActualFrame(page, frames[0]); expect(goldBar(resumed)).toBeTruthy();
  let reflection: View | null = null; const samples: { gold: number; dictionary: Component[] }[] = [];
  for (const frame of frames) {
    const view = await inspectActualFrame(page, frame); samples.push({ gold: ink(view, 'gold'), dictionary: view.pixels.dictionary });
    if (view.pixels.dictionary.some(part => part.w > 5 && part.w < 7 && part.h > 5 && part.h < 7 && part.x > 390 && part.x < 456)) { reflection = view; break; }
  }
  console.info('Gato reflected-shot observations', JSON.stringify(samples)); expect(reflection, 'actual six-pixel reflected projectile, not a normal eight-pixel volley').not.toBeNull();
  const reflected = reflection!;
  expect(bodyAt(reflected).hp.w).toBeCloseTo(64, 0); expect(goldBar(reflected)).toBeTruthy();
  await writeFile('artifacts/browser/gato-reflected-shot.png', reflected.capture);
  expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
});

test('Gato three real phases preserve overlapping HP cues, seven captions and clean up after victory', async ({ page }) => {
  test.setTimeout(90000); const observed = watch(page), attempt = await resumeCheckpoint(page);
  try {
    await hold(page, 'd', 3000); await walkTo(page, 570);
    const aliveCanvas = await actualCanvasFrame(page); expect(ink(aliveCanvas, 'cassette')).toBeGreaterThan(20);
    await writeFile('artifacts/browser/gato-alive-canvas.png', aliveCanvas.capture);
    await shootUntil(page, '机械臂');
    const tell = await waitView(page, view => !!landing(view), 'real 112px mechanical-arm target');
    const column = landing(tell)!, targetX = column.x + column.w / 2, before = bodyAt(tell);
    expect(Math.abs(column.w - 114)).toBeLessThan(1); expect(Math.abs(column.h - 16)).toBeLessThan(1);
    expect(Math.abs(before.x - 480)).toBeLessThan(1.5); expect(Math.abs(before.y - 244)).toBeLessThan(1.5);
    expect(before.hp.w).toBeLessThanOrEqual(64 * 2 / 3 + 1); // At most one native raster pixel beyond the exact two-thirds fill.
     expect(targetX - before.x).toBeGreaterThan(50); expect(ink(tell, 'cassette')).toBeGreaterThan(5);
    const spriteX = Math.max(...tell.pixels.cassette.map(part => part.x + part.w)) - 24;
    expect(Math.abs(spriteX - before.x)).toBeLessThan(3); // The actual body must not anticipate targetX.
    await writeFile('artifacts/browser/gato-arm-tell.png', tell.capture);
    await page.waitForTimeout(350); await page.keyboard.down('a'); await page.keyboard.down('Space');
    let jump: View | null = null, attack: View | null = null;
    for (let i = 0; i < 12; i++) {
      const view = await snapshot(page), hero = view.pixels.hero[0];
      if (hero?.y < 290 && (!jump || hero.y < jump.pixels.hero[0].y)) jump = view;
      if (view.pixels.impact.length >= 2 && Math.abs(bodyAt(view).x - targetX) < 6) { attack = view; break; }
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(200); await page.keyboard.up('a'); await page.keyboard.up('Space');
    expect(jump, 'actual normal Space jump').not.toBeNull(); expect(jump!.pixels.hero[0].y).toBeLessThan(280);
    expect(attack, 'real body relocation and two ground waves').not.toBeNull();
    expect(Math.abs(bodyAt(attack!).y - 282)).toBeLessThan(4); expect(attack!.pixels.impact.length).toBeGreaterThanOrEqual(2);
    await writeFile('artifacts/browser/gato-arm-jump.png', jump!.capture);
    await writeFile('artifacts/browser/gato-arm-impact.png', attack!.capture);
    const evidence: { overlap?: View } = {};
    await shootUntil(page, '字幕', view => {
      const mark = landing(view);
      if (mark && mark.x < 448 && mark.x + mark.w > 454) {
        expect(Math.abs(bodyAt(view).hp.x - 448), 'HP original color must survive an overlapping real warning column').toBeLessThan(1.5);
        expect(Math.abs(bodyAt(view).hp.h - 4)).toBeLessThan(1); evidence.overlap ??= view;
      }
    });
    expect(evidence.overlap, 'must exercise the formerly occluded HP geometry, not avoid it').toBeTruthy();
    await writeFile('artifacts/browser/gato-overlap-hp.png', evidence.overlap!.capture);
    await hold(page, 'a', 1500);
    const captions = await waitView(page, view => captionRects(view).length === 7, 'seven separated real caption bullets', 20);
    expect(captionRects(captions)).toHaveLength(7);
    for (const part of captionRects(captions)) { expect(Math.abs(part.w - 14)).toBeLessThan(1); expect(Math.abs(part.h - 6)).toBeLessThan(1); }
    await writeFile('artifacts/browser/gato-seven-captions.png', captions.capture);
    const nextChapter = page.getByRole('button', { name: '进入第二章', exact: true });
    await aimBody(page, captions); await page.mouse.down();
    try {
      for (let i = 0; i < 100 && !(await nextChapter.isVisible()); i++) {
        const view = await snapshot(page);
        if (!view.pixels.hp.length) { await expect(nextChapter).toBeVisible({ timeout: 1500 }); break; }
        await aimBody(page, view); await page.waitForTimeout(35);
      }
    } finally { await page.mouse.up(); }
    await expect(nextChapter).toBeVisible(); await expect(page.getByRole('heading', { name: '中文房间与迷幻森林已突破。', exact: true })).toBeVisible();
    const won: GameSaveData = await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'));
    expect(isGameSave(won)).toBe(true); expect(won).toMatchObject({ runId: attempt.runId, seed: 42, stage: 2, checkpoint: 0, doom: 8 });
    expect(won.hp).toBeGreaterThan(0); expect(won.actionCounts.shots).toBeGreaterThan(0); expect(won.elapsedMs).toBeGreaterThan(attempt.elapsedMs);
    // Same arena, before the chapter button: DOM overlay cannot hide a stale image in this raw-canvas proof.
    const clearedCanvas = await actualCanvasFrame(page);
    expect(ink(clearedCanvas, 'cassette')).toBe(0); expect(ink(clearedCanvas, 'hp')).toBe(0); expect(ink(clearedCanvas, 'gold')).toBe(0);
    await writeFile('artifacts/browser/gato-defeated-canvas.png', clearedCanvas.capture);
    await writeFile('artifacts/browser/gato-defeated.png', await page.locator('canvas').screenshot());
    await nextChapter.click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.mission-console .objective')).toBeVisible(); await page.waitForTimeout(150);
    const nextWorld = await snapshot(page); expect(ink(nextWorld, 'cassette')).toBe(0); expect(ink(nextWorld, 'gold')).toBe(0);
    await writeFile('artifacts/browser/gato-next-chapter-clean.png', nextWorld.capture);
    expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
    console.info('Gato native checkpoint combat', { hp: won.hp, elapsedMs: won.elapsedMs, actions: won.actionCounts, captionCount: captionRects(captions).length, overlappedHp: bodyAt(evidence.overlap!).hp });
  } finally {
    await page.mouse.up(); await page.keyboard.up('a'); await page.keyboard.up('d'); await page.keyboard.up('Space');
  }
});
