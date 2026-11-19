import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { deserializeCoopWorld } from '../../src/pages/GamePage/game/coop/serialization';
import type { CoopWorldState } from '../../src/pages/GamePage/game/coop/model';
import { CdpTouch } from './cdp-touch';
import { clawdBytes, clawdFrames, clawdSource, inspectClawd, type ClawdSource } from './clawd-pixels';

const touchRoot = (page: Page) => page.locator('[aria-label="触屏操作"]');
const control = (page: Page, action: string) => touchRoot(page).locator(`[data-touch-control="${action}"]`);
const touchPause = (page: Page) => page.getByRole('button', { name: '暂停触屏训练', exact: true });
const soloPause = (page: Page) => page.getByRole('dialog', { name: '暂停前向传播。', exact: true });
const coopPause = (page: Page) => page.getByRole('dialog', { name: '双人训练已暂停', exact: true });
const right = { x: 0.85, y: 0.5 }, left = { x: 0.15, y: 0.5 };

async function actualHits(page: Page, source: ClawdSource, duration = 0) {
  return (await clawdFrames(page, duration)).flatMap(frame => inspectClawd(clawdBytes(frame), source, 'aligned'));
}

async function actualHero(page: Page, source: ClawdSource) {
  const hits = await actualHits(page, source);
  expect(hits.length, 'the actual native canvas must contain the source Clawd pixels').toBeGreaterThan(0);
  expect(new Set(hits.map(hit => `${hit.x},${hit.y}`)).size).toBe(1);
  return hits[0];
}

