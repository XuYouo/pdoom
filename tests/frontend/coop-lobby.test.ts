import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthResponse } from '../../src/objects/user/apiTypes/AuthResponse';
import { clearAuthSession, storeAuthSession } from '../../src/system/api/authToken';
import { CoopClient } from '../../src/pages/GamePage/network/CoopClient';
import { COOP_BUILD_ID, type CoopRoom, type CoopServerMessage } from '../../src/pages/GamePage/network/protocol';
import { useCoopLobby } from '../../src/pages/GamePage/hooks/useCoopLobby';
import { useCoopPlay } from '../../src/pages/GamePage/hooks/useCoopPlay';
import { createCoopWorld } from '../../src/pages/GamePage/game/coop';
import { coopViewSnapshot } from '../../src/pages/GamePage/network/coopPresentation';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import type { GameCommand } from '../../src/pages/GamePage/game/bridge';

type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void };
const hooks = vi.hoisted(() => {
  let cursor = 0, slots: Slot[] = [], effects: (() => void)[] = [];
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  return {
    begin: () => { cursor = 0; }, flush: () => { const pending = effects; effects = []; pending.forEach(effect => effect()); },
    clear: () => { slots.forEach(slot => slot.cleanup?.()); slots = []; effects = []; cursor = 0; },
    useRef: <T>(initial: T) => { const at = cursor++; if (!slots[at]) slots[at] = { value: { current: initial } }; return slots[at].value as { current: T }; },
    useState: <T>(initial: T | (() => T)) => {
      const at = cursor++; if (!slots[at]) slots[at] = { value: typeof initial === 'function' ? (initial as () => T)() : initial };
      return [slots[at].value as T, (next: T | ((value: T) => T)) => { slots[at].value = typeof next === 'function' ? (next as (value: T) => T)(slots[at].value as T) : next; }] as const;
    },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const at = cursor++, old = slots[at];
      if (!old || !same(old.deps, deps)) { const slot: Slot = { deps }; slots[at] = slot; effects.push(() => { old?.cleanup?.(); const stop = effect(); if (typeof stop === 'function') slot.cleanup = stop; }); }
    },
  };
});
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: hooks.useState, useRef: hooks.useRef, useEffect: hooks.useEffect }));
vi.mock('../../src/pages/GamePage/hooks/useAudioSettings', () => ({ useAudioSettings: () => ({ preferences: { muted: false, volume: 0.5 }, status: 'locked', storageWarning: null, setMuted: vi.fn(), setVolume: vi.fn(), unlock: vi.fn() }) }));
vi.mock('../../src/pages/GamePage/hooks/useMotionSettings', () => ({ useMotionSettings: () => ({ mode: 'system', systemReduced: false, reducedMotion: false, storageWarning: null, setMode: vi.fn() }) }));

