import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ending, GameSaveData, RunResult } from '../../src/objects/game/GameSaveData';
import { isGameSave } from '../../src/objects/game/validation';
import GamePage from '../../src/pages/GamePage';
import { RunOverlay } from '../../src/pages/GamePage/components/RunOverlay';
import { RunHud } from '../../src/pages/GamePage/components/RunHud';
import { MissionConsole } from '../../src/pages/GamePage/components/MissionConsole';
import { GamePanels } from '../../src/pages/GamePage/components/GamePanels';
import { TitleMenu } from '../../src/pages/GamePage/components/TitleMenu';
import { ScoreSubmission } from '../../src/pages/GamePage/components/ScoreSubmission';
import { GameBridge, type HudSnapshot, type RestRoomSnapshot } from '../../src/pages/GamePage/game/bridge';
import { getChapter, PLAYABLE_CHAPTERS } from '../../src/pages/GamePage/game/data/chapters';
import { decodeCheckpoint } from '../../src/pages/GamePage/game/data/checkpoints';
import { contextSnapshot } from '../../src/pages/GamePage/game/systems/context';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { canStartCheckpoint, chapterLabel, donationNote, getDisplayedStage, useGameSession, type GameSession } from '../../src/pages/GamePage/hooks/useGameSession';

// Only the engine canvas and stateful hook are replaced. The actual React branches and registry run in Node.
vi.mock('../../src/pages/GamePage/components/GameCanvas', () => ({ GameCanvas: () => null }));
vi.mock('../../src/pages/GamePage/hooks/useGameSession', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/pages/GamePage/hooks/useGameSession')>();
  return { ...actual, useGameSession: vi.fn() };
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

function saved(stage: number, checkpoint = 0): GameSaveData {
  return { ...createRun('8d5a4ccb-a1b1-44c2-bd20-9e503de02211', 42), stage, checkpoint,
    hp: 90, doom: 54, tokens: 123, score: 2468, elapsedMs: 5000, donated: true,
    inventory: ['constitutional', 'residual'], upgrades: ['reinforced', 'calibrated'],
    actionCounts: { shots: 7, dashes: 3, rewinds: 2, insights: 1 } };
}
function rest(save: GameSaveData): RestRoomSnapshot {
  return { save, room: 1, hp: save.hp, doom: save.doom, tokens: save.tokens, context: contextSnapshot(save, true),
    rewardText: '评级奖励已记录', hackUsed: decodeCheckpoint(save.checkpoint).hackUsed, hackEligible: false,
    hackRequirement: '门槛尚未满足', message: '休息室已恢复', offers: [] };
}
function sessionFor(stage = 1, screen: GameSession['screen'] = { kind: 'menu' }): GameSession {
  const save = saved(stage);
  return {
    bridge: new GameBridge(), ready: true, loadError: null, screen, panel: null, save,
    audio: { preferences: { muted: false, volume: 0.5 }, status: 'locked', storageWarning: null, setMuted: vi.fn(), setVolume: vi.fn(), unlock: vi.fn() },
    hud: { hp: save.hp, doom: save.doom, tokens: save.tokens, score: save.score, stage, elapsedMs: save.elapsedMs,
      rewindReady: false, insightActive: false, boss: null, objective: '本章目标' },
    context: contextSnapshot(save), notice: '运行时就绪', saveStatus: '检查点已保存',
    newRun: vi.fn(), start: vi.fn(), resumeCheckpoint: vi.fn(), pause: vi.fn(), resume: vi.fn(), returnToMenu: vi.fn(), openPanel: vi.fn(),
    setPanel: vi.fn(), persist: vi.fn(() => true), restoreCloud: vi.fn(), setNotice: vi.fn(),
  };
}
type UIProps = { children?: ReactNode; onClick?: () => void; onChange?: (event: { target: { checked: boolean; value: string } }) => void; disabled?: boolean; autoFocus?: boolean; type?: string; value?: number | string; checked?: boolean; 'aria-label'?: string; className?: string; open?: boolean; tabIndex?: number; role?: string; hud?: HudSnapshot; ending?: Ending; result?: RunResult; onOpenAccount?: () => void };

/** Capture callbacks under the real SSR dispatcher; never replace React's hooks.
 * Effects/focus/layout are deliberately left to the native browser tests. */
function captureView(render: () => ReactNode): ReactNode {
  let captured: ReactNode = null;
  function Capture() {
    captured = render();
    return captured;
  }
  renderToStaticMarkup(createElement(Capture));
  return captured;
}
function elements(node: ReactNode): ReactElement<UIProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<UIProps>(node)) return [];
  if (node.type === TitleMenu && isValidElement<Parameters<typeof TitleMenu>[0]>(node)) {
    return [node, ...elements(captureView(() => TitleMenu(node.props)))];
  }
  return [node, ...elements(node.props.children)];
}
function byClass(node: ReactNode, className: string) {
  return elements(node).find(element => element.props.className?.split(/\s+/).includes(className));
}
function disclosure(node: ReactNode, className: string) {
  const details = byClass(node, className);
  const summary = elements(details?.props.children).find(element => element.type === 'summary');
  const body = byClass(details?.props.children, 'hud-detail-body');
  if (details?.type !== 'details' || !summary || !body) throw new Error(`Missing real disclosure: ${className}`);
  return { details, summary, body };
}
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return isValidElement<UIProps>(node) ? text(node.props.children) : '';
}
function button(node: ReactNode, label: string) {
  return elements(node).find(element => element.type === 'button' && text(element.props.children).includes(label));
}
function page(session: GameSession) {
  vi.mocked(useGameSession).mockReturnValue(session);
  return captureView(GamePage);
}

