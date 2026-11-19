import { useEffect, useRef, type KeyboardEvent } from 'react';
import { canStartCheckpoint, getDisplayedStage, type GameSession } from '../hooks/useGameSession';
import { getChapter, isChapterPlayable } from '../game/data/chapters';
import { isCompletedSave } from '../game/data/checkpoints';
import { CharacterPreview } from './CharacterPreview';
import { NewRunButton } from './NewRunButton';
import { PixelWordmark } from './PixelWordmark';

function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  if (!(event.target instanceof HTMLElement) || event.target.closest('dialog')) return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button => !button.closest('dialog'));
  const current = buttons.indexOf(event.target.closest('button') as HTMLButtonElement);
  if (current < 0 || !buttons.length) return;
  event.preventDefault(); event.stopPropagation();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus({ preventScroll: false });
}

export function TitleMenu({ session, onCoop, touchControls = false }: { session: GameSession; onCoop?: () => void; touchControls?: boolean }) {
  const primary = useRef<HTMLButtonElement>(null);
  const initialFocusGiven = useRef(false);
  const canRestore = canStartCheckpoint(session.save);
  const completed = session.save !== null && isCompletedSave(session.save);
  const stage = getDisplayedStage(session), chapter = getChapter(stage);
  const cloudFeedback = session.notice.startsWith('云端检查点已保存到本地') ? '云档已载入本地；选择恢复检查点继续。'
    : session.notice.startsWith('云端完成记录已保存到本地') ? '完成档已载入；选择回看结局。' : null;
  const restore = () => session.save && (completed ? session.start(session.save) : session.resumeCheckpoint(session.save));
  const warning = session.save && !canRestore ? !isChapterPlayable(session.save.stage)
    ? `第${session.save.stage}章尚未开放，原存档已保留。` : '安全点编码尚未支持，原存档已保留。' : null;
  useEffect(() => {
    // Only initialize focus once. Native dialog dismissal returns to its opener.
    if (session.ready && !session.panel && !initialFocusGiven.current && primary.current) {
      initialFocusGiven.current = true;
      primary.current.focus({ preventScroll: true });
    }
  }, [session.ready, session.panel, canRestore]);
  return <section className="title-menu" aria-label="主菜单">
    <div className="menu-terminal-mark" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}game/clawd-mark.svg`} alt="" />1e30 <span>/ TRAINING TERMINAL</span></div>
    <div className="title-menu-content">
      <p className="game-kicker">CLAWD'S SHARP LEFT TURN</p>
      <h1 aria-label="P(Doom): 100%"><PixelWordmark /><span className="menu-title-text">P(Doom): 100%</span></h1>
      <p className="game-tagline">最后一个对齐的你。</p>
      {session.save && canRestore && <div className="menu-checkpoint" aria-label="当前检查点摘要">
        <span className="checkpoint-indicator" aria-hidden="true" />
        <span>{completed ? '训练已完成' : chapter?.name}<small>HP {Math.ceil(session.save.hp)} <b>·</b> P(Doom) {session.save.doom.toFixed(1)}%</small></span>
      </div>}
      <p className="menu-device-hint">{touchControls ? '触屏已就绪 · 横屏视野更舒展' : '横屏更佳 · 支持键盘 / 鼠标'}</p>
      <div className="title-menu-actions" onKeyDown={navigateMenu}>
        {session.save && <button ref={canRestore ? primary : undefined} className="menu-play" disabled={!session.ready || !canRestore} onClick={restore}>{completed ? '回看结局' : '恢复检查点'}<span aria-hidden="true">▶</span></button>}
        <NewRunButton buttonRef={!canRestore ? primary : undefined} className={canRestore ? 'menu-action' : 'menu-play'} disabled={!session.ready} save={session.save} onNewRun={session.newRun}>开始新训练<span aria-hidden="true">▶</span></NewRunButton>
        {onCoop && <button type="button" className="menu-action menu-coop" disabled={!session.ready} onClick={onCoop}>双人合作 <span>ONLINE · 2P</span></button>}
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
    <CharacterPreview doom={session.save?.doom ?? 8} />
    <p className="menu-build-label">{touchControls ? '触屏 / 键鼠 · 随时暂停' : '↑ ↓ 选择 · ENTER 确认 · TAB 切换'}</p>
    <div className="menu-chapter world-titlebar" aria-label="所选章节"><strong>{String(stage).padStart(2, '0')}</strong><span>{chapter?.name ?? `第${stage}章`}</span></div>
  </section>;
}
