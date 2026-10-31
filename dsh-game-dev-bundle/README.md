# 游戏开发 · Game Dev

独立 DSH preset：`game-dev`。要求 DSH `>=0.2.1-rc.3`，仅声明最低版本，不设置最高版本；没有修改默认模式或其他 preset。版本范围不代表所有后续版本均已完成运行时验证，升级后仍应运行回归检查。

## 使用入口

在 DSH **新建会话**时，选择 **「游戏开发 · Game Dev」**。已开始的会话保留原来的模式与插件版本；不要用当前旧会话的工具列表判断新模式是否安装成功。如果模式选择器尚未更新，刷新现有 DSH 页面即可，不需要启动另一个服务器。

建议开场：

> 读取 router 和 game-dev-workflows，先核实当前项目的引擎版本，再规划并实现一个最小可玩原型。

或：

> 用 game-review workflow 对当前游戏的引擎 API、输入逻辑、资源生命周期和性能做只读审查。

像素美术任务先加载 `game-dev-workflows` 与 `studio`，再运行 `mcp__aseprite__preflight`。只有实际连接编辑器后才能绘制。

## 已包含

| 来源 | 技能数量 | 固定来源 |
|---|---:|---|
| [Phaser 官方 skills](https://github.com/phaserjs/phaser/tree/master/skills) | 28 | `02d8931b626d9764c133cbb3fbf99966c03c757c` |
| [Awesome Gamedev Agent Skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | 77（76 + router） | `184b72be02884f782a0058f2eeae2ce4277453e4` |
| [Aseprite AI Artist](https://github.com/with-pebbly/aseprite-ai-artist) | 14 | `a32a2a58e76b06fc9ad7b29b12abd003ec769665` |
| DSH 适配说明 | 1 | [game-dev-workflows](skills/game-dev-workflows/SKILL.md) |

共 **120 个模式专属技能**，按需加载。还保留 Aseprite 的 4 份专家角色、62 份规则与 2,006 个调色板预设；未把其他客户端的 hooks/agent 配置激活为 DSH 插件。

- **原生 `workflow` 工具**：通过本模式独立的 workflowEngine 提供，非仅安装 Markdown 文档。
- **原生代理委派**：尊重当前 Agent Teams 设置；启用 Teams 时用 `spawn_teammate` 等工具，原有 `subagent`/`subagent_fork` 可被系统停用，不强行覆盖。
- **两份可运行模板**：[游戏审查](workflows/game-review.js)、[像素美术冷读审查](workflows/pixel-art-critique.js)，各有同名 meta JSON；参数与使用方法见适配技能。
- **18 个 Aseprite MCP 工具**：统一 `mcp__aseprite__` 前缀，另有仅本模式可见的 MCP 资源读取工具。
- 普通开发工具：文件读写/搜索、shell、任务列表、网页检索、长期目标、上下文压缩和文件交付。

## 隔离边界

[模式 patch](cordis.patch.yml) **只 insert `preset-game-dev`**，不 override `standard`、`ptc`、`minimal`、`cordis`，不切换默认 preset。

- filesystem skill provider、MCP client 和 workflow 工具均位于 game-dev 的 scoped plugin tree；workflowEngine 的 provider 和 consumer 一起 isolate。
- 自定义技能根都指向本 bundle；`includeDefaultRoots: false`，没有向用户或项目的全局 skills 根复制文件。Host 已有共享技能仍可正常继承。
- 本地依赖安装在该目录的 `node_modules`，使用 [lockfile](pnpm-lock.yaml) 固定；没有 profile-wide dependency override，没有运行第三方 lifecycle/build/install scripts。
- [只读 Inspect provider](index.js) 用于比较各模式的真实 catalog 与 mount 状态，不注册任何全局业务 Tool、Skill 或 Service，不执行工具或切换会话。其诊断名称 `GameDev` 可从开发者 Inspect 工具发现。
- DSH preset 隔离的是**技能、工具和上下文贡献**，不是 OS 沙箱。共享文件系统、用户授权和外部 Aseprite 编辑器仍是共享资源；不能同时让多个会话绘制同一个文档。

## Aseprite 外部依赖与运行时

安装技能/MCP **不等于安装 Aseprite**。在模式初次安装后，用户于 2026-10-27 另行授权从官方源码编译原生应用，现已安装 [Aseprite.app](</Applications/Aseprite.app>)：基于稳定版 v1.3.18.6，原生 arm64，源码默认版本显示 `1.3.18.6-dev`，并非试用版。应用使用本地 ad-hoc 签名；GUI 启动、Lua/WebSocket API、原生保存重开与 PNG 导出测试通过。当前 MCP 的 binary discovery 已能自动找到它，无需修改本模式配置。

**AI Artist 0.8.2 扩展现已安装并通过真实 game-dev MCP 绘图测试。** 用户明确授权了该扩展的文件读写与 WebSocket 连接权限；仅为该脚本设置权限值 14（Read=4、Write=2、OpenSocket=8），不授予 Execute/LoadLib，不启用任意 Lua。扩展代码只连接本机 `127.0.0.1:9931`；Aseprite 的权限本身是按脚本类别授权，并非 OS 级目的地址沙箱。没有运行修改其他客户端配置的“一键安装”。

保持 [Aseprite.app](</Applications/Aseprite.app>) 运行，在 DSH 新会话选「游戏开发 · Game Dev」即可提出绘图需求。若关闭了编辑器，先运行 `open -a Aseprite`；扩展会随应用启动并自动连接。DSH 不会在 profile 启动时擅自打开编辑器窗口。实际验证报告见 [live MCP 报告](</Users/ocean/Library/Caches/dsh-aseprite-native-1.3.18.6/live-validation-20261027-01/report.json>)，原生编译信息见[安装记录](</Users/ocean/Library/Caches/dsh-aseprite-native-1.3.18.6/INSTALLATION.md>)。

[DSH stdio wrapper](bin/aseprite-server.mjs)：

- 不调用上游 CLI，不自动 npm install/build，不产生 detached bridge。
- 默认 live；本 preset 显式设置 `DSH_GAME_DEV_BRIDGE_AUTOSTART=1`，MCP 激活时准备进程内 bridge，监听 loopback `9931`/`9932`。不设置该选项时仍保持首次工具调用才启动的行为。
- stdio 关闭或进程终止时清理自己创建的 bridge；已有 bridge 不会被杀掉。预启动模式会在旧桥退出后重新取得可用端口，避免 preset 更新后永久断连。
- `run_lua` 未注册。显式 `preflight mode="headless"` 能力保留，但必须由用户明确选择；环境默认值**不是硬性禁用 headless**。禁止因 live 失败自动切换或直接编辑 `.aseprite` 文件。
- MCP 进程和本模式预启动的 bridge 随 eagerly-mounted preset 激活而存在；不会自动打开编辑器，也不会在没有工具调用时修改文档。
- 当前 Node 命令固定为 `/opt/homebrew/bin/node`；换机器应先核实 Node >=22.6.0 后更新本模式 patch。测试可用 `DSH_GAME_DEV_PLUGIN_PORT` / `DSH_GAME_DEV_CONTROL_PORT` 指定独立端口。

已发布运行时固定为 `@pebbly/aseprite-ai-artist@0.8.2`（gitHead `5894b12cead839789077b279369409f868451ffc`），实际依赖为 SDK `1.32.2`、ws `8.22.0`、zod `3.25.76`。

**版本差异**：vendor 的 pinned HEAD 比 npm 发布版更新。技能、规则、专家与知识文件一致，但 HEAD 的 reference 导入失败清理/状态恢复，以及 look/read_pixels/palette/tileset 回复字段检查，**尚未进入所安装的 npm 0.8.2 runtime**。没有把静态源代码修复冒充为已运行修复；详见 [Aseprite 审计报告](vendor/aseprite/audit/ASEPRITE-AUDIT.md)。

## 来源审查与兼容性

- Phaser 官方 snapshot 对应 4.2.1；社区部分示例面向 Phaser 3。必须以项目的实际依赖版本为准。本工作区当前是 Phaser 4.0.0；没有升级或修改游戏代码。
- 上游原文和许可证保留。[Phaser 来源](vendor/phaser/SOURCE_METADATA.json)、[Gamedev 来源](vendor/gamedev/SOURCE_METADATA.json)、[Aseprite 来源](vendor/aseprite/SOURCE_METADATA.json)带固定 commit 与文件哈希。
- [Phaser 审计](vendor/phaser/SOURCE_AUDIT.json)记录 8 个上游错误相对引用，适配技能说明如何解析；不静默篡改上游文件。
- [Gamedev 审计](vendor/gamedev/SOURCE_AUDIT.json)记录脚本、打包、删除输出目录、发布 CI、凭据与上传风险。安装这些说明不代表授权执行。
- Aseprite 保存全部技能/规则/文档/源码参考，省略网站和大型社区生成图库；省略范围在来源 manifest 中列明。

## 测试与维护

完整结果与未验证范围见 [验证记录](VALIDATION.md)。

在 bundle 目录执行 `node --test test/*.test.mjs`。集成测试只在随机 loopback 端口执行 MCP initialize/list/read/preflight，不接触用户的真实编辑器、文件或凭据；测试 bridge ownership 与关闭清理。workflow 模板用 stub agents 测试失败分支和 cold-read 信息隔离，不声称已运行真实模型的端到端工作流。

当前安装是本地目录链接：**不要直接移动或删除本目录或其 node_modules**，否则模式资源会失效。升级 DSH、上游来源或 MCP 时需重新核查版本合约与测试。更新本目录后，通过 DSH plugin manager 对该 bundle disable/enable，再用新会话验证；不要手改 profile 内生成配置。

卸载或停用只需在 DSH bundle 管理中处理 `@local/dsh-game-dev-bundle`，不需要撤销其他模式的配置。
