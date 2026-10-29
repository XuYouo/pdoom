# Round 6 — Omega 与最终镜像纯规则交接

日期：2026-10-28（Asia/Shanghai）。本文件记录 task-12 的纯规则、输入通关与回归证据，不把终局展示冒充击杀，也不宣称美术、配音或真人平衡已完成。

## 1. 范围与最终检查

- 实际引擎保持 Phaser 4.0.0；未升级依赖、改配置、改 v1 DTO、启动服务/浏览器或生成美术。
- 修改范围： [模型](</Users/ocean/code/pdoom/src/pages/GamePage/game/entities/model.ts>)、[第五章定义](</Users/ocean/code/pdoom/src/pages/GamePage/game/data/chapterFive.ts>)、[注册表](</Users/ocean/code/pdoom/src/pages/GamePage/game/data/chapters.ts>)、[检查点](</Users/ocean/code/pdoom/src/pages/GamePage/game/data/checkpoints.ts>)，以及纯规则、对应游戏测试与本文。
- [上一轮整体验收](</Users/ocean/code/pdoom/docs/round5-verification.md>)的 335 单测 / 35 浏览器 / 19 Scala-HTTP 是上一轮全项目基线，不是本代理本轮独自重跑的范围。
- 本轮最终 job **`bash-8050d64781384fc2`**：**19 个 game 测试文件、179 项全部通过**（原 143 项 + 新增 36 项）；全项目 `typecheck`、本任务修改文件的 ESLint、范围 `git diff --check` 均 exit 0。
- 上一个完整检查 job `bash-fd94d344b86f46d0` 为 178 项全绿；最后增加高频计数回归后得到上面的 179 项。
- 当前 src 与 tests 已冻结供 Lead 跑统一质量门；本文之外无待落盘的功能占位。task-10 先前被拒绝的完成操作没有重试，状态没有修改。

## 2. 几何与真实到达

[第五章定义](</Users/ocean/code/pdoom/src/pages/GamePage/game/data/chapterFive.ts>)导出 `CHAPTER_FIVE`、`OMEGA_ROOM`、`OMEGA_STORMS`，规则和渲染共用坐标：

| 项目 | 世界坐标 / 尺寸 |
|---|---|
| 世界 / 地板 | 3200×360 / y=320 |
| 出生与两处安全点 | (72,309)、(960,309)、(1920,309) |
| arena | x=2540, y=0, w=640, h=360 |
| 最后的门 | (2480,224), 40×96 |
| 空椅子 | (2800,300) |
| 落地镜框 | (3001,222), 48×98，中心 x=3025 |
| 镜像初始身体 | (3025,309)，与玩家同为 **16×22**；视觉资产尺度 32px |

- 路线有两个 60px 断层、三个可跳跃躲避的地面风暴区和可站立的观测平台；两个旧类型敌人提供射击与透视机会。
- 风暴为 cool → 750ms tell → 650ms active → 1800ms cool 的明确节拍。真实伤害只在 `omega.phase === 'storm'` 生效；方向字段用于视觉流向，不隐式推移玩家。
- 安全房仅在角色真正落地、脚贴 y=320 且距对应入口不超过 24px 时进入。空中越线或已走远不会被拉回/拉下，也不会凭横坐标领取休息奖励。仍沿用既有休息室计分、交易及恢复合同。
- [Omega 规则](</Users/ocean/code/pdoom/src/pages/GamePage/game/systems/omega.ts>)依次为 `storm → chamber → reveal → duel → complete`。经过最后的门只进入空房，不提前激活 boss。
- 只有站稳在真实地板上、距镜像中心不超过 86px 才触发 1200ms reveal。没有强设玩家坐标或生命值；揭示期间仍走正常运动/重力，触发时清空旧 Q 历史，下一 tick 才锁已合法进入的 arena 水平边界。
- duel 开始只提供 500ms 入场保护，不加血；镜像先准备 2200ms。身体不可见/地板以下不能触发门或揭示。

## 3. 有序学习与真实频次

[行为观察](</Users/ocean/code/pdoom/src/pages/GamePage/game/systems/behavior.ts>)提供：

```ts
cloneBehavior(memory: BehaviorMemory): BehaviorMemory
createBehavior(save: GameSaveData, carried?: BehaviorMemory): BehaviorMemory
observeBehavior(memory, beforeCounts, afterCounts, now): BehaviorMemory
mirrorProfile(save: GameSaveData, behavior: BehaviorMemory): MirrorProfile
createWorld(save, mode?, carriedBehavior?)
```

