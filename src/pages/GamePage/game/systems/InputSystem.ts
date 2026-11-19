import type * as Phaser from 'phaser';
import { EMPTY_INPUT } from '../entities/model';
import type { FrameInput, Vec2 } from '../entities/model';
import { EMPTY_TOUCH_INPUT, type TouchControlState } from './touchInput';

type ActionKey = 'left' | 'right' | 'leftAlt' | 'rightAlt' | 'jump' | 'jumpAlt' | 'dash' | 'shoot' | 'rewind' | 'insight' | 'reroll' | 'pause' | 'revive';
const codes: Record<ActionKey, number> = {
  left: 65, right: 68, leftAlt: 37, rightAlt: 39, jump: 32, jumpAlt: 38,
  dash: 16, shoot: 74, rewind: 81, insight: 69, reroll: 82, pause: 27, revive: 70,
};
const isTextEntry = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
const touchPointer = (pointer: Phaser.Input.Pointer) => pointer.wasTouch ||
  (pointer.event as (Event & { pointerType?: string; sourceCapabilities?: { firesTouchEvents?: boolean } }) | undefined)?.pointerType === 'touch' ||
  (pointer.event as (Event & { sourceCapabilities?: { firesTouchEvents?: boolean } }) | undefined)?.sourceCapabilities?.firesTouchEvents === true;
const direction = (value: Vec2 | null): Vec2 | null => {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  const scale = Math.max(Math.abs(value.x), Math.abs(value.y));
  if (!scale) return null;
  const x = value.x / scale, y = value.y / scale, length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
};

/** Per-scene edge buffering: presses survive render frames without a simulation tick. */
export class InputSystem {
  private keys: Partial<Record<ActionKey, Phaser.Input.Keyboard.Key>> = {};
  private pending: FrameInput = { ...EMPTY_INPUT };
  private enabled = false;
  private destroyed = false;
  private queuedShot = false;
  private queuedPointerAim: FrameInput['aim'] = null;
  private heldAim: FrameInput['aim'] = null;
  private heldFire = false;
  private touch: TouchControlState = { ...EMPTY_TOUCH_INPUT };
  private queuedTouchShot = false;
  private queuedTouchAim: Vec2 | null = null;
  private pointerBlockedUntilRelease = false;
  // primaryDown is held state; a secondary down while left is held is not a primary edge.
  private pointerDown = (pointer: Phaser.Input.Pointer) => {
    if (!this.enabled || touchPointer(pointer) || pointer.button !== 0 || !pointer.primaryDown || isTextEntry(document.activeElement)) return;
    if (!(pointer.x >= 0 && pointer.y >= 0 && pointer.x <= 640 && pointer.y <= 360)) return;
    this.pointerBlockedUntilRelease = false;
    pointer.updateWorldPoint(this.scene.cameras.main);
    if (Number.isFinite(pointer.worldX) && Number.isFinite(pointer.worldY)) this.queuedPointerAim = { x: pointer.worldX, y: pointer.worldY };
  };
  private canvas: HTMLCanvasElement;
  private preventScroll = (event: KeyboardEvent) => {
    if (this.enabled && !isTextEntry(event.target) && [32, 37, 38, 39, 40].includes(event.keyCode)) event.preventDefault();
  };
  private clearInputs = () => {
    this.pending = { ...EMPTY_INPUT }; this.touch = { ...EMPTY_TOUCH_INPUT };
    this.queuedShot = false; this.queuedPointerAim = null; this.heldAim = null; this.heldFire = false;
    this.queuedTouchShot = false; this.queuedTouchAim = null;
    // Phaser may destroy InputPlugin.manager before Scene cleanup. Only live
    // pause/blur clearing needs the pointer release gate; teardown cannot read it.
    this.pointerBlockedUntilRelease = !this.destroyed && !!this.scene.input.activePointer.primaryDown;
    Object.values(this.keys).forEach(key => key.reset());
  };
  private visibilityChanged = () => { if (document.hidden) this.clearInputs(); };
  private focusChanged = (event: FocusEvent) => { if (isTextEntry(event.target)) this.clearInputs(); };

