# P(Doom) backend

Scala **3.3.6** / Java **17** / Cats Effect **3.5.7** / http4s **0.23.30** / Circe **0.14.10** / PostgreSQL JDBC **42.7.7** / HikariCP **5.1.0**。一个进程、一个 PostgreSQL 数据库、user/game 两个逻辑领域；没有内存假后端、默认账号或模拟榜单。

## 构建

所有命令从仓库根目录运行。先阅读 [构建脚本](<scripts/sbt-local.sh>)；它仅把 sbt / Ivy / Coursier 缓存写入后端本地忽略目录，不安装系统软件。

```bash
mkdir -p backend/.tools
curl --fail --location --proto '=https' --tlsv1.2 \
  https://repo.maven.apache.org/maven2/org/scala-sbt/sbt-launch/1.10.7/sbt-launch-1.10.7.jar \
  -o backend/.tools/sbt-launch-1.10.7.jar
shasum -a 256 backend/.tools/sbt-launch-1.10.7.jar
# 预期 SHA-256:
# 3cca02818047327a83efde776103a1ef92f76f72c062badbbb062499a3270c07
bash backend/scripts/sbt-local.sh compile
```

[构建定义](<build.sbt>)只把[共享注册表](<../contracts/api.json>)复制为 classpath resource，不修改共享契约，不依赖运行时类名反射。注册缺失/多余/重复会启动失败。

### 本机代理说明

本次环境给 Java 注入了 SOCKS 代理。pgjdbc 对 numeric loopback 与 JDK 的自动直连判断不同，会误报 `UnknownHostException: 127.0.0.1`。构建启动脚本、fork 测试及 fork run JVM 显式设置 `-DsocksNonProxyHosts=localhost|127.0.0.1|[::1]`，只影响子进程，不改系统代理、hosts 或其他 preset。外部目标不因此获得直连例外。

## 启动已有的、由你明确选择的应用数据库

不会自动选择本机 PostgreSQL 或读取凭据文件。必须显式提供：

| 环境变量 | 说明 |
|---|---|
| `PDOOM_DB_URL` | 必填，PostgreSQL JDBC URL |
| `PDOOM_DB_USER` | 必填，数据库用户 |
| `PDOOM_DB_PASSWORD` | 数据库密码；通过环境/密钥管理注入，不提交到仓库 |
| `PDOOM_DB_INITIALIZE` | 仅值 `true` 时执行初始建表；默认不修改 schema |
| `PDOOM_HOST` | 默认 `127.0.0.1` |
| `PDOOM_PORT` | 默认 `8081` |

```bash
# 先在你拥有的运行环境设置以上数据库变量，然后：
bash backend/scripts/sbt-local.sh run
```

初始建表位于每个领域的 TableInitializer；入口只按 users → user_sessions → game_saves → game_scores 顺序，在一个事务里调用。没有用户/榜单种子数据。当前只有 v1 初始 schema，未来表结构变更必须新增版本化迁移，不能依赖 `CREATE TABLE IF NOT EXISTS` 自动升级旧表。生产环境应由迁移账号建表、应用账号仅持最小 DML 权限。

## 可复现的隔离 PostgreSQL 测试（不接触用户数据库）

仅使用已经安装的 `initdb` / `postgres` / `createdb`。没有这些工具时停止并报告，不自动安装，不回退到假数据库。

1. 阅读 [隔离数据库脚本](<scripts/test-postgres.sh>)，在专用终端或有生命周期追踪的后台任务执行：

   ```bash
   bash backend/scripts/test-postgres.sh
   ```

   脚本拒绝复用端口 `55439` 上的现有 PostgreSQL；总是新建后端本地 `.local/pg-test.*` 数据目录，使用仅限测试的 `pdoom_test` 用户、loopback TCP、私有 Unix socket，且 PostgreSQL 保持前台运行。测试 cluster 的 `trust` 认证绝不可用于生产或用户数据。

2. 确认该**自有新 cluster** ready 后创建它的测试库：

   ```bash
   env -u PGSERVICE -u PGSERVICEFILE -u PGPASSWORD PGPASSFILE=/dev/null \
     createdb --host=127.0.0.1 --port=55439 --username=pdoom_test \
     --no-password --maintenance-db=postgres --owner=pdoom_test pdoom_test
   ```

3. 运行完整测试：

   ```bash
   PDOOM_TEST_ISOLATED=1 \
   PDOOM_TEST_DB_URL=jdbc:postgresql://127.0.0.1:55439/pdoom_test \
     bash backend/scripts/sbt-local.sh test
   ```

   [HTTP 集成测试](<src/test/scala/HttpIntegrationSuite.scala>)只接受这个明确的隔离 URL 与 opt-in 标志，每个用例再新建随机 schema，启动真实 Ember HTTP 服务器并通过真实 HTTP 客户端访问。没有这些变量时集成测试标为 skipped，**不是通过**；纯函数/安全单测仍执行。

4. 如需验证真实 Main 默认端口：

   ```bash
   PDOOM_DB_URL=jdbc:postgresql://127.0.0.1:55439/pdoom_test \
   PDOOM_DB_USER=pdoom_test PDOOM_DB_PASSWORD= PDOOM_DB_INITIALIZE=true \
     bash backend/scripts/sbt-local.sh run
   ```

   确认是自己的测试后端后，阅读 [HTTP 冒烟脚本](<scripts/http-smoke.py>)，执行 `python3 backend/scripts/http-smoke.py create`；停止并重新启动自有后端后执行 `python3 backend/scripts/http-smoke.py check`。它仅保留非秘密的随机账号名、存档与成绩 ID，不打印或保存 bearer token；测试密码是脚本中的公开 fixture，不是任何真实凭据。

