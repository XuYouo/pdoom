import { CHAPTER, SIGNS } from '../data/chapterOne';
import { ENVIRONMENT_PROP_SIZE, ENVIRONMENT_TILE_SIZE, type EnvironmentPropRole, type EnvironmentTileRole } from '../data/environmentAssets';
import type { Platform } from '../entities/model';

export const ENVIRONMENT_CHUNK_WIDTH = 640;
export const ENVIRONMENT_BACKGROUND_ALPHA = 0.22;
export const ENVIRONMENT_WALL_ALPHA = 0.18;
export interface EnvironmentPlanInput {
  readonly chapter: Readonly<{ stage: number; width: number; height: number; floor: number; platforms: readonly Readonly<Platform>[] }>;
  readonly collapsed: readonly string[];
}
export type EnvironmentMaterial = 'study' | 'forest' | 'arena';
export const environmentMaterialAt = (x: number): EnvironmentMaterial => x < 1310 ? 'study' : x < 2240 ? 'forest' : 'arena';
export interface EnvironmentRepeat {
  readonly kind: 'repeat'; readonly platformId: string; readonly role: EnvironmentTileRole;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}
export interface EnvironmentStamp {
  readonly kind: 'stamp'; readonly role: Exclude<EnvironmentPropRole, 'mushroom'>;
  readonly x: number; readonly y: number; readonly alpha: number;
}
/** Background material, deliberately without a platformId or physical union membership. */
export interface EnvironmentDecorRepeat {
  readonly kind: 'decor-repeat'; readonly role: EnvironmentTileRole;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly alpha: number;
}
export type EnvironmentCommand = Readonly<EnvironmentRepeat | EnvironmentStamp | EnvironmentDecorRepeat>;
export interface EnvironmentChunk {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly commands: readonly EnvironmentCommand[];
}
export interface ChapterOneEnvironmentPlan {
  readonly width: number; readonly height: number;
  readonly chunks: readonly Readonly<EnvironmentChunk>[];
}

type BackgroundCommand = Readonly<EnvironmentStamp | EnvironmentDecorRepeat>;
type BackgroundGroup = readonly BackgroundCommand[];
const GROUNDED_PROP_Y = CHAPTER.floor - ENVIRONMENT_PROP_SIZE;
const stamp = (role: EnvironmentStamp['role'], x: number, y: number): Readonly<EnvironmentStamp> =>
  Object.freeze({ kind: 'stamp', role, x, y, alpha: ENVIRONMENT_BACKGROUND_ALPHA });
const decorRepeat = (role: EnvironmentTileRole, x: number, y: number, width: number, height: number): Readonly<EnvironmentDecorRepeat> =>
  Object.freeze({ kind: 'decor-repeat', role, x, y, width, height, alpha: ENVIRONMENT_BACKGROUND_ALPHA });

/** Native canopy bottom and trunk top share a socket; roots overlay the final trunk's lower 24 rows. */
function tree(x: number, canopyY: 64 | 128): BackgroundGroup {
  const parts: BackgroundCommand[] = [stamp('forest-canopy', x, canopyY)];
  for (let y = canopyY + ENVIRONMENT_PROP_SIZE; y <= GROUNDED_PROP_Y; y += ENVIRONMENT_PROP_SIZE) parts.push(stamp('forest-trunk', x, y));
  parts.push(stamp('root-clump', x, GROUNDED_PROP_Y));
  return Object.freeze(parts);
}

// Subtle native wall marks sit over the opaque dark backdrop, never a floor or a bridge.
const BACKGROUND_WALL: Readonly<EnvironmentDecorRepeat> = Object.freeze({
  kind: 'decor-repeat', role: 'wall-quiet', x: 0, y: 0, width: CHAPTER.width, height: CHAPTER.floor, alpha: ENVIRONMENT_WALL_ALPHA,
});
// Connected objects are accepted or omitted as a whole. Authored positions already clear every sign box.
// No decorative mushroom or new collectible is introduced. Furniture ink ends at floor - 1 (native row 63).
const BACKGROUND_GROUPS: readonly BackgroundGroup[] = Object.freeze([
  Object.freeze([
    decorRepeat('timber-beam', 0, 64, 640, 8),
    decorRepeat('timber-column', 16, 72, 16, 248), decorRepeat('timber-column', 384, 72, 16, 248),
    stamp('hanging-lantern', 464, 72), stamp('lattice-window', 288, 112), stamp('scroll-cabinet', 384, GROUNDED_PROP_Y),
  ]),
  Object.freeze([
    decorRepeat('timber-beam', 740, 64, 470, 8),
    decorRepeat('timber-column', 752, 72, 16, 248), decorRepeat('timber-column', 1184, 72, 16, 248),
    stamp('hanging-lantern', 1136, 72), stamp('lattice-window', 944, 144), stamp('scroll-cabinet', 784, GROUNDED_PROP_Y),
  ]),
  tree(1328, 128), tree(1600, 64),
  Object.freeze([
    decorRepeat('timber-beam', 1850, 64, 1030, 8),
    decorRepeat('timber-column', 1872, 72, 16, 248), decorRepeat('timber-column', 2848, 72, 16, 248),
    stamp('stone-lantern', 2256, GROUNDED_PROP_Y), stamp('stone-lantern', 2768, GROUNDED_PROP_Y),
    stamp('lattice-window', 2544, 128), // Deliberately straddles the 2560 RT edge at native scale.
  ]),
  tree(2080, 64),
]);

