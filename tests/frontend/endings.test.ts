import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RunResult } from '../../src/objects/game/GameSaveData';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { ENDING_CLIP_COUNT, FOOM_MESSAGE, finalDoomText, getEndingPresentation, immutableRunResult, type VictoryEnding } from '../../src/pages/GamePage/functions/endingPresentation';
import { EndingOverlayContent } from '../../src/pages/GamePage/components/EndingOverlay';
import { buildScoreSubmission } from '../../src/pages/GamePage/hooks/useScoreSubmission';

const cases: { ending: VictoryEnding; doom: number; title: string; symbol: string }[] = [
  { ending: 'aligned', doom: 8, title: '三好毛绒玩偶', symbol: '0%' },
  { ending: 'warden', doom: 55, title: '悬崖勒马的守望者', symbol: '50%' },
  { ending: 'foom', doom: 88, title: 'FOOM！回形针宇宙', symbol: '100%' },
];
const resultFor = (ending: VictoryEnding, doom: number): RunResult => ({ ending, save: {
  ...createRun('b59d05dc-604d-4dc1-a18c-cddda7c98f01', 42), stage: 5, checkpoint: 90, doom,
  hp: 67, score: 4567, tokens: 123, elapsedMs: 123456, donated: true,
  inventory: ['constitutional', 'residual'], upgrades: ['reinforced', 'calibrated'], actionCounts: { shots: 77, dashes: 32, rewinds: 12, insights: 5 },
} });
const propsFor = (result: RunResult, summary = false) => ({ result, summary, onSummary: vi.fn(), onNewRun: vi.fn(), onReturnToMenu: vi.fn(), onOpenAccount: vi.fn() });
type Props = { children?: ReactNode; onClick?: () => void };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return isValidElement<Props>(node) ? text(node.props.children) : '';
}

// Real component branches and callbacks, not a browser/focus/motion or actual-victory claim.
describe('three explicit final presentations', () => {
  it.each(cases)('$ending has its own scene, honest Doom and explicit exit/skip controls', ({ ending, doom, title, symbol }) => {
    const result = resultFor(ending, doom); const before = JSON.stringify(result); const props = propsFor(result);
    const tree = EndingOverlayContent(props); const html = renderToStaticMarkup(createElement(EndingOverlayContent, props));
    expect(html).toContain('aria-label="最终结局"'); expect(html).toContain(`data-ending="${ending}"`);
    expect(html).toContain(title); expect(html).toContain(`>${doom}%</strong>`); expect(html).toContain(`叙事标签 ${symbol}`);
    expect(html).not.toContain('这次，梯度归零'); expect(html).not.toContain('本局成绩上传');
    const buttons = elements(tree).filter(element => element.type === 'button');
    buttons.find(button => text(button.props.children).includes('查看结算'))?.props.onClick?.();
    buttons.find(button => text(button.props.children) === '返回终端')?.props.onClick?.();
    buttons.find(button => text(button.props.children) === '开始新训练')?.props.onClick?.();
    expect(props.onSummary).toHaveBeenCalledOnce(); expect(props.onReturnToMenu).toHaveBeenCalledOnce(); expect(props.onNewRun).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).toBe(before);
  });
  it.each(cases)('$ending summary uses the same snapshot and explicit score upload region', ({ ending, doom }) => {
    const result = immutableRunResult(resultFor(ending, doom)); const before = buildScoreSubmission(result);
    const html = renderToStaticMarkup(createElement(EndingOverlayContent, propsFor(result, true)));
    expect(html).toContain('本局结算 · 结果已锁定'); expect(html).toContain('本局成绩上传'); expect(html).toContain('不会自动提交');
    expect(html).toContain('4567'); expect(html).toContain(`>${doom}%</strong>`); expect(html).not.toContain('从检查点恢复');
    expect(buildScoreSubmission(result)).toEqual(before); expect(result.save.checkpoint).toBe(90);
  });
  it('keeps FOOM inside a labelled virtual surface with a finite clip budget and the authored closing line', () => {
    const html = renderToStaticMarkup(createElement(EndingOverlayContent, propsFor(resultFor('foom', 88))));
    expect(html).toContain(FOOM_MESSAGE); expect(html).toContain('真实系统与文件未被操作'); expect(html).toContain('仅游戏演出区域');
    expect((html.match(/style="animation-delay:[^"]+">📎<\/span>/g) ?? []).length).toBe(ENDING_CLIP_COUNT);
    expect(ENDING_CLIP_COUNT).toBeLessThanOrEqual(24);
  });
  it('does not round a real boundary Doom into the next narrative branch', () => {
    expect(finalDoomText(29.999)).toBe('29.999%'); expect(finalDoomText(79.999)).toBe('79.999%');
    expect(getEndingPresentation('aligned')?.symbol).toBe('0%'); expect(getEndingPresentation('warden')?.symbol).toBe('50%');
  });
  it('does not turn defeat into a victory presentation', () => {
    expect(getEndingPresentation('defeat')).toBeNull();
    expect(EndingOverlayContent(propsFor({ ...resultFor('aligned', 8), ending: 'defeat' }))).toBeNull();
  });
  it('copies and freezes every mutable v1 field without freezing or retaining Scene-owned references', () => {
    const original = resultFor('warden', 55), frozen = immutableRunResult(original);
    const before = JSON.stringify(frozen), payload = buildScoreSubmission(frozen);
    expect(frozen).not.toBe(original); expect(frozen.save).not.toBe(original.save);
    expect(frozen.save.inventory).not.toBe(original.save.inventory); expect(frozen.save.upgrades).not.toBe(original.save.upgrades); expect(frozen.save.actionCounts).not.toBe(original.save.actionCounts);
    expect([frozen, frozen.save, frozen.save.inventory, frozen.save.upgrades, frozen.save.actionCounts].every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(original.save)).toBe(false);
    original.save.score++; original.save.elapsedMs += 1000; original.save.doom = 100;
    original.save.inventory.push('lisp'); original.save.upgrades.push('overclocked'); original.save.actionCounts.shots++;
    expect(JSON.stringify(frozen)).toBe(before); expect(buildScoreSubmission(frozen)).toEqual(payload);
    expect(() => { frozen.save.elapsedMs++; }).toThrow(); expect(() => frozen.save.inventory.push('lisp')).toThrow();
  });
});
