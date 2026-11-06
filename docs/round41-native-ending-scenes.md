# R41：三种终局的原生静态分镜源

> **源素材已完成，运行时尚未接线。** 这不是完整终局动画、声景或完整GDD验收。当前游戏运行版本仍以R40为准。

## 交付

- [可编辑Aseprite源](<../assets/source/ending-scenes/ending-scenes.aseprite>)：256×128、3帧、5个可编辑语义层、32色、硬alpha。
- [原生图集](<../assets/candidates/ending-scenes/ending-scenes.png>)与[图集索引](<../assets/candidates/ending-scenes/ending-scenes.json>)：768×128，aligned / warden / foom各占一个完整256×128矩形，没有裁边、旋转或间隔。每tag只有1帧，1000ms是静态元数据，不是三帧循环演出。
- [规格](<../assets/ending-scenes-art-spec.md>)、[PixelSpec](<../assets/ending-scenes-pixelspec.json>)与[生成/验收记录](<../assets/ending-scenes-generation.json>)保留了范围、SHA、角色来源和限制。

![原生终局分镜2倍预览](<../artifacts/verification/r41-ending-scenes-2x.png>)

第一张以桌面、橘色Clawd和物理OFF开关表达克制；第二张以约束环、办公椅、保留触手的Clawd与门外被隔离的眼睛表达守望；第三张以碎裂虚拟窗口、12枚像素回形针和笑脸表达FOOM。第三张仍只是页内虚拟画面的静态结果，没有任何系统/外窗操作。

## 不改变角色，也不改写结局规则

Clawd不是重新生成的近似形象。前两张分别无损复用已准入aligned与foom图集首32²区域，严格整数2倍；1728/2184个不透明像素逐字节相等，眼位、短臂、四条分离短腿均保留。FOOM分镜没有暗藏第三个角色。

所有前景道具与角色不重叠；12枚回形针在4邻域和8邻域下各为12个连续轮廓，也不覆盖笑脸。整张图每个RGBA字节均从ASE独立重建并与实际PNG核对，不以“文件已加载”替代像素证据。

此包不进入public目录，不改Core/物理/真实Doom阈值/API/v1/存档/成绩上传/声音。规划包围盒是构图指南，最终位置以原生源及像素契约为准；椅子最下方脚轮保留2像素底边距，主角仍处于安全区域。

## 实际检查与修正

新[源测试](<../tests/rendering/endingSource.test.ts>)30/30，含15项正向与15项负向控制：拒绝PNG单通道篡改、atlas串帧、隐藏必要层、角色缺失或单像素变化、覆盖笑脸、非法色、半透明以及草图层泄漏。复用现有只读ASE/PNG解码器，不导入运行时逻辑。

本轮[完整检查](<../artifacts/verification/r41-checks-01.json>)：全单元**6150/6150、90文件，actual0/8.198s**；types actual0/3.517s、lint actual0/3.094s、实际生产配置build actual0/5.159s。新增源专项actual0/0.716s。Phaser大chunk警告仍在，不宣称低端性能达标。

Aseprite首次机械检查确实出现1个error：小回形针斜角有24个孤立像素，另外开关线有3个孤立像素warning。已补连续像素台阶，而非关闭检查；最终**0 error**。保留8项轮廓风格warning、5项直线边界note和2项非统一轮廓note：它们来自界面/金属直边、选择性高光和原Clawd轮廓，未为消除提示而抖动直线或重画角色。

palette analyze报透明色自重复；独立ASE读取已证明32项互异、仅1个透明项。5个未用槽位保留在固定调色板中，未强行重映射现有角色。

实际看过每个绘制阶段，并看过最终1倍和2倍图集。只由同Lead审查，**不是冷评、没有独立视觉评分**。守望者曾出现触手与椅垫同色的问题，已只压暗背景并连接约束杆，角色像素没有改动。

## 生图来源的诚实边界

[实际后置对照图](<../generated-images/image-20261103-133214-03f389.png>)由本轮真实functions.image_generate调用产生，模型工具回报gpt-image-2.5，输入为两个已存在的Clawd图集；2172×724及SHA已复核。[实际提示词](<../assets/ending-scenes-verified-generation-prompt.txt>)与[核验记录](<../artifacts/verification/r41-visible-reference-reading.json>)可追溯。

**它产生在原生三分镜及首次导出之后，只是后置对照，不是那些像素的生成来源。** 早先缺乏可核验调用的“已生图/已参考”叙述与自写元数据已撤回；未核实提示词移入验证历史，没有冒称先参考后绘、导入参考层或直接缩图成品。原生PNG的前后SHA保持一致。

## 下一步：运行时接线仍待验收

后续替换当前SVG/CSS/emoji占位表现时，必须保留真实最终Doom和叙事0/50/100标签的区别、跳过/Escape/结算焦点、返回/新局/云存档、计时冻结及幂等上传。需要实际图片加载/失败路径、桌面/矮屏/竖屏的整数缩放与原生像素见证；所有新增动效继续服从R40本机/系统减弱策略。

本轮没有重新执行浏览器或Scala后端测试，不能把R40的186/186与23/23冒充本轮结果。[最终源清单](<../artifacts/verification/r41-source-final-verification.json>)在文档后复核新增文件、原512文件、49公共资源、78历史图及用户pointer；在该记录成功产生前不算收尾完成。
