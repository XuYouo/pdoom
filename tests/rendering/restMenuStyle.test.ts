import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContextPanel } from '../../src/pages/GamePage/components/ContextPanel';
import { GameBridge } from '../../src/pages/GamePage/game/bridge';
import { PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';
import { contextSnapshot } from '../../src/pages/GamePage/game/systems/context';
import type { RelicId } from '../../src/objects/game/GameSaveData';

const cases: { name: string; inventory: RelicId[]; used: number; capacity: number; overloaded: boolean }[] = [
  { name: 'below', inventory: ['constitutional'], used: 14, capacity: 32, overloaded: false },
  { name: 'full', inventory: ['constitutional', 'recursive', 'residual'], used: 32, capacity: 32, overloaded: true },
  { name: 'overflow', inventory: ['constitutional', 'recursive', 'residual', 'temperature'], used: 42, capacity: 32, overloaded: true },
  { name: 'expanded', inventory: ['constitutional', 'recursive', 'residual', 'temperature', 'context-expansion'], used: 54, capacity: 128, overloaded: false },
];
describe('rest hierarchy presentation only; SSR/CSS contracts not actual pixels', () => {
  for (const compact of [false, true]) it.each(cases)(`projects $name DTO state without changing progress or controls (compact=${compact})`, row => {
    const snapshot = contextSnapshot({ ...PREVIEW_SAVE, inventory: row.inventory }, true), before = JSON.stringify(snapshot);
    expect(snapshot.usedK).toBe(row.used); expect(snapshot.capacityK).toBe(row.capacity); expect(snapshot.overloaded).toBe(row.overloaded);
    const html = renderToStaticMarkup(createElement(ContextPanel, { bridge: new GameBridge(), snapshot, compact }));
    expect(html).toContain(`data-overloaded="${row.overloaded}"`);
    expect(html).toContain('role="meter"');
    expect(html).toContain(`aria-valuemin="0" aria-valuemax="${row.capacity}" aria-valuenow="${Math.min(row.used, row.capacity)}"`);
    expect(html).toContain(`aria-label="上下文占用 ${row.used}K，容量 ${row.capacity}K"`);
    expect(html).toContain(row.used > row.capacity ? `超出容量 ${row.used - row.capacity}K` : `剩余 ${row.capacity - row.used}K`);
    expect((html.match(/<li /g) ?? []).length).toBe(row.inventory.length);
    expect((html.match(/aria-label="上移 /g) ?? []).length).toBe(row.inventory.length);
    expect((html.match(/aria-label="下移 /g) ?? []).length).toBe(row.inventory.length);
    const inactive = snapshot.slots.filter(slot => !slot.active).length;
    expect((html.match(/<li[^>]*data-active="false"/g) ?? []).length).toBe(inactive);
    expect((html.match(/class="context-segment context-segment--relic" data-active="false"/g) ?? []).length).toBe(inactive);
    expect(html.includes('class="context-overload"')).toBe(row.overloaded);
    if (row.overloaded) {
      expect(html).toContain(`${row.used > row.capacity ? '窗口过载' : '窗口满载'} · ${inactive} 个词条失活`);
      expect(html).toContain('中间词条失活，仍占容量。');
    }
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('preserves the active first/last and inactive middle presentation flags at full capacity', () => {
    const snapshot = contextSnapshot({ ...PREVIEW_SAVE, inventory: ['constitutional', 'recursive', 'residual'] }, true);
    const html = renderToStaticMarkup(createElement(ContextPanel, { bridge: new GameBridge(), snapshot, compact: true }));
    expect([...html.matchAll(/<li[^>]*data-active="(true|false)"/g)].map(match => match[1])).toEqual(['true', 'false', 'true']);
    expect(html).toContain('中间迷失 · 被动失活'); expect(html).toContain('role="status"');
  });
  it('scopes the browser-independent segmented meter and inactive rows while preserving subdued owned offers', () => {
    const css = readFileSync(new URL('../../src/pages/GamePage/components/context-panel.css', import.meta.url), 'utf8');
    const restCss = readFileSync(new URL('../../src/pages/GamePage/components/rest-room.css', import.meta.url), 'utf8');
    expect(css).toContain('.game-shell .context-panel .context-capacity-heading strong[data-overloaded=true]{color:#e7ae8c}');
    expect(css).toContain('.game-shell .context-panel.context-compact .context-capacity-track{height:9px}');
    expect(css).toContain('.game-shell .context-panel .context-segment--base{background:#809e83}');
    expect(css).toContain('.game-shell .context-panel .context-segment--relic{background:#c9a477}');
    expect(css).toContain('.game-shell .context-panel .context-segment--relic[data-active=false]{background:repeating-linear-gradient(');
    expect(restCss).toContain('.rest-offer.is-owned:not(.is-selected){background:transparent}');
    expect(css).toContain('.game-shell .context-panel .context-slot[data-active=false]{background:#b4785a09;border-color:#b4785a40;box-shadow:inset 2px 0 #b4785a;');
  });
});
