# R23：Loom第四套原生环境正式接入

> **当前结论：本章环境正式准入，不代表全量GDD/项目发布就绪。** 完整当前108浏览器/0skip/EXIT0（939.244s）、3784单测/62文件、全局TSC/lint/build/diff0、新隔离数据库后端23/0skip通过。运行前后136源文件无漂移；当前六个新动作/故障例与旧Loom9全部在完整门内通过。
>
> [当前完整浏览器](<../artifacts/verification/r23-current-browser-01.log#L255-L257>) · [本地全局门](<../artifacts/verification/r23-final-local-gates-01.log>) · [新簇后端](<../artifacts/verification/r23-backend-tests.log>) · [自有服务清理](<../artifacts/verification/r23-lead-service-cleanup.json>)

## 过程记录（按当时状态保留）

下列pending/初红是当时的历史快照，不能拿它们替代当前结论；所有失败日志、原PNG及修复合同完整保留。末尾列出最终准入范围。


## Actual implementation

The [R22 six source/export files](<../artifacts/verification/r22-native-source-hashes.json>) remain frozen;32 native16pxmothers and6static64pxprops are not redrawn.
[Pureplan](<../src/pages/GamePage/game/systems/LoomEnvironmentPlan.ts>) reads actualworldPlatforms/eatenstatus only;
[Imagepool](<../src/pages/GamePage/game/systems/LoomEnvironmentRenderer.ts>) isviewonly/noRT/timer/ownGLcallback;
[binding](<../src/pages/GamePage/game/data/loomEnvironmentAssets.ts>) usesactual32+6nativeframes.
Right/left16pxcaps staywhole;onlymiddleprefixcrops fill oddwidth. Actualfractionalx/y retained,nativewidthsareinteger40..180;h12unchanged.
[WorldScene](<../src/pages/GamePage/game/scenes/WorldScene.ts>) guardscomplete38frames beforecreateWorld.
[WorldRenderer](<../src/pages/GamePage/game/systems/WorldRenderer.ts>) movesonlyLoomsemanticstrip/cracks toforeground1 aboveImage.5;
all Core/boss/camera/DTO/persistentstate rules stayuntouched. Nativebackdropreplaces192pxtallblockoutpanels withoutaddingfloor.

## Independent unit and native entry evidence

[149 adaptercases](<../tests/rendering/loomEnvironment.test.ts>) pass [actual149/149,TSC0/lint0](<../artifacts/verification/r23-adapter-tests-final.log>).
Thisisnot browserpixelproof. 30actualCoreseed/cp/timelinecombinations,integeroddwidths/fractionalxy,
all38requiredframes,readonly/clocks,crop/white/noFlip/alpha1,identityfiltering/pool/culling/run/resource/lifecycle checked.
Malformedinputs failclosed;reassertnativeStyle eachdraw;detachbeforeenginecallbacks. No fakeWorld/protocolbuffers used asnativeevidence.

[Firstentry450ms](<../artifacts/verification/r23-entry-capture.log>) hadactualspawninvulnerabilityblink,not a missingactorasset.
[Second1250ms entry](<../artifacts/verification/r23-entry-capture-02.log>) showsactualHeroafter1000ms spawnwindow;
onlyfirsthubframehorizontaloffset movedtokeepchaptershortlabelclear,sourceassetsunchanged.
[Reused-contexttwo-stagevisualreview](<../artifacts/verification/r23-entry-review.json>) actualnative640x360/UI1280x720 score8/0necessary;
upperlabel/darktreeandHUD/weaveoverlap observations retained,butbothreadable;stopoptionalpolish.

![Actualnativeentry,not synthesized](<../artifacts/verification/r23-entry-native-02.png>)
![ActualfullscreenUI](<../artifacts/verification/r23-entry-ui-02.png>)

## Failures and scope not yet closed

Unit [145/93](<../artifacts/verification/r23-adapter-tests-01.log>) includedfractional-widthAPIambiguity/cascades,
then [142/136](<../artifacts/verification/r23-adapter-tests-02.log>) exposedtruefailclosed/style/synchronousdispose gaps,
then [148/146](<../artifacts/verification/r23-adapter-tests-04.log>) exposedremoved-image doubleDestroy.
Originalguardsnotlowered;final149allgreenafterproducerfixes. Invalidfractionalwidthsremainnegativecontrols,
not rounded/stretched;sourceCore widthsareinteger,positionsmaybefractional.

Unmodified [oldLoom9first](<../artifacts/verification/r23-old-loom-01.log>) was8pass/1fail:
lastordinaryhurt/deathcase missedrealweakopening after185msA+Shift;other8includingthreephasekillpassed.
No Core/difficulty/oldtimings changed;[samehurtcasealone](<../artifacts/verification/r23-old-hurt-02.log>) actuallypassed1/1,
whichisnotafull9passnorrootcauseproof. Keepfailure;currentcompletebrowserstillrequired.

[NewPGbackendtests](<../artifacts/verification/r23-backend-tests.log>)23/23/EXIT0,0skip;
Awasgracefullyclosedanddataretained,distinctfreshBpublic0/Mainhealth/throughVitecanaryare[Leadowned](<../artifacts/verification/r23-lead-service-state.json>).
No project/globalconfigorcredentials read,no systeminstallation orpointer overwrite.
Currentnewnativebrowserauthoring andfullregisteredregression arepending;Loom environmentproductionReady remainsfalse.
R21historical102/23isnotnewR23fullbrowserproof. Security12moderate/prod0waslastverifiedR21,notre-auditedhere;
fullGDD/continuousnewgamefivechapter/humanhearing/metaprogression/accessibility stillopen.

Currentfullunit actually[3784/3784,62files,EXIT0](<../artifacts/verification/r23-current-unit.log#L319-L324>);not just149selectedcases. Type/lint/build/currentbrowserfullgate stillrequires finalrecord.

## First actual native6 attempts — failures kept

[Native01](<../artifacts/verification/r23-native-loom-01.log>) exited1 with**0 tests executed**:
Node25 detected residualimport.meta in PlaywrightCJS output;onlynewhelper sourcepath changedto samecwdpatternasoldobservers,
no package/engine/config/cachechange;[actualcollect6](<../artifacts/verification/r23-browser-author-collect-01.log>) isonlycollection.
[Native02](<../artifacts/verification/r23-native-loom-02.log>) actuallyran6: **3pass/3fail**,all3missingPNG/unusedframe/cutguards passed.
Case1 initialrealinvulnerabilityblink yieldedhero0;case2 incorrectlyaskedwarning-coveredfragilebodyforpresourceink;
case3 initiallytreatedthetrueCoreguideoverlayaspurePNG:arenaall9-rowROIsincludeoneexistingCoreboundaryrow.
Theseareobserver/samplinggaps,notassetSourcechangesorpermissiontolowerexistingthresholds.
[ActualofflineCorecomposite](<../artifacts/verification/r23-core-boundary-composite-diagnostic.json>) measured144opaque:
128pure-sourcepoints/128matched/5colors,16existingCorelinepoints;literal#9acfb7alpha.38 yieldsfull144/144 composite,
wherepure144ratiois128/144=.8889. Wrongalpha.2=.8889/wrongrow6=.7778 staybelow.98.
Coreline/graphicsdepth/frozenassets mustnotbemoved/repaintedtomakeanobserverpass. Anyfuturecompositeobservermustreport
sourcevsforegroundseparately,nogeneralpixelmaskorimage-fittedalpha. CP0unoccludedpure-source.98andoldfrozenBossobserversunchanged.
Native02imagesareactualraw,notnewpassingproof;next6mustreexecuteafterexplicitobserversamplingfixes.

[Productionlintand155modulebuild](<../artifacts/verification/r23-production-lint-build.log>) bothEXIT0;
[exactreversepatchreconstruction](<../artifacts/verification/r23-view-only.diff>) restoredR22SHAsofWorldSceneandWorldRenderer,
provingonlyintendedviewintegrationdifferences,notCore/camera/inputchanges. Fullfinalgatesstillpending.

## 最终准入范围与边界

- 三个page-private模块做布局/绑定/原生Image资源池；现有两处view接线，逐项逆向补丁可重建R22 SHA。纯Core、DTO、physics、camera、默认HP/Doom和全部旧102测试/冻结Boss观察器未改，六资产与Source68文件字节冻结。
- 所有38资源均验证native cut/source/去重/非trim非rotated；缺PNG、未用frame3丢失和cut错位都在createWorld前failclosed，合法checkpoint字节在retry前后不变，无API写入与JSerror。
- 每个真实活节点h12：左右完整16px帽、中间prefix裁奇数尾，不吸附fractionalxy、不跨空隙。Core3px语义top/裂纹在foreground1，skinImage.5；ghost/X/连接/警告/HP/music/箭头和计时仍属于Core。
- 新6在完整108内单轮全部通过，非仅03五过+05单过拼凑。原生CP0纯16×9/source>=.98/多色非空；arena叠有既有Core1px线时分报纯源128/128和已知前景16点、完整复合144/144，非泛化mask/拟合alpha。
- 实际GLlose/restore在暂停中PNG字节相同；脆弱台真实按键站上→2秒坍塌，同帧Hero/存活原生台/ghost6+6/旧body0-top；吞台+R同样保持已吞源消失，Boss原冻结10000ink/.98/七other正控未降。
- 原9首8/9中hurt漏weak窗口保留；不改旧输入或Core，单独原hurt复跑1/1，最终完整108内原9全部通过。这不消除已观察的时序失败，也不冒充人类平衡认证。
- 两个新簇先后隔离：A23测试后关；Bpublic0起步Main/双health/业务canary/完整浏览器后关。Main86170/SBT85946/PG85436均证实退出，两个数据目录留存；旧clusterpointer未改，8080 PID84960/HTTP200保留。
- 旧全局硬编码截图输出先保留78张，完整门后把46张变化结果另存，再逐字节恢复原78，见[输出保全](<../artifacts/verification/r23-legacy-output-preservation.json>)。新native证据均在独立per-run目录，未覆盖失败记录。
- 配置6prop角色/18tile角色，32母格非全部当前运行时使用；不声称六道具各自完成原生像素注册。无新imagegen调用、未改Aseprite源；入口8分/0必要为nonfresh模型复核，停止optionalpolish。
- 未重新运行安全审计，R21最后12moderate开发链/prod0仍open；bundle大块警告保留，未升级引擎/依赖、未安装系统软件/插件、未发布。完整GDD、新局连续五章、人类听感/平衡、第五章原生表现、完整成长/无障碍/触屏战斗仍待完成。
