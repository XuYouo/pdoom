import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { CoopInputBuffer, parseCoopInput } from '../../src/pages/GamePage/network/CoopInputBuffer';

describe('remote co-op inputs', () => {
  it('retains a complete press/release between host ticks exactly once', () => {
    const buffer = new CoopInputBuffer();
    buffer.push({ ...EMPTY_INPUT, reviveHeld: false, jumpPressed: true, fire: true }, 20);
    buffer.push({ ...EMPTY_INPUT, reviveHeld: false, move: 1 }, 25);
    expect(buffer.consume(30)).toMatchObject({ jumpPressed: true, fire: true, move: 1 });
    expect(buffer.consume(46)).toMatchObject({ jumpPressed: false, fire: false, move: 1 });
  });
  it('drops all held actions on stale input and on disconnect/pause', () => {
    const buffer = new CoopInputBuffer();
    buffer.push({ ...EMPTY_INPUT, reviveHeld: true, move: 1, fire: true }, 20);
    expect(buffer.consume(271)).toMatchObject({ move: 0, fire: false, reviveHeld: false });
    buffer.push({ ...EMPTY_INPUT, reviveHeld: true, dashPressed: true }, 300); buffer.clear();
    expect(buffer.consume(310)).toMatchObject({ dashPressed: false, reviveHeld: false });
  });
  it('rejects malformed, nonfinite and oversized coordinates instead of coercing them', () => {
    const valid = { ...EMPTY_INPUT, reviveHeld: false };
    expect(parseCoopInput(valid)).toEqual(valid);
    for (const patch of [{ move: '1' }, { jumpHeld: 1 }, { fire: undefined }, { aim: { x: Infinity, y: 0 } }, { aim: { x: 0, y: 1_000_001 } }]) {
      expect(parseCoopInput({ ...valid, ...patch })).toBeNull();
    }
  });
  it.each([
    { omitted: ['rerollPressed'] }, { omitted: ['reviveHeld'] }, { omitted: ['rerollPressed', 'reviveHeld'] },
  ])('defaults omitted protocol controls $omitted to false', ({ omitted }) => {
    const payload: Record<string, unknown> = { ...EMPTY_INPUT, reviveHeld: false };
    for (const key of omitted) delete payload[key];
    expect(parseCoopInput(payload)).toEqual({ ...EMPTY_INPUT, reviveHeld: false });
  });
  it.each(['rerollPressed', 'reviveHeld'])('preserves boolean %s and rejects explicit non-booleans', key => {
    const valid = { ...EMPTY_INPUT, reviveHeld: false };
    expect(parseCoopInput({ ...valid, [key]: true })).toEqual({ ...valid, [key]: true });
    for (const value of [undefined, null, 0, 1, 'false']) {
      expect(parseCoopInput({ ...valid, [key]: value })).toBeNull();
    }
  });
  it.each(['x', 'y'])('accepts the inclusive protocol aim.%s bounds and rejects values outside them', axis => {
    const valid = { ...EMPTY_INPUT, reviveHeld: false };
    for (const value of [-1_000_000, -500_000, 500_000, 1_000_000]) {
      const payload = { ...valid, aim: { x: 0, y: 0, [axis]: value } };
      expect(parseCoopInput(payload)).toEqual(payload);
    }
    for (const value of [-1_000_001, 1_000_001, NaN, Infinity, -Infinity]) {
      expect(parseCoopInput({ ...valid, aim: { x: 0, y: 0, [axis]: value } })).toBeNull();
    }
  });
  it('requires every mandatory field and rejects unknown input or aim fields', () => {
    const valid = { ...EMPTY_INPUT, reviveHeld: false };
    for (const key of ['move', 'jumpPressed', 'jumpHeld', 'dashPressed', 'fire', 'aim', 'rewindPressed', 'insightPressed']) {
      const payload: Record<string, unknown> = { ...valid }; delete payload[key];
      expect(parseCoopInput(payload)).toBeNull();
    }
    expect(parseCoopInput({ ...valid, slot: 0 })).toBeNull();
    for (const aim of [{ x: 0 }, { y: 0 }, { x: 0, y: 0, z: 0 }, [0, 0], { x: '0', y: 0 }]) {
      expect(parseCoopInput({ ...valid, aim })).toBeNull();
    }
  });
});
