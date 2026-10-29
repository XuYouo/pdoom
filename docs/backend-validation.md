# 后端验证记录

验证日期：2026-10-27（Asia/Shanghai）。范围：共享 task-1 的 Scala 后端8API与测试；不把本项通过等同于全量游戏完成。

## 环境与隔离

- Java 17.0.17（已有）、PostgreSQL 16.14（已有）；Scala 3.3.6、sbt 1.10.7 与依赖均在项目本地下载/缓存。未安装系统软件、未修改其他 preset、未使用现有数据库凭据。
- 没有连接/改动用户数据库。经端口检查后，使用自有 foreground PostgreSQL 进程：`127.0.0.1:55439`，仅供本次任务的 `pdoom_test` 数据库；数据目录位于后端 gitignored `.local/pg-test.*`。
- [隔离脚本](<../backend/scripts/test-postgres.sh>)每次创建新 cluster，不复用旧端口。集成测试要求 `PDOOM_TEST_ISOLATED=1` 且URL完全等于测试URL；每个用例再建立独立随机schema。真实Main/浏览器使用该测试库的public schema。
- 所有构建/数据库/后端后台job均已追踪并收集输出；本任务自有Main与隔离PostgreSQL已停止，关闭证据见最后一节。

## 构建与真实测试

执行命令（仓库根）：

```bash
bash backend/scripts/sbt-local.sh compile
PDOOM_TEST_ISOLATED=1 \
PDOOM_TEST_DB_URL=jdbc:postgresql://127.0.0.1:55439/pdoom_test \
  bash backend/scripts/sbt-local.sh test
```

最终完整测试（19:18:50，job `bash-472b2857fe284e67`）：**Total 19, Failed 0, Errors 0, Passed 19，exit 0**。其中7个纯函数/密码安全测试，12个真实HTTP/PostgreSQL集成测试，未跳过。包含深层JSON、伪造转发头限频和新增健康检查200/503断言；此前18项版本也已完整通过两轮。

| 验证项 | 实测证据 |
|---|---|
| 编译 | 初版65个Scala生产源文件成功编译；新增健康路由/DTO后共67个，增量编译与测试源编译全部通过 |
| 8API全部贯通 | 真实Ember server/client完成注册、登录、当前用户、读档、写档、结算、榜单、退出 |
| 密码与token存储 | 600000次PBKDF2、不同随机盐、正确/错误口令、token格式与SHA256摘要；实际数据库中只有hash，响应没有hash |
| 登录失败与唯一性 | 不存在账号/错误口令同401文案；大小写相同用户名409；非法类型/注入样式用户名400 |
| 认证和所有权 | 未登录401；失效会话401；logout只撤销当前会话；另一个登录会话仍有效；Bob无法读取Alice存档；嵌套/顶层userId或role被400拒绝 |
| 乐观锁并发 | 两个独立token并行首次写档恰好200+409；并行expectedRevision=1更新也恰好200+409，最终revision=2 |
| 存档规则 | schemaVersion、重复/未知ID、负数和非整数revision、范围不合法失败；失败后仍无存档/成绩 |
| 幂等结算 | 同user/runId并发仅1行且返回同scoreId/PB；不同数据409；更高成绩后重放仍返回首次PB；另一个用户可以独立使用同runId |
| 排行榜 | 真实记录按分数排序、rank连续、nextOffset正确；limit/offset越界400；空榜不是假数据 |
| HTTP边界 | malformed JSON、非JSON媒体类型、数组body、超64KiB请求、40层嵌套JSON均400；不存在路由404 |
| 认证限频 | 即使每次伪造不同X-Forwarded-For，第21次登录尝试仍429 |
| 独立健康路由 | GET /health 经真实DB事务返回200 `{ok:true}`；已关闭连接池返回503 `{ok:false}`，无内部信息，8API注册表不变 |
| 未知500 | 测试专用故障在创建用户+会话后抛带内部SQL/token样本文本的异常；HTTP只返回通用message和requestId，原始文本不泄漏 |
| 事务回滚 | 上述故障后用户计数0；取消一个已写用户+会话但未提交的事务后用户计数同样0 |

测试源码：[HTTP集成](<../backend/src/test/scala/HttpIntegrationSuite.scala>)、[纯存档/结局/DTO](<../backend/src/test/scala/services/game/ValidationSuite.scala>)、[密码令牌](<../backend/src/test/scala/services/user/SecuritySuite.scala>)、[隔离数据库探针](<../backend/src/test/scala/support/TestDatabaseTable.scala>)。

## 真实Main与持久化检查

真实Main已绑定默认 **http://127.0.0.1:8081**（非测试Kleisli替身）。[冒烟脚本](<../backend/scripts/http-smoke.py>)的 `create` 模式已完成真实HTTP注册、存档与结算，exit0，输出：

```text
PASS Main 127.0.0.1:8081 register/save/submit; non-secret restart fixture retained
```

只在gitignored本地文件保留随机用户名、存档与成绩ID，不保存/输出bearer token。旧Main已停止，使用新fork JVM、`PDOOM_DB_INITIALIZE=false`重启同一测试库。重启后GET /health为200 `{ok:true}`，`check` 模式exit0：

```text
PASS restart persisted account/save/revision/idempotent score/leaderboard/logout
```

