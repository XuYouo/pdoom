import type { Page } from '@playwright/test';
import type { PickupCapture, PickupSource } from './pickup-pixels';
import { hudPng } from './mirror-hud-pixels';
import { withCleanup } from './factory-navigation';

export interface PickupRawFrame extends Omit<PickupCapture, 'png' | 'at'> { rgba: Uint8ClampedArray }
export interface PickupCaptureIO {
  raf(take: (at: number) => void): unknown; cancelRaf(id: unknown): void;
  read(): PickupRawFrame; frozen(): boolean; encode(rgba: Uint8ClampedArray): string;
}
/** Self-contained browser function. Sampling never encodes or exports the raw batch.
 * The real post-pause RAF is captured BEFORE any old frame is encoded. */
export function createPickupCapture(io?: PickupCaptureIO) {
  if (!io) {
    const scratch = document.createElement('canvas'); scratch.width = 640; scratch.height = 360;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw Error('Native pickup capture context unavailable');
    io = {
      raf: take => requestAnimationFrame(take), cancelRaf: id => cancelAnimationFrame(id as number),
      read: () => {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Native640x360 canvas missing');
        ctx.clearRect(0, 0, 640, 360); ctx.drawImage(canvas, 0, 0);
        return { rgba: ctx.getImageData(0, 0, 640, 360).data,
          hud: [...document.querySelectorAll('.hud-cell')].map(n => n.textContent ?? ''),
          objective: document.querySelector('.objective')?.textContent ?? '', title: document.querySelector('.world-titlebar')?.textContent ?? '',
          notice: [...document.querySelectorAll('[role="status"],.game-notice')].map(n => n.textContent ?? '').join('|') };
      },
      frozen: () => [...document.querySelectorAll<HTMLElement>('dialog,[role="dialog"]')].some(dialog => {
        const label = dialog.getAttribute('aria-label') ?? (dialog.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ');
        const rect = dialog.getBoundingClientRect(), style = getComputedStyle(dialog);
        return ['暂停前向传播。', '安全休息室 / HUMAN RATER'].includes(label) && rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && style.display !== 'none';
      }),
      encode: rgba => { ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), 640, 360), 0, 0); return scratch.toDataURL('image/png'); },
    };
  }
  const port = io;
  type Raw = Omit<PickupCapture, 'png'> & { rgba: Uint8ClampedArray };
  let phase: 'idle' | 'active' | 'collected' | 'final' | 'ready' | 'encoded' | 'failed' | 'cancelled' = 'idle';
  let raf: unknown, reject: ((reason: unknown) => void) | undefined, resolve: (() => void) | undefined;
  let start: number | undefined, last = -Infinity, previous = -Infinity, duration = 0;
  const frames: Raw[] = []; let final: Raw | undefined;
  function clear() { const id = raf; raf = undefined; if (id !== undefined) port.cancelRaf(id); }
  function fail(error: unknown) {
    phase = 'failed'; let failure = error;
    try { clear(); } catch (cleanupError) { failure = Object.assign(new Error('Capture and cancellation failed'), { cause: error, cleanupError }); }
    const settle = reject; reject = undefined; resolve = undefined; settle?.(failure);
  }
  function snap(at: number): Raw {
    if (!Number.isFinite(at) || at < 0 || at < previous) throw Error('Invalid/nonmonotonic capture RAF');
    previous = at; const raw = port.read();
    if (!(raw.rgba instanceof Uint8ClampedArray) || raw.rgba.length !== 640 * 360 * 4 || !Array.isArray(raw.hud) || !raw.hud.every(s => typeof s === 'string')
      || ![raw.objective, raw.title, raw.notice].every(s => typeof s === 'string')) throw Error('Invalid native capture payload');
    return { at, rgba: new Uint8ClampedArray(raw.rgba), hud: [...raw.hud], objective: raw.objective, title: raw.title, notice: raw.notice };
  }
  function done(next: 'collected' | 'ready') { phase = next; const settle = resolve; resolve = undefined; reject = undefined; settle?.(); }
  function tick(at: number) {
    if (phase !== 'active') return; raf = undefined;
    try {
      if (!Number.isFinite(at) || at < 0 || at < previous) throw Error('Invalid/nonmonotonic capture RAF');
      previous = at; start ??= at;
      if (at - last >= 32 || at - start >= duration) {
        const frame = snap(at); if (phase !== 'active') return;
        frames.push(frame); last = at;
      }
      if (at - start >= duration) done('collected'); else raf = port.raf(tick);
    } catch (error) { fail(error); }
  }
  return {
    acquire(ms: number): Promise<void> {
      if (phase !== 'idle') return Promise.reject(Error('Capture can start only once'));
      if (!Number.isFinite(ms) || ms < 0 || ms > 4500) return Promise.reject(Error('Invalid capture duration'));
      duration = ms; phase = 'active';
      return new Promise<void>((yes, no) => { resolve = yes; reject = no; try { raf = port.raf(tick); } catch (error) { fail(error); } });
    },
    acquireFinal(): Promise<void> {
      if (phase !== 'collected' || !port.frozen()) return Promise.reject(Error('Real pause/rest guard required before final raw'));
      phase = 'final';
      return new Promise<void>((yes, no) => {
        resolve = yes; reject = no;
        try {
          raf = port.raf(at => {
            if (phase !== 'final') return; raf = undefined;
            try {
              if (!port.frozen()) throw Error('Pause/rest ended before final raw');
              const frame = snap(at); if (phase !== 'final') return;
              final = frame; done('ready');
            } catch (error) { fail(error); }
          });
        } catch (error) { fail(error); }
      });
    },
    finish(): { frames: PickupCapture[]; pausedFinal: PickupCapture } {
      if (phase !== 'ready' || !final || !port.frozen()) throw Error('Final raw and visible freeze required before encoding');
      phase = 'encoded';
      const encode = ({ rgba, ...metadata }: Raw): PickupCapture => ({ ...metadata, hud: [...metadata.hud], png: port.encode(new Uint8ClampedArray(rgba)) });
      return { frames: frames.map(encode), pausedFinal: encode(final) };
    },
    cancel() {
      if (phase === 'encoded' || phase === 'cancelled' || phase === 'failed') return;
      const settle = reject; reject = undefined; resolve = undefined; phase = 'cancelled';
      try { clear(); } finally { settle?.(Error('Capture cancelled')); }
    },
  };
}

