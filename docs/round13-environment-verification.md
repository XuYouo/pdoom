# 第13轮：第一章原生环境 — 已通过本轮验收

> 最终891/891单元、69/69真实浏览器（6.4m、后端启用、无skip）、23/23本轮新私有PG后端通过。本轮环境包准入，不是完整GDD成品。首全门失败与全部方法修复保留。

## 交付范围与不变合同

- live Aseprite1.3.18.6-dev中Lead单写：[地形源](<../assets/source/chapter-one-tiles.aseprite>)、[道具源](<../assets/source/chapter-one-props.aseprite>)。参考逐项对照后从正式源移除，不是把生成图缩小、量化或脚本画图当像素成品。
- 地形32种16×16母片，128单元mockup由MCP pack为32片；[96×96 PNG](<../public/game/chapter-one-terrain.png>)/[原生map](<../public/game/chapter-one-terrain.json>)为6列32实片＋4空槽。道具8个独立64×64静态帧，[512×64 PNG](<../public/game/chapter-one-props.png>)/[图集](<../public/game/chapter-one-props.json>)；600ms是导出元数据，不是八帧动画。
- 当前场景实际使用9种tile角色与8种prop，**不是全部32片都出现在关卡**。检查点旗、捐款、其他拾取/规则标记仍是Graphics；不是第一章所有美术均已完成。
- 四块真实地面、12px单向平台、缺口和2880×360关卡不改；蘑菇仍严格距离<24、Doom+28/TOK+8、反转1700ms。坍塌只读Core的实际移除，不按美术时钟提前删除。原固定tick、v1、4动作统计、8API和其他章规则不变。
- 两张源及四个导出SHA由[溯源](<../assets/chapter-one-environment-generation.json>)保存；[PixelSpec](<../assets/chapter-one-environment-pixelspec.md>)给出实测bbox/socket、packing索引及设计取舍。

## 静态制作与审查

1. 工具参考实际2172×724、gpt-image-2.5；请求1536×1024/high，实际quality未回报。2215字节提示词原文、Gato风格输入、实际裁框/放置尺寸与六文件哈希保留，正式像素不是概念图下采样。
2. 20项palette不扩，terrain11/props16种opaque色，alpha只有0/255，Clawd保留色d97757均为0。6种ledge精确12行墨迹；8对变体2px边框一致；18个3×3复用单元相等；原绘与packed复合逐RGBA相等。
3. 树冠末行与树干首/末整行64×RGBA相同，墨迹仅x26..35；根簇叠在最下段、脚落y319。实际蘑菇20×17、pivot32/32。
4. 复用既有上下文的两阶段评审：kit与props各7.5/10、0 BLOCKING、0轮必要结构修饰；**不是fresh-context盲测**。保留窄木梁偏金属、圆窗兼读徽章等非阻断歧义。
5. props validate原文Clean(4 style note(s))：4轮廓warning和另6条信息note，不宣称零warning；静态帧不为消统一时长note造假。tilemap单层look未展开图时，改看MCP复合PNG并独立逐RGBA核对，没有改用磁盘绘图绕过live。

## 真实Phaser4.0接线与修复

[只读计划](<../src/pages/GamePage/game/systems/ChapterOneEnvironmentPlan.ts>)保留原矩形/负局部原点，5个RT块宽640/640/640/640/320；不拉伸纹理、不填缺口。背景家具、连树与梁柱按组过滤，不删半棵树。墙alpha0.18、后景家具木作0.22，真实平台保持完整不透明。

[适配器](<../src/pages/GamePage/game/systems/ChapterOneEnvironmentRenderer.ts>)只用实装repeat/stamp及显式render；NEAREST实值1，数字frame转string避免get(0)回退。独立读取安装enum的[红测](<../artifacts/r13-dependency-recovery/filter-red.log>)抓出初版0/mock锁绿，之后[78项绿测](<../artifacts/r13-dependency-recovery/adapter-green.log>)通过。资源Texture/Frame/source身份替换会重建；暂停restore失败同步用最后静止world回退，不推进tick。

首接线type错误是has/get需string；静态资产测试的Aseprite cel reader把像素起点误作28，按真实width22/height24/data26修正；布局测试修正负零期待。不修改导出数据迎合测试。相关失败保存在[首次接线](<../artifacts/r13-dependency-recovery/integration-first-gate.log>)/[二次接线](<../artifacts/r13-dependency-recovery/integration-second-gate.log>)。

