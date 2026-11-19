import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { getChapter } from '../../src/pages/GamePage/game/data/chapters';
import { BEHAVIOR_ACTIONS } from '../../src/pages/GamePage/game/systems/behavior';
import { cloneData, makeCheckpoint } from '../../src/pages/GamePage/game/coop/state';
import { applyCoopCommand, createCoopWorld, deserializeCoopWorld, serializeCoopWorld, stepCoopWorld } from '../../src/pages/GamePage/game/coop';

const make = (stage: number) => createCoopWorld({ ...createRun('7c1382d5-3b81-4054-8d97-7bbfe22e0740', 42), stage });
describe('complete cooperative snapshot codec', () => {
  it.each([1, 2, 3, 4, 5])('round-trips chapter %i with the registered chapter identity', stage => {
    const state = make(stage);
    const payload = JSON.parse(JSON.stringify(serializeCoopWorld(state)));
    const next = deserializeCoopWorld(payload);
    expect(next).toEqual(state); expect(next?.shared.chapter).toBe(getChapter(stage));
  });
  it('accepts the full existing positive signed-32-bit seed contract', () => {
    const state = createCoopWorld(createRun('7c1382d5-3b81-4054-8d97-7bbfe22e0740', 2147483647));
    expect(deserializeCoopWorld(JSON.parse(JSON.stringify(serializeCoopWorld(state))))).toEqual(state);
  });
  it('preserves both complete histories and both active Q paths without rounding or loss', () => {
    let state = make(1);
    for (let i = 0; i < 125; i++) state = stepCoopWorld(state, {
      p1: { ...EMPTY_INPUT, move: i % 30 < 15 ? 1 : -1, jumpPressed: i % 50 === 0, jumpHeld: i % 50 < 10 },
      p2: { ...EMPTY_INPUT, move: i % 30 < 15 ? -1 : 1, jumpPressed: i % 50 === 20, jumpHeld: i % 50 >= 20 && i % 50 < 30 },
    });
    state = stepCoopWorld(state, { p1: { ...EMPTY_INPUT, rewindPressed: true }, p2: { ...EMPTY_INPUT, rewindPressed: true } });
    expect(state.players.p1.rewind).not.toBeNull(); expect(state.players.p2.rewind).not.toBeNull();
    const next = deserializeCoopWorld(JSON.parse(JSON.stringify(serializeCoopWorld(state))));
    expect(next).toEqual(state);
    expect(stepCoopWorld(next!, { p1: EMPTY_INPUT, p2: EMPTY_INPUT })).toEqual(stepCoopWorld(state, { p1: EMPTY_INPUT, p2: EMPTY_INPUT }));
  });
  it.each([1, 2, 3, 4, 5])('measures chapter %i at the bullet/history/behavior limits including the relay envelope and 32 events', stage => {
    let state = make(stage);
    for (let i = 0; i < 125; i++) state = stepCoopWorld(state, {
      p1: { ...EMPTY_INPUT, move: i % 30 < 15 ? 1 : -1, jumpPressed: i % 50 === 0, jumpHeld: i % 50 < 10 },
      p2: { ...EMPTY_INPUT, move: i % 30 < 15 ? -1 : 1, jumpPressed: i % 50 === 20, jumpHeld: i % 50 >= 20 && i % 50 < 30 },
    });
    state = stepCoopWorld(state, { p1: { ...EMPTY_INPUT, rewindPressed: true }, p2: { ...EMPTY_INPUT, rewindPressed: true } });
    expect(state.players.p1.rewind).not.toBeNull(); expect(state.players.p2.rewind).not.toBeNull();
    for (const id of ['p1', 'p2'] as const) {
      const p = state.players[id]; p.actionCounts = { shots: 10000, dashes: 10000, rewinds: 10000, insights: 10000 };
      p.behavior.counts = { ...p.actionCounts }; p.behavior.source = 'observed';
      p.behavior.recent = Array.from({ length: 48 }, (_, index) => ({ action: BEHAVIOR_ACTIONS[index % 4], at: state.run.elapsedMs - 1000 + index * 20 }));
      p.behavior.combos = BEHAVIOR_ACTIONS.flatMap(a => BEHAVIOR_ACTIONS.filter(b => b !== a).flatMap(b => [
        { actions: [a, b], uses: 1000, lastAt: state.run.elapsedMs },
        ...BEHAVIOR_ACTIONS.filter(c => c !== b).map(c => ({ actions: [a, b, c], uses: 1000, lastAt: state.run.elapsedMs })),
      ]));
    }
    state.checkpoint = makeCheckpoint(state);
    if (state.shared.omega) {
      const mirror = state.shared.omega.mirror;
      // A third, independently positioned actor cannot benefit from sharing either player's samples.
      mirror.history = state.players.p1.history.map(sample => ({ ...sample, x: sample.x + 2200, y: sample.y + 15 }));
      mirror.rewind = { ...cloneData(state.players.p1.rewind!), path: cloneData(mirror.history) };
    }
    const kind = (['dictionary', 'dialogue', 'causal', 'void', 'mirror'] as const)[stage - 1];
    state.shared.bullets = Array.from({ length: 180 }, (_, index) => ({ id: index + 1, x: 2350.123456789 + index, y: 250.987654321,
      vx: Math.cos(index) * 145, vy: Math.sin(index) * 145, radius: 4, damage: 18, faction: 'enemy' as const, kind, expiresAt: state.run.elapsedMs + 5500 }));
    state.shared.nextBulletId = 181;
    const payload = { world: serializeCoopWorld(state), paused: false, eventSequence: 32,
      events: Array.from({ length: 32 }, (_, id) => ({ id, event: { type: 'notice', message: '吞噬预警：橙框平台即将消失。到中心锚的标线右侧，吸力开始后向左冲刺！队友与真实地形共同保留。' } })) };
    const envelope = { v: 1, type: 'snapshot', roomId: 'ROOM12', matchId: state.run.runId, seq: 1000, payload };
    const encoded = JSON.stringify(envelope), bytes = new TextEncoder().encode(encoded).byteLength;
    console.info(`coop chapter ${stage} full snapshot: ${bytes} bytes / ${encoded.length} chars`);
    expect(deserializeCoopWorld(JSON.parse(JSON.stringify(payload.world)))).toEqual(state);
    expect(bytes).toBeLessThanOrEqual(64 * 1024);
    expect(encoded.length).toBeLessThanOrEqual(65000);
  });
  it('preserves optional projectile flags and never aliases decoded histories across players or Q paths', () => {
    const state = make(1);
    state.players.p2.history = cloneData(state.players.p1.history);
    state.players.p1.rewind = { startedAt: 0, durationMs: 500, path: cloneData(state.players.p1.history) };
    state.shared.bullets = [
      { id: 1, x: 100, y: 100, vx: 0, vy: 0, radius: 3, damage: 12, faction: 'player', kind: 'dictionary', expiresAt: 1000,
        ownerPlayerId: 'p2', critical: false, harmless: true, glyph: ')' },
      { id: 2, x: 100, y: 100, vx: 0, vy: 0, radius: 3, damage: 12, faction: 'enemy', kind: 'mirror', expiresAt: 1000,
        critical: true, harmless: false, glyph: '(' },
    ];
    const next = deserializeCoopWorld(JSON.parse(JSON.stringify(serializeCoopWorld(state))))!;
    expect(next).toEqual(state);
    next.players.p1.history[0].x += 1;
    expect(next.players.p2.history[0].x).toBe(state.players.p2.history[0].x);
    expect(next.players.p1.rewind!.path[0].x).toBe(state.players.p1.rewind!.path[0].x);
  });
  it('round-trips a real cleared chapter with the old scene and next-stage checkpoint, then continues with both ready', () => {
    const state = createCoopWorld({ ...createRun('7c1382d5-3b81-4054-8d97-7bbfe22e0740', 42), checkpoint: 2 });
    state.shared.boss.active = true; state.shared.boss.hp = 0;
    const cleared = stepCoopWorld(state, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
    const next = deserializeCoopWorld(JSON.parse(JSON.stringify(serializeCoopWorld(cleared))))!;
    expect(next).toEqual(cleared); expect(next.shared.chapter).toBe(getChapter(1)); expect(next.run.stage).toBe(2);
    const continued = applyCoopCommand(applyCoopCommand(next, { type: 'continue-ready', playerId: 'p1' }), { type: 'continue-ready', playerId: 'p2' });
    expect(continued.shared.chapter).toBe(getChapter(2)); expect(continued.run.score).toBe(1500);
  });
  it('rejects corrupt intern tables and unknown compact projectile enum codes', () => {
    const state = make(1);
    const payload = () => JSON.parse(JSON.stringify(serializeCoopWorld(state)));
    const invalidNumber = payload(); invalidNumber.numbers[0] = NaN; expect(deserializeCoopWorld(invalidNumber)).toBeNull();
    const invalidSample = payload(); invalidSample.samples[0][0] = invalidSample.numbers.length; expect(deserializeCoopWorld(invalidSample)).toBeNull();
    const invalidHistory = payload(); invalidHistory.data.players.p1.history[0] = -1; expect(deserializeCoopWorld(invalidHistory)).toBeNull();
    const invalidBullet = payload(); invalidBullet.data.shared.bullets = [[1, 1, 1, 1, 1, 1, 1, 8, 0, 100, 0, 0, 0, 0]];
    expect(deserializeCoopWorld(invalidBullet)).toBeNull();
  });
  it('rejects checkpoint run/seed/stage substitution, a future checkpoint, and a non-slot-zero host', () => {
    const payload = () => JSON.parse(JSON.stringify(serializeCoopWorld(make(1))));
    for (const [key, value] of [['runId', '8c1382d5-3b81-4054-8d97-7bbfe22e0740'], ['seed', 43], ['stage', 5], ['checkpoint', 1], ['elapsedMs', 1]] as const) {
      const invalid = payload(); invalid.data.checkpoint.run[key] = value; expect(deserializeCoopWorld(invalid)).toBeNull();
    }
    const host = payload(); host.data.hostPlayerId = 'p2'; expect(deserializeCoopWorld(host)).toBeNull();
    const behavior = payload(); behavior.data.checkpoint.players.p2.behavior.seed = 43; expect(deserializeCoopWorld(behavior)).toBeNull();
  });
  it('requires the rest mode, encoded checkpoint, and rest room to describe the same real phase', () => {
    const payload = () => JSON.parse(JSON.stringify(serializeCoopWorld(createCoopWorld({
      ...createRun('7c1382d5-3b81-4054-8d97-7bbfe22e0740', 42), checkpoint: 11,
    }))));
    const noPoint = payload(); noPoint.data.run.checkpoint = 0; noPoint.data.checkpoint.run.checkpoint = 0;
    expect(deserializeCoopWorld(noPoint)).toBeNull();
    const wrongRoom = payload(); wrongRoom.data.shared.rest.room = 2; expect(deserializeCoopWorld(wrongRoom)).toBeNull();
    const playing = payload(); playing.data.shared.mode = 'playing'; expect(deserializeCoopWorld(playing)).toBeNull();
    const finished = payload(); finished.data.shared.mode = 'finished'; expect(deserializeCoopWorld(finished)).toBeNull();
    expect(deserializeCoopWorld(payload())?.shared.mode).toBe('rest');
  });
  it('orders rest/hack/closed checkpoint markers by actual progress, not their encoded magnitude', () => {
    const payload = (checkpoint: number) => JSON.parse(JSON.stringify(serializeCoopWorld(createCoopWorld({
      ...createRun('7c1382d5-3b81-4054-8d97-7bbfe22e0740', 42), checkpoint,
    }))));
    const earlierRest = payload(1); earlierRest.data.checkpoint.run.checkpoint = 21;
    expect(deserializeCoopWorld(earlierRest)?.run.checkpoint).toBe(1);
    const futureExit = payload(11); futureExit.data.checkpoint.run.checkpoint = 1;
    expect(deserializeCoopWorld(futureExit)).toBeNull();
    const futureHack = payload(11); futureHack.data.checkpoint.run.checkpoint = 21;
    expect(deserializeCoopWorld(futureHack)).toBeNull();
    const futureRoom = payload(21); futureRoom.data.checkpoint.run.checkpoint = 2;
    expect(deserializeCoopWorld(futureRoom)).toBeNull();
  });
  it('rejects malformed state, unknown enums, non-finite numbers, excessive arrays and injected chapter data', () => {
    const mutate = (path: string[], value: unknown) => {
      const payload = JSON.parse(JSON.stringify(serializeCoopWorld(make(1))));
      let target = payload.data as Record<string, unknown>;
      for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
      target[path[path.length - 1]] = value; return deserializeCoopWorld(payload);
    };
    expect(mutate(['players', 'p2'], undefined)).toBeNull();
    expect(mutate(['players', 'p2', 'actor', 'x'], NaN)).toBeNull();
    expect(mutate(['players', 'p2', 'state'], 'invincible')).toBeNull();
    expect(mutate(['shared', 'chapter'], {})).toBeNull();
    expect(mutate(['shared', 'bullets'], Array(181).fill({}))).toBeNull();
    expect(mutate(['shared', 'chapterStage'], 3)).toBeNull();
  });
});