describe('playable checkpoint and display-stage decisions', () => {
  it.each([1, 2, 3, 4, 5])('accepts every supported checkpoint in chapter %i', stage => {
    for (const checkpoint of [0, 1, 2, 11, 12, 21, 22]) expect(canStartCheckpoint(saved(stage, checkpoint))).toBe(true);
  });
  it.each([5])('preserves but never permits unknown checkpoint 99 in chapter %i', stage => {
    const save = saved(stage, 99); const before = JSON.stringify(save);
    expect(isGameSave(save)).toBe(true); expect(canStartCheckpoint(save)).toBe(false);
    expect(JSON.stringify(save)).toBe(before);
  });
  it('rejects unknown checkpoint encodings without treating them as chapter one', () => {
    expect(canStartCheckpoint(null)).toBe(false);
    for (const stage of [1, 2, 3, 4]) for (const checkpoint of [-1, 3, 10, 13, 99]) expect(canStartCheckpoint(saved(stage, checkpoint))).toBe(false);
  });
  it('uses the selected save in menu, not the old paused world', () => {
    const session = sessionFor(2); session.hud.stage = 1;
    expect(getDisplayedStage(session)).toBe(2);
    session.save = saved(3); expect(getDisplayedStage(session)).toBe(3);
    session.save = saved(4); expect(getDisplayedStage(session)).toBe(4);
    session.save = null; expect(getDisplayedStage(session)).toBe(1);
  });
  it.each(['playing', 'paused'] as const)('uses actual HUD chapter while %s', kind => {
    const session = sessionFor(3, { kind }); session.save = saved(4);
    expect(getDisplayedStage(session)).toBe(3);
  });
  it('uses each defeated chapter at clear even though save and HUD already point forward', () => {
    for (const stage of [1, 2, 3, 4]) expect(getDisplayedStage(sessionFor(stage + 1, { kind: 'chapter-clear', stage, save: saved(stage + 1) }))).toBe(stage);
  });
  it('uses ended results and rest snapshots instead of a stale HUD', () => {
    for (const stage of [2, 3, 4]) {
      expect(getDisplayedStage(sessionFor(1, { kind: 'ended', result: { save: saved(stage), ending: 'defeat' } }))).toBe(stage);
      expect(getDisplayedStage(sessionFor(1, { kind: 'rest', snapshot: rest(saved(stage, 11)) }))).toBe(stage);
    }
  });
});

