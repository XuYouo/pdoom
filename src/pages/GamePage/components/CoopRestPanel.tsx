import { useState } from 'react';
import type { GameBridge } from '../game/bridge';
import type { CoopViewSnapshot } from '../network/coopPresentation';
import { rewardHackAvailability, rewardHackUnavailable } from '../functions/restTransactions';
import { ContextPanel } from './ContextPanel';
import { RestOfferIcon } from './RestOfferIcon';
import { RestHackConfirmation } from './RestRoomPanel';

export function CoopRestPanel({ view, bridge, disabled = false }: { view: CoopViewSnapshot; bridge: GameBridge; disabled?: boolean }) {
  const [hackId, setHackId] = useState<string | null>(null);
  const rest = view.rest;
  if (!rest) return <p className="coop-play-message">正在等待共享补给快照…</p>;
  const hack = rest.offers.find(offer => offer.id === hackId);
  const label = view.repairTarget === 'p1' ? '1P' : '2P';
  const locked = disabled || !view.host;
  const status = rest.message.startsWith('交易完成：') || rest.message.startsWith('奖励劫持成功')
    ? rest.message.replace('本次扣款/奖励已在同一检查点保存。', '队伍共享资源已更新。')
    : rest.message.startsWith('上下文顺序已保存') ? rest.message.replace('上下文顺序已保存', '上下文顺序已更新')
      : '世界与技能计时已冻结。房主整备共享构筑，双方准备后继续。';
  return <><div className="coop-rest-panel">
    <p className="coop-rest-policy">{view.host ? '你是房主：使用队伍共享 TOK 购买、劫持或调整构筑。' : '共享补给由房主操作；你可以查看构筑并准备继续。'}交易会清除双方的继续准备，需要重新确认。</p>
    {view.host ? <fieldset className="coop-repair-target" disabled={locked}><legend>修复目标 <span>当前：{label}</span></legend>
      {view.players.map(player => <label key={player.id}><input type="radio" name="coop-repair-target" checked={view.repairTarget === player.id} onChange={() => bridge.send({ type: 'coop-repair-target', playerId: player.id })} /><span>{player.id === 'p1' ? '1P' : '2P'}{player.id === view.localPlayerId ? ' · 你' : ' · 队友'}</span><strong>{view.hud.loom?.hpUiTaken ? '读数被吞' : `${Math.ceil(player.hp)}/100`}</strong></label>)}
    </fieldset> : <p className="coop-rest-target-note">修补毛线由房主选择修复目标；双方完整度见上方队伍状态。</p>}
    <p className="coop-rest-status" role="status">{status}</p>
    <div className="coop-rest-workspace"><section className="coop-rest-shop" aria-label="合作共享补给">
      <div className="coop-rest-offers">{rest.offers.map(offer => <article key={offer.id} className="coop-rest-offer">
        <div className="coop-rest-offer-title"><RestOfferIcon id={offer.id} kind={offer.kind} /><h4>{offer.name}</h4><span>{offer.owned ? '已拥有' : `${offer.price} TOK`}</span></div>
        <p>{offer.description}</p>
        {offer.reason && (view.host || offer.kind !== 'repair') && <small className="coop-rest-reason">{offer.id === 'donation' && offer.owned ? '本次合作已捐赠；不可重复。' : offer.reason}</small>}
        {view.host && <div className="coop-rest-offer-actions"><button type="button" disabled={locked || !offer.canBuy} onClick={() => bridge.send({ type: 'shop-buy', offerId: offer.id })} aria-label={`合作购买 ${offer.name}`}>{offer.kind === 'repair' ? `修复 ${label}` : '购买'}</button>
          {(offer.kind === 'relic' || offer.kind === 'upgrade') && <button type="button" disabled={locked || !offer.canHack} onClick={() => setHackId(offer.id)} aria-label={`合作奖励劫持 ${offer.name}`}>奖励劫持</button>}
        </div>}
      </article>)}</div>
      <p className="coop-rest-hack-note">{rewardHackAvailability(rest)}</p>
    </section><aside className="coop-rest-context" aria-label="队伍共享构筑"><ContextPanel bridge={bridge} snapshot={view.context} editable={view.host && !disabled} compact /></aside></div>
    <p className="coop-rest-persistence">本次合作检查点只保留在房主当前运行时；离开或刷新不能从单人存档恢复。</p>
  </div>{view.host && hack && <RestHackConfirmation snapshot={rest} offer={hack} onCancel={() => setHackId(null)} onConfirm={() => {
    if (!disabled && hack.canHack && rewardHackUnavailable(rest, hack) === null) { setHackId(null); bridge.send({ type: 'shop-hack', offerId: hack.id }); }
  }} />}</>;
}
