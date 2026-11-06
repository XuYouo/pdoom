# R38：Clawd真实出弹姿态接入：运行时准入记录

## 范围

本包只接R37已有原生姿态，不重画角色、不把候选七姿态当七帧攻击循环。
项目仍是React19/TypeScript5.7/Phaser4.0.0与Scala3.3.6，未安装或升级引擎。
保留[紧凑休息室](<../docs/round27-rest-menu-progress.md>)及[R36真实交易/肖像](<../docs/round36-human-rater-integration.md>)。
完整GDD、项目发布、连续新局五章、人类手感/听感、低端性能与权利审查仍未完成。

## 原生合同

- [原八帧源](<../assets/source/clawd-svg.aseprite>)保留为独立不可变oracle。
- [扩展源](<../assets/source/clawd-attack-candidate/clawd-svg.aseprite>)仍32²、七层、十三项palette、22帧、六tag。
- [冻结候选](<../assets/candidates/clawd-attack/>)与正式三态PNG/JSON逐字节相同：各704×32、22帧、无trim/padding。
- 零基0–7为原idle/run/jump/hurt；8–14为基础步态0–6的fire变体，15–21为recover变体。
- 成功发射后的模拟年龄[0,83)显示fire，[83,133)显示recover，之后回到当前步态；无预摇、无步态重启。
- pivot16,27、16×22碰撞、四腿、既有三态与伤害/弹速/冷却不变。真正子弹仍从actor.x,actor.y−3发出，不宣称改到掌心。

## 实际接线

[Player模型](<../src/pages/GamePage/game/entities/model.ts>)新增nullable运行时lastFiredAt。
[创建角色](<../src/pages/GamePage/game/systems/rules.ts>)清null，保存、历史、v1 DTO与API均不携带它。
[玩家射击](<../src/pages/GamePage/game/systems/combat.ts>)和[镜像射击](<../src/pages/GamePage/game/systems/mirror.ts>)只在实际生成子弹后写模拟时间。
按键、冷却、旧累计shots、旧弹丸都不是新发射证据；拒绝/石化/Q/满池不造动作，部分幻觉齐射也按真实创建计算。

[ClawdRenderer](<../src/pages/GamePage/game/systems/ClawdRenderer.ts>)只读值快照，保伤害/石化/回溯/隐身/闪烁/alpha优先级，每actor至多一owned Image。
[OmegaRenderer](<../src/pages/GamePage/game/systems/OmegaRenderer.ts>)给敌方镜像自身receipt，静态倒影用玩家receipt；Q只抑制倒影动作，不凭空给倒影另套回溯tint。
没有AnimationManager、墙钟或额外物理；暂停/模态/失焦冻结由原模拟时钟决定。

[资源门](<../src/pages/GamePage/game/systems/ClawdResources.ts>)检查全部3×22，不只检查当前使用的角色。
包括自然704×32尺寸、独立source image、规范名字、每帧32²/cut/索引/归属、不允许trim/旋转/alias及失效getter。
渲染前后核对Texture/Source/Image/Frame引用，资源替换重绑；重入、外部销毁、getter/factory/setter异常及dispose均有负控。
只释放自己的Image，不销毁共享图集。WorldScene缺资源沿保档错误/重试路径，不以通用矩形伪装成功。
实际安装Phaser4.0.0的纹理过滤0为LINEAR、1才NEAREST；本轮复核修正为1并加全族防回退断言。

## 本轮实际验证

| 门 | 已发生事实 |
|---|---|
| 源RGBA/几何/原8与晋升等值 |169/169，含逐层和坏源反例|
| 新Core/资源/投影 |308：Core30、Renderer160、Resource113、Omega5|
| 全单元 |6003/83文件，实际0|
| type/lint/build |实际0；大chunk警告保留|
| Clawd定向浏览器 |18/18整组、155.19s、retry/skip/flaky0|
| 全部浏览器 |单独完整171/171，EXIT0/1400.019s，retry/skip/flaky0，保原153+新18|
| 本轮B批新隔离Scala/PG |23/23、实际0/16.428s，指针不变|
| 服务/旧图 |B批仅自有组已清理、PG shut down；78旧图字节mtime、494源、Vite和pointer守护通过|

定向测试从合法检查点出发，按普通输入站立射击、左右跑跳、受实际伤害、Q、暂停/休息/新尝试重载。
六种未用FOOM损坏覆盖PNG/JSON失败、缺末帧、alias、错宽度与自然高度错误；初始及新尝试存档字节保留，真实重试只留一个canvas。
检查点含历史shots97，fresh演员不得借此出现抬手。测试同时禁止guest API变更与pageerror。

[观察器](<../tests/e2e/clawd-pixels.ts>)只读取实际canvas/DOM，不读World、Phaser或生产选帧函数。
全不透明源像素RGB容差0，无actor遮罩；相同基础RGBA保留匹配集合，不捏造唯一帧。
Q颜色用原生RGB与明确既有tint公式核验。静态反射用同相机真实背景和.45 alpha，沿既有小色差容差但要求所有源ink匹配，无actor排除。
旧镜框底边被地板遮住的prop规则不是角色遮罩。本轮普通接近镜子并真正射击教序列，之后分别看到敌方FOOM的真实出手/回落。
blur覆盖显式标准DOM事件；headless切换tab不发window.blur，不冒称已测操作系统焦点切换。

