import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { assertCheckpointAttempt } from './checkpoint-attempt';

// Supported checkpoint fixtures, NOT fresh journeys. Only normal input and DOM/canvas observations.
// No engine/global/React-internal access, gameplay setters, clock substitution or hidden DOM.
const RECIPE = { wallAlpha: 0.18, propAlpha: 0.22, base: [15, 25, 27] } as const;
const RESOURCE_PATHS = ['/game/chapter-one-terrain.png', '/game/chapter-one-props.png', '/game/chapter-one-props.json'];
type Rect = { x: number; y: number; w: number; h: number };
type Sources = { terrain: string; props: string; wall: Rect; ledge: Rect; mossTop: Rect; mushroom: Rect; trunk: Rect; canopy: Rect; roots: Rect };
type Hero = { count: number; meanX: number; meanY: number; left: number; right: number; top: number; bottom: number };
type Proof = { matched: number; pixels: number; evidence: number; evidenceMatched: number; checksum: number };
type Observation = {
  png: string; at: number; opaqueRatio: number; anchor: number | null;
  surface: 'ordinary' | 'warning' | 'absent'; rulePixels: number;
  hero: Hero | null; core: { count: number; x: number; y: number } | null;
  mushroom: { ratio: number; centerY: number; inkPixels: number; checksum: number } | null;
  canopyProof: Proof | null; propProof: Proof | null; groundProof: Proof | null; exposedProof: Proof | null;
};
type Trace = Omit<Observation, 'png' | 'opaqueRatio' | 'core'> & { label: string };
type Recorder = { anchor: number | null; latest: Observation | null; rows: Trace[] };
const recorder = (): Recorder => ({ anchor: null, latest: null, rows: [] });

function watch(page: Page) {
  const errors: string[] = [], writes: string[] = [], loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push(`${request.method()} ${request.url()}`);
  });
  page.on('response', response => { const path = new URL(response.url()).pathname; if (response.status() === 200 && RESOURCE_PATHS.includes(path)) loaded.add(path); });
  return { errors, writes, loaded };
}
async function sources(): Promise<Sources> {
  const [terrain, props, mapText, atlasText] = await Promise.all([
    readFile('public/game/chapter-one-terrain.png'), readFile('public/game/chapter-one-props.png'),
    readFile('public/game/chapter-one-terrain.json', 'utf8'), readFile('public/game/chapter-one-props.json', 'utf8'),
  ]);
  const map = JSON.parse(mapText) as { columns: number; tileCount: number; map: { width: number; tiles: number[] } };
  expect(map).toMatchObject({ columns: 6, tileCount: 32, map: { width: 16 } });
  const tile = (x: number, y: number): Rect => { const slot = map.map.tiles[y * 16 + x] - 1; expect(slot).toBeGreaterThanOrEqual(0); return { x: slot % 6 * 16, y: Math.floor(slot / 6) * 16, w: 16, h: 16 }; };
  const atlas = JSON.parse(atlasText) as { frames: { frame: Rect; trimmed: boolean; rotated: boolean }[]; meta: { frameTags: { name: string; from: number; to: number }[] } };
  const prop = (name: string): Rect => {
    const tag = atlas.meta.frameTags.find(value => value.name === name); if (!tag) throw new Error(`Missing static source tag ${name}`);
    expect(tag.from).toBe(tag.to); const frame = atlas.frames[tag.from]; expect(frame).toMatchObject({ trimmed: false, rotated: false, frame: { w: 64, h: 64 } }); return frame.frame;
  };
  return { terrain: `data:image/png;base64,${terrain.toString('base64')}`, props: `data:image/png;base64,${props.toString('base64')}`,
    wall: tile(6, 2), ledge: tile(4, 2), mossTop: tile(1, 1), mushroom: prop('mushroom'), trunk: prop('forest-trunk'), canopy: prop('forest-canopy'), roots: prop('root-clump') };
}
async function fixture(page: Page, checkpoint: 1 | 11, tokens = 0) {
  const original: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint, elapsedMs: 10000, doom: 64, hp: 100, tokens };
  expect(isGameSave(original)).toBe(true);
  await page.addInitScript(({ save, marker }) => {
    if (sessionStorage.getItem(marker)) return;
    localStorage.setItem('pdoom.save.v1', JSON.stringify(save)); sessionStorage.setItem(marker, 'seeded');
  }, { save: original, marker: `environment.mechanics.fixture.${original.runId}` });
  await page.goto('/');
  const resume = page.getByRole('button', { name: '恢复检查点', exact: true });
  await expect(resume).toBeEnabled({ timeout: 15000 }); await resume.click();
  return { original, attempt: await assertCheckpointAttempt(page, original) };
}
async function stored(page: Page): Promise<GameSaveData> {
  const value: GameSaveData = await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'));
  expect(isGameSave(value)).toBe(true); return value;
}
async function hud(page: Page) {
  const values = await page.locator('.hud-cell strong').allTextContents(); expect(values).toHaveLength(4);
  const hp = Number.parseFloat(values[0]), doom = Number.parseFloat(values[1]), tokens = Number.parseInt(values[2], 10);
  expect([hp, doom, tokens].every(Number.isFinite)).toBe(true); return { hp, doom, tokens, clock: values[3] };
}
async function release(page: Page) { for (const key of ['d', 'a', 'j', 'Space']) await page.keyboard.up(key); }

