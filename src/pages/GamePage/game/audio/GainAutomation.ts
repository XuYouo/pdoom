interface Ramp { start: number; end: number; from: number; to: number }
interface GainState { base: number; ramps: Ramp[] }
export const MAX_FUTURE_GAIN_RAMPS = 64;

/** Owns only this graph's gain automation. Explicit anchors prevent a future ramp starting at an older event. */
export class GainAutomation {
  private readonly states = new Map<AudioParam, GainState>();

  private valueAt(state: GainState, time: number): number {
    let value = state.base;
    for (const ramp of state.ramps) {
      if (time < ramp.start) return value;
      if (time < ramp.end) return ramp.from + (ramp.to - ramp.from) * (time - ramp.start) / (ramp.end - ramp.start);
      value = ramp.to;
    }
    return value;
  }

  ramp(param: AudioParam, target: number, at: number, now: number, duration: number): boolean {
    if (![target, at, now, duration].every(Number.isFinite) || duration <= 0) throw new RangeError('Invalid gain automation');
    const time = Math.max(now, at);
    let state = this.states.get(param);
    if (!state) { state = { base: param.value, ramps: [] }; this.states.set(param, state); }
    while (state.ramps.length && state.ramps[0].end <= now) state.base = state.ramps.shift()!.to;
    const last = state.ramps[state.ramps.length - 1];
    if (last ? last.to === target && time >= last.start : state.base === target) return false;
    const held = this.valueAt(state, time);
    const interrupted = state.ramps.find(ramp => ramp.start < time && time < ramp.end);
    const kept: Ramp[] = [];
    for (const ramp of state.ramps) {
      if (ramp.end <= time) kept.push(ramp);
      else if (ramp.start < time) kept.push({ ...ramp, end: time, to: held });
      else break;
    }
    if (kept.length >= MAX_FUTURE_GAIN_RAMPS) throw new RangeError('Too many future gain ramps');
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
    else {
      param.cancelScheduledValues(time);
      if (interrupted) param.linearRampToValueAtTime(held, time); // Preserve the pre-cancel portion on older APIs.
    }
    // cancelAndHold alone is not an explicit future start event on every native timeline.
    // Also do not use param.value here: it represents currentTime, not a requested future time.
    param.setValueAtTime(held, time);
    param.linearRampToValueAtTime(target, time + duration);
    state.ramps = [...kept, { start: time, end: time + duration, from: held, to: target }];
    return true;
  }

  clear() { this.states.clear(); }
}
