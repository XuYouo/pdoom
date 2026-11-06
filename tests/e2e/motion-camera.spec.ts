import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { assertCheckpointAttempt } from './checkpoint-attempt';
import { assertLiveDamage, assertReducedTrace, attachMotion, captureGroundMotion } from './motion-capture';
test.setTimeout(60000);
for (const mode of ['normal', 'forced', 'system'] as const) {
  test(`motion camera ${mode}: actual new damage keeps gameplay while the rendered ground proves the effect policy`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const save = { ...createRun(randomUUID(), 42), checkpoint: 0, elapsedMs: 10000 };
    await page.setViewportSize({ width: 1280, height: 720 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(({ save, mode }) => {
      localStorage.setItem('pdoom.save.v1', JSON.stringify(save));
      if (mode === 'forced') localStorage.setItem('pdoom.motion.v1', JSON.stringify({ version: 1, mode: 'reduced' }));
    }, { save, mode });
    if (mode === 'system') {
      let release = () => {}, requested = false;
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/game/clawd-aligned.png', async route => { requested = true; await gate; await route.continue(); });
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' }); await expect.poll(() => requested).toBe(true);
        await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeDisabled();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(page.locator('.game-shell')).toHaveAttribute('data-reduced-motion', 'true');
      } finally { release(); }
    } else await page.goto('/');
    await expect(page.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    await expect(page.locator('.game-shell')).toHaveAttribute('data-reduced-motion', String(mode !== 'normal'));
    await page.getByRole('button', { name: '恢复检查点', exact: true }).click(); await assertCheckpointAttempt(page, save);
    // Established ordinary route to a living parrot; no fire, jump, dash, live HP or position writes.
    await page.keyboard.down('d'); await page.waitForTimeout(950); await page.keyboard.up('d'); await page.waitForTimeout(700);
    const checkpoint = await page.evaluate(() => localStorage.getItem('pdoom.save.v1'));
    const trace = await captureGroundMotion(page); await attachMotion(info, mode, trace); assertLiveDamage(trace);
    const positions = [...new Set(trace.frames.map(frame => frame.groundRow))].sort((a, b) => a - b);
    if (mode === 'normal') {
      expect(trace.frames.some(frame => frame.groundChangedPixels > 0)).toBe(true); expect(positions.at(-1)! - positions[0]).toBeLessThanOrEqual(2);
      assert.throws(() => assertReducedTrace(trace), /Reduced mode still/);
    } else assertReducedTrace(trace);
    expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBe(checkpoint);
    expect(await page.evaluate(() => localStorage.getItem('pdoom.motion.v1'))).toBe(mode === 'forced' ? '{"version":1,"mode":"reduced"}' : null);
    expect(errors).toEqual([]);
  });
}
