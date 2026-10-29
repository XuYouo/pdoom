# P(Doom): 100% — 架构决策

依据：根目录的 GAME_DESIGN_GDD.md 与《架构与开发规范参考.md》。目标是完整五章单人平台动作肉鸽；不引入实时多人。

## 1. 实际技术栈

现有清单固定 Phaser **4.0.0**，React 19、TypeScript 5.7、Vite 6；初始锁文件仍是旧 Phaser 3，安装时同步到清单，不升级引擎。前端沿用根目录，不机械搬到 frontend。后端新增 backend：Scala 3 / Cats Effect / http4s / Circe / JDBC / PostgreSQL 单进程单数据库。

## 2. 开工前八个问题

1. **领域**：user 管身份与会话；game 管存档、单局结算与排行榜。system 仅基础设施，不反向依赖业务。
2. **表归属**：user 拥有 users、user_sessions；game 拥有 game_saves、game_scores。跨服务写入只调用对方 APIMessage。
3. **API**：RegisterUser、LoginUser、LogoutUser、GetCurrentUser；LoadGame、SaveGame、SubmitScore、ListLeaderboard。注册/登录和榜单公开，其余通过 Bearer token 认证；game 请求只操作当前用户资源。每 API 一个 Message 文件，入口 plan(connection)。
4. **页面**：GamePage 是本次唯一业务页，包含顶部运行状态、主菜单、Phaser 世界、低频 HUD、暂停/设置/上下文窗口、结算、账户/云同步、排行榜。页面私有代码就近；Phaser 只在 pages/GamePage/game 中。
5. **身份**：普通玩家账号；客户端不能指定 userId 或 role。密码 PBKDF2+随机盐，opaque token 只存 SHA-256 哈希并有过期时间/撤销。token 由路由边界换成可信 UserId；不会把账号凭证写进游戏存档。
6. **错误/状态**：HTTP {code,message,requestId}，400/401/403/404/409/429/500；未知错误无内部异常文本。React 菜单/运行/暂停/结算与请求状态用联合类型。无网络时明确标注本地模式，不显示伪造排行榜。
7. **事务/并发**：路由器每请求开启一个事务；JDBC IO.blocking，表方法不提交。存档使用 expectedRevision 乐观锁；结算 runId 幂等键，防止重试重复记录。所有 SQL 封在表模块并绑定参数。
8. **验收**：前端 typecheck/build；游戏纯规则/存档校验测试；真实 HTTP 注册登录、存取档、冲突、越权、幂等与分页；浏览器键盘可玩、重开不泄漏、失焦暂停、低频 HUD、资源无错误；五章/三结局逐项证据见 development-plan。

## 3. 数据与契约

- contracts/api.json 是动作名与路由的唯一注册清单。后端作为 classpath resource 加载；前端静态 import。禁止运行时反射类名。
- docs/api-contract.md 记录 JSON 契约；后端 DTO 与前端 objects/game、objects/user 一一对应。测试锁定字段一致性。
- 存档 schemaVersion=1，存章节起点/休息点的可重建数据及第五章完成标记90，不存 Phaser 对象。revision 为云存档版本，与 schemaVersion 无关。游戏只把stage5/90解释为完成；其他未知组合保留但不启动，回看不再次领奖。
- 排行榜是客户端模拟的非竞技榜；只做范围/时长/幂等校验，不宣称防作弊。
- Phaser 只依赖页面内 bridge（快照、保存点、结算通知、命令）；不调用 fetch 或 localStorage。React 保存边缘实现本地双槽备份与云同步。
- 游戏运行实例拥有自己的 bridge，禁止模块级可变事件总线。逐帧位置不进 React，HUD 仅事件或最大 5Hz 更新。

## 4. 美术与音频

视觉：温暖橘色玩偶 / 墨绿黑终端 / 琥珀色警告，随 Doom 增高转为故障青绿。固定 640×360 逻辑视口、nearest-neighbour 缩放；世界尺寸由章节定义，第一章2880×360、第二章640×2040、第三章3280×360、第四章2580×640、第五章3200×360。Aseprite 是最终像素资产工作流，执行预检→信息→绘制→预览→校验→导出；代码测试阶段允许明确标注的几何 blockout，但不作为完成美术。只使用自制或授权素材，歌曲/歌词不作为可再发行音频内置。

Tailwind 负责布局与基础样式；少量主题 CSS 用于像素边框、CRT 网格/扫描线、字体与 canvas 渲染，原因是这些属于全局艺术主题。

## 5. 交付与范围

