import { afterEach, describe, expect, it, vi } from 'vitest';
import { installBootObserver, attachBootObservation, type BootHost } from '../e2e/boot-observer';
import type { Page, TestInfo } from '@playwright/test';

// Explicit minimal DOM/observer doubles: real DOM timing is verified separately in the score browser run.
function harness(label = '恢复检查点', disabled = true) {
  type Callback = (...args: unknown[]) => void;
  const listeners = new Map<string, Set<Callback>>();
  const addEventListener = (name: string, callback: Callback) => { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set); };
  const removeEventListener = (name: string, callback: Callback) => listeners.get(name)?.delete(callback);
  class NodeDouble { static TEXT_NODE = 3; }
  class ElementDouble extends NodeDouble { closest() { return this; } }
  const attrs: Record<string, string> = {};
  const text = { nodeType: 3, textContent: label };
  const button = Object.assign(new ElementDouble(), { disabled, childNodes: [text, { nodeType: 1, textContent: '▶' }], getAttribute: (key: string) => attrs[key] ?? null });
  const state = { root: true, menu: true, loading: false, resourceError: false, canvases: [] as { width: number; height: number }[] };
  const root = { querySelector: (selector: string) => selector.includes('主菜单') ? state.menu || null : selector === '.boot-message' ? state.loading || null : state.resourceError || null };
  const focus = {};
  const documentDouble = { readyState: 'loading', activeElement: focus, addEventListener, removeEventListener,
    querySelector: () => state.root ? root : null,
    querySelectorAll: (selector: string) => selector.includes('canvas') ? state.canvases : state.root ? [button] : [],
  };
  let callback: (records: unknown[]) => void = () => {}; let active = false;
  const disconnect = vi.fn(() => { active = false; });
  class ObserverDouble {
    constructor(value: typeof callback) { callback = value; }
    observe() { active = true; }
    disconnect = disconnect;
    takeRecords() { return []; }
  }
  const resources: object[] = [], getEntriesByType = vi.fn((type: string) => type === 'resource' ? resources : []);
  let clock = 0; const now = () => ++clock;
  const windowDouble = { top: null as unknown, addEventListener, removeEventListener, requestAnimationFrame: vi.fn() };
  windowDouble.top = windowDouble;
  vi.stubGlobal('window', windowDouble); vi.stubGlobal('document', documentDouble); vi.stubGlobal('Element', ElementDouble);
  vi.stubGlobal('Node', NodeDouble); vi.stubGlobal('MutationObserver', ObserverDouble);
  vi.stubGlobal('location', { href: 'http://game.test/', origin: 'http://game.test' });
  vi.stubGlobal('performance', { now, timeOrigin: 100, getEntriesByType });
  const host = windowDouble as unknown as BootHost;
  const emit = (count = 1) => { if (active) callback(Array.from({ length: count }, () => ({ type: 'attributes', target: button }))); };
  const event = (name: string) => { for (const cb of [...listeners.get(name) ?? []]) cb(); };
  const collect = () => host.__pdoomBootObservation!();
  return { host, state, text, attrs, button, documentDouble, focus, now, emit, event, resources, getEntriesByType, collect, disconnect, listeners };
}
afterEach(() => { (globalThis.window as BootHost | undefined)?.__pdoomBootObservation?.(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('passive boot observer: explicit interface contracts, not native performance evidence', () => {
  it('does not change DOM values, focus, native clock or schedule rAF', () => {
    const h = harness(); installBootObserver(); expect(h.button.disabled).toBe(true); expect(h.text.textContent).toBe('恢复检查点');
    expect(h.documentDouble.activeElement).toBe(h.focus); expect(performance.now).toBe(h.now); expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(h.collect().rows[0].state.buttons).toEqual([{ text: '恢复检查点', ariaLabel: null, disabled: true, ariaDisabled: null }]);
  });
  it('sees late root and menu insertion', () => {
    const h = harness(); h.state.root = false; installBootObserver(); h.state.root = true; h.emit();
    const rows = h.collect().rows; expect(rows[0].state.rootPresent).toBe(false); expect(rows.some(r => r.reason === 'mutation' && r.state.menuPresent)).toBe(true);
  });
  it('records disabled removal and stops before business', () => {
    const h = harness(); installBootObserver(); h.button.disabled = false; h.emit();
    const e = h.collect(); expect(e.stopReason).toBe('restore-enabled-observed'); expect(e.rows.some(r => r.reason === 'mutation' && !r.state.buttons[0].disabled)).toBe(true);
  });
  it('does not count enabled new-run as observed restore-ready', () => {
    const h = harness('开始新训练', false); installBootObserver(); expect(h.collect().stopReason).toBe('collect');
  });
  it('sees direct label text changes excluding decorative nodes', () => {
    const h = harness('开始新训练'); installBootObserver(); h.text.textContent = '恢复检查点'; h.emit();
    expect(h.collect().rows.some(r => r.reason === 'mutation' && r.state.buttons[0].text === '恢复检查点')).toBe(true);
  });
  it('redacts arbitrary names', () => {
    const h = harness('private-user'); h.attrs['aria-label'] = 'private-user'; installBootObserver();
    const e = h.collect(); expect(JSON.stringify(e)).not.toContain('private-user'); expect(e.rows[0].state.buttons[0].text).toBe('<other>');
  });
  it('reads only canvas presence and dimensions', () => {
    const h = harness(); installBootObserver(); h.state.canvases.push({ width: 640, height: 360 }); h.emit();
    expect(h.collect().rows.at(-1)!.state.canvas).toEqual({ width: 640, height: 360 });
  });
  it('deduplicates unchanged tuples', () => {
    const h = harness(); installBootObserver(); for (let i = 0; i < 8; i++) h.emit();
    const e = h.collect(); expect(e.rows.filter(r => r.reason === 'mutation')).toHaveLength(0); expect(e.callbacks).toBe(8);
  });
  it('caps rows and explicitly reports lost coverage', () => {
    const h = harness('开始新训练'); installBootObserver(); for (let n = 0; n < 150; n++) { h.button.disabled = !h.button.disabled; h.emit(); }
    const e = h.collect(); expect(e.rows).toHaveLength(128); expect(e.truncated).toBe(true); expect(e.stopReason).toBe('row-cap');
  });
  it('caps mutation record floods', () => {
    const h = harness(); installBootObserver(); h.emit(5001); const e = h.collect(); expect(e.stopReason).toBe('callback-cap'); expect(e.truncated).toBe(true);
  });
  it('cleans listeners on pagehide without pretending ready', () => {
    const h = harness(); installBootObserver(); h.event('pagehide'); expect(h.collect().stopReason).toBe('pagehide');
    expect([...h.listeners.values()].every(set => set.size === 0)).toBe(true);
  });
  it('collects only once and excludes later state changes', () => {
    const h = harness(); installBootObserver(); const first = h.collect(); h.button.disabled = false; h.emit(); h.event('readystatechange');
    expect(h.collect()).toBe(first); expect(first.rows.at(-1)!.state.buttons[0].disabled).toBe(true); expect(first.rows.at(-1)!.reason).toBe('collect-after-original-assert');
  });
  it('does not replace an existing owned observer', () => {
    const h = harness(); installBootObserver(); const first = h.host.__pdoomBootObservation; installBootObserver(); expect(h.host.__pdoomBootObservation).toBe(first);
  });
  it('does not observe a child frame', () => {
    const h = harness(); Object.assign(h.host, { top: {} }); installBootObserver(); expect(h.host.__pdoomBootObservation).toBeUndefined();
  });
  it('reports unavailable observer honestly', () => {
    const h = harness(); vi.stubGlobal('MutationObserver', undefined); installBootObserver(); expect(h.collect().observerAvailable).toBe(false);
  });
  it('reads performance entries only after the gate and only exports allowlisted paths', () => {
    const h = harness(); h.resources.push({ name: 'http://game.test/game/hero.png?token=secret#x', startTime: 10, duration: 2 },
      { name: 'http://game.test/api/private?token=secret' }, { name: 'https://external.test/game/secret.png' });
    installBootObserver(); expect(h.getEntriesByType).not.toHaveBeenCalled(); const e = h.collect();
    expect(e.resourceCount).toBe(3); expect(e.retainedResources).toBe(1); expect(JSON.stringify(e.resources)).not.toContain('secret');
    expect(e.resources[0]).toMatchObject({ path: '/game/hero.png', startTime: 10, duration: 2 });
  });
});
describe('bounded post-gate attachment only', () => {
  it('degrades a rejected collection without throwing over the original assertion', async () => {
    const attach = vi.fn<(name: string, data: { body: string }) => Promise<void>>(async () => {}); await expect(attachBootObservation({ evaluate: async () => { throw Error('closed'); } } as unknown as Page, { attach } as unknown as TestInfo)).resolves.toBeUndefined();
    expect(JSON.parse(attach.mock.calls[0][1].body)).toMatchObject({ collectionError: 'Error: closed' });
  });
  it('bounds a stalled collection without adding an original gate wait', async () => {
    vi.useFakeTimers(); const attach = vi.fn<(name: string, data: { body: string }) => Promise<void>>(async () => {});
    const task = attachBootObservation({ evaluate: () => new Promise(() => {}) } as unknown as Page, { attach } as unknown as TestInfo);
    await vi.advanceTimersByTimeAsync(1001); await task;
    expect(JSON.parse(attach.mock.calls[0][1].body).collectionError).toContain('1000ms'); expect(vi.getTimerCount()).toBe(0);
  });
});
