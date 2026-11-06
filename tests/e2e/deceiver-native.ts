import { expect, type Page, type TestInfo } from '@playwright/test';
import { createDeceiverJumpCapture, decodeDeceiverFault } from './deceiver-controls';
import { withCleanup } from './factory-navigation';
export type { DeceiverAimFrame, DeceiverCapturedFrame } from './deceiver-controls';

interface Shot { x: number; y: number; width: number; height: number; count: number }
export interface DeceiverFrame {
  at: number; sampledAt: number; png: string; hud: string[]; notice: string;
  rect: { x: number; y: number; width: number; height: number };
  pixels: { purple: number; ivory: number; coreCount: number; coreX: number | null; coreY: number | null; coreWidth: number;
    heroCount: number; heroX: number | null; heroY: number | null; shots: Shot[] };
}
interface PointerEdge { type: string; at: number; trusted: boolean; button: number; target: string; x: number; y: number }
/** Public native canvas only. No Phaser instance, World getter, clock replacement or input injection. */
export async function deceiverRecording(page: Page, duration = 900) {
  expect(Number.isFinite(duration) && duration >= 0 && duration <= 1500).toBe(true);
  return page.evaluateHandle(ms => {
    const capture = new Promise<{ frames: DeceiverFrame[]; edges: PointerEdge[] }>((resolve, reject) => {
    const canvas = document.querySelector('canvas');
    if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Actual640x360 required');
    const copy = document.createElement('canvas'); copy.width = 640; copy.height = 360;
    const ctx = copy.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('Native copy context required');
    const frames: DeceiverFrame[] = [], edges: PointerEdge[] = [];
    const edge = (e: PointerEvent) => edges.push({ type: e.type, at: performance.now(), trusted: e.isTrusted, button: e.button,
      target: e.target instanceof HTMLElement ? e.target.tagName : '', x: e.clientX, y: e.clientY });
    for (const type of ['pointerdown', 'pointerup'] as const) window.addEventListener(type, edge, { capture: true, passive: true });
    const clean = () => { for (const type of ['pointerdown', 'pointerup'] as const) window.removeEventListener(type, edge, true); };
    let start: number | null = null;
    const take = (at: number) => {
      try {
        start ??= at; const sampledAt = performance.now(); ctx.clearRect(0, 0, 640, 360); ctx.drawImage(canvas, 0, 0);
        const rgba = ctx.getImageData(0, 0, 640, 360).data;
        let purple = 0, ivory = 0, coreCount = 0, cx = 0, cy = 0, minX = Infinity, maxX = -Infinity, heroCount = 0, hx = 0, hy = 0;
        const orange = new Set<number>();
        for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
          const i = (y * 640 + x) * 4; if (rgba[i + 3] !== 255) continue;
          const rgb = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
          if (rgb === 0xd97757) { heroCount++; hx += x; hy += y; }
          if (rgb === 0xf3aa78 && x >= 150 && x < 430 && y >= 100 && y < 320) orange.add(y * 640 + x);
          if (x < 300 || x >= 430 || y < 185 || y >= 270) continue;
          if (rgb === 0x723f68) purple++; if (rgb === 0xf5e8c8) ivory++;
          if (rgb === 0xfb886f) { coreCount++; cx += x; cy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
        }
        const shots: Shot[] = [];
        while (orange.size) {
          const first = orange.values().next().value!; orange.delete(first); const queue = [first], xs: number[] = [], ys: number[] = [];
          while (queue.length) {
            const p = queue.pop()!, x = p % 640, y = Math.floor(p / 640); xs.push(x); ys.push(y);
            for (const next of [p - 1, p + 1, p - 640, p + 640]) if (orange.delete(next)) queue.push(next);
          }
          const width = Math.max(...xs) - Math.min(...xs) + 1, height = Math.max(...ys) - Math.min(...ys) + 1;
          if (width >= 4 && width <= 9 && height >= 4 && height <= 9 && xs.length >= 12 && xs.length <= 50)
            shots.push({ x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length, width, height, count: xs.length });
        }
        const rect = canvas.getBoundingClientRect();
        frames.push({ at, sampledAt, png: copy.toDataURL('image/png'), hud: [...document.querySelectorAll('.hud-cell')].map(n => n.textContent ?? ''),
          notice: document.querySelector('.runtime-log')?.textContent ?? '', rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          pixels: { purple, ivory, coreCount, coreX: coreCount ? cx / coreCount : null, coreY: coreCount ? cy / coreCount : null,
            coreWidth: coreCount ? maxX - minX + 1 : 0, heroCount, heroX: heroCount ? hx / heroCount : null, heroY: heroCount ? hy / heroCount : null, shots } });
        if (at - start >= ms) { clean(); resolve({ frames, edges }); } else requestAnimationFrame(take);
      } catch (error) { clean(); reject(error); }
    }; requestAnimationFrame(take);
    });
    // A handle ACK arrives after passive listeners are installed. Settle immediately: no unhandled rejection while the game assertion runs.
    return { proof: capture.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error: error instanceof Error ? error.stack ?? error.message : String(error) })) };
  }, duration);
}
export async function finishDeceiverRecording(recording: Awaited<ReturnType<typeof deceiverRecording>>) {
  let result: { frames: DeceiverFrame[]; edges: PointerEdge[] } | null = null, primary: unknown; let failed = false;
  try { const settled = await recording.evaluate(value => value.proof); if (!settled.ok) throw Error(settled.error); result = settled.value; }
  catch (error) { failed = true; primary = error; }
  try { await recording.dispose(); } catch (error) {
    if (failed) throw Object.assign(Error(`Capture failed: ${String(primary)}; handle disposal also failed: ${String(error)}`), { primary, disposalError: error });
    throw error;
  }
  if (failed) throw primary;
  return result!;
}
export async function deceiverFrames(page: Page, duration = 0) { return finishDeceiverRecording(await deceiverRecording(page, duration)); }
export const deceiverFrame = async (page: Page) => (await deceiverFrames(page)).frames[0];
export const nativeBytes = (frame: DeceiverFrame) => Buffer.from(frame.png.split(',')[1], 'base64');
export async function keepDeceiverFrames(info: TestInfo, label: string, frames: DeceiverFrame[]) {
  for (let i = 0; i < frames.length; i++) await info.attach(`${label}-${i.toString().padStart(3, '0')}`, { body: nativeBytes(frames[i]), contentType: 'image/png' });
  await info.attach(label + '-observations', { body: JSON.stringify(frames.map(f => ({ at: f.at, sampledAt: f.sampledAt, hud: f.hud, notice: f.notice, rect: f.rect, pixels: f.pixels }))), contentType: 'application/json' });
}

