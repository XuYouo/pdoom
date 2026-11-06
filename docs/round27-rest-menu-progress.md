# R27：安全休息室，改成真正的整备菜单

## 本次交付

用户直接截图要求优先优化；保留当前Phaser4.0.0，不升级依赖/引擎。
- 顶部只留位置、冻结状态与HP/TOK/Doom；没有整屏说明表单。
- 商品为紧凑像素风行，所有购买/劫持入口仍可达；长效果集中在选中详情。
- 构筑在侧栏紧凑显示，保留真实顺序、失活状态和上下移动；效果按需展开。
- 底部唯一继续操作常驻，返回为次按钮；规则/奖励记录/云端说明主动展开才出现。
- 首入焦点明确落继续；Tab/Shift+Tab循环、整卡滚入、选新物品时详情回到可见起点。

只改[Rest面板](<../src/pages/GamePage/components/RestRoomPanel.tsx>)、[独立样式](<../src/pages/GamePage/components/rest-room.css>)、[Context紧凑分支](<../src/pages/GamePage/components/ContextPanel.tsx>)及[组合入口](<../src/pages/GamePage/components/GamePanels.tsx>)；原Core/桥接命令/v1/API/价格/奖励/收集规则不改。无新生图或NPC肖像；HR为界面标记，不冒称世界NPC已画完。

## 实际验收，非拼接全项目绿

- [最新类型](<../artifacts/verification/r27-rest-type-04.log>)/[lint](<../artifacts/verification/r27-rest-lint-04.log>)实际0。
- [完整单元](<../artifacts/verification/r27-rest-unit-03.log>)4200/68，实际0；[生产构建](<../artifacts/verification/r27-rest-build-03.log>)实际0。
- [新布局单整02](<../artifacts/verification/r27-rest-layout-run-02.log>)4/4、0retry、EXIT0、19.4469s；[独立指标](<../artifacts/verification/r27-rest-layout-summary.json>)。
- [原事务单整02](<../artifacts/verification/r27-rest-transactions-02-execution.json>)6过/1条件未执行/0失败/0flaky，EXIT0；7例原文件无修改。云端1例因后端本轮未启动而按既有条件未跑，不冒称云端通过。
- 新133收集仅[collect](<../artifacts/verification/r27-rest-collect-03.log>)，不是完整执行；R26整轮资产准入与完整GDD仍未完成。

布局涵盖1440×900、1280×720、390×844、844×500。13商品全部Tab可达且聚焦按钮100%入视口；header/footer最大移动0、dialogScrollTop0、横溢出0、继续中心命中。规则开关不挡主操作，选择不改save字节，真实继续仅恢复后CP11→1。合法检查点切片，不宣称新局通关。

首红保留：原事务01在正确首焦点移到末项后暴露原生Tab逃浏览器chrome；布局01为1/4，3例聚焦行亚像素裁切。只修真实UI焦点循环/整卡滚入与留边，原ratio1、几何、事务、存档断言全部保持，不调低门。

## 真实画面

![桌面整备菜单](<../artifacts/verification/r27-rest-layout-desktop.png>)
[手机竖屏](<../artifacts/verification/r27-rest-layout-mobile.png>) · [矮屏](<../artifacts/verification/r27-rest-layout-short.png>)

Lead与独立HUD代理均实际逐张看过新三图。HR示例为合法测试存档，不是修改用户存档。只本轮UI专项完成，不冒称手柄/触控完整映射、人工听感、性能或完整GDD认证。
