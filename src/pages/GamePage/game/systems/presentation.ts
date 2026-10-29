import { isChapterPlayable } from '../data/chapters';
import type { LoomHudSnapshot } from '../bridge';
import type { WorldState } from '../entities/model';
import { objectiveFor } from './rules';
import { omegaObjective } from './omegaPresentation';

/** Low-frequency text derived from the world; no React state or independent gameplay clock. */
export function worldObjective(world: WorldState): string {
  const { mode, chapter, save, player, boss, factory, furnace } = world;
  if (mode === 'rest') return '安全休息室：世界与机关计时冻结，调整上下文、交易或直接继续';
  if (mode === 'finished') return '最终结局已锁定：保留真实Doom与完整统计，查看结算或开始新训练；战斗与计时不再推进';
  if (mode === 'cleared') return `第 ${chapter.stage} 章通过，第 ${save.stage} 章入口已保存；${isChapterPlayable(save.stage) ? '从页面明确继续下一章' : '后续章节尚未开放'}，这不是最终结局`;
  if (mode === 'unavailable') return `第 ${save.stage} 章 / 安全点 ${save.checkpoint} 尚未支持；原存档保留`;
  if (mode === 'dead') return factory && player.y + 11 >= factory.seaY ? '回形针海已将你拆解；从安全检查点重新向上逃生' : '运行中断；从页面选择重试或检查点继续';
  if (chapter.stage === 1) {
    const remaining = (deadline: number) => (Math.max(0, Math.ceil((deadline - save.elapsedMs) / 100)) / 10).toFixed(1);
    if (!world.rewind && player.invertedUntil > save.elapsedMs) return `重力反转 · ${remaining(player.invertedUntil)} 秒；顶部安全，A/D仍可移动`;
    const footing = chapter.platforms.find(platform => platform.id === player.standingOn && platform.fragile);
    if (footing && world.collapseAt[footing.id] !== undefined && !world.collapsed.includes(footing.id)) {
      return `脚下裂纹平台 · ${remaining(world.collapseAt[footing.id])} 秒后坍塌，立即跳离`;
    }
  }
  if (world.omega) return omegaObjective(world);
  if (factory) {
    if (player.rootedBy !== null) return '精神控制：仍可 J / 鼠标射击！打碎亮框 PUA 气泡解除定身，Q 不能绕过';
    if (boss.active) return boss.phase === 1 ? 'Sydney：避开对话框，预警后留意近身控制气泡' : boss.phase === 2 ? 'Sydney：颜文字飞刀加速，Q 可取得飞刀类型免疫；控制泡必须击碎' : 'Sydney：对话与飞刀交错，保持射击，先解除精神控制';
    if (factory.seaY - player.y < 110) return '回形针海已逼近！沿绿色台阶向上跳；海面触及即死，冲刺与Q不提供海水免疫';
    return '沿绿色台阶向上逃生；射击探针阻止复制，侧路算力平台可能被吞噬';
  }
  if (furnace) {
    if (player.petrifiedUntil > save.elapsedMs) return '石化：Q就绪后可沿真实两秒轨迹解除；不会自动传送身后，A/D与普通射击暂时受限';
    if (boss.active) {
      const debt = furnace.enraged ? '未捐款狂暴' : '已捐款抑制狂暴';
      if (furnace.laser?.phase === 'tell') return `Basilisk / ${debt}：已锁向${furnace.laser.facing === -1 ? '左' : '右'}侧；背向激光，或Q回到之前所在的另一侧`;
      return `Basilisk / ${debt}：先穿身引它转向，再Q回到旧侧绕后；A/D改变面向，鼠标可背身射击`;
    }
    if (player.standingOn === 'secret-room') return '已抵达K线隐藏房：收集代币与修复，再返回机房主路';
    const carried = furnace.lifts.find(lift => lift.id === player.standingOn);
    if (carried) return carried.dy <= 0 ? '正在乘坐K线：上升阶段，靠右站稳后跳向右上隐藏房' : '正在乘坐K线：回落阶段，保持站稳等待下一轮上升';
    return player.x < 920 ? '第三章 / 可选K线支路：站上绿色平台随它升降，跃向右上隐藏房' : 'GPU热区按节拍升温；龙猫体小血厚、弹幕密集，Q可穿弹取得同类免疫';
  }
  if (world.loom) {
    const loom = world.loom, now = save.elapsedMs;
    if (boss.active) {
      if (loom.turn.weakUntil > now) return 'SHARP LEFT TURN成功：弱点已开，立即J/鼠标射击；血条和音轨暂时吐回，平台不会复原';
      if (loom.turn.until > now) return player.x > loom.turn.lineX
        ? '急转弯窗口：现在A + Shift向左冲过金色标线；需要实际跨线位移，闭壳时J无效'
        : '吸力窗口：先到金色标线右侧，再A + Shift急转弯；左侧原地按技能不会开弱点';
      if (loom.swallow) return loom.swallow.ids.length > 0
        ? '吞噬预警：橙框平台将真实消失；准备标线右侧起手，R不会还原已经吞掉的平台'
        : '吞噬预警：本轮无新增平台消失；已吞地形不会复原，准备标线右侧再次急左转';
      return 'Leviathan闭壳：等待吞噬/吸力预警，以真实向左急转弯打开弱点；留意剩余立足区';
    }
    const footing = loom.nodes.find(node => node.id === player.standingOn);
    if (footing?.collapseAt != null) return `脚下分支正在坍塌：${Math.max(0, Math.ceil((footing.collapseAt - now) / 100) / 10).toFixed(1)}秒后消失，R切换同段平行落脚点，或立即跳向下一节点`;
    if (world.rewind) return 'Q沿真实轨迹回溯，但不会复原坍塌地形；回溯期间不能R重roll';
    if (loom.lastReroll && now - loom.lastReroll.at < 2000) return `已重roll到时间线${loom.timeline === 0 ? 'A' : 'B'}：地形已改变，Q重新积累两秒历史；不重发拾取`;
    return `时间线${loom.timeline === 0 ? 'A' : 'B'}：上/下分支都可前进，靠近才展开；R切换同进度平行地形，不能跳过安全点`;
  }
  return objectiveFor(player.x, boss);
}

export function loomHudSnapshot(world: WorldState): LoomHudSnapshot | undefined {
  const loom = world.loom;
  if (!loom) return undefined;
  const now = world.save.elapsedMs;
  return {
    timeline: loom.timeline,
    rerollReady: world.mode === 'playing' && now >= loom.rerollReadyAt && !world.rewind,
    hpUiTaken: loom.hpUiTaken, stemsLost: loom.stemsLost, narrow: loom.narrow.w <= 200,
    sharpTurnReady: world.mode === 'playing' && loom.turn.until > now && loom.turn.weakUntil <= now,
  };
}
