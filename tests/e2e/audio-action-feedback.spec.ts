import { expect, test, type Page } from '@playwright/test';
import { abilityVoices, actionAudioEvidence, installActionAudioProbe, nativeHero } from './audio-action-probe';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', error => list.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page) ?? []).toEqual([]));
// The compact HUD intentionally omits historical insight notices. Read the actual 27% green veil instead.
function insightTint(before: number[][], after: number[][]) {
  const matches = (observed: number[][]) => observed.filter((rgb, index) => rgb.every((value, channel) => Math.abs(value - Math.round(before[index][channel] * 0.73 + [7, 58, 53][channel] * 0.27)) <= 2)).length;
  expect(before).toHaveLength(36); expect(after).toHaveLength(36);
  const positive = matches(after), negative = matches(before);
  expect(positive).toBeGreaterThanOrEqual(32); expect(negative).toBeLessThanOrEqual(4);
  return { positive, negative, sampleCount: before.length };
}
function wav(samples: number[], rate: number) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + index * 2));
  return data;
}
for (const rate of [44100, 48000]) test(`native action PCM ${rate}: distinct dash and insight survive swallowed music but respect mute and zero`, async ({ page }, info) => {
  await page.route('**/native-action-audio.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/native-action-audio.html');
  const proof = await page.evaluate(async rate => {
    const graphPath = '/src/pages/GamePage/game/audio/SynthGraph.ts', scorePath = '/src/pages/GamePage/game/audio/score.ts';
    const { SynthGraph, scheduleSfx } = await import(graphPath) as typeof import('../../src/pages/GamePage/game/audio/SynthGraph');
    const { planStemLevels } = await import(scorePath) as typeof import('../../src/pages/GamePage/game/audio/score');
    const render = async (kind: 'dash' | 'insight' | null, muted = false, volume = 0.5) => {
      const context = new OfflineAudioContext(1, rate / 2, rate), graph = new SynthGraph(context);
      graph.setMaster({ muted, volume }, 0); graph.setStemLevels(planStemLevels({ running: true, bossActive: true, doom: 85, stemsLost: 4 }), 0);
      const scheduled = kind ? scheduleSfx(graph, kind, 0.08) : 0, voicesBefore = graph.activeVoiceCount;
      const buffer = await context.startRendering(), samples = Array.from(buffer.getChannelData(0));
      const rms = (from: number, to: number) => {
        const first = Math.ceil(from * rate), last = Math.floor(to * rate); let sum = 0;
        for (let i = first; i < last; i++) sum += samples[i] ** 2; return Math.sqrt(sum / (last - first));
      };
      const levels = Object.values(graph.stemGains).map(gain => gain.gain.value);
      const peak = Math.max(...samples.map(Math.abs)), finite = samples.every(Number.isFinite); graph.dispose();
      return { scheduled, voicesBefore, voicesAfter: graph.activeVoiceCount, levels, finite, peak,
        before: rms(0, 0.07), active: rms(0.09, 0.14), tail: rms(0.34, 0.49), total: rms(0, 0.49),
        pcm: kind && !muted && volume > 0 ? samples : [] };
    };
    return { dash: await render('dash'), insight: await render('insight'), repeatDash: await render('dash'), repeatInsight: await render('insight'),
      mutedDash: await render('dash', true), mutedInsight: await render('insight', true), zeroDash: await render('dash', false, 0),
      zeroInsight: await render('insight', false, 0), noCue: await render(null) };
  }, rate);
  for (const kind of ['dash', 'insight'] as const) {
    const view = proof[kind]; expect(view.scheduled).toBe(2); expect(view.voicesBefore).toBe(2); expect(view.voicesAfter).toBe(0);
    expect(view.finite).toBe(true); expect(view.levels).toEqual([0, 0, 0, 0]); expect(view.before).toBeLessThan(1e-7);
    expect(view.active).toBeGreaterThan(0.00001); expect(view.total).toBeGreaterThan(0.00001);
    expect(view.tail).toBeLessThan(1e-7); expect(view.peak).toBeLessThan(0.96); expect(view.pcm).toHaveLength(rate / 2);
    await info.attach(`${kind}-${rate}-actual-native-pcm`, { body: wav(view.pcm, rate), contentType: 'audio/wav' });
  }
  expect(proof.dash.pcm).toEqual(proof.repeatDash.pcm); expect(proof.insight.pcm).toEqual(proof.repeatInsight.pcm);
  expect(proof.dash.pcm).not.toEqual(proof.insight.pcm);
  for (const key of ['mutedDash', 'mutedInsight', 'zeroDash', 'zeroInsight', 'noCue'] as const) {
    expect(proof[key].total).toBeLessThan(1e-7); expect(proof[key].peak).toBeLessThan(1e-7); expect(proof[key].voicesAfter).toBe(0);
  }
  await info.attach('native-action-pcm-metrics', { body: Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(proof).map(([key, { pcm, ...metrics }]) => [key, { ...metrics, sampleCount: pcm.length }])))), contentType: 'application/json' });
});

