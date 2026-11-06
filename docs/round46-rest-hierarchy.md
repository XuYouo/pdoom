# R46：休息室状态条与安静层级

> 回合71：生产改动、定向与实看完成；新的单完整216实际为**212通过/4失败、EXIT1/2215.778s**，未获得整轮准入，最新正式仍R44。本轮合并了R45/R46菜单改进执行完整回归；失败保留，不拼定向结果。

## 玩家实际看到的变化

- 未选中商品和正常构筑槽由重复方框变成细线分隔的列表；选中项仍保留金色底与左侧标记，已拥有状态不再盖掉选中底色。价格与继续是主要操作，劫持保持次级。
- 上下文满载32K/32K与溢出42K/32K显示暖色满条；真实购买卷轴后54K/128K变为浅绿部分填充，底槽保留余量。仍有数字和失活文字，语义不只靠颜色。
- 失活槽有暖底和左侧警示边，正常槽降低框密度；排序后提醒跟随新的中间失活项。布局、尺寸、间距、滚动区域和footer不变。

## 代码边界

[ContextPanel](<../src/pages/GamePage/components/ContextPanel.tsx>)只把既有DTO的`overloaded`、`slot.active`投影到两项data属性。容量阈值、`Math.min`、aria-label/value/max、排序命令、库存/交易/保存均不改。

[休息室样式](<../src/pages/GamePage/components/rest-room.css>)只改局部颜色、阴影和进度条皮肤。保留行与槽的1px边框占位；不改变grid、padding、gap、media和footer尺寸。条色用CSS变量与WebKit/moz填充规则显式绘制，不依赖浏览器默认绿条；实际验证浏览器为Chromium，不声称Firefox已实测。

## 已完成的验证

- [10项新增SSR/样式合同](<../tests/rendering/restMenuStyle.test.ts>)验证正常、满载、溢出、扩容与完整/compact投影、可访问标签和排序控件。不是浏览器像素或人类辨识。
- [3项新浏览器业务](<../tests/e2e/rest-style.spec.ts>)覆盖1280×720、844×500、390×844：真实重排、200→170→118 TOK、32/32→42/32→54/128、刷新新attempt和继续→检查点1。合法初始rest后只用普通输入，未读World或改活动存档。
- 与旧四菜单及三图标一起，[native01为10/10、actual/CLI/owner0、58.564s](<../artifacts/verification/r46-r71-native-01-metrics.json>)，零skip/retry/flaky，559源与78旧图/pointer无漂移。不是完整216。
- [独立条色审计](<../artifacts/verification/r46-r71-native-01-meter-proof-v2.json>)解码12张真实条截图，检查严格RGB及连续填充比例，拒绝24个只在内存改色/改宽负控。另核三对非空640×360冻结图与旧四视口初始公共几何逐字段完全相等。像素二时点不是全部内部时钟的直接观测；实际保存DTO另守卫elapsedMs不推进。
- 类型检查、lint、生产build及**6385单元/103文件**已通过。整轮失败，不更新正式准入；同轮菜单10项均过也不拼成216全绿。

## 完整执行与失败交接

[单完整216执行](<../artifacts/verification/r46-full-01-execution.json>)实际212/4、EXIT1/2215.778s；零skip/retry/flaky、无中断或全局预算超时，所有旧身份保留。四个失败均在旧[反击反馈用例](<../tests/e2e/counter-feedback.spec.ts>)：三个定位准备的原`170≤x<220`门得到222.5、235.5、222.5；另一个真实跨坑路线90s超时，失败图已有死亡界面、钟停00:14。没有修改游戏或放宽断言来让它通过。

[三份初始trace抽取](<../artifacts/verification/r46-full-01-counter-initial-trace-extract.json>)显示持D最后采样188.45/204.5/195.5，松键后越过上限；[路线trace抽取](<../artifacts/verification/r46-full-01-counter-route-trace-extract.json>)保留167个实际公开像素结果与按键请求。第二断层最后帧余量20.5px，解码调用167.9ms，之后才请求Space，下一帧无角色；第一段有跳跃/Shift/落地，第二只有Space。另须考虑真实摩擦/土狼时间；这些trace时钟没有对Core或Node门校准，不能据此宣布生产因果已唯一证明。

[失败汇总](<../artifacts/verification/r46-full-01-failure-summary.json>)与[同轮诊断](<../artifacts/verification/r46-full-01-diagnostics.json>)已保留。新F后端23/23、EXIT0/17.499s；整轮和清理560源无漂移，78旧PNG bytes/mtime已归还、pointer不变，自有API/PG已关闭、端口释放，原Vite保留。严格整轮acceptance及其像素/音频子审计**没有执行**，不生成通过收据。

审计只读复核曾发现v1附件根过宽的P2，新增v2按当前运行目录限定文件附件，历史几何只显式允许R45，并绑定报告SHA；旧v1不覆盖。v2重审的是同一native01原报告，不是新浏览器运行；12图/24负控、2字节正控/4路径负例均通过，task166复核闭合。满载错宽负控同时改变左起点，不能唯一归因某一检查的P3保留。

下一步task167修复普通输入准备/新鲜像素观察与失败诊断，原位置、窗口、步数、时间、两坑、真实充能与保存门槛不放宽；验证后新G数据与新冻结完整216。当前F与A/B/C/D/E全部退休，不复用或信号历史PID。实体围栏、章别谱面等不混进此修复；全GDD保持在研。

## 实看

Lead实际查看桌面满载/扩容、短横屏满载、竖屏扩容；只读UI复评查看5张新图与2张R45对照，认为框密度下降、主次/条色正确，必要P2为0，停止无谓微调。审查为非冷评，不把测试通过当美学成功。

- [桌面满载](<../artifacts/verification/r46-r71-native-01/rest-style-rest-visual-hie-6720d-nsion-restores-normal-meter/desktop720-full.png>)
- [短横屏满载](<../artifacts/verification/r46-r71-native-01/rest-style-rest-visual-hie-37381-nsion-restores-normal-meter/short-full.png>)
- [竖屏扩容](<../artifacts/verification/r46-r71-native-01/rest-style-rest-visual-hie-e0f49-nsion-restores-normal-meter/portrait-expanded.png>)
- [复核边界](<../artifacts/verification/r46-round71-reviews.json>)

仍是紧凑整备菜单，并非完整场景化休息室或全GDD成品。触控战斗、完整声景/试听、实体Safety Fence、局外成长、多设备/性能/安全/授权和连续五章三结局证据继续。本次F独占服务已结束并归还原资源；后续必须使用新G，A/B/C/D/E/F均不复用或信号历史PID。新的冻结中继续禁止源/测试/文档写入，保护78旧图、pointer和原Vite。
