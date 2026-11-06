# Clawd 像素资产规范 v3 — SVG身份与真实射击姿态

## 已采用的设计

- 用户提供的 Clawd SVG 原样保存在[项目参考副本](</Users/ocean/code/pdoom/assets/references/claudecode-color.svg>)，并渲染为[导入参考 PNG](</Users/ocean/code/pdoom/assets/references/clawd-reference.png>)。R37检查发现历史下载位置已不是有效本地链接，故保留可用的项目副本链接；未写回下载目录。
- 身份特征：平顶矩形身体、两枚竖向镂空眼、两侧方形短臂、**四条短腿**；主体精确颜色 `#D97757`。不是圆蟹、六足或带耳朵的人形。
- 用户进一步要求使用 image-to-image 后，专用生图工具以该 PNG 作为 `reference_images` 生成[三态参考表](</Users/ocean/code/pdoom/generated-images/image-20261027-201722-6cf3cf.png>)。实际输出2172×724，模型gpt-image-2.5。它只决定变体设计，不直接缩小充当像素精灵。
- 更早的[圆蟹概念](</Users/ocean/code/pdoom/generated-images/image-20261027-193225-d188e5.png>)和[废弃草稿](</Users/ocean/code/pdoom/assets/source/clawd-rejected-draft.aseprite>)明确弃用，没有进入游戏构建。

## PixelSpec 与引擎合同

- Phaser实际版本4.0.0；逻辑画面640×360，最近邻采样（实际Phaser4.0.0的filter code1）。每帧32×32 RGBA，源像素只有0或255透明度。
- body `(4,7,24,16)`；眼孔 `(8,11,2,4)` / `(22,11,2,4)`。
- 手臂 `(0,15,4,4)` / `(28,15,4,4)`。四腿idle分别位于x=6、10、20、24，y=23，每腿2×4px。
- 原生pivot `(16,27)`，落在模拟角色脚底 `(player.x, player.y+11)`。现有碰撞体16×22不变；横向短臂与FOOM触手是装饰，不扩碰撞体。
- 正面矩形身份随横向移动；向左时可镜像，非另画的侧面视角。
- 原形不加整圈描边，仅1px暖顶光和下缘阴影，保留SVG硬角和方块比例。
- 面具为方形象牙白面板，保持双眼间距并增加固定笑脸；Doom>50启用。
- Doom>80在面具后增加4根蓝紫阶梯触手。侧触手在手臂上方，不与脚底竞争；触手末端薄荷亮点是有意的边缘高光。

## 调色板

13项含透明：`#00000000 #2c2330 #d97757 #eaa083 #b55a4a #783f4a #f5e8c8 #cbb696 #34354f #575c79 #858eb0 #9dded1 #d9ffea`。

导出实际不透明颜色：基础态3色、面具6色、FOOM10色。所有绘制保持paletteLock；没有半透明插值、噪声dither或外部缩放写回。

## 可编辑源与动画

[原八帧源](<source/clawd-svg.aseprite>)作为独立oracle保留；当前[22帧可编辑源](<source/clawd-attack-candidate/clawd-svg.aseprite>)沿用七层：tentacles-back、legs-far、arm-far、body、legs-near、arm-near、mask。面具/触手默认隐藏，以基础态打开。

| tag | 1-based帧 | 毫秒 | 行为 |
|---|---|---|---|
| idle | 1–2 | 400 / 600 | 身体下沉1px，脚底不变 |
| run | 3–6 | 100 / 70 / 100 / 70 | 两组短腿错相、接触与抬身交替；风格化快步，不宣称精确真实步幅 |
| jump | 7 | 100 | 收腿但保持四腿可读，空间轨迹由模拟决定 |
| hurt | 8 | 120 | 核心后退1px，身体与面具同步，不改碰撞体 |

[R37十四姿态源](<../docs/round37-clawd-attack-source.md>)已由[R38](<../docs/round38-clawd-attack-integration.md>)接入真实发射：fire为1-based9–15、recover为16–22，分别对应原基础步态1–7，不是七帧循环。模拟发射年龄[0,83)/[83,133)切出手/回落，不重启原步态。三态正式PNG704×32/22帧与冻结候选字节一致；原八帧保持，native不trim、padding0，整数位置/NEAREST1，不新增物理或掌心子弹原点。

## 原八帧历史审查与修复

- 独立冷读最初把暗内腿读成2条腿，评分6/10；已将四腿统一为主体橘色，并让跳跃腿保持可见长度。
- 下侧触手曾被读成额外脚，已上移。独立复核实际查看[原生32px](</Users/ocean/code/pdoom/assets/reviews/a-native.png>)、[放大基础态](</Users/ocean/code/pdoom/assets/reviews/a-fixed.png>)、[FOOM八格](</Users/ocean/code/pdoom/assets/reviews/c-fixed.png>)及原生图集：两项8/10、无剩余BLOCKING。原冷读未被事后改写。
- Aseprite validate：0错误；全FOOM可见时8条触手选择性描边warning、16条style note。保留理由：高光刻意接触轮廓；矩形顶光长直边是SVG式方块包边，不是试图表现圆曲面。没有把这些报告称为“零警告”。
- 独立像素只读扫描通过：三图均256×32，alpha仅0/255，全在palette内；idle四腿主色与间隙逐像素确认。
- 本页原八帧的初始制作采用项目资产批量headless输出（R37另用live副本扩展，原源不改）；工具更新曾重置未保存画布，已重建并分步保存，没有回退修改sprite二进制，也未改live用户文档。
- 游戏内截图与最终浏览器验证另记，不能由源图冷评代替。

## R38当前边界

新增姿态只作真实出弹反馈；源169/全unit6003、完整171/新隔离后端23已通过。当前只有同Lead上下文实看，非独立冷评；不把原八帧8分转给整套22帧。R37全七层58条风格提示（含warning）保留，R38可见层Clean14不是全层零警告。live副本与冻结源字节相同；[当前溯源](<clawd-attack-generation.json>)保留R37 sourceStage及R38准入。
