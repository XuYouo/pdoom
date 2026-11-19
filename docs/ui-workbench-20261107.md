# 休息室、构筑与战斗反馈工作台 · 2026-11-07

延续 [前端交互完善](ui-maturity-20261107.md)，本轮围绕交易决策、构筑排序与战斗操作反馈展开。依据 `GAME_DESIGN_GDD.md` 与 `架构与开发规范参考.md`，保留现有像素图形、终端配色和引擎规则；React 只消费真实快照与事件，不增加逐帧视图循环。

## 已完成的休息室与构筑交互

- 奖励劫持先打开游戏内原生确认框，默认聚焦“取消劫持”。展示实际商品、0 TOK 成本、当前与结果 Doom、形态变化、本室一次限制和不可撤销的后果。确认后才发送原有 `shop-hack` 命令，普通购买仍然一步完成。
- Doom 预览复用 `addDoom` / `doomForm`；25 点代价、75% 密度门槛和形态阈值与核心共享常量，规则值未变。55.00% → 80.00% 仍为面具，55.01% → 80.01% 才进入 FOOM；上限时显示实际增加量。
- 购买限制显示在对应商品内，劫持门槛显示实际密度与 Doom。算力不足并不错误地阻止合法的免费劫持。确认框使用自己的 Tab 循环，Escape 仅取消确认，父休息室继续不可直接关闭。
- `GamePanels` 向休息室传入实际 `saveStatus` / `notice`。写盘失败时说明当前交易仍在本局生效、最新变更未写入、刷新或离开可能恢复旧检查点；不再同时宣称交易已成功存盘。云端仍须玩家明确操作。
- 商品限制与详情文字参与真实行高，避免被滚动网格压到边线外。窄屏详情与构筑使用全宽纵向区域，列表独立滚动，继续与返回操作固定在休息室底部。
- Context 构筑面板区分基础技能保留量、遗物占用、余量与超额容量，显示真实失活数量和幻觉频率；失活遗物仍占容量。保留原生遗物图形、只读边界和现有排序命令。
- 构筑排序收到引擎确认后才播报新位置与生效状态，保留键盘焦点，移到首尾时转向同一遗物仍可用的排序按钮。排序不减少上下文占用，也不把 TOK 当作上下文容量。

## 技能与战斗反馈实现状态

源码中已接入 `SkillButtons` 与 `CombatFeedback`：Q 区分记录、冷却、受控、回溯中与就绪，E 区分效果持续时间、冷却与回溯阻挡。剩余时间取自引擎期限，沿用既有 200ms HUD 快照，暂停时不会用另一套墙钟继续倒计时。

战斗反馈只响应已识别的真实事件，例如轨迹不足、透视开启、回溯穿弹、换支结果、形态变化和解除控制；事件收据随模拟时间过期，暂停期间保留并冻结，当前危险提示优先。重新受控时不展示旧“控制解除”收据。HUD 中的 Shift+Tab 只进行焦点导航，游戏画布中的 Shift 仍执行真实冲刺。

## 已取得的验收证据

| 检查 | 已确认结果 | 边界 |
| --- | --- | --- |
| 休息室新增单测及原 shop / rules / human-rater 定向单测 | 47/47 通过 | 覆盖真实核心阈值、封顶、免费劫持、一次确认、状态透传与错误文案 |
| TypeScript 与本轮相关文件 ESLint | 通过 | 本轮文件检查，不据此宣称全仓最终构建完成 |
| 休息室新交易 4 项 + 原菜单 4 项联合浏览器复核 | 8/8，45.2 秒 | `rest-transactions-pass2/`；桌面 1440×900、1280×720、390×844、844×500 |
| 最后窄屏布局修改后复核 | 4/4，15.0 秒 | `rest-transactions-pass3/`；菜单、劫持、保存失败与 Context portrait，新增真实文字包围盒断言 |
| Context 三视口专项 | 3/3，11.7 秒 | Context 执行记录：桌面、390 竖屏、844×390 短屏；最后窄屏又随上述 4 项复核 |

休息室用例从受支持的有效休息室检查点恢复，通过真实按钮和键盘执行交易；未修改私有 World、直接发出虚假成功事件或模拟 DOM。测试确认同一尝试内的币量、Doom、词条、房间标记与模拟时间符合实际核心结果，刷新后保留已劫持状态；这不是自然游玩到达这些检查点的证据。

保存失败用例只让公共 `Storage.setItem` 边界抛出配额错误。普通修补与确认劫持都在实际引擎中执行，界面显示新的完整度、算力、Doom 和已拥有状态，同时旧本地存档字节保持不变。没有自动 API 写入。

实看截图曾发现两处浏览器断言未覆盖的视觉问题：商品限制文字越过行边线，以及窄屏详情文字越过详情框。分别以 `grid-auto-rows:max-content` 和全宽详情布局修复，并补上商品/详情实际文字包围盒检查。首轮与后续目录分别保留，没有将中间视觉问题的截图冒充最终效果。

## 截图索引

