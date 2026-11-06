import { describe, expect, it, vi } from 'vitest';
import { OBSERVATION_THREATS, prepareClearedObservation, visibleAim, type ObservationCombat, type ObservationReady } from '../e2e/observation-setup';
const ready = (): ObservationReady => ({ hp: 78, tokens: 116, seconds: 32, x: 1289, heroRegistered: true, referenceRegistered: true });
function port() {
  let current = ready();
  const value: ObservationCombat<ObservationReady> = {
    observe: vi.fn(async () => current),
    shoot: vi.fn(async () => (current = { ...current, tokens: current.tokens + 6, seconds: current.seconds + 1 })),
    drain: vi.fn(async seconds => (current = { ...current, seconds: current.seconds + seconds })),
  };
  return value;
}
describe('bounded combat preparation does not inspect or repeat the later absence window', () => {
  it('requires one real HUD reward per threat then eight actual clock seconds', async () => {
    const p = port(), result = await prepareClearedObservation(p);
    expect(result.tokens).toBe(134); expect(result.seconds).toBe(43);
    expect(p.shoot).toHaveBeenCalledTimes(3); expect(p.drain).toHaveBeenCalledExactlyOnceWith(8);
    expect(vi.mocked(p.shoot).mock.calls).toEqual(OBSERVATION_THREATS.map(target => [target, 1, 400]));
  });
  it('uses bounded extra ordinary bursts, not a guessed kill or acceptance retry', async () => {
    const p = port(); let n = 0;
    vi.mocked(p.shoot).mockImplementation(async () => ({ ...ready(), tokens: 116 + 6 * Math.floor(++n / 2), seconds: 32 + n }));
    vi.mocked(p.drain).mockResolvedValue({ ...ready(), tokens: 134, seconds: 46 });
    await prepareClearedObservation(p); expect(p.shoot).toHaveBeenCalledTimes(6);
  });
  it('stops after eight unsuccessful bursts without draining or running acceptance', async () => {
    const p = port(); vi.mocked(p.shoot).mockResolvedValue(ready());
    await expect(prepareClearedObservation(p)).rejects.toThrow(/eight/);
    expect(p.shoot).toHaveBeenCalledTimes(8); expect(p.drain).not.toHaveBeenCalled();
  });
  it.each([0, 1, 12, -6])('rejects unexpected token delta%s rather than calling it a kill', async delta => {
    const p = port(); vi.mocked(p.shoot).mockResolvedValue({ ...ready(), tokens: 116 + delta });
    if (delta === 0) await expect(prepareClearedObservation(p)).rejects.toThrow(/eight/);
    else await expect(prepareClearedObservation(p)).rejects.toThrow(/reward/);
    expect(p.drain).not.toHaveBeenCalled();
  });
  it.each([{ hp: 0 }, { hp: NaN }, { tokens: NaN }, { seconds: NaN }, { heroRegistered: false }, { referenceRegistered: false }])('rejects unusable initial public evidence %#', async change => {
    const p = port(); vi.mocked(p.observe).mockResolvedValue({ ...ready(), ...change });
    await expect(prepareClearedObservation(p)).rejects.toThrow(/public evidence/); expect(p.shoot).not.toHaveBeenCalled();
  });
  it('stops on death during real shooting instead of trying another target', async () => {
    const p = port(); vi.mocked(p.shoot).mockResolvedValue({ ...ready(), hp: 0 });
    await expect(prepareClearedObservation(p)).rejects.toThrow(/public evidence/); expect(p.shoot).toHaveBeenCalledTimes(1);
  });
  it('propagates an input failure once', async () => {
    const p = port(), error = new Error('actual input failed'); vi.mocked(p.shoot).mockRejectedValue(error);
    await expect(prepareClearedObservation(p)).rejects.toBe(error); expect(p.shoot).toHaveBeenCalledTimes(1);
  });
  it('does not confuse wall waiting with public simulation clock progress', async () => {
    const p = port(); vi.mocked(p.drain).mockResolvedValue({ ...ready(), tokens: 134, seconds: 36 });
    await expect(prepareClearedObservation(p)).rejects.toThrow(/clock/);
  });
  it('rejects extra rewards during draining', async () => {
    const p = port(); vi.mocked(p.drain).mockResolvedValue({ ...ready(), tokens: 140, seconds: 50 });
    await expect(prepareClearedObservation(p)).rejects.toThrow(/reward/);
  });
  it('clears the extra right repeater when the actual position is near its activation range', async () => {
    let current = { ...ready(), x: 1300 };
    const p: ObservationCombat<ObservationReady> = {
      observe: vi.fn(async () => current),
      shoot: vi.fn(async () => (current = { ...current, tokens: current.tokens + 6, seconds: current.seconds + 1 })),
      drain: vi.fn(async seconds => (current = { ...current, seconds: current.seconds + seconds })),
    };
    const result = await prepareClearedObservation(p);
    expect(p.shoot).toHaveBeenCalledTimes(4); expect(vi.mocked(p.shoot).mock.calls[3][0].id).toBe('repeater2');
    expect(result.tokens).toBe(140);
  });
  it('does not rely on a stale safe range after the actor moved during preparation', async () => {
    const p = port(); vi.mocked(p.shoot).mockResolvedValue({ ...ready(), x: 1302, tokens: 122 });
    await expect(prepareClearedObservation(p)).rejects.toThrow(/position/); expect(p.shoot).toHaveBeenCalledTimes(1);
  });
  it.each([NaN, 1179, 1326])('rejects a position outside the observed platform:%s', async x => {
    const p = port(); vi.mocked(p.observe).mockResolvedValue({ ...ready(), x });
    await expect(prepareClearedObservation(p)).rejects.toThrow(/public evidence/); expect(p.shoot).not.toHaveBeenCalled();
  });
  it('rejects a missing final hero, never treats blink as clear', async () => {
    const p = port(); vi.mocked(p.drain).mockResolvedValue({ ...ready(), tokens: 134, seconds: 50, heroRegistered: false });
    await expect(prepareClearedObservation(p)).rejects.toThrow(/public evidence/);
  });
});
describe('ordinary mouse target stays inside native canvas along the same aim ray', () => {
  const hero = { x: 235, y: 245 };
  it('keeps a visible target unchanged', () => expect(visibleAim(hero, { x: 515, y: 241 })).toEqual({ x: 515, y: 241 }));
  it.each([{ x: -105, y: 306 }, { x: 920, y: 180 }, { x: 420, y: -180 }, { x: 100, y: 800 }])('clips offscreen target %# without changing direction', target => {
    const aim = visibleAim(hero, target);
    expect(aim.x).toBeGreaterThanOrEqual(8); expect(aim.x).toBeLessThanOrEqual(632);
    expect(aim.y).toBeGreaterThanOrEqual(8); expect(aim.y).toBeLessThanOrEqual(352);
    expect((aim.x - hero.x) * (target.y - hero.y) - (aim.y - hero.y) * (target.x - hero.x)).toBeCloseTo(0, 7);
  });
  it('rejects invalid positions instead of emitting synthetic mouse coordinates', () => {
    expect(() => visibleAim(hero, { x: NaN, y: 241 })).toThrow(/aim/);
    expect(() => visibleAim({ x: -1, y: 20 }, hero)).toThrow(/aim/);
  });
});
