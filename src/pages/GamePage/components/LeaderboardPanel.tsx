import { useEffect, useState } from 'react';
import { ListLeaderboardAPI } from '../../../apis/game/ListLeaderboardAPI';
import type { ListLeaderboardResponse } from '../../../objects/game/apiTypes/ListLeaderboardResponse';
import { sendAPI } from '../../../system/api/sendAPI';

type State = { kind: 'loading' } | { kind: 'ready'; data: ListLeaderboardResponse } | { kind: 'error'; message: string };
export function LeaderboardPanel() {
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    sendAPI(new ListLeaderboardAPI(10, page), { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ kind: 'ready', data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ kind: 'error', message: error instanceof Error ? error.message : '排行榜加载失败。' }); });
    return () => controller.abort();
  }, [page, attempt]);
  const navigate = (offset: number) => { setState({ kind: 'loading' }); setPage(offset); };
  return <div className="records-panel">
    <p className="records-intro">训练成绩<small>非竞技训练榜 · 仅展示已上传的成绩</small></p>
    <div className="records-content" aria-busy={state.kind === 'loading'}>
      {state.kind === 'loading' && <div className="records-empty"><span className="records-symbol" aria-hidden="true">…</span><p role="status">查询训练记录…</p></div>}
      {state.kind === 'error' && <div className="records-empty"><span className="records-symbol" aria-hidden="true">↻</span><h3>暂时无法读取记录</h3><p role="alert">{state.message}</p><button className="secondary-button" onClick={() => setAttempt(value => value + 1)}>重试连接</button></div>}
      {state.kind === 'ready' && (state.data.entries.length === 0 ? <div className="records-empty"><span className="records-symbol" aria-hidden="true">∅</span><h3>{page === 0 ? '尚无训练记录' : '本页暂无记录'}</h3><p>{page === 0 ? '完成一次训练后，可以在结算页上传成绩。' : '记录可能已更新，返回上一页继续查看。'}</p></div> :
        <div className="records-table-scroll" tabIndex={0} aria-label="训练记录列表"><table className="leaderboard"><thead><tr><th scope="col">#</th><th scope="col">智能体</th><th scope="col">得分</th><th scope="col">章节</th><th scope="col">P(Doom)</th></tr></thead><tbody>{state.data.entries.map(entry => <tr key={`${entry.rank}-${entry.username}`}><td>{entry.rank.toString().padStart(2, '0')}</td><td>{entry.username}</td><td>{entry.score}</td><td>{String(entry.stage).padStart(2, '0')}</td><td>{entry.doom.toFixed(1)}%</td></tr>)}</tbody></table></div>)}
    </div>
    <nav className="records-pagination" aria-label="训练记录分页">
      <button className="secondary-button" disabled={page === 0} onClick={() => navigate(Math.max(0, page - 10))}>← 上一页</button>
      <span>第 {Math.floor(page / 10) + 1} 页</span>
      <button className="secondary-button" disabled={state.kind !== 'ready' || state.data.nextOffset === null} onClick={() => state.kind === 'ready' && state.data.nextOffset !== null && navigate(state.data.nextOffset)}>下一页 →</button>
    </nav>
    <p className="records-note">成绩来自客户端模拟，云端进行基本校验；训练榜不提供竞技反作弊保证。</p>
  </div>;
}
