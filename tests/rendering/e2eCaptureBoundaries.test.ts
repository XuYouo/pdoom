import { controlReleaseOutcome, readCombatBoundary, verifyReleaseBoundary, type SydneyReleaseEnd } from '../e2e/sydney-release-boundary';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';
import { CHAPTER_TWO } from '../../src/pages/GamePage/game/data/chapterTwo';
import { TUNING } from '../../src/pages/GamePage/game/data/tuning';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { movePlayer } from '../../src/pages/GamePage/game/systems/controller';
import type { Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { alignFactoryEntry, captureInputBoundary, nativeFactoryHero, navigationReceiver, withCleanup, type HeroSample, type NavigationPort } from '../e2e/factory-navigation';

function navigation(xs: (number | null)[]) {
  const log: string[] = []; let paused = false, i = 0;
  const port: NavigationPort<HeroSample> = {
    pause: vi.fn(async () => { paused = true; log.push('pause'); }),
    resume: vi.fn(async () => { paused = false; log.push('resume'); }),
    alive: vi.fn(async () => { expect(paused).toBe(true); log.push('alive'); }),
    measure: vi.fn(async () => {
      expect(paused).toBe(true); log.push('measure');
      const x = xs[Math.min(i++, xs.length - 1)]; return { count: x === null ? 0 : 380, x, bottom: 245 };
    }),
    frame: vi.fn(async () => { expect(paused).toBe(false); log.push('frame'); return 42; }),
    wait: vi.fn(async ms => { expect(paused).toBe(false); log.push('wait:' + ms); }),
    down: vi.fn(async key => { expect(paused).toBe(false); log.push('down:' + key); }),
    up: vi.fn(async key => { log.push('up:' + key); }),
  };
  return { port, log };
}
describe('actual shared CP2 navigation sequencing', () => {
  it('pauses every measurement and returns the same positive sample', async () => {
    const { port, log } = navigation([353, 329, 326, 323]);
    const result = await alignFactoryEntry(port);
    expect(result.alignment).toEqual([353, 329, 326, 323]); expect(result.hero.x).toBe(323);
    expect(port.measure).toHaveBeenCalledTimes(4); expect(port.down).toHaveBeenCalledTimes(2);
    expect(port.wait).toHaveBeenCalledWith(85); // One observed close approach, not three blind settling windows.
    expect(log.slice(0, 3)).toEqual(['pause', 'alive', 'measure']); expect(log[log.length - 1]).toBe('measure');
  });
  it.each([316, 320, 324])('keeps the original inclusive x boundary %s', async x => {
    const { port } = navigation([x]); expect((await alignFactoryEntry(port)).hero.x).toBe(x); expect(port.resume).not.toHaveBeenCalled();
  });
  it('does not accept x325 and caps corrections at twelve', async () => {
    const { port } = navigation([325]); await expect(alignFactoryEntry(port)).rejects.toThrow('12 corrections');
    expect(port.down).toHaveBeenCalledTimes(12); expect(port.measure).toHaveBeenCalledTimes(13);
  });
  it('advances a hidden hero only in bounded unpaused 90ms windows', async () => {
    const { port } = navigation([null, 320]); await alignFactoryEntry(port);
    expect(port.wait).toHaveBeenCalledWith(90); expect(port.measure).toHaveBeenCalledTimes(2);
  });
  it('fails persistent invisibility instead of polling a frozen hidden hero', async () => {
    const { port } = navigation([null]); await expect(alignFactoryEntry(port)).rejects.toThrow('bounded blink');
    expect(port.resume).toHaveBeenCalledTimes(12); expect(port.down).not.toHaveBeenCalled();
  });
  it('releases the actual key and pauses after an input failure', async () => {
    const { port, log } = navigation([350]); port.wait = async () => { throw Error('input failed'); };
    await expect(alignFactoryEntry(port)).rejects.toThrow('input failed');
    expect(log.slice(-2)).toEqual(['up:a', 'pause']);
  });
  it('fails bad native measurements and never falls back to a compositor', async () => {
    const { port } = navigation([NaN]); await expect(alignFactoryEntry(port)).rejects.toThrow('Invalid native');
    expect(port.resume).not.toHaveBeenCalled();
  });
});

describe('actual burst boundary helper (unit ports, not runtime evidence)', () => {
  it('waits for late real input and freeze before separately labeling its terminal', async () => {
    const log: string[] = []; let finish!: () => void;
    const input = new Promise<void>(resolve => { finish = resolve; });
    const first = Object.freeze({ png: 'unit-first', at: 45649.8 });
    const last = Object.freeze({ png: 'unit-terminal', at: 47666.4 });
    const run = captureInputBoundary<{ png: string; at: number }>({ sample: async () => [first], input: () => input,
      release: async () => { log.push('keyup'); }, freeze: async () => { log.push('pause'); },
      terminal: async () => { log.push('terminal'); return last; } });
    await Promise.resolve(); await Promise.resolve(); expect(log).toEqual([]);
    finish(); const frames = await run;
    expect(log).toEqual(['keyup', 'pause', 'terminal']);
    expect(frames).toEqual([{ capture: first, phase: 'timed-window' }, { capture: last, phase: 'after-input-paused' }]);
    expect(frames[0].capture).toBe(first); expect(frames[1].capture).toBe(last);
  });
  it('leaves ordinary pose bursts without an extra capture', async () => {
    const frame = { at: 7 }, freeze = vi.fn(async () => {});
    const frames = await captureInputBoundary({ sample: async () => [frame], input: async () => {}, release: async () => {}, freeze });
    expect(frames).toEqual([{ capture: frame, phase: 'timed-window' }]); expect(freeze).toHaveBeenCalledTimes(1);
  });
  it.each(['sample', 'input'])('cleans up and refuses terminal after %s failure', async kind => {
    const log: string[] = [], terminal = vi.fn(async () => 3);
    await expect(captureInputBoundary({
      sample: async () => { if (kind === 'sample') throw Error('broken'); return [1]; },
      input: async () => { if (kind === 'input') throw Error('broken'); },
      release: async () => { log.push('release'); }, freeze: async () => { log.push('freeze'); }, terminal,
    })).rejects.toThrow('broken');
    expect(log).toEqual(['release', 'freeze']); expect(terminal).not.toHaveBeenCalled();
  });
  it('still freezes when release fails', async () => {
    const freeze = vi.fn(async () => {}), terminal = vi.fn(async () => 2);
    await expect(captureInputBoundary({ sample: async () => [1], input: async () => {},
      release: async () => { throw Error('keyup failure'); }, freeze, terminal })).rejects.toThrow('keyup failure');
    expect(freeze).toHaveBeenCalledTimes(1); expect(terminal).not.toHaveBeenCalled();
  });
  it('refuses an empty timed sample instead of manufacturing evidence', async () => {
    const terminal = vi.fn(async () => 1);
    await expect(captureInputBoundary({ sample: async () => [], input: async () => {}, release: async () => {}, freeze: async () => {}, terminal })).rejects.toThrow('Missing timed-window');
    expect(terminal).not.toHaveBeenCalled();
  });
});

// Synthetic DOM codec only in unit tests; exercises the actual native reader callback.
function nativePage(opaque = true, colorful = true, width = 640) {
  const data = new Uint8ClampedArray(640 * 360 * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = colorful ? (i / 4) % 8 : 0; data[i + 3] = opaque ? 255 : 0; }
  for (let x = 310; x < 330; x++) data.set([217, 119, 87, 255], (245 * 640 + x) * 4);
  const source = { width, height: 360, toDataURL: vi.fn(() => 'unit:actual-capture') };
  const decoder = { getContext: () => ({ drawImage: vi.fn(), getImageData: () => ({ data }) }) };
  vi.stubGlobal('document', { querySelector: () => source, createElement: () => decoder });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { fn(); return 1; });
  vi.stubGlobal('Image', class { src = ''; async decode() {} });
  return { evaluate: (fn: () => Promise<HeroSample>) => fn() } as unknown as Page;
}
afterEach(() => vi.unstubAllGlobals());
describe('actual native navigation reader, synthetic unit codec', () => {
  it('reads only exact orange on the native640 grid', async () => {
    expect(await nativeFactoryHero(nativePage())).toEqual({ count: 20, x: 320, bottom: 245 });
  });
  it.each([[false, true], [true, false]])('rejects cleared or blank frames (%s/%s)', async (opaque, colorful) => {
    await expect(nativeFactoryHero(nativePage(opaque, colorful))).rejects.toThrow('substantial opaque');
  });
  it('refuses a wrong native canvas size with no alternate screenshot path', async () => {
    await expect(nativeFactoryHero(nativePage(true, true, 800))).rejects.toThrow('native640');
  });
  it('retains strictly more than twenty orange pixels for navigation', async () => {
    const { port } = navigation([320]);
    port.measure = vi.fn().mockResolvedValueOnce({ count: 20, x: 320, bottom: 245 }).mockResolvedValue({ count: 21, x: 320, bottom: 245 });
    expect((await alignFactoryEntry(port)).hero.count).toBe(21); expect(port.resume).toHaveBeenCalledTimes(1);
  });
});

