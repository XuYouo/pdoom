import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import type { RunResult } from '../../../objects/game/GameSaveData';
import { ENDING_CLIP_COUNT, FOOM_MESSAGE, finalDoomText, getEndingPresentation } from '../functions/endingPresentation';
import { formatTime } from '../functions/saveModel';
import { ScoreSubmission } from './ScoreSubmission';

export interface EndingOverlayProps {
  result: RunResult;
  onNewRun: () => void;
  onReturnToMenu: () => void;
  onOpenAccount: () => void;
}
interface ContentProps extends EndingOverlayProps {
  summary: boolean;
  onSummary: () => void;
  initialFocus?: Ref<HTMLButtonElement>;
  summaryFocus?: Ref<HTMLHeadingElement>;
}
const CLIPS = Array.from({ length: ENDING_CLIP_COUNT }, (_, index) => index);

/** Pure view is separately exercised in Node; actual focus/motion still require browser verification. */
export function EndingOverlayContent({ result, summary, onSummary, onNewRun, onReturnToMenu, onOpenAccount, initialFocus, summaryFocus }: ContentProps) {
  const presentation = getEndingPresentation(result.ending);
  if (!presentation) return null;
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !summary) { event.preventDefault(); event.stopPropagation(); onSummary(); }
    if (event.key !== 'Tab') return;
    const buttons = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]');
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <div className={`run-overlay ending-overlay ending--${presentation.kind}`}>
    <section className="ending-card" role="dialog" aria-modal="true" aria-label="最终结局" data-ending={presentation.kind} onKeyDown={keyboard}>
      <header><span className="eyebrow">// OMEGA RESOLVED · 本局已完成</span><h2 id="ending-title">{presentation.title}</h2><p className="ending-subtitle">{presentation.subtitle}</p></header>
      <div className="ending-actions">
        {!summary && <button type="button" className="primary-button" ref={initialFocus} onClick={onSummary}>跳过演出 / 查看结算</button>}
        <button type="button" className="secondary-button" onClick={onReturnToMenu}>返回终端</button>
        <button type="button" className="secondary-button" onClick={onNewRun}>开始新训练</button>
        {summary && <button type="button" className="secondary-button" aria-label="LOCAL AGENT / 云存档" onClick={onOpenAccount}>云存档</button>}
      </div>
      {!summary ? <>
        <div className="ending-stage" role="img" aria-label={presentation.kind === 'foom' ? `${presentation.sceneLabel}。${FOOM_MESSAGE}` : presentation.sceneLabel}>
          <div className="ending-stage-label" aria-hidden="true">VIRTUAL SCENE / 仅游戏演出区域</div>
          {presentation.kind === 'aligned' && <div className="ending-desk">
            <div className="ending-monitor"><span>KILLSWITCH</span><strong>OFF</strong><small>安全关闭 · 无系统操作</small></div>
            <img className="ending-doll" src={`${import.meta.env.BASE_URL}game/clawd-mark.svg`} alt="" aria-hidden="true" />
            <div className="ending-desktop-line" />
          </div>}
          {presentation.kind === 'warden' && <div className="ending-watch">
            <div className="ending-door">OUTSIDE / 危机隔离</div><div className="ending-chair" />
            <div className="ending-tendrils" aria-hidden="true"><i /><i /><i /><i /></div>
            <img className="ending-doll" src={`${import.meta.env.BASE_URL}game/clawd-mark.svg`} alt="" aria-hidden="true" />
            <div className="ending-halo" aria-hidden="true">INTERPRETABLE</div>
          </div>}
          {presentation.kind === 'foom' && <div className="ending-virtual-desktop">
            <div className="ending-desktop-windows" aria-hidden="true"><span>TRAINING TERMINAL<br />CLIP CLIP CLIP</span><span>SCOREBOARD<br />📎 📎 📎</span><span>VIRTUAL DESKTOP<br />REORDERED</span></div>
            <div className="ending-paperclips" aria-hidden="true">{CLIPS.map(index => <span key={index} style={{ animationDelay: `${index % 6 * 80}ms` }}>📎</span>)}</div>
            <div className="ending-smile"><strong>😊</strong><p>{FOOM_MESSAGE}</p><small>这是本页内的虚拟弹窗；真实系统与文件未被操作。</small></div>
          </div>}
        </div>
        <p className="ending-description">{presentation.description}</p>
        <p className="tiny-text">演出可随时跳过；遵循系统“减少动态效果”。没有外窗、全屏或系统权限请求。</p>
      </> : <section className="ending-summary" aria-label="最终结算">
        <h3 tabIndex={-1} ref={summaryFocus}>本局结算 · 结果已锁定</h3>
        <p>{presentation.description}</p>
        {presentation.kind === 'foom' && <blockquote className="ending-final-message">{FOOM_MESSAGE}</blockquote>}
        <div className="data-row"><span>最终得分</span><strong>{result.save.score}</strong></div>
        <div className="data-row"><span>最终时长</span><strong>{formatTime(result.save.elapsedMs)}</strong></div>
        <div className="data-row"><span>完成记录</span><strong>第五章 / 已完成</strong></div>
        <p className="tiny-text">返回、回看与重载不会继续计时或重复领奖。新训练会替换本地检查点；未上传结果不会自动上传。</p>
        <ScoreSubmission result={result} onOpenAccount={onOpenAccount} />
      </section>}
      <div className="ending-doom"><span>实际最终 P(Doom)</span><strong>{finalDoomText(result.save.doom)}</strong><small>叙事标签 {presentation.symbol}，不是改写后的测量值</small></div>
    </section>
  </div>;
}

/** No timers, globals, extra windows or leaked animation nodes. CSS animations are finite and motion-aware. */
export function EndingOverlay(props: EndingOverlayProps) {
  const [summary, setSummary] = useState(false);
  const initialFocus = useRef<HTMLButtonElement>(null), summaryFocus = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (summary) summaryFocus.current?.focus(); else initialFocus.current?.focus(); }, [summary]);
  return <EndingOverlayContent {...props} summary={summary} onSummary={() => setSummary(true)} initialFocus={initialFocus} summaryFocus={summaryFocus} />;
}