5. 先停止自有后端，再停止自有 PostgreSQL（前台终端 Ctrl+C 或管理器结束对应 job）。不停止系统服务，不删除/复用已有 cluster；测试数据留在 gitignored 本地目录中，供人工检查。

## 健康检查

独立 `GET /health` 使用真实数据库事务与 `Connection.isValid(2)`，数据库可用返回200 `{ok:true}`，不可用返回503 `{ok:false}`，不暴露连接地址/SQL/异常。它是基础设施路由，不计入8个业务API、不改共享注册表。

## 8 个 API

请求均为 POST JSON，路径以[共享注册表](<../contracts/api.json>)为准；字段见[HTTP 契约](<../docs/api-contract.md>)。

| Action | 认证 | 实现 |
|---|---|---|
| RegisterUser | 公开、限频 | [注册](<src/main/scala/services/user/api/RegisterUserAPIMessage.scala>) |
| LoginUser | 公开、限频 | [登录](<src/main/scala/services/user/api/LoginUserAPIMessage.scala>) |
| LogoutUser | Bearer | [撤销当前会话](<src/main/scala/services/user/api/LogoutUserAPIMessage.scala>) |
| GetCurrentUser | Bearer | [当前用户](<src/main/scala/services/user/api/GetCurrentUserAPIMessage.scala>) |
| LoadGame | Bearer，只读当前用户 | [读档](<src/main/scala/services/game/api/LoadGameAPIMessage.scala>) |
| SaveGame | Bearer，只写当前用户 | [CAS 写档](<src/main/scala/services/game/api/SaveGameAPIMessage.scala>) |
| SubmitScore | Bearer，当前用户＋runId | [幂等结算](<src/main/scala/services/game/api/SubmitScoreAPIMessage.scala>) |
| ListLeaderboard | 公开、有界分页 | [排行榜](<src/main/scala/services/game/api/ListLeaderboardAPIMessage.scala>) |

## 边界与安全语义

- 每个用例独立 APIMessage，唯一执行入口 `plan(connection)`；所有需认证消息继承 APIWithTokenMessage。无业务入参的消息同时使用 NoRequestMessage，不造空请求类。
- system 不依赖 user/game。路由器注入通用身份解析函数；用户领域在**同一事务连接**上把 token 解析为可信 UserId/SessionId。客户端任意层级 `userId` / `role` 一律拒绝。
- 领域 ID、领域记录、apiTypes DTO、私有数据库 Row 分离。SQL 只在表模块，PreparedStatement 参数绑定，JDBC 在 `IO.blocking` 内；表不自行获取/提交连接。
- 成功请求提交，异常或取消回滚；只读 API 也有事务。协议层拒绝（非 JSON、超体积、未知路由、限频）在连接获取前完成，不占数据库事务。
- 密码 PBKDF2-HMAC-SHA256 / 600,000 次 / 独立 16 字节盐 / 256-bit 派生值；恒定时间哈希比较。不存在的合法用户名仍做同成本 dummy 验证，登录失败文案一致。
- token 是 32 字节强随机数的 base64url 编码；数据库只存 SHA-256，24 小时过期；logout 仅撤销当前会话。认证持有该会话行锁至事务完成，以明确与 logout 的顺序。
- 用户名 `[A-Za-z0-9_]{3,32}`，唯一键忽略大小写；密码 10–128 个字符。
- 登录和注册合计每真实连接源 IP 每分钟 20 次；内存 limiter 最多 4096 个活跃键，满时拒绝，不信任 X-Forwarded-For。单进程重启会清空限频窗口；代理部署应另外配置边缘限频，不能声称是生产级反滥用系统。
- 请求最多 64 KiB，JSON 嵌套最多 32 层。存档 schemaVersion=1、云 revision 独立 CAS；新建 expectedRevision=0，既有档案冲突返回409而非覆盖。
- 成绩按 userId＋runId 唯一。事务级 game_scores advisory lock 串行化同用户结算；相同数据重试返回**首次响应**（包括当时的 personalBest），不同数据409。用户名为提交时的显示快照，不跨域写用户表。
- 排行榜是所有已提交单局记录（不是每用户只取最佳），按 score降序、created_at升序、id升序排序；rank为顺序位置。limit 1–50，offset 0–10000；offset分页在并发新成绩插入时可能移动，非快照游标。
- 非 defeat 必须 stage=5；aligned `<30`，warden `30≤doom<80`，foom `≥80`。时长 1000–86400000ms，分数上限10,000,000。actionCounts 各项上限1,000,000。
- 错误统一 `{code,message,requestId}`；未知500只给通用文案，服务端只记录关联ID与异常类型，不记录请求体/SQL/token。响应含 `Cache-Control: no-store`、`X-Request-Id`、`X-Content-Type-Options: nosniff`。

## 尚不宣称完成的事项

这是后端8API范围，不代表五章游戏/美术/账户UI全部完成。浏览器模拟的成绩是**非竞技、自报**数据，不具服务端权威反作弊。未做互联网生产部署、TLS反向代理、压测、数据库备份恢复、账号找回、会话过期清理任务或后续schema迁移；这些应在上线前另立任务并验证。开发默认同源 `/api` 代理，不开放宽松CORS。

本轮实测与故障修复证据见[后端验证记录](<../docs/backend-validation.md>)。
