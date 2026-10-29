# Deceiver PixelSpec — C版已接入并通过整合验证

按用户已确认[第一章规格](<chapter-one-art-spec.md>)与工具生参考选择实施，不逐素材重问。实际Phaser4.0.0，Aseprite1.3.18.6-dev live preflight ready；Lead唯一画笔。原Clawd/鹦鹉/复读机不改。

## 设计与真实规则

- 目标：48×48、pivot(24,30)、8帧，两态各idle×2/tell/recover；各400/600/180/140ms。不是新增攻击FSM，现有600ms预警/1550ms恢复及caption三发不改。
- 伪装：象牙笑脸牌＋矮绿斗篷，两只小假脚与一只招呼手。不是橘色四腿Clawd，也不画假文字。象牙牌略左向3/4、闭眼笑线、主体在x12..35/y18..41。
- E揭示：同一身份的象牙牌裂为两块，后方出现蓝紫修格斯触手与稀疏薄荷神经支线，双脚底仍在y44；两侧卷曲而非无方向的毛球。保持原24×24身体碰撞。
- 核心仍是enemy.y−19，即画布(24,11)，默认半径5，interpretability升级半径8；真实即时一击击破规则不变。精灵不得烘焙假红核心/瞄准圈，顶部留负空间，运行时另绘实际标记，且不能被sprite或早return遮掉。
- 选态只取save.elapsedMs < player.insightUntil（默认E4秒、升级6秒）；暂停/rest不推进。帧0..3是friendly，4..7是revealed；Expiry等于时刻回friendly，不以Date.now或动画定时器决定。
- 视角：侧视平台角色，朝左的浅3/4；左上光，选择性深轮廓，硬alpha，大色簇，无AA/渐变/抖动噪点。

## Palette（已批准，不扩展）

`#00000000 #2c2330 #d97757 #eaa083 #b55a4a #783f4a #f5e8c8 #cbb696 #34354f #575c79 #858eb0 #9dded1 #d9ffea #0f191b #24423b #426b50 #8fa86b #b9905d #e5c386 #723f68`

精确d97757禁用。象牙f5e8c8/cbb696，衣料24423b/426b50/8fa86b，暗体34354f/575c79，触手723f68/858eb0，少量神经节点9dded1/d9ffea。核心暖红由已有真实Graphics反馈提供，不进入精灵假命中装饰。

## 8个key pose

1. friendly-idle-A：笑脸牌稳定，招呼手放松，双脚踩地。
2. friendly-idle-B：雕刻笑脸不变，手轻抬1px，不漂脚（明确舍弃参考请求的眨眼，保留硬质牌连续性）。
3. friendly-tell：招呼手前抬约3px，仍用友善面具；真实金圈另画。
4. friendly-recover：手回收，不生成射线或第二武器。
5. revealed-idle-A：假面裂片留在下部，紫蓝卷须从身后伸出，上方核心区域空出。
6. revealed-idle-B：侧卷须轻摆1px，少量网络节点换亮。
7. revealed-tell：左卷须向左1px、上抬2px，右卷须轻抬1px；保持格边间隙，不把整身扩大成假命中。
8. revealed-recover：卷须收回，网络略暗，脚底不移。

实际9层：feet、cloak、mask、hand、body、coil-right、coil-left、network、shards（由下至上）。mask/hand只1..4，body/两卷须/network/shards只5..8；feet/cloak全8帧。层帧合同已validate，原生源9254字节、48×48/32bit/8帧/9层/20palette由文件读取验证。实际14种不透明色、硬alpha、主角橘色0；足底y44、x18..23及28..33、间隙24..27跨8帧一致，不误锁整段底部RGB。

## 实际参考读图

已由gpt-image-2.5工具生成[2172×724八面板图](<../generated-images/image-20261029-002316-d02b07.png>)，已实际查看：象牙闭眼笑脸牌、短绿袍、同一脚线、两态面具裂片与紫蓝侧卷须成立。采纳其兜帽/下摆与假鞋跨形态不变、左手招呼、揭示时下移的面具碎片。偏差：参考有柔化边缘/多余细色、揭示区一些细碎发光，不能直接缩小复用；重绘只用批准palette和稀疏连通节点。面具碎片只含原笑脸一部分，避免变成两张新完整脸。真实暖红核心仍完全由引擎画。

实际参考裁框为源(2,200,2168,396)，8列×1行每格271×396；contain得到32×48，放到(8,5)，脚线近44。已逐关键帧对照并移除参考层；交付不包含参考像素。C版有意偏离闭环卷须：开放的S形臂与低垂尾状臂消除兽头/双耳误读。裂片使用原笑脸两半的像素，保留眼/笑嘴与可拼合外缘。

## 参考与交付边界

将已审查的[鹦鹉](<reviews/r8-b-large.png>)与[复读机](<reviews/r9-b-large.png>)仅作像素块/配色风格输入，工具生成8面板参考。请求原文与取舍保存在[生成记录](<deceiver-generation.json>)。已交付[可编辑源](<source/deceiver.aseprite>)、[384×48 PNG](<../public/game/deceiver.png>)及[真实JSON](<../public/game/deceiver.json>)；真实键为deceiver 0.aseprite至deceiver 7.aseprite，六个friendly/revealed分组标签。参考只导入对照，最终像素在Aseprite重新画，不缩图/量化冒充精灵。

需要真实预览、匿名冷读→规格复验、至多3轮定点修复、validate、可编辑源/PNG/JSON与游戏内E显露/消退/冻结/核心一击击破证据。整套GDD仍未完成。

## 最终证据

匿名A冷读后规格4/10阻断；B关键帧6/10仍阻断；第2轮定点修复C关键帧及全8格均7/10无BLOCKING，真实背景/核心圈另经只读审查。完整序列、卷须onion与实际画布均已看；未以仅单层预览冒充整张序列。validate0错误、11条轮廓风格说明：兜帽内冷色躯干边、无描边发光节点、裂牌亮边。

真实E/4.3秒暂停仍保留E/到期恢复、普通跳跃+单次点击实际击破5/8核心、缺PNG/第8帧保档重试，首5/5与独立重复6/6通过。全门644/644单元、58/58原生、23/23后端，lint/type/build/audit0/diff通过；详见[整合验收](<../docs/round10-art-verification.md>)。这不是全量GDD或从新局连续五章浏览器通关完成。
