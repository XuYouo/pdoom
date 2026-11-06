import type { DeceiverFrame } from './deceiver-native';
export type DeceiverAimFrame = Omit<DeceiverFrame, 'png'> & { captureId: number };
export type DeceiverCapturedFrame = DeceiverAimFrame & { png: string };
export interface DeceiverPointerEdge { type: string; at: number; trusted: boolean; button: number; target: string; x: number; y: number }
export interface DeceiverCapturePort {
  raf(take: (at: number) => void): number;
  cancel(id: number): void;
  read(at: number): Omit<DeceiverFrame, 'pixels' | 'png'> & { rgba: Uint8ClampedArray };
  listen(take: (edge: DeceiverPointerEdge) => void): () => void;
  encode(rgba: Uint8ClampedArray): string;
}
/** Self-contained for Playwright serialization. No runtime import, engine state, or input injection.
 * One requested approach RAF, then one automatic shot chain; PNG encoding only after that chain stops.
 * The optional narrow port is for deterministic contracts of this actual implementation.
 */
export interface DeceiverFault {
  tag: 'undefined' | 'null' | 'number' | 'boolean' | 'string' | 'bigint' | 'opaque' | 'error' | 'object' | 'array';
  value?: string | boolean; name?: string; message?: string; stack?: string;
  fields?: Record<string, DeceiverFault>; items?: DeceiverFault[];
}
export type DeceiverWire<T> = { ok: true; value: T } | { ok: false; error: DeceiverFault };
export interface DeceiverJumpProof {
  approach: DeceiverCapturedFrame[]; frames: DeceiverCapturedFrame[]; edges: DeceiverPointerEdge[]; problems: string[];
  failure: { primary: unknown } | null; cleanupFailures: { phase: string; error: unknown }[];
  budget: { firstAt: number | null; selectedId: number | null; shotStart: number | null; shotEnd: number | null;
    approachFrames: number; shotFrames: number; approachLimit: number; approachMs: number; shotMs: number; shotSafetyCap: number };
}
export type DeceiverFinishWire = { ok: false; error: DeceiverFault } | { ok: true;
  value: Omit<DeceiverJumpProof, 'failure' | 'cleanupFailures'>; failure: DeceiverFault | null; cleanupFailures: { phase: string; error: DeceiverFault }[] };
