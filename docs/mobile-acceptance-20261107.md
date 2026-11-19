# 移动端触控验收记录 · 20261107

本记录区分真实 Android 设备、Chromium 原生触摸输入、游戏模拟与真实 Scala 联机，不以窄屏截图代替可操作性或真机验收。第二轮三项浏览器测试已在同次运行中全部通过；第三轮单独验证新增全屏与更小视口的指南/设置，没有重复运行第二轮三项或将分批结果混写成一次运行。第一轮发现的生命周期错误及其失败证据保留。Android 设备列表仍为空，真实设备层尚未验收。

## 当前证据

| 项目 | 状态 | 实际范围 |
| --- | --- | --- |
| Android 设备发现 | **被无设备阻断** | 已提升权限实际执行 `adb devices -l`，命令成功，设备列表为空。没有识别到型号、屏幕或设备 Chrome，没有执行 `adb reverse`、操作屏幕或修改方向。没有真机截图。 |
| 原生多点触摸 helper | **已编写，定向 ESLint 与 TypeScript 通过** | [`cdp-touch.ts`](../tests/e2e/cdp-touch.ts) 使用 CDP `Input.dispatchTouchEvent`，稳定 contact id，最多五指；start/move 传完整 active contacts，end/cancel 传空列表。不是 DOM `dispatchEvent` 或键盘代替操作。 |
| 新移动端浏览器用例 | **pass2：3 / 3 通过，47.8 秒** | [`mobile-touch.spec.ts`](../tests/e2e/mobile-touch.spec.ts)：390×844 单人 10.9 秒、844×390 单人 8.6 秒、390×844 真实合作客机 24.4 秒。[最终完整日志](../artifacts/mobile-20261107/browser-pass2.log)、[通过标记](../artifacts/mobile-20261107/browser-pass2/.last-run.json)。所有原断言保持，另增加真实拖动瞄准与 E/Q 反馈。 |
| 全屏与小视口操作 | **pass3：1 / 1 通过，46.5 秒（用例 21.4 秒）** | 同一项分别创建 360×640、667×375 的独立触屏页面，验证过期用户激活后的真实全屏进入/退出、全部触摸目标至少 44 px、边界/横向溢出以及触控暂停→指南→设置。[完整日志](../artifacts/mobile-20261107/browser-pass3.log)、[通过标记](../artifacts/mobile-20261107/browser-pass3/.last-run.json)。余下耗时属于 runner/浏览器收尾。 |
| 章节触控与桌面联合回归 | **10 / 10 通过，50.9 秒** | 单次运行 `mobile-chapters` 2 项及 `game` / `hud-focus` / `skill-state` 8 项；[完整日志](../artifacts/mobile-20261107/browser-final.log)、[通过标记](../artifacts/mobile-20261107/browser-final/.last-run.json)。第四、五章从合法检查点启动，不能等同于连续五章通关。 |
| 最终全仓检查 | **135 文件 / 7,354 项通过，10.18 秒；全量 ESLint、TypeScript、构建通过** | [单测日志](../artifacts/mobile-20261107/unit-final.log)、[构建日志](../artifacts/mobile-20261107/build-final.log)。构建 4.69 秒，`git diff --check` 通过；仍有既有 Phaser 1,352.48 kB chunk 体积告警。 |
| 隔离验收服务 | **验收时 health 通过，结束后已清理** | 独立测试数据库 `pdoom_mobile_test_92eb3b12`、Scala 8082、Vite 8084；直连与代理 `/health` 均返回 `{"ok":true}`。结束后仅停止本轮 8082/8084，测试库保留。不向用户 `pdoom_dev` 注册测试账户。 |
| 当前用户开发服务 | **保持运行，未修改** | 用户的 Vite 8080、Scala 8081、PostgreSQL 55439 保持原样。隔离验收只借用自有 PostgreSQL 实例中的新空数据库，不重启实例。 |

运行记录：[隔离验收 runtime.json](../artifacts/mobile-20261107/runtime.json)。测试 API 仅允许 `http://127.0.0.1:8084` 的合作 Origin；没有把服务暴露到公网。

## 浏览器用例的实际验证路线

每个移动页面创建 `isMobile: true`、`hasTouch: true`、设备缩放比 1 的 Chromium context，并通过 `Emulation.setTouchEmulationEnabled` 打开最多五个接触点。触摸坐标来自实际 DOM 包围盒，不使用固定屏幕坐标。

单人两种初始方向均采用同一路线：

1. 从主菜单真实开始，检查操作区在视口内、基础目标至少 44×44 CSS 像素、页面无横向溢出。
2. 第一指向移动区右侧偏移，第二指按住瞄准/射击区，第三指跳跃。使用现有原生 640×360 Canvas 与源精灵逐像素匹配，要求在三个接触点保持时观察到实际水平移动、上升和开火姿态；不访问或修改 Phaser 私有世界。
3. 前三指尚未结束时，用第四指触发“暂停触屏训练”。检查实际画面位置和 HUD 计时冻结；释放并通过界面恢复后，角色不残留水平移动或持续开火。
4. 在方向与射击接触点仍保持时，通过浏览器原生 viewport resize 交换横竖尺寸，检查输入被清除、操作区仍可达；清理浏览器接触点后，重取实际坐标并用新的左向触摸验证操作恢复。这里验证的是 Chromium resize 流程，不声称已经证明 Android 物理旋转行为。
5. 通过实际触摸启用 E，观察按钮转为不可用、明确的透视效果剩余时间且倒计时真实递减；随后在历史就绪时触摸 Q，要求反馈进入真实回溯或冷却、显示时间且按钮不可用。没有伪造 bridge 事件或 HUD 快照。

