# R19 大炼丹炉：本地功能准入，项目安全门仍开

原生环境及当前完整功能回归已通过：3278单元、96真实浏览器、23真实后端。整款GDD仍未完成，开发链安全告警仍开；这不是生产发布认证。上一轮2194／91／23仅为历史基线。

## 已完成的素材门

| 产物 | 实际结果 |
| --- | --- |
| [地形源](<../assets/source/furnace-tiles.aseprite>) | 256×128母块与样板；32种16px tile；保留隐藏raster和可见tilemap |
| [地形图集](<../public/game/furnace-terrain.png>)、[索引](<../public/game/furnace-terrain.json>) | 96×96、六列；128样板cell中100非空；不是关卡碰撞图 |
| [道具源](<../assets/source/furnace-props.aseprite>) | 六个64px静态帧，三层18个cel；GPU、液冷、铜排、排风、顶部破口、月球舷窗 |
| [道具图集](<../public/game/furnace-props.png>)、[元数据](<../public/game/furnace-props.json>) | 384×64；六个明确名称的单帧tag，100ms仅是文件元数据 |
| [地形独立测试](<../tests/rendering/furnaceTerrainAssets.test.ts>) | 125/125；原生ASE raster/tilemap/embedded tiles与PNG+JSON逐RGBA一致；12px/40px及合法方向接缝 |
| [道具独立测试](<../tests/rendering/furnacePropAssets.test.ts>) | 78/78；真实cel合成与图集逐RGBA一致、精确tag/脚底/异形mask、PNG/ASE负控 |

实际用色：地形8色，道具全家族12色；共享20色内，alpha仅0/255，英雄橙d97757使用0。[制作规格](<../assets/furnace-environment-pixelspec.md>)和[溯源记录](<../assets/furnace-environment-generation.json>)保留完整边界及六份素材SHA。

![六件静态道具的2×预览](<../artifacts/asset-review-r19/c.png>)

## 审查不是口头补认

复用上下文的独立审查：地形7.5/10，六件家族7.5/10，均0必要修改；不称fresh。初版GPU机架被真实读成磁带／音响，5.5/10并有身份阻断。一次必要修复改成裸PCB、带缺口的插脚和径向风扇后8/10；[初稿](<../artifacts/asset-review-r19/b-native.png>)与[修后原生图](<../artifacts/asset-review-r19/b2-native.png>)均保留，不改写初读。

没有获得或导入新的生图参考，不声称调用过新图像模型。重复目录查询已停止。原生像素全部由Lead在live Aseprite经MCP绘制、保存与导出。

工具边界也已记录：同批blit读取旧源像素，已分批重建；黑色空层／tilemap预览不作验收，实际打开完整导出核对；新增帧自动扩展旧tag、空newName又清空标签名，两次元数据问题均经live MCP修复。最终六名称和单帧范围有独立严格断言，像素保持不变。

## 真实场景与本轮验证

原生环境视图与真实机构仍分离：3280×360/floor320、12px承载面、120px真实K线、热区FSM、相机与角色源不变。排风只嵌入floor320内部；顶部破口不作可走台。下列定向门已验证实际输入乘坐／隐藏房奖励、热区、暂停与WebGL恢复、Basilisk／Chinchilla原生正控及资源失败保档；全门另列。

实际场景初评7/10，明确两项必要问题：多处重复K线指令、离开视口后仍裁成残句的路牌。一次只读表现修正保留单个当前操作提示，世界改短标识、K线只显示实际方向、整句入镜才显示；[修后实景](<../artifacts/verification/r19-native-review-02/furnace-environment-native-196ea-ve-paused-WebGL-restoration/furnace-real-playing-ui.png>)复用上下文复核8/10、0必要项。不改角色素材、碰撞、Core时钟或镜头。Lead另看实际热区图发现右缘动态标签残字，将同一完整显示规则用于状态标签；危险几何/斜线仍保留，最终图片已实看。

![最终完整门的实际全窗口画面](<../artifacts/verification/r19-browser-02/furnace-environment-native-196ea-ve-paused-WebGL-restoration/furnace-real-playing-ui.png>)

