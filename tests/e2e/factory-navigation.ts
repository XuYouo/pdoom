import type { Page } from '@playwright/test';

/** Public DOM delivery contract; InputSystem does not require canvas-only focus. */
export function navigationReceiver(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const inDialog = !!active?.closest('dialog');
    const textEntry = !!active && (active.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(active.tagName));
    return { ready: !!active && !inDialog && !textEntry, tag: active?.tagName ?? null, inDialog, textEntry };
  });
}
/** Always clean up, retaining both failures instead of replacing the primary one. */
export async function withCleanup<T>(operation: () => Promise<T>, cleanup: () => Promise<void>): Promise<T> {
  let failed = false, primary: unknown, result!: T;
  try { result = await operation(); } catch (error) { failed = true; primary = error; }
  try { await cleanup(); } catch (cleanupError) {
    if (!failed) throw cleanupError;
    throw Object.assign(new Error('Operation failed: ' + String(primary) + '; cleanup also failed: ' + String(cleanupError)), { cause: primary, cleanupError });
  }
  if (failed) throw primary;
  return result;
}

export interface HeroSample { count: number; x: number | null; bottom: number }
export interface NavigationPort<T extends HeroSample> {
  pause(): Promise<void>; resume(): Promise<void>; alive(): Promise<void>;
  measure(): Promise<T>; wait(ms: number): Promise<void>; frame(): Promise<number>;
  down(key: 'a' | 'd'): Promise<void>; up(key: 'a' | 'd'): Promise<void>;
}
/** Measurement stays paused; only ordinary input spends sea budget. */
export async function alignFactoryEntry<T extends HeroSample>(port: NavigationPort<T>) {
  const alignment: number[] = [], frameAcks: number[] = []; let blinks = 0, movedSinceBrake = false;
  const failure = (message: string) => Error(message + '; actual alignment: ' + JSON.stringify(alignment) + '; public rAF: ' + JSON.stringify(frameAcks));
  const advance = async (ms: number) => {
    await Promise.all([port.wait(ms), port.frame().then(at => { frameAcks.push(at); })]);
  };
  for (let correction = 0; correction <= 12; correction++) {
    await port.pause(); await port.alive();
    let hero = await port.measure();
    while (hero.count <= 20 || hero.x === null) {
      if (blinks++ >= 12) throw failure('No visible native Clawd within bounded blink observations');
      await withCleanup(async () => { await port.resume(); await advance(90); }, () => port.pause());
      await port.alive(); hero = await port.measure();
    }
    if (!Number.isFinite(hero.x) || !Number.isFinite(hero.count)) throw failure('Invalid native hero sample');
    alignment.push(hero.x);
    if (Math.abs(hero.x - 320) <= 4) return { alignment, hero };
    if (correction === 12) throw failure('Factory alignment did not reach x320 +/-4 in 12 corrections');
    const previous = alignment[alignment.length - 2];
    // A render frame is not a fixed number of Core ticks. After a measured
    // crossing or close approach, use ordinary neutral input and remeasure;
    // never plan an away/toward pair across pause/resume against guessed ticks.
    const crossed = previous !== undefined && (hero.x - 320) * (previous - 320) < 0;
    const nearApproach = previous !== undefined && Math.abs(hero.x - 320) <= 10 && Math.abs(hero.x - previous) > 1;
    if (movedSinceBrake && (crossed || nearApproach)) {
      await withCleanup(async () => { await port.resume(); await advance(85); }, () => port.pause());
      movedSinceBrake = false;
      continue;
    }
    const key: 'a' | 'd' = hero.x > 320 ? 'a' : 'd';
    const ms = Math.min(200, Math.max(18, (Math.abs(hero.x - 320) - 2) / 190 * 1000));
    await withCleanup(async () => {
      await port.resume();
      await withCleanup(async () => { await port.down(key); await advance(ms); }, () => port.up(key));
      // Freeze and inspect the actual post-input position, instead of always
      // adding85ms of blind motion that can skip the entire8px target window.
    }, () => port.pause());
    movedSinceBrake = true;
  }
  throw Error('Unreachable alignment exit');
}

/** Public native canvas, not a compositor screenshot underneath the pause dialog. */
export async function nativeFactoryHero(page: Page): Promise<HeroSample> {
  return page.evaluate(async () => {
    const png = await new Promise<string>((resolve, reject) => requestAnimationFrame(() => {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas || canvas.width !== 640 || canvas.height !== 360) throw Error('Expected native640x360 canvas');
        resolve(canvas.toDataURL('image/png'));
      } catch (error) { reject(error); }
    }));
    const image = new Image(); image.src = png; await image.decode();
    const probe = document.createElement('canvas'); probe.width = 640; probe.height = 360;
    const context = probe.getContext('2d'); if (!context) throw Error('No PNG pixel decoder');
    context.drawImage(image, 0, 0); const pixels = context.getImageData(0, 0, 640, 360).data;
    let count = 0, left = 640, right = 0, bottom = 0, opaque = 0;
    const colors = new Set<number>();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 255) opaque++;
      if (colors.size < 8) colors.add(pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2]);
      if (pixels[i] !== 217 || pixels[i + 1] !== 119 || pixels[i + 2] !== 87 || pixels[i + 3] !== 255) continue;
      const x = i / 4 % 640; count++; left = Math.min(left, x); right = Math.max(right, x);
      bottom = Math.max(bottom, Math.floor(i / 4 / 640));
    }
    if (opaque < 640 * 360 * 0.98 || colors.size < 8) throw Error('No substantial opaque native world frame');
    return { count, x: count ? (left + right + 1) / 2 : null, bottom };
  });
}
export function navigateFactoryEntry(page: Page, controls: Pick<NavigationPort<HeroSample>, 'pause' | 'resume' | 'alive'>) {
  return alignFactoryEntry({ ...controls, measure: () => nativeFactoryHero(page),
    frame: () => page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(resolve))),
    wait: ms => page.waitForTimeout(ms), down: key => page.keyboard.down(key), up: key => page.keyboard.up(key) });
}

export interface CaptureBoundaryPort<T> {
  sample(): Promise<T[]>; input(): Promise<void>; release(): Promise<void>; freeze(): Promise<void>;
  terminal?: () => Promise<T>;
}
/** A terminal is a separate actual capture AFTER both input and public pause. */
export async function captureInputBoundary<T>(port: CaptureBoundaryPort<T>) {
  const [sampled, acted] = await Promise.allSettled([
    Promise.resolve().then(() => port.sample()), Promise.resolve().then(() => port.input()),
  ]);
  try { await port.release(); } finally { await port.freeze(); }
  if (sampled.status === 'rejected') throw sampled.reason;
  if (acted.status === 'rejected') throw acted.reason;
  if (!sampled.value.length) throw Error('Missing timed-window evidence');
  const frames: { capture: T; phase: CapturePhase }[] = sampled.value.map(capture => ({ capture, phase: 'timed-window' }));
  if (port.terminal) frames.push({ capture: await port.terminal(), phase: 'after-input-paused' });
  return frames;
}
export type CapturePhase = 'timed-window' | 'after-input-paused';
