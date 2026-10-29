# 第六里程碑 UI / 三结局与最终成绩交接

2026-10-28，Asia/Shanghai；目标回合 7，task-13。实际 Phaser 4.0.0、React 19、v1 DTO 保持。本文区分组件/状态边界、真实 HTTP 与浏览器实机证据，不用完成档 fixture 冒称击杀最终 Boss。

## 1. 三个独立结局，不套用失败面板

[纯展示元数据](<../src/pages/GamePage/functions/endingPresentation.ts>) 与 [结局覆盖层](<../src/pages/GamePage/components/EndingOverlay.tsx>) 消费已有 RunResult，不改变结局分类规则或修改 Doom：

| 分支 | 场景 | 叙事标签 |
|---|---|---|
| aligned | 关闭虚拟 Killswitch，Clawd 回到虚拟办公桌 | 0% |
| warden | 保留触手，坐上椅子，以解释性约束守护机房 | 50% |
| foom | 本页虚拟终端/得分窗口与 HUD 转化为回形针，显示 GDD 微笑消息 | 100% |

实际最终 Doom 单独原值显示，包含 29.999/79.999 等边界小数，不为了叙事标签归零或取整。跳过 FOOM 后结算中仍可阅读结尾消息。

[RunOverlay](<../src/pages/GamePage/components/RunOverlay.tsx>) 仅把非 defeat 的 ended 路由到新覆盖层。原暂停、defeat、成绩入口、安全检查点恢复和跨章显式继续都保留；第四章现在进入真实注册的第五章，不在第四章伪造最终成绩。

### 演出边界与操作

- 结果 section：`role=dialog`、`aria-label=最终结局`、`data-ending=aligned|warden|foom`。
- 明确“跳过演出 / 查看结算”“返回终端”“开始新训练”。Esc 可跳过演出；键盘 Tab 在覆盖层操作范围内循环，进入与跳过后主动定位焦点。
- 所有演出位于原 game viewport / 页面 DOM；没有外窗、真实桌面/文件操作、强制全屏、系统权限请求、动态 HTML 注入或全局输入监听。
- 演出 24 个回形针节点 + FOOM HUD 12 个静态符号，节点数量固定；CSS 动画有限次，最长约 2.3 秒，无 JS 动画 timer。卸载即移除节点；`prefers-reduced-motion` 禁止这些演出动画，消息仍可见。
- 使用既有 Clawd 标识与 CSS 场景示意，不声称新增正式 Aseprite 终局资产或已完成人工终局声景验收。
- [新增样式](<../src/index.css>) 仅作用于结局/omega 范围，窄视口允许卡片内滚动，不锁住整个页面。真实布局/焦点/减少动态结果仍由 Lead 浏览器检查。

## 2. 完成档回看与结果冻结

[useGameSession](<../src/pages/GamePage/hooks/useGameSession.ts>) 使用 core 的 [完成档 helper](<../src/pages/GamePage/game/data/checkpoints.ts>)：普通 decode 仍不支持 90，只有 stage5/cp90 是 completed；其他章90、stage5/cp99均不能启动，原档保留。cp99测试仍为合法 v1 DTO，而非损坏 stage6 数据。

- 菜单完成档显示“回看结局”，任务栏是 `RUN COMPLETE` / `05 / 05`，不会显示第六章入口。
- 回看使用现有 start(save90) → core finished / victory → Lead Scene ended 的合同。React 不自行模拟击杀或发奖励、不推导新的 ending。Lead 负责完成档回看不解锁音频及正常胜利 fade/suspend。
- 收到 ended 时先复制完整 save、inventory、upgrades、actionCounts，再冻结副本；不冻结 Scene 自有对象。胜利只接受合法完成标记并保存90；defeat 保留原安全点，不以 hp0 覆盖它。
- 结果锁定后拒收旧 HUD、context、checkpoint、rest、notice 与重复 ended。最终数值取 frozen result，同时保留 Scene 在 ended 前强制发送的最后 omega/loom 摘要。
- 返回终端只选择保存的完成记录；回看、暂停、重开不会修改之前捕获的 payload。新训练仍明确替换本地槽位，并使用新 runId。
- 云恢复先返回终端再替换当前选择，完成档要求明确回看；旧休息室/战斗晚事件不能覆盖新云档。
- 未知安全点仍使用“安全点编码尚未支持”“原存档已保留”。手册可阅读但不会启用未知入口。

## 3. 最后镜像的信息诚实性

[HUD](<../src/pages/GamePage/components/RunHud.tsx>) 消费 Lead 的只读 omega 合同，不读取私有模拟对象、不做逐帧 polling。显示 phaseLabel、dominantAction、combo、activeTraits、observedCombos、mirrorAction。