## 实看及风格边界

同Lead实看真实aligned/foom出手、masked空中出手、镜面倒影、敌方镜像与受伤；不是独立冷评，也不是人类动画手感测评。
修正NEAREST后的两张定向实景和完整轮四张实际画布已重新实看；见下方证据。敌方镜像靠右缘时名称/HP可裁切，已列后续可读性问题，本包未改HUD定位。
原生live#528导出副本与冻结源字节相同；此次当前可见层validate报告Clean14 style notes。
这不替代R37全七层Clean但58条风格提示（含warning）的历史报告；保留SVG矩形顶光和触手边缘亮点理由，不扩palette消警告。
MCP这次preview仅为活动tentacles层，不能冒称是完整角色预览；完整角色的实看来自实际游戏PNG。

## 首红、主动中断与守护

1. Core恢复测试误把持久化elapsedMs要求为运行时小数；既有snapshotSave向下取整，改为明确floor的等值断言，其余字段不放松。
2. 首次headless tab切换未产生blur；调整为诚实的标准事件范围，没有改游戏暂停逻辑。
3. 受伤采集2.2秒太短，失败截图已HP90；扩到有界4.2秒并保持真实射击，源像素/HUD门不变。
4. 安装源码复核发现本轮过滤常量0错误。full01在改源码前主动SIGINT，实际130/257.065s；它不是通过结果。
   全78旧图字节mtime恢复、494无漂移且首批自有API/PG清理后，修1并重新通过所有静态/定向门，再以新B簇跑full02。
5. 原known465清单漏21个既有public文件（含六个Clawd正式导出）。守护先阻止启动；现494=465已知+8真新增+21既有补纳，49个生产文件均覆盖。
   没有把21个既有文件说成新建，没有改写历史hash；原8独立像素oracle一直来自原生ASE。
6. 更新脚本计数的广泛文本替换误改launcher SHA字面量，被启动前守护拦住；恢复原可信pin并验证实际JAR未动，无安装/权限/配置改变。
7. 自有pty-30停止处理输入时，确认无B状态/进程/冻结02文件后关闭；pty-31重新核验并启动新的B簇。工具inferred_idle从不作为实际命令退出。

## 服务与不变量

最终运行在原Vite3756/8080，不启动替代前端；B批仅loopback、全新PG数据与HOME。
用户既有54B测试pointer的字节/dev/inode/mtime均守护；不运行[旧测试簇脚本](<../backend/scripts/test-postgres.sh>)，不按历史PID操作。
完整轮用一个worker、retry0、无grep/shard/project子集，原153名称与新增18全部保留。
wrapper在finally保护78历史图字节与mtime，另存本轮真实变化图；源在运行/清理期间冻结。
八名助手未唤醒，没有新探针、配置变更或实际模型已切换的声称。
最终准入仅限Clawd源与已测runtime；全GDD、完整声景、终局演出、局外成长、输入辅助、性能与安全仍有后续项。


## 可核验证据

- [完整171逐例结果](<../artifacts/verification/r38-full-02-results.json>) / [严格整轮核验](<../artifacts/verification/r38-full-validated.json>)。
- [6003单元](<../artifacts/verification/r38-nearest-unit.json>) / [源与代码冻结494](<../artifacts/verification/r38-runtime-freeze-02.json>) / [fresh后端23](<../artifacts/verification/r38b-backend-tests-metrics.json>)。
- [最终自有服务清理](<../artifacts/verification/r38b-services-cleanup.json>) / [78旧图恢复](<../artifacts/verification/r38-full-02-restoration.json>)。
- [实际看图记录](<../artifacts/verification/r38-visual-review.json>) / [原生副本核验](<../artifacts/verification/r38-native-live-review.json>)。
- [主动中止旧full01](<../artifacts/verification/r38-full-01-deliberate-abort.json>) / [既有清单缺项](<../artifacts/verification/r38-freeze-coverage-gap.json>) / [脚本pin错误守护](<../artifacts/verification/r38-service-template-finding.json>)。

实际完整轮FOOM出手，不是概念图或重新绘制的截图：

![完整轮实际FOOM出手](<../artifacts/verification/r38-full-02/clawd-combat-Clawd-foom-ac-a44df-guish-fire-recover-and-calm/fire.png>)

同相机的实际静态倒影回落；保留.45 alpha与真实场景背景：

![完整轮实际倒影回落](<../artifacts/verification/r38-full-02/clawd-combat-Clawd-ordinar-6b16d-endent-hostile-mirror-shots/quiet-reflection-recover.png>)

文档/溯源更新后另跑全单元、type/lint/build与链接/变更检查；其最终值在[交接清单](<../artifacts/verification/r38-post-doc-verification.json>)中单列，不以此文提前冒称尚未执行的检查。