test('ordinary Shift and E create real action cues, blocked keys do not, and pause/muted new runs never replay history', async ({ page }, info) => {
  test.setTimeout(60000); await page.setViewportSize({ width: 1280, height: 720 }); await installActionAudioProbe(page); await page.goto('/');
  const start = page.getByRole('button', { name: '开始新训练', exact: true }); await expect(start).toBeEnabled({ timeout: 15000 });
  expect((await actionAudioEvidence(page)).states).toEqual([]); await start.click();
  await expect.poll(async () => (await actionAudioEvidence(page)).states).toEqual(['running']); await page.waitForTimeout(1100);
  const before = await nativeHero(page); expect([before.width, before.height]).toEqual([640, 360]);
  await page.keyboard.press('Shift'); await page.waitForTimeout(60); await page.keyboard.press('Shift'); await page.waitForTimeout(260);
  const after = await nativeHero(page); expect(after.x! - before.x!).toBeGreaterThan(40); expect(after.x! - before.x!).toBeLessThan(180);
  await page.keyboard.press('e'); await page.waitForTimeout(60); await page.keyboard.press('e');
  await page.waitForTimeout(400); const insight = await nativeHero(page, false); const visibleInsight = insightTint(after.scan, insight.scan);
  const live = await actionAudioEvidence(page); expect(live.sfxIdentified).toBe(true); expect(live.overflow).toBe(false);
  expect(abilityVoices(live, 'dash')).toHaveLength(1); expect(abilityVoices(live, 'insight')).toHaveLength(1);
  const shiftKeys = live.keys.filter(key => key.key === 'Shift'); expect(shiftKeys).toHaveLength(2);
  expect(shiftKeys[1].at - shiftKeys[0].at).toBeLessThan(800); expect(live.keys.every(key => key.trusted)).toBe(true);
  for (const kind of ['dash', 'insight'] as const) {
    const cue = abilityVoices(live, kind)[0];
    expect(cue.end! - cue.when).toBeCloseTo(kind === 'dash' ? 0.095 : 0.18, 5);
    const window = live.samples.filter(sample => sample.time >= cue.when && sample.time <= cue.end! + 0.06);
    expect(window.length).toBeGreaterThan(0); expect(Math.max(...window.map(sample => sample.rms))).toBeGreaterThan(0.00001);
  }
  await info.attach('before-ordinary-dash', { body: Buffer.from(before.png.split(',')[1], 'base64'), contentType: 'image/png' });
  await info.attach('after-ordinary-dash', { body: Buffer.from(after.png.split(',')[1], 'base64'), contentType: 'image/png' });
  await info.attach('ordinary-live-action-evidence', { body: Buffer.from(JSON.stringify({ ...live, visibleInsight })), contentType: 'application/json' });
  await info.attach('ordinary-insight-green-veil', { body: Buffer.from(insight.png.split(',')[1], 'base64'), contentType: 'image/png' });
  await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: '暂停前向传播。', exact: true })).toBeVisible();
  await expect.poll(async () => (await actionAudioEvidence(page)).states).toEqual(['suspended']);
  const frozen = (await nativeHero(page, false)).png;
  await page.keyboard.press('Shift'); await page.keyboard.press('e'); await page.waitForTimeout(250);
  expect((await nativeHero(page, false)).png).toBe(frozen);
  await page.getByRole('button', { name: '继续训练', exact: true }).click(); await page.waitForTimeout(250);
  const resumed = await actionAudioEvidence(page); expect(abilityVoices(resumed, 'dash')).toHaveLength(1); expect(abilityVoices(resumed, 'insight')).toHaveLength(1);
  await page.getByRole('button', { name: '音频设置', exact: true }).click();
  await page.getByLabel('静音全部音乐与音效').check(); await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.getByRole('button', { name: '返回终端', exact: true }).click(); await start.click(); await page.waitForTimeout(1100);
  await expect.poll(async () => (await actionAudioEvidence(page)).states).toEqual(['suspended']);
  const mutedBefore = await nativeHero(page); await page.keyboard.press('Shift'); await page.waitForTimeout(250);
  const mutedAfter = await nativeHero(page); expect(mutedAfter.x! - mutedBefore.x!).toBeGreaterThan(40);
  await page.keyboard.press('e'); await page.waitForTimeout(250); const mutedInsight = await nativeHero(page, false);
  const visibleMutedInsight = insightTint(mutedAfter.scan, mutedInsight.scan);
  const muted = await actionAudioEvidence(page); expect(abilityVoices(muted, 'dash')).toHaveLength(1); expect(abilityVoices(muted, 'insight')).toHaveLength(1);
  await page.getByRole('button', { name: '音频设置', exact: true }).click();
  await page.getByLabel('静音全部音乐与音效').uncheck(); await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.getByRole('button', { name: '继续训练', exact: true }).click();
  await expect.poll(async () => (await actionAudioEvidence(page)).states).toEqual(['running']); await page.waitForTimeout(1100);
  const unmuted = await actionAudioEvidence(page); expect(abilityVoices(unmuted, 'dash')).toHaveLength(1); expect(abilityVoices(unmuted, 'insight')).toHaveLength(1);
  await page.keyboard.press('Shift'); await page.waitForTimeout(250);
  const final = await actionAudioEvidence(page); expect(abilityVoices(final, 'dash')).toHaveLength(2); expect(abilityVoices(final, 'insight')).toHaveLength(1);
  expect(final.states).toEqual(['running']); expect(final.overflow).toBe(false);
  await info.attach('action-lifecycle-native-evidence', { body: Buffer.from(JSON.stringify({ resumed, muted, unmuted, final, visibleMutedInsight })), contentType: 'application/json' });
});
