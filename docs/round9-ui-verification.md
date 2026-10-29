# 第9里程碑：全窗口游戏外壳（目标回合10）

用户明确追加：整个前端要像真正游戏、全屏，而不是网站中嵌入小画面；不要侧栏与大段文字。本轮优先处理这一要求。继承[复读机里程碑](<round8-art-verification.md>)的526单元/48原生/23后端基线，不把旧外壳测试冒称新版外壳已通过。

**最终：589/589单元、53/53真实浏览器、23/23本轮Scala/HTTP/PG通过。** 全量GDD目标继续active；本轮没有新绘精灵，也不把环境blockout称为完成。

## 窗口与交互

- [页面骨架](<../src/pages/GamePage/index.tsx>)不再有网站页头、标题区、主导航、侧栏、章节目录或页脚。游戏根铺满窗口，画布常驻一次；[页面私有样式](<../src/pages/GamePage/game-shell.css>)以16:9最大FIT居中，不裁掉危险或改变640×360逻辑视野。
- [画布所有者](<../src/pages/GamePage/components/GameCanvas.tsx>)用ResizeObserver同步实际父容器，销毁时disconnect并destroy。已安装Phaser4.0.0不升级、不换RESIZE/ENVELOP，不改相机/碰撞/固定tick。
- [主菜单](<../src/pages/GamePage/components/TitleMenu.tsx>)覆盖真实冻结场景，只留开始/恢复与按需入口。恢复和结局回看仍调用原有明确操作；未知安全点保持禁用并显示原档保留。账户、只读上下文、设置和训练记录不因删网站导航而丢失。
- [可选全屏适配](<../src/pages/GamePage/hooks/useViewportFullscreen.ts>)只由用户按钮请求真实Fullscreen API；默认窗口铺满不依赖API。拒绝/不支持时给短提示，未创建第二画布或修改存档。
- [暂停/失败/过关](<../src/pages/GamePage/components/RunOverlay.tsx>)用原生[Dialog](<../src/components/ui/Dialog.tsx>)管理焦点与Escape。设置/账户为顶部原生弹窗，关闭后仍回暂停，不自动继续游戏。原失败成绩组件和结局summary保持挂载，重试仍用同一不可变结果。
- HUD交互节点的keydown在DOM边界截住，Escape与keyup保留，避免Space操作菜单却触发跳跃。实际键盘暂停、嵌套设置、返回继续已在Chrome验证，不以SSR替代焦点验证。

## 减少文字而不隐瞒状态

- [RunHud](<../src/pages/GamePage/components/RunHud.tsx>)默认只四项HP/Doom/TOK/time；Loom/Omega各一行。详情使用默认关闭的原生details，玩家可显式展开、聚焦和滚动，不把旧长段落放到隐藏节点骗原生测试。
- [MissionConsole](<../src/pages/GamePage/components/MissionConsole.tsx>)已不再是aside，只留当前短目标及少数真实反馈；菜单/休息/过关/结束不再重复一套说明。
- [纯文案适配](<../src/pages/GamePage/functions/hudPresentation.ts>)保留危险+应对，已知33种关键目标≤45字符；未知未来提示保留原语义，不机械截掉应对。保存失败仍有可见反馈，HP被吞时真实移除血条与数字，不只换文字。
- 镜像summary的来源仍来自真实snapshot；[omegaHudSnapshot](<../src/pages/GamePage/game/systems/omegaPresentation.ts>)的ordered意味着当前profile.combo在真实观察组合中匹配，不只是有动作计数。锁定结局不宣称继续学习。
- [WorldRenderer](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)移除制作状态标语与重复死亡/过关文字框，正式美术状态仍在按需指南和文档中诚实保留。场景里的简短操作牌保留；没有为UI方便改战斗状态。

## 实际视觉审查

Lead实际查看首版四图，并交独立只读ui-critic-r10复核：[标题](<../artifacts/ui-review-r10/title.png>)、[游玩](<../artifacts/ui-review-r10/play.png>)、[暂停](<../artifacts/ui-review-r10/pause.png>)、[竖屏](<../artifacts/ui-review-r10/portrait.png>)。

结论：桌面网站嵌入感已消除，无视觉BLOCKING；主次清楚，HUD集中在角落，没有文字墙，中央视野充分。两个非阻断建议已针对性处理：辅助标签略增字号/对比；竖屏“横屏更佳、当前需键鼠”移到开始按钮附近。主按钮改为实底，避免场景文字透入。未为了本轮UI顺手冒称环境已完成。

**竖屏边界明确：** 390×844菜单不横向溢出、入口完整，但16:9实际游戏仍是中部横带；保持完整玩法视野比裁切画面更重要。当前没有触屏战斗支持，不宣称手机游戏画面满屏。最终图与已实际复看的范围列在文末。

## 已收集验证与迁移

