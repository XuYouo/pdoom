import { COOP_BUILD_ID, parseCoopMessage, type CoopClientMessage, type CoopFrame, type CoopRoom, type CoopServerMessage } from './protocol';

export type CoopConnectionStatus = 'connecting' | 'authenticating' | 'connected' | 'reconnecting' | 'disconnected';
export type CoopControlEvent = Exclude<CoopServerMessage, CoopFrame> | {
  type: 'connection'; status: CoopConnectionStatus; message?: string; reconnectUntil?: number;
};
interface Socket {
  readyState: number; bufferedAmount: number;
  onopen: (() => void) | null; onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null; onerror: (() => void) | null;
  send(data: string): void; close(): void;
}
interface ClientEnvironment {
  createSocket(): Socket;
  now(): number;
  requestId(): string;
}
const browserEnvironment = (): ClientEnvironment => ({
  createSocket: () => new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/realtime/coop`) as unknown as Socket,
  now: () => Date.now(), requestId: () => crypto.randomUUID(),
});

/** Owns transport, never game state. Frames go straight to Phaser; React subscribes only to controls. */
export class CoopClient {
  private socket: Socket | null = null;
  private token: string | null = null;
  private status: CoopConnectionStatus = 'disconnected';
  private room: CoopRoom | null = null;
  private controls = new Set<(event: CoopControlEvent) => void>();
  private frames = new Set<(event: CoopFrame) => void>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectUntil = 0;
  private reconnectRequestId: string | null = null;
  private generation = 0;
  private incoming = { state: -1, input: -1 };
  private senderConnections = { state: '', input: '' };
  private outgoing = { state: 0, input: 0 };
  constructor(private environment: ClientEnvironment = browserEnvironment()) {}
  getStatus() { return this.status; }
  getRoom() { return this.room; }
  getReconnectUntil() { return this.reconnectUntil; }
  subscribeControls(listener: (event: CoopControlEvent) => void) { this.controls.add(listener); return () => { this.controls.delete(listener); }; }
  subscribeFrames(listener: (event: CoopFrame) => void) { this.frames.add(listener); return () => { this.frames.delete(listener); }; }
  private publish(event: CoopControlEvent) { this.controls.forEach(listener => listener(event)); }
  private connection(status: CoopConnectionStatus, message?: string) {
    this.status = status;
    this.publish({ type: 'connection', status, message, reconnectUntil: this.reconnectUntil || undefined });
  }
  connect(token: string) {
    if (this.token === token && this.status !== 'disconnected') return;
    this.close(); this.token = token; this.open(false);
  }
  private clearTimers() {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.authTimer !== null) clearTimeout(this.authTimer);
    this.retryTimer = null; this.authTimer = null;
  }
  private open(reconnecting: boolean) {
    if (!this.token) return;
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    this.clearTimers(); this.incoming = { state: -1, input: -1 }; this.outgoing = { state: 0, input: 0 };
    this.senderConnections = { state: '', input: '' };
    this.connection(reconnecting ? 'reconnecting' : 'connecting');
    let socket: Socket;
    try { socket = this.environment.createSocket(); } catch { this.disconnected(generation); return; }
    this.socket = socket;
    socket.onopen = () => {
      if (!current() || !this.token) return;
      this.connection(reconnecting ? 'reconnecting' : 'authenticating');
      socket.send(JSON.stringify({ v: 1, type: 'auth', token: this.token }));
    };
    socket.onmessage = event => {
      if (!current() || typeof event.data !== 'string') return;
      const message = parseCoopMessage(event.data);
      if (!message) { this.fail('联机数据格式无效，连接已停止。'); return; }
      if (message.type === 'authenticated') {
        if (this.authTimer !== null) clearTimeout(this.authTimer);
        this.authTimer = null; this.connection('connected');
        if (reconnecting && this.room) {
          this.reconnectRequestId = this.environment.requestId();
          this.send({ type: 'reconnect', requestId: this.reconnectRequestId, roomId: this.room.roomId });
          this.authTimer = setTimeout(() => {
            if (current() && this.reconnectRequestId) { socket.close(); this.disconnected(generation); }
          }, Math.max(1, Math.min(7000, this.reconnectUntil - this.environment.now())));
        }
      } else if (message.type === 'room') {
        if (message.buildId !== COOP_BUILD_ID) { this.fail('双方游戏版本不同，请刷新后重新建房。'); return; }
        if (this.room?.roomId === message.roomId && message.version < this.room.version) return;
        this.room = message;
        this.reconnectRequestId = null;
        if (this.authTimer !== null) clearTimeout(this.authTimer);
        this.authTimer = null;
        if (message.players.every(player => player.connected)) this.reconnectUntil = 0;
      } else if (message.type === 'closed' || message.type === 'left') {
        this.room = null; this.reconnectUntil = 0;
      } else if (message.type === 'error' && (message.requestId === this.reconnectRequestId || message.code === 'unauthorized')) {
        this.publish(message); this.fail(message.message); return;
      } else if (message.type === 'state' || message.type === 'input') {
        if (!this.room || message.roomId !== this.room.roomId || message.matchId !== this.room.matchId || message.slot === this.room.selfSlot) return;
        if (message.connectionId !== this.senderConnections[message.type]) {
          this.incoming[message.type] = -1; this.senderConnections[message.type] = message.connectionId;
        }
        if (message.seq <= this.incoming[message.type]) return;
        this.incoming[message.type] = message.seq;
        this.frames.forEach(listener => listener(message)); return;
      } else if (message.type === 'command') {
        if (!this.room || message.roomId !== this.room.roomId || message.matchId !== this.room.matchId) return;
      }
      // The frame branch returns above; its two-valued discriminator needs an explicit exclusion here.
      this.publish(message as Exclude<CoopServerMessage, CoopFrame>);
    };
    socket.onclose = () => { if (current()) this.disconnected(generation); };
    socket.onerror = () => { if (current()) socket.close(); };
    this.authTimer = setTimeout(() => { if (current()) { socket.close(); this.disconnected(generation); } },
      reconnecting ? Math.max(1, Math.min(7000, this.reconnectUntil - this.environment.now())) : 7000);
  }
  private disconnected(generation: number) {
    if (generation !== this.generation) return;
    ++this.generation; // Queued callbacks from this closed socket can no longer update the room.
    this.clearTimers(); this.socket = null;
    if (!this.room || !this.token) { this.connection('disconnected', '联机服务暂时不可用，请重试连接。'); return; }
    if (!this.reconnectUntil) this.reconnectUntil = this.environment.now() + 30_000;
    if (this.environment.now() >= this.reconnectUntil) {
      this.room = null; this.reconnectUntil = 0; this.token = null;
      this.connection('disconnected', '重连时间已用尽，本次合作已结束。');
      this.publish({ v: 1, type: 'closed', reason: '重连时间已用尽，本次合作已结束。' }); return;
    }
    this.connection('reconnecting', '连接中断，已暂停合作并尝试重连。');
    this.retryTimer = setTimeout(() => this.open(true), 1000);
  }
  private fail(message: string) {
    this.close(); this.connection('disconnected', message);
    this.publish({ v: 1, type: 'closed', reason: message });
  }
  send(message: CoopClientMessage): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1 || this.status !== 'connected') return false;
    // Never let stale inputs or world frames queue behind seconds of buffered network traffic.
    if (socket.bufferedAmount > 128_000) {
      const generation = this.generation;
      socket.close(); this.disconnected(generation); return false;
    }
    const payload = JSON.stringify({ ...message, v: 1 });
    if (new TextEncoder().encode(payload).byteLength > (message.type === 'input' ? 2000 : 65_000)) {
      this.fail('合作数据超过同步上限，连接已停止。请返回大厅重试。'); return false;
    }
    try { socket.send(payload); return true; } catch { socket.close(); return false; }
  }
  sendFrame(type: 'state' | 'input', payload: Record<string, unknown>): boolean {
    const seq = this.outgoing[type] + 1;
    if (!this.send({ type, seq, payload })) return false;
    this.outgoing[type] = seq; return true;
  }
  command(action: 'pause' | 'resume' | 'continue-ready') {
    return this.send({ type: 'command', requestId: this.environment.requestId(), action });
  }
  close() {
    ++this.generation; this.clearTimers();
    const socket = this.socket; this.socket = null;
    if (socket) { socket.onopen = null; socket.onmessage = null; socket.onclose = null; socket.onerror = null; socket.close(); }
    this.token = null; this.room = null; this.reconnectUntil = 0; this.reconnectRequestId = null;
    this.connection('disconnected');
  }
}
