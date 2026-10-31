import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { furnaceSource, inspectFurnace } from './furnace-pixels';

// Legal initial checkpoint slice, not a fresh journey. Read only actual canvas
// pixels: no World/Phaser hooks, injected tick/state, hidden UI or fake rAF.
const FILES = ['/game/chinchilla.png', '/game/chinchilla.json'];
const NAMES = [0, 1, 2].map(i => `chinchilla ${i}.aseprite`);
type Rect = { x: number; y: number; w: number; h: number };
type Source = { image: string; frames: Rect[] };
type Capture = { png: string; at: number };
type Body = { x: number; y: number; pose: number; ratio: number; signature: number; fullRatio: number; ink: number; warning: number; outerRing: number; fan: number };
type View = { bodies: Body[]; opaque: number; colors: number; hero: number; cover: number };
function watch(page: Page) {
  const errors: string[] = [], writes: string[] = [], loaded = new Set<string>();
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) writes.push(r.url()); });
  page.on('response', r => { const p = new URL(r.url()).pathname; if (r.status() === 200 && FILES.includes(p)) loaded.add(p); });
  return { errors, writes, loaded };
}
async function art(): Promise<Source> {
  const [png, text] = await Promise.all([readFile('public/game/chinchilla.png'), readFile('public/game/chinchilla.json', 'utf8')]);
  const a = JSON.parse(text) as { frames: { filename: string; frame: Rect; trimmed: boolean; rotated: boolean }[]; meta: { size: { w: number; h: number }; frameTags: { name: string; from: number; to: number }[] } };
  expect(a.meta.size).toEqual({ w: 96, h: 32 }); expect(a.frames.map(f => f.filename)).toEqual(NAMES);
  expect(a.meta.frameTags.map(({ name, from, to }) => ({ name, from, to }))).toEqual([{ name: 'idle', from: 0, to: 0 }, { name: 'tell', from: 1, to: 1 }, { name: 'recover', from: 2, to: 2 }]);
  a.frames.forEach((f, i) => expect(f).toMatchObject({ trimmed: false, rotated: false, frame: { x: i * 32, y: 0, w: 32, h: 32 } }));
  return { image: `data:image/png;base64,${png.toString('base64')}`, frames: a.frames.map(f => f.frame) };
}
function fixture(): GameSaveData {
  const value: GameSaveData = { ...createRun(randomUUID(), 42), stage: 3, checkpoint: 1, tokens: 200, elapsedMs: 20000, donated: true };
  expect(isGameSave(value)).toBe(true); return value;
}
async function seed(page: Page, value: GameSaveData) {
  await page.addInitScript(save => {
    const marker = `chinchilla.fixture.${save.runId}`;
    if (sessionStorage.getItem(marker) === null) {
      sessionStorage.setItem(marker, 'once');
      if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(save));
    }
  }, value);
}
const rawSave = (page: Page) => page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
const pauseDialog = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
async function pause(page: Page) { await page.getByRole('button', { name: 'Ⅱ PAUSE / 暂停游戏', exact: true }).click(); await expect(pauseDialog(page)).toBeVisible(); }
async function nativeFrames(page: Page, duration = 0): Promise<Capture[]> {
  return page.evaluate(ms => new Promise<Capture[]>((resolve, reject) => {
    const captures: Capture[] = []; let began: number | null = null;
    const take = () => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw new Error('Expected real640x360 canvas');
        const at = performance.now(); began ??= at; captures.push({ png: canvas.toDataURL('image/png'), at });
        if (at - began >= ms || captures.length >= 400) resolve(captures); else requestAnimationFrame(take);
      } catch (e) { reject(e); }
    };
    requestAnimationFrame(take);
  }), duration);
}
async function inspect(page: Page, capture: Capture, source: Source, registered: { x: number; y: number } | null = null): Promise<View> {
  return page.evaluate(async ({ capture, source, registered }) => {
    const decode = async (url: string) => {
      const image = new Image(); image.src = url; await image.decode();
      const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
      const g = c.getContext('2d'); if (!g) throw new Error('No independent pixel reader');
      g.imageSmoothingEnabled = false; g.drawImage(image, 0, 0);
      return { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
    };
    const [view, src] = await Promise.all([decode(capture.png), decode(source.image)]);
    if (view.w !== 640 || view.h !== 360 || src.w !== 96 || src.h !== 32) throw new Error('Unexpected native dimensions');
    const px = (im: typeof view, x: number, y: number) => { const p = (y * im.w + x) * 4; return Array.from(im.data.slice(p, p + 4)); };
    const eq = (a: number[], b: number[]) => a[3] === 255 && b[3] === 255 && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 2);
    const core: { x: number; y: number; values: number[][]; changing: boolean }[] = [];
    for (let y = 10; y <= 21; y++) for (let x = 10; x <= 21; x++) {
      const values = source.frames.map(f => px(src, f.x + x, f.y + y));
      if (values.every(v => v[3] === 255)) core.push({ x, y, values, changing: new Set(values.map(v => v.join(','))).size > 1 });
    }
    const signature = core.filter(p => p.changing);
    if (core.length < 100 || signature.length < 8 || new Set([0, 1, 2].map(i => signature.map(p => p.values[i].join(',')).join('|'))).size !== 3) throw new Error('Native interior fails to distinguish three poses');
    const full = source.frames.map(f => {
      const points: { x: number; y: number; color: number[] }[] = [];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const color = px(src, f.x + x, f.y + y); if (color[3]) points.push({ x, y, color }); }
      return points;
    });
    const anchors = full.map(points => points.find(p => eq(p.color, [114, 63, 104, 255])));
    if (anchors.some(p => !p)) throw new Error('Missing independently sampled round-ear anchor');
    const candidates = new Set<string>();
    for (let y = 290; y < 322; y++) for (let x = 300; x < 640; x++) {
      if (!eq(px(view, x, y), [114, 63, 104, 255])) continue;
      for (const a of anchors) if (a) { const left = x - a.x, top = y - a.y; if (left >= 0 && left + 32 <= 640 && top >= 0 && top + 32 <= 360) candidates.add(`${left},${top}`); }
    }
    const bodies: Body[] = [];
    for (const key of candidates) {
      const [x, y] = key.split(',').map(Number);
      for (let pose = 0; pose < 3; pose++) {
        const ratio = core.filter(p => eq(px(view, x + p.x, y + p.y), p.values[pose])).length / core.length;
        if (ratio < 0.98) continue;
        const sig = signature.filter(p => eq(px(view, x + p.x, y + p.y), p.values[pose])).length / signature.length;
        if (sig < 0.98) continue;
        const fullRatio = full[pose].filter(p => eq(px(view, x + p.x, y + p.y), p.color)).length / full[pose].length;
        let warning = 0, outerRing = 0, fan = 0;
        for (let yy = Math.max(0, y + 3); yy < Math.min(360, y + 30); yy++) for (let xx = Math.max(0, x + 3); xx < Math.min(640, x + 30); xx++) {
          if (!eq(px(view, xx, yy), [241, 220, 139, 255])) continue;
          const radius = Math.hypot(xx + 0.5 - x - 16, yy + 0.5 - y - 16);
          if (radius >= 9 && radius <= 13) warning++;
        }
        for (let yy = Math.max(0, y - 4); yy < Math.min(360, y + 37); yy++) for (let xx = Math.max(0, x - 4); xx < Math.min(640, x + 37); xx++) {
          const radius = Math.hypot(xx + 0.5 - x - 16, yy + 0.5 - y - 16);
          if (radius >= 15 && radius <= 19 && eq(px(view, xx, yy), [241, 220, 139, 255])) outerRing++;
        }
        for (let yy = 240; yy < 340; yy++) for (let xx = Math.max(0, x - 284); xx < x - 2; xx++) if (eq(px(view, xx, yy), [241, 220, 139, 255])) fan++;
        bodies.push({ x, y, pose, ratio, signature: sig, fullRatio, ink: core.length, warning, outerRing, fan });
      }
    }
    let opaque = 0, hero = 0; const colors = new Set<string>();
    for (let i = 0; i < view.data.length; i += 4) { if (view.data[i + 3] === 255) opaque++; if (view.data[i] === 217 && view.data[i + 1] === 119 && view.data[i + 2] === 87) hero++; colors.add(`${view.data[i]},${view.data[i + 1]},${view.data[i + 2]}`); }
    const cover = registered ? core.filter(p => eq(px(view, registered.x + p.x, registered.y + p.y), [241, 220, 139, 255])).length : 0;
    return { bodies, opaque: opaque / (640 * 360), colors: colors.size, hero, cover };
  }, { capture, source, registered });
}
function positive(v: View) { expect(v.opaque).toBeGreaterThan(0.99); expect(v.colors).toBeGreaterThan(12); expect(v.hero).toBeGreaterThan(30); }