/** One real rAF/readback, without advancing or replacing the game clock. */
async function observe(page: Page, source: Sources, fallback: number | null): Promise<Observation> {
  const capture = await page.evaluate(() => new Promise<{ png: string; at: number }>((resolve, reject) => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas || canvas.width !== 640 || canvas.height !== 360) { reject(new Error('Expected native 640x360 game canvas')); return; }
      resolve({ png: canvas.toDataURL('image/png'), at: performance.now() });
    });
  }));
  const measured = await page.evaluate(async ({ capture, source, fallback, recipe }) => {
    const decode = async (url: string) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); if (!context) throw new Error('No read-only pixel decoder'); context.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const [actual, terrain, props] = await Promise.all([decode(capture.png), decode(source.terrain), decode(source.props)]);
    const pixel = (image: typeof actual, x: number, y: number) => {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [0, 0, 0, 0];
      const i = (y * image.width + x) * 4; return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
    };
    const close = (a: number[], b: readonly number[], tolerance = 2) => Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance && Math.abs(a[2] - b[2]) <= tolerance;
    const distance = (a: readonly number[], b: readonly number[]) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
    const tiled = (frame: Rect, x: number, y: number) => pixel(terrain, frame.x + mod(x, frame.w), frame.y + mod(y, frame.h));
    const over = (below: number[], above: number[], alpha: number) => { const a = alpha * above[3] / 255; return [0, 1, 2].map(c => Math.round(above[c] * a + below[c] * (1 - a))).concat(255); };
    let opaque = 0, count = 0, sumX = 0, sumY = 0, left = 640, right = -1, top = 360, bottom = -1;
    let coreCount = 0, coreX = 0, coreY = 0;
    for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
      const p = pixel(actual, x, y); if (p[3] === 255) opaque++;
      if (p[0] === 217 && p[1] === 119 && p[2] === 87) { count++; sumX += x; sumY += y; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
      if (x >= 300 && x < 430 && y >= 185 && y < 270 && p[0] === 251 && p[1] === 136 && p[2] === 111) { coreCount++; coreX += x; coreY += y; }
    }
    const hero = count ? { count, meanX: sumX / count, meanY: sumY / count, left, right, top, bottom } : null;
    const core = coreCount ? { count: coreCount, x: coreX / coreCount, y: coreY / coreCount } : null;
    const stripe = (rgb: number[]) => {
      const xs: number[] = []; let pixels = 0;
      for (let x = 0; x < 640; x++) { let n = 0; for (let y = 196; y < 199; y++) if (close(pixel(actual, x, y), rgb, 1)) n++; if (n >= 2) xs.push(x); pixels += n; }
      return { left: xs.length >= 35 ? xs[0] : null, pixels };
    };
    const normal = stripe([169, 138, 100]), warning = stripe([237, 146, 108]);
    const surface: Observation['surface'] = warning.left !== null ? 'warning' : normal.left !== null ? 'ordinary' : 'absent';
    const anchor = surface === 'warning' ? warning.left : surface === 'ordinary' ? normal.left : fallback;
    const hash = (area: Rect) => { let value = 2166136261; for (let y = area.y; y < area.y + area.h; y++) for (let x = area.x; x < area.x + area.w; x++) for (const byte of pixel(actual, x, y)) value = Math.imul(value ^ byte, 16777619) >>> 0; return value; };
    const empty = { opaqueRatio: opaque / (640 * 360), hero, core, anchor, surface, rulePixels: surface === 'warning' ? warning.pixels : normal.pixels,
      mushroom: null, canopyProof: null, propProof: null, groundProof: null, exposedProof: null };
    if (anchor === null) return empty;
    const scroll = 1610 - anchor;
    const background = (x: number, y: number) => {
      let color = [...recipe.base, 255];
      if (y >= 0 && y < 320) color = over(color, tiled(source.wall, x, y), recipe.wallAlpha);
      const stamp = (frame: Rect, sx: number, sy: number) => { if (x >= sx && x < sx + 64 && y >= sy && y < sy + 64) color = over(color, pixel(props, frame.x + x - sx, frame.y + y - sy), recipe.propAlpha); };
      for (const [tx, cy] of [[1328, 128], [1600, 64]]) { stamp(source.canopy, tx, cy); for (let ty = cy + 64; ty <= 256; ty += 64) stamp(source.trunk, tx, ty); stamp(source.roots, tx, 256); }
      return color;
    };
    const proof = (area: Rect, expected: (x: number, y: number) => number[], without: (x: number, y: number) => number[]): Proof => {
      let matched = 0, evidence = 0, evidenceMatched = 0, pixels = 0;
      for (let y = area.y; y < area.y + area.h; y++) for (let x = area.x; x < area.x + area.w; x++) {
        const sx = x - scroll; if (sx < 0 || sx >= 640 || y < 0 || y >= 360) continue;
        const value = pixel(actual, sx, y), want = expected(x, y), yes = value[3] === 255 && close(value, want); pixels++; if (yes) matched++;
        if (distance(want, without(x, y)) >= 4) { evidence++; if (yes) evidenceMatched++; }
      }
      return { matched, pixels, evidence, evidenceMatched, checksum: hash({ x: area.x - scroll, y: area.y, w: area.w, h: area.h }) };
    };
    const wallOnly = (x: number, y: number) => over([...recipe.base, 255], tiled(source.wall, x, y), recipe.wallAlpha);
    const canopyProof = proof({ x: 1680, y: 199, w: 40, h: 9 }, (x, y) => tiled(source.ledge, x - 1610, y - 196), background);
    const propProof = proof({ x: 1600, y: 64, w: 64, h: 64 }, background, wallOnly);
    const groundProof = proof({ x: 1704, y: 320, w: 24, h: 16 }, (x, y) => tiled(source.mossTop, x - 1310, y - 320), () => [...recipe.base, 255]);
    // Choose the far end, away from observed Clawd ink; no engine position.
    const endX = !hero || hero.meanX < anchor + 60 ? 1710 : 1610;
    const exposedProof = proof({ x: endX, y: 199, w: 16, h: 9 }, background, (x, y) => tiled(source.ledge, x - 1610, y - 196));
    const mask: { x: number; y: number; rgb: number[] }[] = [];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const p = pixel(props, source.mushroom.x + x, source.mushroom.y + y); if (p[3]) mask.push({ x, y, rgb: p }); }
    let best = -1, centerY = 0;
    for (let cy = 171; cy <= 177; cy++) {
      let matched = 0; for (const point of mask) if (close(pixel(actual, anchor + 26 + point.x, cy - 32 + point.y), point.rgb)) matched++;
      if (matched > best) { best = matched; centerY = cy; }
    }
    return { ...empty, canopyProof, propProof, groundProof, exposedProof,
      mushroom: { ratio: best / mask.length, centerY, inkPixels: mask.length, checksum: hash({ x: anchor + 48, y: 162, w: 20, h: 25 }) } };
  }, { capture, source, fallback, recipe: RECIPE });
  return { ...capture, ...measured };
}
async function sample(page: Page, source: Sources, state: Recorder, label: string) {
  const value = await observe(page, source, state.anchor); state.anchor = value.anchor ?? state.anchor; state.latest = value;
  const { at, hero, surface, anchor, rulePixels, mushroom, canopyProof, propProof, groundProof, exposedProof } = value;
  state.rows.push({ label, at, hero, surface, anchor, rulePixels, mushroom, canopyProof, propProof, groundProof, exposedProof });
  expect(value.opaqueRatio).toBeGreaterThan(0.99); return value;
}
async function until(page: Page, source: Sources, state: Recorder, label: string, accept: (value: Observation) => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout;
  do { const value = await sample(page, source, state, label); if (accept(value)) return value; await page.waitForTimeout(35); } while (Date.now() < deadline);
  throw new Error(`Missing observed phase: ${label}`);
}
function hero(value: Observation): Hero { if (!value.hero || value.hero.count < 20) throw new Error('Missing live Clawd pixel positive control'); return value.hero; }
function anchor(value: Observation): number { if (value.anchor === null) throw new Error('No observed canopy anchor'); return value.anchor; }
function positive(proof: Proof | null, minimumEvidence: number) {
  expect(proof).not.toBeNull(); if (!proof) throw new Error('Missing native source proof');
  expect(proof.pixels).toBeGreaterThan(0); expect(proof.matched / proof.pixels).toBeGreaterThanOrEqual(0.98);
  expect(proof.evidence).toBeGreaterThanOrEqual(minimumEvidence); expect(proof.evidenceMatched / proof.evidence).toBeGreaterThanOrEqual(0.98);
}
function mushroomPresent(value: Observation) {
  expect(value.mushroom).not.toBeNull(); expect(value.mushroom?.inkPixels).toBeGreaterThan(50); expect(value.mushroom?.ratio).toBeGreaterThanOrEqual(0.98);
}
async function png(info: TestInfo, name: string, value: Observation) {
  const path = info.outputPath(`${name}.png`); await writeFile(path, Buffer.from(value.png.split(',')[1], 'base64'));
  await info.attach(name, { path, contentType: 'image/png' });
}
async function timeline(info: TestInfo, name: string, state: Recorder) {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify({ provenance: 'legal checkpoint fixture, normal input, no fresh traversal claim', expectedMechanismMs: { inversion: 1700, fragileWarning: 750 }, recipe: RECIPE, samples: state.rows }, null, 2));
  await info.attach(name, { path, contentType: 'application/json' });
}

