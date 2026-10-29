import type { Page } from '@playwright/test';

interface ProbedWindow extends Window {
  __audioContexts: AudioContext[]; __musicBuses: GainNode[][]; __audioCloses: string[];
  __musicAnalysers: AnalyserNode[][];
  __automationTargets: WeakMap<AudioParam, { target: number; end: number }>;
}

/** Test-only observers of native APIs. They never expose/read/write the game's private state. */
export async function observeNativeContexts(page: Page) {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    const target = window as unknown as ProbedWindow;
    target.__audioContexts = []; target.__musicBuses = []; target.__audioCloses = [];
    target.__musicAnalysers = []; target.__automationTargets = new WeakMap();
    const ramp = AudioParam.prototype.linearRampToValueAtTime;
    AudioParam.prototype.linearRampToValueAtTime = function (this: AudioParam, value: number, endTime: number) {
      const result = Reflect.apply(ramp, this, [value, endTime]);
      target.__automationTargets.set(this, { target: value, end: endTime });
      return result;
    };
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) { super(options); target.__audioContexts.push(this); }
      close(): Promise<void> { target.__audioCloses.push(new Error('Observed native AudioContext.close').stack ?? 'closed'); return super.close(); }
    };
    const connect = AudioNode.prototype.connect;
    const incoming = new WeakMap<AudioNode, Set<AudioNode>>();
    const identified = new WeakSet<BaseAudioContext>();
    AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
      const result = Reflect.apply(connect, this, [destination, ...ports]);
      if (destination instanceof AudioNode && !identified.has(this.context)) {
        const sources = incoming.get(destination) ?? new Set<AudioNode>();
        sources.add(this); incoming.set(destination, sources);
        if (this instanceof GainNode && destination instanceof DynamicsCompressorNode) {
          const inputs = [...(incoming.get(this) ?? [])];
          if (inputs.length === 4 && inputs.every(value => value instanceof GainNode)) {
            // Four real persistent stem gains converge on a music mixer before the compressor.
            // Stop observing this graph now; never retain the subsequently created voice nodes.
            target.__musicBuses.push(inputs as GainNode[]); identified.add(this.context);
            target.__musicAnalysers.push(inputs.map(stem => {
              const analyser = this.context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
              Reflect.apply(connect, stem, [analyser]); // Parallel read-only tap; original destination stays connected.
              return analyser; // No output connection and no probe signal injected.
            }));
          }
        }
      }
      return result;
    } as AudioNode['connect'];
  });
}

export const contextStates = (page: Page) => page.evaluate(() => (window as unknown as ProbedWindow).__audioContexts.map(value => value.state));
export const nativeMusicLevels = (page: Page) => page.evaluate(() => (window as unknown as ProbedWindow).__musicBuses.map(bus => bus.map(node => node.gain.value)));
export const audioCloseStacks = (page: Page) => page.evaluate(() => (window as unknown as ProbedWindow).__audioCloses);
export const nativeAudioEvidence = (page: Page) => page.evaluate(() => {
  const probe = window as unknown as ProbedWindow;
  return {
    contexts: probe.__audioContexts.map(context => ({ state: context.state, time: context.currentTime })),
    buses: probe.__musicBuses.map((bus, graphIndex) => bus.map((node, index) => {
      const analyser = probe.__musicAnalysers[graphIndex][index];
      const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
      let sum = 0, peak = 0; for (const value of samples) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
      const automation = probe.__automationTargets.get(node.gain);
      return { value: node.gain.value, target: automation?.target ?? node.gain.value, end: automation?.end ?? 0,
        reached: node.context.currentTime >= (automation?.end ?? 0), rms: Math.sqrt(sum / samples.length), peak };
    })),
    closes: probe.__audioCloses,
  };
});

/** One browser round trip observes the urgent window, missing HP DOM and real silent stems together. */
export const waitForSwallowedGameFrame = (page: Page) => page.evaluate(() => new Promise<Awaited<ReturnType<typeof nativeAudioEvidence>>>((resolve, reject) => {
  const started = performance.now();
  const probe = window as unknown as ProbedWindow;
  const check = () => {
    const evidence = {
      contexts: probe.__audioContexts.map(context => ({ state: context.state, time: context.currentTime })),
      buses: probe.__musicBuses.map((bus, graphIndex) => bus.map((node, index) => {
        const analyser = probe.__musicAnalysers[graphIndex][index]; const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        let sum = 0, peak = 0; for (const value of samples) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
        const automation = probe.__automationTargets.get(node.gain);
        return { value: node.gain.value, target: automation?.target ?? node.gain.value, end: automation?.end ?? 0,
          reached: node.context.currentTime >= (automation?.end ?? 0), rms: Math.sqrt(sum / samples.length), peak };
      })), closes: probe.__audioCloses,
    };
    const bus = evidence.buses[0];
    const windowReady = document.querySelector('.objective')?.textContent?.includes('急转弯窗口');
    const missing = document.querySelector<HTMLElement>('.integrity-missing');
    const bounds = missing?.getBoundingClientRect();
    const hpMissing = !!missing && !!bounds?.width && !!bounds.height && getComputedStyle(missing).visibility !== 'hidden' && !document.querySelector('.integrity-track');
    const cut = bus?.length === 4 && bus.slice(0, 2).every(stem => stem.target === 0 && stem.reached && stem.rms < 1e-7)
      && bus.slice(2).every(stem => stem.target > 0 && stem.reached);
    if (windowReady && hpMissing && cut && evidence.contexts.length === 1 && evidence.contexts[0].state === 'running' && evidence.closes.length === 0) resolve(evidence);
    else if (performance.now() - started > 8000) reject(new Error(`No visible swallow window with native PCM: ${JSON.stringify(evidence)}`));
    else setTimeout(check, 16);
  };
  check();
}));
