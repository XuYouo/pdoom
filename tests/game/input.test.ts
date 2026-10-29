import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { InputSystem } from '../../src/pages/GamePage/game/systems/InputSystem';

class ElementStub {
  isContentEditable = false;
  tagName = 'CANVAS';
  tabIndex = -1;
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
  const scene = {
    game: { canvas }, cameras: { main: {} },
    input: {
      keyboard: { addKey: (code: number) => { const key = new KeyStub(); keys.set(code, key); return key; }, removeKey },
      activePointer: { x: 0, y: 0, primaryDown: false, updateWorldPoint: vi.fn() },
    },
  } as unknown as Phaser.Scene;
  const input = new InputSystem(scene, pause);
  input.setEnabled(true);
  return { input, keys, canvas, pause, removeKey, removeEventListener };
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
