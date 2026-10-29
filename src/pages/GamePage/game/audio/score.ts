import { STEM_ORDER, clamp01, type AudioFrame, type MusicStem, type SfxKind, type StemLevels, type VoiceSpec } from './types';

export const STEP_SECONDS = 0.125; // Original 120 BPM, sixteenth-note clock.
export const MAX_MASTER_GAIN = 0.32; // Before hardware volume; final soft-clipped signal stays below full scale.
export const sliderToGain = (volume: number): number => MAX_MASTER_GAIN * clamp01(volume) ** 2;
export const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export function planStemLevels(frame: Pick<AudioFrame, 'doom' | 'bossActive' | 'running' | 'stemsLost'>): StemLevels {
  const levels: StemLevels = { chip: 0.72, bass: 0.58, percussion: frame.bossActive || frame.doom >= 35 ? 0.64 : 0, drive: frame.bossActive || frame.doom > 70 ? 0.42 : 0 };
  const lost = Number.isFinite(frame.stemsLost) ? Math.max(0, Math.min(4, Math.floor(frame.stemsLost))) : 4;
  STEM_ORDER.forEach((stem, index) => { if (!frame.running || index < lost) levels[stem] = 0; });
  return levels;
}

// Newly authored short motifs. No sampled song, vocal, lyric or quoted melody.
const MELODY = [74, null, 77, 81, 79, 72, null, 77, 74, 69, 72, null, 76, 79, 77, null,
  81, 77, null, 74, 72, 76, 79, null, 77, 74, 69, 72, null, 76, 74, null] as const;
const ROOTS = [38, 41, 36, 43] as const;
const TRANSPOSE = [0, 0, 2, 5, -2] as const;

export function notesForStep(stage: number, index: number): VoiceSpec[] {
  const safeIndex = Number.isFinite(index) ? Math.floor(index) : 0;
  const step = ((safeIndex % 32) + 32) % 32;
  const transpose = TRANSPOSE[Math.max(0, Math.min(4, Math.floor(stage) - 1))] ?? 0;
  const notes: VoiceSpec[] = [];
  const note = MELODY[step];
  if (note !== null) notes.push({ bus: 'chip', waveform: 'square', frequency: midiHz(note + transpose), duration: 0.15, gain: 0.16 });
  const root = ROOTS[Math.floor(step / 8)] + transpose;
  if (step % 4 === 0) notes.push({ bus: 'bass', waveform: 'triangle', frequency: midiHz(root), duration: 0.32, gain: 0.24 });
  if (step % 8 === 0) notes.push({ bus: 'percussion', waveform: 'sine', frequency: 132, endFrequency: 44, duration: 0.14, gain: 0.28 });
  if (step % 8 === 4) notes.push({ bus: 'percussion', waveform: 'noise', frequency: 2200, highpass: 900, duration: 0.09, gain: 0.19 });
  if (step % 2 === 0) notes.push({ bus: 'percussion', waveform: 'noise', frequency: 6000, highpass: 4800, duration: 0.035, gain: 0.09 });
  if (step % 2 === 0) notes.push({ bus: 'drive', waveform: 'sawtooth', frequency: midiHz(root + 12 + (step % 4 === 2 ? 7 : 0)), duration: 0.18, gain: 0.2 });
  return notes;
}

export function isAudioReset(previous: AudioFrame | null, next: AudioFrame): boolean {
  return !previous || previous.runId !== next.runId || previous.stage !== next.stage || next.elapsedMs < previous.elapsedMs
    || next.shots < previous.shots || next.rewinds < previous.rewinds || next.rerolls < previous.rerolls || next.turns < previous.turns;
}

export function planSfx(previous: AudioFrame | null, next: AudioFrame): SfxKind[] {
  if (!previous || isAudioReset(previous, next) || !previous.running || !next.running) return [];
  const cues: SfxKind[] = [];
  if (next.hp < previous.hp) cues.push('hit');
  if (next.turns > previous.turns) cues.push('turn');
  if (next.rerolls > previous.rerolls) cues.push('reroll');
  if (next.rewinds > previous.rewinds) cues.push('rewind');
  if (next.shots > previous.shots) cues.push('shot'); // Coalesce bursts, never replay every historical shot.
  return cues;
}

export function sfxVoices(kind: SfxKind, variation = 0): VoiceSpec[] {
  const pitch = 1 + ((Math.abs(Math.floor(variation)) % 5) - 2) * 0.018;
  const base = { bus: 'sfx' as const };
  switch (kind) {
    case 'shot': return [{ ...base, waveform: 'square', frequency: 920 * pitch, endFrequency: 420 * pitch, duration: 0.055, gain: 0.16 }];
    case 'hit': return [{ ...base, waveform: 'noise', frequency: 1400, highpass: 220, duration: 0.16, gain: 0.25 }];
    case 'rewind': return [{ ...base, waveform: 'triangle', frequency: 900, endFrequency: 170, duration: 0.3, gain: 0.23 }];
    case 'reroll': return [{ ...base, waveform: 'sine', frequency: 250, endFrequency: 1100, duration: 0.24, gain: 0.24 }, { ...base, waveform: 'square', frequency: 750, endFrequency: 375, duration: 0.18, gain: 0.1 }];
    case 'turn': return [{ ...base, waveform: 'sawtooth', frequency: 180, endFrequency: 720, duration: 0.3, gain: 0.2 }, { ...base, waveform: 'noise', frequency: 3000, highpass: 1800, duration: 0.1, gain: 0.13 }];
  }
}

export const activeStems = (levels: StemLevels): MusicStem[] => STEM_ORDER.filter(stem => levels[stem] > 0);
