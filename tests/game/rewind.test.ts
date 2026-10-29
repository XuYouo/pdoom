import { describe, expect, it } from 'vitest';
import type { Bullet, HistorySample } from '../../src/pages/GamePage/game/entities/model';
import { absorbBullet, beginRewind, crossesBullet, recordHistory, rewindTraversal, sampleAt } from '../../src/pages/GamePage/game/systems/rewind';
import { createPlayer } from '../../src/pages/GamePage/game/systems/rules';

const sample = (at: number, x: number, y = 100): HistorySample => ({ at, x, y, vx: 1, vy: 0, facing: 1 });
const bullet: Bullet = { id: 1, faction: 'enemy', kind: 'echo', x: 200, y: 100, vx: 0, vy: 0, radius: 3, damage: 15, expiresAt: 9000 };

describe('two-second backpropagation', () => {
  it('requires a full two seconds and interpolates the exact start of the window', () => {
    expect(beginRewind([sample(1000, 100), sample(2000, 200)], 2000)).toBeNull();
    const rewind = beginRewind([sample(0, 0), sample(1000, 100), sample(2000, 200), sample(2500, 250)], 2500)!;
    expect(rewind.path[0]).toMatchObject({ at: 500, x: 50 });
    expect(sampleAt(rewind.path, 1500).x).toBe(150);
    const traversal = rewindTraversal(rewind, 2500, 3100);
    expect(traversal[traversal.length - 1]?.x).toBe(50);
  });
  it('retains the cutoff bracket but does not grow the whole-run history', () => {
    const history = Array.from({ length: 1000 }, (_, i) => sample(i * 20, i)).reduce<HistorySample[]>((list, item) => recordHistory(list, item), []);
    expect(history.length).toBeLessThanOrEqual(102);
    expect(history[0].at).toBeLessThanOrEqual(history[history.length - 1].at - 2000);
  });
  it('visits every reverse-path corner rather than cutting diagonally across a jump', () => {
    const rewind = beginRewind([sample(0, 0, 100), sample(1000, 100, 0), sample(2000, 200, 100)], 2000)!;
    const points = rewindTraversal(rewind, 2000, 2600);
    expect(points.map(p => [p.x, p.y])).toEqual([[200, 100], [100, 0], [0, 100]]);
    expect(crossesBullet(points, { ...bullet, x: 100, y: 0 })).toBe(true);
    expect(crossesBullet(points, { ...bullet, x: 100, y: 100 })).toBe(false);
  });
  it('grants ten seconds of the crossed type and bounded critical charges', () => {
    const result = absorbBullet({ ...createPlayer(0, 0, 0), criticalCharges: 5 }, bullet, 2400);
    expect(result.immunity).toEqual({ echo: 12400 });
    expect(result.criticalCharges).toBe(6);
  });
});
