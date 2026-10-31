# P(Doom): 100%

**Clawd's Sharp Left Turn** — React + TypeScript + Phaser 4.0.0 像素平台动作肉鸽，搭配 Scala 3 / http4s / PostgreSQL 后端。

> 当前已实现五章核心玩法、三分支结局与原创分层音频基础，**仍不是全量GDD成品**。
> Clawd、第一章三类小怪、Gato、第二章探针/Sydney、前三章原生环境，以及第三章Chinchilla三静态姿态/Basilisk八态已接入并验证；其余Boss/环境、NPC/物品演出、完整声景与局外成长仍待补。
> 桌面为全窗口16:9游戏舞台，菜单覆盖场景、必要HUD与短提示，长信息按需展开；可主动进入浏览器全屏。竖屏保留视野并提示键鼠/横屏，不宣称触屏战斗支持。
> 最新见[GPU炼丹炉原生环境与本地功能验收](<docs/round19-furnace-progress.md>)，历史[Basilisk八态与真实绕后](<docs/round18-basilisk-progress.md>)/[Chinchilla与输入修复](<docs/round17-chinchilla-verification.md>)/[工厂环境](<docs/round16-factory-environment-verification.md>)/[Sydney](<docs/round15-sydney-verification.md>)/[全窗口UI](<docs/round9-ui-verification.md>)及[完整差距](<docs/development-plan.md>)。

## 本地启动

需要 Node.js 22+（本次使用 25.3.0）。在项目根目录运行：

```bash
npm ci --ignore-scripts
npm run dev
```

游戏地址：**http://127.0.0.1:8080**。只绑定 loopback，端口占用时失败，不会静默改端口。五章核心可离线运行；云端功能需要另启动 Scala 后端。`dev`/`build` 不含模板遥测。

后端需要 Java 17 与一个**为本游戏明确指定的 PostgreSQL 数据库**，不会默认连接机器上的现存数据库。详见[后端指南](<backend/README.md>)。

```bash
# 已安装 sbt 时可在 backend 目录使用 sbt；否则遵循后端指南的项目本地 launcher 流程。
export PDOOM_DB_URL='jdbc:postgresql://127.0.0.1:5432/pdoom'
export PDOOM_DB_USER='your_game_database_user'
# PDOOM_DB_PASSWORD 通过自己的本地环境注入，不提交到仓库。
export PDOOM_DB_INITIALIZE=true
cd backend
bash scripts/sbt-local.sh run
```

后端默认 **127.0.0.1:8081**。前端 Vite 代理 `/api` 与 `/health`。正式部署需要同源反向代理；`vite preview` 只展示静态构建，不自动启动数据库/后端。开发验收使用新建的隔离测试集群，完成后关闭，不作为常驻生产服务。

## 目前可玩内容

