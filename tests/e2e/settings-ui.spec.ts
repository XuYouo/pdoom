import { expect, test } from '@playwright/test';

for (const [name, width, height] of [['desktop', 1440, 900], ['portrait', 390, 844], ['short', 844, 390]] as const) {
  test(`settings ${name}: controls and sticky dismissal stay reachable without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await expect(page.getByRole('button', { name: '开始新训练', exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByRole('button', { name: '音频设置', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '运行设置 / SETTINGS', exact: true });
    const sound = dialog.getByRole('region', { name: '原创游戏音频' });
    await expect(sound).toContainText('尚未解锁');
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `artifacts/ui-maturity-20261107/settings-${name}.png` });

    const mute = sound.getByRole('checkbox', { name: '静音全部音乐与音效', exact: true });
    await mute.check(); await expect(mute).toBeChecked();
    const slider = sound.getByRole('slider', { name: '主音量', exact: true });
    await slider.focus(); await slider.press('End'); await slider.press('ArrowLeft');
    await expect(slider).toHaveValue('99'); await expect(mute).toBeChecked();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.audio.v1')!))).toEqual({ version: 1, muted: true, volume: 0.99 });
    const system = dialog.getByRole('radio', { name: '跟随系统', exact: true });
    await system.focus(); await system.press('ArrowRight');
    await expect(dialog.getByRole('radio', { name: '减少动态效果', exact: true })).toBeChecked();
    await expect(dialog.getByRole('region', { name: '动态效果设置' })).toContainText('当前：减少动态效果');
    await dialog.locator('.settings-notes summary').click();
    const close = dialog.getByRole('button', { name: '关闭弹窗', exact: true });
    const bounds = await close.boundingBox();
    expect(bounds).not.toBeNull(); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `artifacts/ui-maturity-20261107/settings-${name}-motion.png` });
    await close.click(); await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: '音频设置', exact: true })).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBeNull();
  });
}
