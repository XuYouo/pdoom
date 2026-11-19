import { useEffect, useRef, useState } from 'react';
import { GameBridge, type GameCommand } from '../game/bridge';
import type { CoopClient } from '../network/CoopClient';
import type { CoopRoom } from '../network/protocol';
import type { CoopPlayStatus, CoopViewSnapshot } from '../network/coopPresentation';
import { coopClosedReason } from '../functions/coopLobby';
import { useAudioSettings } from './useAudioSettings';
import { useMotionSettings } from './useMotionSettings';

type Leaving = { kind: 'idle' } | { kind: 'pending'; requestId: string } | { kind: 'error'; message: string };
export function useCoopPlay(client: CoopClient, room: CoopRoom, onLeave: () => void) {
  const [bridge] = useState(() => new GameBridge());
  const [snapshot, setSnapshot] = useState<CoopViewSnapshot | null>(null);
  const [status, setStatus] = useState<CoopPlayStatus>('syncing');
  const [message, setMessage] = useState('正在准备合作运行时…');
  const [progress, setProgress] = useState(0);
  const [networkRoom, setNetworkRoom] = useState(room);
  const [connected, setConnected] = useState(() => client.getStatus() === 'connected');
  const [leaving, setLeaving] = useState<Leaving>({ kind: 'idle' });
  const leaveRef = useRef<Leaving>({ kind: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false), finished = useRef(false);
  const onLeaveRef = useRef(onLeave);
  const audio = useAudioSettings(bridge), motion = useMotionSettings(bridge);
  useEffect(() => { onLeaveRef.current = onLeave; }, [onLeave]);

  function completeExit() {
    if (finished.current) return;
    finished.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null; client.close(); onLeaveRef.current();
  }
  useEffect(() => {
    const offGame = bridge.onEvent(event => {
      if (finished.current || leaveRef.current.kind !== 'idle') return;
      if (event.type === 'ready' && !started.current) {
        const current = client.getRoom();
        if (!current || current.roomId !== room.roomId || current.matchId !== room.matchId || !['playing', 'reconnecting'].includes(current.phase)) {
          setStatus('closed'); setMessage('合作房间已关闭或变更，未启动旧对局。'); return;
        }
        started.current = true; setProgress(1); bridge.send({ type: 'coop-start', client, room: current });
      } else if (event.type === 'load-progress') setProgress(event.progress);
      else if (event.type === 'load-failed') { setStatus('closed'); setMessage(event.message); }
      else if (event.type === 'coop-view') { setSnapshot(event.snapshot); setStatus(event.snapshot.status); setMessage(event.snapshot.message); }
      else if (event.type === 'coop-status') { setStatus(event.status); setMessage(event.message); }
      else if (event.type === 'pause-requested') bridge.send({ type: 'pause' });
      else if (event.type === 'notice') setMessage(event.message);
    });
    const offNetwork = client.subscribeControls(event => {
      if (finished.current) return;
      if (event.type === 'connection') {
        setConnected(event.status === 'connected');
        if (event.status !== 'connected') {
          setStatus(event.status === 'disconnected' ? 'closed' : 'reconnecting');
          setMessage(event.message ?? '连接中断，正在等待恢复；席位最多保留 30 秒。');
          if (leaveRef.current.kind !== 'idle') completeExit();
        }
      } else if (event.type === 'room' && event.roomId === room.roomId && event.matchId === room.matchId) setNetworkRoom(event);
      else if (event.type === 'closed' || event.type === 'left' && event.roomId === room.roomId) {
        if (leaveRef.current.kind !== 'idle') completeExit();
        else { setStatus('closed'); setMessage(event.type === 'closed' ? coopClosedReason(event.reason) : '已离开合作房间。'); }
      } else if (event.type === 'ack' && leaveRef.current.kind === 'pending' && event.requestId === leaveRef.current.requestId) completeExit();
      else if (event.type === 'error' && leaveRef.current.kind === 'pending' && event.requestId === leaveRef.current.requestId) {
        if (event.code === 'not_in_room') completeExit();
        else { if (timer.current !== null) clearTimeout(timer.current); leaveRef.current = { kind: 'error', message: event.message }; setLeaving(leaveRef.current); }
      }
    });
    return () => { offGame(); offNetwork(); if (timer.current !== null) clearTimeout(timer.current); bridge.send({ type: 'coop-stop' }); };
    // The initial verified room is this match's identity. Subsequent room snapshots use the control subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, client, room.roomId, room.matchId]);

  const local = snapshot?.players.find(player => player.id === snapshot.localPlayerId);
  const playing = status === 'playing' && snapshot?.mode === 'playing';
  const bothConnected = networkRoom.players.length === 2 && networkRoom.players.every(player => player.connected);
  const canResume = snapshot?.host === true && connected && bothConnected && (status === 'paused' || status === 'reconnecting');
  const canContinue = connected && status === 'playing' && snapshot !== null && ['rest', 'cleared', 'dead'].includes(snapshot.mode) && !local?.ready;
  function command(value: GameCommand) { if (leaveRef.current.kind === 'idle' && !finished.current) bridge.send(value); }
  function leave(force = false) {
    if (finished.current || leaveRef.current.kind === 'pending') return;
    bridge.send({ type: 'coop-stop' });
    if (force || client.getStatus() !== 'connected' || !client.getRoom()) { completeExit(); return; }
    const requestId = crypto.randomUUID();
    leaveRef.current = { kind: 'pending', requestId }; setLeaving(leaveRef.current);
    if (!client.send({ type: 'leave', requestId })) {
      leaveRef.current = { kind: 'error', message: '离房消息未能发出。可以重试，或断开连接并返回。' }; setLeaving(leaveRef.current); return;
    }
    timer.current = setTimeout(() => {
      if (finished.current || leaveRef.current.kind !== 'pending' || leaveRef.current.requestId !== requestId) return;
      leaveRef.current = { kind: 'error', message: '离房结果尚未确认；断开后服务器可能继续保留席位最多 30 秒。' }; setLeaving(leaveRef.current);
    }, 10000);
  }
  return { bridge, snapshot, status, message, progress, networkRoom, connected, leaving, playing, local, canResume, canContinue, audio, motion,
    command, leave, pause: () => playing && command({ type: 'pause' }), resume: () => canResume && command({ type: 'resume' }),
    continueReady: () => canContinue && command({ type: 'rest-continue' }) };
}
