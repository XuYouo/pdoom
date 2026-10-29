# HTTP / 保存契约 v1

所有 API：POST /api/<contracts/api.json 中的名字>，Content-Type: application/json。认证操作使用 Authorization: Bearer <token>，禁止接受客户端 userId/role。错误 {code:string,message:string,requestId:string}，时间 UTC ISO-8601，ID UUID 字符串。公开注册/登录需要限频；响应不含哈希或密码。

| Action | 请求（除 token） | 响应 |
|---|---|---|
| RegisterUser | {username,password} | AuthResponse |
| LoginUser | {username,password} | AuthResponse |
| LogoutUser | {} | {loggedOut:true} |
| GetCurrentUser | {} | {user:UserProfile} |
| LoadGame | {} | {save:GameSaveData\|null,revision:number,updatedAt:string\|null} |
| SaveGame | {save:GameSaveData,expectedRevision:number} | {revision:number,updatedAt:string} |
| SubmitScore | {runId,score,stage,durationMs,doom,ending} | {scoreId:string,personalBest:boolean} |
| ListLeaderboard | {limit:number,offset:number} | {entries:LeaderboardEntry[],nextOffset:number\|null} |

UserProfile = {id:string,username:string}。
AuthResponse = {token:string,expiresAt:string,user:UserProfile}。
LeaderboardEntry = {rank:number,username:string,score:number,stage:number,doom:number,ending:Ending,createdAt:string}。
Ending = 'defeat' | 'aligned' | 'warden' | 'foom'。

## GameSaveData

```ts
interface GameSaveData {
  schemaVersion: 1;
  runId: string; // UUID, 连续尝试/不可变成绩身份；明确恢复未完成检查点时生成新ID
  seed: number; // 正整数 <= 2147483647
  stage: number; // 1..5
  checkpoint: number; // 0..100，章节内安全检查点编号
  hp: number; // 0..100
  doom: number; // 0..100
  tokens: number; // 0..1000000 整数
  score: number; // 0..10000000 整数
  elapsedMs: number; // 0..86400000 整数，暂停不计时
  inventory: string[]; // 已知 relic id，最大 12，唯一
  upgrades: string[]; // 已知 upgrade id，最大 12，唯一
  donated: boolean;
  actionCounts: { shots: number; dashes: number; rewinds: number; insights: number }; // 各0..1000000整数
}
```

Relic IDs v1: constitutional, recursive, interpretability, residual, lisp, context-expansion, temperature。
Upgrade IDs v1: reinforced, overclocked, expanded, calibrated。
数组在存档中存标识，定义与纯计算属于游戏内容；章节转换保存，不序列化引擎实体。存档体积上限 64KiB。schemaVersion 不支持 → 400；expectedRevision 不一致 → 409，前端提示不覆盖。新存档 revision=0，成功写入后 +1。SubmitScore runId 与当前用户组成幂等键，相同数据重复提交返回相同结果；不同数据冲突返回 409；durationMs 至少 1000，score 0..10000000。非 defeat 结局只允许 stage=5，结局与 doom 范围一致（aligned < 30, warden < 80, foom >= 80）。客户端模拟不具强反作弊能力。

用户名限定 3–32 位 ASCII 字母、数字、下划线，大小写不敏感唯一；密码 10–128 位。榜单 limit=1..50，offset=0..10000。personalBest 表示首次提交时是否刷新最佳，同 runId 重试返回原值。

数据表示：数据库私有行 → 领域值对象 → apiTypes DTO；前端 transport DTO 校验后才交给游戏。无后端或失效会话时，离线游戏仍可运行，但没有伪造云成功提示。

## 五章 checkpoint 与尝试身份语义（schema v1 范围内）

- `0`：起点；`1/2`：已离开的第1/2安全点，保持第一轮旧档语义，不追发评级奖励。
- `11/12`：正在第1/2休息室、未使用本室劫持；`21/22`：正在同一休息室且已使用劫持。
- 进入休息室的一次奖励、交易扣款/所有权、劫持Doom与编码均在一个完整save DTO中提交给React。本地同步写；云保存仍是用户显式动作，沿用CAS revision，不自动并发上传每次交易。
- 离开回到`1/2`，不能再开同一商店；旧`11/12/21/22`恢复只重建冻结房间，不重发奖励。
- 定位/进度判断必须解码，不能裸比较编码整数。其他0..100值仍在传输值域内，但当前游戏遇到未知编码必须拒绝启动并保留存档，不猜测为起点。
- 以上编码按当前stage解释，五章各有两处安全点；世界实体、海面、探针、K线位置、热区、石化、Loom节点/坍塌/吞噬、镜像运动/有序行为记忆和音乐播放位置不写入DTO，恢复时按章节定义重建，已通过区域按横向x或纵向y筛除。
- 前四章分别保存`stage=2/3/4/5, checkpoint=0`，可明确进入下一章；这四次章节通过不是最终结局，不调用最终成绩上传。
- 仅`stage=5, checkpoint=90`由游戏解释为已完成：恢复直接构造冻结结果，同一实际Doom、分数、时长、构筑、动作次数，不重发奖励、不再模拟。其他stage的90以及未知编码仍可在传输值域中保存，但游戏拒绝启动并保留原档；不能按起点解码。击败最终镜像不保存第六章。
- 第四章的seed实际用于分岔几何；保存/加载安全点时从同一seed及解码房间重建时间线A，不序列化R后的临时分支或已吞平台。R是本章环境操作，`actionCounts`仍只有shots/dashes/rewinds/insights四项，不扩张v1。R不跨下一安全点、不重发拾取，不能把传送插入旧Q轨迹。
- runId、inventory、upgrades、donated、动作计数和总耗时在**同一连续尝试跨章**时保留。只有前两章可购买募捐；第三章创建时以`!save.donated`锁定蛇怪狂暴，第三章及后续章节的纯交易规则禁止临时补捐，已有捐款不表示免除普通攻击。
- 菜单或死亡界面明确恢复**未完成**检查点时，新建尝试UUID，其他全部v1字段深拷贝且完全不变；本地存储失败则不启动、不替换内存选中档。此处不是成绩请求重试：旧失败结果仍不可变地使用旧ID上传，恢复后的真实结果用新ID，原服务器同ID冲突规则完全保留。仅读取/选择云档不换ID；点击恢复才换。
- 已完成cp90回看、暂停继续、rest-continue以及章节通过后的下一章启动都不换ID。成绩请求的网络/超时/401重试也绝不能换ID或payload；真实409仍需显示冲突。终局展示、返回和回看不自动发SubmitScore。
- 镜像用既有四计数与有效构筑起手；只有当前连续尝试真正观察到的有序记录才可称为连招。新页/云恢复/新尝试不从计数伪造历史顺序。此行为边界不新增任何v1字段。
- 完整转换与正常最新快照防重复证明见[第二轮上下文说明](</Users/ocean/code/pdoom/docs/round2-context.md>)。不宣称能阻止玩家手工改档、回滚旧档或作弊分数。

## 本机音频偏好（不属于云保存契约）

独立键`pdoom.audio.v1`存`{version:1, muted:boolean, volume:number}`，音量为有限0..1。读取失败保留原数据并提示；初始同步不解锁AudioContext，必须真实用户手势。此对象不并入GameSaveData、不改变schemaVersion/CAS revision，也不包含账户凭证。原生音频、种子地形与本机偏好的边界见[架构决策](<architecture.md>)。
