import type { Page } from '@playwright/test';
import type { OmegaSource } from './omega-environment-pixels';
export type OmegaGoal = 'gap-jump' | 'closed-door' | 'room-baseline' | 'projection' | 'reveal';
type Source = Pick<OmegaSource, 'hero' | 'props'>;
export interface OmegaRead { rgba: Uint8ClampedArray; hud: string[]; omega: string }
export interface OmegaPreparationPort {
  now(): number; raf(take: (at: number) => void): number; cancelRaf(id: number): void;
  timer(take: () => void, ms: number): number; cancelTimer(id: number): void;
  read(): OmegaRead; encode(rgba: Uint8ClampedArray): string;
}
export interface OmegaPosition { x: number; y: number; slot: number; ink: number; centerX: number; feet: number }
export interface OmegaReadyFrame { at: number; elapsed: number; hud: string[]; omega: string; hero: OmegaPosition | null;
  floor: { x: number; width: number }[]; props: { slot: number; x: number }[]; qualifies: boolean; unsafe: string | null }
export type OmegaPreparationResult = { ok: true; frame: OmegaReadyFrame } | { ok: false; problems: string[] };
export interface OmegaPreparationProof { goal: OmegaGoal; budget: number | null; frames: OmegaReadyFrame[]; selected: OmegaReadyFrame | null; png: string | null; aborted: OmegaReadyFrame | null; abortedPng: string | null; result: OmegaPreparationResult | null; nodePreparationMs?: number | null }
/** Serialized alone into the browser. Reads only native canvas + public HUD; never sends input or reads engine state. */
export function createOmegaPreparation(config: { goal: OmegaGoal; source: Source }, port?: OmegaPreparationPort) {
  const goals: OmegaGoal[] = ['gap-jump', 'closed-door', 'room-baseline', 'projection', 'reveal'];
  if (!goals.includes(config.goal) || !config.source.hero.length) throw Error('Invalid Omega preparation configuration');
  if (!port) {
    const canvas = document.querySelector('canvas');
    if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Actual640x360 canvas required');
    const copy = document.createElement('canvas'); copy.width = 640; copy.height = 360;
    const ctx = copy.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('Native copy context required');
    port = { now: () => performance.now(), raf: take => requestAnimationFrame(take), cancelRaf: id => cancelAnimationFrame(id),
      timer: (take, ms) => window.setTimeout(take, ms), cancelTimer: id => window.clearTimeout(id),
      read: () => {
        if (canvas.width !== 640 || canvas.height !== 360) throw Error('Native canvas dimensions changed');
        ctx.clearRect(0, 0, 640, 360); ctx.drawImage(canvas, 0, 0);
        return { rgba: ctx.getImageData(0, 0, 640, 360).data, hud: [...document.querySelectorAll('.hud-cell')].map(n => n.textContent ?? ''), omega: document.querySelector('.omega-readout')?.textContent ?? '' };
      }, encode: rgba => { ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), 640, 360), 0, 0); return copy.toDataURL('image/png'); } };
  }
  const io = port, W = 640, H = 360, props = config.source.props.filter(s => [3, 4, 5].includes(s.slot));
  const stamps = [...config.source.hero, ...props];
  for (const s of stamps) if (!s.points.length || !s.anchors.length || s.points.length <= 100) throw Error('Nonempty full source stamp required');
  const anchorColors = new Set(stamps.map(s => s.anchors[0].color));
  let phase: 'idle' | 'running' | 'done' = 'idle', raf: number | null = null, timer: number | null = null;
  let start = 0, deadline = 0, last = -Infinity, budget: number | null = null, settle: ((r: OmegaPreparationResult) => void) | null = null;
  let result: OmegaPreparationResult | null = null, selected: OmegaReadyFrame | null = null, selectedRgba: Uint8ClampedArray | null = null;
  const frames: OmegaReadyFrame[] = [];
  let critical = false, aborted: OmegaReadyFrame | null = null, abortedRgba: Uint8ClampedArray | null = null;
  const message = (error: unknown) => { try { return (error instanceof Error ? error.message : String(error)).slice(0, 1024); } catch { return '<unprintable error>'; } };
  function stop(next: OmegaPreparationResult) {
    if (phase === 'done') return; phase = 'done'; const problems = next.ok ? [] : [...next.problems];
    const r = raf, t = timer; raf = timer = null;
    if (r !== null) try { io.cancelRaf(r); } catch (e) { problems.push('cancel RAF: ' + message(e)); }
    if (t !== null) try { io.cancelTimer(t); } catch (e) { problems.push('cancel timer: ' + message(e)); }
    result = problems.length ? { ok: false, problems } : next; settle?.(result); settle = null;
  }
  function inspect(raw: OmegaRead, at: number): OmegaReadyFrame {
    if (!(raw.rgba instanceof Uint8ClampedArray) || raw.rgba.length !== W * H * 4) throw Error('Invalid native RGBA');
    const health = /^HP(\d+)\/100$/.exec(raw.hud[0]?.replace(/\s/g, '') ?? '');
    if (!health || Number(health[1]) <= 0) throw Error('Missing/live-positive public HP required');
    const pixels = new Int32Array(W * H), index = new Map<number, number[]>(); pixels.fill(-1);
    for (let i = 0; i < W * H; i++) if (raw.rgba[i * 4 + 3] === 255) {
      const rgb = (raw.rgba[i * 4] << 16) | (raw.rgba[i * 4 + 1] << 8) | raw.rgba[i * 4 + 2]; pixels[i] = rgb;
      if (anchorColors.has(rgb) || rgb === 0xd4b0ff) { const list = index.get(rgb) ?? []; list.push(i); index.set(rgb, list); }
    }
    const pixel = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H ? pixels[y * W + x] : -1;
    function find(s: Source['hero'][number], fixedY?: number) {
      const hits: { slot: number; x: number; y: number; ink: number }[] = [], a = s.anchors[0];
      for (const i of index.get(a.color) ?? []) {
        const x = i % W - a.x, y = Math.floor(i / W) - a.y;
        if (x < 0 || y < 0 || x + s.width > W || y + s.height > H || (fixedY !== undefined && y !== fixedY)) continue;
        if (!s.anchors.every(p => pixel(x + p.x, y + p.y) === p.color)) continue;
        if (s.points.every(p => pixel(x + p.x, y + p.y) === p.color)) hits.push({ slot: s.slot, x, y, ink: s.points.length });
      }
      return hits;
    }
    const markers = index.get(0xd4b0ff) ?? [], unique = new Map<string, OmegaPosition>();
    for (const s of config.source.hero) for (const hit of find(s)) {
      if (markers.some(i => Math.abs(i % W - hit.x - 16) < 22 && Math.abs(Math.floor(i / W) + 66 - hit.y - 27) < 18)) continue;
      unique.set(`${hit.x}:${hit.y}`, { ...hit, centerX: hit.x + 16, feet: hit.y + 27 });
    }
    const hero = unique.size === 1 ? [...unique.values()][0] : null;
    const floor: { x: number; width: number }[] = [];
    for (let x = 0; x < W;) {
      if (pixel(x, 320) !== 0x90c6b0) { x++; continue; }
      const begin = x; while (x < W && pixel(x, 320) === 0x90c6b0) x++;
      if (x - begin >= 20) floor.push({ x: begin, width: x - begin });
    }
    const furniture = props.flatMap(s => find(s, 200)).map(({ slot, x }) => ({ slot, x }));
    const one = (slot: number) => { const items = furniture.filter(p => p.slot === slot); return items.length === 1 ? items[0] : null; };
    const door = one(4), chair = one(3), mirror = one(5); let qualifies = false, unsafe: string | null = null;
    const between = (value: number, lo: number, hi: number) => value >= lo && value <= hi;
    const grounded = hero && hero.feet === 320;
    if (config.goal === 'gap-jump') {
      const gap = grounded ? floor.flatMap((left, i) => {
        const right = floor[i + 1], edge = left.x + left.width;
        return right && right.x - edge === 60 && hero.centerX >= left.x && hero.centerX < right.x ? [edge - hero.centerX] : [];
      }) : [];
      const distance = gap.length === 1 ? gap[0] : null;
      // Actual fixed60Hz Core sweep supports56..72,including low vx;not a wall-latency guarantee.
      qualifies = distance !== null && between(distance, 56, 72);
      if (distance !== null && distance <= 96) critical = true;
      if (distance !== null && distance < 56) unsafe = 'Gap launch band passed';
      else if (critical && distance === null) unsafe = 'Critical gap actor/geometry unavailable';
    } else if (config.goal === 'closed-door') {
      if (grounded && door) {
        qualifies = between(door.x - hero.centerX, 34, 54);
        if (door.x - hero.centerX < 34) unsafe = 'Closed-door preparation band passed';
      }
    } else {
      const chairLocated = chair?.x === 228, mirrorLocated = mirror?.x === 453;
      const roomLocated = chairLocated || mirrorLocated;
      const lo = config.goal === 'room-baseline' ? 200 : config.goal === 'projection' ? 325 : 411;
      const hi = config.goal === 'room-baseline' ? 224 : config.goal === 'projection' ? 349 : 433;
      if (grounded) {
        if (config.goal === 'room-baseline') qualifies = chairLocated && mirrorLocated && between(hero.centerX, 200, 224);
        if (config.goal === 'projection') qualifies = mirrorLocated && between(mirror.x - hero.centerX, 104, 128);
        if (config.goal === 'reveal') qualifies = chairLocated && between(hero.centerX - chair.x, 183, 205);
        if (roomLocated && hero.centerX >= lo - 24) critical = true;
        if (roomLocated && hero.centerX > hi) unsafe = 'Room preparation band passed';
      }
      // Alternate anchors and remembered proximity may only STOP;never supply a success pose.
      if (!unsafe && critical && (!grounded || !roomLocated)) unsafe = 'Critical room actor/locator unavailable';
    }
    return { at, elapsed: io.now() - start, hud: [...raw.hud], omega: raw.omega, hero, floor, props: furniture, qualifies, unsafe };
  }
  function tick(at: number) {
    raf = null; if (phase !== 'running') return;
    try {
      const now = io.now(); if (!Number.isFinite(now) || now < last || !Number.isFinite(at)) throw Error('Nonmonotonic preparation clock');
      last = now; if (now > deadline) { stop({ ok: false, problems: ['Preparation5000ms budget exhausted'] }); return; }
      const raw = io.read(), frame = inspect(raw, at); frames.push(frame);
      const end = io.now(); if (!Number.isFinite(end) || end < now || end > deadline) { stop({ ok: false, problems: ['Preparation expired during native read'] }); return; }
      if (frame.qualifies) { selected = frame; selectedRgba = new Uint8ClampedArray(raw.rgba); stop({ ok: true, frame }); }
      else if (frame.unsafe) { aborted = frame; abortedRgba = new Uint8ClampedArray(raw.rgba); stop({ ok: false, problems: [frame.unsafe] }); }
      else if (frames.length >= 2048) stop({ ok: false, problems: ['Preparation frame safety cap reached'] });
      else raf = io.raf(tick);
    } catch (error) { stop({ ok: false, problems: ['Preparation read: ' + message(error)] }); }
  }
  return {
    run(ms: number): Promise<OmegaPreparationResult> {
      if (phase !== 'idle') return Promise.resolve({ ok: false, problems: ['Preparation can start only once'] });
      if (!Number.isFinite(ms) || ms <= 0 || ms > 5000) { stop({ ok: false, problems: ['Invalid/exhausted preparation budget'] }); return Promise.resolve(result!); }
      budget = ms; start = io.now(); if (!Number.isFinite(start)) { stop({ ok: false, problems: ['Invalid initial clock'] }); return Promise.resolve(result!); }
      deadline = start + ms; last = start; phase = 'running';
      return new Promise(resolve => {
        settle = resolve;
        try { timer = io.timer(() => stop({ ok: false, problems: ['Preparation deadline reached'] }), ms); raf = io.raf(tick); }
        catch (error) { stop({ ok: false, problems: ['Preparation schedule: ' + message(error)] }); }
      });
    },
    cancel() { stop({ ok: false, problems: ['Preparation cancelled'] }); },
    finish(): OmegaPreparationProof {
      if (phase !== 'done') throw Error('Preparation must stop before PNG encoding');
      return { goal: config.goal, budget, frames, selected, png: selectedRgba ? io.encode(selectedRgba) : null,
        aborted, abortedPng: abortedRgba ? io.encode(abortedRgba) : null, result };
    },
  };
}

