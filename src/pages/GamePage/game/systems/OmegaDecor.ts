import type * as Phaser from 'phaser';
import { OMEGA_ROOM } from '../data/chapterFive';
import type { ChapterDefinition } from '../entities/model';

/** Temporary authored dressing. Collision surfaces are drawn separately from worldPlatforms, never invented here. */
export function drawOmegaDecor(g: Phaser.GameObjects.Graphics, chapter: ChapterDefinition) {
  const { door, chair, glass } = OMEGA_ROOM;
  g.clear().fillStyle(0x101c29).fillRect(0, 0, chapter.width, chapter.height);
  // A dense compute corridor opens into a deliberately empty final room.
  for (let x = 12, i = 0; x < door.x - 40; x += 120, i++) {
    g.fillStyle(i % 2 ? 0x182837 : 0x142433).fillRect(x, 34, 106, 280);
    g.lineStyle(1, 0x334451, 0.7).strokeRect(x + 10, 60, 86, 204);
    for (let row = 0; row < 5; row++) {
      g.fillStyle(0x233746).fillRect(x + 18, 78 + row * 35, 70, 25);
      g.fillStyle(0x7a938f, 0.55).fillRect(x + 74, 85 + row * 35, 5, 2);
      g.lineStyle(1, 0x465b66, 0.7).lineBetween(x + 24, 97 + row * 35, x + 65, 97 + row * 35);
    }
  }
  g.fillStyle(0x131b22).fillRect(door.x - 20, 0, chapter.width - door.x + 20, chapter.height);
  g.fillStyle(0x1b242b).fillRect(door.x + 34, 62, chapter.width - door.x - 48, chapter.floor - 62);
  g.lineStyle(1, 0x43504f, 0.55).lineBetween(door.x + 34, 90, chapter.width - 14, 90);
  g.lineStyle(1, 0x334642, 0.7).strokeRect(door.x - 5, door.y - 5, door.w + 10, door.h + 5);
  g.fillStyle(0x8e9b91).fillRect(door.x - 3, door.y - 3, 4, door.h + 3).fillRect(door.x + door.w, door.y - 3, 4, door.h + 3);
  g.fillStyle(0xaebbb0).fillRect(door.x - 3, door.y - 4, door.w + 7, 4);
  // Office chair: back, seat, central stem, five-way base. This prop is not an enemy or a platform.
  g.fillStyle(0x0b1218, 0.5).fillEllipse(chair.x, chapter.floor - 1, 48, 8);
  g.fillStyle(0x87918d).fillRect(chair.x - 13, chair.y - 58, 26, 30);
  g.fillStyle(0x586a6b).fillRect(chair.x - 10, chair.y - 55, 20, 24);
  g.fillStyle(0x3b4f53).fillRect(chair.x - 5, chair.y - 28, 10, 10);
  g.fillStyle(0xa6aca0).fillRect(chair.x - 16, chair.y - 18, 32, 7);
  g.fillStyle(0x55666b).fillRect(chair.x - 13, chair.y - 11, 26, 3);
  g.fillStyle(0x8b9897).fillRect(chair.x - 2, chair.y - 8, 4, 19);
  g.lineStyle(3, 0x687a7c).lineBetween(chair.x, chair.y + 7, chair.x - 18, chair.y + 13).lineBetween(chair.x, chair.y + 7, chair.x + 18, chair.y + 13).lineBetween(chair.x, chair.y + 7, chair.x, chair.y + 16);
  g.fillStyle(0x252f34).fillRect(chair.x - 21, chair.y + 12, 6, 5).fillRect(chair.x + 15, chair.y + 12, 6, 5).fillRect(chair.x - 3, chair.y + 15, 6, 5);
  // Mirror footprint comes from the same authoring data as the real approach gate.
  g.fillStyle(0xc6bea9).fillRect(glass.x, glass.y, glass.w, glass.h);
  g.fillStyle(0x2c4651).fillRect(glass.x + 3, glass.y + 3, glass.w - 6, glass.h - 6);
  g.fillStyle(0x1f343f).fillRect(glass.x + 7, glass.y + 7, glass.w - 14, glass.h - 14);
  g.lineStyle(1, 0x9bbdbb, 0.35).lineBetween(glass.x + 8, glass.y + 32, glass.x + glass.w - 9, glass.y + 10);
  g.lineStyle(1, 0x9bbdbb, 0.23).lineBetween(glass.x + 8, glass.y + 55, glass.x + glass.w - 9, glass.y + 33);
}
