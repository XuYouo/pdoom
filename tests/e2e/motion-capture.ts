import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
export interface MotionFrame { at: number; hp: number; clock: string; groundRow: number; groundChangedPixels: number; edgeCounts: number[] }
export interface MotionTrace { frames: MotionFrame[]; images: { index: number; png: string }[] }
/** Public canvas pixels + DOM only. No camera, World, Scene, clock or impact getters. */
export async function captureGroundMotion(page: Page, duration = 4500): Promise<MotionTrace> {
  assert(duration > 0 && duration <= 4500);
  return page.evaluate(ms => new Promise<MotionTrace>((resolve, reject) => {
    const source = document.querySelector('canvas');
    if (!source || source.width !== 640 || source.height !== 360) return reject(Error('Actual native640x360 canvas required'));
    const copy = document.createElement('canvas'); copy.width = 640; copy.height = 360;
    const context = copy.getContext('2d', { willReadFrequently: true }); if (!context) return reject(Error('Pixel reader unavailable'));
    const frames: MotionFrame[] = [], images: MotionTrace['images'] = [], rows = new Set<number>();
    let start: number | null = null, previousHp = 100, baseline: Uint8ClampedArray | null = null;
    const take = (at: number) => {
      try {
        start ??= at; context.drawImage(source, 0, 0);
        const rgba = context.getImageData(240, 310, 360, 22).data, edgeCounts: number[] = [];
        for (let y = 0; y < 20; y++) {
          let count = 0;
          for (let x = 0; x < 360; x++) {
            const i = (y * 360 + x) * 4, j = i + 360 * 4, k = j + 360 * 4;
            // Literal three-row native metal edge, measured from reviewed original PNG bytes; no tolerance.
            if (rgba[i] === 133 && rgba[i + 1] === 142 && rgba[i + 2] === 176 && rgba[j] === 87 && rgba[j + 1] === 92 && rgba[j + 2] === 121 && rgba[k] === 44 && rgba[k + 1] === 35 && rgba[k + 2] === 48) count++;
          }
          edgeCounts.push(count);
        }
        const row = edgeCounts.findIndex(count => count >= 240), groundRow = row < 0 ? -1 : 310 + row;
        const hp = Number.parseFloat(document.querySelector('.hud-cell strong')?.textContent ?? 'NaN');
        const floor = context.getImageData(240, 334, 360, 18).data; baseline ??= floor;
        let groundChangedPixels = 0;
        for (let i = 0; i < floor.length; i += 4) if (floor[i] !== baseline[i] || floor[i + 1] !== baseline[i + 1] || floor[i + 2] !== baseline[i + 2] || floor[i + 3] !== baseline[i + 3]) groundChangedPixels++;
        const frame = { at, hp, clock: document.querySelectorAll('.hud-cell')[3]?.textContent ?? '', groundRow, groundChangedPixels, edgeCounts };
        if (images.length < 12 && (frames.length === 0 || !rows.has(groundRow) || hp !== previousHp || at - start >= ms)) images.push({ index: frames.length, png: source.toDataURL('image/png') });
        frames.push(frame); rows.add(groundRow); previousHp = hp;
        if (at - start >= ms) resolve({ frames, images }); else requestAnimationFrame(take);
      } catch (error) { reject(error); }
    }; requestAnimationFrame(take);
  }), duration);
}
export function assertLiveDamage(trace: MotionTrace) {
  assert(trace.frames.length >= 80, 'Insufficient actual frames');
  assert(trace.frames.every(f => f.groundRow >= 310 && f.groundRow < 330), 'Cannot certify motion from a blank or missing landmark');
  assert(trace.frames.every(f => Number.isFinite(f.hp) && f.hp > 0), 'Live player and visible health required');
  assert(Math.min(...trace.frames.map(f => f.hp)) < trace.frames[0].hp, 'Require new real damage during this capture');
  assert.notEqual(trace.frames[0].clock, trace.frames.at(-1)!.clock, 'Core clock must keep advancing');
}
export function assertReducedTrace(trace: MotionTrace) {
  assertLiveDamage(trace); assert.equal(new Set(trace.frames.map(f => f.groundRow)).size, 1, 'Reduced mode still shifts the static ground vertically');
  assert(trace.frames.every(f => f.groundChangedPixels === 0), 'Reduced mode still changes the static ground pixels in either axis');
}
export async function attachMotion(info: TestInfo, label: string, trace: MotionTrace) {
  await info.attach(label + '-pixel-observations', { body: JSON.stringify({ frames: trace.frames, imageFrames: trace.images.map(i => i.index), source: 'actual native canvas and DOM only' }), contentType: 'application/json' });
  for (const image of trace.images) {
    const path = info.outputPath(`${label}-${image.index}.png`);
    await writeFile(path, Buffer.from(image.png.split(',')[1], 'base64'), { flag: 'wx' });
    await info.attach(`${label}-${image.index}`, { path, contentType: 'image/png' });
  }
}
