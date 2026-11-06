# Pickup Items PixelSpec（R26，三类静态拾取包）

状态：R26原生源已绘制并接入；R32通过当前同10、单完整133与新后端23并清理服务后正式准入本包，见[正式清单](<pickup-manifest.json>)。项目发布与完整GDD仍未完成。以下绘制前规格保留历史时点含义。沿用[批准同风格与工具参考方式](<chapter-one-art-spec.md#L5-L45>)。
本包未取得任何可核验新生图输出。用户在确认工具问题后实际选择“直接原生绘制”；沿用已批准风格与本规格，由Lead单写live Aseprite，无新参考图/路径/尺寸/import或缩图。20palette、正面图标、上左光与选择性1px边界。

## 技术边界

- 实装Phaser4.0.0/640×360/FIT/NEAREST/native1:1，不升级配置或依赖。155基线SHA已零漂移；R25的3993/119/23不算本轮新执行。
- 只新增token/compute/heal。蘑菇已native；已准入源、四腿Clawd/四Boss/五环境不重画。
- 新RGB32×32源，3帧静态，各100ms；单帧tags token/compute/heal，对应index0/1/2，不是运行循环动画。
- 水平96×32PNG+JSON，0padding/无trim/rotate/scale；透明alpha0/255。各kind独立命名层，只在对应frame有ink。
- slice pickup-origin bounds0,0,32,32/pivot16,16。MCP当前schema必填center，故源含精确fullcanvascenter32，非任意中心；运行不消费9slice、不stretch。源pickup-items.aseprite与同名PNG/JSON在准入前candidate。

## 原生墨迹合同（inclusive）

| frame/tag | bbox | 一眼辨识 |
|---|---|---|
| 0/token | x11..20/y11..20，10×10 | 填满圆面、铜金厚边、一个竖压纹；不读洞环、眼或文字 |
| 1/compute | x8..23/y7..24，16×18 | 冷紫菱形核、两大切面、单一顶左高光；不画脸/光晕 |
| 2/heal | x9..22/y9..22，14×14 | 6×14与14×6交叉的薄荷维修十字；绿影/薄荷亮边，不用红十字标记 |

每帧至少3种opaque色。coin≤5色、core≤5色、heal≤4色。稀疏大cluster、硬alpha、无噪点/AA/模糊/粒子/假承载面。
文档共享20palette，允许少用、不扩色：
`#00000000 #2c2330 #d97757 #eaa083 #b55a4a #783f4a #f5e8c8 #cbb696 #34354f #575c79 #858eb0 #9dded1 #d9ffea #0f191b #24423b #426b50 #8fa86b #b9905d #e5c386 #723f68`。
英雄橙D97757墨迹0。coin限定2c2330/783f4a/b9905d/e5c386/f5e8c8；core限定34354f/575c79/858eb0/723f68/cbb696；heal限定24423b/426b50/9dded1/d9ffea。

## Core与适配器隔离

- 收集仍player与未bob中心距离平方严格<24²，不改金额/分数/HP/Doom/TOK、坐标、R重映射、checkpoint轴过滤、v1或API。
- bob只取实际save.elapsedMs：`y + sin(elapsedMs/280 + x)*2`。pause/rest/terminal冻结，不加墙钟、timer/RT/GL回调或rAF替换。
- 只读live world.pickups三kind与真实id，Image scale1/pivot16,16/depth−1/NEAREST；返回实际已画id，仅成功id撤旧Graphics，保留蘑菇所有权。
- 整包3frame包括未用末帧的eager guard：owner/name/sourceIndex/TextureSource/native自然尺寸/cut/无trimrotate；坏资源createWorld前failclosed保档。
- 换局/章/收集/实际清场/invalid/dispose/外部destroy撤旧，借用Texture不销毁；不从chapter初表复活对象，不注入HP/坐标/clock或私有World造正控。

## 验收与停止

独立ASE逐RGBA对PNG，三帧非空互异/bbox/palette/alpha/pivot/tag；实际native/放大预览与匿名先识别后briefaware审查。
注明reused/nonfresh，不假称人类盲测；≥7且0blocking/0necessary即停optional，最多3次必要修复。
普通输入每kind取得完整非空源≥.98/≥3色，同帧hero/地形正控，再以真实HUD变化和原位置整窗最大残留负控证收集。小coin<100ink，不套英雄100ink门。
heal先普通受伤再收，满血不算治疗证据。pause/rest/真GL、R/清场/换章、坏PNG/未用frame/尺寸/cut保checkpoint与真实attempt字节。
保所有首红，不拼运行成全绿；当前全门/隔离PG与服务清理后才runtime准入。连续新局五章、人类听感手感/性能/安全与完整GDD另立门。

## 绘制前冻结但未执行的参考prompt

```text
Pixel-art CONCEPT reference sheet of THREE tiny collectible game items.
Exactly3 equal panels in one horizontal row, same scale, flat #0f191b background.
Panel1: thick bronze-gold coin, filled round face, one raised minting stroke, no text,10x10nativepixels.
Panel2: cold-purple faceted compute-power core, upright diamond with2broad faces and upper-left glint,16x18pixels.
Panel3: pale mint medical repair cross, equal arms with6pixel stem,14x14pixels.
Each centered16,16 on a32x32 conceptual panel, generous empty margins. Front view, upper-left light, selective1pixel edges.
Hard clusters,3to5colours each; no gradients, blur, glow, particles, platform, floor or fake motion.
Coin:#2c2330 #783f4a #b9905d #e5c386 #f5e8c8. Core:#34354f #575c79 #858eb0 #723f68 #cbb696.
Cross:#24423b #426b50 #9dded1 #d9ffea. No orange, characters, faces, text, labels, UI, borders, scenery or extra items.
DESIGN REFERENCE ONLY, not final sprites. Native pixels will be authored separately in Aseprite.
```
