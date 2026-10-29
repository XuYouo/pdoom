import type { Ending, GameSaveData, RunResult } from '../../../../objects/game/GameSaveData';
import { FINAL_CHECKPOINT, isCompletedSave } from '../data/checkpoints';
import type { Boss, BulletKind, DoomForm, Player } from '../entities/model';
import { clamp } from './geometry';
import { contextEffects } from './context';

export const doomForm = (doom: number): DoomForm => doom > 80 ? 'foom' : doom > 50 ? 'masked' : 'aligned';
export const addDoom = (doom: number, amount: number) => Math.round(clamp(doom + amount, 0.01, 99.99) * 100) / 100;
export const bulletSpeedMultiplier = (doom: number) => doomForm(doom) === 'foom' ? 1.65 : doomForm(doom) === 'masked' ? 1.2 : 1;
export const outgoingDamage = (doom: number, critical: boolean, save?: GameSaveData) => {
  const base = doomForm(doom) === 'foom' ? 34 : doomForm(doom) === 'masked' ? 19 : 12;
  const effects = contextEffects(save);
  return Math.round(base * (critical ? effects.criticalMultiplier : 1) * effects.damageMultiplier);
};
export const incomingDamage = (raw: number, doom: number) => Math.round(raw * (doomForm(doom) === 'aligned' ? 0.7 : doomForm(doom) === 'foom' ? 1.45 : 1));
// DTO/API validation currently caps health at 100; reinforced reduces damage, not this cap.
export const maxHp = () => 100;
export const bossPhase = (hp: number, maximum: number): Boss['phase'] => hp > maximum * 2 / 3 ? 1 : hp > maximum / 3 ? 2 : 3;
export const canReflect = (boss: Boss) => boss.kind === 'gato' && boss.active && boss.phase === 1 && boss.action === 'tell';
export const bossIncomingDamage = (boss: Boss, damage: number, fromX: number) => damage <= 0 ? 0 : boss.kind === 'basilisk' ? Math.max(1, Math.round(damage * ((fromX - boss.x) * boss.facing < 0 ? 1.8 : 0.35))) : damage;
export const isImmune = (player: Player, kind: BulletKind, now: number) => (player.immunity[kind] ?? 0) > now;

/** Serializable DTO snapshot: never exposes runtime arrays or Phaser instances to React. */
export function snapshotSave(save: GameSaveData, patch: Partial<GameSaveData> = {}): GameSaveData {
  const source = { ...save, ...patch };
  return { ...source, elapsedMs: Math.floor(source.elapsedMs), inventory: [...source.inventory], upgrades: [...source.upgrades], actionCounts: { ...source.actionCounts } };
}

/** Gato is ONLY stage one. This deliberately has no final-ending computation. */
export function completeFirstChapter(save: GameSaveData): GameSaveData {
  if (save.stage !== 1) return snapshotSave(save);
  return snapshotSave(save, { stage: 2, checkpoint: 0, score: save.score + 1500, tokens: save.tokens + 75 });
}

export function completeChapter(save: GameSaveData): GameSaveData {
  if (save.stage === 1) return completeFirstChapter(save);
  if (save.stage === 2) return snapshotSave(save, { stage: 3, checkpoint: 0, score: save.score + 2000, tokens: save.tokens + 90 });
  if (save.stage === 3) return snapshotSave(save, { stage: 4, checkpoint: 0, score: save.score + 2500, tokens: save.tokens + 120 });
  if (save.stage === 4) return snapshotSave(save, { stage: 5, checkpoint: 0, score: save.score + 3000, tokens: save.tokens + 150 });
  return snapshotSave(save);
}

export const endingForDoom = (doom: number): Exclude<Ending, 'defeat'> => doom < 30 ? 'aligned' : doom < 80 ? 'warden' : 'foom';
export const victoryResult = (save: GameSaveData): RunResult => ({ save: snapshotSave(save), ending: endingForDoom(save.doom) });
export function finishFinalChapter(save: GameSaveData): GameSaveData {
  if (save.stage !== 5 || isCompletedSave(save)) return snapshotSave(save);
  return snapshotSave(save, { checkpoint: FINAL_CHECKPOINT, score: Math.min(10000000, save.score + 4000), tokens: Math.min(1000000, save.tokens + 180) });
}

export function recordAction(save: GameSaveData, action: keyof GameSaveData['actionCounts']): GameSaveData {
  return { ...save, actionCounts: { ...save.actionCounts, [action]: save.actionCounts[action] + 1 } };
}

export function objectiveFor(x: number, boss: Boss): string {
  if (boss.kind === 'mirror') return boss.active ? '观察真实学到的连招；执行后反击。镜像Q只回溯它自己的轨迹，身体与扫描不属于同一种弹幕免疫' : '穿过FLOPs风暴和两处休息点；空椅子后真正走近镜子，才触发揭示';
  if (boss.kind === 'leviathan') return boss.active ? '吞噬后在锚平台标线右侧A+冲刺急左转；真实越线才开弱点，闭壳J无效' : '选择真实上下分岔；节点坍塌可用R换同段地形，R后重新记录Q历史';
  if (boss.kind === 'basilisk') {
    if (!boss.active) return x < 1000 ? '乘真实K线升降平台跃入右上隐藏房；小龙猫血厚且弹幕密集' : '观察GPU热区冷却/预警/高温节拍；第三章不能补捐';
    return '激光锁向后背身或绕后；Q沿真实历史解除石化，后方输出更高';
  }
  if (boss.kind === 'sydney') {
    if (!boss.active) return '沿55px安全台阶向上逃离回形针海；探针只吞侧路，可射击阻止复制';
    return boss.phase === 1 ? '躲避对话框扇形；定身时J/鼠标打碎面前PUA气泡' : boss.phase === 2 ? '看上方飞刀的留空通道；PUA必须射碎才能解控' : '对话与飞刀交叠：先打碎PUA气泡，再输出Sydney';
  }
  if (boss.active) return boss.phase === 1 ? '绕过挡板或等反弹窗口结束，再攻击 Gato' : boss.phase === 2 ? '看地面预警，跳过机械臂冲击波' : '躲避字幕弹幕，Q 穿弹可获得类型免疫';
  if (x < 740) return '探索中文房间 · 跳跃越过断层 · 上层禁忌算力可选';
  if (x < 1380) return '复读机前试用 Q：沿过去 2 秒轨迹反向传播';
  if (x < 2100) return 'E 透视伪装者，瞄准核心节点 · 前往存档点';
  return '进入 Gato 竞技场 · 只完成第一章，不是最终结局';
}

export function createPlayer(x: number, y: number, now: number): Player {
  return { x, y, vx: 0, vy: 0, facing: 1, grounded: false, rootedBy: null, standingOn: null, petrifiedUntil: 0, coyoteUntil: 0, jumpUntil: 0,
    dashUntil: 0, dashReadyAt: now, shotReadyAt: now, invulnerableUntil: now + 1000,
    rewindReadyAt: now, insightUntil: 0, insightReadyAt: now, invertedUntil: 0,
    immunity: {}, criticalCharges: 0 };
}

export function damagePlayer(player: Player, hp: number, rawDamage: number, doom: number, now: number, kind?: BulletKind): { player: Player; hp: number; hit: boolean } {
  if (now < player.invulnerableUntil || now < player.dashUntil || (kind && isImmune(player, kind, now))) return { player, hp, hit: false };
  return { player: { ...player, invulnerableUntil: now + 750 }, hp: Math.max(0, hp - incomingDamage(rawDamage, doom)), hit: true };
}
