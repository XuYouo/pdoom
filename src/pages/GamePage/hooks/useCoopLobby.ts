import { useEffect, useRef, useState } from 'react';
import type { AuthResponse } from '../../../objects/user/apiTypes/AuthResponse';
import { clearAuthSession, readAuthSession, subscribeAuthSession } from '../../../system/api/authToken';
import { canStartCoop, coopClosedReason, isCoopCode, normalizeCoopCode } from '../functions/coopLobby';
import { CoopClient, type CoopConnectionStatus, type CoopControlEvent } from '../network/CoopClient';
import { COOP_BUILD_ID, type CoopClientMessage, type CoopRoom } from '../network/protocol';

type LobbyAction = 'create' | 'join' | 'ready' | 'start' | 'leave';
export type CoopLobbyOperation = { kind: 'idle' } | {
  kind: 'pending' | 'unconfirmed'; action: LobbyAction; requestId: string; intent: 'stay' | 'exit';
};
interface Notice { kind: 'status' | 'error'; message: string }
interface Connection { status: CoopConnectionStatus; message?: string; reconnectUntil?: number }
export interface CoopLobbyCallbacks { onStart: (room: CoopRoom) => void; onClose: () => void }

/** Low-frequency lobby state only. The shared client retains transport ownership during play. */
export function useCoopLobby(client: CoopClient, callbacks: CoopLobbyCallbacks) {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [connection, setConnection] = useState<Connection>(() => ({ status: client.getStatus(), reconnectUntil: client.getReconnectUntil() || undefined }));
  const [room, setRoom] = useState<CoopRoom | null>(() => client.getRoom());
  const [operation, setOperation] = useState<CoopLobbyOperation>({ kind: 'idle' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const authRef = useRef<AuthResponse | null>(null), roomRef = useRef(room);
  const pending = useRef<CoopLobbyOperation>({ kind: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(new Set<string>());
  const callbacksRef = useRef(callbacks);
  const mounted = useRef(false), finished = useRef(false);
  const authInitialized = useRef<CoopClient | null>(null);
  useEffect(() => { callbacksRef.current = callbacks; }, [callbacks]);

  function resetOperation() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null; pending.current = { kind: 'idle' }; setOperation(pending.current);
  }
  function finishClose() {
    if (finished.current) return;
    finished.current = true; resetOperation(); client.close(); callbacksRef.current.onClose();
  }
  function issue(message: CoopClientMessage & { requestId: string }, action: LobbyAction, intent: 'stay' | 'exit' = 'stay') {
    const request: CoopLobbyOperation = { kind: 'pending', action, requestId: message.requestId, intent };
    pending.current = request; setOperation(request); setNotice(null);
    if (!client.send(message)) {
      resetOperation(); setNotice({ kind: 'error', message: '消息未能发出，请等待连接恢复后重试。' }); return false;
    }
    timer.current = setTimeout(() => {
      if (!mounted.current || pending.current.kind === 'idle' || pending.current.requestId !== message.requestId) return;
      pending.current = { ...pending.current, kind: 'unconfirmed' }; setOperation(pending.current);
      setNotice({ kind: 'error', message: '服务器尚未确认这次操作。为避免重复请求，请等待状态更新；也可断开返回，可能占用的席位最多保留 30 秒。' });
    }, 10000);
    return true;
  }
  function sendLeave() {
    resetOperation();
    if (client.getStatus() !== 'connected') { finishClose(); return; }
    issue({ type: 'leave', requestId: crypto.randomUUID() }, 'leave', 'exit');
  }
  function maybeStart(current: CoopRoom) {
    if (!authRef.current || finished.current || (pending.current.kind !== 'idle' && pending.current.intent === 'exit')) return;
    if (current.phase !== 'playing' || !current.matchId || current.players.length !== 2 || current.players.some(player => !player.connected) || started.current.has(current.matchId)) return;
    started.current.add(current.matchId); callbacksRef.current.onStart(current);
  }

  useEffect(() => {
    mounted.current = true; finished.current = false;
    const control = (event: CoopControlEvent) => {
      if (!mounted.current || finished.current) return;
      if (event.type === 'connection') {
        setConnection({ status: event.status, message: event.message, reconnectUntil: event.reconnectUntil });
        return;
      }
      if (event.type === 'room') {
        if (roomRef.current?.roomId === event.roomId && event.version < roomRef.current.version) return;
        roomRef.current = event; setRoom(event); maybeStart(event); return;
      }
      if (event.type === 'left') { roomRef.current = null; setRoom(null); return; }
      if (event.type === 'closed') {
        roomRef.current = null; setRoom(null);
        if (pending.current.kind !== 'idle' && pending.current.action === 'leave') return;
        resetOperation(); setNotice({ kind: 'error', message: coopClosedReason(event.reason) }); return;
      }
      if (event.type === 'ack') {
        const current = pending.current;
        if (current.kind === 'idle' || event.requestId !== current.requestId) return;
        if (current.action === 'leave') { finishClose(); return; }
        const exiting = current.intent === 'exit'; resetOperation();
        if (exiting) sendLeave();
        return;
      }
      if (event.type === 'error') {
        if (event.code === 'unauthorized') {
          clearAuthSession(authRef.current?.token); setNotice({ kind: 'error', message: event.message }); return;
        }
        const current = pending.current;
        if (event.requestId && (current.kind === 'idle' || event.requestId !== current.requestId)) return;
        const exiting = current.kind !== 'idle' && current.intent === 'exit';
        const wasLeaving = current.kind !== 'idle' && current.action === 'leave';
        resetOperation();
        if (wasLeaving && event.code === 'not_in_room') { finishClose(); return; }
        if (exiting && !wasLeaving) { if (roomRef.current) sendLeave(); else finishClose(); return; }
        setNotice({ kind: 'error', message: event.message });
      }
    };
    const stopControls = client.subscribeControls(control);
    const syncAuth = () => {
      const candidate = readAuthSession();
      if (authInitialized.current === client && candidate?.token === authRef.current?.token) return;
      authInitialized.current = client;
      const previous = authRef.current; authRef.current = candidate; setAuth(candidate);
      if (previous || !candidate) { resetOperation(); roomRef.current = null; setRoom(null); client.close(); }
      if (candidate) { setNotice(null); client.connect(candidate.token); }
    };
    const stopAuth = subscribeAuthSession(syncAuth);
    syncAuth();
    const current = client.getRoom();
    if (current && client.getStatus() === 'connected') { roomRef.current = current; setRoom(current); maybeStart(current); }
    return () => {
      mounted.current = false; stopControls(); stopAuth();
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      // Do not close: the game takes over this same authenticated transport after onStart.
    };
    // These handlers intentionally read refs; reconnects and room updates must not re-subscribe or reopen a socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  function available() {
    if (pending.current.kind !== 'idle' || finished.current) return false;
    if (!authRef.current || readAuthSession()?.token !== authRef.current.token) {
      authRef.current = null; setAuth(null); roomRef.current = null; setRoom(null); client.close(); setNotice({ kind: 'error', message: '登录已失效，请重新登录后使用合作大厅。' }); return false;
    }
    if (client.getStatus() !== 'connected') { setNotice({ kind: 'error', message: '尚未通过服务器连接与身份验证，请等待或重新连接。' }); return false; }
    return true;
  }
  function createRoom() {
    if (!available() || roomRef.current) return;
    issue({ type: 'create', requestId: crypto.randomUUID(), buildId: COOP_BUILD_ID }, 'create');
  }
  function joinRoom(input: string) {
    const code = normalizeCoopCode(input);
    if (!isCoopCode(code)) { setNotice({ kind: 'error', message: '请输入 8 位邀请码，仅含英文字母和数字 2–9。' }); return; }
    if (!available() || roomRef.current) return;
    issue({ type: 'join', requestId: crypto.randomUUID(), buildId: COOP_BUILD_ID, code }, 'join');
  }
  function setReady(ready: boolean) {
    const current = roomRef.current;
    if (!available() || !current || current.phase !== 'lobby' || !current.players.find(player => player.slot === current.selfSlot)?.connected) return;
    issue({ type: 'ready', requestId: crypto.randomUUID(), ready }, 'ready');
  }
  function startMatch() {
    const current = roomRef.current;
    if (!available() || !current || !canStartCoop(current)) return;
    issue({ type: 'start', requestId: crypto.randomUUID() }, 'start');
  }
  function leaveAndClose() {
    if (finished.current) return;
    const current = pending.current;
    if (client.getStatus() !== 'connected' || current.kind === 'unconfirmed') { finishClose(); return; }
    if (current.kind === 'pending') {
      if (current.action === 'leave') return;
      pending.current = { ...current, intent: 'exit' }; setOperation(pending.current);
      setNotice({ kind: 'status', message: '正在等待本次操作确认；随后离开房间并返回。' }); return;
    }
    if (!roomRef.current) { finishClose(); return; }
    sendLeave();
  }
  function reconnect() {
    const candidate = readAuthSession();
    if (!candidate) { setNotice({ kind: 'error', message: '请先登录，再连接合作大厅。' }); return; }
    setNotice(null); client.connect(candidate.token);
  }
  return { auth, connection, room, operation, notice, createRoom, joinRoom, setReady, startMatch, leaveAndClose, reconnect };
}
