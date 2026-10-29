import type { GameSession } from '../hooks/useGameSession';
import { missionPresentation } from '../functions/hudPresentation';

export function MissionConsole({ session }: { session: GameSession }) {
  const presentation = missionPresentation(session);
  if (!presentation) return null;
  return <section className="mission-console mission-overlay" aria-label="当前目标">
    <div className="objective"><p>{presentation.objective}</p></div>
    {presentation.notice && <p className="runtime-log mission-notice" role="status">{presentation.notice}</p>}
  </section>;
}
