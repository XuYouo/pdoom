import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContextPanel } from '../../src/pages/GamePage/components/ContextPanel';
import { GameBridge } from '../../src/pages/GamePage/game/bridge';
import { PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';
import { BASE_CONTEXT_K, RELICS } from '../../src/pages/GamePage/game/data/relics';
import { contextSnapshot } from '../../src/pages/GamePage/game/systems/context';
import type { GameSaveData, RelicId } from '../../src/objects/game/GameSaveData';

const save = (inventory: RelicId[], patch: Partial<GameSaveData> = {}): GameSaveData => ({ ...PREVIEW_SAVE, inventory, ...patch });
const render = (data: GameSaveData, props: { compact?: boolean; editable?: boolean; coreEditable?: boolean } = {}) => {
  const snapshot = contextSnapshot(data, props.coreEditable ?? true);
  return renderToStaticMarkup(createElement(ContextPanel, { bridge: new GameBridge(), snapshot, ...props }));
};

describe('context workbench presentation', () => {
  it('shows the real base reservation and remaining capacity in an empty loadout', () => {
    const html = render(save([]));
    expect(html).toContain('8K / 32K');
    expect(html).toContain('aria-valuetext="基础技能 8K，遗物 0K；剩余 24K"');
    expect(html).toContain('context-segment--base');
    expect(html).not.toContain('class="context-segment context-segment--relic"');
    expect(html).toContain('尚未装备遗物');
    expect(html).toContain(`当前只有基础技能的 ${BASE_CONTEXT_K}K 占用`);
    expect(html).not.toContain('class="context-overload"');
    expect(html).not.toContain('aria-label="上移 ');
  });
  it('treats exact capacity as overloaded and keeps inactive capacity in the total', () => {
    const html = render(save(['constitutional', 'recursive', 'residual']));
    expect(html).toContain('32K / 32K');
    expect(html).toContain('窗口满载 · 1 个词条失活');
    expect(html).toContain('中间词条失活，仍占容量。每 4 发攻击，有 1 发变为无伤 Lisp 括号。');
    expect(html).toContain('aria-valuetext="基础技能 8K，遗物 24K；剩余 0K"');
    expect(html).toMatch(/data-context-relic="recursive" data-active="false"/);
    expect(html).toContain('占用达到容量时触发 Lost in the Middle');
    expect(html).toContain('排序改变失活位置，不能减少占用');
  });
  it('reports real overflow and the active Lisp interval without assuming every overload is identical', () => {
    const html = render(save(['lisp', 'constitutional', 'recursive', 'residual']));
    expect(html).toContain('38K / 32K');
    expect(html).toContain('窗口过载 · 2 个词条失活');
    expect(html).toContain('aria-valuemax="32" aria-valuenow="32"');
    expect(html).toContain('aria-valuetext="基础技能 8K，遗物 30K；超出容量 6K"');
    expect(html).toContain('context-capacity-limit');
    expect(html).toContain('每 8 发攻击，有 1 发变为无伤 Lisp 括号');
  });
  it('shows expanded capacity and unsuppressed effects from the actual snapshot', () => {
    const html = render(save(['constitutional', 'recursive', 'residual'], { upgrades: ['expanded'] }));
    expect(html).toContain('32K / 128K');
    expect(html).toContain('基础技能 8K，遗物 24K；剩余 96K');
    expect(html).not.toContain('class="context-overload"');
    expect(html).not.toContain('data-active="false"');
  });
  it('preserves each real relic name, cost, description and icon in order without mutating a snapshot', () => {
    const inventory = Object.keys(RELICS) as RelicId[];
    const snapshot = contextSnapshot(save(inventory), true);
    const before = JSON.stringify(snapshot);
    const html = renderToStaticMarkup(createElement(ContextPanel, { bridge: new GameBridge(), snapshot }));
    expect(JSON.stringify(snapshot)).toBe(before);
    expect((html.match(/class="rest-item-icon rest-item-icon--relic"/g) ?? []).length).toBe(inventory.length);
    let previousPosition = -1;
    for (const slot of snapshot.slots) {
      const position = html.indexOf(`data-context-relic="${slot.id}"`);
      expect(position).toBeGreaterThan(previousPosition); previousPosition = position;
      expect(html).toContain(slot.name);
      expect(html).toContain(`${slot.costK}<small>K</small>`);
      expect(html).toContain(slot.description);
    }
  });
  it.each([{ coreEditable: false }, { editable: false }])('never lets presentation override the engine edit boundary: %j', props => {
    const html = render(save(['constitutional', 'recursive', 'residual']), props);
    expect(html).toContain('只能在安全休息室调整顺序，战斗中只读。');
    expect((html.match(/disabled=""/g) ?? []).length).toBe(6);
    expect(html).not.toContain('>可调整顺序<');
  });
  it('keeps complete capacity rules and effects in the compact view with one initially silent live region', () => {
    const html = render(save(['constitutional', 'recursive', 'residual']), { compact: true });
    expect(html).toContain('class="context-panel context-compact"');
    expect(html).toContain('窗口满载 · 1 个词条失活');
    expect(html).toContain('中间迷失 · 被动失活');
    expect(html).toContain('不改变购买货币 TOK');
    expect((html.match(/<details class="context-slot-details">/g) ?? []).length).toBe(3);
    expect(html).toContain(RELICS.recursive.description);
    expect((html.match(/role="status"/g) ?? []).length).toBe(1);
    expect(html).toContain('class="context-reorder-feedback" role="status" aria-live="polite" aria-atomic="true"></p>');
  });
});
