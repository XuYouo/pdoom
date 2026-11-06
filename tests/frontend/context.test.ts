import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContextPanel } from '../../src/pages/GamePage/components/ContextPanel';
import { RestRoomPanel } from '../../src/pages/GamePage/components/RestRoomPanel';
import { GameBridge } from '../../src/pages/GamePage/game/bridge';
import { PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';
import { contextSnapshot } from '../../src/pages/GamePage/game/systems/context';
import { restSnapshot } from '../../src/pages/GamePage/game/systems/shop';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';

describe('context and rest-room React contract', () => {
  it('preserves readable label/value text for a cloud-restored HP snapshot', () => {
    const snapshot = restSnapshot(createWorld({ ...PREVIEW_SAVE, stage: 4, checkpoint: 12, hp: 76, tokens: 153 }))!;
    const html = renderToStaticMarkup(createElement(RestRoomPanel, { bridge: new GameBridge(), snapshot }));
    expect(html.replace(/<[^>]+>/g, '')).toContain('完整度 76/100');
    expect(html).toContain('153 TOK');
  });
  it('renders capacity, explicit disabled-middle state and keyboard reorder controls', () => {
    const snapshot = contextSnapshot({ ...PREVIEW_SAVE, inventory: ['constitutional', 'recursive', 'residual'] }, true);
    const html = renderToStaticMarkup(createElement(ContextPanel, { bridge: new GameBridge(), snapshot }));
    expect(html).toContain('32K / 32K');
    expect(html).toContain('Lost in the Middle');
    expect(html).toContain('中间迷失 · 被动失活');
    expect(html).toContain('aria-label="上移 递归自升级"');
    expect(html).toContain('aria-label="下移 残差连接" disabled=""');
  });
  it('disables reordering outside a rest room with a visible explanation', () => {
    const html = renderToStaticMarkup(createElement(ContextPanel, { bridge: new GameBridge(), snapshot: contextSnapshot(PREVIEW_SAVE) }));
    expect(html).toContain('只能在安全休息室调整顺序');
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2);
  });
  it('always offers continue-without-buying and labels disabled purchases/hacks with reasons', () => {
    const world = createWorld({ ...PREVIEW_SAVE, checkpoint: 11, tokens: 0 });
    const snapshot = restSnapshot(world)!;
    const html = renderToStaticMarkup(createElement(RestRoomPanel, { bridge: new GameBridge(), snapshot }));
    expect(html).toContain('不再交易，继续前进');
    expect(html).toContain('世界与技能计时已冻结');
    expect(html).toContain('aria-label="购买 递归自升级"');
    expect(html).toContain('aria-label="奖励劫持 递归自升级"');
    expect(html).toContain('需要 32 TOK，当前 0 TOK');
    expect(html).toContain('当前未满足劫持条件');
    expect(html).toContain('role="status"');
  });
  it('emits detached save/context/offer DTOs, not mutable game state references', () => {
    const world = createWorld({ ...PREVIEW_SAVE, checkpoint: 11 });
    const snapshot = restSnapshot(world)!;
    snapshot.save.inventory.push('temperature');
    snapshot.save.tokens = 900;
    snapshot.context.slots[0].active = false;
    expect(world.save.inventory).toEqual(['constitutional']);
    expect(world.save.tokens).toBe(0);
    expect(contextSnapshot(world.save).slots[0].active).toBe(true);
  });
  it('keeps every purchase and hack reachable in the compact menu, not only the selected item', () => {
    const snapshot = restSnapshot(createWorld({ ...PREVIEW_SAVE, checkpoint: 11, tokens: 76 }))!;
    const html = renderToStaticMarkup(createElement(RestRoomPanel, { bridge: new GameBridge(), snapshot, onReturnToMenu: () => undefined }));
    expect((html.match(/aria-label="购买 /g) ?? []).length).toBe(snapshot.offers.length);
    expect((html.match(/aria-label="奖励劫持 /g) ?? []).length).toBe(snapshot.offers.filter(o => o.kind === 'relic' || o.kind === 'upgrade').length);
    expect((html.match(/aria-label="不再交易，继续前进"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-label="返回终端并保留检查点"/g) ?? []).length).toBe(1);
    expect(html).toContain('class="rest-footer"');
  });
  it('defaults long rest rules to a closed disclosure and uses the compact equipped list', () => {
    const snapshot = restSnapshot(createWorld({ ...PREVIEW_SAVE, checkpoint: 11 }))!;
    const html = renderToStaticMarkup(createElement(RestRoomPanel, { bridge: new GameBridge(), snapshot }));
    expect(html).toContain('<details class="rest-rules">');
    expect(html).toContain('class="context-compact"');
    expect(html).toContain('aria-label="已装备词条顺序"');
    expect(html).toContain(snapshot.hackRequirement.replace('>','&gt;'));
    expect(html).not.toContain('人类标注员工作台');
  });
  it('compact context preserves overload, inactive-middle and reorder semantics', () => {
    const snapshot = contextSnapshot({ ...PREVIEW_SAVE, inventory: ['constitutional', 'recursive', 'residual'] }, true);
    const html = renderToStaticMarkup(createElement(ContextPanel, { bridge: new GameBridge(), snapshot, compact: true }));
    expect(html).toContain('窗口满载 · 中间词条失活');
    expect(html).toContain('中间迷失 · 被动失活');
    expect(html).toContain('32K / 32K');
    expect(html).toContain('aria-label="上移 递归自升级"');
    expect(html).toContain('<details class="context-slot-details">');
  });
  it('compact does not override the Core read-only reorder boundary', () => {
    const snapshot = contextSnapshot(PREVIEW_SAVE);
    const html = renderToStaticMarkup(createElement(ContextPanel, { bridge: new GameBridge(), snapshot, compact: true }));
    expect(html).toContain('只能在安全休息室调整顺序');
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2);
  });
});
