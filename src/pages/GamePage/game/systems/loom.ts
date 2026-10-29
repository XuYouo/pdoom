import type { GameSaveData } from '../../../../objects/game/GameSaveData';
import { decodeCheckpoint } from '../data/checkpoints';
import { generateLoomNodes, loomNodeCenter, validateLoomGraph } from '../data/loomGraph';
import { PLAYER_HEIGHT, bossRect, playerRect } from '../entities/model';
import type { LoomNode, LoomState, Pickup, WorldState } from '../entities/model';
import { clamp, overlaps } from './geometry';
import { samplePlayer } from './rewind';

export const LOOM_RULES = { unfoldDistance: 260, collapseMs: 2000, rerollCooldownMs: 6000, maxRerollDx: 160, maxRerollDy: 360 } as const;

export function loomNarrowBounds(nodes: readonly LoomNode[]) {
  const live = nodes.filter(node => node.branch === 'arena' && !node.collapsed);
  const left = Math.min(...live.map(node => node.x)); const right = Math.max(...live.map(node => node.x + node.w));
  return { x: left, y: live[0].y - 100, w: right - left, h: 110 };
}
export function createLoom(save: GameSaveData, now: number): LoomState | null {
  if (save.stage !== 4) return null;
  const room = decodeCheckpoint(save.checkpoint).room;
  const nodes = generateLoomNodes(save.seed, 0, room);
  const errors = validateLoomGraph(nodes, room);
  if (errors.length) throw new Error(`Invalid Loom construction: ${errors.join(',')}`);
  return { timeline: 0, nodes, rerollReadyAt: now, rerolls: 0, lastReroll: null, hpUiTaken: false, stemsLost: 0, eaten: [], swallow: null,
    narrow: loomNarrowBounds(nodes), pullSpeed: 0, turn: { until: 0, lineX: 2240, startX: null, successes: 0, weakUntil: 0 } };
}
export function copyLoom(loom: LoomState | null): LoomState | null {
  return loom ? { ...loom, nodes: loom.nodes.map(node => ({ ...node, next: [...node.next] })), eaten: [...loom.eaten],
    lastReroll: loom.lastReroll ? { ...loom.lastReroll, from: { ...loom.lastReroll.from }, to: { ...loom.lastReroll.to } } : null,
    swallow: loom.swallow ? { ...loom.swallow, ids: [...loom.swallow.ids] } : null, narrow: { ...loom.narrow }, turn: { ...loom.turn } } : null;
}
export function loomPickups(loom: LoomState): Pickup[] {
  return loom.nodes.filter(node => (node.branch === 'upper' || node.branch === 'lower') && node.id.endsWith('-1'))
    .map(node => ({ id: `loom-token-${node.id}`, kind: 'token', x: node.x + node.w / 2, y: node.y - 18, amount: 12 }));
}
/** Move only surviving pickup objects; never regenerate a consumed reward on R. */
export function remapLoomPickups(world: WorldState): void {
  if (!world.loom) return;
  const byId = new Map(world.loom.nodes.map(node => [`loom-token-${node.id}`, node]));
  world.pickups = world.pickups.filter(pickup => !pickup.id.startsWith('loom-token-') || byId.has(pickup.id)).map(pickup => {
    const node = byId.get(pickup.id);
    return node ? { ...pickup, x: node.x + node.w / 2, y: node.y - 18 } : pickup;
  });
}
export function resetLoomAtCheckpoint(world: WorldState): void {
  if (!world.loom) return;
  const previous = world.loom;
  world.loom = createLoom(world.save, world.save.elapsedMs);
  if (world.loom) { world.loom.rerolls = previous.rerolls; world.loom.rerollReadyAt = previous.rerollReadyAt; }
  remapLoomPickups(world);
}
export function advanceLoom(world: WorldState, now: number): void {
  const loom = world.loom;
  if (!loom) return;
  loom.nodes.forEach(node => {
    if (!node.expanded) {
      const center = loomNodeCenter(node);
      const near = Math.hypot(center.x - world.player.x, center.y - world.player.y) < LOOM_RULES.unfoldDistance;
      const connected = loom.nodes.some(parent => parent.expanded && parent.next.includes(node.id));
      if ((near && connected) || (world.boss.active && node.branch === 'arena')) node.expanded = true;
    }
    if (!node.collapsed && node.fragile && node.collapseAt === null && world.player.grounded && world.player.standingOn === node.id) {
      node.collapseAt = now + LOOM_RULES.collapseMs;
      world.events.push({ type: 'notice', message: '时间线节点将在2秒后坍塌：跳向下一节点，或用R重roll到同段平行地形。' });
    }
    if (node.collapseAt !== null && now >= node.collapseAt && !node.protected) node.collapsed = true;
  });
}
export function enterLoomArena(world: WorldState): void {
  if (!world.loom) return;
  world.loom.nodes.filter(node => node.branch === 'arena').forEach(node => { node.expanded = true; });
  world.loom.narrow = loomNarrowBounds(world.loom.nodes);
}