这验证的是**后端进程重启**后账号、存档REV1、成绩ID/PB及榜单仍存于真实PostgreSQL；未进行数据库主机断电/灾难恢复测试。新Main没有原Cats Effect非主线程警告。

Lead另报告其真实浏览器用例已通过（job `bash-0e7544bcc18d403d`，exit0，1 passed）：UI注册→读空云→上传检查点REV1→页面reload恢复会话→读REV1→退出撤销→榜单无错误；[截图由Lead提供](<../artifacts/browser/cloud-saved.png>)。本后端任务未自行声称审阅该截图。Lead随后报告最终4项浏览器E2E全部通过（17.9s，exit0）：真实云同步、键盘暂停/重开、窄屏/表单、损坏本地存档恢复。联调结束后已按约定停止自有Main及隔离数据库。

## 已发现并修复的问题（不隐藏失败轮次）

1. 首轮compile：`remoteAddr`为ip4s地址而非String，已显式转换；随后compile exit0。
2. 首轮test：7单测通过，11集成因Java `UnknownHostException: 127.0.0.1`失败。独立Java Socket探针确认loopback可连接；环境向Java注入SOCKS代理，而pgjdbc/JDK对numeric loopback是否解析的规则不一致。项目JVM显式加入loopback non-proxy参数后真实连接正常。未改系统代理/hosts。
3. 第二轮test：已连接真实数据库，但HTTP有效JSON被统一400拒绝；发现使用`mediaType.toString`比较媒体类型（其为调试表示）。改为http4s `MediaType.application.json`值比较后18/18通过。
4. 单独createdb首次使用空PGSERVICE导致工具尝试加载空服务名（exit1，未建库）；改为显式unset环境服务变量后成功创建自有隔离库。
5. 初次Main smoke出现Cats Effect非主线程警告；已将run设置为fork JVM，重启实测`running (fork) pdoom.Main`、绑定8081成功，原警告消失。

## 架构自检

- 8个公开用例均独立文件，唯一入口`plan(connection)`；鉴权用例全部继承APIWithTokenMessage，无空转发Service。
- user拥有users/user_sessions；game拥有game_saves/game_scores。game读取当前用户名经用户API，共享同一事务连接，不跨域写表。
- [领域对象](<../backend/src/main/scala/services/game/objects/GameSave.scala>)、[传输DTO](<../backend/src/main/scala/services/game/objects/apiTypes/GameSaveData.scala>)、表内部Row分离；UserId/SessionId/RunId/ScoreId为纯值类型。
- [事务管理](<../backend/src/main/scala/system/DatabaseSession.scala>)集中在路由器外边界，表仅使用传入连接；成功提交，错误/取消回滚。SQL均在表模块，参数绑定，JDBC由IO.blocking包裹。
- [系统路由器](<../backend/src/main/scala/system/api/APIMessageRouter.scala>)无业务服务依赖；token解析由用户领域提供，客户端身份不可信。所有已接受业务API（含只读）均走事务；协议层拒绝在连接前完成。
- [共享注册表](<../contracts/api.json>)由构建复制为资源、运行时显式读取，未改写该契约，无类名反射。
- 错误响应的未知500使用通用文本，日志只带关联ID和异常类型。没有在生产路由注册故障注入/测试探针。

## 真实剩余任务与限制

- 浏览器联调证据由Lead提供，已标注来源；全量游戏玩法/美术验收不在本后端任务范围。后端进程重启持久化与自有进程清理均已完成。
- 这是单机模拟、自报成绩的非竞技榜：范围/结局/时长/幂等检查并不是服务端权威反作弊。
- 当前初始schema v1；未实现后续版本化迁移、生产备份恢复验证、会话清理任务、账号找回。
- 限频为单进程内存固定窗口，重启清空。反向代理会使用户共享来源IP，部署前需可信代理策略和边缘限频；未做互联网压测/TLS/生产部署。
- offset榜单在新记录插入时可能移动，非快照游标；rank为确定排序下的位置，榜单含每个提交单局而非每用户最佳。
- 密码、token、请求体不进入业务日志；测试报告与本地数据库/缓存被gitignore，未提交任何真实secret。
- 没有数据库环境时集成测试明确skipped，不可把纯单测通过称为后端联调通过。运行步骤见[后端README](<../backend/README.md>)。

## 生命周期最终状态

- 完整测试job `bash-472b2857fe284e67`：已收集，19/19通过、exit0。
- 初始Main `bash-998dbf48e6e745ca`：为重启验证而主动停止，已收集关闭日志。
- 重启Main `bash-a65557def2b44f45`：完成health/restart smoke及Lead最终4项E2E后主动停止，已收集输出。
- 隔离PostgreSQL `bash-4f8a07baadee453a`：在Main停止后主动停止；日志在19:24:19确认`database system is shut down`，最终shutdown checkpoint完成。
- 停止操作由管理器取消job，记录为预期的`killed`，不是把中止伪称为exit0。所有启动过的构建/测试job输出均已收集，job列表没有本任务仍运行的任务。
- 最后`lsof`验证8081与55439均无监听（检查命令exit0）。未停止用户系统服务，未删除测试cluster或触碰用户数据库；gitignored本地数据/缓存保留，后续需按README明确启动后才能访问API。
- 代码写入范围仅后端及本验证文档；前端、根package、共享契约、其他preset均未由本任务修改。
