import type { ChapterDefinition, MovingPlatform, Rect } from '../entities/model';

export const FURNACE_LIFTS: readonly MovingPlatform[] = [
  { id: 'nvda-lift', x: 560, y: 320, w: 120, h: 12, oneWay: true, protected: true, minY: 140, maxY: 320, periodMs: 8000, offsetMs: 0, dy: 0 },
];
export const FURNACE_HEAT_ZONES: readonly (Rect & { id: string })[] = [
  { id: 'gpu-rack-1', x: 970, y: 300, w: 130, h: 20 },
  { id: 'gpu-rack-2', x: 1660, y: 300, w: 145, h: 20 },
  { id: 'gpu-rack-3', x: 2110, y: 300, w: 130, h: 20 },
];
export const CHAPTER_THREE: ChapterDefinition = {
  stage: 3, name: '十万卡炼丹炉', english: '100,000 GPU CLUSTER', axis: 'horizontal', width: 3280, height: 360, floor: 320,
  arena: { x: 2520, y: 0, w: 750, h: 360, trigger: 2520 },
  checkpoints: [
    { id: 0, x: 72, y: 309, trigger: 72 },
    { id: 1, x: 1320, y: 309, trigger: 1320 },
    { id: 2, x: 2400, y: 309, trigger: 2400 },
  ],
  platforms: [
    { id: 'gpu-floor', x: 0, y: 320, w: 3280, h: 40 },
    { id: 'secret-room', x: 720, y: 105, w: 190, h: 12, oneWay: true, protected: true },
    { id: 'gpu-observer', x: 1420, y: 260, w: 120, h: 12, oneWay: true },
    { id: 'gpu-cache', x: 1880, y: 260, w: 120, h: 12, oneWay: true },
  ],
  enemies: [
    { id: 'chinchilla-1', kind: 'chinchilla', x: 920, y: 314, homeX: 920, homeY: 314, hp: 108, phase: 'idle', phaseUntil: 1000 },
    { id: 'chinchilla-2', kind: 'chinchilla', x: 1730, y: 314, homeX: 1730, homeY: 314, hp: 108, phase: 'idle', phaseUntil: 900 },
    { id: 'chinchilla-3', kind: 'chinchilla', x: 2180, y: 314, homeX: 2180, homeY: 314, hp: 108, phase: 'idle', phaseUntil: 1100 },
  ],
  pickups: [
    { id: 'gpu-entry-token', kind: 'token', x: 350, y: 302, amount: 16 },
    { id: 'gpu-secret-token', kind: 'token', x: 815, y: 87, amount: 45 },
    { id: 'gpu-secret-heal', kind: 'heal', x: 875, y: 87, amount: 25 },
    { id: 'gpu-heal-1', kind: 'heal', x: 1320, y: 302, amount: 35 },
    { id: 'gpu-cache-compute', kind: 'compute', x: 1940, y: 238, amount: 22 },
    { id: 'gpu-heal-2', kind: 'heal', x: 2400, y: 302, amount: 40 },
  ],
  signs: [
    { x: 60, y: 90, text: '03 / 100,000 GPU CLUSTER\n热区：冷却 → 预警 → 高温\n小龙猫体小血厚，提前瞄准' },
    { x: 470, y: 70, text: 'NVDA K线是真移动平台\n靠右站稳，上升时跃入右上隐藏房' },
    { x: 1230, y: 85, text: '安全检查点\n第三章已禁止补捐 · 因果不可重写' },
    { x: 2050, y: 80, text: '热区有节拍 · 龙猫有密集弹幕\nQ穿GPU弹幕可获同类免疫' },
    { x: 2430, y: 35, text: 'BASILISK / 先穿过，再在锁向预警时Q\n只沿真实两秒轨迹，不会自动传送身后' },
    { x: 2770, y: 65, text: '前方激光 + 面对蛇怪 = 石化\n背对或身后安全 · Q可解石化\n前面有护甲，背后输出更高' },
  ],
  boss: { kind: 'basilisk', name: 'Roko’s Basilisk · 因果律蛇怪', x: 2890, y: 280, maxHp: 540 },
};
