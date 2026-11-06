# R25：Omega原生环境接线与本轮完整回归

> **第五章原生环境已在资产范围准入，正式环境共五章；总GDD目标仍active、未完成。**
> 最新完整浏览器是同代码独立单轮119/119、真后端、0skip，不把不同运行拼绿。

## 实际交付边界

- 保留项目实际Phaser4.0.0、React/TypeScript与Scala/PostgreSQL，不升级引擎/依赖或改配置；新增[资产绑定](<../src/pages/GamePage/game/data/omegaEnvironmentAssets.ts>)、[只读Plan](<../src/pages/GamePage/game/systems/OmegaEnvironmentPlan.ts>)与[Image渲染器](<../src/pages/GamePage/game/systems/OmegaEnvironmentRenderer.ts>)。
- 仅修改[WorldScene](<../src/pages/GamePage/game/scenes/WorldScene.ts>)预加载/创建Core前守卫和[WorldRenderer](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)表现接线。Core、镜头/碰撞、v1/API、原108测试与严格原生oracle不改；没有privateWorld、血量/位置/时钟注入、空canvas或rAF替换。
- [R24六源](<round24-omega-source.md>)/[PixelSpec](<../assets/omega-environment-pixelspec.md>)原样冻结：32片16px母格、六件64×128静态道具、pivot32,120。源20palette/硬alpha/英雄橙0，原validate0error/5选择性描边warnings保留。
- [生成记录](<../assets/omega-environment-generation.json>)保存R24 source-only快照与R25运行准入；生图实际可核验输出晚于源freeze，未用于设计冻结像素，没有预绘参考/本地路径/缩图或导入声明。本轮不重画或新生图。

## 保留真实玩法与前景

原六support、地面40=16+16+8、12px观察台与两个60px断口均不改；x740不snap，完整cap与中间余宽prefix不拉伸。地图导出不作额外碰撞图。

真实door自动穿越、空椅、镜玻璃48×98与grounded揭示保留，不凭美术发明E开门/坐椅。门opening40×96、镜quiet中央透明；镜只排除被实际floor遮住的源底4行224px，剩1025源ink严格匹配。原反转Clawd.45投影与.9FOOM揭示由实时演员绘制，不烘进静态镜框，不改四腿16×22身体。

