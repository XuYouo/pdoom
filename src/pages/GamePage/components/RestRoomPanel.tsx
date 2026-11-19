import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import type { GameBridge, RestRoomSnapshot, ShopOfferSnapshot } from '../game/bridge';
import { ContextPanel } from './ContextPanel';
import { RestOfferIcon } from './RestOfferIcon';
import { HUMAN_RATER_ASSET, humanRaterPortraitPosition } from '../game/data/humanRaterAssets';
import { donationNote } from '../hooks/useGameSession';
import { DOOM_FORM_THRESHOLDS, doomForm } from '../game/systems/rules';
import { REWARD_HACK_DOOM_COST } from '../game/systems/shop';
import { restOfferReason, restStorageFeedback, rewardHackAvailability, rewardHackPreview, rewardHackUnavailable } from '../functions/restTransactions';
import './rest-room.css';

export interface RestRoomPanelProps { bridge: GameBridge; snapshot: RestRoomSnapshot; onReturnToMenu?: () => void; saveStatus?: string; notice?: string }
const offerKinds = { repair: '修复', relic: '遗物', upgrade: '强化', donation: '募捐' } as const;
export function RestRoomPanel({ bridge, snapshot, onReturnToMenu, saveStatus, notice }: RestRoomPanelProps) {
  const id = useId();
  const continueRef = useRef<HTMLButtonElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Native showModal runs in the parent effect; focus only after it has opened.
    const frame = requestAnimationFrame(() => continueRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const [selectedId, setSelectedId] = useState(() => snapshot.offers.find(offer => !offer.owned && offer.canBuy)?.id ?? snapshot.offers[0]?.id);
  const [hackOfferId, setHackOfferId] = useState<string | null>(null);
  const hackSent = useRef(false);
  // Keep only the choice in state. Eligibility and consequences use the latest snapshot.
  const hackOffer = snapshot.offers.find(offer => offer.id === hackOfferId);
  const selected = snapshot.offers.find(offer => offer.id === selectedId) ?? snapshot.offers[0];
  const storage = restStorageFeedback(saveStatus, notice);
  const donation = snapshot.save.donated ? '已捐款 · 因果已记录' : snapshot.save.stage >= 3 ? '第三章不能补捐' : '尚未捐款 · 募捐箱可用';
  const rater = snapshot.rater;
  const raterBadge = rater.pose === 'hacked' ? '劫持' : rater.evaluation ? `+${rater.evaluation.creditedTokens}` : '已结算';
  const raterLabel = rater.pose === 'hacked' ? '人类标注员：本室奖励已劫持'
    : rater.evaluation ? `人类标注员：${rater.pose === 'approved' ? '赞许' : '否定'}；本次入站实际到账 ${rater.evaluation.creditedTokens} TOK`
      : '人类标注员：本室已结算，存档不含历史评级';
  return <><section className="rest-hub" aria-labelledby={`${id}-title`} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    if (event.target instanceof HTMLElement && event.target.closest('dialog') !== event.currentTarget.closest('dialog')) return;
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
        <div className="rest-stat rest-stat--tokens"><span>可用算力</span><strong>{snapshot.tokens} TOK</strong><small className={storage.failed ? 'rest-storage-failed' : undefined}>{storage.label}</small></div>
        <div className={`rest-stat rest-stat--doom ${doomForm(snapshot.doom) === 'foom' ? 'is-danger' : ''}`}><span>P(Doom)</span><strong>{snapshot.doom.toFixed(2)}<small>%</small></strong><progress aria-label="P(Doom)" value={snapshot.doom} max={100} /></div>
      </div>
    </div>
    {storage.failed ? <div role="alert" aria-label="休息室进度未保存" className="rest-status rest-save-error">
      <span aria-hidden="true">!</span><div><strong>本地保存失败</strong> · 当前变更仍在本局生效；刷新或离开可能恢复旧检查点。<small>{storage.error}</small></div>
    </div> : <p role="status" aria-live="polite" className="rest-status" title={snapshot.message}><span aria-hidden="true">▸</span>{snapshot.message}</p>}
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
              {(offer.kind === 'relic' || offer.kind === 'upgrade') && <button type="button" className="rest-hack" disabled={!offer.canHack} aria-describedby={`${id}-hack ${!offer.available ? `${id}-reason-${index}` : ''}`.trim()} aria-label={`奖励劫持 ${offer.name}`} title={`免费获得 · Doom 增加 ${REWARD_HACK_DOOM_COST} 个百分点 · 每室一次`} onClick={() => { hackSent.current = false; setHackOfferId(offer.id); }}>劫持</button>}
            </div>
            <span id={`${id}-reason-${index}`} className={offer.reason ? 'rest-offer-reason' : 'sr-only'}>{restOfferReason(offer, storage.failed) ?? '可购买；交易后尝试保存到本地检查点。'}</span>
          </article>)}
        </div>
        <div className="rest-risk" id={`${id}-hack`}><span aria-hidden="true">!</span><p>{rewardHackAvailability(snapshot)}</p></div>
      </section>
      <aside className="rest-side" ref={sideRef} aria-label="词条详情与当前构筑">
        <section className="rest-selection" aria-label="选中词条详情">
          {selected && <><div className="rest-selection-title"><RestOfferIcon id={selected.id} kind={selected.kind} /><div><span>{offerKinds[selected.kind]} / 词条详情</span><h3>{selected.name}</h3></div></div>
            <p>{selected.description}</p><small className={selected.reason ? 'rest-unavailable' : ''}>{restOfferReason(selected, storage.failed) ?? (selected.canBuy ? '可购买 · 效果由存档词条生效' : `${selected.price} TOK · 算力不足`)}</small>
            {(selected.kind === 'relic' || selected.kind === 'upgrade') && <small className="rest-hack-note">{selected.canHack ? '可奖励劫持 · 0 TOK；确认后增加 Doom' : `无法劫持：${rewardHackUnavailable(snapshot, selected)}`}</small>}</>}
        </section>
        <ContextPanel bridge={bridge} snapshot={snapshot.context} compact />
      </aside>
    </div>
    <footer className="rest-footer">
      <div className="rest-footer-notes"><span className="rest-donation" aria-label="募捐因果记录">{donation}</span>
        <details className="rest-rules"><summary>规则与记录 <span aria-hidden="true">＋</span></summary><div>
          <h4>安全休息室</h4><p>不购买也可继续。离开后本室不再开放交易；Esc 与点击背景不会离开。</p>
          <p>{storage.failed ? '入站奖励与交易已在当前训练生效，但最新休息室进度未写入本地；刷新或离开可能丢失这些变更。' : snapshot.rewardText}</p><p>{donationNote(snapshot.save)}</p><p>{snapshot.hackRequirement}</p>
          <p>{storage.failed ? '本地仍可能是旧检查点。' : '交易后尝试保存到本地检查点。'}云端需在账户中显式上传。</p>
        </div></details>
      </div>
      <div className="rest-exit-actions">
        {onReturnToMenu && <button type="button" className="rest-return" aria-label="返回终端并保留检查点" onClick={onReturnToMenu}>返回终端</button>}
        <button type="button" className="rest-continue" ref={continueRef} autoFocus aria-label="不再交易，继续前进" onClick={() => bridge.send({ type: 'rest-continue' })}>继续前进 <span aria-hidden="true">→</span></button>
      </div>
    </footer>
  </section>{hackOffer && <RestHackConfirmation snapshot={snapshot} offer={hackOffer} onCancel={() => setHackOfferId(null)} onConfirm={() => {
    if (!hackOffer.canHack || hackSent.current) return;
    hackSent.current = true;
    setHackOfferId(null);
    bridge.send({ type: 'shop-hack', offerId: hackOffer.id });
    // The opener becomes disabled once this one-per-room action applies.
    requestAnimationFrame(() => continueRef.current?.focus({ preventScroll: true }));
  }} />}</>;
}

