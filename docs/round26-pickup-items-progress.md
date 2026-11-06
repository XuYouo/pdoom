# R26：三类非蘑菇原生拾取（历史阶段与当前未完成门）

本轮目标回合36，不是完整GDD完成。保留实装Phaser4.0.0和原8080；R25旧155SHA开工全不漂移，当前只两view获准改动。

## 已落地并验证

- 用户实际选择直接原生绘制；没有可核验新生图/参考/import。早期预写“已返回”已撤回并在[过程记录](<../artifacts/verification/r26-process-notes.md>)保留，不伪造工具event。
- [PixelSpec](<../assets/pickup-items-pixelspec.md>)/[源](<../assets/source/pickup-items.aseprite>)/[PNG](<../public/game/pickup-items.png>)/[JSON](<../public/game/pickup-items.json>)：32²×3静态、96×32水平、16,16pivot、tags100ms，token10²/compute16×18/heal14²。
- 原生墨迹88/176/132、色5/5/4，硬alpha/英雄橙0。source fullcanvas32center是MCP必填metadata，不是运行9slice/stretch。
- [匿名先冷读](<../artifacts/verification/r26-critic-cold.md>)/[brief后原生1×审查](<../artifacts/verification/r26-critic-brief.md>)reused/nonfresh AI：7.5/10、0blocking/0necessary，停止optional，不能冒称人类或实景认证。
- MCP实际预览/ASCII/validate：0error、0warning、3selective-outline NOTE；[独立源33/33](<../artifacts/verification/r26-pickup-source-run-01.log>)重构ASE逐RGBA对PNG、连通/包络/tag/palette/pivot通过。
- [新两模块](<../src/pages/GamePage/game/systems/PickupSpriteRenderer.ts>)/[独立145/145](<../artifacts/verification/r26-pickup-adapter-independent-02.log>)：只读live真实id、模拟sin bob、三帧eager严格guard、id复用/离屏hide/真实删除/换run章/异常/实际destroy次序/资源换代清理；无墙钟/RT/GLcallbacks、不destroy借用Texture。
- [两view差异](<../artifacts/verification/r26-view-only.diff>)只加preload/createWorld前failclosed、实际id成功才撤旧Graphics。保留原蘑菇路径、未bob中心<24²收集与所有Core/v1/API/金额/坐标/seed规则。
- CP旗杆/捐款标记从默认Graphics独立到depth−2，保持marker先pickup后的可见语义；新Image仍−1，不抬过真实弹幕/提示，不用oracle挖mask去掉覆盖像素。28/132遮挡是静态推导，尚未冒称浏览器实测。

## 当前门与待验

[完整单元](<../artifacts/verification/r26-full-unit-01.log#L327-L334>)实际**4171/67文件、EXIT0**；[生产构建](<../artifacts/verification/r26-build-01.log>)EXIT0。独立145的类型fixture已clone改写，首次TSC2/后续两非法stage夹具TSC2均保留；新unit两行只改为Object.assign显式非法边界后，[全project六门02](<../artifacts/verification/r26-current-local-gates-02.json>)实际全0、4171/67/collect129，新166仅该unit变化，游戏/两browser与三源没变。
[新PG_A后端](<../artifacts/verification/r26-backend-tests-01.log#L412-L523>)实际**23/23、0skip、EXIT0、16.279s**，77后端/合同零漂移，PG_A已全清且数据保留，不复用R25结果。

[10例矩阵](<../artifacts/verification/r26-browser-author-matrix.md>)已实际执行首轮：[5/10、EXIT1、80.9917s](<../artifacts/verification/r26-browser-author-native-01.log#L274-L284>)，五坏资源通过；功能首红与全部raw保留。随后native02为9/10（heal真实跌落），native03为6/10（普通输入纠偏/闪烁导航/Hub展开前提）；全原图/trace保留、不拼绿。只重新设计新测试普通按键及采样，其后native04窄0/2（过渡不该强求live导航、R短步偏5>4），native05窄2/2；[native06最终单整10](<../artifacts/verification/r26-browser-author-native-06.log#L13-L30>)实际10/10、EXIT0、98.8382s，七整窗残留均0、HP60→88、真save score56/TOK160/Doom36/HP98。各前红保留不拼接；源和生产代码始终未因此改动。旧119整合的本轮129尚未执行、未正式runtime准入。LegalCP/按键切片不是连续新局五章，collect不等于执行。
当前Lead另建私有PG_B+Main（非PG_A复用），[health双200/164冻结](<../artifacts/verification/r26-pre-native-source-hashes.json>)真实记录；API/PG后续必须只关本轮owned，保留原84960/8080及54Bpointer inode/mtime，旧78PNG已复制待恢复。

## 历史未完成范围（native06前的记录，当前见末节）

新图标场景source/hero/地形同帧、真正受伤后治疗、真实TOK/Doom/score收益、注册整窗消失/R不复活/真GL/资源坏加载双存档保档，以及本轮完整129浏览器/全项目type/lint和服务清理仍待实际执行。
NPC/专用攻击、终局完整演出、章别声景/人工听感、丰富支路/局外成长/连续五章三结局、触控手柄/可读性/低端性能、安全门与全GDD仍未完成；R21最后开发链12moderate是历史、R26未重新安全审计，不升级依赖或冒项目发布。

## 首整129与必要测量更正（尚未全绿）

首单整129真实128过/1失败/0skip、EXIT1、1132.031s，新增拾取10仍全过；旧探针consume姿态漏识别。原trace取回119未加工PNG后，061真实294/294源墨全对，5透明点透下层新compute颜色被旧签名误算；只修签名归因，原.98/cue mask/union/100墨/4色/平台负控不动。[25RGBA回归](<../tests/rendering/probeSignatureRegression.test.ts>)先5红再25绿，含原截图与坏实墨/四pose交叉/空图/chassis负例；不是伪造游戏画布。[复用AI只读复核](<../artifacts/verification/r26-probe-signature-review.md>)认可且保留union背景局限。
全project03实六门全0、4196/68/collect129；原probe窄02实际1/1/26.353s，169全冻结零，窄01只是grep无选中0case错误。三源/生产/新10代码未动，仅旧probe测试这一测量例外+新unit/原PNGfixture。不能将128+窄1拼成129；接下来第二独立整轮，仍未正式素材准入。

## 目标37：主机重启与用户UI优先（当前状态）

第二单整129于2026-11-01 22:07:53+08主机重启时中断，raw只到启动第122项，并已保留Factory与Sydney两真实失败；实际退出码未知null，不是122过，更不是129绿。见[中断事实](<../artifacts/verification/r26-current-browser-02-interruption.json>)和[指标](<../artifacts/verification/r26-current-browser-02-metrics.json>)。原历史running记录不伪改为exited。

用户随后明确优先重做安全休息室，[R27菜单](<round27-rest-menu-progress.md>)已在真实四视口及原离线事务验证；这是UI专项，不替代整轮资产准入。新collect133（129旧+4布局），未执行完整133。R26三源/渲染/Core不因此改，169专项集合零漂移（不包含React休息室，不能称全仓库基线）。

重启后原Vite84960已消失，同8080已由新managed Vite3756恢复。PG_B控制文件实测shut down，未为清理重启；用户pointer54B/inode/mtime未改，st_dev跨重启变化已明记。原78图在全部当前混合图另存后恢复，首整61/次整部分55与所有红trace不删。全133、正式拾取manifest与完整GDD仍未完。
