import { describe, expect, it } from 'vitest';
import { TouchContacts, touchPadPosition } from '../../src/pages/GamePage/functions/touchControls';
import { EMPTY_TOUCH_INPUT, type TouchControlState } from '../../src/pages/GamePage/game/systems/touchInput';

function setup() {
  const events: TouchControlState[] = [];
  return { events, contacts: new TouchContacts(input => events.push(input)), latest: () => events.at(-1)! };
}
describe('independent touch contacts produce complete input snapshots', () => {
  it('keeps movement, aimed fire and jumping concurrent, then releases only the matching owner', () => {
    const h = setup();
    h.contacts.begin('pointer:1', { kind: 'move', value: 1 });
    h.contacts.begin('pointer:2', { kind: 'aim', direction: { x: 0, y: -1 } });
    h.contacts.begin('pointer:3', { kind: 'jump' });
    expect(h.latest()).toEqual({ ...EMPTY_TOUCH_INPUT, move: 1, fire: true, jump: true, aimDirection: { x: 0, y: -1 } });
    h.contacts.end('pointer:3'); expect(h.latest()).toMatchObject({ move: 1, fire: true, jump: false });
    h.contacts.end('pointer:1'); expect(h.latest()).toMatchObject({ move: 0, fire: true });
    h.contacts.end('pointer:2'); expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT);
  });
  it('rejects a second owner for a pad and a contact attempting to change its owned action', () => {
    const h = setup(); h.contacts.begin('pointer:1', { kind: 'move', value: -1 });
    expect(h.contacts.begin('pointer:2', { kind: 'move', value: 1 })).toBe(false);
    expect(h.contacts.begin('pointer:1', { kind: 'dash' })).toBe(false);
    h.contacts.update('pointer:2', { kind: 'move', value: 1 }); h.contacts.update('pointer:1', { kind: 'aim', direction: null });
    expect(h.latest()).toEqual({ ...EMPTY_TOUCH_INPUT, move: -1 }); expect(h.events).toHaveLength(1);
  });
  it('keeps a shared action held until both touching fingers have released', () => {
    const h = setup(); h.contacts.begin('first', { kind: 'revive' }); h.contacts.begin('second', { kind: 'revive' });
    h.contacts.end('first'); expect(h.latest().revive).toBe(true); expect(h.events).toHaveLength(1);
    h.contacts.end('second'); expect(h.latest().revive).toBe(false);
  });
  it('publishes an explicit neutral state once when all contacts are cancelled', () => {
    const h = setup(); h.contacts.begin('a', { kind: 'move', value: 1 }); h.contacts.begin('b', { kind: 'aim', direction: null });
    h.contacts.clear(); expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT);
    const count = h.events.length; h.contacts.end('a'); h.contacts.end('b'); h.contacts.clear(); expect(h.events).toHaveLength(count);
  });
  it('preserves quick action down/up edges and does not suppress a later fresh press', () => {
    const h = setup(); h.contacts.begin('finger', { kind: 'rewind' }); h.contacts.end('finger');
    h.contacts.begin('finger', { kind: 'rewind' }); h.contacts.end('finger');
    expect(h.events.map(input => input.rewind)).toEqual([true, false, true, false]);
  });
  it('suppresses unchanged pad emissions without losing a change of aim direction', () => {
    const h = setup(); h.contacts.begin('finger', { kind: 'aim', direction: null });
    h.contacts.update('finger', { kind: 'aim', direction: null }); expect(h.events).toHaveLength(1);
    h.contacts.update('finger', { kind: 'aim', direction: { x: 1, y: 0 } });
    h.contacts.update('finger', { kind: 'aim', direction: { x: 1, y: 0 } }); expect(h.events).toHaveLength(2);
    h.contacts.update('finger', { kind: 'aim', direction: null }); expect(h.latest()).toMatchObject({ fire: true, aimDirection: null });
  });
  it('does not let a consumer mutate the controller’s comparison snapshot', () => {
    const h = setup(); h.contacts.begin('finger', { kind: 'aim', direction: { x: 1, y: 0 } });
    h.latest().aimDirection!.x = -1;
    h.contacts.update('finger', { kind: 'aim', direction: { x: -1, y: 0 } }); expect(h.events).toHaveLength(2);
  });
});

describe('touch pad geometry is bounded and independent of the canvas camera', () => {
  const bounds = { left: 20, top: 30, width: 100, height: 100 };
  it('has a neutral center and inclusive movement deadzone, with reversible direction', () => {
    expect(touchPadPosition('move', 70, 80, bounds).contact).toEqual({ kind: 'move', value: 0 });
    expect(touchPadPosition('move', 84, 10, bounds).contact).toEqual({ kind: 'move', value: 0 });
    expect(touchPadPosition('move', 85, 10, bounds).contact).toEqual({ kind: 'move', value: 1 });
    expect(touchPadPosition('move', 55, 10, bounds).contact).toEqual({ kind: 'move', value: -1 });
  });
  it('keeps facing aim inside the deadzone and normalizes diagonal screen-space aim outside', () => {
    expect(touchPadPosition('aim', 82, 80, bounds).contact).toEqual({ kind: 'aim', direction: null });
    const result = touchPadPosition('aim', 100, 120, bounds);
    expect(result.contact).toEqual({ kind: 'aim', direction: { x: 0.6, y: 0.8 } });
    expect(Math.hypot(result.offset.x, result.offset.y)).toBeCloseTo(30);
  });
  it('clamps the thumb visual even when captured movement is far outside the pad', () => {
    const result = touchPadPosition('move', -1000, 80, bounds);
    expect(result.offset).toEqual({ x: -30, y: 0 }); expect(result.contact).toEqual({ kind: 'move', value: -1 });
  });
  it('keeps malformed or zero-size geometry neutral', () => {
    expect(touchPadPosition('aim', NaN, 0, bounds).contact).toEqual({ kind: 'aim', direction: null });
    expect(touchPadPosition('move', 100, 0, { ...bounds, width: 0 }).contact).toEqual({ kind: 'move', value: 0 });
  });
});
