import { Children, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TouchControls, type TouchControlsProps } from '../../src/pages/GamePage/components/TouchControls';
import { hasTouchCapability, useTouchControls } from '../../src/pages/GamePage/hooks/useTouchControls';
import { GameBridge, type GameCommand } from '../../src/pages/GamePage/game/bridge';
import { EMPTY_TOUCH_INPUT } from '../../src/pages/GamePage/game/systems/touchInput';

type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void };
const hooks = vi.hoisted(() => {
  let cursor = 0, slots: Slot[] = [], effects: (() => void)[] = [];
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memoSlot = <T>(factory: () => T, deps: readonly unknown[]) => {
    const at = cursor++; if (!slots[at] || !same(slots[at].deps, deps)) slots[at] = { value: factory(), deps };
    return slots[at].value as T;
  };
  return {
    begin: () => { cursor = 0; }, flush: () => { const pending = effects; effects = []; pending.forEach(effect => effect()); },
    clear: () => { slots.forEach(slot => slot.cleanup?.()); slots = []; effects = []; cursor = 0; }, useMemo: memoSlot,
    useCallback: <T>(value: T, deps: readonly unknown[]) => memoSlot(() => value, deps),
    useRef: <T>(initial: T) => { const at = cursor++; if (!slots[at]) slots[at] = { value: { current: initial } }; return slots[at].value as { current: T }; },
    useState: <T>(initial: T | (() => T)) => {
      const at = cursor++; if (!slots[at]) slots[at] = { value: typeof initial === 'function' ? (initial as () => T)() : initial };
      return [slots[at].value as T, (value: T) => { slots[at].value = value; }] as const;
    },
    useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
      const at = cursor++, old = slots[at];
      if (!old || !same(old.deps, deps)) { const slot: Slot = { deps }; slots[at] = slot; effects.push(() => { old?.cleanup?.(); const stop = effect(); if (typeof stop === 'function') slot.cleanup = stop; }); }
    },
  };
});
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useMemo: hooks.useMemo, useCallback: hooks.useCallback, useState: hooks.useState, useRef: hooks.useRef, useEffect: hooks.useEffect, useLayoutEffect: hooks.useEffect }));