test('legal cp1 normal movement reveals all three tiny native poses, actual fan, pause and normal-shot death', async ({ page }, info) => {
  test.setTimeout(120000);
  const observed = watch(page), source = await art(), original = fixture(); await seed(page, original);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  const stream = nativeFrames(page, 3600);
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  await page.keyboard.down('d'); await page.waitForTimeout(350); await page.keyboard.up('d');
  const captures = await stream; await pause(page);
  await assertCheckpointAttempt(page, original);
  const rows: { at: number; view: View }[] = [];
  const chosen = new Map<number, { capture: Capture; body: Body }>();
  let firstTell: Body | undefined, fan: Body | undefined;
  const last = captures[captures.length - 1];
  await writeFile(info.outputPath('chinchilla-last-native.png'), Buffer.from(last.png.split(',')[1], 'base64'));
  for (let i = 0; i < captures.length; i += 2) {
    const view = await inspect(page, captures[i], source); rows.push({ at: captures[i].at, view });
    // Spawn/hit grace legitimately blinks Clawd off; select only positive-control samples, never lower the threshold.
    if (view.hero <= 30) continue;
    for (const body of view.bodies) {
      positive(view);
      if (!chosen.has(body.pose) && (body.pose === 1 || body.fullRatio >= 0.98)) chosen.set(body.pose, { capture: captures[i], body });
      if (!firstTell && body.pose === 1) firstTell = body;
      if (body.pose === 2 && body.fan >= 50 && body.fullRatio >= 0.98) fan = body;
    }
  }
  await writeFile(info.outputPath('chinchilla-native-observations.json'), JSON.stringify({ rows, firstTell, fan }, null, 2));
  expect([...chosen.keys()].sort(), 'complete native poses from ordinary input, not clipped idle fragments').toEqual([0, 1, 2]);
  const environmentSource = await furnaceSource();
  for (const [pose, { capture, body }] of chosen) {
    expect(body.ratio).toBeGreaterThanOrEqual(0.98); expect(body.signature).toBeGreaterThanOrEqual(0.98); expect(body.ink).toBeGreaterThanOrEqual(100);
    const environment = (await inspectFurnace(page, [capture], environmentSource))[0];
    expect(environment.floorY, 'independently registered same-frame native floor').not.toBeNull();
    expect(environment.floorPixels).toBeGreaterThanOrEqual(500);
    expect(body.y + 21, 'native feet remain one pixel above the actual contact edge').toBe(environment.floorY! - 1);
    await writeFile(info.outputPath(`chinchilla-pose-${pose}.png`), Buffer.from(capture.png.split(',')[1], 'base64'));
  }
  expect(firstTell?.warning, 'original radius11 warning is above the skin').toBeGreaterThanOrEqual(30);
  expect(firstTell?.outerRing, 'not the generic radius17 replacement').toBeLessThanOrEqual(4);
  expect(fan?.fan, 'actual GPU shots in front of the body, not the warning ring').toBeGreaterThanOrEqual(50);
  // Source-positive frames on BOTH sides register the same stationary body. The
  // actual burst must cover opaque INTERIOR texels; a depth0 shot hidden behind
  // Image2 cannot satisfy this, unlike merely finding bullets outside the body.
  const positions = rows.flatMap(row => row.view.bodies.map(body => ({ at: row.at, body })));
  const registered = positions.at(-1)!.body;
  let overlap: { capture: Capture; cover: number; before: typeof positions[number]; after: typeof positions[number] } | undefined;
  for (let i = 0; i < captures.length; i++) {
    const capture = captures[i];
    const before = positions.filter(p => p.at < capture.at && p.body.x === registered.x && p.body.y === registered.y).at(-1);
    const after = positions.find(p => p.at > capture.at && p.body.x === registered.x && p.body.y === registered.y);
    if (!before || !after) continue;
    const view = await inspect(page, capture, source, registered);
    if (view.cover >= 12 && view.hero > 30) { positive(view); overlap = { capture, cover: view.cover, before, after }; break; }
  }
  expect(overlap, 'real GPU pixels must occlude source-opaque body core, bracketed by native source-positive views').toBeDefined();
  await writeFile(info.outputPath('chinchilla-gpu-over-body.png'), Buffer.from(overlap!.capture.png.split(',')[1], 'base64'));
  await writeFile(info.outputPath('chinchilla-overlap-proof.json'), JSON.stringify({ registered, cover: overlap!.cover, at: overlap!.capture.at, before: overlap!.before, after: overlap!.after }, null, 2));
  const frozen = (await nativeFrames(page))[0], hud = await page.locator('.hud-cell').allTextContents(), save = await rawSave(page);
  const frozenView = await inspect(page, frozen, source); positive(frozenView); expect(frozenView.bodies).toHaveLength(1);
  await page.waitForTimeout(1800);
  expect((await nativeFrames(page))[0].png).toBe(frozen.png);
  expect(await page.locator('.hud-cell').allTextContents()).toEqual(hud); expect(await rawSave(page)).toBe(save);
  await page.screenshot({ path: info.outputPath('chinchilla-paused-window.png') });
  await pauseDialog(page).getByRole('button', { name: '继续训练', exact: true }).click(); await expect(pauseDialog(page)).toBeHidden();
  const resumed = await nativeFrames(page, 1500); await pause(page);
  const resumedPoses = new Set<number>();
  for (let i = 0; i < resumed.length; i += 4) for (const body of (await inspect(page, resumed[i], source)).bodies) resumedPoses.add(body.pose);
  expect(resumedPoses.has(1) && resumedPoses.has(2), 'real FSM resumes instead of an animation timer').toBe(true);
  await pauseDialog(page).getByRole('button', { name: '继续训练', exact: true }).click(); await expect(pauseDialog(page)).toBeHidden();
  // Aim through the public pointer at the source-registered tiny body's center.
  const box = await page.locator('canvas').boundingBox(); if (!box) throw new Error('Missing canvas bounds');
  const target = frozenView.bodies[0];
  await page.mouse.move(box.x + (target.x + 16) * box.width / 640, box.y + (target.y + 16) * box.height / 360);
  await page.mouse.down(); await page.waitForTimeout(3000); await page.mouse.up();
  await expect(page.locator('.hud-cell').filter({ hasText: 'TOK' })).toContainText('206');
  const afterShots = await nativeFrames(page, 700); await pause(page);
  let cleared: { capture: Capture; view: View } | undefined;
  for (let i = 0; i < afterShots.length; i += 2) {
    const view = await inspect(page, afterShots[i], source);
    if (view.hero > 30 && view.bodies.length === 0) { cleared = { capture: afterShots[i], view }; break; }
  }
  expect(cleared, 'ordinary gunfire clears the native body with a visible-player positive control').toBeDefined();
  positive(cleared!.view);
  await writeFile(info.outputPath('chinchilla-normal-shot-clear.png'), Buffer.from(cleared!.capture.png.split(',')[1], 'base64'));
  expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]); expect([...observed.loaded].sort()).toEqual([...FILES].sort());
});

