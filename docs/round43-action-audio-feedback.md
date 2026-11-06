# R43：动作音频与回归修复（单次完整205已准入）

## 当前状态：目标回合66（单次完整205已准入）

**新的单次完整205/205通过，实际EXIT0/1671.267s，零跳过、重试或报告flaky；不是定向拼接。** R43本增量正式准入，完整GDD目标仍未完成。

- [严格准入结果](</Users/ocean/code/pdoom/artifacts/verification/r43-full-02-validated.json>)绑定本轮完整报告、逐例唯一通过、原205身份与旧202子集、546冻结及当前6296单元/99文件和type/lint/build。运行中没有改源码、文档、单例时限或过滤用例；原45分钟全局预算保持。
- 本轮没有再改生产代码；正式覆盖R62成功Shift/E提示、R64独立depth4 Boss血条及后续普通观测/控制修正。Core/API/v1/原生资产/菜单规则保持，不把R43描述成只有最初3个音频文件变化。
- [全新C后端23](</Users/ocean/code/pdoom/artifacts/verification/r43c-backend-tests-metrics.json>)实际EXIT0/17.425s，未复用A/B数据。完整浏览器退出后API/PG组均消失、PG正常关闭、8081/55439释放，原8080与pointer保留；[清理记录](</Users/ocean/code/pdoom/artifacts/verification/r43c-services-cleanup.json>)和78旧PNG字节/mtime还原已核。
- [同轮音频审计](</Users/ocean/code/pdoom/artifacts/verification/r43-full-02-audio-proof.json>)覆盖3例、4个44.1/48kHz原生PCM16 WAV、真实SFX和生命周期。实际冲刺112px，E覆盖36/36正控与0负控；机器波形不冒充人工试听。两键/单cue的唯一冷却归因、暂停PNG非空门这两项P3仍开。
- 同轮三模式镜头、13帧治疗全帧阴性、Loom真实弱点/伤害/13帧冻结及重试已重审。结局16例20PNG做了1835008场景像素与66096含透明孔洞clip像素的零容差复核，绑定本轮结果，不引用旧full01中的通过子集。
- [成绩与Loom诊断](</Users/ocean/code/pdoom/artifacts/verification/r43-full-02-diagnostics.json>)：成绩4例均走完真实业务；原5秒门不变，浏览器按钮可用观察约672.8/705.1/672.5/690.0ms，每例44资产项。只说明本轮通过，仍不宣称旧启动失败根因已修、零仪器开销或Node时钟已校准。
- 同轮Loom普通战斗有3次真实左转、174帧，阶段2/3闭壳HP floor、阶段3伤害、六项零残留与进入第五章均过。55条drain观察中44条是唯一受支撑角色，但0箭头/0防御A；**主动防吸力分支仍未实机触发，不把胜利说成A救命。** 历史帧策略回放不替代闭环证据。
- [Lead实看7图](</Users/ocean/code/pdoom/artifacts/verification/r43-full-02-visual-review.json>)包含休息室1440×900、1280×720、390×844、844×500。底部继续/返回可见，列表与构筑区局部滚动，标题/短状态与主体分区清楚；同轮原生wheel/Tab覆盖13项选择、固定操作命中、存档不误改及真实继续。另看动作/透视与Loom阶段3，非冷评或听音。
- 新验收绑定脚本经已有上下文只读审查，显式检查非空脚本清单、C同库、各类漂移字段与本轮附件来源。旧整轮198/7、R64定向7/1和R65首个Loom0/1等红样本原样保留，没有修改旧actual0守卫或失败历史。

下一步从验证稳定性回到玩家可感知内容：优先把已有Q吸收的类型免疫/暴击充能做成清楚、短促的角色旁反馈，再考虑第一章实体风险护栏与第一/二章原创声景。完整GDD、连续新局五章三结局证据、听感、可访问性/性能/安全等仍开。

## 回合65定向记录（历史）

**R43仍未整轮准入；最新完整仍是R63的198通过/7失败，R42仍是最近正式完整通过。** 本轮是两个独立定向结果，不是新的205整轮，也没有新的玩法、生产启动优化或原生素材改动。