export interface PickupCapturePort {
  acquire(ms: number): Promise<void>; acquireFinal(): Promise<void>;
  finish(): Promise<{ frames: PickupCapture[]; pausedFinal: PickupCapture }>;
  cancel(): Promise<void>; dispose(): Promise<void>;
}
/** The real visible freeze guard precedes final raw, which precedes ALL encoding.
 * Cleanup attempts every action independently and retains even falsy primary failures. */
export function runPickupCapture(port: PickupCapturePort, ms: number, freeze: () => Promise<void>) {
  return withCleanup(async () => {
    await port.acquire(ms); await freeze(); await port.acquireFinal(); return await port.finish();
  }, () => withCleanup(() => port.cancel(), () => withCleanup(freeze, () => port.dispose())));
}
export async function deferredPickupWindow(page: Page, ms: number, freeze: () => Promise<void>) {
  const handle = await page.evaluateHandle(createPickupCapture, undefined);
  return runPickupCapture({
    acquire: ms => handle.evaluate((capture, value) => capture.acquire(value), ms),
    acquireFinal: () => handle.evaluate(capture => capture.acquireFinal()),
    finish: () => handle.evaluate(capture => capture.finish()),
    cancel: () => handle.evaluate(capture => capture.cancel()), dispose: () => handle.dispose(),
  }, ms, freeze);
}

