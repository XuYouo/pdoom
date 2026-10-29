import type { ChapterDefinition, StormZone } from '../entities/model';

export const OMEGA_ROOM = {
  door: { x: 2480, y: 224, w: 40, h: 96 },
  chair: { x: 2800, y: 300 },
  glass: { x: 3001, y: 222, w: 48, h: 98 },
} as const;
export const OMEGA_STORMS: readonly Omit<StormZone, 'phase' | 'phaseUntil'>[] = [
  { id: 'omega-storm-0', x: 440, y: 296, w: 170, h: 24, direction: -1 },
  { id: 'omega-storm-1', x: 1190, y: 296, w: 180, h: 24, direction: 1 },
  { id: 'omega-storm-2', x: 2070, y: 296, w: 210, h: 24, direction: -1 },
];
export const CHAPTER_FIVE: ChapterDefinition = {
  stage: 5, name: '欧米茄点与那把椅子', english: 'THE OMEGA POINT', axis: 'horizontal', width: 3200, height: 360, floor: 320,
  arena: { x: 2540, y: 0, w: 640, h: 360, trigger: 2540 },
  checkpoints: [{ id: 0, x: 72, y: 309, trigger: 72 }, { id: 1, x: 960, y: 309, trigger: 960 }, { id: 2, x: 1920, y: 309, trigger: 1920 }],
  platforms: [
    { id: 'omega-floor-0', x: 0, y: 320, w: 680, h: 40, protected: true },
    { id: 'omega-floor-1', x: 740, y: 320, w: 800, h: 40, protected: true },
    { id: 'omega-floor-2', x: 1600, y: 320, w: 1600, h: 40, protected: true },
    { id: 'omega-observer-0', x: 400, y: 260, w: 120, h: 12, oneWay: true },
    { id: 'omega-observer-1', x: 1200, y: 260, w: 130, h: 12, oneWay: true },
    { id: 'omega-observer-2', x: 2080, y: 260, w: 140, h: 12, oneWay: true },
  ],
  enemies: [
    { id: 'omega-repeater', kind: 'repeater', x: 820, y: 308, homeX: 820, homeY: 308, hp: 36, phase: 'idle', phaseUntil: 800 },
    { id: 'omega-deceiver', kind: 'deceiver', x: 1710, y: 308, homeX: 1710, homeY: 308, hp: 36, phase: 'idle', phaseUntil: 900 },
  ],
  pickups: [
    { id: 'omega-heal-1', kind: 'heal', x: 960, y: 302, amount: 30 },
    { id: 'omega-heal-2', kind: 'heal', x: 1920, y: 302, amount: 40 },
    { id: 'omega-token-0', kind: 'token', x: 460, y: 242, amount: 18 },
    { id: 'omega-token-1', kind: 'token', x: 2140, y: 242, amount: 24 },
  ],
  signs: [
    { x: 32, y: 65, text: '05 / OMEGA POINT\n穿过1e30 FLOPs风暴 · R只属于上一章\n成功使用的J / 冲刺 / Q / E正被观察' },
    { x: 930, y: 75, text: '镜子读取真实动作频率与有效Build\n同一进程保留实际连招\n旧档只有计数，不会伪造历史顺序' },
    { x: 1870, y: 65, text: '最后的休息点\n门后没有旧神 · 只有椅子和镜子\n靠近倒影，才会看见Ilya看到的你' },
  ],
  boss: { kind: 'mirror', name: '完全体 AGI · 你的镜像', x: 3025, y: 309, maxHp: 360 },
};
