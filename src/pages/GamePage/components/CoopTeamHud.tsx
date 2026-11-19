import type { CoopViewSnapshot } from '../network/coopPresentation';
import { COOP_RULES } from '../game/coop/model';
import { PLAYABLE_CHAPTERS } from '../game/data/chapters';
import { formatTime } from '../functions/saveModel';

export function CoopPlayers({ view, summary = false }: { view: CoopViewSnapshot; summary?: boolean }) {
  const hidden = view.hud.loom?.hpUiTaken === true;
  return <div className={`coop-players${summary ? ' coop-players--summary' : ''}`} aria-label="队伍状态">
    {view.players.map(player => <div className="coop-player" key={player.id} data-player={player.id} data-state={player.state}>
      <span className="coop-player-label">{player.id === 'p1' ? '1P' : '2P'} <small>{view.localPlayerId === player.id ? '你' : '队友'}</small></span>
      <div className="coop-player-health">{hidden ? <span className="coop-hp-hidden">生命读数被吞</span> : <><progress aria-label={`${player.id === 'p1' ? '1P' : '2P'} 完整度`} value={player.hp} max={100} /><strong>{Math.ceil(player.hp)}<small>/100</small></strong></>}</div>
      {player.state !== 'active' && <span className="coop-player-state">{player.state === 'downed' ? '倒地 · 需要救援' : '等待下个安全点归队'}</span>}
      {player.state === 'downed' && <progress className="coop-revive-progress" aria-label={`${player.id === 'p1' ? '1P' : '2P'} 救援进度`} value={player.reviveProgressMs} max={COOP_RULES.reviveMs} />}
    </div>)}
  </div>;
}

export function CoopSharedStats({ view }: { view: CoopViewSnapshot }) {
  return <dl className="coop-shared-stats" aria-label="队伍共享资源">
    <div><dt>P(Doom)</dt><dd>{view.hud.doom.toFixed(2)}<small>%</small></dd></div>
    <div><dt>共享算力</dt><dd>{view.hud.tokens}<small>TOK</small></dd></div>
    <div><dt>合作得分</dt><dd>{view.hud.score.toLocaleString('zh-CN')}</dd></div>
    <div><dt>累计时间</dt><dd>{formatTime(view.hud.elapsedMs)}</dd></div>
  </dl>;
}

export function CoopChapterRoute({ view }: { view: CoopViewSnapshot }) {
  return <ol className="coop-chapter-route" aria-label="团队五章进度">{PLAYABLE_CHAPTERS.map(chapter => {
    const cleared = chapter.stage < view.stage || chapter.stage === view.stage && (view.mode === 'cleared' || view.mode === 'finished');
    return <li key={chapter.stage} data-cleared={cleared} aria-current={chapter.stage === view.stage ? 'step' : undefined}><span>{String(chapter.stage).padStart(2, '0')}</span><small>{cleared ? '已突破' : chapter.stage === view.stage ? '当前章' : '未抵达'}</small></li>;
  })}</ol>;
}
