import { formatTime } from '../functions/saveModel';
import type { RunDebriefSnapshot } from '../functions/runDebrief';

const routeLabels = { complete: '已通过', current: '当前章节', next: '下一站', ahead: '未抵达' } as const;

export function RunDebrief({ snapshot }: { snapshot: RunDebriefSnapshot }) {
  const { kind, checkpoint } = snapshot;
  return <section className="run-debrief" aria-label={kind === 'defeat' ? '本次失败结果' : kind === 'cleared' ? '本章通过结果' : '当前训练快照'}>
    <div className="run-chapter-heading"><span className="run-chapter-number">{String(snapshot.stage).padStart(2, '0')}<small>/ 05</small></span>
      <div><p>{snapshot.english}</p><h3>{snapshot.chapter}</h3></div>
    </div>
    <dl className="run-metrics">
      <div data-hidden={snapshot.hp === null}><dt>生命 / HP</dt><dd>{snapshot.hp === null ? <span className="run-hp-missing">读数被吞</span> : <>{Math.ceil(snapshot.hp)}<small>/ 100</small></>}</dd></div>
      <div className="run-doom-metric"><dt>P(Doom)</dt><dd>{snapshot.doom.toFixed(1)}<small>%</small></dd></div>
      <div><dt>累计用时</dt><dd>{formatTime(snapshot.elapsedMs)}</dd></div>
      <div><dt>持有算力</dt><dd>{snapshot.tokens}<small>TOK</small></dd></div>
    </dl>
    {snapshot.hp === null && <p className="run-hidden-hp-note">Leviathan 吞掉了生命读数；生命仍然有效。</p>}
    {kind !== 'paused' && <div className="run-score-line"><span>本局累计分数</span><strong>{snapshot.score.toLocaleString('en-US')}</strong></div>}
    {snapshot.objective && <div className="run-resume-objective"><span>继续后的目标</span><p>{snapshot.objective}</p></div>}
    {kind === 'cleared' && <ol className="run-chapter-route" aria-label="五章进度">
      {snapshot.route.map(chapter => <li key={chapter.stage} data-state={chapter.status} aria-current={chapter.status === 'next' ? 'step' : undefined} title={`${chapter.name} · ${routeLabels[chapter.status]}`}>
        <span aria-hidden="true">{chapter.status === 'complete' ? '✓' : String(chapter.stage).padStart(2, '0')}</span>
        <small>{routeLabels[chapter.status]}</small><span className="sr-only">第{chapter.stage}章：{chapter.name}</span>
      </li>)}
    </ol>}
    {kind === 'defeat' && checkpoint && <section className="run-checkpoint-note" aria-label="保留的安全检查点">
      <span className="run-checkpoint-symbol" aria-hidden="true">↳</span>
      <div><h4>安全检查点仍在</h4><p>{checkpoint.chapter} · {checkpoint.location}</p>
        <p className="run-checkpoint-resources">恢复时：HP {Math.ceil(checkpoint.hp)} · P(Doom) {checkpoint.doom.toFixed(1)}% · {formatTime(checkpoint.elapsedMs)}</p>
        <small>回到此前保存的进度；本次失败不会覆盖它。</small></div>
    </section>}
  </section>;
}