describe('actual input delivery frame boundary', () => {
  it('keeps the ordinary key held until a late real-frame ack', async () => {
    const { port } = navigation([327, 320]);
    let entered!: () => void, acknowledge!: (at: number) => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const ack = new Promise<number>(resolve => { acknowledge = resolve; });
    port.frame = vi.fn().mockImplementationOnce(() => { entered(); return ack; }).mockResolvedValue(200);
    const result = alignFactoryEntry(port); await started;
    expect(port.up).not.toHaveBeenCalled(); acknowledge(123.5);
    expect((await result).hero.x).toBe(320);
    expect(port.up).toHaveBeenCalledTimes(1); expect(port.frame).toHaveBeenCalledTimes(1);
  });
  it('observes the frame concurrently with the original timer, not after it', async () => {
    const { port } = navigation([327, 320]); let finish!: () => void, observed!: () => void;
    const timer = new Promise<void>(resolve => { finish = resolve; });
    const frame = new Promise<void>(resolve => { observed = resolve; });
    port.wait = vi.fn().mockReturnValueOnce(timer).mockResolvedValue(undefined);
    port.frame = vi.fn(async () => { observed(); return 123; });
    const result = alignFactoryEntry(port); await frame;
    expect(port.up).not.toHaveBeenCalled(); expect(port.wait).toHaveBeenCalledWith(5 / 190 * 1000);
    finish(); await result; expect(port.frame).toHaveBeenCalledTimes(1);
    expect(port.wait).toHaveBeenLastCalledWith(5 / 190 * 1000);
    expect(port.wait).not.toHaveBeenCalledWith(85);
  });
  it('cleans up a failed frame ack without inventing effective input', async () => {
    const { port, log } = navigation([327]); port.frame = async () => { throw Error('frame failed'); };
    await expect(alignFactoryEntry(port)).rejects.toThrow('frame failed');
    expect(log.slice(-2)).toEqual(['up:a', 'pause']); expect(port.measure).toHaveBeenCalledTimes(1);
  });
  it('retains measured alignment and public frame stamps on exhaustion', async () => {
    const { port } = navigation([327]);
    const message = await alignFactoryEntry(port).then(() => '', error => (error as Error).message);
    expect(message).toContain('actual alignment: [327,327');
    expect(message).toContain('public rAF: [42,42');
  });
});