export interface PickupApproach {
  mode: 'near-capped'; sourceAt: number; worldX: number; target: number; tolerance: number; direction: 'a' | 'd'; holdLimitMs: number;
}
export interface PickupMoveResult<R> {
  kind: 'deadline' | 'observed' | 'near-limit'; observation: R | null; stopMs: number | null;
  /** Original request ceiling; a near approach has its own smaller holdLimitMs. */
  budgetMs: 1500; approach?: PickupApproach;
}
function checkPickupApproach(p: PickupApproach) {
  const distance = Math.abs(p.target - p.worldX);
  if (p.mode !== 'near-capped' || ![p.sourceAt, p.worldX, p.target, p.tolerance, p.holdLimitMs].every(Number.isFinite)
    || p.sourceAt < 0 || ![4, 8].includes(p.tolerance) || !['a', 'd'].includes(p.direction)
    || distance <= p.tolerance || distance > 32 || (p.target < p.worldX) !== (p.direction === 'a')
    || p.holdLimitMs !== Math.min(1500, Math.max(20, Math.round(distance / 190 * 1000)))) throw Error('Invalid current-pixel near approach');
}
/** A preparation cap only, from the existing paused-before capture. Never a success gate.
 * 32 is one source frame width, not a physical stopping distance;190/20 reuse ordinary travel. */
export function choosePickupApproach(capture: PickupCapture, config: PickupWaypointConfig): PickupApproach | undefined {
  if (config.allowRest) return;
  if (!Number.isFinite(capture.at) || capture.at < 0 || !capture.png.startsWith('data:image/png;base64,')) throw Error('Actual paused-before capture required');
  const image = hudPng(Buffer.from(capture.png.slice('data:image/png;base64,'.length), 'base64'));
  if (image.width !== 640 || image.height !== 360) throw Error('Native paused-before640x360 required');
  // Reuse the complete current-raw matcher, including equal-best hero ambiguity rejection.
  // No browser read, timer, held observer, extra frame or cached reference is involved here.
  const forbidden = (): never => { throw Error('Paused-before inspection must not schedule or capture'); };
  const observer = createPickupWaypoint(config, { now: forbidden, timer: forbidden, cancelTimer: forbidden,
    raf: forbidden, cancelRaf: forbidden, read: forbidden, frozen: forbidden, encode: forbidden });
  const fact = observer.inspect({ ...capture, rgba: new Uint8ClampedArray(image.rgba), rest: false }, capture.at);
  const worldX = fact.worldX;
  if (worldX === null) return;
  const distance = Math.abs(config.target - worldX);
  if (distance <= config.tolerance || distance > 32 || (config.target < worldX) !== (config.direction === 'a')) return;
  const approach: PickupApproach = { mode: 'near-capped', sourceAt: capture.at, worldX, target: config.target, tolerance: config.tolerance,
    direction: config.direction, holdLimitMs: Math.min(1500, Math.max(20, Math.round(distance / 190 * 1000))) };
  checkPickupApproach(approach); return approach;
}

export interface PickupMovePort<R> {
  now(): number; timer(take: () => void, ms: number): unknown; cancelTimer(id: unknown): void;
  down(): Promise<unknown>; up(): Promise<unknown>; observe(ms: number): Promise<R>; cancel(): Promise<unknown>; isCancelled?(value: R): boolean;
}
/** One ordinary direction only. Deadline is partial progress, never waypoint acceptance.
 * No encoder/measurement port: original tail/final navigation must still run afterwards. */