- 第一章：中文房间平台路线、三种敌人、两处安全检查点、三阶段 Gato；32片原生地形kit与8道具（当前关卡使用9种tile角色），真实蘑菇反转和高Doom裂纹坍塌，碰撞/缺口不变。
- 第二章：640×2040 垂直工厂、55px 主路台阶、两处休息室；上涨回形针海触及即死，Q/冲刺不能免疫。
- 冯诺依曼探针使用32px四帧原生扫描窗/机械钳，只读真实seek/tell/consume；从存活个体自复制，有数量上限；吞噬侧路平台前有预警，可以射击阻止。主路不被探针吞噬，但仍会被海淹没。
- Sydney 有对话框弹幕、下落飞刀及 PUA 定身。被控制时仍能射击，必须打碎近身气泡解除；不会靠等待自动解控。
- 第三章：GPU热区有冷却/预警/高温节拍；绿色K线真实载人升降，靠右并在上升时跳向隐藏奖励房；Chinchilla体小血厚、弹幕密集，原生32px三静态姿态只读真实FSM，原12×12碰撞不变。
- Basilisk使用96px九部件八静态pose，仅随真实动作与锁定朝向切换；根据前两章的真实捐款记录进入正常/狂暴，第三章禁止补捐。前方激光与面对Boss同时满足才石化；背对或身后安全。石化暂停普通动作，但就绪的Q仍沿真实历史解除；先穿身引转向，再Q回旧侧才能实际绕后，不会自动传送。
- 第四章：seed驱动真实上下分岔，接近时展开；脆弱节点预警2秒后坍塌。R换本安全段的实际几何与承载点，不跨安全点、不重发拾取，并从落点重新记录Q历史。
- Leviathan真吞平台、血条读数与音乐；生命仍正常计算。到金色标线右侧约20–30px，吸力窗口内A+Shift左冲并实际跨线，才打开弱点；三阶段各需一次，最终只剩158–180px中心锚。弱点期间暂时吐回血条/音轨，不回血、不返还平台。
- 第五章：FLOPs风暴、两处安全休息室、最后的门、空椅子与落地镜；真正走近并站稳后才揭示镜像。镜像使用实际动作频次/有效构筑和本连续尝试观察到的2/3连招，真正移动、射击、冲刺、沿自己的两秒历史Q回溯和E扫描，三阶段都有预警、执行与反击空档。
- 镜像不是从旧计数编造历史：新页或新尝试只知道频次/构筑，再现场学习；失活遗物仍失活。同连续尝试跨章可保留有界次序记录，次序不写进v1存档。
- A/D 或左右箭头移动；Space/↑ 跳跃（长按/短按不同高度）；Shift 冲刺。
- J 持续射击；鼠标左键可瞄准射击。A/D改变角色面向，鼠标瞄准不会自动转身；Basilisk战斗中有明确面向提示。
- Q 沿过去 **2 秒**轨迹回溯，穿越弹幕获得该类型 **10 秒免疫**。
- E 揭示伪装者核心；Esc 或按钮暂停，失焦自动暂停。
- 禁忌算力提高 Doom：**>50%** 面具态，**>80%** FOOM；伤害与弹幕风险同步提高。
- 前四个Boss清关后明确进入第二/第三/第四/第五章，保持同一连续尝试的runId、构筑、捐款与动作记录；只有击败第五章镜像才进入最终结局，不存在第六章。
- Aligned `<30%`、Warden `[30%,80%)`、FOOM `≥80%`，保留真实最终Doom。`stage5/checkpoint90`可回看，世界与结果冻结、不再领奖；演出可跳过，FOOM只在游戏页面内，不操作真实系统。
- 新训练会替换本地当前检查点；死亡不覆盖安全检查点。明确“恢复检查点”会以新UUID开启一次尝试，其他全部保存字段保留，落盘失败不启动；不会用同ID覆盖已提交的失败成绩。暂停/rest继续、跨章和完成档回看不换ID。备份可从损坏主存档恢复。
- 32K/128K Context Window：满载时中间词条失效，可能射出无伤 Lisp 括号；排序仅能在休息室调整。无伤括号不能击破气泡或探针。
- 五章各两处Human Rater休息室：敌人、海面、热区、K线、Loom节点、风暴/镜像、技能、计时与音频冻结；购买、修复、升级、前两章捐款与奖励劫持都是真实事务。零消费也可继续，正常刷新不重发奖励。
- 原创chip/bass/打击/失真四层音乐与独立SFX；需用户手势开启，暂停/rest/失焦停播。AUDIO入口调节音量/静音，偏好只存本机，不污染游戏/云存档。未内置未获许可的原曲或人声。
- Clawd 保持参考 SVG 的矩形身体、方短臂和四腿：三形态共用 idle/run/jump/hurt 八帧，原生32px绘制，不把概念图直接缩小当精灵。
- 随机鹦鹉使用手工48px、6层4帧：两脚绿鸟用折翼持闭合字典，抬书预警/收书与真实FSM一致；不改变24×24碰撞，不增加另一套攻击时序，暂停时画面与计时一起冻结。
- 复读机使用48px双卷盘/格栅/提手/机械脚4帧；真实预警时扬声器前移，机壳和足底保持稳定。
- 伪装者使用48px、9层8帧：友善笑脸牌在E期间裂开并显出开放卷须，按真实模拟窗口切态、到期恢复。默认5px/升级8px核心独立画在精灵上层，真实跳跃瞄准后一次命中击破；4.3秒暂停不会耗尽E。

- Gato使用96px、11层12pose三态，只读真实phase/action/x/y；金条反射、112px落点/双地波与7发字幕仍是Core机制。预警不再染色HP；同arena死亡清除用非空真实canvas正控，不靠遮罩/换镜头假过。

当前主要面向桌面键盘。手机菜单不会横向溢出，但触屏战斗尚未实现，不能称为完整移动端可玩。前三章及第五章仍是手工布局；第四章已使用seed生成分岔几何，不能据此声称全游戏肉鸽内容已完成。

## 云端功能

点击 **LOCAL AGENT** 注册或登录（玩家名3–32位 ASCII 字母/数字/下划线，密码10–128位）。token 仅存当前标签页 sessionStorage；数据库只存 token 哈希，支持过期/撤销。身份只从服务端 token 解析，不接受客户端 userId/role。

- 先“读取云存档”取得 revision，再选择“本地 → 云端”或“云端 → 本地”。
- 版本冲突返回409，不盲目覆盖其他设备的新存档。
- 下载须明确确认，随后回到菜单并再次明确恢复，不把新云档与暂停的旧世界混在一起。
- 排行榜来自真实数据库，空榜或连接失败有真实状态，无虚构玩家。
- **死亡与三种最终结算**均接通 SubmitScore：登录后明确上传，防双击；网络/超时重试保留同 runId 同内容，401要求重登，409不覆盖旧结果。看演出/回看/章节通过不自动上传。检查点开启新尝试的ID变化与成绩请求重试是两回事，既有结果不改写。
- 云上传不是每次交易自动触发；schemaVersion=1 与云 CAS revision 仍是两个独立概念。

## 验证命令

```bash
npm run lint
npm run typecheck
npm test
npm run build
# 另一个终端先 npm run dev，使用已经安装的 Chrome：
npm run test:e2e
# 真实Scala/PostgreSQL在线后才启用全部云端浏览器测试：
PDOOM_E2E_BACKEND=1 npm run test:e2e -- --global-timeout=1200000
```