for (const failure of ['missing-png', 'missing-recover', 'aliased-unused-recover'] as const) {
  test(`chinchilla ${failure} rejects complete readiness and preserves the legal checkpoint`, async ({ page }, info) => {
    const observed = watch(page), save = fixture(); await seed(page, save);
    const target = failure === 'missing-png' ? '**/game/chinchilla.png' : '**/game/chinchilla.json';
    const handler = async (route: Route) => {
      if (failure === 'missing-png') { await route.abort(); return; }
      const response = await route.fetch(); const atlas = await response.json() as { frames: { filename: string; frame: Rect }[] };
      if (failure === 'missing-recover') atlas.frames = atlas.frames.filter(f => f.filename !== NAMES[2]);
      else { const frame = atlas.frames.find(f => f.filename === NAMES[2]); if (!frame) throw new Error('Missing source frame'); frame.frame.x = 0; }
      await route.fulfill({ response, json: atlas });
    };
    await page.route(target, handler); await page.goto('/');
    const warning = page.getByLabel('游戏资源加载失败', { exact: true });
    await expect(warning).toBeVisible({ timeout: 15000 }); await expect(warning).toContainText('Chinchilla');
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
    expect(JSON.parse((await rawSave(page))!)).toEqual(save);
    await page.screenshot({ path: info.outputPath(`${failure}.png`) });
    await page.unroute(target, handler); await page.reload();
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    expect(JSON.parse((await rawSave(page))!)).toEqual(save);
    expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  });
}


