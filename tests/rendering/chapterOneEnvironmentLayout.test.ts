import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAPTER, PLATFORMS, SIGNS } from '../../src/pages/GamePage/game/data/chapterOne';
import { ENVIRONMENT_PROP_ROLES, ENVIRONMENT_PROP_SIZE, type EnvironmentPropRole } from '../../src/pages/GamePage/game/data/environmentAssets';
import { ENVIRONMENT_BACKGROUND_ALPHA, ENVIRONMENT_WALL_ALPHA, planChapterOneEnvironment, type ChapterOneEnvironmentPlan, type EnvironmentCommand, type EnvironmentDecorRepeat, type EnvironmentRepeat, type EnvironmentStamp } from '../../src/pages/GamePage/game/systems/ChapterOneEnvironmentPlan';

type Rect = { x: number; y: number; width: number; height: number };
type InkBounds = readonly [left: number, top: number, right: number, bottom: number];
const native = (JSON.parse(readFileSync(new URL('../../assets/chapter-one-environment-generation.json', import.meta.url), 'utf8')) as {
  propsDraftB: { nativeFrameSize: number[]; inkBoundsInclusive: Record<EnvironmentPropRole, InkBounds>; trunkAndCanopySocketsByteIdentical: boolean };
}).propsDraftB;
const chapter = { ...CHAPTER, platforms: PLATFORMS };
const ground = PLATFORMS.filter(platform => !platform.oneWay);
const signBoxes: Rect[] = SIGNS.map(sign => {
  const lines = sign.text.split('\n');
  return { x: sign.x, y: sign.y, width: Math.max(...lines.map(line => line.length)) * 10, height: lines.length * 14 };
});
function requirePlan(collapsed: readonly string[] = []) {
  const plan = planChapterOneEnvironment({ chapter, collapsed });
  if (!plan) throw new Error('Expected the canonical first-chapter layout');
  return plan;
}
/** Undo RT-local translation and deduplicate full commands shared by adjacent chunks. */
function commandsOf(plan: ChapterOneEnvironmentPlan): EnvironmentCommand[] {
  const unique = new Map<string, EnvironmentCommand>();
  for (const chunk of plan.chunks) for (const command of chunk.commands) {
    const absolute: EnvironmentCommand = { ...command, x: chunk.x + command.x, y: chunk.y + command.y };
    unique.set(JSON.stringify(absolute), absolute);
  }
  return [...unique.values()];
}
const stampsOf = (commands: readonly EnvironmentCommand[]) => commands.filter((command): command is EnvironmentStamp => command.kind === 'stamp');
const decorOf = (commands: readonly EnvironmentCommand[]) => commands.filter((command): command is EnvironmentDecorRepeat => command.kind === 'decor-repeat');
const terrainOf = (commands: readonly EnvironmentCommand[]) => commands.filter((command): command is EnvironmentRepeat => command.kind === 'repeat');
const rectOf = (command: EnvironmentCommand): Rect => command.kind === 'stamp'
  ? { x: command.x, y: command.y, width: ENVIRONMENT_PROP_SIZE, height: ENVIRONMENT_PROP_SIZE } : command;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const isTree = (stamp: EnvironmentStamp) => stamp.role === 'forest-canopy' || stamp.role === 'forest-trunk' || stamp.role === 'root-clump';

