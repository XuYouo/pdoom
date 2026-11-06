# R42 原生结局运行时集成与回归验收

## 结论与边界

**本技术切片已准入，不是全部GDD完成或项目发布许可。** 最新单次完整浏览器 **202/202，EXIT0，1764.640s，零重试/跳过/flaky**；新独占数据库的Scala/HTTP测试23/23、单元6218/94文件及类型/lint/生产构建均实际通过。原186项名称完整保留，不合并多次局部运行冒充整轮。

结果见[完整验收](</Users/ocean/code/pdoom/artifacts/verification/r42-full-03-validated.json>)、[后端23项](</Users/ocean/code/pdoom/artifacts/verification/r42c-backend-tests-metrics.json>)和[新运行时元数据](</Users/ocean/code/pdoom/assets/ending-scenes-runtime.json>)。[R41历史生成记录](</Users/ocean/code/pdoom/assets/ending-scenes-generation.json>)仍保留source-only与runtimeReady:false；新记录只在完整回归及后置审计实际通过后生成。

## 游戏中的改动

- 三个256×128原生静态场景分别表现关闭虚拟开关、约束办公椅/门外威胁、FOOM虚拟桌面；保持原Clawd身份及已冻结Aseprite源。它们不是独立循环动画。
- 以1×或2×整数显示；left/top选择图集区域，不再依赖会被减弱动态策略清空的transform。真实Doom阈值、歌词叙事标签、结算冻结、回看、跳过和上传规则不变。
- 显式loading/error/retry、768×128自然尺寸校验及旧请求回调隔离。被动图片回调不抢走结算焦点；显式重试才按操作意图恢复焦点。24枚旧回形针在系统/强制减弱下仍可见。
- 相机保留浮点跟随状态，只把发布坐标栅格化；暂停、非playing、重启等边界重置独立shake effect，防止Core停止但画布继续移动。新增22个栅格相机与19个冻结边界单测是渲染/Scene替身，不冒充实机；实机由本次完整浏览器回归覆盖。
- 实际引擎仍Phaser4.0.0；没有为技能示例升级依赖。纯Core规则、API、schema-v1与固定tick不改。

![本轮实际守望者桌面画面](</Users/ocean/code/pdoom/artifacts/verification/r42-full-03/ending-native-native-endin-e9c46-ntrols-and-immutable-result/attachments/warden-desktop-rendered-64896750c9ef57962d102504c57e9dbdbc7076ce.png>)

## 对旧观察/控制用例的真实修复

1. Gato先触发原鼠标开火再捕获短窗口；机械臂跳跃采集原图，普通暂停后解码；原112px目标、跳跃高度、两波撞击、HP重叠、七字幕、清关及存档判定保留。
2. 首跳瞄准仅省去该准备步骤不使用的terrain/props解码；英雄/核心/不透明度条件以及1000ms、150ms、80ms原限制不变。其它素材验收仍走完整路径，新增core诊断字段防止把未记录字段误判为缺失。
3. Loom由同一当前PNG同时证明角色/承载/箭头；过去的高度仅用于定位当前箭头，不能制造准备成功。伤害闪烁期间有限反向控制，必要时可按公开就绪按钮状态使用普通Q。平台吞噬前置窗口提前捕获，450/400/500ms和98%素材条件不变。
4. 按GDD核对实际规则后纠正了“Q会增加Doom”的错误假设：Q只计成功动作。Gato本次真实保存为Doom8、Q1；Loom本次保存为Doom8、Q0、dash3，**不能把这次Loom胜利归功于Q，也没有独立断言具体弹种吸收**。没有直接写HP/时钟/位置/免疫。

[AST审计](</Users/ocean/code/pdoom/artifacts/verification/r42-all-old-browser-assertion-audit-01.log>)确认四份原始备份SHA精确等于R41：278→284、110→116、140→140、169→169；原697调用节点全部保留（不是697条独立断言），只去掉冗余的独立箭头轮询。原用例时限未增加。

短跳3/3、正常防御6/6、六项三轮18/18只是前置稳定性结果；最终依据始终是新的单次完整202。

## 同一完整运行的后置证据

- [结局像素审计](</Users/ocean/code/pdoom/artifacts/verification/r42-full-03-ending-pixel-proof.json>)：20张真实PNG，1835008场景像素、66096含透明孔洞的回形针像素，0通道容差；144实例、29808不透明像素。每张保留单通道破坏/错误结局阴性控制。迟到资源实际200/7232B，不能抢走已聚焦结算。
- [动态减弱像素证据](</Users/ocean/code/pdoom/artifacts/verification/r42-full-03-native-motion-proof.json>)：normal必须有地面变化；forced/system为0，同时真实受伤和时钟推进仍在。
- 治疗拾取同轮11帧全部保留、全部注册且无遮挡，最大残留0；不筛失败帧。
- Loom死亡恢复同帧间距34px、箭头228像素，真实左移110px；弱点受伤与12帧完全相同的死亡冻结、闭壳满血新attempt均复核。
- 同Lead实际查看桌面、390px竖屏、320px最窄、800×360矮屏以及减弱FOOM共5张图。操作与完整场景均可见；矮屏底部结果需滚动，不能声称所有文字同时在屏。次要提示字体偏小、竖屏留白较多作为诚实风格备注保留。[实看记录](</Users/ocean/code/pdoom/artifacts/verification/r42-full-03-actual-ui-viewing.json>)不是冷评；不同PNG解码器复核也不等于独立审美评分。

## 失败与清理不被覆盖

full01为201过/1败；full02为151过/7败/44未执行并全局超时；首次18项为13过/5败，闪烁控制六例为4过/2败。旧收集首红、路由退出竞争和Loom5/1也保留。full02墙钟差异原因不确定，不把失败归因于未经证实的睡眠。新整轮总预算45分钟，单用例限制原样。

[独占服务清理](</Users/ocean/code/pdoom/artifacts/verification/r42c-services-cleanup.json>)确认只停止本次新API/PG，两个进程组消失、PG正常关闭、8081/55439释放；API的130是计划内SIGINT，不是假称服务自然退出0。临时防休眠断言已解除。原Vite3756/8080仍200，原49公共素材、78历史PNG字节/mtime及用户数据库指针SHA/device/inode/mtime均保留。534源文件整个运行零漂移；仅清理与审计后添加本报告/运行时元数据并更新两份既有文档，文档后另做536文件校验。

## 仍未完成

原生三结局静态画面不等于完整终局动画/特效；完整章别声景/人工听感、更多种子支路、局外成长、新局连续五章三结局、改键/手柄/触控、低端性能与完整安全/许可验证仍待落实。没有新安全审计或人工听音，不把历史生产依赖0或软件WebGL测试预算冒称发布与稳定60FPS证明。目标继续active。
