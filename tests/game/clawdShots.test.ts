import { describe, expect, it } from 'vitest';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { TUNING } from '../../src/pages/GamePage/game/data/tuning';
import { EMPTY_INPUT, type Bullet } from '../../src/pages/GamePage/game/entities/model';
import { firePlayer } from '../../src/pages/GamePage/game/systems/combat';
import { advanceMirror, cloneMirror } from '../../src/pages/GamePage/game/systems/mirror';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { createPlayer } from '../../src/pages/GamePage/game/systems/rules';
const save = () => createRun('8a40b11b-007a-4aa3-9e14-6f1f08825d01', 42);
const world = () => createWorld(save());
const fire = { ...EMPTY_INPUT, fire: true };
const bullet = (id: number): Bullet => ({ id, x: 400, y: 100, vx: 100, vy: 0, radius: 3, damage: 1, faction: 'player', kind: 'dictionary', expiresAt: 100000 });
function freeze<T>(v: T): T { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(freeze); } return v; }
function duel() {
  const w = createWorld({ ...save(), stage: 5, checkpoint: 2 });
  w.player = { ...w.player, x: 2700, y: 309, grounded: true, standingOn: 'omega-floor-2', invulnerableUntil: 0 };
  w.boss.active = true; w.omega!.phase = 'duel';
  Object.assign(w.omega!.mirror, { state: 'execute', action: 'shots', until: 100000, plan: ['shots'], index: 0 });
  w.omega!.mirror.actor.shotReadyAt = 0; return w;
}
describe('actual successful emission receipt, not a saved counter or input guess', () => {
  it('starts nullable, including fresh actors at late simulation time', () => {
    expect(createPlayer(0, 0, 999999).lastFiredAt).toBeNull(); expect(world().player.lastFiredAt).toBeNull();
  });
  it.each([0, 1000, 1000000])('restored saves with historical counts at%i never fabricate an emission', elapsedMs => {
    const s = save(); s.elapsedMs = elapsedMs; s.actionCounts.shots = 999; const w = createWorld(s);
    expect(w.player.lastFiredAt).toBeNull(); expect(w.bullets).toHaveLength(0); expect(w.save.actionCounts.shots).toBe(999);
    const omega = createWorld({ ...s, stage: 5, checkpoint: 2 }); expect(omega.omega!.mirror.actor.lastFiredAt).toBeNull();
  });
  it('records once after actual bullet creation at the unchanged body origin', () => {
    const w = world(), p = w.player; p.criticalCharges = 1; firePlayer(w, fire, 500);
    expect(w.player.lastFiredAt).toBe(500); expect(p.lastFiredAt).toBeNull(); expect(w.bullets).toHaveLength(1);
    expect(w.bullets[0]).toMatchObject({ x: p.x, y: p.y - 3, faction: 'player', critical: true, expiresAt: 2000 });
    expect(w.save.actionCounts.shots).toBe(1); expect(w.player.criticalCharges).toBe(0);
    expect(w.player.shotReadyAt).toBeGreaterThan(500); expect(isGameSave(w.save)).toBe(true);
    expect(JSON.stringify(w.save)).not.toContain('lastFiredAt'); expect(JSON.stringify(w.history)).not.toContain('lastFiredAt');
  });
  it('uses the actual caller simulation time, not wall time or a previous cooldown', () => {
    const w = world(); w.player.shotReadyAt = 123; firePlayer(w, fire, 777);
    expect(w.player.lastFiredAt).toBe(777); firePlayer(w, EMPTY_INPUT, 999); expect(w.player.lastFiredAt).toBe(777);
  });
  it.each(['ready', 'rest', 'dead', 'cleared', 'finished', 'unavailable'] as const)('non-playing %s never emits or updates a receipt', mode => {
    const w = world(); w.mode = mode; w.player.lastFiredAt = 50; const before = JSON.stringify(w); firePlayer(w, fire, 500);
    expect(JSON.stringify(w)).toBe(before); expect(stepWorld(w, fire)).toBe(w);
  });
  it.each(['released', 'cooldown', 'petrified', 'rewind', 'full'])('rejected %s keeps the old receipt and counts unchanged', blocked => {
    const w = world(); w.player.lastFiredAt = 50;
    if (blocked === 'cooldown') w.player.shotReadyAt = 501;
    if (blocked === 'petrified') w.player.petrifiedUntil = 501;
    if (blocked === 'rewind') w.rewind = { path: [...w.history], startedAt: 400, durationMs: 1000 };
    if (blocked === 'full') w.bullets = Array.from({ length: TUNING.maxBullets }, (_, i) => bullet(i + 1));
    const before = JSON.stringify(w); firePlayer(w, blocked === 'released' ? EMPTY_INPUT : fire, 500); expect(JSON.stringify(w)).toBe(before);
  });
  it.each([1, 2, 3])('actual harmless hallucination volley with%i free slots still emits once', free => {
    const w = createWorld({ ...save(), inventory: ['constitutional', 'recursive', 'residual'] }); w.save.actionCounts.shots = 3; w.player.criticalCharges = 2;
    w.bullets = Array.from({ length: TUNING.maxBullets - free }, (_, i) => bullet(i + 1)); const before = w.bullets.length;
    firePlayer(w, fire, 500); expect(w.bullets.slice(before)).toHaveLength(free);
    expect(w.bullets.slice(before).every(b => b.harmless && b.damage === 0)).toBe(true); expect(w.player.lastFiredAt).toBe(500);
    expect(w.save.actionCounts.shots).toBe(4); expect(w.player.criticalCharges).toBe(2);
  });
  it('fixed ticks own receipts and cannot mutate frozen prior snapshots', () => {
    let w = world(); const first = JSON.stringify(w); freeze(w); const next = stepWorld(w, fire);
    expect(JSON.stringify(w)).toBe(first); expect(next.player).not.toBe(w.player); expect(next.player.lastFiredAt).toBe(TUNING.stepMs);
    w = next; let emitted = 1;
    for (let n = 0; n < 120; n++) {
      const before = w, bytes = JSON.stringify(before); freeze(before); w = stepWorld(before, fire);
      expect(JSON.stringify(before)).toBe(bytes);
      if (w.save.actionCounts.shots > before.save.actionCounts.shots) { emitted++; expect(w.player.lastFiredAt).toBe(w.save.elapsedMs); }
      else expect(w.player.lastFiredAt).toBe(before.player.lastFiredAt);
    }
    expect(emitted).toBeGreaterThan(2); expect(w.save.actionCounts.shots).toBe(emitted);
  });
  it('zero tick/pause-like no advancement cannot manufacture a new shot and restoring clears the transient', () => {
    const w = stepWorld(world(), fire), stamp = w.player.lastFiredAt;
    expect(stepWorld(w, fire, 0)).toBe(w); expect(w.player.lastFiredAt).toBe(stamp);
    const restored = createWorld(w.save); expect(restored.player.lastFiredAt).toBeNull(); expect(restored.save).toEqual({ ...w.save, elapsedMs: Math.floor(w.save.elapsedMs) }); expect(isGameSave(restored.save)).toBe(true);
  });
});
describe('mirror emission is its own actual runtime event', () => {
  it('records only the actual enemy projectile, not player shots or telegraphs', () => {
    const w = duel(), m = w.omega!.mirror; w.player.lastFiredAt = 450;
    const result = advanceMirror(w, 500); expect(result.bullets).toHaveLength(1); expect(m.actor.lastFiredAt).toBe(500);
    expect(result.bullets[0]).toMatchObject({ faction: 'enemy', kind: 'mirror', x: m.actor.x, y: m.actor.y - 3 });
    expect(m.executed.shots).toBe(1); expect(w.player.lastFiredAt).toBe(450); expect(w.save.actionCounts.shots).toBe(0);
    expect(advanceMirror(w, 501).bullets).toHaveLength(0); expect(m.actor.lastFiredAt).toBe(500);
  });
  it.each(['tell', 'full', 'cooldown', 'not-duel', 'dead'])('denied mirror %s does not create a receipt', blocked => {
    const w = duel(), m = w.omega!.mirror;
    if (blocked === 'tell') m.state = 'tell';
    if (blocked === 'full') w.bullets = Array.from({ length: TUNING.maxBullets }, (_, i) => bullet(i + 1));
    if (blocked === 'cooldown') m.actor.shotReadyAt = 501;
    if (blocked === 'not-duel') w.omega!.phase = 'chamber';
    if (blocked === 'dead') w.boss.hp = 0;
    expect(advanceMirror(w, 500).bullets).toHaveLength(0); expect(m.actor.lastFiredAt).toBeNull(); expect(m.executed.shots).toBe(0);
  });
  it('visible harmless mirror emission also gets a genuine receipt', () => {
    const w = duel(), m = w.omega!.mirror; m.profile.hallucinationEvery = 1;
    const result = advanceMirror(w, 500); expect(result.bullets[0]).toMatchObject({ harmless: true, damage: 0 }); expect(m.actor.lastFiredAt).toBe(500);
  });
  it('cloning and the pure tick detach the mirror receipt from old snapshots', () => {
    const w = duel(), m = w.omega!.mirror, copy = cloneMirror(m); copy.actor.lastFiredAt = 500; expect(m.actor.lastFiredAt).toBeNull();
    const bytes = JSON.stringify(w); freeze(w); const next = stepWorld(w, EMPTY_INPUT);
    expect(JSON.stringify(w)).toBe(bytes); expect(next.omega!.mirror.actor.lastFiredAt).toBe(next.save.elapsedMs);
    expect(next.omega!.mirror.actor).not.toBe(m.actor); expect(next.save.actionCounts.shots).toBe(0);
  });
});
