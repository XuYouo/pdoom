# 在线双人合作验收记录 · 20261107

本记录区分实际浏览器联机、Scala 传输/身份验证、纯 TypeScript 游戏规则，以及仍未完成的验收。本轮实现是两个独立账户通过真实 Scala WebSocket 共同控制一个世界；房主 TypeScript 循环负责两个角色与共享世界，客机发送自己的输入。以下结果不等同于五章已经由两人在线完整通关，也不等同于公网或真实手机验收。

## 已确认的结果

| 验证层 | 当前结果 | 证据与边界 |
| --- | --- | --- |
| Scala 联机扩展 | **16 / 16 通过** | 10 个房间/协议运行时测试、4 个真实 Ember WebSocket 测试、2 个真实 PostgreSQL 会话测试。最终与原 HTTP 套件统一运行，**32 / 32、0 失败、0 错误，sbt 21 秒**；见[统一日志](../artifacts/ui-workbench-20261107/coop-backend-unified-final.log)及同目录 `coop-unified-TEST-*.xml`。 |
| 现有 HTTP API | **16 / 16 通过** | 与上述联机扩展同次运行，覆盖原八个 API、存档 CAS、成绩幂等、身份隔离及事务回滚；见[最终 HTTP XML](../artifacts/ui-workbench-20261107/coop-unified-TEST-pdoom.tests.HttpIntegrationSuite.xml)。独占临时 PostgreSQL 的随机测试 schema 不影响浏览器验收账户。 |
| 本机真实双账户主流程 | **最终 pass6：1 / 1 通过，45.9 秒（单项 44.7 秒）** | [测试定义](../tests/e2e/coop-online.spec.ts)、[最终日志](../artifacts/ui-workbench-20261107/pdoom-coop-online-pass6.log)、[通过标记](../artifacts/ui-workbench-20261107/coop-online-pass6/.last-run.json)；真实页面注册、两个独立浏览器上下文、真实 Scala/PostgreSQL 与 WebSocket。实战、暂停、断线恢复、退出及单人存档保持在同次运行中通过。 |
| 本机响应式合作 UI | **pass2：2 / 2 通过，约 47 秒** | 390×844 与 844×390 两种浏览器视口，真实账户/建房/开局/暂停/嵌套设置/退出；正反 Tab 与 Escape、原单人存档不变；[测试定义](../tests/e2e/coop-ui.spec.ts)、[通过标记](../artifacts/ui-workbench-20261107/coop-ui-pass2/.last-run.json)。这是桌面浏览器调整视口，不是真实 Android 设备。 |
| 单人 UI 浏览器联合回归 | **8 文件 / 27 项通过，1.9 分钟** | 单次运行 menu-polish、settings-ui、account-ui、hud-focus、context-workbench、rest-transactions、skill-state、combat-feedback；[日志](../artifacts/ui-workbench-20261107/pdoom-solo-final-pass1.log)、[通过标记](../artifacts/ui-workbench-20261107/solo-final-pass1/.last-run.json)。账户 5 项使用 API fixture，其余运行实际引擎交互。这是所列 8 文件联合回归，不是全仓浏览器套件。 |
| 五章合作核心与镜头 | **4 文件 / 57 项定向纯测试通过** | [核心记录](../artifacts/ui-workbench-20261107/coop-core-validation.md)：51 项共享世界、五章适配、完整快照 codec，另有 6 项团队镜头测试。没有真实浏览器或网络参与这些纯测试。 |
| 前端运行时 | **6 / 6 定向测试通过** | [Runtime 测试](../tests/frontend/coop-runtime.test.ts)使用真实 core/codec/GameBridge；仅 scene、渲染和输入/传输边界为 mock。验证 host 60 Hz、两角色真实移动与开火、guest 不自行模拟、HUD/coop-view 每秒最多 7 次、输入失鲜、初始同步超时、旧暂停快照、初始重连房间。 |
| 合作 UI 定向单测 | **41 项通过** | [UI 验收记录](coop-ui-20261107.md)中的 4 文件定向结果；与上面的完整游戏、浏览器或后端测试分开计数，不推算为全仓通过。 |
| 全仓 TypeScript / ESLint / Vitest | **typecheck、lint 通过；最终标签微调后 132 文件 / 7,303 项测试再通过，11.19 秒** | [当前工作树全量单测日志](../artifacts/ui-workbench-20261107/final-unit-after-labels.log)、[最终全量 lint 日志](../artifacts/ui-workbench-20261107/final-lint.log)；最终 `git diff --check` 通过。此前 [10.93 秒全量单测日志](../artifacts/ui-workbench-20261107/pdoom-final-unit-20261107-pass2.log)保留。首轮 30 个失败来自旧 SSR/root wrapper、Context meter/SVG、13 键输入测试契约；保留原断言并迁移后，全量重跑通过。 |
| 生产构建 | **最终标签微调后通过，4.45 秒** | [最终构建日志](../artifacts/ui-workbench-20261107/pdoom-final-build-labels.log)；此前 [4.48 秒构建日志](../artifacts/ui-workbench-20261107/pdoom-final-build-20261107.log)也保留。最终微调另通过 scoped ESLint 与 typecheck。仍有 Phaser 1,352.48 kB 的 chunk 体积告警；不是构建错误。 |