export async function runPickupWaypointMove<R>(port: PickupMovePort<R>, approach?: PickupApproach): Promise<PickupMoveResult<R>> {
  const plan = approach ? { ...approach } : undefined; if (plan) checkPickupApproach(plan);
  const limit = plan?.holdLimitMs ?? 1500;
  const failures: { phase: string; reason: unknown }[] = [];
  let started = 0, stopped = false, deadlineReached = false, stopMs: number | null = null, observingStarted = false;
  let downAttempted = false, downSettled = false, lateRelease = false, armed = false, active = true, timer: unknown;
  let value: R | null = null, releasePromise: Promise<void> | null = null, cancelPromise: Promise<void> | null = null;
  let wake!: () => void; const interrupted = new Promise<void>(resolve => { wake = resolve; });
  const attempt = async (phase: string, action: () => Promise<unknown>) => { try { await action(); } catch (reason) { failures.push({ phase, reason }); } };
  const cancel = () => cancelPromise ??= attempt('cancel', () => port.cancel());
  const release = () => releasePromise ??= downAttempted ? attempt('release', () => port.up()) : Promise.resolve();
  function stop(deadline = false) {
    if (!stopped) { stopped = true; deadlineReached = deadline;
      try { stopMs = port.now() - started; } catch (reason) { failures.push({ phase: 'stop clock', reason }); } lateRelease = downAttempted && !downSettled; wake(); }
    void release(); void cancel();
  }
  function clearDeadline() {
    active = false; if (!armed) return; armed = false;
    try { port.cancelTimer(timer); } catch (reason) { failures.push({ phase: 'deadline cleanup', reason }); stop(); }
  }
  try {
    started = port.now(); if (!Number.isFinite(started)) throw Error('Invalid waypoint start clock');
    timer = port.timer(() => { if (active) stop(true); }, limit); armed = true;
    if (!stopped) {
      downAttempted = true;
      const down = (async () => {
        try { await port.down(); } catch (reason) { downSettled = true; failures.push({ phase: 'down', reason }); stop(); }
        finally { downSettled = true; }
      })();
      await Promise.race([down, interrupted]); await down;
      if (lateRelease) { await release(); await attempt('late down release', () => port.up()); }
      if (!stopped) {
        const elapsed = port.now() - started;
        if (!Number.isFinite(elapsed) || elapsed < 0) throw Error('Invalid waypoint down clock');
        if (elapsed >= limit) stop(true);
        else if (plan) await interrupted; // One short ordinary hold; no in-flight sampler or arrival claim.
        else {
          observingStarted = true;
          const observing = (async () => {
            try { return { ok: true as const, value: await port.observe(1500 - elapsed) }; }
            catch (reason) { failures.push({ phase: 'observation', reason }); stop(); return { ok: false as const }; }
          })();
          const observed = await Promise.race([observing, interrupted.then(() => null)]);
          if (observed?.ok && !stopped) {
            if (port.isCancelled?.(observed.value)) throw Error('Unexpected waypoint cancellation');
            const elapsedReply = port.now() - started;
            if (!Number.isFinite(elapsedReply) || elapsedReply < elapsed) throw Error('Invalid waypoint reply clock');
            if (elapsedReply >= 1500) stop(true);
            else { value = observed.value; stopMs = elapsedReply; clearDeadline(); }
          }
          await release(); await observing; // No live late observer can escape this stage.
        }
      }
    }
  } catch (reason) { failures.push({ phase: 'movement', reason }); stop(); }
  finally {
    clearDeadline(); if (downAttempted) await release();
    if (stopped || failures.length || !observingStarted) await cancel();
  }
  if (stopMs !== null && (!Number.isFinite(stopMs) || stopMs < 0)) failures.push({ phase: 'stop clock', reason: Error('Invalid waypoint stop time') });
  if (failures.length === 1) throw failures[0].reason;
  if (failures.length) {
    const text = (e: unknown) => { try { return e instanceof Error ? e.message : String(e); } catch { return '<unprintable>'; } };
    throw Object.assign(Error(failures.map(f => f.phase + ': ' + text(f.reason)).join('; ')), { failures });
  }
  const result = { kind: deadlineReached ? 'deadline' as const : 'observed' as const, observation: value, stopMs, budgetMs: 1500 as const };
  return plan ? { ...result, kind: 'near-limit', approach: plan } : result;
}

