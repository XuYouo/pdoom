# R49：公开画布测试控制与回归状态

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

> 回合83：Deceiver跳射单采样器/原RGBA后置编码；原5项**5/5 EXIT0/35.146s**，同批133PNG及scope审计v2通过。6609单元/108与type/lint/build通过，575源；无生产/UI改动，正式仍R44。

## 回合83：Deceiver首资格到真实点击减少一次新录像往返

- [单factory](<../tests/e2e/deceiver-controls.ts>)Space前装配并检查setup、不预采样；原Node40循环与首观测起900ms、原完整q不改。browser也先判late再同q，首资格自动接下一RAF为唯一shot流；shot从自己的首RAF计900ms，不从Space起算、不在click续期。
- 当次RGBA立即slice、rect/hud/pixels clone，geometry先返回；原assert后直接唯一20ms mouse.click。停流后才从原bytes编码并按captureId还原原资格图；不是拿未来帧补图。新shot可能早于旧建句柄ACK，不能宣绝对调度相同。
- [AST](<../artifacts/verification/r49-r83-deceiver-ast-proof.json>)100all/50max expect、5spec browser/2timer/7input/3title表达式完全相同；3顶层函数、其它3case及旧native实现保留，pixel classifier/return object/q同，仅Shot类型别名不同。新observer不是旧browser函数字节相同。
- [59项真实factory合同](<../tests/rendering/deceiverControls.test.ts>)含40/900/0时刻、单RAF、第一资格、复制/取消/cleanup/cap、真实Playwright返回值serializer往返；6609/108全过。纯端口与合成像素不冒充原生命中。
- [只读195](<../artifacts/verification/r49-r83-deceiver-review195.json>)两处保因缺口已修：keep保cause；受控browser故障返回普通tagged DTO，Node再decode并聚合dispose，setup失败也回收句柄。raw扩展Error会被Playwright丢字段的负控保留；真实RPC异常仍原样失败，物理清理还须owner/context终结。
- 首轮type2是optional port参数/测试cause类型；显式undefined及类型声明修正，不改配置。unit02四条新合同发现decode的Error.name变enumerable；改回非枚举name/stack，不放宽断言。类型/单元首失败记录均保留，最终静态全0。
- [预声明](<../artifacts/verification/r49-r83-deceiver-native-01-declaration.json>)原5项单CLI/workers1/retry0/repeat1；实际[CLI](<../artifacts/verification/r49-r83-deceiver-native-01-metrics.json>)0/35.146s、[独立owner](<../artifacts/verification/r49-r83-deceiver-native-01-owner-result.json>)0/35.592s，各一结果/0skip/flaky，原216身份全保。没有第二次native。
- 两个首资格各380橘演员像素、meanY230.432（不是底边），核心80/208像素、宽10/16。approach12/10张、333.3ms首次合格；shot50/54张、跨度900/916.6ms，均首次达到900才停；12/13个单弹观测满足原5..50px与100ms移动门，实际击破过。
- 本次5/8px资格采样到可信pointerdown为68.9/64.9ms；请求delay仍20，实测held39.2/34.4ms，保原<185门。旧8px诊断248ms保留；此次观察较短不是CPU/GPU归因、相同全量负载或未来稳定保证。
- [scope审计v2](<../artifacts/verification/r49-r83-deceiver-native-01-scope-proof-v2.json>)actual0，126原RGBA导出PNG与7当次legacy照片共133解码复算、4像素负控通过。E长暂停/恢复过期与两资源重试沿原断言；未额外归档第一项的冻结对，不能冒称独立复查那一对PNG。
- [v1格式修订](<../artifacts/verification/r49-r83-deceiver-native-01-audit-format-amendment.json>)保留KeyError path/exit1；报告附件实际inline base64，v2仅适配原body并逐字保留所有守卫，绑定同一report SHA f40ce8…，没有新取样或换图。原预声明与v1脚本不覆写。
- Lead[实看6图](<../artifacts/verification/r49-r83-deceiver-visual-review.json>)：两首资格、8px实际单弹连续两帧、两击破UI。单弹251.5→259.889/16.6ms；击破UI为HP90/80、Doom8、TOK6，后帧演员处于不可见期，不宣全员可见。
- 575源仅4测试相关变更，文档另3；78旧图bytes/mtime、pointer、原Vite保全，owner/CLI/Chrome/power退出，无backend/生产/菜单/资产改动。R82环境2、R81Loom9、R80菜单10、R79counter5全部保留，不拼全216。
- 下一项先查mirror HUD旧dash-right-edge完整演员未找到；不要因标题带left就误诊为左边裁字。其它Omega/拾取等未闭；正式仍R44，nextFullReady=false，Fence176继续blocked179，全GDD与连续五章/自然中高Doom结局未完成。

