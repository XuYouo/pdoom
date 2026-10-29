import type { RunResult } from '../../../objects/game/GameSaveData';
import { useScoreSubmission } from '../hooks/useScoreSubmission';

export interface ScoreSubmissionProps { result: RunResult; onOpenAccount: () => void }

function SubmissionForRun({ result, onOpenAccount }: ScoreSubmissionProps) {
  const submission = useScoreSubmission(result);
  const { state } = submission;
  const busy = state.kind === 'submitting';
  const done = state.kind === 'submitted';
  const invalid = state.kind === 'invalid-result';

  return <section className="space-y-3 mt-6" aria-label="本局成绩上传" aria-busy={busy}>
    <h3>云端训练记录</h3>
    <p className="muted-text">成绩由浏览器计算，可被修改。这是非竞技训练榜，不具备服务端权威反作弊。</p>
    {done ? <p className="status-message" role="status">云端已记录本局成绩。{state.response.personalBest ? '首次提交时刷新了个人最佳。' : '本局已记录，未刷新个人最佳。'}</p> : <>
      {!submission.username && !invalid && <p className="muted-text">登录后可上传本局成绩；本地结果仍然保留，不会自动提交。</p>}
      {submission.username && <p className="muted-text">提交账号：{submission.username} · 重试沿用本局 runId 与相同数据。</p>}
      {state.kind === 'error' || state.kind === 'login-required' || invalid
        ? <p className="status-message error" role="alert">{state.message}</p> : null}
      <div className="flex flex-wrap gap-3">
        {submission.username && !invalid
          ? <button className="primary-button" type="button" disabled={busy} onClick={() => void submission.submit()}>
            {busy ? '正在上传本局成绩…' : submission.attempted ? '重试相同成绩' : '上传本局成绩'}
          </button>
          : !invalid && <button className="secondary-button" type="button" onClick={onOpenAccount}>登录后上传</button>}
      </div>
      {busy && <p role="status" className="muted-text">等待云端确认；请勿把断网或超时当成提交成功。</p>}
    </>}
  </section>;
}

/** Remount only when a different run arrives, so rerenders cannot change an in-flight/retried payload. */
export function ScoreSubmission(props: ScoreSubmissionProps) {
  return <SubmissionForRun key={props.result.save.runId} {...props} />;
}
