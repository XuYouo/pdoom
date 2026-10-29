# 第二轮：结算上传与安全发送层验证

范围：共享 task-4；仅修改已领取的前端API/会话/结算组件、纯DTO校验、指定测试与本记录。后端沿用上一轮19测试通过的实现，本轮没有重写后端或更改8API字段/路由。不是五章完整游戏的验收声明。

## 接口与协作

- [ScoreSubmission](<../src/pages/GamePage/components/ScoreSubmission.tsx>)导出命名组件，props为`{ result: RunResult; onOpenAccount: () => void }`。Lead负责接入RunOverlay；本任务不编辑overlay、GamePage、useGameSession、bridge、renderer、CSS、根package。
- [useScoreSubmission](<../src/pages/GamePage/hooks/useScoreSubmission.ts>)对每个runId建立独立实例，在首次接收结果时固定六个请求字段。提交失败不会重新计算时长/得分/结局，不会生成新runId绕过409；同步pending门禁同时保护React更新前的双击。
- [纯v1校验](<../src/objects/game/validation.ts>)提供isGameSave/isUuid，不修改v1数据模型。Lead协调把页面saveModel改为导入/重导出，以避免发送层依赖页面实现。
- 按Lead授权扩展task-4 write scope到8个现有API类；仅为其super调用注入纯response decoder，不改其业务输入或route。通用[APIMessage](<../src/system/api/APIMessage.ts>)与[sendAPI](<../src/system/api/sendAPI.ts>)不硬编码业务DTO或依赖页面。

## 行为与安全边界

1. 用户未登录时显示登录入口，保留本局结果，不发送假成功。已有会话也仅表示可以尝试请求，服务器始终负责认证。
2. 上传中按钮禁用且ref同步防重复；组件卸载或会话变化会取消在途请求。服务端可能已经提交，因此取消/网络错误/超时都明确是“结果尚未确认”。
3. 401使对应旧会话失效，重新登录后可以重试同一payload；清理函数带expectedToken，迟到401不会删掉更新的登录。409说明同一runId已存在不同结果，重试不偷偷改runId/内容。
4. 有效时长不足1000ms或结局/范围不符时拒绝上传，不把时长硬改为1000，也不改分数制造合法输入。
5. 所有8API成功响应都由[用户DTO守卫](<../src/objects/user/apiTypes/validation.ts>)或[游戏DTO守卫](<../src/objects/game/apiTypes/validation.ts>)校验；没有`as Response`默信JSON。云存档、revision、用户名、UUID、UTC时间、榜单范围/结局、scoreId/PB均有运行时检查。
6. 每次请求有独立AbortController，10秒deadline与外部AbortSignal同时生效；结束后清理timer/listener。非JSON/非法成功响应报告invalid_response，不当成保存或上传成功。
7. 5xx返回到UI时统一安全文案，不渲染上游SQL/内部诊断。已验证的400/401/409业务错误仍保留状态语义。
8. [authToken](<../src/system/api/authToken.ts>)集中sessionStorage存取，校验完整AuthResponse和有效期，只存token、expiresAt、id/username，绝不存密码或多余服务器字段。无模块级可变会话单例，同页事件没有token/profile payload；storage只在effect/事件边缘读取，不在纯render中读取，token不进DOM/业务日志。
9. 浏览器拒绝sessionStorage时不假装可跨面板共享会话：账户面板明确报告限制，本地游戏仍可继续。
10. 成绩明确标为客户端计算、可修改的非竞技榜；不是服务端权威反作弊。

## 已执行的验证

### 类型、lint、纯边界测试

```bash
npm run typecheck
npm test -- tests/frontend/api.test.ts
npm run lint
```

2026-10-27 19:53:55：job `bash-34421ab9f22f491a` exit0。新增[API/会话测试](<../tests/frontend/api.test.ts>) **39/39通过**，typecheck与lint通过。运行时恢复后20:23:26再次执行当前文件（job `bash-c03b27616be94ecd`），同样typecheck/lint/39测试全部exit0。

此外20:06:59的完整回归job `bash-71be6a25200d4511`已收集exit0：11个测试文件共**121个单测通过**、lint通过、既有真实cloud.spec用例1 passed（10.7s）。这是该时点的整合回归数，后续其他agent新增测试可能改变总数。