export interface OmegaMovePort<R> {
  now(): number; timer(take: () => void, ms: number): unknown; cancelTimer(id: unknown): void;
  down(): Promise<unknown>; up(): Promise<unknown>; observe(ms: number): Promise<R>; cancel(): Promise<unknown>;
}
/** Owns only ordinary movement. No encoding port exists here: original measurement/pause must run first. */
export async function runOmegaMovement<R, M = undefined>(port: OmegaMovePort<R>, followThrough?: () => Promise<unknown>, measure?: () => Promise<M>) {
  const failures: { phase: string; reason: unknown }[] = [];
  let ready: R | undefined, measurement: M | undefined, started = 0, preparationMs = 0;
  let downAttempted = false, downSettled = false, lateRelease = false, aborted = false, preparing = true;
  let releasePromise: Promise<void> | null = null, cancelPromise: Promise<void> | null = null, timer: unknown, armed = false;
  let wake!: () => void; const interrupted = new Promise<void>(resolve => { wake = resolve; });
  const attempt = async (phase: string, operation: () => Promise<unknown>) => { try { await operation(); } catch (reason) { failures.push({ phase, reason }); } };
  const release = () => releasePromise ??= downAttempted ? Promise.resolve().then(async () => {
    try { await port.up(); } catch (reason) { failures.push({ phase: 'release', reason }); await cancel(); }
  }) : Promise.resolve();
  const cancel = () => cancelPromise ??= attempt('cancel', () => port.cancel());
  function abort() {
    if (!aborted) { aborted = true; lateRelease = downAttempted && !downSettled; wake(); }
    void release(); void cancel();
  }
  function clearDeadline() {
    preparing = false; if (!armed) return; armed = false;
    try { port.cancelTimer(timer); } catch (reason) { failures.push({ phase: 'deadline cleanup', reason }); abort(); }
  }
  try {
    started = port.now(); if (!Number.isFinite(started)) throw Error('Invalid preparation start clock');
    timer = port.timer(() => { if (preparing) { failures.push({ phase: 'deadline', reason: Error('Preparation5000ms deadline reached') }); abort(); } }, 5000); armed = true;
    if (!aborted) {
      downAttempted = true;
      const down = (async () => { try { await port.down(); } catch (reason) { downSettled = true; failures.push({ phase: 'down', reason }); abort(); } finally { downSettled = true; } })();
      await Promise.race([down, interrupted]);
      await down; // A late dispatch must settle before the final owned-key release.
      if (lateRelease) { await release(); await attempt('late down release', () => port.up()); }
      if (!aborted) {
        const elapsed = port.now() - started;
        if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 5000) throw Error('Preparation deadline exhausted during key down');
        const observing = (async () => {
          try { const value = await port.observe(5000 - elapsed); return { ok: true as const, value }; }
          catch (reason) { failures.push({ phase: 'observation', reason }); abort(); return { ok: false as const }; }
        })();
        const measuring = (async () => {
          try { measurement = await measure?.(); }
          catch (reason) { failures.push({ phase: 'measurement', reason }); abort(); }
        })();
        const motion = (async () => {
          try {
            const observed = await Promise.race([observing, interrupted.then(() => null)]);
            if (observed?.ok && !aborted) {
              preparationMs = port.now() - started;
              if (!Number.isFinite(preparationMs) || preparationMs < elapsed || preparationMs > 5000) throw Error('Preparation reply outside authorized deadline');
              ready = observed.value; clearDeadline(); if (!aborted) await followThrough?.();
            }
          } catch (reason) { failures.push({ phase: 'movement', reason }); abort(); }
          finally { await release(); }
        })();
        // The original measurement has no cancellation port: release input immediately, then drain this one call.
        await Promise.all([motion, observing, measuring]);
      }
    }
  } catch (reason) { failures.push({ phase: 'start', reason }); abort(); }
  finally { clearDeadline(); if (downAttempted) await release(); if (aborted || failures.length) await cancel(); }
  if (failures.length === 1) throw failures[0].reason;
  if (failures.length) {
    const describe = (value: unknown) => { try { return (value instanceof Error ? value.message : String(value)).slice(0, 1024); } catch { return '<unprintable failure>'; } };
    throw Object.assign(Error(failures.map(f => `${f.phase}: ${describe(f.reason)}`).join('\n')), { failures });
  }
  return { ready: ready!, measurement: measurement as M, preparationMs };
}

