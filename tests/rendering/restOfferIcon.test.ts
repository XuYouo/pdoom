import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RestOfferIcon } from '../../src/pages/GamePage/components/RestOfferIcon';
import { RestRoomPanel } from '../../src/pages/GamePage/components/RestRoomPanel';
import { GameBridge, type ShopOfferSnapshot } from '../../src/pages/GamePage/game/bridge';
import { RELICS } from '../../src/pages/GamePage/game/data/relics';
import { PREVIEW_SAVE } from '../../src/pages/GamePage/game/data/chapterOne';
import { restSnapshot } from '../../src/pages/GamePage/game/systems/shop';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';

const ids = Object.keys(RELICS).map(id => `relic:${id}`);
const markup = (id: string, kind: ShopOfferSnapshot['kind'] = 'relic') => renderToStaticMarkup(createElement(RestOfferIcon, { id, kind }));
const path = (html: string) => /<path d="([^"]+)"/.exec(html)![1];
describe('rest offer SVG presentation contract, not raster/recognition proof', () => {
  it.each(ids)('keeps %s in the existing decorative16x16 control with no extra focus or behavior', id => {
    const html = markup(id);
    expect(html).toContain('viewBox="0 0 16 16"'); expect(html).toContain('aria-hidden="true"'); expect(html).toContain('focusable="false"');
    expect(html).toContain('class="rest-item-icon rest-item-icon--relic"'); expect(html).toContain('fill-rule="evenodd"');
    expect(path(html)).toMatch(/^[MmHhVvZz0-9 .-]+$/); expect(html).not.toMatch(/tabindex|role=|<title|<image|<animate|href=|style=/i);
  });
  it('gives the complete seven-ID catalog seven distinct nonfallback geometries', () => {
    expect(ids).toHaveLength(7); const shapes = ids.map(id => path(markup(id)));
    expect(new Set(shapes).size).toBe(7); expect(shapes).not.toContain(path(markup('unknown')));
  });
  it.each(['', 'unknown', 'temperature', 'relic:unknown', 'relic:temperature-extra', '__proto__', 'constructor', 'toString', 'relic:__proto__'])('safely falls back for %j without prefix/name guessing', id => {
    expect(path(markup(id))).toBe('M7 1h2v3h3v3h3v2h-3v3H9v3H7v-3H4V9H1V7h3V4h3z');
  });
  it.each([
    ['repair', 'M6 1h4v5h5v4h-5v5H6v-5H1V6h5z'],
    ['upgrade', 'M7 1h2v2h2v2h2v2h-3v3H6V7H3V5h2V3h2zM3 12h10v3H3z'],
    ['donation', 'M6 1h4v2H6zM7 4h2v3H7zM2 7h12v8H2zM5 9v2h6V9z'],
  ] as const)('retains the existing %s category even if an unrelated id matches a relic', (kind, expected) => {
    expect(path(markup('relic:constitutional', kind))).toBe(expected); expect(markup('anything', kind)).toContain(`rest-item-icon--${kind}`);
  });
  it('uses only stable id and kind, not price, translated label, owned state or array position', () => {
    const offer = Object.freeze({ id: 'relic:temperature', kind: 'relic' as const, name: 'renamed', owned: true, price: 999, canBuy: false });
    expect(renderToStaticMarkup(createElement(RestOfferIcon, offer))).toBe(markup(offer.id));
    expect(offer).toEqual({ id: 'relic:temperature', kind: 'relic', name: 'renamed', owned: true, price: 999, canBuy: false });
  });
  it('uses the same helper for every actual offer and the initial selected detail without mutating the DTO', () => {
    const snapshot = restSnapshot(createWorld({ ...PREVIEW_SAVE, checkpoint: 11, hp: 60, tokens: 200 }))!;
    const before = JSON.stringify(snapshot), html = renderToStaticMarkup(createElement(RestRoomPanel, { bridge: new GameBridge(), snapshot }));
    const svgs = [...html.matchAll(/<svg[^>]*class="rest-item-icon [^"]+"[^>]*>.*?<\/svg>/g)].map(match => path(match[0]));
    expect(svgs).toHaveLength(snapshot.offers.length + 1);
    expect(svgs.slice(0, -1)).toEqual(snapshot.offers.map(offer => path(markup(offer.id, offer.kind))));
    const selected = snapshot.offers.find(offer => !offer.owned && offer.canBuy) ?? snapshot.offers[0];
    expect(svgs[svgs.length - 1]).toBe(path(markup(selected.id, selected.kind))); expect(JSON.stringify(snapshot)).toBe(before);
  });
});
