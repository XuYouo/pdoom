# 经典游戏界面精修 · 20261107

本轮统一主菜单、战斗 HUD、触屏操控、暂停与设置的像素边框、色彩和层级。品牌标题改为本地静态 5×7 SVG 字形，保留可访问标题；复用现有 Clawd 与章节贴图，没有新增远程字体依赖。菜单增加上下箭头、Home/End 选项导航，保留 Tab、Enter 与弹窗返回焦点。

[`classic-ui.spec.ts`](../tests/e2e/classic-ui.spec.ts) 第二轮 **4/4 通过，16.9 秒**：[完整日志](../artifacts/classic-ui-20261107/browser-pass2.log)、[通过标记](../artifacts/classic-ui-20261107/browser-pass2/.last-run.json)。

| 场景 | 实际验证 |
| --- | --- |
| 桌面 1440×900 | 菜单箭头选中→Enter 打开设置→Escape 回同一入口；Home/End/Shift+Tab；匿名合作入口；真实键盘短战斗、暂停与设置 |
| 触屏 390×844、844×390 | 原生 CDP 多指短战斗；主要触摸目标至少 44 px、完整位于视口；操控盘不遮挡实际 Canvas；菜单、匿名合作、暂停、设置无横向溢出 |
| 减少动态效果 | 系统偏好实际生效；键盘入口、形态预览可操作，菜单没有仍运行的无限动画 |

全程使用 8080 的新匿名浏览器 context，没有注册账户或注入游戏存档/私有 World。测试拦截并在发现任何后端变更请求时失败；最终没有这类请求，也没有合作认证 socket 或页面错误。暂停后计时保持，关闭设置仍停在暂停界面。

随后在冻结源码上完成 **14/14 定向浏览器回归，46.2 秒**，覆盖原菜单形态、三尺寸指南/设置、减少动态、桌面焦点及第四/五章触控：[回归日志](../artifacts/classic-ui-20261107/regression.log)。最终全量 ESLint、TypeScript、构建通过，**135 文件 / 7,354 项单测通过，10.48 秒**；[单测日志](../artifacts/classic-ui-20261107/unit-final.log)、[构建日志](../artifacts/classic-ui-20261107/build-final.log)。Vite 构建 4.91 秒，`git diff --check` 干净；保留既有 Phaser chunk 大于 500 kB 的体积告警。

首轮为 **3 通过 / 1 失败，20.2 秒**，[原始日志](../artifacts/classic-ui-20261107/browser-pass1.log)和[横屏 trace](../artifacts/classic-ui-20261107/browser-pass1/classic-ui-classic-UI-land-88dca-ause-settings-remain-usable/trace.zip)保留。trace 显示菜单切到 playing 后不足 9 ms，Canvas 仍为 Phaser 缓存的旧尺寸；`data-touch-controls=true`，不是触控消失。验收现于原预算内等待 ResizeObserver 生效、连续两次真实几何稳定，再执行原尺寸/44 px/无遮挡断言，未放宽阈值。截图等待有限 CSS 动画自然结束，过滤无限动画，没有手动结束或禁用动画；因此不把弹窗入场中间帧误判为背景透字。

第二轮保留 17 张原始截图，已实际查看桌面菜单、竖屏设置与横屏战斗：

- [桌面经典菜单](../artifacts/classic-ui-20261107/browser-pass2/classic-ui-classic-UI-desk-d1380-ause-settings-remain-usable/desktop-classic-menu.png)
- [竖屏菜单](../artifacts/classic-ui-20261107/browser-pass2/classic-ui-classic-UI-port-a5c78-ause-settings-remain-usable/portrait-classic-menu.png)
- [横屏真实触控战斗](../artifacts/classic-ui-20261107/browser-pass2/classic-ui-classic-UI-land-88dca-ause-settings-remain-usable/landscape-classic-live-battle.png)
- [自然入场完成后的竖屏设置](../artifacts/classic-ui-20261107/browser-pass2/classic-ui-classic-UI-port-a5c78-ause-settings-remain-usable/portrait-classic-settings.png)

上述为指定界面流程的 Chromium 验收，不是全仓浏览器套件或真实手机性能验证。本轮重新执行 `adb devices -l` 成功，但设备列表为空，**Android 真机截图与验收仍被无设备阻断**。8080/8081/PostgreSQL 开发服务保持运行，本轮没有更改或停止它们。收尾时只读请求 8080 首页与 `/health` 均返回 HTTP 200，健康结果为 `{"ok":true}`；见[开发服务健康记录](../artifacts/classic-ui-20261107/development-health.json)。
