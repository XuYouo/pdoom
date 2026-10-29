import type * as Phaser from 'phaser';
import type { ChapterDefinition } from '../entities/model';

/** Low-contrast GPU rack blockout. Heat and lifts use the simulation's separate live geometry. */
export function drawFurnaceDecor(g: Phaser.GameObjects.Graphics, chapter: ChapterDefinition) {
  g.fillStyle(0x111d18).fillRect(0, 0, chapter.width, chapter.height);
  for (let x = 0; x < chapter.width; x += 160) {
    g.fillStyle(0x18291f).fillRect(x + 7, 38, 146, chapter.floor - 40);
    g.lineStyle(1, 0x34503b).strokeRect(x + 12, 45, 136, chapter.floor - 54);
    for (let row = 0; row < 4; row++) {
      const y = 65 + row * 56;
      g.fillStyle(0x263c2b).fillRect(x + 24, y, 112, 40);
      g.lineStyle(1, 0x54704e, 0.55).strokeRect(x + 24, y, 112, 40);
      for (let fan = 0; fan < 2; fan++) {
        const cx = x + 48 + fan * 52;
        g.lineStyle(1, 0x496348, 0.7).strokeCircle(cx, y + 20, 12);
        g.lineBetween(cx - 8, y + 12, cx + 8, y + 28).lineBetween(cx - 8, y + 28, cx + 8, y + 12);
        g.fillStyle(0x63855b, 0.7).fillRect(cx - 2, y + 18, 4, 4);
      }
      g.fillStyle(0xa3cb76, 0.55).fillRect(x + 128, y + 5, 3, 3);
    }
  }
  g.fillStyle(0x0a1511).fillRect(0, chapter.floor + 8, chapter.width, chapter.height - chapter.floor - 8);
  g.lineStyle(2, 0x6d8b54, 0.6).strokeRect(chapter.arena.x + 10, 38, chapter.arena.w - 20, chapter.floor - 38);
  g.lineStyle(1, 0x38533c, 0.6).strokeCircle(chapter.boss.x, 162, 84);
  g.lineBetween(chapter.boss.x - 84, 162, chapter.boss.x + 84, 162);
}
