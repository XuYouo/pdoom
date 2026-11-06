import { describe, expect, test } from 'vitest';
import { createLifecycleEvidence, type LifecyclePort } from '../e2e/browser-lifecycle-evidence';
function fixture() {
  let now = 100, closed = false, connected: boolean | null = true;
  const callbacks = new Map<string, () => void>(), removed: string[] = [];
  const names = ['page-close', 'page-crash', 'context-close', 'browser-disconnected'] as const;
  const port: LifecyclePort = { now: () => now, pageClosed: () => closed, browserConnected: () => connected,
    hooks: names.map(event => ({ event, subscribe: callback => { callbacks.set(event, callback); return () => { removed.push(event); callbacks.delete(event); }; } })) };
  return { port, callbacks, removed, names, state(time: number, pageClosed: boolean, browserConnected: boolean | null) { now = time; closed = pageClosed; connected = browserConnected; } };
}
describe('host-only lifecycle contracts, not browser crash reproduction', () => {
  test('records all four public events in order with host time and current phase', () => {
    const f = fixture(), observer = createLifecycleEvidence(f.port);
    observer.mark('inspectBatch-start', { frameCount: 12, pngStringChars: 120000 });
    f.state(120, true, false); for (const name of f.names) f.callbacks.get(name)!();
    const data = observer.snapshot(); expect(data.clockDomain).toContain('not browser rAF or Core');
    expect(data.rows.map(row => row.kind)).toEqual(['phase', 'phase', ...f.names]);
    expect(data.rows.slice(2).every(row => row.hostMonotonicMs === 120 && row.pageClosed && row.browserConnected === false)).toBe(true);
    expect(data.rows[2].phase).toBe('inspectBatch-start'); expect(data.rows[3].contextCloseObserved).toBe(false);
    expect(data.rows[4].contextCloseObserved).toBe(true); observer.dispose();
  });
  test('context-close is only an observed event, and absent browser is explicit null', () => {
    const f = fixture(); f.state(1, false, null); const observer = createLifecycleEvidence(f.port);
    expect(observer.snapshot().rows[0]).toMatchObject({ browserConnected: null, contextCloseObserved: false }); observer.dispose();
  });
  test('snapshot and input batch copies cannot mutate recorded evidence', () => {
    const f = fixture(), observer = createLifecycleEvidence(f.port), batch = { frameCount: 3, pngStringChars: 900 };
    observer.mark('batch', batch); batch.frameCount = 999;
    const data = observer.snapshot(); data.rows[1].batch!.pngStringChars = 0; data.rows.length = 0;
    expect(observer.snapshot().rows[1].batch).toEqual({ frameCount: 3, pngStringChars: 900 }); observer.dispose();
  });
  test('dispose removes every listener once and ignores retained callbacks or later marks', () => {
    const f = fixture(), observer = createLifecycleEvidence(f.port), callbacks = [...f.callbacks.values()];
    observer.dispose(); observer.dispose(); observer.mark('after-dispose'); callbacks.forEach(callback => callback());
    expect(f.removed).toEqual([...f.names]); expect(f.callbacks.size).toBe(0);
    expect(observer.snapshot().rows).toHaveLength(1); expect(observer.snapshot().disposed).toBe(true);
  });
  test('one unsubscribe error still attempts every later removal and fails explicitly', () => {
    const f = fixture(), first = f.port.hooks[0].subscribe;
    f.port.hooks[0].subscribe = callback => { const remove = first(callback); return () => { remove(); throw new Error('off failure'); }; };
    const observer = createLifecycleEvidence(f.port); expect(() => observer.dispose()).toThrow('off failure');
    expect(f.removed).toEqual([...f.names]); expect(observer.snapshot().cleanupErrors).toHaveLength(1);
    expect(observer.snapshot().disposed).toBe(true); expect(() => observer.dispose()).not.toThrow();
  });
  test('a registration failure removes already installed hooks and keeps the primary identity', () => {
    const f = fixture(), primary = new Error('on failure'); f.port.hooks[1].subscribe = () => { throw primary; };
    let caught: unknown; try { createLifecycleEvidence(f.port); } catch (error) { caught = error; }
    expect(caught).toBe(primary); expect(f.removed).toEqual(['page-close']); expect(f.callbacks.size).toBe(0);
  });
  test('dual registration and cleanup failures retain both causes', () => {
    const f = fixture(), primary = new Error('on failure');
    f.port.hooks[0].subscribe = () => () => { throw new Error('off failure'); };
    f.port.hooks[1].subscribe = () => { throw primary; };
    let caught: unknown; try { createLifecycleEvidence(f.port); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ cause: primary }); expect(String((caught as { cleanupError: unknown }).cleanupError)).toContain('off failure');
  });
});