/** Install and check the one observer before Space; no frame is sampled at construction. */
export async function prepareDeceiverJump(page: Page) {
  const recording = await page.evaluateHandle(createDeceiverJumpCapture, undefined);
  try {
    const setup = await recording.evaluate(value => value.setup);
    if (!setup.ok) throw decodeDeceiverFault(setup.error);
    return recording;
  } catch (error) {
    return withCleanup(async () => { throw error; }, () => recording.dispose());
  }
}
export async function nextDeceiverJumpFrame(recording: Awaited<ReturnType<typeof prepareDeceiverJump>>) {
  const result = await recording.evaluate(value => value.nextWire());
  if (!result.ok) throw decodeDeceiverFault(result.error);
  return result.value;
}
export async function finishDeceiverJump(recording: Awaited<ReturnType<typeof prepareDeceiverJump>>) {
  return withCleanup(async () => {
    const result = await recording.evaluate(value => value.finishWire());
    if (!result.ok) throw decodeDeceiverFault(result.error);
    return { ...result.value, failure: result.failure ? { primary: decodeDeceiverFault(result.failure) } : null,
      cleanupFailures: result.cleanupFailures.map(e => ({ phase: e.phase, error: decodeDeceiverFault(e.error) })) };
  }, () => recording.dispose());
}
