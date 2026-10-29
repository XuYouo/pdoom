# 第五里程碑纯规则：The Loom（目标回合6）

2026-10-28，Asia/Shanghai。依据[GDD第四章](<../GAME_DESIGN_GDD.md#L79-L83>)、[架构](<architecture.md>)与[上一里程碑219/27/19验收](<round4-verification.md>)。实际读取安装包确认Phaser **4.0.0**，没有升级引擎、改配置/DTO/后端、启动服务器或浏览器。

本任务负责data/model/纯systems与game测试；Lead负责输入、Renderer、镜头、bridge和浏览器，另一代理负责React与音频。这里只报告**第四章纯规则证据**，不宣称最终章、结局、完整美术、真实音频听感或人类平衡已完成。

## 1. 真实的种子分岔图

[章节元数据](<../src/pages/GamePage/game/data/chapterFour.ts>)为2580×640横向世界。安全hub中心x为100/680/1260/1840，表面y360，其中680/1260是两个休息点；竞技场x1940..2580、y200..560，进入阈值x1960，初始地面y520。Boss为2490/448、420HP。

[生成器](<../src/pages/GamePage/game/data/loomGraph.ts>)拥有局部xorshift32，不调用全局random。固定seed=1前五个unsigned输出由测试钉住：

```text
270369, 67634689, 2647435461, 307599695, 2398689233
```

零seed显式归一化避免零不动点。timeline B采用固定xor盐；seed、timeline、checkpoint唯一决定本版本的几何，绝不按墙钟时间生成。

- 三段真实diamond，每段有独立upper/lower路径；每条路径的3或4节点由seed决定，尺寸与偏移也受seed影响。不是换色的一条路，共有8种上下选择组合。
- 全图27–33节点；进入安全点后裁掉已提交的旧段。上升高差最多60px，普通相邻分支间隙最多23px；校验预算分别为64/48px，保持原jump440/gravity1180不变。
- 没有连续底板。第四章静态platforms为空，行走失足确实会掉入虚空；lower路线返hub必须真正上到其表面或上方门区。
- 近身260px且有已展开前驱时展开。R的目标节点可直接展开；Boss入场展开整个竞技场。未展开或坍塌节点不参与碰撞。
- 每条路径的中部脆弱节点，踩上后预警2秒再从实际碰撞中移除。保护hub与最终中心锚不会这样坍塌。
- 分支中部奖励为12TOK，剩余拾取随R新节点移动，已收ID不再创建。

[worldPlatforms](<../src/pages/GamePage/game/systems/platforms.ts>)是实际碰撞/表现共同来源；第四章直接返回展开且未塌的node对象，不另画假地板。对128个seed×2条时间线×3个安全段共**768组图**检查节点上限、ID、边界、所有分支连通与跳跃预算。结构检查不冒充玩家物理通关，后者另有四条完整输入证明。

## 2. 小合同与R环境技能

[模型](<../src/pages/GamePage/game/entities/model.ts>)新增`FrameInput.rerollPressed?: boolean`、默认false；旧FrameInput仍兼容。`world.loom`是runtime状态，包含：

- `timeline/nodes/rerollReadyAt/rerolls/lastReroll`；node沿用Platform的左边界x，加branch、segment、next、expanded、collapseAt、collapsed。
- `hpUiTaken/stemsLost(0..4)/eaten/swallow/narrow/pullSpeed`。
- `turn:{until,lineX,startX,successes,weakUntil}`。
- `Boss.kind='leviathan'`、`BulletKind='void'`；`bossRect`为该Boss返回**144×144**真实接触域，旧Boss仍52×74。表现层约定显示这个矩形边界及内部六边漩涡，不能用不可见空角伤人；视觉结果由Lead另验。

[R规则](<../src/pages/GamePage/game/systems/loom.ts>)：

1. 只在第四章playing且存活时可用；冷却6秒，rest、Q重放期间拒绝，不增加保存DTO的四项actionCounts。
2. 切到另一条实际几何不同的时间线。分支高低带保证改变，竞技场B表面是**508**而非520；中心锚宽度也变化。
3. 在已提交段起点与下一个checkpoint阈值之间找附近安全承载，横移最多160px、纵移最多360px；已进Boss后仅选竞技场内未吞节点，且避开Boss身体。不跨下一个休息点，不带出Boss场。
4. hub是两个宇宙共享的稳定岛，R在允许边界内另横移18px，仍有明确空间转移。无安全候选时提示拒绝，不扣冷却，不伪造平台。
5. 只移动玩家与仍存在的拾取，不重新发奖励、不加HP。吞掉的平台不会被R吐回。
6. R清除旧Q历史，本帧只留一个新位置样本；后续须重录两秒。子弹碰撞也从R落点起算，不能把瞬移连线当成连续扫掠。

R是有限条件的环境转移，不是任意位置救命或复活。`rerolls`只作运行时证明/表现；安全点重建回timeline A，同进程保留内部计数及剩余冷却，重载只从v1的seed/checkpoint重建暂态，不声称保存了整个战斗世界。

## 3. Lead审读发现并修复的门区漏洞

原通用水平检查点只比较x并由enterRest吸到安全位置，这在Loom下层虚空中不成立。为防止“从岛下面横穿x也被抬上去”掩盖不可达路线，新增**仅Loom**门区：

- 对应hub必须真实展开且未塌，x已过该安全点中心。
- 或者grounded、standingOn对应hub、脚精确接触真实表面；或者整个身体位于hub中点至右端、表面上方100px的有限门区。**脚不能在平台下方**。
- Boss激活另要求身体顶部不高于视口上边界之外（即顶部≥arena.y），脚不低于真实竞技场表面。读取timeline A/B实际520/508表面，不偷用静态floor。
- Loom虚空死亡在拾取与休息奖励之前处理，不能临死拾物或被安全点抬回。

实现位于[Loom门区谓词](<../src/pages/GamePage/game/systems/loom.ts>)、[拾取/安全点](<../src/pages/GamePage/game/systems/interactions.ts>)和[模拟边界](<../src/pages/GamePage/game/systems/simulation.ts>)。新增11个回归覆盖两个岛下方越x、实际着陆、上方门区、A/B实际地面、头部裁切与虚空奖励顺序；四条正常路线指标**没有改变**。前三章仍走原规则，第二章门槛**289**没有回退。

## 4. 吞噬与真实Sharp Left Turn

[Leviathan FSM](<../src/pages/GamePage/game/systems/leviathan.ts>)初入场准备2400ms；各轮预警1200ms、攻击窗口2800ms、普通恢复1200ms。预警列出将吞的平台ID，计时结束后真从碰撞移除，受影响玩家下一物理tick会下坠。

| 阶段 | 累计吞平台 | 剩余宽度（seed42/A） | 向右吸力 | void弹数/速度/原始伤害 |
|---|---:|---:|---:|---|
| 1 | 2个外侧 | 410px | 80px/s | 3 / 120 / 18 |
| 2 | 再吞左内侧 | 298px | 115px/s | 5 / 135 / 20 |
| 3 | 再吞右内侧 | 176px | 150px/s | 7 / 150 / 22 |

仅四个可吞ID，重试不会无限吃空；中心锚始终保留。不同seed/时间线的最终锚宽为158–180px。实际HP按原伤害规则照常计算，`hpUiTaken`仅是表现标记，绝不修改存档HP假装吞血条。

标线x2240。玩家需在中心锚上、活动窗口内，向左实际冲刺（朝左、dash仍有效、vx<-250），本次左冲位移至少32px且越过标线左侧14px才成功。推荐站在线右侧约20–30px后A+冲刺。走路跨线无效，Q重放或R瞬移也不能冒充左转。

成功后开启3200ms弱点、停止吸力、抵消敌弹，**在playing状态中暂时吐回血条与全部音轨**（false/0）；下一轮tell再取走。平台不返还。这里验证的是足够长的真实运行字段窗口，可听/可见效果由UI/音频和浏览器集成另验，不是只在停止运行的清关帧改属性。

闭壳J为0伤害；每阶段伤害分别止于280/140/0HP，哪怕极端暴击也不能从一阶段越过下一阶段，且不会把Boss反向加血。每一阶段必须再完成一次左转窗口。成功击败或死亡都会释放吞UI/音轨状态。

## 5. 不可变性、保存与旧断言

`stepWorld`复制node及next、eaten、swallow及ids、narrow、turn、lastReroll及from/to后才允许内部系统写本帧草稿。深冻结上一世界的测试通过；rest直接返回原世界，全部倒计时/平台/吞噬状态冻结。

schemaVersion仍为1，checkpoint0/1/2与11/12/21/22语义不变。第四章清关先保存stage5/cp0，再发stage-cleared(stage4)，保留seed/runId/build/donated/actionCounts；没有最终结局。第五章仍unavailable，原save保留，不降级成新第一章。

[第二章旧边界测试](<../tests/game/chapterTwo.test.ts>)、[通用保存保护](<../tests/game/simulation.test.ts>)、[第三章旧边界](<../tests/game/furnace.test.ts>)只将unsupported4移到5，保留所有保护断言；另新增第四章注册、合法交易与完整清关的正向证明。input与assets测试没有由本代理编辑。

## 6. 实测

[四条完整输入路线](<../tests/game/loomPlaythrough.test.ts>)只发送FrameInput与合法rest-continue，不在测试途中改血、改位置、扣Boss血或伪造历史。实际游戏R是唯一有意的空间转移。控制器真的等脚下节点坍塌并下落超过平台，再按R救回；只走指定upper或lower路线，经过两个rest及三个真实attack，每阶段真实左转一次，最后阶段窄于200px。R前后真实几何不同、历史重新开始，已收奖励不再出现。

| seed / 选择 | 模拟耗时 | 帧数 | 最终HP | 坍塌后R | 左转成功 | 最终锚宽 |
|---|---:|---:|---:|---:|---:|---:|
| 42 / upper | 29,248ms | 1757 | 100 | 1 | 3 | 176px |
| 42 / lower | 29,399ms | 1766 | 100 | 1 | 3 | 176px |
| 77 / upper | 29,766ms | 1788 | 100 | 1 | 3 | 178px |
| 77 / lower | 29,332ms | 1762 | 100 | 1 | 3 | 178px |

四条结果均stage5、有效DTO、Doom8；完美控制器的100HP不是无敌或人类平衡结论。[32个机制测试](<../tests/game/loom.test.ts>)使用局部临界fixture，与不改状态的四条路线证明明确区分。

- 首轮四路线任务`bash-8179646f610541b5`：4/4，exit0。
- 门区修复前全game任务`bash-fd17148d28964404`：132/132，exit0。
- 最终任务`bash-fa572ded6d5f44eb`：**全量typecheck、game16文件143/143、本代理范围ESLint全部exit0**。143包含旧106、Lead新增1个R输入测试、本代理新增32机制+4完整路线。
- 最终范围`git diff --check`：exit0。
- 第二章原正常路线仍29,915ms/84HP；第三章正常/狂暴仍27,182/25,382ms、真实K线秘密支路仍700帧，旧指标未回退。

首轮typecheck曾因其它owner尚在编辑的Renderer/e2e/UI测试失败，未越界修别人的文件；最终全typecheck已通过。一次向UI代理的状态消息被审核拒绝，未执行、未重试，已向Lead纠正先前并行通知的发送状态。本任务所有后台作业已收集，无遗留terminal或服务。

## 7. 交接边界

核心源与测试在上述143通过后冻结；最终全量前端、浏览器、真实后端、音轨生命周期和视觉冷评由Lead统一验收。本任务没有查看或宣称查看第四章截图，也没有生成正式环境/Boss像素资产。第四章核心可玩仍不等于完整五章；最终关、镜像与三结局尚未实现。
