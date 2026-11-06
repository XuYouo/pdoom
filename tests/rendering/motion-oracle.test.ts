import { describe, expect, it } from 'vitest';
import { assertReducedTrace, type MotionTrace } from '../e2e/motion-capture';
function trace(): MotionTrace {
  return { images: [], frames: Array.from({ length: 80 }, (_, i) => ({ at: i * 17, hp: i < 40 ? 100 : 90, clock: i < 40 ? '00:10' : '00:11', groundRow: 321, groundChangedPixels: 0, edgeCounts: [360] })) };
}
describe('motion observation guard counterexamples', () => {
  it('accepts only the stationary observation while health and time continue', () => expect(() => assertReducedTrace(trace())).not.toThrow());
  it('rejects a single changed native pixel even without vertical movement', () => {
    const value = trace(); value.frames[40].groundChangedPixels = 1;
    expect(() => assertReducedTrace(value)).toThrow(/either axis/);
  });
  it('rejects a vertically shifted edge even if another sampler claims zero changed pixels', () => {
    const value = trace(); value.frames[40].groundRow = 320;
    expect(() => assertReducedTrace(value)).toThrow(/vertically/);
  });
  it('rejects a blank or missing landmark instead of calling it still', () => {
    const value = trace(); value.frames.forEach(f => { f.groundRow = -1; });
    expect(() => assertReducedTrace(value)).toThrow(/missing landmark/);
  });
  it('rejects an idle safe checkpoint with no incoming damage', () => {
    const value = trace(); value.frames.forEach(f => { f.hp = 100; });
    expect(() => assertReducedTrace(value)).toThrow(/new real damage/);
  });
  it('rejects a frozen simulation', () => {
    const value = trace(); value.frames.forEach(f => { f.clock = '00:10'; });
    expect(() => assertReducedTrace(value)).toThrow(/clock must keep advancing/);
  });
  it('rejects stopped motion caused by death', () => {
    const value = trace(); value.frames.at(-1)!.hp = 0;
    expect(() => assertReducedTrace(value)).toThrow(/Live player/);
  });
  it('rejects an undersampled observation', () => {
    const value = trace(); value.frames.pop(); expect(() => assertReducedTrace(value)).toThrow(/Insufficient/);
  });
});
