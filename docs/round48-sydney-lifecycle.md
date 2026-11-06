# R48：Sydney主机生命周期诊断

> 回合74–75：仅诊断代码；定向4/4，新单完整216为**214/2、EXIT1/2225.466s，未准入，正式仍R44**。两项Loom旧断言失败；不宣称旧Sydney关闭根因已修或全GDD完成。

## 改动范围

- [主机观察器](<../tests/e2e/browser-lifecycle-evidence.ts>)只订阅Playwright公共page close/crash、context close、browser disconnected，读取同步isClosed/isConnected；不访问World、不增加浏览器evaluate、输入、采样或重开页面。
- [Sydney用例](<../tests/e2e/sydney-art.spec.ts>)在原inspectBatch前后记录已有批数量与PNG字符串字符量；afterEach保存已有pageErrors/writes/loaded和主机事件。先停止监听再快照，避免把正常fixture teardown误判为运行中的关闭。
- 监听逐项卸载，单个off失败仍尝试剩余项并使测试失败；部分注册失败清理已安装监听。附件/清理双错保留cause，未改共用factory-navigation helper。
- [AST证明](<../artifacts/verification/r48-original-assertions-preserved.json>)：原220 expect-root、3标题表达式（4例）、3个完整page.evaluate调用完全相等；除watch/inspectBatch外27个原函数相等。180000/240000ms、240帧上限和所有命中/像素/witness/自然释放门保留。

## 已执行

- [7项纯host合同](<../tests/rendering/browserLifecycleEvidence.test.ts>)、类型、lint、完整6434单元/105文件与生产build实际0；不是浏览器崩溃复现证明。
- [受控native01](<../artifacts/verification/r48-r74-native-01-metrics.json>)原4/4，CLI/driver/owner实际0/202.773s，零skip/retry/报告flaky。
- [同报告附件核对](<../artifacts/verification/r48-r74-native-01-lifecycle-proof.json>)4份host附件，前两例37/63个检查批均有返回；本次epoch未记录close/crash/context-close/disconnected、pageerror或API写入，cleanupErrors为空。Chrome日志有正常graceful close及exitCode0；没有用“看不到事件”证明旧关闭根因。
- 本次stderr含40条CVDisplayLink失败及updater信息，与pageerror不是同一类证据；它们也存在于这次成功运行，不能据此认定此前关闭的原因，更不自动安装或调整系统设置。
- 567文件冻结包含原563加2个新测试文件，并显式补入此前未列入映射的Playwright/Vitest配置；不冒称旧563曾涵盖所有配置。原78 PNG bytes/mtime、pointer、Vite3756保持，8081/55439未启服务。
- [只读复核](<../artifacts/verification/r48-round74-lifecycle-review.json>)task172完成、无必要P2，审查员未执行或看PNG。Lead实看受控、第三阶段击败前和清场后三张640×360原生图；不是冷评或新美术。

[受控状态](<../artifacts/verification/r48-r74-native-01/sydney-art-Sydney-legal-cp-6fbbe-nd-long-pause-native-freeze/sydney-real-pua-positive.png>) · [击败前](<../artifacts/verification/r48-r74-native-01/sydney-art-Sydney-real-ord-7e727--arena-before-chapter-three/sydney-live-before-defeat.png>) · [清场后](<../artifacts/verification/r48-r74-native-01/sydney-art-Sydney-real-ord-7e727--arena-before-chapter-three/sydney-defeated-raw-canvas.png>)

## 保留的边界

host单调时钟及事件接收顺序不是Core/rAF或OS关闭原因；epoch止于afterEach dispose，testStatus仅为当时值。disposed表示停止记录，须结合cleanupErrors判断卸载是否成功；附件失败不等于没有事件。原R47的53.577s失败和所有旧首红原样保留。

[原216身份](<../artifacts/verification/r48-round75-collection-audit.json>)全部保留；下面完整运行不能与定向或旧轮拼接。


## 回合75：单完整214/2与真实清理

