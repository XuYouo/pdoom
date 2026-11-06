/** Only the explicit final-combat path may finish by killing the live boss.
 * Independent binding/phase tests still require a living native boss after release.
 * Empty pixels without the actual chapter-clear UI are never a successful release.
 */
export interface SydneyReleaseEnd {
  cleared: boolean; body: unknown | null; hpPixels: number; bubbleCount: number; dangerPixels: number;
}
export function controlReleaseOutcome(end: SydneyReleaseEnd, allowChapterClear = false): 'live' | 'chapter-cleared' {
  for (const count of [end.hpPixels, end.bubbleCount, end.dangerPixels]) {
    if (!Number.isSafeInteger(count) || count < 0) throw Error('Invalid native release counts');
  }
  if (end.bubbleCount !== 0) throw Error('Control bubble still present after ordinary input');
  if (end.cleared) {
    if (!allowChapterClear) throw Error('A living boss is required for this release proof');
    if (end.body !== null || end.hpPixels !== 0 || end.dangerPixels !== 0) throw Error('Chapter-clear has residual native boss signals');
    return 'chapter-cleared';
  }
  if (end.body === null || end.hpPixels === 0) throw Error('No live native boss and no actual chapter-clear');
  return 'live';
}

/** A native capture may briefly resume to find an unoccluded body. Read the
 * actual lifecycle AFTER it settles, never act on an earlier control HUD value.
 */
export async function readCombatBoundary<T>(port: {
  capture(): Promise<T>; cleared(): Promise<boolean>; controlled(): Promise<boolean>;
}): Promise<{ view: T; kind: 'live' | 'bound' | 'cleared' }> {
  const view = await port.capture();
  if (await port.cleared()) return { view, kind: 'cleared' };
  return { view, kind: await port.controlled() ? 'bound' : 'live' };
}

/** Terminal UI removes playing-only objectives and notices. Verify the correct
 * presentation for the native lifecycle; never wait for a removed live label.
 */
export async function verifyReleaseBoundary(end: SydneyReleaseEnd, allowChapterClear: boolean, checks: {
  live(): Promise<void>; cleared(): Promise<void>;
}): Promise<'live' | 'chapter-cleared'> {
  const outcome = controlReleaseOutcome(end, allowChapterClear);
  if (outcome === 'live') await checks.live(); else await checks.cleared();
  return outcome;
}
