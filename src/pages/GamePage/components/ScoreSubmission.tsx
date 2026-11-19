import type { RunResult } from '../../../objects/game/GameSaveData';
import { useScoreSubmission } from '../hooks/useScoreSubmission';
import './score-submission.css';

export interface ScoreSubmissionProps { result: RunResult; onOpenAccount: () => void }

function SubmissionForRun({ result, onOpenAccount }: ScoreSubmissionProps) {
  const submission = useScoreSubmission(result);
  const { state } = submission;
  const busy = state.kind === 'submitting';
  const done = state.kind === 'submitted';
  const invalid = state.kind === 'invalid-result';
  const message = state.kind === 'error' && state.code === 'conflict'
    ? '云端同一局已有不同结果，不能覆盖。重试只会发送本局原始成绩，不会改成另一局；也可以开始新一轮训练。'
    : invalid && state.message.includes('存档 v1') ? '本局结果未通过完整性检查，暂时不能上传。'
      : state.kind === 'error' && state.code === 'invalid_response' ? '云端返回了无法识别的结果，尚未确认上传成功。请稍后重试相同成绩。'
        : 'message' in state ? state.message : null;

  return <section className="score-submission" aria-label="本局成绩上传" aria-busy={busy}>
    <div className="score-submission-heading"><h3>云端训练记录</h3><span>{done ? '已记录' : busy ? '上传中' : '手动上传'}</span></div>
    <p className="score-submission-note">非竞技训练榜。成绩由本机计算，可被修改，不作权威反作弊校验。</p>
    {done ? <p className="score-submission-status" role="status">云端已记录本局成绩。{state.response.personalBest ? '首次提交时刷新了个人最佳。' : '本局已记录，未刷新个人最佳。'}</p> : <>
      {!submission.username && !invalid && <p className="score-submission-help">登录后可上传本局成绩；当前结算仍可查看，不会自动提交。</p>}
      {submission.username && <p className="score-submission-account">提交账号 <strong>{submission.username}</strong><small>不会自动提交。重试沿用同一局原始成绩，不会重复新增记录。</small></p>}
      {state.kind === 'error' || state.kind === 'login-required' || invalid
        ? <p className="score-submission-status is-error" role="alert">{message}</p> : null}
      <div className="score-submission-actions">
        {submission.username && !invalid
          ? <button className="primary-button" type="button" disabled={busy} onClick={() => void submission.submit()}>
            {busy ? '正在上传本局成绩…' : submission.attempted ? '重试相同成绩' : '上传本局成绩'}
          </button>
          : !invalid && <button className="secondary-button" type="button" onClick={onOpenAccount}>登录后上传</button>}
      </div>
      {busy && <p role="status" className="score-submission-help">正在等待云端确认。若连接中断，可重试相同成绩。</p>}
    </>}
  </section>;
}

/** Remount only when a different run arrives, so rerenders cannot change an in-flight/retried payload. */
export function ScoreSubmission(props: ScoreSubmissionProps) {
  return <SubmissionForRun key={props.result.save.runId} {...props} />;
}