上述日志已完整复制到仓库 artifacts，原 `/private/tmp/` 文件保留。主联机浏览器、后端、全量单测及所列单人浏览器回归均有各自执行证据，不互相替代验收范围。

## 主浏览器最终 pass6 实际证明了什么

两个独立浏览器上下文分别通过页面注册新账户，使用邀请码进入同一两人房间，双方准备后由房主开始。证据读取公开 WebSocket 的 state 帧并执行完整 codec 解码，没有读写 Phaser 私有世界，也没有用 mock 世界替代服务器。用于注入一次断线的 WebSocketRoute 透明连接真实服务器，仅主动关闭一次客机连接。

该测试断言：

- 房主与客机接收同一 runId 的第一章世界，真实 tick 持续推进。
- 客机按 D 只移动 2P，房主看到同样的 2P 位移；释放后两端都观察到 2P 水平速度归零。房主按 D 只移动 1P。
- 客机 J 开火增加自己的 actionCounts，并在共享世界中出现 ownerPlayerId=p2 的子弹；独立输入检查阶段 1P 的射击次数保持零，证明输入没有错误绑定给房主。
- 随后两位玩家实际 J 开火击杀一次 `parrot-1`，共享得分增加 120、代币增加 6；不是直接修改敌人 HP 或注入奖励。
- 2P 正常移动并按住 Space 跳跃拾取 `token-1`，共享得分再增加 24、代币再增加 12，总计 144 / 18；1P 再走到同一位置跳跃，资源没有重复增加。
- 真正暂停后，两端解码快照中的 tick、epoch、敌人、拾取列表与共享资源一致。
- 客机暂停会同时打开双方暂停界面，房主 tick 保持不变；客机没有恢复按钮，房主确认恢复后继续推进。
- 真实客机连接断开后双方进入重连状态、模拟停止；同一身份自动重连后仍等待房主，显式恢复后继续同一对局。
- 房主结束合作后客机收到结束界面；双方返回终端，开始前保存的两个不同单人存档字符串逐字节不变。
- 实际主机发送的 state 包小于 65,536 字节，观察到多个有效状态帧，两个页面没有 pageerror。

保存的最终 pass6 成功截图：[大厅](../artifacts/ui-workbench-20261107/coop-online-pass6/coop-online-real-Scala-two-5cdaa-ect-and-isolated-solo-saves/real-online-lobby.png)、[房主双角色画面](../artifacts/ui-workbench-20261107/coop-online-pass6/coop-online-real-Scala-two-5cdaa-ect-and-isolated-solo-saves/real-coop-host-independent-players.png)、[客机同一世界](../artifacts/ui-workbench-20261107/coop-online-pass6/coop-online-real-Scala-two-5cdaa-ect-and-isolated-solo-saves/real-coop-guest-same-world.png)、[共享拾取只结算一次](../artifacts/ui-workbench-20261107/coop-online-pass6/coop-online-real-Scala-two-5cdaa-ect-and-isolated-solo-saves/real-coop-shared-pickup-once.png)、[重连后等待房主](../artifacts/ui-workbench-20261107/coop-online-pass6/coop-online-real-Scala-two-5cdaa-ect-and-isolated-solo-saves/real-reconnected-awaiting-host.png)。主代理实看确认：角色同位置时 P1 名牌在上、P2 在下，无遮挡。pass5 曾实看发现该重叠，最终只修标签避让后重新执行完整流程；此前 pass3/pass5 的成功证据与 pass1/pass2 的失败资料均保留。

pass4 在完成战斗/拾取/重连后，最后返回单人并重建 Phaser 时，等待按钮的默认 5 秒预算超时；后续失败截图已显示引擎就绪。该次仍记为失败，[失败日志](../artifacts/ui-workbench-20261107/pdoom-coop-online-pass4.log)、[trace 与错误上下文](../artifacts/ui-workbench-20261107/coop-online-pass4/coop-online-real-Scala-two-5cdaa-ect-and-isolated-solo-saves/error-context.md)保留。pass5 将这一步改为与初次引擎启动相同的 15 秒预算，游戏行为与战斗断言没有放宽，[pass5 日志](../artifacts/ui-workbench-20261107/pdoom-coop-online-pass5.log)记录 1 / 1 通过、45.4 秒（单项 44.6 秒）。最终 pass6 的[真实返回耗时 JSON](../artifacts/ui-workbench-20261107/coop-online-pass6/coop-online-real-Scala-two-5cdaa-ect-and-isolated-solo-saves/engine-return-readiness.json)为房主 **5,646 ms**、客机 **2,934 ms**；这只代表本机 Chrome SwiftShader 测试，不能作为真机性能结论。当前自然玩法验证限于第一章上述敌人与拾取，不包含在线跨章推进、双人救援或完整五章通关。

