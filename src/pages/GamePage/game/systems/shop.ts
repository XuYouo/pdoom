import type { GameSaveData, RelicId, UpgradeId } from '../../../../objects/game/GameSaveData';
import type { GameCommand, RestRoomSnapshot, ShopOfferSnapshot } from '../bridge';
import { isChapterPlayable } from '../data/chapters';
import { aheadOf } from '../entities/model';
import { decodeCheckpoint, encodeRestCheckpoint, type RestRoomId } from '../data/checkpoints';
import { RELICS, UPGRADES } from '../data/relics';
import type { WorldState } from '../entities/model';
import { contextSnapshot, reorderContext } from './context';
import { addDoom, snapshotSave } from './rules';
import { samplePlayer } from './rewind';
import { createFurnace } from './furnace';
import { resetLoomAtCheckpoint } from './loom';

interface Offer { id: string; name: string; price: number; description: string; kind: ShopOfferSnapshot['kind']; relic?: RelicId; upgrade?: UpgradeId }
const OFFERS: readonly Offer[] = [
  { id: 'repair', name: '修补毛线', price: 12, kind: 'repair', description: '恢复 35 完整度，最高 100。只有受伤时可购买。' },
  ...Object.values(RELICS).map(relic => ({ id: `relic:${relic.id}`, name: relic.name, price: relic.price, description: `${relic.description} 占用 ${relic.costK}K。`, kind: 'relic' as const, relic: relic.id })),
  ...Object.values(UPGRADES).map(upgrade => ({ id: `upgrade:${upgrade.id}`, name: upgrade.name, price: upgrade.price, description: upgrade.description, kind: 'upgrade' as const, upgrade: upgrade.id })),
  { id: 'donation', name: '蛇怪募捐箱', price: 20, kind: 'donation', description: '仅前两章可捐赠：记录 donated=true，免除第三章蛇怪的欠捐狂暴；进入第三章后不能补捐，也不免除普通攻击。' },
];
export const HACK_REQUIREMENT = '模型密度至少 75% 且 P(Doom) >50%；每个休息室仅一次，免费获得一个未拥有词条，代价 +25% Doom。';
export function hackEligible(save: GameSaveData): boolean {
  const checkpoint = decodeCheckpoint(save.checkpoint);
  const context = contextSnapshot(save);
  return isChapterPlayable(save.stage) && checkpoint.resting && !checkpoint.hackUsed && context.usedK / context.capacityK >= 0.75 && save.doom > 50;
}

function unavailableReason(save: GameSaveData, offer: Offer): string | null {
  if (offer.relic && save.inventory.includes(offer.relic)) return '已拥有；不能重复购买。';
  if (offer.upgrade && save.upgrades.includes(offer.upgrade)) return '升级已安装；不能重复叠加。';
  if ((offer.relic === 'context-expansion' || offer.upgrade === 'expanded') && contextSnapshot(save).capacityK === 128) return '上下文已扩至 128K；两种扩容不叠加。';
  if (offer.kind === 'repair' && save.hp >= 100) return '完整度已满。';
  if (offer.kind === 'donation' && save.donated) return '本局已经捐赠，标记已持久保存。';
  if (offer.kind === 'donation' && save.stage >= 3) return '因果已锁定：第三章不能补捐，只承认前两章的 donated 记录。';
  return null;
}

export function shopOffers(save: GameSaveData): ShopOfferSnapshot[] {
  const canHack = hackEligible(save);
  return OFFERS.map(offer => {
    const reason = unavailableReason(save, offer);
    const available = reason === null;
    return { id: offer.id, name: offer.name, price: offer.price, description: offer.description, kind: offer.kind,
      owned: !!((offer.relic && save.inventory.includes(offer.relic)) || (offer.upgrade && save.upgrades.includes(offer.upgrade)) || (offer.kind === 'donation' && save.donated)),
      available, canBuy: available && save.tokens >= offer.price,
      canHack: available && canHack && (offer.kind === 'relic' || offer.kind === 'upgrade'),
      reason: reason ?? (save.tokens < offer.price ? `需要 ${offer.price} TOK，当前 ${save.tokens} TOK。` : null) };
  });
}

export type ShopResult = { ok: true; save: GameSaveData; message: string } | { ok: false; message: string };
export function transactShop(save: GameSaveData, offerId: string, hack = false): ShopResult {
  const checkpoint = decodeCheckpoint(save.checkpoint);
  if (!isChapterPlayable(save.stage) || !checkpoint.resting || checkpoint.room === 0) return { ok: false, message: '交易只能在尚未离开的安全休息室完成。' };
  const offer = OFFERS.find(item => item.id === offerId);
  if (!offer) return { ok: false, message: '未知商品，未扣除任何 Token。' };
  const reason = unavailableReason(save, offer);
  if (reason) return { ok: false, message: reason };
  if (hack && (!hackEligible(save) || (offer.kind !== 'relic' && offer.kind !== 'upgrade'))) return { ok: false, message: '不能劫持该交易。' + HACK_REQUIREMENT };
  if (!hack && save.tokens < offer.price) return { ok: false, message: 'Token 不足，未扣款。' };
  const next = snapshotSave(save, {
    tokens: save.tokens - (hack ? 0 : offer.price),
    checkpoint: hack ? encodeRestCheckpoint(checkpoint.room, true) : save.checkpoint,
    doom: hack ? addDoom(save.doom, 25) : save.doom,
    hp: offer.kind === 'repair' ? Math.min(100, save.hp + 35) : save.hp,
    inventory: offer.relic ? [...save.inventory, offer.relic] : save.inventory,
    upgrades: offer.upgrade ? [...save.upgrades, offer.upgrade] : save.upgrades,
    donated: offer.kind === 'donation' ? true : save.donated,
  });
  return { ok: true, save: next, message: `${hack ? '奖励劫持成功，Doom +25%：' : '交易完成：'}${offer.name}。本次扣款/奖励已在同一检查点保存。` };
}

