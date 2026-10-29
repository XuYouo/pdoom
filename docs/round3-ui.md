# 第三轮 React 章节 UI 适配

## 范围与契约

本记录对应 task-7。已重新读取 [GDD](<../GAME_DESIGN_GDD.md>) 的五章/Boss/上下文与商店章节、[架构文档](<architecture.md>)和当前 UI 源码；实际已安装 Phaser **4.0.0**，未升级引擎或修改配置。

修改严格限于获分配的六个 React/hook 文件、指定前端测试与本记录：

- [useGameSession](<../src/pages/GamePage/hooks/useGameSession.ts>)
- [RunOverlay](<../src/pages/GamePage/components/RunOverlay.tsx>)
- [MissionConsole](<../src/pages/GamePage/components/MissionConsole.tsx>)
- [GamePanels](<../src/pages/GamePage/components/GamePanels.tsx>)
- [RestRoomPanel](<../src/pages/GamePage/components/RestRoomPanel.tsx>)（只增加所属章节提示）
- [GamePage](<../src/pages/GamePage/index.tsx>)
- [chapter-ui 测试](<../tests/frontend/chapter-ui.test.ts>)

不改 ScoreSubmission、会话/API、后端、存档 v1、资产、根 CSS、renderer、bridge、纯游戏 systems、e2e 或包配置。本轮**没有启动任何服务器或浏览器**。

章节注册器由 gameplay-engineer 编写；已读取实际 [chapters](<../src/pages/GamePage/game/data/chapters.ts>) 与第二章数据，使用其 `getChapter(stage): ChapterDefinition | undefined` 和 `isChapterPlayable(stage)`，不复制可玩性注册表。当前仅1/2可玩，3+返回undefined。`name`、`english`、`axis`、`boss.name`是已确认的真实字段，没有虚构objective或桥接字段。

## 已改行为

1. **启动与恢复**：移除“stage>1就拒绝”的旧限制。仍先检查ready，再检查注册器与decodeCheckpoint；支持前两章的0/1/2/11/12/21/22安全点，未知编码和未开放章节明确拒绝且不重置原档。菜单/死亡恢复按钮使用同一个纯`canStartCheckpoint`判定。
2. **第一章清关**：以`screen.stage`显示刚结束的中文房间/Gato，出现明确的“进入第二章”。点击直接调用`session.start(screen.save)`，不是`session.save`的旧检查点，也不是createRun；完整快照的runId、inventory、upgrades、doom、donated、计数与时间均不由UI重建。
3. **第二章清关**：显示回形针无尽工厂/Sydney已经通过，第3章入口保留且尚未开放；没有第三章开始按钮，没有假最终结局，也没有ScoreSubmission。默认焦点为“返回终端”，避免把继续键误当成新建局。
4. **死亡**：第一、二章均可明确恢复合法的存活检查点；仍保留既有ScoreSubmission和新一轮训练，不把死亡结果当成恢复存档。
5. **显示章节**：纯`getDisplayedStage`在menu采用所选存档，playing/paused采用HUD，rest采用其snapshot，ended采用result，chapter-clear采用已击败的`screen.stage`。因此save已经前移到3时，冻结的第二章世界不会被标作第三章可玩。
6. **路径与目标**：章节卡不再固定01；前两章使用注册器名称/英文，3–5明确“未开放”，被保存的后续入口单独说明。清关目标与未开放存档不会继续显示旧Boss任务。
7. **指南**：第一章保留Gato横向战斗提示；第二章按实际数据说明垂直逃生、回形针海、探针、气泡解除控制，并提示回溯不免疫海水。第三章指南明确尚未开放，不冒充第一章。整体范围只宣称前两章测试版。
8. **既有边界不变**：rest仍必须显式继续或返回终端；关闭普通面板不自动resume。云恢复仍先回menu、暂停旧世界、persist所选档，随后明确选择恢复。load-failed仍保留原来的“刷新并重试”与检查点保留提示。上下文/商店交易不在UI中重新实现。

发现GameCanvas/InputSystem的第一章aria-label也有固定文本，但它们不在本任务scope，已通知Lead，由Lead处理，没有越界修改。

## 验证

### 已执行

```bash
npm test -- tests/frontend/chapter-ui.test.ts
npx --no-install eslint src/pages/GamePage/hooks/useGameSession.ts \
  src/pages/GamePage/components/RunOverlay.tsx \
  src/pages/GamePage/components/MissionConsole.tsx \
  src/pages/GamePage/components/GamePanels.tsx \
  src/pages/GamePage/components/RestRoomPanel.tsx \
  src/pages/GamePage/index.tsx tests/frontend/chapter-ui.test.ts
```

首次完成的job `bash-4085d58e0de0424b`：**26/26测试通过 + 指定文件lint通过，exit0**（23:05:49）。随后补充了更明确的第二章气泡/海水指南，并把死亡结果与恢复检查点分开，以防测试误把同一对象当成正确恢复。

**最终复验job `bash-4d8aa6efd4dd4ead`已收集exit0：26/26测试通过 + 指定文件lint通过**（23:10:50，测试47ms）。未因跨agent的全局类型中间态跳过自己的验证。限定范围的旧第一章可玩性文案/分支搜索无残留。

测试采用真实React组件的`renderToStaticMarkup`和纯判断/按钮回调。只替换GameCanvas和状态hook以避免在Node中启动Phaser，不替换章节注册器或UI分支。覆盖：

- 前两章全部受支持安全点、未开放3/4/5、非法编码；
- menu/playing/paused/rest/ended/clear的显示章节选择；
- 第一章进入第二章时严格验证传给start的是同一个screen.save对象、字段未被重写；
- 第二章清关没有可玩第三章、ScoreSubmission或新建局误触入口；
- 两章死亡均使用checkpoint而非hp=0的死亡结果，仍渲染既有成绩上传；
- 标题、章节路径、guide、rest章节提示、资源失败刷新分支。

### 整合中的类型检查

job `bash-919828358c7f413b`执行`npm run typecheck`返回exit2，均为gameplay正在适配的中间态，没有本任务UI路径错误：

- [controller](<../src/pages/GamePage/game/systems/controller.ts>)：CHAPTER_ONE/ChapterDefinition暂未使用、旧CHAPTER尚未替换；
- [simulation](<../src/pages/GamePage/game/systems/simulation.ts>)：completeChapter当时尚未导出，以及旧签名6参数与新调用7参数不一致。

这些错误已及时发给Lead和gameplay-engineer，没有越界修他们的文件，也不将全项目typecheck虚称通过。待Lead/纯systems稳定后统一整合检查。

## 交接与诚实边界

- 静态UI/纯分支测试不是浏览器视觉或完整第二章通关证明；本任务按委托未运行浏览器，E2E由Lead在稳定窗口统一执行。
- WorldScene、renderer、输入/相机、纯第二章机制由各自owner负责；本任务只消费已确认的章节/bridge契约。
- 后三章和最终结局仍未开放。没有因UI适配改变API、云存档schema、donated标记或成绩幂等规则。
