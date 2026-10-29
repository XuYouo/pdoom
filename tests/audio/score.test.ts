import { describe, expect, it } from 'vitest';
import { MAX_MASTER_GAIN, notesForStep, planSfx, planStemLevels, sfxVoices, sliderToGain } from '../../src/pages/GamePage/game/audio/score';
import { STEM_ORDER, type AudioFrame } from '../../src/pages/GamePage/game/audio/types';
const frame: AudioFrame = { runId: 'run-a', stage: 4, doom: 8, bossActive: true, running: true, elapsedMs: 5000, hp: 90, shots: 1, rewinds: 0, rerolls: 0, turns: 0, stemsLost: 0 };

describe('original adaptive music and cue planning', () => {
  it.each([0, 1, 2, 3, 4])('sets exactly the first %i music stems to zero', stemsLost => {
    const input = { ...frame, stemsLost }; const before = JSON.stringify(input);
    const levels = planStemLevels(input);
    STEM_ORDER.forEach((stem, index) => { if (index < stemsLost) expect(levels[stem]).toBe(0); else expect(levels[stem]).toBeGreaterThan(0); });
    expect(JSON.stringify(input)).toBe(before);
  });
  it('restores all Boss layers after a weak-window return and never stores stale losses', () => {
    const lost = planStemLevels({ ...frame, stemsLost: 4 }); const restored = planStemLevels(frame);
    expect(Object.values(lost)).toEqual([0, 0, 0, 0]); expect(Object.values(restored).every(value => value > 0)).toBe(true);
  });
  it('adds percussion/drive by intensity without requiring the unlicensed original song', () => {
    const calm = planStemLevels({ ...frame, bossActive: false });
    expect(calm.chip).toBeGreaterThan(0); expect(calm.bass).toBeGreaterThan(0); expect(calm.percussion).toBe(0); expect(calm.drive).toBe(0);
    expect(planStemLevels({ ...frame, bossActive: false, doom: 50 }).percussion).toBeGreaterThan(0);
    expect(planStemLevels({ ...frame, bossActive: false, doom: 71 }).drive).toBeGreaterThan(0);
    expect(Object.values(planStemLevels({ ...frame, running: false }))).toEqual([0, 0, 0, 0]);
  });
  it.each([1, 2, 3, 4])('chapter %i uses bounded deterministic original voice specifications', stage => {
    for (let step = 0; step < 32; step++) {
      const notes = notesForStep(stage, step);
      expect(notes).toEqual(notesForStep(stage, step + 32));
      expect(notes.length).toBeLessThanOrEqual(5);
      expect(notes.every(note => Number.isFinite(note.frequency) && note.frequency > 0 && note.duration > 0 && note.duration < 1 && note.gain <= 0.35)).toBe(true);
      expect(notes.some(note => note.bus === 'sfx')).toBe(false);
    }
  });
  it('uses an actual zero at slider zero and a capped perceptual gain curve', () => {
    expect(sliderToGain(0)).toBe(0); expect(sliderToGain(1)).toBe(MAX_MASTER_GAIN);
    expect(sliderToGain(0.5)).toBe(MAX_MASTER_GAIN * 0.25);
    expect(sliderToGain(NaN)).toBe(0); expect(sliderToGain(-5)).toBe(0); expect(sliderToGain(10)).toBe(MAX_MASTER_GAIN);
  });
  it('coalesces counter bursts into distinct SFX and does not swallow them with music', () => {
    const next = { ...frame, hp: 70, shots: 100, rewinds: 2, rerolls: 1, turns: 1, stemsLost: 4 };
    expect(planSfx(frame, next)).toEqual(['hit', 'turn', 'reroll', 'rewind', 'shot']);
    for (const cue of planSfx(frame, next)) expect(sfxVoices(cue).every(voice => voice.bus === 'sfx')).toBe(true);
  });
  it('does not replay historical cues on new runs, chapters, checkpoint rewind or pause/resume', () => {
    expect(planSfx(null, frame)).toEqual([]);
    for (const next of [{ ...frame, runId: 'new', shots: 50 }, { ...frame, stage: 3, shots: 50 }, { ...frame, elapsedMs: 1, shots: 50 }, { ...frame, shots: 0 }, { ...frame, running: false, hp: 1 }]) expect(planSfx(frame, next)).toEqual([]);
    expect(planSfx({ ...frame, running: false }, { ...frame, shots: 20 })).toEqual([]);
  });
});
