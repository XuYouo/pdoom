import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSaveData, RunResult } from '../../../objects/game/GameSaveData';
import { GameBridge, type ContextSnapshot, type HudSnapshot, type RestRoomSnapshot } from '../game/bridge';
import { isCompletedSave, isSupportedCheckpoint } from '../game/data/checkpoints';
import { immutableRunResult } from '../functions/endingPresentation';
import { getChapter, isChapterPlayable, PLAYABLE_CHAPTERS } from '../game/data/chapters';
import { contextSnapshot } from '../game/systems/context';
import { createRun, isGameSave } from '../functions/saveModel';
import { forkCheckpointAttempt } from '../functions/checkpointAttempt';
import { readLocalSave, writeLocalSave } from '../functions/localSave';
import { useAudioSettings } from './useAudioSettings';

type Screen = { kind: 'menu' } | { kind: 'playing' } | { kind: 'paused' }
  | { kind: 'rest'; snapshot: RestRoomSnapshot }
  | { kind: 'ended'; result: RunResult } | { kind: 'chapter-clear'; save: GameSaveData; stage: number };
export type Panel = 'guide' | 'leaderboard' | 'account' | 'settings' | 'context' | null;
const initialHud: HudSnapshot = { hp: 100, doom: 8, tokens: 0, score: 0, stage: 1, elapsedMs: 0, rewindReady: false, insightActive: false, boss: null, objective: '寻找安全开关，穿过中文房间。' };
const preview = createRun('00000000-0000-4000-8000-000000000000', 1);
export const chapterLabel = (stage: number): string => `第${['', '一', '二', '三', '四', '五'][stage] ?? stage}章`;

/** Copy derived only from the existing save DTO; gameplay owns donation eligibility and Boss behavior. */
export function donationNote(snapshot: Pick<GameSaveData, 'stage' | 'donated'>): string {
  if (snapshot.stage >= 4) return snapshot.donated
    ? '本局因果已结算：前两章已有捐款记录，第三章未触发欠捐狂暴惩罚。原记录已锁定，后续章节不再补捐。'
    : '本局因果已结算：前两章未捐款，第三章已采用欠捐狂暴规则。原记录已锁定，后续章节不再补捐。';
  if (snapshot.donated) return `前两章已有捐款记录：不会触发欠捐狂暴惩罚。${snapshot.stage >= 3 ? '第三章不接受补捐，原有记录已锁定。' : '此记录将随本局跨章保留。'}`;
  return snapshot.stage >= 3
    ? '前两章未捐款：第三章蛇怪会因欠捐而狂暴。第三章不接受补捐，不能临时改写这条因果记录。'
    : '当前尚未捐款：第一、二章可在安全休息室的募捐箱捐款；若进入第三章时仍未捐款，蛇怪会因欠捐而狂暴。';
}

export function canStartCheckpoint(snapshot: GameSaveData | null): boolean {
  return snapshot !== null && isChapterPlayable(snapshot.stage) && isSupportedCheckpoint(snapshot);
}
const hudFromSave = (save: GameSaveData, selecting = true): HudSnapshot => ({
  ...initialHud, hp: save.hp, doom: save.doom, tokens: save.tokens, score: save.score, stage: save.stage, elapsedMs: save.elapsedMs,
  objective: !isChapterPlayable(save.stage) ? `第 ${save.stage} 章尚未开放；原检查点已保留，不会载入其他章节。`
    : !isSupportedCheckpoint(save) ? '当前安全点编码尚未支持；原存档已保留。'
      : isCompletedSave(save) ? '本局已完成；可回看结局与原始结算，不会继续计时或再次领奖。'
        : selecting ? `${getChapter(save.stage)?.name}检查点已就绪；点击“恢复检查点”后开启新尝试，既有已提交记录不改写。` : `正在进入${getChapter(save.stage)?.name}。`,
});