- 所有章节都观察，且仅观察实际成功计数 delta。固定执行顺序为 insight → rewind → dash → shot；冷却空按、Q 历史不足、无效 R 不被写成技能。
- 连续同类成功动作压成一个最近事件；其真实计数仍完整保留。只记录 2400ms 内实际发生的二/三动作序列。
- 最近事件最多 **48**。四种动作去相邻重复后，合法二元组 12 种、三元组 36 种，故组合池保存**完整 48 种有限全集**，而不是会饿死新模式的 Top32 近似。
- 单组合 uses 上限 **1,000,000**，与 v1 动作计数上限相同，不在 9999 提前饱和。carried 组合必须合法、唯一，uses 不超过其任何成员真实计数；所有时间戳必须在观察时刻以内。
- 运行记忆按 runId、seed、四计数和同一安全 tick 验真；允许安全快照 floor 时间导致的 `[0,1)`ms 差，拒绝更早/更晚时刻、异 run/seed、计数不一致或非法嵌套序列。所有可变层级深拷贝。
- Scene 的精确安全快照缓存由 Lead 负责；本任务没有修改它。新 attempt / 无缓存 / 旧档只有真实频次，`profile.source='counts-only'`，起手为单个最高频动作，不伪造历史组合。获得当前尝试有序证据后显示 `mixed`；完整连续观察为 `observed`。
- 组合选择在每次新计划时重算，执行中的计划不会临时改顺序。频率来自真实 `save.actionCounts`；build 来自实际有效的 `contextEffects` 与 context slot 状态，含 Lost in Middle、升级与 Lisp 发散间隔。
- [行为测试](</Users/ocean/code/pdoom/tests/game/behavior.test.ts>)包括：失败按键、真实同 tick 顺序、去重/窗口、深拷贝、未来/陈旧记忆拒绝、32 组旧高频之后的新组合能真正成长、合法 20000→20001 与 19000 频率不提前截断，以及失效中间词条不能偷偷生效。

## 4. 镜像不是通用 boss 的换皮

[镜像 FSM](</Users/ocean/code/pdoom/src/pages/GamePage/game/systems/mirror.ts>)区分 `idle / tell / execute / recover`，并公开 actor、plan、index、action、profile、scan、自身 history/rewind、真实执行计数等给渲染。

- 共用玩家的真实 `movePlayer` 运动/碰撞与 16×22 身体；普通追逐、冲刺确实改变世界坐标。`boss.x/y` 每帧与 actor 同步，射击命中使用相对运动 CCD。
- 每个动作先独立预警：基础为 700 / 620 / 540ms（按阶段），技能未冷却时预警延长到真正可施放；不把空尝试算成完成。
- 射击执行 620ms，温度实际改变发射间隔/弹数；Lisp 发散弹实际无伤。
- 冲刺由真实控制器执行；动作段 200ms，其中标准 dash 140ms，不设置一个假目标坐标。
- Q 使用镜像**自己的**最近两秒轨迹并在 600ms 内反向遍历。历史最多 128 个按固定 tick 分桶的样本；不借用玩家坐标或凭空生成历史。扫过玩家弹只获得最多两次暴击充能，不复制玩家的十秒类型免疫。
- E 有实际预警与扫描区域、真实 impact 伤害，并在有效透视时间内让后续射击追踪。玩家可以躲开或用真实 Q 穿过扫描；镜像射击的 `mirror` 免疫不能覆盖扫描和身体接触。
- 每次完整连招完成后有 3000ms 反击窗；每阶段必须实际完成至少一次计划，才可受伤。HP 阶段下限为 240 / 120，极高暴击也不能一帧跳过三阶段。
- 生效防御真实影响受伤，生效输出/温度/残差/透视/校准影响相应参数；被 Lost in Middle 抑制的词条不会通过原始 inventory 偷渡。
- [机制测试](</Users/ocean/code/pdoom/tests/game/omega.test.ts>)验证真实 dash→Q→E 顺序、Q 精确自身端点与明显位移、E 实际伤害、移动目标 CCD、有限吸弹充能、反击门控、历史上限及深冻结。

## 5. 四条完整普通输入证明

[完整通关测试](</Users/ocean/code/pdoom/tests/game/omegaPlaythrough.test.ts>)只从合法第五章入口开始，通过 `FrameInput` 和正常 `rest-continue` 走完整章；不修改战斗中的血、坐标、boss HP、动作计数或学习记忆。