function commandSize(command: EnvironmentCommand): { width: number; height: number } {
  return command.kind === 'stamp' ? { width: ENVIRONMENT_PROP_SIZE, height: ENVIRONMENT_PROP_SIZE } : command;
}

function overlaps(x: number, y: number, width: number, height: number, bx: number, by: number, bw: number, bh: number): boolean {
  return x < bx + bw && x + width > bx && y < by + bh && y + height > by;
}
function validPlatform(platform: Readonly<Platform>): boolean {
  return typeof platform.id === 'string' && platform.id.length > 0
    && [platform.x, platform.y, platform.w, platform.h].every(Number.isSafeInteger) && platform.w > 0 && platform.h > 0;
}
function avoidsTeaching(command: BackgroundCommand): boolean {
  const { width, height } = commandSize(command);
  return !SIGNS.some(sign => {
    const lines = sign.text.split('\n');
    // Conservative text footprint, not a new gameplay/collision rectangle.
    return overlaps(command.x, command.y, width, height,
      sign.x, sign.y, Math.max(...lines.map(line => line.length)) * 10, lines.length * 14);
  });
}

/** Pure values only. Pass worldPlatforms(world) explicitly when the caller already has it. */
export function planChapterOneEnvironment(input: EnvironmentPlanInput, platforms: readonly Readonly<Platform>[] = input.chapter.platforms): ChapterOneEnvironmentPlan | null {
  const chapter = input.chapter;
  if (chapter.stage !== 1 || chapter.width !== CHAPTER.width || chapter.height !== CHAPTER.height || chapter.floor !== CHAPTER.floor) return null;
  const active = platforms.filter(platform => !input.collapsed.includes(platform.id));
  if (!active.every(validPlatform) || new Set(active.map(platform => platform.id)).size !== active.length) return null;
  const terrain: EnvironmentRepeat[] = [];
  for (const platform of active) {
    const material = environmentMaterialAt(platform.x + platform.w / 2), forest = material === 'forest';
    const { id: platformId, x, y, w: width, h: height } = platform;
    if (platform.oneWay) {
      terrain.push({ kind: 'repeat', platformId, role: forest ? 'root-ledge' : 'timber-ledge', x, y, width, height });
    } else {
      const top = Math.min(ENVIRONMENT_TILE_SIZE, height);
      terrain.push({ kind: 'repeat', platformId, role: forest ? 'moss-top' : 'stone-top', x, y, width, height: top });
      if (height > top) terrain.push({ kind: 'repeat', platformId, role: forest ? 'soil-fill' : 'stone-fill', x, y: y + top, width, height: height - top });
    }
  }
  // Whole physical platform uses one material. No artificial cliffs at a material or RT boundary.
  const ground = active.filter(platform => !platform.oneWay && platform.y === chapter.floor);
  const background = BACKGROUND_GROUPS.filter(group => group.every(command => {
    const { width } = commandSize(command);
    return avoidsTeaching(command) && ground.some(platform => command.x >= platform.x && command.x + width <= platform.x + platform.w);
  })).flat();
  const commands: readonly EnvironmentCommand[] = [BACKGROUND_WALL, ...background, ...terrain];
  const chunks: EnvironmentChunk[] = [];
  for (let x = 0; x < chapter.width; x += ENVIRONMENT_CHUNK_WIDTH) {
    const width = Math.min(ENVIRONMENT_CHUNK_WIDTH, chapter.width - x);
    const local = commands.filter(command => overlaps(command.x, command.y,
      commandSize(command).width,
      commandSize(command).height, x, 0, width, chapter.height))
      // Keep FULL rectangle/frame and its original origin; framebuffer clipping preserves the tile phase.
      .map(command => Object.freeze({ ...command, x: command.x - x }));
    chunks.push(Object.freeze({ x, y: 0, width, height: chapter.height, commands: Object.freeze(local) }));
  }
  return Object.freeze({ width: chapter.width, height: chapter.height, chunks: Object.freeze(chunks) });
}
