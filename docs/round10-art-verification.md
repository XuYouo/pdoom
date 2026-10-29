# 第10里程碑：伪装者两态与真实E（目标回合11）

2026-10-29，Asia/Shanghai。**本里程碑通过，不代表全量GDD完成。** 保留Phaser4.0.0、React19/TypeScript、Scala3.3.6/Java17、PG16及live Aseprite1.3.18.6-dev。

## 实际交付

[原生源](<../assets/source/deceiver.aseprite>)：48×48、32bit、8帧、9层、6标签，9254字节。[PNG](<../public/game/deceiver.png>)/[JSON](<../public/game/deceiver.json>)为384×48，实际deceiver 0..7.aseprite键；pivot(24,30)在视图描述符中，不伪造atlas slice元数据。

[完整C原生序列](<../assets/reviews/r11-c-native.png>)/[4倍序列](<../assets/reviews/r11-c-large.png>)、[PixelSpec](<../assets/deceiver-pixelspec.md>)、[原提示词和审查历史](<../assets/deceiver-generation.json>)、[素材清单](<../assets/enemy-manifest.json>)。共享20项palette实际14色，硬alpha，精确主角橘色0，8帧唯一；足底y44、x18..23及28..33，中缝24..27跨8帧一致，不误锁整段底部RGB。原Clawd四腿与旧两家族不改。

## 审查与接线

工具参考仅作对照，正式像素由live Aseprite逐层绘制。A匿名冷读后规格4/10：兽头/双耳、碎片像手，均阻断；B关键帧6/10仍有耳孔，未传播。第2轮C消除闭环、改开放S臂/低垂臂，靠拢可拼合的原笑脸半片；关键帧和全8格7/10无BLOCKING，停止结构修饰。真实背景/5与8核心圈另经只读检查，无视觉阻断；轻微线条拥挤与平台顶沿重叠保留说明，环境仍blockout。

validate0错误、11条outline风格说明：兜帽内冷色躯干边、无描边发光节点、裂牌亮边。无strays/越色/软alpha/空层/帧范围/tag错误。完整序列、关键帧对照、卷须onion和实际画布已看；未以单层预览冒称整张序列。

[描述符](<../src/pages/GamePage/game/data/enemyAssets.ts>)/[单一renderer](<../src/pages/GamePage/game/systems/EnemySpriteRenderer.ts>)只取finite模拟时间<真实insightUntil，等号回友态。元数据400/600/180/140×2不替代实际600/1550ms FSM；不增墙钟定时器、不改Core/DTO。[WorldRenderer](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)独立depth3核心高于depth2图片、在handled-return前画、每draw清空且销毁。原24×24身体、y−19、r5/8与一击规则不变。

## 真实机制与全门

[新增55单元](<../tests/rendering/deceiverSprites.test.ts>)，rendering161/161，原parrot41/repeater36共77案例保留；只合法更新清单三类及各自frameCount期待项，复读机专属4帧不放宽。新e2e夹具曾因inventory推断string[]导致typecheck失败，已用GameSaveData上下文修复，无any。task19正常complete/rev3，旧task10/12未触碰。

[新五项原生](<../tests/e2e/deceiver-art.spec.ts>)只读截图并发正常键鼠：E显露，暂停4.3秒仍保持E且像素/时钟逐字节冻结，正常到期恢复；Space跳跃后对实际节点仅一次20ms点击，r5/8均真实击破，角色/标记消失且出现核心反馈；缺PNG/第8帧报错保档重试。无隐藏引擎口、传送或改血。观察直径9.7778/16逻辑像素，友态紫色0、E态约321–332（帧可变）、到期/击破后0。

| 验收 | 实际结果 | 日志 |
|---|---|---|
| 首原生局部 | 5/5 | [first](<../artifacts/verification/r11-native-first.log>) |
| 关键机制独立重复 | 6/6 | [repeat](<../artifacts/verification/r11-native-repeat.log>) |
| 新私有PG的Scala/安全/HTTP | 23/23，14秒 | [backend](<../artifacts/verification/r11-backend.log>) |
| 全单元/原生 | 644/644（39文件）、58/58（5.9分钟，无skip） | [full gate](<../artifacts/verification/r11-final-gate.log>) |

lint/type/build/audit0/diff全过；全门bash-98317b6b6ee44881 exit0。原53浏览器全部保留：云/分数、三结局、旧素材、WebGL、PCM、五章关键玩法及多比例/单画布/Fullscreen/双Escape。实际镜像71HP、+26,450ms、79次观察、95敌方像素并胜利；不是从新局连续五章浏览器通关。

## 冻结最终画布

![友态](<../artifacts/asset-review-r11/friendly.png>)

![E显露与真实目标](<../artifacts/asset-review-r11/revealed.png>)

该帧恰遇现有80ms无敌闪烁相位，Clawd暂不可见；并非E隐藏玩家，也未修图补画。规则见[ClawdRenderer](<../src/pages/GamePage/game/systems/ClawdRenderer.ts#L59-L62>)，真实跳跃与击破另由原生脚本验证。

[升级核心](<../artifacts/asset-review-r11/core-8.png>)、[默认击破后](<../artifacts/asset-review-r11/defeated-5.png>)、[升级击破后](<../artifacts/asset-review-r11/defeated-8.png>)、[到期](<../artifacts/asset-review-r11/expired.png>)。均从最终全门原图逐字节复制，无裁切/修图；两张主画布由Lead复看。

## 服务与剩余工作

本轮仅使用新私有[pg-test.0z1YOK](<../backend/.local/pg-test.0z1YOK/>)，不连宿主集群/凭据。API bash-fa50838cc6f84f6c 与PG bash-4081b5bebc954042已停止并收集Hikari/数据库正常关闭日志；8081/55439实测无监听，数据目录保留。原8080前端job bash-20cdfdd0ce7646f0继续；根页/主模块/样式/新PNG及JSON实测HTTP200。离线可玩；云端需按[后端指南](<../backend/README.md>)另启指定服务，临时验收数据库不是常驻生产服务。

Phaser约1,352KB大chunk提示仍在，不宣称低端稳定60FPS或用数字PCM代替人工听感。下一优先为Gato三形态、第一章环境，再扩展其他章；完整声景/触控/局外内容与新局连续五章原生流程仍待补齐。参见[开发进度](<development-plan.md>)，总体目标继续，未标全量完成。
