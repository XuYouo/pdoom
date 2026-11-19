import type { RefObject } from 'react';
import type { HudSnapshot } from '../game/bridge';
import { focusGameAfterPointer } from '../functions/hudInput';
import { insightButtonView, rerollButtonView, rewindButtonView } from '../functions/skillButtons';
import './skill-buttons.css';

export interface SkillButtonsProps {
  hud: HudSnapshot;
  playing: boolean;
  gameRoot: RefObject<HTMLElement | null>;
  onActivate: (action: 'rewind' | 'insight' | 'reroll') => void;
}

export function SkillButtons({ hud, playing, gameRoot, onActivate }: SkillButtonsProps) {
  const rewind = rewindButtonView(hud.skills.rewind), insight = insightButtonView(hud.skills.insight);
  const reroll = hud.loom && rerollButtonView(hud.loom);
  const insightDisabled = !playing || !hud.skills.insight.ready;
  return <>
    <button type="button" className="skill-button" title={rewind.hint} data-state={rewind.state}
      disabled={!playing || !hud.rewindReady} onClick={event => {
        if (!playing || !hud.rewindReady) return;
        onActivate('rewind'); focusGameAfterPointer(event, gameRoot.current);
      }}><kbd>Q</kbd><span>{rewind.label}</span>{rewind.countdown && <small className="skill-countdown">{rewind.countdown}</small>}</button>
    <button type="button" className={`skill-button${hud.insightActive ? ' is-active' : ''}`} title={insight.hint} data-state={insight.state}
      aria-pressed={hud.insightActive} aria-disabled={insightDisabled} onClick={event => {
        if (!insightDisabled) onActivate('insight');
        // Keep keyboard activation in this tab stop; pointer interaction returns to movement even during cooldown.
        focusGameAfterPointer(event, gameRoot.current);
      }}><kbd>E</kbd><span>{insight.label}</span>{insight.countdown && <small className="skill-countdown">{insight.countdown}</small>}</button>
    {hud.loom && reroll && <button type="button" className="skill-button" aria-label="R 重掷分支" title={reroll.hint} data-state={reroll.state}
      disabled={!playing || !hud.loom.rerollReady} onClick={event => {
        if (!playing || !hud.loom?.rerollReady) return;
        onActivate('reroll'); focusGameAfterPointer(event, gameRoot.current);
      }}><kbd>R</kbd><span>{reroll.label}</span></button>}
  </>;
}
