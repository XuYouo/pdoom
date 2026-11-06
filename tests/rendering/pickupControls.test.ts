import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createPickupCapture, runPickupCapture, type PickupCaptureIO, type PickupCapturePort } from '../e2e/pickup-controls';

// Real collector/control functions with explicit scheduling and byte ownership.
// Encoder spies below are NOT native PNG or browser-fidelity evidence.
function rig() {
  const state = { frozen: false, reads: 0, hud: ['HP18/100'], calls: [] as string[], encoded: [] as number[] };
  const rgba = new Uint8ClampedArray(640 * 360 * 4); rgba[0] = 7;
  const pending = new Map<number, (at: number) => void>(); let next = 0;
  const io: PickupCaptureIO = {
    raf: fn => { const id = next++; pending.set(id, fn); return id; },
    cancelRaf: id => { state.calls.push('cancelRAF'); pending.delete(id as number); },
    frozen: () => state.frozen,
    read: () => { state.reads++; return { rgba, hud: state.hud, objective: 'objective', title: 'title', notice: 'notice' }; },
    encode: bytes => { state.calls.push('encode'); state.encoded.push(bytes[0]); return 'data:image/png;base64,' + Buffer.from([bytes[0]]).toString('base64'); },
  };
  const capture = createPickupCapture(io);
  const tick = (at: number) => { const entry = [...pending][0]; expect(entry).toBeTruthy(); pending.delete(entry[0]); entry[1](at); };
  return { state, rgba, pending, io, capture, tick };
}
async function collected(r: ReturnType<typeof rig>, ms = 180) {
  const done = r.capture.acquire(ms); r.tick(0); if (ms) r.tick(ms); await done;
}
async function ready(r: ReturnType<typeof rig>) {
  await collected(r); r.state.frozen = true; const final = r.capture.acquireFinal(); r.tick(220); await final;
}

describe('actual pickup raw collector', () => {
  it('preserves original RAF cadence/boundary and takes final raw before ALL encoding', async () => {
    const r = rig(), done = r.capture.acquire(180);
    for (const at of [100, 116, 131, 132, 163, 164, 280]) r.tick(at);
    await done; expect(r.state.reads).toBe(4); expect(r.state.encoded).toEqual([]);
    expect(() => r.capture.finish()).toThrow('Final raw');
    await expect(r.capture.acquireFinal()).rejects.toThrow('pause/rest');
    r.state.frozen = true; const final = r.capture.acquireFinal();
    expect(() => r.capture.finish()).toThrow('Final raw'); r.tick(300); await final;
    expect(r.state.reads).toBe(5); expect(r.state.encoded).toEqual([]);
    const result = r.capture.finish(); expect(result.frames.map(f => f.at)).toEqual([100, 132, 164, 280]);
    expect(result.pausedFinal.at).toBe(300); expect(r.state.encoded).toHaveLength(5);
    expect(result.frames[0]).toMatchObject({ hud: ['HP18/100'], objective: 'objective', title: 'title', notice: 'notice' });
    expect(() => r.capture.finish()).toThrow('Final raw'); expect(r.state.encoded).toHaveLength(5);
  });
  it.each([0, 4500])('retains the exact %s boundary rather than a new observation window', async ms => {
    const r = rig(); await collected(r, ms); r.state.frozen = true;
    const done = r.capture.acquireFinal(); r.tick(ms + 20); await done;
    const result = r.capture.finish(); expect(result.frames.map(f => f.at)).toEqual(ms ? [0, ms] : [0]);
  });
  it.each([-1, 4501, NaN, Infinity])('rejects invalid duration %s without a read', async ms => {
    const r = rig(); await expect(r.capture.acquire(ms)).rejects.toThrow('duration'); expect(r.state.reads).toBe(0); expect(r.pending.size).toBe(0);
  });
  it('cannot restart acquisition or replace the final raw with a repeated active frame', async () => {
    const r = rig(); await collected(r); await expect(r.capture.acquire(180)).rejects.toThrow('only once');
    r.state.frozen = true; const done = r.capture.acquireFinal(); await expect(r.capture.acquireFinal()).rejects.toThrow('guard'); r.tick(250); await done;
    expect(r.capture.finish().pausedFinal.at).toBe(250);
  });
  it('copies every RGBA/HUD snapshot and never retimes or rereads during encoding', async () => {
    const r = rig(), done = r.capture.acquire(180); r.tick(0); r.rgba[0] = 8; r.state.hud[0] = 'HP17/100'; r.tick(180); await done;
    r.state.frozen = true; r.rgba[0] = 9; r.state.hud[0] = 'HP16/100'; const final = r.capture.acquireFinal(); r.tick(563.3); await final;
    r.rgba[0] = 99; r.state.hud[0] = 'HP0/100'; const result = r.capture.finish();
    expect(r.state.encoded).toEqual([7, 8, 9]); expect(r.state.reads).toBe(3);
    expect(result.frames.map(f => f.hud)).toEqual([['HP18/100'], ['HP17/100']]); expect(result.pausedFinal.hud).toEqual(['HP16/100']);
    expect(result.pausedFinal.at - result.frames[1].at).toBeCloseTo(383.3); // Remains stale, not relabelled <=200.
  });
  it.each([NaN, Infinity, -1])('rejects invalid first RAF %s without reading', async at => {
    const r = rig(), done = r.capture.acquire(180), rejected = expect(done).rejects.toThrow('RAF');
    r.tick(at); await rejected; expect(r.state.reads).toBe(0); expect(r.state.encoded).toEqual([]);
  });
  it('rejects backwards RAF even when neither callback was a sampling boundary', async () => {
    const r = rig(), done = r.capture.acquire(180), rejected = expect(done).rejects.toThrow('RAF');
    r.tick(100); r.tick(116); r.tick(115); await rejected; expect(r.state.reads).toBe(1);
  });
  it.each(['rgba', 'hud', 'objective'] as const)('rejects malformed %s without encoding', async kind => {
    const r = rig(), original = r.io.read;
    r.io.read = () => { const value = original();
      if (kind === 'rgba') value.rgba = new Uint8ClampedArray(4);
      if (kind === 'hud') value.hud = [3] as unknown as string[];
      if (kind === 'objective') value.objective = null as unknown as string;
      return value;
    };
    const done = r.capture.acquire(0), rejected = expect(done).rejects.toThrow('payload'); r.tick(0); await rejected;
    expect(r.state.encoded).toEqual([]); expect(r.pending.size).toBe(0);
  });
  it.each([null, undefined, 0, ''])('retains falsy read failure %s', async error => {
    const r = rig(); r.io.read = () => { throw error; };
    const done = r.capture.acquire(0), rejected = expect(done).rejects.toBe(error); r.tick(0); await rejected;
    expect(r.pending.size).toBe(0); expect(r.state.encoded).toEqual([]);
  });
  it.each(['active', 'final'] as const)('cancels %s and forbids stale callbacks from reading', async phase => {
    const r = rig(); if (phase === 'final') { await collected(r); r.state.frozen = true; }
    const done = phase === 'active' ? r.capture.acquire(180) : r.capture.acquireFinal();
    const rejected = expect(done).rejects.toThrow('cancelled'), stale = [...r.pending.values()][0], reads = r.state.reads;
    r.capture.cancel(); stale(300); await rejected; expect(r.state.reads).toBe(reads); expect(r.pending.size).toBe(0);
    expect(() => r.capture.finish()).toThrow('Final raw'); expect(r.state.encoded).toEqual([]);
  });
  it('a stale active callback cannot erase ownership of the pending final RAF', async () => {
    const r = rig(), done = r.capture.acquire(180), stale = [...r.pending.values()][0]; r.tick(0); r.tick(180); await done;
    r.state.frozen = true; const final = r.capture.acquireFinal(), rejected = expect(final).rejects.toThrow('cancelled');
    stale(190); r.capture.cancel(); await rejected; expect(r.pending.size).toBe(0); expect(r.state.reads).toBe(2);
  });
  it('does not append or reschedule when read synchronously cancels acquisition', async () => {
    const r = rig(), read = r.io.read; r.io.read = () => { r.capture.cancel(); return read(); };
    const done = r.capture.acquire(180), rejected = expect(done).rejects.toThrow('cancelled'); r.tick(0); await rejected;
    expect(r.pending.size).toBe(0); expect(r.state.encoded).toEqual([]);
  });
  it('checks freeze again on the final RAF and immediately before encoding', async () => {
    const r = rig(); await collected(r); r.state.frozen = true;
    const final = r.capture.acquireFinal(), rejected = expect(final).rejects.toThrow('ended'); r.state.frozen = false; r.tick(220); await rejected;
    expect(r.state.reads).toBe(2); expect(r.state.encoded).toEqual([]);
    const other = rig(); await ready(other); other.state.frozen = false;
    expect(() => other.capture.finish()).toThrow('visible freeze'); expect(other.state.encoded).toEqual([]);
  });
  it('propagates scheduling, cancellation and encode failures without a reread', async () => {
    const r = rig(); r.io.raf = () => { throw 0; }; await expect(r.capture.acquire(0)).rejects.toBe(0);
    const cancelled = rig(), done = cancelled.capture.acquire(180), rejected = expect(done).rejects.toThrow('cancelled');
    cancelled.io.cancelRaf = () => { throw 'cancel'; }; expect(() => cancelled.capture.cancel()).toThrow('cancel'); await rejected;
    [...cancelled.pending.values()][0](500); expect(cancelled.state.reads).toBe(0);
    const encoded = rig(); await ready(encoded); encoded.io.encode = () => { throw null; };
    try { encoded.capture.finish(); expect.fail('must throw'); } catch (error) { expect(error).toBeNull(); }
    expect(encoded.state.reads).toBe(3); expect(() => encoded.capture.finish()).toThrow('Final raw');
  });
});

