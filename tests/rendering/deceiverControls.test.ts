import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createDeceiverJumpCapture, assertDeceiverCaptureCompleted, keepDeceiverDiagnostic, type DeceiverCapturePort, type DeceiverPointerEdge } from '../e2e/deceiver-controls';
import { finishDeceiverJump, prepareDeceiverJump, nextDeceiverJumpFrame } from '../e2e/deceiver-native';
const serial = createRequire(import.meta.url)('../../node_modules/playwright-core/lib/utils/isomorphic/utilityScriptSerializers.js') as {
  serializeAsCallArgument(value: unknown, handle: (value: unknown) => { fallThrough: unknown }): unknown;
  parseEvaluationResultValue(value: unknown): unknown;
};
const roundtrip = (value: unknown) => serial.parseEvaluationResultValue(serial.serializeAsCallArgument(value, v => ({ fallThrough: v })));
const paint = (a: Uint8ClampedArray, x: number, y: number, w: number, h: number, rgb: number, alpha = 255) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) a.set([rgb >> 16 & 255, rgb >> 8 & 255, rgb & 255, alpha], (yy * 640 + xx) * 4);
};
function pixels(eligible = false, marker = 1) {
  const a = new Uint8ClampedArray(640 * 360 * 4); a[0] = marker;
  paint(a, 200, eligible ? 220 : 260, 8, 10, 0xd97757);
  paint(a, 340, 230, 8, 8, 0x723f68); paint(a, 360, 217, 10, 10, 0xfb886f); return a;
}
const edge = (type: string, at: number): DeceiverPointerEdge => ({ type, at, trusted: true, button: 0, target: 'CANVAS', x: 729, y: 443 });
function rig(initial = pixels()) {
  let data = initial, id = 0, readCount = 0, cleanCount = 0, maxPending = 0, listener: ((e: DeceiverPointerEdge) => void) | null = null;
  const queue = new Map<number, (at: number) => void>(), callbacks: ((at: number) => void)[] = [];
  const errors = new Map<string, unknown>(), encoded: number[] = [], cancelled: number[] = [];
  const rect = { x: 0, y: 0, width: 1280, height: 720 }, hud = ['HP100'];
  const fail = (key: string) => { if (errors.has(key)) throw errors.get(key); };
  const port: DeceiverCapturePort = {
    raf: cb => { fail('raf'); queue.set(++id, cb); callbacks.push(cb); maxPending = Math.max(maxPending, queue.size); return id; },
    cancel: n => { cancelled.push(n); fail('cancel'); queue.delete(n); },
    read: at => { readCount++; fail('read'); return { rgba: data, at, sampledAt: at + 2, rect, hud, notice: 'original' }; },
    listen: cb => { fail('listen'); listener = cb; return () => { cleanCount++; fail('clean'); listener = null; }; },
    encode: a => { expect(queue.size).toBe(0); fail('encode'); encoded.push(a[0]); return 'captured-' + a[0]; },
  };
  const capture = createDeceiverJumpCapture(port);
  return { capture, port, queue, callbacks, errors, encoded, cancelled, rect, hud,
    data: (value: Uint8ClampedArray) => { data = value; }, emit: (e: DeceiverPointerEdge) => listener?.(e),
    counts: () => ({ readCount, cleanCount, maxPending }),
    tick: (at: number) => { expect(queue.size).toBe(1); const [n, cb] = [...queue][0]; queue.delete(n); cb(at); },
  };
}
async function next(r: ReturnType<typeof rig>, at: number) { const p = r.capture.next(); r.tick(at); return p; }
function click(r: ReturnType<typeof rig>, at = 100) { r.emit(edge('pointerdown', at)); r.emit(edge('pointerup', at + 20)); }
afterEach(() => vi.unstubAllGlobals());
describe('actual single Deceiver observer contracts, not native gameplay proof', () => {
  test('construction never samples and unqualified finish never searches for a later success', async () => {
    const r = rig(pixels(true)); expect(r.queue.size).toBe(0); expect(r.counts().readCount).toBe(0);
    const result = await r.capture.finish(); expect(result.approach).toEqual([]); expect(result.frames).toEqual([]);
    expect(result.budget.firstAt).toBeNull(); expect(r.counts().cleanCount).toBe(1);
    expect(await r.capture.finish()).toBe(result); expect(r.counts().cleanCount).toBe(1);
  });
  test('first qualification starts only one shot chain and original immutable bytes encode only after it stops', async () => {
    const raw = pixels(false, 1), r = rig(raw), first = await next(r, 0);
    expect('png' in first).toBe(false); expect(r.encoded).toEqual([]); expect(r.queue.size).toBe(0);
    raw.set(pixels(true, 2)); r.rect.x = 99; r.hud[0] = 'later';
    const aim = await next(r, 100); expect(aim.captureId).toBe(1);
    first.hud[0] = 'caller-mutated'; first.rect.width = 1; first.pixels.heroCount = 0;
    raw.fill(0); raw[0] = 3; r.tick(200); click(r, 201);
    const finishing = r.capture.finish(); expect(r.encoded).toEqual([]);
    r.tick(1099); expect(r.encoded).toEqual([]); r.tick(1100);
    const result = await finishing;
    expect(result.budget).toMatchObject({ firstAt: 0, selectedId: 1, shotStart: 200, shotEnd: 1100, approachFrames: 2, shotFrames: 3 });
    expect(result.approach[0]).toMatchObject({ png: 'captured-1', hud: ['HP100'], rect: { x: 0, width: 1280 }, pixels: { heroCount: 80 } });
    expect(result.approach[1].png).toBe('captured-2'); expect(result.frames.map(f => f.png)).toEqual(['captured-3', 'captured-3', 'captured-3']);
    expect(result.problems).toEqual([]); expect(r.counts()).toEqual({ readCount: 5, cleanCount: 1, maxPending: 1 });
    await expect(r.capture.next()).rejects.toThrow('not active'); expect(r.queue.size).toBe(0);
  });
  test.each([900, 900.001])('original900 boundary%s is checked before auto-arm, preserving the late frame', async at => {
    const r = rig(); await next(r, 0); r.data(pixels(true)); await next(r, at);
    expect(r.queue.size).toBe(at === 900 ? 1 : 0);
    if (at === 900) { click(r, 901); r.tick(916); r.tick(1816); }
    const result = await r.capture.finish(); expect(result.approach).toHaveLength(2);
    expect(result.budget.selectedId).toBe(at === 900 ? 1 : null); expect(result.budget.firstAt).toBe(0);
  });
  test.each([false, true])('frame40 is allowed but41 is never requested;final qualifies%s', async finalQualifies => {
    const r = rig(); for (let i = 0; i < 39; i++) await next(r, i * 10);
    r.data(pixels(finalQualifies)); await next(r, 390);
    await expect(r.capture.next()).rejects.toThrow(finalQualifies ? 'not active' : '40-frame');
    expect(r.counts().readCount).toBe(40);
    if (finalQualifies) { click(r, 391); r.tick(400); r.tick(1300); }
    const result = await r.capture.finish(); expect(result.budget.selectedId).toBe(finalQualifies ? 39 : null);
    expect(result.approach).toHaveLength(40); expect(r.counts().maxPending).toBe(1);
  });
  test('concurrent next is refused without starting a second RAF or renewing the first request', async () => {
    const r = rig(), p = r.capture.next(); await expect(r.capture.next()).rejects.toThrow('Concurrent');
    expect(r.queue.size).toBe(1); r.tick(0); await p; expect(r.counts().readCount).toBe(1);
    await r.capture.finish(); expect(r.counts().maxPending).toBe(1);
  });
  test('first qualification is locked even before shot ends and cannot be replaced by a later pose', async () => {
    const r = rig(pixels(true, 7)), aim = await next(r, 100);
    r.data(pixels(true, 8)); await expect(r.capture.next()).rejects.toThrow('not active');
    click(r, 105); r.tick(116); r.tick(1016); const result = await r.capture.finish();
    expect(result.budget.selectedId).toBe(aim.captureId); expect(result.approach.map(f => f.png)).toEqual(['captured-7']);
    expect(result.frames.map(f => f.png)).toEqual(['captured-8', 'captured-8']);
  });
  test('cancel settles pending next, ignores a late callback and remains idempotent', async () => {
    const r = rig(), p = r.capture.next(), late = r.callbacks[0]; r.capture.cancel();
    await expect(p).rejects.toThrow('stopped'); late(100); r.capture.cancel();
    const result = await r.capture.finish(); expect(result.problems).toContain('Capture explicitly cancelled');
    expect(result.approach).toEqual([]); expect(r.counts()).toEqual({ readCount: 0, cleanCount: 1, maxPending: 1 });
  });
  test('finish before qualification settles pending next without another sample', async () => {
    const r = rig(), p = r.capture.next(), finishing = r.capture.finish();
    await expect(p).rejects.toThrow('stopped'); await finishing;
    expect(r.counts().readCount).toBe(0); expect(r.queue.size).toBe(0);
  });
  test.each([0, NaN, Infinity, -Infinity])('backwards or invalid RAF%s never resets either deadline', async at => {
    const r = rig(); await next(r, 10); const p = r.capture.next(); r.tick(at);
    await expect(p).rejects.toThrow('timestamp'); const result = await r.capture.finish();
    expect(result.approach).toHaveLength(1); expect(result.budget.firstAt).toBe(10); expect(r.queue.size).toBe(0);
  });
  test.each([Error('read'), null, undefined, 0, false])('read failure%j retains primary, settles and records independent cleanup failure', async error => {
    const r = rig(); r.errors.set('read', error); r.errors.set('clean', Error('remove'));
    const p = r.capture.next(); r.tick(0); await expect(p).rejects.toBe(error);
    const result = await r.capture.finish(); expect(result.failure?.primary).toBe(error);
    expect(result.problems).toEqual(['capture: ' + String(error), 'listeners: Error: remove']);
    expect(r.counts().cleanCount).toBe(1); expect(r.queue.size).toBe(0);
  });
  test('shot read failure cannot renew qualification or hide behind valid initial pixels', async () => {
    const r = rig(pixels(true)); await next(r, 100); const failure = Error('shot read'); r.errors.set('read', failure);
    r.tick(116); const result = await r.capture.finish(); expect(result.failure?.primary).toBe(failure);
    expect(result.frames).toEqual([]); expect(result.approach).toHaveLength(1);
    await expect(r.capture.next()).rejects.toThrow('not active');
  });
  test('RAF installation error cleans listeners and never reads or emits input', async () => {
    const r = rig(), error = Error('raf'); r.errors.set('raf', error);
    await expect(r.capture.next()).rejects.toBe(error); const result = await r.capture.finish();
    expect(result.failure?.primary).toBe(error); expect(r.counts()).toEqual({ readCount: 0, cleanCount: 1, maxPending: 0 });
  });
  test('cancel and listener failures both settle;late cancelled callback cannot sample', async () => {
    const r = rig(), p = r.capture.next(); r.errors.set('cancel', Error('cancel')); r.errors.set('clean', Error('clean'));
    r.capture.cancel(); await expect(p).rejects.toThrow('stopped'); r.tick(100);
    const result = await r.capture.finish(); expect(result.problems).toEqual(['Capture explicitly cancelled', 'cancel: Error: cancel', 'listeners: Error: clean']);
    expect(r.counts().readCount).toBe(0);
  });
  for (const invalid of ['missing-actor', 'actor79', 'hero245', 'too-far-from-core', 'no-core', 'purple30', 'core30', 'soft-actor'] as const) {
    test('original classifier refuses ' + invalid + ' without arming shot', async () => {
      const a = pixels(true);
      if (['missing-actor', 'hero245', 'too-far-from-core'].includes(invalid)) paint(a, 200, 220, 8, 10, 0, 0);
      if (invalid === 'hero245') paint(a, 200, 241, 10, 9, 0xd97757);
      if (invalid === 'too-far-from-core') paint(a, 200, 230, 8, 10, 0xd97757);
      if (invalid === 'actor79') paint(a, 200, 220, 1, 1, 0, 0);
      if (invalid === 'soft-actor') paint(a, 200, 220, 8, 10, 0xd97757, 254);
      if (invalid === 'purple30') { paint(a, 340, 230, 8, 8, 0, 0); paint(a, 340, 230, 5, 6, 0x723f68); }
      if (invalid === 'no-core' || invalid === 'core30') { paint(a, 360, 217, 10, 10, 0, 0); if (invalid === 'core30') paint(a, 360, 217, 5, 6, 0xfb886f); }
      const r = rig(a); await next(r, 0); expect(r.queue.size).toBe(0);
      const result = await r.capture.finish(); expect(result.budget.selectedId).toBeNull(); expect(result.frames).toEqual([]);
    });
  }
  test('original connected-component classifier preserves actual pixel coordinates and dimensions', async () => {
    const r = rig(pixels(true)); await next(r, 0); click(r, 4);
    const a = pixels(true); paint(a, 250, 220, 5, 5, 0xf3aa78); r.data(a); r.tick(16);
    paint(a, 250, 220, 5, 5, 0, 0); paint(a, 270, 220, 5, 5, 0xf3aa78); r.tick(49); r.tick(916);
    const result = await r.capture.finish();
    expect(result.frames[0].pixels.shots).toEqual([{ x: 252, y: 222, width: 5, height: 5, count: 25 }]);
    expect(result.frames[1].pixels.shots).toEqual([{ x: 272, y: 222, width: 5, height: 5, count: 25 }]);
    expect(result.problems).toEqual([]);
  });
  test.each(['zero', 'multiple', 'untrusted', 'wrong-target', 'wrong-button', 'reversed', 'long-held', 'negative-held', 'nonfinite'])('invalid pointer%s fails without generating or replacing clicks', async mode => {
    const r = rig(pixels(true)); await next(r, 0);
    const sequence = [edge('pointerdown', 20), edge('pointerup', 40)];
    if (mode === 'zero') sequence.length = 0;
    if (mode === 'multiple') sequence.push(edge('pointerdown', 50), edge('pointerup', 70));
    if (mode === 'untrusted') sequence[0].trusted = false;
    if (mode === 'wrong-target') sequence[0].target = 'BUTTON';
    if (mode === 'wrong-button') sequence[0].button = 1;
    if (mode === 'reversed') sequence.reverse();
    if (mode === 'long-held') sequence[1].at = 205;
    if (mode === 'negative-held') sequence[1].at = 19;
    if (mode === 'nonfinite') sequence[1].at = NaN;
    sequence.forEach(r.emit); r.tick(16); r.tick(916); const result = await r.capture.finish();
    expect(result.problems).toContain('Expected one trusted canvas click held below185ms'); expect(result.edges).toEqual(sequence);
    expect(result.budget.shotStart).toBe(16); expect(result.budget.shotEnd).toBe(916);
  });
  test('shot safety cap rejects an unbounded high-frequency stream rather than extending the window', async () => {
    const r = rig(pixels(true)); await next(r, 0); click(r);
    for (let i = 1; i <= 257; i++) r.tick(i);
    const result = await r.capture.finish(); expect(result.frames).toHaveLength(256);
    expect(result.problems).toContain('capture: Error: Shot frame safety cap exceeded'); expect(r.queue.size).toBe(0);
  });
  test('pointer safety cap stops instead of dropping early unwanted clicks and keeping a successful pair', async () => {
    const r = rig(pixels(true)); await next(r, 0);
    for (let i = 0; i < 17; i++) r.emit(edge(i % 2 ? 'pointerup' : 'pointerdown', i));
    const result = await r.capture.finish(); expect(result.edges).toHaveLength(16);
    expect(result.problems).toContain('Pointer edge safety cap exceeded'); expect(r.queue.size).toBe(0);
  });
  test.each(['length', 'at', 'sampledAt'])('invalid raw%s is refused before it can qualify', async field => {
    const r = rig(pixels(true)), read = r.port.read;
    r.port.read = at => { const raw = read(at); if (field === 'length') raw.rgba = new Uint8ClampedArray(4); else if (field === 'at') raw.at++; else raw.sampledAt = NaN; return raw; };
    const p = r.capture.next(); r.tick(0); await expect(p).rejects.toThrow('Invalid original frame');
    const result = await r.capture.finish(); expect(result.approach).toEqual([]); expect(result.budget.selectedId).toBeNull();
  });
  function handle(r: ReturnType<typeof rig>, dispose: () => Promise<void>) {
    return { evaluate: async (f: (value: typeof r.capture) => unknown) => roundtrip(await f(r.capture)), dispose } as unknown as Parameters<typeof finishDeceiverJump>[0];
  }
  test('actual finish adapter disposes after collection and retains protocol plus disposal failures', async () => {
    const r = rig(); let disposed = 0;
    const result = await finishDeceiverJump(handle(r, async () => { disposed++; }));
    expect(result.approach).toEqual([]); expect(disposed).toBe(1);
    const cleanupError = Error('dispose');
    const broken = { evaluate: async () => { throw undefined; }, dispose: async () => { throw cleanupError; } } as unknown as Parameters<typeof finishDeceiverJump>[0];
    await expect(finishDeceiverJump(broken)).rejects.toMatchObject({ cause: undefined, cleanupError });
  });
  test.each([undefined, { kind: 'read-failed' }])('actual factory/adapter/diagnostic forwarding preserves primary%j and cleanup', async primary => {
    const r = rig(pixels(true)); await next(r, 0); const cleanup = Error('listeners');
    r.errors.set('read', primary); r.errors.set('clean', cleanup); r.tick(16);
    const diagnostics: Error[] = []; let disposed = 0;
    await keepDeceiverDiagnostic(diagnostics, 'collect', async () => {
      const result = await finishDeceiverJump(handle(r, async () => { disposed++; })); assertDeceiverCaptureCompleted(result);
    });
    expect(disposed).toBe(1); expect(diagnostics).toHaveLength(1);
    const forwarded = (diagnostics[0] as Error & { cause: unknown }).cause as { captureFailure: { primary: unknown }; cleanupFailures: { error: unknown }[] };
    expect(forwarded.captureFailure.primary).toEqual(primary); expect(forwarded.cleanupFailures[0].error).toEqual(cleanup);
  });
  test('actual forwarding retains capture,cleanup,encoding and disposal rather than replacing the first cause', async () => {
    const r = rig(pixels(true)); await next(r, 0);
    const primary = Error('read'), cleanup = Error('listeners'), encodingError = Error('encode'), disposalError = Error('dispose');
    r.errors.set('read', primary); r.errors.set('clean', cleanup); r.tick(16); r.errors.set('encode', encodingError);
    const diagnostics: Error[] = [];
    await keepDeceiverDiagnostic(diagnostics, 'collect', () => finishDeceiverJump(handle(r, async () => { throw disposalError; })));
    expect(diagnostics).toHaveLength(1);
    const forwarded = (diagnostics[0] as Error & { cause: unknown }).cause as { cause: { primary: unknown; encodingError: unknown; cleanupFailures: { error: unknown }[] }; cleanupError: unknown };
    expect(forwarded.cause.primary).toEqual(primary); expect(forwarded.cause.encodingError).toEqual(encodingError);
    expect(forwarded.cause.primary).not.toBe(primary);
    expect(forwarded.cause.cleanupFailures[0].error).toEqual(cleanup); expect(forwarded.cleanupError).toBe(disposalError);
  });
  test.each([false, true])('default DOM listener installation rolls back both edges and preserves double failure%s', async cleanupFails => {
    const primary = Error('install-up'), removal = Error('remove'); const added: unknown[][] = [], removed: unknown[][] = [];
    vi.stubGlobal('document', { querySelector: () => ({ width: 640, height: 360 }), createElement: () => ({ getContext: () => ({}) }) });
    vi.stubGlobal('window', {
      addEventListener: (...args: unknown[]) => { added.push(args); if (added.length === 2) throw primary; },
      removeEventListener: (...args: unknown[]) => { removed.push(args); if (cleanupFails) throw removal; },
    });
    let caught: unknown; const capture = createDeceiverJumpCapture(); try { await capture.next(); } catch (error) { caught = error; }
    expect(added.map(a => a[0])).toEqual(['pointerdown', 'pointerup']);
    expect(added.every(a => JSON.stringify(a[2]) === JSON.stringify({ capture: true, passive: true }))).toBe(true);
    expect(removed.map(a => a[0])).toEqual(['pointerdown', 'pointerup']); expect(removed.every(a => a[2] === true)).toBe(true);
    if (cleanupFails) expect(caught).toMatchObject({ cause: primary, cleanupError: { causes: [removal, removal] } });
    else expect(caught).toBe(primary);
  });
  test('serialized browser factory is self-contained rather than depending on module closures', async () => {
    const r = rig(); await r.capture.finish();
    const isolated = runInNewContext('(' + createDeceiverJumpCapture.toString() + ')') as typeof createDeceiverJumpCapture;
    const capture = isolated(r.port), p = capture.next(); r.tick(0); const f = await p;
    expect(f.pixels.heroCount).toBe(80); expect((await capture.finish()).approach[0].png).toBe('captured-1');
  });
  test('real Playwright serializer demonstrably strips an extended Error;DTO path does not rely on it', () => {
    const error = Object.assign(Error('capture'), { primary: false, cleanupError: Error('cleanup') });
    const result = roundtrip(error); expect(result).toBeInstanceOf(Error);
    expect(result).not.toHaveProperty('primary'); expect(result).not.toHaveProperty('cleanupError');
  });
  test('real wire roundtrip preserves original positive geometry and deferred image without rewriting time', async () => {
    const r = rig(pixels(true, 9)); let disposed = 0; const h = handle(r, async () => { disposed++; });
    const p = nextDeceiverJumpFrame(h); r.tick(100); const aim = await p;
    click(r, 105); r.tick(116); r.tick(1016); const result = await finishDeceiverJump(h);
    expect(result.approach[0]).toEqual({ ...aim, png: 'captured-9' });
    expect(result.budget.shotStart).toBe(116); expect(result.budget.shotEnd).toBe(1016);
    expect(result.failure).toBeNull(); expect(result.problems).toEqual([]); expect(disposed).toBe(1);
  });
  test.each([undefined, false, Error('next-read')])('real next wire preserves a controlled primary%j without posing as RPC failure', async primary => {
    const r = rig(pixels(true)); r.errors.set('read', primary); const h = handle(r, async () => {});
    const p = nextDeceiverJumpFrame(h); r.tick(100); await expect(p).rejects.toEqual(primary);
    const result = await finishDeceiverJump(h); expect(result.failure?.primary).toEqual(primary);
    expect(result.frames).toEqual([]); expect(r.queue.size).toBe(0);
  });
  test.each([false, true])('actual prepare checks failed setup DTO and disposes its handle,dispose fails%s', async badDispose => {
    const r = rig(); await r.capture.finish(); const primary = Error('setup'), cleanup = Error('remove'), disposal = Error('dispose');
    const setupError = Object.assign(Error('setup and cleanup'), { cause: primary, cleanupError: cleanup });
    const failed = createDeceiverJumpCapture({ ...r.port, listen: () => { throw setupError; } });
    let disposed = 0;
    const h = { evaluate: async (f: (c: typeof failed) => unknown) => roundtrip(await f(failed)), dispose: async () => { disposed++; if (badDispose) throw disposal; } };
    const page = { evaluateHandle: async () => h } as unknown as Parameters<typeof prepareDeceiverJump>[0];
    const operation = prepareDeceiverJump(page);
    if (badDispose) await expect(operation).rejects.toMatchObject({ cause: { cause: primary, cleanupError: cleanup }, cleanupError: disposal });
    else await expect(operation).rejects.toMatchObject({ cause: primary, cleanupError: cleanup });
    expect(disposed).toBe(1); expect(r.counts().readCount).toBe(0);
  });
});
