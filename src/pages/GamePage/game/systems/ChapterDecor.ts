import type * as Phaser from 'phaser';
import type { WorldState } from '../entities/model';
import { drawFurnaceDecor } from './FurnaceDecor';
import { drawLoomDecor } from './LoomDecor';
import { drawOmegaDecor } from './OmegaDecor';

/** Authored geometric level dressing; final Aseprite tiles remain a separate milestone. */
export function drawChapterDecor(g: Phaser.GameObjects.Graphics, chapter: WorldState['chapter']) {
  g.clear();
  if (chapter.stage === 3) { drawFurnaceDecor(g, chapter); return; }
  if (chapter.stage === 4) { drawLoomDecor(g, chapter); return; }
  if (chapter.stage === 5) { drawOmegaDecor(g, chapter); return; }
  if (chapter.axis === 'vertical') {
    g.fillStyle(0x101c29).fillRect(0, 0, chapter.width, chapter.height);
    for (let y = 0; y < chapter.height; y += 128) {
      g.fillStyle(y % 256 ? 0x152633 : 0x192a35).fillRect(18, y + 6, chapter.width - 36, 116);
      g.lineStyle(1, 0x314a57).strokeRect(48, y + 20, chapter.width - 96, 82);
      for (let x = 90; x < chapter.width; x += 132) {
        g.fillStyle(0x253f4a).fillRect(x, y + 29, 4, 64);
        g.lineStyle(1, 0x4d6972, 0.6).strokeRect(x + 14, y + 42, 15, 28).strokeRect(x + 18, y + 47, 7, 18);
      }
      g.fillStyle(0x8e9580).fillRect(12, y + 110, 12, 5).fillRect(chapter.width - 24, y + 110, 12, 5);
    }
    g.fillStyle(0x435564).fillRect(26, 0, 5, chapter.height).fillRect(chapter.width - 31, 0, 5, chapter.height);
    g.lineStyle(3, 0x8aa8be, 0.6).strokeRect(chapter.arena.x + 8, chapter.arena.y + 35, chapter.arena.w - 16, chapter.floor - chapter.arena.y - 35);
    return;
  }
  g.fillStyle(0x101a1b).fillRect(0, 0, chapter.width, chapter.height);
  for (let x = 0, index = 0; x < chapter.width; x += 128, index++) {
    g.fillStyle(index % 2 ? 0x142224 : 0x152526).fillRect(x + 8, 42, 112, 274);
    g.fillStyle(0x172628).fillRect(x + 26, 150, 72, 140);
    g.lineStyle(1, 0x31413c, 0.65).strokeRect(x + 26, 150, 72, 140);
    for (let row = 0; row < 6; row++) {
      g.lineStyle(1, 0x293c38).lineBetween(x + 31, 164 + row * 20, x + 92, 164 + row * 20);
      g.fillStyle(0x638574, 0.35).fillRect(x + 83, 156 + row * 20, 4, 2);
    }
    g.fillStyle(0x734638, 0.8).fillRect(x + 6, 46, 7, 270);
    g.fillStyle(0x51382f).fillRect(x + 2, 38, 128, 11);
    g.fillStyle(0x9e6650, 0.65).fillRect(x, 35, 132, 3);
    g.lineStyle(1, 0x6a5f49, 0.6).lineBetween(x + 64, 49, x + 64, 77);
    g.fillStyle(0xa56845, 0.6).fillRect(x + 57, 77, 14, 19);
    g.fillStyle(0xd7a766, 0.55).fillRect(x + 60, 80, 8, 12);
  }
  g.fillStyle(0x0d1718).fillRect(0, 326, chapter.width, 34);
  g.lineStyle(1, 0x52776d, 0.4).lineBetween(0, 325, chapter.width, 325);
  g.lineStyle(3, 0x8c6b48, 0.6).strokeRect(chapter.arena.x + 6, 58, 610, 260);
  g.lineStyle(1, 0x3d6055, 0.45).strokeCircle(2550, 184, 94).lineBetween(2456, 184, 2644, 184);
}
