import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function signInForCoop(page: Page, name: string) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '双人合作', exact: false })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: 'LOCAL AGENT / 云存档', exact: true }).click();
  await page.getByRole('tab', { name: '注册智能体', exact: true }).click();
  await page.getByLabel('玩家名称', { exact: true }).fill(name);
  await page.getByLabel('密码', { exact: true }).fill('coop_local_acceptance_password');
  await page.getByRole('button', { name: '创建智能体', exact: false }).click();
  await expect(page.getByText('已认证智能体', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.getByRole('button', { name: '双人合作', exact: false }).click();
  await expect(page.getByRole('button', { name: '创建合作房间', exact: false })).toBeEnabled();
}

async function reachable(control: Locator, page: Page) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  const box = await control.boundingBox(), size = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
}

for (const viewport of [{ name: 'portrait', width: 390, height: 844 }, { name: 'short', width: 844, height: 390 }]) {
  test(`real co-op ${viewport.name} lobby, HUD and nested pause settings remain reachable`, async ({ page: host, browser }, info) => {
    test.skip(process.env.PDOOM_E2E_BACKEND !== '1', 'Requires the explicitly configured temporary real Scala/PostgreSQL server.');
    test.setTimeout(90000);
    await host.setViewportSize(viewport);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guest = await context.newPage(), errors: string[] = [];
    for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
    try {
      const suffix = randomUUID().slice(0, 8);
      await signInForCoop(host, `ui_host_${suffix}`);
      await signInForCoop(guest, `ui_guest_${suffix}`);
      const saved = await Promise.all([host, guest].map(page => page.evaluate(() => localStorage.getItem('pdoom.save.v1'))));
      await host.getByRole('button', { name: '创建合作房间', exact: false }).click();
      const invitation = host.getByLabel('房间邀请码', { exact: true });
      await expect(invitation).toHaveValue(/^[A-Z2-9]{8}$/);
      await guest.getByLabel('使用邀请码加入', { exact: true }).fill(await invitation.inputValue());
      await guest.getByRole('button', { name: '加入合作房间', exact: false }).click();
      await expect(host.locator('.coop-seat[data-state="waiting"]')).toHaveCount(2);
      await host.getByRole('button', { name: '准备就绪', exact: true }).click();
      await guest.getByRole('button', { name: '准备就绪', exact: true }).click();
      const start = host.getByRole('button', { name: '开始双人训练', exact: false });
      await expect(start).toBeEnabled(); await reachable(start, host);
      await host.screenshot({ path: info.outputPath(`${viewport.name}-real-lobby.png`) });
      await start.click();
      const pauseButton = host.getByRole('button', { name: '暂停双人训练', exact: true });
      await expect(pauseButton).toBeEnabled({ timeout: 15000 });
      await expect(guest.getByRole('button', { name: '暂停双人训练', exact: true })).toBeEnabled({ timeout: 15000 });
      const metrics = await host.locator('.coop-play-hud').evaluate(root => {
        const top = root.querySelector('.coop-play-topline')!.getBoundingClientRect();
        const mission = root.querySelector('.coop-play-mission')!.getBoundingClientRect();
        const actions = root.querySelector('.coop-game-actions')!.getBoundingClientRect();
        return { topBottom: top.bottom, missionTop: mission.top, missionBottom: mission.bottom, actionsTop: actions.top, actionsRight: actions.right, actionsLeft: actions.left, viewportWidth: innerWidth };
      });
      expect(metrics.missionTop).toBeGreaterThanOrEqual(metrics.topBottom);
      expect(metrics.missionBottom).toBeLessThan(metrics.actionsTop);
      expect(metrics.actionsLeft).toBeGreaterThanOrEqual(0);
      expect(metrics.actionsRight).toBeLessThanOrEqual(metrics.viewportWidth);
      await host.screenshot({ path: info.outputPath(`${viewport.name}-real-team-hud.png`) });
      await pauseButton.click();
      const pause = host.getByRole('dialog', { name: '双人训练已暂停', exact: true });
      await expect(pause).toBeVisible();
      await reachable(pause.getByRole('button', { name: '恢复双人训练', exact: false }), host);
      await host.screenshot({ path: info.outputPath(`${viewport.name}-real-pause.png`) });
      await pause.getByRole('button', { name: '声音与动态设置', exact: true }).click();
      const settings = host.getByRole('dialog', { name: '合作设置 / SETTINGS', exact: true });
      await expect(settings).toBeVisible();
      await settings.getByRole('checkbox', { name: '静音全部音乐与音效', exact: true }).check();
      await expect(settings.getByRole('checkbox', { name: '静音全部音乐与音效', exact: true })).toBeChecked();
      for (const key of ['Tab', 'Shift+Tab']) for (let step = 0; step < 12; step++) {
        await host.keyboard.press(key);
        await expect.poll(() => settings.evaluate(node => node.contains(document.activeElement))).toBe(true);
      }
      await reachable(settings.getByRole('button', { name: '关闭弹窗', exact: true }), host);
      await host.screenshot({ path: info.outputPath(`${viewport.name}-real-settings.png`) });
      await host.keyboard.press('Escape');
      await expect(settings).toHaveCount(0); await expect(pause).toBeVisible();
      await expect(host.locator('.coop-play-hud .pause-button')).toBeDisabled();
      await pause.getByRole('button', { name: '恢复双人训练', exact: false }).click();
      await expect(pauseButton).toBeEnabled();
      await expect(host.locator('canvas')).toBeFocused();
      await pauseButton.click();
      await pause.getByRole('button', { name: '结束合作并返回', exact: true }).click();
      await expect(host.getByRole('button', { name: '双人合作', exact: false })).toBeEnabled();
      await expect(guest.getByRole('dialog', { name: '合作已结束', exact: true })).toBeVisible();
      await guest.getByRole('button', { name: '返回终端', exact: true }).click();
      expect(await Promise.all([host, guest].map(page => page.evaluate(() => localStorage.getItem('pdoom.save.v1'))))).toEqual(saved);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
