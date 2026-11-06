import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { GameBridge } from '../../src/pages/GamePage/game/bridge';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { enterRest, restSnapshot, applyProgressionCommand } from '../../src/pages/GamePage/game/systems/shop';
import { RestRoomPanel } from '../../src/pages/GamePage/components/RestRoomPanel';
const save = () => ({ ...createRun('cafe0111-8b37-4000-8000-000000000034', 42), hp: 90, doom: 60, tokens: 200 });
function markup(world: ReturnType<typeof createWorld>) {
  const bridge = new GameBridge(); const send = vi.spyOn(bridge, 'send'); const before = JSON.stringify(world);
  const html = renderToStaticMarkup(createElement(RestRoomPanel, { bridge, snapshot: restSnapshot(world)! }));
  expect(send).not.toHaveBeenCalled(); expect(JSON.stringify(world)).toBe(before); return html;
}
it.each([{ hp: 90, tokens: 200, pose: 'approved', badge: '+24', label: '赞许' },
  { hp: 55, tokens: 200, pose: 'disapproved', badge: '+12', label: '否定' },
  { hp: 90, tokens: 1000000, pose: 'approved', badge: '+0', label: '赞许' }])('shows witnessed $pose and credited $badge, not current balance', item => {
  const world = createWorld({ ...save(), hp: item.hp, tokens: item.tokens }); enterRest(world, 1);
  world.rest!.message = 'display copy says a different result'; const html = markup(world);
  expect(html).toContain(`data-rater-pose="${item.pose}"`); expect(html).toContain(`>${item.badge}</span>`);
  expect(html).toContain(`人类标注员：${item.label}`); expect(html).toContain('aria-label="不再交易，继续前进"');
  expect(html).toContain('role="img"');
  expect(html).toContain('class="rest-station-portrait"');
  expect(html).toContain(`background-position:${item.pose === 'approved' ? '-72px' : '-136px'} -4px`);
  expect(html).not.toContain('>HR<');
});
it.each([11, 12, 21, 22])('restored checkpoint%s exposes only settled/hacked facts', checkpoint => {
  const html = markup(createWorld({ ...save(), checkpoint }));
  expect(html).toContain(`data-rater-pose="${checkpoint >= 20 ? 'hacked' : 'neutral'}"`);
  expect(html).toContain(checkpoint >= 20 ? '>劫持</span>' : '>已结算</span>');
  expect(html).not.toContain('本次入站实际到账');
});
it('repair keeps disapproved receipt and the badge never issues a command', () => {
  const world = createWorld({ ...save(), hp: 55 }); enterRest(world, 1);
  const repaired = applyProgressionCommand(world, { type: 'shop-buy', offerId: 'repair' }); const html = markup(repaired);
  expect(repaired.save.hp).toBe(90); expect(html).toContain('data-rater-pose="disapproved"'); expect(html).toContain('>+12</span>');
});
it('a genuine successful hack overrides the entry verdict in the presentation', () => {
  const world = createWorld({ ...save(), inventory: ['constitutional', 'recursive', 'residual'] }); enterRest(world, 1);
  const hacked = applyProgressionCommand(world, { type: 'shop-hack', offerId: 'upgrade:calibrated' });
  const html = markup(hacked); expect(html).toContain('data-rater-pose="hacked"'); expect(html).toContain('本室奖励已劫持');
  expect(html).not.toContain('本次入站实际到账');
});