function controlRig(failAt?: string, error?: unknown) {
  const calls: string[] = []; let freezes = 0;
  const call = async (label: string) => { calls.push(label); if (label === failAt) throw error; };
  const result = { frames: [], pausedFinal: { png: 'frozen', at: 220, hud: [], objective: '', title: '', notice: '' } };
  const port: PickupCapturePort = {
    acquire: ms => call('acquire' + ms), acquireFinal: () => call('final'),
    finish: async () => { await call('finish'); return result; }, cancel: () => call('cancel'), dispose: () => call('dispose'),
  };
  return { port, calls, result, freeze: () => call('freeze' + ++freezes) };
}
describe('real pickup capture coordinator', () => {
  it('orders final raw before encoding and independently cleans every owned phase', async () => {
    const r = controlRig(); expect(await runPickupCapture(r.port, 180, r.freeze)).toBe(r.result);
    expect(r.calls).toEqual(['acquire180', 'freeze1', 'final', 'finish', 'cancel', 'freeze2', 'dispose']);
  });
  it.each(['acquire180', 'freeze1', 'final', 'finish', 'cancel', 'freeze2', 'dispose'])('fails closed at %s while attempting all cleanup', async phase => {
    const error = Error(phase), r = controlRig(phase, error); await expect(runPickupCapture(r.port, 180, r.freeze)).rejects.toBe(error);
    expect(r.calls).toContain('cancel'); expect(r.calls.at(-1)).toBe('dispose');
    expect(r.calls.filter(s => s.startsWith('freeze')).length).toBeGreaterThanOrEqual(1);
    if (['acquire180', 'freeze1', 'final'].includes(phase)) expect(r.calls).not.toContain('finish');
  });
  it.each([undefined, null, 0, ''])('retains falsy primary %s with all cleanup failures', async primary => {
    const r = controlRig('acquire180', primary);
    r.port.cancel = async () => { r.calls.push('cancel'); throw Error('cancel'); };
    r.port.dispose = async () => { r.calls.push('dispose'); throw Error('dispose'); };
    const freeze = async () => { r.calls.push('freeze'); throw Error('freeze'); };
    const error = await runPickupCapture(r.port, 180, freeze).catch(error => error);
    expect(error.cause).toBe(primary); expect(error.cleanupError.cause.message).toBe('cancel');
    expect(error.cleanupError.cleanupError.cause.message).toBe('freeze'); expect(error.cleanupError.cleanupError.cleanupError.message).toBe('dispose');
    expect(r.calls).toEqual(['acquire180', 'cancel', 'freeze', 'dispose']);
  });
  it('joins delayed acquisition before freeze/final and runs the actual collector', async () => {
    const r = rig(), calls: string[] = [];
    const port: PickupCapturePort = {
      acquire: async ms => { calls.push('acquire'); await r.capture.acquire(ms); },
      acquireFinal: async () => { calls.push('final'); await r.capture.acquireFinal(); },
      finish: async () => { calls.push('finish'); return r.capture.finish(); },
      cancel: async () => { calls.push('cancel'); r.capture.cancel(); }, dispose: async () => { calls.push('dispose'); },
    };
    const result = runPickupCapture(port, 180, async () => { calls.push('freeze'); r.state.frozen = true; });
    r.tick(100); await Promise.resolve(); expect(calls).toEqual(['acquire']); expect(r.state.encoded).toEqual([]);
    r.tick(280); for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(calls).toEqual(['acquire', 'freeze', 'final']); expect(r.state.encoded).toEqual([]);
    r.tick(300); const captured = await result;
    expect(captured.frames.map(f => f.at)).toEqual([100, 280]); expect(captured.pausedFinal.at).toBe(300);
    expect(calls).toEqual(['acquire', 'freeze', 'final', 'finish', 'cancel', 'freeze', 'dispose']); expect(r.pending.size).toBe(0);
  });
});

it('default native reader clears reused scratch before transparent and semitransparent frames', async () => {
  // A tiny source-over model tests the REAL default reader path/order, not a native PNG codec.
  const pixels = new Uint8ClampedArray(640 * 360 * 4), calls: string[] = [];
  let source = [70, 80, 90, 255], frozen = false, next = 0;
  const rafs = new Map<number, FrameRequestCallback>();
  const canvas = { width: 640, height: 360 };
  const ctx = {
    clearRect: (...box: number[]) => { expect(box).toEqual([0, 0, 640, 360]); calls.push('clear'); pixels.fill(0); },
    drawImage: (image: unknown, x: number, y: number) => {
      expect(image).toBe(canvas); expect([x, y]).toEqual([0, 0]); calls.push('draw');
      const a = source[3] / 255, previous = pixels[3] / 255, alpha = a + previous * (1 - a);
      for (let c = 0; c < 3; c++) pixels[c] = alpha ? Math.round((source[c] * a + pixels[c] * previous * (1 - a)) / alpha) : 0;
      pixels[3] = Math.round(alpha * 255);
    },
    getImageData: () => { calls.push('read'); return { data: pixels.slice() }; },
    putImageData: (image: { data: Uint8ClampedArray }) => { calls.push('put'); pixels.set(image.data); },
  };
  const scratch = { width: 0, height: 0, getContext: () => ctx,
    toDataURL: () => { calls.push('encode'); return 'data:image/png;base64,' + Buffer.from(pixels.slice(0, 4)).toString('base64'); } };
  const dialog = { getAttribute: () => '暂停前向传播。', getBoundingClientRect: () => ({ width: frozen ? 10 : 0, height: 10 }) };
  vi.stubGlobal('document', { createElement: () => scratch, querySelector: (selector: string) => selector === 'canvas' ? canvas : null,
    querySelectorAll: (selector: string) => selector === 'dialog,[role="dialog"]' ? [dialog] : selector === '.hud-cell' ? [{ textContent: 'HP18/100' }] : [] });
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible', display: 'block' }));
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { const id = next++; rafs.set(id, fn); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => rafs.delete(id));
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
  const tick = (at: number) => { const [id, fn] = [...rafs][0]; rafs.delete(id); fn(at); };
  try {
    const capture = createPickupCapture(), done = capture.acquire(180);
    tick(0); source = [0, 0, 0, 0]; tick(180); await done;
    await expect(capture.acquireFinal()).rejects.toThrow('guard'); frozen = true; source = [200, 100, 20, 128];
    const final = capture.acquireFinal(); tick(220); await final;
    expect(calls).toEqual(['clear', 'draw', 'read', 'clear', 'draw', 'read', 'clear', 'draw', 'read']);
    const result = capture.finish(), decoded = [...result.frames, result.pausedFinal].map(f => [...Buffer.from(f.png.split(',')[1], 'base64')]);
    expect(decoded).toEqual([[70, 80, 90, 255], [0, 0, 0, 0], [200, 100, 20, 128]]);
    expect(calls.slice(9)).toEqual(['put', 'encode', 'put', 'encode', 'put', 'encode']); expect(rafs.size).toBe(0);
  } finally { vi.unstubAllGlobals(); }
});

// Waypoint controls use actual asset stamps and actual exported control functions.
import { pickupSource, C1, type PickupSource } from '../e2e/pickup-pixels';
import { createPickupWaypoint, runPickupWaypointMove, runPickupWaypointStage, completePickupActions,
  type PickupWaypointConfig, type PickupWaypointIO, type PickupWaypointRead, type PickupWaypointResult,
  type PickupMovePort, type PickupWaypointStagePort, type PickupWaypointProof } from '../e2e/pickup-controls';
