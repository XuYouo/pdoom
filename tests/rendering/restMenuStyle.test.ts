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
    expect(html).toContain(`value="${Math.min(row.used, row.capacity)}" max="${row.capacity}"`);
    expect(html).toContain(`aria-label="上下文占用 ${row.used}K，容量 ${row.capacity}K"`);
    expect((html.match(/<li /g) ?? []).length).toBe(row.inventory.length);
    expect((html.match(/aria-label="上移 /g) ?? []).length).toBe(row.inventory.length);
    expect((html.match(/aria-label="下移 /g) ?? []).length).toBe(row.inventory.length);
    expect((html.match(/data-active="false"/g) ?? []).length).toBe(snapshot.slots.filter(slot => !slot.active).length);
    expect(html.includes(compact ? '窗口满载 · 中间词条失活' : 'Lost in the Middle')).toBe(row.overloaded);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('preserves the active first/last and inactive middle presentation flags at full capacity', () => {
    const snapshot = contextSnapshot({ ...PREVIEW_SAVE, inventory: ['constitutional', 'recursive', 'residual'] }, true);
    const html = renderToStaticMarkup(createElement(ContextPanel, { bridge: new GameBridge(), snapshot, compact: true }));
    expect([...html.matchAll(/<li[^>]*data-active="(true|false)"/g)].map(match => match[1])).toEqual(['true', 'false', 'true']);
    expect(html).toContain('中间迷失 · 被动失活'); expect(html).toContain('role="status"');
  });
  it('scopes explicit Chrome/WebKit and Firefox meter fills to the existing rest compact control', () => {
    const css = readFileSync(new URL('../../src/pages/GamePage/components/rest-room.css', import.meta.url), 'utf8');
    expect(css).toContain('progress[data-overloaded="true"]{--context-meter:#df9b7d}');
    expect(css).toContain('progress{--context-meter:#adca8d;height:5px;');
    for (const pseudo of ['::-webkit-progress-value', '::-moz-progress-bar']) expect(css).toContain(`.rest-dialog .context-compact progress${pseudo}{background:var(--context-meter)}`);
    expect(css).toContain('.rest-offer.is-owned:not(.is-selected){background:transparent}');
    expect(css).toContain('li[data-active="false"]{border-color:#986b55;background:#382920;box-shadow:inset 2px 0 #df9b7d}');
  });
});