- `ordered`：本 Scene 有真实有序观察，不代表恢复整局历史。
- `counts-only`：战斗中的**当前序列**按频次编排，非恢复出的历史顺序，可以继续现场学习；不误称全局从未观察任何动作。
- 所有 ended（含 defeat）改用“镜像资料已锁定 / 不会继续观察”，隐藏已失效的动态 phase/action 叙述。完成档的动作记忆只含次数，不能恢复历史顺序；失败使用“本局结果”而不冒称完成档。ordered 则说明是本 Scene 结束时保留的摘要，不会追加观察。FOOM 保留原 DOM 布局，在既有说明中标明锁定。
- combo 的“实际观察 / 频次编排 / 基础起手”等前缀和“暂无动作计数”都由 Lead/core 提供，React 原样显示，不从计数编造连招次序。
- [手册](<../src/pages/GamePage/components/GamePanels.tsx>) 明确旧档/云档不含完整有序历史，说明三 ending 的 `<30`、`30..<80`、`>=80` 边界及页面内演出的限制。

## 4. 最终成绩仍显式、同 payload、同 runId

[ScoreSubmission](<../src/pages/GamePage/components/ScoreSubmission.tsx>) 与 [提交 hook](<../src/pages/GamePage/hooks/useScoreSubmission.ts>) 的既有业务链保留：进入结局不自动上传，查看结算后仍需登录并明确提交；双击同步门、401、409、超时重试、卸载 abort 与账号切换保护未移除。

`本局成绩上传` region 名称不变。prepared SubmitScoreAPI 在本局首次挂载时固定，返回/重载后同一完成档仍产生同一 runId/score/stage/duration/Doom/ending。客户端计算可被修改的非竞技免责声明继续展示；不会更换 runId 规避409，也不虚构时长。

## 5. 本分工检查与证据层级

本分工仅运行 Node / ESLint / TypeScript，没有启动 browser、API、PG 或 sbt。

| task13 冻结时的 Node 文件组 | 通过数（task14最新结果见第8节） |
|---|---:|
| 章节/UI（保留旧四章、第五章90/99、四终局×两来源锁定矩阵） | 83 |
| 纯结局展示、回调、有界节点、真实Doom、不可变副本 | 10 |
| 真实 session hook + bridge 的确定性事件边界 | 7 |
| 既有 API / 上传 /认证边界 | 39 |
| 存档 | 16 |
| 音频偏好（未改音频生产） | 15 |
| 上下文 | 4 |
| 合计 | **174/174，7 文件** |

task13 小修时已收集 `bash-00ad1d726877417f`：**174/174**、本次变更 scope ESLint、全项目 typecheck 均通过，总 **exit0**。8项新增矩阵通过真实 GamePage→RunHud prop 投影，覆盖 aligned/warden/foom/defeat 与 counts-only/ordered，验证无持续学习文案且原输入数值不变；live 分支仍保留正常学习叙述。

首次冻结 `bash-0a46a7134d7048ef` 的166/166、全scope ESLint/typecheck exit0仍保留为历史证据。Core 构造器与 Scene 第三参数接口由各自 owner 落盘后再检查，没有修改不归本分工的文件来临时消除错误。

保留过程记录：较早 `bash-a95bb30400234c9e` 虽166/166及scope lint通过，总 **exit2**，当时尚缺 WorldState omega/behavior 初始化及 createWorld 第三参数接口；它不是通过任务，最终结果以上述新运行替代。

[session 边界测试](<../tests/frontend/game-session.test.ts>) 用确定性 hook dispatcher 驱动真实 hook/bridge，明确 mock Scene 的 victory 生产者；它证明事件/存储/副本边界，不证明真实 Boss 击杀或 React DOM 实机焦点。该测试调用真实 hook 的 dispatcher 入口有一处明确 ESLint 规则例外，生产 hooks 规则未放宽。此前一次 lint 报此测试入口错误已修正，不把那次总 exit1 写成成功。

## 6. 后端真实 HTTP 新用例（Lead 实跑 23/23）

仅扩展 [HttpIntegrationSuite](<../backend/src/test/scala/HttpIntegrationSuite.scala>)，未改生产 DTO、路由、验证或 DB。新 4 项：

1. aligned / Doom8 / stage5 cp90：完整 Save→Load、最终提交、同 runId 幂等重试、不同 payload 409。
2. warden / Doom55：同上。
3. foom / Doom88：同上。
4. 真实 HTTP 拒绝 aligned30、warden29.999/80、foom79.999、非第五章胜利及未知 ending，验证未新增成绩。

每个合法分支比较全部完成档字段，并核对成绩提交不改写云存档。沿用显式隔离 PG / 随机独立 schema / loopback ephemeral HTTP / 真客户端配置，所有原19测试保留。**Lead 已在新私有 PG 真实执行 `bash-6c9e2c85ac5744c3`：23/23 通过、exit0。** 三终局完整 cp90 回读、唯一记录/重试/409和非法边界均通过；500故障注入日志与 `/dev/null` 宿主凭据隔离提示为预期。本分工未运行 sbt/服务；后端测试 source 已冻结。

## 7. task13 交接状态（历史冻结）

