# R16：工厂原生环境验收

2026-10-30（Asia/Shanghai，UTC+08:00）。**本轮最终1385单元／80浏览器／23后端通过。全量GDD仍未完成。**
Phaser4.0.0、React19.1.0、TypeScript5.7.3、Scala3.3.6／Java17.0.17与PostgreSQL16.14保持原版本。

## 1. 原生交付与设计边界

- [统一规格](<../assets/factory-environment-pixelspec.md>)和[完整溯源](<../assets/factory-environment-generation.json>)保留唯一实际参考请求、完整原文及原始输出。
- [参考](<../generated-images/image-20261030-031657-49d81b.png>)实际2048×768 RGB；请求1536×1024/high，实际quality未报告。仅作设计参考，不把缩图当生产素材。
- [地形源](<../assets/source/factory-tiles.aseprite>)：256×128、32个唯一16px母片、隐藏原绘与可见tilemap；[PNG](<../public/game/factory-terrain.png>)/[map](<../public/game/factory-terrain.json>)96×96、6列、末4槽空。
- [机器源](<../assets/source/factory-props.aseprite>)：64×64、6静态帧、housing/mechanism/details三层；[PNG](<../public/game/factory-props.png>)/[atlas](<../public/game/factory-props.json>)384×64。600ms仅静态帧元数据。
- 共用20项palette；地形12种opaque色、机器11种；硬alpha、主角橘色0。58项独立文件测试从ASE隐藏栅格、嵌入tilemap与导出PNG/map分别重建，不借生产matcher。
- 实际packed顺序不是母片名单顺序：wall-a=8、clip-fill-a=9在floor-left=10之前。完整映射见[环境清单](<../assets/environment-manifest.json>)。

地形静态7.5/10、机器7/10，均明确复用评者上下文。源验证保留有解释的硬边、开口导管及内部网格描边警告，不声称零warning。
绕线轴可被读成散热器、检修格栅可被读成显示器；作为非交互背景接受此歧义。

## 2. 工厂只读视图与输入边界

[纯plan](<../src/pages/GamePage/game/systems/FactoryEnvironmentPlan.ts>)按实际平台矩形与collapsed状态输出，不供应碰撞。
[适配器](<../src/pages/GamePage/game/systems/FactoryEnvironmentRenderer.ts>)持有4个640px宽纵向RT带、2个隐藏海面pattern RT和2个TileSprite；不另设海速或动画时钟。
真实12/24/28px边界裁剪、跨带源相位、缓存身份失效、部分分配失败、暂停重绘和销毁不可复活均有独立单测。

[加载器](<../src/pages/GamePage/game/scenes/WorldScene.ts>)在ready前检查完整32/6帧；帧0使用字符串、拒绝trim/rotate/错尺寸与越界。
[世界视图](<../src/pages/GamePage/game/systems/WorldRenderer.ts>)采用独立工厂成功开关，未复用第一章蘑菇开关。
普通Graphics在海下，原生海depth0.5，专用after-sea Graphics在1，角色2、真警告/投射物/HP3；PUA、死亡碎片与真实3px海边界不埋入美术。
[工厂视图](<../src/pages/GamePage/game/systems/FactoryRenderer.ts>)保留Core的海Y、控制泡、探针警告与定身反馈。
Core、API、v1 DTO、四项HUD计数、碰撞、镜头算法与既有角色原生资产未在本里程碑改动。

## 3. 已取得的运行证据

| 检查 | 当前结果 |
|---|---|
| [完整代码门](<../artifacts/verification/r16-full-gate-04.log>) | 1385/1385单元、49文件；type/lint/build/audit0/diff均EXIT0 |
| [真实后端](<../artifacts/verification/r16-backend-tests.log>) | 23/23；新自有PG、真实HTTP，无skip，EXIT0 |
| [原生环境](<../artifacts/verification/r16-native-environment-02.log>) | 3/3；源像素、暂停/真WebGL恢复、实际海死亡及缺unused帧拒绝ready |
| [迁移后的探针](<../artifacts/verification/r16-probe-migration-01.log>) | 4/4；原生平台吞噬、复制、暂停与缺资源保档 |
| [普通攀爬](<../artifacts/verification/r16-factory-smoke-01.log>) | 1/1；正常空格跳至第一个真实安全点 |
| [首次完整浏览器](<../artifacts/verification/r16-browser-01.log>) | 79/80，保留原8px单击未击杀的失败 |
| [输入修后完整浏览器](<../artifacts/verification/r16-browser-02.log>) | 80/80，11.8m，后端开启、无skip；次键和弦审查之前 |
| [最终完整浏览器](<../artifacts/verification/r16-browser-03.log>) | 80/80，11.6m，后端开启、无skip，EXIT0；含最终和弦修复 |

首张原生采样的11个ROI全部源像素匹配100%（容差≤2RGB），含28px地板、12px薄台与四边无延伸、低alpha机器、海面与混合填充。
普通暂停2.8秒后画布完全相同；真实WebGL丢失/恢复后，画布与ROI校验和仍相同，四HUD读数及存档冻结。恢复后普通Q并不能避免海触及死亡。
两项负例删除或缩短当前视口尚未使用的机器帧，真实失败UI出现、启动按钮禁用且存档不变。

