# 第二轮 React 整合与 UI 验证

## 交付边界

本任务仅整合 React 页面状态、原生 Dialog、上下文入口和 UI 验证。上下文/商店纯规则沿用 task-3；角色纹理、动画和加载由 lead 负责。没有修改后端/API、GameSaveData schema、ScoreSubmission、WorldRenderer 或 WorldScene，没有启动新服务。

主要入口：

- [useGameSession](../src/pages/GamePage/hooks/useGameSession.ts)：事件驱动的屏幕状态、只读上下文、本地同步保存和云恢复边界。
- [GamePanels](../src/pages/GamePage/components/GamePanels.tsx)：休息室优先显示，与普通上下文/账户/指南面板整合。
- [Dialog](../src/components/ui/Dialog.tsx)：原生 `showModal()`，新增默认兼容的 `dismissible` 选项。
- [RunOverlay](../src/pages/GamePage/components/RunOverlay.tsx)：只新增 rest 提前返回，保留现有 ScoreSubmission 结算接口。

## 状态与生命周期

1. `screen='rest'` 持有完整 `RestRoomSnapshot`。`rest-opened/rest-updated` 更新快照并清除普通面板；`rest-closed` 才恢复 `playing`。
2. `start` 在发送 bridge 命令前先更新同步的 screenRef，避免场景同步发出的 rest-opened 被后续 playing 状态覆盖。
3. 休息室以原生 modal Dialog 显示。Esc 的 cancel 默认行为被阻止，没有 X 关闭按钮，也没有背景点击关闭路径。继续前进或返回终端均有明确按钮。
4. 游戏规则层负责真正冻结计时与敌人；React 不自行模拟冻结，不把 rest 当成失败或成绩结算。
5. 普通上下文面板始终只读，战斗中打开会先暂停。休息室内部的 ContextPanel 使用引擎传来的 editable 状态，可排序。
6. 返回终端时保存当前 rest 的已编码安全点，不执行 rest-continue，也不丢失劫持标记。再次“恢复检查点”才载入所选存档。
7. 菜单模式忽略旧世界的 checkpoint/context/hud 等事件，不让暂停中的旧休息室覆盖新选中的云存档或菜单预览。
8. 从账户恢复云存档会先进入 menu、暂停旧世界、关闭账户 Dialog，再同步写本地存档；不会隐式 resume/start。用户必须明确点击“恢复检查点”。
9. 资源加载失败使用独立 `load-failed` 事件，菜单不会吞掉它。hook提供loadError，页面显示明确错误及“刷新并重试”；刷新只执行页面reload，不写存档或启动新局。成功ready清除loadError。

## 保存与账号边界

- `persist` 只写本地现有原子存档函数，不引入自动云上传。
- 原 AccountPanel/useCloudAccount 的显式上传及 expectedRevision/CAS 接口保持不变。
- 云恢复选择发生在用户确认之后；本地写入失败仍显示失败，不冒充保存成功。
- 休息室和上下文浏览不触发成绩提交，也不更改 ScoreSubmission 的 runId/重试语义。

## 可访问性与响应式

- 原生 Dialog 负责 modal 焦点范围；常规 Dialog 可 Esc/X 关闭，rest Dialog 不可绕过。
- 新增导航、主命令栏、任务侧栏三个上下文入口，命名互不混淆。
- 交易按钮和重排按钮沿用原生 disabled 与解释文案，支持键盘操作。
- 新 CSS 仅追加 Context/shop 响应式样式；既有结算 overlay 滚动规则保持不变。
- 面板按可视窗口高度滚动，长商品说明换行；主角标记使用已有 SVG，不生成新美术。
- 页面明确显示“Clawd Aseprite已接入，场景/敌人仍blockout”，不会把局部角色资产接入说成全场景完成。

## 浏览器测试范围

