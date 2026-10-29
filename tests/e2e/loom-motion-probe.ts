import type { Page } from '@playwright/test';

interface MotionProbe {
  frames: Array<{ time: number; x: number | null; line: number | null; count: number }>;
  keys: Array<{ time: number; type: string; code: string; keyCode: number; shift: boolean; alt: boolean; ctrl: boolean; meta: boolean; target: string }>;
  done: boolean;
}
interface MotionWindow extends Window { __loomMotion: MotionProbe }

/** Passive native event/frame observation. No Phaser instance, simulated coordinates or state writes. */
export async function armDashMotionProbe(page: Page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas'); if (!canvas) throw new Error('Missing canvas for motion evidence');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) throw new Error('Motion evidence requires the actual WebGL canvas');
    const probe: MotionProbe = { frames: [], keys: [], done: false };
    (window as unknown as MotionWindow).__loomMotion = probe;
    const bytes = new Uint8Array(canvas.width * canvas.height * 4);
    let started = false, start = 0;
    const record = (event: KeyboardEvent) => {
      if (probe.keys.length < 20) probe.keys.push({ time: performance.now(), type: event.type, code: event.code, keyCode: event.keyCode,
        shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey,
        target: event.target instanceof HTMLElement ? event.target.tagName : '' });
      if (!started && event.type === 'keydown' && event.keyCode === 16) {
        started = true; start = performance.now(); requestAnimationFrame(sample);
      }
    };
    const finish = () => {
      probe.done = true; window.removeEventListener('keydown', record, true); window.removeEventListener('keyup', record, true);
    };
    const sample = () => {
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      let left = canvas.width, right = 0, count = 0, lineX = 0, lineCount = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const color = bytes[i] * 65536 + bytes[i + 1] * 256 + bytes[i + 2];
        if (color === 0xd97757) { left = Math.min(left, x); right = Math.max(right, x); count++; }
        if (color === 0xf4d298 && (canvas.height - 1 - y) * 360 / canvas.height > 200) { lineX += x; lineCount++; }
      }
      probe.frames.push({ time: performance.now() - start, x: count ? (left + right) / 2 * 640 / canvas.width : null,
        line: lineCount ? lineX / lineCount * 640 / canvas.width : null, count });
      if (performance.now() - start < 600 && probe.frames.length < 40) requestAnimationFrame(sample); else finish();
    };
    window.addEventListener('keydown', record, { capture: true, passive: true });
    window.addEventListener('keyup', record, { capture: true, passive: true });
  });
}
export const readDashMotion = (page: Page) => page.evaluate(() => (window as unknown as MotionWindow).__loomMotion);
