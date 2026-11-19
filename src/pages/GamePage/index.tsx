import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { GameCanvas } from './components/GameCanvas';
import { BootOverlay } from './components/BootOverlay';
import { GamePanels } from './components/GamePanels';
import { MissionConsole } from './components/MissionConsole';
import { RunHud } from './components/RunHud';
import { SkillButtons } from './components/SkillButtons';
import { RunOverlay } from './components/RunOverlay';
import { TitleMenu } from './components/TitleMenu';
import { CoopPanel } from './components/CoopPanel';
import { CoopPlay } from './components/CoopPlay';
import { TouchControls } from './components/TouchControls';
import { CoopClient } from './network/CoopClient';
import type { CoopRoom } from './network/protocol';
import { getDisplayedStage, useGameSession } from './hooks/useGameSession';
import { useViewportFullscreen } from './hooks/useViewportFullscreen';
import { useTouchControls } from './hooks/useTouchControls';
import { getChapter } from './game/data/chapters';
import { keepHudControlKeysLocal } from './functions/hudInput';
import './game-shell.css';
import './components/title-menu.css';
import './components/run-hud.css';
import './components/player-guide.css';
import './components/boot-overlay.css';
import './components/records.css';
import './mobile-game.css';
import './classic-theme.css';

export default function GamePage() {
  const [client] = useState(() => new CoopClient());
  const [coopRoom, setCoopRoom] = useState<CoopRoom | null>(null);
  useEffect(() => () => client.close(), [client]);
  return coopRoom ? <CoopPlay client={client} room={coopRoom} onLeave={() => setCoopRoom(null)} />
    : <SoloGamePage client={client} onCoopStart={setCoopRoom} />;
}

/** Each mode owns its own runtime and session lifecycle; a co-op match cannot reach solo persistence. */
function SoloGamePage({ client, onCoopStart }: { client: CoopClient; onCoopStart: (room: CoopRoom) => void }) {
  const session = useGameSession();
  const [coopOpen, setCoopOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const fullscreen = useViewportFullscreen(root);
  const touch = useTouchControls();
  const inMenu = session.screen.kind === 'menu';
  const inRest = session.screen.kind === 'rest';
  const playing = session.screen.kind === 'playing';
  const stage = getDisplayedStage(session), chapter = getChapter(stage);
  const fullscreenButton = <button type="button" className="display-button" onClick={() => void fullscreen.toggle()} aria-label={fullscreen.active ? '退出全屏' : '全屏显示'}>{fullscreen.active ? '退出全屏' : '⛶ 全屏'}</button>;
  const hudLayer = !inMenu && <div className="game-hud-layer" onKeyDown={keepHudControlKeysLocal}>
        <RunHud hud={session.hud} ending={session.screen.kind === 'ended' ? session.screen.result.ending : undefined} />
        <div className="world-titlebar"><div><strong>{String(stage).padStart(2, '0')}</strong><span>{chapter?.name ?? `第${stage}章`}</span></div>{playing && <button className="hud-settings-button" aria-label="音频设置" onClick={() => session.openPanel('settings')}>⚙</button>}<button className="pause-button" aria-label="Ⅱ PAUSE / 暂停游戏" disabled={!session.ready || !playing} onClick={session.pause}>Ⅱ</button></div>
        <MissionConsole session={session} />
        <div className="game-actions" aria-label="游戏快捷操作">
          <SkillButtons hud={session.hud} playing={playing} gameRoot={root} onActivate={type => session.bridge.send({ type })} />
          <button className={`game-context-button${session.context.overloaded ? ' is-overloaded' : ''}`} aria-label="上下文详情" title={session.context.overloaded ? '上下文满载：中间词条失活，打开查看' : '查看当前遗物与上下文容量'} disabled={!session.ready || inRest} onClick={() => session.openPanel('context')}>{session.context.overloaded ? '满载' : 'CONTEXT'} <span>{session.context.usedK}/{session.context.capacityK}K</span></button>
        </div>
      </div>;
  return <main ref={root} className={`game-shell game-shell--${session.screen.kind}`} aria-label="P(Doom) 游戏" data-reduced-motion={session.motion.reducedMotion} data-touch-controls={touch} data-touch-detail={Boolean(session.hud.loom || session.hud.omega)}>
    <div className="world-viewport" aria-label="游戏舞台">
      <GameCanvas bridge={session.bridge} />
      {!touch && hudLayer}
    </div>
    {touch && hudLayer}
    {!inMenu && <TouchControls bridge={session.bridge} enabled={touch} playing={playing && session.ready && session.panel === null} hud={session.hud} onPause={session.pause} onContext={() => session.openPanel('context')} onFullscreen={() => void fullscreen.toggle()} fullscreenActive={fullscreen.active} onGesture={() => { if (session.audio.status !== 'running' && !session.audio.preferences.muted) session.audio.unlock(); }} />}
    {playing && fullscreen.message && <p role="status" className="display-message">{fullscreen.message}</p>}
    {inMenu && <><TitleMenu session={session} touchControls={touch} onCoop={() => setCoopOpen(true)} /><div className="window-actions">{fullscreenButton}</div>{fullscreen.message && <p role="status" className="display-message">{fullscreen.message}</p>}</>}
    <p className="orientation-hint">{touch ? '横屏视野更舒展 · 左侧移动，右侧瞄准射击' : '横屏游玩体验更佳 · 支持键盘 / 鼠标'}</p>
    {!session.ready && <BootOverlay bridge={session.bridge} error={session.loadError} />}
    <RunOverlay session={session} fullscreenButton={fullscreenButton} fullscreenMessage={fullscreen.message} />
    <GamePanels session={session} />
    {coopOpen && <Dialog title="在线合作 / CO-OP" className="coop-dialog" dismissible={false} showCloseButton={false} onClose={() => undefined}>
      <CoopPanel client={client} onStart={onCoopStart} onClose={() => setCoopOpen(false)} onAccount={() => { setCoopOpen(false); session.openPanel('account'); }} />
    </Dialog>}
  </main>;
}
