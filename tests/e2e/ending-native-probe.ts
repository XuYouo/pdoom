import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { hudPng, type Raster } from './mirror-hud-pixels';

export type NativeEnding = 'aligned' | 'warden' | 'foom';
export interface NativeBox { x: number; y: number; width: number; height: number }
const sceneBytes = readFileSync(resolve('assets/candidates/ending-scenes/ending-scenes.png'));
const clipBytes = readFileSync(resolve('public/game/ending-clips.png'));
const scene = hudPng(sceneBytes), clips = hudPng(clipBytes);
const sourceHash = createHash('sha256').update(sceneBytes).digest('hex');
const index = { aligned: 0, warden: 1, foom: 2 } as const;
/** At most floor/ceil DOM-origin registration; no resized reference, colour tolerance or dropped source pixels. */
function exactPixels(actual: Raster, box: NativeBox, source: Raster, rect: { x: number; y: number; width: number; height: number }, scale: number, opaqueOnly = false) {
  assert(scale === 1 || scale === 2, 'Only native integer1x/2x');
  assert.equal(box.width, rect.width * scale, 'Actual CSS width'); assert.equal(box.height, rect.height * scale, 'Actual CSS height');
  assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= actual.width && box.y + box.height <= actual.height, 'Native rectangle clipped by viewport');
  const xs = [...new Set([Math.floor(box.x), Math.ceil(box.x)])], ys = [...new Set([Math.floor(box.y), Math.ceil(box.y)])];
  for (const y0 of ys) for (const x0 of xs) {
    let matched = 0, required = 0;
    for (let y = 0; y < rect.height * scale; y++) for (let x = 0; x < rect.width * scale; x++) {
      const s = ((rect.y + Math.floor(y / scale)) * source.width + rect.x + Math.floor(x / scale)) * 4;
      if (opaqueOnly && source.rgba[s + 3] === 0) continue;
      required++;
      const a = ((y0 + y) * actual.width + x0 + x) * 4;
      if (x0 + x < actual.width && y0 + y < actual.height && actual.rgba.subarray(a, a + 4).equals(source.rgba.subarray(s, s + 4))) matched++;
    }
    if (matched === required && required > 0) return { x: x0, y: y0, matchedPixels: matched, requiredPixels: required, scale };
  }
  throw Error('Native ending RGBA mismatch; no tolerance or absent-frame fallback');
}
export function assertNativeEnding(actual: Raster, box: NativeBox, kind: NativeEnding, scale: number) {
  return exactPixels(actual, box, scene, { x: index[kind] * 256, y: 0, width: 256, height: 128 }, scale);
}
export async function captureNativeEnding(page: Page, info: TestInfo, kind: NativeEnding, scale: 1 | 2, label: string, verifyClips = true) {
  const main = page.locator('.ending-native-main'); await expect(main).toHaveAttribute('data-art-state', 'ready');
  const frame = main.locator(':scope > .ending-native-crop'); await expect(frame).toBeInViewport({ ratio: 1 });
  expect(await main.locator('img').evaluate(n => {
    if (!(n instanceof HTMLImageElement)) throw Error('Expected actual native image');
    return { complete: n.complete, natural: [n.naturalWidth, n.naturalHeight], rendering: getComputedStyle(n).imageRendering, transform: getComputedStyle(n).transform };
  }))
    .toEqual({ complete: true, natural: [768, 128], rendering: 'pixelated', transform: 'none' });
  const clipBoxes: NativeBox[] = [];
  if (kind === 'foom' && verifyClips) {
    await expect(page.locator('.ending-clip-cloud')).toHaveAttribute('data-art-state', 'ready');
    await expect(page.locator('.ending-paperclips span')).toHaveCount(24);
    await expect.poll(() => page.locator('.ending-paperclips img').evaluateAll(nodes => nodes.every(n => n instanceof HTMLImageElement && n.complete && n.naturalWidth === 256 && n.naturalHeight === 128))).toBe(true);
    await expect.poll(() => page.locator('.ending-stage').evaluate(n => n.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length)).toBe(0);
    clipBoxes.push(...await page.locator('.ending-paperclips span').evaluateAll(nodes => nodes.map(n => {
      const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height };
    })));
  }
  const box = await frame.boundingBox(); assert(box);
  const screenshot = info.outputPath(`${label}.png`);
  const bytes = await page.screenshot({ path: screenshot }), actual = hudPng(bytes);
  await info.attach(`${label}-rendered`, { path: screenshot, contentType: 'image/png' });
  const registration = assertNativeEnding(actual, box, kind, scale);
  const clipProof = clipBoxes.map(b => exactPixels(actual, b, clips, { x: 232, y: 96, width: 9, height: 17 }, b.width / 9, true));
  assert(clipProof.every(p => p.matchedPixels === 69 * p.scale * p.scale));
  // Memory-only negative controls: never save altered rasters as evidence.
  const broken = { ...actual, rgba: Buffer.from(actual.rgba) };
  broken.rgba[((registration.y + 68 * scale) * actual.width + registration.x + 128 * scale) * 4] ^= 1;
  assert.throws(() => assertNativeEnding(broken, box, kind, scale), /RGBA mismatch/);
  const wrong = kind === 'foom' ? 'aligned' : 'foom';
  assert.throws(() => assertNativeEnding(actual, box, wrong, scale), /RGBA mismatch/);
  const proof = { kind, box, registration, sourceHash, clipProof, allScenePixelsRequired: 32768 * scale * scale, zeroTolerance: true, negativeControls: ['one-channel corruption', 'wrong outcome'] };
  await info.attach(`${label}-pixel-proof`, { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
  return proof;
}
