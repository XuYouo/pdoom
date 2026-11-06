import { describe, expect, test } from 'vitest';
import { loomApproachDuration, moveLoomKeys, observeLoomActor, observeLoomStaging, observeWhileLeavingLoom } from '../e2e/loom-controls';
import { withCleanup } from '../e2e/factory-navigation';
const frame = (count = 384, x = 218.5, bottom = 318) => ({ orange: { count, x, bottom }, marker: {} });
describe('Loom public observation contracts, not native movement proof', () => {
  test('an empty default x320 never becomes a measured actor; return the first actual object', async () => {
    const empty = frame(0, 320, 0), visible = frame(), queue = [empty, visible]; let calls = 0;
    const result = await observeLoomActor(async () => queue[calls++]);
    expect(calls).toBe(2); expect(result.value).toBe(visible);
    expect(result.observations).toEqual([empty.orange, visible.orange]);
    empty.orange.x = 1; visible.orange.x = 2; expect(result.observations.map(v => v.x)).toEqual([320, 218.5]);
  });
  test('returns a visible wrong-side actor immediately rather than searching for a passing displacement', async () => {
    const wrong = frame(384, 500); let calls = 0;
    const result = await observeLoomActor(async () => { calls++; return wrong; });
    expect(calls).toBe(1); expect(result.value).toBe(wrong); expect(332.5 - result.value.orange.x).toBeLessThan(32);
  });
  test.each([
    [0, 320, 0], [59, 218, 318], [60.5, 218, 318], [NaN, 218, 318], [Infinity, 218, 318],
    [384, NaN, 318], [384, -1, 318], [384, 640, 318], [384, 218, 0], [384, 218, 360], [384, 218, Infinity],
  ])('rejects absent or invalid raster geometry %s/%s/%s in exactly eight observations', async (n, x, bottom) => {
    let calls = 0;
    await expect(observeLoomActor(async () => { calls++; return frame(n, x, bottom); })).rejects.toThrow('eight bounded observations');
    expect(calls).toBe(8);
  });
  test('the eighth valid frame is allowed, without changing or averaging its coordinates', async () => {
    const visible = frame(60, 0, 359); let calls = 0;
    const result = await observeLoomActor(async () => ++calls === 8 ? visible : frame(0, 320, 0));
    expect(calls).toBe(8); expect(result.value).toBe(visible); expect(result.observations).toHaveLength(8);
  });
  test('protocol rejection is primary and is never treated as another empty frame', async () => {
    const primary = Error('page closed'); let calls = 0;
    await expect(observeLoomActor(async () => { calls++; throw primary; })).rejects.toBe(primary); expect(calls).toBe(1);
  });
});
describe('ordinary Loom exit sequencing, no Core or timer mutation', () => {
  test('A is held throughout observation and actual death wait, then released before archiving', async () => {
    const events: string[] = [], expected = { checkpoint: { hp: 100 }, captures: ['raw'] };
    const result = await withCleanup(() => observeWhileLeavingLoom({
      leftDown: async () => { events.push('a-down'); }, leftUp: async () => { events.push('a-up'); },
      observe: async () => { events.push('shoot300', 'capture600', 'checkpoint'); return expected; },
      waitForDeath: async () => { events.push('actual-death'); },
    }), async () => { events.push('archive'); });
    expect(result).toBe(expected); expect(events).toEqual(['a-down', 'shoot300', 'capture600', 'checkpoint', 'actual-death', 'a-up', 'archive']);
  });
  test.each(['down', 'observe', 'death'] as const)('releases A on %s failure, retaining original identity and skipping later work', async phase => {
    const primary = Error(phase), events: string[] = [];
    const operation = observeWhileLeavingLoom({
      leftDown: async () => { events.push('down'); if (phase === 'down') throw primary; },
      leftUp: async () => { events.push('up'); },
      observe: async () => { events.push('observe'); if (phase === 'observe') throw primary; return 'raw'; },
      waitForDeath: async () => { events.push('death'); if (phase === 'death') throw primary; },
    });
    await expect(operation).rejects.toBe(primary);
    expect(events).toEqual(phase === 'down' ? ['down', 'up'] : phase === 'observe' ? ['down', 'observe', 'up'] : ['down', 'observe', 'death', 'up']);
  });
  test('cleanup-only failure is not a successful exit', async () => {
    const error = Error('release failed');
    await expect(observeWhileLeavingLoom({ leftDown: async () => {}, leftUp: async () => { throw error; },
      observe: async () => 'raw', waitForDeath: async () => {} })).rejects.toBe(error);
  });
  test('falsy primary plus A-release failure retains both causes', async () => {
    const cleanupError = Error('release failed');
    await expect(observeWhileLeavingLoom({ leftDown: async () => {}, leftUp: async () => { throw cleanupError; },
      observe: async () => { throw null; }, waitForDeath: async () => {} })).rejects.toMatchObject({ cause: null, cleanupError });
  });
  test('mouse cleanup failure still releases A and archival failure preserves the complete cause chain', async () => {
    const primary = Error('capture failed'), mouse = Error('mouse-up'), left = Error('a-up'), archive = Error('archive');
    const events: string[] = [];
    const operation = withCleanup(() => observeWhileLeavingLoom({
      leftDown: async () => { events.push('a-down'); },
      leftUp: async () => { events.push('a-up'); throw left; },
      observe: () => withCleanup(async () => { throw primary; }, async () => { events.push('mouse-up'); throw mouse; }),
      waitForDeath: async () => { events.push('must-not-wait'); },
    }), async () => { events.push('archive'); throw archive; });
    await expect(operation).rejects.toMatchObject({ cause: { cause: { cause: primary, cleanupError: mouse }, cleanupError: left }, cleanupError: archive });
    expect(events).toEqual(['a-down', 'mouse-up', 'a-up', 'archive']);
  });
});

