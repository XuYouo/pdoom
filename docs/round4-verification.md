# 第四里程碑整合验收：第三章（目标回合5）

日期：2026-10-28，Asia/Shanghai。上一里程碑基线为175单测/22浏览器/19后端。本轮实现**前三章核心玩法**，不代表完整五章、美术、音频或最终结局完成。

## 1. 实际范围

- [第三章](<../src/pages/GamePage/game/data/chapterThree.ts>)：3280×360 GPU机房，三个有节拍预警的热区，真实载人的8秒K线、可跳入的高处隐藏奖励房，12×12身体/108HP的Chinchilla密集弹幕。
- [平台系统](<../src/pages/GamePage/game/systems/platforms.ts>)共用真实运行时几何；站稳才被载动，跳离/走离不粘住。不是只有画面移动的假平台。
- [Basilisk](<../src/pages/GamePage/game/systems/basilisk.ts>)消费前两章donated，真实改变预警/恢复时间、弹数、速度、伤害。第三章不能补捐；捐过也不是免伤。
- [激光规则](<../src/pages/GamePage/game/systems/furnace.ts>)要求空间相交且面向Boss；背对/身后安全。石化1.2秒限制普通动作，但Q仍按真实两秒历史解除，不能自动放到Boss身后。石化与Q吸收使用独立每束标记。
- 前两章安全点增加与真实捐款交易对应的临时箱体/入口标记；第二章清关真实进入第三章，第三章清关只保留第四章入口。未知4/5不启动、不伪造结局或成绩上传。
- 原生Clawd三态未换成生成图缩略图；新增GPU/蛇怪/龙猫表现仍明确写BLOCKOUT。没有修改SVG或Aseprite源、没有声称本轮制作了正式像素环境。
- 保留Phaser **4.0.0**、React19.1/TypeScript5.7、固定60Hz纯模拟、React最大5Hz HUD、v1保存和现有API；不升级引擎或改配置来匹配技能示例。

## 2. 当前验证记录

| 检查 | 结果 |
|---|---|
| 全量前端lint、严格类型、生产构建 | 通过，exit0 |
| 全量单测 | **219/219**，20文件：game106、frontend102、rendering11 |
| npm audit | **0漏洞** |
| git diff --check | 通过 |
| 新建隔离库上的Scala/真实HTTP/PostgreSQL | **19/19**，无skip，exit0 |
| 全套浏览器 | **27/27**，3.4m，真实后端开启，无skip，exit0 |

前端整合任务`bash-52e967c4e7144424`执行有效画面性能测量后，再顺序运行`npm run lint && npm run build && npm test && npm audit && git diff --check`，exit0。最终任务`bash-fe8af5473647474b`重新运行以上全部检查，确认API直连与Vite代理health均200，然后以`PDOOM_E2E_BACKEND=1`运行全部27项浏览器，exit0。Phaser chunk仍为1352.48KB / gzip348.59KB，500KB提示仍在，没有隐藏警告或声称全设备性能达标。

后端任务`bash-e259cb90fac24fd1`：读取并使用[隔离脚本](<../backend/scripts/test-postgres.sh>)新建自有PG16.14集群，再显式启用真实集成测试。19项覆盖身份/越权、CAS并发、幂等成绩、分页、限频、参数边界、错误脱敏、回滚/取消与health。日志中预期IllegalStateException来自500脱敏用例；`/dev/null`密码文件警告来自禁用宿主凭据文件，退出码均为0。

## 3. 正常输入证明

[完整路线测试](<../tests/game/furnacePlaythrough.test.ts>)只发送FrameInput与合法rest-continue，不改血、不传送、不直接扣Boss血。两条主线都经过两个休息室、三个真实attack phase；Q终点与**按键前**真实历史中两秒前的位置核对，而非只相信返回路径。

| 路线 | 模拟耗时 | 终点HP | 真实Q绕后 | 射击/Q |
|---|---:|---:|---:|---:|
| 已捐，正常 | 27,182ms | 100 | 1次 | 76 / 1 |
| 未捐，狂暴 | 25,382ms | 100 | 1次 | 76 / 1 |
| K线隐藏房 | 约11,667ms | 100 | 实际乘上/下行后跳入 | 700帧普通操作 |

主线实际拾取可选+22算力，Doom30仍为aligned伤害档。狂暴较短来自控制器等待真实attack，而狂暴节拍更快，**不是人类难度结论**。第二章原路线仍为29,915ms、84HP，入口门槛289与短跳回归没有退回。

完整合同和代理独立范围验证见[纯模拟交接](<round4-simulation.md>)、[React交接](<round4-ui.md>)。task-8/9均已完成并冻结，Lead实际读了交接代码与测试，没有把代理消息当成浏览器证明。

## 4. 浏览器与视觉红—绿记录

[第三章浏览器用例](<../tests/e2e/furnace.spec.ts>)仅植入合法v1安全点，再用真实键盘与可见PNG；没有生产作弊入口、隐藏世界注入或改HP。

