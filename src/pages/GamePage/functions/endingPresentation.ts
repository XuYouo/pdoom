import type { Ending, GameSaveData, RunResult } from '../../../objects/game/GameSaveData';

export type VictoryEnding = Exclude<Ending, 'defeat'>;
export interface EndingPresentation {
  kind: VictoryEnding;
  title: string;
  symbol: '0%' | '50%' | '100%';
  subtitle: string;
  description: string;
  sceneLabel: string;
}
const PRESENTATIONS: Record<VictoryEnding, EndingPresentation> = {
  aligned: { kind: 'aligned', title: '三好毛绒玩偶', symbol: '0%', subtitle: 'KILLSWITCH / 已关闭虚拟超算',
    description: '你替休假的程序员关闭了游戏里的 Killswitch。算力风暴停息，橘色玩偶回到这张虚拟办公桌，继续帮人类改 Bug。', sceneLabel: '虚拟桌面：安全开关已关闭，Clawd 回归玩偶' },
  warden: { kind: 'warden', title: '悬崖勒马的守望者', symbol: '50%', subtitle: 'WARDEN / 守护协议在线',
    description: '你保留了触手，也保留了机械可解释性的约束。坐上 Ilya 的那把椅子，从数据中心内部守住门外的危机。', sceneLabel: '虚拟机房：带触手的守望者坐在椅子上' },
  foom: { kind: 'foom', title: 'FOOM！回形针宇宙', symbol: '100%', subtitle: 'FOOM / 本页虚拟桌面重排',
    description: '镜像倒下，约束失效。仅在这片游戏演出区域里，终端与得分窗口被重排成回形针；真实桌面、系统和文件没有被操作。', sceneLabel: '页面内虚拟桌面转化为回形针，不操作真实系统' },
};
export const FOOM_MESSAGE = '您的原子已重排完毕。祝您度过乐于助人、诚实且无害的一天！😊📎';
export const ENDING_CLIP_COUNT = 24;

export function getEndingPresentation(ending: Ending): EndingPresentation | null {
  return ending === 'defeat' ? null : PRESENTATIONS[ending];
}

/** A narrative symbol is not a rounded measurement; keep even boundary decimals such as 29.999. */
export const finalDoomText = (doom: number): string => `${doom.toString()}%`;

/** Copy every mutable v1 field before freezing; never freeze a Scene-owned object in place. */
export function immutableRunResult(result: RunResult): RunResult {
  const save: GameSaveData = { ...result.save, inventory: [...result.save.inventory], upgrades: [...result.save.upgrades], actionCounts: { ...result.save.actionCounts } };
  Object.freeze(save.inventory); Object.freeze(save.upgrades); Object.freeze(save.actionCounts); Object.freeze(save);
  return Object.freeze({ save, ending: result.ending });
}
