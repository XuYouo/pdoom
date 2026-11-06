/** Test-only preparation. The port exposes public HUD/native registration and ordinary input, never World writes. */
export interface ObservationReady {
  hp: number; tokens: number; seconds: number; x: number; heroRegistered: boolean; referenceRegistered: boolean;
}
export interface Threat { id: string; x: number; y: number }
export const OBSERVATION_THREATS: readonly Threat[] = [
  { id: 'repeater1', x: 950, y: 306 }, { id: 'parrot2', x: 1120, y: 178 }, { id: 'deceiver1', x: 1510, y: 241 },
];
export interface ObservationCombat<T extends ObservationReady> {
  observe(): Promise<T>;
  shoot(target: Threat, burst: number, milliseconds: number): Promise<T>;
  drain(seconds: number): Promise<T>;
}
function requireEvidence(value: ObservationReady) {
  if (![value.hp, value.tokens, value.seconds, value.x].every(Number.isFinite) || value.hp <= 0 || value.hp > 100 || value.tokens < 0 || value.seconds < 0 || value.x < 1180 || value.x > 1325 || !value.heroRegistered || !value.referenceRegistered) throw Error('Incomplete live public evidence');
}
/** Preparation only. No absence pixels or acceptance-window callback can enter this port. */
export async function prepareClearedObservation<T extends ObservationReady>(port: ObservationCombat<T>): Promise<T> {
  let current = await port.observe(); requireEvidence(current);
  const originX = current.x;
  // The right repeater starts firing within390px. Five pixels cover registration/settling uncertainty.
  const threats = current.x >= 1295 ? [...OBSERVATION_THREATS, { id: 'repeater2', x: 1690, y: 306 }] : OBSERVATION_THREATS;
  const stationary = (value: T) => { if (Math.abs(value.x - originX) > 2) throw Error('Native actor position left the planned threat range'); };
  for (const target of threats) {
    const before = current.tokens;
    for (let burst = 1; burst <= 8 && current.tokens === before; burst++) {
      const previous = current;
      current = await port.shoot(target, burst, 400); requireEvidence(current); stationary(current);
      if (current.seconds < previous.seconds) throw Error('Public clock moved backwards');
      if (current.tokens !== before && current.tokens !== before + 6) throw Error('Unexpected public reward during ordinary shooting');
    }
    if (current.tokens !== before + 6) throw Error('No observed kill after eight bounded ordinary bursts: ' + target.id);
  }
  const beforeDrain = current;
  current = await port.drain(8); requireEvidence(current); stationary(current);
  if (current.seconds < beforeDrain.seconds + 8) throw Error('Public clock did not drain old projectiles and blink');
  if (current.tokens !== beforeDrain.tokens) throw Error('Unexpected reward while draining');
  return current;
}
export function visibleAim(origin: { x: number; y: number }, target: { x: number; y: number }) {
  if (![origin.x, origin.y, target.x, target.y].every(Number.isFinite) || origin.x < 8 || origin.x > 632 || origin.y < 8 || origin.y > 352) throw Error('Invalid native aim observation');
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const tx = dx > 0 ? (632 - origin.x) / dx : dx < 0 ? (8 - origin.x) / dx : Infinity;
  const ty = dy > 0 ? (352 - origin.y) / dy : dy < 0 ? (8 - origin.y) / dy : Infinity;
  const t = Math.min(1, tx, ty);
  return { x: origin.x + dx * t, y: origin.y + dy * t };
}
