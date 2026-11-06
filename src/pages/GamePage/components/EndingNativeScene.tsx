import { useState, type CSSProperties, type SyntheticEvent } from 'react';
import { ENDING_CLIP_COUNT, FOOM_MESSAGE, type EndingPresentation } from '../functions/endingPresentation';
import { NATIVE_ENDING_ART, ENDING_CLIP_RECT, endingSceneFrame, nativeArtUrl, retryNativeArt, settleNativeArt, type NativeArtKind, type NativeArtState } from '../functions/endingSceneAssets';
import './ending.css';

const CLIPS = Array.from({ length: ENDING_CLIP_COUNT }, (_, i) => i);
function useNativeArt(asset: NativeArtKind) {
  const [state, setState] = useState<NativeArtState>({ phase: 'loading', attempt: 0 });
  const { attempt } = state;
  return { state, src: nativeArtUrl(asset, import.meta.env.BASE_URL, attempt),
    retry: () => setState(retryNativeArt),
    onLoad: (event: SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget, size = { width: image.naturalWidth, height: image.naturalHeight };
      setState(previous => settleNativeArt(previous, attempt, asset, size));
    },
    onError: () => setState(previous => settleNativeArt(previous, attempt, asset, null)),
  };
}
function ArtStatus({ state, retry, label }: { state: NativeArtState; retry: () => void; label: string }) {
  if (state.phase === 'ready') return null;
  return <div className="ending-art-status" role="status">
    {state.phase === 'loading' ? `读取${label}…` : <>{label}加载失败。结算不受影响。<button type="button" className="secondary-button" onClick={event => {
      event.currentTarget.closest('.ending-card')?.querySelector<HTMLButtonElement>('.ending-actions .primary-button')?.focus();
      retry();
    }}>重载{label}</button></>}
  </div>;
}
function artStyle(asset: NativeArtKind, rect: { x: number; y: number; width: number; height: number }): CSSProperties {
  return { '--art-width': `${NATIVE_ENDING_ART[asset].width}px`, '--art-height': `${NATIVE_ENDING_ART[asset].height}px`,
    '--frame-width': `${rect.width}px`, '--frame-height': `${rect.height}px`, '--frame-x': `${-rect.x}px`, '--frame-y': `${-rect.y}px` } as CSSProperties;
}
function NativeFrame({ presentation }: { presentation: EndingPresentation }) {
  const art = useNativeArt('scene'), frame = endingSceneFrame(presentation.kind);
  return <div className="ending-native-main" data-art-state={art.state.phase} style={artStyle('scene', frame)}>
    <div className="ending-native-crop" role="img" aria-label={presentation.sceneLabel} aria-busy={art.state.phase === 'loading'}>
      <img key={art.state.attempt} className="ending-native-image" src={art.src} width={NATIVE_ENDING_ART.scene.width} height={NATIVE_ENDING_ART.scene.height}
        alt="" aria-hidden="true" draggable={false} decoding="async" onLoad={art.onLoad} onError={art.onError} />
    </div>
    <ArtStatus state={art.state} retry={art.retry} label="原生分镜" />
  </div>;
}
function NativePaperclips() {
  const art = useNativeArt('clips');
  return <div className="ending-clip-cloud" data-art-state={art.state.phase} style={artStyle('clips', ENDING_CLIP_RECT)}>
    <div className="ending-paperclips" aria-hidden="true">{CLIPS.map(index => <span key={`${art.state.attempt}-${index}`} className="ending-native-crop" data-native-clip={index} style={{ animationDelay: `${index % 6 * 80}ms` }}>
      <img className="ending-native-image" src={art.src} width={NATIVE_ENDING_ART.clips.width} height={NATIVE_ENDING_ART.clips.height}
        alt="" draggable={false} decoding="async" onLoad={art.onLoad} onError={art.onError} />
    </span>)}</div>
    <ArtStatus state={art.state} retry={art.retry} label="回形针素材" />
  </div>;
}
/** Static native outcomes, not a three-outcome animation. Only the existing bounded clip entrance moves. */
export function EndingNativeScene({ presentation }: { presentation: EndingPresentation }) {
  return <div className="ending-stage" role="group" aria-label="终局场景" data-native-outcome={presentation.kind}>
    <div className="ending-stage-label" aria-hidden="true">VIRTUAL SCENE / 仅游戏演出区域</div>
    <div className="ending-scene-layout">
      <NativeFrame presentation={presentation} />
      {presentation.kind === 'foom' && <div className="ending-foom-detail">
        <NativePaperclips />
        <div className="ending-smile"><p>{FOOM_MESSAGE}</p><small>这是本页内的虚拟弹窗；真实系统与文件未被操作。</small></div>
      </div>}
    </div>
  </div>;
}
