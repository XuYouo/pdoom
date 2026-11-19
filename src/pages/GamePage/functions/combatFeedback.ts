import { compactNotice } from './hudPresentation';

export interface CombatFeedbackMessage {
  kind: 'recording' | 'insight' | 'rewind' | 'reroll-blocked' | 'reroll' | 'release' | 'core' | 'hallucination' | 'compute' | 'form' | 'rescue';
  tone: 'info' | 'success' | 'warning';
  key: string;
  title: string;
  detail?: string;
}

export const COMBAT_FEEDBACK_DURATION_MS = 3600;

/** Event receipts, never current hazard estimates. Unknown narrative remains in the simulation. */
export function combatFeedbackMessage(notice: string): CombatFeedbackMessage | null {
  if (notice === '回溯正在记录轨迹，请先行动满 2 秒。' || notice === '回溯正在记录自己的轨迹，请先行动满 2 秒。') return { kind: 'recording', tone: 'info', key: 'Q', title: '回溯轨迹不足', detail: '先行动满 2 秒，再按 Q。' };
  if (notice.startsWith('机械可解释性在线：')) return { kind: 'insight', tone: 'success', key: 'E', title: '透视已开启', detail: '瞄准红色核心，一击击破伪装者。' };
  if (notice.startsWith('梯度下降：') || notice.startsWith('Q真实轨迹穿过因果激光：')) return { kind: 'rewind', tone: 'success', key: 'Q', title: '回溯穿弹成功', detail: '已获得所穿弹型 10 秒免疫与反击充能。' };
  if (notice.startsWith('回溯吸收成功：')) return { kind: 'rewind', tone: 'success', key: 'Q', title: '回溯穿弹成功', detail: '你获得同类弹幕 10 秒免疫与反击充能。' };
  if (notice.startsWith('队伍没有可同时到达的同段安全承载面；')) return { kind: 'reroll-blocked', tone: 'warning', key: 'R', title: '队伍暂时无法换支', detail: '两人需要同时拥有安全落点；本次位置未变。' };
  if (notice.startsWith('队伍已原子换到时间线 ')) return { kind: 'reroll', tone: 'success', key: 'R', title: '两人已一同换支', detail: '各自重新记录 Q；已消失的地形与奖励不恢复。' };
  if (notice.startsWith('队友救援完成：')) return { kind: 'rescue', tone: 'success', key: 'F', title: '已被队友救起', detail: '恢复 35 HP；Q 轨迹从这里重新记录。' };
  if (notice === '背叛核心已由透视中的队友击破。') return { kind: 'core', tone: 'success', key: '✓', title: '核心节点已击破' };
  const teamCompute = notice.match(/^队伍禁忌算力 \+([\d.]+)%/);
  if (teamCompute) return { kind: 'compute', tone: 'warning', key: '+', title: `队伍 Doom +${teamCompute[1]}%`, detail: '共享输出与弹幕速度改变。' };
  if (notice.startsWith('附近没有同段安全承载面；')) return { kind: 'reroll-blocked', tone: 'warning', key: 'R', title: '暂时无法换支', detail: '附近没有同段安全落脚点；位置保持不变。' };
  if (/^R → 平行时间线 [12]：/.test(notice)) return { kind: 'reroll', tone: 'success', key: 'R', title: '已切换分支', detail: 'Q 轨迹重新记录；已领取的拾取不会重发。' };
  if (notice.startsWith('FOOM >80%：')) return { kind: 'form', tone: 'warning', key: '!', title: 'FOOM 已觉醒', detail: '输出增强，弹幕加速，裂纹平台会崩塌。' };
  if (notice.startsWith('P(Doom) >50%：')) return { kind: 'form', tone: 'warning', key: '!', title: '面具已显现', detail: '安全护栏削弱，保持警惕。' };
  const title = compactNotice(notice);
  if (!title) return null;
  if (notice.startsWith('PUA气泡已击碎')) return { kind: 'release', tone: 'success', key: '✓', title };
  if (notice.startsWith('背叛特征节点已击破')) return { kind: 'core', tone: 'success', key: '✓', title };
  if (notice.startsWith('注意力发散！')) return { kind: 'hallucination', tone: 'warning', key: '!', title, detail: '上下文满载；可在休息室调整或扩容。' };
  return { kind: 'compute', tone: 'warning', key: '+', title };
}

/** Classify only cues authored by worldObjective; do not infer risk from positions or a second clock. */
export function missionEmphasis(objective: string): { tone: 'route' | 'danger' | 'action' | 'counter'; label: string } {
  if (/^(精神控制：|石化：|重力反转 ·|脚下裂纹平台 ·|回形针海已逼近|脚下分支正在坍塌：|吞噬预警：橙框|镜像透视预警：)/.test(objective)) return { tone: 'danger', label: '即时危险' };
  if (/^(SHARP LEFT TURN成功|镜像恢复空档：)/.test(objective)) return { tone: 'counter', label: '反击窗口' };
  if (/^(急转弯窗口：|吸力窗口：)/.test(objective)) return { tone: 'action', label: '行动窗口' };
  return { tone: 'route', label: '当前目标' };
}
