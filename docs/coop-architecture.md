# 在线双人合作扩展（协议 v1）

## 范围与权威

用户明确扩展了实时联机范围。按照《架构与开发规范参考》E.6，实时协议与现有八个 HTTP API 分离。仍使用同一 Scala 3 / http4s Ember / cats-effect / fs2 进程，不增加服务或数据库表。房间是有上限、会过期的进程内临时状态，进程重启会关闭房间。

房主的 TypeScript 游戏循环负责两个真实玩家及共同世界的模拟；Scala 负责认证、席位、准备、对局生命周期和有界转发。客机输入必须真正作用于房主的第二个玩家，客机接收同一世界的快照。React 只展示低频房间状态，不持有逐帧状态。本方案不声称抵抗恶意房主，也不将合作世界写入单人 v1 存档或单人排行榜。

`COOP_BUILD_ID = 'pdoom-coop-v1'`。一房间仅允许两个不同已登录用户，slot 0 为房主、slot 1 为客机，无观战席位。服务器从已验证会话绑定身份，所有客户端提供的 userId / role / playerId / slot 均不可信，也不在客户端协议中允许。

## 传输与认证

同源 WebSocket `/realtime/coop`。生产使用 HTTPS/WSS 和显式允许的 Origin。`PDOOM_COOP_ORIGINS` 为逗号分隔的精确来源；默认仅 `http://127.0.0.1:8080,http://localhost:8080`。Vite 开发代理转发 `/realtime` 到 8081，启用 `ws: true`。现有服务默认绑定回环地址，多设备部署需要明确配置可访问地址及反向代理。

浏览器首帧必须在 5 秒内发送：

```json
{"v":1,"type":"auth","token":"已有登录返回的43字符token"}
```

成功收到 `{"v":1,"type":"authenticated"}`。token 不放 URL、不返回、不记录。复用已有用户领域认证，在短数据库事务内验证并立即释放连接；绝不让 WebSocket 生命周期占用 JDBC 事务。连接仅保留经过验证的 userId/sessionId；通过用户领域内部 API 每 10 秒重新验证有效性，创建、加入、重连和开始前也验证。注销或过期会在下一次验证时关闭连接，最多约 10 秒（另加正在执行的短数据库查询）。

服务器每 5 秒发送标准 WebSocket Ping，浏览器自动 Pong；15 秒未见入站消息/Pong 视为断线。应用也可发 `{"v":1,"type":"ping"}`，响应 `{"v":1,"type":"pong"}`。

## 客户端控制消息

所有消息要求 `v:1`，拒绝未知字段。requestId 为 1–64 位 ASCII 字母、数字、短横线或下划线。控制消息成功响应 `{"v":1,"type":"ack","requestId":"..."}`，失败响应下面列出的 error。大厅创建、加入、准备、开始和离开保持单次操作 pending，只有 ack 或 error 后才再次提交；对局命令由实际世界状态和 requestId/controlId 确认。requestId 用于关联响应，并非跨连接幂等键。

```json
{"v":1,"type":"create","requestId":"c1","buildId":"pdoom-coop-v1"}
{"v":1,"type":"join","requestId":"j1","code":"7GXK4N2P","buildId":"pdoom-coop-v1"}
{"v":1,"type":"ready","requestId":"r1","ready":true}
{"v":1,"type":"start","requestId":"s1"}
{"v":1,"type":"leave","requestId":"l1"}
{"v":1,"type":"reconnect","requestId":"rc1","roomId":"服务器发出的UUID"}
{"v":1,"type":"command","requestId":"p1","action":"pause"}
```

command 仅允许 `pause`、`resume`、`continue-ready`。pause 和 continue-ready 双方都可发；resume 仅房主可发。pause / continue-ready 由服务器向双方广播；房主依据各自 slot 对休息区、过关和失败界面的 continue-ready 做双确认，不能把单次客机消息当作任意重试/跳关指令。技能（Q/E/R）通过 input 的边沿表达，不增加控制命令。

开始仅限房主，要求两位成员在线且均 ready。服务器生成 matchId。创建和加入时由服务器检查 buildId。reconnect 消息不携带新的 buildId，服务器验证原用户席位；当前客户端接收 room 后核对其 buildId，版本不符即终止连接。同一用户不能同时占两个席位或创建多个房间。邀请码为 8 位不易混淆的随机字符；join 原子检查容量，竞争加入只有一位成功。

## 服务器房间消息

房间每次可见状态改变向每位在线成员分别发送（selfSlot 按接收者生成）：

```json
{"v":1,"type":"room","roomId":"uuid","code":"7GXK4N2P","buildId":"pdoom-coop-v1","phase":"lobby","version":1,"selfSlot":0,"players":[{"slot":0,"connected":true,"ready":false}],"matchId":null}
```

phase 为 `lobby`、`playing` 或 `reconnecting`；不暴露数据库 userId 或 sessionId。version 单调增加。离开后发 `{"v":1,"type":"left","roomId":"uuid"}`；房间结束发 `{"v":1,"type":"closed","roomId":"uuid","reason":"host_left"}`。

closed.reason：`host_left`、`guest_left`（仅开始后的主动退出）、`reconnect_timeout`、`room_expired`。客机在 lobby 主动离开只移除自己的席位、清除房主 ready，房主可继续邀请。房主离开始终关闭房间。lobby 空闲最多 30 分钟。

## 输入、世界与命令转发

```json
{"v":1,"type":"input","seq":1,"payload":{"move":1,"jumpPressed":false,"jumpHeld":false,"dashPressed":false,"fire":true,"aim":null,"rewindPressed":false,"insightPressed":false,"rerollPressed":false,"reviveHeld":false}}
{"v":1,"type":"state","seq":1,"payload":{"world":"由同build客户端定义的世界DTO"}}
```