let pickupAssets: PickupSource;
beforeAll(async () => { pickupAssets = await pickupSource(); });
const stopped: PickupWaypointResult = { reason: 'position', problems: [] };
const cancelled: PickupWaypointResult = { reason: 'cancelled', problems: [] };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function moveRig() {
  const state = { time: 0, calls: [] as string[], remaining: 0, fire: () => {} };
  const port: PickupMovePort<PickupWaypointResult> = {
    now: () => state.time, timer: (take, ms) => { expect(ms).toBe(1500); state.fire = take; return 0; }, cancelTimer: () => { state.calls.push('clear'); },
    down: async () => { state.calls.push('down'); }, up: async () => { state.calls.push('up'); },
    observe: async ms => { state.calls.push('observe'); state.remaining = ms; state.time = 300; return stopped; },
    cancel: async () => { state.calls.push('cancel'); }, isCancelled: result => result.reason === 'cancelled',
  };
  return { state, port };
}
describe('actual single-stage waypoint owner', () => {
  it('starts at zero, deducts down time and uses one down/up', async () => {
    const r = moveRig(); r.port.down = async () => { r.state.calls.push('down'); r.state.time = 120; };
    const result = await runPickupWaypointMove(r.port); expect(result).toMatchObject({ kind: 'observed', observation: stopped, stopMs: 300, budgetMs: 1500 });
    expect(r.state.remaining).toBe(1380); expect(r.state.calls).toEqual(['down', 'observe', 'clear', 'up']);
    r.state.fire(); expect(r.state.calls).toEqual(['down', 'observe', 'clear', 'up']);
  });
  it.each([1500, 1501])('releases exhausted down at %s without observing or another down', async at => {
    const r = moveRig(); r.port.down = async () => { r.state.calls.push('down'); r.state.time = at; };
    const result = await runPickupWaypointMove(r.port); expect(result.kind).toBe('deadline'); expect(result.observation).toBeNull();
    expect(r.state.calls.filter(c => c === 'down')).toHaveLength(1); expect(r.state.calls).not.toContain('observe'); expect(r.state.calls).toContain('up');
  });
  it.each([1499, 1500, 1501])('never accepts a reply at/after1500, actual reply %s', async at => {
    const r = moveRig(); r.port.observe = async () => { r.state.time = at; return stopped; };
    const result = await runPickupWaypointMove(r.port); expect(result.kind).toBe(at < 1500 ? 'observed' : 'deadline');
    expect(result.observation).toBe(at < 1500 ? stopped : null); expect(r.state.calls.filter(c => c === 'up')).toHaveLength(1);
  });
  it('releases before a late down settles, releases again and joins it', async () => {
    const r = moveRig(), down = deferred<unknown>(); let ended = false;
    r.port.down = async () => { r.state.calls.push('down'); await down.promise; };
    const result = runPickupWaypointMove(r.port).then(value => { ended = true; return value; });
    r.state.time = 1500; r.state.fire(); await flush(); expect(ended).toBe(false); expect(r.state.calls).toContain('up');
    down.resolve(null); const value = await result; expect(value.kind).toBe('deadline'); expect(value.observation).toBeNull();
    expect(r.state.calls.filter(c => c === 'up')).toHaveLength(2); expect(r.state.calls).not.toContain('observe');
  });
  it('deadline cancellation is normal partial progress but joins observer, cancel and up', async () => {
    const r = moveRig(), observing = deferred<PickupWaypointResult>(), up = deferred<unknown>(), cancel = deferred<unknown>(); let ended = false;
    r.port.observe = async () => { r.state.calls.push('observe'); return observing.promise; };
    r.port.up = async () => { r.state.calls.push('up'); await up.promise; };
    r.port.cancel = async () => { r.state.calls.push('cancel'); await cancel.promise; observing.resolve(cancelled); };
    const result = runPickupWaypointMove(r.port).then(v => { ended = true; return v; }); await flush();
    r.state.time = 1500; r.state.fire(); await flush(); expect(ended).toBe(false);
    up.resolve(null); await flush(); expect(ended).toBe(false); cancel.resolve(null);
    expect(await result).toMatchObject({ kind: 'deadline', observation: null }); expect(r.state.calls.filter(c => c === 'down')).toHaveLength(1);
  });
  it.each([undefined, null, 0, ''])('exposes a genuine observation failure after deadline: %s', async failure => {
    const r = moveRig(), observation = deferred<PickupWaypointResult>(); r.port.observe = () => observation.promise;
    const done = runPickupWaypointMove(r.port), rejected = expect(done).rejects.toBe(failure); await flush();
    r.state.time = 1500; r.state.fire(); observation.reject(failure); await rejected;
    expect(r.state.calls).toContain('up'); expect(r.state.calls).toContain('cancel');
  });
  it.each(['down', 'observe', 'up'] as const)('does not turn a falsy %s API error into partial success', async phase => {
    const r = moveRig(); r.port[phase] = async () => { r.state.calls.push(phase); throw 0; };
    await expect(runPickupWaypointMove(r.port)).rejects.toBe(0); expect(r.state.calls).toContain('up'); expect(r.state.calls).toContain('cancel');
  });
  it('keeps multiple primary/release/cancel/timer failures', async () => {
    const r = moveRig(); r.port.down = async () => { throw 0; }; r.port.up = async () => { throw null; };
    r.port.cancel = async () => { throw ''; }; r.port.cancelTimer = () => { throw false; };
    const failure = await runPickupWaypointMove(r.port).catch(e => e);
    expect(failure.failures.map((f: { reason: unknown }) => f.reason)).toEqual(expect.arrayContaining([0, null, '', false]));
  });
  it('rejects unsolicited cancellation rather than hiding it as budget', async () => {
    const r = moveRig(); r.port.observe = async () => cancelled;
    await expect(runPickupWaypointMove(r.port)).rejects.toThrow('Unexpected'); expect(r.state.calls).toContain('up');
  });
  it.each([NaN, Infinity])('rejects invalid start clock %s before down', async clock => {
    const r = moveRig(); r.state.time = clock; await expect(runPickupWaypointMove(r.port)).rejects.toThrow('start clock');
    expect(r.state.calls).not.toContain('down'); expect(r.state.calls).toContain('cancel');
  });
  it('rejects a backwards post-down clock and still releases', async () => {
    const r = moveRig(); r.state.time = 100; r.port.down = async () => { r.state.time = 90; };
    await expect(runPickupWaypointMove(r.port)).rejects.toThrow('down clock'); expect(r.state.calls).toContain('up');
  });
});

