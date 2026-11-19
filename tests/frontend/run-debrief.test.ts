import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { runActionError, runDebrief } from '../../src/pages/GamePage/functions/runDebrief';
import { RunDebrief } from '../../src/pages/GamePage/components/RunDebrief';
import type { GameSession } from '../../src/pages/GamePage/hooks/useGameSession';

const saved = { ...createRun('465df28f-4c40-4c3c-b401-56bb55b6de89', 42), stage: 4, checkpoint: 21, hp: 67, doom: 54.5, tokens: 137, elapsedMs: 45000, score: 4567 };
function session(screen: GameSession['screen'] = { kind: 'paused' }): Pick<GameSession, 'screen' | 'hud' | 'save'> {
  return { screen, save: saved, hud: { hp: 24, doom: 78.5, tokens: 41, score: 6000, stage: 4, elapsedMs: 76000, rewindReady: true, insightActive: false,
    skills: { rewind: { state: 'ready' as const, remainingMs: 0 }, insight: { ready: true, activeRemainingMs: 0, cooldownRemainingMs: 0, blockedByRewind: false } },
    boss: null, objective: 'Leviathan闭壳，等待吸力窗口。' } };
}

describe('frozen run debrief sources', () => {
  it('pause uses the current snapshot rather than the older safe checkpoint', () => {
    const input = session(); const before = JSON.stringify(input);
    expect(runDebrief(input)).toMatchObject({ kind: 'paused', stage: 4, hp: 24, doom: 78.5, tokens: 41, score: 6000, elapsedMs: 76000, checkpoint: null });
    expect(runDebrief(input)?.objective).toContain('Leviathan闭壳');
    expect(JSON.stringify(input)).toBe(before);
  });
  it('cannot disclose HP swallowed by Leviathan through a pause summary', () => {
    const input = session(); input.hud.hp = 37;
    input.hud.loom = { timeline: 0, rerollReady: true, hpUiTaken: true, stemsLost: 2, narrow: false, sharpTurnReady: false };
    const summary = runDebrief(input)!;
    expect(summary.hp).toBeNull();
    const html = renderToStaticMarkup(createElement(RunDebrief, { snapshot: summary }));
    expect(html).toContain('读数被吞'); expect(html).toContain('生命仍然有效'); expect(html).not.toContain('37');
  });
  it('defeat keeps failed result values separate from the recoverable checkpoint', () => {
    const result = { ...saved, hp: 0, doom: 88, elapsedMs: 81000, tokens: 3, score: 7890 };
    const input = session({ kind: 'ended', result: { save: result, ending: 'defeat' } });
    const before = JSON.stringify(input);
    const summary = runDebrief(input)!;
    expect(summary).toMatchObject({ kind: 'defeat', hp: 0, doom: 88, tokens: 3, score: 7890, elapsedMs: 81000 });
    expect(summary.checkpoint).toMatchObject({ location: '安全点 01 · 休息室', hp: 67, doom: 54.5, elapsedMs: 45000 });
    expect(JSON.stringify(input)).toBe(before);
  });
  it('fourth chapter completion uses next-save totals but only marks four chapters completed', () => {
    const next = { ...saved, stage: 5, checkpoint: 0, hp: 52, score: 9345 };
    const summary = runDebrief(session({ kind: 'chapter-clear', stage: 4, save: next }))!;
    expect(summary.stage).toBe(4); expect(summary.hp).toBe(52); expect(summary.score).toBe(9345);
    expect(summary.route.map(chapter => chapter.status)).toEqual(['complete', 'complete', 'complete', 'complete', 'next']);
    expect(summary.route).toHaveLength(5); expect(summary.chapter).not.toContain('欧米茄');
  });
  it('does not present an unsupported next checkpoint as an available next chapter', () => {
    const summary = runDebrief(session({ kind: 'chapter-clear', stage: 4, save: { ...saved, stage: 5, checkpoint: 99 } }))!;
    expect(summary.route[4].status).toBe('ahead');
  });
  it('does not invent a safe checkpoint for an unsupported retained encoding', () => {
    const input = session({ kind: 'ended', result: { save: { ...saved, hp: 0 }, ending: 'defeat' } });
    input.save = { ...saved, checkpoint: 99 }; expect(runDebrief(input)?.checkpoint).toBeNull();
    input.save = null; expect(runDebrief(input)?.checkpoint).toBeNull();
  });
  it.each(['aligned', 'warden', 'foom'] as const)('leaves the %s ending to its dedicated ending view', ending => {
    expect(runDebrief(session({ kind: 'ended', result: { save: { ...saved, stage: 5, checkpoint: 90 }, ending } }))).toBeNull();
  });
});

describe('run action feedback', () => {
  it.each(['新尝试未开始，原检查点保留。QuotaExceededError', '无法创建新尝试身份，原检查点已保留。', '无法创建不同的新尝试身份，原检查点已保留。', '检查点数据无效，原存档已保留，未开启新尝试。', '当前构建不支持这个安全点编码；原存档保留，未重置。'])('keeps the actionable failure visible: %s', notice => {
    expect(runActionError({ notice, saveStatus: '检查点已保存 · 本地' })).toBe(notice);
  });
  it('keeps storage failure visible even when the browser error is not Chinese', () => {
    expect(runActionError({ notice: 'QuotaExceededError', saveStatus: '本地保存失败' })).toContain('QuotaExceededError');
  });
  it.each(['控制解除', 'Leviathan闭壳，攻击无效。', '从检查点开启新尝试，既有已提交记录不改写。', '本轮训练已中断，结果已锁定；可恢复安全检查点或开始新训练。'])('does not mislabel ordinary notices as failed actions: %s', notice => {
    expect(runActionError({ notice, saveStatus: '检查点已保存 · 本地' })).toBeNull();
  });
});
