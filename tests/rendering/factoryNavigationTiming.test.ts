import { afterEach, describe, expect, it, vi } from 'vitest';
import { alignFactoryEntry, type HeroSample, type NavigationPort } from '../e2e/factory-navigation';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';
import { CHAPTER_TWO } from '../../src/pages/GamePage/game/data/chapterTwo';
import { TUNING } from '../../src/pages/GamePage/game/data/tuning';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { movePlayer } from '../../src/pages/GamePage/game/systems/controller';

// UNIT-ONLY clock: actual pure controller and accumulator; never installed in a
// browser, used as an image/pose oracle or claimed as native acceptance evidence.
const cases = [[4], [5], [6], [4, 5], [4, 6, 5]].flatMap(pattern =>
  [0, 15, 80].flatMap(resumeMs => [0, 140].flatMap(decodeMs =>
    [315, 325, 328, 340].map(x => ({ pattern, resumeMs, decodeMs, x })))));
afterEach(() => vi.useRealTimers());
describe('CP2 navigation against independent render, IO and fixed-tick clocks', () => {
  it.each(cases)('x$x renderTicks$pattern resume$resumeMs decode$decodeMs', async ({ pattern, resumeMs, decodeMs, x }) => {
    vi.useFakeTimers();
    let player = { ...createWorld({ ...PREVIEW_SAVE, stage: 2, checkpoint: 2 }).player, x };
    let paused = true, move: -1 | 0 | 1 = 0, accumulator = 0, elapsed = 0, frameIndex = 0, stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pauseRequests: (() => void)[] = [], frames: ((at: number) => void)[] = [];
    const samples: number[] = [], sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const schedule = () => {
      const delta = pattern[frameIndex++ % pattern.length] * TUNING.stepMs;
      timer = setTimeout(() => {
        if (pauseRequests.length) {
          paused = true; move = 0; accumulator = 0;
          const requests = pauseRequests; pauseRequests = []; requests.forEach(resolve => resolve());
        }
        if (!paused) {
          accumulator += Math.min(delta, 100);
          while (accumulator >= TUNING.stepMs) {
            elapsed += TUNING.stepMs;
            player = movePlayer(player, { ...EMPTY_INPUT, move }, [], 20000 + elapsed, TUNING.stepMs / 1000, false, CHAPTER_TWO).player;
            accumulator -= TUNING.stepMs;
          }
        }
        const waiting = frames; frames = []; waiting.forEach(resolve => resolve(Date.now()));
        if (!stopped) schedule();
      }, delta);
    };
    const port: NavigationPort<HeroSample> = {
      pause: async () => { if (!paused) await new Promise<void>(resolve => pauseRequests.push(resolve)); },
      resume: async () => { paused = false; move = 0; accumulator = 0; await sleep(resumeMs); },
      alive: async () => { expect(paused).toBe(true); }, wait: sleep,
      down: vi.fn(async key => { expect(paused).toBe(false); move = key === 'a' ? -1 : 1; }),
      up: async () => { move = 0; }, frame: async () => new Promise<number>(resolve => frames.push(resolve)),
      measure: async () => {
        expect(paused).toBe(true); await sleep(decodeMs); expect(paused).toBe(true);
        const px = Math.round(player.x); samples.push(px); return { count: 380, x: px, bottom: 245 };
      },
    };
    schedule();
    const outcome = alignFactoryEntry(port).then(value => ({ value }), error => ({ error }));
    void outcome.then(() => { stopped = true; clearTimeout(timer); });
    await vi.runAllTimersAsync();
    const result = await outcome;
    if ('error' in result) throw result.error;
    expect(Math.abs(result.value.hero.x! - 320), JSON.stringify(samples)).toBeLessThanOrEqual(4);
    expect(samples.length).toBeLessThanOrEqual(13); expect(vi.mocked(port.down).mock.calls.length).toBeLessThanOrEqual(12);
    // Returning a frozen observation must still permit an ordinary released-key
    // continuation over the actual overlapping main-route platform intervals.
    for (let i = 0; i < 12; i++) player = movePlayer(player, EMPTY_INPUT, [], 20000 + elapsed + (i + 1) * TUNING.stepMs, TUNING.stepMs / 1000, false, CHAPTER_TWO).player;
    expect(player.x + 8).toBeGreaterThan(310); expect(player.x - 8).toBeLessThan(330);
  });
});
