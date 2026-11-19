import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { EMPTY_TOUCH_INPUT } from '../../src/pages/GamePage/game/systems/touchInput';
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
  const pause = vi.fn();
  vi.stubGlobal('HTMLElement', ElementStub);
  const windowListeners = new Map<string, () => void>();
  const removeEventListener = vi.fn((name: string) => windowListeners.delete(name));
  const documentListeners = new Map<string, (event: { target: ElementStub }) => void>();
  const doc = { activeElement: canvas, hidden: false,
    addEventListener: vi.fn((name: string, listener: (event: { target: ElementStub }) => void) => documentListeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => documentListeners.delete(name)) };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { addEventListener: vi.fn((name: string, listener: () => void) => windowListeners.set(name, listener)), removeEventListener });
  const camera = { scrollX: 1000, scrollY: 200 };
  const pointer = { x: 30, y: 40, worldX: 0, worldY: 0, primaryDown: false, button: 0, wasTouch: false, event: {} as { pointerType?: string; sourceCapabilities?: { firesTouchEvents: boolean } },
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
  return { input, scene, keys, canvas, pause, removeKey, removeEventListener, pointer, tapPointer, camera, listeners, off, doc, windowListeners, documentListeners };
}

afterEach(() => vi.unstubAllGlobals());

