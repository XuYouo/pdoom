import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameBridge } from '../game/bridge';
import { isMotionMode, motionSettingsCommand, readMotionSettings, resolveReducedMotion, writeMotionSettings, MOTION_STORAGE_WARNING, type MotionMode } from '../functions/motionSettings';

interface MotionState { mode: MotionMode; systemReduced: boolean | null; storageWarning: string | null }
export function useMotionSettings(bridge: GameBridge) {
  const [state, setState] = useState<MotionState>({ mode: 'system', systemReduced: null, storageWarning: null });
  const current = useRef(state);
  const publish = useCallback((next: MotionState) => {
    current.current = next; setState(next);
    bridge.send(motionSettingsCommand(next.mode, next.systemReduced));
  }, [bridge]);

  useEffect(() => {
    let active = true, media: MediaQueryList | null = null;
    const changed = (event: MediaQueryListEvent) => {
      if (active) publish({ ...current.current, systemReduced: event.matches });
    };
    const off = bridge.onEvent(event => {
      if (active && event.type === 'ready') bridge.send(motionSettingsCommand(current.current.mode, current.current.systemReduced));
    });
    try {
      media = window.matchMedia('(prefers-reduced-motion: reduce)');
      media.addEventListener('change', changed);
    } catch { media = null; }
    let loaded: ReturnType<typeof readMotionSettings>;
    try { loaded = readMotionSettings(window.localStorage); }
    catch { loaded = { mode: 'system', warning: '无法读取动态效果偏好，使用跟随系统；原存储未覆盖。' }; }
    // Synchronize now and on Scene-ready: this effect may run either side of asynchronous asset loading.
    publish({ mode: loaded.mode, storageWarning: loaded.warning, systemReduced: media?.matches ?? null });
    return () => { active = false; off(); media?.removeEventListener('change', changed); };
  }, [bridge, publish]);

  const setMode = useCallback((mode: MotionMode) => {
    if (!isMotionMode(mode)) return;
    let storageWarning: string | null;
    try { storageWarning = writeMotionSettings(window.localStorage, mode); }
    catch { storageWarning = MOTION_STORAGE_WARNING; }
    publish({ ...current.current, mode, storageWarning });
  }, [publish]);
  return { ...state, reducedMotion: resolveReducedMotion(state.mode, state.systemReduced), setMode };
}
