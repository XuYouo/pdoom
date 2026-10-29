import type { ReactNode } from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import { canStartCheckpoint, chapterLabel, type GameSession } from '../hooks/useGameSession';
import { getChapter } from '../game/data/chapters';
import { ScoreSubmission } from './ScoreSubmission';
import { EndingOverlay } from './EndingOverlay';

export function RunOverlay({ session, fullscreenButton, fullscreenMessage = '' }: { session: GameSession; fullscreenButton?: ReactNode; fullscreenMessage?: string }) {
  const { screen } = session;
  if (screen.kind === 'playing' || screen.kind === 'menu' || screen.kind === 'rest') return null;
  if (screen.kind === 'ended' && screen.result.ending !== 'defeat') return <EndingOverlay key={screen.result.save.runId} result={screen.result} onNewRun={session.newRun} onReturnToMenu={session.returnToMenu} onOpenAccount={() => session.openPanel('account')} />;
  const paused = screen.kind === 'paused', cleared = screen.kind === 'chapter-clear';
  const chapter = cleared ? getChapter(screen.stage) : undefined;
  const nextChapter = cleared ? getChapter(screen.save.stage) : undefined;
  const nextLabel = cleared ? chapterLabel(screen.save.stage) : '';
  const canContinue = cleared && screen.save.stage === screen.stage + 1 && canStartCheckpoint(screen.save);
  const title = paused ? '暂停前向传播。' : cleared ? `${chapter?.name ?? `第 ${screen.stage} 章`}已突破。` : '这次，梯度归零。';
  return <Dialog title={title} className="run-menu-dialog" dismissible={paused} showCloseButton={false} onClose={session.resume}>
    <p className="run-menu-caption">{paused ? '世界与计时已暂停。' : cleared ? canContinue ? `下一站：${nextChapter?.name ?? nextLabel}。` : `${nextLabel}入口已保留，暂不可进入。` : '安全检查点仍在。换个策略，再来一次。'}</p>
    <div className="run-menu-actions">
      {paused && <button className="primary-button" onClick={session.resume} autoFocus>继续训练 <span aria-hidden="true">▶</span></button>}
      {screen.kind === 'chapter-clear' && canContinue && <button className="primary-button" onClick={() => session.start(screen.save)} disabled={!session.ready} autoFocus>进入{nextLabel} <span aria-hidden="true">▶</span></button>}
      {screen.kind === 'ended' && canStartCheckpoint(session.save) && <button className="primary-button" disabled={!session.ready} onClick={() => session.save && session.resumeCheckpoint(session.save)} autoFocus>从检查点恢复</button>}
      {screen.kind === 'ended' && <button className="secondary-button" onClick={session.newRun} autoFocus={!canStartCheckpoint(session.save)}>新一轮训练</button>}
      {paused && <>
        <button className="secondary-button" aria-label="音频设置" onClick={() => session.openPanel('settings')}>设置</button>
        <button className="secondary-button" onClick={() => session.openPanel('context')}>上下文</button>
        <button className="secondary-button" onClick={() => session.openPanel('guide')}>操作指南</button>
        <button className="secondary-button" aria-label="LOCAL AGENT / 云存档" onClick={() => session.openPanel('account')}>云存档</button>
      </>}
      <button className="secondary-button" onClick={() => session.openPanel('leaderboard')}>训练记录</button>
      <button className={cleared && !canContinue ? 'primary-button' : 'secondary-button'} onClick={session.returnToMenu} autoFocus={cleared && !canContinue}>返回终端</button>
    </div>
    {paused && <div className="run-display-actions">{fullscreenButton}{fullscreenMessage && <p role="status">{fullscreenMessage}</p>}</div>}
    {screen.kind === 'ended' && <ScoreSubmission result={screen.result} onOpenAccount={() => session.openPanel('account')} />}
  </Dialog>;
}
