import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { deserializeCoopWorld } from '../../src/pages/GamePage/game/coop/serialization';
import type { CoopWorldState } from '../../src/pages/GamePage/game/coop/model';

// Read the actual public WebSocket stream; never access or mutate Phaser's private world.
function observeWorld(page: Page, direction: 'framesent' | 'framereceived') {
  const evidence: { state: CoopWorldState | null; paused: boolean; states: number; bytes: number } = { state: null, paused: true, states: 0, bytes: 0 };
  const capture = (frame: { payload: string | Buffer }) => {
    try {
      const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8');
      const packet = JSON.parse(text);
      if (packet.type !== 'state') return; // Do not retain credentials or any account messages.
      const state = deserializeCoopWorld(packet.payload?.world);
      if (state) { evidence.state = state; evidence.paused = packet.payload.paused; evidence.states++; evidence.bytes = Math.max(evidence.bytes, Buffer.byteLength(text)); }
    } catch { /* The explicit protocol checks below fail if no valid world is delivered. */ }
  };
  page.on('websocket', socket => { if (direction === 'framesent') socket.on('framesent', capture); else socket.on('framereceived', capture); });
  return evidence;
}
async function register(page: Page, name: string) {
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
const playing = (page: Page) => page.getByRole('button', { name: '暂停双人训练', exact: true });
const pause = (page: Page) => page.getByRole('dialog', { name: '双人训练已暂停', exact: true });

test('real Scala two-account co-op shares one world, independent controls, pause, reconnect and isolated solo saves', async ({ page: host, browser }, info) => {
  test.skip(process.env.PDOOM_E2E_BACKEND !== '1', 'Requires the explicitly configured temporary real Scala/PostgreSQL server.');
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
  let guestServer: WebSocketRoute | null = null;
  // A transparent real-server proxy supplies one deterministic socket disconnect, not mock state.
  await guest.routeWebSocket('**/realtime/coop', route => { guestServer = route.connectToServer(); });
  const hostWire = observeWorld(host, 'framesent'), guestWire = observeWorld(guest, 'framereceived');
  const original = [createRun(randomUUID(), 123), { ...createRun(randomUUID(), 321), stage: 3, checkpoint: 0 }];
  try {
    for (const [index, page] of [host, guest].entries()) await page.addInitScript(save => {
      if (!sessionStorage.getItem('coop.acceptance.fixture')) {
        localStorage.setItem('pdoom.save.v1', JSON.stringify(save)); sessionStorage.setItem('coop.acceptance.fixture', 'once');
      }
    }, original[index]);
    const suffix = randomUUID().slice(0, 8);
    await register(host, `coop_host_${suffix}`); await register(guest, `coop_guest_${suffix}`);
    const saved = await Promise.all([host, guest].map(page => page.evaluate(() => localStorage.getItem('pdoom.save.v1'))));
    await host.getByRole('button', { name: '创建合作房间', exact: false }).click();
    const invitation = host.getByLabel('房间邀请码', { exact: true });
    await expect(invitation).toHaveValue(/^[A-Z2-9]{8}$/);
    await guest.getByLabel('使用邀请码加入', { exact: true }).fill(await invitation.inputValue());
    await guest.getByRole('button', { name: '加入合作房间', exact: false }).click();
    await expect(host.locator('.coop-seat[data-state="waiting"]')).toHaveCount(2);
    await host.getByRole('button', { name: '准备就绪', exact: true }).click();
    await guest.getByRole('button', { name: '准备就绪', exact: true }).click();
    await expect(host.getByRole('button', { name: '开始双人训练', exact: false })).toBeEnabled();
    await host.screenshot({ path: info.outputPath('real-online-lobby.png') });
    await host.getByRole('button', { name: '开始双人训练', exact: false }).click();
    await expect(playing(host)).toBeEnabled({ timeout: 15000 }); await expect(playing(guest)).toBeEnabled({ timeout: 15000 });
    await expect.poll(() => guestWire.state?.shared.chapter.stage).toBe(1);
    await expect.poll(() => hostWire.state?.tick ?? 0).toBeGreaterThan(2);
    expect(hostWire.state?.run.runId).toBe(guestWire.state?.run.runId);
    const before = { p1: hostWire.state!.players.p1.actor.x, p2: hostWire.state!.players.p2.actor.x };
    await guest.locator('canvas').focus(); await guest.keyboard.down('d'); await guest.waitForTimeout(500); await guest.keyboard.up('d');
    await expect.poll(() => hostWire.state!.players.p2.actor.x).toBeGreaterThan(before.p2 + 45);
    await expect.poll(() => guestWire.state!.players.p2.actor.x).toBeGreaterThan(before.p2 + 45);
    expect(Math.abs(hostWire.state!.players.p1.actor.x - before.p1)).toBeLessThan(3);
    await expect.poll(() => hostWire.state!.players.p2.actor.vx).toBe(0);
    await expect.poll(() => guestWire.state!.players.p2.actor.vx).toBe(0);
    const p2 = hostWire.state!.players.p2.actor.x;
    await host.locator('canvas').focus(); await host.keyboard.down('d'); await host.waitForTimeout(280); await host.keyboard.up('d');
    await expect.poll(() => hostWire.state!.players.p1.actor.x).toBeGreaterThan(before.p1 + 20);
    expect(Math.abs(hostWire.state!.players.p2.actor.x - p2)).toBeLessThan(3);
    const beforeCombat = { score: hostWire.state!.run.score, tokens: hostWire.state!.run.tokens,
      enemies: hostWire.state!.shared.enemies.filter(enemy => enemy.hp > 0).map(enemy => enemy.id) };
    await guest.keyboard.down('j');
    await expect.poll(() => hostWire.state!.players.p2.actionCounts.shots).toBeGreaterThan(0);
    await expect.poll(() => hostWire.state!.shared.bullets.some(bullet => bullet.ownerPlayerId === 'p2')).toBe(true);
    await guest.keyboard.up('j');
    expect(hostWire.state!.players.p1.actionCounts.shots).toBe(0);
    // The host now shoots from its own earlier position. Its natural projectile
    // range reaches the first enemy, but cannot accidentally reach the second.
    await host.locator('canvas').focus(); await host.keyboard.down('j');
    try {
      await expect.poll(() => hostWire.state!.players.p1.actionCounts.shots).toBeGreaterThan(0);
      await expect.poll(() => hostWire.state!.shared.enemies.find(enemy => enemy.id === 'parrot-1')?.hp, { intervals: [20], timeout: 5000 }).toBe(0);
    } finally { await host.keyboard.up('j'); }
    await expect.poll(() => hostWire.state!.shared.bullets.filter(bullet => bullet.ownerPlayerId === 'p1' || bullet.ownerPlayerId === 'p2').length).toBe(0);
    const killed = hostWire.state!.shared.enemies.filter(enemy => beforeCombat.enemies.includes(enemy.id) && enemy.hp === 0).map(enemy => enemy.id);
    expect(killed).toEqual(['parrot-1']);
    expect(hostWire.state!.run.tokens).toBe(beforeCombat.tokens + 6);
    expect(hostWire.state!.run.score).toBe(beforeCombat.score + 120);
    await expect.poll(() => guestWire.state!.shared.enemies.filter(enemy => killed.includes(enemy.id) && enemy.hp === 0).length).toBe(killed.length);
    await expect.poll(() => guestWire.state!.run.score).toBe(hostWire.state!.run.score);
    await host.screenshot({ path: info.outputPath('real-coop-host-independent-players.png') });
    await guest.screenshot({ path: info.outputPath('real-coop-guest-same-world.png') });

    // Navigate using real key presses and the public wire position. A short
    // correction accommodates input transit and normal braking, without moving
    // either actor directly or relaxing the pickup's actual collision radius.
    async function approachFirstPlatform(page: Page, id: 'p1' | 'p2') {
      await page.locator('canvas').focus(); await page.keyboard.down('d');
      try { await expect.poll(() => hostWire.state!.players[id].actor.x, { intervals: [20], timeout: 3000 }).toBeGreaterThanOrEqual(268); }
      finally { await page.keyboard.up('d'); }
      await expect.poll(() => hostWire.state!.players[id].actor.vx).toBe(0);
      for (let attempt = 0; attempt < 4 && Math.abs(hostWire.state!.players[id].actor.x - 290) > 18; attempt++) {
        const error = 290 - hostWire.state!.players[id].actor.x, key = error > 0 ? 'd' : 'a';
        await page.keyboard.down(key); await page.waitForTimeout(Math.max(60, Math.min(120, Math.abs(error) / 190 * 1000))); await page.keyboard.up(key);
        await expect.poll(() => hostWire.state!.players[id].actor.vx).toBe(0);
      }
      expect(Math.abs(hostWire.state!.players[id].actor.x - 290)).toBeLessThanOrEqual(20);
      await expect.poll(() => guestWire.state!.players[id].actor.vx).toBe(0);
    }
    async function jumpOntoPlatform(page: Page, id: 'p1' | 'p2') {
      await page.keyboard.down('Space');
      try {
        await expect.poll(() => hostWire.state!.players[id].actor.y, { intervals: [20], timeout: 1500 }).toBeLessThan(280);
        await page.waitForTimeout(350);
      } finally { await page.keyboard.up('Space'); }
      await expect.poll(() => hostWire.state!.players[id].actor.grounded).toBe(true);
      await expect.poll(() => guestWire.state!.players[id].actor.grounded).toBe(true);
      expect(hostWire.state!.players[id].actor.y).toBe(249);
    }
    const beforePickup = { score: hostWire.state!.run.score, tokens: hostWire.state!.run.tokens };
    expect(hostWire.state!.shared.pickups.some(pickup => pickup.id === 'token-1')).toBe(true);
    await approachFirstPlatform(guest, 'p2'); await jumpOntoPlatform(guest, 'p2');
    expect(hostWire.state!.shared.pickups.some(pickup => pickup.id === 'token-1')).toBe(false);
    expect(hostWire.state!.run.tokens).toBe(beforePickup.tokens + 12); expect(hostWire.state!.run.score).toBe(beforePickup.score + 24);
    await expect.poll(() => guestWire.state!.shared.pickups.some(pickup => pickup.id === 'token-1')).toBe(false);
    await expect.poll(() => guestWire.state!.run.tokens).toBe(beforePickup.tokens + 12);
    await expect.poll(() => guestWire.state!.run.score).toBe(beforePickup.score + 24);
    expect(hostWire.state!.players.p1.actor.y).toBe(309);
    // The other player revisits the exact collectible location with ordinary
    // movement/jump; the shared reward must not be issued a second time.
    await approachFirstPlatform(host, 'p1'); await jumpOntoPlatform(host, 'p1');
    expect(hostWire.state!.run.tokens).toBe(beforePickup.tokens + 12); expect(hostWire.state!.run.score).toBe(beforePickup.score + 24);
    await host.screenshot({ path: info.outputPath('real-coop-shared-pickup-once.png') });

    await playing(guest).click(); await expect(pause(host)).toBeVisible(); await expect(pause(guest)).toBeVisible();
    await expect.poll(() => hostWire.paused).toBe(true);
    await expect.poll(() => guestWire.paused).toBe(true);
    await expect.poll(() => guestWire.state!.tick).toBe(hostWire.state!.tick);
    expect(guestWire.state!.epoch).toBe(hostWire.state!.epoch);
    expect(guestWire.state!.shared.enemies.map(enemy => [enemy.id, enemy.hp])).toEqual(hostWire.state!.shared.enemies.map(enemy => [enemy.id, enemy.hp]));
    expect(guestWire.state!.shared.pickups.map(pickup => pickup.id)).toEqual(hostWire.state!.shared.pickups.map(pickup => pickup.id));
    expect([guestWire.state!.run.score, guestWire.state!.run.tokens]).toEqual([hostWire.state!.run.score, hostWire.state!.run.tokens]);
    const frozen = hostWire.state!.tick;
    await host.waitForTimeout(500); expect(hostWire.state!.tick).toBe(frozen);
    await expect(pause(guest).getByRole('button', { name: '恢复双人训练', exact: false })).toHaveCount(0);
    await pause(host).getByRole('button', { name: '恢复双人训练', exact: false }).click();
    await expect(playing(host)).toBeEnabled(); await expect(playing(guest)).toBeEnabled();
    await expect.poll(() => hostWire.state!.tick).toBeGreaterThan(frozen);
    expect(guestServer).not.toBeNull(); await (guestServer! as WebSocketRoute).close({ code: 3001, reason: 'acceptance-network-disconnect' });
    const reconnect = host.getByRole('dialog', { name: '等待合作连接恢复', exact: true });
    await expect(reconnect).toBeVisible();
    await expect(reconnect.getByRole('button', { name: '恢复双人训练', exact: false })).toBeEnabled({ timeout: 10000 });
    await expect(guest.getByRole('dialog', { name: '等待合作连接恢复', exact: true })).toBeVisible();
    await expect.poll(() => hostWire.paused).toBe(true);
    const reconnectTick = hostWire.state!.tick; await host.waitForTimeout(300); expect(hostWire.state!.tick).toBe(reconnectTick);
    await host.screenshot({ path: info.outputPath('real-reconnected-awaiting-host.png') });
    await reconnect.getByRole('button', { name: '恢复双人训练', exact: false }).click();
    await expect(playing(host)).toBeEnabled(); await expect(playing(guest)).toBeEnabled();
    await guest.keyboard.down('a'); await guest.waitForTimeout(180); await guest.keyboard.up('a');
    await expect.poll(() => hostWire.state!.tick).toBeGreaterThan(reconnectTick);
    await playing(host).click(); await expect(pause(host)).toBeVisible();
    const hostReturnStarted = Date.now();
    await pause(host).getByRole('button', { name: '结束合作并返回', exact: true }).click();
    // Leaving unmounts the co-op engine and boots a fresh isolated solo engine.
    // Use the same explicit loading budget as first entry, not the default 5s
    // control-action timeout; retain the measured return latency as evidence.
    await expect(host.getByRole('button', { name: '双人合作', exact: false })).toBeEnabled({ timeout: 15000 });
    const hostReturnMs = Date.now() - hostReturnStarted;
    await expect(guest.getByRole('dialog', { name: '合作已结束', exact: true })).toBeVisible();
    const guestReturnStarted = Date.now();
    await guest.getByRole('button', { name: '返回终端', exact: true }).click();
    await expect(guest.getByRole('button', { name: '恢复检查点', exact: true })).toBeEnabled({ timeout: 15000 });
    const readinessPath = info.outputPath('engine-return-readiness.json');
    await writeFile(readinessPath, JSON.stringify({ hostReturnMs, guestReturnMs: Date.now() - guestReturnStarted }, null, 2));
    await info.attach('engine-return-readiness', { path: readinessPath, contentType: 'application/json' });
    expect(await Promise.all([host, guest].map(page => page.evaluate(() => localStorage.getItem('pdoom.save.v1'))))).toEqual(saved);
    expect(hostWire.states).toBeGreaterThan(20); expect(guestWire.states).toBeGreaterThan(10); expect(hostWire.bytes).toBeLessThan(65536);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
