import type * as Phaser from 'phaser';
import type { ChapterDefinition } from '../entities/model';

/** Low-contrast lattice only. The real expanding branch graph is drawn from runtime Loom geometry. */
export function drawLoomDecor(g: Phaser.GameObjects.Graphics, chapter: ChapterDefinition) {
  g.fillStyle(0x121722).fillRect(0, 0, chapter.width, chapter.height);
  for (let x = 0; x < chapter.width; x += 192) {
    g.fillStyle(0x171d2b).fillRect(x + 8, 40, 172, chapter.height - 40);
    for (let y = 64; y < chapter.height - 48; y += 96) {
      const offset = (y / 32) % 2 ? 16 : 0;
      g.lineStyle(1, 0x30374e, 0.6).lineBetween(x + 26, y + offset, x + 66, y + offset)
        .lineBetween(x + 66, y + offset, x + 91, y + offset + 24);
      g.lineStyle(1, 0x30374e, 0.4).lineBetween(x + 66, y + offset, x + 91, y + offset - 24);
      g.fillStyle(0x3a4158, 0.65).fillRect(x + 25, y + offset - 2, 4, 4).fillRect(x + 90, y + offset + 22, 4, 4);
    }
  }
  // No decorative continuous floor: the spaces between real branches must read as a void.
  g.fillStyle(0x0b111d).fillRect(0, chapter.height - 30, chapter.width, 30);
  for (let x = 6; x < chapter.width; x += 24) {
    g.lineStyle(1, 0x51415b, 0.45).lineBetween(x, chapter.height - 9, x + 7, chapter.height - 16);
  }
  const arena = chapter.arena;
  g.lineStyle(1, 0x536c66, 0.55).strokeRect(arena.x + 5, arena.y + 36, arena.w - 10, arena.h - 42);
}
