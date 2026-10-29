// Structural lifecycle/automation double only. These tests do NOT claim to render or hear sound.
export class FakeParam {
  value = 1;
  events: Array<{ kind: string; value?: number; time: number }> = [];
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push({ kind: 'set', value, time }); return this; }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ kind: 'linear', value, time }); return this; }
  exponentialRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ kind: 'exponential', value, time }); return this; }
  cancelScheduledValues(time: number) { this.events.push({ kind: 'cancel', time }); return this; }
  cancelAndHoldAtTime(time: number) { this.events.push({ kind: 'hold', time }); return this; }
}
export class FakeNode {
  connections: FakeNode[] = [];
  disconnected = false;
  constructor(readonly kind: string) {}
  connect(node: FakeNode) { this.connections.push(node); return node; }
  disconnect() { this.connections.length = 0; this.disconnected = true; }
}
export class FakeGain extends FakeNode { gain = new FakeParam(); constructor() { super('gain'); } }
export class FakeFilter extends FakeNode { type = ''; frequency = new FakeParam(); Q = new FakeParam(); constructor() { super('filter'); } }
export class FakeShaper extends FakeNode { curve: Float32Array | null = null; constructor() { super('shaper'); } }
export class FakeCompressor extends FakeNode {
  threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam(); attack = new FakeParam(); release = new FakeParam();
  constructor() { super('compressor'); }
}
export class FakeSource extends FakeNode {
  frequency = new FakeParam(); type = ''; loop = false; buffer: unknown = null;
  onended: (() => void) | null = null;
  startedAt: number | null = null; stoppedAt = Infinity; ended = false;
  constructor(private readonly owner: FakeContext, kind: string) { super(kind); }
  start(time = this.owner.currentTime) { this.startedAt = time; }
  stop(time = this.owner.currentTime) { this.stoppedAt = time; this.finishIfDue(); }
  finishIfDue() {
    if (!this.ended && this.stoppedAt <= this.owner.currentTime) { this.ended = true; this.onended?.(); }
  }
}
export class FakeContext {
  currentTime = 0; sampleRate = 8000;
  state: AudioContextState = 'suspended';
  destination = new FakeNode('destination');
  onstatechange: (() => void) | null = null;
  nodes: FakeNode[] = [];
  sources: FakeSource[] = [];
  resumeCalls = 0; suspendCalls = 0; closeCalls = 0;
  rejectResume = false; resumeGate: Promise<void> | null = null;
  private node<T extends FakeNode>(node: T): T { this.nodes.push(node); return node; }
  createGain() { return this.node(new FakeGain()); }
  createBiquadFilter() { return this.node(new FakeFilter()); }
  createWaveShaper() { return this.node(new FakeShaper()); }
  createDynamicsCompressor() { return this.node(new FakeCompressor()); }
  createOscillator() { const node = this.node(new FakeSource(this, 'oscillator')); this.sources.push(node); return node; }
  createBufferSource() { const node = this.node(new FakeSource(this, 'buffer')); this.sources.push(node); return node; }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, getChannelData: (channel: number) => data[channel] };
  }
  async resume() {
    this.resumeCalls++;
    if (this.resumeGate) await this.resumeGate;
    if (this.rejectResume || this.state === 'closed') throw new Error('audio resume rejected');
    this.state = 'running'; this.onstatechange?.();
  }
  async suspend() { this.suspendCalls++; this.state = 'suspended'; this.onstatechange?.(); }
  async close() { this.closeCalls++; this.state = 'closed'; this.onstatechange?.(); }
  advance(seconds: number) { this.currentTime += seconds; this.sources.forEach(source => source.finishIfDue()); }
  asContext(): AudioContext { return this as unknown as AudioContext; }
}