function waypointConfig(slot = 1): PickupWaypointConfig {
  return { source: { hero: pickupAssets.hero, terrain: pickupAssets.terrain, ledges: pickupAssets.ledges, reference: pickupAssets.items[slot] },
    reference: slot === 0 ? C1.token1 : slot === 2 ? C1.heal1 : C1.compute1, target: 210, tolerance: 8, direction: 'd', allowRest: false };
}
function paint(bytes: Uint8ClampedArray, s: PickupSource['hero'][number], x: number, y: number) {
  for (const p of s.points) { const px = x + p.x, py = y + p.y; if (px < 0 || px >= 640 || py < 0 || py >= 360) continue;
    const i = (py * 640 + px) * 4; bytes.set([p.color >>> 16, (p.color >>> 8) & 255, p.color & 255, 255], i); }
}
function rawWaypoint(config: PickupWaypointConfig, x: number | null = 203, refX: number | null = 477, feet = 320, pose = 0): PickupWaypointRead {
  const rgba = new Uint8ClampedArray(640 * 360 * 4);
  if (x !== null) paint(rgba, config.source.hero[pose], x - 16, feet - 27);
  if (refX !== null) paint(rgba, config.source.reference, refX - 16, config.reference.y - 16);
  for (const tileX of [0, 16, 32, 48]) paint(rgba, config.source.terrain[0], tileX, 320);
  return { rgba, hud: ['HP100/100'], objective: 'actual source fixture', title: '', notice: '', rest: false };
}
function waypointRig(config = waypointConfig()) {
  const state = { time: 0, frozen: false, raw: rawWaypoint(config), reads: 0, encodes: [] as number[] };
  const rafs = new Map<number, (at: number) => void>(), timers = new Map<number, () => void>(); let id = 0;
  const io: PickupWaypointIO = {
    now: () => state.time, raf: fn => { const key = id++; rafs.set(key, fn); return key; }, cancelRaf: key => { rafs.delete(key as number); },
    timer: fn => { const key = id++; timers.set(key, fn); return key; }, cancelTimer: key => { timers.delete(key as number); },
    read: () => { state.reads++; return state.raw; }, frozen: () => state.frozen,
    encode: rgba => { state.encodes.push(rgba.reduce((sum, byte) => sum + byte, 0)); return 'data:image/png;base64,AA=='; },
  };
  const observer = createPickupWaypoint(config, io);
  const tick = (at: number) => { state.time = at; const [key, fn] = [...rafs][0]; rafs.delete(key); fn(at); };
  return { state, io, observer, rafs, timers, tick, config };
}
describe('actual currentRGBA waypoint matcher and observer', () => {
  it.each(Array.from({ length: 44 }, (_, i) => i))('matches real aligned source pose/direction %s', pose => {
    const r = waypointRig(), raw = rawWaypoint(r.config, 203, 477, 320, pose), view = r.observer.inspect(raw, 100);
    expect(view.worldX).toBe(203); expect(view.inBand).toBe(true); expect(view.hero!.ink).toBeGreaterThan(100); expect(view.terrainCount).toBeGreaterThanOrEqual(4);
  });
  it.each([4, 8])('keeps original tol%s for both directions and overshoots', tolerance => {
    const config = { ...waypointConfig(), tolerance }, r = waypointRig(config);
    for (const x of [210 - tolerance, 210 + tolerance]) expect(r.observer.inspect(rawWaypoint(config, x), 10).inBand).toBe(true);
    for (const x of [209 - tolerance, 211 + tolerance]) expect(r.observer.inspect(rawWaypoint(config, x), 10).inBand).toBe(false);
  });
  it('supports token88, airborne feet and same-origin pose aliases without adding ground requirements', () => {
    const config = waypointConfig(0), r = waypointRig(config), view = r.observer.inspect(rawWaypoint(config, 203, 290, 258), 10);
    expect(view.reference!.ink).toBe(88); expect(view.worldX).toBe(203); expect(view.hero!.feet).toBe(258);
  });
  it.each(['hero', 'reference', 'terrain', 'reference-y', 'reference-duplicate', 'hero-duplicate', 'reference-clipped', 'reference-kind'])('refuses incomplete/ambiguous current %s', kind => {
    const r = waypointRig(), raw = rawWaypoint(r.config, kind === 'hero' ? null : 203, ['reference', 'reference-y', 'reference-kind', 'reference-clipped'].includes(kind) ? null : 477);
    if (kind === 'terrain') raw.rgba.fill(0, 320 * 640 * 4);
    if (kind === 'reference-y') paint(raw.rgba, r.config.source.reference, 461, 168);
    if (kind === 'reference-duplicate') paint(raw.rgba, r.config.source.reference, 520, 164);
    if (kind === 'hero-duplicate') paint(raw.rgba, r.config.source.hero[0], 260, 293);
    if (kind === 'reference-clipped') paint(raw.rgba, r.config.source.reference, -16, 164);
    if (kind === 'reference-kind') paint(raw.rgba, pickupAssets.items[2], 461, 164);
    expect(r.observer.inspect(raw, 100).worldX).toBeNull();
  });
  it('never combines an old reference with a new hero and accepts only current recovery', () => {
    const r = waypointRig(); expect(r.observer.inspect(rawWaypoint(r.config, null), 10).worldX).toBeNull();
    expect(r.observer.inspect(rawWaypoint(r.config, 203, null), 20).worldX).toBeNull();
    expect(r.observer.inspect(rawWaypoint(r.config), 30).worldX).toBe(203);
  });
  it.each([-2, -1, 2241, 2242])('retains exact scroll boundary %s', scroll => {
    const config = waypointConfig(), x = scroll < 0 ? 477 - scroll : 60; config.reference = { x: x + scroll, y: 180 };
    const r = waypointRig(config), view = r.observer.inspect(rawWaypoint(config, 203, x), 10);
    expect(view.worldX).toBe(scroll < -1 || scroll > 2241 ? null : 203 + scroll);
  });
  it.each([7, 9])('preserves source98%% at %s nonanchor missing points', count => {
    const config = waypointConfig(); config.source = { ...config.source, hero: [pickupAssets.hero[0]] }; const r = waypointRig(config), raw = rawWaypoint(config);
    const s = config.source.hero[0], keys = new Set(s.anchors.map(p => p.x + '/' + p.y));
    for (const p of s.points.filter(p => !keys.has(p.x + '/' + p.y)).slice(0, count)) raw.rgba[(293 + p.y) * 2560 + (187 + p.x) * 4 + 3] = 0;
    expect(r.observer.inspect(raw, 10).worldX).toBe(count === 7 ? 203 : null);
  });
  it('preserves exact first-anchor indexing, alpha255 and channel tolerance2', () => {
    const config = waypointConfig(); config.source = { ...config.source, hero: [pickupAssets.hero[0]] }; const r = waypointRig(config), s = config.source.hero[0];
    const keys = new Set(s.anchors.map(p => p.x + '/' + p.y)), points = s.points.filter(p => !keys.has(p.x + '/' + p.y)).slice(0, 9);
    for (const delta of [2, 3]) { const raw = rawWaypoint(config);
      for (const p of points) raw.rgba[(293 + p.y) * 2560 + (187 + p.x) * 4] += delta;
      expect(r.observer.inspect(raw, 10).worldX).toBe(delta === 2 ? 203 : null);
    }
    const raw = rawWaypoint(config), a = s.anchors[0]; raw.rgba[(293 + a.y) * 2560 + (187 + a.x) * 4]++;
    expect(r.observer.inspect(raw, 10).worldX).toBeNull();
    const alpha = rawWaypoint(config); for (const p of points) alpha.rgba[(293 + p.y) * 2560 + (187 + p.x) * 4 + 3] = 254;
    expect(r.observer.inspect(alpha, 10).worldX).toBeNull();
  });
  it.each([['d', 202, 'position'], ['d', 250, 'passed'], ['a', 218, 'position'], ['a', 180, 'passed']] as const)('stops %s at currentx%s as%s, not final acceptance', async (direction, x, reason) => {
    const config = { ...waypointConfig(), direction }, r = waypointRig(config); r.state.raw = rawWaypoint(config, x);
    const done = r.observer.run(1500); r.tick(100); expect((await done).reason).toBe(reason);
    expect(r.state.encodes).toEqual([]); expect(() => r.observer.finish()).toThrow('frozen boundary');
    r.state.frozen = true; const proof = r.observer.finish(); expect(proof.snapshotFact!.worldX).toBe(x);
    expect(proof.snapshotFact!.inBand).toBe(reason === 'position'); expect(r.rafs.size + r.timers.size).toBe(0);
  });
  it('keeps missing heal unknown until the same stage reaches actual rest', async () => {
    const config = { ...waypointConfig(2), reference: { x: 1380, y: 298 }, target: 1400, allowRest: true }, r = waypointRig(config);
    r.state.raw = rawWaypoint(config, 295, null, 258); const done = r.observer.run(1500); r.tick(100);
    expect(r.state.reads).toBe(1); expect(r.rafs.size).toBe(1); r.state.raw.rest = true; r.tick(200);
    expect((await done).reason).toBe('rest'); r.state.frozen = true;
    const proof = r.observer.finish(); expect(proof.snapshotFact!.worldX).toBeNull(); expect(proof.snapshotFact!.inBand).toBe(false);
  });
  it('missing reference without rest reaches only budget, never synthetic position', async () => {
    const r = waypointRig(); r.state.raw = rawWaypoint(r.config, 203, null); const done = r.observer.run(1500); r.tick(10);
    r.state.time = 1500; [...r.timers.values()][0](); expect((await done).reason).toBe('budget'); r.state.frozen = true;
    const proof = r.observer.finish(); expect(proof.snapshot).toBeNull(); expect(proof.frames[0].worldX).toBeNull(); expect(r.state.encodes).toEqual([]);
  });
  it('copies selected currentRGBA andHUD, encodes once only at freeze', async () => {
    const r = waypointRig(), sum = r.state.raw.rgba.reduce((s, b) => s + b, 0), done = r.observer.run(1500); r.tick(100); await done;
    r.state.raw.rgba.fill(0); r.state.raw.hud[0] = 'HP0/100'; r.state.frozen = true; const proof = r.observer.finish();
    expect(r.state.encodes).toEqual([sum]); expect(proof.snapshot!.hud).toEqual(['HP100/100']); expect(proof.snapshot!.at).toBe(100);
    expect(() => r.observer.finish()).toThrow('boundary'); expect(r.state.reads).toBe(1);
  });
  it.each([1499, 1500, 1501])('rejects delayed read at/after1500: %s', async at => {
    const r = waypointRig(), read = r.io.read; r.io.read = () => { r.state.time = at; return read(); };
    const done = r.observer.run(1500); r.tick(100); expect((await done).reason).toBe(at < 1500 ? 'position' : 'budget');
    r.state.frozen = true; expect(r.observer.finish().snapshot !== null).toBe(at < 1500);
  });
  it.each([0, -1, 1501, NaN, Infinity])('rejects observer budget%s without reading', async ms => {
    const r = waypointRig(); await expect(r.observer.run(ms)).rejects.toThrow('budget'); expect(r.state.reads).toBe(0);
  });
  it('cancel and obsolete RAF/timer never read, restart, encode early or alter terminal reason', async () => {
    const r = waypointRig(), done = r.observer.run(1500), stale = [...r.rafs.values()][0], timer = [...r.timers.values()][0];
    r.observer.cancel(); stale(100); timer(); expect((await done).reason).toBe('cancelled'); expect(r.state.reads).toBe(0);
    await expect(r.observer.run(1500)).rejects.toThrow('once'); expect(() => r.observer.finish()).toThrow('boundary');
    r.state.frozen = true; expect(r.observer.finish().snapshot).toBeNull(); expect(r.state.encodes).toEqual([]);
  });
  it.each([undefined, null, 0, ''])('genuine reader failure %s returns error, not deadline', async error => {
    const r = waypointRig(); r.io.read = () => { throw error; }; const done = r.observer.run(1500); r.tick(100);
    expect((await done).reason).toBe('error'); expect(r.rafs.size + r.timers.size).toBe(0);
  });
  it.each(['HP0/100', 'HP101/100', 'missing'])('requires current live public%s', hp => {
    const r = waypointRig(); r.state.raw.hud[0] = hp; expect(() => r.observer.inspect(r.state.raw, 100)).toThrow('HP');
  });
});

