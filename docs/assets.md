# 资源来源与制作状态

## 当前：Clawd、四类敌人/探针、Gato及第一章环境原生资源，其余素材仍在补齐

| 资源 | 实际来源与状态 |
|---|---|
| Clawd 三形态 | 用户提供的[SVG参考副本](</Users/ocean/code/pdoom/assets/references/claudecode-color.svg>) → 专用工具image-to-image设计参考 → Aseprite MCP手工像素解释 |
| 可编辑源 | [clawd-svg.aseprite](</Users/ocean/code/pdoom/assets/source/clawd-svg.aseprite>)，32×32、7层、8帧、13色palette含透明 |
| 基础 / 面具 / FOOM | [基础PNG](</Users/ocean/code/pdoom/public/game/clawd-aligned.png>)、[面具PNG](</Users/ocean/code/pdoom/public/game/clawd-masked.png>)、[FOOM PNG](</Users/ocean/code/pdoom/public/game/clawd-foom.png>)；各256×32，配同名JSON |
| UI标记 | [clawd-mark.svg](</Users/ocean/code/pdoom/public/game/clawd-mark.svg>)原样复用用户提供的SVG，不改原文件 |
| 随机鹦鹉 | [live Aseprite源](<../assets/source/parrot.aseprite>)、[PNG](<../public/game/parrot.png>)/[JSON](<../public/game/parrot.json>)；48×48、6层4帧，20项源palette/11不透明色，闭合字典与折翼明确可读；模拟时钟选idle/tell/recover，碰撞不变 |
| 复读机 | [live Aseprite源](<../assets/source/repeater.aseprite>)、[PNG](<../public/game/repeater.png>)/[JSON](<../public/game/repeater.json>)；48×48、6层4帧、12实际不透明色；分离轮盘孔槽、3px前扬声器与状态灯，硬壳/脚位置固定，24×24碰撞不变 |
| 伪装者 | [源](<../assets/source/deceiver.aseprite>)、[PNG](<../public/game/deceiver.png>)/[JSON](<../public/game/deceiver.json>)；48×48、9层8帧、14不透明色；E真实窗口切换友态/显露态，核心独立前景绘制；[已验收](<round10-art-verification.md>) |
| 冯诺依曼探针 | [源](<../assets/source/von-neumann-probe.aseprite>)、[PNG](<../public/game/von-neumann-probe.png>)/[atlas](<../public/game/von-neumann-probe.json>)；32px/4层4帧/9不透明色，真实phase与模拟时钟选帧、复制仅来自Core；[原生及全门通过](<round14-probe-verification.md>) |
| Gato三形态 | [源](<../assets/source/gato.aseprite>)、[PNG](<../public/game/gato.png>)/[JSON](<../public/game/gato.json>)；96×96、11层12pose、15不透明色，原52×74身体不变；静态8/10并已接线，[原生/全门通过](<round12-gato-verification.md>) |
| 第一章地形kit | [源](<../assets/source/chapter-one-tiles.aseprite>)、[PNG](<../public/game/chapter-one-terrain.png>)/[map](<../public/game/chapter-one-terrain.json>)；32种16px片、96×96/6列；运行使用9角色、12px台/40px地面精确裁切，原生map不作物理 |
| 第一章道具 | [源](<../assets/source/chapter-one-props.aseprite>)、[PNG](<../public/game/chapter-one-props.png>)/[图集](<../public/game/chapter-one-props.json>)；8静态64px帧、512×64；树干socket/落地/真实蘑菇均验，[环境清单](<../assets/environment-manifest.json>)与[全门结果](<round13-environment-verification.md>) |
| 第五章镜像 | 重用同一套Clawd三态资产；安静镜面是只读投影，对决使用现有FOOM图集。共享渲染适配器，不生成另一只形状不一致的角色；没有新增Aseprite成品资产 |
| 三结局演出 | 项目内CSS/SVG与有限24个DOM回形针；场景、椅子、触手、虚拟窗口仍为临时表现，不冒称完整像素过场动画 |
| 未列出的敌人/Boss与环境 | 仍是Phaser Graphics blockout。实际弹幕/伤害提示继续由Core几何绘制，不烘焙到皮肤；不据此声称专用攻击与场景资产齐全 |
| UI文字 | 项目内HTML/CSS/Tailwind与系统字体，没有外部字体请求 |
| 音频基础 | [原创谱面](<../src/pages/GamePage/game/audio/score.ts>)与[原生合成图](<../src/pages/GamePage/game/audio/SynthGraph.ts>)：120BPM四stem、独立SFX、动态吞音/恢复，运行时Web Audio合成，不加载第三方录音。未复制《I'm Upping My P(Doom)》录音或歌词，未下载第三方歌曲 |

