import { expect, test, type Page } from '@playwright/test';
import { contextStates, observeNativeContexts } from './audio-probe';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list);
  page.on('pageerror', error => list.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page) ?? []).toEqual([]));

async function openNativeProbe(page: Page) {
  // An empty same-origin test document isolates native DSP/lifecycle checks from React HMR.
  // The audio modules and native nodes are the real production ones; no audio API is stubbed.
  await page.route('**/native-audio-probe.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/native-audio-probe.html');
}

test('native score renders four real stems, exact swallowed silence, recovery and independent SFX', async ({ page }, testInfo) => {
  await openNativeProbe(page);
  const proof = await page.evaluate(async () => {
    const graphPath = '/src/pages/GamePage/game/audio/SynthGraph.ts';
    const scorePath = '/src/pages/GamePage/game/audio/score.ts';
    const { SynthGraph, scheduleMusicStep, scheduleSfx } = await import(graphPath) as typeof import('../../src/pages/GamePage/game/audio/SynthGraph');
    const { planStemLevels } = await import(scorePath) as typeof import('../../src/pages/GamePage/game/audio/score');
    const full = planStemLevels({ running: true, bossActive: true, doom: 8, stemsLost: 0 });
    const silent = planStemLevels({ running: true, bossActive: true, doom: 8, stemsLost: 4 });
    type Kind = 'control' | 'swallow' | 'sfx' | 'muted' | keyof typeof full;
    const render = async (kind: Kind) => {
      const context = new OfflineAudioContext(1, 26400, 48000);
      const graph = new SynthGraph(context);
      graph.setMaster({ muted: kind === 'muted', volume: 0.5 }, 0);
      const levels = kind in full ? { ...silent, [kind]: full[kind as keyof typeof full] } : kind === 'sfx' ? silent : full;
      graph.setStemLevels(levels, 0);
      // Four short steps are below the real voice budget. Keep sources running even while the bus is swallowed.
      let scheduled = 0;
      for (let step = 0; step < 4; step++) scheduled += scheduleMusicStep(graph, 4, step, 0.01 + step * 0.125, full);
      if (kind === 'swallow') { graph.setStemLevels(silent, 0.15); graph.setStemLevels(full, 0.30); }
      if (kind === 'sfx') scheduleSfx(graph, 'reroll', 0.20);
      const voicesBefore = graph.activeVoiceCount;
      const buffer = await context.startRendering();
      const samples = buffer.getChannelData(0);
      const rms = (from: number, to: number) => {
        let sum = 0; const first = Math.ceil(from * buffer.sampleRate), last = Math.floor(to * buffer.sampleRate);
        for (let i = first; i < last; i++) sum += samples[i] * samples[i];
        return Math.sqrt(sum / (last - first));
      };
      let peak = 0; for (const value of samples) peak = Math.max(peak, Math.abs(value));
      graph.dispose();
      return { scheduled, voicesBefore, voicesAfterDispose: graph.activeVoiceCount, before: rms(0.05, 0.14), swallowed: rms(0.20, 0.29), recovered: rms(0.36, 0.48), total: rms(0, 0.54), peak };
    };
    const values = {} as Record<Kind, Awaited<ReturnType<typeof render>>>;
    for (const kind of ['control', 'swallow', 'sfx', 'muted', 'chip', 'bass', 'percussion', 'drive'] as const) values[kind] = await render(kind);
    return values;
  });
  for (const key of ['chip', 'bass', 'percussion', 'drive'] as const) expect(proof[key].total).toBeGreaterThan(0.00001);
  expect(proof.control.swallowed).toBeGreaterThan(0.0001);
  expect(proof.swallow.before).toBeGreaterThan(0.0001);
  expect(proof.swallow.swallowed).toBeLessThan(0.0000001);
  expect(proof.swallow.recovered).toBeGreaterThan(0.0001);
  expect(proof.sfx.before).toBeLessThan(0.0000001);
  expect(proof.sfx.swallowed).toBeGreaterThan(0.0001);
  expect(proof.muted.total).toBeLessThan(0.0000001);
  for (const value of Object.values(proof)) {
    expect(value.scheduled).toBeGreaterThan(0); expect(value.voicesBefore).toBeLessThanOrEqual(24);
    expect(value.voicesAfterDispose).toBe(0); expect(value.peak).toBeLessThan(0.96);
  }
  console.log('NATIVE_AUDIO_PROOF', JSON.stringify(proof));
  await testInfo.attach('native-audio-proof', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
});

test('the real game waits for a gesture, suspends on pause and reuses one context across new runs', async ({ page }) => {
  await observeNativeContexts(page);
  await page.goto('/');
  const start = page.getByRole('button', { name: '开始新训练' });
  await expect(start).toBeEnabled({ timeout: 15000 });
  expect(await contextStates(page)).toEqual([]);
  await start.click();
  await expect.poll(() => contextStates(page)).toEqual(['running']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '暂停前向传播。' })).toBeVisible();
  await expect.poll(() => contextStates(page)).toEqual(['suspended']);
  await page.getByRole('button', { name: '返回终端' }).click();
  await start.click();
  await expect.poll(() => contextStates(page)).toEqual(['running']);
  await page.keyboard.press('Escape');
  await expect.poll(() => contextStates(page)).toEqual(['suspended']);
});