合作客机用例使用隔离数据库中的两名 `test_mobile_*` 账户，通过真实页面注册、建房、邀请码加入、准备和开局。客机的同组三指触摸必须同时出现在公开 WebSocket 的 input 帧中，并让房主权威世界中的 2P 实际移动、跳跃与开火；1P 位置和射击次数保持不变。在三个接触点不松开的情况下，把第二指移至瞄准盘上方，要求出现新 id 的向上 2P 子弹，旧水平子弹不能满足断言。最终实测新子弹 id=4（开始拖动时 nextBulletId=2），vx=−29.45、vy=−509.15；见[公开世界帧证据](../artifacts/mobile-20261107/browser-pass2/mobile-touch-real-co-op-gu-69e8f-auses-without-residual-fire/guest-drag-aim-up.json)。随后验证两端暂停、房主恢复后的无残留输入、结束合作和单人本地存档值保持，且两页面没有 pageerror。观察范围仅为公开 state/input 帧并执行正式 codec，不保留认证帧或 token。

## 首轮失败与执行记录

产品代码冻结并获得根任务浏览器资源安排后，已使用独立环境执行：

```sh
GAME_TEST_URL=http://127.0.0.1:8084 PDOOM_E2E_BACKEND=1 npx playwright test tests/e2e/mobile-touch.spec.ts --output=artifacts/mobile-20261107/browser-pass2
```

首轮为 2 项通过 / 1 项失败，50.0 秒；[原始完整日志](../artifacts/mobile-20261107/browser-pass1.log)保留。首轮合作用例已完成真实三指 input、房主权威 2P 移动/跳跃/开火、双端暂停、恢复无残留、退出和单人存档值保持；最后的页面错误断言捕获 4 次 `Cannot read properties of null (reading 'activePointer')`。trace 指向 `InputPlugin.activePointer → InputSystem.clearInputs → setEnabled → destroy → WorldScene.cleanup`：Phaser 已销毁 input manager，清理输入时仍读取 getter。这个失败属于实际场景生命周期错误，不是测试时限或世界状态断言的问题。InputSystem 的销毁状态与清理边界已修复，并在定向回归及本轮完整浏览器流程中验证；原错误断言保留且第二轮实际通过。

失败的[四份页面错误栈](../artifacts/mobile-20261107/browser-pass1/page-errors.json)、[完整 trace](../artifacts/mobile-20261107/browser-pass1/mobile-touch-real-co-op-gu-69e8f-auses-without-residual-fire/trace.zip)与截图保留。首轮实看过的[竖屏单人三指实战](../artifacts/mobile-20261107/browser-pass1/mobile-touch-native-mobile-10b38-d-rotation-clear-held-input/portrait-three-finger-combat.png)及[真实客机三指实战](../artifacts/mobile-20261107/browser-pass1/mobile-touch-real-co-op-gu-69e8f-auses-without-residual-fire/real-guest-three-finger-combat.png)能证明当时的画面与控件布局，不能覆盖或抵消后续错误。

后续结果按每次完整运行记录，保留失败 trace、截图与原始日志，不从上一轮键盘联机、响应式视口或单元测试推算触屏适配通过。

## 第二轮截图

- [竖屏三指实战](../artifacts/mobile-20261107/browser-pass2/mobile-touch-native-mobile-10b38-d-rotation-clear-held-input/portrait-three-finger-combat.png)
- [横屏三指实战](../artifacts/mobile-20261107/browser-pass2/mobile-touch-native-mobile-82127-d-rotation-clear-held-input/landscape-three-finger-combat.png)
- [旋转后控制恢复](../artifacts/mobile-20261107/browser-pass2/mobile-touch-native-mobile-10b38-d-rotation-clear-held-input/portrait-rotated-controls-recovered.png)
- [实际 E/Q 反馈](../artifacts/mobile-20261107/browser-pass2/mobile-touch-native-mobile-10b38-d-rotation-clear-held-input/portrait-touch-skills-feedback.png)
- [真实客机拖动瞄准](../artifacts/mobile-20261107/browser-pass2/mobile-touch-real-co-op-gu-69e8f-auses-without-residual-fire/real-guest-drag-aim-up.png)
- [客机触控暂停](../artifacts/mobile-20261107/browser-pass2/mobile-touch-real-co-op-gu-69e8f-auses-without-residual-fire/real-guest-paused-after-touch-release.png)

第二轮竖屏、横屏战斗及客机拖动瞄准截图已经实际查看。竖屏 HUD 现贴近游戏画面上方，横屏的操控区位于两侧；这批 Chromium 截图仍不是 Android 设备截图。