test('three real Escape pause/resume cycles remain usable after ordinary shooting', async ({ page }, info) => {
  test.setTimeout(60000);
  const observed = watch(page), save = fixture(); await seed(page, save); await page.goto('/');
  await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '恢复检查点', exact: true }).click();
  const states: { cycle: number; before: string[]; frozen: string[]; resumed: string[] }[] = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.keyboard.press('Escape'); await expect(pauseDialog(page)).toBeVisible();
    const before = await page.locator('.hud-cell').allTextContents();
    await page.waitForTimeout(1700); const frozen = await page.locator('.hud-cell').allTextContents(); expect(frozen).toEqual(before);
    await page.keyboard.press('Escape'); await expect(pauseDialog(page)).toBeHidden();
    await page.keyboard.down('j'); await page.waitForTimeout(1200); await page.keyboard.up('j');
    await expect(pauseDialog(page), 'closing Escape must not reopen pause on a later input tick').toBeHidden();
    const resumed = await page.locator('.hud-cell').allTextContents(); expect(resumed.at(-1)).not.toBe(frozen.at(-1));
    states.push({ cycle, before, frozen, resumed });
  }
  await page.keyboard.press('Escape'); await expect(pauseDialog(page)).toBeVisible();
  await writeFile(info.outputPath('escape-cycles.json'), JSON.stringify(states, null, 2));
  expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
});
