# 第7里程碑：第一章正式素材种子与鹦鹉接入

2026-10-28，Asia/Shanghai；自动目标回合8。**这是第一批正式小怪素材，不是第一章全美术或完整GDD完成。** 最终全量门已收集：**490/490单测、45/45真实浏览器、23/23本轮Scala/HTTP/PostgreSQL**。前面的视觉与局部测试不是这组数字的替代品。

## 1. 从规格到真实源文件

- 用户确认[第一章统一规格](<../assets/chapter-one-art-spec.md>)并选择由生图工具产生设计参考，作为后续同风格素材依据，不逐帧重复确认。
- 本地[四姿势参考](<../generated-images/image-20261028-171208-d2988d.png>)来自gpt-image-2.5，以既有Clawd参考为风格输入；仅作为设计图。原生精灵由Aseprite MCP手工绘制，没有缩图、量化参考或Python生图。
- 本轮使用已连接的live Aseprite，新建自己的文档#34，没有改其他用户文档或切去headless。可编辑[源](<../assets/source/parrot.aseprite>)为48×48 RGB、6层、4帧，20项palette含透明，实际11个不透明色。原Clawd源与13色palette完全不变。
- 正式[PNG](<../public/game/parrot.png>)/[JSON](<../public/game/parrot.json>)192×48，四帧名为`parrot 0.aseprite`至`parrot 3.aseprite`；idle0..1、tell2、recover3，时长400/600/180/140ms。NEAREST、无trim、padding0。
- pivot(24,30)明确在视图描述中，atlas slices为空，不谎称JSON包含锚点。对齐enemy中心(x,y)，现有24×24碰撞不变；眼、喙、尾不扩大碰撞。
- [PixelSpec](<../assets/parrot-pixelspec.md>)、[逐字生图与来源记录](<../assets/parrot-generation.json>)、[敌人资产清单](<../assets/enemy-manifest.json>)记录实际方法和边界。

## 2. 独立审查与机械检查

| 阶段 | 实际证据 | 结论 |
|---|---|---|
| 真正冷读 | 匿名[首稿原生](<../assets/reviews/r8-a-native.png>)/[放大](<../assets/reviews/r8-a-large.png>)；fresh reviewer事先只知道路径 | 绿鸟读得出，闭合书读不出；6/10，BLOCKING，不接线 |
| 定点修复后复验 | [修后原生](<../assets/reviews/r8-b-native.png>)/[放大](<../assets/reviews/r8-b-large.png>) | 书成为独立闭合体、翼压书、第三格抬书可读；8/10，无视觉BLOCKING。此时已知规格，不冒称再次盲测 |
| 游戏背景审查 | 冻结的真实[抬书](<../assets/reviews/r8-game-raised.png>)/[收书](<../assets/reviews/r8-game-lowered.png>) | 深蓝绿背景下可独立定位；Clawd/鹦鹉形色与尺度区分；纸书/金色预警仍可读，无新增BLOCKING |

只做一次定点修正轮：书改为有上下封面/窄纸块的横向闭合体；胸部小块改绿与纸色隔离；折翼跨过封面边形成明确遮挡。头/喙/尾不扩散重画。两项非阻断观察保留：折翼略硬、抬书与喙下稍拥挤；原生背景证明未破坏辨识，不继续无上限润色。

Aseprite最初检查暴露隐藏参考非palette色及三帧书/腿上部重叠。导入参考用于逐面板compare后移除，外部原图保留；首稿仅清除被书遮住的足部像素。定点修复将书移离腿部后，完整双脚恢复。**最终validate 0错误，16条选择性轮廓style warning**：尾/喙顶光、胸部与头接续、折翼光边；不是“零警告”。六层在1..4帧均有像素，head/feet、book/feet均不重叠。

另做只读PNG扫描：alpha仅0/255，全在批准palette内，精确Clawd橘色`#d97757`使用0；脚底全在y44，x24保持间隙，眼高光每帧1。四帧不透明面积529/539/552/517，bbox分别(9,14,40,45)/(9,13,40,45)/(10,13,40,45)/(9,15,40,45)。没有用截图目测代替这些像素检查。

## 3. Phaser接入合同

- [enemyAssets](<../src/pages/GamePage/game/data/enemyAssets.ts>)只描述已存在的parrot，未把其他敌人列为正式资产。
- [EnemySpriteRenderer](<../src/pages/GamePage/game/systems/EnemySpriteRenderer.ts>)仅持有Scene-owned Images。读取真实模拟elapsedMs，idle按400/600切帧，tell/recover保持到真实FSM转换；无wall-clock动画、网络、存储、物理修改或全局单例。实体死/消失、run/chapter改变以及销毁均释放实例。
- [WorldRenderer](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)仅跳过成功接管ID的几何身体，原真实tell预警仍显示；其他敌人保留明确的临时图形。持书动作不产生第二套伤害时序。
- [WorldScene](<../src/pages/GamePage/game/scenes/WorldScene.ts>)预加载真实PNG/JSON，并检查完整4帧。缺图或缺帧明确报错，不进入ready、不重写存档；底层适配器对缺资源仍安全返回未接管。
- 页脚、画布、手册标注“Clawd/鹦鹉已接入，其他仍blockout”；没有假装整套素材完成。Backend/DTO/Core/原Clawd资产未改。

