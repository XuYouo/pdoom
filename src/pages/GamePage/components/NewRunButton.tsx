import { useRef, useState, type MouseEvent, type ReactNode, type Ref } from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import type { GameSaveData } from '../../../objects/game/GameSaveData';
import { getChapter } from '../game/data/chapters';
import { decodeCheckpoint, isCompletedSave } from '../game/data/checkpoints';
import { formatTime } from '../functions/saveModel';
import './new-run-button.css';

export interface NewRunButtonProps {
  save: GameSaveData | null;
  onNewRun: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}

/** Protect the actual local slot at every new-run entry point, without changing session rules. */
export function NewRunButton({ save, onNewRun, children, disabled = false, className, autoFocus, buttonRef }: NewRunButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const committed = useRef(false);
  const chapter = save ? getChapter(save.stage) : undefined;
  const completed = save !== null && isCompletedSave(save);
  const checkpoint = save ? decodeCheckpoint(save.checkpoint) : null;
  const location = completed ? '已完成 · 可回看结局' : !checkpoint?.supported ? '已保留的检查点'
    : checkpoint.room === 0 ? '章节入口' : `${checkpoint.resting ? '安全休息室' : '安全点'} ${String(checkpoint.room).padStart(2, '0')}`;
  const begin = () => {
    if (disabled || committed.current) return;
    if (save) setConfirming(true);
    else { committed.current = true; onNewRun(); }
  };
  const confirm = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled || committed.current) return;
    committed.current = true;
    // Release native modal inertness before the engine focuses its canvas.
    event.currentTarget.closest('dialog')?.close();
    setConfirming(false);
    onNewRun();
  };
  return <>
    <button ref={buttonRef} type="button" className={className} disabled={disabled} autoFocus={autoFocus} onClick={begin}>{children}</button>
    {confirming && save && <Dialog title="开始新的训练？" onClose={() => setConfirming(false)} showCloseButton={false} className="new-run-confirm-dialog">
      <p className="new-run-confirm-intro">新的训练会替换下面的本地进度。{completed ? '当前结局将无法再从本地回看。' : '当前检查点将无法再从本地恢复。'}</p>
      <section className="new-run-current" aria-label="将被替换的本地进度">
        <p className="new-run-current-label">当前记录 <span>{String(save.stage).padStart(2, '0')}</span></p>
        <h3>{chapter?.name ?? `第 ${save.stage} 章`}</h3>
        <p>{location}</p>
        <dl><div><dt>累计时长</dt><dd>{formatTime(save.elapsedMs)}</dd></div><div><dt>得分</dt><dd>{save.score.toLocaleString('zh-CN')}</dd></div><div><dt>P(Doom)</dt><dd>{save.doom.toFixed(1)}%</dd></div></dl>
      </section>
      <p className="new-run-cloud-note">云存档和已上传的训练记录不会被删除；未上传的成绩不会自动上传。</p>
      <div className="new-run-confirm-actions">
        <button type="button" className="secondary-button" autoFocus onClick={() => setConfirming(false)}>保留当前进度</button>
        <button type="button" className="primary-button" disabled={disabled} onClick={confirm}>替换并开始新训练 <span aria-hidden="true">→</span></button>
      </div>
    </Dialog>}
  </>;
}
