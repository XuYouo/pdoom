# R33：Human Rater真实评级与菜单反馈

本轮完成**评级数据与已有HR标记的代码切片**，不是NPC美术包。全量GDD仍未完成。

## 本轮实际变化

- [评级合同](<../src/pages/GamePage/game/data/humanRater.ts>)记录本次亲历入站的赞许/否定、名义奖励和实际到账，不写入v1存档。
- [真实入站](<../src/pages/GamePage/game/systems/shop.ts#L74-L108>)沿用原HP、Doom与分数公式，保留原Token封顶、交易、密度门槛、一次劫持及+25Doom代价。只把已发生的结果转为结构化数据。
- 购买、修复、失败交易和上下文排序不重算旧评级；真实checkpoint劫持标记优先。界面不解析本地化message，不凭购买后的HP或分数伪造赞许。
- [v1恢复](<../src/pages/GamePage/game/systems/simulation.ts#L24-L48>)没有历史评级数据，诚实显示已结算；已劫持则仍显示劫持。刷新不重发奖励，不增加保存/API字段。
- [休息室](<../src/pages/GamePage/components/RestRoomPanel.tsx#L27-L54>)在原HR标记内显示到账数/已结算/劫持，并提供可访问标签。R27布局、R28完整度分隔、固定继续动作与Tab循环不改；窄屏/矮屏按原CSS隐藏装饰标记。
- 快照复制嵌套评价，避免React侧修改Core数据；休息室依然冻结模拟、技能与音频。

## 红→绿与边界

[首轮模型测试](<../artifacts/verification/r33-rater-model-red-01.log>)真实186失败/2通过，原因是当时尚无评级合同。
新增的实际拾取封顶案例又暴露[一次负到账记录](<../artifacts/verification/r33-rater-overcap-red-01.log>)：已有规则允许拾取后暂超100万，入站再封顶。只将奖励到账记录下限设为0，不修改原余额封顶行为。

[189项模型测试](<../tests/game/humanRater.test.ts>)覆盖边界HP/Doom/分数、额度封顶、5章两室旧档、真实交易/劫持、刷新、冻结与快照隔离。
[9项React测试](<../tests/frontend/human-rater.test.ts>)使用真实SSR组件，不用假HTML代替。三份旧frontend夹具仅补新必填快照字段，原断言不削减。

## 当前验证

| 范围 | 实际结果与证据 |
|---|---|
| 全单元 | [5336/75文件](<../artifacts/verification/r33-unit-all-02.log>)，EXIT0 |
| 类型 / lint / 生产构建 | [types03](<../artifacts/verification/r33-types-03.json>) / [lint02](<../artifacts/verification/r33-lint-02.json>) / [build02](<../artifacts/verification/r33-build-02.json>)，均实际0 |
| 定向浏览器 | [13/13](<../artifacts/verification/r33-state-ui-scoped-01-result-summary.json>)，69.466s，零跳过/flaky/retry |
| 当前单次完整浏览器 | [136/136](<../artifacts/verification/r33-complete-result-summary.json>)，CLI1183.366s，EXIT0；每例唯一结果、零跳过/flaky/retry |
| 集合完整性 | [原R32全部133＋新增3](<../artifacts/verification/r33-full-collection-check.json>)；完整运行无grep、分片或选择器，不拼接窄例 |
| 新隔离后端 | [Scala/真实HTTP/PG23/23](<../artifacts/verification/r33-backend-tests-metrics.json>)，16.396s，实际0 |
| 源冻结 | [437个已知路径](<../artifacts/verification/r33-source-freeze-01.json>)在完整运行前后与清理时零漂移；不是全仓库clean声明 |

[新3项浏览器测试](<../tests/e2e/human-rater.spec.ts>)从合法第三章入口存档，以普通键盘移动、跳跃、射击进入安全点，不读写隐藏World或测试传送。
完整运行两例各17/28动作，HP100，Doom10→赞许24TOK，Doom90→否定12TOK；实际入站elapsedMs均18733。当前余额240/234包含途中收益，不冒充纯评级奖励。
另例真实修复到95HP、扣12TOK至188，再成功劫持梯度校准至85Doom；刷新保持余额/代价/标记。
这些是受控入口夹具，不是从新局连续五章的通关证据。

完整运行还覆盖既有四视口菜单、真实云存档、资源故障保档、原生环境/拾取、WebGL恢复与战斗；没有改变这些旧用例。
[完整事实](<../artifacts/verification/r33-full-decoded-facts.json>)与[三张实看记录](<../artifacts/verification/r33-full-visual-review.json>)对应当前完整运行；[定向六图审查](<../artifacts/verification/r33-scope-visual-review.json>)另记桌面/手机/矮屏，不混淆两次计时。

![当前完整运行：真实入站赞许](<../artifacts/verification/r33-full-review/0-arrival-native-and-ui.png>)

## 清理与保留

[本轮清理](<../artifacts/verification/r33-services-cleanup.json>)已验证Main35710退出130、PG35492退出0，进程组消失、PG状态shut down，8081/55439释放。保留原Vite3756/8080与新隔离数据，不复用用户数据库。
[78张旧图](<../artifacts/verification/r33-current-browser-01-restoration.json>)的原字节与mtime全部恢复，新运行实际改动图另存；用户测试集群指针字节/inode/mtime不变。
Phaser实际4.0.0、React19、固定tick、v1/API不改，无依赖升级、外部发布、模型配置修改或新委派。

## 美术与下一步：尚未完成

- 仅有[四态brief](<../artifacts/verification/r33-human-rater-brief.json>)、[提示词草案](<../artifacts/verification/r33-human-rater-imagegen-prompt.txt>)和[实际支撑面研究](<../artifacts/verification/r33-rater-placement-research.md>)；后者是候选坐标，不是已验证放置。
- [来源状态](<../artifacts/verification/r33-art-reference-status.json>)明确没有可核验生成参考文件、没有参考导入、没有新Aseprite文档/像素/导出、没有场景NPC。提示词草案绝不是生成成功记录。
- 仍按已批准imagegen参考→PixelSpec→live Aseprite分层四静态姿态→实际preview/validate→原生接线验收推进；禁止把概念缩图当精灵，也不能倒写参考时间线。
- HR仍是HTML/CSS占位，不把role=img或状态文字称作原生肖像。接线后需真实支撑/遮挡/清理/资源失败与冻结验证，才能谈美术包准入。
- R32[拾取正式清单](<../assets/pickup-manifest.json>)及其源SHA不变；R26–R31失败/中断继续保留。全GDD、终局演出、专用攻击、完整声景、真人平衡、输入无障碍、性能与发布安全门仍未完成。