  constructor(private scene: Phaser.Scene, private requestPause: () => void) {
    this.canvas = scene.game.canvas;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Clawd 游戏：A D 移动，空格跳跃，J 射击，鼠标瞄准射击，Shift 冲刺，Q 回溯，E 透视，第四章R重roll，Esc 暂停');
    (Object.keys(codes) as ActionKey[]).forEach(action => {
      const key = scene.input.keyboard?.addKey(codes[action], false, false);
      if (key) {
        this.keys[action] = key;
        // JustDown polling loses a keydown+keyup that arrives before the next render.
        // Queue discrete actions at the actual input event; consume once on a fixed tick.
        key.on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
          // Phaser drains queued DOM key events later. A dialog-closing key can arrive
          // after resume has re-enabled us; keep its original UI origin out of gameplay.
          if (event.target instanceof HTMLElement && event.target.closest('dialog')) { key.reset(); return; }
          if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey || isTextEntry(event.target) || isTextEntry(document.activeElement)) return;
          // Cancel this opening Escape before mounting a native dialog; otherwise the
          // same browser default action immediately cancels the newly opened pause menu.
          // Disabled/paused input returns above, so the next Escape still closes the dialog.
          if (action === 'pause') { event.preventDefault(); this.requestPause(); }
          else if (action === 'jump' || action === 'jumpAlt') this.pending.jumpPressed = true;
          else if (action === 'dash') this.pending.dashPressed = true;
          else if (action === 'rewind') this.pending.rewindPressed = true;
          else if (action === 'insight') this.pending.insightPressed = true;
          else if (action === 'reroll') this.pending.rerollPressed = true;
          else if (action === 'shoot') this.queuedShot = true;
        });
      }
    });
    window.addEventListener('keydown', this.preventScroll, { passive: false });
    window.addEventListener('blur', this.clearInputs);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    document.addEventListener('focusin', this.focusChanged);
    scene.input.on('pointerdown', this.pointerDown);
  }

  setEnabled(enabled: boolean) {
    if (this.destroyed) return;
    this.enabled = enabled;
    this.clearInputs();
    if (enabled) this.canvas.focus({ preventScroll: true });
  }

  setTouchInput(next: TouchControlState) {
    if (!this.enabled || document.hidden || isTextEntry(document.activeElement)) { this.clearInputs(); return; }
    const input: TouchControlState = { move: next.move === -1 || next.move === 1 ? next.move : 0,
      jump: next.jump === true, fire: next.fire === true, dash: next.dash === true, rewind: next.rewind === true,
      insight: next.insight === true, reroll: next.reroll === true, revive: next.revive === true, aimDirection: direction(next.aimDirection) };
    if (input.jump && !this.touch.jump) this.pending.jumpPressed = true;
    if (input.dash && !this.touch.dash) this.pending.dashPressed = true;
    if (input.rewind && !this.touch.rewind) this.pending.rewindPressed = true;
    if (input.insight && !this.touch.insight) this.pending.insightPressed = true;
    if (input.reroll && !this.touch.reroll) this.pending.rerollPressed = true;
    if (input.fire && !this.touch.fire) { this.queuedTouchShot = true; this.queuedTouchAim = input.aimDirection; }
    this.touch = input;
  }

  queue(action: 'rewind' | 'insight' | 'reroll') {
    if (!this.enabled || isTextEntry(document.activeElement)) return;
    if (action === 'rewind') this.pending.rewindPressed = true;
    else if (action === 'insight') this.pending.insightPressed = true;
    else this.pending.rerollPressed = true;
  }

  poll() {
    if (!this.enabled || document.hidden || isTextEntry(document.activeElement)) { this.clearInputs(); return; }
    const down = (action: ActionKey) => this.keys[action]?.isDown ?? false;
    this.pending.move = ((down('right') || down('rightAlt') ? 1 : 0) - (down('left') || down('leftAlt') ? 1 : 0)) as -1 | 0 | 1;
    this.pending.jumpHeld = down('jump') || down('jumpAlt');
    const pointer = this.scene.input.activePointer;
    const pointerInCanvas = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= 640 && pointer.y <= 360;
    if (!pointer.primaryDown) this.pointerBlockedUntilRelease = false;
    const pointerFire = !touchPointer(pointer) && !this.pointerBlockedUntilRelease && pointer.primaryDown && pointerInCanvas;
    this.heldFire = down('shoot') || pointerFire;
    this.heldAim = null;
    if (pointerFire) {
      pointer.updateWorldPoint(this.scene.cameras.main);
      if (Number.isFinite(pointer.worldX) && Number.isFinite(pointer.worldY)) this.heldAim = { x: pointer.worldX, y: pointer.worldY };
    }
    this.pending.fire = this.heldFire || this.queuedShot || this.queuedPointerAim !== null;
    this.pending.aim = this.heldAim ?? this.queuedPointerAim;
  }

  /** aimOrigin is the current real muzzle position, sampled anew on every fixed tick/network send. */
  consume(aimOrigin?: Vec2): FrameInput {
    if (!this.enabled || document.hidden || isTextEntry(document.activeElement)) { this.clearInputs(); return { ...EMPTY_INPUT }; }
    const frame = { ...this.pending, aim: this.pending.aim ? { ...this.pending.aim } : null };
    frame.move = Math.max(-1, Math.min(1, frame.move + this.touch.move)) as -1 | 0 | 1;
    frame.jumpHeld ||= this.touch.jump;
    const touchFire = this.touch.fire || this.queuedTouchShot;
    frame.fire ||= touchFire;
    const aim = this.touch.aimDirection ?? (!this.touch.fire && this.queuedTouchShot ? this.queuedTouchAim : null);
    if (touchFire || aim) {
      frame.aim = aim && aimOrigin && Number.isFinite(aimOrigin.x) && Number.isFinite(aimOrigin.y)
        ? { x: aimOrigin.x + aim.x * 100, y: aimOrigin.y + aim.y * 100 } : null;
    }
    this.queuedTouchShot = false; this.queuedTouchAim = null;
    this.queuedShot = false; this.queuedPointerAim = null;
    this.pending = { ...this.pending, fire: this.heldFire, aim: this.heldAim, jumpPressed: false, dashPressed: false, rewindPressed: false, insightPressed: false, rerollPressed: false };
    return frame;
  }

  reviveHeld(): boolean { return this.enabled && !document.hidden && !isTextEntry(document.activeElement) && (!!this.keys.revive?.isDown || this.touch.revive); }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.enabled = false;
    this.clearInputs();
    this.scene.input.off('pointerdown', this.pointerDown);
    window.removeEventListener('keydown', this.preventScroll);
    window.removeEventListener('blur', this.clearInputs);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    document.removeEventListener('focusin', this.focusChanged);
    (Object.keys(codes) as ActionKey[]).forEach(action => this.scene.input.keyboard?.removeKey(codes[action], true));
    this.keys = {};
  }
}
