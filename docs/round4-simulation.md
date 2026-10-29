# 第四轮纯模拟：十万卡炼丹炉（目标回合5）

## 范围与基线

依据[GDD第三章](<../GAME_DESIGN_GDD.md#L73-L77>)、[架构约束](<architecture.md>)及[第二章最终验收](<round3-verification.md>)实施。开始基线为175单测/22浏览器/19后端；实际安装Phaser **4.0.0**，没有升级引擎、改配置/后端/schema、启动服务器或运行浏览器。本任务只实现data/model/纯systems、game测试及本文；Renderer/镜头/桥接/浏览器由Lead负责，React由另一代理负责。

这是第三章核心流程，不是完整五章、最终结局、美术或平衡验收。没有生成新资产或声称检查过新的场景截图。

## 共享小合同

[模型](<../src/pages/GamePage/game/entities/model.ts>)与[章节注册器](<../src/pages/GamePage/game/data/chapters.ts>)：

- 现在只有stage 1/2/3可玩；4/5仍返回undefined，加载时保留原save而不静默重置。
- `world.furnace`为null或`{startedAt,enraged,lifts,heatZones,laser}`。
- `MovingPlatform extends Platform`：增加`minY/maxY/periodMs/offsetMs/dy`，y为本帧真实碰撞表面，dy为本帧位移。
- `HeatZone extends Rect`：`id/phase/phaseUntil`，phase为cool/tell/active。
- `LaserState`：`x/y/length/halfHeight/facing/phase/until/hitPlayer/absorbedByRewind`。两个命中标记分离，先石化后Q仍能吸收同一束；每束最多各一次。
- `Player.standingOn`记录实际支撑平台，`petrifiedUntil`为有限石化期限；`Boss.kind='basilisk'`与`Boss.facing`明确区分该Boss。
- `Enemy.kind='chinchilla'`，共用`CHINCHILLA_HALF_SIZE=6`和`enemyRect`，身体12×12；增加严格穷举的gpu/causal攻击类型。
- `laserRect`与`playerRect`均从model导出，视图与真实判定用同一激光矩形。

[platforms.ts](<../src/pages/GamePage/game/systems/platforms.ts>)的`worldPlatforms(world)`返回静态平台+实时K线表面，统一供碰撞和渲染。没有仅在画面里移动的假平台。

## 场景、移动平台与热区

[第三章数据](<../src/pages/GamePage/game/data/chapterThree.ts>)为3280×360、地板y320，保持现有jump440/gravity1180物理。两处安全点x1320/2400，Boss入口x2520、竞技场宽750；控制器竞技场左右均保留12px，宽场景镜头由Lead接入，不固定假设只有640宽。

K线位于x560..680，表面y320↔140，以8秒周期真实升降。隐藏房地板在x720..910/y105，远高于从地面直接跳跃可达的高度。玩家需登上K线、随它上升后向右跳入；主路线不要求进入隐藏房。秘密奖励需在第一安全点前取得，经过/重载安全点后不重建已通过的lift与奖励。

载人只在上一帧同时满足以下条件时发生：grounded、standingOn对应真实lift、脚部距旧表面不超过0.75px、横向仍相交。随后控制器重新确定支撑；跳离、走离或伪造的陈旧支撑id不会粘住玩家。载人位移也进入真实历史，Q不按当前平台位置伪造终点。

[furnace.ts](<../src/pages/GamePage/game/systems/furnace.ts>)包含三个GPU热区：1800ms冷却、900ms预警、900ms高温，按区域错开节拍。只有高温且身体实际相交才造成14原始伤害，服从现有防御/无敌/gpu类型免疫。Q期间不受普通热区伤害；这没有改变第二章海水无视Q的即死规则。

龙猫HP108、12×12身体，预警后发射9枚gpu弹、800ms恢复（再进入600ms预警），不是尺寸/血量/密度都不变的普通敌人换色。

## 捐款因果与Basilisk

[商店](<../src/pages/GamePage/game/systems/shop.ts>)仅允许第一、二章购买募捐。第三章条目仍可展示，但纯规则返回不可买/不可劫持，说明因果已锁定；不是只靠UI禁用按钮。已有donated标记持续保留，不在Boss入口清空，也不表示免伤。

第三章创建时消费持久donated，令`furnace.enraged = !save.donated`。[Basilisk FSM](<../src/pages/GamePage/game/systems/basilisk.ts>)使用该模式产生不同的真实攻击：

| 参数 | 已捐，正常 | 未捐，狂暴 |
|---|---:|---:|
| 锁向预警 | 1300ms | 1000ms |
| 激光活动 | 700ms | 850ms |
| 恢复 | 1800ms | 1350ms |
| 第一阶段弹数 | 5 | 9 |
| 后续阶段 | 每阶段再+2枚 | 每阶段再+2枚 |
| 子弹原始伤害 | 14 | 21 |
| 子弹速度 | 110px/s | 145px/s |
| 对视原始伤害 | 14 | 22 |

Boss HP540，三段按现有1/3血量阈值推进。初次入场准备2400ms，保证竞技场清空旧历史后仍有时间记录真正的两秒。面向仅在进入tell时获取，并锁定到本次attack/recover结束；不会边发射边追着玩家转头。

正面护甲倍率0.35，背后弱点1.8；原始12点的真实弹丸命中分别为4/22点。`canReflect`现在只允许Gato，不能误让Basilisk在第一阶段继承挡板反弹。

## 对视石化与真实Q

默认激光长440、高22，起点在Boss朝向一侧26px、y=Boss.y+15。石化必须同时满足：

1. 当前束处于active且未过期；
2. 玩家身体与朝向决定的有限激光矩形相交；
3. 玩家facing指向Boss，且尚无causal类型免疫。

所以背对、身后、跳出激光高度、范围外都不石化。A/D改变面对方向，鼠标只决定瞄准位置，不偷偷改facing。

石化持续1200ms，同一束只触发一次，不按每帧刷新。移动/跳跃/冲刺/普通射击暂停，重力仍正常；Q只要冷却完成且真实历史够两秒，仍可触发并解除石化。Sydney的PUA定身保持**可以射击**，不能把石化的禁火规则错误套到PUA上。

Q仍由[历史模块](<../src/pages/GamePage/game/systems/rewind.ts>)倒放实际记录，逐段检测，不是把玩家直接放到Boss后面。只有历史位置确实在锁定面向的后方时，才能回溯到后方输出。回溯身体扫掠活动激光时复用`absorbAttack`，得到causal免疫10秒和2暴击（总上限6）；`absorbedByRewind`防止每帧反复领奖。先被同一束石化后再按Q也能获得这份保护，`hitPlayer`不会把该过程提前截断。

## 不可变性、暂停与保存

[模拟器](<../src/pages/GamePage/game/systems/simulation.ts>)在每个playing tick先复制lifts、heatZones、laser及其它既有可变嵌套数据。rest直接返回旧世界，不推进平台、热区、Boss、石化或技能时钟。进入/恢复安全点只重建安全段，清除已通过奖励与敌人；不再次发放已保存的评级奖励。

存档schemaVersion仍为1。checkpoint编码0/1/2与11/12/21/22继续按stage解释，不比较编码大小。第三章胜利先发stage4/cp0的checkpoint，再发stage-cleared(stage3)；保留runId/build/donated/actionCounts等字段，不产生最终结局。第一、二章正常输入回归继续通过，尤其第二章入口仍为**300−22/2=289**，短跳不提前锁镜头。

旧“第三章未开放”测试合法迁移到第四章：仍保留未知进度不降级、不改save、不允许交易的断言，并新增第三章正向注册/保存/交易资格验证，没有删除原来的保护含义。

## 实测与边界

命令`npm run typecheck`及`npm test -- tests/game`：任务`bash-0a0574c884b54332`，**退出码0，14文件106/106通过**。包括原85游戏测试、[新增18机制测试](<../tests/game/furnace.test.ts>)和[新增3个真实输入路线测试](<../tests/game/furnacePlaythrough.test.ts>)。任务`bash-c92de63834ce43d2`完成本任务纯source/data/model/tests范围ESLint，退出码0。补强“按Q前真实历史”断言后，任务`bash-cad30def3dd44129`再次通过106/106、所改测试ESLint与范围`git diff --check`，退出码0；指标不变。

正常输入全程从合法第三章起点开始，只发送FrameInput和rest-continue，不改血、不传送、不直接扣Boss血，也没有测试专用生产作弊入口。控制器等待每个phase的真实attack，保证不是瞬杀跳阶段。Q终点还与**按键前真实历史中两秒前的位置**核对，而非仅相信返回的rewind.path。

| 路线 | 模拟耗时 | 最终HP | 帧数 | 射击/Q | 真实历史绕后 |
|---|---:|---:|---:|---:|---:|
| 已捐正常 | 27,182ms | 100 | 1633 | 76 / 1 | 1次 |
| 未捐狂暴 | 25,382ms | 100 | 1525 | 76 / 1 | 1次 |
| K线秘密房 | 约11,667ms | 100 | 700 | 普通瞄准射击 | 真实乘上/下行后跳入 |

前两条均实际经过两个rest和全部三个attack phase，最后stage4/cp0通过DTO校验。躲弹路线自然经过可选+22算力缓存，Doom从8变30，仍处aligned档，未获得伤害档位提升；首轮测试原先错误假设保持8，仅这条末尾断言失败，随后改为精确记录真实30，未修改生产参数或隐藏收益。

狂暴用时更短来自测试控制器必须等每阶段attack，而狂暴节拍更快；**不代表人类平均难度已平衡**。完美脚本的100HP同样不是无敌承诺。秘密房测试实际到达x792.11/y94、站在y105的秘密平台上并拾取45TOK，非动画截图或位置注入。

本轮机制测试构造局部临界fixture（例如删除子弹以单独核对先石化→Q吸收同束），与上述不改状态的完整路线证明明确分开。最终浏览器、镜头冷评、输入手感、美术与完整五章由Lead后续分别验收；第四、五章及最终结局尚未实现。
