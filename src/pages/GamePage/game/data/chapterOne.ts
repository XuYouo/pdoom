import type { GameSaveData } from '../../../../objects/game/GameSaveData';
import type { ChapterDefinition, Enemy, Pickup, Platform } from '../entities/model';
import { TUNING } from './tuning';
export { TUNING } from './tuning';

/** Temporary gameplay blockout. Replace only the view with reviewed Aseprite assets later. */
export const CHAPTER = {
  stage: 1, name: '中文房间与迷幻森林', width: 2880, height: 360,
  floor: 320, arenaLeft: 2240, arenaRight: 2870,
  checkpoints: [{ id: 0, x: 72, y: 307 }, { id: 1, x: 1380, y: 307 }, { id: 2, x: 2180, y: 307 }],
} as const;

const ground = (id: string, x: number, w: number): Platform => ({ id, x, y: CHAPTER.floor, w, h: 40 });
const ledge = (id: string, x: number, y: number, w: number, fragile = false): Platform => ({ id, x, y, w, h: 12, oneWay: true, fragile });
export const PLATFORMS: readonly Platform[] = [
  ground('entry', 0, 640), ground('dictionary-hall', 740, 470),
  ground('forest', 1310, 440), ground('approach-arena', 1850, 1030),
  ledge('learn-jump', 240, 260, 110), ledge('upper-entry', 420, 202, 120),
  ledge('first-crossing', 590, 254, 130), ledge('rater-path', 830, 252, 140),
  ledge('compute-branch', 1030, 192, 130, true), ledge('forest-crossing', 1180, 258, 145),
  ledge('insight-branch', 1450, 254, 110), ledge('shroom-canopy', 1610, 196, 120, true),
  ledge('second-crossing', 1700, 258, 160), ledge('last-compute', 1940, 252, 135, true),
  ledge('arena-left', 2320, 250, 115), ledge('arena-right', 2650, 250, 115),
];
export const ENEMIES: readonly Enemy[] = [
  { id: 'parrot-1', kind: 'parrot', x: 520, y: 306, homeX: 520, homeY: 306, hp: 30, phase: 'idle', phaseUntil: 900 },
  { id: 'repeater-1', kind: 'repeater', x: 950, y: 306, homeX: 950, homeY: 306, hp: 42, phase: 'idle', phaseUntil: 1100 },
  { id: 'parrot-2', kind: 'parrot', x: 1120, y: 178, homeX: 1120, homeY: 178, hp: 30, phase: 'idle', phaseUntil: 700 },
  { id: 'deceiver-1', kind: 'deceiver', x: 1510, y: 241, homeX: 1510, homeY: 241, hp: 65, phase: 'idle', phaseUntil: 1000 },
  { id: 'repeater-2', kind: 'repeater', x: 1690, y: 306, homeX: 1690, homeY: 306, hp: 42, phase: 'idle', phaseUntil: 1200 },
  { id: 'parrot-3', kind: 'parrot', x: 2015, y: 306, homeX: 2015, homeY: 306, hp: 30, phase: 'idle', phaseUntil: 800 },
];
export const PICKUPS: readonly Pickup[] = [
  { id: 'token-1', kind: 'token', x: 290, y: 240, amount: 12 },
  { id: 'compute-1', kind: 'compute', x: 477, y: 180, amount: 28 },
  { id: 'token-2', kind: 'token', x: 685, y: 233, amount: 16 },
  { id: 'compute-2', kind: 'compute', x: 1065, y: 172, amount: 28 },
  { id: 'heal-1', kind: 'heal', x: 1380, y: 298, amount: 28 },
  { id: 'shroom-1', kind: 'mushroom', x: 1668, y: 174, amount: 28 },
  { id: 'token-3', kind: 'token', x: 1785, y: 237, amount: 18 },
  { id: 'compute-3', kind: 'compute', x: 2000, y: 231, amount: 28 },
  { id: 'heal-2', kind: 'heal', x: 2180, y: 298, amount: 40 },
];
export const SIGNS = [
  { x: 65, y: 215, text: '01 / THE CHINESE ROOM\nA D  移动    SPACE  跳跃\nJ / 鼠标  射击' },
  { x: 540, y: 125, text: 'SHIFT 冲刺越过断层\n紫色算力：自愿承担风险 ↑' },
  { x: 875, y: 90, text: 'Q 回溯过去 2 秒\n穿过弹幕 → 同类型免疫 10 秒' },
  { x: 1360, y: 100, text: '检查点 / E 机械可解释性\n露出的核心：精准命中即击杀' },
  { x: 1910, y: 125, text: 'GATO 在前方 →\n保存点 · 回复生命' },
  { x: 2300, y: 75, text: 'GATO / 多模态缝合怪\n挡板 → 机械臂 → 字幕弹幕' },
] as const;

export const CHAPTER_ONE: ChapterDefinition = {
  ...CHAPTER, axis: 'horizontal', english: 'THE CHINESE ROOM',
  arena: { x: CHAPTER.arenaLeft, y: 0, w: CHAPTER.arenaRight - CHAPTER.arenaLeft, h: CHAPTER.height, trigger: CHAPTER.arenaLeft },
  checkpoints: CHAPTER.checkpoints.map(checkpoint => ({ ...checkpoint, trigger: checkpoint.x })),
  platforms: PLATFORMS, enemies: ENEMIES, pickups: PICKUPS, signs: SIGNS,
  boss: { kind: 'gato', name: 'Gato · 多模态缝合怪', x: 2720, y: 270, maxHp: TUNING.bossHp },
};

export const PREVIEW_SAVE: GameSaveData = {
  schemaVersion: 1, runId: 'preview-only', seed: 1, stage: 1, checkpoint: 0,
  hp: 100, doom: 8, tokens: 0, score: 0, elapsedMs: 0,
  inventory: ['constitutional'], upgrades: [], donated: false,
  actionCounts: { shots: 0, dashes: 0, rewinds: 0, insights: 0 },
};