## 协议、恢复与单人合同的复核

当前实现保持八个 HTTP action 和既有存档/成绩 DTO；房间不新增数据库表，生命周期和转发不占用长数据库事务。两个不同用户的席位由服务器绑定，邀请码加入原子检查两人上限，客机不能开始对局或发送权威 state。房主不迁移，离线席位默认保留 30 秒；超时状态机有后端测试，浏览器已验证窗口内重连，尚未以浏览器完整计时验收等待满 30 秒后结束。

`state`/`input` 转发包含可信 `connectionId`，新连接可以从 seq=0 重新开始；`command` 不含该字段，使用 requestId 及 state.payload.controlId 确认暂停/恢复。服务器在 create/join 检查 buildId；reconnect 不提交新的 buildId，由服务器验证原用户席位，当前客户端收到 room 后再检查版本。架构说明已按这些事实校正。

客户端 250 ms 未收到输入先清除 held 状态，游戏中远端输入/世界超过 1200 ms 失鲜请求全队暂停，初次同步超过 10 秒明确结束。服务器应用协议限制完整消息 64 KiB、input 2 KiB、JSON 深度 16、数组 4096 项、对象 256 键，并限制频率、队列和房间/连接数量。输入建议 30 Hz，状态建议 15 Hz；持续帧不进入 React 状态，HUD 约 200 ms 发布一次。

真实身份在首帧认证及关键控制操作中使用短事务验证，周期会话复核约每 10 秒启动一次；数据库调度/查询耗时会影响实际关闭时刻，这不是硬实时登出时限。临时认证服务故障为 auth_unavailable，只有真实注销/过期为 unauthorized，避免错误清除仍有效的登录。

完整 codec 保留两个角色的真实历史、Q 路径、各自行为与共同世界；不会把单人 checkpoint 当作完整实时世界。五章压力夹具包含 180 子弹、满行为列表、32 条中文事件；额外使用真实 relay 字段与 UUID 的只读探针测得第一至五章分别 **54,072 / 54,283 / 54,091 / 58,783 / 60,119 字节**，最大深度 11、最大数组 433、最大对象 22 键，符合当前服务器边界。这些是选定压力夹具的测量，不代表任意恶意输入的所有组合。

交叉复核曾发现 checkpoint 与当前 runId/seed/stage、slot-zero host、休息状态之间缺少关联校验；核心代理已增加 coherentProgress 和负测试。正常五章胜利/继续及 checkpoint90 往返、各人不同 HP 的跨章保留、共享入站奖励没有发现新的缺陷。房主权威仍不提供防作弊保证；合作结果不自动写入单人云档或排行榜。

## 尚未完成与交付边界

- 全仓完整浏览器套件未整体运行，不能由全量单测或所列单人/合作定向浏览器测试推断。
- 第一章自然跳跃、击杀与拾取已通过；完整五章在线长流程、真实双人救援、所有 Boss 与结局的浏览器验收尚未完成。五章纯测试不能替代这些操作。
- 浏览器端断线边界已覆盖一次客机断开/恢复；30 秒彻底过期、房主浏览器刷新/进程丢失、所有网络抖动/慢连接组合尚未完整浏览器验收。房主运行时丢失不支持从单人存档恢复合作世界。
- 实际 ADB 检查成功但设备列表为空，因此**真实 Android 设备验收被无设备阻断**，没有真实设备截图。390×844/844×390 浏览器结果不能替代真机。
- 尚未部署公网、配置生产 HTTPS/WSS/反向代理或验证两台物理设备跨网络联机，也未进行服务容量/长时运行/网络延迟压力验收。当前默认回环地址与允许的开发 Origin 不等于公网服务。
- 合作房间是内存状态，服务重启会结束房间；不提供房主迁移、跨进程房间持久化或防恶意房主机制。

验收后已停止本轮 Scala API（session 74184、PID 46632）及独占临时 PostgreSQL（session 33966、PID 42841）；核对进程工作目录与 PostgreSQL `postmaster.pid` 后，先对 API 发送 SIGTERM，再以 `pg_ctl -m fast -w stop` 安全关闭数据库。最终确认 **8081 / 55439 均无监听**，数据库控制文件状态为 `shut down`，临时数据目录 `backend/.local/pg-coop.oHhIbJ` 保留；见[清理记录](../artifacts/ui-workbench-20261107/coop-service-cleanup.json)。没有改原 active-test-cluster 指针，没有停止其他服务，也没有把临时测试数据库称为生产部署。
