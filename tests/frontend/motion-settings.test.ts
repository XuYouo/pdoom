import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MOTION_STORAGE_KEY, MOTION_STORAGE_WARNING, isMotionMode, motionSettingsCommand, readMotionSettings, resolveReducedMotion, writeMotionSettings, type MotionMode } from '../../src/pages/GamePage/functions/motionSettings';
import { MotionSettings } from '../../src/pages/GamePage/components/MotionSettings';
function storage(raw?: string) {
  const values = new Map([['pdoom.save.v1', 'unchanged-save'], ['pdoom.audio.v1', 'unchanged-audio']]);
  if (raw !== undefined) values.set(MOTION_STORAGE_KEY, raw);
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
}
const modes = ['system', 'reduced'] as const;
const systems = [false, true, null] as const;
const cases = modes.flatMap(mode => systems.map(system => ({ mode, system, reduced: mode === 'reduced' || system !== false })));

describe('local motion preference boundary', () => {
  it('loads without a preference or writes to any storage', () => {
    const s = storage(); expect(readMotionSettings(s)).toEqual({ mode: 'system', warning: null });
    expect(s.getItem).toHaveBeenCalledExactlyOnceWith(MOTION_STORAGE_KEY); expect(s.setItem).not.toHaveBeenCalled();
  });
  it.each(modes)('roundtrips%s without touching game or audio saves', mode => {
    const s = storage(); expect(writeMotionSettings(s, mode)).toBeNull(); expect(readMotionSettings(s)).toEqual({ mode, warning: null });
    expect(JSON.parse(s.values.get(MOTION_STORAGE_KEY)!)).toEqual({ version: 1, mode });
    expect(s.values.get('pdoom.save.v1')).toBe('unchanged-save'); expect(s.values.get('pdoom.audio.v1')).toBe('unchanged-audio');
    expect(s.values.size).toBe(3); expect(s.setItem).toHaveBeenCalledOnce();
  });
  it.each(['bad json', 'null', '[]', '{}', '"reduced"', '{"version":2,"mode":"reduced"}', '{"version":1,"mode":"full"}', '{"version":1,"mode":true}', '{"mode":"reduced"}'])('preserves invalid bytes and falls back to system: %s', raw => {
    const s = storage(raw), result = readMotionSettings(s); expect(result.mode).toBe('system'); expect(result.warning).toBeTruthy();
    expect(s.values.get(MOTION_STORAGE_KEY)).toBe(raw); expect(s.setItem).not.toHaveBeenCalled();
  });
  it('contains read and write denial without exposing storage errors', () => {
    expect(readMotionSettings({ getItem: () => { throw new Error('private storage details'); } })).toEqual({ mode: 'system', warning: expect.any(String) });
    expect(writeMotionSettings({ setItem: () => { throw new Error('quota'); } }, 'reduced')).toBe(MOTION_STORAGE_WARNING);
  });
  it.each([null, undefined, false, 1, '', 'full', {}, []])('does not accept an invalid mode%s', value => {
    expect(isMotionMode(value)).toBe(false); const s = storage();
    expect(writeMotionSettings(s, value as MotionMode)).toBe(MOTION_STORAGE_WARNING); expect(s.setItem).not.toHaveBeenCalled();
  });
  it.each(cases)('resolves$mode / system=$system to$reduced without a full-motion override', ({ mode, system, reduced }) => {
    expect(resolveReducedMotion(mode, system)).toBe(reduced);
    expect(motionSettingsCommand(mode, system)).toEqual({ type: 'set-reduced-motion', reducedMotion: reduced });
  });
});

type Props = { children?: ReactNode; onChange?: () => void; value?: string; checked?: boolean };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
describe('real motion control component', () => {
  it.each(cases)('distinguishes the$mode selection from resolved reduction$reduced', ({ mode, system, reduced }) => {
    const motion = { mode, systemReduced: system, reducedMotion: reduced, storageWarning: null, setMode: vi.fn() };
    const html = renderToStaticMarkup(createElement(MotionSettings, { motion }));
    expect(html).toContain('动态效果设置'); expect(html).toContain(reduced ? '当前：减少动态效果' : '当前：标准动态效果');
    const radios = elements(MotionSettings({ motion })).filter(node => node.type === 'input');
    expect(radios).toHaveLength(2); expect(radios.map(r => r.props.checked)).toEqual([mode === 'system', mode === 'reduced']);
    radios[0].props.onChange?.(); radios[1].props.onChange?.(); expect(motion.setMode.mock.calls).toEqual([['system'], ['reduced']]);
    expect(html).toContain('角色移动、弹幕和危险预警仍然保留'); expect(html).toContain('不改变游戏存档');
  });
  it('keeps the storage warning visible while the preference is still usable', () => {
    const motion = { mode: 'reduced' as const, systemReduced: false, reducedMotion: true, storageWarning: MOTION_STORAGE_WARNING, setMode: vi.fn() };
    const html = renderToStaticMarkup(createElement(MotionSettings, { motion }));
    expect(html).toContain(MOTION_STORAGE_WARNING); expect(html).not.toContain('disabled');
  });
});