## 来源与权利

- 用户参考来自本地下载目录；未独立核验其原始作者与再分发许可。项目中的引用不构成商标或素材权利授权。
- Clawd/Claude为GDD指定的同人题材引用，本项目不是Anthropic官方产品；实际发行前必须复核品牌、图形与音轨权利。本轮没有上传、发布或对外分发。
- Phaser引擎与模板保留各自MIT许可；代码的MIT声明不自动覆盖品牌参考、生成概念或其衍生图形。
- 早期两次Clawd生图模型与完整提示词保存在[生成记录](</Users/ocean/code/pdoom/assets/generation.json>)。第一版圆蟹/六足概念被用户SVG纠正后弃用，不进入runtime。
- 鹦鹉的[设计参考](<../generated-images/image-20261028-171208-d2988d.png>)、成功请求原文/实际输入与修复历史见[独立来源记录](<../assets/parrot-generation.json>)。输入既有Clawd参考作风格依据，未改原文件；最终像素全部另行手工绘制，未把参考缩图冒充精灵。
- [SVG图生图三态参考](</Users/ocean/code/pdoom/generated-images/image-20261027-201722-6cf3cf.png>)仅为参考，没有直接缩放当成最终精灵。

## Clawd质量合同

完整尺寸、palette、pivot、动画时序、限制和冷评记录见[美术规格](</Users/ocean/code/pdoom/assets/art-direction.md>)。

- Aseprite8帧有idle/run/jump/hurt标签；尚无专用attack帧。运行时按模拟时间选帧，因此暂停/休息室不会继续播放。
- 独立冷读发现内腿过暗；修正后基础态和FOOM均8/10、无剩余阻塞。已实际检查32px原生图和8格条带，不声称静态条带证明播放流畅度。
- 最终像素只读扫描：alpha仅0/255；基础3色、面具6色、FOOM10色；三图全部在源palette内，idle四腿主色及间隙通过。
- validate为0错误，不是零警告：保留FOOM触手高光引起的8条选择性描边warning及矩形顶光/无整圈描边style note，理由已记录。
- 图集几何、帧名、duration及tag由[资产测试](</Users/ocean/code/pdoom/tests/game/assets.test.ts>)核对。游戏内可读性由真实浏览器截图另行确认，不能只用源图测试代替。
- 原创声音的工程验收使用真实Chrome OfflineAudioContext和实机旁路PCM，验证四层非零、吞音归零、恢复及SFX独立性；来源、旧失败与修正见[音频基础验收](<round5-verification.md>)。没有人工试听结论，也没有声称已完成全章声景、全部动作音效、最终混音或音频硬件适配。

第五章镜像、空房、三结局与最终实际上传的游戏内截图已在[第6里程碑](<round6-verification.md>)复看；该历史里程碑没有新绘sprite或把CSS/Graphics表现冒称Aseprite成品。既有主角资源仍保留同一palette、四腿身份和源文件。

## 鹦鹉质量合同

[PixelSpec](<../assets/parrot-pixelspec.md>)与[敌人清单](<../assets/enemy-manifest.json>)记录实际48px、6层、4帧与pivot(24,30)。首稿独立冷读6/10因书不可读阻断；一次书/胸/翼定点修复后brief-aware复验8/10，无剩余视觉BLOCKING，未伪称二次盲测。真实深蓝绿场景中的[抬书](<../assets/reviews/r8-game-raised.png>)/[收书](<../assets/reviews/r8-game-lowered.png>)也经独立只读审查；没有金圈时仍可辨认，不外推到所有背景。

最终validate为0错误、16条选择性描边style warning；真实PNG硬alpha、11色、双脚底y44/中缝x24、每帧眼高光1px、精确主角橘色0均通过。41项[适配器/文件测试](<../tests/rendering/enemySprites.test.ts>)与[原生测试](<../tests/e2e/enemy-art.spec.ts>)另核对文件/生命周期、相对眼点的抬书、暂停同像素、缺PNG/帧明确失败并保留存档；不能把静态图替代动作时序测试。详见[第7里程碑](<round7-art-verification.md>)，其中全量回归状态单独记录。

