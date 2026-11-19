import type { Ending } from '../../../objects/game/GameSaveData';
import type { ContextSnapshot, HudSnapshot, RestRoomSnapshot } from '../game/bridge';
import type { CoopWorldState, PlayerId } from '../game/coop/model';
import { activeIds, playerView } from '../game/coop/state';
import { contextSnapshot } from '../game/systems/context';
import { skillHudSnapshot } from '../game/systems/skillPresentation';
import { loomHudSnapshot, worldObjective } from '../game/systems/presentation';
import { omegaHudSnapshot } from '../game/systems/omegaPresentation';
import { restSnapshot } from '../game/systems/shop';
import { victoryResult } from '../game/systems/rules';

export type CoopPlayStatus = 'syncing' | 'playing' | 'paused' | 'reconnecting' | 'closed';
export interface CoopViewSnapshot {
  epoch: number; localPlayerId: PlayerId; host: boolean; stage: number;
  repairTarget: PlayerId;
  mode: CoopWorldState['shared']['mode']; status: CoopPlayStatus; message: string;
  hud: HudSnapshot; context: ContextSnapshot; rest: RestRoomSnapshot | null;
  players: Array<{ id: PlayerId; hp: number; state: 'active' | 'downed' | 'waiting'; reviveProgressMs: number; ready: boolean }>;
  ending: Ending | null;
}
export function coopViewSnapshot(state: CoopWorldState, localPlayerId: PlayerId, status: CoopPlayStatus, message = '', repairTarget: PlayerId = localPlayerId): CoopViewSnapshot {
  const world = playerView(state, localPlayerId), { save, boss } = world;
  const skills = skillHudSnapshot(world);
  const local = state.players[localPlayerId];
  const loom = loomHudSnapshot(world);
  if (loom && activeIds(state).some(id => id !== localPlayerId && state.players[id].rewind !== null)) {
    loom.rerollReady = false;
    loom.rerollBlocked ??= 'teammate-rewind';
  }
  const objective = local.state === 'waiting' ? '等待支援 · 队友抵达下一个安全检查点后重新加入。'
    : local.state === 'downed' ? '需要救援 · 队友靠近并按住 F 两秒，恢复 35 HP。' : worldObjective(world);
  return {
    epoch: state.epoch, localPlayerId, host: localPlayerId === state.hostPlayerId, stage: world.chapter.stage, repairTarget,
    mode: world.mode, status, message,
    hud: { hp: save.hp, doom: save.doom, tokens: save.tokens, score: save.score, stage: world.chapter.stage,
      elapsedMs: Math.floor(save.elapsedMs), rewindReady: local.state === 'active' && skills.rewind.state === 'ready',
      insightActive: skills.insight.activeRemainingMs > 0, skills,
      boss: boss.active && boss.hp > 0 ? { name: `${boss.name} · ${boss.phase}/3`, hp: boss.hp, maxHp: boss.maxHp } : null,
      objective, loom, omega: omegaHudSnapshot(world) },
    context: contextSnapshot(save, world.mode === 'rest' && localPlayerId === state.hostPlayerId), rest: restSnapshot(playerView(state, repairTarget)),
    players: (['p1', 'p2'] as const).map(id => ({ id, hp: state.players[id].hp, state: state.players[id].state,
      reviveProgressMs: state.players[id].reviveProgressMs, ready: state.ready[id] })),
    ending: world.mode === 'finished' ? victoryResult(save).ending : world.mode === 'dead' ? 'defeat' : null,
  };
}
