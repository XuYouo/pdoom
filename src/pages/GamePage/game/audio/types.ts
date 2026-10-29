export interface AudioPreferences { muted: boolean; volume: number }
export const DEFAULT_AUDIO_PREFERENCES: Readonly<AudioPreferences> = Object.freeze({ muted: false, volume: 0.5 });

/** Snapshot of counters/state, never a mutable WorldState or a persistence handle. */
export interface AudioFrame {
  runId: string;
  stage: number;
  doom: number;
  bossActive: boolean;
  running: boolean;
  elapsedMs: number;
  hp: number;
  shots: number;
  rewinds: number;
  rerolls: number;
  turns: number;
  stemsLost: number;
}
export const STEM_ORDER = ['chip', 'bass', 'percussion', 'drive'] as const;
export type MusicStem = typeof STEM_ORDER[number];
export type StemLevels = Record<MusicStem, number>;
export type SfxKind = 'shot' | 'hit' | 'rewind' | 'reroll' | 'turn';
export interface VoiceSpec {
  bus: MusicStem | 'sfx';
  waveform: 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise';
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain: number;
  highpass?: number;
}
export const clamp01 = (value: number): number => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
export const normalizePreferences = (value: AudioPreferences): AudioPreferences => ({ muted: value.muted, volume: clamp01(value.volume) });