| 本轮实际运行 | 当前结果与范围 |
| --- | --- |
| [当前全单元/type/lint](<../artifacts/verification/r19-current-gates-02.log>) | 3278／56文件、type及lint均EXIT0；包含最终表现修正与独立881adapter案例 |
| [完整浏览器](<../artifacts/verification/r19-browser-02.log>) | 96/96、15.5m、0skip、真API/PG，明确EXIT0；不是新局连续五章 |
| [真实后端](<../artifacts/verification/r19-backend-tests.log>) | 新隔离PG上23/23，16实际HTTP/PG＋7安全验证，EXIT0 |
| [环境原生5例](<../artifacts/verification/r19-native-04.log>) | 修后5/5，真实源匹配、暂停/GL恢复、三态热区、unused资源保档 |
| [既有第三章原生/机构](<../artifacts/verification/r19-native-gameplay-01.log>) | 16/16、3.2m，最后文本修正之前；K线载人/隐藏房、捐款/石化/Q/普通击杀/清理未降断言 |
| [源像素测量](<../artifacts/verification/r19-native-metrics.json>) | 8–12完整GPU、ratio1；地面两行620–640＋37–39整块源正控；lift1080px/ratio1；暂停恢复PNG相同，继续后真实位移−25px |
| [build/diff](<../artifacts/verification/r19-build-diff-02.log>) | EXIT0；4.51s；Phaser1352.48KB警告仍在 |

[独立像素观察器](<../tests/e2e/furnace-pixels.ts>)的50个离线正负控不是实机证据；真正截图来自原生640×360 canvas与普通输入。首轮4个观察失败（秒级HUD、重复错误文案定位）及一次0测试筛选均保留在[过程记录](<../artifacts/verification/r19-process-notes.md>)，修正只改观察方法，不改像素/力学阈值。上述合法检查点切片不等于新局连续五章。

## 新审计结果不能沿用旧零值

[完整审计](<../artifacts/verification/r19-audit.json>)为EXIT1、12个moderate依赖项，全部是开发工具链同一[minimatch公告](<https://github.com/advisories/GHSA-g3hv-75wg-m249>)的传播；0high/critical。[仅生产依赖审计](<../artifacts/verification/r19-audit-production.json>)EXIT0、0告警。没有自动跨major修复、降级或改锁文件；开发链兼容修复仍待处理，不称全项目生产就绪。

[独立adapter881例](<../artifacts/verification/r19-environment-unit.log>)、[真实后端23例](<../artifacts/verification/r19-backend-tests.log>)已通过。合法CP0完整Plan实际使用14/32地形角色、6/6道具；仅GPU在实机做逐像素prop匹配，不把全家族静态源校验冒称六道具全部实机匹配。

首整套96尝试的子任务服务在ready之后消失，六个云端相关用例失败，终止期间另一个Omega用例被记失败（未独立诊断）；该轮仅有74条结果67过/7失败，剩余22例未执行，Lead中断后EXIT1，不算完整通过。原因高度疑似owner生命周期回收，不归咎于游戏或schema。Lead改用[第三个新cluster和自有长期终端](<../artifacts/verification/r19-lead-service-state.json>)，实际注册/云读取/撤销冒烟及[原两例云端2/2](<../artifacts/verification/r19-cloud-02.log>)通过。第二套96/96完成、15.5m、0skip、EXIT0；完整执行前后84个保护源文件SHA不变。随后已核对所有权并关闭Lead自有API/PG，数据保留、8081/55439释放，8080仍HTTP200；[服务收口](<../artifacts/verification/r19-lead-service-cleanup.json>)与[最终源哈希](<../artifacts/verification/r19-final-source-hashes.json>)保留证据。

## 仍未完成

第四/五章专用环境、Leviathan及终局资产、NPC/物品演出、完整音频/人工听感、局外成长、丰富seed支路、无障碍与性能以及新局连续五章仍在[总计划](<development-plan.md>)中。合法checkpoint、单元控制器和局部截图不能代替完整体验认证；Phaser大chunk警告也未消除。未发布、未安装系统组件、未改变依赖/引擎版本。过程并非零偏差：五次不该出现的权限字段调用和所有观测/服务失败都在[过程记录](<../artifacts/verification/r19-process-notes.md>)中，不以通过门禁抹去。
