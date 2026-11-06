# R45：安全休息室遗物识别图标

> 回合70：**玩家可见代码与定向验证完成，未更新整轮准入**。当前收集213项，但本轮未执行完整213；最近完整准入仍是[R44](<round44-counter-feedback.md>)的单次210/210。全GDD与菜单整体美学仍未完成。

## 实际改动

- 新增页面私有[RestOfferIcon](<../src/pages/GamePage/components/RestOfferIcon.tsx>)，以稳定`offer.id + kind`选择图形，不依赖中文名称、价钱、库存位置或拥有状态。
- [RestRoomPanel](<../src/pages/GamePage/components/RestRoomPanel.tsx>)仅抽出旧helper、添加import及商品行/详情两处传入ID；原交易消息、canBuy/canHack、库存顺序、上下文、存档、冻结、Tab循环与footer不改。
- 16×16代码原生SVG、同一种金色、25px商品/31px详情，保持decorative与不可聚焦；未知ID安全回退，修复/强化/募捐原形状保留。不是新增PNG或Aseprite资产，没有新依赖、加载器或引擎升级；Phaser仍4.0.0。
- 本轮不改CSS、布局尺寸和文字。窄屏详情SVG原本隐藏；该处只验证DOM一致，不宣称看到了详情图标。

| 稳定ID | 形状 |
|---|---|
| `relic:constitutional` | 横纹盾牌 |
| `relic:recursive` | 回环 |
| `relic:interpretability` | 透镜与斜柄 |
| `relic:residual` | 方形端点、主干与斜入分支 |
| `relic:lisp` | 分离圆括号 |
| `relic:context-expansion` | 卷边纸张 |
| `relic:temperature` | 管身、底泡和刻度 |

这些是本项目代码中原创的几何控件，不是把生图当精灵直接导入。保留原UI配色、阴影和选中状态；图形身份不靠换颜色区分。

## 已执行的验证

- [22项新增静态展示测试](<../tests/rendering/restOfferIcon.test.ts>)覆盖七ID、未知/原型键回退、其它kind、装饰性与真实Panel复用；它们是SSR/结构契约，不是人工辨识或浏览器像素证明。
- [三项新增实际浏览器用例](<../tests/e2e/rest-icons.spec.ts>)分别使用1280×720、844×500、390×844；从合法初始休息室普通操作，不读World、瞬移、改活动存档或覆盖输入。
- 在公开SVG有色位置真实点击七图标；列表/详情路径一致、同色且在16×16内，商品25px、选择不交易、底部位置不变。点击选中可能经既有focus路径，不单独主张onClick唯一因果。
- 两张真实640×360拷贝均230400不透明像素且超过20色，间隔至少1100ms并逐字节PNG相等；普通J/Q/Esc不解除休息冻结。
- 真购高温200→170 TOK；真劫持Lisp使Doom60→85、检查点11→21、库存追加；完整实际存档匹配预期。刷新后新attempt、拥有状态与图形仍在，继续变为关闭检查点1并可正常暂停。
- 与旧四视口菜单一起，新轮[native02](<../artifacts/verification/r45-r70-native-02-metrics.json>) **7/7、actual/CLI/owner0、42.488s**，零skip/retry/flaky，556源码、78旧PNG和pointer无漂移。不是完整213，也不与前次7/7拼接。
- 最终代码[静态/单元记录](<../artifacts/verification/r45-round70-final-code-verification.json>)为type05/lint05/unit02/build02全actual0；**6375单元、102文件**。当前[213身份收集](<../artifacts/verification/r45-round70-collection-audit.json>)保留全部旧210及旧205/202子集，新增仅三项菜单例；收集不是执行。

## 实看与一次修正

初版[native01](<../artifacts/verification/r45-r70-native-01-metrics.json>)也为7/7、43.394s，但实看发现残差像铃铛，功能通过不能替代表意成功。只改该路径为分支，保留全部其它图与行为，再重新执行上面的7例。

Lead与只读UI复评均实际看图，**非冷评**；第二次确认残差先读作端点连线而非铃形，必要余缺0，停止此枚修正。回环箭头方向稍弱属于可选P3，不扩大打磨。

- [桌面1280×720](<../artifacts/verification/r45-r70-native-02/rest-icons-rest-relic-icon-7b5d1-sactions-and-saved-identity/desktop720-interpretability.png>)
- [短横屏844×500](<../artifacts/verification/r45-r70-native-02/rest-icons-rest-relic-icon-f198d-sactions-and-saved-identity/short-interpretability.png>)
- [竖屏390×844](<../artifacts/verification/r45-r70-native-02/rest-icons-rest-relic-icon-4cef7-sactions-and-saved-identity/portrait-temperature.png>)
- [审查边界与实际图片SHA](<../artifacts/verification/r45-round70-reviews.json>)：不外推触屏战斗、独立冷评或全部31px详情；附件失败会使测试失败，但可能中断附加诊断检查。

## 仍需做什么

这一步只解决七种商品长得相同的问题，**没有把整个菜单变成最终游戏菜单**。重复方框/层级与满载仍显示绿色的进度条继续优先处理；先做下一项可见UI改进，再合并必要整轮回归，不用再一轮纯验收代替界面工作。

本轮未启动新后端或完整213，不创建F数据，不重跑旧不可变准入。A/B/C/D/E数据退休不复用；原Vite保留。后续完整运行必须新冻结、明确新F写域/独占服务并归还78旧图与pointer。实体Safety Fence、局外成长、章别声景/试听、多设备、性能/安全/授权和连续五章三结局证据仍按[开发计划](<development-plan.md>)继续。
