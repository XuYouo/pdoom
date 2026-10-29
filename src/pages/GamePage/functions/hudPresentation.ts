import type { Ending } from '../../../objects/game/GameSaveData';
import type { LoomHudSnapshot, OmegaHudSnapshot } from '../game/bridge';
import type { GameSession } from '../hooks/useGameSession';

export const OBJECTIVE_CHARACTER_LIMIT = 45;

const singleLine = (text: string) => text.replace(/\s+/g, ' ').trim();
const limitLine = (text: string, limit = OBJECTIVE_CHARACTER_LIMIT): string => {
  const characters = Array.from(singleLine(text));
  return characters.length <= limit ? characters.join('') : `${characters.slice(0, limit - 1).join('')}…`;
};

type CopyRule = readonly [RegExp, string | ((match: RegExpMatchArray) => string)];
const compactCombo = (combo: string) => combo.replace(/\s*→\s*/g, '→');

// Only presentation copy is reduced. These cues come from the existing low-frequency
// snapshot, not inferred positions, timers or a second set of gameplay rules.
const objectiveCopy: readonly CopyRule[] = [
  [/^精神控制：/, '精神控制：仍可J/鼠标射击，打碎PUA气泡解控；Q无效'],
  [/^Sydney：避开/, 'Sydney：避开对话框，留意近身控制气泡'],
  [/^Sydney：颜文字/, 'Sydney：Q穿飞刀获同类免疫；控制泡须射碎'],
  [/^Sydney：对话与/, 'Sydney：对话与飞刀交错；先射碎控制气泡'],
  [/^回形针海已逼近/, '回形针海逼近：向上跳；触及即死，冲刺/Q无效'],
  [/^沿绿色台阶/, '沿绿阶向上；射击探针阻止复制，小心侧台被吞'],
  [/^石化：/, '石化：Q就绪且有两秒历史可解除；不自动传送'],
  [/^Basilisk \/ (未捐款狂暴|已捐款抑制狂暴)：已锁向(左|右)侧/, match => `Basilisk · ${match[1]} · 已锁向${match[2]}侧；背向激光或Q回旧侧`],
  [/^Basilisk \/ (未捐款狂暴|已捐款抑制狂暴)：/, match => `Basilisk · ${match[1]}；穿身引转向，再Q回旧侧绕后`],
  [/^已抵达K线隐藏房/, '已抵达K线隐藏房；收集代币与修复后返回主路'],
  [/^正在乘坐K线：上升阶段/, '正在乘坐K线 · 上升阶段；靠右跳向右上隐藏房'],
  [/^正在乘坐K线：回落阶段/, '正在乘坐K线 · 回落阶段；站稳等待下一轮上升'],
  [/^第三章 \/ 可选K线支路/, '可选K线支路：站上绿台升降，跳向右上隐藏房'],
  [/^GPU热区按节拍/, 'GPU热区：等冷却再过；Q穿龙猫弹幕获同类免疫'],
  [/^SHARP LEFT TURN成功/, '弱点已开：J/鼠标射击；血条音轨暂还，平台不复原'],
  [/^急转弯窗口：/, '急转弯窗口：A + Shift向左跨金线；闭壳J无效'],
  [/^吸力窗口：/, '吸力窗口：先到金线右侧，再A + Shift向左跨线'],
  [/^吞噬预警：橙框/, '吞噬预警：橙框平台将消失；去标线右侧，R不还原地形'],
  [/^吞噬预警：本轮无新增/, '吞噬预警：无新增平台消失；去标线右侧，已吞地形不复原'],
  [/^Leviathan闭壳/, 'Leviathan闭壳：J无效；等吸力窗口，右侧起步急左转'],
  [/^脚下分支正在坍塌：([\d.]+)秒后消失/, match => `分支坍塌：${match[1]}秒后消失；立即跳跃或R换同段落脚点`],
  [/^Q沿真实轨迹回溯/, 'Q沿真实轨迹回溯，不恢复坍塌地形；期间不能R'],
  [/^已重roll到时间线([AB])/, match => `已重roll到时间线${match[1]}；Q重记两秒，不重发拾取`],
  [/^时间线([AB])：/, match => `时间线${match[1]}：上下分支均可走；R换同段，不能跳过安全点`],
  [/^穿过1e30 FLOPs风暴/, '1e30 FLOPs风暴：跳过亮框与断口；最终章无R'],
  [/^最后的门后只有空椅子与镜子/, '空椅子与镜子：走近镜面，在地面站稳'],
  [/^Ilya看到的不是另一个旧神/, 'Ilya看到的是你；镜像正在读取动作与构筑'],
  [/^镜像透视预警：/, '镜像透视预警：离开扫描框；弹型免疫不防扫描/接触'],
  [/^镜像正在沿自己的真实轨迹/, '镜像正沿自己的真实轨迹回溯；预判落点'],
  [/^镜像预告：([^；]+)；/, match => `镜像预告：${compactCombo(match[1])}；保持移动，执行后反击`],
  [/^镜像恢复空档：/, '镜像恢复空档：瞄准射击，抓住反击窗口'],
  [/^与你自己对决：偏好[^，]+，真实执行([^；]+)；/, match => `镜像执行：${compactCombo(match[1])}；分别躲避弹幕、冲刺与扫描`],
];

