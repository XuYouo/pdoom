import type * as Phaser from 'phaser';
import type { CounterFeedbackFrame } from './counterFeedback';

type Surface = Pick<Phaser.GameObjects.Graphics, 'fillStyle' | 'fillRect'>;
/** Existing cleared world surface, BEFORE its real shots. No objects, clock, tweens or listeners. */
export function drawCounterReward(g: Surface, frame: CounterFeedbackFrame | null): void {
  if (!frame) return;
  const { x, y, immunityTicks, charges } = frame;
  if (immunityTicks > 0) {
    // Dictionary gold book inside a teal shield: type is a shape as well as a colour.
    g.fillStyle(0x0b111d).fillRect(x - 5, y + 1, 11, 7).fillRect(x - 3, y + 8, 7, 2);
    g.fillStyle(0x87e3cd).fillRect(x - 4, y, 9, 1)
      .fillRect(x - 5, y + 1, 1, 1).fillRect(x + 5, y + 1, 1, 1)
      .fillRect(x - 6, y + 2, 1, 5).fillRect(x + 6, y + 2, 1, 5)
      .fillRect(x - 5, y + 7, 1, 2).fillRect(x + 5, y + 7, 1, 2)
      .fillRect(x - 4, y + 9, 2, 1).fillRect(x + 3, y + 9, 2, 1)
      .fillRect(x - 2, y + 10, 2, 1).fillRect(x + 1, y + 10, 2, 1).fillRect(x, y + 11, 1, 1);
    g.fillStyle(0xeec76d).fillRect(x - 3, y + 3, 3, 4).fillRect(x + 1, y + 3, 3, 4)
      .fillRect(x - 2, y + 7, 2, 1).fillRect(x + 1, y + 7, 2, 1);
    g.fillStyle(0x0b111d).fillRect(x - 11, y + 12, 22, 4);
    for (let i = 0; i < 10; i++) g.fillStyle(i < immunityTicks ? 0x87e3cd : 0x34534e).fillRect(x - 9 + i * 2, y + 13, 1, 2);
  }
  if (charges > 0) for (let i = 0; i < 6; i++) {
    g.fillStyle(0x0b111d).fillRect(x - 14 + i * 5, y + 17, 4, 4);
    g.fillStyle(i < charges ? 0xffffff : 0x34534e).fillRect(x - 13 + i * 5, y + 18, 2, 2);
  }
}