describe('terminal checkpoint and mirror presentation', () => {
  it('accepts 90 only as a fifth-chapter completion, never as an ordinary room encoding', () => {
    expect(decodeCheckpoint(90).supported).toBe(false);
    expect(canStartCheckpoint(saved(5, 90))).toBe(true);
    for (const stage of [1, 2, 3, 4]) { const save = saved(stage, 90); const before = JSON.stringify(save); expect(canStartCheckpoint(save)).toBe(false); expect(JSON.stringify(save)).toBe(before); }
  });
  it('offers explicit replay of the exact completed save without a combat-resume label', () => {
    const session = sessionFor(5); session.save = saved(5, 90); const before = JSON.stringify(session.save);
    const tree = page(session); const replay = button(tree, '回看结局');
    expect(replay?.props.disabled).toBe(false); expect(button(tree, '恢复检查点')).toBeUndefined();
    replay?.props.onClick?.(); expect(session.start).toHaveBeenCalledExactlyOnceWith(session.save); expect(session.resumeCheckpoint).not.toHaveBeenCalled();
    expect(session.newRun).not.toHaveBeenCalled(); expect(JSON.stringify(session.save)).toBe(before);
    expect(vi.mocked(session.start).mock.calls[0][0]).toBe(session.save);
    const html = renderToStaticMarkup(tree);
    expect(text(byClass(tree, 'menu-chapter')?.props.children)).toBe(`05${getChapter(5)!.name}`);
    expect(html).toContain('aria-label="主菜单"'); expect(html).not.toContain('chapter-list');
    expect(button(tree, '进入第六章')).toBeUndefined(); expect(button(tree, '继续训练')).toBeUndefined();
    expect(html).not.toContain('mission-console'); expect(html).not.toContain('本局成绩上传');
  });
  it.each([{ ending: 'aligned', doom: 8 }, { ending: 'warden', doom: 55 }, { ending: 'foom', doom: 88 }] as const)('routes $ending to a real ending rather than the defeat overlay', ({ ending, doom }) => {
    const save = { ...saved(5, 90), doom }; const session = sessionFor(1, { kind: 'ended', result: { save, ending } }); const before = JSON.stringify(save);
    const html = renderToStaticMarkup(createElement(RunOverlay, { session }));
    expect(html).toContain('aria-label="最终结局"'); expect(html).toContain(`data-ending="${ending}"`);
    expect(html).not.toContain('这次，梯度归零'); expect(html).not.toContain('从检查点恢复'); expect(html).not.toContain('进入第六章');
    expect(html).toContain(`>${doom}%</strong>`); expect(JSON.stringify(save)).toBe(before);
    expect(getDisplayedStage(session)).toBe(5);
  });
  it.each(['counts-only', 'ordered'] as const)('displays supplied mirror summaries with honest %s provenance', memorySource => {
    const hud = { ...sessionFor(5).hud, omega: { phaseLabel: '现场学习', memorySource, dominantAction: '冲刺偏好', combo: '冲刺 → 射击', activeTraits: ['强化词条', '生效升级'], observedCombos: 3, mirrorAction: '复制冲刺' } };
    const before = JSON.stringify(hud);
    const tree = RunHud({ hud }); const { details, summary, body } = disclosure(tree, 'omega-details');
    expect(details.props['aria-label']).toBe('镜像详情'); expect(details.props.open).toBeUndefined();
    const visible = text(summary.props.children), expanded = text(body.props.children);
    expect(visible).toBe(`现场学习 · 复制冲刺 · ${memorySource === 'counts-only' ? '频次编排' : '实际观察3组'}详情`);
    expect(visible).not.toMatch(/\n|冲刺偏好|冲刺 → 射击|强化词条|历史|已锁定/);
    expect(expanded).toContain('动作偏好冲刺偏好'); expect(expanded).toContain('当前组合冲刺 → 射击');
    expect(expanded).toContain('有效构筑强化词条、生效升级'); expect(expanded).toContain('已观察组合3');
    expect(expanded).toContain(memorySource === 'counts-only' ? '仅动作次数；频次编排不代表历史连招' : '本次场景的有序观察，并非整局历史');
    expect(body.props.tabIndex).toBe(0); expect(body.props['aria-label']).toBe('展开的状态详情');
    expect(renderToStaticMarkup(tree)).not.toMatch(/<details[^>]*\bopen/); expect(JSON.stringify(hud)).toBe(before);
  });
  for (const ending of ['aligned', 'warden', 'foom', 'defeat'] as const) {
    it.each(['counts-only', 'ordered'] as const)(`${ending} locks the %s mirror summary without claiming ongoing observation`, memorySource => {
      const save = { ...saved(5, ending === 'defeat' ? 2 : 90), doom: ending === 'aligned' ? 8 : ending === 'foom' ? 88 : 55, hp: ending === 'defeat' ? 0 : 67 };
      const session = sessionFor(5, { kind: 'ended', result: { save, ending } });
      session.hud.omega = { phaseLabel: '现场学习', memorySource, dominantAction: '冲刺偏好', combo: '冲刺 → 射击', activeTraits: ['强化词条'], observedCombos: 3, mirrorAction: '观察并继续现场学习' };
      const before = JSON.stringify({ hud: session.hud, result: session.screen });
      // Exercise the actual page-to-HUD prop as well as the HUD text; do not let a caller omit defeat.
      const tree = page(session), html = renderToStaticMarkup(tree);
      const connectedHud = elements(tree).find(element => element.type === RunHud);
      expect(connectedHud?.props.hud).toBe(session.hud); expect(connectedHud?.props.ending).toBe(ending);
      expect(html).toContain('镜像已锁定'); expect(html).toContain('不再观察');
      expect(html).not.toContain('观察并继续现场学习'); expect(html).not.toContain('现场学习');
      if (ending !== 'foom') {
        const { details, summary, body } = disclosure(RunHud({ hud: session.hud, ending: connectedHud!.props.ending }), 'omega-details');
        expect(details.props.open).toBeUndefined(); expect(text(summary.props.children)).toBe('镜像已锁定 · 不再观察详情');
        const expanded = text(body.props.children);
        expect(expanded).toContain('已记录组合冲刺 → 射击'); expect(expanded).toContain('有效构筑强化词条'); expect(expanded).toContain('已观察组合3');
        expect(expanded).toContain(memorySource === 'ordered' ? '结束时的有序观察摘要，不再追加' : '结果仅有动作次数，不能还原历史连招');
      } else { expect(html).toContain('FOOM 页面内虚拟界面重排'); expect(html).not.toContain('omega-details'); }
      expect(JSON.stringify({ hud: session.hud, result: session.screen })).toBe(before);
    });
  }
  it('confines FOOM transformation to a bounded virtual HUD while preserving the input snapshot', () => {
    const hud = sessionFor(5).hud; const before = JSON.stringify(hud);
    const html = renderToStaticMarkup(createElement(RunHud, { hud, ending: 'foom' }));
    expect(html).toContain('页面内虚拟界面重排'); expect(html).toContain('虚拟重排 · 原数值见结算');
    expect(html).not.toContain('integrity-track'); expect(JSON.stringify(hud)).toBe(before);
  });
});

