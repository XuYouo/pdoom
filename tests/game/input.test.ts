import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { InputSystem } from '../../src/pages/GamePage/game/systems/InputSystem';

class ElementStub {
  isContentEditable = false;
  tagName = 'CANVAS';
  tabIndex = -1;
  dialog: ElementStub | null = null;
  closest(selector: string) { return selector === 'dialog' ? this.dialog : null; }
  setAttribute = vi.fn();
  focus = vi.fn();
}
class KeyStub {
  isDown = false;
  callback?: (_key: KeyStub, event: { target: ElementStub; preventDefault: () => void; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }) => void;
  on(_type: string, callback: KeyStub['callback']) { this.callback = callback; }
  reset() { this.isDown = false; }
  tap(target: ElementStub, modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) {
    const event = { target, ...modifiers, preventDefault: vi.fn() };
    this.isDown = true; this.callback?.(this, event);
    this.isDown = false; // emulate keyup arriving before poll/render
    return event;
  }
}
function setup() {
  const canvas = new ElementStub();
  const keys = new Map<number, KeyStub>();
  const removeKey = vi.fn();
  const removeEventListener = vi.fn();
  const pause = vi.fn();
  vi.stubGlobal('HTMLElement', ElementStub);
  vi.stubGlobal('document', { activeElement: canvas });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener });
  const camera = { scrollX: 1000, scrollY: 200 };
  const pointer = { x: 30, y: 40, worldX: 0, worldY: 0, primaryDown: false, button: 0,
    updateWorldPoint: vi.fn((view: typeof camera): void => { pointer.worldX = pointer.x + view.scrollX; pointer.worldY = pointer.y + view.scrollY; }) };
  const listeners = new Map<string, (value: typeof pointer) => void>();
  const on = vi.fn((name: string, callback: (value: typeof pointer) => void) => { listeners.set(name, callback); });
  const off = vi.fn((name: string, callback: (value: typeof pointer) => void) => { if (listeners.get(name) === callback) listeners.delete(name); });
  const tapPointer = () => { pointer.primaryDown = true; listeners.get('pointerdown')?.(pointer); pointer.primaryDown = false; };
  const scene = {
    game: { canvas }, cameras: { main: camera },
    input: {
      keyboard: { addKey: (code: number) => { const key = new KeyStub(); keys.set(code, key); return key; }, removeKey },
      activePointer: pointer, on, off,
    },
  } as unknown as Phaser.Scene;
  const input = new InputSystem(scene, pause);
  input.setEnabled(true);
  return { input, keys, canvas, pause, removeKey, removeEventListener, pointer, tapPointer, camera, listeners, off };
}

afterEach(() => vi.unstubAllGlobals());

describe('keyboard event-edge buffering', () => {
  it('preserves short Space, Shift, Q, E and R presses before any rendered frame', () => {
    const { input, keys, canvas } = setup();
    [32, 16, 81, 69, 82].forEach(code => keys.get(code)!.tap(canvas));
    input.poll();
    expect(input.consume()).toMatchObject({ jumpPressed: true, dashPressed: true, rewindPressed: true, insightPressed: true, rerollPressed: true, jumpHeld: false });
    expect(input.consume()).toMatchObject({ jumpPressed: false, dashPressed: false, rewindPressed: false, insightPressed: false, rerollPressed: false });
    input.destroy();
  });
  it('queues the R button once, rejects modified R shortcuts and clears paused inputs', () => {
    const { input, keys, canvas } = setup();
    keys.get(82)!.tap(canvas, { ctrlKey: true }); keys.get(82)!.tap(canvas, { metaKey: true });
    expect(input.consume().rerollPressed).toBeFalsy();
    input.queue('reroll');
    expect(input.consume().rerollPressed).toBe(true); expect(input.consume().rerollPressed).toBe(false);
    input.queue('reroll'); input.setEnabled(false);
    keys.get(82)!.tap(canvas); input.queue('reroll');
    expect(input.consume().rerollPressed).toBeFalsy();
    input.setEnabled(true); expect(input.consume().rerollPressed).toBeFalsy();
    const field = new ElementStub(); field.tagName = 'INPUT'; keys.get(82)!.tap(field);
    expect(input.consume().rerollPressed).toBeFalsy();
    input.destroy();
  });
  it('handles Escape immediately and a short J tap as one firing input', () => {
    const { input, keys, canvas, pause } = setup();
    keys.get(27)!.tap(canvas);
    expect(pause).toHaveBeenCalledTimes(1);
    keys.get(74)!.tap(canvas);
    input.poll(); expect(input.consume().fire).toBe(true);
    input.poll(); expect(input.consume().fire).toBe(false);
    input.destroy();
  });
  it('cancels the opening Escape default before pause but leaves paused and modified Escape to the browser', () => {
    const { input, keys, canvas, pause } = setup();
    const opening = keys.get(27)!.tap(canvas);
    expect(opening.preventDefault).toHaveBeenCalledTimes(1);
    expect(opening.preventDefault.mock.invocationCallOrder[0]).toBeLessThan(pause.mock.invocationCallOrder[0]);
    input.setEnabled(false);
    expect(keys.get(27)!.tap(canvas).preventDefault).not.toHaveBeenCalled();
    input.setEnabled(true);
    expect(keys.get(27)!.tap(canvas, { ctrlKey: true }).preventDefault).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalledTimes(1); input.destroy();
  });
  it('does not hijack text entry, ready/paused controls, or leave listeners after destroy', () => {
    const { input, keys, canvas, pause, removeKey, removeEventListener } = setup();
    const field = new ElementStub(); field.tagName = 'INPUT';
    keys.get(27)!.tap(field); keys.get(32)!.tap(field);
    expect(pause).not.toHaveBeenCalled(); expect(input.consume().jumpPressed).toBe(false);
    input.setEnabled(false);
    keys.get(27)!.tap(canvas); keys.get(81)!.tap(canvas);
    expect(pause).not.toHaveBeenCalled(); expect(input.consume().rewindPressed).toBe(false);
    input.destroy();
    expect(removeKey).toHaveBeenCalledTimes(12);
    expect(removeEventListener).toHaveBeenCalledTimes(1);
  });
});


