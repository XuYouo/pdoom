# R47：反击回归的普通输入准备

> 回合72–73：输入修订及定向完成；新单完整216实际**215/1、EXIT1/2255.909s**，未准入，正式仍R44。旧反击5和菜单10在本轮均通过，但不能拼为整轮全绿。

## 为什么改测试，不改游戏

[R46完整失败](<../artifacts/verification/r46-full-01-execution.json>)中三个准备位置越过原220上限，另一条两坑路线死亡后超时。公开trace给出采样与按键之间继续位移的证据，不能唯一归因某一环。实际控制器仍有摩擦、土狼时间与固定tick；本轮不改Core、输入绑定、碰撞、API/v1、资产、依赖或R45/R46菜单。

## 实际改动

- [只读控制观察器](<../tests/e2e/counter-controls.ts>)在一个rAF中复制原生640×360画布并读取RGBA；不用持键期间的PNG编码/回传/再解码做控制反馈。角色连通域门槛不变；四行地板签名改成等价精确Set匹配。
- [原反击用例](<../tests/e2e/counter-feedback.spec.ts>)在地面用有限普通按键段，松键后再判断中间目标区间；最终仍要求`170≤x<220`。跨坑仍是普通D/Space/Shift，原10..48px窗口、90s/180步、两坑、真实充能、冻结、保存与继续门全部保留。遇到真正死亡dialog及时保留诊断并失败，不把不可见角色一概视为死亡。
- 只读复核发现清理异常可能替换主错误的P2，已改为显式主错误、独立释放/检查/附件和annotations。原错误原样抛出；没有主错误时，任何清理异常仍使测试失败。保留ES2020，不为AggregateError升级配置。
- [最终AST核对](<../artifacts/verification/r47-original-assertions-preserved-v2.json>)确认原194个expect-root节点和4个标题表达式（5例）逐一相等；不是只比较测试总数。

## 已执行证据

- [42项合成合同](<../tests/rendering/counterControls.test.ts>)通过：33项扫描/决策、9项异常保留。它们不是浏览器或真实sprite证明。
- 初版[native01](<../artifacts/verification/r47-r72-native-01-metrics.json>)5/5、实际0/92.744s；对应初版控制与旧清理，原报告/38图PIL证明保留，不当作修订版本证明。
- 修订版[native02](<../artifacts/verification/r47-r72-native-02-metrics.json>)5/5、CLI/driver/owner0/94.796s，零skip/retry/flaky，562源和78旧PNG/pointer不变。该版电源断言使用与完整driver相同的`-i`，而初版scope为`-dims`；这不证明实际OS显示状态或唯一因果。
- 修订版[独立PNG核对](<../artifacts/verification/r47-r72-native-02-counter-proof.json>)38张、15,864角色源像素、7,368提示像素、零通道容差；显示到期10秒、Lisp正16/负0、111条路线观察与正向冻结/GL恢复均通过。报告SHA及spec/helper双源SHA绑定。
- [只读复核](<../artifacts/verification/r47-round72-lifecycle-review.json>)task168完成、P2闭合；审查员未执行/看图/读取native02。本轮新源不冒用旧task154源码绑定。Lead实际查看两版的真实奖励与休息室/继续原生PNG。

## 边界与后续

`readMs`仅浏览器copy+scan，不是RPC、输入或Core时钟；70ms按键段不保证70ms模拟。满opaque黑帧可以没有角色，pause/持续缺失仍受旧预算和完成门约束。空Q、32K合法初始fixture、公共DOM blur、已暂停GL恢复、量化时钟、非逐帧PNG路线等原边界保留。

## 新单完整结果与保留的失败

- [新G后端](<../artifacts/verification/r47g-backend-tests-metrics.json>)23/23、actual0/17.865s。
- [完整216](<../artifacts/verification/r47-full-01-execution.json>)实际215/1、CLI/driver/owner1、2255.909s；零skip/retry、报告flaky0，无全局超时或中断。
- [同报告身份与失败明细](<../artifacts/verification/r47-full-01-failure-summary.json>)确认全部旧216身份及单结果保留；原5反击和10菜单全部passed，唯一失败为未修改的Sydney原生PUA释放/长暂停例。
- Sydney实际53577ms、status failed，预算180000ms；最后inspectBatch返回后记录pageClosed，下一isVisible失败，mouse.up清理也失败。不是180秒超时；没有现成OOM或浏览器退出原因证明。
- [trace提取](<../artifacts/verification/r47-full-01-sydney-trace-extract.json>)保原zip/timeline SHA、末尾API和原生观察。最后图有角色与Sydney；不能据此推断关闭原因或改玩法。task170只读诊断继续，原180s/240s及像素/释放门不动。
- [post-run workflow](<../artifacts/verification/r47-full-01-post-run-workflow.json>)实际0仅表示诊断完成；wholeRunAdmitted=false，严格完整acceptance及五项子审计均未执行。task169只读绑定无阻断P2，不代替运行。
- 完整单元首轮6426/1的[原始失败](<../artifacts/verification/r47-r72-unit-01-raw-failure.json>)保留：Omega用例5154.132ms、通用STACK_TRACE_ERROR，无更具体原因。
  只把新合同的通用深比较换成byteLength和逐字节相等；原Omega测试、timeout、worker/config不改。新的完整unit02为6427/104实际0，不据第二次通过断言唯一原因。native02之后只有该等价单元检查与文档改变，spec/helper/生产源未变。
- [自有G清理](<../artifacts/verification/r47g-services-cleanup.json>)已完成：API预期SIGINT退出130，PG退出0/组消失/控制状态shut down；8081/55439释放，原Vite3756保持。
  [归还记录](<../artifacts/verification/r47-full-01-restoration.json>)确认563源无漂移、78旧PNG bytes/mtime与pointer保全；G数据与A–F一起退休，不复用、不信号历史PID。

## 同轮菜单实看（不代表失败整轮准入）

Lead实际看了1280×720满载、844×500短屏、390×844扩容截图：未选中行保持安静，满载暖条与正常浅绿有区分，继续按钮均在固定底部；只评已有改动，不追加可选polish。

![本次整轮的桌面安全休息室](<../artifacts/verification/r47-full-01/rest-style-rest-visual-hie-6720d-nsion-restores-normal-meter/desktop720-full.png>)

[短屏](<../artifacts/verification/r47-full-01/rest-style-rest-visual-hie-37381-nsion-restores-normal-meter/short-full.png>) · [窄屏扩容](<../artifacts/verification/r47-full-01/rest-style-rest-visual-hie-e0f49-nsion-restores-normal-meter/portrait-expanded.png>)

全GDD继续；不把验证修复冒充新玩法、完整场景化菜单或可发布成品。下一步只按Sydney关闭证据做最小诊断，不退回菜单或放宽旧守卫。