完整 GDD 是长期目标，即使五章核心规则接通，也不等于完整美术、声景、内容丰富度和发布体验都已交付。每轮在[开发进度](<development-plan.md>)记录证据、差距和下一步；不把演示误称为正式完成。默认不发布资产/构建、不执行外部 CI、不修改开发技能包或其他 preset。

## 6. 多章节世界（当前已注册1/2/3/4/5）

- [章节注册器](<../src/pages/GamePage/game/data/chapters.ts>)是可玩范围的来源；未实现的stage保留原save，不静默载入第一章。
- `world.chapter`指当前世界，`save.stage`在清关后指下一章入口，两者不能混用。React通过stage-cleared事件显示本章结算，再明确启动下一章。
- 位置/检查点比较按chapter.axis解释；checkpoint先decode，工厂状态、弹幕、相机不进入v1保存DTO。
- `stepWorld`仍是纯输入/输出边界：先复制所有可变嵌套数据，再允许内部子系统修改本帧draft；海、探针、气泡和技能仅依赖固定tick时间。rest不推进世界。
- 相机只派生视口，不能反向驱动碰撞。垂直Boss入场要求玩家脚部真正越过竞技场地板；镜头/碰撞共享同一章节尺寸，命中圈使用model中的半径常量。
- 共享代码不依赖Phaser对象、网络或存储；引擎适配仍只在页面私有目录，低频HUD与持久化边界不变。
- 第三章的[运行时平台](<../src/pages/GamePage/game/systems/platforms.ts>)是碰撞/表现的共同来源；只有实际站稳的乘客接受dy载人位移。K线、热区、激光对象在新tick中复制；石化与Q吸收采用分开的每束标记，防止彼此截断或重复领奖。
- 宽竞技场在自身边界内跟随，窄竞技场仍锁定；Basilisk的750px竞技场不能沿用640px固定镜头假设。凝视的`laserRect`、龙猫身体尺寸从模型共享给视图。
- 只有静态第三章机架使用RenderTexture缓存（当前3280×360，约4.72MB颜色像素，另有引擎开销）；热区、载人表面、激光和角色始终由实时世界绘制。超设备尺寸或200万像素预算时保留原Graphics路径。重建缓存时先设置nearest再draw/render，避免已安装Phaser4.0的setFilter重传空存储；上下文恢复重新烘焙，销毁时注销监听并释放纹理。无变化文字颜色不重复触发Canvas纹理上传。
- 第四章[种子图](<../src/pages/GamePage/game/data/loomGraph.ts>)最多33节点，3组实际上下分岔；seed、时间线和安全点决定几何。展开/坍塌/吞噬状态来自本tick的Loom副本，碰撞与视图共同消费运行时平台，不另造装饰性碰撞面。安全岛须真实接触或进入其上方有限门区，不能从下方跨x触发吸附；竞技场验证完整身体及520/508实际地面，避免锁场裁人。
- [R转移](<../src/pages/GamePage/game/systems/loom.ts>)只在本安全段找合法承载，不跨下一安全点或逃离锁定竞技场，不重发拾取；显式重建Q历史起点，防空间转移被误当连续运动。地图运行时、冷却和Boss吞噬不进v1 DTO，加载安全点按seed重建。
- [Leviathan](<../src/pages/GamePage/game/systems/leviathan.ts>)与视图共享144×144接触矩形。左转由站在真实中心锚、向左冲刺速度与实际跨线位移判定，Q/R不能代替；每phase限制一次伤害边界。平台不可逆减少，HP/音乐的展示标记可在弱点窗口归还，但实际HP不恢复。React只接收小型Loom标量快照，HP被吞时卸载数值/条，不修改模拟。

## 7. 原创音频边界

