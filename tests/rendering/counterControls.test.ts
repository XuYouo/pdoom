import { describe, expect, test } from 'vitest';
import { counterApproach, sampleCounterControls, sampleCounterMotion, withCounterCleanup } from '../e2e/counter-controls';
// Synthetic scanner contracts only; never used as positive browser screenshots.
const ink = 0xd97757, signature = [0x112233, 0x223344, 0x334455, 0x445566];
function blank() { const data = new Uint8ClampedArray(640 * 360 * 4); for (let p = 3; p < data.length; p += 4) data[p] = 255; return data; }
function rect(data: Uint8ClampedArray, x: number, y: number, w: number, h: number, rgb: number) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const p = (yy * 640 + xx) * 4; data[p] = rgb >>> 16; data[p + 1] = (rgb >>> 8) & 255; data[p + 2] = rgb & 255; }
}
const inspect = (rgba: Uint8ClampedArray, floorSignatures: number[][] = []) => sampleCounterControls({ rgba, floorSignatures, at: 42 });
function ground(gaps: [number, number][]) {
  const data = blank(); for (let x = 0; x < 640; x++) if (!gaps.some(([left, right]) => x >= left && x < right)) signature.forEach((rgb, dy) => rect(data, x, 320 + dy, 1, 1, rgb)); return data;
}
describe('bounded counter setup decisions, not physics', () => {
  test.each([[72, 'd'], [170, 'd'], [183.9, 'd'], [184, null], [193, null], [202, null], [202.1, 'a'], [235.5, 'a']] as const)('public x %s yields %s', (x, key) => expect(counterApproach(x)).toBe(key));
  test.each([NaN, Infinity, -Infinity])('rejects nonfinite %s', x => expect(() => counterApproach(x)).toThrow('finite'));
});
describe('exact same public RGBA scanner used by the browser callback', () => {
  test('one connected actor has exact bounds and centroid, no raster mutation', async () => {
    const data = blank(); rect(data, 180, 300, 16, 16, ink); const before = data.slice(); const f = await inspect(data);
    expect(f.actor).toEqual({ x: 187.5, y: 307.5, left: 180, top: 300, w: 16, h: 16, n: 256 }); expect(f.actors).toBe(1);
    expect(f.at).toBe(42); expect(f.opaque).toBe(230400); expect(f.floor).toBeNull(); expect(f.dialog).toBeNull(); expect(f.readMs).toBeGreaterThanOrEqual(0); expect(data.byteLength).toBe(before.byteLength); expect(data.every((byte, i) => byte === before[i])).toBe(true);
  });
  test('absence and ambiguous actors fail closed rather than picking the first', async () => {
    const data = blank(); expect((await inspect(data)).actor).toBeNull(); rect(data, 180, 300, 16, 16, ink); rect(data, 230, 300, 16, 16, ink);
    const f = await inspect(data); expect(f.actor).toBeNull(); expect(f.actors).toBe(2);
  });
  test('tiny orange noise is not a second actor', async () => { const data = blank(); rect(data, 180, 300, 16, 16, ink); rect(data, 10, 220, 3, 3, ink); expect((await inspect(data)).actors).toBe(1); });
  test.each([[13, 16, 0], [14, 12, 1], [40, 32, 1], [41, 16, 0], [16, 11, 0], [16, 33, 0]])('width%s height%s retains count%s', async (w, h, count) => {
    const data = blank(); rect(data, 100, 200, w, h, ink); expect((await inspect(data)).actors).toBe(count);
  });
  test.each([69, 70, 100, 160, 161])('gap width%s retains original70..160 rule', async width => {
    const f = await inspect(ground([[180, 180 + width]]), [signature]); expect(f.floor?.row).toBe(320); expect(f.floor?.supported).toBe(640 - width);
    expect(f.floor?.gaps).toEqual(width >= 70 && width <= 160 ? [{ left: 180, right: 180 + width }] : []);
  });
  test('two gaps and duplicate signatures preserve exact public intervals', async () => {
    const f = await inspect(ground([[180, 280], [400, 480]]), [signature, [...signature]]);
    expect(f.floor).toEqual({ row: 320, supported: 460, gaps: [{ left: 180, right: 280 }, { left: 400, right: 480 }] });
  });
  test('all four rows are required, not merely a matching top color', async () => {
    const data = ground([]); rect(data, 0, 323, 640, 1, 0xffffff); const f = await inspect(data, [signature]); expect(f.floor?.supported).toBe(0); expect(f.floor?.gaps).toEqual([]);
  });
  test('bad dimensions, alpha or sample time refuse a control observation', async () => {
    await expect(inspect(new Uint8ClampedArray(12))).rejects.toThrow('Native640x360'); const data = blank(); data[3] = 254;
    await expect(inspect(data)).rejects.toThrow('Opaque'); await expect(sampleCounterControls({ rgba: blank(), floorSignatures: [], at: NaN })).rejects.toThrow('finite');
  });
  test.each([[1, 2, 3], [1, 2, 3, 4, 5], [-1, 2, 3, 4], [0x1000000, 2, 3, 4], [1.5, 2, 3, 4]].map(s => [s]))('rejects malformed signature %j', async s => {
    await expect(inspect(blank(), [s])).rejects.toThrow('Four opaque RGB rows');
  });
});

