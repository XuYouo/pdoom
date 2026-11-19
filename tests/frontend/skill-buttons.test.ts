import { Children, isValidElement, type MouseEvent, type ReactElement, type ButtonHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SkillButtons, type SkillButtonsProps } from '../../src/pages/GamePage/components/SkillButtons';
import { insightButtonView, rerollButtonView, rewindButtonView, skillSeconds } from '../../src/pages/GamePage/functions/skillButtons';

const props = (): SkillButtonsProps => ({
  hud: { hp: 100, doom: 8, tokens: 0, score: 0, stage: 1, elapsedMs: 2100, rewindReady: true, insightActive: false, boss: null, objective: '探索',
    skills: { rewind: { state: 'ready', remainingMs: 0 }, insight: { ready: true, activeRemainingMs: 0, cooldownRemainingMs: 0, blockedByRewind: false } } },
  playing: true, gameRoot: { current: null }, onActivate: vi.fn(),
});
function buttons(input: SkillButtonsProps) {
  return Children.toArray(SkillButtons(input).props.children).filter(isValidElement) as ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>[];
}
const click = (button: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>, detail = 0) => button.props.onClick?.({ detail } as MouseEvent<HTMLButtonElement>);

describe('skill controls are honest and preserve keyboard activation', () => {
  it('keeps cooling E in the tab sequence with aria-disabled and guards all clicks', () => {
    const input = props();
    input.hud.skills.insight = { ready: false, activeRemainingMs: 0, cooldownRemainingMs: 4300, blockedByRewind: false };
    const cooling = buttons(input)[1];
    expect(cooling.props.disabled).toBeUndefined();
    expect(cooling.props.tabIndex).not.toBe(-1);
    expect(cooling.props['aria-disabled']).toBe(true);
    expect(cooling.props['aria-pressed']).toBe(false);
    click(cooling); click(cooling, 1);
    expect(input.onActivate).not.toHaveBeenCalled();
  });

  it('only returns pointer activation to the canvas and preserves keyboard E focus across its state change', () => {
    const input = props(), focus = vi.fn(), querySelector = vi.fn(() => ({ focus }));
    input.gameRoot.current = { querySelector } as unknown as HTMLElement;
    const ready = buttons(input)[1];
    click(ready);
    expect(input.onActivate).toHaveBeenCalledExactlyOnceWith('insight');
    expect(focus).not.toHaveBeenCalled();
    input.hud.insightActive = true;
    input.hud.skills.insight = { ready: false, activeRemainingMs: 3800, cooldownRemainingMs: 8300, blockedByRewind: false };
    const active = buttons(input)[1];
    expect(active.type).toBe(ready.type); expect(active.key).toBe(ready.key);
    expect(active.props.disabled).toBeUndefined(); expect(active.props['aria-pressed']).toBe(true);
    click(active); expect(input.onActivate).toHaveBeenCalledTimes(1); expect(focus).not.toHaveBeenCalled();
    click(active, 1); expect(input.onActivate).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('retains Q native disabled semantics and guards paused/stale direct callbacks', () => {
    const input = props();
    input.hud.rewindReady = false; input.hud.skills.rewind = { state: 'controlled', remainingMs: 0 };
    const blocked = buttons(input)[0]; expect(blocked.props.disabled).toBe(true); click(blocked);
    input.playing = false;
    click(buttons(input)[1]);
    expect(input.onActivate).not.toHaveBeenCalled();
  });

  it('reports remaining simulation time without prematurely displaying zero or inventing an expiry for PUA control', () => {
    expect(skillSeconds(1)).toBe('0.1s'); expect(skillSeconds(1201)).toBe('1.3s');
    expect(skillSeconds(6000.00000001)).toBe('6.0s');
    expect(rewindButtonView({ state: 'recording', remainingMs: 1700 })).toMatchObject({ label: '记录', countdown: '1.7s' });
    expect(rewindButtonView({ state: 'controlled', remainingMs: 0 })).toMatchObject({ label: '受控', countdown: null });
    expect(insightButtonView({ ready: false, activeRemainingMs: 0, cooldownRemainingMs: 4300, blockedByRewind: false })).toMatchObject({ label: '冷却', countdown: '4.3s' });
  });

  it.each(['self-rewind', 'teammate-rewind'] as const)('explains %s and rejects R until the real snapshot becomes ready', rerollBlocked => {
    const input = props(); input.hud.stage = 4;
    input.hud.loom = { timeline: 0, rerollReady: false, rerollBlocked, hpUiTaken: false, stemsLost: 0, narrow: false, sharpTurnReady: false };
    const blocked = buttons(input)[2];
    expect(blocked.props.disabled).toBe(true); expect(blocked.props['aria-label']).toBe('R 重掷分支');
    expect(blocked.props.title).toContain(rerollBlocked === 'self-rewind' ? '自己正在回溯' : '队友正在回溯');
    expect(rerollButtonView(input.hud.loom)).toMatchObject({ state: 'blocked', countdown: null });
    expect(blocked.props.title).not.toContain('冷却');
    click(blocked); click(blocked, 1); expect(input.onActivate).not.toHaveBeenCalled();
    input.hud.loom.rerollReady = true; delete input.hud.loom.rerollBlocked;
    const ready = buttons(input)[2]; expect(ready.props.disabled).toBe(false);
    expect(rerollButtonView(input.hud.loom)).toMatchObject({ label: '重掷', state: 'ready' });
    click(ready); expect(input.onActivate).toHaveBeenCalledExactlyOnceWith('reroll');
  });
});
