import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameSaveData, RunResult } from '../../src/objects/game/GameSaveData';
import type { GameCommand, RestRoomSnapshot } from '../../src/pages/GamePage/game/bridge';
import { isCompletedSave } from '../../src/pages/GamePage/game/data/checkpoints';
import { contextSnapshot } from '../../src/pages/GamePage/game/systems/context';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { buildScoreSubmission } from '../../src/pages/GamePage/hooks/useScoreSubmission';
import { useGameSession } from '../../src/pages/GamePage/hooks/useGameSession';

type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void };
const hooks = vi.hoisted(() => {
  let cursor = 0; let slots: Slot[] = []; let queued: (() => void)[] = [];
  const same = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  return {
    begin: () => { cursor = 0; },
    flush: () => { const callbacks = queued; queued = []; callbacks.forEach(callback => callback()); },
    clear: () => { slots.forEach(slot => slot.cleanup?.()); slots = []; queued = []; cursor = 0; },
    useState: <T>(initial: T | (() => T)) => {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? (initial as () => T)() : initial };
      return [slots[index].value as T, (next: T | ((value: T) => T)) => { slots[index].value = typeof next === 'function' ? (next as (value: T) => T)(slots[index].value as T) : next; }] as const;
    },
    useRef: <T>(initial: T) => { const index = cursor++; if (!slots[index]) slots[index] = { value: { current: initial } }; return slots[index].value as { current: T }; },
    useCallback: <T>(callback: T, deps: readonly unknown[]) => {
      const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value as T;
    },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = cursor++; const old = slots[index];
      if (!old || !same(old.deps, deps)) {
        const slot: Slot = { deps }; slots[index] = slot;
        queued.push(() => { old?.cleanup?.(); const cleanup = effect(); if (typeof cleanup === 'function') slot.cleanup = cleanup; });
      }
    },
  };
});
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useState: hooks.useState, useRef: hooks.useRef, useCallback: hooks.useCallback, useEffect: hooks.useEffect }));
vi.mock('../../src/pages/GamePage/hooks/useAudioSettings', () => ({ useAudioSettings: () => ({ status: 'locked', preferences: { muted: false, volume: 0.5 }, storageWarning: null, setMuted: () => undefined, setVolume: () => undefined, unlock: () => undefined }) }));

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const KEY = 'pdoom.save.v1';
const saveFor = (stage = 5, checkpoint = 90, doom = 55): GameSaveData => ({ ...createRun('465df28f-4c40-4c3c-b401-56bb55b6de89', 42), stage, checkpoint, doom, hp: 67, tokens: 137, score: 4567, elapsedMs: 123456, inventory: ['constitutional', 'residual'], upgrades: ['reinforced'], actionCounts: { shots: 77, dashes: 32, rewinds: 12, insights: 5 } });
const roomFor = (save: GameSaveData): RestRoomSnapshot => ({ save, room: 1, hp: save.hp, doom: save.doom, tokens: save.tokens, context: contextSnapshot(save, true), rewardText: '已记录', hackUsed: false, hackEligible: false, hackRequirement: '未满足', message: '已恢复', offers: [] });
function render() {
  hooks.begin();
  // eslint-disable-next-line react-hooks/rules-of-hooks -- This isolated test driver supplies the mocked hook dispatcher above, not a React/browser mount.
  const session = useGameSession();
  hooks.flush(); return session;
}
function mount(save: GameSaveData) {
  hooks.clear(); const storage = new MemoryStorage(); storage.setItem(KEY, JSON.stringify(save));
  vi.stubGlobal('window', { localStorage: storage }); vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '4c6d9953-b7f8-4bde-9173-40126ae2a02a'), getRandomValues: (value: Uint32Array) => { value[0] = 7; return value; } });
  const initial = render(); initial.bridge.emit({ type: 'ready' }); const session = render();
  const commands: GameCommand[] = []; session.bridge.onCommand(command => commands.push(command));
  return { session, storage, commands };
}
afterEach(() => { hooks.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// The real hook and bridge run against a deterministic hook lifecycle. Scene victory is an explicit test producer,
// not a claim that this double fought the Boss or proved browser timing/focus/graphics.
describe('explicit checkpoint attempt session boundary', () => {
  it.each([1, 2, 3, 4, 5])('durably forks chapter %i without changing any v1 progress or issuing a second start', stage => {
    const source = { ...saveFor(stage, 21), donated: stage % 2 === 0 }; const before = JSON.stringify(source);
    const { session, storage, commands } = mount(source);
    session.bridge.onCommand(command => { if (command.type === 'start') expect(JSON.parse(storage.getItem(KEY)!)).toEqual(command.save); });
    session.resumeCheckpoint(session.save!); const current = render();
    expect(current.screen.kind).toBe('playing'); expect(current.save?.runId).not.toBe(source.runId);
    expect({ ...current.save, runId: source.runId }).toEqual(source);
    expect(current.save?.inventory).not.toBe(session.save?.inventory); expect(current.save?.actionCounts).not.toBe(session.save?.actionCounts);
    expect(commands).toEqual([{ type: 'start', save: current.save }]); expect(JSON.stringify(source)).toBe(before);
    current.resumeCheckpoint(source); expect(crypto.randomUUID).toHaveBeenCalledOnce(); expect(commands).toHaveLength(1);
    expect(current.notice).toContain('既有已提交记录不改写'); expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps the frozen old defeat payload while ignoring late old-identity results and accepting the new victory', () => {
    const safe = saveFor(4, 21); const { session, storage } = mount(safe); session.start(safe);
    const dead = { ...safe, hp: 0, score: 6500, elapsedMs: safe.elapsedMs + 5000, actionCounts: { ...safe.actionCounts, shots: 777 } };
    session.bridge.emit({ type: 'ended', result: { save: dead, ending: 'defeat' } }); let current = render();
    if (current.screen.kind !== 'ended') throw new Error('Expected captured defeat');
    const oldResult = current.screen.result, oldPayload = buildScoreSubmission(oldResult), oldBytes = JSON.stringify(oldResult);
    current.resumeCheckpoint(current.save!); current = render(); const attempt = current.save!;
    expect({ ...attempt, runId: safe.runId }).toEqual(safe); expect(attempt.runId).not.toBe(oldPayload.runId);
    current.bridge.emit({ type: 'ended', result: { save: { ...safe, stage: 5, checkpoint: 90 }, ending: 'warden' } });
    current.bridge.emit({ type: 'checkpoint', save: { ...safe, score: 9999 } });
    current.bridge.emit({ type: 'rest-updated', snapshot: roomFor(safe) });
    current.bridge.emit({ type: 'stage-cleared', stage: 4, save: { ...safe, stage: 5, checkpoint: 0 } });
    current = render(); expect(current.screen.kind).toBe('playing'); expect(current.save).toEqual(attempt); expect(JSON.parse(storage.getItem(KEY)!)).toEqual(attempt);
    const won = { ...attempt, stage: 5, checkpoint: 90, score: attempt.score + 100 };
    current.bridge.emit({ type: 'ended', result: { save: won, ending: 'warden' } }); current = render();
    if (current.screen.kind !== 'ended') throw new Error('Expected new-identity victory');
    expect(buildScoreSubmission(current.screen.result).runId).toBe(attempt.runId); expect(current.save).toEqual(won);
    expect(JSON.stringify(oldResult)).toBe(oldBytes); expect(buildScoreSubmission(oldResult)).toEqual(oldPayload); expect(crypto.randomUUID).toHaveBeenCalledOnce();
  });
  it('keeps direct cross-chapter start, pause and rest-continue on the original identity', () => {
    const source = saveFor(4, 2); const next = { ...source, stage: 5, checkpoint: 0 }; const { session, commands } = mount(source);
    session.start(source); session.bridge.emit({ type: 'checkpoint', save: next }); session.bridge.emit({ type: 'stage-cleared', stage: 4, save: next });
    let current = render(); expect(current.screen.kind).toBe('chapter-clear'); current.start(next);
    current = render(); current.pause(); current = render(); current.resume(); current = render();
    const rest = { ...next, checkpoint: 11 }; current.bridge.emit({ type: 'checkpoint', save: rest }); current.bridge.emit({ type: 'rest-opened', snapshot: roomFor(rest) });
    current = render(); current.resume(); // Generic pause-resume remains unable to dismiss a rest room.
    current.bridge.send({ type: 'rest-continue' }); current.bridge.emit({ type: 'rest-closed' }); current = render();
    expect(current.screen.kind).toBe('playing'); expect(current.save?.runId).toBe(source.runId); expect(crypto.randomUUID).not.toHaveBeenCalled();
    expect(commands.filter(command => command.type === 'start')).toEqual([{ type: 'start', save: source }, { type: 'start', save: next }]);
    expect(commands.filter(command => command.type === 'resume')).toHaveLength(1); expect(commands.filter(command => command.type === 'rest-continue')).toHaveLength(1);
  });
  it('newRun generates exactly its own one UUID, never a second checkpoint fork', () => {
    const { session, commands } = mount(saveFor(2, 11)); session.newRun(); const current = render();
    expect(crypto.randomUUID).toHaveBeenCalledOnce(); expect(current.save?.stage).toBe(1); expect(current.save?.checkpoint).toBe(0);
    expect(commands.filter(command => command.type === 'start')).toEqual([{ type: 'start', save: current.save }]);
  });
  for (const origin of ['menu', 'defeat'] as const) {
    it.each([KEY, `${KEY}.backup`])(`${origin}: a failed write to %s preserves the chosen checkpoint and does not launch a new attempt`, failingKey => {
      const safe = saveFor(3, 21); const { session, storage, commands } = mount(safe);
      if (origin === 'defeat') { session.start(safe); session.bridge.emit({ type: 'ended', result: { save: { ...safe, hp: 0 }, ending: 'defeat' } }); }
      const current = render(); const before = JSON.stringify({ screen: current.screen, save: current.save }); const starts = commands.filter(command => command.type === 'start').length;
      const write = storage.setItem.bind(storage); vi.spyOn(storage, 'setItem').mockImplementation((key, value) => { if (key === failingKey) throw new Error('simulated storage failure'); write(key, value); });
      current.resumeCheckpoint(current.save!); const after = render();
      expect(JSON.stringify({ screen: after.screen, save: after.save })).toBe(before); expect(JSON.parse(storage.getItem(KEY)!)).toEqual(safe);
      expect(commands.filter(command => command.type === 'start')).toHaveLength(starts); expect(after.saveStatus).toBe('本地保存失败'); expect(after.notice).toContain('新尝试未开始');
      expect(after.notice).not.toContain('从检查点开启新尝试'); expect(fetch).not.toHaveBeenCalled();
    });
  }
  it('does not replace the checkpoint when UUID generation is unavailable', () => {
    const source = saveFor(2, 21); const { session, storage, commands } = mount(source);
    vi.mocked(crypto.randomUUID).mockImplementation(() => { throw new Error('unavailable'); }); session.resumeCheckpoint(source);
    expect(commands).toHaveLength(0); expect(render().save).toEqual(source); expect(JSON.parse(storage.getItem(KEY)!)).toEqual(source);
    expect(render().notice).toContain('无法创建新尝试身份');
  });
  it('does not fork while runtime readiness is false', () => {
    const source = saveFor(2, 21); const { session, commands, storage } = mount(source);
    session.bridge.emit({ type: 'load-failed', message: 'not ready' }); const current = render(); current.resumeCheckpoint(source);
    expect(crypto.randomUUID).not.toHaveBeenCalled(); expect(commands).toHaveLength(0); expect(JSON.parse(storage.getItem(KEY)!)).toEqual(source);
  });
  it('a later explicit retry gets another identity, without carrying failed-future progress', () => {
    const source = saveFor(3, 21); const { session, commands } = mount(source);
    vi.mocked(crypto.randomUUID).mockReturnValueOnce('4c6d9953-b7f8-4bde-9173-40126ae2a02a').mockReturnValueOnce('31bb3258-7ed0-40ef-9e6b-e8b3af6d263f');
    session.resumeCheckpoint(source); let current = render(); const first = current.save!;
    current.bridge.emit({ type: 'ended', result: { save: { ...first, hp: 0, score: 9999, elapsedMs: 777777 }, ending: 'defeat' } }); current = render();
    current.resumeCheckpoint(current.save!); current = render(); const second = current.save!;
    expect(second.runId).not.toBe(first.runId); expect({ ...second, runId: source.runId }).toEqual(source);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2); expect(commands.filter(command => command.type === 'start')).toHaveLength(2);
  });
});

describe('terminal React session event boundary', () => {
  it.each([{ ending: 'aligned', doom: 8 }, { ending: 'warden', doom: 55 }, { ending: 'foom', doom: 88 }] as const)('$ending captures one immutable result and replays the same completed save', ({ ending, doom }) => {
    const source = saveFor(5, 90, doom); const before = JSON.stringify(source);
    const { session, storage, commands } = mount(source);
    let emitted: RunResult | undefined;
    session.bridge.onCommand(command => {
      if (command.type === 'start' && isCompletedSave(command.save)) {
        emitted = { ending, save: structuredClone(command.save) };
        session.bridge.emit({ type: 'hud', snapshot: { ...session.hud, omega: { phaseLabel: '已完成', memorySource: 'ordered', dominantAction: '射击', combo: '实际观察：射击 → 冲刺', activeTraits: ['生效词条'], observedCombos: 3, mirrorAction: '停止' } } });
        session.bridge.emit({ type: 'ended', result: emitted });
      }
    });
    expect(session.screen.kind).toBe('menu'); session.resumeCheckpoint(session.save!);
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    let current = render(); expect(current.screen.kind).toBe('ended');
    if (current.screen.kind !== 'ended') throw new Error('Missing ended projection');
    const captured = current.screen.result, payload = buildScoreSubmission(captured);
    expect(JSON.stringify(captured.save)).toBe(before); expect(captured).not.toBe(emitted); expect(Object.isFrozen(captured.save.actionCounts)).toBe(true);
    emitted!.save.score++; emitted!.save.elapsedMs += 1000; emitted!.save.inventory.push('lisp');
    current.bridge.emit({ type: 'hud', snapshot: { ...current.hud, elapsedMs: 999999, score: 0 } });
    current.bridge.emit({ type: 'checkpoint', save: saveFor(1, 0) });
    current.bridge.emit({ type: 'ended', result: { ending, save: { ...source, score: 9000 } } });
    current.bridge.emit({ type: 'rest-opened', snapshot: roomFor(saveFor(2, 11)) });
    current.pause(); current.resume(); current = render();
    expect(current.screen).toEqual({ kind: 'ended', result: captured }); expect(current.hud.elapsedMs).toBe(source.elapsedMs);
    expect(current.hud.omega?.phaseLabel).toBe('已完成'); expect(current.hud.omega?.observedCombos).toBe(3);
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual(source); expect(buildScoreSubmission(captured)).toEqual(payload);
    expect(commands.filter(command => command.type === 'resume')).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
    current.returnToMenu(); current = render(); expect(current.save).toEqual(source);
    current.start(current.save!); current = render(); expect(current.screen).toEqual({ kind: 'ended', result: captured });
    current.newRun(); current = render(); expect(current.screen.kind).toBe('playing'); expect(current.save?.runId).not.toBe(source.runId);
    expect(JSON.stringify(captured.save)).toBe(before); expect(buildScoreSubmission(captured)).toEqual(payload);
    const reloaded = mount(source).session; expect(reloaded.save).toEqual(source); expect(reloaded.screen.kind).toBe('menu');
    expect(reloaded.hud.objective).toContain('回看结局'); expect(JSON.stringify(source)).toBe(before);
  });
  it('retains the previous safe save after defeat instead of persisting the dead result', () => {
    const safe = saveFor(3, 21); const { session, storage } = mount(safe); session.start(safe);
    const dead = { ...safe, hp: 0, elapsedMs: safe.elapsedMs + 5000 };
    session.bridge.emit({ type: 'ended', result: { save: dead, ending: 'defeat' } }); const current = render();
    expect(current.screen).toEqual({ kind: 'ended', result: { save: dead, ending: 'defeat' } });
    expect(current.save).toEqual(safe); expect(JSON.parse(storage.getItem(KEY)!)).toEqual(safe);
  });
  it('preserves legal unknown encodings and never sends a start for them', () => {
    for (const source of [saveFor(5, 99), ...[1, 2, 3, 4].map(stage => saveFor(stage, 90))]) {
      const before = JSON.stringify(source); const { session, commands, storage } = mount(source);
      expect(session.hud.objective).toContain('安全点编码尚未支持'); session.resumeCheckpoint(source); session.start(source);
      expect(crypto.randomUUID).not.toHaveBeenCalled(); expect(commands).toHaveLength(0); expect(render().screen.kind).toBe('menu'); expect(storage.getItem(KEY)).toBe(before);
    }
  });
  it('cloud completion replaces a selected old rest only after returning to menu and cannot resume the old world', () => {
    const old = saveFor(2, 11), completed = saveFor(5, 90, 88); completed.runId = '31bb3258-7ed0-40ef-9e6b-e8b3af6d263f';
    const { session, storage, commands } = mount(old); session.start(old);
    session.bridge.emit({ type: 'rest-opened', snapshot: roomFor(old) }); let current = render(); expect(current.screen.kind).toBe('rest');
    current.restoreCloud(completed); current.bridge.emit({ type: 'rest-updated', snapshot: roomFor(old) }); current.bridge.emit({ type: 'checkpoint', save: old });
    current = render(); current.resume();
    expect(current.screen.kind).toBe('menu'); expect(current.save).toEqual(completed); expect(current.notice).toContain('回看结局');
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual(completed); expect(commands.filter(command => command.type === 'start')).toHaveLength(1);
    expect(commands.filter(command => command.type === 'resume')).toHaveLength(0);
  });
  it('does not invent terminal data from a victory without cp90 or a fifth-chapter clear event', () => {
    const safe = saveFor(5, 2); const { session, storage } = mount(safe); session.start(safe);
    session.bridge.emit({ type: 'ended', result: { save: safe, ending: 'warden' } });
    session.bridge.emit({ type: 'stage-cleared', stage: 5, save: safe }); const current = render();
    expect(current.screen.kind).toBe('playing'); expect(current.notice).toContain('终局完成标记无效'); expect(JSON.parse(storage.getItem(KEY)!)).toEqual(safe);
  });
});
