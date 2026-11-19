import { EMPTY_INPUT, type FrameInput } from '../game/entities/model';
import { isRecord } from './protocol';

export type NetworkInput = FrameInput & { reviveHeld: boolean };
const empty = (): NetworkInput => ({ ...EMPTY_INPUT, reviveHeld: false });
const edges = ['jumpPressed', 'dashPressed', 'rewindPressed', 'insightPressed', 'rerollPressed'] as const;
const requiredBooleans = ['jumpPressed', 'jumpHeld', 'dashPressed', 'fire', 'rewindPressed', 'insightPressed'] as const;
const optionalBooleans = ['rerollPressed', 'reviveHeld'] as const;
const requiredKeys = ['move', 'aim', ...requiredBooleans] as const;
const allowedKeys: ReadonlySet<string> = new Set([...requiredKeys, ...optionalBooleans]);

export function mergeCoopInputs(earlier: NetworkInput | null, latest: NetworkInput): NetworkInput {
  if (!earlier) return { ...latest, aim: latest.aim && { ...latest.aim } };
  const result = { ...latest, aim: latest.aim && { ...latest.aim }, fire: latest.fire || earlier.fire };
  for (const edge of edges) result[edge] = !!latest[edge] || !!earlier[edge];
  return result;
}

export function parseCoopInput(payload: unknown): NetworkInput | null {
  if (!isRecord(payload) || ![-1, 0, 1].includes(payload.move as number)) return null;
  const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
  if (!requiredKeys.every(has) || Object.keys(payload).some(key => !allowedKeys.has(key))) return null;
  for (const key of requiredBooleans) if (typeof payload[key] !== 'boolean') return null;
  for (const key of optionalBooleans) if (has(key) && typeof payload[key] !== 'boolean') return null;
  const aim = payload.aim;
  if (aim !== null && (!isRecord(aim) || typeof aim.x !== 'number' || typeof aim.y !== 'number'
    || Object.keys(aim).length !== 2 || !Object.keys(aim).every(key => key === 'x' || key === 'y')
    || !Number.isFinite(aim.x) || !Number.isFinite(aim.y) || Math.abs(aim.x) > 1_000_000 || Math.abs(aim.y) > 1_000_000)) return null;
  return { move: payload.move as -1 | 0 | 1, jumpPressed: payload.jumpPressed as boolean, jumpHeld: payload.jumpHeld as boolean,
    dashPressed: payload.dashPressed as boolean, fire: payload.fire as boolean,
    aim: aim === null ? null : { x: aim.x as number, y: aim.y as number }, rewindPressed: payload.rewindPressed as boolean,
    insightPressed: payload.insightPressed as boolean,
    rerollPressed: has('rerollPressed') && payload.rerollPressed === true, reviveHeld: has('reviveHeld') && payload.reviveHeld === true };
}

/** Keep discrete presses until a host tick consumes them; stale held movement never runs forever. */
export class CoopInputBuffer {
  private pending = empty();
  private held = empty();
  private receivedAt = -Infinity;
  push(value: NetworkInput, now: number) {
    this.pending = mergeCoopInputs(this.pending, value); this.held = { ...value }; this.receivedAt = now;
  }
  consume(now: number): NetworkInput {
    if (now - this.receivedAt > 250) { this.clear(); return empty(); }
    const input = this.pending;
    this.pending = { ...this.held };
    for (const edge of edges) this.pending[edge] = false;
    return input;
  }
  clear() { this.pending = empty(); this.held = empty(); this.receivedAt = -Infinity; }
}
