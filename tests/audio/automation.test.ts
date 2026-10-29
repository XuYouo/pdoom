import { describe, expect, it } from 'vitest';
import { GainAutomation, MAX_FUTURE_GAIN_RAMPS } from '../../src/pages/GamePage/game/audio/GainAutomation';
import { FakeParam } from './fakeAudio';

function setup() { const parameter = new FakeParam(); parameter.value = 0; return { parameter, native: parameter as unknown as AudioParam, automation: new GainAutomation() }; }

describe('explicit gain timeline anchors', () => {
  it('anchors full@0, zero@0.15 and full@0.30 rather than starting recovery at the old 0.18 endpoint', () => {
    const { parameter, native, automation } = setup();
    automation.ramp(native, 1, 0, 0, 0.03);
    parameter.value = 0; // A native currentTime=0 getter is not the future value at 0.15.
    automation.ramp(native, 0, 0.15, 0, 0.03);
    automation.ramp(native, 1, 0.3, 0, 0.03);
    expect(parameter.events.filter(event => event.kind === 'set')).toEqual([
      { kind: 'set', value: 0, time: 0 }, { kind: 'set', value: 1, time: 0.15 }, { kind: 'set', value: 0, time: 0.3 },
    ]);
    expect(parameter.events[parameter.events.length - 1]).toEqual({ kind: 'linear', value: 1, time: 0.3 + 0.03 });
  });
  it('continues an interrupted ramp from its interpolated value, not its final target', () => {
    const { parameter, native, automation } = setup();
    automation.ramp(native, 1, 0, 0, 0.1);
    automation.ramp(native, 0, 0.025, 0.025, 0.03);
    const starts = parameter.events.filter(event => event.kind === 'set');
    expect(starts[1].value).toBeCloseTo(0.25); expect(starts[1].time).toBe(0.025);
  });
  it('cancels later queued changes and computes an earlier replacement from retained history', () => {
    const { parameter, native, automation } = setup();
    automation.ramp(native, 1, 0, 0, 0.1);
    automation.ramp(native, 0, 0.2, 0, 0.03);
    automation.ramp(native, 1, 0.4, 0, 0.03);
    automation.ramp(native, 0, 0.05, 0, 0.03);
    const starts = parameter.events.filter(event => event.kind === 'set');
    expect(starts[starts.length - 1]).toEqual({ kind: 'set', value: 0.5, time: 0.05 });
    expect(parameter.events[parameter.events.length - 3]).toEqual({ kind: 'hold', time: 0.05 });
  });
  it('does not restart an unchanged zero ramp on every game frame', () => {
    const { parameter, native, automation } = setup();
    automation.ramp(native, 1, 0, 0, 0.03); automation.ramp(native, 0, 0.1, 0.1, 0.03);
    const count = parameter.events.length;
    expect(automation.ramp(native, 0, 0.11, 0.11, 0.03)).toBe(false);
    expect(automation.ramp(native, 0, 0.14, 0.14, 0.03)).toBe(false);
    expect(parameter.events.length).toBe(count);
  });
  it('handles repeated full/zero transitions at a nonzero audio clock without growing or restarting settled targets', () => {
    const { parameter, native, automation } = setup();
    let changes = 0;
    for (let frame = 0; frame < 2000; frame++) {
      const now = 137.008 + frame / 120;
      const target = Math.floor(frame / 20) % 2 ? 0 : 0.58;
      if (automation.ramp(native, target, now, now, 0.03)) changes++;
    }
    expect(changes).toBe(100);
    expect(parameter.events.filter(event => event.kind === 'set').every(event => Number.isFinite(event.value) && event.value! >= 0 && event.value! <= 0.58)).toBe(true);
    expect(parameter.events[parameter.events.length - 1].value).toBe(0);
  });
  it('does not treat a stale inactive-node value getter as the gain timeline or force it to match', () => {
    const { parameter, native, automation } = setup();
    automation.ramp(native, 0.58, 12.125, 12.125, 0.03);
    automation.ramp(native, 0, 13, 13, 0.03);
    parameter.value = 0.42573609948; // Model a stale getter only, not native PCM output.
    const count = parameter.events.length;
    expect(automation.ramp(native, 0, 14, 14, 0.03)).toBe(false);
    expect(parameter.events.length).toBe(count); expect(parameter.value).toBe(0.42573609948);
    automation.ramp(native, 0.58, 14.125, 14.125, 0.03);
    expect(parameter.events[parameter.events.length - 2]).toEqual({ kind: 'set', value: 0, time: 14.125 });
  });
  it('bounds future automation but prunes completed history during long-running playback', () => {
    const future = setup();
    for (let index = 0; index < MAX_FUTURE_GAIN_RAMPS; index++) future.automation.ramp(future.native, index % 2 ? 0 : 1, index * 0.1, 0, 0.03);
    expect(() => future.automation.ramp(future.native, 1, 10, 0, 0.03)).toThrow('Too many future gain ramps');
    const realtime = setup();
    expect(() => { for (let index = 0; index < 1000; index++) realtime.automation.ramp(realtime.native, index % 2 ? 0 : 1, index * 0.1, index * 0.1, 0.03); }).not.toThrow();
    realtime.automation.clear();
  });
});
