import type { VictoryEnding } from './endingPresentation';

export const NATIVE_ENDING_ART = Object.freeze({
  scene: Object.freeze({ file: 'ending-scenes.png', width: 768, height: 128 }),
  clips: Object.freeze({ file: 'ending-clips.png', width: 256, height: 128 }),
});
export type NativeArtKind = keyof typeof NATIVE_ENDING_ART;
export type NativeArtState = Readonly<{ phase: 'loading' | 'ready' | 'error'; attempt: number }>;
const FRAMES = Object.freeze({
  aligned: Object.freeze({ x: 0, y: 0, width: 256, height: 128 }),
  warden: Object.freeze({ x: 256, y: 0, width: 256, height: 128 }),
  foom: Object.freeze({ x: 512, y: 0, width: 256, height: 128 }),
});
export const ENDING_CLIP_RECT = Object.freeze({ x: 232, y: 96, width: 9, height: 17 });
export const endingSceneFrame = (kind: VictoryEnding) => FRAMES[kind];
export function nativeArtUrl(asset: NativeArtKind, base: string, attempt: number): string {
  const prefix = base + (base && !base.endsWith('/') ? '/' : '');
  return `${prefix}game/${NATIVE_ENDING_ART[asset].file}${attempt ? `?ending-retry=${attempt}` : ''}`;
}
export const retryNativeArt = (state: NativeArtState): NativeArtState => ({ phase: 'loading', attempt: state.attempt + 1 });
/** Ignore old DOM load events and never silently recover a displayed failure without a retry. */
export function settleNativeArt(state: NativeArtState, attempt: number, asset: NativeArtKind, size: { width: number; height: number } | null): NativeArtState {
  if (state.attempt !== attempt || state.phase === 'error') return state;
  const expected = NATIVE_ENDING_ART[asset];
  const phase = size?.width === expected.width && size?.height === expected.height ? 'ready' : 'error';
  return phase === state.phase ? state : { phase, attempt };
}