## 复读机质量合同

[PixelSpec](<../assets/repeater-pixelspec.md>)与[来源记录](<../assets/repeater-generation.json>)保留唯一实际参考请求、2168×600裁框/四面板导入和手绘取舍。首稿冷读先认成双眼机械脸，规格核对6.5/10阻断；一次盘内分离孔槽/小轴和tell凹槽修复后brief-aware7.5/10无BLOCKING。真实[前推](<../assets/reviews/r9-game-tell.png>)/[回收](<../assets/reviews/r9-game-recover.png>)场景独立复验通过，不伪称第二轮盲测或所有背景皆已覆盖。

validate0错误，工具报告`Clean (12 style note(s))`；单像素轴心、选择性硬金属亮边与直线提示保留有解释。正式PNG12色/硬alpha/主角橘色0/四帧同足底/硬壳alpha固定通过[36项新增测试](<../tests/rendering/repeaterSprites.test.ts>)；[原生三项](<../tests/e2e/repeater-art.spec.ts>)双重复6/6，真实提手相对格栅位移3.0189px、暂停图像冻结、缺PNG/帧保档与重试通过。当前完整526/48/23门与服务边界见[第8里程碑](<round8-art-verification.md>)。

## 伪装者与Gato的阶段证据

伪装者的[规格](<../assets/deceiver-pixelspec.md>)/[来源](<../assets/deceiver-generation.json>)/[第10里程碑](<round10-art-verification.md>)记录C版开放卷须、真实E与5/8px核心单击击破、4.3秒暂停/到期、缺图/帧恢复及644/58/23历史全门；前述资源表已同步，不再漏列它。

Gato的[规格](<../assets/gato-pixelspec.md>)/[来源](<../assets/gato-generation.json>)/[独立Boss清单](<../assets/boss-manifest.json>)记录两张概念/动作参考、逐格导入、12pose与单次压具修复。因团队名额限制复用评者，明确非fresh冷读；C静态8/10、31条轮廓风格提醒和4条直边note有说明，真实运行与全门结果在[本轮记录](<round12-gato-verification.md>)单独验收。

## 第一章环境准入

[PixelSpec](<../assets/chapter-one-environment-pixelspec.md>)/[完整溯源](<../assets/chapter-one-environment-generation.json>)保存一次真实参考请求、原文、实际2172×724、逐项裁框及六文件SHA。正式源为live手绘，32片唯一、hardalpha、主角橘色0、12px薄台/边框变体/树socket以及原绘与packedRGBA一致。静态两组各7.5/10且非fresh，props4条选择性轮廓warning有记录；入口、森林、竞技场与修后顶端HUD均实际复看，无必要新fix。

以真实世界投影平台/菇/裂纹，不另定动画或坍塌时钟。7个新原生案在**891单元/69浏览器/23新私有PG后端**完整门中重复通过；正常输入、背景源像素正控、暂停/rest/WebGL与失败重试均保留。当前只使用9/32种tile角色；旗帜/捐款/其他物品仍Graphics，不冒称所有第一章或全游戏资产齐全。详见[本轮验收](<round13-environment-verification.md>)。

## 冯诺依曼探针准入

[PixelSpec](<../assets/probe-pixelspec.md>)/[来源记录](<../assets/probe-generation.json>)保存失败空reference请求、成功工具原文/实际2172×724及手绘取舍。4层4帧、5个真实linked cel；原生源独立重建逐帧等于PNG。128×32、9色、hardalpha、主角橘色0、半径11不变；不从参考缩图制成素材。

非fresh匿名冷读先保留腿/吊臂歧义，brief后7/10、0BLOCKING、0必要fix；原生场景复看也0阻断，钳端在1×比放大图弱。validate为7条选择性轮廓warning＋4条硬直边note，不是零警告。4个真实浏览器案例覆盖吞台/背景与主路正控、普通攀爬真复制、长暂停、缺PNG/末帧保档；最终1002/73/23完整门及旧Gato观察失败/修复见[本轮验收](<round14-probe-verification.md>)。Sydney与工厂环境仍blockout。

## 后续准入

敌人、Boss、场景tiles与后续动画仍需走预检、分层、像素制作、实际预览、独立审查、validate、导出与引擎内检查。没有最终资产的部分继续明确标blockout，不用概念图或脚本绘制冒充已完成的像素资源。
