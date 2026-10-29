import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';

/** Only persisted DTO inspection: never access Phaser, the engine/world or private simulation state. */
const storedSave = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.save.v1') ?? 'null'));

for (const fault of ['missing-png', 'missing-twelfth-frame'] as const) {
  test(`Gato ${fault} blocks starting and preserves the complete checkpoint through explicit retry`, async ({ page }) => {
    const original: GameSaveData = { ...createRun(randomUUID(), 42), checkpoint: 2, elapsedMs: 10000 };
    expect(isGameSave(original)).toBe(true);
    const pattern = fault === 'missing-png' ? '**/game/gato.png*' : '**/game/gato.json*';
    let brokenAtlas: string | undefined;
    if (fault === 'missing-twelfth-frame') {
      const atlas = JSON.parse(await readFile('public/game/gato.json', 'utf8')) as { frames: { filename: string }[] };
      expect(atlas.frames).toHaveLength(12); expect(atlas.frames[11].filename).toBe('gato 11.aseprite');
      // Keep the actual metadata and the first eleven actual entries; change no other atlas content.
      brokenAtlas = JSON.stringify({ ...atlas, frames: atlas.frames.slice(0, 11) });
    }
    let intercepted = 0;
    const intercept = async (route: Route) => {
      intercepted++;
      if (fault === 'missing-png') await route.abort('failed');
      else await route.fulfill({ contentType: 'application/json', body: brokenAtlas! });
    };
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(pattern, intercept);
    await page.addInitScript(value => {
      // A reload must not overwrite corrupted or changed storage and manufacture a false preservation pass.
      if (localStorage.getItem('pdoom.save.v1') === null) localStorage.setItem('pdoom.save.v1', JSON.stringify(value));
    }, original);
    await page.goto('/');

    const alert = page.getByRole('alert', { name: '游戏资源加载失败' });
    await expect(alert).toContainText('Gato 三形态图集加载失败', { timeout: 15000 });
    await expect(alert).toContainText('本地检查点未改动');
    await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
    expect(intercepted).toBeGreaterThan(0);
    expect(await storedSave(page)).toEqual(original);

    await page.unroute(pattern, intercept);
    const resourcePath = fault === 'missing-png' ? '/game/gato.png' : '/game/gato.json';
    const reloadedResource = page.waitForResponse(response => new URL(response.url()).pathname === resourcePath && response.status() === 200);
    await alert.getByRole('button', { name: '刷新并重试', exact: true }).click();
    await reloadedResource;
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeEnabled();
    await expect(alert).toBeHidden();
    // Do not start or restore: this retry must not create a new attempt/runId or advance any gameplay counter.
    expect(await storedSave(page)).toEqual(original);
    expect(errors).toEqual([]);
    console.log('GATO_RESOURCE_RETRY', { fault, checkpoint: original.checkpoint, runIdPreserved: original.runId, elapsedMs: original.elapsedMs, intercepted });
  });
}
