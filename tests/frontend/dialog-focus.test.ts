import type { KeyboardEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepDialogFocus } from '../../src/components/ui/dialogFocus';

class Control {
  tabIndex = 0; disabled = false; hidden = false; visible = true; visibility = 'visible';
  radio = false; checked = false; name = ''; form = null;
  focus = vi.fn(() => { this.dialog.ownerDocument.activeElement = this; });
  constructor(public dialog: TestDialog) {}
  closest(selector: string) { return selector === 'dialog' ? this.dialog : this.hidden ? this : null; }
  matches(selector: string) { return selector === ':disabled' ? this.disabled : this.radio; }
  getAttribute(name: string) { return name === 'name' ? this.name : null; }
  getClientRects() { return this.visible ? [{}] : []; }
}
class TestDialog {
  controls: Control[] = [];
  ownerDocument: { activeElement: Control | null } = { activeElement: null };
  focus = vi.fn();
  querySelectorAll() { return this.controls; }
}
function setup() {
  vi.stubGlobal('HTMLElement', Control);
  vi.stubGlobal('getComputedStyle', (node: Control) => ({ visibility: node.visibility }));
  const dialog = new TestDialog();
  const add = (patch: Partial<Control> = {}) => { const node = Object.assign(new Control(dialog), patch); dialog.controls.push(node); return node; };
  const press = (target: Control, shiftKey = false, key = 'Tab', defaultPrevented = false) => {
    dialog.ownerDocument.activeElement = target;
    const event = { target, currentTarget: dialog, shiftKey, key, defaultPrevented, preventDefault: vi.fn() };
    keepDialogFocus(event as unknown as KeyboardEvent<HTMLDialogElement>); return event;
  };
  return { dialog, add, press };
}
afterEach(() => vi.unstubAllGlobals());

describe('native modal keyboard boundary', () => {
  it('wraps both outer boundaries while leaving interior traversal native', () => {
    const h = setup(), first = h.add(), middle = h.add(), last = h.add();
    expect(h.press(last).preventDefault).toHaveBeenCalledOnce(); expect(first.focus).toHaveBeenCalledOnce();
    expect(h.press(first, true).preventDefault).toHaveBeenCalledOnce(); expect(last.focus).toHaveBeenCalledOnce();
    expect(h.press(middle).preventDefault).not.toHaveBeenCalled();
  });
  it('does not intercept a nested native dialog or a loop already handled by a child', () => {
    const h = setup(), parent = h.add(), child = new Control(new TestDialog());
    expect(h.press(child).preventDefault).not.toHaveBeenCalled();
    expect(h.press(parent, false, 'Tab', true).preventDefault).not.toHaveBeenCalled();
    expect(parent.focus).not.toHaveBeenCalled();
  });
  it('excludes disabled, inert or hidden controls and closed disclosure contents', () => {
    const h = setup(), first = h.add();
    h.add({ disabled: true }); h.add({ hidden: true }); h.add({ visible: false }); h.add({ visibility: 'hidden' }); h.add({ tabIndex: -1 });
    expect(h.press(first).preventDefault).toHaveBeenCalledOnce(); expect(first.focus).toHaveBeenCalledOnce();
    expect(h.dialog.controls.slice(1).every(node => node.focus.mock.calls.length === 0)).toBe(true);
  });
  it('treats a radio group as its selected Tab stop and leaves arrow keys native', () => {
    const h = setup(), first = h.add();
    const selected = h.add({ radio: true, name: 'motion', checked: true });
    const alternate = h.add({ radio: true, name: 'motion' });
    h.press(first, true); expect(selected.focus).toHaveBeenCalledOnce(); expect(alternate.focus).not.toHaveBeenCalled();
    expect(h.press(selected, false, 'ArrowDown').preventDefault).not.toHaveBeenCalled();
  });
  it('uses the first eligible option when an optional radio group has no selection', () => {
    const h = setup(), first = h.add(), radio = h.add({ radio: true, name: 'optional' });
    h.add({ radio: true, name: 'optional' }); h.press(first, true); expect(radio.focus).toHaveBeenCalledOnce();
  });
  it('respects positive tabindex order at the modal boundary', () => {
    const h = setup(), ordinary = h.add(), second = h.add({ tabIndex: 2 }), first = h.add({ tabIndex: 1 });
    h.press(ordinary); expect(first.focus).toHaveBeenCalledOnce();
    h.press(first, true); expect(ordinary.focus).toHaveBeenCalledOnce(); expect(second.focus).not.toHaveBeenCalled();
  });
});