/** A Loom checkpoint is its real island or the bounded air door ABOVE it, never an x-only lift. */
export function loomCheckpointReached(world: WorldState, room: number): boolean {
  if (!world.loom) return true;
  const point = world.chapter.checkpoints.find(item => item.id === room);
  const hub = world.loom.nodes.find(node => node.id === `loom-hub-${room}` && node.expanded && !node.collapsed);
  if (!point || !hub || world.player.x < point.trigger) return false;
  const rect = playerRect(world.player); const feet = rect.y + rect.h;
  const horizontal = rect.x < hub.x + hub.w && rect.x + rect.w > hub.x;
  const standing = world.player.grounded && world.player.standingOn === hub.id && horizontal && Math.abs(feet - hub.y) < 0.001;
  const aboveDoor = rect.x >= point.trigger - rect.w / 2 && rect.x + rect.w <= hub.x + hub.w && rect.y >= hub.y - 100 && feet <= hub.y + 0.001;
  return standing || aboveDoor;
}
/** The camera may lock only while the entire body fits above the actual A/B arena surface. */
export function loomArenaEntryAllowed(world: WorldState): boolean {
  if (!world.loom) return true;
  const surfaces = world.loom.nodes.filter(node => node.branch === 'arena' && !node.collapsed);
  if (!surfaces.length) return false;
  const rect = playerRect(world.player);
  const bottom = Math.min(world.chapter.arena.y + world.chapter.arena.h, ...surfaces.map(node => node.y));
  return rect.y >= world.chapter.arena.y && rect.y + rect.h <= bottom + 0.001;
}

/** Authorized R is an explicit spatial transfer, never disguised as a continuous Q history. */
export function tryLoomReroll(world: WorldState, now: number): boolean {
  const loom = world.loom;
  if (!loom || world.mode !== 'playing' || world.save.hp <= 0 || world.rewind || now < loom.rerollReadyAt) return false;
  const room = decodeCheckpoint(world.save.checkpoint).room;
  const timeline = (1 - loom.timeline) as 0 | 1;
  const nodes = generateLoomNodes(world.save.seed, timeline, room);
  const expanded = new Set(loom.nodes.filter(node => node.expanded).map(node => node.id));
  nodes.forEach(node => { node.expanded ||= expanded.has(node.id) || (world.boss.active && node.branch === 'arena'); node.collapsed = loom.eaten.includes(node.id); });
  const nextCheckpoint = world.chapter.checkpoints.find(point => point.id > room);
  const minX = world.boss.active ? world.chapter.arena.x + 12 : world.chapter.checkpoints[room].x;
  const maxX = world.boss.active ? world.chapter.arena.x + world.chapter.arena.w - 12 : Math.min(nextCheckpoint?.trigger ?? Infinity, world.chapter.arena.trigger) - 1;
  const candidates = nodes.filter(node => !node.collapsed && (world.boss.active ? node.branch === 'arena' : node.branch !== 'arena')).flatMap(node => {
    const left = Math.max(minX, node.x + 10); const right = Math.min(maxX, node.x + node.w - 10);
    if (left > right) return [];
    let targetX = clamp(world.player.x + (node.branch === 'hub' ? timeline === 1 ? 18 : -18 : 0), left, right);
    if (node.branch === 'hub' && Math.abs(targetX - world.player.x) < 0.1) targetX = clamp(world.player.x + (timeline === 1 ? -18 : 18), left, right);
    const position = { x: targetX, y: node.y - PLAYER_HEIGHT / 2 };
    const dx = Math.abs(position.x - world.player.x); const dy = Math.abs(position.y - world.player.y);
    if (dx > LOOM_RULES.maxRerollDx || dy > LOOM_RULES.maxRerollDy || (world.boss.active && overlaps(playerRect(position), bossRect(world.boss)))) return [];
    return [{ node, position, cost: dx * 4 + dy }];
  }).sort((a, b) => a.cost - b.cost || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  const target = candidates[0];
  if (!target) { world.events.push({ type: 'notice', message: '附近没有同段安全承载面；R不会跨越安全点或把你送入Boss身体。' }); return false; }
  const from = { x: world.player.x, y: world.player.y };
  target.node.expanded = true;
  loom.nodes = nodes; loom.timeline = timeline; loom.rerolls += 1; loom.rerollReadyAt = now + LOOM_RULES.rerollCooldownMs;
  loom.lastReroll = { at: now, from, to: { ...target.position } }; loom.narrow = loomNarrowBounds(nodes); loom.turn.startX = null;
  world.player = { ...world.player, ...target.position, vx: 0, vy: 0, grounded: true, standingOn: target.node.id, dashUntil: 0, jumpUntil: 0 };
  world.history = [samplePlayer(world.player, now)]; world.rewind = null;
  remapLoomPickups(world);
  world.events.push({ type: 'notice', message: `R → 平行时间线 ${timeline + 1}：真实地形已改变；Q从当前位置重新记录2秒，拾取不会重发。` });
  return true;
}