class Socket {
  readyState = 0; bufferedAmount = 0;
  onopen: (() => void) | null = null; onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  messages: Array<Record<string, unknown>> = [];
  send(data: string) { this.messages.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(message: CoopServerMessage) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
class Storage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const auth: AuthResponse = { token: 'a'.repeat(43), expiresAt: '2099-01-01T00:00:00Z', user: { id: '937020df-471d-4dd1-afef-84464d4b6990', username: 'PlayerOne' } };
const room = (patch: Partial<CoopRoom> = {}): CoopRoom => ({ v: 1, type: 'room', roomId: 'room-one', code: '7GXK4N2P', buildId: COOP_BUILD_ID, phase: 'lobby', version: 1, selfSlot: 0, players: [{ slot: 0, connected: true, ready: false }], matchId: null, ...patch });
function harness(loggedIn = true) {
  hooks.clear(); vi.useFakeTimers();
  const storage = new Storage(), sockets: Socket[] = [];
  vi.stubGlobal('window', Object.assign(new EventTarget(), { sessionStorage: storage }));
  if (loggedIn) storeAuthSession(auth, storage);
  const client = new CoopClient({ createSocket: () => { const socket = new Socket(); sockets.push(socket); return socket; }, now: Date.now, requestId: () => crypto.randomUUID() });
  const onStart = vi.fn(), onClose = vi.fn();
  function view() {
    hooks.begin();
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Deterministic lifecycle driver; native UI/focus is verified separately in a browser.
    const value = useCoopLobby(client, { onStart, onClose }); hooks.flush(); return value;
  }
  view();
  const socket = () => sockets.at(-1)!;
  const authenticate = () => { socket().open(); socket().receive({ v: 1, type: 'authenticated' }); };
  const ack = (requestId: unknown) => socket().receive({ v: 1, type: 'ack', requestId: String(requestId) });
  return { view, client, socket, sockets, authenticate, ack, onStart, onClose, storage };
}
afterEach(() => { hooks.clear(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('cooperative lobby against the real transport and authentication boundary', () => {
  it('never opens a socket or creates a room for an absent login', () => {
    const h = harness(false); h.view().createRoom();
    expect(h.sockets).toHaveLength(0); expect(h.view().room).toBeNull(); expect(h.view().notice?.kind).toBe('error');
    h.view().leaveAndClose(); expect(h.onClose).toHaveBeenCalledOnce();
  });
  it('waits for server authentication, permits one request, and does not invent a room on ack', () => {
    const h = harness(); h.view().createRoom(); expect(h.socket().messages).toEqual([]);
    h.authenticate(); expect(h.socket().messages).toEqual([{ v: 1, type: 'auth', token: auth.token }]);
    h.view().createRoom(); const request = h.socket().messages.at(-1)!; h.view().createRoom();
    expect(h.socket().messages.filter(value => value.type === 'create')).toHaveLength(1); expect(h.view().room).toBeNull();
    h.ack('another-request'); expect(h.view().operation.kind).toBe('pending');
    h.ack(request.requestId); expect(h.view().operation.kind).toBe('idle'); expect(h.view().room).toBeNull();
    h.socket().receive(room()); expect(h.view().room?.code).toBe('7GXK4N2P');
  });
  it('cancels a creating room only after its response, then waits for the leave ack', () => {
    const h = harness(); h.authenticate(); h.view().createRoom(); const create = h.socket().messages.at(-1)!;
    h.view().leaveAndClose(); expect(h.onClose).not.toHaveBeenCalled(); expect(h.socket().messages.some(message => message.type === 'leave')).toBe(false);
    h.socket().receive(room()); h.ack(create.requestId);
    const leave = h.socket().messages.at(-1)!; expect(leave.type).toBe('leave'); expect(h.view().operation).toMatchObject({ action: 'leave', intent: 'exit' });
    h.socket().receive({ v: 1, type: 'left', roomId: 'room-one' }); expect(h.onClose).not.toHaveBeenCalled();
    h.ack(leave.requestId); expect(h.onClose).toHaveBeenCalledOnce(); expect(h.client.getStatus()).toBe('disconnected'); expect(h.onStart).not.toHaveBeenCalled();
  });
  it('validates and normalizes a code, shows room_full, and keeps the room empty', () => {
    const h = harness(); h.authenticate(); h.view().joinRoom('BAD01'); expect(h.socket().messages).toHaveLength(1);
    expect(h.view().notice?.message).toContain('8 位邀请码'); h.view().joinRoom(' 7gxk4n2p ');
    const join = h.socket().messages.at(-1)!; expect(join).toMatchObject({ type: 'join', code: '7GXK4N2P', buildId: COOP_BUILD_ID });
    h.socket().receive({ v: 1, type: 'error', requestId: String(join.requestId), code: 'room_full', message: '房间已有两位玩家。' });
    expect(h.view().room).toBeNull(); expect(h.view().notice?.message).toBe('房间已有两位玩家。'); expect(h.view().operation.kind).toBe('idle');
  });
  it('cancels a rejected join without leaving an unrelated room', () => {
    const h = harness(); h.authenticate(); h.view().joinRoom('7GXK4N2P'); const request = h.socket().messages.at(-1)!;
    h.view().leaveAndClose(); h.socket().receive({ v: 1, type: 'error', requestId: String(request.requestId), code: 'room_not_found', message: '房间不存在。' });
    expect(h.onClose).toHaveBeenCalledOnce(); expect(h.socket().messages.filter(message => message.type === 'leave')).toHaveLength(0);
  });
  it('renders readiness only from room snapshots and does not send start for an unready or guest seat', () => {
    const h = harness(); h.authenticate(); h.socket().receive(room()); h.view().setReady(true);
    const request = h.socket().messages.at(-1)!; expect(request.type).toBe('ready'); expect(h.view().room?.players[0].ready).toBe(false);
    h.ack(request.requestId); h.view().startMatch(); expect(h.socket().messages.some(value => value.type === 'start')).toBe(false);
    h.socket().receive(room({ selfSlot: 1, version: 2, players: [{ slot: 0, connected: true, ready: true }, { slot: 1, connected: true, ready: true }] }));
    h.view().startMatch(); expect(h.socket().messages.some(value => value.type === 'start')).toBe(false);
  });
  it('starts only from the actual playing snapshot with both members online, once per match', () => {
    const h = harness(); h.authenticate();
    const players = [{ slot: 0 as const, connected: true, ready: true }, { slot: 1 as const, connected: true, ready: true }];
    h.socket().receive(room({ players })); h.view().startMatch(); const request = h.socket().messages.at(-1)!;
    expect(request.type).toBe('start'); h.ack(request.requestId); expect(h.onStart).not.toHaveBeenCalled();
    h.socket().receive(room({ players, version: 2, phase: 'reconnecting', matchId: 'match-one' })); expect(h.onStart).not.toHaveBeenCalled();
    h.socket().receive(room({ players: [players[0], { ...players[1], connected: false }], version: 3, phase: 'playing', matchId: 'match-one' })); expect(h.onStart).not.toHaveBeenCalled();
    h.socket().receive(room({ players, version: 4, phase: 'playing', matchId: 'match-one' }));
    h.socket().receive(room({ players, version: 5, phase: 'playing', matchId: 'match-one' })); expect(h.onStart).toHaveBeenCalledOnce();
    hooks.clear(); expect(h.client.getStatus()).toBe('connected'); expect(h.socket().readyState).toBe(1);
  });
  it('never starts a match while the user is waiting to leave', () => {
    const h = harness(); h.authenticate(); h.view().createRoom(); h.view().leaveAndClose();
    h.socket().receive(room({ phase: 'playing', matchId: 'late-match', players: [{ slot: 0, connected: true, ready: true }, { slot: 1, connected: true, ready: true }] }));
    expect(h.onStart).not.toHaveBeenCalled();
  });
  it('keeps an unknown result explicit, blocks duplicate operations, and allows deliberate disconnect', () => {
    const h = harness(); h.authenticate(); h.view().createRoom(); vi.advanceTimersByTime(10001);
    expect(h.view().operation.kind).toBe('unconfirmed'); expect(h.view().notice?.message).toContain('最多保留 30 秒');
    h.view().createRoom(); expect(h.socket().messages.filter(value => value.type === 'create')).toHaveLength(1);
    h.view().leaveAndClose(); expect(h.onClose).toHaveBeenCalledOnce();
  });
  it('clears expired/logged-out identity and ignores the previous socket after a new login', () => {
    const h = harness(); h.authenticate(); h.socket().receive(room()); const old = h.socket();
    clearAuthSession(auth.token, h.storage); expect(h.view().auth).toBeNull(); expect(h.view().room).toBeNull(); expect(old.readyState).toBe(3);
    storeAuthSession({ ...auth, token: 'b'.repeat(43) }, h.storage); expect(h.sockets).toHaveLength(2);
    old.receive(room({ phase: 'playing', matchId: 'old-match' })); expect(h.onStart).not.toHaveBeenCalled(); expect(h.view().room).toBeNull();
  });
  it('shows a real closed reason in Chinese and allows a disconnected player to return', () => {
    const h = harness(); h.authenticate(); h.socket().receive(room());
    h.socket().receive({ v: 1, type: 'closed', reason: 'reconnect_timeout' });
    expect(h.view().notice?.message).toBe('30 秒重连保留时间已用尽，房间已关闭。'); expect(h.view().room).toBeNull();
    h.socket().close(); h.view().leaveAndClose(); expect(h.onClose).toHaveBeenCalledOnce();
  });
});

function playHarness(selfSlot: 0 | 1 = 0) {
  const h = harness(); h.authenticate();
  const current = room({ selfSlot, phase: 'playing', matchId: '937020df-471d-4dd1-afef-84464d4b6990', players: [{ slot: 0, connected: true, ready: true }, { slot: 1, connected: true, ready: true }] });
  h.socket().receive(current); hooks.clear();
  const onLeave = vi.fn(), commands: GameCommand[] = [];
  function view() {
    hooks.begin();
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Same deterministic lifecycle driver as the lobby tests; no renderer or simulation timing is claimed.
    const value = useCoopPlay(h.client, current, onLeave); hooks.flush(); return value;
  }
  const first = view(); first.bridge.onCommand(command => commands.push(command));
  const world = createCoopWorld(createRun(current.matchId!, 42));
  const snapshot = coopViewSnapshot(world, selfSlot === 0 ? 'p1' : 'p2', 'playing');
  return { ...h, view, onLeave, commands, current, world, snapshot, bridge: first.bridge };
}

describe('cooperative play owns its bridge and never the solo save session', () => {
  it('does not resurrect the old match when engine loading finishes after the room closes', () => {
    const h = playHarness(); h.socket().receive({ v: 1, type: 'closed', reason: 'host_left' });
    h.bridge.emit({ type: 'ready' }); expect(h.commands).toEqual([]); expect(h.view().status).toBe('closed');
    expect(h.view().message).toContain('未启动旧对局');
  });
  it('uses the latest room lifecycle at engine ready, including reconnecting rather than stale playing', () => {
    const h = playHarness(); const latest = { ...h.current, version: 2, phase: 'reconnecting' as const };
    h.socket().receive(latest); h.bridge.emit({ type: 'ready' }); expect(h.commands).toEqual([{ type: 'coop-start', client: h.client, room: latest }]);
  });
  it('starts the verified match only after engine ready, once, and consumes low-frequency views', () => {
    const h = playHarness(); expect(h.commands).toEqual([]); expect(h.view().snapshot).toBeNull();
    h.bridge.emit({ type: 'ready' }); h.bridge.emit({ type: 'ready' });
    expect(h.commands).toEqual([{ type: 'coop-start', client: h.client, room: h.current }]);
    expect(h.view().snapshot).toBeNull(); expect(h.view().progress).toBe(1);
    h.bridge.emit({ type: 'coop-view', snapshot: h.snapshot }); expect(h.view().snapshot).toBe(h.snapshot); expect(h.view().playing).toBe(true);
  });
  it('ignores solo persistence and score events, including victory and checkpoint envelopes', () => {
    const h = playHarness(), localStorage = new Storage(); localStorage.setItem('pdoom.save.v1', 'existing-solo-save');
    Object.assign(window, { localStorage }); const save = createRun('937020df-471d-4dd1-afef-84464d4b6990', 42);
    h.bridge.emit({ type: 'checkpoint', save }); h.bridge.emit({ type: 'ended', result: { ending: 'warden', save: { ...save, stage: 5, checkpoint: 90 } } });
    expect(localStorage.getItem('pdoom.save.v1')).toBe('existing-solo-save'); expect(h.view().snapshot).toBeNull(); expect(h.view().status).toBe('syncing');
  });
  it.each([0, 1] as const)('allows either slot %s to pause, but only an online host to resume', selfSlot => {
    const h = playHarness(selfSlot); h.bridge.emit({ type: 'coop-view', snapshot: h.snapshot }); h.view().pause();
    expect(h.commands.at(-1)).toEqual({ type: 'pause' });
    h.bridge.emit({ type: 'coop-status', status: 'paused', message: '队伍已暂停。' }); h.view().resume();
    expect(h.commands.filter(command => command.type === 'resume')).toHaveLength(selfSlot === 0 ? 1 : 0);
    h.socket().receive({ ...h.current, phase: 'reconnecting', version: 2, players: [{ slot: 0, connected: true, ready: false }, { slot: 1, connected: false, ready: false }] });
    expect(h.view().canResume).toBe(false);
  });
  it('requires an eligible actual phase and only this player’s pending readiness to continue', () => {
    const h = playHarness(); h.bridge.emit({ type: 'coop-view', snapshot: h.snapshot }); h.view().continueReady(); expect(h.commands).toEqual([]);
    const rest = { ...h.snapshot, mode: 'rest' as const };
    h.bridge.emit({ type: 'coop-view', snapshot: rest }); h.view().continueReady(); expect(h.commands).toEqual([{ type: 'rest-continue' }]);
    h.bridge.emit({ type: 'coop-view', snapshot: { ...rest, players: rest.players.map(player => ({ ...player, ready: player.id === rest.localPlayerId })) } });
    h.view().continueReady(); expect(h.commands).toHaveLength(1);
  });
  it('stops the engine immediately, ignores unrelated ack and waits for leave confirmation', () => {
    const h = playHarness(); h.bridge.emit({ type: 'ready' }); h.view().leave();
    expect(h.commands.at(-1)).toEqual({ type: 'coop-stop' }); const request = h.socket().messages.at(-1)!; expect(request.type).toBe('leave');
    expect(h.onLeave).not.toHaveBeenCalled(); h.ack('unrelated'); expect(h.onLeave).not.toHaveBeenCalled();
    h.bridge.emit({ type: 'ready' }); expect(h.commands.filter(command => command.type === 'coop-start')).toHaveLength(1);
    h.socket().receive({ v: 1, type: 'left', roomId: h.current.roomId }); expect(h.onLeave).toHaveBeenCalledOnce(); expect(h.client.getStatus()).toBe('disconnected');
  });
  it('keeps an unknown leave explicit and permits deliberate force-close only after feedback', () => {
    const h = playHarness(); h.view().leave(); vi.advanceTimersByTime(10001);
    expect(h.view().leaving).toMatchObject({ kind: 'error', message: expect.stringContaining('最多 30 秒') }); expect(h.onLeave).not.toHaveBeenCalled();
    h.view().command({ type: 'resume' }); expect(h.commands).toEqual([{ type: 'coop-stop' }]);
    h.view().leave(true); expect(h.onLeave).toHaveBeenCalledOnce();
  });
  it('exits a disconnected room explicitly without waiting for an impossible acknowledgement', () => {
    const h = playHarness(); h.socket().close(); expect(h.view().status).toBe('reconnecting');
    h.view().leave(); expect(h.onLeave).toHaveBeenCalledOnce(); expect(h.commands).toEqual([{ type: 'coop-stop' }]);
  });
});