/** Called only when progressing to a new physical checkpoint, on a detached simulation draft. */
export function enterRest(world: WorldState, room: RestRoomId): void {
  const previous = decodeCheckpoint(world.save.checkpoint);
  if (!previous.supported || previous.resting || previous.room >= room || world.save.hp <= 0) return;
  const reward = world.save.hp >= 60 && world.save.doom <= 80 ? 24 + Math.min(18, Math.floor(world.save.score / 120) * 2) : 12;
  world.save = { ...world.save, checkpoint: encodeRestCheckpoint(room), tokens: Math.min(1000000, world.save.tokens + reward) };
  world.mode = 'rest';
  world.rest = { room, message: `人类标注员给出 ${reward > 12 ? '👍' : '👎'}：${reward} TOK 已结算一次。可交易、调整上下文，或不买任何物品直接继续。` };
  const spawn = world.chapter.checkpoints[room];
  world.player = { ...world.player, x: spawn.x, y: world.chapter.stage === 1 ? 309 : spawn.y, vx: 0, vy: 0, grounded: true, rootedBy: null, standingOn: null, petrifiedUntil: 0, invertedUntil: 0, dashUntil: 0, invulnerableUntil: world.save.elapsedMs + 1000 };
  world.bullets = []; world.shocks = []; world.rewind = null;
  world.history = [samplePlayer(world.player, world.save.elapsedMs)];
  world.enemies = world.enemies.filter(enemy => aheadOf(world.chapter, enemy, spawn));
  world.pickups = world.pickups.filter(pickup => aheadOf(world.chapter, pickup, spawn));
  if (world.factory) {
    world.factory.seaY = spawn.y + 165; world.factory.bubbles = [];
    world.factory.probes = world.factory.probes.filter(probe => aheadOf(world.chapter, probe, spawn));
  }
  if (world.furnace) world.furnace = createFurnace(world.save, spawn, world.save.elapsedMs);
  resetLoomAtCheckpoint(world);
  world.events.push({ type: 'checkpoint', save: snapshotSave(world.save) }, { type: 'context-changed' }, { type: 'rest-opened' });
}

export function restSnapshot(world: WorldState): RestRoomSnapshot | null {
  if (world.mode !== 'rest' || !world.rest) return null;
  return {
    save: snapshotSave(world.save), room: world.rest.room, hp: world.save.hp, tokens: world.save.tokens, doom: world.save.doom,
    hackUsed: decodeCheckpoint(world.save.checkpoint).hackUsed, hackEligible: hackEligible(world.save), hackRequirement: HACK_REQUIREMENT,
    rewardText: '入站评级奖励已与本休息室检查点一起保存；刷新不会再发。离开后不能返回交易。',
    message: world.rest.message, offers: shopOffers(world.save), context: contextSnapshot(world.save, true),
  };
}

type ProgressionCommand = Extract<GameCommand, { type: 'shop-buy' | 'shop-hack' | 'rest-continue' | 'context-reorder' }>;
export function applyProgressionCommand(previous: WorldState, command: ProgressionCommand): WorldState {
  if (previous.mode !== 'rest' || !previous.rest) return { ...previous, events: [{ type: 'notice', message: '只能在休息室交易或调整词条，当前进度未改变。' }] };
  const world: WorldState = { ...previous, events: [], rest: { ...previous.rest } };
  if (command.type === 'rest-continue') {
    world.save = snapshotSave(world.save, { checkpoint: previous.rest.room });
    world.mode = 'playing'; world.rest = null;
    world.events.push({ type: 'checkpoint', save: snapshotSave(world.save) }, { type: 'rest-closed' }, { type: 'context-changed' });
    return world;
  }
  if (command.type === 'context-reorder') {
    const save = reorderContext(world.save, command.from, command.to);
    if (!save) { world.events.push({ type: 'notice', message: '无效的词条排序；原顺序未改变。' }); return world; }
    world.save = snapshotSave(save); world.rest!.message = '上下文顺序已保存；中间失活效果按新顺序立即重算。';
  } else {
    const result = transactShop(world.save, command.offerId, command.type === 'shop-hack');
    if (!result.ok) { world.rest!.message = result.message; world.events.push({ type: 'rest-updated' }, { type: 'notice', message: result.message }); return world; }
    world.save = result.save; world.rest!.message = result.message;
  }
  world.events.push({ type: 'checkpoint', save: snapshotSave(world.save) }, { type: 'context-changed' }, { type: 'rest-updated' });
  return world;
}
