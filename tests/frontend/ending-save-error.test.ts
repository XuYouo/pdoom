import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EndingOverlay, EndingOverlayContent } from '../../src/pages/GamePage/components/EndingOverlay';
import { RunOverlay } from '../../src/pages/GamePage/components/RunOverlay';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import type { RunResult } from '../../src/objects/game/GameSaveData';
import type { GameSession } from '../../src/pages/GamePage/hooks/useGameSession';

const result: RunResult = { ending: 'warden', save: { ...createRun('82d49ec2-5fc8-45b3-84dd-05b5dc054f73', 42), stage: 5, checkpoint: 90, doom: 55, score: 4567, elapsedMs: 123456 } };
const handlers = () => ({ onSummary: vi.fn(), onNewRun: vi.fn(), onReturnToMenu: vi.fn(), onOpenAccount: vi.fn() });

describe('completed-result persistence failure', () => {
  it.each([false, true])('keeps the failure explicit with summary=%s and does not mutate the completed result', summary => {
    const before = JSON.stringify(result);
    const html = renderToStaticMarkup(createElement(EndingOverlayContent, { result, summary, saveError: 'QuotaExceededError', ...handlers() }));
    expect(html).toContain('role="alert"'); expect(html).toContain('完成记录未能保存到本地');
    expect(html).toContain('本地可能仍是旧检查点'); expect(html).toContain('刷新或离开页面可能失去这次结果');
    expect(html).toContain('手动上传成绩'); expect(html).toContain('云端不会自动保存'); expect(html).toContain('QuotaExceededError');
    if (summary) {
      expect(html).toContain('第五章 / 已完成（未保存）'); expect(html).toContain('本局成绩上传'); expect(html).toContain('4567');
      expect(html).not.toContain('返回、回看与重载不会继续计时');
    }
    expect(JSON.stringify(result)).toBe(before);
  });
  it('does not add a failure or change the ordinary saved-result copy by default', () => {
    const html = renderToStaticMarkup(createElement(EndingOverlayContent, { result, summary: true, ...handlers() }));
    expect(html).not.toContain('完成记录未能保存'); expect(html).not.toContain('（未保存）');
    expect(html).toContain('返回、回看与重载不会继续计时或重复领奖');
  });
  it.each([['本地保存失败', '浏览器拒绝写入', '浏览器拒绝写入'], ['完成记录已保存 · 本地', '浏览器拒绝写入', null]] as const)('routes actual status %s through the successful-ending early return', (saveStatus, notice, expected) => {
    // This early-return view consumes only these session fields; it does not run the session hook.
    const session = { screen: { kind: 'ended', result }, saveStatus, notice, newRun: vi.fn(), returnToMenu: vi.fn(), openPanel: vi.fn() } as unknown as GameSession;
    const tree = RunOverlay({ session });
    expect(tree?.type).toBe(EndingOverlay); expect(tree?.props.saveError).toBe(expected); expect(tree?.props.result).toBe(result);
  });
});