test('checkpoint-1 fixture: native mushroom pickup, real inversion and actual fragile collapse by normal input', async ({ page }, info) => {
  test.setTimeout(60000); await page.setViewportSize({ width: 1280, height: 720 });
  const observed = watch(page), source = await sources(), state = recorder();
  try {
    const { attempt } = await fixture(page, 1);
    await page.keyboard.press('e');
    const exposed = await until(page, source, state, 'real-E-core', value => (value.core?.count ?? 0) > 30);
    await png(info, 'environment-cp1-E-core', exposed);
    await page.keyboard.down('Space');
    try {
      await page.waitForTimeout(150);
      const aimed = await until(page, source, state, 'jump-for-one-core-shot', value => !!value.hero && value.hero.meanY < 245 && (value.core?.count ?? 0) > 30, 1000);
      if (!aimed.core) throw new Error('Lost observed E core');
      const box = await page.locator('canvas').boundingBox(); if (!box) throw new Error('No actual canvas rectangle');
      //80ms survives ordinary render cadence but remains below the real185ms fire interval.
      await page.mouse.click(box.x + aimed.core.x / 640 * box.width, box.y + aimed.core.y / 360 * box.height, { delay: 80 });
    } finally { await page.keyboard.up('Space'); }
    await expect(page.locator('.runtime-log')).toContainText('核心节点已击破');
    await until(page, source, state, 'ground-reset', value => !!value.hero && value.hero.meanY > 285, 2500);
    // Three actual forward enemies, six TOK each. No HP setters or forced kills.
    await page.keyboard.down('j');
    try { await expect.poll(async () => (await hud(page)).tokens, { timeout: 6000, intervals: [80, 100] }).toBeGreaterThanOrEqual(18); }
    finally { await page.keyboard.up('j'); }
    await page.waitForTimeout(1600); // Actual projectile lifetime, not a substituted clock.
    const before = await until(page, source, state, 'source-art-after-natural-E-expiry', value => value.surface === 'ordinary' && (value.mushroom?.ratio ?? 0) >= 0.98 && (value.hero?.meanY ?? 0) > 285, 5000);
    mushroomPresent(before); positive(before.canopyProof, 150); positive(before.propProof, 100); positive(before.groundProof, 150);
    const baseline = await hud(page); expect(baseline.doom).toBe(64); expect(baseline.hp).toBeGreaterThan(0);
    await png(info, 'environment-cp1-before-mushroom', before);

    await page.keyboard.down('d'); await page.keyboard.down('Space');
    try { await page.waitForTimeout(500); } finally { await page.keyboard.up('Space'); await page.keyboard.up('d'); }
    const ledge = await until(page, source, state, 'actual-insight-ledge', value => !!value.hero && value.hero.meanY > 215 && value.hero.meanY < 265, 1500);
    await page.waitForTimeout(130); const settled = await sample(page, source, state, 'insight-ledge-stable');
    expect(Math.abs(hero(settled).meanY - hero(ledge).meanY)).toBeLessThan(6); expect(hero(before).meanY - hero(settled).meanY).toBeGreaterThan(40);
    // Release each bounded key pulse BEFORE asynchronous pixel decoding; otherwise protocol
    // latency can keep D held beyond this narrow real ledge. No repositioning or retry seed.
    let launch = settled;
    for (let pulse = 0; pulse < 12; pulse++) {
      const gap = anchor(launch) - hero(launch).meanX;
      if (gap >= 60 && gap <= 80) break;
      const key = gap > 80 ? 'd' : 'a';
      await page.keyboard.down(key);
      try { await page.waitForTimeout(Math.min(60, Math.max(18, Math.abs(gap - 70) / 190 * 1000))); }
      finally { await page.keyboard.up(key); }
      await page.waitForTimeout(80); launch = await sample(page, source, state, 'bounded-pulse-to-launch');
    }
    launch = await sample(page, source, state, 'second-jump-launch');
    expect(anchor(launch) - hero(launch).meanX).toBeGreaterThan(40); expect(anchor(launch) - hero(launch).meanX).toBeLessThan(85);
    expect(hero(launch).meanY).toBeLessThan(265);

    let pickup: Observation | null = null;
    await page.keyboard.down('d'); await page.keyboard.down('Space');
    try {
      const deadline = Date.now() + 1200;
      do {
        const value = await sample(page, source, state, 'second-jump-observed');
        // Stop at actual source-art disappearance instead of waiting for the5Hz HUD.
        // Doom+28/TOK+8 and the entire inversion/landing sequence are still asserted below.
        if ((value.mushroom?.ratio ?? 1) < 0.15 && value.hero && value.anchor !== null && value.hero.meanX > value.anchor + 15) { pickup = value; break; }
        await page.waitForTimeout(20);
      } while (Date.now() < deadline);
    } finally { await page.keyboard.up('Space'); await page.keyboard.up('d'); }
    if (!pickup) throw new Error('Normal input did not reach the actual mushroom; no teleport/reseed fallback');
    await expect(page.locator('.mission-console .objective')).toContainText('重力反转');
    await expect.poll(async () => (await hud(page)).doom).toBe(92);
    await expect.poll(async () => (await hud(page)).tokens).toBe(baseline.tokens + 8);
    expect((await hud(page)).doom - baseline.doom).toBe(28);
    await png(info, 'environment-cp1-actual-pickup', pickup);

    let ceiling: Observation | null = null, recovery: Observation | null = null, warned: Observation | null = null;
    let ceilingLastAt = 0;
    const motionDeadline = Date.now() + 6000;
    do {
      const value = await sample(page, source, state, 'inversion-and-normal-return');
      if (!value.hero) continue; // Real hurt flash is not movement evidence.
      if (value.hero.meanY < 35) {
        if (!ceiling) {
          ceiling = value; await png(info, 'environment-cp1-inverted-ceiling', value);
          const uiPath = info.outputPath('environment-cp1-ceiling-real-ui.png');
          await page.screenshot({ path: uiPath }); await info.attach('environment-cp1-ceiling-real-ui', { path: uiPath, contentType: 'image/png' });
        }
        ceilingLastAt = value.at;
      }
      if (ceiling && !recovery && value.hero.meanY > hero(ceiling).meanY + 45) recovery = value;
      if (value.surface === 'warning') {
        expect(ceiling).not.toBeNull(); expect(recovery).not.toBeNull(); expect(value.hero.meanY).toBeGreaterThan(160); expect(value.hero.meanY).toBeLessThan(205);
        warned = value; break;
      }
      await page.waitForTimeout(25);
    } while (Date.now() < motionDeadline);
    if (!ceiling || !recovery || !warned) throw new Error('Missing actual rise/ceiling/recovery/normal-landing warning sequence');
    expect(hero(pickup).meanY - hero(ceiling).meanY).toBeGreaterThan(60);
    expect(ceilingLastAt - ceiling.at).toBeGreaterThan(500);
    // Sampled motion windows, not a hidden simulation-clock reading.
    expect(recovery.at - pickup.at).toBeGreaterThan(1100); expect(recovery.at - pickup.at).toBeLessThan(3500);
    expect(ceiling.mushroom?.ratio).toBeLessThan(0.15); expect(warned.mushroom?.ratio).toBeLessThan(0.15);
    positive(ceiling.propProof, 100); positive(ceiling.groundProof, 150);
    await expect(page.locator('.mission-console .objective')).toContainText('脚下裂纹平台'); expect(warned.rulePixels).toBeGreaterThan(180);
    await png(info, 'environment-cp1-real-fragile-warning', warned);

    let gone: Observation | null = null, lastWarning = warned.at;
    const collapseDeadline = Date.now() + 2500;
    do {
      const value = await sample(page, source, state, 'warning-to-actual-removal');
      if (value.surface === 'warning') lastWarning = value.at;
      if (value.surface === 'absent' && value.exposedProof && value.exposedProof.matched / value.exposedProof.pixels >= 0.98) { gone = value; break; }
      await page.waitForTimeout(25);
    } while (Date.now() < collapseDeadline);
    if (!gone) throw new Error('No actual native surface removal with a nonempty background control');
    expect(lastWarning - warned.at).toBeGreaterThan(400); expect(gone.at - warned.at).toBeLessThan(1800);
    positive(gone.exposedProof, 100); positive(gone.propProof, 100); positive(gone.groundProof, 150);
    await png(info, 'environment-cp1-platform-actually-gone', gone);
    const landed = await until(page, source, state, 'safe-real-ground-after-collapse', value => !!value.hero && Math.abs(value.hero.meanY - hero(before).meanY) < 3 && value.surface === 'absent', 2500);
    await page.waitForTimeout(160); const safe = await sample(page, source, state, 'safe-ground-stable');
    expect(Math.abs(hero(safe).meanY - hero(landed).meanY)).toBeLessThan(6); expect(hero(safe).meanY - hero(warned).meanY).toBeGreaterThan(80);
    expect((await hud(page)).hp).toBeGreaterThan(0); expect((await stored(page)).runId).toBe(attempt.runId);
    await expect(page.getByRole('region', { name: '本局成绩上传', exact: true })).toHaveCount(0);
    await png(info, 'environment-cp1-safe-real-ground', safe);
    expect([...observed.loaded].sort()).toEqual([...RESOURCE_PATHS].sort()); expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  } finally {
    await release(page);
    if (state.latest) await png(info, 'environment-cp1-last-native-observation', state.latest);
    await timeline(info, 'environment-cp1-normal-input-timeline', state);
  }
});