- 成绩原5秒恢复enable断言与紧邻的goto保持，仅预先安装测试专用的公共DOM/Performance观察器，原断言之后才采集。不加前置RPC/等待、不提前ready，不读存储/凭据/表单，不钩网络或替换时钟；限量、退出清理和后置诊断1000ms上限有18项接口替身测试。
- [新独占后端23](</Users/ocean/code/pdoom/artifacts/verification/r43b-backend-tests-metrics.json>)实际EXIT0/16.976s；[成绩4例](</Users/ocean/code/pdoom/artifacts/verification/r43-r65-score-native-01-metrics.json>)实际4/4、EXIT0/33.053s，原登录/丢响应幂等、真实401、真实409、10秒超时业务均到达并通过，无skip/retry/flaky。
- [浏览器时序](</Users/ocean/code/pdoom/artifacts/verification/r43-r65-score-startup-summary-02.json>)每例保留44个/game资源项；按钮可用观察值约3067/659/647/658ms。它们是浏览器时钟，不是Node断言起点；采样累计0.3–0.7ms不涵盖全部仪器开销。旧3次启动失败本次未复现，不能宣称生产延迟根因已修。
- R64的Loom旧184帧已原样解码：第131→132帧由阶段2弱点跨HP floor提早闭壳进入阶段3；第166帧出现吸力，第181–183帧在1600ms弹幕耗尽窗口末段离台，早于文件写入和下一stager。浏览器capture.at与Node sampledAt不混算。
- 普通控制现在在原1600ms原生录像期间按像素反馈A制动；2500ms射击、原24..34/heldA/同帧箭头≥80/支撑/100步以及原穿线、HP与源图门均保留。仅防御观察使用人物尺寸连通体，拒绝子弹/多个候选/闪烁；不会把未知当站稳。金线覆盖的1–2像素只在防御支撑观察中合并，原stager不变。
- [184旧帧及2个合成阴性](</Users/ocean/code/pdoom/artifacts/verification/r43-r65-loom-decoder-02.json>)验证实际解码器；[策略回放](</Users/ocean/code/pdoom/artifacts/verification/r43-r65-loom-policy-replay.json>)在旧第170帧会请求A，早于第181帧离台，并拒绝无箭头、无支撑或无平台这3种情况。**这是开放式历史回放，不是按键改变后续帧的闭环存活证明。**
- 新Loom native01实际0/1、EXIT1/40.675s：角色已真实通关，但本轮新增的“必须用过防御A”检查失败。三个等待窗都没有吸力箭头，因此不按A才正确。该失败保全；仅纠正这个新检查为“确实见过支撑角色，且任何防御输入都须有当前支撑/箭头/唯一角色”，没有删除旧R64断言。
- [Loom native02](</Users/ocean/code/pdoom/artifacts/verification/r43-r65-loom-native-02-summary.json>)实际1/1、EXIT0/42.053s，无skip/retry/flaky。3次真实左转、175帧，闭壳280/140 floor、阶段3真实伤害、清场零残留与进入第五章均通过；Score原82、Loom原272个expect调用节点全部保留，见[审计](</Users/ocean/code/pdoom/artifacts/verification/r43-r65-controls-assertion-audit-02.json>)，不冒充354条独立断言。
- **主动防吸力实机覆盖仍开：**本次55条drain观察中44条有支撑，但吸力箭头和防御A样本均为0；不把本次胜利归因于尚未触发的控制分支。后续整轮继续记录，必要时增加独立、普通输入构造的困难情形，不强迫无危险时乱按键。
- 当前全单元6296/99；本轮仅改两份浏览器用例、新增观察器及其18项单测。最初未安装的jsdom与替身/类型错误记录保留，未安装依赖；最终采用明确的Node接口替身，不冒充原生DOM性能验证。R64血条生产修复保持。
- 两次单例和成绩执行的546冻结均零漂移；78旧图bytes/mtime、pointer与原8080保持。B独占API/PG已关闭、组消失、端口释放，数据目录保留但退休。Lead实看旧离台帧、新通关页、阶段3伤害及第五章，不称冷评或试听。

下一步带当前观察器执行新标签、新冻结、新独占后端的单次完整205，按整轮实际结果决定是否准入；不放松旧full01的actual0守卫。防吸力覆盖限制、两项音频P3及全GDD缺项继续记录。

## 回合64修复记录（历史）

**最近整轮仍是198通过/7失败，R43未准入，R42仍是最近完整通过。** 本轮没有重跑整轮，也没有重跑后端；下面是新的定向证据，不得拼接成完整205。