describe('actual public keyboard receiver contract', () => {
  it.each([
    { tag: 'BODY', dialog: false, editable: false, ready: true },
    { tag: 'CANVAS', dialog: false, editable: false, ready: true },
    { tag: 'BUTTON', dialog: true, editable: false, ready: false },
    { tag: 'INPUT', dialog: false, editable: false, ready: false },
    { tag: 'TEXTAREA', dialog: false, editable: false, ready: false },
    { tag: 'SELECT', dialog: false, editable: false, ready: false },
    { tag: 'DIV', dialog: false, editable: true, ready: false },
    { tag: null, dialog: false, editable: false, ready: false },
  ])('reports $tag receiver ready=$ready with no focus mutation', async item => {
    vi.stubGlobal('document', { activeElement: item.tag === null ? null : {
      tagName: item.tag, isContentEditable: item.editable, closest: () => item.dialog ? {} : null,
      focus: () => { throw Error('Focus must not be forced'); },
    } });
    const page = { evaluate: (fn: () => unknown) => fn() } as unknown as Page;
    expect(await navigationReceiver(page)).toMatchObject({ ready: item.ready, tag: item.tag });
  });
});
describe('actual cleanup preserves original failures', () => {
  it('retains the primary receiver error and the actual cleanup error', async () => {
    const primary = Error('receiver failed'), cleanupError = Error('alive failed');
    const error = await withCleanup(async () => { throw primary; }, async () => { throw cleanupError; }).catch(error => error);
    expect(error.cause).toBe(primary); expect(error.cleanupError).toBe(cleanupError);
    expect(error.message).toContain('receiver failed'); expect(error.message).toContain('alive failed');
  });
  it('does not hide a standalone cleanup failure', async () => {
    const cleanupError = Error('pause failed');
    await expect(withCleanup(async () => 1, async () => { throw cleanupError; })).rejects.toBe(cleanupError);
  });
});

