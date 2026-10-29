# 第二章里程碑整合验收（自动目标回合3–4）

验证范围：2026-10-27晚至2026-10-28凌晨（Asia/Shanghai，UTC+08:00）。**完整五章目标仍未完成**。本轮将第二章从存档占位推进为可玩的核心流程；不宣称场景/Boss美术、音频、玩家平衡或后三章完成。

## 1. 实际交付

- 保留 Phaser4.0.0、React19.1、TypeScript5.7.3；未升级引擎或修改后端schema/API。
- [章节定义](<../src/pages/GamePage/game/entities/model.ts>)和[注册器](<../src/pages/GamePage/game/data/chapters.ts>)使模拟、碰撞、检查点、相机、标题及Boss名称不再绑定第一章。
- [工厂](<../src/pages/GamePage/game/data/chapterTwo.ts>)为640×2040：55px台阶、两处rest、可选风险支路及顶部Sydney竞技场。
- [海面与探针](<../src/pages/GamePage/game/systems/factory.ts>)按固定tick演化：52px/s即死海面、有限自复制、吞平台预警、可射击阻止；主路防探针但不防淹没。
- [Sydney](<../src/pages/GamePage/game/systems/sydney.ts>)包含对话弹幕、落下飞刀、组合阶段及必须实弹击碎的PUA气泡；控制期间仍可射击，不能用Q、冲刺或等待绕过。
- [React章节结算](<../src/pages/GamePage/components/RunOverlay.tsx>)明确从第一章进入第二章并保留完整build；第二章保存第三章入口但不开放、不当成最终结局、不显示结局上传。
- [相机](<../src/pages/GamePage/game/systems/cameraFrame.ts>)按章节轴跟随；[工厂视图](<../src/pages/GamePage/game/systems/FactoryRenderer.ts>)展示海面距离、探针预警、气泡和解控；均明确标记为blockout。
- Clawd原生三态Aseprite、形象与图集未被替换；本轮没有生成或伪称完成新的Aseprite场景/Boss资产。

## 2. 最终实际命令与结果

在自有隔离Scala/PostgreSQL在线、现有8080 Vite服务运行时执行：

```bash
npm run lint && npm run build && npm test && npm audit && git diff --check &&
PDOOM_E2E_BACKEND=1 npm run test:e2e -- --global-timeout=300000
```

最终任务 `bash-66c8a2d711c945df`：**退出码0**。

| 项目 | 实际结果 |
|---|---|
| ESLint / 严格TS / Vite构建 | 通过 |
| 单元测试 | 17文件，175/175通过（含85游戏、85前端、5镜头） |
| 浏览器 | 22/22通过，2.4分钟，无跳过云用例 |
| npm audit | 0漏洞 |
| diff check | 通过 |

另在本轮新建隔离数据库执行：

```bash
PDOOM_TEST_ISOLATED=1 \
PDOOM_TEST_DB_URL=jdbc:postgresql://127.0.0.1:55439/pdoom_test \
bash backend/scripts/sbt-local.sh test
```

任务 `bash-090b4cbfe2b34f0e`：**19/19通过，退出码0**，包含12项真实HTTP/PG集成、4项领域校验及3项安全测试。不是复用上一轮历史数字；测试中的脱敏500日志来自刻意的异常/回滚用例。

保留警告：Phaser chunk 1,352.43KB、gzip348.56KB，超过500KB；没有靠调整阈值掩盖，也未声称低端性能已验证。Chrome软件WebGL冷启动仍仅给ready环节15秒预算。

## 3. 不是只靠测试绿灯：截图发现并修复入场问题

首版整套174单测/22浏览器也曾通过（`bash-42c41b701dc74543`），但Lead实际查看Sydney截图发现：角色落回竞技场下方的最后一级台阶，镜头却已锁在顶部。原因是旧入场门槛y325早于脚部越过y300地板；短跳或在进入Boss逻辑后松开跳跃会触发错误锁镜头。