同屏观察发现墙纹争抢与下一句教学被截断：只降低墙alpha、只在全文进入12px安全边界时显示第一章教学，不改文字/世界坐标/素材。r8复看入口raw与真实UI、r9复看森林与竞技场，均0新增BLOCKING，停止polish；静态可读结论不代替机制或FPS。

原生机制检查又抓出小数镜头停稳时Graphics预警边与RT相差1px：当锚点落167时prop匹配88.7%、露出背景62.5%，实际平台已消失、人已落地。仅第一章发布整数camera scroll并独立保留浮点跟随状态，避免直接取整反馈导致镜头停在竞技场前。后续章原路径不改；修后相同严格源像素正控通过。

当前反重力/脚下裂纹危险从真实invertedUntil/standingOn/collapseAt/collapsed投射到既有低频objective，保持简短且到期消失。Core长notice本就被HUD压缩/过滤，旧E浏览器期待“核心节点已击破”正确；未为测试恢复过期历史提示，也未改玩法。

## 原生证据与失败边界

- 初4环境案重复18.6s、23.2s、58.8s通过。首次Buffer附件未留存成功PNG，之后先写info.outputPath再path attach重新执行，未把不存在的截图称已查看。
- [7项组合scope](<../artifacts/verification/r13-environment-combined-03.log>)：891单元/43文件、lint/type、7原生46.4s、diff0。入口三种前景纹样＋墙合成＋两道具正控；12px平台/40px地面/空洞；暂停真实WebGL丢失恢复；缺PNG/atlas保档重试；cp2普通D入场后跨world2560窗左16/右48分别匹配。首屏像素检查不冒称覆盖全部9运行tile角色。
- cp1合法夹具由普通E/射击清前方敌人、普通双跳拾真实菇，验证Doom+28/TOK+8、上升、顶部持续>500ms、自然回落、真实警告及移除/安全地面；每步有非空源像素与角色正控，无传送/改血/假历史。cp11是**已保存休息室恢复夹具**，不是走入房间或一次交易；2300ms raw区域/HUD/存档不变，真实Continue保持attempt身份并恢复菇bob。
- [首全门](<../artifacts/verification/r13-final-gate.log>)891单元、lint/type/build/audit0/diff通过，但浏览器67/69（7.4m），不算全门准入。两项失败：把仍在y294下落当成落地；逐次跨协议解码未取得瞬时6px反射证据，存在漏采短帧风险。
- 保留原阈值的修复：落地以采集前真实地面角色高度为参照，随后仍需160ms稳定；Gato同一次请求60ms的真实鼠标按放，先采24个真实rAF原始帧再解码，仍须6px反射、金条、真实HP和非空多色画布。没替换rAF或世界时钟。
- 重复中又发现按住D等待异步解码会走过窄台：改为先释放的有界A/D脉冲，仍守gap>40/<85；依据原生菇消失及时松键，之后Doom/TOK和整条运动证据仍严格检查，不能仅以颜色消失判拾取。setup曾未观测到核心击破，将鼠标按放请求增到80ms（小于配置的185ms间隔）为较慢渲染留采样余量；没有测量实际DOM时长或发射数，旧独立E验收未改。所有中间失败日志保留。

[方法修复后6案重复](<../artifacts/verification/r13-native-stable-repeat.log>)三轮均过，2.3m、exit0。独立只读方法审查确认无隐藏World/伪时钟/DOM遮盖、没有放宽原像素正控；PNG读回有观察开销，因此不把请求60/80ms称为测得的精确发射数量。

真实[顶端全UI](<../artifacts/asset-review-r13/native-stable-repeat/environment-mechanics-chec-0f401-le-collapse-by-normal-input/environment-cp1-ceiling-real-ui.png>)实际查看后发现HUD整块底板遮住部分Clawd；当前只去掉底板/外框并给四项读数加文字阴影，不隐藏数据或改变世界。Lead与r8已实际复看[修后全UI](<../artifacts/asset-review-r13/hud-ceiling/environment-mechanics-chec-0f401-le-collapse-by-normal-input/environment-cp1-ceiling-real-ui.png>)：角色完整、四读数与短提示清楚，0必要新fix，停止polish；[机制＋viewport6案](<../artifacts/verification/r13-hud-ceiling.log>)46.2s、lint/type与exit0。