export interface PickupWaypointConfig {
  source: Pick<PickupSource, 'hero' | 'terrain' | 'ledges'> & { reference: PickupSource['items'][number] };
  reference: { x: number; y: number }; target: number; tolerance: number; direction: 'a' | 'd'; allowRest: boolean;
}
export interface PickupWaypointRead extends PickupRawFrame { rest: boolean }
export interface PickupWaypointIO extends Omit<PickupCaptureIO, 'read'> {
  now(): number; timer(take: () => void, ms: number): unknown; cancelTimer(id: unknown): void; read(): PickupWaypointRead;
}
export interface PickupWaypointFrame {
  at: number; hud: string[]; rest: boolean; hero: { x: number; y: number; centerX: number; feet: number; ratio: number; ink: number } | null;
  reference: { x: number; y: number; centerX: number; ratio: number; ink: number } | null;
  terrainCount: number; worldX: number | null; inBand: boolean;
}
export interface PickupWaypointResult { reason: 'position' | 'passed' | 'rest' | 'budget' | 'cancelled' | 'error'; problems: string[] }
export interface PickupWaypointProof {
  target: number; tolerance: number; direction: 'a' | 'd'; referenceWorld: { x: number; y: number }; referenceSlot: number; allowRest: boolean; frames: PickupWaypointFrame[];
  result: PickupWaypointResult | null; snapshot: PickupCapture | null; snapshotFact: PickupWaypointFrame | null;
  node: PickupMoveResult<PickupWaypointResult> | null;
}
/** Serialized alone. Only current native pixels/public DOM; no input, engine or saved-state access. */
export function createPickupWaypoint(config: PickupWaypointConfig, io?: PickupWaypointIO) {
  if (![config.target, config.reference.x, config.reference.y, config.tolerance].every(Number.isFinite)
    || ![4, 8].includes(config.tolerance) || !['a', 'd'].includes(config.direction) || typeof config.allowRest !== 'boolean') throw Error('Invalid waypoint configuration');
  if (!io) {
    const copy = document.createElement('canvas'); copy.width = 640; copy.height = 360;
    const ctx = copy.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('Native copy context required');
    const visible = (label: string) => [...document.querySelectorAll<HTMLElement>('dialog')].some(d => {
      const r = d.getBoundingClientRect(), style = getComputedStyle(d);
      return d.getAttribute('aria-label') === label && r.width > 0 && r.height > 0 && style.visibility === 'visible' && style.display !== 'none';
    });
    io = { now: () => performance.now(), raf: take => requestAnimationFrame(take), cancelRaf: id => cancelAnimationFrame(id as number),
      timer: (take, ms) => window.setTimeout(take, ms), cancelTimer: id => window.clearTimeout(id as number),
      frozen: () => visible('暂停前向传播。') || visible('安全休息室 / HUMAN RATER'),
      read: () => {
        const canvas = document.querySelector('canvas'); if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Actual640x360 canvas required');
        ctx.clearRect(0, 0, 640, 360); ctx.drawImage(canvas, 0, 0);
        return { rgba: ctx.getImageData(0, 0, 640, 360).data, hud: [...document.querySelectorAll('.hud-cell')].map(n => n.textContent ?? ''),
          objective: document.querySelector('.objective')?.textContent ?? '', title: document.querySelector('.world-titlebar')?.textContent ?? '',
          notice: [...document.querySelectorAll('[role="status"],.game-notice')].map(n => n.textContent ?? '').join('|'), rest: visible('安全休息室 / HUMAN RATER') };
      }, encode: rgba => { ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), 640, 360), 0, 0); return copy.toDataURL('image/png'); } };
  }
  const port = io, W = 640, H = 360, source = config.source;
  const stamps = [...source.hero, source.reference, ...source.terrain, ...source.ledges];
  if (!source.hero.length || !source.terrain.length || !source.ledges.length || stamps.some(s => !s.points.length || !s.anchors.length || s.colors < 3)) throw Error('Complete source stamps required');
  const anchorColors = new Set(stamps.map(s => s.anchors[0].color));
  function inspect(raw: PickupWaypointRead, at: number): PickupWaypointFrame {
    if (!(raw.rgba instanceof Uint8ClampedArray) || raw.rgba.length !== W * H * 4 || !Array.isArray(raw.hud)
      || !raw.hud.every(s => typeof s === 'string') || ![raw.objective, raw.title, raw.notice].every(s => typeof s === 'string') || typeof raw.rest !== 'boolean') throw Error('Invalid current native payload');
    const hp = /^HP(\d+)\/100$/.exec(raw.hud[0]?.replace(/\s/g, '') ?? '');
    if (!hp || +hp[1] <= 0 || +hp[1] > 100) throw Error('Current live public HP required');
    const pixels = new Int32Array(W * H), index = new Map<number, number[]>(); pixels.fill(-1);
    for (let i = 0; i < W * H; i++) if (raw.rgba[i * 4 + 3] === 255) {
      const c = (raw.rgba[i * 4] << 16) | (raw.rgba[i * 4 + 1] << 8) | raw.rgba[i * 4 + 2]; pixels[i] = c;
      if (anchorColors.has(c)) { const list = index.get(c) ?? []; list.push(i); index.set(c, list); }
    }
    const pixel = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H ? pixels[y * W + x] : -1;
    const close = (a: number, b: number) => a >= 0 && b >= 0 && Math.abs((a >>> 16) - (b >>> 16)) <= 2
      && Math.abs(((a >>> 8) & 255) - ((b >>> 8) & 255)) <= 2 && Math.abs((a & 255) - (b & 255)) <= 2;
    function find(s: PickupSource['hero'][number], yOnly?: number) {
      const hits: { x: number; y: number; ratio: number; ink: number; matched: number }[] = [], a = s.anchors[0];
      for (const i of index.get(a.color) ?? []) {
        const x = i % W - a.x, y = Math.floor(i / W) - a.y;
        if (x + s.box.x < 0 || y + s.box.y < 0 || x + s.box.x + s.box.width > W || y + s.box.y + s.box.height > H || yOnly !== undefined && y !== yOnly) continue;
        if (!s.anchors.every(p => close(pixel(x + p.x, y + p.y), p.color))) continue;
        let matched = 0; const colors = new Set<number>();
        for (const p of s.points) if (close(pixel(x + p.x, y + p.y), p.color)) { matched++; colors.add(p.color); }
        if (matched / s.points.length >= .98 && colors.size >= 3) hits.push({ x, y, ratio: matched / s.points.length, ink: s.points.length, matched });
      }
      return hits;
    }
    const actors = source.hero.flatMap(s => find(s)).sort((a, b) => b.ratio - a.ratio || b.matched - a.matched);
    // Pose aliases can match shifted by1px at lower score; preserve original ratio/matched ranking.
    const best = actors[0], unique = new Set(actors.filter(a => a.ratio === best.ratio && a.matched === best.matched).map(a => a.x + '/' + a.y));
    const actor = unique.size === 1 && actors[0].ink > 100 ? actors[0] : null;
    const hero = actor ? { ...actor, centerX: actor.x + 16, feet: actor.y + 27 } : null;
    const references = find(source.reference).filter(h => Math.abs(h.y + 16 - config.reference.y) <= 3);
    const hit = references.length === 1 ? references[0] : null, reference = hit ? { ...hit, centerX: hit.x + 16 } : null;
    const terrain = source.terrain.flatMap(s => find(s, 320));
    for (const y of [192, 196, 202, 250, 252, 254, 258, 260]) for (const s of source.ledges) terrain.push(...find(s, y));
    const terrainCount = new Set(terrain.map(t => t.x + '/' + t.y)).size;
    const scroll = reference ? config.reference.x - reference.centerX : NaN;
    const worldX = hero && reference && terrainCount >= 4 && scroll >= -1 && scroll <= 2241 ? hero.centerX + scroll : null;
    return { at, hud: [...raw.hud], rest: raw.rest, hero, reference, terrainCount, worldX, inBand: worldX !== null && Math.abs(worldX - config.target) <= config.tolerance };
  }
  let phase: 'idle' | 'running' | 'done' = 'idle', raf: unknown, timer: unknown, deadline = 0, last = -Infinity, clock = -Infinity;
  let settle: ((value: PickupWaypointResult) => void) | null = null, result: PickupWaypointResult | null = null, encoded = false;
  const frames: PickupWaypointFrame[] = []; let snapshot: (PickupWaypointRead & { at: number }) | null = null, snapshotFact: PickupWaypointFrame | null = null;
  const message = (e: unknown) => { try { return (e instanceof Error ? e.message : String(e)).slice(0, 1024); } catch { return '<unprintable>'; } };
  function stop(reason: PickupWaypointResult['reason'], problems: string[] = []) {
    if (phase === 'done') { if (problems.length && result) { result.reason = 'error'; result.problems.push(...problems); } return; }
    phase = 'done'; const r = raf, t = timer; raf = timer = undefined;
    if (r !== undefined) try { port.cancelRaf(r); } catch (e) { problems.push('cancel RAF: ' + message(e)); }
    if (t !== undefined) try { port.cancelTimer(t); } catch (e) { problems.push('cancel timer: ' + message(e)); }
    result = { reason: problems.length ? 'error' : reason, problems }; const resolve = settle; settle = null; resolve?.(result);
  }
  function remaining() {
    const now = port.now(); if (!Number.isFinite(now) || now < clock) throw Error('Invalid browser clock'); clock = now; return deadline - now;
  }
  function schedule() {
    const id = port.raf(tick); if (phase === 'running') raf = id; else port.cancelRaf(id);
  }
  function tick(at: number) {
    if (phase !== 'running') return; raf = undefined;
    try {
      const left = remaining(); if (phase !== 'running') return;
      if (left <= 0) { stop('budget'); return; }
      if (!Number.isFinite(at) || at < 0 || at <= last) throw Error('Invalid/nonincreasing waypoint RAF'); last = at;
      if (frames.length >= 512) throw Error('Waypoint frame cap reached');
      const raw = port.read(); if (phase !== 'running') return;
      const frame = inspect(raw, at); if (phase !== 'running') return;
      const afterRead = remaining(); if (phase !== 'running') return;
      if (afterRead <= 0) { stop('budget'); return; }
      frames.push(frame);
      const crossed = frame.worldX !== null && (config.direction === 'd' ? frame.worldX >= config.target - config.tolerance : frame.worldX <= config.target + config.tolerance);
      if (frame.rest || crossed) {
        snapshot = { ...raw, at, hud: [...raw.hud], rgba: new Uint8ClampedArray(raw.rgba) }; snapshotFact = frame;
        stop(frame.rest ? 'rest' : frame.inBand ? 'position' : 'passed');
      } else schedule(); // Missing reference is unknown, never cached success or an added pulse.
    } catch (e) { stop('error', [message(e)]); }
  }
  return {
    inspect,
    run(ms: number): Promise<PickupWaypointResult> {
      if (phase !== 'idle') return Promise.reject(Error('Waypoint may run only once'));
      if (!Number.isFinite(ms) || ms <= 0 || ms > 1500) return Promise.reject(Error('Waypoint budget must be <=1500ms'));
      const start = port.now(); if (!Number.isFinite(start)) return Promise.reject(Error('Invalid browser start clock'));
      if (phase !== 'idle') return Promise.resolve(result!);
      clock = start; deadline = start + ms; phase = 'running';
      return new Promise(resolve => {
        settle = resolve;
        try {
          const id = port.timer(() => { if (phase === 'running') stop('budget'); }, ms);
          if (phase === 'running') { timer = id; schedule(); } else port.cancelTimer(id);
        } catch (e) { stop('error', [message(e)]); }
      });
    },
    cancel() { stop('cancelled'); },
    finish(): Omit<PickupWaypointProof, 'node'> {
      if (phase !== 'done' || encoded || !port.frozen()) throw Error('Stopped waypoint and real frozen boundary required before encoding');
      encoded = true; let capture: PickupCapture | null = null;
      if (snapshot) capture = { at: snapshot.at, hud: [...snapshot.hud], objective: snapshot.objective, title: snapshot.title, notice: snapshot.notice, png: port.encode(new Uint8ClampedArray(snapshot.rgba)) };
      return { target: config.target, tolerance: config.tolerance, direction: config.direction, referenceWorld: config.reference, referenceSlot: source.reference.slot, allowRest: config.allowRest, frames, result, snapshot: capture, snapshotFact };
    },
  };
}