## 4. 已收集的证据

- task15作者最终`bash-18a516c5cbb54153`：rendering **70/70**（新41+原29）、scope lint、全typecheck，exit0；真实public JSON/PNG、丢失实体、帧绑定、模拟时钟、pivot、flip和硬像素约束均有断言。
- Lead `bash-5f487ac96a9946c7`：全lint/type、**36文件490/490单测**、build、audit **0漏洞**、新增三项原生各重复两次 **6/6**、diff check，exit0。
- [新增原生验收](<../tests/e2e/enemy-art.spec.ts>)只用普通D键接近、原生截图与DOM：每次10张图；最终全量门纸块相对可见眼点的高度为10.093645/12.252607px，变化约2.159px。以眼为参照排除了真实浮动和相机平移冒充抬书；不读/写引擎对象。该门抬书捕获绿色262px、纸30px；暂停前后实际截图逐字节相同，HUD时间也相同。
- 两种真实浏览器加载故障：PNG请求失败、合法atlas缺最后一帧，都明确失败、禁止开局、v1安全点逐字段不变；解除故障后刷新恢复，非模拟成功响应。
- 新门首跑`bash-73ff1421896c4c9a`为2/3：所有可见/抬书/冻结断言已过，失败是恢复按钮错误要求exact名“继续训练”，实际DOM含装饰箭头“继续训练 ↗”。读了错误DOM与实际截图后，改为暂停dialog内按操作名定位；没有改玩法或放宽像素阈值。之后双重复6/6通过。
- 新私有PG中重跑`bash-419afe5ae6604c8e`：**23/23 Scala/HTTP/PostgreSQL**，exit0。Java17.0.17、PG16.14、sbt1.10.7；不是借用上一轮后端数字。

## 5. 全量失败、修正与最终门

首个全45门`bash-87e53d1ea3a6423b` exit1，不能写成全绿。失败[截图](<../artifacts/verification/r8-factory-failed.png>)、[DOM](<../artifacts/verification/r8-factory-failed-context.md>)与[trace](<../artifacts/verification/r8-factory-failed-trace.zip>)保留：Sydney机器人站着等出生闪烁并反复纠偏，落位日志到316.075px时已消耗约3.3秒墙钟；真实海触发生，之后Space进入新局，最终目标断言才暴露错误。规则中的初始脚海差154px、海速52px/s给出的站立预算仅约2.96模拟秒。

修正只在[原生导航测试](<../tests/e2e/factory.spec.ts>)：先普通A+Space移动跳跃上一级，再继续真实截图反馈与320±4px落位；每次输入前确认第二章与未死亡。保留同一成功可见捕获、14次上限、真实绑定/J解控、实际脚部高度、死亡断言，不修改Core、海速、无敌、存档或碰撞。没有盲目重试原脚本直到绿。

最终`bash-da55171bafec44cd`已收集exit0，完整[日志](<../artifacts/verification/r8-final-gate.log>)保存：

- 修后Sydney独立 **3/3**（50.1s），再进入统一门。
- 全lint/type、**36文件490/490单测**、build、audit **0漏洞**、真实API与Vite代理health均通过。
- **45/45真实浏览器，4.5分钟**，无skip：原四章、三态/音频/WebGL、真实云/三结局/成绩、第五章对决及新增3项全部通过。最终鹦鹉量测见上一节。
- 最终真实镜像78HP、+23,366ms，66次可见样本、镜像屏幕X235.75..524.75、107个敌弹像素，实际观察组合并赢/上传；旧A重试仍保留原body。不是完成档fixture冒充击杀。
- 构建Phaser chunk仍1,352.48kB/gzip348.59kB，game chunk207.19kB；不据此声称稳定60FPS、低端优化或音频听感完成。

## 6. 服务与交接

- 本轮自有API `bash-3540c9457c86409f`和PG `bash-51834aa3bf3549b4`已请求关闭并收集；PG日志明确`database system is shut down`。保留[私有测试目录](<../backend/.local/pg-test.hOtfF8/>)与所有旧目录，未删除测试数据。关闭后实测8081/55439无监听；8080首页及正式PNG/JSON均HTTP200。另核对99条本轮文档本地链接、JSON语法、源文件48×48/4帧头，以及正式PNG与审查版逐像素相同；diff check通过。没有把测试时health误当成常驻后端。
- task15正常完成rev3。旧task10/12受拒板状态未触碰、不通过其他代理重试；本轮交付事实不等于旧板项关闭。
- 源文件与图集已保存，单一live绘图写手；总目标继续active。

## 7. 仍须继续的范围

复读机、欺骗性NPC及透视本体、Gato三形态、第一章地形/机关室/森林道具尚未制作；其他章节敌人、Boss与环境、主角专用攻击、正式演出/声景、完整触控和从新局贯穿五章体验仍未完成。保持总目标active，不在单个样张通过后结束开发。