## 后端与依赖环境

- 任务25的bundled pnpm11.28.5 exec意外触发verifyDepsBeforeRun安装：20原直接包移入.ignored、225新包、React/DOM19.3.1。原71结果不作准入；未升级或approve-builds。
- Lead保存意外树/锁至[恢复目录](<../artifacts/r13-dependency-recovery/>)并以原锁npm ci --ignore-scripts恢复React/DOM19.1.0、Phaser4.0.0、Vite6.4.5、Vitest4.1.12；package与package-lock相对本轮恢复快照字节不变，不是相对模板git HEAD。共享cache未删除，pnpm锁是否原已存在无快照则不猜测。
- 恢复后793单元与旧game/viewport8smoke46.9s通过；它们不算新环境验收。记录在[恢复gate](<../artifacts/r13-dependency-recovery/verification.log>)和[旧smoke](<../artifacts/r13-dependency-recovery/browser-smoke.log>)。
- 本轮新建私有PG16.14，loopback55439、独有数据目录，不复用用户数据库。macOS java_home -v17实际回退Corretto11，引起HexFormat编译失败；[失败日志](<../artifacts/verification/r13-backend-tests.log>)不计通过。改用已安装且实测17.0.17的显式Homebrew JDK，未降级源码/全局切换或安装软件；[23/23后端](<../artifacts/verification/r13-backend-java17-tests.log>)在新私有PG/真实HTTP上exit0。
- 脚本已先读后执行；本地launcher1.10.7 SHA已核对。一次Python会话漏import发生在createdb成功之后、测试前；没有重建/删除数据库，补import继续，保留会话证据。

## 执行边界与尚未完成

任务26曾在授权的两文件工具参数中包含禁止设置的sandbox_permissions，属于指令违例，已冻结；未出现权限提升提示，不能声称发生了实际升级。任务29正确停用有冲突的写工具、仅交补丁文本，Lead落盘/修复/执行。后续Lead使用现有本工作区Python会话read/CAS/write，没有请求提权或绕过文件拒绝。

旧task22行政complete拒绝维持原记录，未绕过重试。最终全门、正式环境清单与服务清理见下节。总目标active；其他章节环境/Boss、攻击/特效、完整声景/内容、真人平衡、新局连续五章原生旅程仍缺。不称低端稳定60FPS，不抹去Phaser大chunk警告，不上传/发布。

## 最终完整门与本地交付

| 门 | 实际结果 |
|---|---|
| 单元 | 891/891，43文件；相对R12增加169（适配器78、静态65、摆放9、镜头/文字11、当前提示6） |
| 原生浏览器 | 69/69，6.4m，后端启用，无skip；原62全部保留＋新7 |
| 后端 | Java17.0.17/Scala3.3.6/PG16.14，23/23真实安全/HTTP/私有DB |
| 其他 | lint/type/build、audit0、diff check通过 |

[最终完整日志](<../artifacts/verification/r13-final-gate-02.log>)明确EXIT=0。Phaser压缩前chunk1352.48kB/gzip348.59kB的警告保留，不靠调大阈值掩盖，也无稳定60FPS声明。

[正式环境清单](<../assets/environment-manifest.json>)列明32/8源与导出、9种运行tile、8道具；[16文件最终源码SHA](<../artifacts/verification/r13-final-source-hashes.json>)冻结了本次生产/测试代码；原锁及安装版本再次实测不变。全门后只同步清单/文档/溯源，不改玩法或像素。

Lead另实际看过最终入口真实UI；此张开始阶段画面内未见Clawd，不拿它作为活体角色正控或推断具体隐藏原因。角色与真实机制的正控见cp1全链与顶端全UI。入口/森林/竞技场视觉结论只覆盖实际看过的画面。

清理先停独有Main并关闭其终端，再对自有PG快速关闭，日志确认database system is shut down；8081/55439均连接拒绝61，测试数据目录保留。前端http://127.0.0.1:8080/仍HTTP200，由本轮预览job保留；[清理记录](<../artifacts/verification/r13-service-cleanup.json>)可查。临时云后端不作为常驻生产服务；未发布/上传。

清单/文档同步后另跑[收尾检查](<../artifacts/verification/r13-post-document-check.log>)：本地Markdown链接、16生产/测试文件SHA、lint/type、891单元、diff check全部通过；此后无生产代码更改。
