import { Dialog } from '../../../components/ui/Dialog';
import { getDisplayedStage, type GameSession } from '../hooks/useGameSession';
import { AccountPanel } from './AccountPanel';
import { ContextPanel } from './ContextPanel';
import { LeaderboardPanel } from './LeaderboardPanel';
import { RestRoomPanel } from './RestRoomPanel';
import { GameSettings } from './GameSettings';
import { PlayerGuide } from './PlayerGuide';

export function GamePanels({ session }: { session: GameSession }) {
  if (session.screen.kind === 'rest') return <Dialog title="安全休息室 / HUMAN RATER" dismissible={false} onClose={() => undefined} className="rest-dialog">
    <RestRoomPanel bridge={session.bridge} snapshot={session.screen.snapshot} onReturnToMenu={session.returnToMenu} saveStatus={session.saveStatus} notice={session.notice} />
  </Dialog>;
  if (!session.panel) return null;
  const stage = getDisplayedStage(session);
  const snapshot = session.screen.kind === 'chapter-clear' ? session.screen.save
    : session.screen.kind === 'ended' ? session.screen.result.save : session.save;
  const titles = { guide: '操作手册 / FIELD MANUAL', account: '智能体账户 / CLOUD TERMINAL', leaderboard: '训练记录 / LEADERBOARD', settings: '运行设置 / SETTINGS', context: '上下文窗口 / CONTEXT WINDOW' };
  return <Dialog title={titles[session.panel]} onClose={() => session.setPanel(null)} className={session.panel === 'context' ? 'context-dialog' : session.panel === 'guide' ? 'player-guide-dialog' : session.panel === 'settings' ? 'settings-dialog' : undefined}>
    {session.panel === 'account' && <AccountPanel save={session.save} onRestore={session.restoreCloud} />}
    {session.panel === 'leaderboard' && <LeaderboardPanel />}
    {session.panel === 'context' && <ContextPanel bridge={session.bridge} snapshot={session.context} editable={false} />}
    {session.panel === 'guide' && <PlayerGuide stage={stage} snapshot={snapshot} />}
    {session.panel === 'settings' && <GameSettings audio={session.audio} motion={session.motion} />}
  </Dialog>;
}