export interface DeceiverJumpCapture {
  setup: DeceiverWire<null>; next(): Promise<DeceiverAimFrame>; finish(): Promise<DeceiverJumpProof>; cancel(): void;
  nextWire(): Promise<DeceiverWire<DeceiverAimFrame>>; finishWire(): Promise<DeceiverFinishWire>;
}
export function createDeceiverJumpCapture(port?: DeceiverCapturePort): DeceiverJumpCapture {
  // Never throw an extended Error through evaluate: Playwright strips custom fields.
  function fault(value: unknown, seen = new Set<unknown>(), depth = 0): DeceiverFault {
    if (value === undefined) return { tag: 'undefined' };
    if (value === null) return { tag: 'null' };
    if (typeof value === 'boolean') return { tag: 'boolean', value };
    if (typeof value === 'string') return { tag: 'string', value };
    if (typeof value === 'number') return { tag: 'number', value: Object.is(value, -0) ? '-0' : String(value) };
    if (typeof value === 'bigint') return { tag: 'bigint', value: String(value) };
    if (typeof value !== 'object') return { tag: 'opaque', value: String(value) };
    if (depth >= 8 || seen.size >= 128 || seen.has(value)) return { tag: 'opaque', value: '[bounded/circular error detail]' };
    const path = new Set(seen); path.add(value);
    if (Array.isArray(value)) return { tag: 'array', items: value.slice(0, 64).map(v => fault(v, path, depth + 1)) };
    const isError = value instanceof Error || ['[object Error]', '[object DOMException]'].includes(Object.prototype.toString.call(value));
    const e = value as Error;
    const result: DeceiverFault = isError ? { tag: 'error', name: e.name, message: e.message, stack: e.stack } : { tag: 'object' };
    result.fields = {};
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value)).slice(0, 64)) {
      if (isError && ['name', 'message', 'stack'].includes(name)) continue;
      if ('value' in descriptor) Object.defineProperty(result.fields, name, { value: fault(descriptor.value, path, depth + 1), enumerable: true });
    }
    return result;
  }
  try {
    if (!port) {
      const canvas = document.querySelector('canvas');
      if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Actual640x360 required');
      const copy = document.createElement('canvas'); copy.width = 640; copy.height = 360;
      const ctx = copy.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('Native copy context required');
      port = {
        raf: take => requestAnimationFrame(take), cancel: id => cancelAnimationFrame(id),
        read: at => {
          const sampledAt = performance.now(); ctx.clearRect(0, 0, 640, 360); ctx.drawImage(canvas, 0, 0);
          const rgba = ctx.getImageData(0, 0, 640, 360).data, rect = canvas.getBoundingClientRect();
          return { at, sampledAt, rgba, hud: [...document.querySelectorAll('.hud-cell')].map(n => n.textContent ?? ''),
            notice: document.querySelector('.runtime-log')?.textContent ?? '', rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
        },
        listen: take => {
          const edge = (e: PointerEvent) => take({ type: e.type, at: performance.now(), trusted: e.isTrusted, button: e.button,
            target: e.target instanceof HTMLElement ? e.target.tagName : '', x: e.clientX, y: e.clientY });
          const remove = () => {
            const errors: unknown[] = [];
            for (const type of ['pointerdown', 'pointerup'] as const) try { window.removeEventListener(type, edge, true); } catch (error) { errors.push(error); }
            if (errors.length) throw Object.assign(Error(errors.map(String).join('; ')), { causes: errors });
          };
          try { for (const type of ['pointerdown', 'pointerup'] as const) window.addEventListener(type, edge, { capture: true, passive: true }); }
          catch (error) { try { remove(); } catch (cleanup) { throw Object.assign(Error(String(error) + '; listener cleanup: ' + String(cleanup)), { cause: error, cleanupError: cleanup }); } throw error; }
          return remove;
        },
        encode: rgba => { ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), 640, 360), 0, 0); return copy.toDataURL('image/png'); },
      };
    }
    const io = port;
    type Stored = { geometry: DeceiverAimFrame; rgba: Uint8ClampedArray };
    const approach: Stored[] = [], frames: Stored[] = [], edges: DeceiverPointerEdge[] = [], problems: string[] = [];
    const cleanupFailures: { phase: string; error: unknown }[] = [];
    let phase: 'approach' | 'shot' | 'done' = 'approach', raf: number | null = null, stopped = false;
    let firstAt: number | null = null, shotStart: number | null = null, lastAt = -Infinity, selectedId: number | null = null;
    let pendingReject: ((error: unknown) => void) | null = null, settleDone!: () => void;
    const done = new Promise<void>(resolve => { settleDone = resolve; });
    const clone = (f: DeceiverAimFrame): DeceiverAimFrame => ({ ...f, hud: [...f.hud], rect: { ...f.rect }, pixels: { ...f.pixels, shots: f.pixels.shots.map(s => ({ ...s })) } });
    const unlisten = io.listen(e => {
      if (stopped) return;
      if (edges.length >= 16) { problems.push('Pointer edge safety cap exceeded'); stop(); return; }
      edges.push({ ...e });
    });
    function stop() {
      if (stopped) return; stopped = true; phase = 'done';
      const id = raf; raf = null;
      if (id !== null) try { io.cancel(id); } catch (error) { cleanupFailures.push({ phase: 'cancel', error }); problems.push('cancel: ' + String(error)); }
      const reject = pendingReject; pendingReject = null; reject?.(Error('Approach capture stopped before observation'));
      try { unlisten(); } catch (error) { cleanupFailures.push({ phase: 'listeners', error }); problems.push('listeners: ' + String(error)); }
      settleDone();
    }
    let hasPrimary = false, primaryError: unknown;
    function fail(error: unknown) {
      if (!hasPrimary) { hasPrimary = true; primaryError = error; }
      problems.push('capture: ' + String(error)); stop();
    }
    function capture(at: number, captureId: number): Stored {
      if (!Number.isFinite(at) || at < lastAt) throw Error('Invalid or backwards RAF timestamp');
      lastAt = at;
      const raw = io.read(at);
      if (raw.at !== at || !Number.isFinite(raw.sampledAt) || raw.rgba.length !== 640 * 360 * 4) throw Error('Invalid original frame');
      const rgba = raw.rgba.slice();
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
      const shots: DeceiverFrame['pixels']['shots'] = [];
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
      return { rgba, geometry: { at, sampledAt: raw.sampledAt, captureId, hud: [...raw.hud], notice: raw.notice, rect: { ...raw.rect },
        pixels: { purple, ivory, coreCount, coreX: coreCount ? cx / coreCount : null, coreY: coreCount ? cy / coreCount : null,
          coreWidth: coreCount ? maxX - minX + 1 : 0, heroCount, heroX: heroCount ? hx / heroCount : null, heroY: heroCount ? hy / heroCount : null, shots } } };
    }
    function shot(at: number) {
      raf = null; if (phase !== 'shot') return;
      try {
        if (frames.length >= 256) throw Error('Shot frame safety cap exceeded');
        shotStart ??= at; frames.push(capture(at, frames.length));
        if (at - shotStart >= 900) stop(); else raf = io.raf(shot);
      } catch (error) { fail(error); }
    }
    function next(): Promise<DeceiverAimFrame> {
      if (phase !== 'approach' || stopped) return Promise.reject(Error('Approach is not active'));
      if (pendingReject || raf !== null) return Promise.reject(Error('Concurrent approach request'));
      if (approach.length >= 40) return Promise.reject(Error('Original40-frame approach limit reached'));
      const promise = new Promise<DeceiverAimFrame>((resolve, reject) => {
        pendingReject = reject;
        try {
          raf = io.raf(at => {
            raf = null; if (stopped) return;
            pendingReject = null;
            try {
              const stored = capture(at, approach.length), f = stored.geometry, q = f.pixels;
              approach.push(stored); firstAt ??= at;
              if (f.at - firstAt > 900) stop();
              else if (q.heroY !== null && q.heroCount >= 80 && q.heroY < 245 && q.coreY !== null && q.heroY <= q.coreY + 12 && q.purple > 30 && q.coreCount > 30) {
                selectedId = f.captureId; phase = 'shot'; raf = io.raf(shot);
              }
              resolve(clone(f));
            } catch (error) { fail(error); reject(error); }
          });
        } catch (error) { pendingReject = null; fail(error); reject(error); }
      });
      // A cancelled request remains rejected for its caller, without an unhandled browser rejection.
      void promise.catch(() => {}); return promise;
    }
    async function collect(): Promise<DeceiverJumpProof> {
      if (phase === 'approach') stop();
      await done;
      if (selectedId !== null) {
        const valid = edges.length === 2 && edges.every((e, i) => e.type === (i ? 'pointerup' : 'pointerdown') && e.trusted && e.button === 0 && e.target === 'CANVAS');
        const held = valid ? edges[1].at - edges[0].at : NaN;
        if (!valid || !Number.isFinite(held) || held < 0 || held >= 185) problems.push('Expected one trusted canvas click held below185ms');
      }
      const materialize = (s: Stored): DeceiverCapturedFrame => ({ ...clone(s.geometry), png: io.encode(s.rgba.slice()) });
      try {
        return { approach: approach.map(materialize), frames: frames.map(materialize), edges: edges.map(e => ({ ...e })), problems: [...problems],
          failure: hasPrimary ? { primary: primaryError } : null, cleanupFailures: cleanupFailures.map(f => ({ ...f })),
          budget: { firstAt, selectedId, shotStart, shotEnd: frames.at(-1)?.geometry.at ?? null, approachFrames: approach.length, shotFrames: frames.length, approachLimit: 40, approachMs: 900, shotMs: 900, shotSafetyCap: 256 } };
      } catch (encodingError) {
        throw Object.assign(Error('Capture/cleanup: ' + problems.join('; ') + '; encoding: ' + String(encodingError)), { primary: primaryError, hasPrimary, problems: [...problems], cleanupFailures: [...cleanupFailures], encodingError });
      }
    }
    let collected: ReturnType<typeof collect> | null = null;
    const finish = () => collected ??= collect();
    return { setup: { ok: true, value: null }, next, finish,
      cancel: () => { if (!stopped) problems.push('Capture explicitly cancelled'); stop(); },
      nextWire: async () => { try { return { ok: true, value: await next() }; } catch (error) { return { ok: false, error: fault(error) }; } },
      finishWire: async () => {
        try {
          const { failure, cleanupFailures: errors, ...value } = await finish();
          return { ok: true, value, failure: failure ? fault(failure.primary) : null, cleanupFailures: errors.map(e => ({ phase: e.phase, error: fault(e.error) })) };
        } catch (error) { return { ok: false, error: fault(error) }; }
      },
    };
  } catch (error) {
    const setup = { ok: false as const, error: fault(error) };
    return { setup, next: async () => { throw error; }, finish: async () => { throw error; }, cancel: () => {},
      nextWire: async () => setup, finishWire: async () => setup };
  }
}

