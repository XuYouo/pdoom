# Gato三形态验收（目标回合12）

2026-10-29，Asia/Shanghai。**本里程碑全门通过；全量GDD仍未完成。** 保留Phaser4.0.0、React19/TypeScript、Scala3.3.6/Java17、PG16及live Aseprite1.3.18.6-dev。

## 正式资源与来源

[可编辑源](<../assets/source/gato.aseprite>)为96×96、32bit、12帧、11层、12个state标签，20,304字节。[PNG](<../public/game/gato.png>)/[JSON](<../public/game/gato.json>)是1152×96，实际12键，pivot(48,48)在视图描述符，不伪造atlas slice。正式PNG与已审[完整C序列](<../assets/reviews/r12-c-full-native.png>)逐字节同SHA-256。

[PixelSpec](<../assets/gato-pixelspec.md>)、[Boss清单](<../assets/boss-manifest.json>)及[生成记录](<../assets/gato-generation.json>)保留原提示词、输入、裁框及取舍。两参考实际2170×725/2172×724，不是请求的1536×1024；high仅为请求，实际quality未报告。参考只作设计，原生重新绘制；正式源无参考/草图层。

## 静态审查与机械检查

A关键帧7/6/8，中间压具像固定底座而阻断；一次修复后B为7/8/8，A→B像素差分0/604/0。12格C整体8/10、无结构阻断，停止结构修饰。下砸带左向分量、挡板pose依赖真实金条，均保留说明。

团队名额上限使新fresh评者创建失败，复用visual-reviewer先无本轮规格读图、冻结解释后再给合同，**不是fresh-context冷读**。骨架S/E/P是设计约束，不冒称栅格反算。整序列、三张4倍阶段条带、逐pose参考对照及压具filmstrip/onion均实际查看；单层不冒称全图。

validate全项为`Clean (31 style note(s))`、0错误，工具只返回前15条outline详情；不声称逐一审过未返回坐标。选择性金属边/无黑圈小灯保留。排除轮廓的严格机械门Clean，另4条终端38px直边note有意保留，不为机器刚性直边添加抖色，也不宣称严格全项零警告。

实测20项源palette、15不透明色、硬alpha0/255、精确主角橘色0、12帧可视唯一；墨迹全在52×74包络x22..73/y11..84，金条区/外缘透明。phase2只有后承托，attack压具触底，不能假设全12双脚一致。旧Clawd和三小怪源未改。

## 只读接线

[描述符](<../src/pages/GamePage/game/data/bossAssets.ts>)/[Gato renderer](<../src/pages/GamePage/game/systems/GatoSpriteRenderer.ts>)只按真实phase/action选帧、真x/y定位、固定朝左；无动画墙钟/FSM，不提前用targetX定位。开战recover1200、换态recover850和常规650/850/650预警、260攻击、1050/1050/620恢复均由Core决定，idle600只是图集元数据。

[WorldRenderer](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)在死亡早退前清理图片。真实6×86金条、112宽落点柱/框、112宽280ms冲击及Gato战斗实际子弹在depth3，图片depth2；旧Deceiver核心平面、HP/门/标签保留，其他章弹幕层次不变。phase2首次attack快照仍处旧位、下tick才到落点的既有语义不补偿。

[WorldScene](<../src/pages/GamePage/game/scenes/WorldScene.ts>)验证完整12帧，缺图/帧必须中文失败，不用fallback掩盖加载失败。Core、碰撞、伤害、v1 DTO/API及四动作计数均不改。

## 原生探针揭出的回归

第一次近身左跳后探针失去精确HP色；该探针尚未finally松鼠标，诊断前自然清关52HP/00:22，所以不计作三态完整证据。保留失败，并为后续所有观察段加输入释放。排查发现本轮层次回归：warning升到depth3而HP留在depth0，打破了旧的先预警后血条顺序。

Lead仅修Gato HP/竞技场门在cues3后画、标签depth4；其他Boss原层、实际颜色/尺寸/伤害/素材不变。修后全typecheck和scope lint明确exit0；新合法cp2探针沿原左跳路线，在实际覆盖中读到HP原色left448/y192.89/w30.22/h4，并看到7个分离字幕块。随后正式scope02和完整全门均通过，不以改站位或染色fallback替代。

visual-reviewer已实际查看金条、修后tell/attack/overlap及字幕五图，无新增可读性/遮挡阻断，保留C静态8/10。冲击下缘暖染、提示柱降低局部对比属非阻断；七个粉紫块可分辨，但不是块内可读文字。该审查非fresh，也不证明时长/轨迹/碰撞或具体depth代码。

## 最终验证

[Gato78项](<../tests/rendering/gatoSprites.test.ts>)及rendering239/239通过，包含精确15色集合、源/像素、真Core边界与生命周期。[两实战](<../tests/e2e/gato-art.spec.ts>)/[两资源](<../tests/e2e/gato-resources.spec.ts>)先独立4/4，再在全门重复4/4。

