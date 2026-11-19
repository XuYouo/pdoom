import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CoopPanelContent } from '../../src/pages/GamePage/components/CoopPanel';
import type { useCoopLobby } from '../../src/pages/GamePage/hooks/useCoopLobby';
import { canStartCoop, coopClosedReason, isCoopCode, normalizeCoopCode } from '../../src/pages/GamePage/functions/coopLobby';
import { COOP_BUILD_ID, type CoopRoom } from '../../src/pages/GamePage/network/protocol';

const room = (patch: Partial<CoopRoom> = {}): CoopRoom => ({ v: 1, type: 'room', roomId: 'room-one', code: '7GXK4N2P', buildId: COOP_BUILD_ID, phase: 'lobby', version: 1, selfSlot: 0, players: [{ slot: 0, connected: true, ready: false }], matchId: null, ...patch });
const lobby = (patch: Partial<ReturnType<typeof useCoopLobby>> = {}): ReturnType<typeof useCoopLobby> => ({
  auth: { token: 'a'.repeat(43), expiresAt: '2099-01-01T00:00:00Z', user: { id: '937020df-471d-4dd1-afef-84464d4b6990', username: 'PlayerOne' } },
  connection: { status: 'connected' }, room: null, operation: { kind: 'idle' }, notice: null,
  createRoom: vi.fn(), joinRoom: vi.fn(), setReady: vi.fn(), startMatch: vi.fn(), leaveAndClose: vi.fn(), reconnect: vi.fn(), ...patch,
});
const render = (patch: Partial<ReturnType<typeof useCoopLobby>> = {}) => renderToStaticMarkup(createElement(CoopPanelContent, { lobby: lobby(patch), onAccount: vi.fn() }));

describe('cooperative lobby presentation', () => {
  it('offers the existing account flow when login is absent and never prints session credentials', () => {
    const markup = render({ auth: null, connection: { status: 'disconnected' } });
    expect(markup).toContain('前往账户登录'); expect(markup).not.toContain('创建合作房间');
    expect(render()).not.toContain('a'.repeat(43)); expect(render()).not.toContain('PlayerOne');
  });
  it('shows exactly two slots, real occupancy and an unchanged invite code', () => {
    const markup = render({ room: room() });
    expect((markup.match(/class="coop-seat"/g) ?? []).length).toBe(2);
    expect(markup).toContain('value="7GXK4N2P"'); expect(markup).toContain('等待加入');
    expect(markup).toContain('在线 · 尚未准备'); expect(markup).toContain('复制邀请码');
    expect(markup).toMatch(/disabled="">开始双人训练/);
  });
  it('offers host start only when two real players are connected and ready', () => {
    const players: CoopRoom['players'] = [{ slot: 0, connected: true, ready: true }, { slot: 1, connected: true, ready: true }];
    expect(canStartCoop(room({ players }))).toBe(true);
    expect(canStartCoop(room({ players, selfSlot: 1 }))).toBe(false);
    expect(canStartCoop(room({ players, phase: 'reconnecting' }))).toBe(false);
    expect(render({ room: room({ players }) })).toContain('两位玩家均已准备，可以开始双人训练');
    expect(render({ room: room({ players, selfSlot: 1 }) })).not.toContain('>开始双人训练');
    expect(render({ room: room({ players, selfSlot: 1 }) })).toContain('由房主开始训练');
  });
  it('explains actual connection failures and bounded retention without inventing a countdown', () => {
    const markup = render({ room: room({ phase: 'reconnecting' }), connection: { status: 'reconnecting', reconnectUntil: 123 }, notice: { kind: 'error', message: '网络已中断。' } });
    expect(markup).toContain('role="alert"'); expect(markup).toContain('网络已中断。');
    expect(markup).toContain('保留席位最多 30 秒'); expect(markup).toContain('断开并返回');
    expect(markup).not.toContain('剩余 30');
  });
  it('distinguishes an unknown request result from a successful room operation', () => {
    const markup = render({ operation: { kind: 'unconfirmed', action: 'create', requestId: 'one', intent: 'stay' } });
    expect(markup).toContain('操作结果尚未确认'); expect(markup).toContain('断开并返回');
    expect(markup).not.toContain('房间邀请码'); expect(markup).not.toContain('创建成功');
  });
  it('matches the documented invitation alphabet and maps closed reasons to plain language', () => {
    expect(isCoopCode(normalizeCoopCode(' 7gxk4n2p '))).toBe(true);
    for (const value of ['7GXK4N2', '7GXK4N2PP', '7GXK4N20', '7GXK4N21', '7GXK4N-P']) expect(isCoopCode(value)).toBe(false);
    expect(coopClosedReason('host_left')).toContain('房主已离开'); expect(coopClosedReason('guest_left')).toContain('队友已离开');
    expect(coopClosedReason('room_expired')).toContain('自动关闭'); expect(coopClosedReason('联机数据格式无效')).toBe('联机数据格式无效');
  });
});