async function assertReachableControls(page: Page) {
  await expect(touchRoot(page)).toBeVisible();
  const size = page.viewportSize()!;
  for (const action of ['move', 'aim', 'jump', 'dash', 'rewind', 'insight']) {
    const box = await control(page, action).boundingBox();
    expect(box, `${action} has a rendered touch target`).not.toBeNull();
    expect(box!.width, `${action} target width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${action} target height`).toBeGreaterThanOrEqual(44);
    expect(box!.x, `${action} starts inside the viewport`).toBeGreaterThanOrEqual(0);
    expect(box!.y, `${action} starts inside the viewport`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

for (const viewport of [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 844, height: 390 }]) {
  test.describe(`native mobile touch ${viewport.name}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    test('three fingers move, fire and jump; pause and rotation clear held input', async ({ page }, info) => {
      test.setTimeout(60000);
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      const source = await clawdSource(), touch = await CdpTouch.create(page);
      try {
        await page.goto('/');
        const start = page.getByRole('button', { name: '开始新训练', exact: true });
        await expect(start).toBeEnabled({ timeout: 15000 }); await start.tap();
        await assertReachableControls(page);
        // Wait for the normal initial invulnerability blink; never modify the world.
        await expect.poll(async () => {
          const time = /(\d+):(\d{2})/.exec(await page.locator('.hud-cell').last().innerText());
          return time ? Number(time[1]) * 60 + Number(time[2]) : 0;
        }).toBeGreaterThanOrEqual(1);
        const before = await actualHero(page, source);
        await touch.down(1, control(page, 'move'), right);
        await touch.down(2, control(page, 'aim'));
        const combatFrames = actualHits(page, source, 350);
        await touch.down(3, control(page, 'jump'));
        const combat = await combatFrames;
        expect(combat.some(hit => hit.x > before.x + 12 && hit.y < before.y - 15 && hit.phase === 'fire'),
          'the native sprite must move, jump and show the firing pose while three real contacts are held').toBe(true);
        await page.screenshot({ path: info.outputPath(`${viewport.name}-three-finger-combat.png`) });

        // A fourth genuine finger pauses while the movement/fire/jump contacts are still active.
        await touch.down(4, touchPause(page));
        await expect(soloPause(page)).toBeVisible();
        await touch.endAll();
        const frozen = await actualHero(page, source), frozenTime = await page.locator('.hud-cell').last().innerText();
        const paused = await actualHits(page, source, 250);
        expect(paused.length).toBeGreaterThan(2);
        expect(paused.every(hit => hit.x === frozen.x && hit.y === frozen.y)).toBe(true);
        expect(await page.locator('.hud-cell').last().innerText()).toBe(frozenTime);
        await soloPause(page).getByRole('button', { name: '继续训练', exact: false }).tap();
        await expect(soloPause(page)).toHaveCount(0);
        await page.waitForTimeout(600); // Normal fall/attack recovery is allowed to finish after releasing the fingers.
        const resumed = await actualHero(page, source), idle = await actualHits(page, source, 300);
        expect(idle.length).toBeGreaterThan(2);
        expect(idle.every(hit => hit.x === resumed.x && hit.phase === 'base'), 'resume must not retain movement or auto-fire').toBe(true);

        // Resize through the browser while two contacts remain held. This is not a synthetic DOM orientation event.
        await touch.down(1, control(page, 'move'), right);
        await touch.down(2, control(page, 'aim'));
        await page.waitForTimeout(100);
        await page.setViewportSize({ width: viewport.height, height: viewport.width });
        await assertReachableControls(page);
        await page.waitForTimeout(350);
        const rotated = await actualHero(page, source), afterRotation = await actualHits(page, source, 300);
        expect(afterRotation.length).toBeGreaterThan(2);
        expect(afterRotation.every(hit => hit.x === rotated.x && hit.phase === 'base'), 'rotation must clear held movement and shooting').toBe(true);
        await touch.cancelAll();
        // Recompute the actual target position after rotation, then verify a fresh opposite-direction touch works.
        await touch.down(1, control(page, 'move'), left);
        const movingLeft = await actualHits(page, source, 250);
        await touch.endAll();
        expect(movingLeft.some(hit => hit.x < rotated.x - 15)).toBe(true);
        await page.screenshot({ path: info.outputPath(`${viewport.name}-rotated-controls-recovered.png`) });

        const insight = control(page, 'insight'), rewind = control(page, 'rewind');
        await expect(insight).toHaveAttribute('aria-disabled', 'false');
        await touch.down(1, insight); await touch.endAll();
        await expect(insight).toHaveAttribute('aria-disabled', 'true');
        await expect(insight).toHaveAttribute('title', /效果剩余 \d+\.\ds/);
        await expect(insight.locator('small')).toHaveText(/^\d+\.\ds$/);
        const effectSeconds = Number.parseFloat(await insight.locator('small').innerText());
        await expect.poll(async () => Number.parseFloat(await insight.locator('small').innerText())).toBeLessThan(effectSeconds);
        await expect(rewind).toHaveAttribute('aria-disabled', 'false');
        await touch.down(1, rewind); await touch.endAll();
        await expect(rewind).toHaveAttribute('aria-disabled', 'true');
        await expect(rewind).toHaveAttribute('title', /正在沿真实轨迹回退|回溯冷却剩余/);
        await expect(rewind.locator('small')).toHaveText(/^\d+\.\ds$/);
        await page.screenshot({ path: info.outputPath(`${viewport.name}-touch-skills-feedback.png`) });
        expect(errors).toEqual([]);
      } finally { await touch.dispose(); }
    });
  });
}

function observeWire(page: Page, direction: 'framesent' | 'framereceived') {
  const evidence: { state: CoopWorldState | null; paused: boolean; multiTouchInput: boolean } = { state: null, paused: true, multiTouchInput: false };
  const capture = (frame: { payload: string | Buffer }) => {
    try {
      const packet = JSON.parse(typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8'));
      // Observe only public gameplay frames; never retain auth tokens or account messages.
      if (packet.type === 'input') {
        evidence.multiTouchInput ||= packet.payload?.move === 1 && packet.payload?.fire === true && packet.payload?.jumpHeld === true;
      } else if (packet.type === 'state') {
        const state = deserializeCoopWorld(packet.payload?.world);
        if (state) { evidence.state = state; evidence.paused = packet.payload.paused; }
      }
    } catch { /* Explicit world/input assertions fail if no valid frames arrive. */ }
  };
  page.on('websocket', socket => {
    if (direction === 'framesent') socket.on('framesent', capture);
    else socket.on('framereceived', capture);
  });
  return evidence;
}

async function register(page: Page, name: string) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '双人合作', exact: false })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: 'LOCAL AGENT / 云存档', exact: true }).click();
  await page.getByRole('tab', { name: '注册智能体', exact: true }).click();
  await page.getByLabel('玩家名称', { exact: true }).fill(name);
  await page.getByLabel('密码', { exact: true }).fill('mobile_local_acceptance_password');
  await page.getByRole('button', { name: '创建智能体', exact: false }).click();
  await expect(page.getByText('已认证智能体', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.getByRole('button', { name: '双人合作', exact: false }).click();
  await expect(page.getByRole('button', { name: '创建合作房间', exact: false })).toBeEnabled();
}

test('real co-op guest sends three-finger input over Scala WebSocket and pauses without residual fire', async ({ page: host, browser }, info) => {
  test.skip(process.env.PDOOM_E2E_BACKEND !== '1', 'Requires a separately configured isolated Scala/PostgreSQL acceptance database.');
  test.setTimeout(90000);
  const context = await browser.newContext({ baseURL: process.env.GAME_TEST_URL ?? 'http://127.0.0.1:8084',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const guest = await context.newPage(), touch = await CdpTouch.create(guest);
  const errors: string[] = [];
  for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
  const hostWire = observeWire(host, 'framesent'), guestWire = observeWire(guest, 'framereceived'), guestInput = observeWire(guest, 'framesent');
  try {
    const suffix = randomUUID().slice(0, 8);
    await register(host, `test_mobile_host_${suffix}`); await register(guest, `test_mobile_guest_${suffix}`);
    const saves = await Promise.all([host, guest].map(page => page.evaluate(() => localStorage.getItem('pdoom.save.v1'))));
    await host.getByRole('button', { name: '创建合作房间', exact: false }).click();
    const code = host.getByLabel('房间邀请码', { exact: true });
    await expect(code).toHaveValue(/^[A-Z2-9]{8}$/);
    await guest.getByLabel('使用邀请码加入', { exact: true }).fill(await code.inputValue());
    await guest.getByRole('button', { name: '加入合作房间', exact: false }).click();
    await expect(host.locator('.coop-seat[data-state="waiting"]')).toHaveCount(2);
    await host.getByRole('button', { name: '准备就绪', exact: true }).click();
    await guest.getByRole('button', { name: '准备就绪', exact: true }).tap();
    const start = host.getByRole('button', { name: '开始双人训练', exact: false });
    await expect(start).toBeEnabled(); await start.click();
    await expect(touchPause(guest)).toBeEnabled({ timeout: 15000 });
    await assertReachableControls(guest);
    await expect.poll(() => hostWire.state?.tick ?? 0).toBeGreaterThan(2);
    await expect.poll(() => guestWire.state?.run.runId).toBe(hostWire.state!.run.runId);
    const before = { p1: hostWire.state!.players.p1.actor.x, p2: hostWire.state!.players.p2.actor.x,
      y: hostWire.state!.players.p2.actor.y, shots: hostWire.state!.players.p2.actionCounts.shots };
    await touch.down(1, control(guest, 'move'), right);
    await touch.down(2, control(guest, 'aim'));
    await touch.down(3, control(guest, 'jump'));
    await expect.poll(() => guestInput.multiTouchInput, { intervals: [20] }).toBe(true);
    await expect.poll(() => hostWire.state!.players.p2.actor.x, { intervals: [20] }).toBeGreaterThan(before.p2 + 12);
    await expect.poll(() => hostWire.state!.players.p2.actor.y, { intervals: [20] }).toBeLessThan(before.y - 15);
    await expect.poll(() => hostWire.state!.players.p2.actionCounts.shots, { intervals: [20] }).toBeGreaterThan(before.shots);
    await expect.poll(() => guestWire.state!.players.p2.actor.x).toBeGreaterThan(before.p2 + 12);
    expect(Math.abs(hostWire.state!.players.p1.actor.x - before.p1)).toBeLessThan(3);
    expect(hostWire.state!.players.p1.actionCounts.shots).toBe(0);
    await guest.screenshot({ path: info.outputPath('real-guest-three-finger-combat.png') });

    // Keep all three contacts held and drag the existing aim finger upward. Old
    // horizontal bullets do not satisfy this check: the projectile id must be new.
    const firstAimedBulletId = hostWire.state!.shared.nextBulletId;
    await touch.move(2, control(guest, 'aim'), { x: 0.5, y: 0.15 });
    const upwardBullet = () => hostWire.state!.shared.bullets.find(bullet => bullet.ownerPlayerId === 'p2'
      && bullet.id >= firstAimedBulletId && bullet.vy < -100 && Math.abs(bullet.vx) < Math.abs(bullet.vy) * 0.25);
    await expect.poll(() => !!upwardBullet(), { intervals: [20] }).toBe(true);
    const aimedBullet = upwardBullet()!;
    await writeFile(info.outputPath('guest-drag-aim-up.json'), JSON.stringify({ firstAimedBulletId,
      tick: hostWire.state!.tick, player: hostWire.state!.players.p2.actor, bullet: aimedBullet }, null, 2));
    await guest.screenshot({ path: info.outputPath('real-guest-drag-aim-up.png') });

    await touch.down(4, touchPause(guest));
    await expect(coopPause(host)).toBeVisible(); await expect(coopPause(guest)).toBeVisible();
    await touch.endAll();
    await expect.poll(() => hostWire.paused).toBe(true); await expect.poll(() => guestWire.paused).toBe(true);
    const frozen = hostWire.state!.tick;
    await guest.waitForTimeout(300); expect(hostWire.state!.tick).toBe(frozen);
    await coopPause(host).getByRole('button', { name: '恢复双人训练', exact: false }).click();
    await expect(touchPause(guest)).toBeEnabled();
    await expect.poll(() => hostWire.state!.tick).toBeGreaterThan(frozen);
    await expect.poll(() => hostWire.state!.players.p2.actor.vx).toBe(0);
    await guest.waitForTimeout(250);
    const resumed = { x: hostWire.state!.players.p2.actor.x, shots: hostWire.state!.players.p2.actionCounts.shots };
    await guest.waitForTimeout(400);
    expect(hostWire.state!.players.p2.actor.x).toBe(resumed.x);
    expect(hostWire.state!.players.p2.actionCounts.shots).toBe(resumed.shots);
    await expect.poll(() => guestWire.state!.players.p2.actor.vx).toBe(0);

    await touch.down(1, touchPause(guest)); await touch.endAll();
    await expect(coopPause(host)).toBeVisible();
    await guest.screenshot({ path: info.outputPath('real-guest-paused-after-touch-release.png') });
    await coopPause(host).getByRole('button', { name: '结束合作并返回', exact: true }).click();
    await expect(guest.getByRole('dialog', { name: '合作已结束', exact: true })).toBeVisible();
    await guest.getByRole('button', { name: '返回终端', exact: true }).tap();
    await expect(host.getByRole('button', { name: '双人合作', exact: false })).toBeEnabled({ timeout: 15000 });
    await expect(guest.getByRole('button', { name: '双人合作', exact: false })).toBeEnabled({ timeout: 15000 });
    expect(await Promise.all([host, guest].map(page => page.evaluate(() => localStorage.getItem('pdoom.save.v1'))))).toEqual(saves);
    expect(errors).toEqual([]);
  } finally { await touch.dispose(); await context.close(); }
});

test('native touch fullscreen after activation expiry and small-screen guide/settings stay usable', async ({ browser }, info) => {
  test.setTimeout(60000);
  for (const viewport of [{ width: 360, height: 640 }, { width: 667, height: 375 }]) {
    const label = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ baseURL: process.env.GAME_TEST_URL ?? 'http://127.0.0.1:8084',
      viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const nativeTap = async (point: { x: number; y: number }) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...point }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const displayState = async () => {
      // Playwright's regular evaluate/locator helpers use userGesture:true.
      // Explicitly false here: observing activation must never renew it.
      const response = await cdp.send('Runtime.evaluate', { returnByValue: true, userGesture: false,
        expression: '({ active: navigator.userActivation.isActive, used: navigator.userActivation.hasBeenActive, fullscreen: document.fullscreenElement === document.querySelector("main.game-shell"), empty: document.fullscreenElement === null })' });
      expect(response.exceptionDetails).toBeUndefined();
      return response.result.value as { active: boolean; used: boolean; fullscreen: boolean; empty: boolean };
    };
    const reachableDialog = async (dialog: Locator) => {
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const close = dialog.getByRole('button', { name: '关闭弹窗', exact: true });
      await expect(close).toBeVisible();
      const box = await close.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    };
    try {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.goto('/');
      const start = page.getByRole('button', { name: '开始新训练', exact: true });
      await expect(start).toBeEnabled({ timeout: 15000 }); await start.tap();
      await assertReachableControls(page);
      const targets = touchRoot(page).locator('[data-touch-control], button');
      expect(await targets.count()).toBeGreaterThanOrEqual(10);
      for (const target of await targets.all()) {
        const box = await target.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      }
      const fullscreen = page.getByRole('button', { name: '切换触屏全屏', exact: true });
      await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
      const box = await fullscreen.boundingBox(); expect(box).not.toBeNull();
      const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
      // Resolve all DOM geometry BEFORE waiting. No locator or ordinary evaluate
      // is called between expiry and the real touch, avoiding a false activation.
      await page.waitForTimeout(6100);
      const before = await displayState();
      expect(before.used).toBe(true); expect(before.active).toBe(false); expect(before.empty).toBe(true);
      await nativeTap(point);
      await expect.poll(async () => (await displayState()).fullscreen).toBe(true);
      await expect(fullscreen).toHaveAttribute('aria-pressed', 'true'); await expect(fullscreen).toContainText('退出');
      await page.screenshot({ path: info.outputPath(`${label}-native-fullscreen.png`) });
      const exitBox = await fullscreen.boundingBox(); expect(exitBox).not.toBeNull();
      await nativeTap({ x: exitBox!.x + exitBox!.width / 2, y: exitBox!.y + exitBox!.height / 2 });
      await expect.poll(async () => (await displayState()).empty).toBe(true);
      await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
      await writeFile(info.outputPath(`${label}-fullscreen-activation.json`), JSON.stringify({ viewport, beforeTouch: before,
        enteredGameShell: true, exited: true, stateReadsGrantUserGesture: false }, null, 2));

      await touchPause(page).tap(); await expect(soloPause(page)).toBeVisible();
      await soloPause(page).getByRole('button', { name: '操作指南', exact: true }).tap();
      const guide = page.getByRole('dialog', { name: '操作手册 / FIELD MANUAL', exact: true });
      await expect(guide.getByText('左盘移动，右盘瞄准。', { exact: true })).toBeVisible();
      await reachableDialog(guide);
      await page.screenshot({ path: info.outputPath(`${label}-touch-guide.png`) });
      await guide.getByRole('button', { name: '关闭弹窗', exact: true }).tap();
      await expect(soloPause(page)).toBeVisible();
      await soloPause(page).getByRole('button', { name: '音频设置', exact: true }).tap();
      const settings = page.getByRole('dialog', { name: '运行设置 / SETTINGS', exact: true });
      await reachableDialog(settings);
      await page.screenshot({ path: info.outputPath(`${label}-touch-settings.png`) });
      await settings.getByRole('button', { name: '关闭弹窗', exact: true }).tap();
      await expect(soloPause(page)).toBeVisible();
      expect(errors).toEqual([]);
    } finally { await cdp.detach(); await context.close(); }
  }
});
