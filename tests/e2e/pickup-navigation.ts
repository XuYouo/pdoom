/** Visible observations only. The browser adapter owns ordinary keys and counts every pulse. */
export interface PickupPosition { x: number | null; targetPresent: boolean }
export interface PickupMotion<T extends PickupPosition> {
  measure(): Promise<T>;
  pulse(key: 'a' | 'd', ms: number, settle: boolean, frameAck?: boolean): Promise<T>;
  coast(ms: number): Promise<T>;
}
function position(view: PickupPosition): number {
  if (!view.targetPresent || view.x === null || !Number.isFinite(view.x)) throw Error('No complete native position reference');
  return view.x;
}
/** Disappearing source stops navigation only. The caller must still prove real HP gain and registered absence. */
export async function collectVisiblePickup<T extends PickupPosition>(port: PickupMotion<T>, target: number) {
  if (!Number.isFinite(target)) throw Error('Invalid pickup target');
  let view = await port.measure(); const measured: (number | null)[] = [];
  for (let pulse = 0; pulse <= 6; pulse++) {
    measured.push(view.x);
    if (!view.targetPresent) {
      if (!pulse) throw Error('Pickup source missing before the first input');
      return view;
    }
    const x = position(view);
    if (pulse === 6 || x >= target) throw Error('Pickup approach exhausted without source disappearance: ' + JSON.stringify(measured));
    // Bounded forward approach, not a presumed130ms displacement. Retain the
    // released-key180ms tail so another pulse never assumes retained momentum.
    const ms = Math.min(130, Math.max(18, (target - x - 2) / 190 * 1000));
    view = await port.pulse('d', ms, true, true);
  }
  throw Error('Unreachable pickup approach');
}
/** Same +/-4 observation gate; every real pulse remains inside the caller's global12-stage budget. */
export async function alignVisiblePickup<T extends PickupPosition>(port: PickupMotion<T>, target: number) {
  if (!Number.isFinite(target)) throw Error('Invalid alignment target');
  let view = await port.measure(), movedSinceBrake = false; const measured: number[] = [];
  for (let correction = 0; correction <= 8; correction++) {
    const x = position(view), previous = measured.at(-1); measured.push(x);
    if (Math.abs(x - target) <= 4) return view;
    if (correction === 8) throw Error('Pickup alignment did not reach +/-4: ' + JSON.stringify(measured));
    const crossed = previous !== undefined && (x - target) * (previous - target) < 0;
    const near = previous !== undefined && Math.abs(x - target) <= 10 && Math.abs(x - previous) > 1;
    if (movedSinceBrake && (crossed || near)) {
      view = await port.coast(85); movedSinceBrake = false;
    } else {
      view = await port.pulse(x > target ? 'a' : 'd', Math.min(130, Math.max(18, (Math.abs(x - target) - 2) / 190 * 1000)), false, true);
      movedSinceBrake = true;
    }
  }
  throw Error('Unreachable pickup alignment');
}

/** Readiness only: no pickup pixels/absence values are available to this predicate.
 * All probes are retained by the caller. The original acceptance window runs once afterwards. */
export async function prepareNativeObservation(probe: (attempt: number) => Promise<readonly { heroVisible: boolean; hp: number }[]>) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const rows = await probe(attempt), hp = rows[0]?.hp;
    if (rows.length >= 2 && Number.isFinite(hp) && hp > 0 && rows.every(row => row.heroVisible && row.hp === hp)) return;
  }
  throw Error('Native hero did not finish recovery within four bounded preparation windows');
}

// Ordinary defensive retreat used after genuine healing; counts as one original movement stage.
export const HEAL_OBSERVATION_RETREAT = Object.freeze({ direction: 'a' as const, ms: 350, jump: true, feet: 258 });
