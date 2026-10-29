import { useCallback, useEffect, useRef, useState } from 'react';
import { LoginUserAPI } from '../../../apis/user/LoginUserAPI';
import { RegisterUserAPI } from '../../../apis/user/RegisterUserAPI';
import { GetCurrentUserAPI } from '../../../apis/user/GetCurrentUserAPI';
import { LogoutUserAPI } from '../../../apis/user/LogoutUserAPI';
import { LoadGameAPI } from '../../../apis/game/LoadGameAPI';
import { SaveGameAPI } from '../../../apis/game/SaveGameAPI';
import type { AuthResponse } from '../../../objects/user/apiTypes/AuthResponse';
import type { LoadGameResponse } from '../../../objects/game/apiTypes/LoadGameResponse';
import type { GameSaveData } from '../../../objects/game/GameSaveData';
import { clearAuthSession, readAuthSession, storeAuthSession, subscribeAuthSession } from '../../../system/api/authToken';
import { ApiError, sendAPI } from '../../../system/api/sendAPI';

type Status = { kind: 'idle' } | { kind: 'loading'; message: string } | { kind: 'error'; message: string } | { kind: 'success'; message: string };

export function useCloudAccount() {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [cloud, setCloud] = useState<LoadGameResponse | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const authRef = useRef<AuthResponse | null>(null);
  const pending = useRef(false);
  const signal = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const remember = useCallback((value: AuthResponse | null, expectedToken?: string) => {
    const previous = authRef.current;
    authRef.current = value;
    // Update the ref before notification, but never publish an expired/invalid login into React state.
    try {
      const retained = value ? storeAuthSession(value) : clearAuthSession(expectedToken);
      setAuth(value);
      return retained;
    } catch (error) { authRef.current = previous; throw error; }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const restore = () => {
      const saved = readAuthSession();
      if (saved?.token === authRef.current?.token) return;
      signal.current?.abort();
      pending.current = false;
      authRef.current = null;
      setAuth(null); setCloud(null);
      if (!saved) { setStatus({ kind: 'idle' }); return; }
      const controller = new AbortController();
      signal.current = controller;
      pending.current = true;
      setStatus({ kind: 'loading', message: '验证会话…' });
      sendAPI(new GetCurrentUserAPI(), { token: saved.token, signal: controller.signal })
        .then(result => {
          if (!controller.signal.aborted && mounted.current) {
            // The server, not storage, establishes the current identity.
            const verified = { ...saved, user: result.user };
            remember(verified);
            setStatus({ kind: 'idle' });
          }
        })
        .catch(error => {
          if (!controller.signal.aborted && mounted.current) {
            if (error instanceof ApiError && error.status === 401) clearAuthSession(saved.token);
            setStatus({ kind: 'error', message: error instanceof Error ? error.message : '会话恢复失败。' });
          }
        })
        .finally(() => { if (signal.current === controller) pending.current = false; });
    };
    const unsubscribe = subscribeAuthSession(restore);
    restore();
    return () => { mounted.current = false; signal.current?.abort(); unsubscribe(); pending.current = false; };
  }, [remember]);

  async function perform(message: string, action: (requestSignal: AbortSignal) => Promise<string>, token?: string) {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    const controller = new AbortController();
    signal.current = controller;
    setStatus({ kind: 'loading', message });
    try {
      const result = await action(controller.signal);
      if (!controller.signal.aborted && mounted.current) setStatus({ kind: 'success', message: result });
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) {
        if (error instanceof ApiError && error.status === 401 && token) {
          if (authRef.current?.token === token) { remember(null, token); setCloud(null); }
          else clearAuthSession(token);
        }
        setStatus({ kind: 'error', message: error instanceof Error ? error.message : '操作失败，请重试。' });
      }
    } finally { if (signal.current === controller) pending.current = false; }
  }

  const login = (mode: 'login' | 'register', username: string, password: string) => perform('建立安全会话…', async requestSignal => {
    const result = await sendAPI(mode === 'login' ? new LoginUserAPI(username, password) : new RegisterUserAPI(username, password), { signal: requestSignal });
    if (requestSignal.aborted || !mounted.current) return '';
    const retained = remember(result); setCloud(null);
    return retained ? '会话已建立。先读取云存档版本，再选择同步方向。'
      : '当前面板会话已建立，但浏览器拒绝保存会话；关闭后需重新登录，结算上传暂不可共享此会话。';
  });
  const load = () => {
    const token = authRef.current?.token;
    return perform('读取云端检查点…', async requestSignal => {
      const result = await sendAPI(new LoadGameAPI(), { token, signal: requestSignal });
      if (!requestSignal.aborted && mounted.current) setCloud(result);
      return result.save ? '云存档已读取，尚未覆盖本地检查点。' : '云端暂无存档，可以上传本地检查点。';
    }, token);
  };
  const upload = (save: GameSaveData) => {
    const token = authRef.current?.token;
    return perform('上传本地检查点…', async requestSignal => {
      if (!cloud) throw new Error('请先读取云端版本。');
      const result = await sendAPI(new SaveGameAPI(save, cloud.revision), { token, signal: requestSignal });
      if (!requestSignal.aborted && mounted.current) setCloud({ save, ...result });
      return '云端保存成功。';
    }, token);
  };
  const logout = () => {
    const token = authRef.current?.token;
    return perform('撤销云端会话…', async requestSignal => {
      await sendAPI(new LogoutUserAPI(), { token, signal: requestSignal });
      if (!requestSignal.aborted && mounted.current) { remember(null, token); setCloud(null); }
      return '会话已撤销；本地游戏进度保留。';
    }, token);
  };
  return { auth, cloud, status, login, load, upload, logout };
}
