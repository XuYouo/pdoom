import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameSettings } from '../../src/pages/GamePage/components/GameSettings';
import type { GameSession } from '../../src/pages/GamePage/hooks/useGameSession';

const motion: GameSession['motion'] = { mode: 'system', systemReduced: false, reducedMotion: false, storageWarning: null, setMode: vi.fn() };
const audio = (patch: Partial<GameSession['audio']> = {}): GameSession['audio'] => ({
  preferences: { muted: false, volume: 0.5 }, status: 'locked', storageWarning: null, setMuted: vi.fn(), setVolume: vi.fn(), unlock: vi.fn(), ...patch,
});
const render = (sound: GameSession['audio'], effects = motion) => renderToStaticMarkup(createElement(GameSettings, { audio: sound, motion: effects }));

describe('player audio and motion settings', () => {
  it.each([
    ['locked', '等待启用', '尚未解锁'],
    ['suspended', '已就绪', '继续训练后播放'],
    ['running', '已就绪', '音频已启用'],
    ['unavailable', '暂不可用', '浏览器音频不可用'],
  ] as const)('shows the actual %s audio state without starting sound during render', (status, label, note) => {
    const sound = audio({ status });
    const html = render(sound);
    expect(html).toContain(label); expect(html).toContain(note);
    expect(html).toContain('原创游戏音频'); expect(html).toContain('aria-label="主音量"');
    expect(html).toContain('启用音频'); expect(sound.unlock).not.toHaveBeenCalled();
    expect(html).not.toContain('schema'); expect(html).not.toContain('固定 60 Hz');
  });

  it('distinguishes a muted preference from silent volume without discarding the chosen level', () => {
    const muted = render(audio({ status: 'suspended', preferences: { muted: true, volume: 0.37 } }));
    expect(muted).toContain('value="37"'); expect(muted).toContain('已静音');
    expect(muted).toContain('调整音量不会取消静音');
    const zero = render(audio({ status: 'suspended', preferences: { muted: false, volume: 0 } }));
    expect(zero).toContain('音量为零'); expect(zero).toContain('value="0"');
    expect(zero).not.toContain('取消静音后');
  });

  it('keeps audio and motion storage failures explicit instead of claiming successful persistence', () => {
    const html = render(audio({ storageWarning: '音频偏好未能保存' }), { ...motion, storageWarning: '动态效果未能保存' });
    expect(html).toContain('音频偏好未能保存'); expect(html).toContain('动态效果未能保存');
    expect(html).toContain('关闭设置不会自动恢复战斗');
    expect(html).toContain('不进入游戏存档');
  });
});