describe('pointer event-edge buffering', () => {
  it('keeps a complete down/up between rendered frames and the event-time aim for exactly one fixed tick', () => {
    const { input, tapPointer, pointer, camera } = setup();
    tapPointer(); // Real pointer event then release; no poll/tick in between.
    pointer.x = 200; pointer.y = 80; camera.scrollX = 1300;
    input.poll(); input.poll();
    expect(input.consume()).toMatchObject({ fire: true, aim: { x: 1030, y: 240 } });
    expect(input.consume()).toMatchObject({ fire: false, aim: null });
    input.poll(); expect(input.consume().fire).toBe(false); input.destroy();
  });
  it('retains continuous held-pointer fire and updates its world aim without cloning a released edge', () => {
    const { input, pointer, listeners } = setup();
    pointer.primaryDown = true; listeners.get('pointerdown')?.(pointer); input.poll();
    expect(input.consume()).toMatchObject({ fire: true, aim: { x: 1030, y: 240 } });
    expect(input.consume().fire).toBe(true);
    pointer.x = 90; input.poll(); expect(input.consume().aim).toEqual({ x: 1090, y: 240 });
    pointer.primaryDown = false; input.poll(); expect(input.consume()).toMatchObject({ fire: false, aim: null }); input.destroy();
  });
  it('consumes a queued keyboard tap once even across catch-up ticks while preserving held J', () => {
    const { input, keys, canvas } = setup(); keys.get(74)!.tap(canvas); input.poll();
    expect(input.consume().fire).toBe(true); expect(input.consume().fire).toBe(false);
    keys.get(74)!.isDown = true; input.poll(); expect(input.consume().fire).toBe(true); expect(input.consume().fire).toBe(true); input.destroy();
  });
  it('drops edges across pause/resume and does not accept pointer input while typing', () => {
    const { input, tapPointer } = setup(); tapPointer(); input.setEnabled(false); tapPointer(); input.setEnabled(true);
    input.poll(); expect(input.consume()).toMatchObject({ fire: false, aim: null });
    const field = new ElementStub(); field.tagName = 'INPUT'; vi.stubGlobal('document', { activeElement: field });
    tapPointer(); input.poll(); expect(input.consume().fire).toBe(false); input.destroy();
  });
  it.each([[-1, 40], [641, 40], [30, -1], [30, 361]])('ignores a down/up outside logical canvas at %i,%i', (x, y) => {
    const { input, pointer, tapPointer } = setup(); pointer.x = x; pointer.y = y; tapPointer(); input.poll(); expect(input.consume().fire).toBe(false); input.destroy();
  });
  it.each([1, 2])('does not queue secondary down %i while primary is held after its original edge was consumed', button => {
    const { input, pointer, listeners } = setup();
    pointer.primaryDown = true; pointer.button = 0; listeners.get('pointerdown')?.(pointer);
    input.poll(); expect(input.consume().fire).toBe(true);
    pointer.button = button; listeners.get('pointerdown')?.(pointer); // Held primary remains true in Phaser4.0.
    pointer.primaryDown = false; pointer.button = 0; // Both releases before the next poll.
    input.poll(); expect(input.consume()).toMatchObject({ fire: false, aim: null }); input.destroy();
  });
  it('ignores secondary-button events and releases its pointer listener on destroy', () => {
    const { input, pointer, listeners, off, tapPointer } = setup();
    listeners.get('pointerdown')?.(pointer); input.poll(); expect(input.consume().fire).toBe(false);
    input.destroy(); expect(off).toHaveBeenCalledWith('pointerdown', expect.any(Function)); expect(listeners.size).toBe(0);
    tapPointer(); input.poll(); expect(input.consume()).toMatchObject({ fire: false, aim: null });
  });
});


describe('queued native-dialog keyboard origins', () => {
  it('does not reopen pause when the closing Escape is processed after resume and refocus', () => {
    const { input, keys, canvas, pause } = setup();
    const dialog = new ElementStub(); dialog.tagName = 'DIALOG';
    const button = new ElementStub(); button.tagName = 'BUTTON'; button.dialog = dialog;
    input.setEnabled(false); input.setEnabled(true);
    // Browser already cancelled/unmounted the dialog; original event target still belongs to it.
    const closing = keys.get(27)!.tap(button);
    expect(pause).not.toHaveBeenCalled(); expect(closing.preventDefault).not.toHaveBeenCalled();
    keys.get(27)!.tap(canvas); expect(pause).toHaveBeenCalledTimes(1); input.destroy();
  });
  it.each([32, 74, 81])('discards queued modal key %i including its held state after resume', code => {
    const { input, keys } = setup();
    const dialog = new ElementStub(); dialog.tagName = 'DIALOG';
    const button = new ElementStub(); button.tagName = 'BUTTON'; button.dialog = dialog;
    input.setEnabled(false); input.setEnabled(true);
    const key = keys.get(code)!; key.isDown = true;
    key.callback?.(key, { target: button, preventDefault: vi.fn() });
    input.poll(); expect(input.consume()).toMatchObject({ jumpPressed: false, jumpHeld: false, fire: false, rewindPressed: false });
    expect(key.isDown).toBe(false); input.destroy();
  });
});
