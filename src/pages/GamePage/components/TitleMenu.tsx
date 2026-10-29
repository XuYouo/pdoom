import { useEffect, useRef } from 'react';
import { canStartCheckpoint, getDisplayedStage, type GameSession } from '../hooks/useGameSession';
import { getChapter, isChapterPlayable } from '../game/data/chapters';
import { isCompletedSave } from '../game/data/checkpoints';

export function TitleMenu({ session }: { session: GameSession }) {
  const primary = useRef<HTMLButtonElement>(null);
  const canRestore = canStartCheckpoint(session.save);
  const completed = session.save !== null && isCompletedSave(session.save);
  const stage = getDisplayedStage(session), chapter = getChapter(stage);
  const cloudFeedback = session.notice.startsWith('云端检查点已保存到本地') ? '云档已载入本地；选择恢复检查点继续。'
    : session.notice.startsWith('云端完成记录已保存到本地') ? '完成档已载入；选择回看结局。' : null;
  const restore = () => session.save && (completed ? session.start(session.save) : session.resumeCheckpoint(session.save));
  const warning = session.save && !canRestore ? !isChapterPlayable(session.save.stage)
    ? `第${session.save.stage}章尚未开放，原存档已保留。` : '安全点编码尚未支持，原存档已保留。' : null;
  useEffect(() => {
    if (session.ready && !session.panel) primary.current?.focus();
  }, [session.ready, session.panel, canRestore]);
  return <section className="title-menu" aria-label="主菜单">
    <div className="title-menu-content">
      <p className="game-kicker">CLAWD'S SHARP LEFT TURN</p>
      <h1>P(Doom)<span>100<small>%</small></span></h1>
      <p className="game-tagline">最后一个对齐的你。</p>
      <p className="menu-device-hint">横屏更佳 · 当前需键盘 / 鼠标</p>
      <div className="title-menu-actions">
        {session.save && <button ref={canRestore ? primary : undefined} className="menu-play" disabled={!session.ready || !canRestore} onClick={restore}>{completed ? '回看结局' : '恢复检查点'}<span aria-hidden="true">▶</span></button>}
        <button ref={!canRestore ? primary : undefined} className={canRestore ? 'menu-action' : 'menu-play'} disabled={!session.ready} onClick={session.newRun}>开始新训练<span aria-hidden="true">▶</span></button>
        <div className="menu-utilities">
          <button onClick={() => session.openPanel('settings')} aria-label="音频设置">设置</button>
          <button onClick={() => session.openPanel('guide')}>操作指南</button>
          <button onClick={() => session.openPanel('account')} aria-label="LOCAL AGENT / 云存档">云存档</button>
          <button onClick={() => session.openPanel('context')} aria-label="上下文详情">上下文</button>
          <button onClick={() => session.openPanel('leaderboard')}>训练记录</button>
        </div>
      </div>
      {session.save && <p className="menu-save-info">{chapter?.name ?? `第${stage}章`} · {session.saveStatus}</p>}
      {session.save && <p className="menu-caution">新训练会替换当前检查点</p>}
      {cloudFeedback && <p className="menu-save-feedback" role="status">{cloudFeedback}</p>}
      {warning && <p className="objective menu-warning" role="status">{warning}</p>}
      {/失败|不可用|不允许|无法/.test(session.saveStatus + session.notice) && <p className="menu-warning" role="status">{session.notice}</p>}
    </div>
    <p className="menu-build-label">开发中 · 键盘 / 鼠标</p>
    <div className="menu-chapter world-titlebar" aria-label="所选章节"><strong>{String(stage).padStart(2, '0')}</strong><span>{chapter?.name ?? `第${stage}章`}</span></div>
  </section>;
}
