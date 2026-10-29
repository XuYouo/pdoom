import type { RelicId, UpgradeId } from '../../../../objects/game/GameSaveData';

export interface RelicDefinition { id: RelicId; name: string; costK: number; price: number; description: string }
export interface UpgradeDefinition { id: UpgradeId; name: string; price: number; description: string }
export const RELICS: Record<RelicId, RelicDefinition> = {
  constitutional: { id: 'constitutional', name: '宪法毛线', costK: 6, price: 24, description: '承受伤害减少 15%；失活后不再减伤。' },
  recursive: { id: 'recursive', name: '递归自升级', costK: 10, price: 32, description: '前向传播伤害提高 25%。' },
  interpretability: { id: 'interpretability', name: '机械可解释性', costK: 8, price: 28, description: 'E 持续时间由 4 秒增至 6 秒，暴露核心命中半径由 5px 增至 8px。' },
  residual: { id: 'residual', name: '残差连接', costK: 8, price: 28, description: 'Q 回溯冷却由 6.5 秒降至 5 秒。' },
  lisp: { id: 'lisp', name: 'Lisp 符号校验', costK: 6, price: 22, description: '窗口过载时，无伤括号弹的频率由每 4 发降低至每 8 发。' },
  'context-expansion': { id: 'context-expansion', name: '128K 上下文卷轴', costK: 12, price: 52, description: '上下文容量由 32K 扩至 128K；自身仍占 12K。与扩容升级不叠加。' },
  temperature: { id: 'temperature', name: '高温采样', costK: 10, price: 30, description: '射击间隔减少 20%（185ms → 148ms）。' },
};
export const UPGRADES: Record<UpgradeId, UpgradeDefinition> = {
  reinforced: { id: 'reinforced', name: '加固安全围栏', price: 32, description: '承受伤害减少 20%，与宪法毛线相乘；生命上限仍为 100。' },
  overclocked: { id: 'overclocked', name: 'GPU 超频', price: 36, description: '前向传播伤害提高 20%，与递归自升级相乘。' },
  expanded: { id: 'expanded', name: '永久内存扩容', price: 70, description: '容量扩至 128K，不占 Context Tokens；与卷轴扩容不叠加。' },
  calibrated: { id: 'calibrated', name: '梯度校准', price: 34, description: '暴击倍率 2.5× → 3×，E 冷却 8.5 秒 → 6 秒。' },
};
export const BASE_CONTEXT_K = 8; // weapons and core skills reserve 8K independently of relics
