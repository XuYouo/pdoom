import type { CoopRoom } from '../network/protocol';

export const normalizeCoopCode = (code: string) => code.trim().toUpperCase();
export const isCoopCode = (code: string) => /^[A-Z2-9]{8}$/.test(code);
export function coopClosedReason(reason: string): string {
  const reasons: Record<string, string> = {
    host_left: '房主已离开，房间已关闭。', guest_left: '队友已离开，本次合作已结束。',
    reconnect_timeout: '30 秒重连保留时间已用尽，房间已关闭。', room_expired: '房间长时间无人操作，已自动关闭。',
  };
  return reasons[reason] ?? reason;
}
export function coopStartHint(room: CoopRoom): string {
  if (room.phase === 'reconnecting') return '正在等待连接恢复；双方恢复在线前无法开始。';
  if (room.phase === 'playing') return '对局已开始，正在进入共同世界。';
  if (room.players.length < 2) return '将邀请码发给另一位已登录玩家，等待队友加入。';
  if (room.players.some(player => !player.connected)) return '等待双方恢复在线。';
  if (room.players.some(player => !player.ready)) return '双方都准备就绪后，房主才能开始。';
  return room.selfSlot === 0 ? '两位玩家均已准备，可以开始双人训练。' : '两位玩家均已准备，等待房主开始。';
}
export const canStartCoop = (room: CoopRoom) => room.phase === 'lobby' && room.selfSlot === 0
  && room.players.length === 2 && room.players.every(player => player.connected && player.ready);
