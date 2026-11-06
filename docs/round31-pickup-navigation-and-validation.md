# R31：拾取反馈导航与当前完整验收

**最新单完整133：131通过、2失败、EXIT1，不是全绿。** 本轮不签发拾取准入，不把专项与旧完整运行拼成成功。

## 变更及未变更边界

- 从[R30后文档426已知路径](<../artifacts/verification/r30-post-doc-verification.json>)零漂移开始，核实实装Phaser4.0.0。
- 只增加[有界拾取导航](<../tests/e2e/pickup-navigation.ts>)及[独立回归](<../tests/rendering/pickupNavigationTiming.test.ts>)，接入[原10项浏览器测试](<../tests/e2e/pickup-art.spec.ts>)。
- [原像素oracle](<../tests/e2e/pickup-pixels.ts>)、[Factory导航](<../tests/e2e/factory-navigation.ts>)、生产/Core/素材/v1/API不改；R27休息室、R28完整度分隔、R29工厂HUD及R30修订保留。
- 原固定治疗D130ms并未保证实际收集：重读未改写的原PNG得x1356/feet320/HP60，heal仍完整。现在每次输入后取真实暂停最终帧，最多6个<=130ms普通脉冲，全部计原18步。
- Loom单次解析纠偏有意识改为最多8次有界实测纠正（含必要中性制动），每次按键仍计原12步；目标仍旧槽+50且误差<=4，R仍一次。
- 只使用普通输入、真实rAF确认与真实canvas采集；不写运行中HP/位置/clock、不伪造PNG、不换原fixture、不增加180秒测试超时。
- [AST审计](<../artifacts/verification/r31-assertion-preservation-02.json>)确认原83个matcher与参数全部保留，当前94个；这是断言表面保留，不冒称控制流相同。

## 时序回归与开发期首红

初版unit误用不存在的world.now，typecheck抓到。clock-red-01/clock-01保留但模型无效，不能作为时钟证据。
改用有限now与elapsedMs后，[正确旧策略](<../artifacts/verification/r31-pickup-clock-red-02.log>)为116失败/172通过，正确新策略288通过；再扩到480种时序/起点加9个拒绝边界、7个恢复边界，共496。
恢复fixture曾误把it.each裸数组当单一rows，type03/clock04/unit02失败保留，只修测试参数包装。当前完整单元4890/72文件通过。

首次真实原10为9/10：治疗已60→88、Loom通过；后来普通受伤至78使负控中的英雄闪烁，旧无遮挡门正确拒绝。
因此增加最多4×250ms准备，只看实际英雄可见与HP稳定，不读pickup残留；全部准备帧保存，随后仍只采一次原450ms验收窗口，不重采失败窗口。
修订专项实际10/10：治疗60→88，运动14<=18；Loom误差−8→4，2次反馈脉冲、全局5<=12。该次第一准备批就全可见HP88，**没有自然覆盖多次恢复等待**。
这项准备不能阻止后续新伤害；本次完整运行给出了反例，不能说已解决所有消失验证问题。

## 当前实际门与证据

| 检查 | 当前实际结果 |
|---|---|
| [type04](<../artifacts/verification/r31-types-04.log>) / [lint04](<../artifacts/verification/r31-lint-04.log>) / [build03](<../artifacts/verification/r31-build-03.log>) | EXIT0；大chunk等已有性能边界仍在 |
| [完整unit03](<../artifacts/verification/r31-unit-all-03.log>) | 4890通过 / 72文件，EXIT0 |
| [首轮原10](<../artifacts/verification/r31-pickup-scoped-01-metrics.json>) | 9通过1失败 / 113.680s / EXIT1 |
| [修订原10](<../artifacts/verification/r31-pickup-scoped-02-metrics.json>) | 10通过 / 105.811s / EXIT0；0skip/0flaky/retry0 |
| [新隔离PG后端](<../artifacts/verification/r31-backend-tests-metrics.json>) | 23/23、0skip、EXIT0 / 16.725s |
| [单完整133](<../artifacts/verification/r31-current-browser-01-execution.json>) / [逐项汇总](<../artifacts/verification/r31-complete-result-summary.json>) | 131通过2失败、0skip/0flaky/retry0、EXIT1 / CLI1127.213s |

完整运行每例只有一个结果，单worker，无grep/shard/project。原Factory/Sydney同7、Loom修复、cloud与四视口rest在这一次整轮内通过。拾取在完整运行内是9/10，不能借专项10/10抹掉首红。

## 当前两条未解决的完整首红

详见[原始指标/原图入口](<../artifacts/verification/r31-full-first-red-diagnosis.json>)，所有trace与raw均保留。

1. **治疗后的450ms消失窗口**：本轮也确实HP60→88且未进rest；第一250ms准备批英雄全可见/HP88。但正式12帧窗口最后2帧hero=null，无遮挡门失败。12帧HUD尚显示88，随后真实额外帧已78；不能把HUD更新滞后当成未受伤，也不能删末帧。所有残留最大ratio为0仍不足以绕过英雄无遮挡证据。
2. **Furnace恢复后重新运行的升降台**：暂停前与真GL暂停恢复都完整匹配120×12、1080ink、ratio1，位置421/219，PNG/HUD/save冻结断言已过；继续后350ms取到的实时帧lift匹配为null。Lead实看该原图，升降台仍可见；尚未确定是绘制遮挡、注册/取样还是其他原因，不能称WebGL恢复本身失败，更不能先降低.98门或重画资产。

Lead实际看过专项4张native640及两张完整首红原图。治疗数值来自同批真实DOM HUD，不是说原生PNG里画了HTML HUD。

## 资源、操作与准入

- [已测428已知源快照](<../artifacts/verification/r31-source-freeze-02.json>)在完整运行后零漂移，不声称全仓库清洁。
- [78历史图恢复](<../artifacts/verification/r31-current-browser-01-restoration.json>)保字节与mtime；实际新图另存本轮证据，不覆盖旧证明。
- [自有服务清理](<../artifacts/verification/r31-services-cleanup.json>)已完成：Main11532正常SIGINT退出130，PG10872退出0且control为shut down，进程组消失、8081/55439释放；新数据保留。原Vite3756/8080 HTTP200、用户pointer字节/inode/mtime不变。
- 未新委派、未改模型配置；CLIProxy API/Max路由仍未核验。未安装、升级、发布或动其他preset。
- **操作失误**：启动整轮的bash调用再次误带被禁止的sandbox_permissions字段，本轮1次。已如实记录，不称零违例；此后仅用现有Python会话处理文件/命令与清理。该次合法测试的真实红结果保留，没有另跑一轮替换。
- [拾取metadata](<../assets/pickup-items-generation.json>)继续productionReady=false/runtimeAdmissionPending=true；无新正式manifest。源与导出三份SHA不变，完整GDD与发布准备仍未完成。

## 下一最小工作

先针对两份真实首红建立可复现回归。C1需用普通游戏控制解决窗口内再受击的观察条件，保持完整450ms、收益、无遮挡及原预算；不能靠重采窗口或延长等待追绿。
Furnace先离线比较保留的原PNG与原source像素、核对真实输入/采集时序和绘制次序，必要时只改已证实的问题，不归罪恢复流程、不改匹配阈值。
修复后先当前同10与Furnace对应原例，再新隔离后端23和一次完整133。完整门过前不准入拾取、不新画下一包；NPC/专用攻击、终局演出、声景/试听、更多种子支路、局外成长、连续五章旅程、输入/可读性/性能/安全仍在后续清单。