describe('ordinary Loom movement release ordering, not Core timing proof', () => {
  const portFor = (events: string[], fail?: string, original: unknown = Error('input failed')) => {
    const action = (name: string) => async () => { events.push(name); if (name === fail) throw original; };
    return { horizontalDown: action('down'), horizontalUp: action('horizontal-up'),
      jumpDown: action('jump'), jumpUp: action('jump-up'), wait: action('wait'), settle: action('settle') };
  };
  test.each([false, true])('jump%s releases horizontal movement before any Space-up and then settles', async jump => {
    const events: string[] = []; await moveLoomKeys(portFor(events), jump);
    expect(events).toEqual(jump ? ['down', 'jump', 'wait', 'horizontal-up', 'jump-up', 'settle'] : ['down', 'wait', 'horizontal-up', 'settle']);
  });
  test.each(['down', 'jump', 'wait', 'horizontal-up', 'jump-up'])('failure at%s still attempts both releases and skips settling', async failed => {
    const events: string[] = [], primary = Error(failed);
    await expect(moveLoomKeys(portFor(events, failed, primary), true)).rejects.toBe(primary);
    const body = failed === 'down' ? ['down'] : failed === 'jump' ? ['down', 'jump'] : ['down', 'jump', 'wait'];
    expect(events).toEqual([...body, 'horizontal-up', 'jump-up']);
  });
  test('settle failure happens only after both keys were released', async () => {
    const events: string[] = [], original = Error('settle');
    await expect(moveLoomKeys(portFor(events, 'settle', original), true)).rejects.toBe(original);
    expect(events).toEqual(['down', 'jump', 'wait', 'horizontal-up', 'jump-up', 'settle']);
  });
  test('wait and both release errors retain the entire cause chain', async () => {
    const events: string[] = [], primary = Error('wait'), horizontal = Error('horizontal'), jump = Error('jump');
    const port = portFor(events, 'wait', primary);
    port.horizontalUp = async () => { events.push('horizontal-up'); throw horizontal; };
    port.jumpUp = async () => { events.push('jump-up'); throw jump; };
    await expect(moveLoomKeys(port, true)).rejects.toMatchObject({ cause: { cause: primary, cleanupError: horizontal }, cleanupError: jump });
    expect(events).toEqual(['down', 'jump', 'wait', 'horizontal-up', 'jump-up']);
  });
  test.each([null, false, 0])('a falsy wait rejection%s is preserved, never converted to success', async original => {
    const events: string[] = [];
    await expect(moveLoomKeys(portFor(events, 'wait', original), true)).rejects.toBe(original);
    expect(events).toEqual(['down', 'jump', 'wait', 'horizontal-up', 'jump-up']);
  });
  test('Space-up is not awaited before the horizontal release request', async () => {
    const events: string[] = []; let release!: () => void, entered!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const port = portFor(events);
    port.horizontalUp = async () => { events.push('horizontal-up'); entered(); await barrier; };
    const pending = moveLoomKeys(port, true); await started;
    expect(events).toEqual(['down', 'jump', 'wait', 'horizontal-up']); release(); await pending;
    expect(events).toEqual(['down', 'jump', 'wait', 'horizontal-up', 'jump-up', 'settle']);
  });
  test('nonjump movement never invokes either jump command', async () => {
    const events: string[] = [], port = portFor(events);
    port.jumpDown = port.jumpUp = async () => { throw Error('unexpected Space input'); };
    await moveLoomKeys(port, false); expect(events).toEqual(['down', 'wait', 'horizontal-up', 'settle']);
  });
});

