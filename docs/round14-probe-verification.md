# 第14轮：冯诺依曼探针原生资产 — 已通过本轮验收

> 最终1002/1002单元、73/73真实浏览器（7.7m、后端启用、无skip）、23/23本轮新私有PG后端通过。探针包准入，不是第二章全部美术或完整GDD成品。首全门72/73失败保留，不计通过。

## 交付与边界

[可编辑源](<../assets/source/von-neumann-probe.aseprite>)、[128×32图集](<../public/game/von-neumann-probe.png>)/[atlas](<../public/game/von-neumann-probe.json>)、[PixelSpec](<../assets/probe-pixelspec.md>)、[完整来源记录](<../assets/probe-generation.json>)与[敌人清单](<../assets/enemy-manifest.json>)。32×32、4层4帧，pivot16/16；seek两帧各240ms，tell/consume各一姿势。20项palette仅用9不透明色，alpha0/255，主角橘色0；各bbox包含端点均[3,5,28,26]。

仅探针本体替换旧圆形blockout。工厂环境、回形针海、Sydney与控制泡仍明确为Graphics blockout；原始半径11、海速/伤害/平台规则、v1 DTO/API/四HUD读数未更改。第一章已准入环境和Gato原生像素不改。

## 真实制作与审查

先live预检与新文档info，固定既有palette，再分离壳体、左右钳、扫描灯。一次请求因空reference列表被拒、无图；第二次以既有复读机作风格输入，工具实际gpt-image-2.5，输出2172×724而非请求1536×1024。参考实际透明且含软alpha，不是请求的灰底。完整原文和失败均保留在来源记录。

四格裁框仅作参考，去掉不需要的提手/长侧耳，手绘硬像素；壳跨1–4链接、左右钳1/2链接。最终源无参考层。独立字节解析重建含5个linked cel的源合成，逐帧与PNG一致，不靠provenance布尔值。

既有评者明确非fresh-context：匿名冷读先冻结“圆壳机器人、单亮点、细腿/吊臂有歧义”，brief后7/10、0BLOCKING、0必要fix，停止polish。Lead实际看了原生128×32及[8×条带](<../artifacts/asset-review-r14/review/a.png>)。validate为Clean(7 style note(s))：7条选择性轮廓warning及额外4条金属/窗口直边note；不是零警告。保留硬钢边、导轨亮边和直线窗口的理由见来源记录。

同一评者及Lead又实际看了三张原生场景，无新BLOCKING/必要fix；钳端在原生大小下比8×细节弱，保留为非阻断限制。截帧只能说明外观，不能证明复制或时长。

## 只读接线

[描述符](<../src/pages/GamePage/game/data/probeAssets.ts>)使用实际导出帧名；[适配器](<../src/pages/GamePage/game/systems/ProbeSpriteRenderer.ts>)只读phase/x/y/hp/id及既有模拟elapsedMs，真phase优先，绝不从phaseUntil推断另一状态或制造出生/复制。32px/16原点、NEAREST1、无flip/bob/独立时钟；资源、frame/source身份与生命周期全检。

[FactoryRenderer](<../src/pages/GamePage/game/systems/FactoryRenderer.ts>)仅为已成功接管id跳过旧body，失败仍有Graphics fallback；实际红圈/目标框/连接线保留并在depth3，body在2。[WorldScene](<../src/pages/GamePage/game/scenes/WorldScene.ts>)预载并校验四个32px未裁切完整帧，缺图/缺末帧明确报错且不改档。

## 四项原生验收

[测试源码](<../tests/e2e/probe-art.spec.ts>)、[首次4/4日志](<../artifacts/verification/r14-native-probe-01.log>)：合法初始检查点夹具，普通按键/鼠标，原生640×360真实rAF采样；无隐藏世界/改血/传送/假时钟/DOM遮挡。源模板在遮挡排除后仍须四帧签名各异、至少100实色像素/4色、98%命中（RGB容差2）；有非空多色背景正控。

- 正常首跳后见真实tell和红目标框，普通暂停超过3秒仍同像素/四读数。恢复后捕获consume及两seek帧；侧台真消失、空位露出背景，保护主台仍在。
- 普通6次Space攀爬，先一个源匹配体、后两个，新增体相对(+28,-24)，再验证seek暂停；不靠伪造实体或隐藏计数。
- PNG断开/真实consume末帧删除两案例，中文错误、完整档不变、无上传、显式刷新恢复。

