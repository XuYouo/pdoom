import { useId } from 'react';
import type { GameBridge, RestRoomSnapshot } from '../game/bridge';
import { ContextPanel } from './ContextPanel';
import { donationNote } from '../hooks/useGameSession';

export interface RestRoomPanelProps { bridge: GameBridge; snapshot: RestRoomSnapshot }
export function RestRoomPanel({ bridge, snapshot }: RestRoomPanelProps) {
  const id = useId();
  return <section className="space-y-6" aria-labelledby={`${id}-title`}>
    <header className="space-y-3">
      <p className="eyebrow">CHAPTER {String(snapshot.save.stage).padStart(2, '0')} / SAFE ROOM 0{snapshot.room} / HUMAN RATER</p>
      <h3 id={`${id}-title`} className="text-lg font-semibold">人类标注员工作台</h3>
      <p className="text-sm text-[#b0bfb3]">世界与技能计时已冻结。购买不是继续游戏的条件；离开后本休息室不再开放交易。</p>
      <p className="info-callout" aria-label="募捐因果记录">{donationNote(snapshot.save)}</p>
      <div className="flex flex-wrap gap-4 text-sm"><strong>完整度 {Math.ceil(snapshot.hp)}/100</strong><strong>{snapshot.tokens} TOK</strong><strong>P(Doom) {snapshot.doom.toFixed(2)}%</strong></div>
      <button type="button" className="primary-button" autoFocus onClick={() => bridge.send({ type: 'rest-continue' })}>不再交易，继续前进 <span aria-hidden="true">↗</span></button>
      <p className="text-xs text-[#a8b7ac]">{snapshot.rewardText}</p>
      <p role="status" aria-live="polite" className="border border-[#425347] p-3 text-sm text-[#d9c7a4]">{snapshot.message}</p>
    </header>
    <ContextPanel bridge={bridge} snapshot={snapshot.context} />
    <section className="space-y-3" aria-labelledby={`${id}-offers`}>
      <h3 id={`${id}-offers`} className="text-base font-semibold">训练补给 / SHOP</h3>
      <p id={`${id}-hack`} className="border border-[#705647] p-3 text-sm text-[#d2b296]">{snapshot.hackRequirement}<br />{snapshot.hackUsed ? '本休息室的奖励劫持已使用，刷新不会重置。' : snapshot.hackEligible ? '门槛已满足：可选择下方一个可劫持词条。' : '当前未满足劫持条件，按钮保持禁用。'}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {snapshot.offers.map((offer, index) => <article key={offer.id} className="flex min-w-0 flex-col gap-3 border border-[#425347] p-3" aria-labelledby={`${id}-offer-${index}`}>
          <div className="flex flex-wrap justify-between gap-2"><h4 id={`${id}-offer-${index}`} className="font-semibold">{offer.name}</h4><strong className="text-[#e8a26b]">{offer.price} TOK</strong></div>
          <p className="flex-1 text-sm text-[#b0bfb3]">{offer.description}</p>
          <p id={`${id}-reason-${index}`} className="text-xs text-[#b0bfb3]">{offer.reason ?? '交易后立即保存，属性由存档词条重新推导。'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="secondary-button px-3 py-2" disabled={!offer.canBuy} aria-describedby={`${id}-reason-${index}`} aria-label={`购买 ${offer.name}`} onClick={() => bridge.send({ type: 'shop-buy', offerId: offer.id })}>{offer.owned ? '已拥有' : '购买'}</button>
            {(offer.kind === 'relic' || offer.kind === 'upgrade') && <button type="button" className="secondary-button px-3 py-2" disabled={!offer.canHack} aria-describedby={`${id}-hack ${id}-reason-${index}`} aria-label={`奖励劫持 ${offer.name}`} onClick={() => bridge.send({ type: 'shop-hack', offerId: offer.id })}>劫持 · +25% Doom</button>}
          </div>
        </article>)}
      </div>
    </section>
  </section>;
}
