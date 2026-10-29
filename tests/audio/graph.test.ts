import { describe, expect, it, vi } from 'vitest';
import { MAX_MUSIC_VOICES, MAX_VOICES, SynthGraph, scheduleMusicStep, scheduleSfx } from '../../src/pages/GamePage/game/audio/SynthGraph';
import { MAX_MASTER_GAIN, planStemLevels } from '../../src/pages/GamePage/game/audio/score';
import { STEM_ORDER, type VoiceSpec } from '../../src/pages/GamePage/game/audio/types';
import { FakeContext, FakeNode, FakeParam, FakeShaper } from './fakeAudio';

// These assertions inspect native-API-shaped routing, envelopes and cleanup, not audible PCM.
describe('synth graph structural safety', () => {
  it('ramps every lost music bus to an exact zero, restores it and leaves SFX on a separate route', () => {
    const context = new FakeContext(); const graph = new SynthGraph(context.asContext());
    const frame = { running: true, bossActive: true, doom: 80, stemsLost: 0 };
    graph.setMaster({ muted: false, volume: 1 }); graph.setStemLevels(planStemLevels(frame));
    expect(scheduleMusicStep(graph, 4, 0, 0.02, planStemLevels(frame))).toBe(5);
    graph.setStemLevels(planStemLevels({ ...frame, stemsLost: 4 }));
    for (const stem of STEM_ORDER) {
      const param = graph.stemGains[stem].gain as unknown as FakeParam;
      expect(param.events[param.events.length - 1]).toMatchObject({ kind: 'linear', value: 0 });
    }
    expect(scheduleSfx(graph, 'shot')).toBe(1);
    const source = context.sources[context.sources.length - 1];
    const envelope = source.connections[0];
    expect(Object.values(graph.stemGains)).not.toContain(envelope.connections[0]);
    graph.setStemLevels(planStemLevels(frame));
    expect(STEM_ORDER.every(stem => graph.stemGains[stem].gain.value > 0)).toBe(true);
    graph.dispose();
  });
  it('wires explicit future zero and recovery anchors through the production four-stem graph', () => {
    const context = new FakeContext(); const graph = new SynthGraph(context.asContext());
    const frame = { running: true, bossActive: true, doom: 80, stemsLost: 0 }; const full = planStemLevels(frame);
    graph.setStemLevels(full, 0); graph.setStemLevels(planStemLevels({ ...frame, stemsLost: 4 }), 0.15); graph.setStemLevels(full, 0.3);
    for (const stem of STEM_ORDER) {
      const events = (graph.stemGains[stem].gain as unknown as FakeParam).events;
      expect(events).toContainEqual({ kind: 'set', value: full[stem], time: 0.15 });
      expect(events).toContainEqual({ kind: 'set', value: 0, time: 0.3 });
      expect(events[events.length - 1]).toEqual({ kind: 'linear', value: full[stem], time: 0.3 + 0.03 });
    }
    graph.dispose();
  });
  it('cleans a failed native source and propagates its original error instead of reporting a budget skip', () => {
    const context = new FakeContext(); const graph = new SynthGraph(context.asContext());
    const create = context.createOscillator.bind(context); const original = new Error('source.start rejected');
    const spy = vi.spyOn(context, 'createOscillator').mockImplementation(() => {
      const source = create(); source.start = () => { throw original; }; return source;
    });
    expect(() => graph.play({ bus: 'chip', waveform: 'square', frequency: 440, duration: 0.1, gain: 0.1 })).toThrow(original);
    expect(graph.activeVoiceCount).toBe(0); expect(context.sources[0].disconnected).toBe(true);
    spy.mockRestore(); graph.dispose();
  });
  it('keeps hard resource budgets and frees them on ended', () => {
    const context = new FakeContext(); const graph = new SynthGraph(context.asContext());
    const spec: VoiceSpec = { bus: 'chip', waveform: 'square', frequency: 440, duration: 0.1, gain: 0.1 };
    for (let index = 0; index < 100; index++) graph.play(spec);
    expect(graph.activeVoiceCount).toBe(MAX_MUSIC_VOICES);
    for (let index = 0; index < 100; index++) graph.play({ ...spec, bus: 'sfx' });
    expect(graph.activeVoiceCount).toBe(MAX_VOICES);
    context.advance(0.2); expect(graph.activeVoiceCount).toBe(0);
    expect(context.sources.every(source => source.disconnected)).toBe(true);
    graph.dispose();
  });
  it('sets a bounded symmetric final limiter and a true-zero master mute', () => {
    const context = new FakeContext(); const graph = new SynthGraph(context.asContext());
    graph.setMaster({ muted: false, volume: 5 }); expect(graph.master.gain.value).toBe(MAX_MASTER_GAIN);
    graph.setMaster({ muted: true, volume: 1 }); expect(graph.master.gain.value).toBe(0);
    const limiter = context.nodes.find(node => node.kind === 'shaper') as FakeShaper;
    expect(limiter.curve?.[128]).toBe(0);
    expect([...limiter.curve!].every(value => Math.abs(value) <= 0.951)).toBe(true);
    graph.dispose();
  });
  it('does not keep rescheduling an unchanged zero and disconnects every owned node on dispose', () => {
    const context = new FakeContext(); const graph = new SynthGraph(context.asContext());
    const levels = { chip: 0, bass: 0, percussion: 0, drive: 0 };
    graph.setStemLevels(levels); const parameter = graph.stemGains.chip.gain as unknown as FakeParam;
    const events = parameter.events.length; graph.setStemLevels(levels); expect(parameter.events.length).toBe(events);
    scheduleSfx(graph, 'reroll'); graph.dispose(); graph.dispose();
    expect(graph.activeVoiceCount).toBe(0);
    expect(context.nodes.every((node: FakeNode) => node.disconnected)).toBe(true);
    expect(scheduleSfx(graph, 'shot')).toBe(0);
  });
});