test('saved-open-rest checkpoint-11 fixture: raw native regions freeze, then actual Continue resumes mushroom bob', async ({ page }, info) => {
  test.setTimeout(30000); await page.setViewportSize({ width: 1280, height: 720 });
  const observed = watch(page), source = await sources(), state = recorder();
  try {
    const { attempt } = await fixture(page, 11, 80); // Saved room, NOT walked entry or token transaction.
    const dialog = page.getByRole('dialog', { name: '安全休息室 / HUMAN RATER', exact: true }); await expect(dialog).toBeVisible();
    const before = await sample(page, source, state, 'restored-saved-rest-positive-controls');
    mushroomPresent(before); positive(before.canopyProof, 150); positive(before.propProof, 100); positive(before.groundProof, 150);
    const beforeHud = await hud(page), beforeSave = await stored(page); expect(beforeSave).toEqual(attempt);
    await png(info, 'environment-saved-rest-before', before);
    await page.waitForTimeout(2300); const frozen = await sample(page, source, state, 'saved-rest-frozen-over-two-seconds');
    await expect(dialog).toBeVisible(); mushroomPresent(frozen); positive(frozen.canopyProof, 150); positive(frozen.propProof, 100); positive(frozen.groundProof, 150);
    expect(frozen.anchor).toBe(before.anchor); expect(frozen.mushroom?.checksum).toBe(before.mushroom?.checksum); expect(frozen.mushroom?.centerY).toBe(before.mushroom?.centerY);
    expect(frozen.canopyProof?.checksum).toBe(before.canopyProof?.checksum); expect(frozen.propProof?.checksum).toBe(before.propProof?.checksum); expect(frozen.groundProof?.checksum).toBe(before.groundProof?.checksum);
    expect(await hud(page)).toEqual(beforeHud); expect(await stored(page)).toEqual(beforeSave);
    await png(info, 'environment-saved-rest-frozen', frozen);
    await dialog.getByRole('button', { name: '不再交易，继续前进', exact: true }).click(); await expect(dialog).toHaveCount(0);
    await expect.poll(async () => (await stored(page)).checkpoint).toBe(1);
    expect(await stored(page)).toEqual({ ...attempt, checkpoint: 1 });
    const resumed = await until(page, source, state, 'real-continue-resumes-native-bob', value => (value.mushroom?.ratio ?? 0) >= 0.98 && value.mushroom?.centerY !== frozen.mushroom?.centerY, 1500);
    mushroomPresent(resumed); positive(resumed.canopyProof, 150); positive(resumed.propProof, 100); positive(resumed.groundProof, 150);
    expect(resumed.canopyProof?.checksum).toBe(before.canopyProof?.checksum); expect(resumed.propProof?.checksum).toBe(before.propProof?.checksum); expect(resumed.groundProof?.checksum).toBe(before.groundProof?.checksum);
    await expect.poll(async () => (await hud(page)).clock, { timeout: 2000 }).not.toBe(beforeHud.clock);
    expect((await stored(page)).runId).toBe(attempt.runId); expect((await hud(page)).tokens).toBe(80);
    await png(info, 'environment-saved-rest-actual-continue', resumed);
    expect([...observed.loaded].sort()).toEqual([...RESOURCE_PATHS].sort()); expect(observed.errors).toEqual([]); expect(observed.writes).toEqual([]);
  } finally {
    await release(page);
    if (state.latest) await png(info, 'environment-saved-rest-last-native-observation', state.latest);
    await timeline(info, 'environment-saved-rest-observation-timeline', state);
  }
});
