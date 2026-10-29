# 第1轮验证证据与边界

日期：2026-10-27，Asia/Shanghai。当前阶段是第一章几何可玩基础与真实后端，**不是全量GDD完成**。

## 前端最终检查

命令：`npm run lint && npm run build && npm test && npm audit && git diff --check`。

- 退出码0；ESLint无错误/警告。
- TypeScript严格检查覆盖应用、单元测试、浏览器测试及TypeScript配置。
- Vite **6.4.5**生产构建成功；Phaser仍是清单固定的 **4.0.0**。
- Vitest **4.1.12**：7个文件 **50/50** 通过，未跳过。
  - 游戏34项：输入边沿、控制器、Doom规则、回溯、完整模拟、正常输入通关。
  - 存档16项：格式/版本/边界/损坏/备份恢复/存储不可用。
- npm全依赖（包括dev）审计：**0 vulnerabilities**。
- 构建保留一条Phaser大包警告（压缩约1.35MB/gzip349KB）；已独立拆chunk且页面懒加载，尚未做低端设备性能/进一步定制打包验收，未把警告隐藏为“没有问题”。

## 浏览器检查

使用已安装Google Chrome与Playwright，不下载浏览器、不启动替代Harness GUI。
真实游戏地址为 `http://127.0.0.1:8080`；测试后端为本次新建隔离PostgreSQL上的Scala Main `127.0.0.1:8081`。

已单独观察并确认：

- 桌面1440×1080：一个canvas、真实第一章场景、菜单/HUD/任务面板。
- 390×844：页面无水平溢出；这是布局检查，不代表完整触控游戏已实现。
- 注册 → 读取空云存档 → 上传本地检查点REV1 → 浏览器reload → 恢复会话与云存档 → 撤销会话 → 真实排行榜查询。
- Space/Shift/Q/E/J短按边沿缓冲，Esc即时暂停；暂停时计时冻结，恢复后继续；反复开始无双canvas。
- 主存档损坏后仍能开始新训练，原始损坏提示不会被ready状态覆盖。

最终完整命令：`PDOOM_E2E_BACKEND=1 npm run test:e2e`：**4/4 passed，17.9秒，exit0，未跳过**。包括真实Scala/PostgreSQL链路；无pageerror。

截图实际由浏览器生成并经read_image查看：

- [桌面菜单](<../artifacts/browser/menu-desktop.png>)
- [窄屏布局](<../artifacts/browser/menu-mobile.png>)
- [云端保存](<../artifacts/browser/cloud-saved.png>)
- [暂停状态](<../artifacts/browser/paused-desktop.png>)

截图属于本地验证产物（gitignored），不冒充最终像素美术。

## 后端

详见[后端验证记录](<backend-validation.md>)。19/19（7单测+12真实HTTP/PostgreSQL）通过。对外8个API与共享路由清单一致；另有独立GET /health。真实Main禁用初始化重启后，用户/存档/成绩ID/PB仍存在；CAS并发、幂等并发、越权、过期/撤销、失败/取消回滚、脱敏500、深层JSON、伪造代理头限频均有实际测试。

数据库是已有PostgreSQL工具创建的全新项目隔离cluster；不连接用户数据库、读取旧凭证或修改系统代理。环境的JVM SOCKS数值loopback问题仅用子进程配置修复。

## 本轮失败与修复记录

- 旧lock停在Phaser3，与清单4.0.0不符 → 按清单同步，未升级引擎。
- Phaser4 ESM无default导出，编译不报但浏览器白屏 → namespace导入 + React加载错误边界。
- Phaser Key在同帧keyup清掉JustDown边沿 → 从keydown事件排队，真实Esc与输入adapter回归通过。
- 暂停途中保存资源却在段首重建导致重复拾取风险 → 只在正式安全检查点保存。
- 前端/后端actionCounts上限差异 → 都统一1,000,000并增加回归。
- 旧dev依赖有漏洞 → 审查后修补，不执行强制引擎升级，最终audit0。
- 把tests/config纳入typecheck后暴露Node类型缺失与测试Array.at超ES2020 → 显式@types/node、ES2020兼容索引写法。
- Tailwind默认全仓扫描与Vite监视使后端生成文件触发游戏重载 → 样式只扫描src，开发watch忽略后端/测试/技能包/产物。

## 生命周期交接

前端开发服务器保留在 `http://127.0.0.1:8080`（最终HTTP检查200），供本地试玩与后续开发。本次隔离测试Main与PostgreSQL已在浏览器验证后停止，数据库shutdown日志确认；8081与55439无残留监听。云端功能下次需要按后端指南显式启动，不把已停止服务显示为在线。

## 未验收

完整五关/三结局、Aseprite像素资产、上下文构筑/商店、动态音频、完整触屏/手柄、真实五关浏览器通关、低端设备与长时间性能、互联网部署/备份/迁移。见[全量待办](<development-plan.md>)，目标保持active。
