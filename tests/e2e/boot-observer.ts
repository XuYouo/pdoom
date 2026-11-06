import type { Page, TestInfo } from '@playwright/test';

interface BootState {
  readyState: DocumentReadyState; rootPresent: boolean; menuPresent: boolean;
  loading: boolean; resourceError: boolean; canvasCount: number;
  buttons: { text: string; ariaLabel: string | null; disabled: boolean; ariaDisabled: string | null }[];
  canvas: { width: number; height: number } | null;
}
interface BootRow { at: number; reason: string; state: BootState }
export interface BootEvidence {
  timeOrigin: number; collectedAt: number; rows: BootRow[]; truncated: boolean;
  observerAvailable: boolean; samples: number; samplingMs: number; callbacks: number; recordsSeen: number;
  stoppedAt: number | null; stopReason: string | null;
  navigation: object[]; resources: object[]; resourceCount: number; retainedResources: number;
  boundary: string;
}
export type BootHost = Window & { __pdoomBootObservation?: () => BootEvidence };

/** Self-contained top-frame init script. No game/React state, storage, network hooks or clock replacement. */
export function installBootObserver() {
  if (window.top !== window) return;
  const host = window as BootHost;
  if (host.__pdoomBootObservation) return;
  const rows: BootRow[] = []; let last = '', truncated = false, samples = 0, samplingMs = 0;
  let callbacks = 0, recordsSeen = 0, stopReason: string | null = null, stoppedAt: number | null = null;
  let result: BootEvidence | undefined, observer: MutationObserver | undefined;
  const allowed = (value: string | null) => value === null ? null
    : ['恢复检查点', '回看结局', '开始新训练'].includes(value) ? value : '<other>';
  const stop = (reason: string) => {
    observer?.disconnect(); document.removeEventListener('DOMContentLoaded', dom);
    document.removeEventListener('readystatechange', ready); window.removeEventListener('load', load);
    window.removeEventListener('pagehide', hide);
    if (!stopReason) { stopReason = reason; stoppedAt = performance.now(); }
  };
  const sample = (reason: string, force = false) => {
    const start = performance.now(); samples++;
    const root = document.querySelector('main[aria-label="P(Doom) 游戏"]');
    const canvases = document.querySelectorAll<HTMLCanvasElement>('.game-canvas canvas'), canvas = canvases[0];
    const state: BootState = {
      readyState: document.readyState, rootPresent: !!root, menuPresent: !!root?.querySelector('section[aria-label="主菜单"]'),
      loading: !!root?.querySelector('.boot-message'), resourceError: !!root?.querySelector('[role="alert"][aria-label="游戏资源加载失败"]'),
      buttons: Array.from(document.querySelectorAll<HTMLButtonElement>('.title-menu-actions > button')).map(b => ({
        text: allowed(Array.from(b.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent ?? '').join('').trim())!,
        ariaLabel: allowed(b.getAttribute('aria-label')), disabled: b.disabled,
        ariaDisabled: ['true', 'false'].includes(b.getAttribute('aria-disabled') ?? '') ? b.getAttribute('aria-disabled') : null,
      })),
      canvasCount: canvases.length, canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
    };
    const key = JSON.stringify(state);
    if (force || key !== last) {
      if (rows.length < 128) rows.push({ at: start, reason, state });
      else { truncated = true; stop('row-cap'); }
      last = key;
    }
    samplingMs += performance.now() - start;
    // Stop before authentication/business even if the post-gate collector is delayed.
    if (reason !== 'collect-after-original-assert' && state.buttons.some(b => b.text === '恢复检查点' && !b.disabled)) stop('restore-enabled-observed');
  };
  const dom = () => sample('dom-content-loaded', true), load = () => sample('window-load', true);
  const ready = () => sample('document-state', true), hide = () => stop('pagehide');
  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(records => {
      callbacks++; recordsSeen += records.length;
      if (callbacks > 512 || recordsSeen > 5000) { truncated = true; stop('callback-cap'); return; }
      const relevant = records.some(r => r.type === 'childList' || (r.target instanceof Element ? r.target : r.target.parentElement)
        ?.closest('.title-menu-actions,.game-canvas,.boot-message,[aria-label="游戏资源加载失败"]'));
      if (relevant) sample('mutation');
    });
    observer.observe(document, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['disabled', 'aria-label', 'aria-disabled', 'class', 'width', 'height', 'hidden'] });
  }
  document.addEventListener('DOMContentLoaded', dom, { once: true });
  document.addEventListener('readystatechange', ready); window.addEventListener('load', load, { once: true });
  window.addEventListener('pagehide', hide, { once: true }); sample('init', true);
  host.__pdoomBootObservation = () => {
    if (result) return result;
    // Final public state is labelled post-assert; it cannot be used to back-date a successful gate.
    observer?.takeRecords(); sample('collect-after-original-assert', true); stop('collect');
    const read = (type: string) => typeof performance.getEntriesByType === 'function' ? performance.getEntriesByType(type) : [];
    const safePath = (name: string) => {
      try {
        const url = new URL(name, location.href);
        return url.origin === location.origin && ['/', '/game/', '/src/', '/node_modules/', '/@vite/', '/@react-refresh'].some(prefix => prefix === '/' ? url.pathname === '/' : url.pathname.startsWith(prefix)) ? url.pathname : null;
      } catch { return null; }
    };
    const entries = read('resource') as PerformanceResourceTiming[];
    const resources = entries.filter(r => safePath(r.name) !== null).slice(0, 512).map(r => ({
      path: safePath(r.name), initiatorType: r.initiatorType, startTime: r.startTime, duration: r.duration,
      fetchStart: r.fetchStart, requestStart: r.requestStart, responseStart: r.responseStart, responseEnd: r.responseEnd,
      transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize,
    }));
    result = {
      timeOrigin: performance.timeOrigin, collectedAt: performance.now(), rows, truncated,
      observerAvailable: !!observer, samples, samplingMs, callbacks, recordsSeen, stopReason, stoppedAt,
      navigation: (read('navigation') as PerformanceNavigationTiming[]).map(n => ({ path: safePath(n.name), type: n.type,
        startTime: n.startTime, responseEnd: n.responseEnd, domInteractive: n.domInteractive,
        domContentLoadedEventEnd: n.domContentLoadedEventEnd, loadEventEnd: n.loadEventEnd })),
      resources, resourceCount: entries.length, retainedResources: resources.length,
      boundary: 'MO callback observations can coalesce; not exact Scene ready/GPU time or zero overhead. Collection follows the unchanged assertion and delays the later click. Native resource buffer can omit entries; Node/HAR clocks are not calibrated here.',
    };
    return result;
  };
}

/** Bounded POST-gate diagnostics must not replace the original assertion/navigation failure. */
export async function attachBootObservation(page: Page, info: TestInfo) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const evidence = await Promise.race([
      page.evaluate(() => (window as BootHost).__pdoomBootObservation?.() ?? { collectionError: 'observer absent' })
        .catch(error => ({ collectionError: String(error) })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ collectionError: 'post-gate diagnostic exceeded1000ms' }), 1000); }),
    ]);
    await info.attach('score-startup-observation', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  } catch (error) { console.warn('BOOT_OBSERVATION_DIAGNOSTIC_FAILED', String(error)); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
