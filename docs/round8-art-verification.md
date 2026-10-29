# 第8里程碑：复读机正式像素资产（目标回合9）

全量GDD目标仍未完成。本轮只补齐第二种第一章小怪，不把欺骗性对齐NPC、Gato三形态或环境计划算成成品。继承[上一轮490/45/23基线](<round7-art-verification.md>)；最终全量门已收集：**526/526单元、48/48真实浏览器、23/23本轮后端**。下面局部通过不代替这组完整结果。

## 1. 来源和原生制作

- 实际版本Phaser4.0.0、Aseprite1.3.18.6-dev；preflight ready。Lead唯一live写手，原Clawd/鹦鹉文档未改。
- 用户已统一批准[第一章规格](<../assets/chapter-one-art-spec.md>)及工具生参考。一次实际gpt-image-2.5图生图，输入已审查的[鹦鹉风格板](<../assets/reviews/r8-b-large.png>)，得到[2170×725四面板参考](<../generated-images/image-20261028-200511-4e0804.png>)。请求原文/真实尺寸/取舍见[来源记录](<../assets/repeater-generation.json>)，没有臆造第二个预览或直接缩图当精灵。
- [PixelSpec](<../assets/repeater-pixelspec.md>)锁定48×48、pivot(24,30)、24×24原碰撞、蓝灰机壳/双奶油盘/提手/格栅/双短机械脚；左上光、20项批准palette、精确d97757禁用于敌人。
- 原生手绘6层feet/case/reels/speaker/spokes/lights，4帧400/600/180/140ms；idle旋轮/小灯，tell前扬声器左移3px并亮灯，recover回收变暗。硬壳和脚不做有机呼吸，实际扇形三发echo、600ms tell、1150ms recover及模型运动不改。
- 参考逐面板导入，仅供实际compare；比较完成后移除并保存原图。保存[可编辑源](<../assets/source/repeater.aseprite>)，实际MCP导出[PNG](<../public/game/repeater.png>)/[JSON](<../public/game/repeater.json>)，192×48、无trim/padding、真实键repeater 0.aseprite至3。pivot在显式视图描述，不伪造slice元数据。

## 2. 独立冷读与一次定点修复

[首稿原生](<../assets/reviews/r9-a-native.png>)/[放大](<../assets/reviews/r9-a-large.png>)交给新建只读critic，先只给匿名图、不透露规格。第一眼是机械双眼/面板，放大后才联想到双盘器材；冷读冻结。再给规格，6.5/10、一个BLOCKING：连块轮盘暗形像有方向的瞳孔，录音机身份被遮蔽。

仅一次定点修复：保留11×11盘外形/位置，改为1px轴+三枚分离孔槽，tell补暗凹槽与面板后缘。未加入多余磁带线、整壳变形、假射线或更大位移。[B原生](<../assets/reviews/r9-b-native.png>)/[B放大](<../assets/reviews/r9-b-large.png>)brief-aware复验7.5/10、无剩余BLOCKING；不是新盲测。短脚和黑底下部较暗为非阻断项，按审查建议冻结，不无限微调。

最终validate原文`Clean (12 style note(s))`、0错误：保留盘面上的独立1px轴、选择性金属亮边和制造件直线边界提示；不靠抖动掩盖金属直边。实际PNG12不透明色、alpha0/255、禁主角橘色0；areas649/649/665/649。原生足底x17..23及27..33、y44，中缝24..26透明；四帧脚相同，硬壳alpha稳定，允许tell凹槽RGB变化。

## 3. 只读引擎接线与独立背景复验

沿用一个[EnemySpriteRenderer](<../src/pages/GamePage/game/systems/EnemySpriteRenderer.ts>)和[显式描述列表](<../src/pages/GamePage/game/data/enemyAssets.ts>)，无复制renderer。按kind独立检查纹理/四帧；同ID换kind销毁重建，缺一种不干扰另一种，run/stage更换/移除/死亡/销毁释放。保留原parrot API与第二构造参数兼容。手动Image帧跟模拟时钟，不注册全局AnimationManager、timer或物理体。