function failureText(value: unknown) { try { return (value instanceof Error ? value.message : String(value)).slice(0, 1024); } catch { return '<unprintable failure>'; } }
/** Every owned release/diagnostic is attempted; a falsy failure is still a failure. */
export async function completeOmegaActions(actions: { phase: string; run: () => unknown | Promise<unknown> }[]) {
  const failures: { phase: string; reason: unknown }[] = [];
  for (const action of actions) try { await action.run(); } catch (reason) { failures.push({ phase: action.phase, reason }); }
  if (failures.length === 1) throw failures[0].reason;
  if (failures.length) throw Object.assign(Error(failures.map(f => `${f.phase}: ${failureText(f.reason)}`).join('; ')), { failures });
}
export interface OmegaPreparationTicket { finalize(): Promise<OmegaPreparationProof> }
/** Encoding is deliberately deferred to the caller's original pause (or failed-test cleanup). */
export function createOmegaTicket(port: { finish(): Promise<OmegaPreparationProof>; dispose(): Promise<unknown> }): OmegaPreparationTicket {
  let finalized: Promise<OmegaPreparationProof> | null = null;
  return { finalize: () => finalized ??= (async () => {
    let failed = false, primary: unknown, proof!: OmegaPreparationProof;
    try { proof = await port.finish(); } catch (error) { failed = true; primary = error; }
    try { await port.dispose(); } catch (cleanupError) {
      if (!failed) throw cleanupError;
      throw Object.assign(Error(`Omega encode: ${failureText(primary)}; dispose: ${failureText(cleanupError)}`), { cause: primary, cleanupError });
    }
    if (failed) throw primary; return proof;
  })() };
}
export async function flushOmegaPreparations(pending: OmegaPreparationTicket[], confirmBoundary: () => Promise<unknown>, remember: (proof: OmegaPreparationProof) => void = () => {}) {
  await confirmBoundary(); // Never encode before the original measurement/pause guard completes.
  const tickets = pending.splice(0), outcomes = await Promise.allSettled(tickets.map(async ticket => { const proof = await ticket.finalize(); remember(proof); return proof; }));
  const failures = outcomes.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length === 1) throw failures[0].reason;
  if (failures.length) throw Object.assign(Error(failures.map((f, i) => `Finalizer[${i}]: ${failureText(f.reason)}`).join('; ')), { failures: failures.map(r => r.reason) });
  return outcomes.map(r => (r as PromiseFulfilledResult<OmegaPreparationProof>).value);
}
export async function prepareOmega<M = undefined>(page: Page, source: OmegaSource, goal: OmegaGoal,
  pending: OmegaPreparationTicket[], followThrough?: () => Promise<unknown>, measure?: () => Promise<M>) {
  if (!Array.isArray(pending)) throw Error('Preparation finalizer queue required');
  const handle = await page.evaluateHandle(createOmegaPreparation, { goal, source: { hero: source.hero, props: source.props } });
  let preparationMs: number | null = null;
  pending.push(createOmegaTicket({ finish: async () => ({ ...await handle.evaluate(value => value.finish()), nodePreparationMs: preparationMs }), dispose: () => handle.dispose() }));
  const movement = await runOmegaMovement({ now: () => performance.now(), timer: (take, ms) => setTimeout(take, ms),
    cancelTimer: id => clearTimeout(id as ReturnType<typeof setTimeout>),
    down: () => page.keyboard.down('d'), up: () => page.keyboard.up('d'),
    observe: async ms => {
      const response = await handle.evaluate((value, remaining) => value.run(remaining), ms);
      if (!response.ok) throw Error(`Omega ${goal} preparation: ${response.problems.join('; ')}`);
      return response.frame;
    }, cancel: () => handle.evaluate(value => value.cancel()),
  }, followThrough, measure);
  preparationMs = movement.preparationMs; return movement;
}
