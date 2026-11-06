import { afterEach, describe, expect, it, vi } from 'vitest';
import { alignVisiblePickup, collectVisiblePickup, prepareNativeObservation, HEAL_OBSERVATION_RETREAT, type PickupMotion, type PickupPosition } from '../e2e/pickup-navigation';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { PREVIEW_SAVE, CHAPTER_ONE } from '../../src/pages/GamePage/game/data/chapterOne';
import { TUNING } from '../../src/pages/GamePage/game/data/tuning';
import { EMPTY_INPUT, PLAYER_HEIGHT } from '../../src/pages/GamePage/game/entities/model';
import { movePlayer } from '../../src/pages/GamePage/game/systems/controller';
import { collectAndCheckpoint } from '../../src/pages/GamePage/game/systems/interactions';
import { advanceCombat } from '../../src/pages/GamePage/game/systems/combat';
// UNIT ONLY: actual pure controller + collection/checkpoint rules. No browser clock or pixel replacement.
const clocks = [[1], [2], [3], [4], [5], [6], [4, 6, 5], [6, 1, 2]].flatMap(pattern =>
  [0, 15, 80].flatMap(resumeMs => [0, 140].map(decodeMs => ({ pattern, resumeMs, decodeMs }))));
const cases = clocks.flatMap(clock => [
  ...[1338, 1341, 1344, 1348].map(x => ({ ...clock, kind: 'heal' as 'heal' | 'align', x })),
  ...[425, 432, 435, 445, 448, 455].map(x => ({ ...clock, kind: 'align' as 'heal' | 'align', x })),
]);
afterEach(() => vi.useRealTimers());
describe('pickup movement with independent render, input and decode clocks', () => {
  it.each(cases)('$kind x$x frameSpan$pattern resume$resumeMs decode$decodeMs', async ({ pattern, resumeMs, decodeMs, x, kind }) => {
    vi.useFakeTimers();
    const world = createWorld({ ...PREVIEW_SAVE, hp: 60, elapsedMs: 20000 }, 'playing');
    world.player = { ...world.player, x, y: 320 - PLAYER_HEIGHT / 2, vx: 0, vy: 0, grounded: true };
    world.pickups = CHAPTER_ONE.pickups.filter(p => p.id === 'heal-1').map(p => ({ ...p }));
    let paused = true, move: -1 | 0 | 1 = 0, accumulator = 0, index = 0, stopped = false, now = 20000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pauseRequests: (() => void)[] = [], frameRequests: (() => void)[] = [];
    const samples: PickupPosition[] = [], pulses: { key: string; ms: number }[] = [];
    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const frame = () => new Promise<void>(resolve => frameRequests.push(resolve));
    const schedule = () => {
      const delta = pattern[index++ % pattern.length] * TUNING.stepMs;
      timer = setTimeout(() => {
        if (pauseRequests.length) {
          paused = true; move = 0; accumulator = 0;
          const requests = pauseRequests; pauseRequests = []; requests.forEach(resolve => resolve());
        }
        if (!paused && world.mode === 'playing') {
          accumulator += Math.min(delta, 100);
          while (accumulator >= TUNING.stepMs && world.mode === 'playing') {
            now += TUNING.stepMs; expect(Number.isFinite(now)).toBe(true);
            world.save = { ...world.save, elapsedMs: now };
            world.player = movePlayer(world.player, { ...EMPTY_INPUT, move }, CHAPTER_ONE.platforms, now, TUNING.stepMs / 1000, false).player;
            if (kind === 'heal') collectAndCheckpoint(world, now);
            accumulator -= TUNING.stepMs;
          }
        }
        const requests = frameRequests; frameRequests = []; requests.forEach(resolve => resolve());
        if (!stopped) schedule();
      }, delta);
    };
    const pause = async () => { if (!paused) await new Promise<void>(resolve => pauseRequests.push(resolve)); };
    const resume = async () => { paused = false; move = 0; accumulator = 0; await sleep(resumeMs); };
    const port: PickupMotion<PickupPosition> = {
      measure: async () => {
        expect(paused).toBe(true); await sleep(decodeMs); expect(paused).toBe(true);
        const present = kind === 'align' || world.pickups.some(p => p.id === 'heal-1');
        const value = { x: present ? Math.round(world.player.x) : null, targetPresent: present }; samples.push(value); return value;
      },
      pulse: async (key, ms, settle, ack = false) => {
        expect(paused).toBe(true); pulses.push({ key, ms }); await resume(); move = key === 'd' ? 1 : -1;
        try { if (ack) await Promise.all([sleep(ms), frame()]); else await sleep(ms); } finally { move = 0; }
        if (settle) { await frame(); await sleep(180); await frame(); }
        await pause(); return port.measure();
      },
      coast: async ms => { await resume(); await Promise.all([sleep(ms), frame()]); await pause(); return port.measure(); },
    };
    schedule();
    const outcome = (kind === 'heal' ? collectVisiblePickup(port, 1363) : alignVisiblePickup(port, 440))
      .then(value => ({ value }), error => ({ error }));
    void outcome.then(() => { stopped = true; clearTimeout(timer); });
    await vi.runAllTimersAsync(); const result = await outcome;
    if ('error' in result) throw Object.assign(result.error, { samples, pulses });
    if (kind === 'heal') {
      expect(world.mode, JSON.stringify({ samples, pulses })).toBe('playing');
      expect(world.save.hp, JSON.stringify({ samples, pulses })).toBe(88);
      expect(result.value.targetPresent).toBe(false); expect(world.player.x).toBeLessThan(1380);
      expect(pulses.length).toBeLessThanOrEqual(6);
    } else {
      expect(Math.abs(result.value.x! - 440), JSON.stringify({ samples, pulses })).toBeLessThanOrEqual(4);
      expect(pulses.length).toBeLessThanOrEqual(8);
      for (let i = 0; i < 12; i++) world.player = movePlayer(world.player, EMPTY_INPUT, CHAPTER_ONE.platforms, now + (i + 1) * TUNING.stepMs, TUNING.stepMs / 1000, false).player;
      expect(world.player.x + 8).toBeLessThan(458); // Native first-diamond edge: no off-ledge positive.
    }
  });
});