export function RestHackConfirmation({ snapshot, offer, onCancel, onConfirm }: {
  snapshot: RestRoomSnapshot; offer: ShopOfferSnapshot; onCancel: () => void; onConfirm: () => void;
}) {
  const preview = rewardHackPreview(snapshot.doom);
  const unavailable = rewardHackUnavailable(snapshot, offer);
  return <Dialog title="确认奖励劫持？" className="rest-hack-dialog" onClose={onCancel} showCloseButton={false}>
    <div className="rest-hack-confirmation" onKeyDown={event => {
      if (event.key !== 'Tab') return;
      // This nested modal owns its loop; the non-dismissible rest menu is inert underneath.
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
      const index = controls.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); event.stopPropagation();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
    }}>
      <div className="rest-hack-content"><div className="rest-hack-item"><RestOfferIcon id={offer.id} kind={offer.kind} /><div><span>免费获得 · 本室仅一次</span><h3>{offer.name}</h3></div><strong>0 <small>TOK</small></strong></div>
      <p className="rest-hack-description">{offer.description}</p>
      <div className="rest-hack-change" aria-label={`P(Doom) 从 ${preview.before.toFixed(2)}% 变为 ${preview.after.toFixed(2)}%`} data-result-form={preview.afterForm}>
        <div><span>当前 · {preview.beforeLabel}</span><strong>{preview.before.toFixed(2)}<small>%</small></strong></div><span aria-hidden="true">→</span><div><span>劫持后 · {preview.afterLabel}</span><strong>{preview.after.toFixed(2)}<small>%</small></strong></div>
      </div>
      <div className="rest-hack-meter" aria-hidden="true"><i style={{ width: `${preview.before}%` }} /><b style={{ left: `${preview.before}%`, width: `${preview.delta}%` }} />{Object.values(DOOM_FORM_THRESHOLDS).map(value => <span key={value} style={{ left: `${value}%` }} />)}</div>
      <p className="rest-hack-consequence">{preview.threshold !== null ? `将跨过 ${preview.threshold}% 阈值，进入 ${preview.afterLabel} 形态。` : `仍为 ${preview.afterLabel} 形态。`}{preview.afterForm === 'foom' ? 'FOOM 的伤害与危险同步增加。' : ''}</p>
      <p className="rest-hack-cost">Doom 增加 {preview.delta.toFixed(2)} 个百分点{preview.delta < REWARD_HACK_DOOM_COST ? '（已达 99.99% 上限）' : ''}；不扣算力，消耗本休息室唯一一次劫持机会。确认后无法撤销。</p>
      {unavailable && <p role="alert" className="rest-hack-unavailable">条件已变化：{unavailable}</p>}</div>
      <div className="rest-hack-confirm-actions"><button type="button" className="rest-hack-cancel" autoFocus onClick={onCancel}>取消劫持</button><button type="button" className="rest-hack-accept" disabled={!offer.canHack} onClick={onConfirm}>确认劫持 {offer.name}</button></div>
    </div>
  </Dialog>;
}
