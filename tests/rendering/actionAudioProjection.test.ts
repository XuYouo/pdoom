import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ Scene: class {} }));
import { WorldScene } from '../../src/pages/GamePage/game/scenes/WorldScene';
import { GameBridge } from '../../src/pages/GamePage/game/bridge';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import type { AudioFrame } from '../../src/pages/GamePage/game/audio/types';
// Scene-boundary unit double only: no running game, native PCM or player-control claim.
function setup(mode = 'playing', paused = false, cleaned = false) {
  const save = Object.freeze({ ...createRun('projection', 42), actionCounts: Object.freeze({ shots: 110, rewinds: 3, dashes: 42, insights: 7 }) });
  const world = Object.freeze({ save, boss: Object.freeze({ active: true, hp: 100 }), chapter: Object.freeze({ stage: 4 }), mode,
    loom: Object.freeze({ rerolls: 2, turn: Object.freeze({ successes: 1 }), stemsLost: 4 }) });
  const update = vi.fn<(frame: AudioFrame) => void>();
  const scene = new WorldScene(new GameBridge());
  Object.assign(scene as object, { world, paused, cleaned, audio: { update } });
  const sync = () => (scene as unknown as { syncAudio(): void }).syncAudio();
  return { scene, world, update, sync };
}
describe('authoritative successful-action counts cross the existing audio edge', () => {
  it('projects both exact save counters without passing mutable world handles', () => {
    const h = setup(), before = JSON.stringify(h.world); h.sync();
    const frame = h.update.mock.calls[0][0];
    expect(frame).toMatchObject({ shots: 110, rewinds: 3, dashes: 42, insights: 7, stage: 4, running: true, stemsLost: 4 });
    expect(Object.values(frame).every(value => typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')).toBe(true);
    expect(JSON.stringify(h.world)).toBe(before);
    h.sync(); expect(h.update.mock.calls[1][0]).not.toBe(frame); expect(h.update.mock.calls[1][0]).toEqual(frame);
  });
  it.each(['rest', 'dead', 'cleared', 'finished'])('%s keeps the counters but disables playback', mode => {
    const h = setup(mode); h.sync(); expect(h.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ running: false, dashes: 42, insights: 7 }));
  });
  it.each([{ paused: true, cleaned: false }, { paused: false, cleaned: true }])('pause/cleanup boundary disables playback: %j', ({ paused, cleaned }) => {
    const h = setup('playing', paused, cleaned); h.sync(); expect(h.update.mock.calls[0][0].running).toBe(false);
  });
});
