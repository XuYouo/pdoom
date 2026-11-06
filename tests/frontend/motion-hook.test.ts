import { afterEach, describe, expect, it, vi } from 'vitest';
const dispatcher = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], states: [] as unknown[] }));
// Boundary-only dispatcher: tests the real effect callbacks, refs and cleanup, not React rendering.
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (value: unknown) => ({ current: value }),
  useState: (initial: unknown) => [initial, (next: unknown) => dispatcher.states.push(next)],
  useEffect: (effect: () => void | (() => void)) => dispatcher.effects.push(effect),
}));
import { GameBridge } from '../../src/pages/GamePage/game/bridge';
import { useMotionSettings } from '../../src/pages/GamePage/hooks/useMotionSettings';
import { MOTION_STORAGE_KEY } from '../../src/pages/GamePage/functions/motionSettings';
afterEach(() => { vi.unstubAllGlobals(); dispatcher.effects.length = 0; dispatcher.states.length = 0; });
function harness(raw: string | null = null, matches = false) {
  const values = new Map<string, string>(); if (raw !== null) values.set(MOTION_STORAGE_KEY, raw);
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const media = { matches, addEventListener: (_name: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener), removeEventListener: (_name: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener) };
  const storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
  vi.stubGlobal('window', { localStorage: storage, matchMedia: () => media });
  const bridge = new GameBridge(), commands = vi.fn(); bridge.onCommand(commands);
  let control!: ReturnType<typeof useMotionSettings>;
  function HookProbe() { control = useMotionSettings(bridge); return null; }
  HookProbe();
  const setup = () => dispatcher.effects[0]() as () => void;
  const change = (next: boolean) => { media.matches = next; listeners.forEach(listener => listener({ matches: next })); };
  return { bridge, commands, control, setup, change, listeners, values, storage };
}
describe('motion hook effect boundary', () => {
  it('synchronizes when Scene-ready preceded effect setup, without any storage write', () => {
    const h = harness('{"version":1,"mode":"reduced"}'); h.bridge.emit({ type: 'ready' }); expect(h.commands).not.toHaveBeenCalled();
    const stop = h.setup(); expect(h.commands).toHaveBeenCalledExactlyOnceWith({ type: 'set-reduced-motion', reducedMotion: true });
    expect(h.storage.setItem).not.toHaveBeenCalled(); stop();
  });
  it('replays the latest media value when asynchronous Scene loading finishes later', () => {
    const h = harness(), stop = h.setup(); h.change(true); h.commands.mockClear();
    h.bridge.emit({ type: 'ready' }); expect(h.commands).toHaveBeenCalledExactlyOnceWith({ type: 'set-reduced-motion', reducedMotion: true }); stop();
  });
  it('replays the latest forced preference on every ready without extra listeners', () => {
    const h = harness(), stop = h.setup(); h.control.setMode('reduced'); h.change(true); h.change(false); h.commands.mockClear();
    h.bridge.emit({ type: 'ready' }); h.bridge.emit({ type: 'ready' });
    expect(h.commands.mock.calls).toEqual([[{ type: 'set-reduced-motion', reducedMotion: true }], [{ type: 'set-reduced-motion', reducedMotion: true }]]);
    expect(h.listeners.size).toBe(1); stop();
  });
  it('switching back to system observes the current value, not the initial value', () => {
    const h = harness(), stop = h.setup(); h.control.setMode('reduced'); h.change(true); h.control.setMode('system');
    expect(h.commands).toHaveBeenLastCalledWith({ type: 'set-reduced-motion', reducedMotion: true }); h.change(false);
    expect(h.commands).toHaveBeenLastCalledWith({ type: 'set-reduced-motion', reducedMotion: false }); stop();
  });
  it('cleanup removes media and bridge-ready subscriptions and ignores later events', () => {
    const h = harness(), stop = h.setup(); expect(h.listeners.size).toBe(1); stop(); h.commands.mockClear();
    h.change(true); h.bridge.emit({ type: 'ready' }); expect(h.listeners.size).toBe(0); expect(h.commands).not.toHaveBeenCalled();
  });
  it('strict-style setup/cleanup/setup leaves exactly one active subscription', () => {
    const h = harness(); h.setup()(); const stop = h.setup(); h.commands.mockClear(); h.change(true);
    expect(h.commands).toHaveBeenCalledExactlyOnceWith({ type: 'set-reduced-motion', reducedMotion: true });
    h.commands.mockClear(); h.bridge.emit({ type: 'ready' }); expect(h.commands).toHaveBeenCalledOnce(); stop(); expect(h.listeners.size).toBe(0);
  });
  it('contains a denied localStorage property accessor and keeps an in-memory preference', () => {
    const h = harness(); Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('denied'); } });
    const stop = h.setup(); h.control.setMode('reduced');
    expect(h.commands).toHaveBeenLastCalledWith({ type: 'set-reduced-motion', reducedMotion: true });
    expect(dispatcher.states.at(-1)).toMatchObject({ mode: 'reduced', storageWarning: expect.stringContaining('仅在本页生效') }); stop();
  });
  it('an unavailable media API safely reduces effects and still unsubscribes ready', () => {
    const h = harness(); window.matchMedia = () => { throw new Error('unavailable'); }; const stop = h.setup();
    expect(h.commands).toHaveBeenLastCalledWith({ type: 'set-reduced-motion', reducedMotion: true }); stop(); h.commands.mockClear();
    h.bridge.emit({ type: 'ready' }); expect(h.commands).not.toHaveBeenCalled();
  });
});
