import { withCleanup } from './factory-navigation';

interface LoomActorObservation { orange: { count: number; x: number; bottom: number } }
/** Only presence is retried, never a displacement, line crossing or outcome predicate.
 * The first real actor frame wins even if it makes the caller's original assertion fail.
 * Public raster callbacks stay unchanged; no cached/synthetic actor replaces an empty frame.
 */
export async function observeLoomActor<T extends LoomActorObservation>(read: () => Promise<T>) {
  const observations: LoomActorObservation['orange'][] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const value = await read(), actor = value.orange;
    observations.push({ ...actor });
    if (Number.isInteger(actor.count) && actor.count >= 60 && Number.isFinite(actor.x) && actor.x >= 0 && actor.x < 640
      && Number.isFinite(actor.bottom) && actor.bottom > 0 && actor.bottom < 360) return { value, observations };
  }
  throw Error('No visible native Loom actor in eight bounded observations: ' + JSON.stringify(observations));
}

export interface LoomExitPort<T> {
  leftDown(): Promise<void>; leftUp(): Promise<void>;
  observe(): Promise<T>; waitForDeath(): Promise<void>;
}
/** Ordinary left movement overlaps observation instead of starting after its weak-window cost.
 * No altered clock, life/position write, retry, or pose-based success predicate.
 * A failed down/observation/death wait still releases A and preserves the primary cause.
 */
export function observeWhileLeavingLoom<T>(port: LoomExitPort<T>): Promise<T> {
  return withCleanup(async () => {
    await port.leftDown();
    const result = await port.observe();
    await port.waitForDeath();
    return result;
  }, () => port.leftUp());
}

export interface LoomMovePort {
  horizontalDown(): Promise<void>; horizontalUp(): Promise<void>;
  jumpDown(): Promise<void>; jumpUp(): Promise<void>;
  wait(): Promise<void>; settle(): Promise<void>;
}
/** Request horizontal release after the original wait, before awaiting Space-up.
 * Both releases still run on failure, preserving the original cause through withCleanup.
 * The spec owns every unchanged wait duration and ordinary keyboard command.
 */
export async function moveLoomKeys(port: LoomMovePort, jump: boolean): Promise<void> {
  await withCleanup(() => withCleanup(async () => {
    await port.horizontalDown();
    if (jump) await port.jumpDown();
    await port.wait();
  }, () => port.horizontalUp()), async () => { if (jump) await port.jumpUp(); });
  await port.settle();
}

interface LoomStagingPort<T> {
  held: 'a' | 'd' | null;
  release(): Promise<void>;
  observe(): Promise<T>;
}
/** D is a bounded pulse, never extended by PNG observation/decoding.
 * Keep A held: it is the original live suction counter-steer, not a disposable tap.
 * No actor/arrow/support predicate, extra sample, retry or coordinate replacement here.
 */
export async function observeLoomStaging<T>(port: LoomStagingPort<T>): Promise<T> {
  if (port.held === 'd') await port.release();
  return port.observe();
}

/** Far-left transit is a finite ordinary stroke, not 100 stop/read pulses.
 * Reuse navigation's nominal190px/s and65..350ms request bounds, aiming80px
 * LEFT of the visible line. These are control estimates, not Core-time promises.
 * Near-line and unsupported observations never authorize this coarse movement.
 */
export function loomApproachDuration(gap: number, supported: boolean): number {
  if (!supported || !Number.isFinite(gap) || gap >= -80) return 0;
  return Math.min(350, Math.max(65, (-80 - gap) / 190 * 1000));
}