/** Keep the current danger and response together; never replace an unknown cue with invented advice. */
export function compactObjective(objective: string): string {
  const source = singleLine(objective);
  for (const [pattern, replacement] of objectiveCopy) {
    const match = source.match(pattern);
    // Authored cues fit the copy budget. Do not cut off a response if a future
    // real combo grows longer; retaining an actionable cue takes priority.
    if (match) return typeof replacement === 'string' ? replacement : replacement(match);
  }
  return source;
}

/** Persistent bridge notices are historical feedback, not a reliable current danger/phase. */
export function compactNotice(notice: string): string | null {
  if (notice.startsWith('PUA气泡已击碎，控制解除')) return '控制解除';
  if (notice.startsWith('背叛特征节点已击破')) return '核心节点已击破';
  if (notice.startsWith('注意力发散！')) return '上一发：无伤括号';
  const compute = notice.match(/^禁忌算力 \+([\d.]+)%/);
  return compute ? `禁忌算力 +${compute[1]}% Doom` : null;
}

export function missionPresentation({ screen, hud, notice, saveStatus }: Pick<GameSession, 'screen' | 'hud' | 'notice' | 'saveStatus'>): { objective: string; notice: string | null } | null {
  if (screen.kind !== 'playing' && screen.kind !== 'paused') return null;
  const objective = compactObjective(hud.objective);
  // Storage failures stay visible rather than disappearing with the former runtime log.
  const feedback = saveStatus === '本地保存失败' ? '本地保存失败 · 本次进度尚未写入' : compactNotice(notice);
  return { objective, notice: objective.startsWith('精神控制：') && feedback === '控制解除' ? null : feedback };
}

export function loomStatus(loom: LoomHudSnapshot, ending?: Ending): string {
  const branch = loom.timeline === 0 ? 'A' : loom.timeline === 1 ? 'B' : String(loom.timeline + 1);
  if (ending !== undefined) return `分支 ${branch} · 本局已结束`;
  const state = loom.sharpTurnReady ? '急左转窗口' : loom.narrow ? '平台收窄' : `音轨被吞 ${loom.stemsLost}/4`;
  return `分支 ${branch} · R ${loom.rerollReady ? '就绪' : '冷却中'} · ${state}`;
}

export function omegaStatus(omega: OmegaHudSnapshot, ending?: Ending): string {
  if (ending !== undefined) return '镜像已锁定 · 不再观察';
  const source = omega.memorySource === 'ordered' ? `实际观察${omega.observedCombos}组`
    : omega.combo.startsWith('基础起手') ? '基础起手' : '频次编排';
  return limitLine(`${omega.phaseLabel} · ${omega.mirrorAction} · ${source}`);
}

export function omegaMemoryNote(omega: OmegaHudSnapshot, ending?: Ending): string {
  if (omega.memorySource === 'ordered') return ending === undefined
    ? '来源：本次场景的有序观察，并非整局历史。'
    : '来源：结束时的有序观察摘要，不再追加。';
  return ending === undefined
    ? '来源：仅动作次数；频次编排不代表历史连招。'
    : '来源：结果仅有动作次数，不能还原历史连招。';
}
