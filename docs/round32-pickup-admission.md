# R32：原生提示条对齐与三类拾取正式准入

**当前单完整133/133通过，EXIT0；零跳过、零flaky、零重试。** 本轮正式准入Token/Compute/Heal三类静态拾取包，不代表全量GDD或项目发布完成。

## 两条首红如何闭环

### 升降台不是WebGL恢复损坏

[原PNG逐像素差异](<../artifacts/verification/r32-original-lift-pixel-difference.json>)证明：R31暂停前和真GL暂停恢复各1080/1080；继续运行原帧420,194只有960/1080。
缺的恰是localY3整行120px，全部为保护提示色0x90c6b0：3px规则条使用浮点坐标，皮肤使用整数坐标，提示条盖到了第四行。
唯一生产修改是[WorldRenderer](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)通过[platformRuleCue](<../src/pages/GamePage/game/systems/platformRuleCue.ts>)将native提示位置对齐皮肤网格。
保原颜色/3px厚度、blockout浮点位置及Core碰撞，不改源图、观察器、完整120×12或.98门。[56例](<../tests/rendering/platformRuleCue.test.ts>)旧行为24红/32绿，修后56绿；原炉房5在专项与完整运行均通过。

### 用真实跳跃离开来弹路径，不延长准备追绿

[拾取控制](<../tests/e2e/pickup-navigation.ts>)把原同一个A200退步阶段改为普通A+Space350，退上forest平台；[浏览器用例](<../tests/e2e/pickup-art.spec.ts>)新增真实native feet258及x1180..1325确认，不把按键时长当位置证明。
原最多4×250ms可见/HP稳定准备不加长，随后原450ms验收仍只有一次，所有帧保留。原18/12动作预算、真实收益≤28、不进rest、单次R、源/颜色/墨迹/无遮挡/坏资源保档门均不降。
[AST审计](<../artifacts/verification/r32-assertion-preservation-vs-r31.json>)原94个matcher及参数全保留、当前97；[更早83个](<../artifacts/verification/r32-assertion-preservation-vs-r30.json>)也全保留。这只证明断言保留，不宣称控制流相同。

## 回归与开发过程边界

[独立时序/实控测试](<../tests/rendering/pickupNavigationTiming.test.ts>)新增192种起点/渲染/恢复/解码组合，实际controller与combat下，原退步不能避开代表性地面来弹，跳跃方案通过；不宣称覆盖所有敌人相位。
初稿误用13px半高，实际PLAYER_HEIGHT为22；已用生产常量修正单位模型的初始落地和脚部测量，目标仍258，并对旧/新方案重跑。R31原单位fixture的初始307也纠正为真实落地309，未改Core高度。
错误模型的red01/new01保留并明确淘汰；正确red02为192红/496绿，正确新模型688绿。[修正记录](<../artifacts/verification/r32-retreat-model-correction.json>)。
所有原首红、trace与PNG保留。复核脚本曾把原字段maximum.ratio误写maximumRatio，立即停止；按实际字段修正后检查，未改原数据/观察器或重跑浏览器。

## 本次实际执行

| 门 | 实际结果 |
|---|---|
| [完整unit02](<../artifacts/verification/r32-unit-all-02.log>) | 5138通过 / 73文件 / EXIT0，含源33、适配器145、导航688、提示56 |
| [原拾取专项10](<../artifacts/verification/r32-pickup-scoped-01-metrics.json>) | 10/10 / 102.971s / EXIT0 / 零跳过和重试 |
| [原炉房专项5](<../artifacts/verification/r32-furnace-scoped-01-metrics.json>) | 5/5 / 25.694s / EXIT0 / 零跳过和重试 |
| [新隔离PG后端](<../artifacts/verification/r32-backend-tests-metrics.json>) | 23/23 / 16.886s / EXIT0 / 零跳过 |
| [当前单完整133](<../artifacts/verification/r32-complete-result-summary.json>) | **133/133 / CLI1183.644s / EXIT0 / 零skip、flaky、retry** |
| 准入记录写完后的[type03](<../artifacts/verification/r32-types-03.log>)/[lint03](<../artifacts/verification/r32-lint-03.log>)/[unit03](<../artifacts/verification/r32-unit-all-03.log>)/[build03](<../artifacts/verification/r32-build-03.log>) | 均EXIT0；unit仍5138/73 |

整轮133与R31逐项名称相同，每例仅一个结果，无grep/shard/project；Factory/Sydney、Loom、云存档及休息室四视口在同一次完整运行通过，不借专项拼绿。
[六张当前整轮原生实看与指标](<../artifacts/verification/r32-full-native-review.json>)：治疗60→88，11/18动作，x1291/feet258，正式12帧466.6ms全部无遮挡、最大残留0，并保livecompute。专项为13帧，同为466.6ms，不能混用。
HP来自同批真实DOM HUD，不声称HTML HUD画在native PNG里；视觉检查为Lead/reused上下文，不冒称新独立盲测或人工手感评估。

## 准入、资源与保留范围

- [正式拾取清单](<../assets/pickup-manifest.json>)、[生成记录](<../assets/pickup-items-generation.json>)与[PixelSpec](<../assets/pickup-items-pixelspec.md>)现已同步；productionReady仅指本包，runtimeAdmissionPending=false，projectReleaseReady/fullGddComplete仍false。
- 原ASE/PNG/atlas三SHA完全不变；无新Aseprite绘制/参考图/生图或导入，不重画蘑菇。原validate与非fresh审查来源保留，不伪称本轮重新执行Aseprite验证。
- [431已知路径冻结](<../artifacts/verification/r32-source-freeze-02.json>)在整轮和清理后零漂移。之后只改三当前文档、拾取准入元数据/PixelSpec，并新增报告与正式清单；运行源码/测试/图像不再变，不声称全仓库clean。
- [清理](<../artifacts/verification/r32-services-cleanup.json>)：Main22036退出130，PG21540退出0且control为shut down；进程组消失，8081/55439释放，新数据保留。原Vite3756/8080 HTTP200与用户54B pointer字节/inode/mtime不动。
- [78历史图恢复](<../artifacts/verification/r32-current-browser-01-restoration.json>)保字节与mtime，实际新图单独归档。唯一full及所有短任务均实际结束，无重跑替换。
- R27休息室、R28完整度分隔、R29工厂HUD与R30反馈修订保留；Phaser4.0.0/Core/v1/API不改。无新委派、安装升级发布、模型或其他preset配置修改；CLIProxy API/Max仍未核验。本轮没有sandbox_permissions字段调用。

## 下一最小工作与仍未完成的目标

优先把HumanRater工作台/NPC状态接回场景与已优化休息室，保紧凑布局、真实交易/奖励和冻结语义。只读调查发现现有DTO没有结构化入站评级；不能解析本地化message，也不能用修复后的HP重算旧评级；刷新后的中性已结算状态不能伪造历史赞许。
其后仍有主角专用攻击、终局完整演出、章别声景/人工试听、更多种子支路、局外成长、新局连续五章与三结局、改键/手柄/触控、减少动态效果、低端性能/安全等门，详见[完整开发计划](<development-plan.md>)。本轮技术全绿不是项目最终Definition of Done。
