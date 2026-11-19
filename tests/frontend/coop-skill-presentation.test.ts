import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { createCoopWorld, stepCoopWorld, type CoopWorldState, type PlayerId } from '../../src/pages/GamePage/game/coop';
import { coopViewSnapshot } from '../../src/pages/GamePage/network/coopPresentation';

const idle = { p1: { ...EMPTY_INPUT }, p2: { ...EMPTY_INPUT } };
const world = () => createCoopWorld({ ...createRun('f17612c3-e343-45bf-bd1c-05fc54e1ef3b', 42), stage: 4 });
function advance(state: CoopWorldState, ticks: number) {
  for (let index = 0; index < ticks; index += 1) state = stepCoopWorld(state, idle);
  expect(state.shared.mode).toBe('playing'); return state;
}
const hud = (state: CoopWorldState, id: PlayerId) => coopViewSnapshot(state, id, 'playing').hud.loom!;

describe('cooperative R presentation follows the shared rewind gate', () => {
  it.each(['p1', 'p2'] as const)('blocks %s while their teammate actually rewinds, then enables a real shared reroll', localId => {
    const teammate = localId === 'p1' ? 'p2' : 'p1';
    let state = advance(world(), 125);
    expect(hud(state, localId).rerollReady).toBe(true);
    state = stepCoopWorld(state, { ...idle, [teammate]: { ...EMPTY_INPUT, rewindPressed: true } });
    expect(state.players[teammate].rewind).not.toBeNull();
    const before = JSON.stringify(state);
    expect(hud(state, localId)).toMatchObject({ rerollReady: false, rerollBlocked: 'teammate-rewind' });
    expect(hud(state, teammate)).toMatchObject({ rerollReady: false, rerollBlocked: 'self-rewind' });
    expect(JSON.stringify(state)).toBe(before);
    state = stepCoopWorld(state, { ...idle, [localId]: { ...EMPTY_INPUT, rerollPressed: true } });
    expect(state.shared.loom!.timeline).toBe(0);
    state = advance(state, 40);
    expect(state.players[teammate].rewind).toBeNull();
    expect(hud(state, localId).rerollReady).toBe(true);
    expect(hud(state, localId).rerollBlocked).toBeUndefined();
    state = stepCoopWorld(state, { ...idle, [localId]: { ...EMPTY_INPUT, rerollPressed: true } });
    expect(state.shared.loom!.timeline).toBe(1);
  });

  it('keeps the real shared cooldown after a teammate finishes Q', () => {
    let state = stepCoopWorld(world(), { ...idle, p1: { ...EMPTY_INPUT, rerollPressed: true } });
    expect(state.shared.loom!.rerolls).toBe(1);
    state = advance(state, 125);
    state = stepCoopWorld(state, { ...idle, p2: { ...EMPTY_INPUT, rewindPressed: true } });
    expect(hud(state, 'p1')).toMatchObject({ rerollReady: false, rerollBlocked: 'teammate-rewind' });
    state = advance(state, 40);
    expect(state.run.elapsedMs).toBeLessThan(state.shared.loom!.rerollReadyAt);
    expect(hud(state, 'p1').rerollReady).toBe(false);
    expect(hud(state, 'p1').rerollBlocked).toBeUndefined();
  });

  it('prioritizes each local rewind when both players are rewinding', () => {
    let state = advance(world(), 125);
    state = stepCoopWorld(state, { p1: { ...EMPTY_INPUT, rewindPressed: true }, p2: { ...EMPTY_INPUT, rewindPressed: true } });
    for (const id of ['p1', 'p2'] as const) {
      expect(state.players[id].rewind).not.toBeNull();
      expect(hud(state, id)).toMatchObject({ rerollReady: false, rerollBlocked: 'self-rewind' });
    }
  });
});