[context.spec.ts](../tests/e2e/context.spec.ts) 使用合法 schema-v1 的 cp11/cp21 存档 fixture，仅在测试首次打开页面时播种。刷新后不会重新写入 fixture，因此余额、购买、重排与劫持持久性确实通过真实 reload 检查。fixture 测试不是自然通关证据，也没有生产调试入口。

七个 case：

1. rest 是真正的 native Dialog；计时冻结，Esc不退出，键盘不驱动游戏，没有失败/成绩面板，没有自动云上传。
2. 购买扣款一次，刷新保留，不重发入站评级；继续后写闭合检查点并恢复计时。
3. 奖励劫持一次性与词条排序生效，刷新仍保留；离开后原休息室不再开放。
4. 返回菜单保留编码安全点，菜单及战斗中查看上下文均只读；普通面板Esc退出后仍处于暂停。
5. 390×844 手机视口下无横向溢出，真实购买与继续按钮可使用。
6. 阻断真实角色图集请求后出现明确错误和刷新按钮，开始按钮保持禁用；解除阻断后点击刷新，原检查点逐字段保持不变，再次恢复仍保留劫持标记。
7. 真实 Scala/PostgreSQL 账户的云恢复回到菜单，保留选中新快照，明确恢复后才进入相应新休息室。

所有 case 监听 `pageerror`。真实云 case 仅在 `PDOOM_E2E_BACKEND=1` 时运行，不使用合成成功响应。

## 执行记录

2026-10-27，测试复用 lead 管理的 8080 前端及 backend-engineer 管理的 8081/隔离 PostgreSQL 后端，没有启动替代服务器。

```sh
npm run typecheck
npm run lint
PDOOM_E2E_BACKEND=1 npm run test:e2e -- tests/e2e/context.spec.ts
```

最终结果：TypeScript、lint通过；**7/7浏览器case通过，52.6秒，退出码0**。真实云case未跳过、未mock成功响应。全部case的pageerror数组为空。完整项目回归与角色三态截图由lead统一执行，此任务没有运行或宣称其他E2E套件通过。

### 两次失败与修正依据

- 首次6case结果5通过、1失败：注册显示服务暂时不可用。后端负责人确认8081/Main与55439/PG旧进程已消失，8080代理把连接拒绝转换为空HTTP500；恢复真实隔离服务后，云case通过。没有为此修改API或伪造响应。
- 新增加载错误case后，一轮7case中的5个原UI case在默认5秒的boot等待失败，新加载错误与真实云case通过。读取失败trace/network确认：断言从3397ms等待至8400ms；console在8100/10214ms记录软件WebGL GPU ReadPixels stall；图集请求约10224ms才启动，所有角色JSON/PNG均HTTP200并在3–7ms返回，Phaser模块HTTP200/73ms，未出现pageerror或HMR。即懒载Phaser/SwiftShader冷启动在图集请求前花费约6.8秒，而非资源404或业务故障。
- 经lead确认，仅将初始/重新加载的boot-ready等待调整到15秒；购买、Dialog、持久化等功能断言仍保持默认5秒，没有设置全局宽松超时。这是测试环境启动预算修正，**不是性能优化完成的声明**。

### 已打开检查的 UI 图像

- [桌面休息室](../artifacts/browser/context-rest-desktop.png)：1440×1080视口中的960×1032原生Dialog截图，信息分组、失活状态、键盘焦点与继续按钮可读；长商品列表通过Dialog纵向滚动。
- [移动休息室](../artifacts/browser/context-rest-mobile.png)：390×844视口中的370×820Dialog截图，无横向溢出。自动化实际滚动到商品完成购买，再返回继续按钮离开，而不只检查静态截图。

已使用图像读取工具直接查看两张截图，没有把仅存在文件当作视觉验收。

## 限制

UI fixture 验证不代替整章自然操作、全部浏览器或手柄/完整触控验收。测试云账户属于隔离测试后端；这些结果不代表强反作弊或跨设备冲突自动合并。第二至第五章和最终结局仍未实现。
