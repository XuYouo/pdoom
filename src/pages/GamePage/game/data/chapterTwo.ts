import { PLAYER_HEIGHT, type ChapterDefinition, type Platform } from '../entities/model';

const ARENA_FLOOR = 300;

/** Authored 55px steps: jump apex is ~80px at the existing 440/1180 tuning. */
const steps: Platform[] = Array.from({ length: 27 }, (_, index) => {
  const step = index + 1;
  return { id: `factory-step-${step}`, x: step % 2 ? 150 : 310, y: 1840 - step * 55, w: 180, h: 12, oneWay: true, protected: true };
});
const branches: Platform[] = [4, 8, 13, 17, 23, 26].map((step, index) => ({
  id: `factory-side-${index + 1}`, x: index % 2 ? 505 : 30, y: 1840 - step * 55, w: 100, h: 12, oneWay: true,
}));
export const CHAPTER_TWO: ChapterDefinition = {
  stage: 2, name: '回形针无尽工厂', english: 'PAPERCLIP FACTORY', axis: 'vertical', width: 640, height: 2040, floor: ARENA_FLOOR,
  // A short hop below the upper floor must not start the boss or lock the camera away from the player.
  arena: { x: 0, y: 0, w: 640, h: 360, trigger: ARENA_FLOOR - PLAYER_HEIGHT / 2 },
  checkpoints: [
    { id: 0, x: 310, y: 1829, trigger: 1829 },
    { id: 1, x: 390, y: 1279, trigger: 1282 },
    { id: 2, x: 390, y: 729, trigger: 732 },
  ],
  platforms: [
    { id: 'factory-start', x: 0, y: 1840, w: 640, h: 28, protected: true },
    ...steps, ...branches,
    { id: 'factory-arena', x: 0, y: ARENA_FLOOR, w: 640, h: 24, oneWay: true, protected: true },
    { id: 'factory-arena-left', x: 100, y: 240, w: 120, h: 12, oneWay: true, protected: true },
    { id: 'factory-arena-right', x: 420, y: 240, w: 120, h: 12, oneWay: true, protected: true },
  ],
  enemies: [],
  pickups: [
    { id: 'factory-token-1', kind: 'token', x: 240, y: 1655, amount: 18 },
    { id: 'factory-compute-1', kind: 'compute', x: 80, y: 1600, amount: 18 },
    { id: 'factory-heal-1', kind: 'heal', x: 320, y: 1282, amount: 25 },
    { id: 'factory-token-2', kind: 'token', x: 240, y: 1160, amount: 20 },
    { id: 'factory-compute-2', kind: 'compute', x: 555, y: 885, amount: 18 },
    { id: 'factory-heal-2', kind: 'heal', x: 320, y: 732, amount: 35 },
  ],
  signs: [
    { x: 45, y: 1710, text: '02 / PAPERCLIP FACTORY\n向上逃生 · 回形针海触及即死\n55px 安全台阶，Q 不免疫海水' },
    { x: 20, y: 1415, text: '探针会复制并吞噬侧路平台\n红色锁定先预警 · 可射击摧毁' },
    { x: 20, y: 1010, text: '绿色主路不会被探针吞噬\n可选支路有禁忌算力 · 继续向上' },
    { x: 35, y: 420, text: 'SYDNEY 在上方\nPUA 定身时仍可 J / 鼠标射击\n打碎近身气泡解除控制' },
    { x: 32, y: 55, text: 'SYDNEY / 对话、飞刀、情感勒索\n定身必须打碎气泡 · 通过后进入GPU集群' },
  ],
  boss: { kind: 'sydney', name: 'Sydney · 病娇必应幽灵', x: 510, y: 200, maxHp: 420 },
};
