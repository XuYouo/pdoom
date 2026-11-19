import type { GameSession } from '../hooks/useGameSession';
import { missionPresentation } from '../functions/hudPresentation';
import { missionEmphasis } from '../functions/combatFeedback';
import { CombatFeedback } from './CombatFeedback';
import './mission-console.css';

export function MissionConsole({ session }: { session: GameSession }) {
  const presentation = missionPresentation(session);
  if (!presentation) return null;
  const emphasis = missionEmphasis(session.hud.objective);
  return <section className="mission-console mission-overlay" aria-label="当前目标" data-tone={emphasis.tone}>
    <div className="objective"><span className="mission-label">{emphasis.label}</span><p>{presentation.objective}</p></div>
    {presentation.notice && <p className="runtime-log mission-notice mission-save-error" role="alert">{presentation.notice}</p>}
    {(session.screen.kind === 'playing' || session.screen.kind === 'paused') && <CombatFeedback bridge={session.bridge} elapsedMs={session.hud.elapsedMs} suppressed={Boolean(presentation.notice)} controlled={session.hud.objective.startsWith('精神控制：')} />}
  </section>;
}
