# 全量 GDD 开发进度

本文件记录跨轮次事实。**目标未完成**，五章核心规则与结局接通也不能代替完整美术、声景、程序化内容和最终体验。

## 当前：R49 / 回合92（原10首跑7/3，停止后位移仍需修订）

> 回合92：原10仅执行一次，**7通过/3失败、CLI1/94.933s，不准入且未重跑**。三处go最终8px门拒绝；11个waypoint阶段的导航均真实paused-final/lag0，10个停止帧后仍沿输入方向移动11–22px。254原PNG/11准备trace/53源点声明核对及6图实看仅用于诊断；无生产/UI改动，完整216与全GDD仍未完成。

## 回合92：一次原10拒绝，准备停止不等于最终到位

- [207预审](<../artifacts/verification/r49-r92-pickup-review207-pre-run.json>)纠正owner启动后标记异常未收束、预存report覆盖、审计允许keyup复用/未核完成、准备proof自报与收益/store来源缺口；[v3绑定](<../artifacts/verification/r49-r92-pickup-candidate-bindings-v3.json>)后才运行。独占private目录写report、xb发布；原case180000/单步1500/3次/18及8或4/200/180/450不增。外层清理裕度不是额外游戏预算。
- [一次实际CLI](<../artifacts/verification/r49-r92-pickup-native-01-metrics.json>)7expected/3unexpected/0skipped/0flaky、94.9327s；[外部wait](<../artifacts/verification/r49-r92-pickup-native-01-owner-actual-exit.json>)与独立owner均1，无guard/异常/源漂移。[严格门实际1](<../artifacts/verification/r49-r92-pickup-native-01-scope-audit.log>)在ownerActual1拒绝，没有scope-proof，不把后续离线诊断改称准入。Chrome实际156.0.8078.80，旧scope为.74；未安装/升级，保原path/SwiftShader，不称same binary或性能归因。
- 主C1已越过本次firstToken210，但目标520三次最终位置为529→505→538（停止帧518→527→524），最后+18；不是旧210欠走复述。heal在初始480时partial到353，再507→470，最后−10，尚未到1344、heal收益、清敌shoot和旧caption参考故障点。menu/newrun在前置210时220→189→226，最后+16，尚未真正进入菜单/新训练验收，不能归咎菜单UI。
- [254原PNG重算](<../artifacts/verification/r49-r92-pickup-failure-diagnosis.log>)与[11完整准备proof/实际按键](<../artifacts/verification/r49-r92-pickup-failure-trace-proof.json>)一致：244原raw与10stop的SHA/at/HUD等完整元组来自对应case真实trace响应；释放完成、已启动observer/cancel结束均早于原180 acquire。仅诊断失败，未执行成功分支的全scope replay，也没有因此接受7个pass为新scope。
- [当前时线](<../artifacts/verification/r49-r92-pickup-failure-timeline.json>)11个waypoint阶段的chosenIndex等于真实pausedFinal、lag0；10个stop后沿输入方向再移11–22px，不是借旧200ms帧补资格。多数keyup API为0.46–1.75ms，deadline段23.4ms。metadata RAF可见116.6–133.4ms间隔；heal第二段21条中10条hero/worldX空，但这些早期RGBA未保存。不能把跨时钟时刻相减，也未分别证明惯性、渲染顺序、CPU/GPU或readback贡献。
- [独立PIL53源点声明](<../artifacts/verification/r49-r92-pickup-failure-literal-pixels.json>)核11final的hero/items和10stop的hero/ref；此诊断的地形仍用冻结Node判断器，不冒称独立。[Lead实看6图](<../artifacts/verification/r49-r92-pickup-visual-review.json>)：橙色Clawd、亮色token/紫色compute与台阶可辨；相机滚动下不以肉眼屏幕x替代世界定位，绿色鸟形对象不当主角。HUD/store依据另在DOM/trace，非仅凭canvas。
- 保护项581源/78旧图bytes+mtime/pointer/Vite3756保持，8081/55439空，自有进程已结束，旧图未回写。源码仍是R91候选，**本轮无产品、菜单或规则改动**。下一轮据真实停止后位移设计原预算内的近点制动/观察修订，先有合同/冻结/实际审查；不扩8/4、200、3次、18步或1500，不私读World/修改Core、renderer或clock，不偷偷加等待/脉冲。
- 原两失败未关闭，本轮第三个menu前置失败同样保留；旧heal后shoot故障点本轮未到达。原R49全171/11/34与正式R44不变，24未覆盖skipped不扣减，不将7通过或旧scope相加成216。全GDD/Fence/连续同runIdseed五章/自然中高Doom仍待。

## 回合91（保留历史）

> 回合91：已接入获单独授权的go公开位置反馈；原1500ms/3次/总18步、最终8或4px、200ms门保留。180合同（原40+新增140）、6976单元/111、type/lint/build通过，581源；263旧PNG×5参考共1315比较一致。**本轮无native，两条旧失败仍未关闭**，无生产/UI改版，不拼216。

## 回合91：路点改用当前公开原生位置反馈，保原最终门

- [独立授权](<../artifacts/verification/r49-r90-pickup-input-authorization.json>)下，仅go非跳跃推进进入新[普通方向协调器](<../tests/e2e/pickup-controls.ts>)：down前Node1500ms截止，扣down延迟；当前完整同帧英雄/唯一参考/至少4地形才计算x，进入或越过停止带便松键。180尾窗、真实暂停与200ms导航及最终8/4px仍决定到位；超时仅部分推进，用剩余原3次机会，不新增动作或藏微脉冲。
- 已核真实拾取先于rest：allowRest允许参考被正常拾取后同stage继续至真实rest或截止，不缓存旧坐标补成功。非rest仍需原导航，allowRest=false也不拿rest冒充到位；不新增feet320条件。原jump/travel、短pulse、450验收、伤害/HP增益/消失/存档断言不改。实际时长与采集准备改变，非timing等价，也不承诺IPC迟滞下物理硬1500ms或最终必达。
- 持键只读raw、逐帧清空scratch；准备证明与原验收captures分开，仅position/passed/rest触发帧保存PNG，budget/cancel只有metadata，不声称完整持键录像。释放→原180尾窗采raw→真实pause/final raw→编码，Node晚到结果不算资格。所有已启动的输入/观测清理收束后才进入正常尾窗，失败不冒充partial；正常只一对方向down/up，晚到down额外up仅清理。
- 首次unit01为6915通过/36失败：[实际44姿态诊断](<../artifacts/verification/r49-r91-pickup-hero-aliases-02.json>)定位低分1px别名，改为原ratio/matched排序、仅最佳分异位拒绝；阈值未放宽。[原PNG与新raw比对](<../artifacts/verification/r49-r91-pickup-raw-png-parity-02.json>)263×5全部相同，只是历史定位一致性，非新浏览器时序或可见性证明。
- 206审查发现并修复[同步取消后仍追加](<../artifacts/verification/r49-r91-pickup-review206-phase-correction.json>)与[新附件失败截断旧证据](<../artifacts/verification/r49-r91-pickup-review206-aftereach-correction.json>)：read/inspect/clock后复核phase，真实falsy错误仍暴露；原afterEach主体先执行，新增准备附件作为后置cleanup逐项尝试。没有把原keyup/旧raw内部串行语义宣传成全面独立清理。
- [180合同](<../tests/rendering/pickupControls.test.ts>)含原40与新增140，覆盖真实控制函数、44原始姿态、左右/4/8/越带、源码抽取的go/action/afterEach、默认DOM reader及序列化。受控端口/fake canvas与encoder不是native codec/DOM/性能证明。types05/06的[unknown](<../artifacts/verification/r49-r91-pickup-types05-correction.json>)/[ES2020 cause](<../artifacts/verification/r49-r91-pickup-types06-correction.json>)首错保留，修为运行时守卫，不改配置。
- [AST05](<../artifacts/verification/r49-r91-pickup-ast-05.log>)保原210expect/105最大链、6browser/14input/13timer/6case模板、14window/5grab/15one及R90三个采集函数；[允许差异](<../artifacts/verification/r49-r91-pickup-spec-allowance-v2.json>)限定go/adapter/记录。新helper及实际运行分支变化，不能宣全browser调用/时序等价。[原10/216身份](<../artifacts/verification/r49-r91-pickup-collection-audit.json>)一致，[最终绑定](<../artifacts/verification/r49-r91-pickup-candidate-bindings-v4.json>)全门actual0。
- 581源仅3测试相关实现变化；生产/UI/资产/engine/配置/backend不改。保原78图bytes/mtime、pointer与Vite3756。**无R91新浏览器执行**；下一轮先核权威与独立审查，再一次原10并核新准备证明/原像素门。两旧失败与24未覆盖skipped不关闭，正式R44及R49原171/11/34保留，各scope不拼216，全GDD/Fence/连续同runIdseed五章/自然中高Doom仍待。

## 回合90（保留历史）

> 回合90：复核263张旧拾取PNG与trace，定位路点欠走、活参考遮挡/过期。仅shoot180改为raw→真实暂停→final raw→统一编码；40合同、6836单元/111与type/lint/build通过，581源。**本轮无native，go仍待，两条旧失败不关闭**。无生产/UI改版，完整回归未准入。

## 回合90：定位拾取两失败，先修订射击后导航采集

- [原版本追溯](<../artifacts/verification/r49-r90-pickup-old-source-provenance.json>)确认两trace中的原spec、pickup判断器逐字相同；heal清敌协议也相同。[真实helper解码](<../artifacts/verification/r49-r90-pickup-offline-metrics.json>)actual0，263帧逐一比对原manifest与trace返回PNG的SHA。
- [输入/资格时线](<../artifacts/verification/r49-r90-pickup-window-diagnosis.json>)确认72→125→177→192，目标210；三次都是当前完整paused-final、lag0、HP100。请求726/447/174ms，down开始至up结束为797.889/476.240/189.572ms；是欠走，不是过冲/旧帧反馈，也没有GPU因果结论。
- heal已成功，失败在repeater2第三400ms射击后。227–229与final230都完整hero/地形，items为1/1/1/0；前三帧距final为633.3/483.3/383.3ms，只有230在200ms内。旧帧TOKENS134，final140，不能拼接旧参考与新奖励。
- [源点差异](<../artifacts/verification/r49-r90-pickup-item-pixel-differences.json>)显示compute176点中66点被#da91ca替换，最佳仅110/176；[14×6组件轨迹](<../artifacts/verification/r49-r90-pickup-caption-components.json>)与生产caption颜色/形状相符。Lead[实看3张唯一旧native](<../artifacts/verification/r49-r90-pickup-visual-review.json>)，不指认私有弹体身份或把afterEach图当先前资格。
- 用户[单独批准pickup策略](<../artifacts/verification/r49-r90-pickup-input-authorization.json>)：单次1500ms、路点3次/C1总18步、8px/200ms、180/450ms窗及180秒用例上限不增，不加等待/重试。实际时序会变，非输入等价，也非继承Omega5秒授权。
- 本轮仅[shoot导航采集](<../tests/e2e/pickup-controls.ts>)按原180ms/32ms节律复制同帧RGBA/HUD，停采集→原freeze可见守卫→真正post-pause final raw→统一编码两批PNG。原at不改，活动路径不搬整批RGBA；原450与其余窗口不变。go未改，不承诺已消除383ms间隙。
- [205实际审查](<../artifacts/verification/r49-r90-pickup-review205.json>)发现v1复用scratch可能残留旧透明像素，已补clearRect及默认reader合同，旧候选保留。[40合同](<../tests/rendering/pickupControls.test.ts>)验证真实控制函数，但fake canvas/encoder不是native codec/DOM证明。初types01的[TS2345及显式undefined修复](<../artifacts/verification/r49-r90-pickup-types01-correction.json>)保留，不称一路绿。
- [AST02](<../artifacts/verification/r49-r90-pickup-ast-02.log>)保原210expect/105最大链、原spec6browser/14input/13timers/6case模板及grab/one/keep；只加import、替换shoot180、一次retain。新helper有新browser操作，非全部调用等价。[10/216身份](<../artifacts/verification/r49-r90-pickup-collection-audit-v2.json>)保持，[v2绑定](<../artifacts/verification/r49-r90-pickup-candidate-bindings-v2.json>)全部静态门实际0。
- 205 completed3只准有限代码/静态，零执行/写/独立SHA复算；204继续实现已授权go，保3次/1500/18与最终8px，不把限时partial-progress算成功。两条旧失败、单整轮216仍待；原R49全171/11/34、正式R44不变，不拼scope。无backend/资产/engine/生产/菜单改动，全GDD仍未完成。

> 回合89：Omega原11项**11/11 EXIT0/89.841s**，独立owner与严格范围审计均0，535张原生PNG/7个缺列负控核对通过。6796单元/110、152项控制与Core合同及type/lint/build通过；579源，仅测试控制修订，没有生产/UI改版，完整回归仍未准入。

## 回合89：按实际Core提前起跳，投影与揭示各用当前可见锚点