仅客机可发送 input，且房间必须 playing；仅房主可发送 state，playing 或 reconnecting 均可。seq 为 0 至 2^53−1 的整数，在当前连接和消息类型内严格递增；换连接可从 0 重启。服务器转发时添加可信 `slot`、`roomId`、`matchId`、`connectionId`（发送者 socket UUID），移除客户端关联字段。接收端按 connectionId 区分序号区间，新连接从 0 起步；同一来源连接仍严格递增，旧连接的席位已被撤销。command 转发带服务器绑定的 slot、roomId、matchId，以及 action 和 requestId，不包含 connectionId。客户端使用 state.payload.controlId 回显已处理的 pause/resume requestId，防止旧的暂停快照覆盖刚确认的恢复。

input payload 精确匹配 FrameInput：move ∈ {-1,0,1}，布尔操作位，aim 为 null 或有限且绝对值不超过 1e6 的 x/y；rerollPressed / reviveHeld 可选，省略时由接收端按 false 处理，显式提供时必须是 boolean，其他字段必需。state payload 必须是 JSON 对象，由同 build 的前端负责完整运行时快照 DTO 验证；服务器限制其大小、深度、数组和数值，不将任意 payload 当作存档或数据库数据。完整断点/回溯历史的格式属于游戏层，不能用单人 checkpoint 冒充可恢复世界。

服务器硬上限：单帧/完整消息 64 KiB，input 2 KiB；JSON 深度 16、单数组最多 4096 项、对象最多 256 个字段、字符串最多 8192 字符、数值有限。input 每秒最多 60 条，state 每秒最多 20 条，控制每 10 秒最多 30 条。建议发送频率 input 30 Hz、state 15 Hz。控制/输入发送队列有界 64 条，世界快照队列仅保留最新一条；慢消费者关闭连接并进入重连流程。最多 128 个 WebSocket 连接和 64 个房间；认证按真实来源地址限流。

客机输入超过 250 ms 未更新时，房主清空所有持续输入；游戏中远端输入或世界快照超过 1200 ms 未更新时，客户端请求全队暂停。断线/重连开始立即清空输入，不等待下一帧。连续移动与开火不可在掉线后保持。技能边沿在游戏适配层只消费一次。初次世界/队友握手超过 10 秒仍未完成时，运行时显示明确的结束状态，不无限等待。

## 重连

网络断开保留原用户席位 30 秒；其他成员收到 room.phase=reconnecting，必须暂停全队模拟并清空输入。重连必须先在新 socket 认证，再发送 reconnect(roomId)，身份必须匹配保留席位。服务器替换连接 epoch，旧连接的消息/结束回调不能移除新连接。房主不迁移，任一保留席位超时关闭房间。

lobby 中掉线后重新凑齐原在线成员即恢复 lobby，不要求世界快照，ready 会清除。进行中重连后仍为 reconnecting；双方都在线后房主必须发送新的 state，再由房主显式 command resume，服务器才切回 playing。不允许用重连前缓存快照直接续跑。房主 JS 运行时仍在的网络重连可以继续；房主刷新/运行时丢失时，客户端必须明确结束本局或实现完整世界恢复，不能声称从单人存档恢复了联机进度。

## 错误与关闭

```json
{"v":1,"type":"error","requestId":"j1","code":"room_full","message":"房间已有两位玩家。"}
```

业务错误保持 socket：`already_in_room`、`room_not_found`、`room_full`、`build_mismatch`、`not_in_room`、`forbidden`、`invalid_phase`、`not_ready`、`reconnect_pending`、`resync_required`、`stale_sequence`、`capacity`。非法协议/认证/限流先发送 error（网络允许时）再关闭：`bad_message`、`unsupported_version`、`unauthorized`、`auth_timeout`、`auth_unavailable`（临时认证服务不可用，不代表登录失效）、`rate_limited`、`message_too_large`、`slow_consumer`、`heartbeat_timeout`、`connection_replaced`。关闭码策略违规 1008、超大 1009、服务容量 1013，正常退出房间不必关闭 socket。错误只包含公开原因，不能含 token、SQL、原始 payload。

## 验证边界

纯运行时测试覆盖原子两人容量、同用户席位保护、准备/开始权限、转发身份、单调序号、非法输入、重连旧连接清理、超时及有界队列。实际 Ember WebSocket 测试覆盖 Origin、首帧认证、双连接转发与关闭；真实 PostgreSQL 认证测试复用隔离数据库约束，禁止默认开发库。现有 HTTP 合同和事务测试保持不变。

后端编译/定向测试：`bash backend/scripts/sbt-local.sh compile`、`bash backend/scripts/sbt-local.sh 'testOnly pdoom.tests.realtime.*'`。真实 DB 集成必须显式设置 `PDOOM_TEST_ISOLATED=1 PDOOM_TEST_DB_URL=jdbc:postgresql://127.0.0.1:55439/pdoom_test`，没有隔离夹具时只能报告跳过。现有 `backend/scripts/test-postgres.sh` 会改写 active-test-cluster-path；并行验收应自建本轮专属集群，不能覆盖已有指针或启动系统服务。

浏览器验收需要两个独立账户/浏览器上下文连接真实 Scala 服务，证明两人的移动/跳跃/开火都作用于同一世界、敌人/拾取只结算一次，并验证暂停、准备、断网、重连、退出。仅房间服务或装饰性第二角色不构成完整联机验收。
