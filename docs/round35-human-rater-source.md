# R35 — Human Rater四态原生源候选

**仅完成原生源与导出技术检查，尚未接入菜单或场景，不是完整GDD成品。** 对应目标回合45。最近的运行时完整验收仍是[R33](<round33-human-rater-state.md>)的136浏览器/23后端；本轮没有重跑或借用旧结果冒充新美术已上场。

## 可见结果

![四种独立静态姿态，4倍最近邻原生预览](<../artifacts/verification/r35-final-native-4x.png>)

从左到右：持记录板、赞许拇指、否定拇指、触手按下薄荷色按钮时的惊讶反应。人、CRT、桌面与按钮均为分层原生像素，不是将概念图缩小。

- [可编辑源](<../assets/source/human-rater.aseprite>)：64×64 RGB，4帧/4个单帧标签、7个可见层、原20项palette。
- [PNG](<../public/game/human-rater.png>)与[图集](<../public/game/human-rater.json>)：256×64，每态64×64。标签为neutral、approved、disapproved、hacked；静态选择，不增加动画时钟。
- 足点(32,60)，底4行透明；[48×48肖像裁取规格](<../assets/human-rater-pixelspec.md>)不改变既有52×60菜单槽。实际接线、支撑面与遮挡仍待验证。
- 桌与腿跨四态共享cel；受劫持时头与躯干真实左移7px。手不遮脸，触手只在第四态出现并触到真实绘制的按钮。

## 来源与审查边界

用户在human-rater-reference-path选择直接Aseprite绘制，覆盖此资产此前的先生成参考方案。[来源记录](<../assets/human-rater-generation.json>)保留原始选择；本轮没有生成参考，也没有凭空补写生图成功记录。

由同一Lead通过live MCP绘制、实际查看头部、手势filmstrip及完整PNG，**不是独立冷评**。模型路由仍[未核实为所要求的组合](<../artifacts/verification/r34-model-route-verification.json>)，本轮没有唤醒或新建助手。

最终MCP validate为Clean，0错误、17项风格提示。保留选择性材质轮廓：肤色边缘、衣领连接与冷色鞋底不强制统一黑描边；52px笔直桌沿是硬质台面，不以噪点或波浪伪装修掉提示。不是0warning声明。

## 实际失败与修正

1. padding1原生导出得到66×66帧、但sourceSize仍为64×64；[真实首红](<../artifacts/verification/r35-source-red-summary.json>)为23通过/9失败。保留[原始错误图集](<../artifacts/verification/r35-padding1-raw.json>)与[原图](<../artifacts/verification/r35-padding1-raw.png>)，不是手工修JSON。
2. 指定torso/frame4的crop_to_content实际裁了整个画布至56×53，[第二次测试](<../artifacts/verification/r35-source-01-summary.json>)因此拒绝。没有将测试期望放宽到错误尺寸。
3. 通过live MCP打开此前保存的原生备份，重新sprite_info；只将所读取的躯干精确ASCII网格写回单cel，保存到正式源路径，重新原生导出padding0。内部透明边至少3px，足以隔离各帧颜色。
4. 修正后的64×64源通过逐RGBA重建比对。最终4倍图与修正前已实看的四态图字节一致，证明没有用坐标/画布修复偷改造型。

## 本轮验证

[独立字节解码测试](<../tests/rendering/humanRaterSource.test.ts>)共34例，通过原生ASE/PNG解析而非Phaser或生产选帧器：四态逐像素相等、palette与硬alpha、底部留白、共享桌/腿、7px平移、头体积、手脸不相交、肖像裁取、拇指方向与触手接触。另有CRC、截断、非法链接、越界cel、软opacity、padding错误、闲置状态缺失/别名及来源SHA反例。测试不依赖被忽略的报告文件。

[真实执行结果](<../artifacts/verification/r35-results.json>)：源34/34；全单元**5370/76文件**；type、lint、build均EXIT0。全unit6.676s，build4.702s。未改变应用代码、交易、存档v1、API、碰撞或计时；没有启动新后端或改动用户数据库指针。

一次只读基线命令误带权限字段，已即时说明；没有据此声称权限已改变或得到退出码证据。[工具记录](<../artifacts/verification/r35-tooling-note.json>)保留此错误，之后不再使用该调用入口。

## 下一步

- 用已有真实rater.pose选择静态帧；不从旧v1推断已经丢失的历史评级。
- 将原生肖像接到现有紧凑槽，不扩展菜单几何或遮挡底部操作。
- 只读场景工作台：依据真实支撑面定位；Loom小平台与C1遮挡、支撑消失等必须实测，候选偏移不是验收。
- 完成资源失效/重试、普通入站/购买/劫持/刷新、桌面与窄屏的实际浏览器和原生像素门后，才考虑runtime/production准入。

当前nativeSourceReady=true，runtimeReady=false，productionReady=false；任务与整体目标仍开放。
