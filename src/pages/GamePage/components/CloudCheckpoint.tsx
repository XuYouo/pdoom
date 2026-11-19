import type { GameSaveData } from '../../../objects/game/GameSaveData';
import { getChapter } from '../game/data/chapters';
import { decodeCheckpoint, isCompletedSave } from '../game/data/checkpoints';
import { formatTime } from '../functions/saveModel';

export function CloudCheckpoint({ label, save, empty, revision, updatedAt }: {
  label: string; save: GameSaveData | null; empty: string; revision?: number; updatedAt?: string | null;
}) {
  const checkpoint = save ? decodeCheckpoint(save.checkpoint) : null;
  const timestamp = updatedAt ? new Date(updatedAt) : null;
  return <section className="cloud-checkpoint" aria-label={label}>
    <div className="cloud-checkpoint-heading"><h3>{label}</h3>{revision !== undefined && <span>版本 {revision}</span>}</div>
    {save ? <>
      <p className="cloud-chapter-number">CH {String(save.stage).padStart(2, '0')}<span>{isCompletedSave(save) ? '已完成' : checkpoint?.supported ? checkpoint.room ? `安全${checkpoint.resting ? '休息室' : '点'} ${checkpoint.room}` : '章节起点' : '检查点待支持'}</span></p>
      <strong className="cloud-chapter-name">{getChapter(save.stage)?.name ?? `第 ${save.stage} 章`}</strong>
      <dl className="cloud-checkpoint-stats">
        <div><dt>得分</dt><dd>{save.score.toLocaleString('zh-CN')}</dd></div>
        <div><dt>时长</dt><dd>{formatTime(save.elapsedMs)}</dd></div>
        <div><dt>HP</dt><dd>{Math.ceil(save.hp)}<small> / 100</small></dd></div>
        <div><dt>P(Doom)</dt><dd>{save.doom.toFixed(1)}<small>%</small></dd></div>
      </dl>
    </> : <p className="cloud-checkpoint-empty">{empty}</p>}
    {timestamp && Number.isFinite(timestamp.getTime()) && <p className="cloud-updated">上传于 <time dateTime={updatedAt!}>{new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(timestamp)}</time></p>}
  </section>;
}
