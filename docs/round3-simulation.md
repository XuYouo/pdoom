# 第三轮：第二章纯模拟与存档合同

## 范围与分工

本任务保持安装的Phaser 4.0.0，不改引擎、配置、GameSaveData schema、后端或美术。gameplay-engineer负责章节data/model、纯模拟和tests/game；Lead负责Renderer、WorldScene、InputSystem、bridge、镜头及浏览器验收。combat单文件因工具明确拒绝曾停止操作，随后由用户另行明确允许在现有权限修改，Lead接手；没有重试拒绝或换工具绕过。

已读取[GDD第二章](../GAME_DESIGN_GDD.md)和[架构附录E](../架构与开发规范参考.md)：浏览器内固定tick模拟、React低频事件、无逐帧网络。

## 小字段合同

[model.ts](../src/pages/GamePage/game/entities/model.ts)定义：

- `world.chapter: ChapterDefinition`：只读章节元数据、几何、检查点与Boss。
- `world.factory: FactoryState | null`：`seaY/riseSpeed/probes/bubbles/nextProbeId/nextBubbleId/nextReplicateAt`。第一章为null。
- `Probe`：`id/x/y/hp/targetPlatformId/phase/phaseUntil`，phase为seek/tell/consume。
- `PuaBubble`：`id/x/y/hp/expiresAt/text`。绑定中的气泡忽略expiresAt，绝不靠计时解除定身。
- `player.rootedBy: number | null`：绑定气泡id。
- `boss.kind/name`区分gato与sydney；`BulletKind`增加dialogue/knife。
- 碰撞与渲染共用`PROBE_RADIUS=11`、`BUBBLE_RADIUS=17`；工厂弹丸命中采用真实圆形线段扫掠。

[chapters.ts](../src/pages/GamePage/game/data/chapters.ts)提供`getChapter(stage)`与`isChapterPlayable(stage)`。只有1/2注册；其它stage返回undefined。旧CHAPTER、PLATFORMS等章1导出保持兼容；共享物理常量移至[tuning.ts](../src/pages/GamePage/game/data/tuning.ts)，章1仍重导出TUNING。

`ChapterDefinition`字段为stage/name/english/axis/width/height/floor/arena/checkpoints/platforms/enemies/pickups/signs/boss。arena为x/y/w/h/trigger；checkpoint为id/x/y/trigger。水平进度比较x>=trigger，垂直比较y<=trigger；永远先decodeCheckpoint，不裸比较11/21等编码大小。

## 可达路线与危害

[chapterTwo.ts](../src/pages/GamePage/game/data/chapterTwo.ts)：640×2040，底部平台y1840，顶层竞技场地板y300。每阶55px，在现有jumpSpeed440/riseGravity1180（理论约82px，离散实测略低）的可达范围内。左右平台150..330、310..490有20px重叠，形成清晰安全竖井；侧路平台30..130、505..605提供算力/风险空间。

- checkpoint0：x310/y1829；checkpoint1：x390/y1279；checkpoint2：x390/y729。
- arena为640×360，最终入场门槛为`300 - PLAYER_HEIGHT/2 = 289`；Sydney HP420。Lead从真实截图发现旧y325门槛过早锁镜头，已增加短跳回归修复。
- 主路与安全点标记protected，仅阻止探针吞噬，不防回形针海。
- 海以52px/s随模拟dt上涨；玩家身体触及立即死亡，忽略普通无敌、冲刺及Q。已淹没奖励、子弹、敌人、探针与平台被清除。
- 竞技场海面限于y380，位于地板下80px，避免Boss定身造成必死或侵蚀唯一地板。
- 进入安全点将海规范化为spawn.y+165；载入检查点使用同一规范，不依赖无法持久保存的上一实例时间。休息室后续所有tick返回同一WorldState，海/探针/Boss/技能计时不动。
- 初始三只探针分布于不同高度；只在可见邻近范围行动。存活探针每6.2秒最多复制一次，总数<=6，全灭后不凭空刷波。
- 吞侧路有1.8秒tell、0.5秒consume；关键路径受保护。击杀探针可取消其平台威胁。

## Sydney差异化机制

[sydney.ts](../src/pages/GamePage/game/systems/sydney.ts)：

