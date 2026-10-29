import { useEffect, useRef, useState } from 'react';
import { SubmitScoreAPI } from '../../../apis/game/SubmitScoreAPI';
import type { RunResult } from '../../../objects/game/GameSaveData';
import type { SubmitScoreResponse } from '../../../objects/game/apiTypes/SubmitScoreResponse';
import { isGameSave } from '../../../objects/game/validation';
import { clearAuthSession, readAuthSession, subscribeAuthSession } from '../../../system/api/authToken';
import { ApiError, sendAPI } from '../../../system/api/sendAPI';

export type ScoreSubmissionState =
  | { kind: 'ready' }
  | { kind: 'login-required'; message: string }
  | { kind: 'submitting' }
  | { kind: 'submitted'; response: SubmitScoreResponse }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'invalid-result'; message: string };

type Prepared = { kind: 'valid'; message: SubmitScoreAPI } | { kind: 'invalid'; message: string };

/** Pure snapshot: never round, clamp or invent duration/score, and never change runId to evade a conflict. */
export function buildScoreSubmission(result: RunResult): SubmitScoreAPI {
  const save = result.save;
  if (!isGameSave(save)) throw new Error('本局结果不符合存档 v1 规则，不能上传。');
  if (save.elapsedMs < 1000) throw new Error('本局有效时长不足 1 秒，不能上传；不会替你虚构时长。');
  const matches = result.ending === 'defeat' || save.stage === 5 && (
    result.ending === 'aligned' && save.doom < 30
    || result.ending === 'warden' && save.doom >= 30 && save.doom < 80
    || result.ending === 'foom' && save.doom >= 80);
  if (!matches) throw new Error('本局结局与章节、Doom 不一致，不能上传。');
  return Object.freeze(new SubmitScoreAPI(save.runId, save.score, save.stage, save.elapsedMs, save.doom, result.ending));
}

function prepare(result: RunResult): Prepared {
  try { return { kind: 'valid', message: buildScoreSubmission(result) }; }
  catch (error) { return { kind: 'invalid', message: error instanceof Error ? error.message : '本局结果无效。' }; }
}

/** One hook instance belongs to one immutable ended run; ScoreSubmission keys its inner instance by runId. */
export function useScoreSubmission(result: RunResult) {
  const [prepared] = useState(() => prepare(result));
  const [state, setState] = useState<ScoreSubmissionState>(() => prepared.kind === 'valid'
    ? { kind: 'ready' } : { kind: 'invalid-result', message: prepared.message });
  const [username, setUsername] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);
  const activeToken = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      const session = readAuthSession();
      setUsername(session?.user.username ?? null);
      if (pending.current && activeToken.current !== (session?.token ?? null)) {
        request.current?.abort();
        pending.current = false;
        setState({ kind: 'login-required', message: '会话已变化，上一请求结果尚未确认。请确认账号后重试相同结果。' });
      } else {
        setState(current => current.kind === 'login-required' && session ? { kind: 'ready' } : current);
      }
    };
    refresh();
    const unsubscribe = subscribeAuthSession(refresh);
    return () => { mounted.current = false; unsubscribe(); request.current?.abort(); pending.current = false; };
  }, []);

  async function submit() {
    if (pending.current || !mounted.current || state.kind === 'submitted' || prepared.kind !== 'valid') return;
    const session = readAuthSession();
    if (!session) {
      setUsername(null);
      setState({ kind: 'login-required', message: '请先登录。本局结果仍保留，登录后可以继续上传。' });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    activeToken.current = session.token;
    pending.current = true; // Synchronous gate also protects clicks before React commits disabled=true.
    setAttempted(true);
    setUsername(session.user.username);
    setState({ kind: 'submitting' });
    try {
      const response = await sendAPI(prepared.message, { token: session.token, signal: controller.signal });
      if (!controller.signal.aborted && mounted.current) setState({ kind: 'submitted', response });
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return;
      if (error instanceof ApiError && error.status === 401) {
        clearAuthSession(session.token);
        setUsername(readAuthSession()?.user.username ?? null);
        setState({ kind: 'login-required', message: '会话已失效，未确认成绩提交。请重新登录后重试同一局结果。' });
      } else if (error instanceof ApiError && error.status === 409) {
        setState({ kind: 'error', code: 'conflict', message: '云端的同一 runId 已有不同结果，不能覆盖。本按钮只会重试原数据，不会更换 runId；也可以开始新一轮训练。' });
      } else {
        setState({ kind: 'error', code: error instanceof ApiError ? error.code : 'unknown',
          message: error instanceof Error ? error.message : '未确认提交结果，请使用相同数据重试。' });
      }
    } finally {
      if (request.current === controller) { pending.current = false; activeToken.current = null; }
    }
  }

  return { state, username, attempted, submit };
}
