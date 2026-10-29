# 第二轮：上下文窗口与安全休息室

本轮补齐 GDD 机制 4/5 的第一章可玩实现，不代表后四章或最终结局已经完成。游戏仍使用项目固定的 Phaser 4.0.0。本轮未新增网络或持久化实现；交易结果通过 bridge 交给 React。

## 一、单一事实来源

- 持久字段仍严格使用 `GameSaveData.schemaVersion = 1`，没有新增未知 JSON 字段。
- `inventory` 保存已拥有遗物及其装备顺序；`upgrades` 保存永久升级；`donated` 保存本局一次捐款。
- 容量、词条是否生效、伤害、射速和技能时间均由当前存档推导。它们不额外持久化，避免装备排序后出现基础属性漂移。
- `tokens` 是商店货币 TOK；上下文容量以 K Context Tokens 表示，两者不是同一种资源。

## 二、checkpoint 编码（lead 已确认）

| stage=1 的 checkpoint | 物理安全点 | 状态 | 本休息室劫持 |
|---|---:|---|---|
| 0 | 起点 | 正常游戏 | 不适用 |
| 1 | x=1380 | 已离开的安全点，保留旧存档语义 | 不再开放交易 |
| 2 | x=2180 | 已离开的安全点，保留旧存档语义 | 不再开放交易 |
| 11 | x=1380 | 正在休息室 | 未使用 |
| 12 | x=2180 | 正在休息室 | 未使用 |
| 21 | x=1380 | 正在休息室 | 已使用 |
| 22 | x=2180 | 正在休息室 | 已使用 |

所有定位和进度比较必须经过 [decodeCheckpoint](../src/pages/GamePage/game/data/checkpoints.ts)，不能直接比较编码整数。未知编码安全拒绝、保留原 DTO，不猜测或降级为起点。第一章完成仍保存 stage=2、checkpoint=0；此扩展不改变后续章节的协议。

### 转换

```text
0 --抵达第1安全点/一次评级奖励--> 11
11 --成功的一次奖励劫持--> 21
11 或21 --rest-continue--> 1
1 --抵达第2安全点/一次评级奖励--> 12
12 --成功的一次奖励劫持--> 22
12 或22 --rest-continue--> 2
2 --击败Gato--> stage2 / checkpoint0
```

普通购买、修复、捐款与排序不改变当前编码；它们更新同一个完整 DTO。离开后不能重新打开该休息室。旧 1/2 存档直接继续游戏，不追发新评级奖励，也不会强制插入一次商店。

## 三、防刷新/重新进入刷取的理由

1. **评级奖励**只在物理进度从更早安全点进入更晚安全点时发放。发放时同步把 checkpoint 写成 11/12，并发送一个含新余额和新编码的完整 `checkpoint` 事件。
2. **刷新恢复**11/12/21/22 只重建冻结休息室，不走入站奖励函数。因此恢复任意次数，余额都不增加。
3. **奖励劫持**将获得的唯一遗物/升级、Doom +25 和编码 21/22 放进同一个 DTO。再次点击、重新载入或改选另一个商品都会因 hackUsed 拒绝。
4. **离开商店**保存闭合编码 1/2。游戏判断进度时使用解码后的物理 room，已到达该 room 的角色不会再次触发它。所有商店命令还会检查运行时必须处于 rest，不能在战斗中绕过 UI。
5. **普通遗物/升级**用已有唯一 ID 证明所有权；重复购买不扣款也不叠加。捐款用已有 `donated` 标记防重复。修复不是免费奖励：每次实际回复都扣费，满血拒绝交易，没有出售或退款路径。
6. **重建世界**清除已到达安全点之前的敌人和拾取物，避免保存后回到段首再领取旧奖励。商店入口也移除这些已越过实体，并清理敌弹、回溯与冲击波。
7. **保存粒度**只在正式安全点、交易、排序、离开与章节通过时发完整快照；战斗中查看上下文是只读，不为了排序保存未结算的中段拾取物。

这些保证适用于“恢复最新合法快照”的正常流程，不是强反作弊。客户端用户可以手工篡改或回滚旧文件；后端仍需验证大小、归属与值域。React 云保存必须按同一 run 串行提交或等效地防止乱序覆盖；否则旧 cp11 请求晚到可能覆盖新的 cp21。这属于保存传输边界，不能靠客户端商店代码声称已经解决。本地同步写也不能代替跨设备的服务端并发控制。

## 四、上下文与所有词条的实际效果

基础武器/技能固定预留 8K。默认容量 32K；上下文卷轴或永久内存扩容将容量提高到 128K，两者不叠加，商店会禁售冗余的第二种扩容。

当总占用 **大于或等于容量** 且至少有三件遗物时：奇数列表的一件中间遗物失活，偶数列表的两件中间遗物失活。失活仍占用容量。只重排、不能在战斗中增删或重排。过载还会使每第四发攻击变为三个无伤 Lisp 括号；活跃 Lisp 遗物将间隔改为八发。发射序数使用持久化 `actionCounts.shots`，不是每次恢复清零的隐藏计数器。