class Media extends EventTarget { matches = false; }
class Element {
  dataset: Record<string, string> = {};
  style = { setProperty: vi.fn() };
  captures = new Set<number>();
  getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  setPointerCapture = vi.fn((id: number) => this.captures.add(id));
  hasPointerCapture = (id: number) => this.captures.has(id);
  releasePointerCapture = vi.fn((id: number) => this.captures.delete(id));
}
type NodeProps = Record<string, unknown> & { children?: React.ReactNode };
function descendants(node: React.ReactNode): ReactElement<NodeProps>[] {
  return Children.toArray(node).flatMap(child => isValidElement<NodeProps>(child) ? [child, ...descendants(child.props.children)] : []);
}
function environment() {
  const media = new Map<string, Media>();
  const host = Object.assign(new EventTarget(), { matchMedia: (query: string) => { if (!media.has(query)) media.set(query, new Media()); return media.get(query)!; } });
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', host); vi.stubGlobal('document', document); vi.stubGlobal('navigator', { maxTouchPoints: 0 }); vi.useFakeTimers();
  return { host, document, media };
}
function setup() {
  const env = environment(), bridge = new GameBridge(), commands: GameCommand[] = [];
  bridge.onCommand(command => commands.push(command));
  const props: TouchControlsProps = { bridge, enabled: true, playing: true, onPause: vi.fn(), onContext: vi.fn(), onFullscreen: vi.fn(), onGesture: vi.fn(),
    hud: { hp: 100, doom: 8, tokens: 0, score: 0, stage: 1, elapsedMs: 2400, rewindReady: true, insightActive: false, boss: null, objective: '探索',
      skills: { rewind: { state: 'ready', remainingMs: 0 }, insight: { ready: true, activeRemainingMs: 0, cooldownRemainingMs: 0, blockedByRewind: false } } } };
  const render = () => { hooks.begin(); const tree = TouchControls(props); hooks.flush(); return tree; };
  let tree = render();
  const find = (name: string, by = 'data-touch-control') => descendants(tree).find(node => node.props[by] === name)!;
  const event = (id: number, element = new Element(), x = 50, y = 50) => ({ pointerId: id, pointerType: 'touch', button: 0, currentTarget: element, clientX: x, clientY: y, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  const invoke = (name: string, handler: string, input: unknown, by?: string) => (find(name, by).props[handler] as (event: unknown) => void)(input);
  return { ...env, props, commands, render: () => { tree = render(); return tree; }, find, event, invoke,
    latest: () => { const command = commands.at(-1)!; return command.type === 'touch-input' ? command.input : null; } };
}
afterEach(() => { hooks.clear(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('touch surface dispatch and lifecycle', () => {
  it('holds three independent pointers and fourth-finger pause clears them before the callback', () => {
    const h = setup(), movement = h.event(1, undefined, 85), aim = h.event(2), jump = h.event(3);
    h.invoke('move', 'onPointerDown', movement); h.invoke('aim', 'onPointerDown', aim); h.invoke('jump', 'onPointerDown', jump);
    expect(h.latest()).toMatchObject({ move: 1, fire: true, jump: true });
    h.props.onPause = vi.fn(() => expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT)); h.render();
    h.invoke('暂停触屏训练', 'onPointerDown', h.event(4), 'aria-label');
    expect(h.props.onPause).toHaveBeenCalledOnce(); expect(h.props.onGesture).not.toHaveBeenCalled();
    expect(movement.currentTarget.captures.size + aim.currentTarget.captures.size + jump.currentTarget.captures.size).toBe(0);
    h.invoke('jump', 'onLostPointerCapture', jump); h.invoke('aim', 'onPointerUp', aim); expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT);
  });
  it('updates aim directly and does not let a second pad pointer steal its geometry', () => {
    const h = setup(), aim = h.event(7); h.invoke('aim', 'onPointerDown', aim);
    h.invoke('aim', 'onPointerDown', h.event(8, aim.currentTarget, 80, 90));
    expect(aim.currentTarget.setPointerCapture).toHaveBeenCalledTimes(1);
    h.invoke('aim', 'onPointerMove', { ...aim, clientX: 80, clientY: 90 });
    expect(h.latest()).toMatchObject({ fire: true, aimDirection: { x: 0.6, y: 0.8 } });
    expect(aim.currentTarget.style.setProperty).toHaveBeenCalledWith('--touch-x', '18px');
  });
  it('clears fullscreen pointerdown but requests fullscreen only from the native activation click', () => {
    const h = setup(); h.invoke('aim', 'onPointerDown', h.event(1));
    const down = h.event(2);
    h.invoke('切换触屏全屏', 'onPointerDown', down, 'aria-label');
    expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT); expect(h.props.onFullscreen).not.toHaveBeenCalled();
    expect(h.props.onGesture).not.toHaveBeenCalled(); expect(down.preventDefault).not.toHaveBeenCalled();
    // Unlike pause, fullscreen accepts the native pointer click (detail=1), after touchup grants activation.
    h.invoke('切换触屏全屏', 'onClick', { detail: 1 }, 'aria-label');
    expect(h.props.onFullscreen).toHaveBeenCalledOnce(); expect(h.props.onGesture).toHaveBeenCalledOnce();
    h.invoke('切换触屏全屏', 'onClick', { detail: 0 }, 'aria-label'); expect(h.props.onFullscreen).toHaveBeenCalledTimes(2);
  });
  it('shows only the supplied browser fullscreen state, preserving its stable action label', () => {
    const h = setup(); expect(h.find('切换触屏全屏', 'aria-label').props['aria-pressed']).toBe(false);
    h.props.fullscreenActive = true; h.render();
    const button = h.find('切换触屏全屏', 'aria-label'); expect(button.props['aria-pressed']).toBe(true);
    expect(renderToStaticMarkup(button)).toContain('退出');
  });
  it.each(['touch', 'pen'])('waits for the owned %s pointerup before attempting audio unlock', pointerType => {
    const h = setup(), pointer = { ...h.event(1), pointerType };
    h.invoke('aim', 'onPointerDown', pointer); expect(h.props.onGesture).not.toHaveBeenCalled();
    h.invoke('aim', 'onPointerUp', h.event(2)); expect(h.props.onGesture).not.toHaveBeenCalled();
    h.invoke('aim', 'onPointerUp', pointer); expect(h.props.onGesture).toHaveBeenCalledOnce();
    h.invoke('aim', 'onLostPointerCapture', pointer); expect(h.props.onGesture).toHaveBeenCalledOnce();
    expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT);
  });
  it('retains immediate mouse activation while a cancelled touch never attempts audio unlock', () => {
    const h = setup(), mouse = { ...h.event(1), pointerType: 'mouse' };
    h.invoke('aim', 'onPointerDown', mouse); expect(h.props.onGesture).toHaveBeenCalledOnce();
    h.invoke('aim', 'onPointerUp', mouse); expect(h.props.onGesture).toHaveBeenCalledOnce();
    const touch = h.event(2); h.invoke('aim', 'onPointerDown', touch); h.invoke('aim', 'onPointerCancel', touch);
    expect(h.props.onGesture).toHaveBeenCalledOnce();
  });
  it.each(['onPointerCancel', 'onLostPointerCapture'])( '%s releases only its owner', handler => {
    const h = setup(), move = h.event(1, undefined, 85), fire = h.event(2);
    h.invoke('move', 'onPointerDown', move); h.invoke('aim', 'onPointerDown', fire); h.invoke('move', handler, move);
    expect(h.latest()).toMatchObject({ move: 0, fire: true });
  });
  it.each(['blur', 'pagehide', 'orientationchange', 'resize'])('clears all contacts on %s without waiting for pointerup', type => {
    const h = setup(); h.invoke('move', 'onPointerDown', h.event(1, undefined, 85)); h.invoke('aim', 'onPointerDown', h.event(2));
    h.host.dispatchEvent(new Event(type)); expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT);
  });
  it('clears on visibility loss, capability disable and becoming downed, while downed pause remains available', () => {
    const h = setup(); h.invoke('jump', 'onPointerDown', h.event(1));
    h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange')); expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT);
    h.invoke('jump', 'onPointerDown', h.event(2)); h.props.canAct = false; h.render(); expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT);
    expect(h.find('jump').props.disabled).toBe(true); expect(h.find('暂停触屏训练', 'aria-label').props.disabled).toBe(false);
    h.invoke('jump', 'onPointerDown', h.event(3)); expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT);
    h.props.canAct = true; h.render(); h.invoke('jump', 'onPointerDown', h.event(4)); h.props.enabled = false; expect(h.render()).toBeNull(); expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT);
  });
  it('clears on unmount and removes global callbacks', () => {
    const h = setup(); h.invoke('aim', 'onPointerDown', h.event(1)); hooks.clear(); expect(h.latest()).toEqual(EMPTY_TOUCH_INPUT);
    const count = h.commands.length; h.host.dispatchEvent(new Event('resize')); expect(h.commands).toHaveLength(count);
  });
  it('supports held keyboard activation and assistive click without leaking native Space', () => {
    const h = setup(), element = new Element(), key = { key: ' ', repeat: false, currentTarget: element, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    h.invoke('jump', 'onKeyDown', key); expect(h.latest()?.jump).toBe(true); expect(key.preventDefault).toHaveBeenCalledOnce();
    h.invoke('jump', 'onKeyUp', key); expect(h.latest()?.jump).toBe(false);
    h.invoke('jump', 'onClick', { detail: 0, currentTarget: element }); expect(h.latest()?.jump).toBe(true);
    vi.advanceTimersByTime(100); expect(h.latest()?.jump).toBe(false);
  });
  it('gates stale skill callbacks and renders only the actual chapter and cooperative controls', () => {
    const h = setup(); h.props.hud.rewindReady = false; h.props.hud.skills.rewind = { state: 'recording', remainingMs: 1200 }; h.render();
    h.invoke('rewind', 'onPointerDown', h.event(1)); expect(h.commands).toEqual([]);
    expect(renderToStaticMarkup(h.render())).toContain('1.2s'); expect(h.find('reroll')).toBeUndefined(); expect(h.find('revive')).toBeUndefined();
    h.props.hud.stage = 4; h.props.hud.loom = { timeline: 0, rerollReady: true, hpUiTaken: false, stemsLost: 0, narrow: false, sharpTurnReady: false }; h.props.cooperative = true; h.render();
    expect(h.find('reroll')).toBeDefined(); expect(h.find('revive')).toBeDefined();
  });
});

describe('touch capability is independent of viewport size', () => {
  it('requires a coarse pointer or actual touch points, and reacts to capability changes', () => {
    const env = environment();
    const view = () => {
      hooks.begin();
      // eslint-disable-next-line react-hooks/rules-of-hooks -- Deterministic hook lifecycle; real multi-touch browser acceptance is separate.
      const value = useTouchControls(); hooks.flush(); return value;
    };
    expect(view()).toBe(false); expect(hasTouchCapability()).toBe(false);
    const coarse = env.media.get('(any-pointer: coarse)')!; coarse.matches = true; coarse.dispatchEvent(new Event('change')); expect(view()).toBe(true);
    coarse.matches = false; coarse.dispatchEvent(new Event('change')); expect(view()).toBe(false);
    vi.stubGlobal('navigator', { maxTouchPoints: 5 }); env.host.dispatchEvent(new Event('pageshow')); expect(view()).toBe(true);
  });
});
