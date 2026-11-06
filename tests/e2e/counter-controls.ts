/** Test-only public raster observer; no engine, storage, clock or input mutation.
 * One rAF copy and analysis, without PNG encode/decode roundtrips while a key is held.
 * The optional rgba branch runs the exact scanner on synthetic unit data, NOT a browser proof.
 */
export interface ControlActor { x: number; y: number; left: number; top: number; w: number; h: number; n: number }
export interface ControlFloor { row: number; supported: number; gaps: { left: number; right: number }[] }
export interface ControlSample { at: number; actor: ControlActor | null; actors: number; floor: ControlFloor | null; opaque: number; readMs: number; dialog: string | null }
interface ControlOptions { floorSignatures: number[][]; rgba?: Uint8ClampedArray; at?: number }
/** Serializable callback: every runtime dependency is inside this function or a browser builtin. */
export async function sampleCounterControls(options: ControlOptions): Promise<ControlSample> {
  const inspect = (data: Uint8ClampedArray, at: number, dialog: string | null, started: number): ControlSample => {
    if (data.length !== 640 * 360 * 4 || !Number.isFinite(at)) throw Error('Native640x360 finite sample required');
    if (options.floorSignatures.some(s => s.length !== 4 || s.some(c => !Number.isInteger(c) || c < 0 || c > 0xffffff))) throw Error('Four opaque RGB rows required');
    let opaque = 0; for (let p = 3; p < data.length; p += 4) if (data[p] === 255) opaque++;
    if (opaque !== 640 * 360) throw Error('Opaque native frame required');
    const color = (x: number, y: number) => { const p = (y * 640 + x) * 4; return (data[p] << 16) | (data[p + 1] << 8) | data[p + 2]; };
    const seen = new Uint8Array(640 * 360), actors: ControlActor[] = [];
    for (let y = 100; y < 340; y++) for (let x = 0; x < 640; x++) {
      const id = y * 640 + x; if (seen[id] || color(x, y) !== 0xd97757) continue;
      const stack = [id]; seen[id] = 1; let left = x, right = x, top = y, bottom = y, n = 0, sx = 0, sy = 0;
      while (stack.length) {
        const p = stack.pop()!, xx = p % 640, yy = Math.floor(p / 640); n++; sx += xx; sy += yy;
        left = Math.min(left, xx); right = Math.max(right, xx); top = Math.min(top, yy); bottom = Math.max(bottom, yy);
        for (const [nx, ny] of [[xx - 1, yy], [xx + 1, yy], [xx, yy - 1], [xx, yy + 1]]) {
          if (nx < 0 || nx >= 640 || ny < 100 || ny >= 340) continue;
          const next = ny * 640 + nx; if (!seen[next] && color(nx, ny) === 0xd97757) { seen[next] = 1; stack.push(next); }
        }
      }
      const w = right - left + 1, h = bottom - top + 1;
      if (n >= 80 && w >= 14 && w <= 40 && h >= 12 && h <= 32) actors.push({ x: sx / n, y: sy / n, left, top, w, h, n });
    }
    // Exact four-row signature membership, same scan/tie/gap rules as the evidence decoder.
    const signatures = new Set(options.floorSignatures.map(s => s.join(':'))); let floor: ControlFloor | null = null;
    if (signatures.size) for (let row = 318; row <= 322; row++) {
      const mask = Array.from({ length: 640 }, (_, x) => signatures.has([0, 1, 2, 3].map(dy => color(x, row + dy)).join(':')));
      const supported = mask.filter(Boolean).length, gaps: { left: number; right: number }[] = [];
      for (let x = 0; x < 640; x++) if (!mask[x]) { const left = x; while (x < 640 && !mask[x]) x++; if (x - left >= 70 && x - left <= 160) gaps.push({ left, right: x }); }
      if (!floor || supported > floor.supported) floor = { row, supported, gaps };
    }
    return { at, actor: actors.length === 1 ? actors[0] : null, actors: actors.length, floor, opaque, readMs: performance.now() - started, dialog };
  };
  if (options.rgba) return inspect(options.rgba, options.at ?? 0, null, performance.now());
  return new Promise((resolve, reject) => requestAnimationFrame(at => {
    try {
      const started = performance.now(), source = document.querySelector('canvas');
      if (!source || source.width !== 640 || source.height !== 360) throw Error('Native640x360 canvas missing');
      const copy = document.createElement('canvas'); copy.width = 640; copy.height = 360;
      const ctx = copy.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('Public raster readback unavailable');
      ctx.drawImage(source, 0, 0);
      resolve(inspect(ctx.getImageData(0, 0, 640, 360).data, at, document.querySelector('dialog[open] h2')?.textContent ?? null, started));
    } catch (error) { reject(error); }
  }));
}
/** Interior aim band, not a replacement for the original end-position170..220 guard. */
export function counterApproach(x: number): 'a' | 'd' | null {
  if (!Number.isFinite(x)) throw Error('A finite public actor position is required');
  return x < 184 ? 'd' : x > 202 ? 'a' : null;
}

interface CounterCleanupAction { name: string; run: () => Promise<unknown> }
/** Preserve even a falsy primary rejection; every cleanup is attempted independently.
 * Diagnostics are also copied to TestInfo annotations by the spec, so attachment failure is visible.
 * Plain Error is intentional: this project retains its ES2020 lib, not AggregateError.
 */
export async function withCounterCleanup(work: () => Promise<void>, cleanup: CounterCleanupAction[], diagnostics: string[]): Promise<void> {
  let primary: unknown, hasPrimary = false;
  try { await work(); } catch (error) { primary = error; hasPrimary = true; }
  const failures: string[] = [];
  for (const action of cleanup) {
    try { await action.run(); } catch (error) {
      const message = `${action.name}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
      failures.push(message); diagnostics.push(message);
    }
  }
  if (hasPrimary) throw primary;
  if (failures.length) throw new Error(`Counter cleanup failed:\n${failures.join('\n')}`);
}

interface CounterMotionPort<Raw, Frame> {
  read: () => Promise<Raw>;
  gap: () => Promise<void>;
  inspect: (raw: Raw) => Promise<Frame>;
}
/** Fixed first pair only: capture both public raws before classification can delay the second.
 * No predicate, retries, coordinate adjustment or input/world access. The spec owns the original40ms gap.
 */
export async function sampleCounterMotion<Raw, Frame>(port: CounterMotionPort<Raw, Frame>): Promise<{ frame: Frame; later: Frame }> {
  const firstRaw = await port.read();
  await port.gap();
  const laterRaw = await port.read();
  const frame = await port.inspect(firstRaw);
  const later = await port.inspect(laterRaw);
  return { frame, later };
}