describe('chapter-clear and defeat overlay', () => {
  it.each([{ stage: 1, donated: false }, { stage: 1, donated: true }, { stage: 2, donated: false }, { stage: 2, donated: true }, { stage: 3, donated: false }, { stage: 3, donated: true }, { stage: 4, donated: false }, { stage: 4, donated: true }])('clear $stage preserves exact next snapshot and donated=$donated', ({ stage, donated }) => {
    const next = { ...saved(stage + 1), donated }; const before = JSON.stringify(next);
    // The menu save deliberately differs, so a stale session.save cannot make this pass.
    const session = sessionFor(stage, { kind: 'chapter-clear', stage, save: next });
    const tree = RunOverlay({ session });
    const enter = button(tree, `进入${chapterLabel(stage + 1)}`);
    expect(enter?.props.autoFocus).toBe(true); expect(enter?.props.disabled).toBe(false);
    expect(session.start).not.toHaveBeenCalled();
    enter?.props.onClick?.();
    expect(session.start).toHaveBeenCalledExactlyOnceWith(next);
    expect(vi.mocked(session.start).mock.calls[0][0]).toBe(next);
    expect(session.newRun).not.toHaveBeenCalled(); expect(session.resumeCheckpoint).not.toHaveBeenCalled();
    expect(JSON.stringify(next)).toBe(before);
    const html = renderToStaticMarkup(createElement(RunOverlay, { session }));
    expect(tree?.props.title).toBe(`${getChapter(stage)!.name}已突破。`);
    expect(html.match(/<dialog\b/g)).toHaveLength(1);
    expect(html).toContain(`下一站：${getChapter(stage + 1)!.name}。`);
    expect(html).toContain(`${getChapter(stage)!.name}已突破`);
    expect(html).not.toContain(`${getChapter(stage + 1)!.name}已突破`);
    expect(html).not.toContain('本局成绩上传');
  });
  it('chapter-four clear preserves chapter-five entry and requires explicit continuation without final score', () => {
    const next = saved(5); const before = JSON.stringify(next);
    const session = sessionFor(5, { kind: 'chapter-clear', stage: 4, save: next });
    const tree = RunOverlay({ session });
    const html = renderToStaticMarkup(createElement(RunOverlay, { session }));
    expect(tree?.props.title).toBe(`${getChapter(4)!.name}已突破。`);
    expect(html).toContain(`下一站：${getChapter(5)!.name}。`); expect(html).not.toContain('第五章尚未开放');
    expect(html.match(/<dialog\b/g)).toHaveLength(1);
    expect(html).toContain(`${getChapter(4)!.name}已突破`); expect(html).not.toContain('本局成绩上传');
    expect(html).not.toContain('aria-label="最终结局"'); expect(button(tree, '进入第五章')?.props.disabled).toBe(false);
    expect(button(tree, '新一轮训练')).toBeUndefined();
    expect(button(tree, '进入第五章')?.props.autoFocus).toBe(true); expect(session.start).not.toHaveBeenCalled();
    button(tree, '进入第五章')?.props.onClick?.(); expect(session.start).toHaveBeenCalledExactlyOnceWith(next);
    expect(vi.mocked(session.start).mock.calls[0][0]).toBe(next);
    expect(session.newRun).not.toHaveBeenCalled(); expect(session.resumeCheckpoint).not.toHaveBeenCalled();
    button(tree, '返回终端')?.props.onClick?.(); expect(session.returnToMenu).toHaveBeenCalledOnce();
    expect(JSON.stringify(next)).toBe(before);
  });
  it('rejects a nonconsecutive clear snapshot rather than restarting the same chapter', () => {
    const session = sessionFor(2, { kind: 'chapter-clear', stage: 2, save: saved(2) });
    expect(button(RunOverlay({ session }), '进入')).toBeUndefined();
    expect(session.start).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3, 4, 5])('retains real score submission and checkpoint recovery after chapter %i defeat', stage => {
    const save = saved(stage, 21);
    const result: RunResult = { save: { ...save, hp: 0, elapsedMs: 5500 }, ending: 'defeat' };
    const session = sessionFor(stage, { kind: 'ended', result }); session.save = save;
    const before = JSON.stringify({ save, result });
    const tree = RunOverlay({ session });
    const restore = button(tree, '从检查点恢复');
    expect(restore?.props.disabled).toBe(false); expect(restore?.props.autoFocus).toBe(true);
    restore?.props.onClick?.();
    expect(session.resumeCheckpoint).toHaveBeenCalledExactlyOnceWith(save); expect(session.start).not.toHaveBeenCalled();
    expect(vi.mocked(session.resumeCheckpoint).mock.calls[0][0]).toBe(save); expect(session.newRun).not.toHaveBeenCalled();
    const submission = elements(tree).find(element => element.type === ScoreSubmission);
    expect(submission?.props.result).toBe(result); expect(submission?.props.result?.save).not.toBe(save);
    expect(submission?.props.result?.save).toEqual({ ...save, hp: 0, elapsedMs: 5500 });
    submission?.props.onOpenAccount?.(); expect(session.openPanel).toHaveBeenCalledExactlyOnceWith('account');
    const html = renderToStaticMarkup(createElement(RunOverlay, { session }));
    expect(html).toContain('本局成绩上传'); expect(html).toContain('安全检查点仍在');
    expect(html).toContain('不会自动提交'); expect(JSON.stringify({ save, result })).toBe(before);
  });
  it('does not offer recovery of future chapters or unsupported checkpoint encodings', () => {
    for (const save of [saved(5, 99), saved(2, 99), saved(3, 99), saved(4, 99), saved(1, 90)]) {
      const session = sessionFor(save.stage, { kind: 'ended', result: { save, ending: 'defeat' } }); session.save = save;
      expect(button(RunOverlay({ session }), '从检查点恢复')).toBeUndefined();
    }
  });
  it.each([2, 3, 4])('keeps chapter %i paused resume separate from continuation', stage => {
    const session = sessionFor(stage, { kind: 'paused' });
    const tree = RunOverlay({ session }); button(tree, '继续训练')?.props.onClick?.();
    expect(session.resume).toHaveBeenCalledOnce(); expect(session.start).not.toHaveBeenCalled();
    expect(button(tree, '进入')).toBeUndefined();
  });
});

