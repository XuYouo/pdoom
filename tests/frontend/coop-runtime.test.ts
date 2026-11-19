import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { GameBridge, type GameEvent } from '../../src/pages/GamePage/game/bridge';
import { EMPTY_INPUT, type FrameInput, type Vec2, type WorldState } from '../../src/pages/GamePage/game/entities/model';
import { TUNING } from '../../src/pages/GamePage/game/data/tuning';
import type { InputSystem } from '../../src/pages/GamePage/game/systems/InputSystem';
import { EMPTY_TOUCH_INPUT } from '../../src/pages/GamePage/game/systems/touchInput';
import type { WorldRenderer } from '../../src/pages/GamePage/game/systems/WorldRenderer';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createCoopWorld, serializeCoopWorld, stepCoopWorld, type CoopWorldState } from '../../src/pages/GamePage/game/coop';
import { CoopRuntime } from '../../src/pages/GamePage/network/CoopRuntime';
import type { CoopClient, CoopControlEvent } from '../../src/pages/GamePage/network/CoopClient';
import { COOP_BUILD_ID, type CoopAction, type CoopFrame, type CoopRoom } from '../../src/pages/GamePage/network/protocol';

const renderers = vi.hoisted(() => [] as Array<{ draw: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>);
vi.mock('../../src/pages/GamePage/network/CoopRenderer', () => ({
  CoopRenderer: class {
    draw = vi.fn();
    destroy = vi.fn();
    constructor() { renderers.push(this); }
  },
}));

const roomId = 'b5a3b9f7-46d8-41e1-b9da-f24ef17d7e89';
const matchId = '7c1382d5-3b81-4054-8d97-7bbfe22e0740';
const room = (slot: 0 | 1): CoopRoom => ({
  v: 1, type: 'room', roomId, code: 'ABCDEFGH', buildId: COOP_BUILD_ID, phase: 'playing', version: 1,
  selfSlot: slot, matchId, players: [{ slot: 0, connected: true, ready: true }, { slot: 1, connected: true, ready: true }],
});
const neutral = () => ({ ...EMPTY_INPUT, rerollPressed: false, reviveHeld: false });
class BoundaryClient {
  controls = new Set<(event: CoopControlEvent) => void>();
  frames = new Set<(event: CoopFrame) => void>();
  getStatus = vi.fn(() => 'connected' as const);
  sendFrame = vi.fn<(type: 'state' | 'input', payload: Record<string, unknown>) => boolean>().mockReturnValue(true);
  command = vi.fn<(action: CoopAction) => boolean>().mockReturnValue(true);
  subscribeControls(listener: (event: CoopControlEvent) => void) { this.controls.add(listener); return () => { this.controls.delete(listener); }; }
  subscribeFrames(listener: (event: CoopFrame) => void) { this.frames.add(listener); return () => { this.frames.delete(listener); }; }
  receiveControl(event: CoopControlEvent) { this.controls.forEach(listener => listener(event)); }
  receiveFrame(event: CoopFrame) { this.frames.forEach(listener => listener(event)); }
}
class BoundaryControls {
  enabled = false;
  held: FrameInput = { ...EMPTY_INPUT };
  setEnabled = vi.fn((enabled: boolean) => { this.enabled = enabled; });
  poll = vi.fn();
  consume = vi.fn<(origin?: Vec2) => FrameInput>(() => this.enabled ? { ...this.held } : { ...EMPTY_INPUT });
  setTouchInput = vi.fn();
  reviveHeld = vi.fn(() => false);
  queue = vi.fn();
}
let now = 0;
let sequence = 0;
const active: CoopRuntime[] = [];
function make(slot: 0 | 1, initialRoom = room(slot)) {
  const bridge = new GameBridge();
  const events: GameEvent[] = [];
  bridge.onEvent(event => events.push(event));
  const client = new BoundaryClient();
  const controls = new BoundaryControls();
  const scene = { cameras: { main: { shakeEffect: { reset: vi.fn() }, shake: vi.fn() } } };
  const presentWorld = vi.fn<(world: WorldState, paused: boolean) => void>();
  const runtime = new CoopRuntime({ scene: scene as unknown as Phaser.Scene, bridge, controls: controls as unknown as InputSystem,
    view: {} as WorldRenderer, client: client as unknown as CoopClient, room: initialRoom, presentWorld, reducedMotion: () => true });
  active.push(runtime);
  const renderer = renderers.at(-1)!;
  const world = () => renderer.draw.mock.calls.at(-1)?.[0] as CoopWorldState | undefined;
  const status = () => events.filter((event): event is Extract<GameEvent, { type: 'coop-status' }> => event.type === 'coop-status').at(-1)?.status;
  return { runtime, client, controls, events, renderer, presentWorld, world, status };
}
type Fixture = ReturnType<typeof make>;
function input(host: Fixture, patch: Partial<ReturnType<typeof neutral>> = {}) {
  host.client.receiveFrame({ v: 1, type: 'input', slot: 1, connectionId: 'guest-socket', roomId, matchId,
    seq: ++sequence, payload: { ...neutral(), ...patch } });
}
function snapshot(guest: Fixture, world: CoopWorldState, paused: boolean, controlId: string | null) {
  guest.client.receiveFrame({ v: 1, type: 'state', slot: 0, connectionId: 'host-socket', roomId, matchId,
    seq: ++sequence, payload: { world: serializeCoopWorld(world), paused, controlId, eventSequence: 0, events: [] } });
}
function command(fixture: Fixture, action: CoopAction, requestId: string) {
  fixture.client.receiveControl({ v: 1, type: 'command', action, requestId, slot: 0, roomId, matchId });
}

beforeEach(() => { now = 0; sequence = 0; renderers.length = 0; vi.spyOn(performance, 'now').mockImplementation(() => now); });
afterEach(() => { active.splice(0).forEach(runtime => runtime.destroy()); vi.restoreAllMocks(); });

describe('cooperative runtime with the real shared simulation', () => {
  it.each([0, 1] as const)('slot %i routes touch controls and resolves aim from its real local muzzle without guest simulation', slot => {
    const fixture = make(slot);
    if (slot === 0) input(fixture);
    else snapshot(fixture, createCoopWorld(createRun(matchId, 42)), false, null);
    const state = fixture.world()!, actor = state.players[slot === 0 ? 'p1' : 'p2'].actor;
    const origin = { x: actor.x, y: actor.y - 3 };
    const touch = { ...EMPTY_TOUCH_INPUT, fire: true, aimDirection: { x: 1, y: -1 } };
    fixture.runtime.command({ type: 'touch-input', input: touch });
    expect(fixture.controls.setTouchInput).toHaveBeenCalledExactlyOnceWith(touch);
    now = 100; fixture.runtime.update(TUNING.stepMs);
    expect(fixture.controls.consume).toHaveBeenCalledWith(origin);
    expect(fixture.world()!.tick).toBe(state.tick + (slot === 0 ? 1 : 0));
    expect(fixture.client.sendFrame.mock.calls.every(([kind]) => kind === (slot === 0 ? 'state' : 'input'))).toBe(true);
  });
  it.each([0, 1] as const)('slot %i waits for initial peer/world readiness, then closes after ten seconds without advancing', slot => {
    const fixture = make(slot);
    now = 9999; fixture.runtime.update(100);
    expect(fixture.status()).toBe('syncing');
    expect(fixture.controls.enabled).toBe(false);
    if (slot === 0) expect(fixture.world()?.tick).toBe(0);
    else expect(fixture.world()).toBeUndefined();
    now = 10001; fixture.runtime.update(TUNING.stepMs);
    expect(fixture.status()).toBe('closed');
    expect(fixture.client.command).toHaveBeenCalledExactlyOnceWith('pause');
    const closed = fixture.events.filter(event => event.type === 'coop-status').at(-1);
    expect(closed).toMatchObject({ type: 'coop-status', status: 'closed', message: expect.stringContaining('未能完成同步') });
    // A late packet or resume cannot resurrect a runtime that already told the player it is closed.
    if (slot === 0) input(fixture, { move: 1 });
    else snapshot(fixture, createCoopWorld(createRun(matchId, 42)), false, null);
    command(fixture, 'resume', 'late-resume');
    now += 1000; fixture.runtime.update(100);
    expect(fixture.status()).toBe('closed');
    expect(fixture.controls.enabled).toBe(false);
    if (slot === 0) expect(fixture.world()?.tick).toBe(0);
    else expect(fixture.world()).toBeUndefined();
  });

  it('boots an already reconnecting room paused, sends a fresh host world and waits for explicit server resume', () => {
    const initialRoom: CoopRoom = { ...room(0), phase: 'reconnecting', version: 2 };
    const host = make(0, initialRoom);
    expect(host.status()).toBe('reconnecting');
    expect(host.events.filter(event => event.type === 'coop-view').at(-1)).toMatchObject({
      snapshot: { status: 'reconnecting', message: expect.stringContaining('等待房主确认继续') },
    });
    expect(host.controls.enabled).toBe(false);
    expect(host.world()?.tick).toBe(0);
    // An input queued while the engine was loading must not act as the initial ready handshake here.
    input(host, { move: 1, fire: true, jumpPressed: true });
    now = 100; host.runtime.update(TUNING.stepMs);
    expect(host.status()).toBe('reconnecting');
    expect(host.world()?.tick).toBe(0);
    expect(host.client.command).not.toHaveBeenCalled();
    const stateMessages = host.client.sendFrame.mock.calls.filter(([type]) => type === 'state');
    expect(stateMessages.length).toBeGreaterThanOrEqual(1);
    const latest = stateMessages.at(-1)![1];
    expect(latest).toMatchObject({ paused: true, controlId: null });
    expect(latest.world).toEqual(serializeCoopWorld(host.world()!));
    // The server publishes phase=playing before its matching resume command. The room update alone is insufficient.
    host.client.receiveControl({ ...initialRoom, phase: 'playing', version: 3 });
    now += TUNING.stepMs; host.runtime.update(TUNING.stepMs);
    expect(host.status()).toBe('reconnecting');
    expect(host.world()?.tick).toBe(0);
    command(host, 'resume', 'engine-ready-resume');
    host.controls.held = { ...EMPTY_INPUT, move: 1 };
    now += TUNING.stepMs; host.runtime.update(TUNING.stepMs);
    expect(host.status()).toBe('playing');
    expect(host.controls.enabled).toBe(true);
    expect(host.world()?.tick).toBe(1);
    expect(host.world()?.players.p2.actionCounts.shots).toBe(0);
    expect(host.client.command).not.toHaveBeenCalled();
  });

  it('runs both real actors only on the 60 Hz host and publishes at most seven HUD/view updates per second', () => {
    const host = make(0), guest = make(1);
    const start = host.world()!;
    const initial = { p1: start.players.p1.actor.x, p2: start.players.p2.actor.x };
    let hostCursor = 0, guestCursor = 0;
    const relay = (from: Fixture, to: Fixture, kind: 'state' | 'input', cursor: number) => {
      const messages = from.client.sendFrame.mock.calls;
      for (let index = cursor; index < messages.length; index++) {
        const [type, payload] = messages[index];
        if (type === kind) to.client.receiveFrame({ v: 1, type, slot: type === 'state' ? 0 : 1,
          roomId, matchId, connectionId: type === 'state' ? 'host-socket' : 'guest-socket', seq: ++sequence, payload });
      }
      return messages.length;
    };
    // A real decoded host snapshot causes the guest's neutral ready input, not a test-only start flag.
    hostCursor = relay(host, guest, 'state', hostCursor);
    guestCursor = relay(guest, host, 'input', guestCursor);
    expect(host.status()).toBe('playing');
    host.controls.held = { ...EMPTY_INPUT, move: 1, fire: true };
    guest.controls.held = { ...EMPTY_INPUT, move: -1, fire: true };
    for (let frame = 1; frame <= 60; frame++) {
      now = frame * TUNING.stepMs;
      host.runtime.update(TUNING.stepMs);
      hostCursor = relay(host, guest, 'state', hostCursor);
      guest.runtime.update(TUNING.stepMs);
      guestCursor = relay(guest, host, 'input', guestCursor);
    }
    const authoritative = host.world()!;
    expect(authoritative.tick).toBe(60);
    expect(authoritative.run.elapsedMs).toBeCloseTo(1000);
    expect(authoritative.players.p1.actor.x).toBeGreaterThan(initial.p1);
    expect(authoritative.players.p2.actor.x).toBeLessThan(initial.p2);
    expect(authoritative.players.p1.actionCounts.shots).toBeGreaterThan(0);
    expect(authoritative.players.p2.actionCounts.shots).toBeGreaterThan(0);
    expect(guest.status()).toBe('playing');
    expect(guest.world()?.tick).toBeLessThanOrEqual(authoritative.tick);
    expect(guest.world()!.tick).toBeGreaterThanOrEqual(48);
    expect(guest.client.sendFrame.mock.calls.every(([kind]) => kind === 'input')).toBe(true);
    expect(host.client.sendFrame.mock.calls.every(([kind]) => kind === 'state')).toBe(true);
    for (const fixture of [host, guest]) for (const type of ['hud', 'coop-view'] as const) {
      const updates = fixture.events.filter(event => event.type === type).length;
      expect(updates).toBeGreaterThanOrEqual(4);
      expect(updates).toBeLessThanOrEqual(7);
    }
    expect(host.client.sendFrame.mock.calls.length).toBeLessThanOrEqual(17);
    expect(guest.client.sendFrame.mock.calls.length).toBeLessThanOrEqual(33);
    // Rendering/input frames alone never tick or predict another authoritative world on the guest.
    const guestTick = guest.world()!.tick;
    for (let frame = 61; frame <= 90; frame++) { now = frame * TUNING.stepMs; guest.runtime.update(TUNING.stepMs); }
    expect(guest.world()?.tick).toBe(guestTick);
    expect(host.world()?.tick).toBe(60);
  });

  it('stops the host before its next simulation step when remote input is stale for more than 1200 ms', () => {
    const host = make(0);
    input(host, { move: 1, fire: true });
    for (let frame = 1; frame <= 30; frame++) { now = frame * TUNING.stepMs; host.runtime.update(TUNING.stepMs); }
    expect(host.world()?.tick).toBe(30);
    const previousTick = host.world()!.tick;
    now = 1201; host.runtime.update(TUNING.stepMs);
    expect(host.world()?.tick).toBe(previousTick);
    expect(host.status()).toBe('paused');
    expect(host.controls.enabled).toBe(false);
    expect(host.client.command).toHaveBeenCalledExactlyOnceWith('pause');
    expect(host.events.filter(event => event.type === 'coop-status').at(-1)).toMatchObject({ message: expect.stringContaining('输入同步暂时中断') });
    now = 5000; host.runtime.update(100);
    expect(host.world()?.tick).toBe(previousTick);
    expect(host.client.command).toHaveBeenCalledTimes(1);
  });

  it('survives a long pause and ignores an old paused control snapshot while awaiting the matching resume', () => {
    const guest = make(1);
    let world = createCoopWorld(createRun(matchId, 42));
    snapshot(guest, world, false, null);
    expect(guest.status()).toBe('playing');
    now = 300; command(guest, 'pause', 'pause-1');
    snapshot(guest, world, true, 'pause-1');
    expect(guest.status()).toBe('paused');
    expect(guest.controls.enabled).toBe(false);
    now = 25_000; guest.runtime.update(100);
    expect(guest.status()).toBe('paused');
    expect(guest.client.command).not.toHaveBeenCalled();
    const resumeEventStart = guest.events.length;
    command(guest, 'resume', 'resume-2');
    snapshot(guest, world, true, 'pause-1');
    now += 100; guest.runtime.update(TUNING.stepMs);
    expect(guest.status()).toBe('playing');
    expect(guest.controls.enabled).toBe(true);
    expect(guest.client.command).not.toHaveBeenCalled();
    world = stepCoopWorld(world, { p1: neutral(), p2: neutral() });
    snapshot(guest, world, false, 'resume-2');
    now += 100; guest.runtime.update(TUNING.stepMs);
    expect(guest.world()?.tick).toBe(1);
    expect(guest.status()).toBe('playing');
    expect(guest.events.slice(resumeEventStart).filter(event => event.type === 'coop-status')
      .every(event => event.status === 'playing')).toBe(true);
    expect(guest.client.command).not.toHaveBeenCalled();
  });
});