- 真实层级冲突已修：Boss血条与晚创建的Clawd原本同为depth3；现在仅血条进入独立depth4视图层。原64×4尺寸、颜色、HP比例、镜像安全边缘不变，危险提示/演员/Core/API/原生资产不改；逐帧清除和销毁接线保留。
- 新投影合同先在旧生产代码首红：15例中10通过/5失败。新增23项单测，包含实际WorldRenderer只读投影与HP层生命周期；全单元6278/98、types/lint/build通过。替身测试不冒充GPU像素验证。
- [第一次定向](</Users/ocean/code/pdoom/artifacts/verification/r43-repair-hud-native-01-metrics.json>)保持原Gato/Mirror浏览器源码不变，实际2/5通过、3失败、EXIT1/180.904s。实看Gato阶段2和Mirror compact已经死亡，不能把它们仍归因于血条不可见；失败全部保留。
- 改正有证据的普通观测/控制：Gato用既有rAF内的640原生帧，避免战斗中反复处理放大CSS截图；不再由HP不可见推断胜利，原1500ms胜利断言移到有限循环之后。Mirror采样实际运动后以普通Escape冻结昂贵像素分析，再正常恢复其实际持有的键，不改采样窗或源匹配条件。
- Sydney保留最多14次真实跳跃，但补最后动作后的观察；gap43的未落稳状态只做中立着陆观察，原45..65、idle0、无HP与提示门不变。Loom活动箭头期间更早反向制动，仍要求原24..34、heldA、同帧箭头/支撑及100步上限。
- [新的8例定向](</Users/ocean/code/pdoom/artifacts/verification/r43-repair-controls-native-01-summary.json>)实际**7通过/1失败、EXIT1/400.776s**，无跳过/重试/flaky。Gato2、Mirror3、Sydney2通过；Gato实际胜利后HP34、29发射击、Q1、7条字幕，不伪造吸收效果。四份用例原654个expect调用节点均保留，见[AST审计](</Users/ocean/code/pdoom/artifacts/verification/r43-repair-assertion-audit-02.json>)；不是654条独立断言，也不能仅凭AST证明语义。
- 本次Loom失败调用开始时，实际角色已无支撑，gap125/131、脚底347/359，后续丢失可见角色并死亡；与旧整轮gap38继续D的轨迹不同。继续核对2.5秒射击、1.6秒弹幕耗尽及观测期间的真实站位，不能据此宣称Loom已修好或改血量/几何/超时。
- [两项只读诊断](</Users/ocean/code/pdoom/artifacts/verification/r43-repair-readonly-findings.json>)已完成，均为已有上下文代理、无写入/执行。成绩3例仍只证明启动5秒门失败，未进入401/409/10秒业务；Playwright旧not-found日志可能在随后disabled采样时残留，不能推断按钮被移除。
- [原trace启动补证](</Users/ocean/code/pdoom/artifacts/verification/r43-repair-score-resource-interpretation.json>)包含每例44项资产记录；HAR接收时间不等于准确的浏览器就绪时刻，不据此归因网络/CPU/GPU。成绩源码未改，下一步加纯观察型DOM/资源时间记录；不挪5秒门起点、不加sleep/networkidle或提前ready。
- Lead实看Gato提示层、Mirror左右边缘、Sydney真实未激活姿态以及失败画面；不称视觉冷评或人工试听。544文件在两次定向执行中无漂移；78旧PNG字节/mtime、用户pointer与资源保持，8080前端保留，无新API/PG服务。

下一步先完成Loom普通控制与成绩启动诊断，再满足前置后使用新标签、新独占后端执行单次完整205。旧full01的失败和从未执行的准入脚本保持，不能放松actual0守卫。音频两项P3覆盖限制与全GDD缺项仍开。

## 回合63整轮记录（历史）

新单次完整205已经执行：**198通过、7失败，实际EXIT1/1806.969s；零跳过、重试、报告flaky，也不是中断**。R43尚未正式全量准入；最近完整通过仍为R42。不能将新音频通过或旧7/21定向结果拼成全绿。

