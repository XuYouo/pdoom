import type { GameSession } from '../hooks/useGameSession';
import { getChapter, PLAYABLE_CHAPTERS } from '../game/data/chapters';
import { decodeCheckpoint, isCompletedSave, isSupportedCheckpoint } from '../game/data/checkpoints';
import { compactObjective } from './hudPresentation';

export type RunDebriefKind = 'paused' | 'defeat' | 'cleared';
export interface RunDebriefSnapshot {
  kind: RunDebriefKind;
  stage: number;
  chapter: string;
  english: string;
  hp: number | null;
  doom: number;
  tokens: number;
  score: number;
  elapsedMs: number;
  objective: string | null;
  checkpoint: { chapter: string; location: string; hp: number; doom: number; elapsedMs: number } | null;
  route: { stage: number; name: string; status: 'complete' | 'current' | 'next' | 'ahead' }[];
}

/** Read the frozen run, never substitute the older safe checkpoint for current results. */
export function runDebrief(session: Pick<GameSession, 'screen' | 'hud' | 'save'>): RunDebriefSnapshot | null {
  const { screen, hud, save } = session;
  if (screen.kind !== 'paused' && screen.kind !== 'chapter-clear' && !(screen.kind === 'ended' && screen.result.ending === 'defeat')) return null;
  const kind: RunDebriefKind = screen.kind === 'paused' ? 'paused' : screen.kind === 'chapter-clear' ? 'cleared' : 'defeat';
  const snapshot = screen.kind === 'paused' ? hud : screen.kind === 'chapter-clear' ? screen.save : screen.result.save;
  const stage = screen.kind === 'chapter-clear' ? screen.stage : snapshot.stage;
  const chapter = getChapter(stage);
  const safe = kind === 'defeat' && save && getChapter(save.stage) && isSupportedCheckpoint(save) ? save : null;
  const point = safe ? decodeCheckpoint(safe.checkpoint) : null;
  const checkpoint = safe && point ? { chapter: getChapter(safe.stage)!.name,
    location: isCompletedSave(safe) ? '已完成记录' : point.room === 0 ? '章节起点' : `安全点 ${String(point.room).padStart(2, '0')}${point.resting ? ' · 休息室' : ''}`,
    hp: safe.hp, doom: safe.doom, elapsedMs: safe.elapsedMs } : null;
  return {
    kind, stage, chapter: chapter?.name ?? `第 ${stage} 章`, english: chapter?.english ?? 'TRAINING RUN',
    hp: hud.loom?.hpUiTaken ? null : snapshot.hp,
    doom: snapshot.doom, tokens: snapshot.tokens, score: snapshot.score, elapsedMs: snapshot.elapsedMs,
    objective: kind === 'paused' ? compactObjective(hud.objective) : null,
    checkpoint,
    route: PLAYABLE_CHAPTERS.map(value => ({ stage: value.stage, name: value.name,
      status: value.stage < stage || kind === 'cleared' && value.stage === stage ? 'complete'
        : value.stage === stage ? 'current'
          : kind === 'cleared' && value.stage === stage + 1 && screen.kind === 'chapter-clear' && screen.save.stage === value.stage && isSupportedCheckpoint(screen.save) ? 'next' : 'ahead' })),
  };
}

/** Only failed run/session actions belong beside the command buttons, not historical combat notices. */
export function runActionError({ notice, saveStatus }: Pick<GameSession, 'notice' | 'saveStatus'>): string | null {
  if (/^(新尝试未开始|无法创建新尝试身份|无法创建不同的新尝试身份|检查点数据无效|当前构建不支持这个安全点编码|第[^。]+章尚未开放)/.test(notice)) return notice;
  if (saveStatus === '本地保存失败') return `本地保存失败，当前进度尚未写入。${/Quota|Storage|SecurityError|存储|保存|检查点/i.test(notice) ? ` ${notice}` : ''}`;
  return null;
}
