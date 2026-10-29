# 第三章 UI 与募捐因果说明（目标回合5 / task-9）

## 基线、范围与合同

已读取 [GDD 第三章](<../GAME_DESIGN_GDD.md#L73-L77>)、[上一里程碑验收](<round3-verification.md>)和当前实际源码。基线为 **175单测 / 22浏览器**，Phaser保持4.0.0；第二章入场门槛289和真实PNG站位断言不属于本任务，也未修改。

本任务只写获分配的六个 React/hook 文件、指定前端测试与本记录：

- [useGameSession](<../src/pages/GamePage/hooks/useGameSession.ts>)
- [RunOverlay](<../src/pages/GamePage/components/RunOverlay.tsx>)
- [MissionConsole](<../src/pages/GamePage/components/MissionConsole.tsx>)
- [GamePanels](<../src/pages/GamePage/components/GamePanels.tsx>)
- [RestRoomPanel](<../src/pages/GamePage/components/RestRoomPanel.tsx>)
- [GamePage](<../src/pages/GamePage/index.tsx>)
- [chapter-ui 测试](<../tests/frontend/chapter-ui.test.ts>)

没有改 model/data 注册器、纯 systems、renderer、Scene、Input、bridge、API、Scala、Save schema v1、CSS、e2e 或包配置。**没有启动任何服务器或浏览器。**

使用 gameplay-engineer 实际落盘的[注册器](<../src/pages/GamePage/game/data/chapters.ts>)与[第三章数据](<../src/pages/GamePage/game/data/chapterThree.ts>)：1/2/3可玩，4/5未开放；第三章名称“十万卡炼丹炉”、英文“100,000 GPU CLUSTER”、Boss kind=basilisk。React仍只消费既有 save/HUD/rest快照，不新增逐帧位置、furnace或facing字段。

## 已实现的 UI 行为

1. **清关推进泛化**：第一章仍显示“进入第二章”，第二章正确显示“进入第三章”。两者都直接`start(screen.save)`，同时要求下一章连续、已注册、checkpoint合法；不生成新runId，不重建build，不改donated。第三章清关只保留第四章入口，默认返回终端，不提供进入第四章或伪造最终结局。
2. **实际世界与下一存档分离**：清关标题、Boss和目标按`screen.stage`读取metadata；`screen.save.stage`仅用于下一章入口。Guide同样展示刚结束的世界，不因存档已前移而把第三章说成第四章。
3. **可玩范围来自实际数据**：菜单badge用`PLAYABLE_CHAPTERS.length`，指南列出注册器名称/章节号；不可玩提示不再写死“仅前两章”。路径总数来自规划卡列表，卡片可玩性来自注册器，第四/五章诚实显示未开放。未知章节/安全点仍保留原存档且禁用恢复。
4. **募捐因果只读说明**：纯`donationNote`只读取现有`stage`/`donated`。前两章可在安全休息室的真实募捐箱捐款；第三章不接受临时补捐。已有捐款免的是“欠捐狂暴惩罚”，不是免疫所有伤害。Rest仍完全服从pure-shop给出的offer.canBuy/canHack等字段，不在React重算交易资格或偷偷改变捐款值。
5. **第三章操作说明**：GPU热区按节拍预警/发热；动态K线实际载人到隐藏奖励房，不是背景装饰。凝视石化要求玩家在Boss前方激光带内且面向Boss；背对或身后能避开凝视，但不是免其他攻击。
6. **朝向和Q不误导**：A/D改变角色面向；鼠标瞄准只改变射击方向，不会转身。Q须就绪且有两秒真实历史，可解除石化并沿已有轨迹回溯；绕后需要相应历史，不会自动传送到Boss身后。逐帧朝向提示由Lead的引擎renderer实现，React没有重复维护该状态。
7. **既有生命周期保留**：cloud恢复仍先回menu并暂停旧世界；rest仍须显式继续或返回终端；资源load-error保留刷新入口。死亡仍保留原 [ScoreSubmission](<../src/pages/GamePage/components/ScoreSubmission.tsx>)，所有chapter-clear都不渲染成绩上传。

## 测试规格迁移，不是放宽断言

[chapter-ui 测试](<../tests/frontend/chapter-ui.test.ts>)从旧26例扩为 **43例**。旧“第三章未开放”案例按正式新规格迁到第四/五章，不保留失效的两章假设，也没有删除对应保护：

- 1/2/3各自验证所有受支持checkpoint；4/5均拒绝且数据不变；非法编码继续覆盖。
- 清关1→2和2→3分别覆盖donated=false/true：检查传给start的对象严格等于`screen.save`、不是旧`session.save`、不调用newRun、完整JSON前后不变。
- 清关3→4检查原Boss/实际章节、第四章入口保存、无进入/新建局按钮、无ScoreSubmission、默认返回终端、snapshot未改。
- 额外拒绝非连续的清关快照，不把“下一章”变成重开同章。
- 三章死亡均仍能恢复原存活checkpoint而非hp=0的死亡结果，并保留成绩上传。
- 菜单标题、注册器数量、路径当前卡、4/5未开放、Guide实际Boss/机制均有严格断言。
- 清关2/3时Guide/目标必须描述已击败世界；募捐记录必须采用事件snapshot，不能误用带相反donated值的旧存档。
- 第三章休息室两个donated状态都验证不可补捐说明；禁用断言精确绑定到募捐按钮，不靠其他禁用控件冒充通过。该用例验证React服从快照，不代替pure-shop的资格测试。
- 原rest不可随意关闭、显式继续/返回菜单、load-error刷新等边界仍保留。

测试只替换GameCanvas与状态hook以便Node静态渲染，不伪造章节注册器或生产UI分支；没有运行引擎/浏览器，也不是第三章正常输入通关证明。

## 实际执行结果

```bash
npm test -- tests/frontend/chapter-ui.test.ts
npx --no-install eslint src/pages/GamePage/hooks/useGameSession.ts \
  src/pages/GamePage/components/RunOverlay.tsx \
  src/pages/GamePage/components/MissionConsole.tsx \
  src/pages/GamePage/components/GamePanels.tsx \
  src/pages/GamePage/components/RestRoomPanel.tsx \
  src/pages/GamePage/index.tsx tests/frontend/chapter-ui.test.ts
```

2026-10-28 01:08:30（Asia/Shanghai）：job `bash-a4338418d4cc4829`已收集 **exit0，43/43测试通过，指定文件lint通过**。新增import全部实际使用。范围搜索未发现旧的“第三章未开放”“可玩范围第一、二章”“CHAPTERS 01–02”等React硬编码。

另执行`npm run typecheck`，job `bash-7bd85e6b3639428d`返回exit2。当时仅其他owner正在整合的中间态，没有本任务UI路径错误：

- [ChapterDecor](<../src/pages/GamePage/game/systems/ChapterDecor.ts>)：drawFurnaceDecor暂未使用；
- [shop](<../src/pages/GamePage/game/systems/shop.ts>)：createFurnace暂未使用；
- [simulation](<../src/pages/GamePage/game/systems/simulation.ts>)：Boss构造当时尚缺facing；
- [WorldRenderer](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)：BulletKind配色尚缺gpu/causal。

结果已分别发给Lead与gameplay-engineer，未越界修复，也未把整个项目typecheck虚称通过。完整构建/浏览器验收由Lead在engine稳定窗口统一执行。

## 工具参数冲突与交接

最初工具接口要求sandbox_permissions字段，与本轮“不得设置”要求冲突，前几次成功调用仍携带同一现有值。发现后已主动报告、暂停写入和执行检查，没有把它伪称审核拒绝，也没有换执行通路或写手绕过。Lead确认接口问题并向用户询问；用户明确选择允许冗余填写**同一现有danger-full-access**值后，才恢复原scope。没有申请权限提升或扩大范围；若出现明确审核拒绝仍应停止该操作并报告。

本任务生产source现冻结交接，等待Lead实际整合反馈后才做获授权修正。第四/第五章、最终镜像/三结局仍未开放；不能以43个静态UI用例冒称第三章实战、全量GDD或美术已验收。