静态support用depth.5、props−5；原Core top3/风暴/门叶/揭示投至前景1，镜像bodybox/HP/弹/预警与扫描到core3，原演员深度不改。新[r5/r8像素用例](<../tests/e2e/omega-environment.spec.ts#L252-L288>)先锁普通输入站稳target，再取固定4.5s全窗，真实pause后离线匹配，实际脚部y324以下仍读到字面alpha。

## 有界与资源失败

[纯计划测量](<../artifacts/verification/r25-role-survey-01.json>)5121半像素视口峰值135/384，全世界605命令不先分配；不是GPU帧率或低端60FPS证明。实际新11观察22terrain角色/六props，合法Plan视口可用25角色，加载32不等于实际全32已见。

所有38帧eager校验owner/name/sourceIndex/真实TextureSource与physicalimage身份、自然尺寸、cut/native/real与无trim/rotate；同组共享源，跨family不许别名。只拥有Image，不销毁借用Texture；稳定slot高水位/换局换章撤旧，外部真实destroy先触event的次序也覆盖，不新增clock/RT/GL恢复回调。

五类坏资源——terrainPNG/propsPNG/propsJSON缺失、未用镜帧宽63或cutX321——均在createWorld前fail-closed，严格保原checkpoint及真实新attempt的字节，修复后正常retry。
固定提示：`Omega 环境资源加载失败。请检查网络后刷新页面；本地检查点未改动。`

## 当前实跑（不是历史复用）

| 门 | 结果与原始证据 |
|---|---|
| 源与适配 | R24冻结79源例在本轮unit中复验；[新独立130/130](<../artifacts/verification/r25-adapter-independent-02.log>)，EXIT0 |
| 完整unit / type / lint / build / diff | **3993/65文件**，各EXIT0；[最终本地门](<../artifacts/verification/r25-final-local-gates-01.json>) |
| 新原生11单轮 | [11/11、EXIT0、89.0667s](<../artifacts/verification/r25-browser-author-native-02.log#L21-L45>)，先前9/11首红不覆盖 |
| 完整真后端浏览器 | [119/119、0skip、EXIT0、1085.593s](<../artifacts/verification/r25-current-browser-02.log#L266-L273>)；[153受保护源0漂移](<../artifacts/verification/r25-current-browser-02-metrics.json>) |
| 新隔离PG_A后端 | [23/23、0skip、EXIT0](<../artifacts/verification/r25-backend-tests-01.log#L414-L524>)，77后端/合同文件不变 |

[最新完整轮同帧指标](<../artifacts/verification/r25-current-native-selected-metrics.json>)：r5 warning/active均176/176、两source色、34完整source三排columns；r8均350/350、三色、32columns，匹配率1且未混色raw0，均有同帧原生Clawd≥.98。边框2px之外的最后内行r8y330由[独立Pillow](<../artifacts/verification/r25-browser-author-r8-stroke-pillow.json>)核准，未吞stroke331/332。

[11例详细记录](<../artifacts/verification/r25-browser-author-report.md>)还保留真正普通跳跃/坠落、跨章整窗最大残留0.323691<.8、真fullscreen/WebGL前后PNG一致、门叶和空房旧几何色0、.45投影432/432与.9揭示533/533。合法CP0/CP12切片不是fresh连续五章。

## 首红与未关闭的敏感性

1. [adapter首124/125](<../artifacts/verification/r25-adapter-independent-01.log>)查出跨family共享source-wrapper漏洞；只必要补wrapper/physicalimage唯一性，新增5项实际destroy/别名负控到130绿，首红不删。
2. [新11首9/11](<../artifacts/verification/r25-browser-author-native-01.log>)：r5原ROI132点虽全命中却只有一种源色，多去一行导致两色门误拒；仅纳入距底2px安全行，点数增加到176，.98/两色/100ink/raw<.8不降。[原PNG离线证明](<../artifacts/verification/r25-browser-author-offline-r5-01.log>)不是新browser；r8定时走到阈值左侧，只改新用例为普通D+公开reveal反馈释放。之后完整新11才通过。
3. [全119首轮117/119、EXIT1](<../artifacts/verification/r25-current-browser-01.log#L259-L344>)：旧Gato固定HPx448观察偏1.777px，旧Loom185ms输入未开弱点。保持全部代码/旧tests/阈值不变的[窄重放2/2](<../artifacts/verification/r25-regression-pair-01.log>)不拼119；第二整轮才119绿。固定像素/时序敏感性仍开放，未把静态相机震动推断当已证根因或“已修复flaky”。

[非fresh AI实景复核](<../artifacts/verification/r25-visual-review.md>)8/10、0blocking/0necessary，停止optional；只看入口/静室/普通chamber，不由静帧认证碰撞/动画/人类听感/性能，激活scan另有原图字面混色证据。

## 清理、范围与下一步

[PG_A清理](<../artifacts/verification/r25-backend-cleanup.json>)/[Lead PG_B与Main清理](<../artifacts/verification/r25-lead-service-cleanup.json>)：两新私有cluster都关闭、数据保留，Main/SBT/完整CLI已退出；原54字节pointer连inode/mtime未改，原前端8080/PID84960及HTTP200保留。SIGINT使SBT报Cancelled/exit1是主动服务关闭，不伪称测试EXIT0。
[78旧图恢复](<../artifacts/verification/r25-legacy-restoration.json>)先把当前两轮输出各自另存，再恢复所有原字节；旧日志/历史验收不覆盖。方法与权限字段失误见[执行补记](<../artifacts/verification/r25-process-notes.md>)，不隐去或称零过程错误。

[生成记录](<../assets/omega-environment-generation.json>)的productionReady只指这批原生资产/已测runtime，项目ReleaseReady/fullGddComplete仍false。R21最后12 moderate开发链告警仍开、R25未重审，不做强行major升级；Phaser约1352KB chunk警告仍保留。

NPC/专用攻击、token/compute/heal拾取、终局演出、完整章别声景/人工听感、种子支路奖惩、局外成长、触控/手柄/可读性/低端性能以及新局连续五章三结局仍未完成。[下一只读合同](<../artifacts/verification/r25-next-delivery-contract.md>)只建议三类非蘑菇原生拾取小包；蘑菇已经原生，不能重画它或从DOM虚构NPC实体。
