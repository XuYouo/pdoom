import { describe, expect, it } from 'vitest';
import { PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';
import { addDoom, bossPhase, completeFirstChapter, createPlayer, damagePlayer, doomForm, incomingDamage, outgoingDamage, snapshotSave } from '../../src/pages/GamePage/game/systems/rules';
import { segmentHitsRect } from '../../src/pages/GamePage/game/systems/geometry';

describe('Doom and damage rules', () => {
  it('uses strictly greater-than 50/80 thresholds specified in the GDD', () => {
    expect([0.01, 50, 50.01, 80, 80.01, 99.99].map(doomForm)).toEqual(['aligned', 'aligned', 'masked', 'masked', 'foom', 'foom']);
  });
  it('clamps forbidden compute and retains two decimal places', () => {
    expect(addDoom(80, 28)).toBe(99.99);
    expect(addDoom(8, -200)).toBe(0.01);
    expect(addDoom(8, 28)).toBe(36);
  });
  it('trades output for incoming damage and grants high critical damage', () => {
    expect(outgoingDamage(90, false)).toBeGreaterThan(outgoingDamage(60, false));
    expect(outgoingDamage(60, false)).toBeGreaterThan(outgoingDamage(8, false));
    expect(outgoingDamage(8, true)).toBe(30);
    expect(incomingDamage(20, 8)).toBeLessThan(incomingDamage(20, 90));
  });
  it('immunity is type-specific, lasts exactly until its deadline, and health stays nonnegative', () => {
    const player = { ...createPlayer(0, 0, 0), invulnerableUntil: 0, immunity: { echo: 12000 } };
    expect(damagePlayer(player, 100, 20, 8, 11999, 'echo').hit).toBe(false);
    expect(damagePlayer(player, 100, 20, 8, 11999, 'caption').hit).toBe(true);
    expect(damagePlayer(player, 100, 20, 8, 12000, 'echo').hit).toBe(true);
    expect(damagePlayer(player, 1, 20, 8, 12000, 'echo').hp).toBe(0);
  });
  it('defines all three Gato phases', () => {
    expect([360, 241, 240, 121, 120, 1].map(hp => bossPhase(hp, 360))).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe('chapter-one save boundary', () => {
  it('advances to stage two without a final ending and preserves whole-game fields', () => {
    const input = { ...PREVIEW_SAVE, donated: true, seed: 29, inventory: ['constitutional' as const], upgrades: ['calibrated' as const], actionCounts: { shots: 12, dashes: 4, rewinds: 2, insights: 1 } };
    const clear = completeFirstChapter(input);
    expect(clear).toMatchObject({ stage: 2, checkpoint: 0, score: 1500, tokens: 75, donated: true, seed: 29, actionCounts: input.actionCounts });
    expect(clear.inventory).toEqual(input.inventory);
    expect(clear).not.toHaveProperty('ending');
    expect(input.stage).toBe(1);
    expect(completeFirstChapter(clear)).toEqual(clear);
  });
  it('clones nested DTO arrays and counters instead of exposing mutable runtime objects', () => {
    const source = { ...PREVIEW_SAVE, elapsedMs: 1234.9, inventory: ['constitutional' as const] };
    const copy = snapshotSave(source);
    copy.inventory.push('recursive'); copy.actionCounts.shots = 9;
    expect(source.inventory).toEqual(['constitutional']);
    expect(source.actionCounts.shots).toBe(0);
    expect(copy.elapsedMs).toBe(1234);
  });
});

describe('swept collision', () => {
  const thin = { x: 50, y: -5, w: 2, h: 10 };
  it('detects a projectile crossing a thin target between samples', () => {
    expect(segmentHitsRect({ x: 0, y: 0 }, { x: 100, y: 0 }, thin)).toBe(true);
    expect(segmentHitsRect({ x: 0, y: 30 }, { x: 100, y: 30 }, thin)).toBe(false);
  });
  it('handles zero-length, vertical and radius-expanded segments', () => {
    expect(segmentHitsRect({ x: 51, y: 0 }, { x: 51, y: 0 }, thin)).toBe(true);
    expect(segmentHitsRect({ x: 51, y: -30 }, { x: 51, y: 30 }, thin)).toBe(true);
    expect(segmentHitsRect({ x: 0, y: 8 }, { x: 100, y: 8 }, thin, 4)).toBe(true);
  });
});
