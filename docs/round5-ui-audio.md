# 第五里程碑 UI / 原创音频交接（目标回合 6）

日期：2026-10-28，Asia/Shanghai。task-11，backend-engineer。本分工不代表完整五章或最终音频制作完成；实际引擎仍为 Phaser 4.0.0。

## 1. React 四章流程与 HP 读数

- 沿用真实章节注册器的可玩范围，第三章清关按钮直接启动事件提供的完整第四章快照；不重建本局数据。第四章清关仅保存第五章入口，仍明确未开放、不是最终结局，不出现成绩上传。死亡结算保留原有成绩与安全检查点恢复路径。
- [HUD](<../src/pages/GamePage/components/RunHud.tsx>) 消费可选 `loom` 快照。`hpUiTaken` 时真实卸载 HP 数字、`integrity-track` 和宽度样式，不是用透明度藏着仍可读的数值。占位为“读数被吞，生命仍正常计算”。恢复时直接显示当前快照 HP，不回满生命、不写模拟状态。
- Lead 首批 Loom 实机截图审读后，修正两个不能从 false 值推断的状态：`narrow=false` 只写“落脚区仍较宽”，不声称平台完整；`sharpTurnReady=false` 用“按场景目标行动”，不把已打开的弱点窗口错误标成等待。`stage>=4` 的捐款说明改为已经发生并锁定的本局因果，明确后续不再补捐；第一至第三章原语义保留。新增六项回归覆盖这次审读。
- [操作区](<../src/pages/GamePage/index.tsx>) 只在有 Loom 快照时显示 R；非 playing 或未就绪则禁用。命令为真实 `reroll`，是否可用由引擎快照决定。音频入口在窄屏隐藏顶部设置入口时仍可访问；休息室中禁用，不绕过明确继续/返回流程。
- [指南与设置](<../src/pages/GamePage/components/GamePanels.tsx>) 新增 Leviathan 独立分支：R 清空旧 Q 历史、需重建两秒历史、Q 不还原坍塌平台；闭壳 J 零伤；从标线右侧 A + Shift 真正向左跨线至少 32px，每 phase 一次左转；弱点窗口归还 HP 读数与音乐，但不回血、不恢复平台。
- [新增主题样式](<../src/index.css>) 仅增加 HUD 300ms 吸入、240ms 回归和音频控件。有限位移、无桌面/窗口操作，系统 reduced-motion 关闭动画。没有重构全站或制作正式环境资产。
- 云端恢复→终端、资源失败显式刷新、休息室不可取消、关闭普通面板不自动恢复、实际 ended 才上传成绩等旧边界保持。

## 2. 原创音频，不使用原曲/歌词/外部样本

[谱面](<../src/pages/GamePage/game/audio/score.ts>) 使用新写的 32-step 短旋律、低音与节奏；120 BPM、0.125 秒十六分音符。无歌曲文件、歌词、人声、采样下载或许可证不明素材。

| music bus | 合成方式 | 激活规则 |
|---|---|---|
| chip | 方波旋律 | 探索常驻 |
| bass | 三角波低音 | 探索常驻 |
| percussion | 正弦下滑鼓 + 确定性噪声帽/军鼓 | Doom ≥35 或 Boss |
| drive | 锯齿波 + tanh 失真 + 1800Hz 低通 | Doom >70 或 Boss |

`stemsLost` 按 chip→bass→percussion→drive 真正把对应 GainNode 归零，恢复为 0 时重新开启应激活层。效果器之后再切 drive bus，避免效果尾音绕过被吞的层。射击、受击、Q、R、真实左转的五类 SFX 走独立总线，吞音乐不吞操作音效；用户全局静音仍静音两者。

[原生 SynthGraph](<../src/pages/GamePage/game/audio/SynthGraph.ts>) 的 compressor + 零中心 soft limiter 后接 master。默认音量 50%，滑块平方映射，master 上限 0.32；这是数字增益/限幅设计，不是经过校准的 LUFS、硬件响度或听力安全结论。每 voice 有 attack/release；每实例最多 24 voices，其中 music 最多 16，保留 SFX 余量。ended 断开节点，dispose 停止所有源并释放图/时间线引用。

## 3. 入口与生命周期合同

[AudioSystem](<../src/pages/GamePage/game/audio/AudioSystem.ts>)：

```ts
new AudioSystem(onStatus)
unlock(): Promise<void>
setPreferences({ muted, volume }): void
update({ runId, stage, doom, bossActive, running, elapsedMs,
  hp, shots, rewinds, rerolls, turns, stemsLost }): void
destroy(): void
```