> 回合82：C1共享原5秒准备预算、历史PNG后置；原环境2项**2/2 EXIT0/28.508s**，范围/像素审计0。6550单元/107及type/lint/build通过，573源含新增helper/unit；无生产或菜单布局改动，正式整轮仍R44。

## 回合82：C1原第一跳射不变，公开准备后原环境2项通过

- [准备helper](<../tests/e2e/environment-controls.ts#L1-L43>)由host单一deadline=start+5000控制公开Q-ready→可见地面actor→唯一E→当前actor/core，检查剩余/非有限/倒退，不能每步再给5秒。公开Q按钮不是私有history读取，也不保证之后免受伤。
- [C1接线](<../tests/e2e/environment-mechanics.spec.ts#L198-L226>)保持原Space→150ms→原1000ms内hero<245/core>30→唯一80ms click→SpaceUp→实际击破expect，之后才归档同一原exposed/grounded对象；既有withCleanup保主错误及归档错误。这里的单次跳射仅指首次核心准备，后续原自动射击和平台跳跃不删。
- [原守卫AST](<../artifacts/verification/r49-r82-env-ast-proof.json>)152全部expect=76最大链全保，仅新增Q-ready两节点/一链；4browser/14timer/17直接input/2title相等，15顶层函数全同。原live块AST相同，ground-reset之后C1及整个C11字节同；不是宣实际运行等待/采样次数相等。
- 新32pure覆盖共deadline/阶段超时/非法clock与像素/原frame引用/归档错误；6550/107与type/lint/build0。[只读193](<../artifacts/verification/r49-r82-env-review193.json>)completed/noBlocking，peer不执行/独立hash；合成events不是原生跳射证明。
- [精确收集](<../artifacts/verification/r49-r82-env-collection-audit.json>)216身份全保，原环境spec恰2项；[预声明](<../artifacts/verification/r49-r82-env-native-01-declaration.json>)单CLI/retry0/repeat1/workers1。实际[CLI](<../artifacts/verification/r49-r82-env-native-01-metrics.json>)0/28.508s、[独立owner](<../artifacts/verification/r49-r82-env-native-01-owner-result.json>)0/28.927s，2pass/0skip/0flaky，各一结果；无后端或第二次native。
- [scope审计](<../artifacts/verification/r49-r82-env-native-01-scope-proof.json>)实际0：绑定新573清单/193/AST/原76链；准备3092.577ms完成，剩1907.423ms。地面/曝光真PNG各140橘演员像素、meanY309.314；核心像素0→80。跳跃两次原观测meanY253.912→240.912，后者136像素满足原<245门；不是底边，也未另存/实看该空中PNG。
- 原真实击破、三敌收益、蘑菇Doom+28/TOK+8、反转、恢复、预警、坍塌及安全落地全链通过。只核采样的[量化v2](<../artifacts/verification/r49-r82-env-observed-mechanisms-v2.json>)：恢复距拾取1959.5ms、顶端驻留1411.3ms；自首次预警起732.9ms仍警告、799.8ms已移除，不是Core精确时长。v1离线误选顶端之前的上升帧而断言失败，REPL仍写出了无效文件；v2显式要求顶端之后并废弃v1，native/审计未受影响、未重跑。
- 存档休息室前/冻/继续三张原生PNG解码，树冠/植被/地面/蘑菇4区域共5340像素冻结RGBA全等；Continue后三静态区不变、蘑菇恢复浮动，原实际save/HUD门仍在native中。不是重跑R80菜单10项，也不冒充真实走入该存档休息室。
- Lead[实看4图](<../artifacts/verification/r49-r82-env-visual-review.json>)曝光、[实际顶端反转UI](<../artifacts/verification/r49-r82-env-native-01/environment-mechanics-chec-0f401-le-collapse-by-normal-input/environment-cp1-ceiling-real-ui.png>)、平台已移除、继续后场景。UI显示HP72/Doom92/TOK26；本轮没有资产/布局修改，非冷评或从零新局旅程。
- 78旧图bytes/mtime、pointer、原Vite保全，owner/Node/Chrome/power退出，无backend。R81Loom9/9、R80菜单10/10、R79counter5/5及所有原完整失败保留，不能相加作216。接续191的Deceiver陈旧点击方案尚未实施；mirror/Omega/拾取等仍待处理，正式R44/nextFullReady=false，全GDD未完成。

> 回合81：有界远距普通接近已接入，原Loom9项**9/9 EXIT0/124.184s**、范围审计0，6518单元/106与type/lint/build通过。R80首失败保留，生产/菜单/资产未改；当前仅Loom范围通过，正式整轮仍R44。

## 回合81：有界粗接近后细调整，原9项通过

- R80首stage从远左gap−220.5开始，全程短脉冲到原100步仍未回转；不把它误写成死亡或默认坐标问题。[新策略](<../tests/e2e/loom-controls.ts#L68-L76>)仅当前支持、有限gap<−80时请求65..350ms普通D，按原导航190估算瞄准线左80；近线不授权粗移动。
- [调用处](<../tests/e2e/loom.spec.ts#L543-L563>)仍先检查原同帧readiness；若coarse则release→原moveFor→完成日志→原wait30，下一循环才新采样。原A反吸力、100/36循环、90/180/100s、准备带、32/line左8、weak3200/pose>=4与全部HP门未放宽；没有将移动前旧frame当成功返回。
- 新21pure覆盖边界/unsupported/非有限值/实际helpers释放后读取；原49不变，6518/106与type/lint/build实际0。[只读190](<../artifacts/verification/r49-r81-loom-review190.json>)noBlocking，peer未执行/独立hash，Lead绑定三源。支撑只是当前帧，不证明所有前路永远存在。
- [AST](<../artifacts/verification/r49-r81-loom-ast-proof.json>)原R79的276全部expect节点=138最大链、15browser、46直接input、7title全保；[计时](<../artifacts/verification/r49-r81-loom-timer-detail.json>)仍28host+3既有browser调用。相对R80仅stage改变，其余12函数及旧helper前缀原样。新增有限stroke会改变实际按键次数与总等待，AST相等不等于控制流不变。
- [精确收集](<../artifacts/verification/r49-r81-loom-collection-audit.json>)保原216身份、选原9；[预声明](<../artifacts/verification/r49-r81-loom-native-01-declaration.json>)单CLI workers1/retry0/repeat1/maxfail0。实际[CLI](<../artifacts/verification/r49-r81-loom-native-01-metrics.json>)0/124.184s、[独立owner](<../artifacts/verification/r49-r81-loom-native-01-owner-result.json>)0/124.595s，9pass/0unexpected/0skip/0flaky，每项恰一结果。
- [范围审计](<../artifacts/verification/r49-r81-loom-native-01-scope-proof.json>)实际0，保此前全部Loom源体匹配、同帧箭头与支撑、HP/清场/死亡/重试条件，新增当前绑定及coarse请求核查；不是把整轮216门改为9。原正常到场、R、音频/暂停/GL恢复、三资源负控及两个普通战斗case同scope通过。
- 普通战斗3次真正开窗：gap29/32/32、箭头228，位移107/101/92并越线左8；原生HP像素见证172/84/76对应phase2闭壳/phase3闭壳/phase3真实伤害，清场无旧cue、真实存档与入第五章保持。
- 死亡链准备gap38、箭头228、位移105；实际伤害后的HP像素见证240，原700ms观察19张冻结PNG相同，重试新runId且满条闭壳复位。合法初始检查点fixture不等于从新局连续五章。
- [覆盖记录](<../artifacts/verification/r49-r81-loom-observed-control-coverage.json>)普通战斗粗接近请求350/350/113.158/65ms，死亡case350/350/65/65ms，均是动作成功结束后日志；这不是Core实际持键计时。4次postdash全首张有效，原生absence重读未覆盖；drain动态防吸力输入0，不能宣它救场或所有未来主机稳定。
- Lead[实看5张](<../artifacts/verification/r49-r81-loom-visual-review.json>)phase2、phase3伤害、[真实清场](<../artifacts/verification/r49-r81-loom-native-01/loom-ordinary-aim-and-repe-41bab-ve-cues-before-chapter-five/leviathan-actual-cleared-ui.png>)、死亡与重试图；无美术改动/冷评。上轮菜单10/10及8图证据保持，本轮没改菜单也没重跑菜单。
- 571源/78旧图bytes+mtime/pointer与原Vite保全，无backend；全部本轮owned进程退出。R80的8/9、R49完整171/11/34及R47/R48旧失败原样保留；下一步其他旧弱点/环境/镜像/Omega/拾取控制问题，未准入整轮，不拼范围为216，全GDD仍未完成。

> 回合80：原菜单10项**10/10 EXIT0/59.558s**及条色/交易/冻结/几何审计通过；Loom候选原9项**8通过/1失败，EXIT1/109.149s**，未准入。6497单元/106与type/lint/build通过；没有新菜单布局或生产物理改动。两次scope不拼整轮，正式仍R44。

## 回合80：当前菜单验证与尚未通过的Loom控制候选

- [精确收集](<../artifacts/verification/r49-r80-loom-and-menu-collection-audit.json>)保原216身份，先菜单10、后Loom9分别单CLI串行执行；workers1/retry0/repeat1/maxfail0、原全部单项预算及全局上限保留，无backend。不是19项单CLI，更不是216全绿。
- 菜单[实际CLI](<../artifacts/verification/r49-r80-menu-native-01-metrics.json>)0/59.558s，[独立owner进程](<../artifacts/verification/r49-r80-menu-native-01-owner-result.json>)0/60.014s；四layout、三icons、三style全部恰一次pass。控制/交易/存档/冻结的原合同未改。
- [scope门](<../artifacts/verification/r49-r80-menu-native-01-scope-proof.json>)与[条色审计](<../artifacts/verification/r49-r80-menu-native-01-meter-proof-v2.json>)均实际0；原12条真PNG、24错色/错宽负控、3对非空冻结、四视口与R45初始几何逐字段全等，当前prefix路径绑定。只改作用域绑定，旧216审计不动。
- Lead[实看8张](<../artifacts/verification/r49-r80-menu-visual-review.json>)新图：1280×720桌面、390×844竖屏、844×500短屏及规则展开/扩容前后。暖色继续按钮在底部；商品和构筑内部滚动，规则向上展开不盖主按钮；满载暖色、54/128扩容浅绿。内部列表边缘仍可见半行，非整页被挤长。
- 可打开[当前桌面](<../artifacts/verification/r49-r80-menu-native-01/rest-menu-rest-menu-deskto-3f7f0-ion-and-zero-spend-continue/desktop720-menu.png>)、[当前竖屏](<../artifacts/verification/r49-r80-menu-native-01/rest-menu-rest-menu-mobile-bf723-ion-and-zero-spend-continue/mobile-menu.png>)和[短屏规则](<../artifacts/verification/r49-r80-menu-native-01/rest-menu-rest-menu-short--41bbc-ion-and-zero-spend-continue/short-rules.png>)；不是新改版或独立冷评。
- [moveFor](<../tests/e2e/loom.spec.ts#L129-L138>)经[moveLoomKeys](<../tests/e2e/loom-controls.ts#L36-L52>)保普通按键和原等待，先水平Up再SpaceUp，双重cleanup保cause；[staging](<../tests/e2e/loom.spec.ts#L521-L557>)仅在D时采样前释放，A不盲放，原同帧heldA/箭头/支撑/准备带不变。27新合同直接测真实helpers。
- [AST](<../artifacts/verification/r49-r80-loom-ast-proof.json>)保276全部expect节点=138最大链、15browser/46input/7title；[计时口径](<../artifacts/verification/r49-r80-loom-timer-detail.json>)原24page等待+4test预算仍28，另计两个既有browser setTimeout及一个clearTimeout才是31。只两个函数改，其余11未变；不再沿用旧12全不变说法。
- [只读189](<../artifacts/verification/r49-r80-loom-review189.json>)noBlocking：D→null后，在固定相同gap且brakingGap≥minimumGap时方向判断等价；不证明物理轨迹等价或native通过。peer未执行/独立hash，Lead绑定当前三文件。
- Loom[实际CLI](<../artifacts/verification/r49-r80-loom-native-01-metrics.json>)1/109.149s、[owner](<../artifacts/verification/r49-r80-loom-native-01-owner-result.json>)1/109.745s，原9项8pass/1fail、0skip/retry/flaky。到场路线、source poses/恢复、资源负控与死亡重试等8项通过；普通战斗首站位仍失败。未执行严格Loom scope门，未重跑这次失败。
- [本次失败原始决策](<../artifacts/verification/r49-r80-loom-first-candidate-outcome.json>)与[摘要](<../artifacts/verification/r49-r80-loom-first-candidate-summary.json>)保原trace：100循环到step99，86可见决策跨度6777.392ms，85支撑、25箭头活跃；gap−220.5→2.5，最大27，回转34/40一次未到。logged heldA0、postdash注记0；14未记决策属于缺演员/线分支，不凭此计所有物理按键。
- Lead实看[失败截图](<../artifacts/verification/r49-r80-loom-native-01/loom-ordinary-aim-and-repe-41bab-ve-cues-before-chapter-five/test-failed-1.png>)：活角色仍在arena，Boss闭壳phase1，时钟00:32、无死亡对话框。新失败不是R79旧06越平台后96空读，也不是默认320/12.5；未测Core速度/加速度或归因CPU/GPU。
- 下一步在远左侧研究有界普通接近，再进入细短脉冲；原100循环/准备带/所有位移、弱姿态、HP等门不放宽。尚未实现，不宣候选已修好。保护571源、78旧图bytes/mtime、pointer与Vite；两组Node/Chrome/power与owner都退出，解冻后仅更新三份说明。整轮和其他旧失败继续，Fence仍blocked179。

> 回合79原反击5项定向**5/5 EXIT0/91.730s**、38真PNG审计通过；6470单元/106文件与type/lint/build通过。只改采样排程，没有放宽原门。最近完整仍171/11/34未准入，正式仍R44。

## 回合79：反击固定双raw采样，原5项定向通过

- [旧失败实际时序](<../artifacts/verification/r49-r79-counter-counter-gap.json>)：两次raw的rAF标记相隔399.9ms，白弹真实dx204；中间分类evaluate147.223ms，原wait40实际49.123ms。不是没移动；不把整次evaluate硬归因GPU/decode。Lead实看原两PNG。
- [纯排程](<../tests/e2e/counter-controls.ts#L79-L94>)改为raw1→原40ms等待→raw2→inspect1→inspect2。第一固定pair，不按移动结果筛选/重读/重射；原55ms普通J、分类回调、原像素/charge/expiry/冻结/跨坑/重试等守卫不改。仅3个测试文件，无生产/菜单/资产/config改动。
- [AST](<../artifacts/verification/r49-r79-counter-ast-proof.json>)原194全部expect调用节点（含嵌套），即97条最大完整链；14完整browser调用、18timer、21input、4title表达式多重集合全等。纠正“194最大链”的旧口径，不是删掉一半断言；节点相等不是控制流证明。
- 新增14纯顺序/引用/坏dx不重选/5失败点/异步barrier/falsy拒绝合同，**6470单元/106文件、type/lint/build全部实际0**；[只读186](<../artifacts/verification/r49-r79-counter-review.json>)noBlocking，peer未执行/hash，Lead重新绑定3文件。
- [预声明原5项](<../artifacts/verification/r49-r79-counter-native-01-declaration.json>)单CLI workers1/retry0/repeat1/maxfail0，[实际退出](<../artifacts/verification/r49-r79-counter-native-01-metrics.json>)**5/5 EXIT0/91.730s**，零skip/flaky。原216身份保留；78旧图bytes/mtime、pointer/Vite保全，无后端服务。
- [同scope独立PNG核对](<../artifacts/verification/r49-r79-counter-native-01-counter-proof.json>)38图，15896角色不透明源像素/7161反馈像素逐点零容差；负控、Lisp20真实混色像素、expiry显示10s、1100ms冻结、WebGL恢复、两坑137个真实路线样本保留。不是冷评/逐帧路线图册/精确Core10.000s。
- [四个独立运动pair](<../artifacts/verification/r49-r79-counter-native-01-motion-timing.json>)实际rAF间隔66.6/66.8/66.7/66.6ms、对应位移均34px，满足未放宽的5<dx<160与|dy|<8；不保证未来所有主机都66ms。Lead实看当前首对PNG。
- [启动三次诊断](<../artifacts/verification/r49-r79-boot-profile-analysis.json>)observer/profiled/observer实际0/17.912s，原15s门均过（3.083/3.504/3.659s）。原失败native图集到goto+15.498s才发起、请求最长63ms，未复现。成功样本采样主要归属Phaser testWebGL/hasExt，含native等待且非GPU时间；未据此改引擎/config或宣旧原因唯一。
- [Loom05](<../artifacts/verification/r49-r79-loom-05-navigation.json>)已在约16.507s显示死亡，90s不是死亡时刻；串行先松Space再松D扩大移动。[Loom06](<../artifacts/verification/r49-r79-loom-06-staging.json>)D跨两次捕获/解析约0.53s，正演员先越平台后才空，随后96空读；不是旧12.5机制。这两处尚未改。
- 8px弱点的选姿态→真实pointerdown相隔248ms；地形跳跃前两帧演员不可见，但E连线确有上升，[诊断补充](<../artifacts/verification/r49-r79-counter-environment-line.json>)不能替代原演员正控。这些及其余旧失败继续，不把本scope5或启动3次拼成整轮。**最近完整仍171/11/34未准入，正式仍R44，菜单10本轮仍未重跑。**

> 回合78单完整尝试：**171通过 / 11unexpected / 34skipped，EXIT1，触发原45分钟全局预算**。菜单本轮未跑到，严格整轮审计未执行，正式仍R44；不是全GDD完成。

## 回合78：完整尝试触发原全局预算，未准入

- [实际执行](<../artifacts/verification/r49-full-01-execution.json>)CLI/driver/owner均EXIT1，CLI2700.722s；Playwright原2700000ms全局预算到期，外层2820s兜底未触发。没有加预算/重试/筛选。
- [准确分类](<../artifacts/verification/r49-round78-result-classification.json>)：171通过、11unexpected、34skipped；结果为171passed/10failed/1timedOut/1skipped(0ms)，另33项无result。216身份仍在，但绝不是216项已执行。
- [同报告摘要](<../artifacts/verification/r49-full-01-outcome-summary.json>)：反击3/5、Loom7/9；菜单10及Sydney4均未执行，不用R48的菜单通过来补。无本轮菜单截图评估。
- 已修的普通死亡项实际通过；普通三阶段战斗改在stageCombatLoomTurn真实演员/线准备失败。另一条Loom正常到场路线死亡后等不到objective，达90s单项预算。不是旧空演员12.5断言再次失败，也不能称Loom整体已稳定。
- 其他失败涉及反击移动见证/15s启动门、8px弱点击破、地形跳跃准备、镜像HUD实边缘、两条Omega环境及两条拾取。具体原错误和[11份trace派生索引](<../artifacts/verification/r49-r78-trace-extraction-index.json>)保留；原ZIP未改，大字符串仅在派生件摘要。
- [164项两轮均通过、spec原样的对照](<../artifacts/verification/r49-round78-case-duration-comparison.json>)：时长比中位数1.40755，总时长1360.286→2019.123s。只是用例耗时，不是CPU/GPU/Core时钟测量，不足以归因主机、截图、Chrome警告或生产代码。先测量，不能盲优化/扩预算。
- [新I后端](<../artifacts/verification/r49i-backend-tests-metrics.json>)23/23 EXIT0/23.935s；[真实清理](<../artifacts/verification/r49i-services-cleanup.json>)API130/PG0、组退出且DB关闭。源码571、78旧PNG bytes/mtime、pointer及Vite3756都保全；I现加入A–I退休集合，未来只用新目录/新归属。
- [post-run](<../artifacts/verification/r49-full-01-post-run-workflow.json>)EXIT0只说明diagnostics完成，wholeRunAdmitted=false；严格acceptance及5子审计均未执行。不能把诊断0当正式验收0，正式仍R44。
- Lead实看[最初5份失败画面](<../artifacts/verification/r49-round78-interim-failures.json>)；没有凭截图判根因。只读[task182](<../artifacts/verification/r49-round78-gdd-mechanism-review.json>)未证实已知Fence/连续旅程以外的新实现P2，不代表回归通过或全GDD完整。

## 回合76：定向控制修正（历史）

> 回合76：测试侧最小修正，预声明原两项各运行两次，**单scope四结果全通过、EXIT0/184.939s，零retry/skip/报告flaky**。当时新完整216尚未执行；旧R48的214/2和R47的215/1原样保留，正式仍R44。不是全GDD完成或生产规则修复。

## 改动与不变项

- [只读观测助手](<../tests/e2e/loom-controls.ts#L8-L16>)最多8次原公开画布读取，只按可见橘色像素数量/有限坐标/native边界判断存在；第一张有效画面立即返回，即使它会令原位移断言失败。无演员不再被这两处控制读取当成x320，协议错误直接传播。不查World、不缓存或伪造坐标，不等位移/姿态满足才返回。
- [普通离台排程](<../tests/e2e/loom.spec.ts#L709-L719>)让A移动覆盖原300ms射击和完整600ms观察，再等真实死亡；原700ms死亡冻结观察保留。鼠标、A与归档清理复用原withCleanup，失败保cause。原open画面归档后置，保存的仍是原始capture。
- 原生产weak3200ms、物理、伤害、镜头、渲染、菜单、API/v1、资产及配置均不动；不是给死亡状态强画弱姿态。
- [AST对照](<../artifacts/verification/r49-original-assertions-preserved.json>)：138条最大expect调用链（含matcher参数）、15个完整浏览器evaluate/init调用、7标题表达式、28计时调用、46输入调用多重集合相等；12个原命名函数未变。不是138个独立断言，也不是控制流或原生执行证明。原180000/100000预算、32位移/线左8、弱pose>=4、伤害/HP/冻结/清弹/重试/章节门全部保留。
- [22纯合同](<../tests/rendering/loomControls.test.ts>)验证空演员、wrong-side立即返回、8次边界、协议失败及多层清理错误；不是浏览器或通关证明。

## 原生受控验证

- [运行前声明](<../artifacts/verification/r49-r76-native-01-declaration.json>)原两项×2、workers1/retry0/maxfail0；[结果](<../artifacts/verification/r49-r76-native-01-outcome.json>)四结果来自同一CLI，实际时长59.931/25.955/63.922/27.507s。CLI/driver/owner均0，driver总184.939s。
- [同报告核对](<../artifacts/verification/r49-r76-native-01-evidence-proof.json>)两次普通战斗均4次有效急转弯，三个阶段见证HP像素为176/84/76；真实清场后保存至stage5/cp0并进入第五章。两次死亡冻结弱姿态分别frame7和6，保原实际伤害与HP一致、清弹和不同runId重试满血闭合门。
- 原始冻结PNG以Pillow逐像素RGBA零容差复核，持续至少700ms；清场前后RGBA也相同。这个额外核对不是另写原生源图注册器，原注册仍由未改的浏览器检查器判定。
- 10次角色观测均首张有效，额外presence读取为0；**本次未原生复现空演员重观测分支**，不能据此宣布旧闪烁/缺席原因唯一确立。8次read也不是8个连续显示帧或固定Core时间。
- 570文件冻结，原78 PNG bytes/mtime、pointer与Vite3756保持，8081/55439未启动服务；[真实退出与保护](<../artifacts/verification/r49-r76-native-01-metrics.json>)无清理错误。[全部216身份](<../artifacts/verification/r49-round76-collection-audit.json>)保留，不把4次scope与旧214通过拼成216。
- 6456单元/106文件、type/lint/build实际通过；新增仅测试侧2文件，旧文件只改Loom两处控制使用。

## 实看与保留边界

回合76 Lead实看两张死亡弱姿态、第三阶段实际受伤和清场四张640×360图，不是新美术/冷评。下面是其中一次真实死亡后的原生冻结画布：

![玩家死亡后的存活弱点Boss冻结](<../artifacts/verification/r49-r76-native-01/loom-ordinary-void-defeat--ceadf-eak-art-and-swallowed-state/leviathan-player-defeat-frozen-native.png>)

[第三阶段实弹伤害](<../artifacts/verification/r49-r76-native-01/loom-ordinary-aim-and-repe-41bab-ve-cues-before-chapter-five/leviathan-phase3-real-damage.png>) · [清场](<../artifacts/verification/r49-r76-native-01/loom-ordinary-aim-and-repe-41bab-ve-cues-before-chapter-five/leviathan-actual-cleared-native.png>)

[只读task180](<../artifacts/verification/r49-round76-control-review.json>)无P2；P3仍保留：boundingBox/非空断言/mouse.move在外层归档保护之前，瞄准失败可能没有before-open见证，此时未按下A，不会造成假绿或按键泄漏。不得声称所有开窗后的失败都已归档。审查员未执行或独立hash；Lead核对当前三文件绑定。

下一步先分析本次11项失败原trace与164项时长对照，区分观测延迟、普通输入排程和真正实现缺陷；不要盲扩预算或归因GPU警告。新I已真实清理退休，A–I数据/runtime不复用；未来需fresh J。旧Sydney关闭原因仍未证，实体Fence、连续新局五章/自然三结局等GDD缺口保留。
