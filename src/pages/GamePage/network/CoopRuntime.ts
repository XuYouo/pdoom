import type * as Phaser from 'phaser';
import type { GameBridge, GameCommand } from '../game/bridge';
import type { WorldState } from '../game/entities/model';
import { EMPTY_INPUT } from '../game/entities/model';
import { TUNING } from '../game/data/tuning';
import type { InputSystem } from '../game/systems/InputSystem';
import type { WorldRenderer } from '../game/systems/WorldRenderer';
import { createRun } from '../functions/saveModel';
import { createCoopWorld, stepCoopWorld, applyCoopCommand, playerView, serializeCoopWorld, deserializeCoopWorld } from '../game/coop';
import type { CoopEvent, CoopWorldState, PlayerId } from '../game/coop/model';
import { CoopClient, type CoopControlEvent } from './CoopClient';
import type { CoopFrame, CoopRoom } from './protocol';
import { isRecord } from './protocol';
import { CoopInputBuffer, parseCoopInput, mergeCoopInputs, type NetworkInput } from './CoopInputBuffer';
import { CoopRenderer } from './CoopRenderer';
import { coopViewSnapshot, type CoopPlayStatus } from './coopPresentation';

interface RuntimeOptions {
  scene: Phaser.Scene; bridge: GameBridge; controls: InputSystem; view: WorldRenderer;
  client: CoopClient; room: CoopRoom; presentWorld(world: WorldState, paused: boolean): void;
  reducedMotion(): boolean;
}
interface Receipt { id: number; event: CoopEvent }
const emptyInput = () => ({ ...EMPTY_INPUT, reviveHeld: false });
const slotId = (slot: 0 | 1): PlayerId => slot === 0 ? 'p1' : 'p2';

/** Host-only fixed ticks; the guest submits controls and renders validated authoritative snapshots. */
export class CoopRuntime {
  private state: CoopWorldState | null = null;
  private room: CoopRoom;
  private localId: PlayerId;
  private host: boolean;
  private paused = true;
  private pauseLatch = false;
  private controlId: string | null = null;
  private awaitingControlId: string | null = null;
  private awaitingGuest: boolean;
  private initialized = false;
  private status: CoopPlayStatus = 'syncing';
  private message = '正在同步两名智能体…';
  private accumulator = 0;
  private lastStateAt = -Infinity;
  private lastInputAt = -Infinity;
  private startedAt = performance.now();
  private lastInputSentAt = -Infinity;
  private lastStateSentAt = -Infinity;
  private lastUiAt = -Infinity;
  private lastEventId = 0;
  private eventSequence = 0;
  private receipts: Receipt[] = [];
  private skipNextReceipts = false;
  private repairTarget: PlayerId;
  private input = new CoopInputBuffer();
  private pendingLocalInput: NetworkInput | null = null;
  private renderer: CoopRenderer;
  private unsubscribeControls: () => void;
  private unsubscribeFrames: () => void;
  private inputsEnabled = false;
  private stopped = false;