test('the public audio adapter closes a real context on destroy without reopening it', async ({ page }) => {
  await observeNativeContexts(page);
  await openNativeProbe(page);
  await page.evaluate(async () => {
    const modulePath = '/src/pages/GamePage/game/audio/AudioSystem.ts';
    const { AudioSystem } = await import(modulePath) as typeof import('../../src/pages/GamePage/game/audio/AudioSystem');
    const status = document.createElement('output'); status.dataset.testid = 'native-audio-status';
    const audio = new AudioSystem(value => { status.textContent = value; });
    audio.update({ runId: 'isolated-native-audio-proof', stage: 4, doom: 8, bossActive: true, running: true, elapsedMs: 0, hp: 100, shots: 0, rewinds: 0, rerolls: 0, turns: 0, stemsLost: 0 });
    const start = document.createElement('button'); start.textContent = 'Native audio start'; start.onclick = () => { void audio.unlock(); };
    const stop = document.createElement('button'); stop.textContent = 'Native audio destroy'; stop.onclick = () => { audio.destroy(); void audio.unlock(); };
    const panel = document.createElement('div'); panel.style.cssText = 'position:fixed;inset:0 auto auto 0;z-index:9999;background:black;padding:8px;display:flex;gap:12px';
    panel.append(status, start, stop); document.body.append(panel);
  });
  await page.getByRole('button', { name: 'Native audio start', exact: true }).click();
  await expect(page.getByTestId('native-audio-status')).toHaveText('running');
  await expect.poll(() => contextStates(page)).toEqual(['running']);
  await page.getByRole('button', { name: 'Native audio destroy', exact: true }).click();
  await expect.poll(() => contextStates(page)).toEqual(['closed']);
});

test('real volume and mute controls persist separately without unlocking on reload', async ({ page }) => {
  await observeNativeContexts(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始新训练' })).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: '音频设置', exact: true }).click();
  const mute = page.getByLabel('静音全部音乐与音效');
  await mute.check();
  const volume = page.getByRole('slider', { name: '主音量', exact: true });
  await volume.focus(); await volume.press('Home');
  for (let step = 0; step < 37; step++) await volume.press('ArrowRight');
  await expect(volume).toHaveValue('37');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.audio.v1') ?? 'null'))).toEqual({ version: 1, muted: true, volume: 0.37 });
  expect(await page.evaluate(() => localStorage.getItem('pdoom.save.v1'))).toBeNull();
  await expect.poll(() => contextStates(page)).toEqual(['suspended']);
  await page.reload();
  await expect(page.getByRole('button', { name: '开始新训练' })).toBeEnabled({ timeout: 15000 });
  expect(await contextStates(page)).toEqual([]);
  await page.getByRole('button', { name: '音频设置', exact: true }).click();
  await expect(mute).toBeChecked(); await expect(volume).toHaveValue('37');
  await mute.uncheck();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.getByRole('button', { name: '开始新训练' }).click();
  await expect.poll(() => contextStates(page)).toEqual(['running']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pdoom.audio.v1') ?? 'null'))).toEqual({ version: 1, muted: false, volume: 0.37 });
  await page.keyboard.press('Escape');
  await expect.poll(() => contextStates(page)).toEqual(['suspended']);
});