describe('native chapter-one background composition', () => {
  it('starts every chunk with the subtle quiet wall and keeps all background ink behind physical terrain', () => {
    const plan = requirePlan(), all = commandsOf(plan);
    expect(decorOf(all).filter(command => command.role === 'wall-quiet')).toEqual([
      { kind: 'decor-repeat', role: 'wall-quiet', x: 0, y: 0, width: 2880, height: 320, alpha: ENVIRONMENT_WALL_ALPHA },
    ]);
    for (const chunk of plan.chunks) {
      expect(chunk.commands[0]).toEqual({ kind: 'decor-repeat', role: 'wall-quiet', x: 0 - chunk.x, y: 0, width: 2880, height: 320, alpha: ENVIRONMENT_WALL_ALPHA });
      const firstTerrain = chunk.commands.findIndex(command => command.kind === 'repeat');
      expect(firstTerrain).toBeGreaterThan(0);
      expect(chunk.commands.slice(firstTerrain).every(command => command.kind === 'repeat')).toBe(true);
      expect(chunk.commands.every(Object.isFrozen)).toBe(true);
    }
    for (const command of all.filter(command => command.kind !== 'repeat')) {
      expect('platformId' in command).toBe(false);
      expect(command.alpha).toBe(command.kind === 'decor-repeat' && command.role === 'wall-quiet' ? ENVIRONMENT_WALL_ALPHA : ENVIRONMENT_BACKGROUND_ALPHA);
    }
  });

  it('keeps the original four grounds and twelve ledges separate from the full-width background', () => {
    const physical = terrainOf(commandsOf(requirePlan()));
    expect(new Set(physical.map(command => command.platformId))).toEqual(new Set(PLATFORMS.map(platform => platform.id)));
    expect(physical).toHaveLength(20);
    for (const platform of PLATFORMS) {
      const pieces = physical.filter(command => command.platformId === platform.id).sort((a, b) => a.y - b.y);
      expect(pieces).toHaveLength(platform.oneWay ? 1 : 2);
      let nextY = platform.y;
      for (const piece of pieces) {
        expect([piece.x, piece.y, piece.width]).toEqual([platform.x, nextY, platform.w]);
        expect('alpha' in piece).toBe(false);
        nextY += piece.height;
      }
      expect(nextY).toBe(platform.y + platform.h);
      if (platform.oneWay) expect(pieces[0].height).toBe(12);
    }
    for (const x of [640, 700, 739, 1210, 1250, 1309, 1750, 1800, 1849]) {
      expect(physical.some(command => overlaps(rectOf(command), { x, y: 320, width: 1, height: 1 }))).toBe(false);
    }
    const collapsed = terrainOf(commandsOf(requirePlan(['compute-branch', 'shroom-canopy', 'last-compute'])));
    expect(collapsed).toEqual(physical.filter(command => !['compute-branch', 'shroom-canopy', 'last-compute'].includes(command.platformId)));
  });

  it('grounds cabinet and stone-lantern native ink on row319, rather than centering their cells above the floor', () => {
    expect(native.nativeFrameSize).toEqual([64, 64]);
    const furniture = stampsOf(commandsOf(requirePlan())).filter(stamp => stamp.role === 'scroll-cabinet' || stamp.role === 'stone-lantern');
    expect(furniture).toHaveLength(4);
    for (const prop of furniture) {
      const [left, , right, bottom] = native.inkBoundsInclusive[prop.role];
      expect(prop.y).toBe(256);
      expect(prop.y + bottom).toBe(CHAPTER.floor - 1);
      expect(ground.some(platform => prop.x + left >= platform.x && prop.x + right < platform.x + platform.w && prop.y + bottom + 1 === platform.y)).toBe(true);
    }
  });

  it('joins each complete tree on one x with contiguous64px sockets and a root overlay on the final trunk', () => {
    expect(native.trunkAndCanopySocketsByteIdentical).toBe(true);
    const parts = stampsOf(commandsOf(requirePlan())).filter(isTree);
    const canopies = parts.filter(part => part.role === 'forest-canopy');
    expect(canopies).toHaveLength(3);
    expect(new Set(canopies.map(canopy => canopy.x)).size).toBe(canopies.length);
    expect(new Set(canopies.map(canopy => canopy.y))).toEqual(new Set([64, 128]));
    for (const canopy of canopies) {
      const stack = parts.filter(part => part.x === canopy.x);
      const trunks = stack.filter(part => part.role === 'forest-trunk').sort((a, b) => a.y - b.y);
      const roots = stack.filter(part => part.role === 'root-clump');
      expect(stack).toHaveLength((CHAPTER.floor - canopy.y) / ENVIRONMENT_PROP_SIZE + 1);
      expect(roots).toHaveLength(1);
      let socketY = canopy.y + native.inkBoundsInclusive['forest-canopy'][3] + 1;
      for (const trunk of trunks) {
        expect(trunk.y + native.inkBoundsInclusive['forest-trunk'][1]).toBe(socketY);
        socketY = trunk.y + native.inkBoundsInclusive['forest-trunk'][3] + 1;
      }
      expect(socketY).toBe(CHAPTER.floor);
      expect(trunks.at(-1)?.y).toBe(256);
      expect(roots[0].y).toBe(trunks.at(-1)?.y);
      expect(roots[0].y + native.inkBoundsInclusive['root-clump'][1]).toBe(296);
      expect(roots[0].y + native.inkBoundsInclusive['root-clump'][3]).toBe(319);
    }
    expect(parts.every(part => canopies.some(canopy => canopy.x === part.x))).toBe(true);
  });

  it('omits complete connected groups when their real ground is absent, never leaving an orphan canopy or root', () => {
    const baseline = stampsOf(commandsOf(requirePlan())).filter(isTree);
    for (const missingGround of ground) {
      const remaining = stampsOf(commandsOf(requirePlan([missingGround.id]))).filter(isTree);
      for (const x of new Set(baseline.map(part => part.x))) {
        const before = baseline.filter(part => part.x === x);
        const lostSupport = x >= missingGround.x && x + ENVIRONMENT_PROP_SIZE <= missingGround.x + missingGround.w;
        expect(remaining.filter(part => part.x === x)).toEqual(lostSupport ? [] : before);
      }
    }
  });

  it('attaches each paper-lantern rope and every column to its native beam without spanning a real gap', () => {
    const all = commandsOf(requirePlan()), wood = decorOf(all).filter(command => command.role !== 'wall-quiet');
    const beams = wood.filter(command => command.role === 'timber-beam');
    const columns = wood.filter(command => command.role === 'timber-column');
    const lanterns = stampsOf(all).filter(stamp => stamp.role === 'hanging-lantern');
    expect(beams).toHaveLength(3); expect(columns).toHaveLength(6); expect(lanterns).toHaveLength(2);
    for (const command of wood) {
      expect(['timber-beam', 'timber-column']).toContain(command.role);
      expect(command.alpha).toBe(0.22);
      expect(ground.some(platform => command.x >= platform.x && command.x + command.width <= platform.x + platform.w)).toBe(true);
    }
    for (const column of columns) {
      expect(column.y + column.height).toBe(CHAPTER.floor);
      expect(beams.some(beam => beam.x <= column.x && beam.x + beam.width >= column.x + column.width && beam.y + beam.height === column.y)).toBe(true);
    }
    for (const lantern of lanterns) {
      const ropeX = lantern.x + ENVIRONMENT_PROP_SIZE / 2, ropeY = lantern.y + native.inkBoundsInclusive['hanging-lantern'][1];
      expect(beams.some(beam => beam.x <= ropeX && beam.x + beam.width > ropeX && beam.y + beam.height === ropeY)).toBe(true);
    }
  });

  it('keeps every authored teaching box clear of props and timber, with all seven non-pickup roles represented', () => {
    const all = commandsOf(requirePlan());
    expect(new Set(stampsOf(all).map(prop => prop.role))).toEqual(new Set(ENVIRONMENT_PROP_ROLES.filter(role => role !== 'mushroom')));
    for (const command of all.filter(command => command.kind !== 'repeat')) {
      if (command.kind === 'decor-repeat' && command.role === 'wall-quiet') continue;
      expect(signBoxes.some(box => overlaps(rectOf(command), box))).toBe(false);
      const bounds = rectOf(command);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(CHAPTER.floor);
      expect(ground.some(platform => bounds.x >= platform.x && bounds.x + bounds.width <= platform.x + platform.w)).toBe(true);
    }
  });

  it('retains the native round window across the2560 chunk edge with its full frame and original phase', () => {
    const plan = requirePlan();
    const pieces = plan.chunks.flatMap(chunk => chunk.commands.filter((command): command is EnvironmentStamp => command.kind === 'stamp' && command.role === 'lattice-window' && command.y === 128)
      .map(command => ({ chunkX: chunk.x, localX: command.x, worldX: chunk.x + command.x, alpha: command.alpha })));
    expect(pieces).toEqual([
      { chunkX: 1920, localX: 624, worldX: 2544, alpha: 0.22 },
      { chunkX: 2560, localX: -16, worldX: 2544, alpha: 0.22 },
    ]);
  });

  it('provides a stable unobscured first-screen native window ROI without relying on renderer internals', () => {
    const all = commandsOf(requirePlan());
    const window = stampsOf(all).find(prop => prop.role === 'lattice-window' && prop.x === 288 && prop.y === 112);
    expect(window).toEqual({ kind: 'stamp', role: 'lattice-window', x: 288, y: 112, alpha: 0.22 });
    if (!window) throw new Error('Missing authored first-screen window');
    const bounds = rectOf(window);
    expect(signBoxes.some(box => overlaps(bounds, box))).toBe(false);
    expect(all.filter(command => command !== window && !(command.kind === 'decor-repeat' && command.role === 'wall-quiet')).some(command => overlaps(bounds, rectOf(command)))).toBe(false);
  });
});