- 页面私有[AudioSystem](<../src/pages/GamePage/game/audio/AudioSystem.ts>)每Scene一实例；保留Phaser `noAudio:true`，避免双上下文。构造和偏好初始化不创建AudioContext，真实开始/继续/设置手势才解锁；不借自动播放参数绕过浏览器策略。
- React [偏好hook](<../src/pages/GamePage/hooks/useAudioSettings.ts>)独占本机`pdoom.audio.v1`；声音设置不进游戏DTO、云CAS或动作计数。bridge只传规范化偏好/显式unlock与状态事件。
- 原创120BPM四层谱面与5类SFX由[原生图](<../src/pages/GamePage/game/audio/SynthGraph.ts>)合成；chip/bass/percussion/drive各自GainNode，SFX独立，效果器在最后stem增益之前。最多24 voices / 16 music voices，25ms调度仅看前100ms，不补发积压音符。主音量平方映射、缓启动及限幅不是硬件响度认证。
- 暂停、rest、menu、失焦/隐藏、WebGL上下文丢失立即同步`running:false`，不等已经停止的RAF；渐隐后停源/suspend，销毁disconnect/close。重新开始沿用同一Scene的上下文，但清除旧局动作基线。意外失败报告一次有界诊断与unavailable，不泄漏reject、不打断游戏。
- [增益时间线](<../src/pages/GamePage/game/audio/GainAutomation.ts>)显式锚定开始时刻，避免未来恢复从旧终点提前插值；不把`AudioParam.value`误当未来保持值。原生验证也不能把无输入节点的缓存getter当声音：同时检查成功排程目标/截止时刻、运行中的audio clock及旁路Analyser PCM；恢复跨拍积累能量。连续源OfflineAudioContext检验独立证明实际bus归零/恢复，FakeContext只证明调用和资源管理。
- 真实终局使`running:false`，停止本局声音与计时；完成档回看不调用音频unlock，也不创建无用途的AudioContext。用户仍可明确操作音频设置。

## 8. 最终镜像、结果和尝试身份

- 第五章的门、空椅子与镜面坐标来自[共享章节数据](<../src/pages/GamePage/game/data/chapterFive.ts>)；[Omega规则](<../src/pages/GamePage/game/systems/omega.ts>)验证实际门区与站地接近，1200ms揭示不强制改玩家坐标。恢复/剧情/对决分支分开，镜头只负责可见取景；风暴停止伤害后不继续画危险提示。
- [镜像](<../src/pages/GamePage/game/systems/mirror.ts>)使用与玩家相同的16×22身体、移动器、冲刺和自己的真实两秒运动历史。子弹对移动镜像的相对扫掠CCD、身体接触、扫描矩形与回溯吸收均消费实际运动；预警、执行、恢复空档及阶段伤害上限有独立条件。镜像Q吸收真实扫掠到的弹，反击充能上限2；不复制会让单一玩家武器永久失效的10秒循环免疫。
- [行为记忆](<../src/pages/GamePage/game/systems/behavior.ts>)只读实际成功动作计数变化，按E→Q→冲刺→射击的真实执行次序记录，不把冷却中的按键计为动作。recent最多48项，去连续同类；2/3-gram合法全集仅12+36=48种，全部有界保留，避免旧Top32永久排斥新高频组合。有效构筑从Context Effects派生，中间失活词条不能在镜像中复活。
- v1仍只有四项累计计数，没有序列字段。[Scene私有缓存](<../src/pages/GamePage/game/systems/runMemory.ts>)仅在同一连续尝试、完整安全快照精确匹配时携带已观察次序；有界深拷贝、不同runId或销毁即清空。新页、云载入或明确开启新尝试只知道真实计数/构筑，继续现场观察；HUD区分“频次编排”“基础起手”和确有匹配记录的“实际观察”，不伪造过去。
- `stage5/checkpoint90`只表示完成。实际击败镜像产生`finished + checkpoint + victory`，不发stage-cleared、不创建第六章。重建完成档仅还原同一结果，不再推进模拟、领奖或自动上传。Aligned `<30`、Warden `[30,80)`、FOOM `≥80`沿用现有服务端规则；叙事0/50/100不覆写真实Doom。
- React[结局层](<../src/pages/GamePage/components/EndingOverlay.tsx>)深拷贝后冻结结果，忽略结束后的旧HUD/检查点。三种演出可跳过；FOOM仅有限24个DOM回形针和页面内虚拟桌面，不操作操作系统、外窗或全屏。既有ScoreSubmission仅在用户明确操作后提交，不因看演出/回看而发请求。
- `runId`是不可改写成绩的**尝试身份**。[显式恢复函数](<../src/pages/GamePage/functions/checkpointAttempt.ts>)只为合法未完成检查点产生新UUID，其他全部v1字段原样深拷贝；必须落盘成功才启动。菜单恢复及死亡恢复都走此路径，避免过去已提交的defeat阻塞当前胜利。新训练已经有新ID，不二次生成；连续跨章、暂停/rest继续保持ID；完成档回看仍用原ID以维持幂等。读取云档先保留原快照，只有用户明确进入未完成检查点才开启新尝试。
- [Session边界](<../src/pages/GamePage/hooks/useGameSession.ts>)在同步发送start之前设置当前身份，拒绝旧runId的ended/checkpoint/rest快照/stage-cleared覆盖新尝试。服务器的同runId同内容幂等与不同内容409完全不变；不同尝试不靠改写旧成绩制造成功。

