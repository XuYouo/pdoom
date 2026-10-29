import { describe, expect, it } from 'vitest';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';
import { decodeCheckpoint } from '../../src/pages/GamePage/game/data/checkpoints';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { applyProgressionCommand, hackEligible, restSnapshot, shopOffers, transactShop } from '../../src/pages/GamePage/game/systems/shop';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { isGameSave } from '../../src/pages/GamePage/functions/saveModel';

const restSave = (): GameSaveData => ({ ...PREVIEW_SAVE, runId: 'c4f98977-a2f8-4012-8c3a-e47e955473b2', checkpoint: 11, hp: 60, tokens: 200, doom: 60, inventory: ['constitutional', 'recursive', 'residual'], actionCounts: { shots: 20, dashes: 3, rewinds: 1, insights: 0 } });
function buy(save: GameSaveData, id: string, hack = false) {
  const result = transactShop(save, id, hack);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.save;
}

describe('schema-one checkpoint semantics and rest freeze', () => {
  it.each([0, 1, 2])('preserves legacy closed checkpoint %s', checkpoint => {
    const world = createWorld({ ...restSave(), checkpoint });
    expect(world.mode).toBe('playing');
    expect(decodeCheckpoint(checkpoint)).toMatchObject({ room: checkpoint, resting: false, hackUsed: false });
  });
  it.each([11, 12, 21, 22])('restores encoded checkpoint %s without awarding tokens again', checkpoint => {
    const original = { ...restSave(), checkpoint };
    const world = createWorld(original);
    expect(world.mode).toBe('rest');
    expect(world.player.x).toBe(checkpoint % 10 === 1 ? 1380 : 2180);
    expect(world.save.tokens).toBe(original.tokens);
    expect(restSnapshot(world)!.hackUsed).toBe(checkpoint > 20);
    expect(world.enemies.every(enemy => enemy.x > world.player.x)).toBe(true);
    expect(stepWorld(world, { ...EMPTY_INPUT, fire: true, move: 1, rewindPressed: true }, 5000)).toBe(world);
    expect(isGameSave(world.save)).toBe(true);
  });
  it('awards once on entry, saves the marker and remains unchanged over repeated reloads', () => {
    const world = createWorld({ ...restSave(), checkpoint: 0, tokens: 0 });
    world.player.x = 1382;
    const entered = stepWorld(world, EMPTY_INPUT);
    expect(entered.mode).toBe('rest'); expect(entered.save.checkpoint).toBe(11);
    expect(entered.save.tokens).toBeGreaterThan(0);
    const value = entered.save.tokens;
    let reloaded = entered;
    Array.from({ length: 10 }).forEach(() => { reloaded = createWorld(reloaded.save); });
    expect(reloaded.save.tokens).toBe(value);
    expect(reloaded.save.score).toBe(entered.save.score);
    expect(entered.events.find(event => event.type === 'checkpoint')).toMatchObject({ save: { checkpoint: 11, tokens: value } });
  });
  it('can skip every transaction, cannot re-enter the closed room, and reaches the next one', () => {
    const resting = createWorld(restSave());
    const continued = applyProgressionCommand(resting, { type: 'rest-continue' });
    expect(continued.save.checkpoint).toBe(1); expect(continued.mode).toBe('playing');
    expect(continued.save.tokens).toBe(resting.save.tokens);
    const reloaded = createWorld(continued.save);
    expect(stepWorld(reloaded, EMPTY_INPUT).mode).toBe('playing');
    expect(transactShop(reloaded.save, 'relic:temperature').ok).toBe(false);
    reloaded.player.x = 2182;
    const second = stepWorld(reloaded, EMPTY_INPUT);
    expect(second.save.checkpoint).toBe(12); expect(second.mode).toBe('rest');
  });
  it('unknown checkpoint encodings are preserved and refused rather than guessed', () => {
    const world = createWorld({ ...restSave(), checkpoint: 99 });
    expect(world.mode).toBe('unavailable'); expect(world.save.checkpoint).toBe(99);
  });
});

