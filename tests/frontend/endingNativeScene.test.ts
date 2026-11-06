import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NATIVE_ENDING_ART, ENDING_CLIP_RECT, endingSceneFrame, nativeArtUrl, retryNativeArt, settleNativeArt, type NativeArtState } from '../../src/pages/GamePage/functions/endingSceneAssets';
import { getEndingPresentation } from '../../src/pages/GamePage/functions/endingPresentation';
import { EndingNativeScene } from '../../src/pages/GamePage/components/EndingNativeScene';

const loading = (): NativeArtState => ({ phase: 'loading', attempt: 0 });
describe('page-private native ending art state and coordinates', () => {
  it.each(['aligned', 'warden', 'foom'] as const)('%s selects exactly one immutable static outcome, not a playing cycle', kind => {
    expect(endingSceneFrame(kind)).toEqual({ x: ['aligned', 'warden', 'foom'].indexOf(kind) * 256, y: 0, width: 256, height: 128 });
    expect(Object.isFrozen(endingSceneFrame(kind))).toBe(true);
  });
  it('uses only the reviewed scene and transparent clip exports', () => {
    expect(NATIVE_ENDING_ART.scene).toEqual({ file: 'ending-scenes.png', width: 768, height: 128 });
    expect(NATIVE_ENDING_ART.clips).toEqual({ file: 'ending-clips.png', width: 256, height: 128 });
    expect(ENDING_CLIP_RECT).toEqual({ x: 232, y: 96, width: 9, height: 17 });
  });
  it.each(['/', '/nested/', '/nested', ''])('respects the %j base path and adds a retry cache key only after user action', base => {
    const prefix = base + (base && !base.endsWith('/') ? '/' : '');
    expect(nativeArtUrl('scene', base, 0)).toBe(prefix + 'game/ending-scenes.png');
    expect(nativeArtUrl('clips', base, 2)).toBe(prefix + 'game/ending-clips.png?ending-retry=2');
  });
  it.each(['scene', 'clips'] as const)('only accepts exact %s natural dimensions and preserves input state', asset => {
    const state = Object.freeze(loading()), expected = NATIVE_ENDING_ART[asset];
    expect(settleNativeArt(state, 0, asset, expected)).toEqual({ phase: 'ready', attempt: 0 });
    expect(state).toEqual(loading());
  });
  it.each(['scene', 'clips'] as const)('rejects failed, empty, resized or corrupt %s images without declaring ready', asset => {
    for (const size of [null, { width: 0, height: 0 }, { width: 256, height: 64 }, { width: 768, height: 129 }, { width: NaN, height: 128 }]) {
      expect(settleNativeArt(loading(), 0, asset, size)).toEqual({ phase: 'error', attempt: 0 });
    }
  });
  it('ignores stale completions and requires an explicit retry after a failure', () => {
    const failed = settleNativeArt(loading(), 0, 'scene', null), next = retryNativeArt(failed);
    expect(next).toEqual({ phase: 'loading', attempt: 1 });
    expect(settleNativeArt(next, 0, 'scene', NATIVE_ENDING_ART.scene)).toBe(next);
    expect(settleNativeArt(next, 0, 'scene', null)).toBe(next);
    expect(settleNativeArt(failed, 0, 'scene', NATIVE_ENDING_ART.scene)).toBe(failed);
    expect(settleNativeArt(next, 1, 'scene', NATIVE_ENDING_ART.scene)).toEqual({ phase: 'ready', attempt: 1 });
  });
  it('does not rerender for24 duplicate successful clip loads, but exposes any real failure', () => {
    const ready = settleNativeArt(loading(), 0, 'clips', NATIVE_ENDING_ART.clips);
    for (let i = 0; i < 24; i++) expect(settleNativeArt(ready, 0, 'clips', NATIVE_ENDING_ART.clips)).toBe(ready);
    expect(settleNativeArt(ready, 0, 'clips', null)).toEqual({ phase: 'error', attempt: 0 });
  });
  it.each(['aligned', 'warden', 'foom'] as const)('%s initially renders honest loading state and its native frame, never SVG stand-ins', kind => {
    const presentation = getEndingPresentation(kind)!; const before = JSON.stringify(presentation);
    const html = renderToStaticMarkup(createElement(EndingNativeScene, { presentation }));
    expect(html).toContain(`data-native-outcome="${kind}"`); expect(html).toContain('data-art-state="loading"');
    expect(html).toContain('game/ending-scenes.png'); expect(html).toContain('读取原生分镜');
    expect(html).not.toContain('clawd-mark.svg'); expect(html).not.toContain('ending-chair');
    expect((html.match(/data-native-clip="\d+"/g) ?? []).length).toBe(kind === 'foom' ? 24 : 0);
    if (kind === 'foom') { expect(html).toContain('game/ending-clips.png'); expect(html).toContain('真实系统与文件未被操作'); }
    expect(JSON.stringify(presentation)).toBe(before);
  });
});