- [完整失败记录](</Users/ocean/code/pdoom/artifacts/verification/r43-full-01-failed-summary.json>)保留全部7例、截图和trace：Gato终局判断1、Loom普通左转站位1、成绩用例启动准备3、Sydney普通跳跃/入场准备2。
- 新3音频用例和4个安全休息室视口用例在这一单次整轮中通过。Lead实际查看本轮桌面1440×900、竖屏390×844、矮屏844×500休息室截图：底部继续按钮保留，列表局部滚动；不把这三张实看称为独立冷评或全项目通过。
- 新独占后端23/23、实际0/16.932s；全单元6255/97及types/lint/build此前通过。本轮没有修改生产或测试源码，542文件在执行和清理中零漂移。
- [自有服务清理](</Users/ocean/code/pdoom/artifacts/verification/r43a-services-cleanup.json>)确认API/PG组消失、PG正常关闭、8081/55439释放；旧78PNG字节/mtime、资源和用户pointer保持，原3756前端8080保留。所有失败输出保留，不重用这次数据目录或输出标签。

### 已核实的线索与未决定事项

Gato实际trace末帧的hp组件为空，但hero与cassette仍非空；实看该输入PNG有完整场景、活Boss，Clawd处于Boss血条区域前方。当前用例把hp不可见直接当成即将胜利，这一推断不成立；仍须区分遮挡/绘制层级与其他观测条件，**不把它草率归因于空白帧、血量归零或音效代码**。详见[实际观测输入](</Users/ocean/code/pdoom/artifacts/verification/r43-full-01-gato-anchor-observations.json>)。

三项成绩失败发生在恢复检查点的5秒准备断言，尚未进入对应401/409/超时业务验证；失败后的页面快照显示恢复按钮可用。Loom及Sydney仍需结合真实移动轨迹诊断，未证实是生产回归还是普通输入准备问题。没有改血量、碰撞、位移阈值或时限，也没有随意重跑至偶然通过。

[已有上下文代码复核](</Users/ocean/code/pdoom/artifacts/verification/r43-code-review.json>)未发现R43音频新增生产逻辑的必修问题；不等于整个游戏无问题。两项可选P3仍公开：两键一次cue不能唯一证明第二键冷却拒绝；新音频暂停PNG相等性没有显式非空/非恒色门。修正rAF采样不等于能拒绝所有空白帧。无人工试听/视觉冷评。

下一步：先复现并修复7项失败的真实原因，保留旧断言与用户规则，再用新标签、新独占后端跑新的单次完整205。预先准备的full01准入脚本因实际EXIT1**没有执行**，不得放松其全绿守卫。完整GDD仍未完成。

## 回合62阶段记录（历史）

以下保留当时的定向结果；“完整205未执行”仅指当时，不能误读为本轮状态。

状态：目标回合62。代码与定向验证已完成，**新单次完整205浏览器尚未执行，R43尚不替代R42的全量准入记录**。全GDD仍未完成。

## 实际变化

- 只改三个运行时代码文件：[音频快照](</Users/ocean/code/pdoom/src/pages/GamePage/game/audio/types.ts>)、[纯音效规划](</Users/ocean/code/pdoom/src/pages/GamePage/game/audio/score.ts>)、[Scene投影](</Users/ocean/code/pdoom/src/pages/GamePage/game/scenes/WorldScene.ts>)。
- Shift成功冲刺：95ms下滑三角波加60ms短噪声；E成功透视：180/140ms上行双音。原创程序化合成，不引用原曲、人声或外部音频。
- 读取已有save.actionCounts.dashes/insights，不从键按下猜成功。冷却中按键不触发；大计数跳变合并；首帧、暂停恢复、换章、新局和计数回退不补播。
- 同一采样帧若急转弯已经成功，保留更强的turn提示，不叠加dash提示；不同帧的实际动作不被伪装成同帧事件。
- 仍使用原SFX总线、24总声部/16音乐声部上限、手势解锁、静音/音量、暂停和销毁机制。吞掉音乐不吞SFX；未改四stem旋律、Core规则、相机、API/v1或原生图片。

## 已执行的证据