- 构造、初始偏好同步与 `update` 不创建 AudioContext。`unlock` 在首个 await 前同步创建/resume；拒绝被捕获并发 `unavailable`，不打断游戏。状态只有 locked / running / suspended / unavailable。
- 每个 Scene 独占一个实例，没有全局单例、fetch 或存储；Phaser 的 noAudio 可以保持 true，避免第二个上下文。
- 音乐按 audio clock 排程：25ms 调度、100ms lookahead、每 tick 最多 4 steps；阻塞后跳过已错过的拍，不补发大量历史声音。四轨全吞时停止音乐时钟，但上下文和 SFX 仍可工作。
- pause/rest/menu/blur/hidden 要由 Scene 立即 `update(running:false)`，不是等待已停的 RAF。本实例立即停音乐 timer、淡出 master，40ms 后 stop voices + suspend。明确继续/恢复再播放；销毁清理 timer、nodes、state listener 并 close 自有 context。Lead 负责 Scene/Input/桥接接线。
- new run / stage / backwards elapsed 或计数回退会重置基线，不回放存档里的历史动作。静音/暂停期间计数仍被记录，不积攒恢复后的 SFX 爆发。

## 4. 偏好存储只在 React 边缘

[音频设置函数](<../src/pages/GamePage/functions/audioSettings.ts>) 和 [hook](<../src/pages/GamePage/hooks/useAudioSettings.ts>) 使用独立 `pdoom.audio.v1` 键：`{version:1, muted:boolean, volume:number}`。严格校验有限 0..1；非法或读取失败用安全默认并提示，不删除原数据或触碰游戏存档。写失败保留本次内存设置并提示。

初始 effect 和 ready 重同步明确 `unlock:false`；只由用户设置控件回调发送 `unlock:true`。音量/静音/状态是实际控件，不再显示“静默 · 尚未制作”。监听随页面卸载解绑。v1 游戏 DTO、云接口、账户凭据均未改动。

## 5. 原生 PCM 暴露的真实缺陷与修复

Lead 使用 [真实 Chrome / OfflineAudioContext 用例](<../tests/e2e/audio.spec.ts>) 报告了初版缺陷：同一图 full@0 → zero@0.15 → full@0.30，只有 9 个 music voices，远低于预算，但 0.20–0.29 秒窗口 RMS 为 **0.007864751**，未达到原始 `<1e-7` 静默断言。初版 Node 测试虽通过，不能代替这条真实波形证据。

根因是 `cancelAndHoldAtTime` 后仅写 linearRamp 终点，未保证未来恢复拥有明确起点，恢复可能从旧的 0.18 秒终点提前插值。

修复为 [GainAutomation](<../src/pages/GamePage/game/audio/GainAutomation.ts>)：根据自身时间线计算指定时刻的保持值，显式 `setValueAtTime(held, at)` 再 ramp 到 `at+30ms`；不将 `param.value` 的 currentTime 值误当未来值。支持重叠/提前替换的线性段，已完成历史被裁剪，未来段最多 64；相同目标不逐帧重排，零增益能真正到达。master 与四个 music bus 都使用它，dispose 清空记录。

新增单测既覆盖 helper，也直接通过生产 SynthGraph 锁定 full→0→full 的起点锚。一次新增 Node 断言把 `0.3+0.03` 写成严格 `0.33` 字面量，因 IEEE 双精度差异失败；改为严格的起点+时长算式，没有改变声音实现、Native 静默阈值或 RMS 窗口。

**Lead 已独立复跑真实 Chrome：任务 `bash-7770cf54a8494be5`，typecheck + 同一原生浏览器用例 3/3，exit 0。** 未放宽 `<1e-7`、未改变时间窗口：吞音前 RMS 约 **0.0042386**，吞音段为 **0**，恢复段约 **0.0075631**；全吞时独立 SFX 约 **0.0159522**，全局 mute 为 **0**，四个 stem 独立渲染各自非零。真实游戏 boot 无 context、手势后 running、暂停 suspended、新训练复用同一 context，以及 destroy 后真实 closed 也通过。这里明确归属 Lead 的原生测量，不是本分工的 FakeContext 测试或人工试听结论。

## 6. 本分工实际检查

初次全 scope 检查 `bash-0058be311b7b4665` 为 111/111、lint/typecheck exit 0。追加重复切换调查后，最新任务 `bash-8ddfca5b19184a49`，exit 0：

| 检查 | 结果 |
|---|---|
| React 四章/UI 分支（保持冻结） | 60/60 |
| 音频偏好解析/保存/非自动解锁命令 | 15/15 |
| 谱面/stem/SFX 纯规划 | 14/14 |
| 原生 API 结构图/预算/解绑/源异常传播 | 6/6 |
| gain 时间线/非零 clock/陈旧 getter/有界历史 | 7/7 |
| 音频系统生命周期/重复切换/一次诊断 | 14/14 |
| 合计 | **116/116，6 文件** |
| audio scope ESLint（追加改动） | exit 0 |
| 全项目 typecheck（当时工作树） | exit 0 |

