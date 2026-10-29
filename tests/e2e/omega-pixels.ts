import type { Page } from '@playwright/test';

/** Reads only the composited canvas PNG. No Phaser reference, world state or simulation mutation. */
export const omegaPixels = (page: Page) => page.evaluate(() => new Promise<{
  hero: { x: number; y: number; count: number } | null;
  mirror: { x: number; y: number } | null;
  hostilePixels: number;
}>((resolve, reject) => {
  requestAnimationFrame(() => {
    const source = document.querySelector('canvas'); if (!source) { reject(new Error('Canvas missing')); return; }
    const image = new Image();
    image.onload = () => {
      const probe = document.createElement('canvas'); probe.width = 640; probe.height = 360;
      const ctx = probe.getContext('2d')!; ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, 640, 360);
      const pixels = ctx.getImageData(0, 0, 640, 360).data, ink = new Uint8Array(640 * 360);
      let markerCount = 0, markerX = 0, markerY = 0, hostilePixels = 0;
      for (let index = 0; index < ink.length; index++) {
        const offset = index * 4, r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
        if (r === 212 && g === 176 && b === 255) { markerCount++; markerX += index % 640; markerY += Math.floor(index / 640); }
        if (r === 199 && g === 164 && b === 245) hostilePixels++;
        if (r === 217 && g === 119 && b === 87 || Math.abs(r - 140) <= 1 && g === 119 && Math.abs(b - 82) <= 1) ink[index] = 1;
      }
      const mirror = markerCount >= 5 ? { x: markerX / markerCount, y: markerY / markerCount + 55 } : null;
      const clusters: { x: number; y: number; count: number }[] = [];
      for (let index = 0; index < ink.length; index++) {
        if (!ink[index]) continue;
        const stack = [index]; ink[index] = 0; let count = 0, xSum = 0, ySum = 0;
        while (stack.length) {
          const next = stack.pop()!, x = next % 640, y = Math.floor(next / 640); count++; xSum += x; ySum += y;
          const neighbors = [x > 0 ? next - 1 : -1, x < 639 ? next + 1 : -1, y > 0 ? next - 640 : -1, y < 359 ? next + 640 : -1];
          for (const neighbor of neighbors) if (neighbor >= 0 && ink[neighbor]) { ink[neighbor] = 0; stack.push(neighbor); }
        }
        if (count >= 12) clusters.push({ x: xSum / count, y: ySum / count, count });
      }
      const hero = clusters.filter(cluster => !mirror || Math.abs(cluster.x - mirror.x) > 22).sort((a, b) => b.count - a.count)[0] ?? null;
      resolve({ hero, mirror, hostilePixels });
    };
    image.onerror = () => reject(new Error('Canvas PNG could not decode'));
    image.src = source.toDataURL('image/png');
  });
}));
