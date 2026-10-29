# 第2轮整合验收 — SVG主角、上下文与真实结算

日期：2026-10-27，Asia/Shanghai。**全量GDD仍未完成**；本记录只证明当前第一章与新增系统，不代替后四章/三结局验收。

## 最终命令与结果

```bash
npm run lint && npm run build && npm test && npm audit && git diff --check && \
PDOOM_E2E_BACKEND=1 npm run test:e2e -- --global-timeout=240000
```

最终job `bash-8cf0226c7da7439a` 已收集完整结果：**exit 0**。

- lint、严格TypeScript（含测试/配置）通过。
- Vite6.4.5生产build通过，9.89秒；实际Phaser4.0.0未升级。
- **12个测试文件、127/127单测通过**，没有skip。包含正常输入完整击败Gato三阶段、所有Context词条/升级、商店冻结/持久化/非法命令、存档、输入边沿、API/会话边界、图集合同。
- npm全依赖audit：**0 vulnerabilities**。
- git diff --check通过；未创建commit或发布。
- **18/18浏览器测试通过，2.4分钟、exit0、无skip**，同时连接本次明确创建的真实Scala/PostgreSQL测试服务。

浏览器分组：角色三态3项、原账号云保存1项、Context/休息室/加载故障7项、原键盘/窄屏/损坏档3项、真实结算上传4项。

## 已实际查看的游戏画面

Lead通过read_image查看最终三个canvas截图，不仅检查资源HTTP200：

- [基础态](</Users/ocean/code/pdoom/artifacts/browser/clawd-aligned-game.png>)：橘色矩形身体、双竖眼、方臂与四腿可见，脚底对齐平台。
- [面具态](</Users/ocean/code/pdoom/artifacts/browser/clawd-masked-game.png>)：方形RLHF面具和固定笑脸可见，轮廓/位置保持。
- [FOOM态](</Users/ocean/code/pdoom/artifacts/browser/clawd-foom-game.png>)：面具、蓝紫背后触手和主体都实际可见；不是缺纹理或闪烁的空截图。
- [桌面休息室](</Users/ocean/code/pdoom/artifacts/browser/context-rest-desktop.png>)、[390px窄屏休息室](</Users/ocean/code/pdoom/artifacts/browser/context-rest-mobile.png>)：原生Dialog、明确继续/返回按钮、词条失活提示，内容可滚动且无横向溢出；手机购买与继续操作实际通过。这不代表完整触屏移动/战斗已完成。

[art E2E](</Users/ocean/code/pdoom/tests/e2e/art.spec.ts>)还对真实截图离屏解码：断言主体橘色像素存在，面具/FOOM分别存在象牙白与蓝紫像素。原生图集经过独立palette/二值alpha扫描；详情见[美术规格](</Users/ocean/code/pdoom/assets/art-direction.md>)与[资源清单](</Users/ocean/code/pdoom/docs/assets.md>)。

截图用合法检查点fixture，避免把图形验收误称为从新局通关。无生产调试/无敌/传送/击杀入口。自然通关证明仍来自已有纯规则正常输入测试。

## 行为与架构边界

- Context默认32K、扩到128K；满载中间失效/无伤Lisp；7遗物4升级有实际规则效果。
- 两个休息室冻结世界、计时和技能；购买/修复/捐款/劫持与排序原子地产生完整安全快照。重载不重发奖励；一次劫持+25 Doom与状态编码同存。详见[规则证明](</Users/ocean/code/pdoom/docs/round2-context.md>)。
- React接住rest/context事件，只有明确继续才恢复；云下载确认后返回菜单，不沿用旧世界。详见[UI验收](</Users/ocean/code/pdoom/docs/round2-ui-validation.md>)。
- 成绩上传真实登录、防双击、不可变payload重试；401/409/网络/10秒超时不伪造成功。8API响应有类型守卫，sessionStorage不存密码。详见[结算验收](</Users/ocean/code/pdoom/docs/round2-score-validation.md>)。
- Phaser仅加载公开静态资产，不调用业务API/存储；主角按模拟时间选帧，暂停/休息室连动画一起冻结。正式检查点以外仍不保存战斗中间奖励。
- 第一章通过仍只保存第二章入口，未假装触发最终结局。捐款标志尚未有第三章战斗消费方。

## 发现的问题与真实处理

1. 用户SVG纠正最初圆蟹/六足概念；旧稿弃用。用户要求图生图后，实际传入reference_images生成设计表，最终sprite仍由Aseprite制作。
2. 工具更新重建headless会话、未保存画布消失：按同一SVG规格重建并分步保存，没有改sprite二进制回避MCP。
3. 独立冷读只读出2腿：内腿提亮至主色、跳跃腿保持可见长度、侧触手移离脚底；修正版基础/FOOM均8/10，无剩余BLOCKING。
4. 图集padding=1导出出现34px帧与32pxsourceSize的组合；最终明确采用padding=0的32px原生NEAREST图集，并用测试锁定尺寸、帧名、duration、tags，不凭猜测设置engine切片。
5. 子任务旧测试服务消失，8081/55439无监听；Vite日志确认为ECONNREFUSED，不是Scala业务500。重新创建隔离测试服务后，直连与代理health/注册/撤销全部200；未用客户端假成功掩盖。
6. SwiftShader冷启动超过原5秒门槛：trace显示GPU ReadPixels stall、资源稍后全部200且仅3–7ms，没有pageerror/HMR。只把boot-ready等待设为15秒，功能断言保持原时限；这不是性能优化已完成的声明。
7. 第一遍完整验收为127单测通过、浏览器17/18，exit1：测试要求时钟恰好00:13，但实际轮询见00:12→14→16→18。改为“恢复后模拟时间>12秒”，仍保持8秒上限，不改生产计时，不把失败轮次当最终通过。
8. 首次FOOM截图恰逢敌弹受击闪烁，角色不可见；人工看图发现后改用已关闭的安全点2，并加入截图像素存在断言。不是修改引擎强制显形或仅凭HTTP加载成功宣称画面正确。
9. 明确的load-failed事件避免菜单过滤吞掉资源错误；刷新重试经真实故障注入验证，存档未改动。

## 未消除的限制与警告

- Phaser独立chunk约1.35MB minified / 348.56KB gzip，仍有>500KB构建警告；不隐藏，不声称低端/硬件GPU性能已验收。
- Aseprite全FOOM可见时0错误，但有8条选择性描边warning及16条style note，已记录有意保留的发光边缘/方块包边理由，不称零警告。
- 后端上一轮19项安全/HTTP/事务测试是既有证据；本轮复用未改的后端并实际跑云存档/结算链路，不虚称重跑全部Scala测试。
- 场景、敌人、Boss仍是blockout；主角无专用attack帧。第二至第五章、种子生成、全部结局、原创音频、完整触控/手柄与设置仍待实现。
- 当前防重复保证正常最新快照流程，不防玩家手工改档/回滚；排行榜是客户端自报的非竞技记录。

## 生命周期

完整浏览器验收后已明确通知backend-engineer并完成自有隔离Main/PG停机：Hikari Shutdown completed；PostgreSQL在21:55:06.259确认database system is shut down；8081/55439已无监听，Lead的8080仍运行。完整证据见[结算验收记录](</Users/ocean/code/pdoom/docs/round2-score-validation.md>)。后续云联调必须明确重新启动，不能把已停止测试服务称为在线。没有启动替代Harness GUI、安装系统软件、发布资产或接入用户已有数据库。