function stageRig() {
  const r = moveRig();
  const proof: Omit<PickupWaypointProof, 'node'> = { target: 210, tolerance: 8, direction: 'd', referenceWorld: { x: 477, y: 180 }, referenceSlot: 1,
    allowRest: false, frames: [], result: stopped, snapshot: null, snapshotFact: null };
  const port: PickupWaypointStagePort<number> = { ...r.port,
    resume: async () => { r.state.calls.push('resume'); }, measure: async () => { r.state.calls.push('measure'); return 17; },
    freeze: async () => { r.state.calls.push('freeze'); }, finish: async () => { r.state.calls.push('finish'); return proof; },
    dispose: async () => { r.state.calls.push('dispose'); },
  };
  return { ...r, port, remembered: [] as PickupWaypointProof[] };
}
describe('actual waypoint stage lifecycle', () => {
  it('keeps original tail before freeze/finalize and never substitutes stop proof for measurement', async () => {
    const r = stageRig(); const result = await runPickupWaypointStage(r.port, p => { r.state.calls.push('remember'); r.remembered.push(p); });
    expect(result).toBe(17); expect(r.state.calls).toEqual(['resume', 'down', 'observe', 'clear', 'up', 'measure', 'freeze', 'cancel', 'finish', 'remember', 'dispose']);
    expect(r.remembered[0].node!.kind).toBe('observed');
  });
  it('budget partial progress still executes exactly one original measurement', async () => {
    const r = stageRig(); r.port.observe = async () => { r.state.time = 1500; r.state.fire(); return cancelled; };
    expect(await runPickupWaypointStage(r.port, p => r.remembered.push(p))).toBe(17);
    expect(r.remembered[0].node).toMatchObject({ kind: 'deadline', observation: null });
    expect(r.state.calls.filter(c => c === 'measure')).toHaveLength(1); expect(r.state.calls.filter(c => c === 'down')).toHaveLength(1);
    expect(r.state.calls.indexOf('up')).toBeLessThan(r.state.calls.indexOf('measure'));
  });
  it.each(['resume', 'measure', 'freeze', 'finish', 'dispose'] as const)('fails closed at %s, still attempts all cleanup', async phase => {
    const r = stageRig(); r.port[phase] = async () => { r.state.calls.push(phase); throw 0; };
    await expect(runPickupWaypointStage(r.port, () => {})).rejects.toBe(0);
    for (const name of ['freeze', 'cancel', 'finish', 'dispose']) expect(r.state.calls).toContain(name);
    if (phase === 'resume') expect(r.state.calls).not.toContain('down');
  });
  it('preserves primary and all cleanup failures including remember', async () => {
    const r = stageRig(); r.port.measure = async () => { throw 0; }; r.port.freeze = async () => { throw null; };
    r.port.cancel = async () => { throw ''; }; r.port.dispose = async () => { throw false; };
    const failure = await runPickupWaypointStage(r.port, () => { throw undefined; }).catch(e => e);
    expect(failure.cause).toBe(0);
    expect(failure.cleanupError.failures.map((f: { reason: unknown }) => f.reason)).toEqual([null, '', undefined, false]);
  });
  it('all-attempt helper retains falsy reasons in action order', async () => {
    const calls: number[] = [], reasons = [undefined, null, 0, ''];
    const failure = await completePickupActions(reasons.map((reason, i) => ({ phase: String(i), run: () => { calls.push(i); throw reason; } }))).catch(e => e);
    expect(calls).toEqual([0, 1, 2, 3]); expect(failure.failures.map((f: { reason: unknown }) => f.reason)).toEqual(reasons);
  });
});

import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import ts from 'typescript';
function actualSpecFunction(name: string, bindings: Record<string, unknown>) {
  const code = readFileSync('tests/e2e/pickup-art.spec.ts', 'utf8'), sf = ts.createSourceFile('spec.ts', code, ts.ScriptTarget.Latest, true);
  const fn = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name); if (!fn) throw Error('Missing actual spec function');
  const js = ts.transpileModule(fn.getText(sf), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Script(js + '\n' + name).runInNewContext(bindings) as (...args: unknown[]) => Promise<unknown>;
}
describe('actual spec go and action wiring', () => {
  it.each([8, 4])('go keeps three bounded stages and final%s tolerance; no hidden fourth pulse', async tolerance => {
    const calls: unknown[][] = [], x = { value: 0 };
    const go = actualSpecFunction('go', { expect, c1Hero: () => ({ x: x.value }), rest: () => ({ isVisible: async () => false }),
      action: async (...args: unknown[]) => { calls.push(args); x.value += 1; return 'partial'; } });
    await expect(go({}, pickupAssets, 'initial', 'compute1', 210, tolerance)).rejects.toThrow('Bounded normal-input waypoint');
    expect(calls).toHaveLength(3); for (const call of calls) expect(call.slice(2)).toEqual([1, 'd', 1500, false, true, { reference: 'compute1', target: 210, tolerance, allowRest: false }]);
  });
  it('go returns inside original tolerance without down and allows real rest after one partial stage', async () => {
    let x = 210, visible = false; const action = vi.fn(async () => { visible = true; return 'rest'; });
    const go = actualSpecFunction('go', { expect, c1Hero: () => ({ x }), rest: () => ({ isVisible: async () => visible }), action });
    expect(await go({}, pickupAssets, 'same', 'heal1', 210)).toBe('same'); expect(action).not.toHaveBeenCalled();
    x = 1200; expect(await go({}, pickupAssets, 'initial', 'heal1', 1400, 8, true)).toBe('rest'); expect(action).toHaveBeenCalledTimes(1);
  });
  it('go only reverses on a new original stage and never returns passed control as final success', async () => {
    const calls: unknown[][] = []; let x = 220;
    const action = async (...args: unknown[]) => { calls.push(args); x = calls.length === 1 ? 200 : 210; return 'actual tail'; };
    const go = actualSpecFunction('go', { expect, c1Hero: () => ({ x }), rest: () => ({ isVisible: async () => false }), action });
    expect(await go({}, pickupAssets, 'initial', 'compute1', 210, 4)).toBe('actual tail'); expect(calls.map(c => c[3])).toEqual(['a', 'd']);
  });
  it('action uses one original stage, real tail180, separate preparation proof and actual rest exception', async () => {
    const page = {}, state = { steps: 17, captures: [] as unknown[], preparations: [] as unknown[], navigation: [] as unknown[] }, observed = new WeakMap([[page, state]]);
    const order: string[] = [], batch = { frames: ['tail'], pausedFinal: 'final' }, before = { png: 'actual-before' }; let visible = false;
    const navigate = vi.fn(() => 'qualified navigation'), inspect = vi.fn(() => 'rest final');
    const prepare = vi.fn(async (_p: unknown, config: PickupWaypointConfig, life: { resume(): Promise<unknown>; measure(): Promise<unknown>; remember(p: unknown): void }, current: unknown) => {
      expect(current).toBe(before);
      expect(config).toMatchObject({ target: 210, tolerance: 8, direction: 'd' }); order.push('prepare');
      await life.resume(); const result = await life.measure(); life.remember({ node: null, result: 'partial' }); return result;
    });
    const action = actualSpecFunction('action', { expect, observed, C1, preparePickupWaypoint: prepare, one: async () => { order.push('before'); return before; },
      resume: async () => { order.push('resume'); }, freeze: async () => { order.push('freeze'); },
      deferredPickupWindow: async (_p: unknown, ms: number, freeze: () => Promise<unknown>) => { expect(ms).toBe(180); order.push('tail'); await freeze(); return batch; },
      rest: () => ({ isVisible: async () => visible }), navigationState: navigate, inspectPickups: inspect });
    const config = { reference: 'compute1', target: 210, tolerance: 8, allowRest: false };
    expect(await action(page, pickupAssets, 1, 'd', 1500, false, true, config)).toBe('qualified navigation');
    expect(order).toEqual(['before', 'prepare', 'resume', 'tail', 'freeze']); expect(state.steps).toBe(18); expect(state.captures).toEqual(['tail', 'final']); expect(state.preparations).toHaveLength(1);
    await expect(action(page, pickupAssets, 1, 'd', 1500, false, true, config)).rejects.toThrow('movement-stage budget'); expect(prepare).toHaveBeenCalledTimes(1);
    state.steps = 0; visible = true;
    expect(await action(page, pickupAssets, 1, 'd', 1500, false, true, { ...config, allowRest: true })).toBe('rest final'); expect(navigate).toHaveBeenCalledTimes(1); expect(inspect).toHaveBeenCalledTimes(1);
  });
});