覆盖全部8响应类型的合法/非法返回、空存档与revision关联、错误字段/结局/时间、exact score body和Bearer-only token、无认证不发请求、500脱敏、JSON损坏、外部signal下10秒deadline、取消清理、same-payload网络重试、结果不可变、短局不伪造时长、无效/过期会话丢弃、旧401不清新登录、密码/额外字段不持久化、storage异常、无敏感payload通知与退订。

初次typecheck发现unknown响应错误字段在别名布尔条件下未被TS收窄；改为显式守卫分支后通过，没有恢复类型断言。

### 真实后端与浏览器

沿用已inspect的上一轮脚本，使用**新的**项目隔离PostgreSQL cluster，不复用旧cluster或用户数据库：

- 恢复前PG job `bash-01a051b5c9b8491e`、Main job `bash-b703872908354a25`由该轮管理器拥有；运行时重启后job表为空，实测8081/55439均无监听，没有复用这些进程或旧cluster。
- 恢复后重新检查目录与端口，创建全新gitignored `backend/.local/pg-test.X5TBn8`，PG job `bash-f08b7cd27a6c45bc`，127.0.0.1:55439。
- 新Main job `bash-1ff70ef781f7485e`，127.0.0.1:8081；连接该新pdoom_test库，GET /health实测`{ok:true}`。后端源代码未改。
- 前端8080由Lead负责恢复，本任务未创建替代服务器；恢复后的首次探测8080尚未监听，未继续测试。Lead确认恢复后，前置8080/health代理验证正常才开始最终E2E。

[score.spec.ts](<../tests/e2e/score.spec.ts>)包含4个真实浏览器用例：

1. 合法hp=0本地检查点由真实模拟器产生defeat RunResult；登录前不上传；UI注册后双击只发一个请求；真实服务器先提交，测试丢弃响应，再次上传返回同scoreId/PB，真实榜单只有1条。
2. 用真实Logout撤销token，上传真实401后清理会话，UI重新登录，再试同payload成功。
3. 对同runId预置另一真实成绩，UI收到真实409；重试保持原payload，不伪造成功。
4. 真实服务器已经提交但响应被延后，组件带外部signal仍10秒超时；再试同payload得到第一次结果。

浏览器用例只对传输故障作有意注入，不伪造200成功或内存后端。hp=0是确定性检查点fixture，用于让真实引擎进入已有defeat事件，不表示人工完整通关。

执行命令（需已明确启动本任务隔离后端且Lead已接入组件）：

```bash
PDOOM_E2E_BACKEND=1 npm run test:e2e -- tests/e2e/score.spec.ts --global-timeout=90000
```

Lead已完成组件接入及saveModel重导出。首次score运行job `bash-e565221991cf4a75`打印4条用例断言通过（7.1s/5.3s/3.4s/14.1s），但runner在故障注入route清理阶段未退出；已主动取消并收集SIGTERM结果。**该轮不是完整exit0，不计为最终E2E通过。**

已为故障注入响应加入dispose、显式unrouteAll清理，不再对已被浏览器取消的旧route再次abort，并在释放延迟gate前等待requestfailed。运行时恢复前最后一条编辑被中断，恢复后先read核实未生效再补齐，没有盲目重试。

**最终完整重跑：job `bash-aa29845c682d4b72`已收集exit0，`4 passed (1.0m)`。** 使用90秒全局上限，独立输出目录，测试不是被强制停止后伪称通过。四用例时长分别7.8s、5.5s、3.5s、14.1s；持久[运行日志](<../backend/.local/round2-score-recovery.log>)记录完整4 passed摘要，[运行结果标记](<../backend/.local/round2-score-results/.last-run.json>)为passed。该忽略目录仅用于本机验证，不作为源码提交。

没有启用PDOOM_E2E_BACKEND时测试会明确skip，不能称通过。此次4例均实际执行，均对真实Scala/PostgreSQL后端。没有声称查看过未生成的成功截图；验证方式是浏览器真实交互、HTTP状态/响应和请求载荷断言。

## 最终联调中的服务消失与恢复（21:21 后）