describe('failure-preserving host cleanup, not a browser-failure claim', () => {
  test('successful work and every release preserve order', async () => {
    const order: string[] = [], diagnostics: string[] = [];
    await withCounterCleanup(async () => { order.push('work'); }, ['a', 'd', 'attach'].map(name => ({ name, run: async () => { order.push(name); } })), diagnostics);
    expect(order).toEqual(['work', 'a', 'd', 'attach']); expect(diagnostics).toEqual([]);
  });
  test('primary is rethrown unchanged, even when two cleanups fail', async () => {
    const primary = new Error('original input failure'), diagnostics: string[] = [], order: string[] = [];
    await expect(withCounterCleanup(async () => { throw primary; }, [
      { name: 'release a', run: async () => { order.push('a'); throw new Error('release broke'); } },
      { name: 'release d', run: async () => { order.push('d'); } },
      { name: 'attach', run: async () => { order.push('attach'); throw new Error('attachment broke'); } },
      { name: 'annotations', run: async () => { order.push('annotations'); } },
    ], diagnostics)).rejects.toBe(primary);
    expect(order).toEqual(['a', 'd', 'attach', 'annotations']); expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toContain('release a: Error: release broke'); expect(diagnostics[1]).toContain('attach: Error: attachment broke');
  });
  test('cleanup-only failures cannot become a successful result', async () => {
    const diagnostics: string[] = [], reached: string[] = [];
    await expect(withCounterCleanup(async () => {}, ['a', 'd'].map(name => ({ name, run: async () => { reached.push(name); throw new Error(name + ' failed'); } })), diagnostics)).rejects.toThrow(/a: Error: a failed[\s\S]*d: Error: d failed/);
    expect(reached).toEqual(['a', 'd']); expect(diagnostics).toHaveLength(2);
  });
  test.each([undefined, null, 0, false, ''])('a falsy primary %s is not erased by cleanup', async primary => {
    const diagnostics: string[] = [];
    await expect(withCounterCleanup(async () => { throw primary; }, [{ name: 'cleanup', run: async () => { throw new Error('secondary'); } }], diagnostics)).rejects.toBe(primary);
    expect(diagnostics).toHaveLength(1);
  });
  test('guard and attachment failures still reach later guards and annotation sink', async () => {
    const diagnostics: string[] = [], reached: string[] = [], annotations: string[] = [];
    await expect(withCounterCleanup(async () => {}, [
      { name: 'pageerror guard', run: async () => { reached.push('errors'); throw new Error('actual page error'); } },
      { name: 'write guard', run: async () => { reached.push('writes'); } },
      { name: 'attach', run: async () => { reached.push('attach'); throw new Error('attachment unavailable'); } },
      { name: 'annotations', run: async () => { annotations.push(...diagnostics); } },
    ], diagnostics)).rejects.toThrow('actual page error');
    expect(reached).toEqual(['errors', 'writes', 'attach']); expect(annotations).toEqual(diagnostics); expect(annotations).toHaveLength(2);
  });
});