| 门 | 实际结果 | 证据 |
|---|---|---|
| 实战scope02 | 2/2、46.6s，type/lint0 | [run-02](<../artifacts/asset-review-r12/gato-native-run-02/>)，pty-send-f391be8f2f1e45ed |
| 资源scope | 2/2、7.6s，type/lint0 | [结果](<../artifacts/gato-resource-results/.last-run.json>)，bash-a1760a112e124d79 |
| 全单元 | 722/722、40文件、1.43s | [完整日志](<../artifacts/verification/r12-final-gate.log>) |
| 完整原生/后端开启 | 62/62、5.4分钟、无skip | [完整日志](<../artifacts/verification/r12-final-gate.log>) |
| 本轮Scala/安全/真实HTTP/PG | 23/23、无skip | backend job bash-b6746993918e4c94，初始新私有PG |

lint/严格类型/build/audit0/diff全过，终端pty-7明确`R12_FINAL_GATE_END [exit code: 0]`，不是inferred_idle推断。原58浏览器全保留，含真实云/分数、三结局、旧资产、PCM/WebGL、多比例/单画布/双Escape。Phaser大chunk仍1,352.48kB，不声称低端稳定60FPS。

真实金条/6px回弹、4.4秒暂停同像素/时钟、112落点与两地波、7个14×6字幕块、重叠HP、胜后及换章清理均过。仅单次rAF只读canvas.toDataURL，活体cassette>20、同arena死亡cassette/HP/gold=0，且每次opaque>95%/颜色>12；不靠UI遮罩或空WebGL缓冲假过。全门胜利66HP、32shots、elapsed23850（夹具10000，净+13850ms），不是人类平均时间。

首正式run01失败保留：反射采样漏过、43.11px合法2/3血条误被<43拒绝。修为60ms正常单发（仍小于185ms冷却）、实际画布采样与理论端点+1原生像素误差；不改Core、不删重叠/七发断言。新Pixels初始化曾type2，改完整typed literal后通过。

Task22实际交付/清理已完成，但complete调用被自动审查拒绝，板上仍in_progress/rev3；未换路强改。Task20/21/23/24正常完成。该状态不冒称仍有浏览器在跑。

## 最终原生画布

![七个真实字幕块与终端皮肤](<../artifacts/asset-review-r12/final/gato-seven-captions.png>)

![预警覆盖时HP仍清楚](<../artifacts/asset-review-r12/final/gato-overlap-hp.png>)

[活体实际canvas](<../artifacts/asset-review-r12/final/gato-alive-canvas.png>)/[同arena击败后canvas](<../artifacts/asset-review-r12/final/gato-defeated-canvas.png>)、[真实回弹](<../artifacts/asset-review-r12/final/gato-reflected-shot.png>)、[下砸](<../artifacts/asset-review-r12/final/gato-arm-impact.png>)。12份最终图均从完整全门产物逐字节复制至[冻结目录](<../artifacts/asset-review-r12/final/>)，不裁切/修图；Lead复看两张主图及死亡raw图。raw图是真canvas而非带React遮罩的页面截图，二者标明区分。

## 服务与剩余范围

最初的[pg-test.Mk2bI4](<../backend/.local/pg-test.Mk2bI4/>)确实完成23/23，但teammate下一turn发现旧job句柄不可用、PG PID2866及postmaster.pid已不在、两端口关闭；停止原因未知，不记为主动正常收尾。旧目录保留。

Lead随后用持久终端pty-5新建[pg-test.8ImGX9](<../backend/.local/pg-test.8ImGX9/>)（PG16.14/PID16413/55439），createdb明确exit0；pty-6 Main/Hikari启动并绑定8081。全门后已按API→PG收尾：Main收到取消并关闭其完整终端进程树；PG记录fast shutdown、checkpoint及database system is shut down。pty-5/6/7均已关闭，lsof实测8081/55439无监听。8080前端`bash-20cdfdd0ce7646f0`继续；未动DSH GUI、系统安装、外部发布或宿主数据库。

原生夹具只在启动前设置支持的cp2 DTO，之后正常键鼠；无隐藏world/传送/改血/改时钟/假历史，**不是新局连续五章浏览器通关**。环境及其他章素材、完整声景/局外内容、触控和最终性能仍未完成，总目标继续。

文档/清单最终同步后，额外[复核](<../artifacts/verification/r12-post-doc-check.log>)再次722/722（1.52s）、diff exit0；6份相关Markdown本地链接、三正式文件SHA-256与两原提示词UTF-8长度3425/2961均复核通过。此阶段只改文档/来源元数据，运行源码与正式像素保持冻结。