[WorldScene](<../src/pages/GamePage/game/scenes/WorldScene.ts>)只预载正式列表；缺PNG/帧在ready前报对应家族错误。既有Graphics预警圈仍由真实FSM绘制，未隐藏其他blockout。UI和画布诚实列出Clawd/鹦鹉/复读机三个已接入家族。

真实stage1/cp1恢复后的[前推图](<../assets/reviews/r9-game-tell.png>)/[回收图](<../assets/reviews/r9-game-recover.png>)已由Lead与critic实际查看。深绿背景上无金圈仍有可读蓝灰边缘/提手/双盘；金圈未遮盘或格栅，前推是次级提示。仅tell图可与Clawd比较尺度：暖橘横向扁体与冷蓝灰较高设备明确区分。recover图Clawd不可见，critic不据此推断闪烁或渲染问题。两张场景通过不外推全部背景、新局全流程或命中范围。

## 4. 已收集局部与后端证据

- task16正常完成rev3，只写约定两src+一新test；旧task10/12拒绝状态不触碰。作者终检`bash-7c1930f22afa4ebd` exit0：rendering106/106（旧70不改+新36）、scope lint、全typecheck。
- [36项新增测试](<../tests/rendering/repeaterSprites.test.ts>)覆盖正式文件、几何/硬alpha/脚底、冻结、资源隔离、同ID换kind、旧绑定兼容与销毁。Lead已读核心改动，不将测试双体当成生产图集。
- [原生测试](<../tests/e2e/repeater-art.spec.ts>)使用合法检查点与真实compositor截图，不读写引擎对象/坐标/HP。`bash-be93212c577643f8` exit0，三项独立两轮**6/6，31.3s**；每轮10张图，提手相对格栅偏移10.8679245→13.8867925，差3.0188679px，金属像素311。消除相机平移对结果影响；暂停截图逐字节相同，HUD计时相同；缺PNG和缺末帧均明确失败并保留原v1存档，解除故障后刷新恢复。完整[局部日志](<../artifacts/verification/r9-native-scope.log>)保留。
- 本轮新私有[PG目录](<../backend/.local/pg-test.W3Z2ui/>)、PG16.14、Java17.0.17、sbt1.10.7。`bash-8b8a9895d8b84465` exit0，**23/23**真实Scala/HTTP/PG，13s；[完整日志](<../artifacts/verification/r9-backend.log>)。预期的脱敏500日志、INFO和/dev/null密码文件警告不作为失败或隐藏。

## 5. 最终全量门与服务

运行时代码、原生测试与图集冻结后，`bash-2c9cd1f7dfc946c1`已收集exit0，保留[完整日志](<../artifacts/verification/r9-final-gate.log>)：

- lint/type、37文件 **526/526** 单元、build、audit **0漏洞**、真实API及Vite代理health均通过。
- **48/48真实浏览器，4.6分钟**，无skip。原45项全部保留并通过，新三项再次通过。复读机仍测得3.0188679px相对位移及暂停像素一致；鹦鹉抬书/冻结、三态Clawd、全章原生关键战斗/机关、音频/WebGL、云/结局/成绩均回归。
- Sydney实际落位323.9245px并完成绑定/J解控；Loom首窗口左转成功且PCM吞音/恢复通过。第五章实际镜像对决68HP、+25,616ms、76个可见样本、屏幕X265.5..517.75、100敌弹像素、观察到真实组合，获胜/上传及旧成绩身份保留均通过。不把完成档回看替代击杀，不外推新局连续五章。
- Phaser chunk仍1,352.48kB/gzip348.59kB，游戏chunk207.94kB；未掩盖大包提示，未宣称稳定60FPS。

本轮临时Main `bash-750a665a30d14fd1`与PG `bash-23408d294bab409c`已停止并收集。API连接池日志明确Shutdown completed，PG明确database system is shut down。保留所有新旧测试目录与8080前端；关闭后端口/前端/链接另行复核。不复用宿主数据库、不安装服务、不发布。

Phaser大chunk和低端/启动性能仍待实测；本轮不是性能或听感验收。后续继续欺骗性对齐NPC两态、Gato三形态、第一章环境及其余章节正式美术，完整五章新局原生旅程/声景/内容/触屏和最终体验也仍未完成。总目标active。