export async function completePickupActions(actions: { phase: string; run: () => unknown | Promise<unknown> }[]) {
  const failures: { phase: string; reason: unknown }[] = [];
  for (const action of actions) try { await action.run(); } catch (reason) { failures.push({ phase: action.phase, reason }); }
  if (failures.length === 1) throw failures[0].reason;
  if (failures.length) throw Object.assign(Error('Pickup cleanup failed'), { failures });
}
export interface PickupWaypointStagePort<M> extends PickupMovePort<PickupWaypointResult> {
  resume(): Promise<unknown>; measure(): Promise<M>; freeze(): Promise<unknown>;
  finish(): Promise<Omit<PickupWaypointProof, 'node'>>; dispose(): Promise<unknown>;
}
export function runPickupWaypointStage<M>(port: PickupWaypointStagePort<M>, remember: (proof: PickupWaypointProof) => void, approach?: PickupApproach) {
  let node: PickupWaypointProof['node'] = null;
  return withCleanup(async () => { await port.resume(); node = await runPickupWaypointMove(port, approach); return await port.measure(); },
    () => completePickupActions([
      { phase: 'freeze', run: () => port.freeze() }, { phase: 'cancel', run: () => port.cancel() },
      { phase: 'proof', run: async () => remember({ ...await port.finish(), node }) }, { phase: 'dispose', run: () => port.dispose() },
    ]));
}
export async function preparePickupWaypoint<M>(page: Page, config: PickupWaypointConfig,
  lifecycle: { resume(): Promise<unknown>; measure(): Promise<M>; freeze(): Promise<unknown>; remember(proof: PickupWaypointProof): void },
  currentPausedCapture?: PickupCapture) {
  const approach = !config.allowRest && currentPausedCapture ? choosePickupApproach(currentPausedCapture, config) : undefined;
  const handle = await page.evaluateHandle(createPickupWaypoint, config);
  return runPickupWaypointStage({
    now: () => performance.now(), timer: (take, ms) => setTimeout(take, ms), cancelTimer: id => clearTimeout(id as ReturnType<typeof setTimeout>),
    down: () => page.keyboard.down(config.direction), up: () => page.keyboard.up(config.direction),
    observe: async ms => { const result = await handle.evaluate((observer, remaining) => observer.run(remaining), ms);
      if (result.reason === 'error') throw Error('Waypoint observation: ' + result.problems.join('; ') + '; ' + result.reason);
      return result;
    },
    cancel: () => handle.evaluate(observer => observer.cancel()), finish: () => handle.evaluate(observer => observer.finish()), dispose: () => handle.dispose(),
    isCancelled: result => result.reason === 'cancelled' && result.problems.length === 0,
    resume: lifecycle.resume, measure: lifecycle.measure, freeze: lifecycle.freeze,
  }, lifecycle.remember, approach);
}