- [真实Core探针](<../artifacts/verification/r49-r89-omega-core-selected-band.json>)逐60Hz调用生产movePlayer/stepWorld：56..72范围1632组合全部落至对岸，首落42tick，最小右侧重叠约3px；16条普通D自然路线也通过，最低HP85。75/低vx与81/热跑失败负控保留。它验证所测模型/偏移，不承诺任意wall延迟或原生可见性。
- [准备控制](<../tests/e2e/omega-controls.ts>)改用56..72起跳带；进入96px接近区后锁存危险标记，当前角色/脚底/完整60px地段不可判便保守停止，确证越带也立即失败。历史只准用于停止，不补成成功。原350/550动作及跨沟/坠落断言不变。
- 新[揭示锚点证据](<../artifacts/verification/r49-r89-omega-reveal-anchor-correction.json>)纠正202旧建议：R88中hero401起已只有完整椅子，镜框不再完整匹配。现在projection只用当前唯一mirror453；reveal只用当前唯一chair228及相对183..205，仍对应原411..433位置带；baseline继续同时验两道具。不以Ilya文本或反射结果作为准备资格，原.45/.9验收不动。
- reveal起步缺椅可以等待，进入临界区后当前角色/两种定位都不可判则停止。成功与安全监控分开；单独复制真实abortRGBA，保持selected为空，到安全清理边界才编码。原Node绝对5s、晚到拒绝、释放/取消/原采集drain后缀逐字未改。
- [152项合同](<../tests/rendering/omegaControls.test.ts>)包含原95与新增57，覆盖锚点/双演员/过渡/越带/不可判/独立abort证据及实际Core。unit01的4个read计数fixture失败[原样保留](<../artifacts/verification/r49-r89-omega-unit01-fixture-correction.json>)；只修遗漏计数，仍要求两次read且stale callback不得补读，最终6796/110全过。2048帧cap仍未单独触发测试。
- [AST](<../artifacts/verification/r49-r89-omega-ast-01.log>)保原166全部expect/83最大链、4browser/6标题表达式、全部原测量/像素调用；自R88的全部case正文和Node协调器逐字不改，其余576文件保留。[11/216身份](<../artifacts/verification/r49-r89-omega-collection-audit.json>)一致，[203实际审查](<../artifacts/verification/r49-r89-omega-review203.json>)只准代码/静态。原120秒与测量窗不动，但准备策略/时长已授权变化，非timing等价。
- [原11单CLI](<../artifacts/verification/r49-r89-omega-native-01-metrics.json>)actual0/89.840860583s，[独立owner](<../artifacts/verification/r49-r89-omega-native-01-owner-result.json>)0/90.350917375s；11expected/0unexpected/skip/flaky，每项一次/0retry。没有重跑同一候选；R88的9/2与原R49失败保留。
- [严格scope](<../artifacts/verification/r49-r89-omega-native-01-scope-proof.json>)actual0，535张原生PNG独立解码、7个缺列负控：真实跳过/返向坠入60px沟、门叶、椅镜域、.45/.9反射、r5/r8扫描脚底、全屏休息室/WebGL恢复与5种资源fail-closed均保原门。
- 五段实际准备分别为2864.336/2641.365/1733.339/643.305/501.481ms；projection首资格hero325只镜453、reveal首资格hero416只椅228，均同帧完整源/feet320。它们不是拿早先姿态或DOM替代原生资格。
- Lead[实看6张原生图](<../artifacts/verification/r49-r89-omega-visual-review.json>)：对岸落脚、返向落沟、浅色反射、FOOM揭示、r8执行扫描及真实context恢复后的工作台。没有把canvasPNG说成React菜单截图，也没有本轮重绘资源。
- 原[未被范围验证覆盖的失败](<../artifacts/verification/r49-r89-omega-next-original-cases.json>)剩拾取两项：waypoint18>8与200ms内完整同帧导航缺失；另24个历史skipped仍在这些范围之外。下一步先诊断，不放宽8px/200ms门。各范围不能拼成216，正式仍R44、nextFullReady=false。
- 无生产/UI/资产/engine/config/backend更改，78旧图bytes/mtime、pointer与原Vite3756保持，所有本轮owner/CLI/Chrome/power退出。Fence176仍blocked179；连续同runId/seed五章、自然中高Doom和完整GDD继续未完成。

## 回合88（9通过2失败，保留历史）

> 回合86–88：已获授权改用≤5秒公开位置准备；Omega原11项**9通过/2失败，EXIT1/89.705s，未准入**。95项真实控制合同、6739单元/110与type/lint/build通过，579源；原测量/像素守卫保留。本轮没有生产或UI改版，正式整轮仍R44。

## 回合88：两段位置准备未通过，保留失败继续修订

- [旧trace诊断](<../artifacts/verification/r49-r87-omega-diagnosis.json>)恢复原62张nativePNG：旧CP0过沟采样时已HP0，但JPEG只证明起跳，精确落点未知；旧CP12的hero190未到screen>271投影门，镜区未变化。不是相同问题，也无CPU/GPU因果结论。
- 用户[明确授权](<../artifacts/verification/r49-r87-omega-input-budget-authorization.json>)把旧3000/2750/900/650等输入准备改成每段最多5000ms位置驱动。保原120秒用例、原采样窗口及物理像素门，**不宣预算中性或实际输入等价**。
- [实际控制](<../tests/e2e/omega-controls.ts>)从Ddown前设Node绝对截止时间，拒绝晚到资格、补释放晚到down；只读当前640×360 RGBA/公开HUD。第一资格的RGBA复制后停流，原测量与pause可见guard之后才编码/销毁；成功无多余cancel往返。原grab1200不能取消，失败先释放/取消自有observer再drain，不重开采集。
- [95项合同](<../tests/rendering/omegaControls.test.ts>)覆盖实际位置判定、两种并行结束顺序、晚到/超时、falsy多因、七键及诊断全尝试、保成功proof及延期编码。第一轮84合同通过后按[201审查](<../artifacts/verification/r49-r88-omega-review201.json>)补齐失败路径；最终6739/110全过。2048帧上限有实现，未单独触发测试。
- [AST](<../artifacts/verification/r49-r87-omega-ast-01.log>)保原166全部expect/83最大链、4browser/6title表达式、全部原measurement/pixel调用和其余576源；[收集](<../artifacts/verification/r49-r88-omega-collection-audit.json>)原11/216身份相同。201只准代码/静态，不承诺原生一定通过。
- [原11项单CLI](<../artifacts/verification/r49-r88-omega-native-01-metrics.json>)actual1/89.704982750s，[独立owner](<../artifacts/verification/r49-r88-omega-native-01-owner-result.json>)1/90.133544708s；9pass/2fail，每项一次、0retry/skip/flaky。[严格scope](<../artifacts/verification/r49-r88-omega-native-01-scope-audit-metrics.json>)actual1在owner门拒绝，未进入整范围像素核对、没有成功proof；没有第二次native。
- [新CP0失败](<../artifacts/verification/r49-r88-omega-failure-diagnosis.json>)在起跳准备，不是旧pause：216帧/188完整hero，但同帧32..56px门始终未满足；最近完整feet320从gap57跨到31，中间有feet321/floor空或hero未匹配；后一帧两可见地段还相距82而非60，不是只差1px阈值。trace没有SpaceDown，随后HP0。不能把未匹配简单叫做受伤闪隐；该空档没有归档nativePNG。
- 同批CP12已完成closed-door与room-baseline及原门叶/两道具守卫，但projection超时：**8帧**已有当前完整hero、mirror453且在325..349目标带，却因chair228全源未匹配而拒绝；继续D到演员出框/duel。原反射350/.45守卫和reveal未执行，不能声称它们已过。Q历史点可能遮挡椅腿，但中间只有裁剪JPEG与元数据，不作精确RGBA因果结论。
- [两准备PNG独立核对](<../artifacts/verification/r49-r88-omega-diagnostic-source-check.json>)只作诊断：hero424/432、门框960、椅2255及镜1025源像素零容差全匹配；Node准备2659.033/1737.665ms。Lead[实看6张唯一图](<../artifacts/verification/r49-r88-omega-visual-review.json>)：2准备nativePNG、2失败UI、2裁剪JPEG；沟前两个抽取实际上同一JPEG，不当成两个时刻的像素证明。
- 下一步先验证真实Core在原350/550动作下的可行起跳带，再修最小准备条件；投影/揭示拟只以当前完整镜框定位，不强求刚验证过的椅子逐帧无遮。仍须新合同/actual审查/新原11范围，不放宽原验收，也不改生产来迎合测试。
- 579源仅3测试相关候选，文档另3；78旧图bytes/mtime、pointer与Vite3756保持，owner/CLI/Chrome/power退出，无backend。R85镜像3、R83弱点5、R82环境2、R81Loom9、R80菜单10与R79反击5均保留，不拼成216。全GDD/Fence/连续五章/自然中高Doom仍未完成，nextFullReady=false。

## 回合85（mirror原3项通过，保留历史）

> 回合85：mirror原3项**3/3 EXIT0/99.105s**，10PNG/4像素负控与严格范围审计0；35项并行/收尾合同、6644单元/109与type/lint/build通过。577源，无生产/UI改动；不是全216准入，正式仍R44。

## 回合85：并行观察原右缘与原冲刺文字，完成后才进入左缘

- [实际helper](<../tests/e2e/mirror-controls.ts>)以两个lazy callback各启动一次，唯一allSettled等两者完成。原right10x400与原DOM冲刺expect同时进行；原5秒包含期间暂停/解析、不续期，不拿旧帧omega替代expect。成功返回原right，失败收尾后才抛，left不会提前。
- 单因原样保留含falsy；双因按观察/确认职责保原引用，并以每角色4096字符加标记提供报告诊断。formatter本身失败fallback不盖主因；有界message不等于整个cause树可安全序列化或有界。allSettled也不是外层90秒强制终结证明。
- [35项合同](<../tests/rendering/mirrorControls.test.ts>)覆盖两种结束/拒绝顺序、同步throw、finally恢复未完不能早退、falsy、真实安装版Playwright序列化正负控、长度与formatter故障。unit01两项新fixture失败保留：matcher自调用customInspect、Node已吞掉坏stack；[修正说明](<../artifacts/verification/r49-r85-mirror-unit01-fixture-correction.json>)区分真实Node行为与纯端口catch，不放宽控制门。
- [AST-v2](<../artifacts/verification/r49-r85-mirror-ast-proof-v2.json>)保原52all/26max expect、1browser/9timer/19input/2title、7函数、两旧case与left段、全部原采样/像素调用及共享源；[198只读审查](<../artifacts/verification/r49-r85-mirror-review198.json>)完成。原216/3身份均保，577清单只有3测试相关候选变化。
- [原3项单CLI](<../artifacts/verification/r49-r85-mirror-native-01-metrics.json>)actual0/99.104565083s，[独立owner](<../artifacts/verification/r49-r85-mirror-native-01-owner-result.json>)0/99.570841167s；每项一次/0retry/skip/flaky。桌面、紧凑视口与真实3dash后左缘全过，没有第二次native；旧R84的2/1与原R49失败不抹去。
- [严格scope](<../artifacts/verification/r49-r85-mirror-native-01-scope-proof.json>)actual0：10张原PNG、4个缺列负控；原生演员每个opaque像素、完整AA姓名/key、64x4血条、首资格及新attempt清旧label/bar逐项核对。冻结仍是原用例450ms前后native PNG相等断言，没有额外归档冻帧对，不能冒称独立复查该对。
- dash右/左中心620/50，源像素各546、excluded0，左帧HP100；同帧公开文字分别为预警/冲刺与执行/冲刺。两者不是同时一帧，也不宣绝对调度等价；未直接改写战斗演员位置。
- Lead[实看6图](<../artifacts/verification/r49-r85-mirror-visual-review.json>)：左右原生演员、自然居中标签、重试清旧HUD、1280x720与800x450暂停UI。左帧玩家贴画布边，不宣玩家完整32px；要求完整匹配的是镜像演员。暂停主操作均可见，但本轮不是菜单改版。
- 无生产/UI/资产/engine/config/backend变更，78旧图bytes/mtime、pointer、原Vite3756保持，owner/CLI/Chrome/power退出。先前Deceiver5、环境2、Loom9、菜单10、counter5保留，不能拼成216；全量GDD/连续五章/自然中高Doom仍未完成。
- 下一项核[Omega环境原失败](<../tests/e2e/omega-environment.spec.ts>)：旧CP0在首次计划跳跃后的pause等待失败，CP12在0.45alpha投影反射资格失败；先读原trace和同帧证据，不能猜成同一种控制问题。正式仍R44、nextFullReady=false，Fence176继续blocked179。

## 回合84（旧顺序候选2通过1失败，保留）

> 回合84：mirror原3项**2通过/1失败，EXIT1/77.927s**；右缘完整演员已采到，但随后原5秒冲刺文字确认超时，范围未准入。6622单元/109及type/lint/build通过，577源；无生产/UI改动，正式仍R44。

## 回合84：右缘采样与冲刺确认仍存在先后相位问题

- [旧trace诊断](<../artifacts/verification/r49-r84-mirror-diagnosis.json>)恢复原10窗口35帧：没有满足右缘门的样本。首批相邻帧隔66.7ms，完整Foom已到x579；原完整32px范围与右缘门交集是x594..608。旧失败在right，不是left裁字；未采到的空档保持未知，不归因CPU/GPU。
- [旧最小顺序候选快照](<../artifacts/verification/r49-r85-mirror-before--mirror-controls.ts.txt>)只做原right观察一次、原冲刺确认一次、返回同一对象；left必须在两者成功后才开始。右帧是位置/HUD基线，不宣绝对动作相位等价。没有新采样器或扩预算。
- [AST](<../artifacts/verification/r49-r84-mirror-ast-proof.json>)保原52all/26max expect、1browser/9timer/19input/2title，7函数AST相同；桌面/紧凑两case与原left输入/守卫段字节不变，共享像素helper不动。[197只读审查](<../artifacts/verification/r49-r84-mirror-review197.json>)通过仅是静态候选，不是native准入。
- [旧13项顺序合同快照](<../artifacts/verification/r49-r85-mirror-before--mirrorControls.test.ts.txt>)覆盖pending顺序、原对象、一次调用、两阶段falsy与同步throw保因。6622单元/109与type/lint/build全部0；纯合同不证明演员运动或真实学习。
- [原3项单CLI](<../artifacts/verification/r49-r84-mirror-native-01-metrics.json>)桌面/紧凑通过，dash失败；actual1/77.926895125s，[独立owner](<../artifacts/verification/r49-r84-mirror-native-01-owner-result.json>)1/78.472193583s。每项一次/0retry/skip/flaky，原216/3收集身份不变；没有第二次native，也不拼其它范围。
- [新失败追踪](<../artifacts/verification/r49-r84-mirror-failure-analysis.json>)：所选原生right为x596、中心612、546不透明像素零容差全匹配；同帧公开文字为“预警/冲刺”。该400ms批结束已显示“恢复空档”，confirm在批返回48.793ms后才开始，5001.49ms后仍未观察到冲刺。
- 因helper第二步失败，**原right HUD断言尚未执行，left阶段也未执行**；已采到右图不等于该case成功。[严格scope](<../artifacts/verification/r49-r84-mirror-native-01-scope-audit-metrics.json>)实际1，在owner失败门拒绝，未进入完整像素准入，不生成成功proof。
- Lead[当次实看2图](<../artifacts/verification/r49-r84-mirror-visual-review.json>)：完整右侧原生演员与后来的失败UI；后者处于恢复空档、HP86。另实看4张旧证据；新右图的546源像素独立核对仅是诊断，不冒充整范围审计。
- 577源本轮仅3测试相关候选与3文档变更，生产/UI/模型/资产/config不动；78旧图bytes/mtime、pointer、原Vite3756保持，owner/CLI/Chrome/power已退出。终端过长输入在执行前截断，旧pty关闭后重建并核575源未变；不覆写任何已执行证据。
- 下一步继续196：先审“原right观察与原5000ms DOM确认同时进行，双方settle后才left或传播两因”的最小方案。尚未实施；不以记录中的冲刺文字替换原expect，不放宽预算/像素门，不靠无修改重跑挑绿。Omega/拾取及GDD缺口仍待办，Fence176继续blocked179，nextFullReady=false。

