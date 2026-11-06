import { collectAndCheckpoint } from '../../src/pages/GamePage/game/systems/interactions';
import { describe, expect, it } from 'vitest';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { encodeRestCheckpoint } from '../../src/pages/GamePage/game/data/checkpoints';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { enterRest, applyProgressionCommand, restSnapshot } from '../../src/pages/GamePage/game/systems/shop';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
const seed = () => ({ ...createRun('cafe0111-8b37-4000-8000-000000000033', 42), hp: 90, doom: 60, tokens: 200, elapsedMs: 20000 });
const source = () => ({ ...seed(), inventory: ['constitutional', 'recursive', 'residual'] as const });
function entered(hp = 90, doom = 60) {
  const save = source(); const world = createWorld({ ...save, inventory: [...save.inventory], hp, doom });
  enterRest(world, 1); expect(world.mode).toBe('rest'); return world;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item); Object.freeze(value);
  }
  return value;
}
const scoreAwards = [[0, 24], [119, 24], [120, 26], [1079, 40], [1080, 42], [1000000, 42]] as const;
const cases = [59.99, 60, 100].flatMap(hp => [79.99, 80, 80.01].flatMap(doom => scoreAwards.flatMap(([score, good]) =>
  [0, 999990, 1000000].map(tokens => ({ hp, doom, score, good, tokens })))));