describe('chapter-specific React presentation', () => {
  it.each([1, 2, 3, 4, 5])('renders chapter %i title and enables its valid menu checkpoint', stage => {
    const session = sessionFor(stage); const before = JSON.stringify(session.save);
    const tree = page(session);
    expect(button(tree, '恢复检查点')?.props.disabled).toBe(false);
    button(tree, '恢复检查点')?.props.onClick?.();
    expect(session.resumeCheckpoint).toHaveBeenCalledExactlyOnceWith(session.save); expect(session.start).not.toHaveBeenCalled();
    expect(vi.mocked(session.resumeCheckpoint).mock.calls[0][0]).toBe(session.save);
    expect(session.newRun).not.toHaveBeenCalled(); expect(JSON.stringify(session.save)).toBe(before);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('aria-label="主菜单"'); expect(html).toContain('新训练会替换当前检查点');
    expect(text(byClass(tree, 'menu-save-info')?.props.children)).toBe(`${getChapter(stage)!.name} · 检查点已保存`);
    expect(text(byClass(tree, 'menu-chapter')?.props.children)).toBe(`0${stage}${getChapter(stage)!.name}`);
    expect(PLAYABLE_CHAPTERS.map(chapter => chapter.stage)).toEqual([1, 2, 3, 4, 5]);
    expect(html).not.toMatch(/chapter-list|mission-console|PLAYABLE CHAPTERS|TRAINING PATH/);
  });
  it.each([5])('shows unsupported checkpoint 99 in chapter %i without enabling or resetting it', stage => {
    const session = sessionFor(stage); session.save = saved(stage, 99);
    session.hud.objective = '当前安全点编码尚未支持；原存档已保留。';
    const before = JSON.stringify(session.save); const tree = page(session);
    expect(button(tree, '恢复检查点')?.props.disabled).toBe(true);
    const warning = byClass(tree, 'menu-warning');
    expect(warning?.props.role).toBe('status'); expect(warning?.props.className?.split(/\s+/)).toContain('objective');
    expect(text(warning?.props.children)).toBe('安全点编码尚未支持，原存档已保留。');
    expect(renderToStaticMarkup(tree)).toContain(getChapter(stage)!.name);
    expect(renderToStaticMarkup(tree)).toContain('原存档已保留');
    expect(session.start).not.toHaveBeenCalled(); expect(session.resumeCheckpoint).not.toHaveBeenCalled(); expect(session.newRun).not.toHaveBeenCalled();
    expect(JSON.stringify(session.save)).toBe(before);
  });
  it.each([3, 4, 5])('chapter %i menu shows its selected checkpoint without a website chapter path', stage => {
    const session = sessionFor(stage); session.hud.stage = 1;
    const tree = page(session), html = renderToStaticMarkup(tree);
    const selected = byClass(tree, 'menu-chapter');
    expect(selected?.props['aria-label']).toBe('所选章节');
    expect(text(selected?.props.children)).toBe(`0${stage}${getChapter(stage)!.name}`);
    expect(button(tree, '恢复检查点')?.props.disabled).toBe(false);
    expect(PLAYABLE_CHAPTERS.map(chapter => chapter.stage)).toEqual([1, 2, 3, 4, 5]);
    for (const chapter of PLAYABLE_CHAPTERS) expect(canStartCheckpoint(saved(chapter.stage))).toBe(true);
    expect(html).not.toMatch(/<aside|chapter-list|TRAINING PATH|未开放/);
    expect(renderToStaticMarkup(createElement(MissionConsole, { session }))).toBe('');
  });
  it.each([1, 2, 3, 4, 5])('guide names actual chapter %i mechanics and open range', stage => {
    const session = sessionFor(stage); session.panel = 'guide';
    const html = renderToStaticMarkup(createElement(GamePanels, { session }));
    expect(html).toContain(getChapter(stage)!.boss.name);
    expect(html).toContain(stage === 5 ? '真实动作偏好' : stage === 4 ? '种子决定的分岔' : stage === 3 ? 'GPU 热区' : stage === 2 ? '持续向上逃生' : '右侧的 Gato');
    expect(html).toContain('当前已开放 5 章');
    expect(html).not.toContain('第五章尚未开放');
  });
  it.each([5])('unsupported checkpoint in chapter %i keeps its original chapter guide instead of falling back', stage => {
    const session = sessionFor(stage); session.save = saved(stage, 99); session.panel = 'guide';
    const before = JSON.stringify(session.save); const html = renderToStaticMarkup(createElement(GamePanels, { session }));
    expect(html).toContain('安全点编码尚未支持'); expect(html).toContain('原存档已保留');
    expect(html).not.toContain('右侧的 Gato'); expect(html).not.toContain('凝视与真实历史');
    expect(JSON.stringify(session.save)).toBe(before);
  });
  it.each([2, 3, 4])('clear %i guide and single transition describe the defeated world, not the next save', stage => {
    const next = { ...saved(stage + 1), donated: false };
    const session = sessionFor(stage + 1, { kind: 'chapter-clear', stage, save: next }); session.panel = 'guide';
    const guide = renderToStaticMarkup(createElement(GamePanels, { session }));
    expect(guide).toContain(`<h3>${getChapter(stage)!.name}</h3>`);
    expect(guide).toContain(getChapter(stage)!.boss.name);
    expect(guide).toContain('前两章未捐款');
    expect(guide).not.toContain('不会触发欠捐狂暴惩罚');
    expect(renderToStaticMarkup(createElement(MissionConsole, { session }))).toBe('');
    const transition = RunOverlay({ session });
    expect(transition?.props.title).toBe(`${getChapter(stage)!.name}已突破。`);
    const html = renderToStaticMarkup(transition);
    expect(html.match(/<dialog\b/g)).toHaveLength(1);
    expect(html).toContain(`下一站：${getChapter(stage + 1)!.name}。`);
    expect(html).not.toContain(`${getChapter(stage + 1)!.name}已突破`);
    expect(html).not.toContain('本局成绩上传');
    const enter = button(transition, `进入${chapterLabel(stage + 1)}`);
    expect(enter?.props.disabled).toBe(false); expect(session.start).not.toHaveBeenCalled();
    const before = JSON.stringify(next); enter?.props.onClick?.();
    expect(session.start).toHaveBeenCalledExactlyOnceWith(next); expect(vi.mocked(session.start).mock.calls[0][0]).toBe(next);
    expect(JSON.stringify(next)).toBe(before); expect(session.newRun).not.toHaveBeenCalled(); expect(session.resumeCheckpoint).not.toHaveBeenCalled();
  });
  it('explains facing, laser conditions, real-history Q and physical K-line rewards', () => {
    const session = sessionFor(3); session.panel = 'guide';
    const html = renderToStaticMarkup(createElement(GamePanels, { session }));
    expect(html).toContain('Boss 前方激光带内且面向 Boss');
    expect(html).toContain('A / D 改变角色面向');
    expect(html).toContain('鼠标瞄准只改变射击方向，不会让角色转身');
    expect(html).toContain('须已就绪且有两秒真实历史');
    expect(html).toContain('不会自动传送到 Boss 身后');
    expect(html).toContain('真实载人的动态 K 线'); expect(html).toContain('隐藏奖励房');
  });
  it('rest stays non-dismissible and retains its explicit continue/menu lifecycle', () => {
    const snapshot = rest(saved(2, 21));
    const session = sessionFor(2, { kind: 'rest', snapshot });
    const tree = GamePanels({ session });
    expect(tree?.props.dismissible).toBe(false);
    const html = renderToStaticMarkup(createElement(GamePanels, { session }));
    expect(html).toContain('CHAPTER 02 / SAFE ROOM 01');
    expect(html).toContain('不再交易，继续前进'); expect(html).toContain('返回终端并保留检查点');
    expect(html).not.toContain('aria-label="关闭弹窗"'); expect(snapshot.save.donated).toBe(true);
  });
  it.each([false, true])('third-chapter rest explains donated=%s and obeys a locked shop snapshot', donated => {
    const snapshot = rest({ ...saved(3, 11), donated });
    snapshot.offers = [{ id: 'donation', name: '蛇怪募捐箱', price: 20, kind: 'donation', description: '前两章因果记录',
      owned: donated, available: false, canBuy: false, canHack: false, reason: '第三章因果已经锁定，不能补捐。' }];
    const before = JSON.stringify(snapshot);
    const html = renderToStaticMarkup(createElement(GamePanels, { session: sessionFor(3, { kind: 'rest', snapshot }) }));
    expect(html).toContain(donated ? '不会触发欠捐狂暴惩罚' : '第三章蛇怪会因欠捐而狂暴');
    expect(html).toContain('第三章不接受补捐');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="购买 蛇怪募捐箱"/);
    expect(html).toContain('不再交易，继续前进'); expect(JSON.stringify(snapshot)).toBe(before);
  });
  it.each([1, 2])('chapter %i can still explain early donation without claiming immunity to damage', stage => {
    const save = { ...saved(stage), donated: false };
    expect(donationNote(save)).toContain('第一、二章可在安全休息室的募捐箱捐款');
    const session = sessionFor(stage); session.save = save; session.panel = 'guide';
    const html = renderToStaticMarkup(createElement(GamePanels, { session }));
    expect(html).toContain('募捐箱→休息室'); expect(html).toContain('不代表免疫伤害');
  });
  it('actually removes live HP numbers and bar DOM while swallowed, then restores the same health', () => {
    const hud = { ...sessionFor(4).hud, hp: 73, loom: { timeline: 0, rerollReady: true, hpUiTaken: false, stemsLost: 0, narrow: true, sharpTurnReady: true } };
    const live = renderToStaticMarkup(createElement(RunHud, { hud }));
    expect(live).toContain('integrity-track'); expect(live).toContain('width:73%'); expect(live).toContain('73<small>/100');
    const swallowed = { ...hud, loom: { ...hud.loom, hpUiTaken: true, stemsLost: 4 } }; const before = JSON.stringify(swallowed);
    const swallowedTree = RunHud({ hud: swallowed }), hidden = renderToStaticMarkup(swallowedTree);
    expect(text(byClass(swallowedTree, 'integrity-missing')?.props.children)).toBe('读数被吞 · HP仍有效');
    const { details, body } = disclosure(swallowedTree, 'loom-details');
    expect(details.props.open).toBeUndefined(); expect(text(body.props.children)).toContain('音轨被吞 4/4');
    expect(hidden).not.toContain('integrity-track'); expect(hidden).not.toContain('width:73%'); expect(hidden).not.toContain('73<small>/100');
    expect(JSON.stringify(swallowed)).toBe(before);
    const restored = renderToStaticMarkup(createElement(RunHud, { hud: { ...swallowed, loom: { ...swallowed.loom, hpUiTaken: false, stemsLost: 0 } } }));
    expect(restored).toContain('width:73%'); expect(restored).toContain('73<small>/100'); expect(restored).not.toContain('读数被吞');
    expect(hud.hp).toBe(73);
  });
  it.each([{ name: 'partially swallowed', hpUiTaken: true, stemsLost: 2 }, { name: 'weak window open', hpUiTaken: false, stemsLost: 0 }])('does not infer intact platforms or a waiting phase from false Loom flags: $name', ({ hpUiTaken, stemsLost }) => {
    const hud = { ...sessionFor(4).hud, loom: { timeline: 0, rerollReady: false, hpUiTaken, stemsLost, narrow: false, sharpTurnReady: false } };
    const tree = RunHud({ hud }), html = renderToStaticMarkup(tree);
    const { details, summary, body } = disclosure(tree, 'loom-details');
    expect(details.props.open).toBeUndefined(); expect(text(body.props.children)).toContain('落脚区仍较宽');
    expect(text(summary.props.children)).toBe(`分支 A · R 冷却中 · 音轨被吞 ${stemsLost}/4详情`);
    expect(text(body.props.children)).toContain('Q和R都不恢复已消失的平台');
    expect(html).not.toContain('平台尚完整'); expect(html).not.toContain('等待左转窗口');
    expect(text(summary.props.children)).not.toContain('急左转窗口');
  });
  it.each([{ stage: 4, donated: false }, { stage: 4, donated: true }, { stage: 5, donated: false }, { stage: 5, donated: true }])('later-stage donation copy is settled history, stage=$stage donated=$donated', snapshot => {
    const note = donationNote(snapshot);
    expect(note).toContain('本局因果已结算'); expect(note).toContain('后续章节不再补捐');
    expect(note).toContain(snapshot.donated ? '第三章未触发欠捐狂暴惩罚' : '第三章已采用欠捐狂暴规则');
    expect(note).not.toContain('会因欠捐而狂暴'); expect(note).not.toContain('不会触发欠捐狂暴惩罚');
  });
  it('dispatches the actual R command only while playing with a ready Loom snapshot', () => {
    const session = sessionFor(4, { kind: 'playing' });
    session.hud.loom = { timeline: 1, rerollReady: true, hpUiTaken: false, stemsLost: 0, narrow: false, sharpTurnReady: false };
    const commands: unknown[] = []; const off = session.bridge.onCommand(command => { commands.push(command); });
    const reroll = () => elements(page(session)).find(element => element.type === 'button' && element.props['aria-label'] === 'R 重掷分支');
    expect(reroll()?.props.disabled).toBe(false); reroll()?.props.onClick?.(); expect(commands).toEqual([{ type: 'reroll' }]);
    session.screen = { kind: 'paused' }; expect(reroll()?.props.disabled).toBe(true);
    session.screen = { kind: 'playing' }; session.hud.loom.rerollReady = false; expect(reroll()?.props.disabled).toBe(true);
    session.hud.loom = undefined; expect(reroll()).toBeUndefined(); off();
  });
  it('Loom guide names real leftward movement and does not promise history or platform restoration', () => {
    const session = sessionFor(4); session.panel = 'guide';
    const html = renderToStaticMarkup(createElement(GamePanels, { session }));
    expect(html).toContain('清空旧 Q 历史'); expect(html).toContain('Q 不会还原坍塌地形');
    expect(html).toContain('A + Shift 真实向左跨过标线至少 32 像素'); expect(html).toContain('闭壳时 J 无法伤害');
    expect(html).toContain('不会回满生命'); expect(html).toContain('不会恢复已吞平台');
    expect(html).toContain('四条音乐层会依次静音，但音效保留');
  });
  it('shows persisted audio preferences and sends only explicit settings interactions', () => {
    const session = sessionFor(4, { kind: 'paused' }); session.panel = 'settings';
    session.audio.preferences = { muted: true, volume: 0.25 };
    const tree = GamePanels({ session }); const html = renderToStaticMarkup(tree);
    expect(html).toContain('尚未解锁'); expect(html).toContain('25%'); expect(html).toContain('原创四层合成');
    expect(session.audio.unlock).not.toHaveBeenCalled();
    const mute = elements(tree).find(element => element.type === 'input' && element.props.type === 'checkbox');
    const volume = elements(tree).find(element => element.type === 'input' && element.props.type === 'range');
    expect(mute?.props.checked).toBe(true); expect(volume?.props.value).toBe(25);
    mute?.props.onChange?.({ target: { checked: false, value: '' } }); expect(session.audio.setMuted).toHaveBeenCalledExactlyOnceWith(false);
    volume?.props.onChange?.({ target: { checked: false, value: '70' } }); expect(session.audio.setVolume).toHaveBeenCalledExactlyOnceWith(0.7);
    button(tree, '启用音频')?.props.onClick?.(); expect(session.audio.unlock).toHaveBeenCalledOnce();
    expect(session.resume).not.toHaveBeenCalled(); expect(session.newRun).not.toHaveBeenCalled();
  });
  it('reports unsupported audio and storage failure without pretending that sound is playing', () => {
    const session = sessionFor(4); session.panel = 'settings'; session.audio.status = 'unavailable'; session.audio.storageWarning = '音频设置保存失败';
    const tree = GamePanels({ session }); const html = renderToStaticMarkup(tree);
    expect(html).toContain('浏览器音频不可用'); expect(html).toContain('音频设置保存失败');
    expect(button(tree, '启用音频')?.props.disabled).toBe(true); expect(html).not.toContain('音频引擎运行中');
  });
  it('preserves explicit resource-failure refresh without starting or resetting a run', () => {
    const reload = vi.fn(); vi.stubGlobal('window', { location: { reload } });
    const session = sessionFor(3); session.ready = false; session.loadError = '角色图集加载失败';
    const tree = page(session);
    expect(renderToStaticMarkup(tree)).toContain('角色图集加载失败');
    expect(button(tree, '恢复检查点')?.props.disabled).toBe(true);
    button(tree, '刷新并重试')?.props.onClick?.();
    expect(reload).toHaveBeenCalledOnce(); expect(session.newRun).not.toHaveBeenCalled();
    expect(session.start).not.toHaveBeenCalled(); expect(session.save?.stage).toBe(3);
  });
});