describe('bounded observation failures never manufacture acceptance', () => {
  function port(value: PickupPosition): PickupMotion<PickupPosition> {
    return { measure: vi.fn(async () => value), pulse: vi.fn(async () => value), coast: vi.fn(async () => value) };
  }
  it('rejects a source already absent before any input', async () => {
    const p = port({ x: null, targetPresent: false });
    await expect(collectVisiblePickup(p, 1363)).rejects.toThrow('missing before'); expect(p.pulse).not.toHaveBeenCalled();
  });
  it.each([null, NaN, Infinity])('rejects invalid position %s instead of a hidden fallback', async x => {
    const p = port({ x, targetPresent: true });
    await expect(alignVisiblePickup(p, 440)).rejects.toThrow('native position'); expect(p.pulse).not.toHaveBeenCalled();
  });
  it('stops after six real heal pulses even if the source never disappears', async () => {
    const p = port({ x: 1341, targetPresent: true });
    await expect(collectVisiblePickup(p, 1363)).rejects.toThrow('exhausted'); expect(p.pulse).toHaveBeenCalledTimes(6);
  });
  it('stops after eight corrections even if actual position never changes', async () => {
    const p = port({ x: 448, targetPresent: true });
    await expect(alignVisiblePickup(p, 440)).rejects.toThrow('did not reach'); expect(p.pulse).toHaveBeenCalledTimes(8);
  });
  it('does not drive again after a disappearing source; benefit is still the caller oracle', async () => {
    const p = port({ x: 1341, targetPresent: true }); vi.mocked(p.pulse).mockResolvedValue({ x: null, targetPresent: false });
    await expect(collectVisiblePickup(p, 1363)).resolves.toEqual({ x: null, targetPresent: false }); expect(p.pulse).toHaveBeenCalledTimes(1);
  });
  it('propagates the original real-frame input error without another pulse', async () => {
    const p = port({ x: 448, targetPresent: true }), error = new Error('actual frame failed');
    vi.mocked(p.pulse).mockRejectedValue(error);
    await expect(alignVisiblePickup(p, 440)).rejects.toBe(error); expect(p.pulse).toHaveBeenCalledTimes(1);
  });
  it('refuses a still-visible heal at the forward stopping boundary', async () => {
    const p = port({ x: 1363, targetPresent: true });
    await expect(collectVisiblePickup(p, 1363)).rejects.toThrow('exhausted'); expect(p.pulse).not.toHaveBeenCalled();
  });
});

describe('native recovery preparation cannot retry or inspect the later absence window', () => {
  const visible = { heroVisible: true, hp: 78 }, blink = { heroVisible: false, hp: 78 };
  it('rejects four blink windows including the R31 observed null/full pattern', async () => {
    const probe = vi.fn(async () => [blink, visible, visible, blink, blink, blink]);
    await expect(prepareNativeObservation(probe)).rejects.toThrow('four bounded'); expect(probe).toHaveBeenCalledTimes(4);
  });
  it('retains each preparation and stops at the first complete stable visible batch', async () => {
    const probe = vi.fn().mockResolvedValueOnce([blink, visible]).mockResolvedValueOnce([visible, visible]);
    await prepareNativeObservation(probe); expect(probe.mock.calls).toEqual([[1], [2]]);
  });
  it('does not accept a still-changing public HP even when both sampled poses are visible', async () => {
    const probe = vi.fn(async () => [visible, { ...visible, hp: 68 }]);
    await expect(prepareNativeObservation(probe)).rejects.toThrow('four bounded'); expect(probe).toHaveBeenCalledTimes(4);
  });
  it.each([[], [visible], [{ ...visible, hp: 0 }, { ...visible, hp: 0 }]].map(rows => ({ rows })))('rejects empty, single or dead samples %#', async ({ rows }) => {
    await expect(prepareNativeObservation(async () => rows)).rejects.toThrow('four bounded');
  });
  it('preserves a capture failure without another preparation', async () => {
    const error = new Error('real capture failed'), probe = vi.fn(async () => { throw error; });
    await expect(prepareNativeObservation(probe)).rejects.toBe(error); expect(probe).toHaveBeenCalledTimes(1);
  });
});