- 先在旧生产代码上运行新合同：22例中4通过、18失败，确实捕获缺失计数投影/提示/回退语义，见[首红](</Users/ocean/code/pdoom/artifacts/verification/r43-action-red-summary.json>)。
- 新增37个规划、AudioSystem生命周期与Scene边界单测；最新全单元**6255/97文件、实际0**。结构替身不冒充真实DSP或玩家操作。
- types、lint、生产build均实际0；[unit](</Users/ocean/code/pdoom/artifacts/verification/r43-unit-02-metrics.json>)、[types](</Users/ocean/code/pdoom/artifacts/verification/r43-types-04-metrics.json>)、[lint](</Users/ocean/code/pdoom/artifacts/verification/r43-lint-04-metrics.json>)、[build](</Users/ocean/code/pdoom/artifacts/verification/r43-build-01-metrics.json>)。
- 三份旧音频测试只补两个0值字段，其他全部字节（含原断言与名称）不变，见[旧夹具审计](</Users/ocean/code/pdoom/artifacts/verification/r43-old-audio-fixture-audit.json>)。当前collect205，原202文件/名称对保留；collect不等于执行。
- 新3例与旧4例一起**7/7，实际0/22.495s**；同一源码再三次重复**21/21，实际0/60.352s**，均零skip/retry/flaky、541冻结文件无漂移，不拼作完整205。见[7例](</Users/ocean/code/pdoom/artifacts/verification/r43-native-audio-03-metrics.json>)、[21例](</Users/ocean/code/pdoom/artifacts/verification/r43-native-audio-04-metrics.json>)。
- 44.1kHz/48kHz实际OfflineAudioContext渲染：两cue都在四音乐stem为0时有PCM，静音/零音量/无cue阴性为0；两次独立渲染数组一致，两cue波形不相同。48kHz/默认0.5音量的PCM峰值分别0.0380164/0.0340005，非LUFS或真实设备响度测量。
- 普通键鼠实际新局：两次快速Shift只有一次cue并发生真实位移；两次E只有一次cue，画布出现原有绿色透视遮罩。无私有World读写、时钟/血量/位置/冷却setter或测试桥。原生API观察器只追加无输出的SFX分析支路，不注入声音。
- 真实暂停画布逐字节冻结、Context挂起；暂停期间按键与恢复不补播；静音新局仍有实际冲刺位移和E遮罩，解除静音不重放旧动作；下一次有效冲刺恢复发声，始终一个Context。
- 透视可见证据在普通与静音新局均36/36背景采样符合既有27%遮罩（RGB容差2），原帧阴性0/36；这是36点采样，不是全画面逐像素验收。原HUD刻意省略历史E通知，测试不添加文字来假造反馈。

## 首次浏览器失败与修正

[首次定向](</Users/ocean/code/pdoom/artifacts/verification/r43-native-audio-02-metrics.json>)为6通过/1失败，实际1。新画布观察器在渲染回调外读取，15次结果都是640×360的230400个不透明黑像素；不是英雄消失或透明图。改为既有Loom观察器采用的requestAnimationFrame内读取，保留原>80英雄色像素、位移与时限条件。暂停正控同样改用实际渲染帧，不能以两张清空帧冒充冻结。错误诊断中曾将黑图写成透明，已明确纠正并保留说明。

## 可打开的真实输出与边界

- [冲刺PCM试听，48kHz](</Users/ocean/code/pdoom/artifacts/verification/r43-native-03-extracted/01-dash-48000-actual-native-pcm.wav>)；[透视PCM试听，48kHz](</Users/ocean/code/pdoom/artifacts/verification/r43-native-03-extracted/01-insight-48000-actual-native-pcm.wav>)。这是测试实际渲染的半秒片段，不是另一个未接线素材版本。
- Lead实际查看[冲刺前](</Users/ocean/code/pdoom/artifacts/verification/r43-native-03-extracted/02-before-ordinary-dash.png>)、[冲刺后](</Users/ocean/code/pdoom/artifacts/verification/r43-native-03-extracted/02-after-ordinary-dash.png>)与[透视帧](</Users/ocean/code/pdoom/artifacts/verification/r43-native-03-extracted/02-ordinary-insight-green-veil.png>)。无新美术；不是冷评、人工试听或独立审查。只读子任务54f031d6启动后product-error且无结果，没有把它算作审查。
- 78历史PNG字节/mtime、用户数据库pointer与原有资源保持；本轮没有启动后端/PG，也没有把R42后端23称为R43结果。原8080前端保留。
- 下一步：在最新文档后快照上执行新单次完整205与独占后端验证，再决定R43正式准入。完整章别声景、吸收/暴击与环境反馈、最终混音、耳机/扬声器试听、低端性能与全GDD仍待完成。
