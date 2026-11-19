import type { SkillHudSnapshot } from '../bridge';
import { TUNING } from '../data/tuning';
import type { WorldState } from '../entities/model';

/** Read simulation deadlines at the existing HUD cadence; no UI clock or saved ability state. */
export function skillHudSnapshot(world: Readonly<WorldState>): SkillHudSnapshot {
  const { player, history, rewind, save } = world;
  const now = save.elapsedMs;
  const cooldown = Math.max(0, player.rewindReadyAt - now);
  const recordedMs = history.length > 1 ? Math.max(0, now - history[0].at) : 0;
  // beginRewind accepts the same 0.01ms fixed-step rounding tolerance.
  const historyReady = history.length > 1 && recordedMs >= TUNING.rewindWindowMs - 0.01;
  const rewindStatus: SkillHudSnapshot['rewind'] = rewind
    ? { state: 'rewinding', remainingMs: Math.max(0, rewind.startedAt + rewind.durationMs - now) }
    : player.rootedBy !== null ? { state: 'controlled', remainingMs: 0 }
      : cooldown > 0 ? { state: 'cooldown', remainingMs: cooldown }
        : !historyReady ? { state: 'recording', remainingMs: Math.max(0, TUNING.rewindWindowMs - recordedMs) }
          : { state: 'ready', remainingMs: 0 };
  return {
    rewind: rewindStatus,
    insight: {
      ready: !rewind && now >= player.insightReadyAt,
      activeRemainingMs: Math.max(0, player.insightUntil - now),
      cooldownRemainingMs: Math.max(0, player.insightReadyAt - now),
      blockedByRewind: rewind !== null,
    },
  };
}
