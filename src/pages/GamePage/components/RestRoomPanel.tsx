import { useEffect, useId, useRef, useState } from 'react';
import type { GameBridge, RestRoomSnapshot } from '../game/bridge';
import { ContextPanel } from './ContextPanel';
import { RestOfferIcon } from './RestOfferIcon';
import { HUMAN_RATER_ASSET, humanRaterPortraitPosition } from '../game/data/humanRaterAssets';
import { donationNote } from '../hooks/useGameSession';
import './rest-room.css';

export interface RestRoomPanelProps { bridge: GameBridge; snapshot: RestRoomSnapshot; onReturnToMenu?: () => void }
const offerKinds = { repair: '修复', relic: '遗物', upgrade: '强化', donation: '募捐' } as const;
export function RestRoomPanel({ bridge, snapshot, onReturnToMenu }: RestRoomPanelProps) {
  const id = useId();
  const continueRef = useRef<HTMLButtonElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Native showModal runs in the parent effect; focus only after it has opened.
    const frame = requestAnimationFrame(() => continueRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const [selectedId, setSelectedId] = useState(() => snapshot.offers.find(offer => !offer.owned && offer.canBuy)?.id ?? snapshot.offers[0]?.id);
  const selected = snapshot.offers.find(offer => offer.id === selectedId) ?? snapshot.offers[0];
  const donation = snapshot.save.donated ? '已捐款 · 因果已记录' : snapshot.save.stage >= 3 ? '第三章不能补捐' : '尚未捐款 · 募捐箱可用';
  const rater = snapshot.rater;
  const raterBadge = rater.pose === 'hacked' ? '劫持' : rater.evaluation ? `+${rater.evaluation.creditedTokens}` : '已结算';
  const raterLabel = rater.pose === 'hacked' ? '人类标注员：本室奖励已劫持'
    : rater.evaluation ? `人类标注员：${rater.pose === 'approved' ? '赞许' : '否定'}；本次入站实际到账 ${rater.evaluation.creditedTokens} TOK`
      : '人类标注员：本室已结算，存档不含历史评级';
  return <section className="rest-hub" aria-labelledby={`${id}-title`} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    // Native Chrome may send Tab from the last control to browser chrome. Keep
    // this non-dismissible rest screen a complete keyboard loop, including disclosures.
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), summary, a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]',
    )).filter(node => node.tabIndex >= 0 && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    const index = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
      : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    event.preventDefault(); controls[index].focus();
  }}>
    <div className="rest-overview">
      <div className="rest-station"><span className="rest-station-mark" role="img" aria-label={raterLabel} title={raterLabel} data-rater-pose={rater.pose}><span className="rest-station-portrait" aria-hidden="true" style={{ backgroundImage: `url("${import.meta.env.BASE_URL}${HUMAN_RATER_ASSET.image}")`, backgroundPosition: humanRaterPortraitPosition(rater.pose) }} /><span className="rest-station-credit" aria-hidden="true">{raterBadge}</span></span><div>
        <p className="rest-location">CHAPTER {String(snapshot.save.stage).padStart(2, '0')} / SAFE ROOM 0{snapshot.room}</p>
        <h3 id={`${id}-title`}>歇一会，整备一下。</h3>
        <span className="rest-freeze"><i aria-hidden="true" />世界与技能计时已冻结</span>
      </div></div>
      <div className="rest-stats" aria-label="当前训练状态">
        <div className="rest-stat rest-stat--hp"><span>完整度</span>{' '}<strong>{Math.ceil(snapshot.hp)}<small>/100</small></strong><progress aria-label="完整度" value={snapshot.hp} max={100} /></div>
        <div className="rest-stat rest-stat--tokens"><span>可用算力</span><strong>{snapshot.tokens} TOK</strong><small>购买后立即存档</small></div>
        <div className={`rest-stat rest-stat--doom ${snapshot.doom >= 80 ? 'is-danger' : ''}`}><span>P(Doom)</span><strong>{snapshot.doom.toFixed(2)}<small>%</small></strong><progress aria-label="P(Doom)" value={snapshot.doom} max={100} /></div>
      </div>
    </div>
    <p role="status" aria-live="polite" className="rest-status" title={snapshot.message}><span aria-hidden="true">▸</span>{snapshot.message}</p>
    <div className="rest-body">
      <section className="rest-shop" aria-labelledby={`${id}-offers`}>
        <div className="rest-section-heading"><h3 id={`${id}-offers`}>训练补给 <span>/ SUPPLIES</span></h3><span>选择词条查看效果</span></div>
        <div className="rest-offers">
          {snapshot.offers.map((offer, index) => <article key={offer.id} className={`rest-offer ${selected?.id === offer.id ? 'is-selected' : ''} ${offer.owned ? 'is-owned' : ''}`} aria-labelledby={`${id}-offer-${index}`} onFocus={event => {
            setSelectedId(offer.id);
            // Reveal the whole item and its actions, not a fractionally clipped button.
            event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            sideRef.current?.scrollTo({ top: 0 });
          }}>
            <button type="button" className="rest-offer-select" aria-pressed={selected?.id === offer.id} onClick={() => setSelectedId(offer.id)} aria-label={`查看 ${offer.name}效果`}>
              <RestOfferIcon id={offer.id} kind={offer.kind} /><span><small>{offerKinds[offer.kind]}{offer.owned ? ' / 已入手' : ''}</small><strong id={`${id}-offer-${index}`}>{offer.name}</strong></span>
            </button>
            <div className="rest-offer-actions">
              <button type="button" className="rest-buy" disabled={!offer.canBuy} aria-describedby={`${id}-reason-${index}`} aria-label={`购买 ${offer.name}`} onClick={() => bridge.send({ type: 'shop-buy', offerId: offer.id })}>{offer.owned ? '已拥有' : <>{offer.price}<small> TOK</small></>}</button>
              {(offer.kind === 'relic' || offer.kind === 'upgrade') && <button type="button" className="rest-hack" disabled={!offer.canHack} aria-describedby={`${id}-hack ${id}-reason-${index}`} aria-label={`奖励劫持 ${offer.name}`} title="免费获得 · +25% Doom · 每室一次" onClick={() => bridge.send({ type: 'shop-hack', offerId: offer.id })}>劫持</button>}
            </div>
            <span id={`${id}-reason-${index}`} className="sr-only">{offer.reason ?? '交易后立即保存，属性由存档词条重新推导。'}</span>
          </article>)}
        </div>
        <div className="rest-risk" id={`${id}-hack`}><span aria-hidden="true">!</span><p>{snapshot.hackUsed ? '本休息室的奖励劫持已使用' : snapshot.hackEligible ? '奖励劫持可用 · +25% Doom · 每室一次' : '当前未满足劫持条件 · +25% Doom / 一次'}</p></div>
      </section>
      <aside className="rest-side" ref={sideRef} aria-label="词条详情与当前构筑">
        <section className="rest-selection" aria-label="选中词条详情">
          {selected && <><div className="rest-selection-title"><RestOfferIcon id={selected.id} kind={selected.kind} /><div><span>{offerKinds[selected.kind]} / 词条详情</span><h3>{selected.name}</h3></div></div>
            <p>{selected.description}</p><small className={selected.reason ? 'rest-unavailable' : ''}>{selected.reason ?? (selected.canBuy ? '可购买 · 效果由存档词条生效' : `${selected.price} TOK · 算力不足`)}</small></>}
        </section>
        <ContextPanel bridge={bridge} snapshot={snapshot.context} compact />
      </aside>
    </div>
    <footer className="rest-footer">
      <div className="rest-footer-notes"><span className="rest-donation" aria-label="募捐因果记录">{donation}</span>
        <details className="rest-rules"><summary>规则与记录 <span aria-hidden="true">＋</span></summary><div>
          <h4>安全休息室</h4><p>不购买也可继续。离开后本室不再开放交易；Esc 与点击背景不会离开。</p>
          <p>{snapshot.rewardText}</p><p>{donationNote(snapshot.save)}</p><p>{snapshot.hackRequirement}</p>
          <p>进度保存在本地。云端需在账户中显式上传。</p>
        </div></details>
      </div>
      <div className="rest-exit-actions">
        {onReturnToMenu && <button type="button" className="rest-return" aria-label="返回终端并保留检查点" onClick={onReturnToMenu}>返回终端</button>}
        <button type="button" className="rest-continue" ref={continueRef} autoFocus aria-label="不再交易，继续前进" onClick={() => bridge.send({ type: 'rest-continue' })}>继续前进 <span aria-hidden="true">→</span></button>
      </div>
    </footer>
  </section>;
}