1. phase1对话框扇形；
2. phase2从上方落下的颜文字飞刀，交替留空通道；
3. phase3对话框和飞刀组合。

各阶段均有明确tell/recover，交替攻击节拍会绑定PUA气泡。气泡24HP，固定在玩家近身同高度；玩家靠墙时转向场内，键盘J无需鼠标也可射中。定身限制移动、跳跃、冲刺、Q，但允许射击/E；重力仍正常。气泡跟随因重力落地的玩家，防止失去命中高度。

绑定气泡**必须被真实有伤子弹击碎**才解控，过期时间只清理孤立气泡。Lisp无伤括号不伤气泡/探针，不触发Gato反射或核心击杀。死亡/章清理统一移除控制。Sydney不会反射Gato挡板弹、不会触发Gato机械臂冲击波。

## 不可变性与保存

[simulation.ts](../src/pages/GamePage/game/systems/simulation.ts)在每个playing tick开始深拷贝所有可变嵌套集合：save数组/计数、player.immunity、bullets/enemies/pickups/history/rewind.path、factory.probes/bubbles、collapseAt/shocks。章节定义只读共享，子系统只修改已分离的新draft。休息、死亡、清关、unavailable不推进。

存档schema仍为1。物理安全点0/1/2以及打开/已劫持的11/12/21/22均按当前stage解释；清除已通过区域按章轴方向比较。词条、升级、runId、donated、动作计数与总耗时跨章保留。

- Gato结束：先保存stage2/cp0，再stage-cleared(stage1)。
- Sydney结束：先保存stage3/cp0，再stage-cleared(stage2)。
- stage3尚未实现，不能静默降级成章1或伪造最终结局。
- 同帧死亡与击杀仍以死亡为先。

## 测试与诚实边界

新增[机制测试](../tests/game/chapterTwo.test.ts)与[正常输入通关测试](../tests/game/factoryPlaythrough.test.ts)。机制测试可构造临界状态；通关测试从合法stage2新局起点出发，只发送FrameInput和显式rest-continue，不改血、不传送、不直接扣Boss血、不购买隐藏增益。Bot会等待每阶段实际攻击并优先瞄准可见气泡，确保机制被经历，不只瞬杀跳阶段。

gameplay-engineer于2026-10-27交接、Lead镜头修复前执行：`npm run typecheck`、`npm test -- tests/game`及本任务data/model/systems/tests范围ESLint，组合命令退出码0。以下84/84和29,332ms是交接时的历史快照，最终以文末Lead整合结果为准。

- 11个game测试文件，**84/84通过**；旧章1正常输入通关仍通过。
- 第二章新增15个机制测试和1个正常输入全程通关测试。
- 正常输入实测：总模拟时间29,332ms，13,832ms进入竞技场，1762帧（含两次rest-continue），最终84HP；经历3次PUA绑定、42次射击、2次Q。
- 两个休息室均实际到达；Sydney三个phase都观察到真实attack后才输出，最终保存stage3/cp0，DTO校验通过。
- 上升过程最小海面到玩家脚部距离153px；最短初始等待余量约153/52≈2.94秒。此为脚本控制器的可达性/安全间距证据，不代替玩家难度或视觉体验评估。
- 另有高海拔实弹击杀探针只奖励一次、Lisp不能伤探针/气泡、两侧边缘无鼠标J解控、root不靠过期解除、全灭不再复制、深冻结旧状态不变等断言。

gameplay-engineer没有运行浏览器或启动服务器；浏览器、镜头和美术视觉质量由Lead分别验证。第三至第五章、最终结局仍未实现。

## Lead最终整合补记

脚部入场修复后，新[短跳回归](<../tests/game/arenaEntry.test.ts>)由红转绿。全项目最终**175/175单测（含85个游戏用例）、22/22真实浏览器、19/19本轮Scala/HTTP/PG**通过；类型、lint、build、audit0与diff check通过。

最终正常输入指标更新为：**29,915ms总模拟时间、14,266ms入场、1797帧（含两次rest-continue）**；仍为84HP、3次绑定、42次射击、2次Q、上升最小海面间距153px。已实际查看修后角色站位和控制泡消失截图，浏览器同时扫描真实PNG防止再次在y355入口平台上假通过。完整过程、命令与限制见[整合验收](<round3-verification.md>)。