## 回合83（原Deceiver5项范围通过，完整回归仍未准入）

- [单采样器](<../tests/e2e/deceiver-controls.ts>)在Space前装配且不预采；原40次/首观测900ms/第一资格不放宽。资格帧自动接下一RAF作为独立900ms shot流；原20ms click后不续期，原RGBA复制后停流再编码。
- [59项合同](<../tests/rendering/deceiverControls.test.ts>)含真实Playwright返回值序列化往返与保因；6609/108全过，type/lint/build0。[AST](<../artifacts/verification/r49-r83-deceiver-ast-proof.json>)保原100all/50max expect、5browser/2timer/7input/3title、旧3case/旧native与原像素分类；[195只读](<../artifacts/verification/r49-r83-deceiver-review195.json>)完成。
- [原5项](<../artifacts/verification/r49-r83-deceiver-native-01-metrics.json>)单CLI5/5、actual0/35.146s，独立owner0/35.592s，0retry/skip/flaky；没有第二次native，原216收集身份不变。
- 本次5/8px资格至pointerdown68.9/64.9ms，实际held39.2/34.4ms；核心宽10/16与80/208像素，首资格各380演员像素/meanY230.432。旧8px诊断248ms保留，不归因CPU/GPU或保证全量稳定。
- [范围审计v2](<../artifacts/verification/r49-r83-deceiver-native-01-scope-proof-v2.json>)0：133真PNG/4像素负控、第一资格、独立900ms、唯一移动弹与实际击破均核。[v1修订说明](<../artifacts/verification/r49-r83-deceiver-native-01-audit-format-amendment.json>)只修内嵌base64附件适配；原报告与所有守卫不变，v1 KeyError保留。
- Lead[实看6图](<../artifacts/verification/r49-r83-deceiver-visual-review.json>)：两资格帧、实际连续单弹两帧、两击破UI；不是菜单改版。575源/78旧图bytes与mtime/pointer/原Vite保全，无生产/UI/资产或backend变更。
- 下一项先核mirror HUD旧dash-right-edge未找到完整actor；不能按标题误诊为已到左边后裁切。Omega/拾取等继续；正式仍R44、nextFullReady=false，Fence176继续blocked179，完整GDD仍未完成。

## 回合82历史：原环境2项范围通过，完整回归仍未准入

- [共享准备](<../tests/e2e/environment-controls.ts>)只使用原5000ms绝对deadline：公开Q-ready、真实地面演员、单次E、当前演员与core；不分阶段重发5秒。原第一跳射/击破完整块保留，历史曝光PNG归档移出活跃窗口，不改游戏物理或伤害。
- [AST](<../artifacts/verification/r49-r82-env-ast-proof.json>)原76最大expect全保，仅加Q-ready1条；4browser/14timer/17input/2title相等，15函数全同，后续C1与整个C11字节相同。新32pure，6550/107与type/lint/build0；新增两文件已纳入573完整清单。
- [原环境2项](<../artifacts/verification/r49-r82-env-native-01-metrics.json>)单CLI2/2、actual0/28.508s，独立owner0/28.927s，0retry/skip/flaky；[范围审计](<../artifacts/verification/r49-r82-env-native-01-scope-proof.json>)0。准备3092.577ms，地面/曝光真PNG均140演员像素，核心0→80；原空中窗口第二次观测136演员像素、meanY240.912满足原<245门。
- 原蘑菇/反转/坍塌全链过；[观测量化v2](<../artifacts/verification/r49-r82-env-observed-mechanisms-v2.json>)反转恢复1959.5ms、顶端停留1411.3ms、从首次预警起732.9ms仍有预警、799.8ms已移除，均为公开画面采样不是Core时钟。v1离线选错上升帧已明确废弃，未改native或重跑。
- 存档休息室4个原区域RGBA冻结全等，继续后三静态区不变、蘑菇恢复；Lead[实看4图](<../artifacts/verification/r49-r82-env-visual-review.json>)曝光/顶端UI/平台移除/继续。不是新菜单改版或冷评；原R80菜单10/10、R81Loom9/9与R79counter5/5保留，不能相加为整轮。
- 其他弱点点击/镜像/Omega/拾取等继续；下一项沿191设计减少Deceiver资格到点击的陈旧距离，尚未实施。正式仍R44、nextFullReady=false，Fence176继续blocked179；全GDD与连续五章/自然中高Doom等仍未完成。

## 回合81历史：原Loom9项范围通过，整轮仍未准入