实看证据：[预警与目标](<../artifacts/asset-review-r14/native-01/probe-art-native-probe-war-7048c-nd-resumes-both-seek-frames/probe-real-tell-and-target.png>)、[实际consume](<../artifacts/asset-review-r14/native-01/probe-art-native-probe-war-7048c-nd-resumes-both-seek-frames/probe-source-frame-3.png>)、[新增体同屏](<../artifacts/asset-review-r14/native-01/probe-art-ordinary-factory-3c925-body-beside-its-live-parent/probe-real-parent-and-new-copy.png>)。[观测序列](<../artifacts/asset-review-r14/native-01/probe-art-native-probe-war-7048c-nd-resumes-both-seek-frames/probe-native-timeline.json>)首tell为316匹配像素/8色、比例1，目标内部180/180、背景/保护主台各180/180、红预警192；长暂停这些值与checksum相同。它们是canvas内截帧，不宣称覆盖全部DOM叠层，也不由静图推出亲子关系。原生案没有独立精测全部1800/6200ms截止，不是新局连续五章旅程。

## 保留首全门失败与Gato观测修正

[首全门](<../artifacts/verification/r14-final-gate-01.log>)为1002单元、72/73浏览器（9.6m）、exit1。唯一失败是旧Gato反射案：24帧序列前两格gold516、随后0，未得合格6px反射弹；不能算通过，也不能据此断言生产反射规则坏了。

[用例](<../tests/e2e/gato-art.spec.ts>)旧路径在resume后先做截图解码/定位才发60ms鼠标请求，可能消耗650ms真实tell窗或漏掉短输入。现在清→金新窗用原生非空读取器，暂停时准备真实HP锚点准星，resume后仅普通鼠标移动/按住跨两个真实rAF回调；24帧先采再解码，全部保存。不改生产、时钟或反射规则，不宣称精确发射数。6px、x范围、64pxHP、金条和非空多色断言全保留。

[三次独立复测](<../artifacts/verification/r14-gato-timing-02.log>)3/3、49.7s、exit0后，再跑完整门；不是反复盲重跑到绿。Lead实际复看了修后的反射帧。

## 最终完整门

| 检查 | 实际结果 |
|---|---|
| 单元 | 1002/1002，45文件；较R13增加92适配器＋19原生文件测试 |
| 原生浏览器 | 73/73，7.7m，后端启用、无skip；原69全部保留＋新4 |
| 后端 | 23/23；Java17.0.17、新私有PostgreSQL16.14，真实安全/事务/HTTP |
| 其他 | lint/type/build通过；audit0；diff check通过 |

证据：[最终全门exit0](<../artifacts/verification/r14-final-gate-02.log>)、[后端exit0](<../artifacts/verification/r14-backend-tests.log>)、[12件生产/测试/原生文件SHA](<../artifacts/verification/r14-final-source-hashes.json>)。Phaser4.0.0/React19.1.0和包/锁字节保持R13基线；其16件已有代码中仅预期的[场景入口](<../src/pages/GamePage/game/scenes/WorldScene.ts>)/[世界视图](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)/[Gato观测测试](<../tests/e2e/gato-art.spec.ts>)改变，另外13件相同。Phaser大chunk警告仍未解决，不声称低端60FPS。

只读代码评者另实读适配器/Factory/描述符、入口/世界视图/cleanup、Gato用例及相关Core/v1/Phaser常量，静态BLOCKING=0；未把这次审查冒称native通过或全仓历史diff。

## 方法历史与收尾

轮初一次只读bash错误带入禁止的权限字段，已告知并在来源记录保留；不把无明确exit marker的结果当门槛。后续不使用强制该字段的接口，不请求升级。曾发生同名参考层歧义、空layer预览读到活动参考层；仅整理自己新建参考，最终全图用MCP显式原生层导出并实看，未把该参考预览称为完成图。

TTY长多行稿件在写文件前SyntaxError/中断；改用短的转义字符串与读回。委托文件只在核验abs/不存在后exclusive创建；接线一度早于模块出现，立即恢复基线，等SHA读回再接。没有绕过文件拒绝、Lua/headless回退、安装扩展、发布或改其他preset。

[服务清理](<../artifacts/verification/r14-service-cleanup.json>)已按API→PG关闭两自有终端；8081/55439均refused61、pid文件消失，私有cluster保留，前端8080仍HTTP200。下一轮不假定服务存活。

文档同步后再次核验本地链接/12件SHA及lint/type/unit/diff，结果以[收尾日志](<../artifacts/verification/r14-post-document-check.log>)为准。此后不改生产代码。

总体目标仍active：下一轮Sydney及工厂环境，再逐章补齐正式美术、声景/人工听感、丰富种子支路与局外成长、新局连续五章原生旅程。不得把本轮4项检查点夹具或静态评分当完整GDD验收。
