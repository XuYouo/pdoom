import { describe, expect, it } from 'vitest';
import { isAudioReset, planSfx, planStemLevels, sfxVoices } from '../../src/pages/GamePage/game/audio/score';
import type { AudioFrame } from '../../src/pages/GamePage/game/audio/types';
const frame: AudioFrame = { runId: 'actions', stage: 1, doom: 8, bossActive: false, running: true,
  elapsedMs: 5000, hp: 100, shots: 0, rewinds: 0, dashes: 3, insights: 2, rerolls: 0, turns: 0, stemsLost: 0 };
const actions = [{ kind: 'dash', key: 'dashes' }, { kind: 'insight', key: 'insights' }] as const;

describe('successful action audio planning, without keypress or World mutation', () => {
  it.each(actions)('$kind emits only on an increased authoritative counter', ({ kind, key }) => {
    const next = { ...frame, [key]: frame[key] + 1, elapsedMs: 5017 };
    const before = JSON.stringify([frame, next]);
    expect(planSfx(frame, next)).toEqual([kind]);
    expect(planSfx(next, { ...next, elapsedMs: 5034 })).toEqual([]);
    expect(JSON.stringify([frame, next])).toBe(before);
  });
  it.each(actions)('$kind coalesces a large delta, not a backlog', ({ kind, key }) => {
    expect(planSfx(frame, { ...frame, [key]: 100000 })).toEqual([kind]);
  });
  it.each(actions)('$kind counter rollback resets all cues', ({ key }) => {
    const next = { ...frame, [key]: 0, hp: 10, shots: 50 };
    expect(isAudioReset(frame, next)).toBe(true); expect(planSfx(frame, next)).toEqual([]);
  });
  it.each(actions)('$kind does not replay on initial/restored snapshots or frozen transitions', ({ key }) => {
    const next = { ...frame, [key]: 500 };
    expect(planSfx(null, next)).toEqual([]);
    for (const patch of [{ runId: 'new' }, { stage: 5 }, { elapsedMs: 1 }, { running: false }]) {
      expect(planSfx(frame, { ...next, ...patch })).toEqual([]);
    }
    expect(planSfx({ ...frame, running: false }, next)).toEqual([]);
  });
  it.each(actions)('$kind is not swallowed with music', ({ kind, key }) => {
    const next = { ...frame, stemsLost: 4, [key]: frame[key] + 1 };
    expect(Object.values(planStemLevels(next))).toEqual([0, 0, 0, 0]);
    expect(planSfx(frame, next)).toEqual([kind]);
  });
  it('gives the successful-turn cue priority over its simultaneous dash, preserving all older cues', () => {
    expect(planSfx(frame, { ...frame, hp: 80, shots: 1, rewinds: 1, rerolls: 1, turns: 1, dashes: 4, insights: 3 }))
      .toEqual(['hit', 'turn', 'reroll', 'rewind', 'insight', 'shot']);
  });
  it('emits both independent abilities in a stable order when no turn happens', () => {
    expect(planSfx(frame, { ...frame, dashes: 4, insights: 3 })).toEqual(['insight', 'dash']);
  });
  it.each(actions)('$kind has short, deterministic, bounded voices on the independent SFX bus', ({ kind }) => {
    const voices = sfxVoices(kind);
    expect(voices).toHaveLength(2); expect(voices).toEqual(sfxVoices(kind));
    for (const voice of voices) {
      expect(voice.bus).toBe('sfx'); expect(voice.duration).toBeGreaterThan(0.02); expect(voice.duration).toBeLessThanOrEqual(0.2);
      expect(voice.gain).toBeGreaterThan(0); expect(voice.gain).toBeLessThanOrEqual(0.16);
      expect(Number.isFinite(voice.frequency)).toBe(true); expect(voice.frequency).toBeGreaterThanOrEqual(20);
    }
    expect(voices).not.toEqual(sfxVoices('rewind')); expect(voices).not.toEqual(sfxVoices('reroll'));
  });
  it('makes a short falling dash and a rising two-tone insight, not interchangeable sounds', () => {
    const dash = sfxVoices('dash'), insight = sfxVoices('insight');
    expect(dash.some(voice => voice.waveform === 'noise')).toBe(true);
    expect(dash[0].endFrequency).toBeLessThan(dash[0].frequency);
    expect(insight.every(voice => voice.endFrequency! > voice.frequency)).toBe(true);
    expect(dash).not.toEqual(insight);
  });
});