- `bash-c27056fb304141ae` exit0：全lint/type + 新[原生窗口测试](<../tests/e2e/viewport.spec.ts>) **4/4，20.4s**。真实1280×720、1440×900、2560×1080最大FIT、640×360 backing不变、同一个canvas/无页面滚动；主菜单与游玩密度、Space操作暂停、嵌套设置/计时冻结、真实Fullscreen进入/退出、390×844菜单边界通过。[日志](<../artifacts/verification/r10-ui-scope.log>)。
- task17正常完成冻结：仅两组件、新纯函数与新测试；[62项新增测试](<../tests/frontend/hud-presentation.test.ts>)通过。Lead随后接管详情区tabIndex/aria-label，无双写。
- 原[组件测试](<../tests/frontend/chapter-ui.test.ts>)首跑43/83失败，保留[原日志](<../artifacts/verification/r10-legacy-ui-first.log>)。原因是旧文字墙断言和直接调用新增hooks的GamePage，不是编译失败或游戏通关失败。task18只迁移该文件：用真实React SSR dispatcher捕获树、不mock React核心hooks，原83项及矩阵全部保留并通过；与62项联合145/145，scope lint与全type通过。
- 迁移仍校验精确start/resumeCheckpoint、同一存档引用/不可变、所有失败章的原ScoreSubmission result与hp0/时长、HP真正吞还、R真实命令、休息与资源失败。原生测试只调整已移除导航和精简文案的可见入口，未删除实际移动/击杀/气泡/石化/左转/云或成绩条件。
- 本轮新私有[PG目录](<../backend/.local/pg-test.xdFpVE/>)；`bash-5bc612c8974947ac` exit0，**23/23** Scala/HTTP/真实PG，26s，[完整日志](<../artifacts/verification/r10-backend.log>)。未使用宿主库/凭据，不改v1/API。

## 首门失败、修复与最终验收

首门`bash-6244106ce1bb49c6`已收集exit1：[日志](<../artifacts/verification/r10-first-gate.log>)。lint/type、38文件588单元、build、audit0、真实API/代理health通过；浏览器38/52通过、14失败（8.0m）。全部原失败trace/截图保存于[首门失败目录](<../artifacts/verification/r10-first-browser-failures/>)，没有用重跑覆盖证据。

- 9项共同暴露真实回归：Esc打开原生暂停后，同一次按键的默认动作立即触发cancel，把游戏重新继续。首次4项只验证Space按钮暂停和Escape关闭，没有覆盖Escape开启，不能替代全门。专门新增原生用例，`bash-bc6b3fcc3cbd46c8`明确复现第一次按Esc已出现`NATIVE_PAUSE_CANCEL`，保留[红日志](<../artifacts/verification/r10-escape-before.log>)/[trace](<../artifacts/verification/r10-escape-before-trace.zip>)。
- 根据实际安装Phaser4.0的KeyboardManager同步分发，修复在[InputSystem](<../src/pages/GamePage/game/systems/InputSystem.ts>)的已启用pause处理内先preventDefault、再打开菜单；暂停/文本/修饰键在原guard返回，第二次Escape仍交原生Dialog关闭。不是加任意延时、禁用Escape或把测试改成鼠标。新增[默认动作顺序测试](<../tests/game/input.test.ts>)与重复原生循环。
- 1项发现移除日志栏后云恢复成功反馈不可见，补回主菜单一行明确确认，原精确存档/显式恢复仍验。
- 其余4项是新版可见中文Q按钮和结局全窗口根的旧断言：迁到实际名称/游戏根，仍要求R重置Q历史、四边不越界、无外窗/自动Fullscreen/自动上传、精确原结果。未减弱玩法条件。

首门真实镜像对决也曾赢得78HP、+23,866ms；其余UI失败没有被这一次胜利掩盖。

### 最终冻结版本

- `bash-273c304d9f734521` exit0：[输入5项 + Escape原生独立3/3](<../artifacts/verification/r10-escape-after.log>)。第一次Esc没有cancel，第二次才出现一次原生cancel，暂停计时冻结/恢复推进全部验证。
- `bash-4a6e39e3769f4a46` exit0：[最终整合日志](<../artifacts/verification/r10-final-gate.log>)。lint/type、**38文件589/589单元**、build、audit **0漏洞**、两路health、diff通过；**53/53真实浏览器，5.5分钟，无skip**。所有原48项与新增5项通过，不替换成只跑局部。
- 原三态/两种敌人、暂停同像素、缺资产保档、实际海/气泡/K线/石化/R/左转/PCM/WebGL、三结局/云/409/重试均回归。复读机本次提手相对位移约3.111逻辑px（2.25倍显示的像素采样），未改3px原图位移；鹦鹉抬书和两者暂停逐字节一致通过。
- 最终实际镜像对决 **74HP、+24,000ms、60可见样本、X318.75..577.75、92敌弹像素**，实际观察组合与胜利/成绩上传通过；Sydney对齐323.111px后真实控制/解控；Leviathan第一轮正常左转成功并观测真实音轨吞/还。不外推新局连续五章。
- Phaser chunk仍1,352.48kB/gzip348.59kB，游戏chunk208.98kB/gzip74.31kB；大包提示保留，不宣称低端稳定60FPS。

最终[主菜单](<../artifacts/ui-review-r10/final-title.png>)、[游玩](<../artifacts/ui-review-r10/final-play.png>)、[竖屏菜单](<../artifacts/ui-review-r10/final-portrait.png>)已由Lead实际复看并冻结；[暂停图](<../artifacts/ui-review-r10/final-pause.png>)一并保存。主按钮背景不再透字，辅助标签更清楚，竖屏限制在开始按钮前即可看到。

临时Main `bash-5901c6c2133a4b52`与PG `bash-0e963d330bb242e8`均停止并收集；连接池Shutdown completed、PG database system is shut down。实测8081/55439无listener，8080前端HTTP200保留；新旧私有数据全部保留。没有提交、发布或修改宿主服务。下一轮继续其余正式美术/内容/声景与完整新局五章旅程；全GDD目标仍active。