| 遗物 | 占用 | 价格 TOK | 实际作用 |
|---|---:|---:|---|
| constitutional 宪法毛线 | 6K | 24 | 承伤 ×0.85 |
| recursive 递归自升级 | 10K | 32 | 普通与暴击射击伤害 ×1.25 |
| interpretability 机械可解释性 | 8K | 28 | E 持续 4→6 秒，暴露核心半径 5→8px |
| residual 残差连接 | 8K | 28 | Q 冷却 6.5→5 秒 |
| lisp 符号校验 | 6K | 22 | 过载无伤弹频率每4→每8发 |
| context-expansion 上下文卷轴 | 12K | 52 | 容量 32→128K，自身仍占12K |
| temperature 高温采样 | 10K | 30 | 射击间隔185→148ms |

| 永久升级 | 价格 TOK | 实际作用 |
|---|---:|---|
| reinforced 加固 | 32 | 承伤 ×0.8，与宪法毛线相乘；HP上限仍100 |
| overclocked 超频 | 36 | 射击伤害 ×1.2，与递归自升级相乘 |
| expanded 永久内存扩容 | 70 | 容量128K，不占Context Tokens |
| calibrated 梯度校准 | 34 | 暴击倍率2.5→3，E冷却8.5→6秒 |

定义与价格的事实来源为 [relics](../src/pages/GamePage/game/data/relics.ts)，推导规则为 [context](../src/pages/GamePage/game/systems/context.ts)。无伤弹用 `harmless=true`、`damage=0`、`glyph` 明确标记；战斗碰撞首先排除它们，所以即使 E 暴露核心，它们也不能触发一击必杀、伤害 Boss、产生反弹或提供击杀奖励。

## 五、交易与休息室生命周期

- 抵达安全点后 `mode='rest'`；`stepWorld` 直接返回原状态。敌人、弹幕、重力、elapsedMs、免疫和冷却全部停止，不只是暂停显示。
- 入站评级：完整度至少60且Doom不超过80时，奖励24至42 TOK（按当前得分推导）；否则12 TOK。只发一次，并显示实际结算文案。
- 修补：12 TOK恢复35 HP，最高100。
- 捐款：20 TOK，写 `donated=true`。它为未来第三章提供标记，当前没有虚构的第三章战斗效果。
- 劫持要求：Context使用密度至少75%，且 **Doom >50**；每室一次，只能免费取一个未拥有的遗物或升级；Doom增加25，最大99.99。不能免费修复或免费捐款。
- `rest-continue` 总是可用，不需要消费，也不需要清空过载。Esc或普通resume不能绕过rest状态。

## 六、React / Phaser 接口

契约见 [bridge](../src/pages/GamePage/game/bridge.ts)。

新增命令：`shop-buy(offerId)`、`shop-hack(offerId)`、`rest-continue`、`context-reorder(from,to)`、`request-context`。

新增事件：`context(snapshot)`、`rest-opened(snapshot)`、`rest-updated(snapshot)`、`rest-closed`。

购买/排序成功的事件顺序为：`checkpoint` → `context` → `rest-updated`。离开顺序为：`checkpoint` → `rest-closed` → `context`。到达顺序为：`checkpoint` → `context` → `rest-opened`。

- [ContextPanel](../src/pages/GamePage/components/ContextPanel.tsx) 接收 `{ bridge, snapshot, editable? }`。
- [RestRoomPanel](../src/pages/GamePage/components/RestRoomPanel.tsx) 接收 `{ bridge, snapshot }`，包含上下文列表和商店。
- 两个面板只发送 bridge 命令，不触碰 localStorage、网络或全局状态。
- 按钮具有明确名称、原生键盘可达性、disabled状态和原因；商店顶部总有“不再交易，继续前进”。外层可访问 Dialog、焦点陷阱、返回菜单和云端保存由 React 页面整合方负责。

## 七、验证证据与边界

2026-10-27 本轮执行：

```sh
npm run typecheck
npm test -- tests/game tests/frontend/context.test.ts
npm run lint
```

结果：TypeScript与lint通过；9个测试文件、66条测试全部通过，退出码0。覆盖每种遗物/升级的实际伤害或技能/容量效果、无伤弹不能触发核心秒杀、刷新后奖励/劫持幂等、旧编码兼容、冻结计时、拒绝非法交易/重排、无购买也可完整击败Gato三阶段，以及Panel可访问标记与快照隔离。浏览器联调由lead统一执行，本记录不冒称已做本轮浏览器验收。

仍未包含完整第二至第五章、最终结局、服务端防回滚并发控制、全部设备输入和最终平衡。美术替换由lead负责，当前模块不生成sprite或修改Aseprite。
