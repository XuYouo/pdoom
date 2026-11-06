# R20 Leviathan：八态实机通过，全阶段清理与完整回归仍待验

## 本轮范围

依照[固定Core合同](<round20-leviathan-contract.md>)完成160×160绿色六边形漩涡，中心80，closed/open各4个手绘相位。
沿用20项palette，源图实际5/7色、硬alpha、英雄橙0；没有可核验的新生图输出或参考导入。
[ASE源](<../assets/source/leviathan.aseprite>)／[PNG](<../public/game/leviathan.png>)／[图集](<../public/game/leviathan.json>)／[PixelSpec](<../assets/leviathan-pixelspec.md>)／[溯源](<../assets/leviathan-generation.json>)均已落盘。
四层32cel＝11压缩＋21链接，独立逐层重建819200个RGBA字节与PNG完全一致。
26×30核心窗口每一源层透明，真实方域、弱点填色、弹幕、HP与吞台提示仍由Core独立绘制，未改物理／DTO／镜头。

![最终真实开壳窗口，1280×720，非合成](<../artifacts/verification/r20-native-03/loom-native-Leviathan-eigh-6beb5-ng-and-paused-WebGL-restore/leviathan-real-open-window.png>)

## 审查与限定修改

团队8人成员上限导致新fresh审查创建被拒，明确复用上下文。匿名首读为机械光圈／闸门，brief核对6.5、1阻断、2必要项。
一次限定修正减弱厚框／横挡板、将L括号改为实体角锚；首帧和八帧family均7/10、0必要项后冻结，不追加抛光。
实际场景初评6.5的两必要均为重复说明／两套HUD，仅在视图收敛为短场景名、React单一行动提示和真实标线旁独有倒计时。
修后同上下文实景7.5/10、0必要项。静图不认证完整播放、严格反向旋转或人工听感。

![八帧源图条带，非游戏截图](<../artifacts/asset-review-r20/c-native.png>)

## 当前实际验证

| 门 | 结果与范围 |
|---|---|
| [独立源](<../artifacts/verification/r20-leviathan-source-tests.log>) | 183/183、filelint及后补全局type EXIT0；早期helper缺失EXIT2保留 |
| [独立适配器](<../artifacts/verification/r20-leviathan-view-tests.log>) | 83/83、type/lint EXIT0；首轮2销毁重入红例由producer修复，断言未改 |
| [独立oracle离线控制](<../artifacts/verification/r20-leviathan-oracle.log>) | 23/23、type/lint EXIT0；只证oracle，不当game证据 |
| [最终Loom实机](<../artifacts/verification/r20-native-03.log>) | 7/7、1.0m、EXIT0：原3机制/真实PCM＋新八态/GL/R和3资源故障重试 |
| [新native单例复跑](<../artifacts/verification/r20-native-02.log>) | 1/1、EXIT0；均为普通导航与真实急左转，不设置隐藏状态 |
| [全局本地门](<../artifacts/verification/r20-current-global-gates.log#L317-L343>) | 3567/3567单元、59文件；全局type/lint/build/diff EXIT0 |
| 完整浏览器／Scala/PG | 本轮未重跑；R19历史96/96与23/23不能冒作当前完整100门 |

原生门保持98%多色源匹配、七other见证、90%可见和10000ink，不读privateWorld或游戏时钟。
真实开壳、再闭壳、暂停冻结、原生WebGL恢复和R切换平台后Body锚点不变均已观察。三种故障涉及PNG、未使用open末帧缺失及错别名，禁止ready并保留检查点，正常重试后可恢复。

## 保留失败及实际像素诊断

[首轮7例](<../artifacts/verification/r20-native-01.log>)6过1失败：初始720ms确实采到了phase1，但窄域顶边local y52覆盖other5的47个见证。
signature0.9797675低于0.98；其中六帧另加Core边1像素为0.9793371，均正确拒绝，不能追认通过。
独立只读复算[实际初始captures](<../artifacts/verification/r20-native-02/loom-native-Leviathan-eigh-6beb5-ng-and-paused-WebGL-restore/initial-closed-real-captures.json>)确认106个row52失配符合真实0x9acfb7×.38混色。
没有改源码／Core／镜头／绘制层级迎合匹配，也未宽恕未知颜色或降低门槛，只延长普通流程到真实重吞与R切换后再观察。
[后续A/B实际captures](<../artifacts/verification/r20-native-02/loom-native-Leviathan-eigh-6beb5-ng-and-paused-WebGL-restore/reclosed-real-captures.json>)各45/45合格、各12张phase1；47个像素恢复sourceRGB，代表signature0.989233/0.987764。
两销毁缺陷、stub类型修正、工具/预览限制及流程偏差均保留在[过程记录](<../artifacts/verification/r20-process-notes.md>)，不称零偏差。

## 未完成与安全边界

本轮仍是合法CP2第一HP阶段切片，不是新局连续五章。phase2/3普通输入击杀、同竞技场死亡／重开与跨章原生清理，以及当前完整100浏览器／真实后端门均待补证，productionReady仍false。
第四/五章环境、NPC/物品演出、完整声景／人工听感、局外成长、性能／无障碍及其余GDD见[总计划](<development-plan.md>)；Phaser1352.48KB大chunk警告仍在，不声称低端60FPS。
[本轮完整审计](<../artifacts/verification/r20-audit.json>)EXIT1，12个moderate条目关联同一[minimatch公告](<https://github.com/advisories/GHSA-g3hv-75wg-m249>)，0high/critical。
[仅生产依赖](<../artifacts/verification/r20-audit-production.json>)EXIT0／全0不替代完整安全门。已核当前level1／未启用projectService等具体触发阻断，但漏洞版本仍在。
未强制major override、安装依赖、伪造版本或对外发布；当前latest上游工具链仍引用公告范围内的旧major，不能把“升级latest”当验证过的修复。
R20未新启API/PG；原8080保留，不假定历史临时服务存活。
