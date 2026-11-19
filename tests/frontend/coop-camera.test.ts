import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createCoopWorld } from '../../src/pages/GamePage/game/coop';
import { playerRect } from '../../src/pages/GamePage/game/entities/model';
import { coopCameraTarget } from '../../src/pages/GamePage/network/coopCamera';

const make = (stage = 1) => createCoopWorld({ ...createRun('7c1382d5-3b81-4054-8d97-7bbfe22e0740', 42), stage });
const assertContained = (state: ReturnType<typeof make>, camera: ReturnType<typeof coopCameraTarget>) => {
  for (const id of ['p1', 'p2'] as const) {
    const body = playerRect(state.players[id].actor);
    expect(body.x - camera.x).toBeGreaterThanOrEqual(12);
    expect(body.x + body.w - camera.x).toBeLessThanOrEqual(628);
    expect(body.y - camera.y).toBeGreaterThanOrEqual(48);
    expect(body.y + body.h - camera.y).toBeLessThanOrEqual(338);
  }
};
describe('shared cooperative camera', () => {
  it('contains the complete actors at 480px separation regardless of either facing or vertical speed', () => {
    const state = make();
    Object.assign(state.players.p1.actor, { x: 760, y: 220, facing: 1, vy: -490 });
    Object.assign(state.players.p2.actor, { x: 1240, y: 280, facing: -1, vy: 490 });
    const before = structuredClone(state.players);
    const camera = coopCameraTarget(state); assertContained(state, camera);
    state.players.p1.actor.facing = -1; state.players.p1.actor.vy = 999;
    expect(coopCameraTarget(state)).toEqual(camera);
    expect(state.players.p2).toEqual(before.p2);
    expect(state.players.p1.actor.x).toBe(before.p1.actor.x);
  });
  it('contains both actors at the actual 240px vertical boundary even when easing from an old frame', () => {
    const state = make(2);
    Object.assign(state.players.p1.actor, { x: 100, y: 900 });
    Object.assign(state.players.p2.actor, { x: 580, y: 1140 });
    assertContained(state, coopCameraTarget(state));
    assertContained(state, coopCameraTarget(state, { x: 0, y: 1200 }, 16));
    assertContained(state, coopCameraTarget(state, { x: 0, y: 400 }, 16));
  });
  it('follows the sole survivor past a distant downed teammate without changing either actor', () => {
    const state = make();
    Object.assign(state.players.p1, { hp: 0, state: 'downed' }); state.players.p1.actor.x = 100;
    state.players.p2.actor.x = 1800;
    const before = structuredClone(state);
    const camera = coopCameraTarget(state, { x: 0, y: 0 }, 16);
    const body = playerRect(state.players.p2.actor);
    expect(body.x - camera.x).toBeGreaterThanOrEqual(12); expect(body.x + body.w - camera.x).toBeLessThanOrEqual(628);
    expect(state.players.p1.actor.x - camera.x).toBeLessThan(0); expect(state).toEqual(before);
  });
  it('keeps a nearby downed teammate visible for rescue when both fit', () => {
    const state = make();
    Object.assign(state.players.p1, { hp: 0, state: 'downed' }); state.players.p1.actor.x = 1100;
    state.players.p2.actor.x = 1500;
    assertContained(state, coopCameraTarget(state));
    expect(coopCameraTarget(state).x).toBe(980);
  });
  it('excludes a waiting casualty below the world and keeps world and authored arena limits', () => {
    const state = make(2); Object.assign(state.players.p1, { hp: 0, state: 'waiting' });
    state.players.p1.actor.y = 9999; state.players.p2.actor.y = 800;
    expect(coopCameraTarget(state).y).toBe(607);
    state.shared.boss.active = true;
    const camera = coopCameraTarget(state);
    expect(camera.x).toBe(state.shared.chapter.arena.x); expect(camera.y).toBe(state.shared.chapter.arena.y);
  });
  it('snaps a real epoch/map transition instead of retaining the previous chapter scroll', () => {
    const state = make(2);
    const expected = coopCameraTarget(state);
    expect(coopCameraTarget(state, { x: 2500, y: 0 }, 16, true)).toEqual(expected);
  });
});