// Representative ground-level incoming shot, UNIT ONLY. This does not claim all enemy phases are safe.
describe('ordinary healing retreat leaves the observed ground-shot lane without altering combat', () => {
  const cases = clocks.flatMap(clock => [1358, 1360, 1364, 1370].map(x => ({ ...clock, x })));
  it.each(cases)('x$x render$pattern resume$resumeMs decode$decodeMs', async ({ x, pattern, resumeMs, decodeMs }) => {
    vi.useFakeTimers();
    const world = createWorld({ ...PREVIEW_SAVE, hp: 88, elapsedMs: 30000 }, 'playing');
    world.player = { ...world.player, x, y: 320 - PLAYER_HEIGHT / 2, vx: 0, vy: 0, grounded: true, invulnerableUntil: 0 };
    let now = 30000, accumulator = 0, index = 0, paused = true, stopped = false;
    let move: -1 | 0 = 0, jumpPressed = false, jumpHeld = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frames: (() => void)[] = [], pauses: (() => void)[] = [];
    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const frame = () => new Promise<void>(resolve => frames.push(resolve));
    const tick = () => {
      now += TUNING.stepMs; world.save = { ...world.save, elapsedMs: now };
      world.player = movePlayer(world.player, { ...EMPTY_INPUT, move, jumpPressed, jumpHeld }, CHAPTER_ONE.platforms, now, TUNING.stepMs / 1000, false).player;
      jumpPressed = false;
    };
    const schedule = () => {
      const delta = pattern[index++ % pattern.length] * TUNING.stepMs;
      timer = setTimeout(() => {
        if (pauses.length) {
          paused = true; move = 0; jumpPressed = false; jumpHeld = false; accumulator = 0;
          const queue = pauses; pauses = []; queue.forEach(resolve => resolve());
        }
        if (!paused) {
          accumulator += Math.min(delta, 100);
          while (accumulator >= TUNING.stepMs) { tick(); accumulator -= TUNING.stepMs; }
        }
        const queue = frames; frames = []; queue.forEach(resolve => resolve());
        if (!stopped) schedule();
      }, delta);
    };
    const pause = async () => { if (!paused) await new Promise<void>(resolve => pauses.push(resolve)); await sleep(decodeMs); };
    const resume = async () => { paused = false; accumulator = 0; await sleep(resumeMs); };
    const captureWindow = async (ms: number) => { await frame(); await sleep(ms); await frame(); await pause(); };
    schedule();
    const perform = async () => {
      await resume(); move = -1; jumpPressed = HEAL_OBSERVATION_RETREAT.jump; jumpHeld = HEAL_OBSERVATION_RETREAT.jump;
      await sleep(HEAL_OBSERVATION_RETREAT.ms); move = 0; jumpHeld = false;
      await captureWindow(180); await resume(); await captureWindow(250);
      const feet = world.player.y + PLAYER_HEIGHT / 2, settledX = world.player.x;
      world.bullets = [{ id: 9999, x: settledX + 60, y: 307, vx: -115, vy: 0, radius: 4,
        faction: 'enemy', kind: 'dictionary', damage: 16, expiresAt: now + 2000 }];
      for (let i = 0; i < 27; i++) { const previous = { ...world.player }; tick(); advanceCombat(world, previous, [], now, TUNING.stepMs / 1000); }
      return { hp: world.save.hp, feet, settledX, finalFeet: world.player.y + PLAYER_HEIGHT / 2 };
    };
    const result = perform().finally(() => { stopped = true; clearTimeout(timer); });
    await vi.runAllTimersAsync(); const sample = await result;
    expect(sample.hp, JSON.stringify(sample)).toBe(88);
    expect(sample.feet, JSON.stringify(sample)).toBe(HEAL_OBSERVATION_RETREAT.feet);
    expect(sample.finalFeet).toBe(258); expect(sample.settledX).toBeGreaterThan(1180); expect(sample.settledX).toBeLessThan(1333);
  });
});
