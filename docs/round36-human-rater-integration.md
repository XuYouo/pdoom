# R36 — Human Rater原生工作台与紧凑肖像准入

本包已接入五章休息点与现有菜单，并通过本轮独立单次完整回归。**不是完整GDD成品或项目发布许可。**
保留用户批准直接Aseprite制作的决定，无生成参考冒称；不重画[R35原生源](<round35-human-rater-source.md>)。

## 玩家看得到的变化

- 将HR文字标记替换为48×48原生肖像，仍占原52×60槽；窄屏/矮屏沿用隐藏策略，不挤掉底部操作。
- 场景中有64×64工作台，坐在实际支撑面上。静态四态来自真实neutral/approved/disapproved/hacked，不新增时钟。
- 正常入站读真实评价和实际到账；购买/修复不改写评价，旧档不编造历史，真实劫持优先。
- 删除挡住人物的旧募捐室浮动文案；保留旗帜/捐款状态，将募捐箱移到桌脚之外。
- Loom两室与第一章第二室放在检查点左侧56px，其余右侧56px。只读存活、已展开且足宽的支撑；不改碰撞。

![实际劫持后的紧凑菜单](<../artifacts/verification/r36-final-hacked-menu.png>)

[390×844实际菜单](<../artifacts/verification/r36-final-actual-menu-390x844.png>) ·
[800×450实际菜单](<../artifacts/verification/r36-final-actual-menu-800x450.png>) ·
[第一章原生场景](<../artifacts/verification/r36-final-scene-c1.png>) ·
[Loom原生场景](<../artifacts/verification/r36-final-scene-loom.png>)。
以上七张主证据均由同Lead实际read_image查看，**不是独立冷评**，也不证明所有随机前景组合或人类难度平衡。

## 当前验证，不拼旧结果

| 门 | 本轮实际结果 |
|---|---|
| 单次完整浏览器 | 153/153，零skip/flaky/retry，EXIT0，CLI1486.047秒 |
| 既有案例 | 原R33全部136名称保留，新增17；每例唯一passed结果 |
| 全量unit | 5526/78文件；新增renderer142、observer14，保源34 |
| 新隔离Scala/HTTP/PG | 23/23，实际EXIT0，17.15秒 |
| 类型/lint/build | 均实际EXIT0；lint零warning预算；Phaser大chunk提示仍在 |
| 定向原生控制 | 20/20，98.537秒，29组场景/肖像捕获 |

[完整结果](<../artifacts/verification/r36-full-01-results.json>)、
[独立核验153唯一结果](<../artifacts/verification/r36-full-validated.json>)、
[定向像素事实](<../artifacts/verification/r36-scoped-native-facts.json>)与
[同Lead视觉记录](<../artifacts/verification/r36-scoped-visual-review.json>)可复查。

观察器独立解码真实640×360 canvas与菜单PNG，不读取Phaser/World/生产plan。
全部不透明源像素及三个逐对姿态差异集必须100%匹配，RGB逐通道容差2；**没有前景遮罩**。
14个内存反例验证错姿态、放大、缺手、空白/裁切画布与缺桌脚不能通过；这些合成测试夹具绝不冒充浏览器证据。

六类资源故障覆盖PNG/JSON请求失败、未使用hacked帧缺失/别名/宽度、真实PNG自然尺寸错误。
在原存档与实际新尝试两种身份上均拒绝ready、保留原字节；使用真正“刷新并重试”后再次明确恢复。
真实普通入站、修复、劫持、重载、三视口、冻结与既有四视口/云存档均通过。

## 接线边界

[资源绑定](<../src/pages/GamePage/game/data/humanRaterAssets.ts>)、
[只读渲染器](<../src/pages/GamePage/game/systems/HumanRaterSpriteRenderer.ts>)、
[菜单组件](<../src/pages/GamePage/components/RestRoomPanel.tsx>)保持页面私有架构。
最多两张Image；资源/尝试/章节代际、销毁重入/异常有所有权测试，不销毁共享纹理。
Core、奖励/价格、60Hz规则、低频HUD、v1/API、物理、音频冻结与Phaser4.0.0均未改。
[准入元数据](<../assets/human-rater-generation.json>)的runtimeReady/productionReady仅限此包；旧R35源审查单独保留。

## 真实失败与清理

首轮0/20抓出中文caption越界盖4px、Loom1虚线穿头；修文字裁切与摆位后19/20。
余下一例是旧募捐箱挡住桌脚/原生地面；移开箱体并删除所有像素mask后20/20，不放宽阈值、不改源图。
原nativeASE/PNG/atlas三SHA保持，源MCP0错误/17风格提示沿用R35记录。

[清理证据](<../artifacts/verification/r36-cleanup.json>)：本轮Main8064、PG7744与完整CLI9447组消失，PG为shut down，8081/55439释放。
原Vite3756/8080保留；用户数据库pointer字节/inode/mtime保持。
[78旧截图恢复](<../artifacts/verification/r36-full-01-restoration.json>)保留旧字节/mtime，实际新捕获另存；完整运行与清理时451已知路径零漂移。

两次工具调用误带用户禁止的权限参数已即时说明；停止该调用路径，不作为权限改变/授权证据。
一次测试尾部混入非代码，保留原文本后CAS移除；随后5526通过。另一次纯目录检查不改项目。
拥有的控制台输出停滞时只取消未完成的artifact定义；服务先核对真实owner/路径，再在完整回归结束后清理，未触碰无关进程。

模型切换仍未核实，八助手未再唤醒、没有再探针或改配置。全GDD还缺专用攻击、完整结局/声景、局外成长、更多种子内容、输入/辅助选项与性能/人类体验验证。
