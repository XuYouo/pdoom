import type { LoomNode, WorldState } from '../entities/model';
import { worldPlatforms } from './platforms';

export const LOOM_TERRAIN_ROLES = [
  'upper-left', 'upper-mid-a', 'upper-mid-b', 'upper-right',
  'lower-left', 'lower-mid-a', 'lower-mid-b', 'lower-right',
  'hub-left', 'hub-mid-a', 'hub-mid-b', 'hub-right',
  'anchor-left', 'anchor-mid-a', 'anchor-mid-b', 'anchor-right',
  'void-wall-a', 'void-wall-b', 'thread-v', 'thread-h', 'thread-elbow', 'thread-fork',
  'shuttle-socket', 'quiet-ring', 'loom-upright', 'loom-crossbar', 'loom-elbow',
  'thread-knot', 'thread-tail', 'dark-weave-a', 'dark-weave-b', 'loom-rivet-panel',
] as const;
export const LOOM_PROP_ROLES = ['fork-spindle', 'split-reel', 'shuttle-bank', 'branch-coupler', 'broken-loom', 'distant-fork-tree'] as const;
export const LOOM_IMAGE_LIMIT = 512;
export type LoomTerrainRole = typeof LOOM_TERRAIN_ROLES[number];
export type LoomPropRole = typeof LOOM_PROP_ROLES[number];
export interface LoomRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface Stamp extends LoomRect { readonly id: string; readonly nodeId: string | null; readonly depth: number }
export type LoomCommand = Stamp & (
  | { readonly kind: 'tile'; readonly role: LoomTerrainRole }
  | { readonly kind: 'prop'; readonly role: LoomPropRole }
);
export interface LoomEnvironmentPlan { readonly commands: readonly LoomCommand[]; readonly nodeIds: readonly string[] }
const FAMILIES = {
  upper: LOOM_TERRAIN_ROLES.slice(0, 4), lower: LOOM_TERRAIN_ROLES.slice(4, 8),
  hub: LOOM_TERRAIN_ROLES.slice(8, 12), anchor: LOOM_TERRAIN_ROLES.slice(12, 16),
};
const BACKDROP: readonly LoomCommand[] = (() => {
  const commands: LoomCommand[] = [];
  // Short, separated dark weaves, not the old full-height machine columns or a floor.
  for (const [index, center] of [100, 680, 1260, 1840].entries()) {
    for (let row = 0; row < 4; row++) for (let column = 0; column < 6; column++) {
      commands.push({ kind: 'tile', role: (row + column) % 2 ? 'dark-weave-a' : 'dark-weave-b',
        id: `weave:${index}:${row}:${column}`, nodeId: null, depth: -8,
        x: center - 48 + column * 16, y: 128 + row * 16, width: 16, height: 16 });
    }
  }
  for (const [index, x] of [208, 780, 1360, 1904, 1960, 2500].entries()) {
    commands.push({ kind: 'prop', role: 'distant-fork-tree', id: `far:${index}`, nodeId: null,
      x, y: index < 4 ? 232 : 244, width: 64, height: 64, depth: -7 });
  }
  commands.push({ kind: 'prop', role: 'broken-loom', id: 'old-loom', nodeId: null,
    x: 1472, y: 120, width: 64, height: 64, depth: -6 });
  return Object.freeze(commands.map(value => Object.freeze(value)));
})();
function validNode(node: LoomNode): boolean {
  return typeof node.id === 'string' && !!node.id.trim()
    && [node.x, node.y, node.w, node.h].every(Number.isFinite)
    && Number.isSafeInteger(node.w) && node.w >= 40 && node.w <= 180 && node.h === 12
    && node.x >= 0 && node.x + node.w <= 2580 && node.y >= 30 && node.y + node.h <= 640
    && ['upper', 'lower', 'hub', 'arena'].includes(node.branch);
}
/** A pure view of actual expanded supports. No RNG, clock, collision or Core mutation. */
function readPlan(world: Readonly<WorldState>): LoomEnvironmentPlan | null {
  const loom = world.loom;
  if (world.chapter.stage !== 4 || world.chapter.width !== 2580 || world.chapter.height !== 640 || !loom) return null;
  const ids = new Set(loom.nodes.map(node => node.id));
  if (loom.nodes.length > 33 || ids.size !== loom.nodes.length || loom.nodes.some(node => !validNode(node))) return null;
  const nodes = new Map(loom.nodes.map(node => [node.id, node]));
  const eaten = new Set(loom.eaten), commands: LoomCommand[] = [...BACKDROP], nodeIds: string[] = [];
  const hubs = loom.nodes.filter(node => node.branch === 'hub');
  for (const platform of worldPlatforms(world)) {
    const node = nodes.get(platform.id);
    if (!node || eaten.has(node.id)) continue;
    nodeIds.push(node.id);
    const family = node.branch === 'arena' ? node.protected ? FAMILIES.anchor : FAMILIES.upper : FAMILIES[node.branch];
    const tile = (suffix: string, role: LoomTerrainRole, x: number, width: number) => commands.push({
      kind: 'tile', id: `support:${node.id}:${suffix}`, nodeId: node.id, role,
      x, y: node.y, width, height: 12, depth: 0.5,
    });
    tile('left', family[0], node.x, 16);
    const right = node.x + node.w - 16;
    // Retain two complete native caps. Only a middle prefix is cropped on odd/narrow spans.
    for (let x = node.x + 16, index = 0; x < right; x += 16, index++) {
      tile(`middle:${index}`, family[1 + index % 2], x, Math.min(16, right - x));
    }
    tile('right', family[3], right, 16);
    if (node.branch === 'hub') {
      const index = hubs.findIndex(value => value.id === node.id);
      commands.push({ kind: 'prop', role: LOOM_PROP_ROLES[index % 4], id: `hub-prop:${node.id}`, nodeId: node.id,
        x: index === 0 ? node.x + node.w - 64 : node.x + node.w / 2 - 32, y: node.y - 168, width: 64, height: 64, depth: -5 });
    }
  }
  if (commands.length > LOOM_IMAGE_LIMIT) return null;
  return { commands, nodeIds };
}

/** Runtime boundary: malformed/throwing inputs cannot allocate a partial native skin. */
export function planLoomEnvironment(world: Readonly<WorldState>): LoomEnvironmentPlan | null {
  try { return readPlan(world); } catch { return null; }
}
