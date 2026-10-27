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

## 未声称验证的部分

- 未安装或启动原生 Aseprite、extension；未做真实绘图、Lua extension API 或 native e2e 测试。
- 未运行真实模型的多代理工作流；验证的是 native workflow 挂载和模板控制流。
- 未用浏览器截图验证下拉菜单视觉呈现；模式名称和 roster 来源于 live preset registry。
- npm runtime 0.8.2 不包含 vendor HEAD 的全部修复，详见 [Aseprite 报告](vendor/aseprite/audit/ASEPRITE-AUDIT.md)。
