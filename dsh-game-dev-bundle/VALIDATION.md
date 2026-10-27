# 验证记录

日期：2026-10-27（Asia/Shanghai）。环境：DSH `0.2.1-rc.3`，desktop profile。

## 实际运行时

通过 Cordis Inspect 的只读 `GameDev.status` 查询获得以下结果；查询使用 registry 的真实 preset scope，而不是用当前旧会话推测新模式。

| Scope | 模式专属技能 | Aseprite MCP 工具 | workflow | 挂载异常 |
|---|---:|---:|---|---|
| global | 0 | 0 | 无 | — |
| standard（默认） | 0 | 0 | 保持原有可见 | 0 |
| ptc | 0 | 0 | 保持原有不可见 | 0 |
| minimal | 0 | 0 | 保持原有不可见 | 0 |
| cordis | 0 | 0 | 保持原有可见 | 0 |
| game-dev | **120** | **18** | **可见** | **0** |

- game-dev 共 128 个可见技能，其中 8 个是原有 Host 共享技能、120 个由本模式的 `game-dev` provider 提供。Catalog complete 为 true。
- 新模式另有 `list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource`；其余 scope 均没有因本次安装新增这些 MCP 资源工具。
- 当前 Agent Teams 配置禁用了旧 `subagent` / `subagent_fork`；未覆盖该全局选择。真实 `workflow` provider 与 tool 均成功挂载。
- 新 preset `isDefault: false`；`standard` 保持 `isDefault: true`。
- 最终 bundle enable 操作返回 `application: applied`，之后上述 live 查询确认最终配置、120 个技能与 Plan 插件均已生效。此前一次 disable 曾提示 restart-required，随后重新 enable 已应用并实测；没有留下禁用状态。

## 自动检查

最终命令 `node --test test/*.test.mjs`：**6 passed / 0 failed**，exit 0。

1. 自定义浅层 roots 恰好发现 120 个唯一合法技能名：28 Phaser、77 Gamedev、14 Aseprite、1 DSH adapter。
2. Patch 只新增 game-dev，不覆盖其他 preset；独立技能 roots 和 workflowEngine isolate 存在；integration package 无 install lifecycle scripts。
3. 从 Aseprite package 的实际模块解析路径核实 SDK `1.32.2`、ws `8.22.0`、zod `3.25.76`。
4. Workflow 模板用 stub agents 检查失败分支与 cold-read 不泄露 brief。
5. 真实 MCP stdio initialize、18 tools、14 skill resources、rules index 与 studio 读取成功；列目录不创建 bridge listener；无编辑器时 preflight 返回 `ready:false` 且保持 live；自有 bridge 随关闭释放。
6. 外部测试 bridge 不会因 MCP client 关闭而被终止。

MCP 测试在随机 loopback 端口运行，没有调用绘图/文件变更工具或接触用户编辑器。单独通过 YAML safe parsing 验证 120 个 frontmatter、最终 Cordis patch，以及集成 JSON；JS syntax check 通过。

## 来源与变更

Phaser/Gamedev 原始文件通过 SHA256 与 Git blob 校验，Aseprite 下载通过 archive/registry integrity 校验；来源 hash 清单与静态风险审计见 [README](README.md) 中的链接。

最终 git status 只显示本次新增的 bundle 与下载/审计缓存目录；没有修改游戏项目的现有 tracked 文件。没有向全局技能根复制内容，没有执行第三方 install/build/publish scripts。

## 后续原生应用安装（2026-10-27，另行授权）

- 用户选择官方源码编译后，安装了 [/Applications/Aseprite.app](</Applications/Aseprite.app>)，基于稳定版 v1.3.18.6；版本输出 `1.3.18.6-dev`，Mach-O arm64，应用约 32 MB。
- 原生 `.aseprite` 保存/重开、RGBA 像素检查、PNG 导出与独立解析通过；Lua/WebSocket/JSON API 检查通过。
- 应用通过 macOS LaunchServices 启动，Lua Timer 在真实 GUI 事件循环运行并正常退出；使用隔离 `ASEPRITE_USER_FOLDER`，无用户文档或全局脚本权限更改。初版 GUI 测试写文件触发正常的脚本授权提示，未授予权限，改为进程标准输出标记后通过。
- 本地 ad-hoc 签名 `codesign --verify --deep --strict` 通过；动态依赖仅为系统库。官方源码 SHA256 与 release digest 匹配；Skia 使用官方固定 m124 arm64 包。
- 现有 MCP 的 `findAsepriteBinary()` 正确返回安装后的 executable 路径；未修改任何 DSH preset 配置。
- 详细来源、编译设置与测试见[原生安装记录](</Users/ocean/Library/Caches/dsh-aseprite-native-1.3.18.6/INSTALLATION.md>)。上文模式安装测试是此前历史记录，不代表当时已安装原生程序。

## 后续真实 game-dev MCP 验证（2026-10-27 15:38，另行授权）

用户要求确保游戏模式直接可用，并明确批准只为 AI Artist 授予文件读写和连接权限。扩展 0.8.2 已安装，原生 Aseprite 保持运行。

临时 Host 验证驱动创建了一个真实 Agent，显式 `agentPresets.mount(agent.ctx, 'game-dev')`，并通过 `tools.execute` 的正常策略/守卫/结果管道调用该 Agent 可见的工具。未使用 Inspect 执行工具，没有伪造作用域，没有向其他 preset 添加 MCP 工具。完成后 Agent 已 dispose，临时驱动已从最终 bundle patch 移除；没有配置自动重复测试。

- Session：`game-dev-validation-5fab3d70-56ef-4c5c-97d9-88143cf7b9fd`。
- `preflight`：`ready=true`、`mode=live`、`bridgeConnected=true`、`pluginConnected=true`。
- 实际完成：列出文档 → 创建 16×16 RGB 测试文档 → 读取图层 → 批量绘图 → ASCII 回读 → 返回 PNG 预览 → 保存原生文件 → 导出 PNG → 不丢弃修改地关闭测试文档。
- 共 12 个正常工具调用（其中一次 preflight 等待桥重载后的扩展恢复），全部无工具错误；不存在 headless fallback。
- 原有文档列表前后均为空，未修改用户画稿；fixture 只写入本次独立缓存目录。预览已实际查看。
- 证据：[完整报告](</Users/ocean/Library/Caches/dsh-aseprite-native-1.3.18.6/live-validation-20261027-01/report.json>)、[MCP 预览](</Users/ocean/Library/Caches/dsh-aseprite-native-1.3.18.6/live-validation-20261027-01/preview.png>)。
- 桥由 game-dev 的 MCP 子进程持有，监听 `127.0.0.1`；启用进程内预启动与所有权恢复，不启动 detached daemon。更新后 7 项回归测试通过。

## 未声称验证的部分

- 尚未覆盖全部 18 个 MCP 工具的每一种操作；本次验证覆盖核心实时创作与导出流程。
- 未运行真实模型的多代理工作流；验证的是 native workflow 挂载和模板控制流。
- 未用浏览器截图验证下拉菜单视觉呈现；模式名称和 roster 来源于 live preset registry。
- npm runtime 0.8.2 不包含 vendor HEAD 的全部修复，详见 [Aseprite 报告](vendor/aseprite/audit/ASEPRITE-AUDIT.md)。
