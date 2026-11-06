# R39：镜像名称与血条的视口边界修复

> 本轮只读镜像HUD修复已完成新的单独完整174验证与自有服务清理；本包不等于完整GDD。文档后的静态复验和当前文件清单独立记录。

## 改了什么

[WorldRenderer](<../src/pages/GamePage/game/systems/WorldRenderer.ts#L357-L364>)先设置完整名称，再读安装Phaser4.0.0同步计算的显示宽度。[纯标注定位函数](<../src/pages/GamePage/game/systems/cameraFrame.ts#L32-L36>)按`max(名称宽度,64)`将文字与血条作为一组约束在相机两侧8px以内。敌人、敌对箭头与世界坐标不移动；其他Boss不套用这次改动。

血条仍是64×4，填充仍为真实`64*hp/maxHp`；Y、颜色、深度、战斗时序、相机跟随、碰撞、v1/API和已准入原生图保持。不可容纳的超长标注仅居中，未假称缩字/多语种/任意视口问题全部解决。

## 实际画布，不是示意图

[旧右缘裁切](<../artifacts/verification/r38-full-02/clawd-combat-Clawd-ordinar-6b16d-endent-hostile-mirror-shots/real-hostile-mirror-fire.png>)只剩48px血条、61px宽的名称采样；修后[右缘](<../artifacts/verification/r39-hud-scope-05/mirror-hud-mirror-HUD-desk-3199c--pause-and-checkpoint-retry/right-edge.png>)、[自然居中](<../artifacts/verification/r39-hud-scope-05/mirror-hud-mirror-HUD-desk-3199c--pause-and-checkpoint-retry/natural-center-reference.png>)和[左缘](<../artifacts/verification/r39-hud-scope-05/mirror-hud-mirror-HUD-foll-c9359-out-moving-the-combat-actor/dash-left-edge.png>)均为完整64px血条、89px宽/417个有效文字采样。

左缘不是直接改坐标：普通Shift让镜像学到真实冲刺，玩家向左引导，敌人按原规则到达左侧。镜像整个原生不透明像素与已有源匹配，零排除；文字在真实平墙上纳入抗锯齿(alpha>=.02，前景混合分类容差2通道)，之后比较相对坐标和实际RGB时为零容差。参考名称来自真实自然位置且避开实体镜框背景，不使用生产定位函数、文字getter、背景替换、遮罩或生成的正例图片。[量化与独立旧名称拒绝](<../artifacts/verification/r39-real-image-oracle-refined.json>)。

## 验证

- 新增27单元：先红的7个边界断言、左右/滚动/窄视口/宽度/HP比例/死亡失活/复用清理/其他Boss不移，以及拒绝3点和截断名称覆盖的2个检查；World输入冻结，未写回Core。
- 全单元6030/84文件、type/lint、项目真实生产配置build通过；原生源169保持。最终文档后验证：[文档后复验与当前清单](<../artifacts/verification/r39-post-doc-verification.json>)。
- 强化后新3浏览器整组通过，另与旧5px命中原样复跑组成4/4、EXIT0/92.438s。桌面1280×720与800×450、真实左右缘、暂停原画布冻结、恢复检查点的新attempt清除旧字条、单canvas及零guest写请求。
- **最终单独完整174：174/174，EXIT0/1454.388s（[独立全轮证据](<../artifacts/verification/r39-full-validated.json>)）**；必须保全部原171，零跳过/重试/报告flaky，不拼定向或中断结果。
- 新B隔离后端23/23、EXIT0/16.117s；当前包的最终服务清理：[仅自有API/PG已停止、组消失与PG正常关闭](<../artifacts/verification/r39b-services-cleanup.json>)。

## 失败与验证盲点全部保留

第一版夹具一直按D等叙事提示，走穿镜子，敌人实际向左；所需右缘未出现，2例确实失败。改为读实际角色像素、普通D移动到近侧再松键；未放宽位置/像素/血量断言。

早期只抓纯文字前景色，实际仅3个不透明像素/8px，旧裁切也有相同签名，不能证明整行完整。读图量化后主动停整轮，再补强为417个混合文字采样与两条反回归。旧记录不能冒充新证明。

[首full01](<../artifacts/verification/r39-full-01-aborted-summary.json>)为EXIT130/907.135s，122过、原有5px-deceiver1例真实失败、51跳过含中断项。该旧例当时敌人仍活，根因未确定；原样定向后来通过，也不能称根因已修。原171测试源码、名称、阈值未修改，最终已在新的单独完整全轮再次通过。无“部分加补跑等于全绿”。

## 边界与保护

R38最终495加新3test形成498冻结；二次冻结只调整新3test，生产修复未再改。按基线SHA反向核验的[两文件生产差异](<../artifacts/verification/r39-production-only.diff>)确认没有扩展到Core或其他资产。全运行与清理保持498，全部78历史图字节和mtime还原，用户数据库pointer和原Vite3756/8080保持。最终仅README、当前进度、新报告形成新499清单，详见[最终499清单](<../artifacts/verification/r39-post-doc-verification.json>)。

仅同Lead实看，不是独立冷评；普通DOM blur不是OS焦点认证。这不是又一次安全休息室重设计，R27紧凑整备菜单及真实交易/冻结继续保留。全部GDD、完整声景/人类听感、局外成长、新局连续五章、低端性能/输入无障碍及安全门仍未完成，不是项目发布。