- [新H后端](<../artifacts/verification/r48h-backend-tests-metrics.json>)23/23、actual0/17.873s；[完整执行](<../artifacts/verification/r48-full-01-execution.json>)CLI/driver/owner1、2225.466s，214 passed/2 failed、零skip/retry/报告flaky，无全局超时或中断。[同报告身份与结果](<../artifacts/verification/r48-full-01-outcome-summary.json>)保所有216身份/各单结果，Sydney4、反击5、菜单10均passed。
- [2+7脚本复核](<../artifacts/verification/r48-round75-verifier-review.json>)task174 completed3、原341 assert保留；本次launch另实际核exact2+7/readOnly/9hash。driver单独复用缺前两硬门的P3保留，严格acceptance仍硬查；不能冒用旧task169。
- [post-run](<../artifacts/verification/r48-full-01-post-run-workflow.json>)actual0只表示诊断完成，wholeRunAdmitted=false；strict acceptance及5子审计均未执行。[本轮Sydney host核对](<../artifacts/verification/r48-full-01-sydney-host-proof.json>)4附件、29/62批返回配对、epoch无关闭/pageerror/API写入/cleanup错误，只是补充诊断，不是整轮准入或旧故障根因证明。
- [H清理](<../artifacts/verification/r48h-services-cleanup.json>)API按SIGINT退出130、PG退出0/组消失/控制状态shutdown，8081/55439释放，Vite3756保留。H数据/runtime退休，不复用或信号历史PID。[归还](<../artifacts/verification/r48-full-01-restoration.json>)保568源、78旧PNG bytes/mtime与pointer。

### 两个Loom失败，不改守卫掩盖

1. 普通急转弯例30414ms/status failed，原180000ms预算：spec611要求左移>32，得到12.5。[原trace摘要](<../artifacts/verification/r48-full-01-failure-01-trace-extract.json>)与[定点分析](<../artifacts/verification/r48-round75-loom-failure-analysis.json>)实际确认call16008为orange count384/x332.5，call16028为count0/x320/bottom0。这个12.5是空演员默认坐标参与运算，不是实际移动证据；为何瞬间无演员仍未唯一证明。稍后的失败图有在线左的角色和弱点3.0s，不能倒替断言帧。
2. 虚空死亡例32377ms/status failed，原100000ms预算：spec713需要弱pose>=4却frame2。实际开窗frame6与受伤frame5/HP像素240成立；死亡后采集700ms整组PNG相等已通过，不能叫死亡动画仍推进。原3200ms窗口与早期匹配/归档/300射击/600采样/A离台的排程需进一步核对；批量damageViews decode本已在死后，不误归因。[trace摘要](<../artifacts/verification/r48-full-01-failure-02-trace-extract.json>)保原zip，host时长不是Core校准。

[只读分析与规划记录](<../artifacts/verification/r48-round75-reviews.json>)：task178真看6张失败相关图；Lead真看本轮两失败图与三菜单图。下一task179先按有效演员采样及真实弱窗内普通死亡控制修正，保32/线左8/弱pose>=4、300/600/700及原预算，不改生产窗口、物理或死亡图骗过测试。Task175/177的Fence及连续五章/自然三结局只是后续规划，未实施；全GDD继续。

### 本轮菜单实看（不是失败整轮准入）

桌面、844×500短屏和390×844窄屏的继续操作均固定可达；暖色满载与浅绿扩容有区分，交易/评级/构筑详情保持。只核已有菜单，不追加polish。

![本轮安全休息室](<../artifacts/verification/r48-full-01/rest-style-rest-visual-hie-37381-nsion-restores-normal-meter/short-full.png>)

[桌面](<../artifacts/verification/r48-full-01/rest-style-rest-visual-hie-6720d-nsion-restores-normal-meter/desktop720-full.png>) · [窄屏扩容](<../artifacts/verification/r48-full-01/rest-style-rest-visual-hie-e0f49-nsion-restores-normal-meter/portrait-expanded.png>)