describe('transaction atomicity, ownership and reward hacking', () => {
  it('pays for real inventory/upgrade effects once and rejects duplicate retries', () => {
    const source = restSave();
    const relic = buy(source, 'relic:temperature');
    expect(relic.tokens).toBe(170); expect(relic.inventory.at(-1)).toBe('temperature');
    expect(transactShop(relic, 'relic:temperature').ok).toBe(false);
    const upgrade = buy(relic, 'upgrade:reinforced');
    expect(upgrade.tokens).toBe(138); expect(upgrade.upgrades).toContain('reinforced');
    expect(transactShop(upgrade, 'upgrade:reinforced').ok).toBe(false);
    expect(source.inventory).not.toContain('temperature');
    expect(Object.keys(upgrade).sort()).toEqual(Object.keys(source).sort());
    expect(isGameSave(upgrade)).toBe(true);
  });
  it('repair cannot exceed 100 and donation is charged/recorded only once', () => {
    const repaired = buy({ ...restSave(), hp: 90 }, 'repair');
    expect(repaired.hp).toBe(100); expect(repaired.tokens).toBe(188);
    expect(transactShop(repaired, 'repair').ok).toBe(false);
    const donated = buy(repaired, 'donation');
    expect(donated.donated).toBe(true); expect(donated.tokens).toBe(168);
    expect(transactShop(donated, 'donation').ok).toBe(false);
    expect(transactShop(donated, 'donation', true).ok).toBe(false);
  });
  it('requires actual funds and rejects unknown offers without mutating the save', () => {
    const source = { ...restSave(), tokens: 0 };
    const before = JSON.stringify(source);
    expect(transactShop(source, 'upgrade:overclocked').ok).toBe(false);
    expect(transactShop(source, 'unknown').ok).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
  });
  it('checks strict Doom >50 plus density and one hack per room across reloads', () => {
    expect(hackEligible({ ...restSave(), doom: 50 })).toBe(false);
    expect(hackEligible({ ...restSave(), inventory: [] })).toBe(false);
    const hacked = buy(restSave(), 'upgrade:calibrated', true);
    expect(hacked).toMatchObject({ checkpoint: 21, doom: 85, tokens: 200 });
    expect(hacked.upgrades).toContain('calibrated');
    const reloaded = createWorld(hacked);
    expect(transactShop(reloaded.save, 'relic:temperature', true).ok).toBe(false);
    expect(restSnapshot(reloaded)!.offers.every(offer => !offer.canHack)).toBe(true);
    const closed = applyProgressionCommand(reloaded, { type: 'rest-continue' });
    expect(closed.save.checkpoint).toBe(1);
    expect(transactShop(closed.save, 'relic:temperature', true).ok).toBe(false);
  });
  it('prevents redundant expansion purchases and excludes repair/donation from free hacks', () => {
    const expanded = buy(restSave(), 'upgrade:expanded');
    expect(transactShop(expanded, 'relic:context-expansion').ok).toBe(false);
    expect(shopOffers(expanded).find(offer => offer.id === 'relic:context-expansion')?.reason).toContain('不叠加');
    expect(transactShop(restSave(), 'repair', true).ok).toBe(false);
    expect(transactShop(restSave(), 'donation', true).ok).toBe(false);
  });
  it('saves purchase and reorder snapshots before updating the UI, without adding DTO fields', () => {
    const original = createWorld(restSave());
    const purchased = applyProgressionCommand(original, { type: 'shop-buy', offerId: 'relic:temperature' });
    expect(purchased.events.map(event => event.type)).toEqual(['checkpoint', 'context-changed', 'rest-updated']);
    expect(original.save.inventory).not.toContain('temperature');
    const reordered = applyProgressionCommand(purchased, { type: 'context-reorder', from: 1, to: 0 });
    expect(createWorld(reordered.save).save.inventory).toEqual(reordered.save.inventory);
    expect(isGameSave(reordered.save)).toBe(true);
    const continued = applyProgressionCommand(reordered, { type: 'rest-continue' });
    expect(applyProgressionCommand(continued, { type: 'context-reorder', from: 0, to: 1 }).save).toBe(continued.save);
  });
});