浏览器测试默认使用macOS已安装的Google Chrome，不下载系统浏览器；其他路径可设`CHROME_EXECUTABLE_PATH`。截图在忽略的[浏览器产物目录](<artifacts/browser/>)，失败记录在[测试产物目录](<test-results/>)。五章均有**仅正常FrameInput、无手工改血/改位置/直接击杀**的纯规则通关测试（R是第四章正式环境技能）；第五章四条路线覆盖三Doom结果及实际Q/E连招学习。浏览器以真实按键攀爬工厂、击碎控制泡、乘K线、解除石化、跨Loom分岔/真实R/向左冲刺，以及从第五章rest02走到镜前并实际击败镜像；只读实际画布像素，不设置隐藏引擎状态。这不等于已经在浏览器从新局连续玩完五章。原生音频测量实际PCM、吞音/恢复和独立SFX，不用休眠节点的缓存getter冒充声音；另有真实WebGL丢失/恢复与背景像素校验，不能用空画面冒充性能优化。

最新本地功能基线：**3278/3278单元、96/96真实浏览器（15.5m、真实后端开启、0skip）、23/23本轮Scala/HTTP/新隔离PG通过**；lint/type/build/diff通过。**安全门未关闭：完整npm审计12个moderate开发链依赖项，关联同一个[minimatch公告](<https://github.com/advisories/GHSA-g3hv-75wg-m249>)；仅生产依赖审计为0。**未自动跨major修复，不称全项目生产就绪。
Chinchilla使用32px、五可见层/三静态pose、7色原生素材；保留12×12碰撞、真实r11告警与九发GPU扇形。源像素三姿势、实弹覆盖本体、暂停冻结、真实+6TOK击杀及缺图/末帧/错矩形保档均已验证。
R17连续Escape曾复现关闭键在恢复后再次进入游戏；新增4单测先红后20输入例全绿，相同三轮暂停用例重复3/3通过，未改原viewport/20ms单击或命中阈值。
Basilisk源图与八态原生匹配、真实光束覆盖头部、Q历史绕后、同场击杀清理和3种缺资源保档均已验。失败记录、非fresh独立复核与最终全门见[R18历史验收](<docs/round18-basilisk-progress.md>)；[R16工厂与短点击修复](<docs/round16-factory-environment-verification.md>)保留为历史。
第三章环境已有32片16px kit与6件64px道具（完整CP0 Plan实际使用14种tile/6道具）；真实热区、K线载人、隐藏奖励、两Boss模式及源像素观察仍读Core。场景只留短标识/当前提示，完整入镜才显示，复用上下文实景复核8/10、0必要项。首轮服务交接失效后由Lead持有第三个新PG/API完成96全门；临时服务现已关闭，8080保留。完整证据与失败见[R19记录](<docs/round19-furnace-progress.md>)。
全量GDD未完成：后续章环境、Leviathan/终局专用资产、NPC/物品与演出、完整声景/内容、局外成长、新局连续五章原生旅程仍待补齐。检查点夹具不是新局通关；Phaser约1,352KB大chunk提示仍在，不声称低端稳定60FPS。

## 架构

- [架构决策](<docs/architecture.md>)：服务归属、状态和副作用边界。
- [HTTP / 存档契约](<docs/api-contract.md>)：8 API、schemaVersion=1、revision/幂等语义。
- [统一路由清单](<contracts/api.json>)：前后端共享动作名，禁止运行时类名反射。
- [GamePage](<src/pages/GamePage/index.tsx>)：React组合界面；Phaser只在页面私有目录，不碰网络/数据库。
- [章节注册器](<src/pages/GamePage/game/data/chapters.ts>)：显式可玩范围，按章节轴重建安全点；世界当前章与清关后的下一章存档分离。
- 后端 user/game 是单进程内逻辑服务。APIMessage 唯一入口为 `plan(connection)`；路由事务、表 SQL 私有，领域与 DTO 分离。

只在安全点保存，不序列化引擎实体、海面、弹幕或会话凭证。排行榜属于客户端模拟的非竞技自报数据，不宣称服务端权威反作弊。

## 美术、音频与许可

见[资源清单](<docs/assets.md>)、[主角规格](<assets/art-direction.md>)与[第一章统一规格](<assets/chapter-one-art-spec.md>)。[小怪清单](<assets/enemy-manifest.json>)、[Boss清单](<assets/boss-manifest.json>)、[环境清单](<assets/environment-manifest.json>)列出可编辑源、图集、PixelSpec与完整生成/审查记录；正式资产均通过原生制作、像素校验和真实游戏验证，不把未完成的Boss/环境冒称最终素材。没有内置未许可原曲；用户品牌参考的再分发权利仍需核验。

本项目基于 Phaser Studio 的 MIT React TypeScript 模板，原始许可保留在 [LICENSE](<LICENSE>)。题材来自用户提供的 [GDD](<GAME_DESIGN_GDD.md>)；这是非官方同人开发项目，不代表 Anthropic 背书。
