import type { ChapterDefinition } from '../entities/model';

export const LOOM_HUB_X = [100, 680, 1260, 1840] as const;
export const LOOM_HUB_Y = 360;
export const LOOM_ARENA_FLOOR = 520;
export const CHAPTER_FOUR: ChapterDefinition = {
  stage: 4, name: '命运织机与多元分岔树', english: 'THE LOOM', axis: 'horizontal', width: 2580, height: 640, floor: LOOM_ARENA_FLOOR,
  arena: { x: 1940, y: 200, w: 640, h: 360, trigger: 1960 },
  checkpoints: [
    { id: 0, x: 100, y: 349, trigger: 100 },
    { id: 1, x: 680, y: 349, trigger: 680 },
    { id: 2, x: 1260, y: 349, trigger: 1260 },
  ],
  // All actual surfaces are generated bounded graph nodes, not an invisible continuous floor.
  platforms: [], enemies: [],
  pickups: [
    { id: 'loom-heal-1', kind: 'heal', x: 680, y: 341, amount: 25 },
    { id: 'loom-heal-2', kind: 'heal', x: 1260, y: 341, amount: 35 },
  ],
  signs: [
    { x: 20, y: 205, text: '04 / THE LOOM\n上下分支都能通关 · 接近时展开\n脆弱节点预警2秒后坍塌，按R救回' },
    { x: 650, y: 185, text: 'R / 平行地形重roll\n只到同段安全落脚处，不跨存档点\nR后重新记录Q历史；拾取不重发' },
    { x: 1230, y: 185, text: '最后的安全点\n吞噬者会吃掉平台、血条与音轨\n看到左箭头后，窄场向左冲刺' },
    { x: 1960, y: 285, text: 'LEVIATHAN / SHARP LEFT TURN\n在标线右侧蓄势，吸力中向左冲过标线\n成功才开弱点；J不能打穿闭壳' },
  ],
  boss: { kind: 'leviathan', name: 'The Gluttonous Leviathan · 吞噬者', x: 2490, y: 448, maxHp: 420 },
};