/** Rebuild controlled failures only after they crossed Playwright as ordinary data. */
export function decodeDeceiverFault(fault: DeceiverFault): unknown {
  if (fault.tag === 'undefined') return undefined;
  if (fault.tag === 'null') return null;
  if (fault.tag === 'number') return Number(fault.value);
  if (fault.tag === 'bigint') return BigInt(String(fault.value));
  if (fault.tag === 'boolean' || fault.tag === 'string' || fault.tag === 'opaque') return fault.value;
  if (fault.tag === 'array') return (fault.items ?? []).map(decodeDeceiverFault);
  const value = fault.tag === 'error' ? Error(fault.message) : {};
  if (value instanceof Error) {
    Object.defineProperty(value, 'name', { value: fault.name ?? 'Error', configurable: true, writable: true });
    Object.defineProperty(value, 'stack', { value: fault.stack, configurable: true, writable: true });
  }
  for (const [name, field] of Object.entries(fault.fields ?? {})) Object.defineProperty(value, name, {
    value: decodeDeceiverFault(field), enumerable: true, configurable: true, writable: true,
  });
  return value;
}
export function assertDeceiverCaptureCompleted(saved: DeceiverJumpProof) {
  if (saved.problems.length) throw Object.assign(Error(saved.problems.join('; ')), { captureFailure: saved.failure, cleanupFailures: saved.cleanupFailures });
}
export async function keepDeceiverDiagnostic(errors: Error[], label: string, action: () => Promise<unknown>) {
  try { await action(); } catch (error) {
    errors.push(Object.assign(Error(`${label}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`), { cause: error }));
  }
}
