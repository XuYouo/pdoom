import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CoopPlayers } from '../../src/pages/GamePage/components/CoopTeamHud';
import { CoopRestPanel } from '../../src/pages/GamePage/components/CoopRestPanel';
import { CoopPlayOverlay } from '../../src/pages/GamePage/components/CoopPlay';
import type { useCoopPlay } from '../../src/pages/GamePage/hooks/useCoopPlay';
import { GameBridge } from '../../src/pages/GamePage/game/bridge';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createCoopWorld } from '../../src/pages/GamePage/game/coop';
import { coopViewSnapshot, type CoopViewSnapshot } from '../../src/pages/GamePage/network/coopPresentation';
import { COOP_BUILD_ID } from '../../src/pages/GamePage/network/protocol';
import { getChapter } from '../../src/pages/GamePage/game/data/chapters';

vi.mock('../../src/pages/GamePage/components/GameCanvas', () => ({ GameCanvas: () => null }));
function world() {
  const state = createCoopWorld({ ...createRun('937020df-471d-4dd1-afef-84464d4b6990', 42), checkpoint: 11, tokens: 200, doom: 60, inventory: ['constitutional', 'recursive', 'residual'] });
  state.players.p1.hp = 100; state.players.p2.hp = 40; return state;
}
function session(snapshot: CoopViewSnapshot, patch: Partial<ReturnType<typeof useCoopPlay>> = {}): ReturnType<typeof useCoopPlay> {
  return { bridge: new GameBridge(), snapshot, status: snapshot.status, message: '', progress: 1,
    networkRoom: { v: 1, type: 'room', roomId: 'room', code: '7GXK4N2P', buildId: COOP_BUILD_ID, phase: 'playing', version: 1, selfSlot: snapshot.host ? 0 : 1, players: [{ slot: 0, connected: true, ready: true }, { slot: 1, connected: true, ready: true }], matchId: 'match' },
    connected: true, leaving: { kind: 'idle' }, playing: snapshot.mode === 'playing' && snapshot.status === 'playing', local: snapshot.players.find(player => player.id === snapshot.localPlayerId), canResume: snapshot.host && snapshot.status === 'paused', canContinue: true,
    audio: { preferences: { muted: false, volume: 0.5 }, status: 'running', storageWarning: null, setMuted: vi.fn(), setVolume: vi.fn(), unlock: vi.fn() },
    motion: { mode: 'system', systemReduced: false, reducedMotion: false, storageWarning: null, setMode: vi.fn() },
    command: vi.fn(), leave: vi.fn(), pause: vi.fn(), resume: vi.fn(), continueReady: vi.fn(), ...patch };
}
const overlay = (view: CoopViewSnapshot, patch: Partial<ReturnType<typeof useCoopPlay>> = {}) => renderToStaticMarkup(createElement(CoopPlayOverlay, { play: session(view, patch) }));

describe('cooperative team presentation boundaries', () => {
  it('shows two distinct actual HP values and real rescue progress without mutating the view', () => {
    const view = coopViewSnapshot(world(), 'p1', 'playing');
    view.players[1] = { ...view.players[1], state: 'downed', hp: 0, reviveProgressMs: 1000 };
    const before = JSON.stringify(view), markup = renderToStaticMarkup(createElement(CoopPlayers, { view }));
    expect(markup).toContain('aria-label="1P 完整度" value="100"'); expect(markup).toContain('aria-label="2P 完整度" value="0"');
    expect(markup).toContain('aria-label="2P 救援进度" value="1000" max="2000"'); expect(markup).toContain('倒地 · 需要救援');
    expect(JSON.stringify(view)).toBe(before);
  });
  it('does not reveal either current HP through team HUD or pause summaries when Leviathan took the readout', () => {
    const state = createCoopWorld({ ...createRun('937020df-471d-4dd1-afef-84464d4b6990', 42), stage: 4 });
    const view = coopViewSnapshot(state, 'p1', 'paused'); view.hud.loom = { ...view.hud.loom!, hpUiTaken: true };
    const markup = overlay(view);
    expect((markup.match(/生命读数被吞/g) ?? []).length).toBe(2); expect(markup).not.toContain('aria-label="1P 完整度"'); expect(markup).not.toContain('aria-label="2P 完整度"');
  });
  it('uses the selected teammate HP for repair eligibility even when the host is full', () => {
    const view = coopViewSnapshot(world(), 'p1', 'playing', '', 'p2');
    expect(view.hud.hp).toBe(100); expect(view.rest?.hp).toBe(40); expect(view.repairTarget).toBe('p2');
    expect(view.rest?.offers.find(offer => offer.id === 'repair')?.canBuy).toBe(true);
    const markup = renderToStaticMarkup(createElement(CoopRestPanel, { view, bridge: new GameBridge() }));
    expect(markup).toContain('当前：2P'); expect(markup).toContain('>修复 2P</button>');
    const repair = markup.match(/<button[^>]*aria-label="合作购买 修补毛线"[^>]*>/)?.[0];
    expect(repair).toBeTruthy(); expect(repair).not.toContain('disabled');
    expect(markup).toContain('只保留在房主当前运行时'); expect(markup).not.toContain('交易后立即保存');
  });
  it('keeps a guest read-only and never invents the host’s current repair selection', () => {
    const view = coopViewSnapshot(world(), 'p2', 'playing', '', 'p2');
    const markup = renderToStaticMarkup(createElement(CoopRestPanel, { view, bridge: new GameBridge() }));
    expect(markup).toContain('修补毛线由房主选择修复目标'); expect(markup).not.toContain('当前：2P');
    expect(markup).not.toContain('aria-label="合作购买'); expect(markup).not.toContain('aria-label="合作奖励劫持');
    expect(markup).toContain('只能在安全休息室调整顺序，战斗中只读');
  });
  it.each(['ready', 'unavailable'] as const)('keeps an exit available in the runtime %s fallback', mode => {
    const view = { ...coopViewSnapshot(world(), 'p1', 'playing'), mode };
    expect(overlay(view)).toContain('合作运行时尚未就绪'); expect(overlay(view)).toContain('返回终端');
  });
  it('retains settings and real fullscreen actions while a paused guest waits for the host', () => {
    const view = coopViewSnapshot(world(), 'p2', 'paused');
    const markup = renderToStaticMarkup(createElement(CoopPlayOverlay, { play: session(view), fullscreen: { active: false, supported: true, message: '', toggle: vi.fn(async () => undefined) } }));
    expect(markup).toContain('声音与动态设置'); expect(markup).toContain('全屏显示'); expect(markup).toContain('等待房主恢复');
    expect(markup).not.toContain('>恢复双人训练');
  });
  it('shows the actual next chapter after a clear and a separate final report without solo upload actions', () => {
    const base = coopViewSnapshot(world(), 'p1', 'playing');
    const clear = { ...base, stage: 4, mode: 'cleared' as const };
    expect(overlay(clear)).toContain(getChapter(5)!.name); expect(overlay(clear)).toContain('准备进入下一章');
    const completed = { ...base, stage: 5, mode: 'finished' as const, ending: 'warden' as const };
    const markup = overlay(completed);
    expect(markup).toContain('合作训练完成'); expect(markup).toContain('合作团队战报'); expect(markup).toContain('成为新管理员');
    expect((markup.match(/data-cleared="true"/g) ?? []).length).toBe(5);
    expect(markup).not.toContain('准备进入下一章'); expect(markup).not.toContain('上传本局成绩'); expect(markup).not.toContain('恢复检查点');
  });
});
