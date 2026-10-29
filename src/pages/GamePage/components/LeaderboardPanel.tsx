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
  return <div className="space-y-5">
    <p className="muted-text">非竞技训练榜 · 排名来自后端真实结算。客户端模拟仅有基本校验，不具强防作弊能力。</p>
    {state.kind === 'loading' && <p role="status" className="status-message">查询训练记录…</p>}
    {state.kind === 'error' && <><p role="alert" className="status-message error">{state.message}</p><button className="secondary-button" onClick={() => setAttempt(value => value + 1)}>重试连接</button></>}
    {state.kind === 'ready' && (state.data.entries.length === 0 ? <div className="empty-state"><span>∅</span><h3>尚无训练记录</h3><p>这里不会用虚构玩家填充。</p></div> : <>
      <div className="overflow-x-auto"><table className="leaderboard"><thead><tr><th>#</th><th>智能体</th><th>得分</th><th>章节</th><th>P(Doom)</th></tr></thead><tbody>{state.data.entries.map(entry => <tr key={`${entry.rank}-${entry.username}`}><td>{entry.rank.toString().padStart(2, '0')}</td><td>{entry.username}</td><td>{entry.score}</td><td>0{entry.stage}</td><td>{entry.doom.toFixed(1)}%</td></tr>)}</tbody></table></div>
      <div className="flex justify-between"><button className="secondary-button" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 10))}>← 上一页</button><button className="secondary-button" disabled={state.data.nextOffset === null} onClick={() => state.data.nextOffset !== null && setPage(state.data.nextOffset)}>下一页 →</button></div>
    </>)}
  </div>;
}
