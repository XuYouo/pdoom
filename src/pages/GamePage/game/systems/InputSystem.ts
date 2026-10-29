import type * as Phaser from 'phaser';
import { EMPTY_INPUT } from '../entities/model';
import type { FrameInput } from '../entities/model';

type ActionKey = 'left' | 'right' | 'leftAlt' | 'rightAlt' | 'jump' | 'jumpAlt' | 'dash' | 'shoot' | 'rewind' | 'insight' | 'reroll' | 'pause';
const codes: Record<ActionKey, number> = {
  left: 65, right: 68, leftAlt: 37, rightAlt: 39, jump: 32, jumpAlt: 38,
  dash: 16, shoot: 74, rewind: 81, insight: 69, reroll: 82, pause: 27,
};
const isTextEntry = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));

/** Per-scene edge buffering: presses survive render frames without a simulation tick. */
export class InputSystem {
  private keys: Partial<Record<ActionKey, Phaser.Input.Keyboard.Key>> = {};
  private pending: FrameInput = { ...EMPTY_INPUT };
  private enabled = false;
  private queuedShot = false;
  private canvas: HTMLCanvasElement;
  private preventScroll = (event: KeyboardEvent) => {
    if (this.enabled && !isTextEntry(event.target) && [32, 37, 38, 39, 40].includes(event.keyCode)) event.preventDefault();
  };

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
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.pending = { ...EMPTY_INPUT };
    this.queuedShot = false;
    Object.values(this.keys).forEach(key => key.reset());
    if (enabled) this.canvas.focus({ preventScroll: true });
  }

  queue(action: 'rewind' | 'insight' | 'reroll') {
    if (!this.enabled) return;
    if (action === 'rewind') this.pending.rewindPressed = true;
    else if (action === 'insight') this.pending.insightPressed = true;
    else this.pending.rerollPressed = true;
  }

  poll() {
    if (!this.enabled || isTextEntry(document.activeElement)) return;
    const down = (action: ActionKey) => this.keys[action]?.isDown ?? false;
    this.pending.move = ((down('right') || down('rightAlt') ? 1 : 0) - (down('left') || down('leftAlt') ? 1 : 0)) as -1 | 0 | 1;
    this.pending.jumpHeld = down('jump') || down('jumpAlt');
    const pointer = this.scene.input.activePointer;
    const pointerInCanvas = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= 640 && pointer.y <= 360;
    const pointerFire = pointer.primaryDown && pointerInCanvas;
    this.pending.fire = down('shoot') || pointerFire || this.queuedShot;
    if (pointerFire) {
      pointer.updateWorldPoint(this.scene.cameras.main);
      this.pending.aim = { x: pointer.worldX, y: pointer.worldY };
    } else this.pending.aim = null;
  }

  consume(): FrameInput {
    const frame = { ...this.pending };
    this.queuedShot = false;
    this.pending = { ...this.pending, jumpPressed: false, dashPressed: false, rewindPressed: false, insightPressed: false, rerollPressed: false };
    return frame;
  }

  destroy() {
    window.removeEventListener('keydown', this.preventScroll);
    (Object.keys(codes) as ActionKey[]).forEach(action => this.scene.input.keyboard?.removeKey(codes[action], true));
  }
}
