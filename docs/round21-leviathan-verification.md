# R21 Leviathan：全阶段原生功能准入；项目GDD仍未完成

## 已完成范围

R20冻结115文件起点完全一致，实际Phaser4.0.0、v1 DTO、Core不改。
本轮仅新增正常输入E2E及两个第五章视图的必要文字收敛；[116文件门前快照](<../artifacts/verification/r21-pre-full-browser-hashes.json>)额外纳入原未在表内的OmegaRenderer。
[Leviathan源](<../assets/source/leviathan.aseprite>)、[PNG](<../public/game/leviathan.png>)、[图集](<../public/game/leviathan.json>)与适配器、binding、独立observer仍冻结，没有重画或放宽像素门。

## 普通输入三阶段与同场清理

合法CP2，seed42/default Doom8、HP100、默认constitutional；普通A/D/Shift与真实鼠标射击，无privateWorld、战斗HP/时钟注入。
以真实金箭头而非200ms HUD迟读决定冲刺。停射后真实采样覆盖弹道/1500ms TTL，再由屏幕位置重新站线，不拿含橙弹的全图orange中心盲导航。
[首个通过的新2例](<../artifacts/verification/r21-new-native-03.log>)为2/2，60s；[UI修后Loom范围](<../artifacts/verification/r21-loom-09-04.log>)9/9、2.0m。
后者为额外受伤重试与raw归档加强前检查点；最新102全门已再次执行全部9例，全部通过。

独立只读复算175个actual captures：166阳性、9clear、0字段偏差；最低ratio0.983358428、signature0.983778437、ink12230。
真实HP条像素256→172→84→0，36次单调下降；命名closed phase2/3及phase3继续受伤分别172/84/76，源frame3/2/6、signature0.988390/0.988916/0.999504。
对应420/280/140是冻结Core clamp与量化HP条的联合证明，不是偷读私有numericHP。
原生阳性先于clear；对最后阳性origin(470,168)固定ROI独立数HP/两core/void/white/角色区域外orange全0，hero380、平台528；八源对旧body ROI最高ratio0。
这不是helper.body=NULL后cues.hp默认0的循环证明。clear后仍有真实Hero/平台，原画面冻结、保存合法stage5cp0、显式点击进入第五章。

## 死亡、新尝试与归档

玩家正常A走出已吞掉的台边，真实落到y>705才defeat；活Boss应留在冻结背景，不能误判成应消失。
第一版验证旧open满HP→冻结→真实恢复新runId→重入closed满HP。后来加强为先300ms真实鼠标造成伤害再坠落，[最新hurt-retry06](<../artifacts/verification/r21-hurt-retry-06.log>)1/1通过。
检查点逐字段保留，重试只fork新runId；源重新配准，不强锁旧camera；旧weak、吞台及受伤Boss状态不带进新World。
补存实际clear前后/保存对象、1100ms新生闪烁序列与死亡/重试raw。新生1000ms无敌按80ms闪烁，不能用单帧hero0判永久缺角。
先前175raw属于03版本，不伪称是最新102产物全扫描；后续独立增量复核已补齐新归档。
06实存160帧：damage37张/600ms，256→248→240；frozen17张/716.7ms字节全等且HP240；entry62张含34阳性/28暗帧；重入43张全HP256。
最新102中实存clear保存对象stage5cp0、shots39/dashes3、elapsed43149，before/after实际间隔7833ms且PNG完全相同（含分析耗时，不称正好700ms）。
第五章67真实帧/1100ms含48阳性/19暗帧与9次转换；独立全屏七源色匹配全0，任意源姿态匹配ink上界0，不由bodyNULL循环推导去旧身。

## 第五章必要UI修正