it('browser factory is self-contained after serialization, with the actual source matcher', () => {
  const config = waypointConfig(), r = waypointRig(config);
  const serialized = new Script('(' + createPickupWaypoint.toString() + ')').runInNewContext({ Uint8ClampedArray }) as typeof createPickupWaypoint;
  expect(serialized(config, r.io).inspect(rawWaypoint(config), 12)).toEqual(r.observer.inspect(rawWaypoint(config), 12));
});
it('waypoint default DOM reader clears source-over scratch every RAF and freezes before fake encoding', async () => {
  // This exercises the actual default reader, not a native browser codec or real DOM layout.
  const config = waypointConfig(), pixels = new Uint8ClampedArray(640 * 360 * 4), calls: string[] = [];
  let source = rawWaypoint(config, 100).rgba, frozen = false, time = 0, id = 0;
  const rafs = new Map<number, FrameRequestCallback>(), timers = new Map<number, () => void>(), canvas = { width: 640, height: 360 };
  const ctx = {
    clearRect: (...box: number[]) => { expect(box).toEqual([0, 0, 640, 360]); calls.push('clear'); pixels.fill(0); },
    drawImage: (image: unknown) => { expect(image).toBe(canvas); calls.push('draw');
      for (let i = 0; i < pixels.length; i += 4) { const a = source[i + 3] / 255, p = pixels[i + 3] / 255, alpha = a + p * (1 - a);
        for (let c = 0; c < 3; c++) pixels[i + c] = alpha ? Math.round((source[i + c] * a + pixels[i + c] * p * (1 - a)) / alpha) : 0;
        pixels[i + 3] = Math.round(alpha * 255);
      }
    },
    getImageData: () => { calls.push('read'); return { data: pixels.slice() }; },
    putImageData: (image: { data: Uint8ClampedArray }) => { calls.push('put'); pixels.set(image.data); },
  };
  const copy = { width: 0, height: 0, getContext: () => ctx, toDataURL: () => { calls.push('encode'); return 'data:image/png;base64,AA=='; } };
  const dialog = { getAttribute: () => '暂停前向传播。', getBoundingClientRect: () => ({ width: frozen ? 10 : 0, height: 10 }) };
  vi.stubGlobal('document', { createElement: () => copy, querySelector: (selector: string) => selector === 'canvas' ? canvas : null,
    querySelectorAll: (selector: string) => selector === 'dialog' ? [dialog] : selector === '.hud-cell' ? [{ textContent: 'HP100/100' }] : [] });
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible', display: 'block' })); vi.stubGlobal('performance', { now: () => time });
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { const key = id++; rafs.set(key, fn); return key; });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => rafs.delete(key));
  vi.stubGlobal('window', { setTimeout: (fn: () => void) => { const key = id++; timers.set(key, fn); return key; }, clearTimeout: (key: number) => timers.delete(key) });
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
  const tick = (at: number) => { time = at; const [key, fn] = [...rafs][0]; rafs.delete(key); fn(at); };
  try {
    const observer = createPickupWaypoint(config), done = observer.run(1500); tick(10); source = new Uint8ClampedArray(pixels.length); tick(20);
    source = rawWaypoint(config).rgba; for (let i = 3; i < source.length; i += 4) if (source[i]) source[i] = 128; tick(30);
    source = rawWaypoint(config).rgba; tick(40); expect((await done).reason).toBe('position');
    expect(calls).toEqual(Array.from({ length: 4 }, () => ['clear', 'draw', 'read']).flat());
    expect(() => observer.finish()).toThrow('frozen boundary'); frozen = true; const proof = observer.finish();
    expect(proof.frames.map(f => f.worldX)).toEqual([100, null, null, 203]); expect(calls.slice(12)).toEqual(['put', 'encode']);
    expect(proof.snapshot!.at).toBe(40); expect(rafs.size + timers.size).toBe(0);
  } finally { vi.unstubAllGlobals(); }
});

describe('review206 reentrant waypoint cancellation', () => {
  it.each(['read', 'inspect', 'post-read clock', 'start clock'] as const)('cancel within %s cannot append, snapshot or schedule again', async where => {
    const r = waypointRig(), scheduled = vi.fn(r.io.raf); r.io.raf = scheduled;
    if (where === 'read') r.io.read = () => { r.observer.cancel(); return r.state.raw; };
    if (where === 'inspect') Object.defineProperty(r.state.raw, 'rest', { get: () => { r.observer.cancel(); return false; } });
    if (where === 'post-read clock') { let reads = 0; r.io.now = () => { if (++reads === 3) r.observer.cancel(); return r.state.time; }; }
    if (where === 'start clock') r.io.now = () => { r.observer.cancel(); return 0; };
    const done = r.observer.run(1500); if (where !== 'start clock') r.tick(100);
    expect((await done).reason).toBe('cancelled'); r.state.frozen = true; const proof = r.observer.finish();
    expect(proof.frames).toEqual([]); expect(proof.snapshot).toBeNull(); expect(proof.snapshotFact).toBeNull();
    expect(scheduled).toHaveBeenCalledTimes(where === 'start clock' ? 0 : 1); expect(r.rafs.size + r.timers.size).toBe(0);
  });
  it.each([undefined, null, 0, ''])('read cancel followed by real failure%s does not hide the real error', async failure => {
    const r = waypointRig(); r.io.read = () => { r.observer.cancel(); throw failure; };
    const done = r.observer.run(1500); r.tick(100); expect((await done).reason).toBe('error');
    r.state.frozen = true; const proof = r.observer.finish(); expect(proof.frames).toEqual([]); expect(proof.snapshot).toBeNull();
    expect(proof.result!.problems).toHaveLength(1);
  });
  it('go allowRest=false does not turn actual rest/missing reference into waypoint success', async () => {
    const action = vi.fn(async () => 'rest with collected reference');
    const go = actualSpecFunction('go', { expect, rest: () => ({ isVisible: async () => true }), action,
      c1Hero: (view: string) => { if (view !== 'initial') throw Error('actual reference absent'); return { x: 1200 }; } });
    await expect(go({}, pickupAssets, 'initial', 'heal1', 1400, 8, false)).rejects.toThrow('actual reference absent'); expect(action).toHaveBeenCalledTimes(1);
  });
  it.each(['raf', 'timer'] as const)('scheduling%s failure is terminal without raw/encoding', async phase => {
    const r = waypointRig(); r.io[phase] = () => { throw 0; }; expect((await r.observer.run(1500)).reason).toBe('error');
    expect(r.state.reads).toBe(0); expect(r.rafs.size + r.timers.size).toBe(0);
  });
  it('cancel failures are errors and independent cancellation attempts both run', async () => {
    const r = waypointRig(), calls: string[] = []; r.io.cancelRaf = () => { calls.push('raf'); throw 0; }; r.io.cancelTimer = () => { calls.push('timer'); throw null; };
    const done = r.observer.run(1500); r.observer.cancel(); expect((await done).reason).toBe('error'); expect(calls).toEqual(['raf', 'timer']);
  });
  it('encoder failure is retained and cannot be retried on historical pixels', async () => {
    const r = waypointRig(); r.io.encode = () => { throw 0; }; const done = r.observer.run(1500); r.tick(100); await done; r.state.frozen = true;
    let thrown = false; try { r.observer.finish(); } catch (error) { thrown = true; expect(error).toBe(0); }
    expect(thrown).toBe(true); expect(() => r.observer.finish()).toThrow('boundary');
  });
});

