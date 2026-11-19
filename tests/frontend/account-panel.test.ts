import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountPanel } from '../../src/pages/GamePage/components/AccountPanel';
import { CloudCheckpoint } from '../../src/pages/GamePage/components/CloudCheckpoint';
import { ScoreSubmission } from '../../src/pages/GamePage/components/ScoreSubmission';
import { useCloudAccount } from '../../src/pages/GamePage/hooks/useCloudAccount';
import { useScoreSubmission } from '../../src/pages/GamePage/hooks/useScoreSubmission';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';

vi.mock('../../src/pages/GamePage/hooks/useCloudAccount', () => ({ useCloudAccount: vi.fn() }));
vi.mock('../../src/pages/GamePage/hooks/useScoreSubmission', () => ({ useScoreSubmission: vi.fn() }));
const save = { ...createRun('fb75571b-c045-4f64-98b6-2f25f081359b', 42), stage: 4, checkpoint: 12, score: 2345, elapsedMs: 42000, hp: 76, doom: 54 };
const auth = { token: 'a'.repeat(43), expiresAt: '2099-01-01T00:00:00Z', user: { id: '15718307-82b0-4401-8b16-b40c68da4124', username: 'test_agent' } };
const account = (patch: Partial<ReturnType<typeof useCloudAccount>> = {}): ReturnType<typeof useCloudAccount> => ({ auth: null, cloud: null, status: { kind: 'idle' }, login: vi.fn(), load: vi.fn(), upload: vi.fn(), logout: vi.fn(), ...patch });
beforeEach(() => { vi.clearAllMocks(); });

describe('account and checkpoint presentation', () => {
  it('offers real tabs and labeled validated fields without issuing any request during render', () => {
    const state = account(); vi.mocked(useCloudAccount).mockReturnValue(state);
    const html = renderToStaticMarkup(createElement(AccountPanel, { save, onRestore: vi.fn() }));
    expect(html).toContain('role="tablist"'); expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-selected="true"'); expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('for="account-username"'); expect(html).toContain('minLength="10"');
    expect(state.login).not.toHaveBeenCalled(); expect(state.load).not.toHaveBeenCalled();
  });
  it.each([null, { save: null, revision: 0, updatedAt: null }])('distinguishes an unread cloud from a genuinely empty slot', cloud => {
    vi.mocked(useCloudAccount).mockReturnValue(account({ auth, cloud }));
    const html = renderToStaticMarkup(createElement(AccountPanel, { save, onRestore: vi.fn() }));
    expect(html).toContain(cloud ? '云端暂无存档' : '尚未读取');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>云端 → 本地/);
    if (!cloud) expect(html).toMatch(/<button[^>]*disabled=""[^>]*>本地 → 云端/);
  });
  it('shows chapter, score, elapsed time and resources derived from the exact supplied save', () => {
    const before = JSON.stringify(save);
    const html = renderToStaticMarkup(createElement(CloudCheckpoint, { label: '云端检查点', save, empty: '', revision: 7 }));
    for (const text of ['CH 04', '安全休息室 2', '2,345', '00:42', '76', '54.0', '版本 7']) expect(html).toContain(text);
    expect(JSON.stringify(save)).toBe(before);
  });
  it('keeps unsupported and completed checkpoints distinct', () => {
    const unsupported = renderToStaticMarkup(createElement(CloudCheckpoint, { label: '本地检查点', save: { ...save, checkpoint: 99 }, empty: '' }));
    const complete = renderToStaticMarkup(createElement(CloudCheckpoint, { label: '本地检查点', save: { ...save, stage: 5, checkpoint: 90 }, empty: '' }));
    expect(unsupported).toContain('检查点待支持'); expect(complete).toContain('已完成');
  });
  it('exposes failures as alerts while retaining the local checkpoint', () => {
    vi.mocked(useCloudAccount).mockReturnValue(account({ auth, status: { kind: 'error', message: '云端暂不可用' } }));
    const html = renderToStaticMarkup(createElement(AccountPanel, { save, onRestore: vi.fn() }));
    expect(html).toContain('role="alert"'); expect(html).toContain('云端暂不可用'); expect(html).toContain('2,345');
  });
});

describe('player score submission copy', () => {
  const render = (state: ReturnType<typeof useScoreSubmission>['state'], username: string | null = 'test_agent') => {
    const submission = { state, username, attempted: true, submit: vi.fn() };
    vi.mocked(useScoreSubmission).mockReturnValue(submission);
    const html = renderToStaticMarkup(createElement(ScoreSubmission, { result: { save, ending: 'defeat' }, onOpenAccount: vi.fn() }));
    expect(submission.submit).not.toHaveBeenCalled(); return html;
  };
  it('keeps conflicts and byte-identical retry intent without technical identifiers', () => {
    const html = render({ kind: 'error', code: 'conflict', message: 'runId debug phrase' });
    expect(html).toContain('已有不同结果，不能覆盖'); expect(html).toContain('不会改成另一局');
    expect(html).toContain('重试相同成绩'); expect(html).not.toContain('runId');
    expect(html).toContain('不会自动提交'); expect(html).toContain('非竞技训练榜');
  });
  it('retains the short-duration rejection and never offers a submit action for an invalid result', () => {
    const html = render({ kind: 'invalid-result', message: '本局有效时长不足 1 秒，不能上传；不会替你虚构时长。' });
    expect(html).toContain('不足 1 秒'); expect(html).not.toContain('<button');
  });
  it('only calls a result recorded after a confirmed response', () => {
    expect(render({ kind: 'submitting' })).toContain('正在等待云端确认');
    const html = render({ kind: 'submitted', response: { scoreId: '2a276e87-a727-4c37-a019-5960c96cb60d', personalBest: true } });
    expect(html).toContain('云端已记录本局成绩'); expect(html).toContain('首次提交时刷新了个人最佳');
    expect(html).not.toContain('<button');
  });
});