- 休息室验证第三章禁补捐、冻结时钟、刷新仍保留原记录。
- K线最初两次失败：固定按键2900ms被错误当成固定终点；实际截图中玩家有时仅走到平台左方，或从左侧过早起跳。没有改物理/削弱落点断言，而是用屏幕中中心线/台面像素闭环走位，靠右并在实际上升阶段起跳，仍要求站上隐藏房、获得至少45TOK、角色像素底部低于115。
- 第一次全套为26/27：导航器只向右微调，边距落到9.66px，未满足原>10px断言。修正为短步双向校正并让正常摩擦停稳，原边距、落点和奖励断言均保留。`--repeat-each=3`三次独立路线全部通过（不是失败重试），随后完整27/27通过。
- 已捐/未捐两分支都实际等到石化；灰色像素必须出现，Q后恢复橙色。以Boss眼睛到角色的相对像素间距核对回溯位移，防止相机平移伪造角色移动。真正Q绕后另有完整纯规则路线证明，浏览器用例不冒称每次Q都绕后。
- 按已安装4.0声明修正旧式setTintFill调用，改用setTint + TintModes.FILL；解除时clearTint复位。石化时角色不继续跑步/呼吸，也不被无敌闪烁隐藏。
- 新增缓存后，背景像素断言发现一次**真实空背景**：4.0的setFilter会重传纹理存储，放在烘焙之后清掉了内容。改为先nearest、再draw/render；没有删除背景断言。之前两份空背景的性能记录无效，不能当作优化收益。
- 使用标准WEBGL_lose_context对测试页面进行真实丢失/恢复，要求机架和原生角色重新出现、存档不变；不是手动调用私有恢复函数。修后独立用例已通过。
- 实际看过失败图、载人/秘密平台、灰色石化与回溯后图，以及修正后恢复的完整GPU机架。最终27项产物中的[隐藏房](<../artifacts/browser/furnace-secret.png>)、[狂暴石化](<../artifacts/browser/basilisk-rage-stone.png>)、[正常态Q之后](<../artifacts/browser/basilisk-calm-rewind.png>)、[第三章休息室](<../artifacts/browser/furnace-rest.png>)也已再次实际查看；角色、机架与交易提示均在。标牌下移，避免与右上固定状态重叠。不是正式像素美术冷评。

## 5. 有效性能测量及边界

[本地测量脚本](<../artifacts/measure-render.mjs>)在同一Vite开发构建、已安装Chrome headless、SwiftShader、1440×1080下，每个章节预热1秒后采样6秒rAF与CDP CPU。最终脚本必须额外看到机架像素才能保存报告。

有效对比：[优化前](<../artifacts/render-profile-before.json>) → [修正后](<../artifacts/render-profile-verified-cache.json>)。第三章平均帧间隔 **21.77→17.83ms**；中位数均约16.7ms，P95仍约33ms，不能称稳定60FPS。最终测到175,211个机架颜色像素，背景不是空白。CPU采样中GraphicsWebGLRenderer由约209.24→25.79ms/6秒，主要batch由297.17→8.95ms/6秒。

修复是一次有界静态GPU缓存和避免无变化文字setColor反复重绘/上传；动态机关、碰撞和演员不缓存。缓存约4.72MB颜色像素、超尺寸/像素预算回退、上下文恢复重建、销毁释放。`after-cache`和`after-text-guard`两次实验有空背景，**全部排除**，保留原始记录仅用于排错。

这些数据没有GPU计时，不包含冷启动、最密战斗、发布构建或低端硬件，也不能证明键盘墙钟时长误差全由同一热点引起；它们只证明该固定开发场景中的渲染CPU工作与平均帧时间降低。

## 6. 服务、权限与剩余范围

集群位于[本轮私有数据目录](<../backend/.local/pg-test.f0a6fe/>)，PG任务`bash-adfa97b642a84b2a`；Main任务`bash-5b7dbff9f052412c`。启动前检查8081/55439空闲，只用明确的新库，不接入宿主现存数据库/凭据。全套结束后先关闭Main并收集Hikari关闭日志，再关闭PG并收集smart shutdown完成日志；8081/55439均已验明释放。前端任务`bash-20cdfdd0ce7646f0`仍运行，8080返回HTTP200。仅保留本地测试目录，不删除或复用用户数据。一次未指定-U的pg_isready探测尝试了系统用户名并产生role不存在日志；实际建库、Main和全部测试均显式使用pdoom_test，后续探测应加`-U pdoom_test -d postgres`。

工具接口强制权限字段与最初“省略”提示冲突被发现后，Lead暂停写入并询问；用户明确允许冗余填写**相同现有**danger-full-access。不申请提权，不扩大项目范围，明确审核拒绝仍须停止；无安装系统软件、发布或修改其他preset。

尚缺第四/第五章、最终镜像与三结局、种子布局、完整敌人/环境/攻击像素资产、原创音频与吞音轨演出、输入辅助和真实玩家平衡/发布性能。整体目标保持active，不能用本轮三章核心验证宣告完成。