[音频测试目录](<../tests/audio/>) 的 FakeContext 明确只证明节点路由、自动化调用、资源上限与生命周期，不渲染声音。真实 PCM、游戏内浏览器交互、声音恢复与 UI 像素结果以 Lead 的独立验收为准。未启动服务器/浏览器，未跑后端，未安装/升级依赖，未编辑桥、Scene、Input、Renderer、model、纯模拟、config 或 e2e。

离线调用同一图时不要一次预排数秒而误触真实 16-music 预算：用约 0.5 秒短缓冲，或 Offline.suspend 分块排程。不能把预算丢弃后半段的静默当成吞音成功。生产仍只排前方 100ms。

## 7. 首次交接状态与边界

task-11 rev3 时全 scope 已冻结，保留此前原生音频红→绿、Lead 3/3 的证据；这不自动证明更长的重复吞音场景。Loom 实机路线与全量回归由 Lead 整合；不代表最终结局、完整五章或人工扬声器听感已完成。之后的追加调查单列如下。

## 8. 重复吞音追加调查与音频 scope 验收

Lead 在 `bash-12aa35040ae14b38` 的真实 Loom 普通跑跳/左转测试中观察：首次两轨吞音 getter 为 `[0,0,.64,.42]`，弱点返回四轨为 `[.72,.58,.64,.42]`；下一轮再吞时 bass 的 `AudioParam.value` 停在约 **0.42573609948**，1.5 秒后仍如此，原断言失败。HUD 当时仍是 playing / stemsLost=2。

这本身不能证明音轨泄漏或 AudioSystem 关闭。Lead 在 `bash-5048b383c439411b` 保持旧 getter 断言不变再跑，旧断言仍红，但得到直接反证：context **running**、audio time **18.672s**、`closes=[]`；chip/bass 的 target 都是 **0**，截止 **10.899s** 已过，两条 bus 的 **RMS/peak 均精确 0**；bass getter 却仍为 **0.5799999833**。未吞的 drive RMS 约 **0.00038983** / peak **0.00153928**，证明音频线程和未吞层仍输出。

因此这次不是第二个生产增益/关闭故障，而是休眠无输入 bus 的 getter 不适合作为真实静默判据。先前 chip 比 bass 更早更新 getter 的现象也与此一致。Lead 将实机验收改为指定 chip/bass 的实际 PCM `<1e-7` + target 0 已到期 + context running，恢复则跨拍积累四轨非零；不按瞬时“静音轨数量”判断。没有强写 `.value`、加常驻空振荡器、改变游戏规则或放宽 PCM 阈值。Lead 随后在组合任务 `bash-2664b0a280ce4f47` 完成 [原生音频用例](<../tests/e2e/audio.spec.ts>) **4/4 通过**，包含真实 37% 音量滑块、静音持久化和刷新不自动解锁。该任务的第一次独立 Loom 实机也通过：首次和再次吞音的 chip/bass PCM 均为 0，上下文 running、没有 close，恢复时跨拍累积四轨 RMS 均非零；再次吞音时 bass getter 仍约 .58 而 PCM 为 0 的反证保留在绿记录中。

**组合任务总退出码仍是 1**：第二次 Loom 普通键盘机器人未能收敛到站位，未通过的是路线控制，并非音频断言。Lead 明确验收音频本 scope，并继续修机器人、跑全量回归；不能把音频 4/4 和一次 Loom 通过写成重复 Loom 或全项目全部通过。

本分工此次只改可观测性：AudioSystem 首次致命失败会向本地 console.warn 输出 operation、原生状态/时钟、stemsLost、目标 levels，以及原始异常和 stack；每实例最多一次，不发送网络，不包含整份存档。正常 destroy 不记作失败。source.start/stop 的异常先清理 voice，再传到同一诊断，不再静默伪装成预算丢弃。

新增五项纯回归覆盖 137 秒非零时钟反复 2→0→2→4→0、2000 帧调用、陈旧 getter 不强制重排、一次原异常诊断及源失败清理。116 项 Node 检查通过，但不据此宣称真实 PCM 已正确。**增益算法、曲谱、音量阈值、UI 和游戏规则均未因此改动；收到 Lead 的音频 scope 验收后，全 scope 源码、测试与本交接再次冻结。** 需要按指定被吞 bus 验证 PCM，而非要求某一瞬间“恰好两轨无声”，因为未吞乐器也有正常休止。