Lead报告其整合浏览器前5个离线/UI用例通过，第6个真实云注册显示“服务暂时不可用”。立即检查发现：旧Main/PG job均unknown、该agent的job表为空、8081/55439无监听；Lead的8080仍在。此前没有收到最终停机通知，也未主动停止这两个服务。仅记录“回合结束后的检查发现job/进程消失”，不推断管理器内部回收机制。

故障分层证据：

- 直连8081/health：连接被拒绝，curl退出7、HTTP000。
- 经8080/health：HTTP500；空JSON POST到8080/api/registeruserapi同样是HTTP500、`Content-Type: text/plain`、空body，缺少Scala的`{code,message,requestId}`信封。
- 因而当时可重现的是**Vite代理把下游连接失败表现为500**，不是有运行中的Scala业务返回了内部错误。旧job记录已不可读，未编造“注册SQL异常”日志；也没有修改API或客户端掩盖问题。
- Lead随后亲自读取其Vite job stderr并提供对应证据：21:15:47 `/api/registeruserapi`、21:22:05 `/health`、21:24:07 `/api/registeruserapi`均为`connect ECONNREFUSED 127.0.0.1:8081`。这进一步确认原注册失败也属于代理下游不可达，而不是数据库业务500。该日志证据由Lead提供，未混称为本agent读取的旧Main日志。

恢复时再次read既有脚本、检查端口与目录；不复用不明服务或旧cluster，创建新的gitignored `backend/.local/pg-test.Xayam0`：

- PG job `bash-1d171d1dc88042d3`，127.0.0.1:55439。
- Main job `bash-b7af47f7455544f0`，127.0.0.1:8081，运行原后端代码。
- 已inspect本地合成探针后，分别对直连8081与经8080代理执行真实health→注册→立即撤销；两条路径均 **health=200 / register=200 / logout=200，探针exit0**。口令仅在内存随机生成；探针不输出token/hash/口令、不将令牌或口令保存到文件，数据库仍按原实现只保存哈希。

恢复结果已通知Lead与gameplay-engineer；此后本agent一直保持活动turn，用团队事件等待最终验收，没有提前以final进入inactive待命。

## 最终整体验收（来源：Lead）

- 恢复后context全7例包含真实云同步通过，exit0，52.6s。
- 第一轮完整验收job `bash-e27607d385314b77`：lint/build/127单测/audit0通过，浏览器17/18、整体exit1。唯一失败是context用例要求恢复时钟恰好显示00:13；实际采样00:12→00:14→00:16→00:18，时钟确实恢复。Lead仅将测试改为时间大于12秒的语义断言，没有通过改生产代码或加超时来掩盖问题。
- **最终完整验收job `bash-8cf0226c7da7439a`已由Lead收集exit0：lint、build、严格typecheck、127单测、audit0、diff check，以及18/18真实浏览器用例（2.4m）全部通过。** 包括art3、context7、score4与原4个用例。该整合结果来源为Lead；本agent独立执行的score4例与39新增单测证据见上文。

## 最终生命周期清理

Lead在2026-10-27 21:54明确通知最终验收通过、无需后端联调后，才执行以下清理：

1. 先收集当前Main与PG的运行日志。
2. 停止自有Main `bash-b7af47f7455544f0`；已收集Hikari `Shutdown initiated` / `Shutdown completed`。
3. 随后停止自有隔离PG `bash-1d171d1dc88042d3`；21:55:06.259日志确认`database system is shut down`，shutdown checkpoint已完成。
4. 两个job均为明确请求取消后的`killed`状态，未将取消伪称exit0。当前job列表无本agent仍运行的任务；历史运行时丢失的job如上文记录，不编造其关闭日志。
5. `lsof`检查exit0：8081和55439已无监听；Lead的8080仍由node PID93333监听，未被本任务停止。
6. 保留gitignored的隔离测试数据/日志供审计，不删除或触碰用户数据库，不安装系统软件、不改其他preset。

## 仍然诚实保留的产品限制

- 本任务不宣称实现五章/三最终结局的实际玩法；组件支持同一RunResult接口，当前实测入口为已有defeat。
- 冲突不会自动覆盖云端，也没有新增删除成绩/撤回API。非竞技、自报成绩语义保持不变。
- 后端测试服务已经按约定停止；后续联调需按已有后端README明确启动自己的隔离环境。不能把服务未启动产生的代理500误当成业务已返回500或云端成功。
