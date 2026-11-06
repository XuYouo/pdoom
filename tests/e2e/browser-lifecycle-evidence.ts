import type { Page } from '@playwright/test';

type Event = 'page-close' | 'page-crash' | 'context-close' | 'browser-disconnected';
interface Batch { frameCount: number; pngStringChars: number }
export interface LifecyclePort {
  now(): number; pageClosed(): boolean; browserConnected(): boolean | null;
  hooks: { event: Event; subscribe(listener: () => void): () => void }[];
}
/** Test-host metadata only: no evaluate, capture, input, clock control or recovery. */
export function createLifecycleEvidence(port: LifecyclePort) {
  type Row = { kind: Event | 'phase'; hostMonotonicMs: number; phase: string;
    pageClosed: boolean; browserConnected: boolean | null; contextCloseObserved: boolean; batch?: Batch };
  const rows: Row[] = [], removers: (() => void)[] = [], cleanupErrors: string[] = [];
  let active = true, phase = 'observer-attached', contextCloseObserved = false;
  const record = (kind: Row['kind'], batch?: Batch) => {
    if (!active) return;
    if (kind === 'context-close') contextCloseObserved = true;
    rows.push({ kind, hostMonotonicMs: port.now(), phase, pageClosed: port.pageClosed(),
      browserConnected: port.browserConnected(), contextCloseObserved, ...(batch ? { batch: { ...batch } } : {}) });
  };
  const dispose = () => {
    if (!active) return;
    active = false;
    for (const remove of removers) {
      try { remove(); } catch (error) { cleanupErrors.push(error instanceof Error ? error.stack ?? error.message : String(error)); }
    }
    if (cleanupErrors.length) throw new Error('Lifecycle listener cleanup failed: ' + cleanupErrors.join('\n'));
  };
  try { for (const hook of port.hooks) removers.push(hook.subscribe(() => record(hook.event))); }
  catch (primary) {
    try { dispose(); } catch (cleanupError) {
      throw Object.assign(new Error('Lifecycle subscribe and cleanup failed'), { cause: primary, cleanupError });
    }
    throw primary;
  }
  record('phase');
  return {
    mark(next: string, batch?: Batch) { if (active) { phase = next; record('phase', batch); } },
    snapshot() { return { clockDomain: 'Node performance.now, not browser rAF or Core', disposed: !active,
      rows: rows.map(row => ({ ...row, ...(row.batch ? { batch: { ...row.batch } } : {}) })), cleanupErrors: [...cleanupErrors] }; },
    dispose,
  };
}

export function watchBrowserLifecycle(page: Page) {
  const context = page.context(), browser = context.browser();
  const hooks: LifecyclePort['hooks'] = [
    { event: 'page-close', subscribe: callback => { page.on('close', callback); return () => { page.off('close', callback); }; } },
    { event: 'page-crash', subscribe: callback => { page.on('crash', callback); return () => { page.off('crash', callback); }; } },
    { event: 'context-close', subscribe: callback => { context.on('close', callback); return () => { context.off('close', callback); }; } },
  ];
  if (browser) hooks.push({ event: 'browser-disconnected', subscribe: callback => {
    browser.on('disconnected', callback); return () => { browser.off('disconnected', callback); };
  } });
  return createLifecycleEvidence({ now: () => performance.now(), pageClosed: () => page.isClosed(),
    browserConnected: () => browser?.isConnected() ?? null, hooks });
}
