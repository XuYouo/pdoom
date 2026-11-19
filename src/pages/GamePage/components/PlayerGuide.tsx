import type { GameSaveData } from '../../../objects/game/GameSaveData';
import { chapterLabel, donationNote } from '../hooks/useGameSession';
import { getChapter, isChapterPlayable, PLAYABLE_CHAPTERS } from '../game/data/chapters';
import { isSupportedCheckpoint } from '../game/data/checkpoints';

const controls = [
  { key: 'A / D', alternative: '← / →', name: '移动', hint: '左右移动，同时改变面向' },
  { key: 'SPACE', alternative: '↑', name: '跳跃', hint: '长按跳高，松开短跳' },
  { key: 'J', alternative: '鼠标左键', name: '射击', hint: '按住连射；鼠标可独立瞄准' },
  { key: 'SHIFT', name: '冲刺', hint: '沿当前方向快速突进' },
  { key: 'Q', name: '回溯', hint: '就绪后，沿过去两秒的轨迹回退' },
  { key: 'E', name: '透视', hint: '显露伪装者核心，瞄准核心击破' },
] as const;

/** Player-facing rules are a projection of the selected chapter and saved run. */
export function PlayerGuide({ stage, snapshot }: { stage: number; snapshot: GameSaveData | null }) {
  const chapter = getChapter(stage);
  const chapterGuide = !chapter ? `第 ${stage} 章尚未开放，原检查点已保留；此处不会把它重置成第一章。`
    : stage === 5 ? `穿过算力风暴，走近镜面并在地面站稳。${chapter.boss.name} 会复制本局真实动作偏好与有效构筑，并现场学习你的连招。`
      : chapter.boss.kind === 'leviathan' ? `穿过种子决定的分岔与坍塌平台，R 就绪时切换平行地形。${chapter.boss.name} 会吞平台、HP读数与音乐：等吸力窗口，向左跨过金色标线。`
        : chapter.boss.kind === 'basilisk' ? `避开按节拍发热的 GPU 热区，搭乘真实载人的动态 K 线升往隐藏奖励房。面对 ${chapter.boss.name} 时，背向激光或利用回溯绕后。`
          : chapter.boss.kind === 'sydney' ? `持续向上逃生，射击探针保护平台。回形针海触及即死，Q 和冲刺均不免疫。迎战 ${chapter.boss.name} 时，被气泡定身仍可射击，打碎气泡才能脱身。`
            : `先消灭随机鹦鹉，再接近右侧的 ${chapter.boss.name}。留意断口，长短跳交替；遇见笑脸伪装者，按 E 找出核心。`;
  const unopened = [1, 2, 3, 4, 5].filter(value => !isChapterPlayable(value)).map(chapterLabel).join('、');

  return <div className="player-guide">
    <section aria-label="基础操作" className="guide-basics">
      <p className="guide-section-label">01 / 基础操作</p>
      <div className="guide-touch-controls">
        <p><strong>左盘移动，右盘瞄准。</strong> 左侧按住并左右滑动；右侧按住连射，拖动调整射击方向，松手停止。</p>
        <p>跳跃键支持长按高跳、松手短跳；冲刺、回溯、透视可以与移动和射击同时按。第四章出现换支键，合作模式出现长按救援键。</p>
        <p>屏幕旋转、切到后台或暂停会松开所有触控。恢复后重新按下即可继续；横屏控件位于两侧，竖屏控件位于画面下方。</p>
      </div>
      <dl className="guide-controls">
        {controls.map(control => <div key={control.key}>
          <dt><kbd>{control.key}</kbd><strong>{control.name}</strong>{'alternative' in control && <span>{control.alternative}</span>}</dt>
          <dd>{control.hint}</dd>
        </div>)}
      </dl>
      <p className="guide-pause-hint"><kbd>ESC</kbd><span>暂停 / 继续训练；关闭设置或手册后，训练仍保持暂停。</span></p>
    </section>

    <section className="guide-chapter" aria-label="本章战术">
      <p className="guide-section-label">02 / {chapterLabel(stage)} · 本章战术</p>
      <h3>{chapter?.name ?? `第 ${stage} 章 · 未开放`}</h3>
      <p>{chapterGuide}</p>
      {snapshot && !isSupportedCheckpoint(snapshot) && <p className="status-message error">当前安全点编码尚未支持；原存档已保留。章节手册仍可阅读，但不会据此启用这个入口。</p>}
    </section>

    <section className="guide-rules" aria-label="进阶规则">
      <p className="guide-section-label">03 / 进阶规则</p>
      <details>
        <summary><span>回溯、透视与 Doom</span><span className="guide-summary-hint">战斗</span></summary>
        <div className="guide-rule-content">
          <p>Q 沿两秒运动轨迹回退。穿过弹幕会对该类型提供 10 秒免疫，并获得反击充能；不会还原已经消失的平台。</p>
          <p>E 暴露伪装者的核心；瞄准核心才能一击击破。鼠标瞄准不会改变角色面向。</p>
          <p>P(Doom) 超过 50% 出现面具，超过 80% 进入高伤害、高风险的 FOOM。力量增强的同时，弹幕更快、地形更危险。</p>
        </div>
      </details>
      {chapter?.boss.kind === 'basilisk' && <details>
        <summary><span>因果律蛇怪：凝视与真实历史</span><span className="guide-summary-hint">本章 Boss</span></summary>
        <div className="guide-rule-content">
          <p>只有位于 Boss 前方激光带内且面向 Boss 才会被凝视石化。背对 Boss 或处在它身后可避开凝视，但仍要躲避其他攻击。</p>
          <p>A / D 改变角色面向；鼠标瞄准只改变射击方向，不会让角色转身。请同时观察战斗画面的“看向◀/▶”提示。</p>
          <p>Q 须已就绪且有两秒真实历史；可解除石化并沿已有轨迹回溯。要绕后必须曾留下相应轨迹，不会自动传送到 Boss 身后。</p>
        </div>
      </details>}
      {chapter?.boss.kind === 'leviathan' && <details>
        <summary><span>R 重掷分支 / Sharp Left Turn</span><span className="guide-summary-hint">本章 Boss</span></summary>
        <div className="guide-rule-content">
          <p>R 只在本章就绪时切换平行分支，并清空旧 Q 历史；需要重新积累两秒轨迹，不能用 Q 回到旧分支。Q 不会还原坍塌地形。</p>
          <p>Leviathan 闭壳时 J 无法伤害它。吸力向右时，先站在标线右侧，再用 A + Shift 真实向左跨过标线至少 32 像素，才能打开弱点；每个阶段都要完成一次左转。</p>
          <p>平台会真正减少到狭小落脚区。HP读数被吞时生命仍正常计算；四条音乐层会依次静音，但音效保留。成功左转的弱点窗口会吐回血条与音乐，不会回满生命，也不会恢复已吞平台；下一轮预警会再次吞取。</p>
        </div>
      </details>}
      {stage === 5 && chapter && <details>
        <summary><span>最后的镜像与三个结局</span><span className="guide-summary-hint">含结局提示</span></summary>
        <div className="guide-rule-content">
          <p>镜像的偏好来自本局累计动作次数和当前有效词条；连招次序来自本次连续游玩中的观察。恢复旧档或云档后，它会重新观察连招，不会凭动作次数猜出过去的次序。</p>
          <p>击败最终镜像时，真实 Doom 小于 30 为“三好毛绒玩偶”；30 至不足 80 为“悬崖勒马的守望者”；达到 80 为“FOOM！回形针宇宙”。0% / 50% / 100% 是结局名称中的叙事标签，结算保存真实最终 Doom。</p>
          <p>第五章胜利后仅保留完成记录，没有第六章。回看结局不会继续计时或再次领奖；FOOM 只转换游戏页面内的虚拟桌面。演出可跳过，也可随时返回终端或开始新训练。</p>
        </div>
      </details>}
      <details>
        <summary><span>上下文与安全休息室</span><span className="guide-summary-hint">构筑</span></summary>
        <div className="guide-rule-content">
          <p>基础技能预留 8K，上下文容量为 32K，可扩至 128K。窗口满载时中间遗物失活，并周期性发射无伤 Lisp 括号。战斗中只能查看；进入安全休息室后可以排序、购买和修复。</p>
          <p>休息室中敌人与计时完全冻结，也可不购买直接继续。按 ESC 不会离开休息室，须明确选择继续或返回终端。</p>
          <p>奖励劫持要求模型密度至少 75% 且 Doom 超过 50%，每室一次，代价 +25% Doom。交易立即保存本地，刷新不会重新发放评级奖励。</p>
        </div>
      </details>
      <details>
        <summary><span>募捐箱与第三章因果</span><span className="guide-summary-hint">本局记录</span></summary>
        <div className="guide-rule-content">
          <p>{snapshot ? donationNote(snapshot) : '尚无本局记录。只有第一、二章可在安全休息室的募捐箱捐款；第三章不接受补捐。'}</p>
          <p>前两章旗帜旁的“募捐箱→休息室”标记指向交易入口。捐款只免欠捐狂暴惩罚，不代表免疫伤害。</p>
        </div>
      </details>
      <details>
        <summary><span>检查点与训练进度</span><span className="guide-summary-hint">存档</span></summary>
        <div className="guide-rule-content">
          <p>从检查点恢复会开启新尝试，既有已提交记录不改写。章节、种子、安全点、生命、Doom、算力、分数、累计时长、词条、升级、捐款和四项动作次数全部保留，不回血、不重发奖励。</p>
          <p>暂停继续、休息室继续、跨章与完成档回看仍属于原尝试。恢复检查点后，镜像从当前重新观察连招；累计次数与有效构筑保留。重复上传同一次尝试不会生成新的成绩。</p>
          <p>当前已开放 {PLAYABLE_CHAPTERS.length} 章：{PLAYABLE_CHAPTERS.map(value => `${chapterLabel(value.stage)} · ${value.name}`).join('、')}。{unopened && `${unopened}尚未开放，入口检查点仍保留。`}章节通过后须明确进入下一章；跨章沿用本局词条、升级与捐款标记。</p>
        </div>
      </details>
    </section>
    <p className="guide-device-note">支持键盘 / 鼠标与触屏。触屏设备会自动显示移动、瞄准和动作控件；暂停菜单中可调整声音和动态效果。</p>
  </div>;
}
