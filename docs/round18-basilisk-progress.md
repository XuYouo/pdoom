# R18 Basilisk：八态原生接线与本地准入

**本里程碑已本地准入：2194单元、91真实浏览器、23本轮真实后端，type/lint/build/audit0/diff通过。全量GDD仍未完成。**

## 实际交付

- [可编辑源](<../assets/source/basilisk.aseprite>)96×96、九可见部件＋隐藏草图，normal/enraged各idle/tell/attack/recover。[图集](<../public/game/basilisk.png>)/[索引](<../public/game/basilisk.json>)768×96，八个完整96矩形，无trim/rotate/padding；100ms仅导出元数据。
-80cels=38raster+42links；六静态部件链接，其余姿态局部。足底86–87行不变、硬alpha、每帧9–11色、主角橘色0。冻结源和PNG/JSON在接线期间未改。
- [独立74文件例](<../tests/rendering/basiliskAssets.test.ts>)按实际signed cel位置/图层/链接合成，逐字节等于PNG；隐藏sketch和忽略偏移负控均失败。允许负原点的透明padding，不允许opaque越界；图集已烘焙偏移，Phaser不再叠加。
- [602适配器例](<../tests/rendering/basiliskSprites.test.ts>)覆盖8态字面oracle、getter禁读、所有帧的几何/异常、资源身份/生命周期及共享纹理保护。绑定复制冻结、numeric0字符串化、native1×/pivot48/NEAREST1。
- [只读皮肤](<../src/pages/GamePage/game/systems/BasiliskSpriteRenderer.ts>)只用实际furnace.enraged、boss.action/facing；不建新时钟，不读HP phase猜动作。[接线](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)让本体depth2、真实弹/激光/HP为3、标题4；不改540HP、52×74碰撞、激光±26/+15或弹源±30/0。

## 原生证据，不以空画面过关

[专项门](<../artifacts/verification/r18-current-gates-03.log#L312-L335>)为2194单元/53文件、type/lint与8项native全部EXIT0。包含6个新增案例及2个迁移的旧石化/Q案例。

- [原生观察器](<../tests/e2e/basilisk-pixels.ts>)独立读源与640×360画布；RGB容差2、ratio/signature≥.98、可见不透明源≥90%，每个候选都对全部7个其他pose有上冠见证。只固定排除真实激光带localY50..76，不用颜色通配掩盖错误。
- [实测汇总](<../artifacts/verification/r18-native-metrics.json>)543个匹配帧，ratio/signature全部1。八姿态自然可见，normal/enraged inactive实际裁去7.5159%/4.8342%墨迹；不冒称整个96画布或所有尾尖入镜。普通短D键后让真实平滑镜头追上，没有改相机/触发点。
- 真实激光覆盖14/23个源不透明头像素；无遮挡前后整身/头部各1.0。完整匹配与落地使用同帧实际地面，两行各≥500像素，精确foot=floorTop−1；543帧均成立，包含震屏的231/319与233/321。
- 两捐款分支均保留真实石化、Q解除、活玩家及原>40px相对位移。正常分支另用D穿身诱导右锁向、真实Q回旧侧>120px、鼠标瞄准后背击杀，保留中/低HP档和合法第四章检查点。
- 同炉房body消失时，HP/active beam/tell tip/causal四个全画布独立计数均0；此前各自有活体正控，最后仍有玩家/机架/地面。不是body=null自动推出清理，也不靠换章/遮罩/隐藏DOM。
-1800ms暂停同像素/HUD/保存；缺PNG、缺unused末帧、末矩形别名三负例拒绝ready并跨reload保持保存。

## 审查与来源边界

静态单帧与八态均7.5/10、0必要项，评者复用上下文，明确非fresh。原生1×和2×均实际打开；[条带](<../artifacts/asset-review-r18/c.png>)不是只看active crest的filmstrip。
validate为Clean、保留32条逐层选择性轮廓note及隐藏sketch说明，不称零警告。该检查来自冻结源阶段，接线未改像素。
独立运行/证据审查task57非fresh，实际看了03右向/Q/active/final图、JSON和源码，修正震屏断言后0BLOCKING/0NECESSARY。
原像素评者task59再次实际看四张原生场景图，非fresh、0BLOCKING/0NECESSARY；绿色机架上冠/眼/蛇形、主角与HP/凝视仍可辨。不从静态图推断机制或FPS。[既有低对比背景圆环](<../src/pages/GamePage/game/systems/FurnaceDecor.ts#L25-L26>)保留，不声称所有圆形装饰已清空。
没有可核验的新生图输出或导入参考，不编造模型/尺寸/参考图；本素材按GDD、固定几何和共享palette原生绘制。详见[规格](<../assets/basilisk-pixelspec.md>)/[溯源](<../assets/basilisk-generation.json>)。

## 保留失败与修复

1. [早期被拒八格](<../artifacts/asset-review-r18/b.png>)前四格重复：frame复制插入造成idle挤占动作，最终时间线修复后8格各异；旧图未接线。空layer filmstrip只看到了active crest，不据其声称完整审查。
2. [首native门5/7](<../artifacts/verification/r18-native-01.log>)直走时平滑镜头落后，未看到合格idle。改为普通短键接近/自然停稳，不改时钟、镜头、伤害或阈值。
3. 审查捕获合法震屏y231却被固定屏幕319误判；改同帧真实地面关系，不关闭shake。第二次7/7不掩盖当时尚有此必要项，第三次8/8才含最终修正。
4. [首次绕后案例](<../artifacts/verification/r18-flank-01.log>)已真实击杀与stage4保存，但误比恢复前的UUID；改用既有检查点断言返回的真实新attempt，未改身份策略。
5. [初全局预检](<../artifacts/verification/r18-native-precheck.log>)读到队友尚未写完的文件，完整落盘后type/lint/2194全部通过。队友bundled Node首次因原生包Team ID启动失败、未收集测试；改用既有HostNode25.3.0，不安装/重签/改依赖。
6. 早期只读查询和本次两份新源码写入误带冗余同权限字段，未扩权或请求批准；随后均普通终端CAS读写，不触及其他preset。过长终端行的问题已改用短多行输入，未动冻结素材。

## 当前门与剩余边界

- 当前type/lint/2194单元及8native：见[03门](<../artifacts/verification/r18-current-gates-03.log>)。
- 当前新私有PG上的Scala/真实HTTP：**23/23，EXIT0**，见[后端门](<../artifacts/verification/r18-backend-tests.log>)；不是历史23的复用。
- [完整91/91浏览器](<../artifacts/verification/r18-browser-01.log#L230-L243>)13.1m、真实后端开启、0skip；新Basilisk全案与既有K线/音频/云/三结局/全窗口/第二章等一并回归。
- [构建及diff](<../artifacts/verification/r18-build-diff.log>)EXIT0、[本轮审计](<../artifacts/verification/r18-audit.json>)漏洞0。Phaser1,352.48KB chunk提示仍在，不声称低端稳定60FPS。
- [服务清理](<../artifacts/verification/r18-service-cleanup.json>)确认自有Main/新PG关闭，数据保留，8081/55439拒绝连接；8080保持HTTP200且实际服务的PNG逐字节等于冻结源。
- 合法stage3/cp2夹具不是从新局连续五章，不宣称所有16个mode×朝向组合或三个HP阶段全部attack的原生覆盖。正常右向与八态左向已明确区分。
- 第三章环境、Leviathan/终局专用演出、NPC/物品、完整声景/听感、局外成长、丰富肉鸽内容与最终性能/无障碍仍待开发；本地准入不是外部发布或全量GDD完成。
