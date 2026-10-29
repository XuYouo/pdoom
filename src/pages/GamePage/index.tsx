import { useRef } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GamePanels } from './components/GamePanels';
import { MissionConsole } from './components/MissionConsole';
import { RunHud } from './components/RunHud';
import { RunOverlay } from './components/RunOverlay';
import { TitleMenu } from './components/TitleMenu';
import { getDisplayedStage, useGameSession } from './hooks/useGameSession';
import { useViewportFullscreen } from './hooks/useViewportFullscreen';
import { getChapter } from './game/data/chapters';
import './game-shell.css';

export default function GamePage() {
  const session = useGameSession();
  const root = useRef<HTMLElement>(null);
  const fullscreen = useViewportFullscreen(root);
  const inMenu = session.screen.kind === 'menu';
  const inRest = session.screen.kind === 'rest';
  const playing = session.screen.kind === 'playing';
  const stage = getDisplayedStage(session), chapter = getChapter(stage);
  const fullscreenButton = <button type="button" className="display-button" onClick={() => void fullscreen.toggle()} aria-label={fullscreen.active ? '退出全屏' : '全屏显示'}>{fullscreen.active ? '退出全屏' : '⛶ 全屏'}</button>;
  return <main ref={root} className={`game-shell game-shell--${session.screen.kind}`} aria-label="P(Doom) 游戏">
    <div className="world-viewport" aria-label="游戏舞台">
      <GameCanvas bridge={session.bridge} />
      {!inMenu && <div className="game-hud-layer" onKeyDown={event => { if (event.key !== 'Escape' && event.target instanceof HTMLElement && event.target.closest('button,summary,details,[tabindex]')) event.stopPropagation(); }}>
        <RunHud hud={session.hud} ending={session.screen.kind === 'ended' ? session.screen.result.ending : undefined} />
        <div className="world-titlebar"><div><strong>{String(stage).padStart(2, '0')}</strong><span>{chapter?.name ?? `第${stage}章`}</span></div>{playing && <button className="hud-settings-button" aria-label="音频设置" onClick={() => session.openPanel('settings')}>⚙</button>}<button className="pause-button" aria-label="Ⅱ PAUSE / 暂停游戏" disabled={!session.ready || !playing} onClick={session.pause}>Ⅱ</button></div>
        <MissionConsole session={session} />
        <div className="game-actions" aria-label="游戏快捷操作">
          <button className="skill-button" onClick={() => session.bridge.send({ type: 'rewind' })} disabled={!playing || !session.hud.rewindReady}><kbd>Q</kbd><span>{session.hud.rewindReady ? '回溯' : '冷却'}</span></button>
          <button className="skill-button" onClick={() => session.bridge.send({ type: 'insight' })} disabled={!playing}><kbd>E</kbd><span>透视</span></button>
          {session.hud.loom && <button className="skill-button" aria-label="R 重掷分支" onClick={() => session.bridge.send({ type: 'reroll' })} disabled={!playing || !session.hud.loom.rerollReady}><kbd>R</kbd><span>重掷</span></button>}
          <button className="game-context-button" aria-label="上下文详情" disabled={!session.ready || inRest} onClick={() => session.openPanel('context')}>CONTEXT <span>{session.context.usedK}/{session.context.capacityK}K</span></button>
        </div>
      </div>}
    </div>
    {inMenu && <><TitleMenu session={session} /><div className="window-actions">{fullscreenButton}</div>{fullscreen.message && <p role="status" className="display-message">{fullscreen.message}</p>}</>}
    <p className="orientation-hint">横屏游玩体验更佳 · 当前需键盘 / 鼠标</p>
    {!session.ready && <div className="boot-message">{session.loadError ? <section role="alert" aria-label="游戏资源加载失败"><h2>资源未能加载</h2><p>{session.loadError}</p><button type="button" className="secondary-button" onClick={() => window.location.reload()}>刷新并重试</button><small>本地检查点保留。</small></section> : <span>正在载入游戏…</span>}</div>}
    <RunOverlay session={session} fullscreenButton={fullscreenButton} fullscreenMessage={fullscreen.message} />
    <GamePanels session={session} />
  </main>;
}
