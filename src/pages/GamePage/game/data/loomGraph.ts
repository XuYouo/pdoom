import type { LoomNode } from '../entities/model';
import { LOOM_ARENA_FLOOR, LOOM_HUB_X, LOOM_HUB_Y } from './chapterFour';

export const LOOM_ANCHOR_ID = 'loom-arena-anchor';
export const LOOM_NODE_LIMIT = 33;
export const LOOM_SWALLOW_ORDER = ['loom-arena-left-outer', 'loom-arena-right-outer', 'loom-arena-left-inner', 'loom-arena-right-inner'] as const;

/** Owned xorshift32: pin the unsigned outputs in tests so engine/library updates cannot change saves. */
export function loomRandom(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state; };
}
export const loomNodeCenter = (node: LoomNode) => ({ x: node.x + node.w / 2, y: node.y });
const makeNode = (id: string, x: number, y: number, w: number, branch: LoomNode['branch'], segment: number): LoomNode => ({
  id, x, y, w, h: 12, oneWay: true, branch, segment, next: [], expanded: false, collapseAt: null, collapsed: false,
});

/** Three actual diamonds, each with independently seeded 3/4-node upper and lower paths. */
export function generateLoomNodes(seed: number, timeline: 0 | 1, checkpoint = 0): LoomNode[] {
  const random = loomRandom((seed ^ (timeline ? 0x9e3779b9 : 0)) >>> 0);
  const hubs = LOOM_HUB_X.map((x, index) => ({ ...makeNode(`loom-hub-${index}`, x - 90, LOOM_HUB_Y, 180, 'hub', index), protected: true, expanded: index === checkpoint }));
  const nodes: LoomNode[] = [...hubs];
  for (let segment = 0; segment < 3; segment += 1) {
    for (const branch of ['upper', 'lower'] as const) {
      const count = 3 + (random() & 1);
      const xShift = random() % 13 - 6;
      // Timeline height bands do not overlap, so R always changes actual collision geometry.
      const yShift = random() % 7 - 3 + (timeline ? 7 : -7);
      const width = 122 + 2 * (random() % 8);
      const path: LoomNode[] = [];
      for (let index = 0; index < count; index += 1) {
        const center = LOOM_HUB_X[segment] + 580 * (index + 1) / (count + 1) + xShift;
        const depth = index === 0 || index === count - 1 ? 50 : 100;
        const node = makeNode(`loom-${segment}-${branch}-${index}`, center - width / 2, LOOM_HUB_Y + (branch === 'upper' ? -depth : depth) + yShift, width, branch, segment);
        node.fragile = index === 1;
        node.next = [index + 1 < count ? `loom-${segment}-${branch}-${index + 1}` : `loom-hub-${segment + 1}`];
        path.push(node);
      }
      hubs[segment].next.push(path[0].id); nodes.push(...path);
    }
  }
  const arenaY = LOOM_ARENA_FLOOR - (timeline ? 12 : 0);
  const anchorWidth = 180 - (seed >>> 0) % 4 * 2 - (timeline ? 16 : 0);
  const anchorLeft = 2240 - anchorWidth / 2; const anchorRight = anchorLeft + anchorWidth;
  const arena = [
    makeNode(LOOM_SWALLOW_ORDER[0], 1940, arenaY, 100, 'arena', 3),
    makeNode(LOOM_SWALLOW_ORDER[2], 2040, arenaY, anchorLeft - 2040, 'arena', 3),
    { ...makeNode(LOOM_ANCHOR_ID, anchorLeft, arenaY, anchorWidth, 'arena', 3), protected: true },
    makeNode(LOOM_SWALLOW_ORDER[3], anchorRight, arenaY, 2450 - anchorRight, 'arena', 3),
    makeNode(LOOM_SWALLOW_ORDER[1], 2450, arenaY, 130, 'arena', 3),
  ];
  arena.forEach((node, index) => { node.next = index + 1 < arena.length ? [arena[index + 1].id] : []; });
  hubs[3].next = [arena[0].id]; nodes.push(...arena);
  const kept = nodes.filter(node => node.segment >= checkpoint);
  const ids = new Set(kept.map(node => node.id));
  kept.forEach(node => { node.next = node.next.filter(id => ids.has(id)); });
  return kept;
}

/** Construction invariants, separate from the real-input reachability proofs. */
export function validateLoomGraph(nodes: readonly LoomNode[], checkpoint = 0): string[] {
  const errors: string[] = []; const byId = new Map(nodes.map(node => [node.id, node]));
  if (nodes.length > LOOM_NODE_LIMIT || byId.size !== nodes.length) errors.push('node-bound-or-duplicate');
  nodes.forEach(node => {
    if (node.x < 0 || node.x + node.w > 2580 || node.y < 30 || node.y > 540 || node.w < 40) errors.push(`bounds:${node.id}`);
    node.next.forEach(id => {
      const next = byId.get(id);
      if (!next) { errors.push(`missing:${id}`); return; }
      if (next.y < node.y - 64 || next.x - node.x - node.w > 48) errors.push(`unreachable-edge:${node.id}:${id}`);
    });
  });
  const visited = new Set<string>(); const queue = [`loom-hub-${checkpoint}`];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    const node = byId.get(id); if (!node) continue;
    visited.add(id); queue.push(...node.next);
  }
  if (!visited.has(LOOM_ANCHOR_ID)) errors.push('unreachable-arena');
  if (visited.size !== nodes.length) errors.push('unreachable-branch');
  return errors;
}