## 全屏激活与更小视口

第三轮只运行新增的 `native touch fullscreen` 用例。每个视口开始真实训练后等待 6,100 ms，先验证既有 transient activation 已失效，再用原生 CDP touchStart/touchEnd 点击全屏。断言 `document.fullscreenElement` 实际为 `main.game-shell`，按钮 `aria-pressed=true` 且显示“退出”；再次真实触摸退出后，fullscreenElement 必须为 null。

为避免测试制造假阳性，目标坐标在等待前读取，等待后不使用默认会带 `userGesture:true` 的 Playwright evaluate/locator 几何调用。激活状态和全屏状态均通过显式 `userGesture:false` 的 CDP Runtime.evaluate 只读观察。两个视口的[360×640 激活证据](../artifacts/mobile-20261107/browser-pass3/mobile-touch-native-touch--1c90b--guide-settings-stay-usable/360x640-fullscreen-activation.json)与[667×375 激活证据](../artifacts/mobile-20261107/browser-pass3/mobile-touch-native-touch--1c90b--guide-settings-stay-usable/667x375-fullscreen-activation.json)都记录 beforeTouch.active=false、enteredGameShell=true、exited=true。

两种视口均检查操作区所有按钮及移动/瞄准盘至少 44×44 CSS 像素，实际包围盒完整位于视口内，页面无横向溢出。随后通过真实触摸打开暂停和操作指南，明确看到“左盘移动，右盘瞄准。”新说明，关闭后仍暂停；再打开设置，检查弹窗没有横向内容溢出、关闭按钮位于视口内，触摸关闭后仍暂停。两页面没有 pageerror。

已实际查看的[360×640 原生全屏](../artifacts/mobile-20261107/browser-pass3/mobile-touch-native-touch--1c90b--guide-settings-stay-usable/360x640-native-fullscreen.png)与[667×375 设置](../artifacts/mobile-20261107/browser-pass3/mobile-touch-native-touch--1c90b--guide-settings-stay-usable/667x375-touch-settings.png)展示了全屏退出状态及短屏固定关闭入口。另保留[360×640 指南](../artifacts/mobile-20261107/browser-pass3/mobile-touch-native-touch--1c90b--guide-settings-stay-usable/360x640-touch-guide.png)、[667×375 全屏](../artifacts/mobile-20261107/browser-pass3/mobile-touch-native-touch--1c90b--guide-settings-stay-usable/667x375-native-fullscreen.png)等全部六张原始截图。

## 最终章节与桌面回归

根任务最后一次浏览器联合运行覆盖 [`mobile-chapters.spec.ts`](../tests/e2e/mobile-chapters.spec.ts) 两项及既有桌面三文件八项，10 项在同一次运行中通过。移动章节用例使用经 `isGameSave` 验证的第四/五章初始检查点，通过实际 tap 恢复；第四章触摸 R 后实际由分支 A 切换到 B，并转为不可用。两章详情 summary 的触摸高度至少 44 px，真实触摸展开/关闭，内容无横向溢出；主菜单全屏入口与设置关闭按钮均至少 44×44 px。第五章没有不适用的 R 按钮。

根任务已经实看[第四章真实分支 B 详情](../artifacts/mobile-20261107/browser-final/mobile-chapters-mobile-cha-cfce0-r-controls-remain-reachable/chapter-4-touch-details.png)与[第五章详情](../artifacts/mobile-20261107/browser-final/mobile-chapters-mobile-cha-0add8-r-controls-remain-reachable/chapter-5-touch-details.png)。这组测试验证合法章节切片及真实触控操作，没有模拟完整通关过程。

桌面八项验证正常键盘游戏/暂停/重开、账户输入/指南/窄屏、坏存档恢复、指针技能与 Canvas 焦点、Space/Shift+Tab 不串入战斗、嵌套弹窗恢复，以及 E 效果/冷却/暂停冻结。最终全仓单测、lint、TypeScript 与构建在浏览器 runner 完全退出后执行，未与浏览器资源竞争；这些结果不扩展为全仓所有浏览器用例均已执行。

真实 Android 仍需设备连接后重新检查；若可用，再经 `adb reverse tcp:8080 tcp:8080` 访问保留的本地开发端，验证实际多指、系统取消、横竖屏与浏览器工具栏/安全区域，并保存真实设备截图。当前缺少设备，因此这一层验收未完成。

验收结束后核对 PID、监听端口与进程工作目录，仅停止本轮 API 8082（PID 79098、session 75056）及 Vite 8084（PID 79109、session 18487），两端口均确认无监听。保留独立测试数据库与全部失败/成功证据，并更新[非秘密运行记录](../artifacts/mobile-20261107/runtime.json)和[清理记录](../artifacts/mobile-20261107/cleanup.json)。

用户试玩服务未修改或停止：Vite 8080（PID 64515）、Scala 8081（PID 65986）与 PostgreSQL 55439（PID 65624）仍监听。清理后重新实际请求 8080 页面、8081 `/health`、8080 代理 `/health`，三者均为 HTTP 200，两个健康接口均返回 `{"ok":true}`。