describe('fixed motion raw-pair order, not a movement oracle', () => {
  test('both original raws are captured before either inspection', async () => {
    const order: string[] = [], raws = [Object.freeze({ x: 258 }), Object.freeze({ x: 462 })];
    const frames = raws.map(raw => ({ raw })); let reads = 0, inspections = 0;
    const result = await sampleCounterMotion({
      read: async () => { order.push('read' + reads); return raws[reads++]; },
      gap: async () => { order.push('gap'); },
      inspect: async raw => { order.push('inspect' + inspections); expect(raw).toBe(raws[inspections]); return frames[inspections++]; },
    });
    expect(order).toEqual(['read0', 'gap', 'read1', 'inspect0', 'inspect1']);
    expect(result.frame).toBe(frames[0]); expect(result.later).toBe(frames[1]);
    expect(reads).toBe(2); expect(inspections).toBe(2);
  });
  test.each([0, -10, 204])('returns the fixed pair even when dx%s would fail the browser guard', async dx => {
    const frames = [Object.freeze({ x: 258, markers: [] }), Object.freeze({ x: 258 + dx, markers: [] })]; let reads = 0;
    const result = await sampleCounterMotion({ read: async () => frames[reads++], gap: async () => {}, inspect: async frame => frame });
    expect(result).toEqual({ frame: frames[0], later: frames[1] }); expect(reads).toBe(2);
  });
  test.each(['read0', 'gap', 'read1', 'inspect0', 'inspect1'])('propagates failure at%s without later work or retry', async failed => {
    const order: string[] = []; let reads = 0, inspections = 0; const original = new Error(failed);
    const step = (name: string) => { order.push(name); if (name === failed) throw original; };
    await expect(sampleCounterMotion({
      read: async () => { step('read' + reads); return reads++; },
      gap: async () => { step('gap'); },
      inspect: async raw => { step('inspect' + inspections++); return { raw }; },
    })).rejects.toBe(original);
    const all = ['read0', 'gap', 'read1', 'inspect0', 'inspect1']; expect(order).toEqual(all.slice(0, all.indexOf(failed) + 1));
  });
  test('does not inspect or read ahead across asynchronous raw and gap barriers', async () => {
    const order: string[] = []; let reads = 0;
    let releaseFirst!: (value: number) => void, releaseGap!: () => void, releaseSecond!: (value: number) => void;
    const first = new Promise<number>(resolve => { releaseFirst = resolve; });
    const gap = new Promise<void>(resolve => { releaseGap = resolve; });
    const second = new Promise<number>(resolve => { releaseSecond = resolve; });
    const work = sampleCounterMotion({
      read: () => { order.push('read' + reads); return reads++ === 0 ? first : second; },
      gap: () => { order.push('gap'); return gap; },
      inspect: async value => { order.push('inspect' + value); return value; },
    });
    expect(order).toEqual(['read0']); releaseFirst(1); await Promise.resolve();
    expect(order).toEqual(['read0', 'gap']); releaseGap(); await Promise.resolve();
    expect(order).toEqual(['read0', 'gap', 'read1']); releaseSecond(2);
    expect(await work).toEqual({ frame: 1, later: 2 });
    expect(order).toEqual(['read0', 'gap', 'read1', 'inspect1', 'inspect2']);
  });
  test.each([undefined, null, 0, false])('a falsy gap rejection%s cannot become a pair', async failure => {
    let reads = 0, inspections = 0;
    await expect(sampleCounterMotion({
      read: async () => ++reads,
      gap: async () => { throw failure; },
      inspect: async raw => { inspections++; return raw; },
    })).rejects.toBe(failure);
    expect(reads).toBe(1); expect(inspections).toBe(0);
  });
});