import { withCleanup } from '../e2e/factory-navigation';
function actualAfterEach(bindings: Record<string, unknown>) {
  const code = readFileSync('tests/e2e/pickup-art.spec.ts', 'utf8'), sf = ts.createSourceFile('spec.ts', code, ts.ScriptTarget.Latest, true);
  const call = sf.statements.filter(ts.isExpressionStatement).map(n => n.expression).filter(ts.isCallExpression).find(n => n.expression.getText(sf) === 'test.afterEach');
  if (!call) throw Error('Actual afterEach missing');
  const js = ts.transpileModule('const callback = ' + call.arguments[0].getText(sf), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Script(js + '\ncallback').runInNewContext(bindings) as (...args: unknown[]) => Promise<unknown>;
}
describe('review206 actual afterEach preparation diagnostics', () => {
  it.each([undefined, null, 0, ''])('preparation failure%s cannot suppress legacy evidence/guards or later preparation', async failure => {
    const calls: string[] = [], page = { isClosed: () => false, keyboard: { up: async () => { calls.push('up'); } } };
    const state = { preparations: [{ snapshot: 'first' }, { snapshot: 'second' }], captures: ['original'], navigation: [],
      get errors() { calls.push('errors guard'); return []; }, get writes() { calls.push('writes guard'); return []; } };
    const observed = new WeakMap([[page, state]]), keep = async (_info: unknown, name: string) => { calls.push(name); if (name === 'waypoint-preparation-0') throw failure; };
    const callback = actualAfterEach({ expect, observed, withCleanup, completePickupActions, keep, grab: async () => { calls.push('failure raw'); } });
    await expect(callback({ page }, { status: 'failed', expectedStatus: 'passed' })).rejects.toBe(failure);
    expect(calls.filter(c => c === 'up')).toHaveLength(8);
    expect(calls.slice(8)).toEqual(['failure raw', 'failure-all-acquired-raw', 'errors guard', 'writes guard', 'waypoint-preparation-0', 'waypoint-preparation-1']);
  });
  it('retains original raw failure and independently attempts both failed preparations', async () => {
    const calls: string[] = [], page = { isClosed: () => false, keyboard: { up: async () => {} } };
    const observed = new WeakMap([[page, { preparations: [{ snapshot: 'first' }, { snapshot: 'second' }], captures: [], navigation: [] }]]);
    const keep = async (_info: unknown, name: string) => { calls.push(name); throw name === 'failure-all-acquired-raw' ? null : name === 'waypoint-preparation-0' ? 0 : ''; };
    const callback = actualAfterEach({ expect, observed, withCleanup, completePickupActions, keep, grab: async () => {} });
    const error = await callback({ page }, { status: 'failed', expectedStatus: 'passed' }).catch(e => e);
    if (!(error instanceof Error) || !('cause' in error) || !('cleanupError' in error)) throw Error('Expected combined cleanup error');
    const cleanup = error.cleanupError;
    if (!(cleanup instanceof Error) || !('failures' in cleanup) || !Array.isArray(cleanup.failures)) throw Error('Expected cleanup failures');
    expect(error.cause).toBeNull(); expect(cleanup.failures.map((f: { reason: unknown }) => f.reason)).toEqual([0, '']);
    expect(calls).toEqual(['failure-all-acquired-raw', 'waypoint-preparation-0', 'waypoint-preparation-1']);
  });
});

// R93 near-capped preparation. Generated PNGs are controlled source-stamp fixtures, not native runs.
import { deflateSync } from 'node:zlib';
import { choosePickupApproach, preparePickupWaypoint, type PickupApproach } from '../e2e/pickup-controls';
import { inspectPickups, c1Hero, type PickupCapture } from '../e2e/pickup-pixels';
function fixturePNG(rgba: Uint8ClampedArray, width = 640, height = 360) {
  const crc = (bytes: Buffer) => { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
  const chunk = (kind: string, data: Buffer) => { const type = Buffer.from(kind), result = Buffer.alloc(data.length + 12); result.writeUInt32BE(data.length); type.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc(Buffer.concat([type, data])), data.length + 8); return result; };
  const head = Buffer.alloc(13); head.writeUInt32BE(width); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 6;
  const scan = Buffer.alloc(height * (width * 4 + 1)), raw = Buffer.from(rgba);
  for (let y = 0; y < height; y++) raw.copy(scan, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', head), chunk('IDAT', deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
function pausedFixture(raw: PickupWaypointRead, at = 100): PickupCapture {
  return { png: fixturePNG(raw.rgba), at, hud: [...raw.hud], objective: raw.objective, title: raw.title, notice: raw.notice };
}
function nearPlan(distance = 9, tolerance = 8, direction: 'a' | 'd' = 'd'): PickupApproach {
  return { mode: 'near-capped', sourceAt: 100, worldX: 210 + (direction === 'a' ? distance : -distance), target: 210, tolerance, direction,
    holdLimitMs: Math.min(1500, Math.max(20, Math.round(distance / 190 * 1000))) };
}
function nearMoveRig(plan = nearPlan()) {
  const r = moveRig(); r.port.timer = (fn, ms) => { expect(ms).toBe(plan.holdLimitMs); r.state.fire = fn; return 0; };
  const fire = () => { r.state.time = plan.holdLimitMs; r.state.fire(); };
  return { ...r, plan, fire };
}
describe('paused-before complete native-source near selection', () => {
  it.each(Array.from({ length: 44 }, (_, n) => n))('uses full source pose%s from the supplied PNG, not a cached position', pose => {
    const config = waypointConfig(), capture = pausedFixture(rawWaypoint(config, 198, 477, 258, pose));
    const plan = choosePickupApproach(capture, config);
    expect(plan).toEqual({ ...nearPlan(12), sourceAt: 100 });
    expect(inspectPickups(capture, pickupAssets, 1).hero!.ink).toBeGreaterThan(100);
  });
  it.each([4, 8].flatMap(tolerance => (['a', 'd'] as const).flatMap(direction => [tolerance - 1, tolerance, tolerance + 1, 32, 33].map(distance => ({ tolerance, direction, distance })))))('keeps original band and capped-mode boundary $tolerance/$direction/$distance', ({ tolerance, direction, distance }) => {
    const config = { ...waypointConfig(), tolerance, direction }, x = 210 + (direction === 'a' ? distance : -distance);
    const plan = choosePickupApproach(pausedFixture(rawWaypoint(config, x)), config);
    if (distance > tolerance && distance <= 32) expect(plan).toEqual(nearPlan(distance, tolerance, direction)); else expect(plan).toBeUndefined();
  });
  it.each(['hero', 'reference', 'terrain', 'reference-y', 'reference-duplicate', 'hero-duplicate', 'reference-clipped', 'reference-kind'])('falls back without mixing old coordinates for%s', kind => {
    const config = waypointConfig(), raw = rawWaypoint(config, kind === 'hero' ? null : 201, ['reference', 'reference-y', 'reference-kind', 'reference-clipped'].includes(kind) ? null : 477);
    if (kind === 'terrain') raw.rgba.fill(0, 320 * 640 * 4);
    if (kind === 'reference-y') paint(raw.rgba, config.source.reference, 461, 168);
    if (kind === 'reference-duplicate') paint(raw.rgba, config.source.reference, 520, 164);
    if (kind === 'hero-duplicate') paint(raw.rgba, config.source.hero[0], 260, 293);
    if (kind === 'reference-clipped') paint(raw.rgba, config.source.reference, -16, 164);
    if (kind === 'reference-kind') paint(raw.rgba, pickupAssets.items[2], 461, 164);
    expect(choosePickupApproach(pausedFixture(rawWaypoint(config, 201)), config)).toBeDefined();
    expect(choosePickupApproach(pausedFixture(raw), config)).toBeUndefined();
  });
  it.each([0, 1, 2])('allowRest keeps full feedback regardless of current near source slot%s', slot => {
    const config = { ...waypointConfig(slot), allowRest: true };
    expect(choosePickupApproach(pausedFixture(rawWaypoint(config, 201, config.reference.x)), config)).toBeUndefined();
  });
  it('wrong current direction never silently reuses the requested old position or reverses within a stage', () => {
    const config = waypointConfig(); expect(choosePickupApproach(pausedFixture(rawWaypoint(config, 221)), config)).toBeUndefined();
    expect(choosePickupApproach(pausedFixture(rawWaypoint(config, 221)), { ...config, direction: 'a' })!.holdLimitMs).toBe(58);
  });
  it.each(['HP0/100', 'HP101/100', 'missing'])('genuine public%s error is not ordinary missing-source fallback', hp => {
    const config = waypointConfig(), raw = rawWaypoint(config, 201); raw.hud[0] = hp;
    expect(() => choosePickupApproach(pausedFixture(raw), config)).toThrow('HP');
  });
  it.each([-1, NaN, Infinity])('rejects invalid current capture time%s', at => {
    const config = waypointConfig(); expect(() => choosePickupApproach(pausedFixture(rawWaypoint(config, 201), at), config)).toThrow('capture');
  });
  it('does not swallow PNG decode or wrong native-size errors', () => {
    const config = waypointConfig(), capture = pausedFixture(rawWaypoint(config, 201));
    expect(() => choosePickupApproach({ ...capture, png: 'data:image/png;base64,AA==' }, config)).toThrow();
    expect(() => choosePickupApproach({ ...capture, png: fixturePNG(new Uint8ClampedArray(32 * 32 * 4), 32, 32) }, config)).toThrow('640x360');
  });
});

describe('near cap uses the actual one-direction movement coordinator', () => {
  it.each([[9, 8, 47], [27, 8, 142], [32, 8, 168], [5, 4, 26]])('caps%s pixels/tol%s at%s without starting a held observer', async (distance, tolerance, ms) => {
    const r = nearMoveRig(nearPlan(distance, tolerance)); r.port.observe = vi.fn(async () => { throw Error('Must not observe'); });
    const pending = runPickupWaypointMove(r.port, r.plan); await flush();
    expect(r.state.calls).toEqual(['down']); r.state.time = ms; r.state.fire(); const result = await pending;
    expect(result).toMatchObject({ kind: 'near-limit', observation: null, stopMs: ms, budgetMs: 1500, approach: { holdLimitMs: ms } });
    expect(r.port.observe).not.toHaveBeenCalled(); expect(r.state.calls.filter(x => x === 'down')).toHaveLength(1);
    expect(r.state.calls.filter(x => x === 'up')).toHaveLength(1); expect(r.state.calls).toContain('cancel');
    const calls = [...r.state.calls]; r.state.fire(); expect(r.state.calls).toEqual(calls);
  });
  it('deducts down latency from a pre-down deadline, never adds it to the requested hold', async () => {
    const r = nearMoveRig(); r.port.down = async () => { r.state.calls.push('down'); r.state.time = 30; };
    const pending = runPickupWaypointMove(r.port, r.plan); await flush(); r.fire();
    expect((await pending).stopMs).toBe(47); expect(r.state.calls).not.toContain('observe');
  });
  it.each([47, 48, 1501])('late down completion at%s does not start observation or claim success', async time => {
    const r = nearMoveRig(); r.port.down = async () => { r.state.calls.push('down'); r.state.time = time; };
    const result = await runPickupWaypointMove(r.port, r.plan);
    expect(result).toMatchObject({ kind: 'near-limit', observation: null, stopMs: time });
    expect(r.state.calls).not.toContain('observe'); expect(r.state.calls).toContain('up');
  });
  it('joins a down arriving after the short timer, with the original safe second release', async () => {
    const r = nearMoveRig(), down = deferred<void>(); let settled = false;
    r.port.down = () => { r.state.calls.push('down'); return down.promise; };
    const pending = runPickupWaypointMove(r.port, r.plan).then(value => { settled = true; return value; });
    await flush(); r.fire(); await flush(); expect(settled).toBe(false); expect(r.state.calls).toContain('up');
    down.resolve(); const result = await pending; expect(result.kind).toBe('near-limit');
    expect(r.state.calls.filter(c => c === 'down')).toHaveLength(1); expect(r.state.calls.filter(c => c === 'up')).toHaveLength(2);
    expect(r.state.calls).not.toContain('observe');
  });
  it('joins pending release and cancellation before returning to the original tail', async () => {
    const r = nearMoveRig(), up = deferred<void>(), cancel = deferred<void>(); let settled = false;
    r.port.up = () => { r.state.calls.push('up'); return up.promise; }; r.port.cancel = () => { r.state.calls.push('cancel'); return cancel.promise; };
    const pending = runPickupWaypointMove(r.port, r.plan).then(v => { settled = true; return v; });
    await flush(); r.fire(); await flush(); expect(settled).toBe(false);
    up.resolve(); await flush(); expect(settled).toBe(false); cancel.resolve(); await pending; expect(settled).toBe(true);
  });
  it('owns an immutable copy of the selected cap instead of trusting later caller mutation', async () => {
    const r = nearMoveRig(), original = { ...r.plan }, pending = runPickupWaypointMove(r.port, r.plan);
    await flush(); r.plan.holdLimitMs = 1500; r.plan.worldX = 0; r.state.time = 47; r.state.fire();
    expect((await pending).approach).toEqual(original);
  });
  it.each([{ holdLimitMs: 20 }, { holdLimitMs: 1500 }, { holdLimitMs: NaN }, { sourceAt: -1 }, { sourceAt: Infinity }, { target: NaN }, { worldX: 0 }, { tolerance: 9 }, { direction: 'a' as const }])('invalid near plan%j starts no input or timer', async change => {
    const r = nearMoveRig(), timer = vi.spyOn(r.port, 'timer');
    await expect(runPickupWaypointMove(r.port, { ...r.plan, ...change })).rejects.toThrow('near approach');
    expect(r.state.calls).toEqual([]); expect(timer).not.toHaveBeenCalled();
  });
  it.each(['down', 'up', 'cancel', 'clear'])('retains a real near%s failure while independently cleaning', async phase => {
    const r = nearMoveRig(), error = Error(phase);
    if (phase === 'down') r.port.down = async () => { r.state.calls.push('down'); throw error; };
    if (phase === 'up') r.port.up = async () => { r.state.calls.push('up'); throw error; };
    if (phase === 'cancel') r.port.cancel = async () => { r.state.calls.push('cancel'); throw error; };
    if (phase === 'clear') r.port.cancelTimer = () => { r.state.calls.push('clear'); throw error; };
    const pending = runPickupWaypointMove(r.port, r.plan), rejection = expect(pending).rejects.toBe(error);
    await flush(); if (phase !== 'down') r.fire(); await rejection;
    expect(r.state.calls).toContain('up'); expect(r.state.calls).toContain('cancel'); expect(r.state.calls).toContain('clear'); expect(r.state.calls).not.toContain('observe');
  });
  it.each([undefined, null, 0, ''])('keeps falsy near release%s together with cancellation failure', async primary => {
    const r = nearMoveRig(); r.port.up = async () => { throw primary; }; r.port.cancel = async () => { throw Error('cancel'); };
    const pending = runPickupWaypointMove(r.port, r.plan).then(() => null, error => error);
    await flush(); r.fire(); const error = await pending;
    expect(error.failures.map((f: { phase: string }) => f.phase)).toEqual(['release', 'cancel']); expect(error.failures[0].reason).toBe(primary);
  });
});
describe('near stage lifecycle does not replace final measurement', () => {
  it('keeps one original measurement after all held work and remembers only partial near proof', async () => {
    const r = stageRig(), plan = nearPlan(); r.port.timer = (fn, ms) => { expect(ms).toBe(47); r.state.fire = fn; return 0; };
    const pending = runPickupWaypointStage(r.port, p => r.remembered.push(p), plan); await flush(); r.state.time = 47; r.state.fire();
    expect(await pending).toBe(17); expect(r.state.calls).not.toContain('observe'); expect(r.state.calls.filter(x => x === 'measure')).toHaveLength(1);
    expect(r.state.calls.indexOf('measure')).toBeGreaterThan(r.state.calls.indexOf('up')); expect(r.state.calls.indexOf('measure')).toBeGreaterThan(r.state.calls.indexOf('cancel'));
    expect(r.remembered[0].node).toMatchObject({ kind: 'near-limit', observation: null, budgetMs: 1500, approach: plan });
  });
  it.each(['measure', 'freeze', 'cancel', 'finish', 'dispose'])('near%s failure still attempts every independent teardown', async phase => {
    const r = stageRig(), error = Error(phase); r.port.timer = fn => { r.state.fire = fn; return 0; };
    r.port[phase as 'measure'] = async () => { r.state.calls.push(phase); throw error; };
    const pending = runPickupWaypointStage(r.port, p => r.remembered.push(p), nearPlan()).then(() => null, error => error);
    await flush(); r.state.time = 47; r.state.fire(); expect(await pending).toBeTruthy();
    for (const cleanup of ['freeze', 'cancel', 'finish', 'dispose']) expect(r.state.calls).toContain(cleanup);
    expect(r.state.calls).not.toContain('observe');
  });
});

describe('actual browser adapter with controlled Page ports', () => {
  it('keeps the idle browser proof empty and cancelled, never invents a stopped PNG for near mode', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const config = waypointConfig(), r = waypointRig(config), remembered: PickupWaypointProof[] = [], calls: string[] = [];
    const observer = r.observer;
    const page = { keyboard: { down: async (key: string) => { calls.push('down:' + key); }, up: async (key: string) => { calls.push('up:' + key); } },
      evaluateHandle: async (factory: typeof createPickupWaypoint, actual: PickupWaypointConfig) => {
        expect(factory).toBe(createPickupWaypoint); expect(actual).toBe(config); calls.push('handle');
        return { evaluate: async (fn: (o: typeof observer, arg?: number) => unknown, arg?: number) => { calls.push(fn.toString().includes('.run(') ? 'run' : 'metadata'); return fn(observer, arg); }, dispose: async () => { calls.push('dispose'); } };
      } } as unknown as Parameters<typeof preparePickupWaypoint>[0];
    const final = pausedFixture(rawWaypoint(config, 226));
    try {
      const pending = preparePickupWaypoint(page, config, { resume: async () => { calls.push('resume'); },
        measure: async () => { calls.push('tail180-and-final'); r.state.frozen = true; return final; },
        freeze: async () => { calls.push('freeze'); r.state.frozen = true; }, remember: proof => remembered.push(proof) }, pausedFixture(rawWaypoint(config, 201)));
      await vi.runAllTimersAsync(); expect(await pending).toBe(final);
      expect(calls.filter(s => s.startsWith('down:'))).toEqual(['down:d']); expect(calls.filter(s => s.startsWith('up:'))).toEqual(['up:d']);
      expect(calls).not.toContain('run'); expect(r.state.reads).toBe(0); expect(r.state.encodes).toEqual([]); expect(r.rafs.size + r.timers.size).toBe(0);
      expect(remembered).toHaveLength(1); expect(remembered[0]).toMatchObject({ result: { reason: 'cancelled', problems: [] }, frames: [], snapshot: null, snapshotFact: null,
        node: { kind: 'near-limit', observation: null, budgetMs: 1500, approach: { holdLimitMs: 47, sourceAt: 100, worldX: 201 } } });
      expect(calls.indexOf('tail180-and-final')).toBeGreaterThan(calls.indexOf('up:d')); expect(calls.at(-1)).toBe('dispose');
    } finally { vi.useRealTimers(); }
  });
  it('current PNG read errors escape before handle/resume/input, never masquerade as a far fallback', async () => {
    const config = waypointConfig(), create = vi.fn(), resume = vi.fn(), page = { evaluateHandle: create } as unknown as Parameters<typeof preparePickupWaypoint>[0];
    const capture = pausedFixture(rawWaypoint(config, 201));
    await expect(preparePickupWaypoint(page, config, { resume, measure: vi.fn(), freeze: vi.fn(), remember: vi.fn() }, { ...capture, png: 'data:image/png;base64,AA==' })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled(); expect(resume).not.toHaveBeenCalled();
  });
});
it.each([4, 8])('actual go still rejects after three near partial stages outside final tolerance%s', async tolerance => {
  const config = { ...waypointConfig(), tolerance }, initial = inspectPickups(pausedFixture(rawWaypoint(config, 201)), pickupAssets, 1), calls: PickupApproach[] = [];
  const go = actualSpecFunction('go', { expect, c1Hero, rest: () => ({ isVisible: async () => false }),
    action: async (_page: unknown, _source: unknown, stage: number, direction: 'a' | 'd', ms: number) => {
      expect(stage).toBe(1); expect(ms).toBe(1500); const plan = choosePickupApproach(initial.capture, { ...config, direction });
      expect(plan).toBeDefined(); calls.push(plan!); const r = nearMoveRig(plan!); const pending = runPickupWaypointMove(r.port, plan); await flush(); r.fire();
      expect((await pending).kind).toBe('near-limit'); return initial; // Measured tail did not reach target; partial must not pass go.
    } });
  await expect(go({}, pickupAssets, initial, 'compute1', 210, tolerance)).rejects.toThrow('Bounded normal-input waypoint'); expect(calls).toHaveLength(3);
});
