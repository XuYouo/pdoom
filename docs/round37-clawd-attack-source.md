# R37 — Clawd专用攻击姿态源候选

**源候选已完成并验证，但尚未接入正式游戏。** 本轮不改运行时代码、正式Clawd源/图集、碰撞、射击、v1/API或休息室。
最新实际完整浏览器/后端验收仍是[R36的153/23](<round36-human-rater-integration.md>)，不是本轮新跑。

## 原生交付与边界

[候选原生源](<../assets/source/clawd-attack-candidate/clawd-svg.aseprite>)保留32×32、七层、十三色、四腿结构和(16,27)脚底锚点。
旧八帧的每层像素、位置、透明度和时长逐项不变；新增十四姿态，共二十二帧。
[规格](<../assets/clawd-attack-pixelspec.md>)、[来源/候选标记](<../assets/clawd-attack-generation.json>)与
[三态PNG/JSON](<../assets/candidates/clawd-attack/>)配套；每态704×32，未裁边、padding0、原生1×。
原[正式八帧源](<../assets/source/clawd-svg.aseprite>)与正式三态PNG/JSON保持原字节。

| 1-based帧 | 用途 | 时长 |
|---|---|---|
| 1–8 | 原idle/run/jump/hurt | 400/600/100/70/100/70/100/120ms |
| 9–15 | 对应原1–7的出手变体 | 每个83ms |
| 16–22 | 对应原1–7的回落变体 | 每个50ms |

**后两组是姿态矩阵，不是顺序播放的七帧攻击循环。** 运行时应保留当前步态，再按真实出弹后的83/50ms选相应变体。
没有玩家蓄力延迟、额外命中框、假子弹或新动画时钟；伤害姿态仍优先使用原第8帧。
出手时躯干/面具后退1px，出手侧短臂上抬2px并增加1px前臂连接；回落上抬1px。
掌端只用已有暖高光，两组腿和触手保持对应步态；基础/面具/FOOM仍分别为3/6/10种不透明色。

下图从左至右是原姿态、出手、回落，均由原生工具导出，不是游戏截图：

![原姿态、出手、回落](<../artifacts/verification/r37-phase-aligned.png>)

[FOOM三阶段](<../artifacts/verification/r37-phase-foom.png>) ·
[基础22格](<../artifacts/verification/r37-review-aligned.png>) ·
[面具22格](<../artifacts/verification/r37-review-masked.png>) ·
[FOOM22格](<../artifacts/verification/r37-review-foom.png>)。
七张原生预览和手臂filmstrip/ascii已实看；仅同Lead带上下文审查，**不是独立冷读或实战节奏验证**。
既有SVG式方身体、双眼与四腿保留；只延展已定稿的rig，没有新生图/新参考冒称。

## 本轮实际检查

- [源专门测试](<../tests/rendering/clawdAttackSource.test.ts>) **166/166**，实际EXIT0/2.050秒。
- [只读独立解码器](<../tests/rendering/clawdAttackCodec.ts>)不导入Phaser或生产选帧逻辑；重建ASE链接cel与PNG filter/CRC。
- 66帧每RGBA字节对齐；原24个正式导出帧不变；各层硬alpha/调色板、十四变体、脚底透明余量与所有图集角色均检查。
- 反例拒绝末帧缺失/别名/错尺寸/裁边/错名、错形态、缺手、1通道颜色错误、idle冒充出手、错误联动位置、软alpha、越界实像素、坏CRC/ASE链接。
- 本轮[全unit](<../artifacts/verification/r37-unit-all-01.json>) **5692/79文件**，实际EXIT0/6.449秒；types/lint/build均实际EXIT0，lint零warning预算。
- Aseprite全七层可见时报告Clean、58条风格提示，其中有触手轮廓warning；**不是零警告**。沿用未变的选择性触手高光与SVG直线暖边，不为消除通用风格提示破坏参考。
- 源/候选导出写入只走live原生工具，普通脚本仅做只读解码、测试/文档和校验记录；未启用Lua、未切换headless。

## 保留的真实问题

当前duplicate按源帧之后插入，未按afterFrame追加；最初两次复制由原生reorder移到末尾，随后逐次重排并证明原八帧完整。
链接cel的位置会联动，首次检查抓出跑步手臂高差被压平；保留[错误原生快照](<../artifacts/verification/r37-linked-offset-mismatch.aseprite>)，
解开四个需要独立位置的cel后通过[十四姿态逐项检查](<../artifacts/verification/r37-pose-matrix-control.json>)，不放松坐标/像素期待。
最初只读检查器未处理ASE type1，按真实链接格式补齐；没有改原生文件来迁就解码器。
原资产规范中的历史下载SVG链接失效，已改指仍存在的项目原样副本；没有向下载目录写文件。该旧规范不在R36的452路径清单内，本轮首次纳入，不伪称它是新文件。

## 下一步：真实出弹接线，不能从按键猜

[玩家射击](<../src/pages/GamePage/game/systems/combat.ts#L11-L32>)和[镜像出弹](<../src/pages/GamePage/game/systems/mirror.ts#L95-L105>)成功创建子弹后才有真实发射事实。
应记录模拟时间的瞬态发射收据，放入脱离旧快照的Player运行态，不加入存档/API；新局/恢复/新尝试不得从旧累计次数推测正在射击。
按键、shotReadyAt、还活着的旧子弹都不是充分证据；满池、冷却、回溯、石化等拒绝路径不能制造动作。
当前真实发射原点是(actor.x,actor.y-3)，本包是出手手势，不更改枪口/瞄准规则。
还须验证暂停/失焦/休息冻结、受击优先、三形态与左右朝向、空中/跑步、镜像、资源故障/恢复及真实canvas原生匹配，再跑新的完整浏览器/隔离后端门。

原游戏8080保留，用户数据库pointer不动；本轮不启动新API/PG。模型切换仍未核实，八助手没有再唤醒。
完整GDD仍未完成：攻击运行时、终局/完整声景、种子内容、局外成长、输入辅助和最终性能/人类体验等继续推进。
