# R29：工厂HUD遮挡已修，整合验收仍未通过

目标回合39，2026-11-02（Asia/Shanghai）。保留已完成的[R27休息室菜单](<round27-rest-menu-progress.md>)，
本轮没有重画素材、改Core、升级Phaser或重新设计休息室。**完整GDD目标未完成，新拾取物仍是候选。**

## 实际交付

- [FactoryRenderer](<../src/pages/GamePage/game/systems/FactoryRenderer.ts>)的短状态框改为原生视口上方中央。
  原右上底板压住Sydney头顶41个像素；真实源frame0匹配1887/1928=.978734，原.98门正确拒绝。
  新位置避开右侧入场身体和y55场景短提示，字体、文本、冻结、海/探针/气泡和伤害规则不变。
- [HUD回归](<../tests/rendering/factoryHud.test.ts>)先3失败2通过，修改后5通过；
  Lead实际查看scope02的原生idle图，头顶完整、状态居中、原场景短提示保留。
- [测试边界](<../tests/e2e/sydney-release-boundary.ts>)区分存活解控与真正通关。
  先取得真实冻结样本再读取通关/控制状态，避免在途普通子弹已经击杀后仍按旧定身HUD行动。
  存活分支继续要求原liveBoss、目标及解控日志；最终通关分支要求原生body/HP/气泡/危险提示全清，
  通关UI可见，且已按生产合同移除的playing-only目标/日志确实不存在。
  两个正向案例使用原[withCleanup](<../tests/e2e/factory-navigation.ts>)保存主错误和清理错误。
- 所有原生源图阈值、真实620ms J/650ms采样、阶段/发射/存档/同arena及跨章断言保留。
  原180/240秒案例总时限未增加；错误地等待objective的单次调用改为5秒内明确失败。

### 实看过的修后原生画面

这是scope02的真实inactive idle1画面，不是整套通过或连续五章证明：

![工厂状态居中，Sydney头顶不再被状态底板遮住](<../artifacts/verification/r29-boundary-scoped-02/sydney-art-Sydney-real-ord-7e727--arena-before-chapter-three/attachments/sydney-real-inactive-idle1-9b857e64ed6717fa327015997b7bf46a464ef4e5.png>)

## 当前准确结果

| 验证 | 实际结果与边界 |
|---|---|
| type / lint / build | 修订04均实际EXIT0 |
| 全部Vitest | 4270通过，70文件；[原日志](<../artifacts/verification/r29-unit-all-04.log>) |
| R29同7专项01 | 5通过2失败，EXIT1；暴露真实HUD遮挡 |
| R29同7专项02 | 6通过1失败，EXIT1；采样前后的真实击杀边界 |
| R29同7专项03 | 6通过1失败，EXIT1；9active+idle已采到，真实通关后错误等待已移除HUD至原240秒超时 |
| R29同7专项04 | **6通过1失败，EXIT1，82.288s**；剩余为自动导航未达原320±4 |
| 最新实际完整133 | 仍为R28的**129通过4失败，EXIT1**；本轮未启动新完整133 |
| 后端 | R28独立fresh23/23是历史事实；本轮只准备管理函数，未启动PG/API或新后端测试 |

各scope均是同一7例、单worker、零retry/skip/flaky，不是挑选通过项拼结果。
[当前专项结果](<../artifacts/verification/r29-boundary-scoped-04-metrics.json>)、
[完整R28结果](<../artifacts/verification/r28-current-browser-01-execution.json>)与
[原HP空格修复scope6](<../artifacts/verification/r28-rest-text-browser-01-metrics.json>)分开保存。
原探针缺PNG/缺consume帧反例未改，在本轮四次scope均通过；这不能证明R28浏览器创建页面失败的根因已修复。

## 未解决：真实低帧导航仍不稳定

[共享导航](<../tests/e2e/factory-navigation.ts>)仍保12次纠正、原生hero>20及320±4。
新增6个直接调用原pure controller的粗帧单元先全红；单额外帧候选仍4红，分段制动版本单元通过。
scope03实际路径331→325→315→325→330→326→330→322，确实进入制动并通过原Factory绑定例。
但scope04另一次路径325→315→325→334→334→340→334→344→344→353→331→338→332，仍未达标。
**固定粗帧单元不能代替真实恢复/输入时序；现策略不能宣称已稳定。**
原始失败、时序与图像都保留，下一步应先据失败trace建立不同帧长/恢复延迟回归并重新设计导航，
而不是盲加等待、放宽坐标、加重试或修改游戏物理来刷绿。

最终通关UI分支的新修订04尚未在完整战斗路径上通过验证，因为该轮在导航阶段先失败。
[scope03主错误提取](<../artifacts/verification/r29-scope03-timeout-diagnosis.json>)明确为
objective误等待109416ms；不能把清理时mouse.up报错当作根因。

## 证据、资源与后续

- [423已知路径冻结](<../artifacts/verification/r29-source-freeze-04.json>)在scope04结束及独立资源核验时零漂移；
  这不是整个仓库哈希。本文及README/资源/进度说明是测试后的文档后继版本。
- 四次scope各自实际改写的历史图归档后恢复原78张字节与mtime，未把旧图冒充新证据。
- [资源核验](<../artifacts/verification/r29-round-resource-check.json>)证明四个自有测试进程组都已退出，
  8081/55439空闲、用户PG指针字节/设备/inode/mtime不变，原Vite3756仍在8080返回HTTP200。
- 本轮由Lead独立完成；Codex CLIProxy API / 6.1 Sol Max路由仍未核验，没有新派给旧模型的任务。
- 更详细的分析与操作偏差见[本轮记录](<../artifacts/verification/r29-analysis-notes.md>)。

R26拾取物的源/适配器/专属native证据不等于当前整合全绿，**不得正式准入**。
先解决剩余导航并完成当前专项，再运行fresh后端23和一次完整133；之后仍须继续NPC/专用攻击、
结局演出、完整音频/可访问性/低端验证、真实连续五章三结局等[完整GDD差距](<development-plan.md>)。
