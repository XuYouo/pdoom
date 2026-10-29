import type { GameCommand } from '../game/bridge';
import { DEFAULT_AUDIO_PREFERENCES, normalizePreferences, type AudioPreferences } from '../game/audio/types';

export const AUDIO_SETTINGS_KEY = 'pdoom.audio.v1';
export const AUDIO_STORAGE_WARNING = '浏览器未能保存音频设置；本次调整仍生效。';
export interface LoadedAudioSettings { preferences: AudioPreferences; warning: string | null }

export function readAudioSettings(storage: Pick<Storage, 'getItem'>): LoadedAudioSettings {
  const fallback = { ...DEFAULT_AUDIO_PREFERENCES };
  try {
    const raw = storage.getItem(AUDIO_SETTINGS_KEY);
    if (raw === null) return { preferences: fallback, warning: null };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const data = parsed as Record<string, unknown>;
      if (data.version === 1 && typeof data.muted === 'boolean' && typeof data.volume === 'number'
        && Number.isFinite(data.volume) && data.volume >= 0 && data.volume <= 1) {
        return { preferences: { muted: data.muted, volume: data.volume }, warning: null };
      }
    }
    return { preferences: fallback, warning: '音频设置格式不受支持，暂用安全默认值；原游戏存档未改动。' };
  } catch {
    return { preferences: fallback, warning: '无法读取音频设置，暂用安全默认值；原游戏存档未改动。' };
  }
}

export function writeAudioSettings(storage: Pick<Storage, 'setItem'>, preferences: AudioPreferences): string | null {
  try { storage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ version: 1, ...normalizePreferences(preferences) })); return null; }
  catch { return AUDIO_STORAGE_WARNING; }
}

/** Initial/ready sync MUST leave unlock false. Interactive controls opt in explicitly. */
export function audioSettingsCommand(preferences: AudioPreferences, unlock = false): Extract<GameCommand, { type: 'set-audio' }> {
  return { type: 'set-audio', ...normalizePreferences(preferences), unlock };
}