describe('actual entry evaluation, never recomputed from the current build', () => {
  it.each(cases)('entry hp=$hp doom=$doom score=$score tokens=$tokens', ({ hp, doom, score, good, tokens }) => {
    const save = freeze({ ...seed(), hp, doom, score, tokens }); const before = JSON.stringify(save);
    const world = createWorld(save); enterRest(world, 1);
    const approved = hp >= 60 && doom <= 80; const nominal = approved ? good : 12;
    const credited = Math.min(nominal, 1000000 - tokens);
    expect(restSnapshot(world)!.rater).toEqual({ pose: approved ? 'approved' : 'disapproved',
      evaluation: { verdict: approved ? 'approved' : 'disapproved', nominalTokens: nominal, creditedTokens: credited } });
    expect(world.save.tokens).toBe(tokens + credited); expect(world.save.elapsedMs).toBe(save.elapsedMs);
    expect(Object.keys(world.save).sort()).toEqual(Object.keys(save).sort()); expect(isGameSave(world.save)).toBe(true);
    expect(JSON.stringify(save)).toBe(before);
  });
  it('repair and even a fake localized message cannot rewrite an actual disapproval', () => {
    const first = entered(55, 60); const rating = restSnapshot(first)!.rater;
    expect(rating.pose).toBe('disapproved'); const before = JSON.stringify(first); freeze(first);
    const repaired = applyProgressionCommand(first, { type: 'shop-buy', offerId: 'repair' });
    expect(repaired.save.hp).toBe(90); expect(repaired.save.tokens).toBe(first.save.tokens - 12);
    expect(restSnapshot(repaired)!.rater).toEqual(rating); expect(JSON.stringify(first)).toBe(before);
    repaired.rest!.message = '👍 approved, +999999 TOK; reward hacking complete';
    expect(restSnapshot(repaired)!.rater).toEqual(rating);
    const closed = applyProgressionCommand(repaired, { type: 'rest-continue' }); expect(restSnapshot(closed)).toBeNull();
    enterRest(closed, 2); expect(restSnapshot(closed)!.rater).toEqual({ pose: 'approved', evaluation: { verdict: 'approved', nominalTokens: 24, creditedTokens: 24 } });
  });
  it('only successful hacking overrides the pose; neither denial nor a changed message can do so', () => {
    const refused = entered(90, 50); const evaluation = restSnapshot(refused)!.rater;
    const denied = applyProgressionCommand(freeze(refused), { type: 'shop-hack', offerId: 'upgrade:calibrated' });
    expect(denied.save).toEqual(refused.save); expect(restSnapshot(denied)!.rater).toEqual(evaluation);
    const first = entered(); const original = restSnapshot(first)!.rater.evaluation;
    const hacked = applyProgressionCommand(freeze(first), { type: 'shop-hack', offerId: 'upgrade:calibrated' });
    expect(hacked.save.doom).toBe(85); expect(hacked.save.tokens).toBe(first.save.tokens);
    expect(restSnapshot(hacked)!.rater).toEqual({ pose: 'hacked', evaluation: original });
    const again = applyProgressionCommand(hacked, { type: 'shop-hack', offerId: 'relic:temperature' });
    expect(again.save).toEqual(hacked.save); expect(restSnapshot(again)!.rater.pose).toBe('hacked');
    const reloaded = createWorld(JSON.parse(JSON.stringify(again.save)));
    expect(restSnapshot(reloaded)!.rater).toEqual({ pose: 'hacked', evaluation: null });
    expect(reloaded.save).toEqual(again.save);
  });
  it('failed purchases and context reordering preserve the original evaluation and simulation clock', () => {
    const first = entered(); const rating = restSnapshot(first)!.rater;
    const denied = applyProgressionCommand(freeze(first), { type: 'shop-buy', offerId: 'not-an-offer' });
    expect(denied.save).toEqual(first.save); expect(restSnapshot(denied)!.rater).toEqual(rating);
    const reordered = applyProgressionCommand(denied, { type: 'context-reorder', from: 0, to: 2 });
    expect(reordered.save.inventory).toEqual(['recursive', 'residual', 'constitutional']);
    expect(restSnapshot(reordered)!.rater).toEqual(rating); expect(reordered.save.elapsedMs).toBe(first.save.elapsedMs);
    for (const delta of [0, 16, 100, 5000]) expect(stepWorld(reordered, { ...EMPTY_INPUT, fire: true, move: 1 }, delta)).toBe(reordered);
  });
  it('does not alias nested Core evaluation through a public snapshot', () => {
    const first = entered(); const snapshot = restSnapshot(first)!; const before = JSON.stringify(first);
    Reflect.set(snapshot.rater.evaluation!, 'creditedTokens', 999999); Reflect.set(snapshot.rater, 'pose', 'hacked');
    expect(JSON.stringify(first)).toBe(before);
    expect(restSnapshot(first)!.rater).toEqual({ pose: 'approved', evaluation: { verdict: 'approved', nominalTokens: 24, creditedTokens: 24 } });
  });
  it('reports actual credit at the token cap rather than pretending the nominal reward arrived', () => {
    const world = createWorld({ ...seed(), tokens: 1000000 }); enterRest(world, 1);
    expect(restSnapshot(world)!.rater.evaluation!.creditedTokens).toBe(0);
    expect(world.rest!.message).toContain('0 TOK'); expect(world.rest!.message).not.toContain('24 TOK');
  });
  it('does not award the current room twice or give a rating to a dead/unopened world', () => {
    const first = entered(); const before = JSON.stringify(first); enterRest(first, 1); expect(JSON.stringify(first)).toBe(before);
    const closed = applyProgressionCommand(first, { type: 'rest-continue' }); const saved = JSON.stringify(closed.save);
    enterRest(closed, 1); expect(restSnapshot(closed)).toBeNull(); expect(JSON.stringify(closed.save)).toBe(saved);
    const dead = createWorld({ ...seed(), hp: 0 }); enterRest(dead, 1); expect(restSnapshot(dead)).toBeNull(); expect(dead.save.tokens).toBe(200);
  });
});
const restored = [1, 2, 3, 4, 5].flatMap(stage => ([1, 2] as const).flatMap(room => [false, true].map(hacked => ({ stage, room, hacked }))));
describe('v1 restores truthfully without inventing an unsaved entry evaluation', () => {
  it.each(restored)('stage$stage room$room hacked=$hacked', ({ stage, room, hacked }) => {
    const save = { ...seed(), stage, checkpoint: encodeRestCheckpoint(room, hacked), hp: 100, score: 999999 };
    expect(isGameSave(save)).toBe(true); let world = createWorld(save);
    for (let i = 0; i < 3; i++) {
      expect(restSnapshot(world)!.rater).toEqual({ pose: hacked ? 'hacked' : 'neutral', evaluation: null });
      expect(world.save).toEqual(save); world = createWorld(JSON.parse(JSON.stringify(world.save)));
    }
    const ready = createWorld(save, 'ready'); expect(restSnapshot(ready)).toBeNull();
  });
});

it('does not label an existing over-cap clamp as negative reward credit after a real pickup', () => {
  const world = createWorld({ ...seed(), tokens: 1000000 });
  // Unit setup at an authored pickup, not a browser/debug teleport.
  const token = world.pickups.find(item => item.id === 'token-1')!;
  world.player.x = token.x; world.player.y = token.y;
  collectAndCheckpoint(world, world.save.elapsedMs);
  expect(world.save.tokens).toBe(1000012); expect(world.save.score).toBe(24);
  enterRest(world, 1);
  expect(world.save.tokens).toBe(1000000); // Existing cap policy is unchanged.
  expect(restSnapshot(world)!.rater.evaluation).toEqual({ verdict: 'approved', nominalTokens: 24, creditedTokens: 0 });
  expect(world.rest!.message).toContain('0 TOK'); expect(isGameSave(world.save)).toBe(true);
});
