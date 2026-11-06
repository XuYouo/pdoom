# R44：Q反击收益可见化（正式切片 / 单次210/210）

## 当前状态

回合67实现只读反馈，回合68补正向生命周期，回合69修正旧核心单发用例的公共观测/输入。
[新完整210](<../artifacts/verification/r44-full-02-validated.json>)为 **210/210、EXIT0、1719.625s，零skip/retry/flaky**，不是定向拼接。全量GDD仍未完成。
首次完整210的209/1、EXIT1/1702.942s保留；旧5px失败原因未被反向证明，不宣称生产战斗根因已修。

- 真吸收字典弹后，Clawd附近显示书形盾标与十段剩余刻度；空Q不造成功提示。
- 实有暴击充能最多六点：真实强化射击扣点，无伤Lisp不扣，免疫到期保留未用点。
- 最大29×21原生像素，复用既有Graphics，在真实弹幕之前绘制；无新常驻文字、对象、监听或第二时钟。
- Core伤害/免疫时长、存档/API、交易、美术资产及Phaser **4.0.0**不改。回合68/69没有新生产代码修改。

## 实现边界

- [counterFeedback](<../src/pages/GamePage/game/systems/counterFeedback.ts>)只读dictionary deadline、Core elapsedMs与criticalCharges；ready/dead/unavailable或HP归零时不绘制，不代表清零dead World字段。贴边/天花板与画外剔除保留。
- [CounterRewardRenderer](<../src/pages/GamePage/game/systems/CounterRewardRenderer.ts>)只发fillStyle/fillRect；[WorldRenderer](<../src/pages/GamePage/game/systems/WorldRenderer.ts#L319-L324>)仅增两import与shots层一次调用，真实子弹在上。
- [投影/Core测试](<../tests/rendering/counterFeedback.test.ts>)与[Graphics替身](<../tests/rendering/counterReward.test.ts>)新增57项；替身不冒充原生视觉。

## 真实运行与保全

| 范围 | 实际结果 | 限度 |
| --- | --- | --- |
| Type / lint / production build | 全部实际0 | 不单独证明浏览器 |
| 完整Vitest | **6353 / 101文件** | 不含浏览器案例 |
| [R68反击定向](<../artifacts/verification/r44-r68-native-02-metrics.json>) | 5/5，EXIT0，88.744s | 单独运行，不拼接 |
| [R69核心全部定向](<../artifacts/verification/r44-r69-core-02-metrics.json>) | 5/5，EXIT0，32.086s | 不是完整210 |
| [两单发各独立重复5次](<../artifacts/verification/r44-r69-core-03-metrics.json>) | 10/10，EXIT0，77.719s | --repeat-each=5，不是失败重试 |
| [新E后端](<../artifacts/verification/r44e-backend-tests-metrics.json>) | **23/23，EXIT0，16.927s** | 新独占PostgreSQL |
| [新单完整210](<../artifacts/verification/r44-full-02-execution.json>) | **210/210，EXIT0，1719.625s** | 单worker，零skip/retry/flaky/超时 |

原202/205/208身份保留；553冻结文件零漂移，78旧PNG bytes/mtime已归还，用户PG pointer不变。
[E清理](<../artifacts/verification/r44e-services-cleanup.json>)确认API/PG组消失、数据干净停机、8081/55439释放，原Vite3756保留。A/B/C/D/E均退休，不复用或信号历史PID。
[D失败整轮记录](<../artifacts/verification/r44-round68-not-admitted.json>)不改写，不能把其209通过拼入本次。

## 普通输入与正向生命周期

1. 等Q实际就绪，原生回溯染色证明空Q已接受，但无书盾/充能。
2. 普通D接近首鹦鹉、两帧黄弹确认接近，普通Q挣得书盾与2点；移动白弹使2→1。非空正向角色/奖励暂停保持PNG/HUD/刻度；继续后免疫消失仍留1，再消费至0并恢复移动橙弹。
3. 合法初始32K库存/已有3次射击fixture中仍须真实Q得2点；Lisp保留2、白弹降1，返回终端/新局清旧提示。不是自然构筑证明。
4. 真2点下用标准DOM blur暂停；J与停留不消费。已暂停时实际WEBGL_lose_context丢失/恢复，要求lost/restored及isContextLost=false、非空PNG/HUD相等；不是物理切Tab或运行中设备重置覆盖。
5. 普通D跌入真实断层死亡，全画布无cue且场景非空；检查点重试新runId、其余安全档相同，新演员无旧奖励。
6. 真Q后白弹留1点，仅D、起跳后空中Shift，按源地形列/角色像素穿两坑进真实休息室。J/Q/Esc及1.1s停留保持画布/HUD/存档；Continue后时间前进仍1点，存档仅checkpoint11→1。

[生命周期只读审查](<../artifacts/verification/r44-round68-lifecycle-review.json>)绑定当前不变的五例源码；非冷评/试听。站内测的是正1充能，非正免疫或刷新后保存运行奖励；附件标签不能独立证明鹦鹉死亡。

## 同轮原生证据与实看

[反击独立解码](<../artifacts/verification/r44-full-02-counter-proof.json>)来自本次完整210：**38张PNG、15,872角色源不透明像素、7,161提示像素**零通道容差，并有内存破坏负控。
包括非空冻结/真实GL恢复对、移动白/橙弹、全画布无残留。Lisp实际背景混合为正20/负0，每通道±1；不是完整括号模板。到期为10个HUD显示秒，约束9–11，非10.000s独立标定；路线105次公共观测不是每帧独立PNG归档。
[核心另一解码器](<../artifacts/verification/r44-full-02-deceiver-proof.json>)重读两单发的**109张原生PNG**，重算精确RGB色块/核心宽度/候选弹体轨迹，核可信短点击及击破同帧消失，四个内存负控；不是全画面源贴图逐像素注册。
同轮还核对20张结局PNG、1,835,008场景像素与66,096回形针像素、三项动作音频、镜头、治疗阴性12帧及Loom冻结/重试。PCM不是试听；旧音频两P3仍在。
[Lead本轮实看](<../artifacts/verification/r44-round69-full-visual-review.json>)为真收益画布、844×500和390×844菜单三图；另外看了核心定向瞄准/移动弹/击破后三图。不把数值解码张数当人工实看，不称冷评。

## 旧单发失败、当前修正与限制

[首次失败trace](<../artifacts/verification/r44-full-01-deceiver-observations.json>)中六次核心坐标恒定；跳后两次角色不可见，末次heroY243.587，Space→click约583ms墙钟。没有证据说明目标漂移、透视先到期或玩家弹被平台拦住。
[旧只读定位](<../artifacts/verification/r44-round68-deceiver-review.json>)提出先触身体消费弹体的候选；缺旧实际枪口/轨迹，不能当因果结论。
[现单发用例](<../tests/e2e/deceiver-art.spec.ts#L81-L149>)只改公共观测/普通输入；[native helper](<../tests/e2e/deceiver-native.ts>)每帧clearRect再同帧复制/测量/PNG，Q就绪避出生阶段，仍单次有界跳跃、唯一20ms请求点击。
保留5/8px原宽度、heroY<245、击破日志、紫色与核心完全归零；加近顶点样本、实际hold小于185ms和有界移动弹体对。先await自建公共proof handle的监听ACK，再点击；它不是World handle，也不表示900ms录制已完成。
[当前只读复核](<../artifacts/verification/r44-round69-deceiver-review.json>)确认清理/附件错误不再掩盖主失败、透明旧帧不积累，两P2闭合。色均值不是物理枪口、候选弹体不是私有ID穷尽计数，浏览器时钟不是Core标定。
R69第一次定向4/5、EXIT1/36.400s保留：原5/8击破/消失都过，新5px监听漏down；修ACK竞态而非删证据。lint01未用变量与type03无AggregateError也保留，修复未升级ES2020配置。
独立重复的594张PNG/20负控仅是定向复核。[重复序号说明](<../artifacts/verification/r44-r69-repeat-index-note.json>)明确report未给repeatEachIndex；decoder的默认0不能当实测序号，重复由CLI、两标题各五结果及十个不同开始时间证明。

## 菜单优先级与仍未完成

本次完整运行四种休息室视口都通过，但[三视口只读复评](<../artifacts/verification/r44-round69-rest-menu-visual-review.json>)仍指出方框/重复文字密、七遗物同一十字、过载绿条语义冲突。本轮没有改菜单样式，功能过关不是美学完成。
下一项玩家可感知切片优先给七遗物按稳定id建立不同形状图标，列表/详情复用，未知id回退；不动交易/库存顺序/上下文算法/存档/冻结/focus和固定footer。后续再弱化重复层级、修正告警色；图标本身不等于整套表单感已解决。

- R67 native01的0/3/29.399s、native02的1/3/37.462s、native03的1/3/30.452s分别涉及暂停accessible name、被省略长日志、已有Q退出180ms闪烁，首红全部保留；同一生产实现没有为它们改规则。
- 同轮成绩4业务通过；可用观测约855.9/670.5/675.1/662.3ms不是Node门标定，旧5秒门保留，不称生产启动根因已修。
- Loom三阶段通关/清场，但drain54、有效支撑44、箭头0/A0，主动防御实机覆盖仍开。
- 天花板、其它形态、cap6/精确deadline仍主要Core/投影证据；不是全形态原生覆盖。
- 音频两P3、人工试听/完整声景、Safety Fence实体可选路、局外成长、多设备、性能、安全、授权和连续五章/三结局证据等全GDD缺项继续。
