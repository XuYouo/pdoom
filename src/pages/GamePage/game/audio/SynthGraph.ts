import { notesForStep, sfxVoices, sliderToGain } from './score';
import { GainAutomation } from './GainAutomation';
import { STEM_ORDER, clamp01, type AudioPreferences, type MusicStem, type SfxKind, type StemLevels, type VoiceSpec } from './types';

export const MAX_VOICES = 24;
export const MAX_MUSIC_VOICES = 16; // Reserve headroom for warnings/SFX even during four-stem battles.
export const GAIN_RAMP_SECONDS = 0.03;
interface ActiveVoice { source: AudioScheduledSourceNode; nodes: AudioNode[]; music: boolean }

function curve(amount: number, ceiling: number): Float32Array {
  const data = new Float32Array(257); // Exact zero at the central sample: silent inputs remain truly silent.
  for (let index = 0; index < data.length; index++) data[index] = ceiling * Math.tanh(amount * (index / 128 - 1)) / Math.tanh(amount);
  return data;
}

/** Real native nodes; BaseAudioContext permits the same graph to be rendered by OfflineAudioContext. */
export class SynthGraph {
  readonly stemGains: Record<MusicStem, GainNode>;
  readonly master: GainNode;
  private readonly inputs: Record<MusicStem | 'sfx', AudioNode>;
  private readonly persistent: AudioNode[] = [];
  private readonly voices = new Set<ActiveVoice>();
  private readonly noise: AudioBuffer;
  private readonly automation = new GainAutomation();
  private disposed = false;

  constructor(readonly context: BaseAudioContext) {
    const master = context.createGain(); master.gain.value = 0; this.master = master;
    const limiter = context.createWaveShaper(); limiter.curve = curve(1.6, 0.95);
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16; compressor.knee.value = 12; compressor.ratio.value = 8;
    compressor.attack.value = 0.003; compressor.release.value = 0.12;
    const music = context.createGain(); music.gain.value = 1;
    const sfx = context.createGain(); sfx.gain.value = 0.9;
    const chip = context.createGain(), bass = context.createGain(), percussion = context.createGain(), drive = context.createGain();
    this.stemGains = { chip, bass, percussion, drive };
    STEM_ORDER.forEach(stem => { this.stemGains[stem].gain.value = 0; this.stemGains[stem].connect(music); });
    const distortion = context.createWaveShaper(); distortion.curve = curve(3.5, 0.9);
    const tone = context.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1800; tone.Q.value = 0.7;
    distortion.connect(tone); tone.connect(drive); // The final drive bus gain is AFTER effect tails.
    this.inputs = { chip, bass, percussion, drive: distortion, sfx };
    music.connect(compressor); sfx.connect(compressor); compressor.connect(limiter); limiter.connect(master); master.connect(context.destination);
    this.persistent.push(master, limiter, compressor, music, sfx, chip, bass, percussion, drive, distortion, tone);
    this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.25), context.sampleRate);
    const samples = this.noise.getChannelData(0); let state = 0x517cc1b7;
    for (let index = 0; index < samples.length; index++) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      samples[index] = (state >>> 0) / 0xffffffff * 2 - 1;
    }
  }

  get activeVoiceCount(): number { return this.voices.size; }

  private ramp(param: AudioParam, target: number, at: number) {
    this.automation.ramp(param, target, at, this.context.currentTime, GAIN_RAMP_SECONDS);
  }

  setMaster(preferences: AudioPreferences, at = this.context.currentTime) {
    if (this.disposed) return;
    const value = preferences.muted ? 0 : sliderToGain(preferences.volume);
    this.ramp(this.master.gain, value, at);
  }

  setStemLevels(levels: StemLevels, at = this.context.currentTime) {
    if (this.disposed) return;
    STEM_ORDER.forEach(stem => {
      const value = clamp01(levels[stem]);
      this.ramp(this.stemGains[stem].gain, value, at);
    });
  }

  private release(voice: ActiveVoice) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    voice.nodes.forEach(node => { try { node.disconnect(); } catch { /* Already released by context shutdown. */ } });
  }

  play(spec: VoiceSpec, when = this.context.currentTime): boolean {
    if (this.disposed || !Number.isFinite(when) || !Number.isFinite(spec.frequency) || !Number.isFinite(spec.gain) || !Number.isFinite(spec.duration) || spec.gain <= 0) return false;
    const music = spec.bus !== 'sfx';
    if (this.voices.size >= MAX_VOICES || (music && [...this.voices].filter(voice => voice.music).length >= MAX_MUSIC_VOICES)) return false;
    const time = Math.max(this.context.currentTime, when), duration = Math.max(0.02, Math.min(1, spec.duration));
    const gain = this.context.createGain(); gain.gain.value = 0;
    const nodes: AudioNode[] = [gain];
    let source: OscillatorNode | AudioBufferSourceNode;
    if (spec.waveform === 'noise') {
      const noise = this.context.createBufferSource(); noise.buffer = this.noise; noise.loop = true; source = noise;
    } else {
      const oscillator = this.context.createOscillator(); oscillator.type = spec.waveform;
      oscillator.frequency.setValueAtTime(Math.max(20, Math.min(16000, spec.frequency)), time);
      if (spec.endFrequency !== undefined && Number.isFinite(spec.endFrequency)) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, Math.min(16000, spec.endFrequency)), time + duration);
      source = oscillator;
    }
    nodes.push(source);
    if (spec.highpass !== undefined) {
      const filter = this.context.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = Math.max(20, Math.min(18000, spec.highpass));
      source.connect(filter); filter.connect(gain); nodes.push(filter);
    } else source.connect(gain);
    gain.connect(this.inputs[spec.bus]);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(Math.min(0.35, spec.gain), time + Math.min(0.008, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration - 0.006);
    gain.gain.linearRampToValueAtTime(0, time + duration);
    const voice: ActiveVoice = { source, nodes, music }; this.voices.add(voice);
    source.onended = () => this.release(voice);
    try { source.start(time); source.stop(time + duration + 0.005); return true; }
    catch (error) { this.release(voice); throw error; }
  }

  stopAll() {
    for (const voice of [...this.voices]) {
      try { voice.source.stop(); } catch { /* A scheduled source may have ended already. */ }
      this.release(voice);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.stopAll(); this.automation.clear();
    this.persistent.forEach(node => { try { node.disconnect(); } catch { /* Idempotent teardown. */ } });
    this.persistent.length = 0;
  }
}

export function scheduleMusicStep(graph: SynthGraph, stage: number, step: number, when: number, levels: StemLevels): number {
  let played = 0;
  for (const spec of notesForStep(stage, step)) if (spec.bus !== 'sfx' && levels[spec.bus] > 0 && graph.play(spec, when)) played++;
  return played;
}

export function scheduleSfx(graph: SynthGraph, kind: SfxKind, when = graph.context.currentTime, variation = 0): number {
  return sfxVoices(kind, variation).filter(spec => graph.play(spec, when)).length;
}