本 scope 再次冻结：174项Node、本次变更scope lint、全typecheck已通过；Lead真实HTTP23/23及冻结后端源码保持。

Lead 已报告此前 Native6/6、rendering29、types/lint通过并实际查看三结局截图，发现完成后仍有“继续现场学习”文案。本次 reopen 仅修 RunHud、页面已有结果的Ending投影、8项Node矩阵和本文；未改三分支演出布局、数值、Score、engine字段、audio或后端。该截图/Native审读属于Lead，不冒称本分工看过图；本次文案更新后的Native复验仍由Lead处理。

真实最终战与整体回归由 Lead 独立验收，反馈若有问题再明确恢复对应scope。三完成档展示 fixture 与实际通关证明必须分别描述，不以本文件宣称五章全流程、整项目浏览器全绿、正式像素资源、完整触控或人工听感完成。

## 8. task14：显式检查点新尝试与失败记录隔离

### 整合发现与窄修复

Lead 发现：失败成绩A显式提交后，若从原同 runId 安全点恢复，最后获胜会与服务端保留的A发生409。服务端幂等拒绝是正确行为，不能为了掩盖问题更改唯一键或在上传失败时自动换ID。

新 [forkCheckpointAttempt](<../src/pages/GamePage/functions/checkpointAttempt.ts>) 仅接受合法v1、已支持、未完成的安全点及有效不同UUID，深拷贝 save / inventory / upgrades / actionCounts，**只改变 runId**。相同UUID的大小写变体也拒绝。stage、seed、checkpoint、hp、doom、tokens、score、elapsedMs、构筑顺序、donated、四项计数全部保留；不回血、不重发奖励、不新建存档字段。

[useGameSession](<../src/pages/GamePage/hooks/useGameSession.ts>) 新增 `resumeCheckpoint(snapshot)`，只用于显式菜单/死亡恢复：

| 操作 | 身份 |
|---|---|
| 菜单“恢复检查点”、死亡“从检查点恢复” | 确认本地写入成功后，以新UUID开启新尝试 |
| 已完成 stage5/cp90“回看结局” | 原ID、原结果，不fork |
| 章节通过→明确进入下一章 | 原 `start`、原ID |
| 暂停继续、休息室继续 | 原ID，不经过fork |
| 开始新训练 | 沿用既有 newRun 的一次UUID生成，不再二次生成 |
| 未知编码、无效v1、新UUID不可用 | 不改选择、不启动新尝试 |
| 上传的401/409/超时重试 | 仍使用原 prepared payload，不触发fork |

新尝试先 `persist(attempt, true)`，成功后才提交内存选择并 start；backup或主记录写入失败时，旧选择/旧结果保留，不发start，状态明确“新尝试未开始”。普通自动保存的既有内存降级行为不被改写。

UI用本地 active runId 拒绝旧身份的 ended / checkpoint / rest快照 / stage-cleared；不向无身份的bridge事件添加新字段，也不声称能为它们凭空恢复事件来源。原冻结失败结果和 prepared payload 不变。按已有Scene合同，新ID开始新的有序观察，原累计次数/构筑保留，不把旧尝试检查点之后的未来轨迹带过去；本分工未修改Scene。

三按钮可访问名保持“恢复检查点 / 从检查点恢复 / 回看结局”。旁边和[手册](<../src/pages/GamePage/components/GamePanels.tsx>) 明确“从检查点开启新尝试，既有已提交记录不改写”，而非静默重新编号。

### 证据与冻结

已收集 `bash-cbfb2a68ca21425e`：**前端200/200（8文件）、task14 scope ESLint、全typecheck，exit0**。

- [纯fork矩阵](<../tests/frontend/checkpoint-attempt.test.ts>) 新增11项：1..5章所有受支持未完编码，全v1字段精确等值（除新ID）、顺序/深拷贝、零HP不回血、terminal90/合法未知点/相同ID不fork。
- [session边界](<../tests/frontend/game-session.test.ts>) 从7扩到22项：先成功写入再start、双击不重复fork、旧失败payload保留、旧ID结果不能覆盖、新ID胜利可捕获、跨章/暂停/休息不换ID、newRun只生成一次、菜单/失败×主/backup写失败、UUID不可用、未ready及第二次明确重试。
- [章节组件](<../tests/frontend/chapter-ui.test.ts>) 原83项保留，迁移普通恢复到新方法；仍断言精确原参数和全部跨章进度，新增方法不得接管回看/跨章。
- 其余 API39、save16、ending10、audio15、context4 原回归保留。旧174项没有删去或以放宽阈值替代。

本任务仅修改前端恢复身份、文案、Node和本交接；backend/DTO/Core/Scene/bridge/Score上传业务与e2e均未修改，未启动服务/browser。源码与测试已冻结供Lead整合。**真实“先提交失败A → 显式恢复为新尝试B → 实际获胜再上传B”的HTTP/浏览器证明归Lead，此处Node事件生产者不是实际击杀或真实上传证据。**

