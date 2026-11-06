import { createRequire } from 'node:module';
import { inspect } from 'node:util';
import { describe, expect, test } from 'vitest';
import { formatMirrorFailure, observeMirrorRightWithDash } from '../e2e/mirror-controls';
const { serializeError } = createRequire(import.meta.url)('../../node_modules/playwright/lib/util.js') as { serializeError: (error: unknown) => { message?: string; cause?: unknown; confirmationError?: unknown } };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function watch<T>(operation: Promise<T>) {
  const state = { settled: false };
  const outcome = operation.then(value => { state.settled = true; return { ok: true, value } as const; }, reason => { state.settled = true; return { ok: false, reason } as const; });
  return { state, outcome };
}
function run() {
  const read = deferred<object>(), confirm = deferred<void>(), calls: string[] = [];
  const original = Object.freeze({ captureId: 'unit marker,not native evidence' });
  const task = watch(observeMirrorRightWithDash(() => { calls.push('observe'); return read.promise; }, () => { calls.push('confirm'); return confirm.promise; }));
  return { read, confirm, calls, original, ...task };
}
const faults: [string, unknown][] = [['error', Error('native-callback sentinel')], ['undefined', undefined], ['null', null], ['false', false], ['zero', 0], ['empty', ''], ['nan', NaN]];
describe('actual mirror concurrent helper,not synthetic native proof', () => {
  test.each(['observe', 'confirm'])('%s can finish first;both start once and both settle before returning original', async first => {
    const r = run(); expect(r.calls).toEqual([]); await tick(); expect(r.calls).toEqual(['observe', 'confirm']);
    if (first === 'observe') r.read.resolve(r.original); else r.confirm.resolve();
    await tick(); expect(r.state.settled).toBe(false);
    if (first === 'observe') r.confirm.resolve(); else r.read.resolve(r.original);
    const out = await r.outcome; expect(out.ok).toBe(true); if (!out.ok) throw out.reason;
    expect(out.value).toBe(r.original); expect(r.calls).toEqual(['observe', 'confirm']);
  });
  test.each(['observe', 'confirm'])('%s early rejection waits for the other task,retains exact cause', async first => {
    const r = run(), error = Error(first); await tick();
    if (first === 'observe') r.read.reject(error); else r.confirm.reject(error);
    await tick(); expect(r.state.settled).toBe(false);
    if (first === 'observe') r.confirm.resolve(); else r.read.resolve(r.original);
    const out = await r.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('Unexpected success');
    expect(out.reason).toBe(error); expect(r.calls).toEqual(['observe', 'confirm']);
  });
  test.each(['observe', 'confirm'])('%s synchronous throw still starts and joins the other callback', async first => {
    const other = deferred<void>(), error = Error(first), calls: string[] = [];
    const invoke = (name: string) => { calls.push(name); if (name === first) throw error; return other.promise; };
    const task = watch(observeMirrorRightWithDash(() => invoke('observe'), () => invoke('confirm')));
    await tick(); expect(calls).toEqual(['observe', 'confirm']); expect(task.state.settled).toBe(false);
    other.resolve(); const out = await task.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('Unexpected success');
    expect(out.reason).toBe(error); expect(calls).toEqual(['observe', 'confirm']);
  });
  test('confirmation failure cannot escape an observation still restoring in finally', async () => {
    const restore = deferred<void>(), error = Error('confirmation'), calls: string[] = [];
    const task = watch(observeMirrorRightWithDash(async () => {
      try { calls.push('observed'); return 42; }
      finally { calls.push('restoring'); await restore.promise; calls.push('restored'); }
    }, async () => { throw error; }));
    await tick(); expect(calls).toEqual(['observed', 'restoring']); expect(task.state.settled).toBe(false);
    restore.resolve(); const out = await task.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('Unexpected success');
    expect(out.reason).toBe(error); expect(calls).toEqual(['observed', 'restoring', 'restored']);
  });
  test.each(faults)('observation rejects %s without wrapping or retry', async (_name, reason) => {
    let reads = 0, confirms = 0;
    await expect(observeMirrorRightWithDash(async () => { reads++; throw reason; }, async () => { confirms++; })).rejects.toBe(reason);
    expect([reads, confirms]).toEqual([1, 1]);
  });
  test.each(faults)('confirmation rejects %s without wrapping or retry', async (_name, reason) => {
    let reads = 0, confirms = 0;
    await expect(observeMirrorRightWithDash(async () => { reads++; return 7; }, async () => { confirms++; throw reason; })).rejects.toBe(reason);
    expect([reads, confirms]).toEqual([1, 1]);
  });
  test.each(['observe', 'confirm'])('%s rejects first;both original causes survive only after both settle', async first => {
    const r = run(), observation = Error('observation'), confirmation = Error('confirmation'); await tick();
    if (first === 'observe') r.read.reject(observation); else r.confirm.reject(confirmation);
    await tick(); expect(r.state.settled).toBe(false);
    if (first === 'observe') r.confirm.reject(confirmation); else r.read.reject(observation);
    const out = await r.outcome; expect(out.ok).toBe(false); if (out.ok) throw Error('Unexpected success');
    const error = out.reason as Error & { cause: unknown; confirmationError: unknown };
    expect(error.cause).toBe(observation); expect(error.confirmationError).toBe(confirmation); expect(r.calls).toEqual(['observe', 'confirm']);
  });
  test.each(faults)('double %s reasons survive in memory and in actual installed Playwright report messages', async (_name, reason) => {
    const out = await watch(observeMirrorRightWithDash(async () => { throw reason; }, async () => { throw reason; })).outcome;
    expect(out.ok).toBe(false); if (out.ok) throw Error('Unexpected success');
    const error = out.reason as Error & { cause: unknown; confirmationError: unknown };
    expect(error).toHaveProperty('cause'); expect(error.cause).toBe(reason);
    expect(error).toHaveProperty('confirmationError'); expect(error.confirmationError).toBe(reason);
    const reported = serializeError(error), raw = inspect(reason, { depth: 4, maxArrayLength: 16, maxStringLength: 4096, getters: false, customInspect: false });
    const expected = raw.length <= 4096 ? raw : raw.slice(0, 4096) + '...[truncated]';
    expect(reported.message).toContain(`Observation: ${expected}`); expect(reported.message).toContain(`Confirmation: ${expected}`);
  });
  test('actual report serializer drops raw custom fields and falsy cause:negative control', () => {
    const raw = Object.assign(Error('both failed'), { cause: false, confirmationError: Error('confirmation') });
    const reported = serializeError(raw);
    expect(reported.cause).toBeUndefined(); expect(reported).not.toHaveProperty('confirmationError');
    expect(reported.message).not.toContain('Confirmation:');
  });
  test('bounded diagnostics do not invoke getters or custom inspect hooks', async () => {
    let invoked = 0;
    const reason = { get secret() { invoked++; throw Error('getter'); }, [inspect.custom]() { invoked++; throw Error('custom inspect'); } };
    const out = await watch(observeMirrorRightWithDash(async () => { throw reason; }, async () => { throw reason; })).outcome;
    expect(out.ok).toBe(false); if (out.ok) throw Error('Unexpected success');
    expect(invoked).toBe(0); expect((out.reason as { confirmationError: unknown }).confirmationError === reason).toBe(true);
    const reported = serializeError(out.reason); expect(reported.message).toContain('Observation:'); expect(invoked).toBe(0);
  });
  test('each diagnostic has its own bound,so a long observation cannot remove confirmation', async () => {
    const reason = 'x'.repeat(20000), second = 'y'.repeat(20000);
    const out = await watch(observeMirrorRightWithDash(async () => { throw reason; }, async () => { throw second; })).outcome;
    expect(out.ok).toBe(false); if (out.ok) throw Error('Unexpected success');
    const error = out.reason as Error & { cause: unknown; confirmationError: unknown };
    expect(error.cause).toBe(reason); expect(error.confirmationError).toBe(second);
    const text = serializeError(error).message!;
    expect(text).toContain('Observation:'); expect(text).toContain('Confirmation:'); expect(text).toContain('[truncated]'); expect(text.length).toBeLessThan(8400);
  });
  test('real Node inspect handles an inaccessible stack without replacing the original causes', async () => {
    const reason = Error('inaccessible stack');
    Object.defineProperty(reason, 'stack', { get() { throw Error('stack getter'); } });
    const out = await watch(observeMirrorRightWithDash(async () => { throw reason; }, async () => { throw null; })).outcome;
    expect(out.ok).toBe(false); if (out.ok) throw Error('Unexpected success');
    const error = out.reason as Error & { cause: unknown; confirmationError: unknown };
    expect(error.cause).toBe(reason); expect(error.confirmationError).toBeNull();
    expect(error.message).toContain('Observation:'); expect(error.message).toContain('Confirmation: null');
  });
  test('actual diagnostic catch shields a throwing formatter and retains the untouched argument', () => {
    const reason = Object.freeze({ detail: 'original' }), fault = Error('format failed'); let calls = 0; let seen: unknown;
    const text = formatMirrorFailure(reason, value => { calls++; seen = value; throw fault; });
    expect(text).toBe('<diagnostic unavailable>'); expect(calls).toBe(1); expect(seen === reason).toBe(true); expect(reason).toEqual({ detail: 'original' });
  });
});
