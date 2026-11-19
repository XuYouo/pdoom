import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoopClient, type CoopControlEvent } from '../../src/pages/GamePage/network/CoopClient';
import { COOP_BUILD_ID, parseCoopMessage, type CoopRoom } from '../../src/pages/GamePage/network/protocol';

class FakeSocket {
  readyState = 0; bufferedAmount = 0; sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open() { this.readyState = 1; this.onopen?.(); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
}
const room: CoopRoom = { v: 1, type: 'room', roomId: 'room-id', code: 'AB12CD34', buildId: COOP_BUILD_ID,
  phase: 'playing', version: 1, selfSlot: 1, matchId: 'match-1', players: [{ slot: 0, connected: true, ready: true }, { slot: 1, connected: true, ready: true }] };
function setup() {
  const sockets: FakeSocket[] = []; let request = 0;
  const client = new CoopClient({ createSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    now: () => Date.now(), requestId: () => `request-${++request}` });
  const events: CoopControlEvent[] = []; client.subscribeControls(event => events.push(event));
  client.connect('test-session'); const socket = sockets[0]; socket.open();
  return { client, sockets, socket, events, authenticate: () => socket.receive({ v: 1, type: 'authenticated' }) };
}
afterEach(() => vi.useRealTimers());

describe('cooperative transport boundaries', () => {
  it('keeps credentials in the first frame and gates messages on actual authentication', () => {
    const { client, socket, authenticate } = setup();
    expect(socket.sent.map(value => JSON.parse(value))).toEqual([{ v: 1, type: 'auth', token: 'test-session' }]);
    expect(client.send({ type: 'create', requestId: 'one', buildId: COOP_BUILD_ID })).toBe(false);
    authenticate(); expect(client.getStatus()).toBe('connected');
    expect(client.send({ type: 'create', requestId: 'one', buildId: COOP_BUILD_ID })).toBe(true);
    expect(JSON.parse(socket.sent[1])).toEqual({ v: 1, type: 'create', requestId: 'one', buildId: COOP_BUILD_ID });
    client.close();
  });
  it('does not expose high-frequency frames to React and rejects duplicates, wrong room, match and own-slot frames', () => {
    const { client, socket, authenticate, events } = setup(); authenticate(); socket.receive(room);
    const frames: number[] = []; client.subscribeFrames(frame => frames.push(frame.seq));
    const frame = { v: 1, type: 'state', seq: 4, slot: 0, roomId: room.roomId, matchId: room.matchId, connectionId: 'host-socket-1', payload: { tick: 3 } };
    socket.receive(frame); socket.receive(frame);
    socket.receive({ ...frame, seq: 5, roomId: 'other' }); socket.receive({ ...frame, seq: 6, matchId: 'previous' });
    socket.receive({ ...frame, seq: 7, slot: 1 }); socket.receive({ ...frame, seq: 8 });
    expect(frames).toEqual([4, 8]); expect(events.some(event => String(event.type) === 'state')).toBe(false);
    socket.receive({ ...frame, seq: 1, connectionId: 'host-socket-2' });
    expect(frames).toEqual([4, 8, 1]);
    client.close();
  });
  it('re-authenticates after disconnect and requests the reserved room instead of creating another world', async () => {
    vi.useFakeTimers();
    const { client, socket, sockets, authenticate } = setup(); authenticate(); socket.receive(room);
    const staleListener = socket.onmessage;
    expect(client.sendFrame('input', { move: 1 })).toBe(true);
    socket.close(); expect(client.getStatus()).toBe('reconnecting');
    expect(client.sendFrame('input', { move: 1 })).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    const replacement = sockets[1]; replacement.open(); replacement.receive({ v: 1, type: 'authenticated' });
    expect(replacement.sent.map(value => JSON.parse(value))).toEqual([{ v: 1, type: 'auth', token: 'test-session' }, { v: 1, type: 'reconnect', requestId: 'request-1', roomId: room.roomId }]);
    staleListener?.({ data: JSON.stringify({ v: 1, type: 'closed', reason: 'old socket' }) });
    expect(client.getRoom()?.roomId).toBe(room.roomId);
    replacement.receive({ ...room, version: 2, phase: 'reconnecting' });
    expect(client.sendFrame('input', { move: 0 })).toBe(true);
    expect(JSON.parse(replacement.sent[2]).seq).toBe(1);
    client.close(); await vi.advanceTimersByTimeAsync(31_000); expect(sockets).toHaveLength(2);
  });
  it('fails closed on invalid room data', () => {
    const { client, socket, authenticate } = setup(); authenticate(); socket.receive(room);
    socket.receive({ ...room, players: [{ slot: 0, connected: true, ready: true }, { slot: 0, connected: true, ready: true }] });
    expect(client.getStatus()).toBe('disconnected'); expect(client.getRoom()).toBeNull();
  });
  it.each(['lobby', 'playing', 'reconnecting'])('accepts the exact room phase %s', phase => {
    expect(parseCoopMessage(JSON.stringify({ ...room, phase }))).toEqual({ ...room, phase });
  });
  it.each<{ label: string; phase: unknown }>([
    { label: 'single-element array', phase: ['lobby'] },
    { label: 'nested array', phase: [['playing']] },
    { label: 'object', phase: { phase: 'reconnecting' } },
    { label: 'object with a non-callable toString', phase: { toString: 'lobby' } },
    { label: 'null', phase: null },
    { label: 'number', phase: 0 },
    { label: 'boolean', phase: true },
    { label: 'missing field', phase: undefined },
    { label: 'unknown string', phase: 'paused' },
  ])('rejects a room phase supplied as $label', ({ phase }) => {
    expect(parseCoopMessage(JSON.stringify({ ...room, phase }))).toBeNull();
  });
  it('turns control-message backpressure into a visible reconnect instead of silently losing pause', () => {
    vi.useFakeTimers();
    const { client, socket, authenticate, events } = setup(); authenticate(); socket.receive(room);
    socket.bufferedAmount = 200_000;
    expect(client.command('pause')).toBe(false);
    expect(client.getStatus()).toBe('reconnecting'); expect(socket.readyState).toBe(3);
    expect(events[events.length - 1]).toMatchObject({ type: 'connection', status: 'reconnecting' });
    client.close();
  });
  it('terminates a rejected reconnection and stops retrying a room that no longer exists', async () => {
    vi.useFakeTimers();
    const { client, socket, sockets, authenticate, events } = setup(); authenticate(); socket.receive(room);
    socket.close(); await vi.advanceTimersByTimeAsync(1000);
    const replacement = sockets[1]; replacement.open(); replacement.receive({ v: 1, type: 'authenticated' });
    replacement.receive({ v: 1, type: 'error', requestId: 'request-1', code: 'room_not_found', message: '房间已不存在。' });
    expect(client.getStatus()).toBe('disconnected'); expect(client.getRoom()).toBeNull();
    expect(events[events.length - 1]).toMatchObject({ type: 'closed', reason: '房间已不存在。' });
    await vi.advanceTimersByTimeAsync(31_000); expect(sockets).toHaveLength(2);
  });
  it('bounds an unanswered handshake by the original reconnect deadline', async () => {
    vi.useFakeTimers();
    const { client, socket, sockets, authenticate } = setup(); authenticate(); socket.receive(room); socket.close();
    await vi.advanceTimersByTimeAsync(31_100);
    expect(client.getRoom()).toBeNull(); expect(client.getStatus()).toBe('disconnected');
    const attempts = sockets.length; await vi.advanceTimersByTimeAsync(10_000); expect(sockets).toHaveLength(attempts);
  });
  it('uses UTF-8 bytes for the message ceiling and explains an oversized world', () => {
    const { client, socket, authenticate, events } = setup(); authenticate(); socket.receive(room);
    expect(client.sendFrame('state', { message: '测'.repeat(23_000) })).toBe(false);
    expect(client.getStatus()).toBe('disconnected'); expect(events[events.length - 1]).toMatchObject({ type: 'closed' });
  });
  it('rejects mismatched versions and invalid command envelopes at the wire boundary', () => {
    expect(parseCoopMessage(JSON.stringify({ ...room, v: 2 }))).toBeNull();
    expect(parseCoopMessage(JSON.stringify({ ...room, selfSlot: 5 }))).toBeNull();
    expect(parseCoopMessage(JSON.stringify({ v: 1, type: 'command', action: 'write-save' }))).toBeNull();
    const { client, socket, authenticate } = setup(); authenticate(); socket.receive({ ...room, buildId: 'unknown' });
    expect(client.getStatus()).toBe('disconnected'); expect(socket.readyState).toBe(3);
  });
});
