import { describe, expect, it, vi } from 'vitest';
import { AUDIO_SETTINGS_KEY, audioSettingsCommand, readAudioSettings, writeAudioSettings } from '../../src/pages/GamePage/functions/audioSettings';
import { DEFAULT_AUDIO_PREFERENCES } from '../../src/pages/GamePage/game/audio/types';

function storage(raw?: string) {
  const values = new Map<string, string>([['other-game-save', 'untouched']]);
  if (raw !== undefined) values.set(AUDIO_SETTINGS_KEY, raw);
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
}

describe('audio preference persistence at the React edge', () => {
  it('defaults safely without creating or rewriting a stored preference', () => {
    const store = storage(); const loaded = readAudioSettings(store);
    expect(loaded).toEqual({ preferences: DEFAULT_AUDIO_PREFERENCES, warning: null });
    expect(store.setItem).not.toHaveBeenCalled(); expect(store.getItem).toHaveBeenCalledExactlyOnceWith(AUDIO_SETTINGS_KEY);
  });
  it.each([{ muted: false, volume: 0 }, { muted: true, volume: 1 }, { muted: false, volume: 0.35 }])('roundtrips $muted / $volume and preserves unrelated game data', preferences => {
    const store = storage(); expect(writeAudioSettings(store, preferences)).toBeNull();
    expect(readAudioSettings(store).preferences).toEqual(preferences);
    expect(store.values.get('other-game-save')).toBe('untouched'); expect(store.values.size).toBe(2);
    expect(JSON.parse(store.values.get(AUDIO_SETTINGS_KEY)!)).toEqual({ version: 1, ...preferences });
  });
  it.each(['bad json', 'null', '[]', '{"version":2,"muted":false,"volume":0.2}', '{"version":1,"muted":"false","volume":0.2}', '{"version":1,"muted":false,"volume":-1}', '{"version":1,"muted":false,"volume":2}', '{"version":1,"muted":false,"volume":"0.5"}'])('rejects invalid stored settings without clobbering them: %s', raw => {
    const store = storage(raw); const loaded = readAudioSettings(store);
    expect(loaded.preferences).toEqual(DEFAULT_AUDIO_PREFERENCES); expect(loaded.warning).toBeTruthy();
    expect(store.values.get(AUDIO_SETTINGS_KEY)).toBe(raw); expect(store.setItem).not.toHaveBeenCalled();
  });
  it('contains storage exceptions while keeping in-memory preferences usable', () => {
    expect(readAudioSettings({ getItem: () => { throw new Error('blocked'); } }).warning).toBeTruthy();
    expect(writeAudioSettings({ setItem: () => { throw new Error('quota'); } }, { muted: false, volume: 0.3 })).toContain('本次调整仍生效');
  });
  it('normalizes interactive numeric bounds before writing or sending the command', () => {
    const store = storage(); writeAudioSettings(store, { muted: false, volume: NaN });
    expect(readAudioSettings(store).preferences.volume).toBe(0);
    expect(audioSettingsCommand({ muted: false, volume: 3 }, true).volume).toBe(1);
    expect(audioSettingsCommand({ muted: false, volume: -3 }, true).volume).toBe(0);
  });
  it('never requests autoplay unlock on initial/ready synchronization', () => {
    const preferences = { muted: false, volume: 0.5 };
    expect(audioSettingsCommand(preferences)).toEqual({ type: 'set-audio', muted: false, volume: 0.5, unlock: false });
    expect(audioSettingsCommand(preferences, true)).toEqual({ type: 'set-audio', muted: false, volume: 0.5, unlock: true });
    expect(preferences).toEqual({ muted: false, volume: 0.5 });
  });
});
