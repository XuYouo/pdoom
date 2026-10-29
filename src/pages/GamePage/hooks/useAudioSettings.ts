import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioStatus, GameBridge } from '../game/bridge';
import { DEFAULT_AUDIO_PREFERENCES, normalizePreferences, type AudioPreferences } from '../game/audio/types';
import { AUDIO_STORAGE_WARNING, audioSettingsCommand, readAudioSettings, writeAudioSettings } from '../functions/audioSettings';

export function useAudioSettings(bridge: GameBridge) {
  const [preferences, setPreferences] = useState<AudioPreferences>(() => ({ ...DEFAULT_AUDIO_PREFERENCES }));
  const preferencesRef = useRef(preferences);
  const [status, setStatus] = useState<AudioStatus>('locked');
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    try {
      const loaded = readAudioSettings(window.localStorage);
      preferencesRef.current = loaded.preferences; setPreferences(loaded.preferences); setStorageWarning(loaded.warning);
    } catch { setStorageWarning('浏览器不允许读取音频设置，使用安全默认值。'); }
    const off = bridge.onEvent(event => {
      if (event.type === 'audio-status') setStatus(event.status);
      if (event.type === 'ready') bridge.send(audioSettingsCommand(preferencesRef.current));
    });
    // This may precede Scene construction; the ready event repeats only this non-unlocking sync.
    bridge.send(audioSettingsCommand(preferencesRef.current));
    return off;
  }, [bridge]);

  const commit = useCallback((next: AudioPreferences) => {
    const normalized = normalizePreferences(next);
    preferencesRef.current = normalized; setPreferences(normalized);
    try { setStorageWarning(writeAudioSettings(window.localStorage, normalized)); }
    catch { setStorageWarning(AUDIO_STORAGE_WARNING); }
    // Called directly by a user control. Scene receives this synchronously within the gesture.
    bridge.send(audioSettingsCommand(normalized, true));
  }, [bridge]);
  const setMuted = useCallback((muted: boolean) => commit({ ...preferencesRef.current, muted }), [commit]);
  const setVolume = useCallback((volume: number) => commit({ ...preferencesRef.current, volume }), [commit]);
  const unlock = useCallback(() => bridge.send(audioSettingsCommand(preferencesRef.current, true)), [bridge]);
  return { preferences, status, storageWarning, setMuted, setVolume, unlock };
}