跨章实景发现Canvas大标题/行动说明与React状态行互相遮挡，环境三行牌也重复教学；仅移除这两类重复。
[实际差分](<../artifacts/verification/r21-omega-ui.diff>)不改关卡/物理/镜头，只改短标识、标签完整可见性和Omega文字对象。
React保留唯一当前行动，独有遗物有效/失活计数仍读真实activeBuild/suppressedBuild，不拿包含升级的activeTraits长度替换。
非fresh/复用上下文复核两必要均解决、剩余0；仅验1280×720入口，不外推未展示牌、其他阶段/尺寸或完整动画。

![第五章入口：重复文字已收敛，非合成](<../artifacts/verification/r21-loom-09-04/loom-ordinary-aim-and-repe-41bab-ve-cues-before-chapter-five/omega-entry-text-consolidated-ui.png>)

## 当前门与隔离服务

[全局门](<../artifacts/verification/r21-current-global-gates.log>)及[元数据完成后复核](<../artifacts/verification/r21-final-global-gates-02.log>)实际type/lint/unit/build/diff均EXIT0，unit3567/3567、59文件；Phaser大chunk警告未隐藏，不冒称低端60FPS。
[本轮后端](<../artifacts/verification/r21-backend-tests.log#L162-L191>)23/23、0skip、EXIT0，Java17/Scala3.3.6/sbt1.10.7保持。
测试簇A与浏览器簇B分两次mktemp，因为集成测试随机schema不会自动drop；A已pg_ctl0停机/controldata shut down/端口释放，数据保留。
[Lead自持服务状态](<../artifacts/verification/r21-lead-service-state.json>)记录新home、A/B绝对路径/PID/start epoch、B初始public0、API后4表、双health200/no-store及独立业务canary。
[完整浏览器](<../artifacts/verification/r21-browser-01.log>)当前真实完成102/102、15.1m/903.464s、EXIT0、0skip，真实backend启用；不是R19历史96或局部9。
完整门后再次验证116文件零漂移、API同PID及PG同PID/epoch、双health200/no-store、原8080同PID。
[服务清理](<../artifacts/verification/r21-lead-service-cleanup.json>)已实际确认Main56791/SBT56644消失，两个自有PG均pg_ctl0/controldata shut down，8081/55439释放；数据与home保留、原8080/PID84960继续200。
API仅记录明确SIGINT+terminal_close及PID消失，per-process退出码未知保持null，不用wrapper inferred_idle伪装exit0。

## 失败、安全与剩余GDD

[过程记录](<../artifacts/verification/r21-process-notes.md>)保留测试作者错误、过早采样及PTY输入流程偏差，不宣称零偏差。
首次kill01已真实击败并清场，却漏采弹道后closed HP floor；02补实帧通过到跨章，又碰正常无敌闪烁的单帧Hero0；均保留失败，不降98%/七other/10000ink。
加强hurt05中活时批量解码拖过weak，死时closed是正确状态；06把分析移到真实死亡后通过，不改Core或weak期限。
[本轮公开只读audit](<../artifacts/verification/r21-audit-exits.json>)完整EXIT1、12moderate/0high/critical；生产依赖EXIT0/全0，仍不等于安全门通过。
显式空user/global config、无project npmrc、只访问公开registry，无安装/major override/伪版本/发布；引擎/依赖/config不改。
第四/五章环境与终局专用素材、NPC/物品演出、局外成长、性能/无障碍、完整音频人工听感及新局连续五章仍未完成；总GDD目标保持active。


## 准入决定与下一步

Leviathan成为第四个正式功能准入的原生Boss资产。生成记录productionReady=true仅限该资产/已测runtime，项目securityGatePassed与fullGddComplete仍false。
[最新实测指标](<../artifacts/verification/r21-native-metrics.json>)记录176帧/166阳性/10clear、全部8源帧、最低ratio0.983358428/signature0.983778437/ink12230与真实39枪/3冲刺保存，不是人类平均难度/通关时间。
保留R20的首轮遮挡拒绝、独立观察器和现有Core；停止无必要的7分素材抛光。下一步按原设计制作第四章环境，再持续完成五章环境/终局/NPC/声景/成长与新局连续旅程。
