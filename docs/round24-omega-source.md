# R24：Omega Point第五章原生环境源候选

## 当前范围

仅source制作与独立验证，不接游戏loader/renderer。第五章仍用既有Graphics dressing；玩家/镜像已复用原生Clawd，不能说该章没有正式像素角色。[只读接线前合同](<../artifacts/verification/r23-next-chapter-contract.md>)列出了实际规则与605-vs512预算/既有g0 scan前景风险。

起始R23的136文件SHA全部无漂移，原8080/PID84960/HTTP200保留。实际Phaser4.0.0，不升级配置/依赖，不碰Core/DTO/碰撞/相机/旧108。

## 本轮实际产物（源已验证，运行未接线）

- [地形源](<../assets/source/omega-tiles.aseprite>)：256×128，左128×64的32母格16px，独立repeat-tests，exactpack128cells/32unique，普通源层隐藏保留，PNG96×96与JSON。
- [道具源](<../assets/source/omega-props.aseprite>)：64×128六static100ms帧/structure-material-details3层/18cels；统一slice prop-origin/pivot32,120，实际JSON已读回有bounds+center+pivot，不用9slice伸缩。
- [PixelSpec](<../assets/omega-environment-pixelspec.md>)锁top3透明/foot上8px/observer3..11、40×96透明门、48×98玻璃与演员quiet、17px有限玻璃glints，以及native不缩放。
- [来源记录](<../assets/omega-environment-generation.json>)区分SourceReady/integrated/productionReady。本轮实际imagegen输出在六源冻结后才可验证；先前绘前已读概念的说法撤回，未暴露可验证本地路径/原字节尺寸，故没有虚构导入或源图拷贝；原生像素在liveAseprite从spec重绘。

## 过程与限制

Lead唯一live写手，preflight/info后新建#10354/#10429，未改Loom旧源。地形先扁平block→材料/光→原生repeat并look；外2px不变，130×12尾2px。MCP单独tilemap look出现空图，但导出原PNG已read_image非空；普通源与tilemap/PNG精确一致性必须由独立parser，不用该空preview冒称已核验。
道具扁平silhouette/材料层均filmstrip看过，最终实际三层合成导出后分别read_image3×和native1×。layer空字符串实际读activecel而非composite，故不把空preview当源损坏，也不把单层filmstrip称三层完成。预导出strays曾有5error，明确补成成组硬像素/连接对角线后validate0error，6selective-outlinewarnings保留；不以消噪理由填玻璃/改真实留空域。

材料A的两阶段nonfresh审查7.5/10、0blocking/0necessary，停止polish；物件B先7分/1blocking马头误读，一次仅第三件上轮廓修复后8分/0blocking/0必要；task104实际79/79，两源测试与sixfiles已冻结。

R23的3784/108/23只是上轮已验历史，本轮尚无新runtime browser/backend/安全审计；全GDD、真人听感/平衡、连续五章新局仍open。


## 当前门与后续

[独立源门](<../artifacts/verification/r24-source-tests-run-02.log#L95-L117>)79/79（地形57+道具22），[全局本地门](<../artifacts/verification/r24-local-gates-01.log#L326-L332>)3863/64文件及TSC/lint/build/diff均EXIT0。旧108/27文件仅collect，不是执行；本轮无backend/PG/audit新结果。
[两阶段视觉记录](<../artifacts/verification/r24-visual-review.md>)和[必要修复像素定界](<../artifacts/verification/r24-props-required-fix-diff.json>)保留原误读：只518pixel/thirdbbox(134,64)-(175,88)，其他五帧与第三件下半RGBA完全相同。最终validate0error、5选择性outlinewarnings（此前6是修前时点），不做optionalpolish。
首源run01的77/79仅两未约定source-layer序号假设；独立测试改唯一name/type/flags/cel绑定，32role/128cells/门镜/alpha/裁切/负控不弱化，源6SHA不改。当前仅SourceReady，formalmanifest仍4环境；下一项task107处理第五章真实只读接线、viewport预算、scan前景与当前全运行准入。总目标仍active。
