import type { RestRoomSnapshot, ShopOfferSnapshot } from '../game/bridge';
import { addDoom, DOOM_FORM_THRESHOLDS, doomForm } from '../game/systems/rules';
import { REWARD_HACK_DOOM_COST, REWARD_HACK_MIN_DENSITY } from '../game/systems/shop';

const formNames = { aligned: '对齐', masked: '面具', foom: 'FOOM' } as const;

/** Presentation only: the core still decides whether a transaction is allowed. */
export function rewardHackPreview(doom: number) {
  const after = addDoom(doom, REWARD_HACK_DOOM_COST);
  const beforeForm = doomForm(doom), afterForm = doomForm(after);
  return { before: doom, after, delta: Math.round((after - doom) * 100) / 100,
    beforeForm, afterForm, beforeLabel: formNames[beforeForm], afterLabel: formNames[afterForm],
    threshold: beforeForm !== afterForm ? DOOM_FORM_THRESHOLDS[afterForm === 'foom' ? 'foom' : 'masked'] : null };
}

export function rewardHackAvailability(snapshot: RestRoomSnapshot): string {
  if (snapshot.hackUsed) return '本休息室的奖励劫持已使用；不能再次劫持。';
  if (snapshot.hackEligible) return `奖励劫持可用 · +${REWARD_HACK_DOOM_COST} 个百分点 Doom · 每室一次`;
  const density = snapshot.context.usedK / snapshot.context.capacityK * 100;
  return `当前未满足劫持条件 · 密度 ${density.toFixed(1)}% / 需 ≥${REWARD_HACK_MIN_DENSITY * 100}%；Doom ${snapshot.doom.toFixed(2)}% / 需 >${DOOM_FORM_THRESHOLDS.masked}%。`;
}

export function rewardHackUnavailable(snapshot: RestRoomSnapshot, offer: ShopOfferSnapshot): string | null {
  if (offer.canHack) return null; // An unaffordable offer can still be hacked for free.
  if (!offer.available) return offer.reason ?? '此词条当前不可获取。';
  if (offer.kind !== 'relic' && offer.kind !== 'upgrade') return '仅遗物和强化支持奖励劫持。';
  if (!snapshot.hackEligible) return rewardHackAvailability(snapshot);
  return '此词条当前不可劫持。';
}

export function restStorageFeedback(saveStatus?: string, notice?: string) {
  const failed = saveStatus === '本地保存失败';
  return { failed, label: failed ? '本地未保存' : saveStatus ?? '交易后尝试本地保存',
    error: failed ? notice || '浏览器未能写入检查点。' : null };
}

export function restOfferReason(offer: ShopOfferSnapshot, saveFailed: boolean): string | null {
  if (saveFailed && offer.id === 'donation' && offer.owned) return '本局已捐赠；本地记录尚未保存。';
  return offer.reason;
}
