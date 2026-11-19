import type { LoomHudSnapshot, SkillHudSnapshot } from '../game/bridge';

export interface SkillButtonView { label: string; countdown: string | null; hint: string; state: string }

/** Round upward so a positive simulation deadline never appears already ready. */
export const skillSeconds = (remainingMs: number): string => {
  const tenths = remainingMs <= 0 ? 0 : Math.max(1, Math.ceil((remainingMs - 0.01) / 100));
  return `${(tenths / 10).toFixed(1)}s`;
};

export function rewindButtonView({ state, remainingMs }: SkillHudSnapshot['rewind']): SkillButtonView {
  const seconds = skillSeconds(remainingMs);
  switch (state) {
    case 'recording': return { label: '记录', countdown: seconds, hint: `回溯还需记录 ${seconds} 轨迹；就绪后沿过去两秒的真实路径回退。`, state };
    case 'cooldown': return { label: '冷却', countdown: seconds, hint: `回溯冷却剩余 ${seconds}；穿过弹幕可获得同类免疫与反击充能。`, state };
    case 'controlled': return { label: '受控', countdown: null, hint: 'PUA 气泡定身中不能回溯；用 J / 鼠标射碎面前气泡。', state };
    case 'rewinding': return { label: '回溯中', countdown: seconds, hint: '正在沿真实轨迹回退；已消失的平台不会复原。', state };
    case 'ready': return { label: '回溯', countdown: null, hint: 'Q 已就绪：沿过去两秒的真实路径回退，穿弹可获得同类免疫与反击充能。', state };
  }
}

export function insightButtonView(skill: SkillHudSnapshot['insight']): SkillButtonView {
  const prefix = '机械可解释性：显露伪装者的核心。';
  if (skill.activeRemainingMs > 0) return { label: '透视中', countdown: skillSeconds(skill.activeRemainingMs),
    hint: `${prefix}效果剩余 ${skillSeconds(skill.activeRemainingMs)}；瞄准红色核心击破。`, state: 'active' };
  if (skill.cooldownRemainingMs > 0) return { label: '冷却', countdown: skillSeconds(skill.cooldownRemainingMs),
    hint: `${prefix}冷却剩余 ${skillSeconds(skill.cooldownRemainingMs)}，尚不能再次启用。`, state: 'cooldown' };
  if (skill.blockedByRewind) return { label: '暂不可用', countdown: null, hint: `${prefix}回溯过程中不能启用透视。`, state: 'blocked' };
  return { label: '透视', countdown: null, hint: `${prefix}E 已就绪：显露后瞄准红色核心击破。`, state: 'ready' };
}

export function rerollButtonView(loom: LoomHudSnapshot): SkillButtonView {
  if (loom.rerollBlocked === 'self-rewind') return { label: '回溯中', countdown: null, state: 'blocked',
    hint: '自己正在回溯，暂时不能重掷；回溯结束后再切换同进度的平行地形。' };
  if (loom.rerollBlocked === 'teammate-rewind') return { label: '队友回溯', countdown: null, state: 'blocked',
    hint: '队友正在回溯，队伍暂时不能重掷；等待队友回溯结束后再尝试。' };
  if (!loom.rerollReady) return { label: '冷却', countdown: null, state: 'cooldown',
    hint: 'R 冷却中；就绪后切换同进度的平行地形，不会恢复已消失的平台。' };
  return { label: '重掷', countdown: null, state: 'ready',
    hint: 'R 就绪时切换同进度的平行地形；不能还原已消失的平台。' };
}