| Doom / 路线 | 游戏时间 | 帧数 | 胜利 HP | 镜像实际执行 |
|---|---:|---:|---:|---|
| 8 / 常规 | 36,815ms | 2211 | 86 | 三阶段各 shot→dash→shot；shot24 / dash3 |
| 55 / 常规 | 34,765ms | 2088 | 51 | 三阶段各 shot→dash→shot；shot24 / dash3 |
| 90 / 常规 | 33,149ms | 1991 | 100 | 三阶段各 shot→dash→shot；shot24 / dash3 |
| 8 / 真实 Q/E 教学 | 56,865ms | 3414 | 93 | 第一阶段 dash→Q→E；后两阶段现场改学 shot→dash；shot8 / dash3 / Q1 / E1 |

共同证据：两处休息点 `[1,2]`、完整五个 Omega phase、真实三阶段执行、27 个镜像 dash 大于 6px 的实际移动帧、最终 `finished` / stage5 / cp90 / 正确胜利事件，最终 Doom 原值不变。

教学路线在安静房间通过真实 dash、Q 撤回自身运动、E 重复三次建立证据，不注入序列。随后镜像真正回溯自己的历史并执行扫描，再根据战斗中新的行为改学二连招。前三条没有选中镜像 Q/E，不能拿它们冒称已证明全部技能；第四条和独立机制测试才补足这一证明。

## 6. 终局与 v1 幂等边界

- [检查点规则](</Users/ocean/code/pdoom/src/pages/GamePage/game/data/checkpoints.ts>)新增 `FINAL_CHECKPOINT=90`、`isCompletedSave`、`isSupportedCheckpoint`。普通 `decodeCheckpoint` 的 0/1/2、11/12、21/22 语义不变；90 仅对 stage5 是终局，其他章仍 unavailable。
- [最终规则](</Users/ocean/code/pdoom/src/pages/GamePage/game/systems/rules.ts>)分类：`doom < 30` aligned；`30 <= doom < 80` warden；`doom >= 80` foom。测试逐一覆盖 0、29.99、30、79.99、80、100。没有把实际统计改写成叙事标签 0/50/100。
- 实际第五章获胜产生一次 checkpoint（cp90）事件与一次 `victory { result }` 事件，不再发 `stage-cleared` 或循环保存第五章入口。首次终局奖励 +4000 分 / +180 TOK，按既有 v1 10,000,000 分 / 1,000,000 TOK 上限饱和；重复完成不再领奖。
- 已完成档重建立即为 `finished`，仅一个相同 victory 事件，无敌人/拾取物，不推进时钟或战斗。非法继续/购物只会被拒绝，不生成新的 victory/checkpoint。
- 同帧玩家死亡优先仍为 defeat，不写 cp90。第四章清关仍是非最终 `cleared`，现在注册表与后续入口支持第五章。
- 所有旧“未来 stage5 不支持”的保护断言迁到合法 stage5/cp99；保留原存档、分数、不可模拟/交易等断言，没有用 DTO 非法 stage6 绕过。

## 7. 原路线没有倒退

最终同一 job 内旧 1–4 所有游戏测试通过，关键普通输入指标与上一轮一致：

| 原路线 | 游戏时间 / 帧数 | HP / 关键动作 |
|---|---|---|
| 第二章 | 29,915ms / 1797 | 84HP；两休息室与三阶段 |
| 第三章已捐 / 未捐 | 27,182ms / 1633；25,382ms / 1525 | 均100HP，76 shots、1次真实Q |
| K-line 隐藏房 | 11,666.67ms / 700 | 真实乘坐、升降、跳入；100HP |
| Loom seed42 上 / 下 | 29,248ms / 1757；29,399ms / 1766 | 均100HP、1次R、3次真实左转 |
| Loom seed77 上 / 下 | 29,766ms / 1788；29,332ms / 1762 | 均100HP、1次R、3次真实左转 |

第一章原普通输入通关测试也通过；没有为其补造未输出的计时数据。第四章重复 tell 不再声称新增平台损失的既有修复保持不动。

## 8. 浏览器证据边界与未声称内容

- Lead 独立报告 `bash-f8b7377397ff46e5` 的六项合法 cp90 终局展示 / 真实三结局上传云恢复通过；它们是展示与链路证明，不是击杀。
- Lead 独立报告 `bash-77f69a2afc8e4349` 的 native 实战通过：合法 rest02 → 风暴/空椅/镜 → 实际 aligned 胜利，74HP、游戏时间增24,000ms、66次只读像素采样，镜像屏幕X约290.75–540.25真实移动，未改血/坐标/扣boss。音频自然 suspended。
- 上述是 Lead 的报告，本代理没有运行浏览器、后端服务或声称自己看过实机截图。最终全项目统一质量门及后续 attempt UUID 迁移验证由 Lead 另行记录，不能拿较早报告代替。
- 本轮证明是可执行机制、四条自动输入通关与回归，不是最终美术/音效资产完成度，也不是充分真人可读性、无障碍或平衡验收。