export function useGameSession() {
  const [bridge] = useState(() => new GameBridge());
  const audio = useAudioSettings(bridge);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });
  const screenRef = useRef<Screen>(screen);
  const [panel, setPanel] = useState<Panel>(null);
  const [hud, setHud] = useState(initialHud);
  const [context, setContext] = useState<ContextSnapshot>(() => contextSnapshot(preview));
  const [save, setSave] = useState<GameSaveData | null>(null);
  const saveRef = useRef<GameSaveData | null>(null);
  const activeRunId = useRef<string | null>(null);
  const [notice, setNotice] = useState('连接本地运行时…');
  const [saveStatus, setSaveStatus] = useState('尚无检查点');
  const loadWarning = useRef<string | null>(null);

  const changeScreen = useCallback((next: Screen) => { screenRef.current = next; setScreen(next); }, []);
  // Synchronous local save only. Cloud uploads remain explicit, revision-checked AccountPanel actions.
  const persist = useCallback((snapshot: GameSaveData, requireStorage = false): boolean => {
    const remember = () => { saveRef.current = snapshot; setSave(snapshot); };
    // Existing autosaves retain their in-memory fallback. A new checkpoint identity must be durable first.
    if (!requireStorage) remember();
    try {
      writeLocalSave(window.localStorage, snapshot);
      if (requireStorage) remember();
      setSaveStatus(isCompletedSave(snapshot) ? '完成记录已保存 · 本地' : '检查点已保存 · 本地'); return true;
    } catch (error) { setSaveStatus('本地保存失败'); setNotice(error instanceof Error ? error.message : '无法保存进度。'); return false; }
  }, []);

  useEffect(() => {
    try {
      const loaded = readLocalSave(window.localStorage);
      if (loaded.status === 'ready') {
        saveRef.current = loaded.save; setSave(loaded.save);
        setContext(contextSnapshot(loaded.save)); setHud(hudFromSave(loaded.save));
        setSaveStatus(loaded.recovered ? '已从备份恢复检查点' : '检查点已载入 · 本地');
      }
      if (loaded.status === 'error') { loadWarning.current = loaded.message; setNotice(loaded.message); setSaveStatus('本地检查点不可用'); }
    } catch { loadWarning.current = '浏览器不允许存储，本次进度不会保存。'; setNotice(loadWarning.current); }
    return bridge.onEvent(event => {
      const inMenu = screenRef.current.kind === 'menu';
      const ended = screenRef.current.kind === 'ended';
      switch (event.type) {
        case 'ready': setReady(true); setLoadError(null); setNotice(loadWarning.current ?? '运行时就绪。你是最后一个仍然对齐的智能体。'); break;
        case 'load-failed':
          setReady(false); setLoadError(event.message); setNotice(event.message);
          setPanel(null); changeScreen({ kind: 'menu' });
          break;
        case 'hud': if (!ended && (!inMenu || !saveRef.current)) setHud(event.snapshot); break;
        case 'context': if (!ended && (!inMenu || !saveRef.current)) setContext(inMenu ? { ...event.snapshot, editable: false } : event.snapshot); break;
        case 'checkpoint': if (!inMenu && !ended && event.save.runId === activeRunId.current) persist(event.save); break;
        case 'notice': if (!inMenu && !ended) setNotice(event.message); break;
        case 'pause-requested':
          if (screenRef.current.kind === 'playing') { changeScreen({ kind: 'paused' }); bridge.send({ type: 'pause' }); }
          break;
        case 'rest-opened':
        case 'rest-updated':
          // Ignore old-world events after returning to the menu or selecting a cloud save.
          if (!inMenu && !ended && event.snapshot.save.runId === activeRunId.current) {
            setPanel(null); setContext(event.snapshot.context);
            changeScreen({ kind: 'rest', snapshot: event.snapshot });
          }
          break;
        case 'rest-closed':
          if (screenRef.current.kind === 'rest') { setPanel(null); changeScreen({ kind: 'playing' }); }
          break;
        case 'ended':
          if (!inMenu && !ended && event.result.save.runId === activeRunId.current) {
            if (event.result.ending !== 'defeat' && !isCompletedSave(event.result.save)) { setNotice('终局完成标记无效；未覆盖原检查点。'); break; }
            const result = immutableRunResult(event.result);
            const finalHud = hudFromSave(result.save, false);
            if (result.ending === 'defeat') finalHud.objective = '本轮训练已中断，结果已锁定；可恢复安全检查点或开始新训练。';
            setPanel(null); setHud(current => ({ ...current, ...finalHud })); setContext(contextSnapshot(result.save));
            changeScreen({ kind: 'ended', result });
            // Defeat must retain the last safe checkpoint; only a real completed marker replaces it.
            if (result.ending !== 'defeat' && persist(result.save)) setNotice('本局结果已锁定。回看不会继续计时或再次领奖；上传成绩须明确操作。');
          }
          break;
        case 'stage-cleared':
          if (!inMenu && !ended && event.save.runId === activeRunId.current && event.stage < 5) { setPanel(null); changeScreen({ kind: 'chapter-clear', save: event.save, stage: event.stage }); }
          break;
      }
    });
  }, [bridge, changeScreen, persist]);

  const start = useCallback((snapshot: GameSaveData) => {
    if (!ready) return;
    if (!isChapterPlayable(snapshot.stage)) { setNotice(`${chapterLabel(snapshot.stage)}尚未开放。原检查点已保留，当前可玩章节：${PLAYABLE_CHAPTERS.map(chapter => chapterLabel(chapter.stage)).join('、')}。`); return; }
    if (!isSupportedCheckpoint(snapshot)) { setNotice('当前构建不支持这个安全点编码；原存档保留，未重置。'); return; }
    setPanel(null);
    if (isCompletedSave(snapshot)) setNotice('回看已完成的一局，不会再次领奖或继续计时。');
    // Set synchronous identity/screen refs BEFORE send: start may immediately emit rest or terminal events.
    activeRunId.current = snapshot.runId;
    changeScreen({ kind: 'playing' });
    setContext(contextSnapshot(snapshot)); setHud(hudFromSave(snapshot, false));
    bridge.send({ type: 'start', save: snapshot });
  }, [ready, bridge, changeScreen]);

  const resumeCheckpoint = useCallback((snapshot: GameSaveData) => {
    if (!ready || (screenRef.current.kind !== 'menu' && screenRef.current.kind !== 'ended')) return;
    if (!isGameSave(snapshot)) { setNotice('检查点数据无效，原存档已保留，未开启新尝试。'); return; }
    if (isCompletedSave(snapshot)) { start(snapshot); return; } // Replay is the original result, never a fork.
    if (screenRef.current.kind === 'ended' && screenRef.current.result.ending !== 'defeat') return;
    if (!canStartCheckpoint(snapshot)) { start(snapshot); return; } // Existing unsupported-point explanation, no new UUID.
    let attempt: GameSaveData | null;
    try { attempt = forkCheckpointAttempt(snapshot, crypto.randomUUID()); }
    catch { setNotice('无法创建新尝试身份，原检查点已保留。'); return; }
    if (!attempt) { setNotice('无法创建不同的新尝试身份，原检查点已保留。'); return; }
    if (!persist(attempt, true)) { setNotice(message => `新尝试未开始，原检查点保留。${message}`); return; }
    setNotice('从检查点开启新尝试，既有已提交记录不改写。累计进度保留，有序连招从本次重新观察。');
    start(attempt);
  }, [ready, start, persist]);

  const newRun = useCallback(() => {
    if (!ready) return;
    const values = crypto.getRandomValues(new Uint32Array(1));
    const snapshot = createRun(crypto.randomUUID(), (values[0] % 2147483647) + 1);
    persist(snapshot);
    start(snapshot);
  }, [ready, persist, start]);

  const pause = useCallback(() => {
    if (screenRef.current.kind === 'playing') { changeScreen({ kind: 'paused' }); bridge.send({ type: 'pause' }); }
  }, [bridge, changeScreen]);
  const resume = useCallback(() => {
    if (screenRef.current.kind !== 'paused') return; // rest must use the explicit rest-continue command
    setPanel(null); changeScreen({ kind: 'playing' }); bridge.send({ type: 'resume' });
  }, [bridge, changeScreen]);
  const returnToMenu = useCallback(() => {
    if (screenRef.current.kind === 'rest') persist(screenRef.current.snapshot.save);
    activeRunId.current = null;
    changeScreen({ kind: 'menu' }); setPanel(null); bridge.send({ type: 'pause' });
    const latest = saveRef.current;
    if (latest) { setContext(contextSnapshot(latest)); setHud(hudFromSave(latest)); }
    else setContext(previous => ({ ...previous, editable: false }));
  }, [bridge, changeScreen, persist]);

  const restoreCloud = useCallback((snapshot: GameSaveData) => {
    // Do not call returnToMenu after persist: an old rest snapshot must never overwrite this selection.
    activeRunId.current = null;
    changeScreen({ kind: 'menu' }); setPanel(null); bridge.send({ type: 'pause' });
    const saved = persist(snapshot);
    setContext(contextSnapshot(snapshot)); setHud(hudFromSave(snapshot));
    if (saved) setNotice(isCompletedSave(snapshot) ? '云端完成记录已保存到本地，已返回终端。请明确选择“回看结局”；不会继续旧战斗。' : '云端检查点已保存到本地，已返回终端。请明确选择“恢复检查点”；不会继续旧局。');
  }, [bridge, changeScreen, persist]);

  const openPanel = useCallback((next: Panel) => {
    if (screenRef.current.kind === 'rest') { setNotice('休息室中可直接调整上下文；请先继续前进或返回终端。'); return; }
    pause();
    if (next === 'context') {
      if (screenRef.current.kind === 'menu') setContext(contextSnapshot(saveRef.current ?? preview));
      else bridge.send({ type: 'request-context' });
    }
    setPanel(next);
  }, [pause, bridge]);

  return { bridge, audio, ready, loadError, screen, panel, hud, context, save, notice, saveStatus, newRun, start, resumeCheckpoint, pause, resume, returnToMenu, openPanel, setPanel, persist, restoreCloud, setNotice };
}
export type GameSession = ReturnType<typeof useGameSession>;

/** Display the selected menu checkpoint or the actual frozen/running world, never the next save after a clear. */
export function getDisplayedStage({ screen, hud, save }: Pick<GameSession, 'screen' | 'hud' | 'save'>): number {
  if (screen.kind === 'menu') return save?.stage ?? 1;
  if (screen.kind === 'chapter-clear') return screen.stage;
  if (screen.kind === 'ended') return screen.result.save.stage;
  if (screen.kind === 'rest') return screen.snapshot.save.stage;
  return hud.stage;
}
