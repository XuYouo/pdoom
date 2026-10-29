import type { OmegaHudSnapshot } from '../bridge';
import { RELICS, UPGRADES } from '../data/relics';
import type { BehaviorAction, OmegaState, WorldState } from '../entities/model';

export const MIRROR_ACTION_LABELS: Record<BehaviorAction, string> = { shots: '射击', dashes: '冲刺', rewinds: '回溯', insights: '透视' };
export const OMEGA_PHASE_LABELS: Record<OmegaState['phase'], string> = {
  storm: '1e30 FLOPs风暴', chamber: '空椅子与落地镜', reveal: 'Ilya看到的你', duel: '现场模仿学习', complete: '最终结局已锁定',
};
const STATE_LABELS = { idle: '观察', tell: '预警', execute: '执行', recover: '恢复空档' } as const;
export const mirrorComboLabel = (actions: readonly BehaviorAction[]) => actions.length ? actions.map(action => MIRROR_ACTION_LABELS[action]).join(' → ') : '等待实际观察';

export function omegaHudSnapshot(world: WorldState): OmegaHudSnapshot | undefined {
  const omega = world.omega;
  if (!omega) return undefined;
  const { mirror } = omega, profile = mirror.profile;
  const observed = world.behavior.combos.some(combo => combo.actions.join('/') === profile.combo.join('/'));
  const hasCounts = Object.values(profile.frequencies).some(count => count > 0);
  return {
    phaseLabel: OMEGA_PHASE_LABELS[omega.phase], memorySource: observed ? 'ordered' : 'counts-only',
    dominantAction: hasCounts ? MIRROR_ACTION_LABELS[profile.dominant] : '暂无动作计数',
    combo: `${observed ? '实际观察' : hasCounts ? '频次编排' : '基础起手'}：${mirrorComboLabel(profile.combo)}`,
    activeTraits: [...profile.activeBuild.map(id => RELICS[id].name), ...world.save.upgrades.map(id => UPGRADES[id].name)],
    observedCombos: world.behavior.combos.length,
    mirrorAction: `${STATE_LABELS[mirror.state]}${mirror.action ? ` / ${MIRROR_ACTION_LABELS[mirror.action]}` : ''}`,
  };
}

export function omegaObjective(world: WorldState): string {
  const omega = world.omega!;
  if (omega.phase === 'storm') return '穿过1e30 FLOPs风暴：跳过亮框风暴区与断口，两处安全点可整备；R不会带入最终章';
  if (omega.phase === 'chamber') return '最后的门后只有空椅子与镜子；走近镜面，并在地面站稳，让倒影睁开眼睛';
  if (omega.phase === 'reveal') return 'Ilya看到的不是另一个旧神，而是一路升级的你。镜像正读取真实动作频率、有效构筑与观察到的连招';
  if (omega.phase === 'complete') return '最终镜像已击败，结局与真实统计已锁定；查看结算或开始新训练，不会继续战斗计时';
  const { mirror } = omega;
  if (mirror.scan && mirror.scan.at > world.save.elapsedMs) return '镜像透视预警：离开标出的扫描矩形；只免疫镜像弹不等于免疫扫描和身体接触';
  if (mirror.rewind) return '镜像正在沿自己的真实轨迹回溯；预判它的落点，不要把倒影当作仍站在原地';
  if (mirror.state === 'tell') return `镜像预告：${mirrorComboLabel(mirror.plan)}；保持移动，看到实际动作后选择射击、冲刺或Q反击`;
  if (mirror.state === 'recover') return '镜像恢复空档：趁现在瞄准它射击；你的构筑与新成功连招仍会被观察';
  return `与你自己对决：偏好${MIRROR_ACTION_LABELS[mirror.profile.dominant]}，真实执行${mirrorComboLabel(mirror.plan)}；弹幕、冲刺与扫描分别躲避`;
}
