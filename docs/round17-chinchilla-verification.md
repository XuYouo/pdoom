# R17：Chinchilla 三态原生资源与关闭弹窗输入修复

## 状态与边界

**本轮局部资源准入完成：1518/1518单元、85/85真实浏览器（12.0m、后端开启、无skip）、23/23本轮真实后端；专用原生5/5。全量GDD仍未完成。**

安装版本保持Phaser4.0.0、React19、TypeScript5.7、Scala3.3.6。没有升级引擎、修改Core的碰撞/时钟/伤害、增加攻击状态、改变第三章相机量化、v1存档或HTTP契约。检查点切片不是从空白存档连续完成五章。

## 原生素材与来源

- [源](<../assets/source/chinchilla.aseprite>)、[PNG](<../public/game/chinchilla.png>)/[atlas](<../public/game/chinchilla.json>)与[PixelSpec](<../assets/chinchilla-pixelspec.md>)：live32×32、五个可见部件＋隐藏草图；idle/tell/recover三静态pose，96×32横图。100ms只是导出metadata，不是另一个播放/攻击时钟。
- 全部轮廓x10..26/y6..21（17×16），pivot16,16、native1×，脚底世界319而地面从320开始；12×12碰撞与108HP不变。body/far-limbs/tail六个linked cel，head/near-limbs独立。足底两行逐字节固定。
- 20项共享palette、实际7色、alpha0/255、主角橘色0。每pose192/193/192不透明像素；核心姿势差13/9/17px，不靠黄圈区分。
- 2090字符参考提示词仅准备，**没有提交生图请求，没有生成图、参考导入或生成图视觉审查**。全部像素直接在live Aseprite制作；不得给不存在的输出补写模型、尺寸或路径。
- 首图被读成猫/狐，6.5分与阻断保留；一次圆耳/紧凑身体修复后，完整[三姿势条带](<../artifacts/asset-review-r17/c.png>)7.5/10、0BLOCKING/必要项。评者复用上下文，非fresh。validate为Clean、0错误/0warning、13条选择性轮廓与隐藏草图note，不把notes抹成零。
- 全来源、精确SHA、工具误用与评审范围见[溯源](<../assets/chinchilla-generation.json>)；静态图评分不当作实际攻击节拍证明。

## 只读接线与源像素证据

[独立适配器](<../src/pages/GamePage/game/systems/ChinchillaSpriteRenderer.ts>)不扩展旧三敌人绑定；真实stage3/runId/id/hp/x/y/phase选3帧，不读elapsedMs/phaseUntil，不创建animation或timer。资源门与绘制复用同一个完整检查：三个唯一32px矩形分别在x0/32/64，源96×32，无trim/rotate/offset；身份更换、死亡、非法值、setter异常和销毁释放自有Image，不销毁共享texture。

[Scene](<../src/pages/GamePage/game/scenes/WorldScene.ts>)在ready前检查全部资源；[View](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)保留本体depth2、原r11/1px预警以及非Boss小怪遭遇的真实投射物depth3，不套用旧敌人的r17圈。

[102适配器案例](<../tests/rendering/chinchillaSprite.test.ts>)＋[27独立文件案例](<../tests/rendering/chinchillaAssets.test.ts>)覆盖真实PNG/ASE重建、隐藏草图排除、linked cel、姿势与资源/生命周期。读源而不是读provenance的布尔值当证据。

[原生测试](<../tests/e2e/chinchilla-art.spec.ts>)只使用一次合法cp1夹具、普通D/鼠标及公开暂停按钮、真实rAF和canvas PNG；不访问World、注入血/位置/时间、隐藏DOM或替换rAF。

- 三pose共享133个不透明核心像素，RGB容差≤2、匹配与区别签名≥98%；idle/recover还要求全可见墨迹≥98%。出生无敌导致Clawd真实闪烁时，只选择hero正控>30的帧，绝不放宽阈值或关闭闪烁。
- 首tell预警64个原色像素、外r15..19环0，避免把r17替代圈算对。自然扇形只证明可见弹幕，**不把重叠点阵称为9个独立可见弹丸**；九发数量已有Core规则测试。
- 评审发现“只看身体外弹幕”不能锁定遮挡层级；新增同坐标前tell/后recover源签名正控，实测[60/133核心像素被GPU实弹覆盖](<../artifacts/verification/r17-native-04/chinchilla-art-legal-cp1-n-233dd-pause-and-normal-shot-death/chinchilla-overlap-proof.json>)。[原始覆盖图](<../artifacts/verification/r17-native-04/chinchilla-art-legal-cp1-n-233dd-pause-and-normal-shot-death/chinchilla-gpu-over-body.png>)已实际查看，不能用depth0遮住的弹丸通过。
- 1800ms暂停保持完整native PNG/HUD/保存字串相同，恢复后真实两态继续。普通鼠标瞄准击杀须实际TOK200→206，再以体消失、可见Clawd和非空背景核对；短暂弹幕遮住活体不算死亡。[击杀后原图](<../artifacts/verification/r17-native-04/chinchilla-art-legal-cp1-n-233dd-pause-and-normal-shot-death/chinchilla-normal-shot-clear.png>)已实际查看。
- 缺PNG、缺recover、unused recover别名错误矩形都必须ready失败，恢复按钮禁用；刷新后原v1检查点逐字段不变。

