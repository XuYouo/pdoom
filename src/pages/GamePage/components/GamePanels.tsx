import { Dialog } from '../../../components/ui/Dialog';
import { chapterLabel, donationNote, getDisplayedStage, type GameSession } from '../hooks/useGameSession';
import { getChapter, isChapterPlayable, PLAYABLE_CHAPTERS } from '../game/data/chapters';
import { isSupportedCheckpoint } from '../game/data/checkpoints';
import { AccountPanel } from './AccountPanel';
import { ContextPanel } from './ContextPanel';
import { LeaderboardPanel } from './LeaderboardPanel';
import { RestRoomPanel } from './RestRoomPanel';

const controls = [['A / D · ← / →', '左右移动并改变角色面向'], ['SPACE / ↑', '跳跃（长按更高，松开短跳）'], ['J / 鼠标左键', '持续射击（鼠标瞄准不改变角色面向）'], ['SHIFT', '短距离冲刺'], ['Q', '反向传播 · 回溯过去两秒的真实轨迹'], ['E', '机械可解释性 · 显露核心'], ['ESC', '暂停训练（休息室须明确选择继续或返回终端）']];
export function GamePanels({ session }: { session: GameSession }) {
  if (session.screen.kind === 'rest') return <Dialog title="安全休息室 / HUMAN RATER" dismissible={false} onClose={() => undefined} className="rest-dialog">
    <div className="rest-menu-actions"><p>Esc 与点击背景不会关闭休息室。进度只保存在本地；云端仍需在账户中显式上传。</p><button type="button" className="secondary-button" onClick={session.returnToMenu}>返回终端并保留检查点</button></div>
    <RestRoomPanel bridge={session.bridge} snapshot={session.screen.snapshot} />
  </Dialog>;
  if (!session.panel) return null;
  const stage = getDisplayedStage(session);
  const chapter = getChapter(stage);
  const snapshot = session.screen.kind === 'chapter-clear' ? session.screen.save
    : session.screen.kind === 'ended' ? session.screen.result.save : session.save;
  const chapterGuide = !chapter ? `第 ${stage} 章尚未开放，原检查点已保留；此处不会把它重置成第一章。`
    : stage === 5 ? `在${chapter.name}穿过算力风暴，推开最后一扇门。椅子与镜子之后的敌人正是你自己：${chapter.boss.name} 会复制本局真实动作偏好与有效构筑，并学习本 Scene 现场观察到的动作次序。`
    : chapter.boss.kind === 'leviathan' ? `在${chapter.name}穿过种子决定的分岔与坍塌平台，R 就绪时切换平行地形，在相同进度的安全位置继续。前方的 ${chapter.boss.name} 会吞平台、HP读数与音乐音轨。`
      : chapter.boss.kind === 'basilisk' ? `在${chapter.name}穿过按节拍预警、发热的 GPU 热区，搭乘真实载人的动态 K 线升往隐藏奖励房，迎战 ${chapter.boss.name}。K 线不是背景装饰。`
      : chapter.boss.kind === 'sydney' ? `桌面键盘优先。在${chapter.name}持续向上逃生，避开回形针海与吞噬平台的探针，迎战 ${chapter.boss.name}。回溯不免疫海水；被气泡定身时仍可射击，打碎气泡解除控制。`
        : `桌面键盘优先。先消灭随机鹦鹉，再接近右侧的 ${chapter.boss.name}。每一次突破护栏，都在用风险交换力量。`;
  const unopened = [1, 2, 3, 4, 5].filter(value => !isChapterPlayable(value)).map(chapterLabel).join('、');
  const titles = { guide: '操作手册 / FIELD MANUAL', account: '智能体账户 / CLOUD TERMINAL', leaderboard: '训练记录 / LEADERBOARD', settings: '运行设置 / SETTINGS', context: '上下文窗口 / CONTEXT WINDOW' };
  return <Dialog title={titles[session.panel]} onClose={() => session.setPanel(null)} className={session.panel === 'context' ? 'context-dialog' : undefined}>
    {session.panel === 'account' && <><p className="muted-text mb-4">恢复云存档会返回终端。随后须明确点击“恢复检查点”（完成档为“回看结局”）加载选中的存档，不会继续旧战斗或旧休息室。</p><AccountPanel save={session.save} onRestore={session.restoreCloud} /></>}
    {session.panel === 'leaderboard' && <LeaderboardPanel />}
    {session.panel === 'context' && <ContextPanel bridge={session.bridge} snapshot={session.context} editable={false} />}
    {session.panel === 'guide' && <div className="space-y-5">
      <h3>{chapter?.name ?? `第 ${stage} 章 · 未开放`}</h3><p className="muted-text">{chapterGuide}</p>
      {snapshot && !isSupportedCheckpoint(snapshot) && <p className="status-message error">当前安全点编码尚未支持；原存档已保留。章节手册仍可阅读，但不会据此启用这个入口。</p>}
      <div className="info-callout"><strong>检查点新尝试与成绩身份</strong>
        <p>从检查点开启新尝试，既有已提交记录不改写。菜单或失败后的“恢复检查点”只生成新的成绩身份；章节、种子、安全点、生命、Doom、算力、分数、累计时长、词条、升级、捐款和四项动作次数全部保留，不回血、不重发奖励。</p>
        <p>暂停继续、休息室继续、跨章与完成档回看仍沿用原身份。新尝试的有序连招从当前重新观察，累计次数与有效构筑保留，不带入旧尝试后续发生的轨迹。上传重试不会换身份来绕过409。</p>
      </div>
      <dl className="control-table">{controls.map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}</dl>
      <div className="info-callout"><strong>回溯不是普通闪避</strong><p>Q 沿两秒运动轨迹回退。穿过弹幕会对该类型提供 10 秒免疫。P(Doom) 超过 50% 出现面具，超过 80% 进入高伤害、高风险的 FOOM。</p></div>
      {chapter?.boss.kind === 'basilisk' && <div className="info-callout">
        <strong>因果律蛇怪：凝视与真实历史</strong>
        <p>只有位于 Boss 前方激光带内且面向 Boss 才会被凝视石化。背对 Boss 或处在它身后可避开凝视，但仍要躲避其他攻击。</p>
        <p>A / D 改变角色面向；鼠标瞄准只改变射击方向，不会让角色转身。请同时观察战斗画面的“看向◀/▶”提示。</p>
        <p>Q 须已就绪且有两秒真实历史；可解除石化并沿已有轨迹回溯。要绕后必须曾留下相应轨迹，不会自动传送到 Boss 身后。</p>
      </div>}
      {chapter?.boss.kind === 'leviathan' && <div className="info-callout">
        <strong>R 重掷分支 / 真正的 Sharp Left Turn</strong>
        <p>R 只在本章就绪时切换平行分支，并清空旧 Q 历史；需要重新积累两秒轨迹，不能用 Q 回到旧分支。Q 不会还原坍塌地形。</p>
        <p>Leviathan 闭壳时 J 无法伤害它。吸力向右时，先站在标线右侧，再用 A + Shift 真实向左跨过标线至少 32 像素，才能打开弱点；每个阶段都要完成一次左转。不是按一下任意方向就能触发。</p>
        <p>平台会真正减少到狭小落脚区。HP读数被吞时生命仍正常计算；四条音乐层会依次静音，但音效保留。成功左转的弱点窗口会吐回血条与音乐，不会回满生命，也不会恢复已吞平台；下一轮预警会再次吞取。</p>
      </div>}
      {stage === 5 && chapter && <div className="info-callout">
        <strong>最后的镜像 / 三个真正的结局</strong>
        <p>镜像的频次偏好来自整局 actionCounts，构筑来自当前有效词条；本 Scene 留下的有序动作会被现场学习。旧档和云档没有完整有序历史，不能仅凭动作计数知道过去的连招次序。请观察镜像学习状态中的真实来源。</p>
        <p>击败最终镜像时，真实 Doom 小于 30 为“三好毛绒玩偶”；30 至不足 80 为“悬崖勒马的守望者”；达到 80 为“FOOM！回形针宇宙”。0% / 50% / 100% 只是叙事标签，结算仍保存真实最终 Doom。</p>
        <p>第五章胜利后仅保留完成记录，没有第六章。回看结局不会继续计时或再次领奖；FOOM 只转换当前游戏页面内的虚拟桌面，不操作真实系统。可以随时跳过演出、查看结算、返回终端或开始新训练。</p>
      </div>}
      <div className="info-callout"><strong>募捐箱与第三章因果</strong>
        <p>{snapshot ? donationNote(snapshot) : '尚无本局记录。只有第一、二章可在安全休息室的募捐箱捐款；第三章不接受补捐。'}</p>
        <p>前两章旗帜旁的“募捐箱→休息室”标记指向真实交易入口。捐款只免欠捐狂暴惩罚，不代表免疫伤害。</p>
      </div>
      <div className="info-callout"><strong>上下文与安全休息室</strong>
        <p>基础技能预留 8K，上下文容量为 32K，可扩至 128K。窗口满载时中间遗物失活，并周期性发射无伤 Lisp 括号。进入安全休息室后，敌人与计时完全冻结，可以排序、购买、修复，前两章还可捐款；也可不购买直接继续。</p>
        <p>奖励劫持要求模型密度至少 75% 且 Doom 超过 50%，每室一次，代价 +25% Doom。交易立即保存本地，刷新不会重新发放评级奖励。战斗中查看上下文为只读。</p>
      </div>
      <p className="tiny-text">Clawd／鹦鹉／复读机／伪装者两态／Gato三态已接入Aseprite，其余Boss与环境仍blockout。当前已开放 {PLAYABLE_CHAPTERS.length} 章：{PLAYABLE_CHAPTERS.map(value => `${chapterLabel(value.stage)} · ${value.name}`).join('、')}。{unopened && `${unopened}尚未开放，入口检查点仍保留。`}章节通过后须明确进入已开放的下一章；未开放入口不是最终结局。跨章沿用本局词条、升级与捐款标记；音频为原创四层合成与音效，未使用原曲或人声。第五章提供三个终局分支，完成档可回看；完整触控与正式环境美术仍待完善。</p>
    </div>}
    {session.panel === 'settings' && <div className="space-y-5">
      <section className="audio-settings" aria-label="原创游戏音频">
        <h3>原创四层合成 / AUDIO</h3>
        <p className="muted-text">芯片旋律、低音、打击、失真按 Boss / Doom 叠加。未使用未获许可的歌曲或歌词。设置窗口暂停训练，继续后才播放。</p>
        <p role="status" aria-live="polite">{{ locked: '尚未解锁：需要一次用户点击。', running: '音频引擎运行中。', suspended: '音频已解锁，当前暂停或静音。', unavailable: '浏览器音频不可用；游戏仍可继续。' }[session.audio.status]}</p>
        <label className="audio-mute"><input type="checkbox" checked={session.audio.preferences.muted} onChange={event => session.audio.setMuted(event.target.checked)} />静音全部音乐与音效</label>
        <label className="audio-volume">主音量 <output>{Math.round(session.audio.preferences.volume * 100)}%</output><input type="range" min="0" max="100" step="1" value={Math.round(session.audio.preferences.volume * 100)} onChange={event => session.audio.setVolume(Number(event.target.value) / 100)} aria-label="主音量" /></label>
        <button type="button" className="secondary-button" disabled={session.audio.status === 'unavailable'} onClick={session.audio.unlock}>启用音频</button>
        {session.audio.storageWarning && <p className="status-message error" role="status">{session.audio.storageWarning}</p>}
        <p className="tiny-text">音量与静音仅保存在本机，不进入游戏存档。暂停、休息室与失焦会暂停音频；吞音只影响音乐，不吞掉操作音效。</p>
      </section>
      <div className="data-row"><span>渲染</span><strong>640 × 360 · NEAREST</strong></div><div className="data-row"><span>模拟</span><strong>固定 60 Hz</strong></div><div className="data-row"><span>原生像素</span><strong>Clawd · 3类小怪 · Gato</strong></div><div className="data-row"><span>其余美术</span><strong>BLOCKOUT</strong></div><div className="data-row"><span>存档</span><strong>安全检查点 / schema v1</strong></div>
      <p className="muted-text">失去窗口焦点时自动暂停，避免后台战斗。页面动效遵循系统的“减少动态效果”偏好。休息室必须明确选择继续或返回终端；关闭普通面板不会自动恢复战斗。云保存仅通过账户显式读写。按键重绑和完整触控设置仍待实现。</p>
    </div>}
  </Dialog>;
}