  constructor(private options: RuntimeOptions) {
    this.room = options.room; this.localId = slotId(this.room.selfSlot); this.host = this.room.selfSlot === 0;
    this.repairTarget = this.localId; this.awaitingGuest = this.host;
    this.renderer = new CoopRenderer(options.scene, options.view);
    this.unsubscribeControls = options.client.subscribeControls(this.control);
    this.unsubscribeFrames = options.client.subscribeFrames(this.frame);
    options.controls.setEnabled(false);
    if (this.host) {
      const random = crypto.getRandomValues(new Uint32Array(1))[0];
      this.state = createCoopWorld(createRun(this.room.matchId!, random % 2147483647 + 1));
      this.present(0); this.sendState(true);
    }
    this.emitStatus();
    if (this.room.phase === 'reconnecting') this.control(this.room);
  }
  private emitStatus() { this.options.bridge.emit({ type: 'coop-status', status: this.status, message: this.message }); }
  private setStatus(status: CoopPlayStatus, message: string) {
    if (status === this.status && message === this.message) return;
    this.status = status; this.message = message; this.lastUiAt = -Infinity; this.emitStatus();
  }
  private enableInputs() {
    const enabled = !this.stopped && !this.paused && this.room.phase === 'playing' && this.state?.shared.mode === 'playing'
      && this.state.players[this.localId].state === 'active';
    if (enabled !== this.inputsEnabled) { this.inputsEnabled = enabled; this.options.controls.setEnabled(enabled); }
  }
  private freeze(status: CoopPlayStatus, message: string) {
    this.paused = true; this.accumulator = 0; this.input.clear(); this.pendingLocalInput = null; this.setStatus(status, message); this.enableInputs();
    this.options.scene.cameras.main.shakeEffect.reset();
    if (this.state) this.present(0);
  }
  private control = (event: CoopControlEvent) => {
    if (this.stopped) return;
    if (this.status === 'closed' && event.type !== 'closed' && event.type !== 'left' && event.type !== 'error') return;
    if (event.type === 'connection' && event.status !== 'connected') {
      this.pauseLatch = true; this.skipNextReceipts = true;
      this.freeze(event.status === 'disconnected' ? 'closed' : 'reconnecting', event.message ?? '连接中断，合作已暂停。');
    } else if (event.type === 'room') {
      if (event.roomId !== this.room.roomId || event.matchId !== this.room.matchId) return;
      this.room = event;
      if (event.phase === 'reconnecting') {
        this.pauseLatch = true; this.skipNextReceipts = true;
        const online = event.players.length === 2 && event.players.every(player => player.connected);
        this.freeze('reconnecting', online ? '两人已重新连接。等待房主确认继续。' : '队友连接中断，最多保留 30 秒。');
        if (this.host && online) this.sendState(true);
      }
    } else if (event.type === 'command') {
      if (event.action === 'pause' || event.action === 'resume') {
        if (this.host) this.controlId = event.requestId;
        else this.awaitingControlId = event.requestId;
      }
      if (event.action === 'pause') { this.awaitingGuest = false; this.pauseLatch = true; this.freeze('paused', `${event.slot === this.room.selfSlot ? '你' : '队友'}暂停了合作。`); }
      if (event.action === 'resume' && this.room.phase === 'playing') {
        this.awaitingGuest = false; this.pauseLatch = false; this.paused = false; this.accumulator = 0;
        this.lastInputAt = performance.now(); this.lastStateAt = performance.now();
        this.input.clear(); this.setStatus('playing', ''); this.enableInputs();
      }
      if (event.action === 'continue-ready' && this.host && this.state) {
        this.state = applyCoopCommand(this.state, { type: 'continue-ready', playerId: slotId(event.slot) });
        this.collectEvents(); this.enableInputs(); this.present(0); this.sendState(true);
      }
      if (this.host) this.sendState(true);
    } else if (event.type === 'closed' || event.type === 'left') {
      this.freeze('closed', event.type === 'closed' ? closedReason(event.reason) : '已离开合作房间。');
    } else if (event.type === 'error') {
      this.message = event.message; this.lastUiAt = -Infinity; this.emitStatus();
    }
  };
  private frame = (frame: CoopFrame) => {
    if (this.stopped || this.status === 'closed') return;
    const now = performance.now();
    if (frame.type === 'input' && this.host) {
      const input = parseCoopInput(frame.payload);
      if (!input) return;
      this.input.push(input, now);
      this.lastInputAt = now;
      if (this.awaitingGuest && this.room.phase === 'playing') {
        this.awaitingGuest = false; this.initialized = true; this.paused = false; this.setStatus('playing', ''); this.enableInputs();
      }
    } else if (frame.type === 'state' && !this.host) {
      const payload = frame.payload;
      if (typeof payload.paused !== 'boolean' || !(payload.controlId === null || typeof payload.controlId === 'string')
        || !Number.isSafeInteger(payload.eventSequence) || (payload.eventSequence as number) < 0 || !Array.isArray(payload.events)) {
        this.freeze('closed', '收到的合作世界格式无效，请返回大厅重新创建房间。'); return;
      }
      const next = deserializeCoopWorld(payload.world);
      if (!next || next.run.runId !== this.room.matchId) { this.freeze('closed', '合作世界无法验证，请双方刷新后重新创建房间。'); return; }
      if (this.state && (next.epoch < this.state.epoch || next.epoch === this.state.epoch && next.tick < this.state.tick)) return;
      this.state = next; this.lastStateAt = now;
      if (this.awaitingControlId === payload.controlId) this.awaitingControlId = null;
      this.paused = (this.awaitingControlId ? this.paused : payload.paused) || this.pauseLatch || this.room.phase !== 'playing';
      if (!this.paused) this.initialized = true;
      if (this.room.phase === 'playing' && !this.pauseLatch) this.setStatus(this.paused ? this.initialized ? 'paused' : 'syncing' : 'playing',
        this.paused ? this.initialized ? '合作已暂停。等待房主继续。' : '正在同步两名智能体…' : '');
      if (this.skipNextReceipts) { this.lastEventId = payload.eventSequence as number; this.skipNextReceipts = false; }
      else for (const receipt of payload.events) {
        if (!isRecord(receipt) || !Number.isSafeInteger(receipt.id) || (receipt.id as number) <= this.lastEventId || !isRecord(receipt.event)) continue;
        const event = receipt.event;
        if (event.type === 'notice' && typeof event.message === 'string' && (event.playerId === undefined || event.playerId === this.localId)) this.options.bridge.emit({ type: 'notice', message: event.message });
        this.lastEventId = receipt.id as number;
      }
      this.enableInputs(); this.present(0);
      // First neutral input tells the host that this guest's renderer and full world are ready.
      if (this.room.phase === 'playing' && this.paused && !this.pauseLatch) this.options.client.sendFrame('input', emptyInput());
    }
  };
  update(delta: number) {
    if (this.stopped) return;
    if (this.status === 'closed') { if (this.state) this.present(0); return; }
    const now = performance.now();
    if (!this.initialized && this.status === 'syncing' && now - this.startedAt > 10000) {
      this.options.client.command('pause');
      this.freeze('closed', '两名智能体未能完成同步，请双方返回大厅重试。'); return;
    }
    if (this.host && this.state?.shared.mode === 'playing' && !this.paused && now - this.lastInputAt > 1200) this.requestPause('队友输入同步暂时中断，已暂停等待。');
    this.options.controls.poll();
    if (this.host && this.state && !this.paused && this.room.phase === 'playing' && this.state.shared.mode === 'playing') {
      this.accumulator += Math.min(delta, 100);
      while (this.accumulator >= TUNING.stepMs && this.state.shared.mode === 'playing') {
        const actor = this.state.players[this.localId].actor;
        const local = { ...this.options.controls.consume({ x: actor.x, y: actor.y - 3 }), reviveHeld: this.options.controls.reviveHeld() };
        const remote = this.input.consume(now);
        this.state = stepCoopWorld(this.state, { p1: local, p2: remote });
        this.collectEvents(); this.accumulator -= TUNING.stepMs;
      }
    } else if (!this.host && this.state && this.room.phase === 'playing' && !this.paused && now - this.lastInputSentAt >= 1000 / 30) {
      const actor = this.state.players[this.localId].actor;
      const input = this.inputsEnabled ? { ...this.options.controls.consume({ x: actor.x, y: actor.y - 3 }), reviveHeld: this.options.controls.reviveHeld() } : emptyInput();
      this.pendingLocalInput = mergeCoopInputs(this.pendingLocalInput, input);
      if (this.options.client.sendFrame('input', { ...this.pendingLocalInput, rerollPressed: !!this.pendingLocalInput.rerollPressed })) {
        this.lastInputSentAt = now; this.pendingLocalInput = null;
      }
    }
    if (!this.host && this.state && this.room.phase === 'playing' && !this.paused && now - this.lastStateAt > 1200) this.requestPause('世界同步暂时中断，已暂停等待。');
    this.enableInputs();
    if (this.state) { this.present(Math.min(delta, 100)); if (this.host) this.sendState(); }
  }
  private collectEvents() {
    if (!this.state) return;
    for (const event of this.state.events) {
      this.receipts.push({ id: ++this.eventSequence, event });
      if (event.type === 'notice' && (event.playerId === undefined || event.playerId === this.localId)) this.options.bridge.emit({ type: 'notice', message: event.message });
      // All persistence/terminal progression stays in the co-op runtime, never in solo GameSession.
      if (event.type === 'impact' && event.playerId === this.localId && !this.options.reducedMotion()) this.options.scene.cameras.main.shake(70, event.strength);
    }
    this.receipts = this.receipts.slice(-32);
  }
  private present(delta: number) {
    if (!this.state) return;
    this.options.presentWorld(playerView(this.state, this.localId), this.paused || this.status === 'closed');
    this.renderer.draw(this.state, this.localId, this.paused ? 0 : delta);
    const now = performance.now();
    if (now - this.lastUiAt >= 200) {
      const snapshot = coopViewSnapshot(this.state, this.localId, this.status, this.message, this.repairTarget);
      this.options.bridge.emit({ type: 'coop-view', snapshot });
      this.options.bridge.emit({ type: 'hud', snapshot: snapshot.hud });
      this.lastUiAt = now;
    }
  }
  private sendState(force = false) {
    if (!this.host || !this.state || this.options.client.getStatus() !== 'connected' || this.status === 'closed') return;
    const now = performance.now();
    if (now - this.lastStateSentAt < 52) return;
    if (!force && now - this.lastStateSentAt < 1000 / 15) return;
    if (this.options.client.sendFrame('state', { world: serializeCoopWorld(this.state), paused: this.paused, controlId: this.controlId, eventSequence: this.eventSequence, events: this.receipts })) this.lastStateSentAt = now;
  }
  requestPause(message = '你暂停了合作。') {
    if (this.stopped || this.paused || this.state?.shared.mode !== 'playing') return;
    this.pauseLatch = true; this.awaitingGuest = false; this.freeze('paused', message); this.options.client.command('pause');
  }
  command(command: GameCommand) {
    if (this.stopped || this.status === 'closed') return;
    if (command.type === 'touch-input') this.options.controls.setTouchInput(command.input);
    else if (command.type === 'pause') this.requestPause();
    else if (command.type === 'resume' && this.host) { this.sendState(true); this.options.client.command('resume'); }
    else if (command.type === 'rest-continue') this.options.client.command('continue-ready');
    else if (command.type === 'rewind' || command.type === 'insight' || command.type === 'reroll') this.options.controls.queue(command.type);
    else if (command.type === 'coop-repair-target' && this.host) { this.repairTarget = command.playerId; this.lastUiAt = -Infinity; this.present(0); }
    else if (this.host && this.state && (command.type === 'shop-buy' || command.type === 'shop-hack' || command.type === 'context-reorder')) {
      this.state = applyCoopCommand(this.state, command.type === 'context-reorder' ? { ...command, playerId: this.localId }
        : { ...command, playerId: this.localId, targetPlayerId: this.repairTarget });
      this.collectEvents(); this.present(0); this.sendState(true);
    }
  }
  destroy() {
    if (this.stopped) return;
    this.stopped = true; this.unsubscribeControls(); this.unsubscribeFrames(); this.input.clear();
    this.options.controls.setEnabled(false); this.renderer.destroy();
  }
}
function closedReason(reason: string): string {
  return ({ host_left: '房主已离开，合作已结束。', guest_left: '队友已离开，合作已结束。', reconnect_timeout: '重连时间已用尽，合作已结束。', room_expired: '房间已过期，请重新邀请队友。' } as Record<string, string>)[reason] ?? reason;
}
