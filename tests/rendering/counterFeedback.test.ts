import { describe, expect, it, vi } from 'vitest';
import { counterFeedbackFrame } from '../../src/pages/GamePage/game/systems/counterFeedback';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { absorbAttack } from '../../src/pages/GamePage/game/systems/rewind';
import { firePlayer } from '../../src/pages/GamePage/game/systems/combat';
import { TUNING } from '../../src/pages/GamePage/game/data/tuning';
import { EMPTY_INPUT, type BulletKind, type WorldState } from '../../src/pages/GamePage/game/entities/model';
const view = { x: 0, y: 0, w: 640, h: 360 };
function world() {
  const w = createWorld({ ...createRun('counter-unit', 42), elapsedMs: 1000 });
  w.player.x = 100.4; w.player.y = 300.6; return w;
}
function rewarded() { const w = world(); w.player = absorbAttack(w.player, 'dictionary', w.save.elapsedMs); return w; }
// Pure Core/projection tests and interface doubles, not a claim of native input or WebGL pixels.
describe('earned counter reward projection', () => {
  it('does not manufacture a reward from old counters, a notice or an empty rewind', () => {
    const w = world(); w.save.actionCounts.rewinds = 90; w.events.push({ type: 'notice', message: '梯度更新 +2' });
    w.rewind = { path: [...w.history], startedAt: 1000, durationMs: 600 };
    expect(counterFeedbackFrame(w, view)).toBeNull();
  });
  it('projects the actual dictionary absorption without mutating Core', () => {
    const w = rewarded(), before = JSON.stringify(w);
    Object.freeze(w.player.immunity); Object.freeze(w.player); Object.freeze(w.save); Object.freeze(w);
    const first = counterFeedbackFrame(w, view);
    expect(first).toEqual({ x: 100, y: 262, immunityTicks: 10, charges: 2 });
    expect(counterFeedbackFrame(w, view)).toEqual(first); expect(counterFeedbackFrame(w, view)).not.toBe(first);
    expect(JSON.stringify(w)).toBe(before);
  });
  it.each([[0, 10], [1, 10], [999, 10], [1000, 9], [1999, 9], [2000, 8], [9999, 1], [10000, 0]])('Core +%sms gives %s remaining ticks', (elapsed, ticks) => {
    const w = rewarded(); w.save.elapsedMs += elapsed;
    expect(counterFeedbackFrame(w, view)).toMatchObject({ immunityTicks: ticks, charges: 2 });
  });
  it('shares TUNING expiry and refreshes only when real absorbAttack refreshes it', () => {
    const w = rewarded(); w.save.elapsedMs += 4500;
    expect(counterFeedbackFrame(w, view)?.immunityTicks).toBe(6);
    w.player = absorbAttack(w.player, 'dictionary', w.save.elapsedMs);
    expect(w.player.immunity.dictionary).toBe(w.save.elapsedMs + TUNING.immunityMs);
    expect(counterFeedbackFrame(w, view)).toMatchObject({ immunityTicks: 10, charges: 4 });
    w.player = absorbAttack(w.player, 'dictionary', w.save.elapsedMs); w.player = absorbAttack(w.player, 'dictionary', w.save.elapsedMs);
    expect(counterFeedbackFrame(w, view)?.charges).toBe(6);
  });
  it.each(['echo', 'caption', 'impact', 'dialogue', 'knife', 'gpu', 'causal', 'void', 'mirror'] as BulletKind[])('%s earns real charges, never a false dictionary shield', kind => {
    const w = world(); w.player = absorbAttack(w.player, kind, 1000);
    expect(counterFeedbackFrame(w, view)).toMatchObject({ immunityTicks: 0, charges: 2 });
  });
  it('spends one displayed point only for each emitted real critical shot', () => {
    const w = rewarded(), fire = { ...EMPTY_INPUT, fire: true };
    firePlayer(w, fire, 1000); expect(w.bullets[0].critical).toBe(true);
    expect(counterFeedbackFrame(w, view)?.charges).toBe(1);
    firePlayer(w, fire, 1001); expect(w.bullets).toHaveLength(1); expect(counterFeedbackFrame(w, view)?.charges).toBe(1);
    firePlayer(w, fire, 1000 + TUNING.fireIntervalMs); expect(w.bullets[1].critical).toBe(true);
    expect(counterFeedbackFrame(w, view)?.charges).toBe(0);
    w.save.elapsedMs = 1000 + TUNING.immunityMs; expect(counterFeedbackFrame(w, view)).toBeNull();
  });
  it('a real harmless Lisp emission does not pretend to spend a charge', () => {
    const w = rewarded(); w.save.inventory = ['constitutional', 'recursive', 'residual']; w.save.actionCounts.shots = 3;
    firePlayer(w, { ...EMPTY_INPUT, fire: true }, 1000);
    expect(w.bullets).toHaveLength(3); expect(w.bullets.every(b => b.harmless && !b.critical && b.damage === 0)).toBe(true);
    expect(w.save.actionCounts.shots).toBe(4); expect(counterFeedbackFrame(w, view)?.charges).toBe(2);
  });
  it.each(['playing', 'rest', 'cleared', 'finished'] as WorldState['mode'][])('%s frozen Core retains exactly the same view', mode => {
    const w = rewarded(), first = counterFeedbackFrame(w, view); w.mode = mode;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(9e12);
    try { expect(counterFeedbackFrame(w, view)).toEqual(first); expect(clock).not.toHaveBeenCalled(); } finally { clock.mockRestore(); }
  });
  it.each(['ready', 'dead', 'unavailable'] as WorldState['mode'][])('%s clears an old reward instead of leaving a ghost', mode => {
    const w = rewarded(); w.mode = mode; expect(counterFeedbackFrame(w, view)).toBeNull();
  });
  it('dead HP clears a reward and restore/new world cannot reconstruct it from a save', () => {
    const w = rewarded(); expect(counterFeedbackFrame(createWorld(w.save), view)).toBeNull();
    w.save.hp = 0; expect(counterFeedbackFrame(w, view)).toBeNull();
  });
  it.each([[0, 15], [640, 625], [100.49, 100], [100.5, 101]])('x%s uses native raster/safe inset %s', (x, projected) => {
    const w = rewarded(); w.player.x = x; expect(counterFeedbackFrame(w, view)?.x).toBe(projected);
  });
  it('uses the actual camera and flips below a ceiling actor without another clock', () => {
    const w = rewarded(); w.player.x = 700; w.player.y = 405;
    expect(counterFeedbackFrame(w, { x: 640, y: 400, w: 640, h: 360 })).toMatchObject({ x: 700, y: 426 });
  });
  it.each([[-13, 200], [653, 200], [100, -13], [100, 373]])('culls truly offscreen actor %j', (x, y) => {
    const w = rewarded(); w.player.x = x; w.player.y = y; expect(counterFeedbackFrame(w, view)).toBeNull();
  });
  it.each([NaN, Infinity, -Infinity])('rejects invalid actor coordinate %s', invalid => {
    const w = rewarded(); w.player.x = invalid; expect(counterFeedbackFrame(w, view)).toBeNull();
  });
  it('rejects invalid viewport instead of drawing a detached UI mark', () => {
    const w = rewarded(); expect(counterFeedbackFrame(w, { ...view, w: 10 })).toBeNull();
    expect(counterFeedbackFrame(w, { ...view, h: 10 })).toBeNull(); expect(counterFeedbackFrame(w, { ...view, x: NaN })).toBeNull();
  });
  it('invalid rewards do not create an infinite immunity indicator', () => {
    const w = world(); w.player.immunity.dictionary = Infinity; w.player.criticalCharges = NaN;
    expect(counterFeedbackFrame(w, view)).toBeNull();
  });
});