[探针原生测试](<../tests/e2e/probe-art.spec.ts>)不再用旧flat背景色当证明：源平台先出现，真实consume后消失，露出源背景，而保护平台仍在。
可见probe与绿色3px条须严格注册，不做±1择优；原有body、frame、状态、输入时长和匹配阈值不变。

![本次640×360实际原生场景](<../artifacts/asset-review-r16/native-environment-01/factory-environment-native-4d31b-al-paused-WebGL-restoration/factory-paused-source-native.png>)

实际两图复审7/10、0BLOCKING／0必要修复，非fresh，保持冻结。
海里的小环可读为回形针，但整体仍有规则图标平铺感；未宣称材质真实感完全解决，也未宣称其他机器、整关或GPU性能全部验收。
这些是合法检查点渲染切片，不是新局连续五章旅程。

## 4. 保留失败与执行边界

1. [第一次启动](<../artifacts/verification/r16-candidate-unit-01.log>)使用bundled pnpm exec，意外触发自动安装/重整，测试并未运行。
   原20个直接依赖目录从其保留区恢复，7个声明bin入口重建；新增pnpm文件移出活动树，详见[恢复记录](<../artifacts/verification/r16-dependency-recovery/result.json>)。
   [package](<../package.json>)与[npm lock](<../package-lock.json>)哈希仍与R15相同；此后只用原Node25.3和本地CLI。未运行approve-builds、修改系统安全设置或升级引擎。
2. [首次类型门](<../artifacts/verification/r16-typecheck-01.log>)发现泛型推断过宽。显式使用Phaser.Textures.Texture类型参数修正，无any/cast弱化。
3. [首原生门](<../artifacts/verification/r16-native-environment-01.log>)场景案例已通过，两负例因同一错误文本存在于两个真实区域而strict locator失败。
   仅把locator限定到实际资源失败区域，3/3重跑通过；没有隐藏DOM或削弱阈值。
4. [首完整代码门](<../artifacts/verification/r16-full-gate-01.log>)的audit把同一个/dev/null同时指定为两种config，npm拒绝重复加载。
   改用两个不同的工作区空config，不读取宿主凭据、不修改项目配置；第二次完整代码门全过。
5. 两个只读/纯文本交付曾因编辑接口要求权限字段而没有落盘；候选由Lead在普通工作区权限下应用，再统一运行。未把候选声明成已测试文件。


### 输入回归的独立证据

首整套79/80只缺原有8px单击击杀。没有失败时tick级输入记录，因此不将后续找到的输入缺陷冒称该帧的唯一已证实原因。
[输入适配器](<../src/pages/GamePage/game/systems/InputSystem.ts>)原先仅轮询鼠标primaryDown，完整down/up落在render帧之间会丢失；短J edge也可在同次catch-up的后续consume中重复。
新增[单测](<../tests/game/input.test.ts>)先保留[3红](<../artifacts/verification/r16-pointer-edge-red.log>)，缓存真实pointerdown的世界瞄准点并只消费一次后[14/14绿](<../artifacts/verification/r16-pointer-edge-green.log>)。
原5px/8px浏览器案例、20ms单击、像素阈值与正常跳跃不改；[三次重复6/6](<../artifacts/verification/r16-pointer-repeat-01.log>)，随后整套80/80。

只读审查再发现主键保持时次键down会沿用primaryDown=true；这不是首轮失败的已定位原因。
仅在缓存入口要求本次button===0；保留held轮询，补button1/2和弦，先[2红](<../artifacts/verification/r16-pointer-chord-red.log>)再[16/16绿](<../artifacts/verification/r16-pointer-chord-green.log>)。
共11新增输入单测；暂停/文本输入/越界/销毁边界同时覆盖。Core、射速、伤害、v1和原生观测阈值均未改变。
审查任务自身完成提交被通用Auto review拒绝（主体未执行）；Lead接管并按最新revision结单，没有重试提权。

### 补充实际画面查看

Lead另实际查看吞台前后两张原生图及Sydney清场后的24px竞技场地板；左支台确实消失，保护台与角色仍清晰。
这补充了原2图非fresh评审的观察范围，但不是新的独立分数，也不是所有机器或GPU性能认证。

## 5. 服务与剩余范围

本轮使用[自有新PG目录](<../backend/.local/pg-test.gRDYBK/>)及测试库；不复用宿主数据库或凭据。
最终[服务收尾](<../artifacts/verification/r16-service-cleanup.json>)确认8081与55439释放，8080仍HTTP200，DSH GUI未改。
早先一次PTY关闭PG失败；核对自有PID/目录/端口后以pg_ctl fast正常停止，见[恢复记录](<../artifacts/verification/r16-postgres-stop-recovery.log>)；只重启本轮自有cluster完成最后复跑。
Phaser产物仍约1,352KB，性能警告未屏蔽；低端稳定帧率、完整音频听感、后三章正式美术、第一章NPC/物品/攻击演出、内容与局外成长、新局连续五章浏览器体验继续排队。
总目标保持active；本文件不宣布完整GDD完成。

## 最终归档

[文档后复验](<../artifacts/verification/r16-post-document-gate.log>)记录最终type/lint/1385单元/diff；[源文件快照](<../artifacts/verification/r16-final-source-hashes.json>)保留准入版本及R15冻结文件核对。
[整窗攀爬画面](<../artifacts/asset-review-r16/final-climb.png>)从最终原生回归归档，不依赖下一轮会覆盖的通用截图名。