- [有界接近策略](<../tests/e2e/loom-controls.ts#L68-L76>)只在当前支撑且gap<−80时请求65..350ms普通D，沿用导航估算190，完成释放/85settle后再读画布；近线细控、原每步30ms、100/36循环、全部同帧与预算门不改。新增控制动作，不声称运行输入次数或总时间相等。
- [原守卫AST](<../artifacts/verification/r49-r81-loom-ast-proof.json>)保原138最大expect链、15browser、28host加3既有browser计时、46直接input/7title表达式；相对R80仅stage改变，其余12函数不变。新增21pure，6518/106及type/lint/build0；[只读190](<../artifacts/verification/r49-r81-loom-review190.json>)完成，无阻断。
- [原9项单CLI](<../artifacts/verification/r49-r81-loom-native-01-metrics.json>)9/9、actual0/124.184s，独立owner0/124.595s；0retry/skip/flaky，[当前范围审计](<../artifacts/verification/r49-r81-loom-native-01-scope-proof.json>)0。原216身份保留；R80失败与所有旧完整失败不覆盖。
- 实际3次开窗，准备gap29/32/32、箭头228、位移107/101/92，全部原32与line左8门；原生HP像素见证172/84/76、清场及入第五章过。死亡准备gap38/位移105、19帧冻结一致，真实伤害与重试满条闭壳复位过。
- [覆盖记录](<../artifacts/verification/r49-r81-loom-observed-control-coverage.json>)两个普通case各4个已完成coarse动作；4次postdash均首张有效，未覆盖原生空演员再读；drain动态反吸力输入0，不宣该分支获救因果。65..350是请求估计，不是Core持键实测。
- Lead[实看5张](<../artifacts/verification/r49-r81-loom-visual-review.json>)本轮阶段/清场/死亡/重试画面；不是新画面改版或冷评。当前安全休息室继续保留上轮10/10及8图证据，本轮没改UI。
- 保护571/78图bytes+mtime/pointer/Vite，未启动backend；本轮owner及Node/Chrome/power退出。其他旧弱点/跳跃采样、镜像/Omega/拾取等继续，不拼定向为完整216；正式仍R44、nextFullReady=false，Fence176仍blocked179，全GDD未完成。

## 回合80历史：菜单10通过，Loom候选8/9未准入

- 优先补安全休息室当前证据：[原菜单10项](<../artifacts/verification/r49-r80-menu-native-01-scope-proof.json>)单CLI10/10、实际0/59.558s，零skip/retry/flaky；没有改UI代码或把旧截图当新结果。
- [独立条色审计](<../artifacts/verification/r49-r80-menu-native-01-meter-proof-v2.json>)保原全部门：12条真实PNG、24错色/错宽负控、3冻结对、实际交易与4份R45初始几何。Lead[实看8张](<../artifacts/verification/r49-r80-menu-visual-review.json>)桌面/竖屏/短屏，包括规则展开与扩容前后；不是冷评或新改版。
- Loom仅改3测试文件：原等待后先水平Up再SpaceUp；D在PNG采样前释放，A继续反吸力，失败保cause。新增27纯合同，6497/106及type/lint/build0；[只读189](<../artifacts/verification/r49-r80-loom-review189.json>)noBlocking不等于native通过。
- 原138完整expect链、15browser、46input、7title相等；原28host计时另加既有3browser timer计入新口径31，未加预算。两个函数明确改变，其余11（含此前新增presence）不变；原216身份保留。
- [独立Loom9项](<../artifacts/verification/r49-r80-loom-native-01-metrics.json>)8通过/1失败、实际1/109.149s，首失败不重跑。正常到场和其余7项通过；普通战斗首轮站位仍失败，严格scope审计未执行，不能宣两个旧Loom原因都修好。
- [新失败量化](<../artifacts/verification/r49-r80-loom-first-candidate-summary.json>)原100循环到step99，86可见决策中85有支撑，gap从−220.5到2.5，最大27，未达到34/40回转点；有箭头25次、logged heldA为0，无完成postdash。截图仍活着，非此次坠台或默认320。
- 下一候选研究有界远距离接近再短脉冲；不增加100/36循环或90/180/100s预算、不放宽准备带、32/线左8、弱pose/HP等门。尚未实现。菜单10与Loom9是两次独立scope，不能拼19或216；正式仍R44、nextFullReady=false。
- 571源码/78旧图bytes+mtime/pointer/Vite保全，无backend启动，两个owner及其Node/Chrome/power已退出。全GDD/Fence/连续旅程/自然中高Doom等仍未完成，Fence176继续blocked179。

## 回合79历史：原反击5项定向通过，整轮未准入

- [R49](<round49-loom-control.md>)旧白弹真实dx204、raw rAF间399.9ms，分类夹层147.223ms；现在先raw1→原40ms→raw2，再分类/归档，第一pair不筛结果。仅3测试文件，14新合同，生产/资产/config不动。
- AST原194全部expect节点=97最大链、14browser/18timer/21input/4title表达式完全相同；6470/106及type/lint/build0，readonly186 noBlocking。
- 原5项单scope5/5 actual0/91.730s、零retry/skip/flaky；38PNG独立逐像素过，4运动对rAF66.6–66.8ms/dx34，expiry显示10s、Lisp/冻结/恢复/两坑与Continue保持。保护78图/pointer/Vite，没启动后端。
- 启动observer/profiled/observer3次均过原15s门，未重现旧延迟；成功样本开销在Phaser测试/扩展检查，不足以归因旧失败或改引擎。
- Loom05串行放Space再D、06持D跨两次解析越平台的证据已收敛，尚未修；弱点点击旧帧248ms/地形出生闪隐采样等仍需受控验证。scope不补整轮，正式仍R44、Fence176继续blocked179。

## 最近整轮：R49 / 回合77–78（全局预算中止，未准入）

- [R49完整结果](<round49-loom-control.md>)171通过/11unexpected/34skipped、EXIT1/2700.722s；10failed/1timedOut/1skip零ms，33无result。原216身份在报告不等于全执行，retry0。
- 菜单10/Sydney4未执行；反击3/5、Loom7/9。死亡项过，普通战斗准备阶段失败；另一到场路线死后等objective达90s。其他失败含弱点/地形准备、镜像/Omega环境与拾取，原trace保留。
- 164项均过且spec相同的耗时中位比1.40755，总1360.286→2019.123s，仅用例时长不证明CPU/GPU或生产原因。先测量/分析，不加预算或盲改生产。
- 新I后端23实际0/23.935s；571/78图/pointer/Vite保全、I组关闭退休。post-run0只诊断，strict与5子审计未执行；正式仍R44，旧全量失败/定向结果不覆盖不拼接。
- task182只读核五机制，排已知Fence/连续旅程无新已证实现P2，不等于native通过。Fence176仍blocked179；暂定后续R50范围启动前须避免与回归冲突。

## 回合76历史：R49定向两项×2通过


- [R49](<round49-loom-control.md>)只改Loom两处测试控制与2个新测试文件，不动生产/菜单/资产/config。8次presence读取不等结果通过；普通A覆盖原300射击/600观察，原700冻结和全部原预算/守卫保留。
- 22纯合同、6456/106及type/lint/build实际0；AST保138最大expect链/15browser/7title/28timer/46input和12旧命名函数。不是控制流或原生执行证明。
- 原两项预声明各跑两次，同scope4结果实际0/184.939s，零retry/skip/flaky。两次4turns胜利入第五章；两次实际死亡冻结弱pose7/6、实际伤害/HP一致/重试闭合通过；RGBA冻结零容差核对。
- 10次postdash观测均首张有效，无原生空演员再采样路径覆盖；旧trace与纯合同支持该分支，不能证明缺席原因唯一成立。task180无P2，瞄准前置失败可能漏before-open归档的P3仍保留，不会假绿。
- 570冻结/78旧图/pointer/Vite保持、未启动后端；本轮实看4原生图。下一步新I后端与单完整216/所有严格审计，A–H退休；旧214/2与215/1不覆盖，不拼scope，正式仍R44。Fence176继续等正式准入。

## 此前回归诊断：R48 / 回合74–75（单完整214/2未准入）

- 新H后端23 actual0/17.873s；[完整216](<../artifacts/verification/r48-full-01-execution.json>)actual1/2225.466s、214/2、零skip/retry/报告flaky，全部旧216身份。Sydney4/反击5/菜单10同轮passed，不拼216；正式仍R44。
- 两项Loom原断言失败，原源未变：[trace分析](<../artifacts/verification/r48-round75-loom-failure-analysis.json>)确认staged332.5/count384减moved默认320/count0得到12.5，不能称真实移动12.5；空演员具体原因未唯一证明。另一例真实开窗/伤害后死亡时frame2而非>=4，700ms冻结一致已过；需核弱窗内普通离台排程，不能说死亡动画仍跑。
- 2+7脚本只读task174完成，原341 assert保留；whole失败后仅diagnostics执行0、strict acceptance及5子审计未执行。Sydney4份host附件同报告落盘，29/62批返回配对，epoch无关闭/pageerror/API写/cleanup错误；不证明旧关闭根因已修。
- 568冻源、78旧图bytes/mtime、pointer保全，H已真实清理/退役、8081/55439释放，Vite3756保留；Lead实看本轮桌面/短屏/窄屏菜单与两失败图。下一task179只按证据修测试控制，保32/弱pose>=4/3200窗口/原预算，不改菜单或玩法。
- task175/177仅规划：实体可破坏Fence与新局连续五章/自然三结局仍缺，不把分章合法fixture拼成完整旅程；Fence176须等新正式准入后。

### 回合74已完成的诊断切片

- [R48](<round48-sydney-lifecycle.md>)仅加host公共生命周期和已有错误持久化，原220 expect、3个evaluate与27个其它原函数保留；无输入/采样/180000或240000预算改变。
- 7纯host合同、完整6434/105及type/lint/build实际0；原4项native01实际0/202.773s、567冻结/78旧图/pointer/Vite无漂移。37/63批检查返回配对，4份附件保留；本次未复现关闭，不能证明旧故障根因已修。
- Lead实看三张原生图；task172只读无必要P2，epoch/host时钟/cleanupErrors/非复现边界保留。该时点仅收集216，后续回合75的214/2见上；旧215/1不覆盖、不拼定向。
- 该时点计划新H完整216；现已执行并清理，原严格门未放宽，A–H退休不复用。全GDD继续。

## 此前回归修复：R47 / 回合72–73（单完整215/1未准入）

- [R47](<round47-counter-control.md>)只改测试控制/诊断，不动已改善菜单、Core/API/v1/资产/依赖。单rAF公开RGBA避免持键时PNG双往返；有限定位仍保170..220，原194 expect节点逐一相等，90s/30定位步/180路线步、10..48窗口与两坑等不变。
- 修订版native02原5/5、actual0/94.796s，562源/78旧图/pointer无漂移；38真PNG/15864角色源/7368提示像素零容差、111路线、expiry10、Lisp16/quiet0。首版native01另保留，不拼成完整10或216。
- 42合成合同通过；task168清理P2闭合，task169新双源/七审计绑定无阻断P2，原P3保留。新完整单元6427/104及type/lint/build实际0；原6426/1的Omega通用堆栈失败保留，不宣称唯一根因。
- 新G23/23实际0/17.865s；563冻结的单完整216实际**215/1、EXIT1/2255.909s**，全部旧身份保留、零skip/retry/报告flaky，无中断或全局超时。原5反击和10菜单均passed，唯一Sydney页面关闭，不拼全绿。
- Sydney实际53.577s/status failed而非180s超时；trace记录inspectBatch正常返回后的pageClosed，原因未明，task170只读诊断。strict acceptance未执行，workflow0仅诊断完成；正式仍R44。
- G自有服务已停/组消失/PG shut down/端口释放，563和78PNG bytes/mtime、pointer、Vite3756保全；G与A–F退休。Lead实看本次桌面/短屏/窄屏菜单，保原事务/冻结/固定footer；全GDD继续。

## 此前玩家界面改进：R46 / 回合71（菜单完成，单完整212/4未准入）

- [R46实现](<round46-rest-hierarchy.md>)只改两个DTO状态属性与局部色/阴影/条皮肤：普通项细线分隔、选中owned仍金底、inactive暖色标记、满溢暖条与扩容正常浅绿。尺寸/布局/规则/存档/冻结不改。
- [新native10](<../artifacts/verification/r46-r71-native-01-metrics.json>) actual0/58.564s；12条真实PNG严格颜色/比例、24内存负控、三对非空冻结与旧四视口初始几何完全相等。6385单元/103文件及type/lint/build通过，两个只读复核均无P2。
- 三视口已实看，UI复评5新2旧对照认为层级改善；非冷评/Firefox/触控战斗，不冒称整个场景化休息室完成。UI批次已完成；新F后端23/23实际0/17.499s，新单完整216实际**212/4、EXIT1/2215.778s**，4旧反击定位/跨坑准备失败，故**正式仍R44**。同轮10菜单均过不代表全绿；严整轮审计未执行。
- 原213/210/208/205/202身份及所有旧失败保留；560冻结/归还无漂移，78PNG bytes/mtime、pointer和原Vite3756保全，F已停止并与A/B/C/D/E一起退休。当时下一task167基于公开trace修普通输入准备，原门槛不动，再新G数据/冻结完整216；v2审计附件scope与reportSHA的P2已闭合。全GDD继续。

## 此前玩家界面改进：R45 / 回合70（定向完成，整轮未更新）

- [R45实际界面改动](<round45-rest-icons.md>)：七种稳定ID有独立的同色几何图标，列表/详情复用；原修复/强化/募捐与未知回退保留。只改图标helper和Panel两调用点，不动CSS、交易、上下文、保存、冻结、focus/footer。
- 三视口实际SVG点击、真购买/劫持、640×360非空冻结、reload/新attempt/Continue；旧四菜单加新三项[native02共7/7、actual0/42.488s](<../artifacts/verification/r45-r70-native-02-metrics.json>)。初版7/7仍有残差像铃的表意问题，经实际看图只改一条d并重跑；只读复评已闭合唯一P2。
- 最终代码type05/lint05/unit02/build02全0，6375/102。当前213仅收集，旧210/205/202身份保留；**没有执行完整213或新后端，最近完整准入仍R44**，不把两次7/7拼完整。
- Lead已看修正后的1280×720、844×500、390×844及原生残差截图；审查非冷评，窄屏隐藏详情只有DOM一致，点击选择不证明onClick唯一因果。不是触屏战斗或完整美学验收。
- 下一步仍先实际改善菜单：满载/溢出条告警色与正常色一致语义，减少未选中商品/构筑重复框层级，同时保持价格/动作/焦点与footer可见。完成这批相关UI后再安排新冻结整轮，不以纯验收回合替代可见进展。
- 全GDD与旧未完成项继续；原Vite、78PNG和pointer保全；A/B/C/D/E退休，不复用旧数据或信号历史PID。下一完整后端需要新F限定写域与新独占数据。

## 最近正式切片：R44 / 回合69（单次210/210，全GDD仍在研）

- [R44正式结果](</Users/ocean/code/pdoom/docs/round44-counter-feedback.md>)：真字典吸收显示书盾/十段Core刻度与最多6充能；既有Graphics、弹幕在上，无新增长文、第二时钟或Core/API/v1/资产改动。回合68/69仅补观测/测试/记录。
- [新单完整210](</Users/ocean/code/pdoom/artifacts/verification/r44-full-02-validated.json>) **210/210、EXIT0/1719.625s、零skip/retry/flaky**，保原202/205/208身份。6353单元/101文件、新E后端23/23/16.927s及type/lint/build全0，非定向拼接。
- 同轮反击5例覆盖真正奖励、正向冻结/GL恢复、死亡重试与普通穿两坑到休息室后保留1点；38真PNG、15,872角色源像素及7,161提示像素，Lisp正20/负0，到期10量化显示秒。32K合法初始fixture、已暂停GL恢复、DOM blur等限制保留。
- [单发修正](</Users/ocean/code/pdoom/tests/e2e/deceiver-art.spec.ts#L81-L149>)用公共原生同帧/近顶点观测、自建监听ACK与实际发弹记录；单有界跳跃/唯一20ms请求点击及原5/8px半径、击破、完全消失守卫不变。两P2经只读复核闭合；同轮两例109真PNG/4内存负控通过，不称物理枪口注册或旧body-first因果已证明。
- 定向5/5、32.086s与两单发各独立重复5次的10/10、77.719s均actual0，不是失败重试或拼完整；594PNG数值复算不是594图人工实看。重复序号字段缺失的默认0不作实测序号。
- 首次full01仍209/1、EXIT1/1702.942s；R69core01仍4/1、36.400s（新监听竞态，原击破/消失已过）。此前所有首红保留，不放宽半径/再补枪或改战斗。原失败弹道未记录，不能宣称平台挡弹/目标漂移/生产根因已修。
- 完整553冻结零漂移，78旧图bytes/mtime与pointer保全，E干净停机/组与端口释放，Vite3756保留；A/B/C/D/E数据均退休不复用、不信号旧PID。
- 同轮旧音频3、20结局PNG、镜头、12帧治疗阴性及Loom冻结/重试核对。成绩4业务过但观测855.9/670.5/675.1/662.3ms非Node门标定；Loom drain54/支撑44/箭头0/A0，未实触防御分支仍开。
- [当前菜单复评](</Users/ocean/code/pdoom/artifacts/verification/r44-round69-rest-menu-visual-review.json>)仍明确有表单感：重复方框/文字、七遗物同十字、过载绿条。下一玩家切片优先稳定id不同形状图标，商品行/详情复用，不改交易/库存顺序/上下文/存档/冻结/focus/footer；之后继续层级与告警色。四视口功能过关不等于美学完成。
- 全GDD、音频两P3/试听/完整声景、实体Safety Fence风险路、局外成长、多设备/性能/安全/授权、连续五章与三结局证据继续。绝不以更多验收文档代替下一项实际界面/玩法改进。

## 此前正式增量准入：R43 / 目标回合66（单次205/205，全GDD仍在研）

- [R43正式结果](</Users/ocean/code/pdoom/docs/round43-action-audio-feedback.md>)为新的单次完整**205/205、EXIT0/1671.267s，零skip/retry/flaky**；原205身份与旧202子集保留，绝非定向拼接。旧full01的198/7、R64的7/1、R65新检查首败0/1不改写。
- 新C独占后端23/23实际0/17.425s；当轮6296单元/99文件与type/lint/build通过。完整运行与清理中546无漂移，78旧PNG bytes/mtime和pointer保全，C已关闭/组消失/端口释放，Vite3756保留；A/B/C数据均退休不复用。
- 正式切片包括成功Shift/E声音、Boss血条独立depth4和普通观测/控制修正；不改Core/API/v1/资产/休息室交易/冻结。本轮再实看4种休息室视口；同轮音频3、20结局PNG、13帧治疗阴性、镜头与Loom冻结/重试严格复核。
- 成绩同轮4业务过，原5秒门保持；观察值约672.8/705.1/672.5/690ms并非Node门起点，不据此宣称旧启动根因已修。Loom三阶段通关，但drain55/有效支撑44/箭头0/A0，主动防御实机覆盖仍开。
- 音频两项P3与上述覆盖限制、试听/完整声景、可访问性、性能、安全和全GDD保持在研；不把机器PCM/既有上下文审查说成人工听感或视觉冷评。
- [下一批玩家可感知切片](</Users/ocean/code/pdoom/artifacts/verification/r43-round66-next-player-slices.json>)优先Q真实吸收后的类型护盾/剩余环/充能点；后续实体Safety Fence可选风险路与第一/二章不同原创谱面。该R66计划中的Q反馈已在R67实施（见上）；实体风险支路与章别谱面仍未实施，不以新增验证文档代替玩法/反馈进展。

## 回合65定向修复记录（历史）

- [R43当前证据](</Users/ocean/code/pdoom/docs/round43-action-audio-feedback.md>)：最新完整仍是R63的**198/7、EXIT1/1806.969s**，正式准入仍R42。R64的7/1及本轮单例首败全部保持；没有拼接或新的完整205结果。
- R65当前6296单元/99文件，新增18项公共DOM观察器接口单测。仅测试/文档改动，生产Core/React/Phaser/API/资产没有新修改，R64血条独立前景保持。
- B新独占后端23/23实际0/16.976s；成绩4例实际4/4、EXIT0/33.053s，到达真实401/409/10秒与幂等业务。原5秒门及其起点不动，观察器在门后采集、限量清理，不读凭据或私有状态。
- 成绩新浏览器记录见44资产/例和约3067/659/647/658ms的可用观察值；不混Node/HAR时钟、不宣称零扰动或已找到旧启动失败根因。后续整轮仍需观察。
- Loom旧184原生帧确定离台发生在1600ms弹幕耗尽后段。控制加入普通A像素反馈，保持原2500/1600、24..34、箭头、支撑、100步与原战斗/源图门；人物连通体拒绝子弹和歧义。
- Loom首次0/1是已通关后新增的无条件防御覆盖检查不合理；三个窗口无箭头本应不防御。纠正新检查后单例1/1、EXIT0/42.053s，真实三阶段伤害、清场和第五章均过，原354个expect调用节点保留。
- **覆盖限制保留：**通过的Loom55次drain观察中44次支撑、0箭头/0防御A。历史帧策略在170帧会制动不等于实机闭环存活，不把胜利归因于未触发分支；必要时另构造普通输入困难情形。
- 三次定向546冻结零漂移；78旧图bytes/mtime、pointer、资产和Vite3756保持。B服务已停组/端口释放，数据退休；不复用旧PG或信号历史PID。下步新独占后端、新冻结、单完整205，旧actual0守卫不放松。
- 音频两项P3、主动防御实机覆盖、全声景/试听、可访问性/性能/安全与全GDD均未完成；不称视觉冷评。

## 前次正式全量准入：R42 / 目标回合61

- [原生结局集成](</Users/ocean/code/pdoom/docs/round42-native-ending-integration.md>)正式接入三张256×128静态场景，1×/2×整数显示；资源故障/重试、被动回调不抢焦点、真实Doom/冻结/上传语义保留。
- 新的单次完整**202/202，EXIT0/1764.640s，零skip/retry/flaky**；原186名称完整。四份旧用例原697断言调用节点全部保留，原始备份SHA等于R41；不是697条独立断言。R42当轮6218/94、types/lint/prod build与新独占后端23/23实际0。
- 保留浮点跟随、发布整数栅格坐标；冻结时停止独立相机shake。两类41个边界替身单测不冒充实机；同轮真实三模式镜头、11帧治疗阴性、Loom弱点/12帧冻结/重试均审计。
- 同轮20张结局PNG零容差：1835008场景像素、66096含透明孔洞clip像素；迟到200/7232B不抢结算焦点。实看5张不同布局，矮屏底部需滚动；同Lead而非冷评。
- 两次旧整轮201/1、151/7/44及13/5、4/2等局部失败全保留；修复观测与普通控制后18/18仅作前置，不拼202。Q不增Doom；Gato该整轮Q1，Loom该整轮Q0，不虚构吸收证据。
- C独占API/PG组已消失、PG正常关闭、端口释放；78旧图bytes/mtime、49旧public、用户pointer与原Vite3756保持。534冻结在整轮中零漂移，清理/审计后才修改2旧文档并增加本报告和运行时元数据；[文档后校验](</Users/ocean/code/pdoom/artifacts/verification/r42-post-doc-verification.json>)另行记录。
- 历史[生成记录](</Users/ocean/code/pdoom/assets/ending-scenes-generation.json>)的runtimeReady:false保持；新[运行时记录](</Users/ocean/code/pdoom/assets/ending-scenes-runtime.json>)只覆盖本切片。完整GDD、终局动画/未来特效、听感、可访问性、性能与安全仍开。

## R40运行时准入历史 / 目标回合54

- [动态效果减弱](<round40-reduced-motion-integration.md>)为页面私有system/reduced偏好、ready重放、存储异常提示与Scene shake/CSS策略；实际Phaser4.0.0，不改Core/跟随/伤害/弹幕/预警/音频/API/v1，不是完整光敏安全认证。
- 原有两处观察准备真实修复后，新的单独**186/186、EXIT0/1567.559s、零skip/retry/flaky**；原174名称/断言保留，但2个setup源码已改变。61项功能单测+29项准备契约，当前全6120/89、源169与type/lint/实际prod build通过；新C隔离后端23/23实际0/16.491s。
- 同轮三种镜头模式各272帧、均HP100→80：正常最多2740地面像素变化，forced/system始终0，逐PNG审计6480像素/帧/零容差；治疗同轮12个采样帧全保留、无遮挡、最大残留0，不写世界或重挑接受窗口。
- 两次旧全轮185/1和150ms准备0/6、新unit首红均保留：Basilisk近身遮挡与真实受伤闪烁先归因，再修改普通输入准备，不降低98%/>40px/450ms全采样/18移动stage。重复Basilisk6/6、治疗3/3与联合15/15不用于拼全绿。
- C自有Main/PG已清，组消失/PG shut down；78旧图字节mtime、pointer和原Vite3756保持。运行与清理511零漂移；只在清理后更改2旧文档+本报告，文档后实核512。原生49资源不改，同Lead实看当前运行11图，非独立冷评。
- 当前动态减弱不表示终局专用原生演出/未来Glitch、完整可访问性、人工听感、低端性能或全GDD完成；[文档后结果](<../artifacts/verification/r40-post-doc-verification.json>)另行复验，不拿计划作结果。

## R39运行时准入历史 / 目标回合49

- [镜像名称/HP视口修复](<round39-mirror-hud-viewport.md>)只改2个显示层文件；完整名称先测宽，和64×4血条共用8px边距，不改演员/Core/相机/其他Boss/原生图/API/v1。
- 新27unit，全6030/84及types/lint/实际prod build通过；原生169保持。强3浏览器+旧5px原样复跑4/4，最终**单完整174/174、零跳过/重试/报告flaky、EXIT0/1454.388s**，保全原171；新B后端23/23实际0/16.117s。
- 发现旧文字采样只有3点/8px、旧裁切也同签名，先停整轮再补强；现完整417混合采样/89px与自然位置逐RGB相等，旧291/61名称独立被拒绝。只读实际图，无改引擎状态/背景替换/伪造正例。
- 首full01保留EXIT130/122过/1旧5px真实失败/51跳过(含中断)，不拼全绿；旧命中失败根因未确定，原测试未改，在新全轮再次通过。原生/静态检查不能代替人类平衡。
- B当前自有Main/PG已清理，组消失/PG shut down；全部78旧图字节mtime、pointer、原Vite3756保持。运行与清理498零漂移，文档后仅2旧文档+本报告形成新499清单。同Lead实看，不是独立冷评。
- R38记录的镜像右缘裁切已闭环，但本包不代表任意超长文本、全部HUD、多语种/无障碍、完整GDD或发布完成。

## R38运行时准入历史 / 目标回合48

- [Clawd真实出弹姿态](<round38-clawd-attack-integration.md>)已接入：原8+14步态变体，真实runtime receipt驱动83/50ms，不改v1/API/物理/子弹原点或步态时钟。
- 169源/308新Core-投影-资源案例；6003/83单元与type/lint/build实际0。定向18整组与单独完整171/171通过，零skip/retry/flaky，实际1400.019s；保原153全部名称，新B簇后端23实际0。
- 复核发现实际Phaser4.0.0的filter0为LINEAR；旧full01主动中断130，不当通过。清理/保78图后改NEAREST1并加断言，重新定向/新簇/完整全轮，不拼接结果。
- 原known465漏21既有public文件；现494=465已知+8真新增+21既有补纳，49生产文件均冻结，原8 oracle来自不可变ASE。运行/清理494零漂移，78图字节mtime、pointer与Vite3756保持。
- Main56571/PG56329仅自有组清理，PG shut down、8081/55439空闲；同Lead实看最终实际画布，非独立冷评。标准DOM blur事件不是OS焦点切换证明。原生源字节不变，风格提示不抹除。
- 本包runtimeReady/productionReady不等于完整GDD/项目发布；镜像名称/HP靠右缘可裁切是本轮实看的后续可读性问题，不冒称所有HUD已完美。

## R37源阶段历史 / 目标回合47

- [Clawd攻击姿态候选](<round37-clawd-attack-source.md>)已在live原生副本完成：32²/七层/十三色/22帧；原八帧每层不变，出手/回落各七个步态对应变体，不是七帧攻击循环。
- 源166、全unit5692/79文件与types/lint/build本轮实际0；三态66帧每RGBA字节一致，原正式图/运行时代码不变。该源阶段尚未接实际出弹，不把R36的153/23冒称R37新结果；其后R38已以单独完整轮验收。
- 位置联动首错已由原生unlink修复；原生重排保持旧八帧。MCP全层Clean但有58条风格提示含warning，保既有SVG硬边和触手高光；同Lead实看七图，非独立冷评。
- R37当时规划的真实成功发射收据/只读选帧已在R38完成；仍不用按键/冷却/旧计数造历史，无保存字段或新动画clock。

## R36运行时准入历史 / 目标回合46

- [工作台/肖像](<round36-human-rater-integration.md>)真实接线；64²静态四态、48²肖像与原菜单槽，实际支撑、上限两Image，无新Core/clock/collider/v1/API。
- 单完整153/153、零skip/flaky/retry、实际EXIT0/1486.047s；保原136名称。5526/78文件、type/lint/build、新隔离后端23全过。
- 定向20真实浏览器、29对原生捕获：全部不透明源像素与姿态差异逐点匹配，无mask；修掉caption越界、Loom虚线穿头和募捐箱挡腿，首红保留。
- 同Lead实看七张菜单/原生图，非独立冷评；原生三SHA保持，runtimeReady/productionReady仅限本包，全GDD/项目发布仍false。
- 本轮Main8064/PG7744/CLI9447组已消失、PG shut down；78旧图字节mtime、用户pointer与原Vite3756保持。全运行和清理时451路径零漂移。
- 两次工具参数误用已即时说明并停用相应入口；无权限改变/授权声明。八助手未再唤醒，模型切换仍未核实。

## R35源候选历史 / 目标回合45

- [Human Rater四态原生源](<round35-human-rater-source.md>)已真实绘制并保存：64²、7层、4个静态标签，20项palette；PNG/atlas256×64。用户明确批准直接原生制作，无生成参考冒称。
- 源34/34、全unit5370/76文件与type/lint/build通过；MCP0错误、17风格提示有说明。仅同Lead实看，不冒称独立冷评。
- padding1错误与全画布误裁真实首红保留；经live备份恢复/单cel精确重写/原生重导后逐RGBA一致，未放宽断言。
- **菜单和场景尚未使用新图；runtimeReady/productionReady仍false。** 当前应用代码与交易/v1/API不改，本轮不重复无变化的完整136浏览器或后端23。
- 子智能体模型切换仍未完成核验；已有8人一次探针记录actual model为astra、列表为sol的差异。本轮没有再派任务或改配置。

## R33运行时验收历史 / 目标回合43

- [真实评级代码切片](<round33-human-rater-state.md>)完成：入站记录verdict/nominalTokens/creditedTokens；修复/购买/排序不重算，v1恢复评价未知，真实hack标记优先。保存/API/余额规则不变。
- 当前单完整**136/136、零skip/flaky/retry、EXIT0、CLI1183.366s**，原R32全部133＋新增3且每例唯一结果。5336/75文件、type/lint/build与新隔离Scala23通过。
- 新普通C3两条入站各17/28动作、HP100、Doom10/90分别赞许24/否定12；真实修复、劫持和刷新通过。既有四视口/云存档/资源/原生门同轮保留。
- 实看完整三张状态图及定向桌面/手机/矮屏；当前只是HR文字标记，**未制作原生肖像/NPC**，不冒称美术完成。
- Main35710/PG35492已停，进程组消失/PG shut down；8081/55439释放，原Vite3756、用户pointer及78旧图字节mtime保留。
- 运行与清理时已知437路径零漂移；文档之后单独记录新基线，不声称全仓库clean。R32拾取正式准入与源SHA不变。
- 原生工作台仍等待可核验参考→PixelSpec→Aseprite制作；书面brief/prompt/候选坐标不是生成成功或已完成资产。全GDD仍open。

## R32历史验收快照 / 目标回合42

- 当前单完整**133/133、零skip/flaky/retry、EXIT0、CLI1183.644s**，每例一次且与R31原133名称一致；原拾取10/炉房5、Factory/Sydney、cloud/rest四视口均在这一整轮通过。
- 当前全unit5138/73文件、type/lint/build通过；新隔离PG后端23/23、零跳过、EXIT0；准入元数据写完后的静态门再验通过。
- 唯一生产变化是3px规则提示与native皮肤对齐整数坐标；原失败恰盖住第四行120px。保原源图/.98/完整120×12/物理与Core。
- 治疗后在同一动作阶段普通跳上实际平台，不延长准备、不删450ms验收帧。整轮真实HP60→88、11/18动作、x1291/feet258；12帧466.6ms全无遮挡/残留0。
- [三类拾取正式清单](<../assets/pickup-manifest.json>)已签发；三源SHA不变，保旧来源/非fresh审查，修过期PixelSpec开头。productionReady限本包，项目发布与完整GDD仍false。
- Main22036/PG21540已停且组消失/PG shut down；8081/55439释放，原Vite3756/8080、用户pointer及78旧图字节mtime保留。
- R27休息室、R28分隔及R29/R30修订保留；Phaser4.0.0/v1/API不改，无新委派、模型配置或权限升级。
- 详见[R32当轮完整验收](<round32-pickup-admission.md>)。R26–R31的失败/中断保留为历史，不改写成绿；下方旧里程碑数字只代表当轮。

## 第1轮历史证据

- [x] 阅读完整GDD与架构合同，建立架构/HTTP契约；保留Phaser4.0.0、React19/TypeScript。
- [x] 页面私有Phaser、每实例bridge、React低频HUD、菜单/暂停/失败/章节通过分离。
- [x] 第一章blockout：移动、变高跳跃、冲刺、射击、弹幕、2s回溯与同类型10s免疫、E透视、三阶段Gato、Doom阈值、算力、蘑菇/平台崩塌。
- [x] 正常FrameInput完整通关，不含传送、改血或直接杀Boss。
- [x] 本地版本化检查点/备份/损坏恢复，死亡不覆盖安全点。
- [x] Scala/http4s/PostgreSQL全8API与health；19/19单测+真实HTTP/PG、Main重启持久化。
- [x] 当时前端50单测、4浏览器、lint/type/build、audit0。以上是历史时点数字。

## 第2轮已完成

- [x] 按用户SVG纠正Clawd，实际image-to-image参考输入生成三态设计，弃用圆蟹/六足稿。
- [x] Aseprite原生32×32、7层、8帧idle/run/jump/hurt三态，PNG+JSON+可编辑源；四腿/触手冷评修复后8/10；0 validate错误，style warning有说明。
- [x] 按模拟时间播放三态，暂停/rest冻结；核心半径与规则一致；无伤Lisp以括号显示；角色加载失败可明确重试、不改存档。
- [x] Context Window32K/128K、遗物占用与排序、中间失效、无伤Lisp、7遗物4升级实际生效。
- [x] Human Rater休息室、修复/购买/升级/捐款、密度门槛与一次劫持+25Doom；兼容旧0/1/2，正常刷新不重发奖励。
- [x] 原生rest Dialog、上下文编辑边界、窄屏布局；云恢复回菜单后明确载入。
- [x] 真实defeat上传：固定runId/payload、防双击、网络/10s超时重试、401/409；API成功响应运行时校验，集中会话存取。
- [x] 当时最终127/127单测、18/18浏览器、lint/type/build、audit0、diff check；原生图/条带、三态游戏图和桌面/窄屏rest均实际查看。

历史证据：[第二轮整合](<round2-verification.md>)、[美术规格](<../assets/art-direction.md>)、[上下文规则](<round2-context.md>)、[休息室UI](<round2-ui-validation.md>)、[成绩验证](<round2-score-validation.md>)。

## 第3里程碑已完成（自动目标回合3–4）

- [x] 多章节只读定义/注册器、独立调参、轴向进度、世界尺寸与Boss种类；保留旧第一章接口与schemaVersion1。
- [x] 第二章640×2040可达垂直路线、两rest、52px/s即死海面、受保护主路/风险支路、自复制与吞平台探针。
- [x] Sydney三阶段对话/飞刀/组合攻击、必须实弹击碎的定身气泡；边缘键盘J可解除，无伤Lisp不能绕过。
- [x] React明确进入第二章并保留同局构筑/donated；第二章结束保存第三章入口，未开放时拒绝启动，不假装结局。
- [x] 纵向镜头、二维裁剪、探针预警/控制泡/海距离；保留原生Clawd，环境/Boss明确是blockout。
- [x] 真实截图发现“短跳过早入场导致角色卡在镜头底部”；用失败回归证明后，将入场门槛改为脚部越过地板的y289，重跑并增加真实PNG角色位置断言。
- [x] 修后第二章正常输入通关：29,915ms、84HP、两rest、三phase真实attack、3次定身/42次射击/2次Q；无改血/传送/直接扣Boss血。不是人类平均通关时间。
- [x] 最终175/175单测、22/22浏览器（2.4m）、19/19本轮真实Scala/PG测试；lint/type/build、audit0与diff check通过。
- [x] 实际查看工厂攀爬、第二章rest及修后Sydney绑定/解控截图；临时Main与自有PG验证后关闭，8080前端仍HTTP200。

第三里程碑历史证据：[整合验收](<round3-verification.md>)、[模拟合同](<round3-simulation.md>)、[章节UI](<round3-ui.md>)。

## 第4里程碑已完成（自动目标回合5）

- [x] 第三章3280×360：GPU预警/热区、实际载人K线与隐藏房、统一12×12碰撞的高HP龙猫；rest冻结所有机关时钟。
- [x] 前两章真实捐款有箱体/入口说明，第三章锁定正常/狂暴并禁止补捐；狂暴实际改变节拍、弹数、弹速与伤害。
- [x] Basilisk空间+面向凝视、1.2秒石化、就绪Q沿真实两秒历史解除/绕后；正面护甲/背后增伤，石化与吸收独立标记。宽竞技场镜头可见两侧。
- [x] 第二章清关真实进入第三章；第三章仅保存第四章入口，4/5仍诚实未开放，不上传最终结局。v1保存/API/固定tick与Phaser4.0.0不变。
- [x] 正常/狂暴仅FrameInput完整通关分别27,182/25,382ms、100HP、76射击、1次真实历史Q绕后；两rest和三phase都有实际attack。隐藏房700帧可达；并非人类平衡结论。
- [x] 修正旧式tint调用、身体石化可见、眼睛/激光共享高度、K线方向教学和标牌遮挡；原生Clawd保持SVG四腿身份，环境/敌人仍是blockout。
- [x] 浏览器实际乘K线/跳隐藏房、石化/Q历史位移、两种捐款记录、禁补捐与重载；截图识别真实几何，不读隐藏引擎状态。导航器双向微调修复后3次独立重复均通过。
- [x] 新增静态机架缓存/文字颜色变更保护；背景像素断言抓出一次setFilter顺序清空纹理问题，修后真实上下文丢失/恢复也通过。空背景性能样本明确作废。
- [x] 有效软件WebGL开发场景采样：第三章均值21.77→17.83ms，P95仍约33ms，不能称稳定60FPS/生产性能达标。
- [x] 最终219/219单测、27/27浏览器（3.4m）、新隔离PG上的19/19 Scala/真实HTTP；lint/type/build、audit0和diff check通过。最终GPU场景、隐藏房、石化/Q与第三章rest截图均实际查看。

第四里程碑历史证据：[整合验收](<round4-verification.md>)、[纯模拟交接](<round4-simulation.md>)、[React交接](<round4-ui.md>)。

## 第5里程碑已完成（目标回合6：第四章核心与音频基础）

- [x] 第四章2580×640、seed驱动27–33真实节点、三段上下分岔；768组结构检查。展开/脆弱坍塌/吞噬共同驱动碰撞与表现，没有连续地板逃课。
- [x] R改变实际地形并在本段安全承载转移，清除旧Q历史，不跨检查点、不重发拾取、不恢复已吞平台。安全岛与竞技场门区按实际身体和A/B地面验证。
- [x] Leviathan三阶段吞台/HP读数/四音轨；中心锚最终158–180px；从真实右侧A+Shift跨线至少32px才开弱点，阶段伤害边界不允许一波跳阶段。弱点仅恢复读数/音轨，不回血或返平台。
- [x] 两seed各上下路线共4条正常FrameInput通关：29,248/29,399/29,766/29,332ms、100HP、各1次坍塌后R与3次真实左转，保存合法第五章入口；不是人类平均时间或难度评估。
- [x] 第三章可明确进入第四章；第五章仍诚实未开放，不伪造最终结局。四章各两rest、v1与4动作统计、单实例bridge、纯固定tick边界保持。
- [x] 原创120BPM四stem与独立SFX、手势解锁、渐变增益、限幅/voice预算、暂停/rest/失焦/隐藏/上下文丢失停播、销毁关闭；音量/静音独立本机保存。
- [x] 原生连续源PCM抓出未来恢复提前插值并修正；吞音RMS0、恢复非零、全吞时SFX仍有输出。另识别休眠bus getter陈旧读数误报，用实际PCM+已到期原生目标验证，不强写getter或降低阈值。
- [x] 实机通过普通平台跳跃、真实R位移/地形变化/Q重录、HP卸载/恢复与首吞/再吞音频联动。关键断言放在同一浏览器帧后立即按键，避免多次协议往返让吸力移动玩家；两次独立重复6/6通过，左转均首窗口成功。
- [x] 真实Scala/HTTP/新隔离PG19/19；第四章完整v1云快照在新局替换后，经确认恢复到第二rest，原HP/TOK/捐款/seed等全字段保留。
- [x] 最终335/335单测、35/35真实浏览器（3.9m）、19/19本轮真实后端；lint/type/build/audit0/diff check全部通过。实看UI发现重复阶段无新增平台时仍报坍塌，已按真实待吞ID修正并增第335个回归，之后再次全量验证、复看最终截图。
- [x] 已复看分岔/R/弱点/HP隐藏/四章rest及真实云恢复；自有Main/PG清理并验明8081/55439释放，8080前端保留HTTP200。旧红测试及原生getter误报不从记录抹去。

本轮证据：[整合验收](<round5-verification.md>)、[纯规则交接](<round5-simulation.md>)、[React/原生音频交接](<round5-ui-audio.md>)。任务板task-10完成状态审核拒绝已遵守，未由其他代理代写；不影响如实记录已交付代码/测试，但不伪称该板状态completed。总目标仍active。

## 第6里程碑已完成：第五章核心与三结局（目标回合7）

- [x] 第五章3200×360、三处预警风暴/断口、两处真实站地安全点、最后的门/空椅子/镜面，站稳接近后1200ms揭示，不用剧情传送玩家。
- [x] 镜像共享16×22玩家身体/移动器；实际频率、有效构筑、2/3-gram模仿，真正射击/冲刺/自己的2s历史Q/E扫描；预警、执行、恢复与阶段伤害门控。48种合法唯一组合全部有界保留，计数上限1,000,000；不会让失活遗物复活或拿计数伪造历史。
- [x] 四条完整普通FrameInput路线：Doom8/55/90分别36,815/34,765/33,149ms，86/51/100HP；第四例真实训练dash→Q→E并看到镜像执行、战中改学，56,865ms/93HP。不是人类平衡结论；前四章旧路线保留。
- [x] 真胜利finished+stage5/cp90，三种结局与真实最终统计冻结；回看不计时/领奖/自动上传，不存在第六章。FOOM仅24个有界DOM回形针/虚拟桌面，减少动态效果实测生效，不碰系统。
- [x] Scene私有精确快照缓存延续同连续尝试的真实次序，新页/新尝试/云载入诚实按次数与有效build起手。结果深拷贝冻结，结束后不再声称继续观察。
- [x] 发现失败已上传后复用同ID会阻塞最终分数，新增明确检查点恢复新UUID、其余v1全字段不变且先成功落盘；同连续跨章、pause/rest和cp90回看不换ID，HTTP重试也不换ID。旧身份迟到快照被拒，服务端幂等/409未削弱。
- [x] 两轮真实原生镜像战已赢（74HP/24,000ms及66HP/26,233ms），从rest02用普通键鼠/只读画布像素到结局。第二轮同时证明旧A失败记录→新B真实击杀上传200→A重试原body未变。另三种完成档展示/真实上传/云恢复6项通过；不把fixture当击杀。
- [x] 本轮新隔离PG的23/23真实Scala/HTTP（原19+4）；最终统一门 **449/449单测、42/42原生浏览器（4.6m）、lint/type/build/audit0/diff** 全绿，`bash-17f3c5869e2047e2` exit0。此前云快照旧ID、榜单首屏假设、导航和80ms出生闪烁观测等红项保留记录；修后Sydney独立3/3，实际镜像另有三次胜利/上传。
- [x] 最终原生对决45HP/+26,983ms/9048分，真实上传B成功且旧A仍原body；最新三结局/空椅/揭示/模仿/上传/Sydney截图实际复看。自有Main/PG已停并实测8081/55439释放，8080前端HTTP200保留。证据与局限见[第6里程碑验收](<round6-verification.md>)。
- [x] task-12交付事实与板状态分开记录：完成状态和后续send均被审核拒绝且未重试，板仍in_progress/rev2；未绕过task-10旧拒绝。总目标仍active/armed，正式资产等缺口仍须继续。

## 第7里程碑已完成：首批正式小怪素材（目标回合8）

- [x] 用户统一确认第一章美术方向并选择工具生参考；本轮仅先完成随机鹦鹉，未冒称复读机/伪装者/Gato/环境完成。
- [x] 专用工具实际图生图参考 → live Aseprite新文档手工48×48、6层4帧；20项palette实际11色，原Clawd源与四腿身份不变。原生PNG/JSON与可编辑源均保存。
- [x] 首稿真正冷读6/10因书不可读阻断；一次书/胸/翼定点修复后复验8/10，无视觉BLOCKING；实际深蓝绿场景的书、预警圈与尺度也通过独立只读审查。
- [x] 最终validate0错误、16条选择性描边style warning；硬alpha、palette、双脚y44/x24间隙、眼高光、精确主角橘色0均由实际像素检查确认。
- [x] 只读Image适配器按模拟时钟与真实idle/tell/recover选帧，保留预警圈，既有24×24碰撞不动；缺图/帧明确失败并保留v1存档。41新增单测，新增原生三项独立重复6/6。
- [x] 全门曾因第二章机器人站立观察超过真实海水预算失败，保留trace/截图；改为正常移动跳跃先上一级，再按可见像素纠偏，且输入前检查章号/死亡。没有改海水、无敌、碰撞或弱化命中断言；独立3/3及最终全门均通过。
- [x] 最终 **490/490单测、45/45真实浏览器（4.5m）、23/23本轮Scala/HTTP/新私有PG**；lint/type/build/audit0/diff通过，`bash-da55171bafec44cd` exit0。实际镜像胜利78HP/+23,366ms并上传，旧身份仍幂等，前四章/音频/云与三结局均回归。
- [x] task15只写约定三个新文件，正常完成rev3；旧task10/12受拒状态未触碰。测试服务清理与证据详情见[本轮验收](<round7-art-verification.md>)，总目标仍active。

## 第8里程碑已完成：复读机正式素材（目标回合9）

- [x] 实际工具参考 → live Aseprite手绘48×48、6层4帧，双轮盘/格栅/提手/机械脚；原碰撞不改。首稿眼睛感阻断，单次分离孔槽/轴修复后brief-aware7.5/10，无视觉BLOCKING；真实深绿背景复验通过。
- [x] 原生源/PNG/JSON保存，12实际色、硬alpha、四帧同足底/硬壳alpha、精确主角橘色0；validate0错误，工具保留12 style notes。
- [x] 共用只读EnemySpriteRenderer，两家族资源独立门控；新增36单元，原生三项独立双重复6/6，真实3.0189px相对位移、暂停同像素、缺图/帧保档。
- [x] **526/526单元、48/48真实浏览器、23/23本轮新私有PG后端**，lint/type/build/audit0/diff全绿。临时Main/PG停止，数据保留、8080继续。详情见[第8里程碑](<round8-art-verification.md>)。

## 第9里程碑已完成：全窗口游戏外壳（目标回合10）

- [x] 根据用户追加要求移除网站页头/侧栏/章节目录/文字墙；全窗口16:9 FIT舞台、场景主菜单、原生暂停/过关面板，必要HUD和短目标，长信息按需展开。
- [x] 真Fullscreen进入/退出、多窗口比例/单画布、Space键菜单操作/嵌套设置、竖屏菜单边界4/4。独立桌面视觉审查无BLOCKING；竖屏明确仍需键鼠/建议横屏，未宣称触屏完成。
- [x] 新62展示测试；原83组件矩阵合法迁移并全保留。首全门588单元通过，浏览器38/52，保留14个红项：主要是Escape打开原生Dialog后被同次默认动作立即取消；实际cancel事件复现后先preventDefault再暂停，新增输入顺序测试与原生双Escape独立3/3通过。另补云恢复短确认并迁移Q按钮/结局游戏根边界。
- [x] 修复后完整 **589/589单元、53/53真实浏览器（5.5m）、23/23本轮后端**，lint/type/build/audit0/diff全绿；`bash-4a6e39e3769f4a46` exit0。最终镜像实际胜利74HP/+24,000ms并上传；新版主菜单/游玩/竖屏图已实际复看。临时Main/PG已清理并验证端口释放，8080保留。详细边界和首门失败见[UI里程碑](<round9-ui-verification.md>)。

## 第10里程碑已完成：伪装者两态与真实E（目标回合11）

- [x] 工具八面板参考→live Aseprite原生48×48、9层8帧；保持20项palette，实际14不透明色、硬alpha、主角橘色0、8帧唯一，足底y44和四像素中缝一致。保存可编辑源/384×48PNG/真实JSON，原Clawd与旧两种小怪不改。
- [x] A冷读后规格4/10（兽头/双耳、碎片像手），B关键帧6/10仍阻断；第2轮定点修复改为开放S臂/低垂臂、可拼合原笑脸半片，C关键帧及全8格7/10无阻断。真实背景/5与8核心圈另经只读复核，无视觉阻断；环境仍blockout。
- [x] 单一只读三家族renderer，finite模拟时间<真实insightUntil选态，等号回友态；真实600/1550ms FSM不改。核心独立depth3覆盖depth2图片、每draw清理并随场景销毁，原24×24碰撞、y−19和5/8半径规则不变。
- [x] 新55测试，旧77精灵案例保留，只合法更新清单三类和按各自frameCount的期待项。一次新e2e夹具inventory推断string[]的类型错误用GameSaveData上下文修复，无any。rendering161/161及scope类型/lint通过，task19正常complete rev3；旧task10/12未动。
- [x] 首原生5/5、独立重复6/6：E实际显露、暂停4.3秒仍保持E且像素/时钟冻结、正常到期；仅普通跳跃与一次20ms鼠标点击击破5/8核心，缺PNG或第8帧明确报错并保档重试。不读取/改写隐藏引擎状态。
- [x] 全门 **644/644单元、58/58原生浏览器（5.9m）、23/23本轮新私有PG后端**，lint/type/build/audit0/diff通过，`bash-98317b6b6ee44881` exit0。旧53原生全部保留，本轮镜像实际71HP/+26,450ms胜利；并非从新局连续五章浏览器通关。

实证、保留风格备注及服务状态见[第10里程碑验收](<round10-art-verification.md>)。全量GDD目标仍未完成。

## 第11里程碑已完成：Gato三形态（目标回合12）

- [x] live Aseprite原生96×96、11层12pose、20项palette/15不透明色；两工具参考仅用于设计/逐格对照，正式源无参考层。压具一次定点修复，12格C静态8/10，实际五场景无新阻断；非fresh及31条风格备注明确保留。
- [x] 真phase/action/x/y只读皮肤，真实6×86反射条、112落点/双地波、七字幕独立前景；修复新增预警染色HP的层次回归，其他Boss层次与全部Core/DTO不改。
- [x] 新78单元；原生2实战+2资源scope4/4，再于全门重复。4.4秒暂停、60ms鼠标请求的反射（未单独计量发射数）、重叠HP、七字幕及缺末帧保档均过；同arena死亡用只读实际canvas活体正控及非空背景，不靠遮罩/换镜头假过。首type/采样/栅格阈值失败均保留，无改血/传送/假历史。
- [x] 最终722/722单元、62/62浏览器（5.4m、后端开启、无skip）、23/23本轮后端；lint/type/build/audit0/diff全过。完整门Gato真实66HP/+13850ms/32shots胜利。原PG/API跨turn意外停止且原因未知；Lead另起独有持久服务完成全门后关闭，端口已释放。

实证与task22任务板complete拒绝的状态限制见[Gato验收](<round12-gato-verification.md>)；实际代码/截图交付完成，总体GDD仍未完成。

## 第12里程碑已完成：第一章原生环境（目标回合13）

- [x] 原生32种16px地形＋8静态64px道具；live单写、参考仅对照、精确12px台/40px地面/缺口、hardalpha、20项palette与主角橘色0、packedRGBA与socket均验。当前运行9种tile和8道具，不把kit全32都称已显示；旗/捐款等仍Graphics。
- [x] Phaser4.0真实repeat/stamp/render、NEAREST1/string帧/资源身份重建/暂停恢复；五块RT保留跨边纹理相位，独立真实菇。Native检查抓出并修第一章小数camera1px漂移，浮点跟随与整数发布分离，Core/其他章/DTO不动。
- [x] 入口/森林/竞技场同屏通过；降墙纹对比、全文入镜教学、真实反转/裂纹短提示；顶端HUD遮脸只去底板＋读数阴影解决，实际复看0必要新fix。评审复用上下文，不称fresh。
- [x] 合法cp1/cp2/cp11夹具＋普通输入：菇+28/+8、反转/顶端停留/恢复/实际坍塌/落地、saved-rest冻结/Continue、跨2560窗、WebGL和资源失败；不是新局连续旅程。首全门及观察方法失败均保留，没放宽正控或伪造世界。
- [x] 最终891/891单元、69/69原生（6.4m、无skip、后端在线）、23/23新私有PG后端，lint/type/build/audit0/diff通过；原锁版本恢复且字节不变，意外pnpm树保留。Main/PG清理后仅前端8080保留。

完整证据、依赖/工具参数违例、方法限制与已知缺口见[本轮验收](<round13-environment-verification.md>)。总目标未完成。

## 第13里程碑已完成：冯诺依曼探针（目标回合14）

- [x] live32px/4层4帧、20项palette/9不透明色，5个linked cel；源合成独立重建与PNG相同。非fresh静态7/10、原生场景0BLOCKING、0必要fix，保留细钳歧义和7轮廓warning/4直边note。
- [x] 真phase/elapsed只读皮肤、半径11不变；真实复制只来自Core，warning独立在body上方，资源/帧身份/销毁与fallback已验；v1/API/四读数不改。
- [x] 新92适配器＋19文件测试，4原生案首scope及全门重复：正常首跳、真实吞台/背景与保护主台、长暂停、6次普通跳跃后的新增体、缺PNG/末帧保档；不冒称新局旅程。
- [x] 最终1002/1002单元、73/73原生（7.7m、无skip、后端启用）、23/23新私有PG，lint/type/build/audit0/diff过；首全门72/73及Gato观测修正/三次复测保留。API→PG关闭，只保留8080。

实证与边界见[探针验收](<round14-probe-verification.md>)。该R14阶段Sydney/工厂环境均未完成；当前Sydney与工厂分别见R15/R16，整体GDD仍未完成。

## 第14里程碑已完成：Sydney婚纱幽灵（目标回合15–17）

- [x] live96px/11层/12静态pose、20项palette/10色、128cels中105 linked；源合成逐像素等于PNG。静态C8/10和6张原生场景0BLOCKING/0必要fix均非fresh；保留76选择性轮廓warning，不再无必要polish。
- [x] 真phase/action/x/y只读皮肤；原52×74身体、Core时序/运动/伤害不改。本体2、实际圈/HP/弹幕3、标签4；完整12帧预检、资源/死亡/换章生命周期验证。
- [x] 新112适配器＋53PNG/ASE测试，4原生案例：真实cp2攀登、10种自然可达姿势、3.4秒冻结、5/6/7＋6真弹型、PUA射击解除和恢复移动、同arena原始画布清理、缺PNG/unused idle2帧保档；不是新局旅程。
- [x] 最终1167/1167单元、77/77浏览器（10.8m、后端开启、无skip）、23/23本轮新私有PG；lint/type/build/audit0/diff通过。首全门76/77及全部观测失败保留，普通完整phase1采样三次复测后重跑；未放宽匹配/清理正控或改Core。

详见[Sydney验收](<round15-sydney-verification.md>)。该R15时点工厂环境尚未完成；当前工厂见R16，总体GDD仍未完成。

## 已完成：工厂原生环境（R16，目标回合18–20）

- [x] live32片地形、6机器、单次实际设计参考；20项palette，地形12色/机器11色、硬alpha/主角橘色0，ASE与导出PNG逐像素一致。
- [x] 纯plan与独立工厂适配器；4个纵向RT带、2个海pattern、2个TileSprite，真实平台矩形/collapsed状态，不另造时钟、碰撞或海速。
- [x] 149渲染/plan＋58文件测试；原生海/28及12px边界/机器、长暂停/真WebGL恢复、unused帧失败保档；迁移探针吞台原生正控，原阈值不降。
- [x] 整套回归暴露短单击问题，11新增输入例保留两轮red→green：event-time瞄准点、一次consume、次键和弦；原20ms单击场景不改，三次6/6复测通过。
- [x] 最终1385/1385单元、80/80浏览器（11.6m、后端开启、无skip）、23/23本轮自有新PG；lint/type/build/audit0/diff通过。首79/80与后续80/80等中间记录全部保留。
- [x] 地形7.5、机器7、运行场景7分均非fresh；0必要美术修复后冻结，保留海图标行列感限制。清场竞技场/吞台前后/完整攀爬另由Lead查看，不伪称新独立分数。

证据与方法边界见[工厂验收](<round16-factory-environment-verification.md>)。API与自有PG已停止，8080前端保留；这是局部资源准入，不是完整GDD。

## 已完成：Chinchilla三态与弹窗输入边界（R17，目标回合21–22）

- [x] live32px、五可见层/隐藏草图、3静态pose、六linked cel；20项palette实际7色、硬alpha、脚底两行固定，源合成逐字节等于PNG。准备的提示词未提交，不伪造生成参考。
- [x] 首猫/狐6.5后单次圆耳/身体修复，非fresh静态7.5/10且无必要fix；validate Clean、13notes保留。只读独立适配器不扩展旧三敌人绑定，完整三rect资源门、native1x、r11圈/真实弹在体上方。
- [x] 新102适配器＋27独立文件例；源像素三pose、133核心、60像素实弹覆盖且前后源正控、1800ms冻结、普通瞄准真实+6TOK击杀，3资源失败保档。不是新局旅程。
- [x] 多次Escape稳定复现关闭键延迟到达而重开菜单；仅隔离原始dialog事件目标并reset该键，4新增单测先红后20输入全绿、相同三循环原生用例重复3/3绿。旧20ms单击/viewport/伤害/观测阈值未改。
- [x] 最终1518/1518单元、85/85真实浏览器（12.0m、后端开启、无skip）、23/23本轮新私有PG；lint/type/build/audit0/diff通过。独立只读集成审查非fresh、0剩余BLOCKING/必要项，首次失败全部保留。
- [x] 最终原生idle/recover与实弹覆盖、真实击杀后画面已实际查看。API/自有PG停止、数据保留，8081/55439拒绝连接，8080前端继续HTTP200。

完整来源、工具/运行器错误、证据边界见[Chinchilla验收](<round17-chinchilla-verification.md>)；全量GDD仍未完成。

## 第18里程碑已完成：Basilisk八态原生素材与真实凝视（目标回合25–26）

- [x] live96px、九可见部件＋草图、八静态pose；80cels/42links、硬alpha、9–11色/帧、足底固定，signed偏移及visibility/links独立重建逐字节等于PNG。没有已核验的新生图或参考导入。
- [x] 只读mode/action/facing皮肤、完整八rect资源门、origin48/NEAREST1；真实激光/弹/HP前景，540HP、52×74碰撞、伤害/时钟/镜头/DTO均不改。新增74文件＋602适配器例。
- [x] 八态自然源匹配、两模式真石化/Q、normal右锁向/Q历史绕后/实弹击杀、HP中低档及同炉房独立cue清理；缺PNG/unused末帧/错矩形跨重载保档。543匹配帧ratio/signature1，idle实际墨迹裁边有记录，不改镜头满足测试。
- [x] 保留首轮idle镜头滞后观测失败、固定屏幕319与真实shake冲突、误比恢复前UUID；改普通短键/自然停稳、同帧实际地面关系及真实attempt ID。没有弱化源签名、真实Q或身份策略。
- [x] 静态7.5/10、非fresh运行/视觉复核0必要项，32轮廓notes保留；最终2194/2194单元、91/91真实浏览器（13.1m、后端开启、0skip）、23/23新私有PG后端及type/lint/build/audit0/diff通过。
- [x] 自有Main/PG关闭、数据保留，8081/55439释放；8080继续HTTP200。合法cp2夹具不是新局连续五章，也不是完整GDD或稳定60FPS认证。

完整边界、源记录与失败见[Basilisk验收](<round18-basilisk-progress.md>)。

## 第19里程碑本地功能完成：GPU炼丹炉原生环境

- [x] live32片16px地形与六静态64px道具、三层18cel；20项palette、8/12源色、硬alpha与英雄橙0；独立ASE/PNG/map/atlas重建203例。完整CP0 Plan实际用14种terrain/6props，不把kit32全部称运行使用。
- [x] 私有Phaser4.0 view adapter与完整38帧资源门；512px背景缓存、精确40pxfloor/12px台/120×12实际K线；只跟随真实位置/热区、Core碰撞/时钟/镜头/DTO不动。881独立生命周期/几何/故障/restore用例。
- [x] GPU/地板/lift源正控，三态实际热区、暂停/GL恢复、隐藏奖励、旧Basilisk/Chinchilla与资源失败保档。实景重复指令/贴边裁句必要修正后8/10、0必要项；复用上下文，未新增生图/参考导入。
- [x] 当前3278/56文件单元、96/96真实浏览器（15.5m、真后端、0skip）、23/23新隔离PG后端通过，type/lint/build/diff通过；首整轮服务交接失效及Lead-owned重跑保留。临时API/PG已关闭，数据保留，8080继续200。
- [ ] 完整项目安全门：完整npm审计12moderate开发链依赖项，来自一个新[minimatch公告](<https://github.com/advisories/GHSA-g3hv-75wg-m249>)；生产依赖0。不自动强制跨major修复；需兼容方案与重新完整审计。

源图、严格原生观察、历史失败与范围见[R19验收](<round19-furnace-progress.md>)。这些检查点切片不是新局连续五章，整体GDD目标仍未完成。

## 第21轮功能完成：Leviathan正式原生准入与第五章文字收敛

- [x] R20冻结160px八态源/adapter/oracle不变，普通键鼠真实三阶段击杀、HP floor实际闭壳、同场body/core/弹幕独立ROI清场；非空Hero/平台正控。
- [x] 真实普通射击先伤Boss、A坠落失败、活body冻结、检查点保留/新runId、重入满HP闭壳；跨章真实67帧去旧源色且保留新生闪烁。
- [x] 原生第五章入口两处实际重复文字修正，独有遗物有效/失活数字保留；非fresh实景0必要项，不外推未展示场景。
- [x] 当前3567单元/59文件、102真实浏览器/15.1m/0skip/真后端、23新PG后端，type/lint/build/diff通过；测试簇A与浏览器簇B分别全新。
- [x] 前端8080/PID84960保留200；Lead自有API/Main/两个PG已核PID/epoch后停机，端口8081/55439释放、数据保留；没有发布或系统安装。
- [ ] 全量GDD和安全门仍开：完整audit12 moderate开发链/生产依赖0，第四/五章环境、终局/NPC/物品、声景/人工听感、局外成长及新局连续五章仍未完成。

范围、原始失败、复用上下文审查、raw边界与服务事实见[R21验收](<round21-leviathan-verification.md>)。

## 第23轮完成：Loom第四套原生环境正式接入

- 32片16px地形/6静态64px道具沿用R22冻结源；实际Phaser4.0.0只读Imagepool服从worldPlatforms/eaten，h12/奇数整数width/fractionalxy保留，无新增碰撞/镜头/时钟。
- 149适配器案例、全局3784/62files、TSC/lint/build/diff全部通过；当前完整108浏览器(旧102+新6)/0skip/EXIT0，939.244秒，运行前后136源文件0漂移。
- 新PG_A后端23/0skip/EXIT0；不同新PG_B/Main用于实际云档/成绩/全部浏览器。两簇与Main/SBT已关闭、数据保留；原8080 PID84960/HTTP200与旧clusterpointer保留。
- 真原生1×/同帧Source-Hero-Core正控，R与暂停700ms/真实GL恢复字节一致；预警前脆弱源→坍塌同帧ghost；首次吞台后R仍无已吞源。3资源故障/重试exactsave均过；旧Loom9含全阶段真击杀、hurt/defeat/retry/下一章清理全过。
- arena原Core横线以字面RGB/alpha合成逐点验证且分报128原源+16前景；CoreX只有2固定整线栅格模板。不是降低.98/七other/10000ink、重画素材或改Core迎合观察器。初红及初次旧9漏转弯失败保留。
- [正式报告](<round23-loom-environment-progress.md>)/[完整门](<../artifacts/verification/r23-current-browser-01.log#L255-L257>)/[清理](<../artifacts/verification/r23-lead-service-cleanup.json>)；入口非fresh8/0必要，停止optionalpolish。
- 当前仅Loom环境scopeReady，[manifest](<../assets/environment-manifest.json>)四环境；全GDD/安全12moderate(上次R21)/人类听感/新局连续五章/第五章原生环境与终局Boss/NPC-item演出/完整成长/输入无障碍与移动战斗等仍open，goal继续。

## 第22轮源阶段完成：Loom环境候选（接线未完成）

- [x] Live原生32片16px母格/6件64px静态道具，独立源RGBA重建68/68，20palette/硬alpha/英雄橙0。
- [x] Terrain7/props8的非fresh组件复核均0必要；停止可选polish，现有四Boss/三环境/全部Core保持。
- [x] 当前3635单元/61文件、type/lint/build/diff通过；新4资源HTTP200且bytes一致，不等于已在游戏绘制。
- [ ] 只读binding/Imagepool/资源fail-closed及真实分岔/R/坍塌/吞台显示未接入，源候选productionReady=false。
- [ ] 接线后再跑当前全浏览器真后端/新隔离PG及全局门；本轮没跑browser/backend/audit，不冒称新102/23。

[源与限制](<round22-loom-source.md>)保留真实失败/复核范围；无新生图调用/产物或参考导入声明。

## 第24轮源阶段完成：Omega环境候选（目标回合34，未接线）

- [x] Live原生32片16px母格、六件64×128静态道具/18cels/实际共享pivot32,120；不把大门/镜压成64²。门40×96、镜玻璃48×98中央quiet全透明。
- [x] 独立源79/79、当前全局3863/64文件，type/lint/build/diff通过。材料7.5/道具修后8，nonfresh/0必要，停止optionalpolish。
- [x] 一次第三件上轮廓518px必要修复；其余五件/第三件y88+RGBA未变。首77/79的层位置fixture错误保留，改唯一绑定而不改源/像素门。
- [x] 生图确有实际输出但可核验时间在源freeze后；绘前参考说法撤回，无本地路径/尺寸/导入或缩图声明。
- [ ] Task107后续只读viewport/band预算/新pool、资源failclosed及真前景合成；不能复制Loom512漏掉605地面命令。原门叶/风暴/scan/HP/reveal/Clawd镜像不烘、不改Core。
- [ ] 本轮只collect旧108，不执行browser/backend/audit；R23的108/23仍是最新完整运行证据，正式环境仍4个，不是新局五章或全GDD。

[源交付和边界](<round24-omega-source.md>)/[来源记录](<../assets/omega-environment-generation.json>)；SourceReady不等于integrated或productionReady。

## 第25轮完成：Omega原生环境只读接线与整轮回归（目标回合35）

- [x] R24六源原样冻结；第五章32母格/6件高道具正式接线，不把静态源当镜像演员/门叶/扫描。source79与新adapter130独立通过。
- [x] viewport先筛再计，5121视口峰值135/384；真实40px地面三排/12px观察台及两60px断口不改，门/镜/椅/风暴来自真实Core。
- [x] 新11单轮通过：源+hero同帧、真实跳跃/坠落、6props、反转投影/揭示、r5/r8扫描脚部、GL/rest/fullscreen、坏资源双checkpoint/attempt保档、跨章撤旧；不privateWorld或制造HP/坐标/时钟。
- [x] 当前3993/65文件、type/lint/build/diff；完整**119浏览器、1085.593s/0skip/真后端**及新PG_A23后端通过。首full117/119、原样pair2/2、末整轮119的独立证据均保留，不拼绿，旧时长/像素观察敏感性仍开。
- [x] [正式五环境](<../assets/environment-manifest.json>)；native实见22terrain/6props，纯Plan25角色，绝不等于all32全见；[实景AI8/10](<../artifacts/verification/r25-visual-review.md>)非fresh且0必要，停止optional，不替代人类听感/手感/性能。
- [x] 自有PG_A、PG_B/Main关闭/数据保留；原8080/PID84960保留、54字节pointer与metadata不变，旧78截图当前输出另存后原字节恢复。[清理](<../artifacts/verification/r25-lead-service-cleanup.json>)不代表关闭用户服务。
- [ ] 项目安全/性能/人工平衡/全GDD仍开；本轮没有重新安全审计，不引用历史prod0冒称发布就绪，也不是新局连续五章三结局。

[本轮完整边界](<round25-omega-environment-progress.md>)保留必要守卫修复、两次原生首红、时序风险与真实准入。[下一最小合同](<../artifacts/verification/r25-next-delivery-contract.md>)仅只读建议token/compute/heal三图标包，不重画已原生蘑菇，不凭DOM造HumanRater world实体。

## 后续里程碑（必须全部落实，非占位菜单）

### A. 基础游戏与美术完成
- [ ] 完整Aseprite资源：已有Clawd三态22帧（原8+十四射击步态变体）、五小怪家族、四Boss及五章环境的正式原生源与已测runtime；不是全游戏全部演出。HumanRater工作台/四态肖像与主角真实出弹姿态已分别在R36/R38正式准入；终局三张静态原生场景已在R42准入；完整终局动画/特效与更多支路场景仍缺；token/compute/heal已在R32完成当前原10/完整133/新后端23并正式准入，见[清单](<../assets/pickup-manifest.json>)；蘑菇已原生，不重画。延续已批准统一规格/四腿身份，实际预检→info→单写→预览/诚实上下文审查→validate→导出，禁止用概念缩图充成品。
- [ ] 全游戏种子肉鸽布局与丰富支路奖惩：第四章已有seed生成及结构/物理可达性证明，前三章仍是手工布局。
- [x] Context Window、Lost in the Middle、Lisp、已定义遗物/升级的实际规则。
- [x] 五章Human Rater真实交易、前两章捐款、RLHF劫持/密度/代价；NPC四静态状态与菜单/场景反馈已在R36完成；不冒称独立循环动画。
- [x] 回溯吸收后的书盾、计时与暴击充能反馈，已在R44正式切片中验证。
- [ ] 可破坏场景Safety Fence、完整低/高Doom声音与视觉演出。
- [x] 三种最终结算及真实成绩链路，回看冻结、不同尝试身份隔离；章节通过仍不是最终结局。
- [ ] 跨局解锁/成就与完整局外成长。

### B. 五关完整流程
- [x] 第二关核心玩法：海、垂直逃生、自复制/吞平台探针、Sydney弹幕/定身；美术与玩家难度评估仍未完成。
- [x] 蛇怪募捐箱贯穿前两关并影响第三关：真实扣款/跨章保存、第三章正常与狂暴锁定；不能第三章临时补捐。
- [x] 第三关核心：GPU热区、实际K线隐藏支路、Chinchilla、Basilisk凝视石化/真实历史Q绕后/捐款狂暴；已测原生环境/Basilisk不等于完整演出、音频和玩家难度评估。
- [x] 第四关核心：Loom种子真实分支、Reroll碰撞地形、Leviathan吞平台/UI/音轨与真实急左转；原生环境/Leviathan美术已有正式记录；完整声景、更多演出与人类平衡仍待完成。
- [x] 最终关核心：真实门/空椅/镜面揭示；镜像按实际次数、有效build与真实有序组合模仿，实际移动/Q/E/反击窗，不是通用换皮Boss；环境与复用Clawd已原生，专用终局演出和真人平衡仍待补齐。
- [x] Aligned/Warden/FOOM由真实最终Doom触发，独立可跳过演出与冻结结算，只在canvas/DOM内，不碰桌面/系统。

### C. 完整体验
- [x] 原创chip四层与独立SFX基础、真实吞音/恢复、手势解锁、音量静音持久化；无未许可原曲，原生PCM及生命周期已验。
- [ ] 完整章别声景、缺失动作/环境音、最终混音、人工试听与不同设备质量评估；R43已加入成功Shift/E提示；首次完整205的198/7失败保留，R66已另跑单次205/205；两音频P3仍开，数字PCM不能代替主观听感。
- [ ] 改键、辅助选项、手柄/触摸及完整可读性；窄屏菜单不等于触屏战斗。
- [ ] 全技能教程、Boss预警/反馈、真实玩家平衡与性能记录。
- [x] 基础账户/云存档/死亡与最终结局上传E2E、CAS/幂等/409、完成档云恢复与回看；恢复新尝试不覆盖旧失败成绩。
- [ ] 完整多设备并行使用的冲突恢复体验与更广泛网络/长期运行验证。
- [x] 当前camera shake与CSS动态减弱已在[R40](<round40-reduced-motion-integration.md>)接入本机/系统偏好；立即停止现行震动，保留移动、弹幕与危险信息。
- [ ] 未来新增Glitch/shader/终局特效继续接入同一减弱策略；完整闪烁/光敏与设备体验验证仍待完成。
- [ ] 启动/低端性能测量和优化；ready15s是软件WebGL测试预算，不是性能优化，Phaser大chunk警告未解决。

### D. 发布前验证（只做本地交付，不自行发布）
- [ ] 完整目标版本重跑lint/type/unit/build与干净安装；当前核心阶段验证仍不等于完整GDD目标版本验收。
- [ ] 完整版本重跑Scala、安全/事务/真实PG，不拿历史测试替代新增功能验收。
- [ ] 浏览器从新局完整五章与三结局；重开/暂停/失焦/存取档/损坏/断网。
- [ ] 全套Aseprite和游戏内视觉证据、素材权利清单；用户品牌参考再分发权仍需核验。
- [ ] 架构§11自检与干净环境启动；确实满足后再read goal并mark complete。

## 当前优先（R42之后）

- 拾取与两条首红已由[R32单完整133](<round32-pickup-admission.md>)和清理闭环，正式准入已完成；不重复跑旧失败版本追绿，不再把本包写成candidate。
- [HumanRater工作台/肖像](<round36-human-rater-integration.md>)与[主角真实出弹姿态](<round38-clawd-attack-integration.md>)已准入，保[R27菜单](<round27-rest-menu-progress.md>)的底部动作、真实事务与冻结；不重画冻结源或回到等待参考。镜像名称/HP边界已在[R39](<round39-mirror-hud-viewport.md>)完成只读修复；R42静态原生结局已准入，接续更完整终局动画/特效与完整声景，不把本包当作全部HUD与输入可读性验收。
- 继续补终局演出、完整声景/人工听感、丰富种子支路、局外成长、新局连续五章三结局、改键/手柄/触控、把当前动态减弱策略扩展到后续特效、可读性、性能与安全。
- 仍保持固定tick、私有bridge、v1/API与Phaser4.0.0。当前全绿是这个技术切片的证据，不是完整GDD或项目可发布证明。

主机于2026-11-01 22:07:53+08重启，旧Vite84960及临时API/PG不再存活；同8080现由新managed Vite3756恢复。旧338已复用系统进程，严禁按历史PID清理。后端须实检当前owner/端口，不复用用户数据库；54B原pointer字节/inode/mtime未改，st_dev跨重启变化已记录。所有首红与历史来源保留，总目标继续active。
