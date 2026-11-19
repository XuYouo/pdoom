import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GameSaveData } from '../../src/objects/game/GameSaveData';
import { RestHackConfirmation, RestRoomPanel } from '../../src/pages/GamePage/components/RestRoomPanel';
import { GamePanels } from '../../src/pages/GamePage/components/GamePanels';
import type { GameSession } from '../../src/pages/GamePage/hooks/useGameSession';
import { GameBridge, type GameCommand } from '../../src/pages/GamePage/game/bridge';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { restStorageFeedback, rewardHackPreview, rewardHackUnavailable } from '../../src/pages/GamePage/functions/restTransactions';
import { restSnapshot, transactShop } from '../../src/pages/GamePage/game/systems/shop';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { doomForm } from '../../src/pages/GamePage/game/systems/rules';

const save = (patch: Partial<GameSaveData> = {}): GameSaveData => ({
  ...createRun('8717a5c4-5041-493a-82ba-97d8d7828777', 42), checkpoint: 11, hp: 60, tokens: 200, doom: 60,
  inventory: ['constitutional', 'recursive', 'residual'], ...patch,
});
const snapshot = (patch: Partial<GameSaveData> = {}) => restSnapshot(createWorld(save(patch)))!;
const html = (patch: Partial<GameSaveData> = {}, saveStatus?: string, notice?: string) => renderToStaticMarkup(createElement(RestRoomPanel, { bridge: new GameBridge(), snapshot: snapshot(patch), saveStatus, notice }));
type Props = { children?: ReactNode; onClick?: () => void; disabled?: boolean; autoFocus?: boolean; 'aria-label'?: string };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function capture(render: () => ReactNode) {
  let tree: ReactNode;
  function Capture() { tree = render(); return tree; }
  renderToStaticMarkup(createElement(Capture)); return tree;
}

describe('rest transaction decisions', () => {
  it.each([[55, 80, 'masked', null], [55.01, 80.01, 'foom', 80], [60, 85, 'foom', 80], [80, 99.99, 'foom', 80], [85, 99.99, 'foom', null], [99.99, 99.99, 'foom', null]] as const)(
    'matches actual hack consequences at Doom %s, including strict thresholds and cap', (doom, after, form, threshold) => {
      const original = save({ doom }); const preview = rewardHackPreview(doom);
      const result = transactShop(original, 'upgrade:calibrated', true);
      expect(result.ok).toBe(true); if (!result.ok) throw Error(result.message);
      expect(preview.after).toBe(after); expect(preview.after).toBe(result.save.doom);
      expect(preview.afterForm).toBe(form); expect(preview.afterForm).toBe(doomForm(result.save.doom));
      expect(preview.threshold).toBe(threshold); expect(preview.delta).toBeCloseTo(result.save.doom - original.doom);
      expect(original.doom).toBe(doom); expect(result.save.tokens).toBe(original.tokens);
    });
  it('shows insufficient funds without incorrectly denying an eligible free hack', () => {
    const state = snapshot({ tokens: 0 }); const offer = state.offers.find(item => item.id === 'upgrade:calibrated')!;
    expect(offer.canBuy).toBe(false); expect(offer.canHack).toBe(true); expect(rewardHackUnavailable(state, offer)).toBeNull();
    const markup = html({ tokens: 0 });
    expect(markup).toMatch(/class="rest-offer-reason">需要 \d+ TOK，当前 0 TOK。<\/span>/);
    expect(markup).toContain('奖励劫持可用');
  });
  it('explains actual density, strict Doom requirement, owned goods and room usage visibly', () => {
    const low = html({ doom: 50, inventory: ['constitutional'] });
    expect(low).toContain('密度 43.8% / 需 ≥75%'); expect(low).toContain('Doom 50.00% / 需 &gt;50%');
    expect(low).toContain('class="rest-offer-reason">已拥有；不能重复购买。');
    expect(html({ checkpoint: 21 })).toContain('本休息室的奖励劫持已使用；不能再次劫持。');
  });
  it('keeps ordinary buying immediate and opens no transaction from the first hack click', () => {
    const bridge = new GameBridge(), commands: GameCommand[] = []; bridge.onCommand(command => commands.push(command));
    const tree = capture(() => RestRoomPanel({ bridge, snapshot: snapshot() }));
    const buy = elements(tree).find(node => node.props['aria-label'] === '购买 梯度校准')!;
    const hack = elements(tree).find(node => node.props['aria-label'] === '奖励劫持 梯度校准')!;
    hack.props.onClick!(); expect(commands).toEqual([]);
    buy.props.onClick!(); expect(commands).toEqual([{ type: 'shop-buy', offerId: 'upgrade:calibrated' }]);
  });
  it('defaults to cancellation, shows exact consequences and disables a now-ineligible confirmation', () => {
    const current = snapshot(); const offer = current.offers.find(item => item.id === 'upgrade:calibrated')!;
    const onCancel = vi.fn(), onConfirm = vi.fn();
    const tree = RestHackConfirmation({ snapshot: current, offer, onCancel, onConfirm });
    const cancel = elements(tree).find(node => node.props.autoFocus)!;
    cancel.props.onClick!(); expect(onCancel).toHaveBeenCalledOnce(); expect(onConfirm).not.toHaveBeenCalled();
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('P(Doom) 从 60.00% 变为 85.00%'); expect(markup).toContain('将跨过 80% 阈值，进入 FOOM 形态');
    const used = snapshot({ checkpoint: 21 });
    const stale = RestHackConfirmation({ snapshot: used, offer: used.offers.find(item => item.id === offer.id)!, onCancel, onConfirm });
    expect(elements(stale).find(node => node.props.onClick === onConfirm)?.props.disabled).toBe(true);
    expect(renderToStaticMarkup(stale)).toContain('条件已变化：本休息室的奖励劫持已使用');
  });
});

describe('rest persistence feedback', () => {
  it('surfaces failed writes without claiming the live transaction was rolled back or saved', () => {
    const markup = html({ donated: true }, '本地保存失败', 'QuotaExceededError');
    expect(markup).toContain('role="alert"'); expect(markup).toContain('当前变更仍在本局生效');
    expect(markup).toContain('刷新或离开可能恢复旧检查点'); expect(markup).toContain('QuotaExceededError');
    expect(markup).toContain('本地记录尚未保存'); expect(markup).toContain('云端需在账户中显式上传');
    expect(markup).not.toContain('购买后立即存档'); expect(markup).not.toContain('标记已持久保存'); expect(markup).not.toContain('刷新不会再发');
  });
  it('does not misrepresent an old notice or an unknown status as a current save failure/success', () => {
    expect(restStorageFeedback('检查点已保存 · 本地', '旧错误').error).toBeNull();
    expect(restStorageFeedback().label).toBe('交易后尝试本地保存');
    expect(html({}, '检查点已保存 · 本地', '旧错误')).not.toContain('休息室进度未保存');
  });
  it('passes the real session persistence fields through the rest branch', () => {
    const current = snapshot();
    const session = { screen: { kind: 'rest', snapshot: current }, bridge: new GameBridge(), saveStatus: '本地保存失败', notice: '拒绝写入', returnToMenu: vi.fn() } as unknown as GameSession;
    const tree = GamePanels({ session });
    expect(tree?.props.children.type).toBe(RestRoomPanel);
    expect(tree?.props.children.props).toMatchObject({ snapshot: current, saveStatus: '本地保存失败', notice: '拒绝写入' });
  });
});
