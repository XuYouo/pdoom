import type { GameCommand } from '../game/bridge';

export type MotionMode = 'system' | 'reduced';
export const MOTION_STORAGE_KEY = 'pdoom.motion.v1';
export const MOTION_STORAGE_WARNING = '动态效果偏好未能保存，仅在本页生效；游戏存档未改动。';
export interface LoadedMotionSettings { mode: MotionMode; warning: string | null }
export const isMotionMode = (value: unknown): value is MotionMode => value === 'system' || value === 'reduced';

/** No system override: missing media support chooses the safer reduced presentation. */
export const resolveReducedMotion = (mode: MotionMode, systemReduced: boolean | null): boolean => mode === 'reduced' || systemReduced !== false;

export function readMotionSettings(storage: Pick<Storage, 'getItem'>): LoadedMotionSettings {
  try {
    const text = storage.getItem(MOTION_STORAGE_KEY);
    if (text === null) return { mode: 'system', warning: null };
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value) && 'version' in value && value.version === 1 && 'mode' in value && isMotionMode(value.mode)) return { mode: value.mode, warning: null };
    return { mode: 'system', warning: '动态效果偏好格式无效，已恢复跟随系统；原存储未覆盖。' };
  } catch { return { mode: 'system', warning: '无法读取动态效果偏好，使用跟随系统；原存储未覆盖。' }; }
}

export function writeMotionSettings(storage: Pick<Storage, 'setItem'>, mode: MotionMode): string | null {
  if (!isMotionMode(mode)) return MOTION_STORAGE_WARNING;
  try { storage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, mode })); return null; }
  catch { return MOTION_STORAGE_WARNING; }
}

export function motionSettingsCommand(mode: MotionMode, systemReduced: boolean | null): Extract<GameCommand, { type: 'set-reduced-motion' }> {
  return { type: 'set-reduced-motion', reducedMotion: resolveReducedMotion(mode, systemReduced) };
}