describe('keyboard event-edge buffering', () => {
  it('holds cooperative rescue only during active gameplay and clears it across pause', () => {
    const { input, keys, canvas } = setup();
    keys.get(70)!.tap(canvas); expect(input.reviveHeld()).toBe(false);
    keys.get(70)!.isDown = true; expect(input.reviveHeld()).toBe(true);
    input.poll(); expect(input.consume()).toMatchObject({ fire: false, jumpPressed: false, dashPressed: false, rewindPressed: false, insightPressed: false, rerollPressed: false });
    const field = new ElementStub(); field.tagName = 'INPUT';
    Object.assign(document, { activeElement: field }); expect(input.reviveHeld()).toBe(false);
    Object.assign(document, { activeElement: canvas });
    input.setEnabled(false); expect(input.reviveHeld()).toBe(false);
    input.setEnabled(true); expect(input.reviveHeld()).toBe(false);
    input.destroy();
  });
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
    expect(removeKey).toHaveBeenCalledTimes(13);
    for (const code of [65, 68, 37, 39, 32, 38, 16, 74, 81, 69, 82, 27, 70]) expect(removeKey).toHaveBeenCalledWith(code, true);
    expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
  });
  it('safely destroys after Phaser has released its input manager, including repeated cleanup and late UI releases', () => {
    const { input, scene, keys, canvas, pointer, listeners, off, removeKey, windowListeners, documentListeners } = setup();
    input.setTouchInput({ ...EMPTY_TOUCH_INPUT, move: 1, jump: true, fire: true, revive: true });
    keys.get(81)!.tap(canvas); keys.get(70)!.isDown = true;
    pointer.primaryDown = true; listeners.get('pointerdown')?.(pointer); input.poll();
    // InputPlugin.activePointer dereferences manager, which Phaser nulls before Scene.destroy listeners run.
    const disposedPointer = vi.fn(() => { throw new TypeError("Cannot read properties of null (reading 'activePointer')"); });
    Object.defineProperty(scene.input, 'activePointer', { get: disposedPointer });
    expect(() => input.destroy()).not.toThrow();
    expect(() => input.destroy()).not.toThrow();
    expect(disposedPointer).not.toHaveBeenCalled();
    expect(off).toHaveBeenCalledTimes(1); expect(listeners.size).toBe(0);
    expect(removeKey).toHaveBeenCalledTimes(13);
    expect(windowListeners.size).toBe(0); expect(documentListeners.size).toBe(0);
    canvas.focus.mockClear();
    expect(() => { input.setEnabled(true); input.setTouchInput({ ...EMPTY_TOUCH_INPUT }); input.poll(); }).not.toThrow();
    expect(input.consume()).toEqual(EMPTY_INPUT); expect(input.reviveHeld()).toBe(false);
    expect(canvas.focus).not.toHaveBeenCalled(); expect(disposedPointer).not.toHaveBeenCalled();
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
    const field = new ElementStub(); field.tagName = 'INPUT'; Object.assign(document, { activeElement: field });
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


describe('complete touch state and independent multi-pointer actions', () => {
  it('preserves brief concurrent action presses until exactly one consume, even after every finger releases', () => {
    const { input } = setup();
    input.setTouchInput({ ...EMPTY_TOUCH_INPUT, jump: true, fire: true, dash: true, rewind: true, insight: true, reroll: true, aimDirection: { x: 3, y: 4 } });
    input.setTouchInput({ ...EMPTY_TOUCH_INPUT });
    input.poll(); input.poll();
    expect(input.consume({ x: 100, y: 200 })).toMatchObject({ jumpPressed: true, jumpHeld: false, fire: true, dashPressed: true,
      rewindPressed: true, insightPressed: true, rerollPressed: true, aim: { x: 160, y: 280 } });
    expect(input.consume({ x: 100, y: 200 })).toMatchObject({ jumpPressed: false, jumpHeld: false, fire: false, dashPressed: false,
      rewindPressed: false, insightPressed: false, rerollPressed: false, aim: null });
    input.destroy();
  });
  it('releases one finger without dropping the independent movement/fire/rescue fingers or repeating action edges', () => {
    const { input } = setup();
    const running = { ...EMPTY_TOUCH_INPUT, move: 1 as const, fire: true, revive: true };
    input.setTouchInput(running); input.poll();
    expect(input.consume()).toMatchObject({ move: 1, fire: true, jumpPressed: false }); expect(input.reviveHeld()).toBe(true);
    input.setTouchInput({ ...running, jump: true, dash: true });
    expect(input.consume()).toMatchObject({ move: 1, fire: true, jumpPressed: true, jumpHeld: true, dashPressed: true });
    input.setTouchInput({ ...running, jump: true, dash: true });
    expect(input.consume()).toMatchObject({ move: 1, fire: true, jumpPressed: false, jumpHeld: true, dashPressed: false });
    input.setTouchInput(running);
    expect(input.consume()).toMatchObject({ move: 1, fire: true, jumpHeld: false }); expect(input.reviveHeld()).toBe(true);
    input.setTouchInput({ ...EMPTY_TOUCH_INPUT }); expect(input.consume().move).toBe(0); expect(input.reviveHeld()).toBe(false);
    input.destroy();
  });
  it('normalizes a copied aim direction against the current muzzle on every consume, independent of the camera', () => {
    const { input, camera } = setup();
    const state = { ...EMPTY_TOUCH_INPUT, fire: true, aimDirection: { x: 3, y: 4 } };
    input.setTouchInput(state); state.aimDirection.x = 9999;
    expect(input.consume({ x: 100, y: 200 }).aim).toEqual({ x: 160, y: 280 });
    camera.scrollX = 5000; camera.scrollY = 600;
    expect(input.consume({ x: 200, y: 300 }).aim).toEqual({ x: 260, y: 380 });
    input.destroy();
  });
  it.each([{ x: 0, y: 0 }, { x: NaN, y: 1 }, { x: 1, y: Infinity }])('uses ordinary facing aim for an invalid or neutral direction %j', aimDirection => {
    const { input } = setup(); input.setTouchInput({ ...EMPTY_TOUCH_INPUT, fire: true, aimDirection });
    expect(input.consume({ x: 100, y: 200 })).toMatchObject({ fire: true, aim: null }); input.destroy();
  });
  it('keeps normalization finite even for very large finite direction components', () => {
    const { input } = setup(); input.setTouchInput({ ...EMPTY_TOUCH_INPUT, fire: true, aimDirection: { x: Number.MAX_VALUE, y: Number.MAX_VALUE } });
    const aim = input.consume({ x: 0, y: 0 }).aim!;
    expect(Math.hypot(aim.x, aim.y)).toBeCloseTo(100); expect(Number.isFinite(aim.x) && Number.isFinite(aim.y)).toBe(true); input.destroy();
  });
  it('combines keyboard and touch movement/jump/fire/rescue without changing keyboard defaults', () => {
    const { input, keys } = setup(); keys.get(68)!.isDown = true; keys.get(32)!.isDown = true; keys.get(74)!.isDown = true;
    input.setTouchInput({ ...EMPTY_TOUCH_INPUT, move: -1, revive: true }); input.poll();
    expect(input.consume()).toMatchObject({ move: 0, jumpHeld: true, fire: true }); expect(input.reviveHeld()).toBe(true);
    input.setTouchInput({ ...EMPTY_TOUCH_INPUT }); input.poll();
    expect(input.consume()).toMatchObject({ move: 1, jumpHeld: true, fire: true }); expect(input.reviveHeld()).toBe(false);
    keys.get(70)!.isDown = true; expect(input.reviveHeld()).toBe(true); input.destroy();
  });
  it('allows touch aiming before fire, and neutral touch fire does not inherit a stale mouse aim', () => {
    const { input, keys, tapPointer } = setup();
    input.setTouchInput({ ...EMPTY_TOUCH_INPUT, aimDirection: { x: 0, y: -2 } }); keys.get(74)!.isDown = true; input.poll();
    expect(input.consume({ x: 10, y: 20 })).toMatchObject({ fire: true, aim: { x: 10, y: -80 } });
    keys.get(74)!.isDown = false; tapPointer(); input.setTouchInput({ ...EMPTY_TOUCH_INPUT, fire: true }); input.poll();
    expect(input.consume({ x: 10, y: 20 })).toMatchObject({ fire: true, aim: null }); input.destroy();
  });
  it('ignores native touch and compatibility mouse pointers instead of firing a second shot from the screen position', () => {
    const { input, pointer, listeners, tapPointer } = setup();
    pointer.wasTouch = true; pointer.primaryDown = true; listeners.get('pointerdown')?.(pointer); input.poll();
    expect(input.consume()).toMatchObject({ fire: false, aim: null });
    pointer.wasTouch = false; pointer.event = { sourceCapabilities: { firesTouchEvents: true } };
    listeners.get('pointerdown')?.(pointer); input.poll(); expect(input.consume().fire).toBe(false);
    pointer.primaryDown = false; pointer.event = {}; tapPointer(); input.poll();
    expect(input.consume()).toMatchObject({ fire: true, aim: { x: 1030, y: 240 } }); input.destroy();
  });
  it('clears touch edges/held state across pause, blur, hidden documents and text-entry focus', () => {
    const { input, doc, windowListeners, documentListeners } = setup();
    const held = { ...EMPTY_TOUCH_INPUT, move: 1 as const, fire: true, jump: true, dash: true, revive: true };
    const empty = () => { expect(input.consume()).toMatchObject({ move: 0, fire: false, jumpPressed: false, jumpHeld: false, dashPressed: false }); expect(input.reviveHeld()).toBe(false); };
    input.setTouchInput(held); input.setEnabled(false); input.setTouchInput(held); input.setEnabled(true); empty();
    input.setTouchInput(held); windowListeners.get('blur')!(); empty();
    input.setTouchInput(held); doc.hidden = true; documentListeners.get('visibilitychange')!({ target: doc.activeElement });
    input.setTouchInput(held); doc.hidden = false; empty();
    input.setTouchInput(held); const field = new ElementStub(); field.tagName = 'INPUT';
    documentListeners.get('focusin')!({ target: field }); empty();
    doc.activeElement = field; input.setTouchInput(held); empty(); input.destroy();
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(doc.removeEventListener).toHaveBeenCalledWith('focusin', expect.any(Function));
  });
  it('does not resume a still-down mouse pointer after pause or blur until it releases or receives a fresh down', () => {
    const { input, pointer, listeners, windowListeners } = setup();
    pointer.primaryDown = true; listeners.get('pointerdown')?.(pointer); input.poll(); expect(input.consume().fire).toBe(true);
    input.setEnabled(false); input.setEnabled(true); input.poll(); expect(input.consume().fire).toBe(false);
    listeners.get('pointerdown')?.(pointer); input.poll(); expect(input.consume().fire).toBe(true);
    windowListeners.get('blur')!(); input.poll(); expect(input.consume().fire).toBe(false);
    pointer.primaryDown = false; input.poll(); pointer.primaryDown = true; listeners.get('pointerdown')?.(pointer); input.poll();
    expect(input.consume().fire).toBe(true); input.destroy();
  });
});