1. 新增[短跳回归](<../tests/game/arenaEntry.test.ts>)，先在旧代码上实跑：退出码1，`boss.active`意外为true。
2. 入场门槛改为同一个地板常量减半个玩家碰撞体，即 `300 - 22/2 = 289`；短跳不触发，脚部真正越过后才锁镜头。
3. 回归与两章正常输入通关同时转绿；不修改跳跃物理、不放宽断言。
4. [浏览器Sydney测试](<../tests/e2e/factory.spec.ts>)增加真实PNG扫描：必须有Clawd橙色像素，最下方橙色像素换算到设计坐标须小于320，不能再次在y355入口平台上假通过。
5. 重跑全套最终175/22，并重新查看下列修后截图。角色确实在上层竞技场地板上，气泡真实出现、J射击后消失。

此外，对话框弹幕外观改为完整包住圆形命中区；探针吞噬预警改为与教学文字一致的红色。

## 4. 可达性证据与边界

[第二章正常输入测试](<../tests/game/factoryPlaythrough.test.ts>)从合法stage2起点出发，仅使用FrameInput及显式rest-continue；没有改血、传送、直接扣Boss血或调试命令。两个休息室均到达，各Boss阶段等待实际attack后才输出，气泡优先实弹射碎。

修后最终指标：**29,915ms总模拟时间，14,266ms入场，1797帧（含两次rest-continue），84HP，3次PUA绑定，42次射击，2次Q**。上升过程中最小脚部海面间距153px。结果保存stage3/cp0，DTO校验通过。

这是脚本可达性证据，不等于人类玩家平均通关时间、所有build平衡或全程浏览器自然通关。浏览器新用例采用合法存档fixture：

- 第二章打开的休息室恢复、真实购买与刷新保留build/donated。
- 真实键盘从第二章起点攀到第一休息室。
- 从第二个闭合安全点真实攀爬进入Sydney、观察定身、J击碎解控，实际像素验证站位。
- 未开放第三章入口保留、不假装可玩。

原有第一章控制、三态图集、暂停、损坏恢复、休息室/上下文、真实云保存/恢复、成绩401/409/超时/幂等均在本轮整套重跑。

## 5. 实际看过的画面

- [工厂攀爬](<../artifacts/browser/factory-climb.png>)：1060×598，纵向台阶、四腿Clawd、探针与危险距离提示。
- [第二章休息室](<../artifacts/browser/factory-rest.png>)：960×1032，CHAPTER02标记、170TOK与已购买词条。
- [Sydney绑定](<../artifacts/browser/sydney-bound.png>)：修后角色站在上层地板，控制框、可击碎气泡和临时婚纱幽灵清楚可见。
- [Sydney解控](<../artifacts/browser/sydney-released.png>)：气泡/绑定框消失、角色仍在正确地板上。

图片是实际Chrome测试截图，不是概念图或宣传渲染；测试产物目录被git忽略，可由用例再生。场景/敌人/Boss仍为临时几何表现，不能替代Aseprite制作、冷评与validate流程。

## 6. 工具、安全与服务生命周期

- 一次子代理combat编辑被自动审核拒绝时未执行。Lead没有换写手偷偷重试，而是向用户单独确认；用户选择允许在现有权限修改后，才接管[碰撞模块](<../src/pages/GamePage/game/systems/combat.ts>)。
- 两名写手职责分离，最后交接冻结；Lead审查实际文件、统一编译/测试和浏览器验证。未发布、安装系统软件、修改其他preset或访问真实数据库凭据。
- 使用已读过的[隔离PG脚本](<../backend/scripts/test-postgres.sh>)创建新集群 `backend/.local/pg-test.wXDV2D`，不是复用用户数据库。PG任务 `bash-345f8bbe9a3d41ff`，Main任务 `bash-84b14720e7c84ddf` 均由Lead持有。
- Main与前端代理health均实测200；验证完先关闭Main并看到Hikari Shutdown completed，再停止PG，2026-10-28 00:02:23+08:00记录database system is shut down。
- 末次检查确认8081/55439无监听，8080首页仍HTTP200。测试数据保留在本地忽略目录，未删除旧集群、未操作系统服务。

## 7. 仍未完成

第三至第五章、捐款对Basilisk的实际影响、最终镜像/三结局、种子生成、完整Aseprite环境/敌人/攻击动画、原创音频、多设备输入、完整性能/平衡/发布前验证仍在[开发计划](<development-plan.md>)。总目标保持active，不能以本里程碑冒称完成全量GDD。