// Deterministic unit port using the real pure controller, not browser evidence.
// 5/6 ticks reproduce accumulator reset + capped100ms rendering; 6/6 also
// covers a neighboring coarse sample without changing the production clock.
describe('coarse-render feedback uses the same movement controller', () => {
  it.each([[326, 5], [329, 5], [311, 5], [314, 5], [326, 6], [329, 6]])('aligns x%s with first-frame ticks%s without increasing the correction budget', async (x, firstTicks) => {
    let player = { ...createWorld({ ...PREVIEW_SAVE, stage: 2, checkpoint: 2 }).player, x };
    let paused = true, move: -1 | 0 | 1 = 0, frame = 0, at = 20000;
    const port: NavigationPort<HeroSample> = {
      pause: async () => { paused = true; }, resume: async () => { paused = false; frame = 0; },
      alive: async () => { expect(paused).toBe(true); }, wait: async () => {},
      down: vi.fn(async key => { move = key === 'a' ? -1 : 1; }), up: async () => { move = 0; },
      frame: async () => {
        expect(paused).toBe(false);
        const ticks = frame++ === 0 ? firstTicks : 6;
        for (let i = 0; i < ticks; i++) {
          at += TUNING.stepMs;
          player = movePlayer(player, { ...EMPTY_INPUT, move }, [], at, TUNING.stepMs / 1000, false, CHAPTER_TWO).player;
        }
        return at;
      },
      measure: async () => { expect(paused).toBe(true); return { count: 380, x: Math.round(player.x), bottom: 245 }; },
    };
    const result = await alignFactoryEntry(port);
    expect(Math.abs(result.hero.x! - 320)).toBeLessThanOrEqual(4);
    expect(port.down).toHaveBeenCalled(); expect(vi.mocked(port.down).mock.calls.length).toBeLessThanOrEqual(12);
  });
});

describe('actual release lifecycle guard, not a pixel-matcher replacement', () => {
  const live: SydneyReleaseEnd = { cleared: false, body: { frame: 11 }, hpPixels: 16, bubbleCount: 0, dangerPixels: 0 };
  const won: SydneyReleaseEnd = { cleared: true, body: null, hpPixels: 0, bubbleCount: 0, dangerPixels: 0 };
  it('retains the live-boss requirement for normal release and phase sampling', () => {
    expect(controlReleaseOutcome(live)).toBe('live');
    expect(() => controlReleaseOutcome(won)).toThrow('living boss is required');
  });
  it('accepts victory only in explicitly final combat with all native boss signals gone', () => {
    expect(controlReleaseOutcome(won, true)).toBe('chapter-cleared');
    expect(controlReleaseOutcome(live, true)).toBe('live');
  });
  it.each([
    { ...won, cleared: false }, { ...won, body: { frame: 11 } },
    { ...won, hpPixels: 1 }, { ...won, bubbleCount: 1 }, { ...won, dangerPixels: 1 },
    { ...live, body: null }, { ...live, hpPixels: 0 }, { ...live, bubbleCount: 1 },
  ])('rejects fake disappearance or residual live/cleared signals %j', end => {
    expect(() => controlReleaseOutcome(end, true)).toThrow();
  });
  it.each([NaN, -1, 0.5, Infinity])('rejects invalid native counts %s', hpPixels => {
    expect(() => controlReleaseOutcome({ ...won, hpPixels }, true)).toThrow('Invalid native');
  });
});

describe('combat lifecycle is observed after the real native snapshot', () => {
  it('sees a prior shot win during capture and never acts on an earlier bound HUD', async () => {
    let won = false; const events: string[] = [], view = { body: null };
    const controlled = vi.fn(async () => { events.push('controlled'); return true; });
    const result = await readCombatBoundary({
      capture: async () => { events.push('capture'); won = true; return view; },
      cleared: async () => { events.push('cleared'); return won; }, controlled,
    });
    expect(result).toEqual({ view, kind: 'cleared' }); expect(result.view).toBe(view);
    expect(events).toEqual(['capture', 'cleared']); expect(controlled).not.toHaveBeenCalled();
  });
  it.each([false, true])('uses one frozen view for controlled=%s', async bound => {
    const events: string[] = [], view = { body: { frame: 11 } };
    const capture = vi.fn(async () => { events.push('capture'); return view; });
    const result = await readCombatBoundary({ capture,
      cleared: async () => { events.push('cleared'); return false; },
      controlled: async () => { events.push('controlled'); return bound; },
    });
    expect(events).toEqual(['capture', 'cleared', 'controlled']); expect(capture).toHaveBeenCalledOnce();
    expect(result.view).toBe(view); expect(result.kind).toBe(bound ? 'bound' : 'live');
  });
  it('cannot turn missing pixels without actual clear into accepted victory', async () => {
    const view: SydneyReleaseEnd = { cleared: false, body: null, hpPixels: 0, bubbleCount: 0, dangerPixels: 0 };
    const result = await readCombatBoundary({ capture: async () => view, cleared: async () => false, controlled: async () => false });
    expect(result.kind).toBe('live'); expect(() => controlReleaseOutcome(result.view, true)).toThrow('No live native boss');
  });
  it('preserves a capture failure instead of consulting stale lifecycle flags', async () => {
    const primary = Error('native capture failed'), cleared = vi.fn(async () => true), controlled = vi.fn(async () => true);
    await expect(readCombatBoundary({ capture: async () => { throw primary; }, cleared, controlled })).rejects.toBe(primary);
    expect(cleared).not.toHaveBeenCalled(); expect(controlled).not.toHaveBeenCalled();
  });
});

