import type { Page } from '@playwright/test';
interface VoiceObservation { wave: OscillatorType; frequency: number; endFrequency: number | null; when: number; end: number | null }
interface ActionAudioProbe {
  contexts: AudioContext[]; voices: VoiceObservation[]; samples: { time: number; rms: number; peak: number }[];
  keys: { key: string; trusted: boolean; at: number }[]; sfxIdentified: boolean; overflow: boolean;
}
interface ActionAudioWindow extends Window { __actionAudio: ActionAudioProbe }
/** Read-only native API taps, never the private game/World/bridge. Original calls always run. */
export async function installActionAudioProbe(page: Page) {
  await page.addInitScript(() => {
    const target = window as unknown as ActionAudioWindow;
    const probe: ActionAudioProbe = { contexts: [], voices: [], samples: [], keys: [], sfxIdentified: false, overflow: false };
    target.__actionAudio = probe;
    const params = new WeakMap<AudioParam, { frequency: number; endFrequency: number | null; end: number | null }>();
    const set = AudioParam.prototype.setValueAtTime, ramp = AudioParam.prototype.exponentialRampToValueAtTime;
    AudioParam.prototype.setValueAtTime = function (this: AudioParam, value: number, at: number) {
      const result = Reflect.apply(set, this, [value, at]); const row = params.get(this); if (row) row.frequency = value; return result;
    };
    AudioParam.prototype.exponentialRampToValueAtTime = function (this: AudioParam, value: number, at: number) {
      const result = Reflect.apply(ramp, this, [value, at]); const row = params.get(this);
      if (row) { row.endFrequency = value; row.end = at; } return result;
    };
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); probe.contexts.push(this); }
      createOscillator(): OscillatorNode {
        const source = super.createOscillator(), row = { frequency: 0, endFrequency: null as number | null, end: null as number | null };
        params.set(source.frequency, row); const start = source.start.bind(source);
        source.start = (when = this.currentTime) => {
          start(when);
          if (probe.voices.length < 4096) probe.voices.push({ wave: source.type, ...row, when }); else probe.overflow = true;
        };
        return source;
      }
    };
    document.addEventListener('keydown', event => {
      if (['Shift', 'e', 'E'].includes(event.key)) probe.keys.push({ key: event.key, trusted: event.isTrusted, at: performance.now() });
    }, true);
    const connect = AudioNode.prototype.connect, incoming = new WeakMap<AudioNode, Set<AudioNode>>();
    const musicMixers = new WeakSet<AudioNode>();
    AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
      const result = Reflect.apply(connect, this, [destination, ...ports]);
      if (!probe.sfxIdentified && destination instanceof AudioNode) {
        const inputs = incoming.get(destination) ?? new Set<AudioNode>(); inputs.add(this); incoming.set(destination, inputs);
        if (this instanceof GainNode && destination instanceof DynamicsCompressorNode) {
          const children = [...(incoming.get(this) ?? [])];
          if (children.length === 4 && children.every(node => node instanceof GainNode)) musicMixers.add(destination);
          else if (children.length === 0 && musicMixers.has(destination)) {
            probe.sfxIdentified = true;
            const analyser = this.context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
            Reflect.apply(connect, this, [analyser]); // Parallel SFX tap with no output or injected signal.
            const context = this.context, samples = new Float32Array(analyser.fftSize);
            const observe = () => {
              if (context.state === 'closed') return;
              analyser.getFloatTimeDomainData(samples);
              let sum = 0, peak = 0; for (const value of samples) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
              if (probe.samples.length >= 4096) { probe.overflow = true; return; }
              probe.samples.push({ time: context.currentTime, rms: Math.sqrt(sum / samples.length), peak }); requestAnimationFrame(observe);
            };
            requestAnimationFrame(observe);
          }
        }
      }
      return result;
    } as AudioNode['connect'];
  });
}
export const actionAudioEvidence = (page: Page) => page.evaluate(() => {
  const p = (window as unknown as ActionAudioWindow).__actionAudio;
  return { states: p.contexts.map(c => c.state), voices: p.voices, samples: p.samples, keys: p.keys,
    sfxIdentified: p.sfxIdentified, overflow: p.overflow };
});
export function abilityVoices(proof: Awaited<ReturnType<typeof actionAudioEvidence>>, kind: 'dash' | 'insight') {
  return proof.voices.filter(row => kind === 'dash' ? row.wave === 'triangle' && row.frequency === 760 && row.endFrequency === 190
    : row.wave === 'sine' && row.frequency === 620 && row.endFrequency === 1240);
}
export async function nativeHero(page: Page, requireHero = true) {
  for (let index = 0; index < 15; index++) {
    const frame = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas')!;
      // Capture the rendered buffer, before WebGL clears it for browser compositing.
      const png = await new Promise<string>(resolve => requestAnimationFrame(() => resolve(canvas.toDataURL('image/png'))));
      const image = new Image(); image.src = png; await image.decode();
      const copy = document.createElement('canvas'); copy.width = image.width; copy.height = image.height;
      const context = copy.getContext('2d')!; context.drawImage(image, 0, 0); const data = context.getImageData(0, 0, copy.width, copy.height).data;
      let count = 0, sumX = 0;
      for (let y = 180; y < 320; y++) for (let x = 20; x < 280; x++) {
        const at = (y * copy.width + x) * 4;
        if (data[at] === 217 && data[at + 1] === 119 && data[at + 2] === 87 && data[at + 3] === 255) { count++; sumX += x; }
      }
      const scan: number[][] = [];
      for (const y of [64, 112]) for (let x = 48; x < 608; x += 32) {
        const at = (y * copy.width + x) * 4; scan.push([data[at], data[at + 1], data[at + 2]]);
      }
      return { png, width: image.width, height: image.height, count, x: count ? sumX / count : null, scan };
    });
    if (!requireHero || (frame.count > 80 && frame.x !== null)) return frame;
    await page.waitForTimeout(50);
  }
  throw new Error('No visible native orange actor in the actual first-room canvas');
}
