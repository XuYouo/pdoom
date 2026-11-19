import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import type { CoopClient } from '../network/CoopClient';
import type { CoopRoom } from '../network/protocol';
import { useCoopPlay } from '../hooks/useCoopPlay';
import { useViewportFullscreen } from '../hooks/useViewportFullscreen';
import { useTouchControls } from '../hooks/useTouchControls';
import { getChapter } from '../game/data/chapters';
import { COOP_RULES } from '../game/coop/model';
import { focusGameAfterPointer, keepHudControlKeysLocal } from '../functions/hudInput';
import { missionEmphasis } from '../functions/combatFeedback';
import { GameCanvas } from './GameCanvas';
import { SkillButtons } from './SkillButtons';
import { CombatFeedback } from './CombatFeedback';
import { CoopChapterRoute, CoopPlayers, CoopSharedStats } from './CoopTeamHud';
import { CoopRestPanel } from './CoopRestPanel';
import { GameSettings } from './GameSettings';
import { TouchControls } from './TouchControls';
import './coop-play.css';

export interface CoopPlayProps { client: CoopClient; room: CoopRoom; onLeave: () => void }
export function CoopPlay({ client, room, onLeave }: CoopPlayProps) {
  const play = useCoopPlay(client, room, onLeave);
  const root = useRef<HTMLElement>(null);
  const fullscreen = useViewportFullscreen(root);
  const touch = useTouchControls();
  const view = play.snapshot;
  useEffect(() => {
    if (!play.playing) return;
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLCanvasElement>('.game-canvas canvas')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [play.playing]);
  const needsRescue = view?.players.some(player => player.id !== view.localPlayerId && player.state === 'downed') && play.local?.state === 'active';
  const objective = needsRescue ? `队友倒地：靠近并按住${touch ? '救援键' : ' F'} ${COOP_RULES.reviveMs / 1000} 秒，救起后恢复 ${COOP_RULES.reviveHp} HP。` : view?.hud.objective;
  const hudLayer = view && <div className="game-hud-layer coop-play-hud" onKeyDown={keepHudControlKeysLocal}>
        <div className="coop-play-topline"><CoopPlayers view={view} /><div className="coop-hud-shared"><p className="coop-chapter-label">双人合作 · {String(view.stage).padStart(2, '0')} / {getChapter(view.stage)?.name ?? `第 ${view.stage} 章`}</p><CoopSharedStats view={view} /></div></div>
        <div className="mission-console coop-play-mission"><p className="objective" data-tone={needsRescue ? 'danger' : missionEmphasis(view.hud.objective).tone}>{objective}</p>
          <CombatFeedback key={view.epoch} bridge={play.bridge} elapsedMs={view.hud.elapsedMs} suppressed={needsRescue || missionEmphasis(view.hud.objective).tone === 'danger'} controlled={view.hud.skills.rewind.state === 'controlled'} />
        </div>
        <div className="game-actions coop-game-actions">
          <span className="coop-rescue-key"><kbd>F</kbd> 靠近救援</span>
          <SkillButtons hud={view.hud} playing={play.playing && play.local?.state === 'active'} gameRoot={root} onActivate={type => play.command({ type })} />
          <button type="button" className="pause-button" aria-label="暂停双人训练" disabled={!play.playing} onClick={play.pause}>Ⅱ</button>
          <button type="button" className="coop-fullscreen-button" aria-label={fullscreen.active ? '退出全屏' : '全屏显示'} onClick={event => { void fullscreen.toggle(); focusGameAfterPointer(event, root.current); }}>⛶</button>
          {play.audio.status !== 'running' && !play.audio.preferences.muted && <button type="button" className="coop-enable-audio" onClick={event => { play.audio.unlock(); focusGameAfterPointer(event, root.current); }}>启用声音</button>}
        </div>
      </div>;
  return <main ref={root} className="game-shell game-shell--coop coop-play" aria-label="双人合作训练" data-reduced-motion={play.motion.reducedMotion} data-touch-controls={touch} data-touch-detail={Boolean(view?.hud.loom || view?.hud.omega)}>
    <div className="world-viewport" aria-label="合作游戏舞台"><GameCanvas bridge={play.bridge} />
      {!touch && hudLayer}
    </div>
    {touch && hudLayer}
    {view && <TouchControls bridge={play.bridge} enabled={touch} playing={play.playing} canAct={play.local?.state === 'active'} hud={view.hud} cooperative onPause={play.pause} onFullscreen={() => void fullscreen.toggle()} fullscreenActive={fullscreen.active} onGesture={() => { if (play.audio.status !== 'running' && !play.audio.preferences.muted) play.audio.unlock(); }} />}
    {fullscreen.message && play.playing && <p className="display-message" role="status">{fullscreen.message}</p>}
    <CoopPlayOverlay play={play} fullscreen={fullscreen} />
  </main>;
}

export function CoopPlayOverlay({ play, fullscreen }: { play: ReturnType<typeof useCoopPlay>; fullscreen?: ReturnType<typeof useViewportFullscreen> }) {
  const view = play.snapshot;
  if (play.leaving.kind !== 'idle') return <Dialog title="正在离开合作" dismissible={false} onClose={() => undefined} className="coop-play-dialog">
    <p className="coop-play-message">本机模拟已停止。{play.leaving.kind === 'pending' ? '正在等待服务器确认离房…' : play.leaving.message}</p>
    {play.leaving.kind === 'error' && <div className="coop-modal-actions"><button type="button" className="primary-button" autoFocus onClick={() => play.leave()}>重试离房</button><button type="button" className="secondary-button" onClick={() => play.leave(true)}>断开并返回</button></div>}
  </Dialog>;
  if (!view || play.status === 'syncing' || play.status === 'closed') {
    const closed = play.status === 'closed';
    return <Dialog title={closed ? '合作已结束' : '正在同步合作世界'} dismissible={false} onClose={() => undefined} className="coop-play-dialog">
      <p className="coop-play-message" role={closed ? 'alert' : 'status'}>{play.message || (closed ? '当前合作连接已关闭。' : '等待两名玩家准备运行时与共同世界。')}</p>
      {!view && !closed && <progress className="coop-load-progress" aria-label="合作运行时资源加载" max={1} value={play.progress} />}
      {closed && view && <><CoopSharedStats view={view} /><CoopChapterRoute view={view} /></>}
      <p className="coop-session-note">合作不会覆盖单人检查点；刷新或离开后不能从单人存档恢复本场合作。</p>
      <button type="button" className="secondary-button" autoFocus onClick={() => play.leave()}>{closed ? '返回终端' : '取消并返回终端'}</button>
    </Dialog>;
  }
  if (play.status === 'paused' || play.status === 'reconnecting') return <CoopPausePanel play={play} fullscreen={fullscreen} />;
  if (view.mode === 'rest') return <Dialog title="合作休息室 / TEAM SUPPLIES" dismissible={false} onClose={() => undefined} className="coop-play-dialog coop-rest-dialog">
    <CoopPlayers view={view} summary /><CoopSharedStats view={view} />
    <CoopRestPanel view={view} bridge={play.bridge} />
    <div className="coop-continue-footer"><div><CoopReadyStatus view={view} /><span>双方准备后继续；交易会重新清除准备。</span></div><button type="button" className="primary-button" autoFocus disabled={!play.canContinue} onClick={play.continueReady}>{play.local?.ready ? '已准备 · 等待队友' : '整备完成，准备继续'}</button><button type="button" className="secondary-button" onClick={() => play.leave()}>结束合作</button></div>
  </Dialog>;
  if (view.mode === 'cleared' || view.mode === 'dead' || view.mode === 'finished') {
    const complete = view.mode === 'finished', defeated = view.mode === 'dead';
    const title = complete ? '合作训练完成' : defeated ? '队伍失去行动能力' : `第 ${view.stage} 章突破`;
    const endingLabel = view.ending === 'aligned' ? '保持对齐' : view.ending === 'warden' ? '成为新管理员' : view.ending === 'foom' ? 'FOOM · 回形针宇宙' : '';
    return <Dialog title={title} dismissible={false} onClose={() => undefined} className="coop-play-dialog coop-report-dialog">
      <p className="coop-play-message">{complete ? `两名智能体抵达共同结局：${endingLabel}。` : defeated ? '双方准备后，从本场合作最近的安全检查点重试。' : `下一站：${getChapter(view.stage + 1)?.name ?? '下一章'}。双方准备后一起出发。`}</p>
      <section aria-label="合作团队战报"><CoopSharedStats view={view} /><CoopPlayers view={view} summary /><CoopChapterRoute view={view} /></section>
      <p className="coop-session-note">得分与构筑属于本次合作，不上传单人排行榜，也不覆盖单人检查点。</p>
      {!complete && <CoopReadyStatus view={view} />}
      <div className="coop-modal-actions">{!complete && <button type="button" className="primary-button" autoFocus disabled={!play.canContinue} onClick={play.continueReady}>{play.local?.ready ? '已准备 · 等待队友' : defeated ? '准备从安全点重试' : '准备进入下一章'}</button>}<button type="button" className="secondary-button" autoFocus={complete} onClick={() => play.leave()}>{complete ? '返回终端' : '结束合作并返回'}</button></div>
    </Dialog>;
  }
  if (view.mode === 'playing') return null;
  return <Dialog title="合作运行时尚未就绪" dismissible={false} onClose={() => undefined} className="coop-play-dialog"><p className="coop-play-message" role="status">{play.message || '当前章节暂时无法开始，请返回终端重新建立合作。'}</p><button type="button" className="secondary-button" autoFocus onClick={() => play.leave()}>返回终端</button></Dialog>;
}

function CoopPausePanel({ play, fullscreen }: { play: ReturnType<typeof useCoopPlay>; fullscreen?: ReturnType<typeof useViewportFullscreen> }) {
  const [settings, setSettings] = useState(false);
  const view = play.snapshot!;
  return <Dialog title={play.status === 'reconnecting' ? '等待合作连接恢复' : '双人训练已暂停'} dismissible={false} onClose={() => undefined} className="coop-play-dialog">
    <p className="coop-play-message" role="status">{play.message || '两名玩家的共同世界与计时均已暂停。'}</p>
    <CoopPlayers view={view} summary /><CoopSharedStats view={view} />
    <p className="coop-session-note">{play.status === 'reconnecting' ? '服务器为原玩家保留席位最多 30 秒。双方重新连接后，由房主确认恢复。' : view.host ? '只有房主可以恢复；恢复后双方一同继续。' : '等待房主恢复，当前操作不会自行继续战斗。'}</p>
    <div className="coop-modal-actions">{view.host && <button type="button" className="primary-button" autoFocus disabled={!play.canResume} onClick={play.resume}>恢复双人训练 <span aria-hidden="true">→</span></button>}<button type="button" className="secondary-button" onClick={() => play.leave()}>结束合作并返回</button></div>
    <div className="coop-pause-utilities"><button type="button" className="secondary-button" onClick={() => setSettings(true)}>声音与动态设置</button>{fullscreen && <button type="button" className="secondary-button" onClick={() => void fullscreen.toggle()}>{fullscreen.active ? '退出全屏' : '全屏显示'}</button>}</div>
    {fullscreen?.message && <p className="coop-session-note" role="status">{fullscreen.message}</p>}
    <p className="coop-session-note">结束会离开当前合作。单人进度保持独立，本场合作不保存到本地。</p>
    {settings && <Dialog title="合作设置 / SETTINGS" onClose={() => setSettings(false)} className="settings-dialog"><GameSettings audio={play.audio} motion={play.motion} /></Dialog>}
  </Dialog>;
}

function CoopReadyStatus({ view }: { view: NonNullable<ReturnType<typeof useCoopPlay>['snapshot']> }) {
  return <p className="coop-continue-ready" aria-label="队伍继续准备">{view.players.map(player => <span key={player.id} data-ready={player.ready}>{player.id === 'p1' ? '1P' : '2P'} {player.ready ? '已准备' : '等待准备'}</span>)}</p>;
}