describe('native release outcome dispatches only its actual UI presentation', () => {
  const win: SydneyReleaseEnd = { cleared: true, body: null, hpPixels: 0, bubbleCount: 0, dangerPixels: 0 };
  it('never queries a playing-only objective or notice after actual victory', async () => {
    const live = vi.fn(async () => { throw Error('removed live HUD queried'); }), cleared = vi.fn(async () => {});
    await expect(verifyReleaseBoundary(win, true, { live, cleared })).resolves.toBe('chapter-cleared');
    expect(live).not.toHaveBeenCalled(); expect(cleared).toHaveBeenCalledOnce();
  });
  it('retains live body, objective and release-notice checks for a surviving boss', async () => {
    const live = vi.fn(async () => {}), cleared = vi.fn(async () => {});
    await expect(verifyReleaseBoundary({ ...win, cleared: false, body: { frame: 3 }, hpPixels: 56 }, true, { live, cleared })).resolves.toBe('live');
    expect(live).toHaveBeenCalledOnce(); expect(cleared).not.toHaveBeenCalled();
  });
  it('does not dispatch either UI for residual native bubble pixels', async () => {
    const live = vi.fn(async () => {}), cleared = vi.fn(async () => {});
    await expect(verifyReleaseBoundary({ ...win, bubbleCount: 1 }, true, { live, cleared })).rejects.toThrow('bubble still present');
    expect(live).not.toHaveBeenCalled(); expect(cleared).not.toHaveBeenCalled();
  });
  it('refuses victory when the caller promised a living-boss release proof', async () => {
    const live = vi.fn(async () => {}), cleared = vi.fn(async () => {});
    await expect(verifyReleaseBoundary(win, false, { live, cleared })).rejects.toThrow('living boss is required');
    expect(live).not.toHaveBeenCalled(); expect(cleared).not.toHaveBeenCalled();
  });
  it('propagates a real terminal UI failure without substituting a live assertion', async () => {
    const failure = Error('clear overlay absent'), live = vi.fn(async () => {});
    await expect(verifyReleaseBoundary(win, true, { live, cleared: async () => { throw failure; } })).rejects.toBe(failure);
    expect(live).not.toHaveBeenCalled();
  });
});

describe('navigation observes before spending another blind settling window', () => {
  it('accepts the actual frozen post-input sample without a hidden85ms movement tail', async () => {
    const { port } = navigation([325, 318]);
    expect((await alignFactoryEntry(port)).hero.x).toBe(318);
    expect(port.wait).toHaveBeenCalledTimes(1); expect(port.wait).toHaveBeenCalledWith(18);
    expect(port.frame).toHaveBeenCalledTimes(1); expect(port.down).toHaveBeenCalledExactlyOnceWith('a');
  });
  it('uses neutral input after a measured crossing, never an assumed away impulse', async () => {
    const { port } = navigation([328, 313, 308, 321]);
    expect((await alignFactoryEntry(port)).alignment).toEqual([328, 313, 308, 321]);
    expect(vi.mocked(port.down).mock.calls).toEqual([['a'], ['d']]);
    expect(vi.mocked(port.wait).mock.calls.filter(([ms]) => ms === 85)).toHaveLength(1);
  });
  it('brakes a close approach before another pulse can cross the entire target', async () => {
    const { port } = navigation([340, 327, 322]);
    expect((await alignFactoryEntry(port)).hero.x).toBe(322);
    expect(port.down).toHaveBeenCalledExactlyOnceWith('a');
    expect(port.wait).toHaveBeenLastCalledWith(85); expect(port.measure).toHaveBeenCalledTimes(3);
  });
  it('keeps a failed neutral-frame observation primary and freezes without another key', async () => {
    const { port, log } = navigation([328, 313]);
    port.frame = vi.fn().mockResolvedValueOnce(42).mockRejectedValueOnce(Error('neutral observation failed'));
    await expect(alignFactoryEntry(port)).rejects.toThrow('neutral observation failed');
    expect(port.down).toHaveBeenCalledOnce(); expect(log.at(-1)).toBe('pause');
  });
});
