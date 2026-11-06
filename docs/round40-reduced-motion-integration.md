# R40：动态效果减弱与真实观察准备

> 当前动态效果切片已经过独立完整186验收、同轮原生审计和自有服务清理；**完整GDD与项目发布仍未完成**。

## 交付范围

运行设置新增“跟随系统 / 减少动态效果”两个原生radio。默认跟随系统；系统能力无法读取时保守减弱，没有强行覆盖系统偏好的“全动态”模式。偏好单独保存在本机，不进入v1游戏存档或云端API；损坏内容不会在加载时被悄悄重写，读写失败有提示并保留本页选择。

[页面私有hook](<../src/pages/GamePage/hooks/useMotionSettings.ts>)只同步localStorage、matchMedia与bridge，派生值在渲染中计算；加载期间偏好改变后，Scene ready重发最新值，卸载清理监听。实际安装版本仍是Phaser4.0.0，未升级引擎。

[Scene](<../src/pages/GamePage/game/scenes/WorldScene.ts#L237-L240>)在减弱开启时立即reset已运行的shake，后续impact不再启动shake；正常模式保留90ms/原strength。只读表现标记，不改Core、伤害、移动、弹幕、危险预警、跟随相机、时钟、音频或交易。当前CSS菜单与结局位移/动画停用，FOOM回形针与最终信息仍显现；这是当前表现覆盖，不是光敏安全认证或未来Glitch特效已完成。

## 验证方法与已完成专项

- 桌面1280×720和矮屏800×450的真实键盘radio、暂停冻结、关闭不擅自恢复、刷新持久化、存储异常和FOOM回看均有浏览器验证。矮屏设置保持内部滚动，并不表示触屏战斗已完成。
- 系统偏好变化由真实浏览器媒体查询模拟；其中一例延迟原Clawd请求，在Scene ready前切换，再继续原请求，不替换图片。没有声称实际操作了宿主OS设置。
- 摄像机观察只读实际640×360 canvas与HUD：必须出现新伤害且角色存活、时钟继续推进；至少80帧。三色地面边缘与x240/y334/360×18区域逐像素比较，6480像素/帧、RGBA零容差，同时覆盖两轴。
- 正常模式必须产生变化并被减弱判据拒绝，forced/system必须全帧地面不变；不是安全点静止、死亡或冻结冒充减弱效果。实际同轮PNG证据见下方独立整轮记录。
- 新61项动态设置/Scene/反例单测，加29项观察准备单测；当前全6120项/89文件、type/lint、源169、实际prod build通过。Hook单测使用明确的假React dispatcher检验effect边界，不冒称真实React渲染证明。
- Basilisk双案例三次重复6/6；治疗修后重复3/3；联合旧3+新12为15/15。专项只算专项，不能代替完整186。

## 保留的失败与测试准备修复

[第一完整轮](<../artifacts/verification/r40-full-01-failed-summary.json>)实际185过/1失败、EXIT1/1718.534s。Basilisk原生注册1510/1557=96.981%，47差异由32石化填色、5描边和10方向标签半透明背景混色准确解释；不是素材凭空消失。[逐像素归因](<../artifacts/verification/r40-basilisk-occlusion-analysis.json>)。

Basilisk只调整普通D输入准备。150ms曾0/6真实失败：Q回溯27–30px，不足原>40px；失败未隐藏，也未降低位移断言。300ms在留下足够真实历史的同时避免近身遮挡，6/6通过。98%/ink/pose witness、石化/Q/HP和原案例名称保持。

[第二完整轮](<../artifacts/verification/r40-full-02-failed-summary.json>)实际185过/1失败、EXIT1/1687.578s。治疗负观察450ms内HP78→68，6/11帧缺少原生hero；即使残留比为0，仍不能证明无遮挡，原严格拒绝正确。[逐帧分析](<../artifacts/verification/r40-full-02-pickup-failure-analysis.json>)。

修复只在测试中用普通鼠标射击准备场景：每目标最多8×400ms，公开HUD须每击杀+6tokens；按实际原生位置纳入可能激活的右侧敌人，漂移>2px拒绝，最后要求公开时钟实际前进8秒清除旧弹与闪烁。原18移动预算、真实100HP受伤再回血、无休息室收益、非空compute2和**一次450ms全部采样帧**的原负观察不变，不写世界/HP/坐标/时间、不藏演员、不宽mask、不丢帧或重挑接受窗口。

[准备差异](<../artifacts/verification/r40-fixture-pickup-setup-only.diff>)可逆向SHA还原旧源码。旧174名称和断言保留，但两个setup源码已改变，不能再称174源码全部字节不变。旧两次185结果不相加；29项准备单测的首红亦保留。

## 独立整轮准入与保护

[Full03实际执行](<../artifacts/verification/r40-full-03-execution.json>)为**单独完整186/186、EXIT0/1567.559s、零跳过/重试/报告flaky**，未触发超时守卫。原174全部名称与断言保留，新12属于同一整轮；不是把两个185/1或专项拼成通过。

[严格验收](<../artifacts/verification/r40-full-03-validated.json>)复核每例唯一成功结果、511受保护路径零漂移、新C后端23、78旧图恢复和用户pointer。修复后的治疗负观察在这同一整轮保留12个实际采样帧，全部原PNG hash与640×360尺寸复核、hero均可见且无重叠，最大残留0；不是丢掉受伤/缺角色帧后的结果。

[同轮镜头原生证据](<../artifacts/verification/r40-full-03-native-motion-proof.json>)由实际PNG独立复核，不只相信浏览器上报数值：

| 模式 | 采样帧 | 真实HP | 金属边缘行 | 单帧最大变化像素 |
| --- | ---: | --- | --- | ---: |
| normal | 272 | 100→80 | 320,321,322 | 2740 |
| forced | 272 | 100→80 | 321 | 0 |
| system | 272 | 100→80 | 321 | 0 |

每次采样均以该次首帧为基准，不把不同起始机位之间的差异当作动态效果证明。桌面/矮屏设置、FOOM、Basilisk两态、镜头原生起始/受击图、治疗原生图及同轮休息室桌面/竖屏均由同Lead实际查看；不是冷评，静图不单独证明动画或生命变化。

[新C后端](<../artifacts/verification/r40c-backend-tests-metrics.json>)23/23 actual0/16.491s。实际Main29768/PG29467已在[清理记录](<../artifacts/verification/r40c-services-cleanup.json>)停止，退出130/0、进程组消失、PG shut down、8081/55439释放；新数据目录保留。[本轮wrapper/runner/CLI组](<../artifacts/verification/r40-full-03-process-groups-gone.json>)也已消失。原Vite3756和用户54字节pointer的SHA/inode/mtime均保持。

准备修复前后R40生产实现和49资源字节保持不变，原生源本轮未重绘；原78历史图字节/mtime已全部恢复，新截图仅保存在本轮归档。运行与清理冻结511；本报告及两个旧文档落盘后，允许的变化仅为这三个文档，已知清单预计512，必须由[文档后复验](<../artifacts/verification/r40-post-doc-verification.json>)按实际文件确认。

文档后复验再次执行type/lint、全部6120/89、源169、实际生产配置build与diff，并验证不再修改代码、资源、旧图或pointer。以上链接的成功记录产生前，文档收尾不算完成；其结果而非本段计划是最终依据。

## 边界

仅同Lead实看，不是独立冷评。R27紧凑休息室、真实交易与冻结保持，没有把本轮变成再次重画菜单。专用终局原生演出、完整声景/人工试听、丰富种子支路、局外成长、新局连续五章、改键/手柄/触摸、低端性能和安全门仍未完成，不是项目发布或全GDD验收。
