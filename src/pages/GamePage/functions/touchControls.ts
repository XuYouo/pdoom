import { EMPTY_TOUCH_INPUT, type TouchControlState } from '../game/systems/touchInput';

export type TouchAction = 'jump' | 'fire' | 'dash' | 'rewind' | 'insight' | 'reroll' | 'revive';
export type TouchContact = { kind: 'move'; value: -1 | 0 | 1 } | { kind: 'aim'; direction: { x: number; y: number } | null } | { kind: TouchAction };
export type TouchControl = TouchContact['kind'];

/** Per-mounted control surface; contacts own their held state independently. */
export class TouchContacts {
  private contacts = new Map<string, TouchContact>();
  private previous: TouchControlState = { ...EMPTY_TOUCH_INPUT };
  constructor(private publish: (input: TouchControlState) => void) {}
  begin(owner: string, contact: TouchContact): boolean {
    if (this.contacts.has(owner)) return false;
    if ((contact.kind === 'move' || contact.kind === 'aim') && this.held(contact.kind)) return false;
    this.contacts.set(owner, contact); this.emit(); return true;
  }
  update(owner: string, contact: TouchContact) {
    if (this.contacts.get(owner)?.kind !== contact.kind) return;
    this.contacts.set(owner, contact); this.emit();
  }
  end(owner: string) { if (this.contacts.delete(owner)) this.emit(); }
  clear() { this.contacts.clear(); this.emit(); }
  held(kind: TouchControl) { return [...this.contacts.values()].some(contact => contact.kind === kind); }
  private emit() {
    const input: TouchControlState = { ...EMPTY_TOUCH_INPUT };
    for (const contact of this.contacts.values()) {
      if (contact.kind === 'move') input.move = contact.value;
      else if (contact.kind === 'aim') { input.fire = true; input.aimDirection = contact.direction && { ...contact.direction }; }
      else input[contact.kind] = true;
    }
    const previous = this.previous;
    if (input.move === previous.move && input.jump === previous.jump && input.fire === previous.fire && input.dash === previous.dash &&
      input.rewind === previous.rewind && input.insight === previous.insight && input.reroll === previous.reroll && input.revive === previous.revive &&
      input.aimDirection?.x === previous.aimDirection?.x && input.aimDirection?.y === previous.aimDirection?.y) return;
    this.previous = { ...input, aimDirection: input.aimDirection && { ...input.aimDirection } };
    this.publish(input);
  }
}

export interface TouchPadBounds { left: number; top: number; width: number; height: number }
export function touchPadPosition(kind: 'move' | 'aim', x: number, y: number, bounds: TouchPadBounds) {
  const dx = x - bounds.left - bounds.width / 2, dy = kind === 'move' ? 0 : y - bounds.top - bounds.height / 2;
  const distance = Math.hypot(dx, dy), radius = Math.min(bounds.width, bounds.height) * 0.3;
  const valid = Number.isFinite(distance) && bounds.width > 0 && bounds.height > 0;
  const scale = valid && distance > radius ? radius / distance : 1;
  const offset = valid ? { x: dx * scale, y: dy * scale } : { x: 0, y: 0 };
  const contact: TouchContact = kind === 'move'
    ? { kind, value: !valid || Math.abs(dx) <= bounds.width * 0.14 ? 0 : dx < 0 ? -1 : 1 }
    : { kind, direction: valid && distance > 12 ? { x: dx / distance, y: dy / distance } : null };
  return { contact, offset };
}
