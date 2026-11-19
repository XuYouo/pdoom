import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import type { GameBridge } from '../game/bridge';

export function BootOverlay({ bridge, error }: { bridge: GameBridge; error: string | null }) {
  const [progress, setProgress] = useState(0);
  const retry = useRef<HTMLButtonElement>(null);
  useEffect(() => bridge.onEvent(event => {
    if (event.type === 'load-progress' && Number.isFinite(event.progress)) setProgress(Math.max(0, Math.min(1, event.progress)));
  }), [bridge]);
  useEffect(() => { if (error) retry.current?.focus(); }, [error]);
  const percent = Math.floor(progress * 100);
  return <Dialog title={error ? '资源未能加载' : '正在连接训练终端'} dismissible={false} onClose={() => undefined} className="boot-message boot-dialog">
    <div className="boot-brand" aria-hidden="true">P(Doom)<span>100%</span></div>
    {error ? <section role="alert" aria-label="游戏资源加载失败">
      <p>{error}</p>
      <button ref={retry} type="button" className="primary-button" onClick={() => window.location.reload()}>刷新并重试 <span aria-hidden="true">↻</span></button>
      <small>本地检查点保留。</small>
    </section> : <section aria-label="游戏资源加载">
      <div className="boot-progress-label"><span>{percent < 100 ? '载入像素世界' : '准备游戏场景'}</span><strong aria-hidden="true">{percent}<small>%</small></strong></div>
      <progress max={100} value={percent} aria-label="资源加载进度" />
      <p className="boot-hint">穿过弹幕时按 <kbd>Q</kbd> 回溯，获得同类弹幕免疫。</p>
      <small>加载完成后即可开始。</small>
    </section>}
  </Dialog>;
}