describe('staging observes only after releasing D, while retaining the original A counter-steer', () => {
  test.each(['a', 'd', null] as const)('held%s returns exactly the first observation without a pose or success predicate', async initial => {
    let held: 'a' | 'd' | null = initial; const events: string[] = [], wrongSide = frame(384, 500);
    const result = await observeLoomStaging({ held,
      release: async () => { events.push('up'); held = null; },
      observe: async () => { events.push('read'); expect(held).toBe(initial === 'd' ? null : initial); return wrongSide; },
    });
    expect(result).toBe(wrongSide); expect(events).toEqual(initial === 'd' ? ['up', 'read'] : ['read']);
  });
  test('D release must resolve before the PNG observer starts', async () => {
    const events: string[] = []; let release!: () => void;
    const pending = observeLoomStaging({ held: 'd',
      release: () => { events.push('up'); return new Promise<void>(resolve => { release = resolve; }); },
      observe: async () => { events.push('read'); return frame(); },
    });
    expect(events).toEqual(['up']); release(); await pending; expect(events).toEqual(['up', 'read']);
  });
  test.each(['a', 'd', null] as const)('a read rejection with held%s is retained and the enclosing cleanup releases remaining keys', async initial => {
    let held: 'a' | 'd' | null = initial; const events: string[] = [], primary = Error('raster unavailable');
    const release = async () => { if (held) events.push('up-' + held); held = null; };
    await expect(withCleanup(() => observeLoomStaging({ held, release,
      observe: async () => { events.push('read'); throw primary; },
    }), release)).rejects.toBe(primary);
    expect(held).toBeNull();
    expect(events).toEqual(initial === 'd' ? ['up-d', 'read'] : initial === 'a' ? ['read', 'up-a'] : ['read']);
  });
  test.each([undefined, null, false, 0])('D-release rejection%s never starts observation or returns success', async primary => {
    let reads = 0, releases = 0;
    await expect(observeLoomStaging({ held: 'd', release: async () => { releases++; throw primary; },
      observe: async () => { reads++; return frame(); },
    })).rejects.toBe(primary);
    expect(releases).toBe(1); expect(reads).toBe(0);
  });
  test('failed D release and the enclosing cleanup keep both failure causes', async () => {
    const primary = Error('first release'), cleanupError = Error('cleanup'); let releases = 0, reads = 0;
    const release = async () => { if (++releases === 1) throw primary; throw cleanupError; };
    await expect(withCleanup(() => observeLoomStaging({ held: 'd', release,
      observe: async () => { reads++; return frame(); },
    }), release)).rejects.toMatchObject({ cause: primary, cleanupError });
    expect(releases).toBe(2); expect(reads).toBe(0);
  });
  test('an empty first observation stays empty and is not retried or replaced', async () => {
    const empty = frame(0, 320, 0); let reads = 0;
    const result = await observeLoomStaging({ held: 'a', release: async () => { throw Error('must keep A'); },
      observe: async () => { reads++; return empty; },
    });
    expect(result).toBe(empty); expect(reads).toBe(1); expect(result.orange.count).toBe(0);
  });
});

describe('bounded far-left Loom approach policy, not physical timing proof', () => {
  test.each([[-220.5, 350], [-146.5, 350], [-120, 40 / 190 * 1000], [-92.35, 65], [-80.01, 65]])(
    'supported gap%s requests one bounded stroke of%s ms', (gap, expected) => {
      expect(loomApproachDuration(gap, true)).toBeCloseTo(expected, 8);
    });
  test.each([-80, -79.99, -55, -6.018, 0, 24, 27, 34, 95.5])('gap%s remains exclusively under the original fine policy', gap => {
    expect(loomApproachDuration(gap, true)).toBe(0);
  });
  test.each([-500, -220.5, -100])('unsupported gap%s cannot authorize coarse transit', gap => {
    expect(loomApproachDuration(gap, false)).toBe(0);
  });
  test.each([NaN, Infinity, -Infinity])('invalid gap%s cannot create an unbounded key request', gap => {
    expect(loomApproachDuration(gap, true)).toBe(0);
  });
  test('far transit completes horizontal release and original settle before another observation', async () => {
    const events: string[] = [], duration = loomApproachDuration(-220.5, true);
    await moveLoomKeys({ horizontalDown: async () => { events.push('d-down'); },
      horizontalUp: async () => { events.push('d-up'); },
      jumpDown: async () => { throw Error('no jump in transit'); }, jumpUp: async () => { throw Error('no Space in transit'); },
      wait: async () => { events.push('wait-' + duration); }, settle: async () => { events.push('settle85'); },
    }, false);
    await observeLoomStaging({ held: null, release: async () => { throw Error('already released'); },
      observe: async () => { events.push('fresh-read'); return frame(); },
    });
    expect(events).toEqual(['d-down', 'wait-350', 'd-up', 'settle85', 'fresh-read']);
  });
});