集成/测试审查为hud-engineer只读、非fresh，最终0BLOCKING/NECESSARY；没有把这项审查扩成全部GDD或所有背景的美术验收。

## 保留失败与关闭弹窗输入修复

- [native01](<../artifacts/verification/r17-native-01.log>)3/4：初始源体已识别，但强求每帧Clawd橘色误撞真实出生闪烁。保留失败，不关闭无敌闪烁；只选择满足同一正控的帧。
- [native02](<../artifacts/verification/r17-native-02.log>)3/4：三pose/圈/自然弹幕及前次冻结已达，最后Escape暂停等待失败；截图仍有活体、TOK200。不是成功击杀，也不是空画面通过。
- [native03](<../artifacts/verification/r17-native-03.log>)4/4：公开按钮暂停、真实鼠标瞄准与+6TOK死亡正控；此时尚未锁定重叠层级，不回写成已做。
- 另建连续三轮Escape/恢复后普通射击用例，[重复三次全红](<../artifacts/verification/r17-escape-repeat-01.log>)，明确捕获菜单先消失再重开。Phaser4.0延后处理DOM key queue；原关闭键可能在恢复重新enabled后到达。
- [输入修复](<../src/pages/GamePage/game/systems/InputSystem.ts#L43-L51>)仅对原始事件target在dialog内的键reset并return；不依赖已恢复的activeElement，不preventDefault，不清空别的合法输入。保留下一次canvas Escape与R16短点击/次键和弦逻辑。
- [新增4单测先红，旧16仍绿](<../artifacts/verification/r17-dialog-input-red.log>)→[20/20绿](<../artifacts/verification/r17-dialog-input-green.log>)；相同原生三循环用例[3次全绿](<../artifacts/verification/r17-escape-repeat-02.log>)。旧viewport/20ms单击及命中阈值未改。
- 最终专用含重叠与连续Escape的[native04为5/5、47.9s、EXIT0](<../artifacts/verification/r17-native-04.log>)。历史红项和trace均保留，不把测试换成按钮当作键盘问题已修的证据。

## 全门与服务

[代码门](<../artifacts/verification/r17-full-gate-01.log>)：51文件、1518/1518；type/lint/build/audit0/diff均exit0。Phaser约1352KB chunk警告保留，不宣称低端60FPS。

[本轮后端](<../artifacts/verification/r17-backend-tests.log>)：23/23，真实HTTP与新建私有PG16；不是沿用前轮结果。测试集群位于工作区的隔离目录，启动前8081/55439均拒绝连接；未接触宿主已有数据库/凭据。测试API与PG均已停止，数据保留，8081/55439实测拒绝连接；原前端8080仍HTTP200，见[清理证据](<../artifacts/verification/r17-service-cleanup.json>)。

[完整浏览器门](<../artifacts/verification/r17-browser-01.log>)以PDOOM_E2E_BACKEND=1实际运行，85/85、12.0m、EXIT0；旧80例完整保留。原生全窗口/全屏、云/成绩、真实Boss战和音频均在本轮重复。

## 工具、依赖与仍缺的内容

- task47队友的两次write被自动审核拒绝且体未执行，没有交付文件/测试；Lead接管实现。没有收到文件路径sandbox拒绝，故不捏造拒绝原因。
- Lead两次wrapper写及一次只读ps诊断仍错误携带冗余同模式权限字段并成功，这是指令遵循失误，不是所需权限扩张；后续编辑采用当前权限下的普通CAS操作，不再带该字段。此前错误参数、无意义chat状态查询、仅头层filmstrip误读均在溯源保留；没有上传素材/发布/系统安装/引擎升级。
- 没有再运行pnpm。仅现有host Node与本地CLI；audit使用两个空项目内npm配置，不读取用户凭据。R16依赖隔离恢复产物保留。
- 第三章环境与Basilisk、后续Boss/场景、NPC/物品/演出、完整声景与局外成长仍待补；完整新局五章原生旅程、低端/无障碍和最终体验验收也未完成。

运行器备注：起始health便利断言误读字段status而失败，真实返回是HTTP200及ok:true；交互REPL仍继续运行了完整测试。随后按正确合同显式核对。85项的实际进程EXIT0与真实云端案例独立保留，不把误断言说成服务故障。一次过长终端单行草稿停在写manifest之前；关闭自有终端、重读未变化的四家族记录后，用短多行输入完成，原四项保持不变。

收尾复核：[文档更新后复验](<../artifacts/verification/r17-post-document-gate.log>)再次1518/1518且type/lint/diff均0；Lead已逐项阅读[R16→R17运行接线差异](<../artifacts/verification/r17-runtime.diff>)。