- [窄屏劫持确认](../artifacts/ui-workbench-20261107/rest-transactions-pass3/rest-transactions-mobile-r-5084a-pplies-once-on-confirmation/mobile-hack-confirmation.png)：默认取消、60.00% → 85.00%、明确 FOOM 阈值。
- [短横屏劫持确认](../artifacts/ui-workbench-20261107/rest-transactions-pass2/rest-transactions-short-ri-c696c-pplies-once-on-confirmation/short-hack-confirmation.png)：两项操作均可达。
- [最终窄屏休息室](../artifacts/ui-workbench-20261107/rest-transactions-pass3/rest-menu-rest-menu-mobile-bf723-ion-and-zero-spend-continue/mobile-menu.png)：商品、完整详情、全宽构筑与固定继续操作。
- [实际交易后的写盘失败](../artifacts/ui-workbench-20261107/rest-transactions-pass3/rest-transactions-mobile-p-6f732-storage-is-clearly-reported/mobile-rest-save-failure.png)：新数值在本局生效，明确未保存。
- [窄屏真实构筑排序](../artifacts/ui-workbench-20261107/context-portrait-reordered.png)：引擎确认的顺序与失活状态、44px 排序控件和保留的焦点。Context 用例使用固定截图名，该文件已由最终窄屏复核更新。
- [桌面独立构筑面板](../artifacts/ui-workbench-20261107/context-desktop.png)：真实容量、词条效果与只读排序边界。

## 根任务联合验收

- HUD 焦点、真实技能期限与新战斗反馈联合浏览器：7/7，46.9 秒，目录 `combat-pass1/`。
- 原反击与战斗反馈回归：`combat-regression-stable/` 10/11。唯一 WebGL 项在 Vite 配置被另一子任务更新、开发服务器重启时失去执行上下文；同一测试未改代码单独复核 `counter-webgl-isolated/` 1/1，23.4 秒。两次结果分别保留，不合并成一轮 11/11。
- 旧反击测试的“Q 冷却”完整文本选择器已随动态倒计时改为真实 `data-state=cooldown` 和按钮禁用状态；实际收益、像素与冻结断言保留。早期浏览器回归也促成了暂停不清除战斗收据的修复。
- 最终全量单元：132 文件、7303/7303，10.93 秒。全仓 TypeScript 与 ESLint 通过。首轮 30 个失败来自单人组件新增隔离层后旧 SSR 遍历、Context 由 progress 改 meter、已装备遗物复用图标，以及新增 F 键后的监听清理数量；更新测试契约并保留原行为与图形断言，另补救援键输入隔离测试后全量通过。完整日志在 `/private/tmp/pdoom-final-unit-20261107-pass2.log`。

- 最终单人浏览器联合检查：8 文件、27/27，单次 1.9 分钟，目录 `solo-final-pass1/`。包括账户 5、菜单 5、HUD 焦点 4、休息室交易 4、设置 3、Context 3、技能状态 1、战斗反馈 2；账户网络边界为 fixture API，其余为真实引擎交互。没有把它称为全仓完整浏览器套件。
- 生产构建通过，4.48 秒。仍有 Phaser 包体 1,352.48 kB 的 chunk 提示，没有隐藏告警或据此声称低端设备性能。最终在线标签视觉修正后的构建单独复核，以合作验收记录为准。
- 最后的合作姓名标签避让修改后，再次完成全仓 ESLint、132 文件 7303/7303（11.19 秒）和差异检查；[最终单元日志](../artifacts/ui-workbench-20261107/final-unit-after-labels.log)、[最终 Lint 日志](../artifacts/ui-workbench-20261107/final-lint.log)。最终生产构建 4.45 秒通过，真实在线全流程 `coop-online-pass6/` 1/1、45.9 秒通过，重叠名字牌修复后的同台画面已实看。

最终单人菜单与交易截图：[桌面主菜单](../artifacts/ui-workbench-20261107/solo-final-pass1/menu-polish-menu-and-manual-remain-reachable-at-1440x900/menu-1440.png)、[竖屏主菜单](../artifacts/ui-workbench-20261107/solo-final-pass1/menu-polish-menu-and-manual-remain-reachable-at-390x844/menu-390.png)、[窄屏劫持确认](../artifacts/ui-workbench-20261107/solo-final-pass1/rest-transactions-mobile-r-5084a-pplies-once-on-confirmation/mobile-hack-confirmation.png)、[技能真实效果期限](../artifacts/ui-workbench-20261107/solo-final-pass1/skill-state-real-E-effect--e7441-cus-and-freeze-while-paused/insight-active-keyboard.png)。

随后新增的在线合作另见[架构](coop-architecture.md)、[界面](coop-ui-20261107.md)与[集成验收](coop-acceptance-20261107.md)：本机真实 Scala / PostgreSQL、独立双账户的联机流程已另行验证。本工作台记录不声称连续五章通关或 Android 真机验收完成；最终 ADB 设备列表为空，窄屏浏览器截图不能代替真实设备验收。
