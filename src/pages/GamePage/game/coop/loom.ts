import { decodeCheckpoint } from '../data/checkpoints';
import { generateLoomNodes, loomNodeCenter } from '../data/loomGraph';
import { bossRect, playerRect, PLAYER_HEIGHT } from '../entities/model';
import { LOOM_RULES, loomNarrowBounds, remapLoomPickups } from '../systems/loom';
import { clamp, overlaps } from '../systems/geometry';
import { samplePlayer } from '../systems/rewind';
import { COOP_RULES, type CoopWorldState } from './model';
import { activeIds, withPlayer } from './state';

export function advanceCoopLoom(state: CoopWorldState, now: number): void {
  const loom = state.shared.loom; if (!loom) return;
  const actors = activeIds(state).map(id => state.players[id].actor);
  for (const node of loom.nodes) {
    if (!node.expanded) {
      const center = loomNodeCenter(node);
      const near = actors.some(actor => Math.hypot(center.x - actor.x, center.y - actor.y) < LOOM_RULES.unfoldDistance);
      if ((near && loom.nodes.some(parent => parent.expanded && parent.next.includes(node.id))) || (state.shared.boss.active && node.branch === 'arena')) node.expanded = true;
    }
    if (!node.collapsed && node.fragile && node.collapseAt === null && actors.some(actor => actor.grounded && actor.standingOn === node.id)) {
      node.collapseAt = now + LOOM_RULES.collapseMs;
      state.events.push({ type: 'notice', message: '时间线节点将在2秒后坍塌；两人共享同一块真实地形。' });
    }
    if (node.collapseAt !== null && now >= node.collapseAt && !node.protected) node.collapsed = true;
  }
}

/** Prepare every legal landing before changing the shared timeline. Failure changes nothing. */
export function tryCoopReroll(state: CoopWorldState, now: number): boolean {
  const loom = state.shared.loom, ids = activeIds(state);
  if (!loom || !ids.length || now < loom.rerollReadyAt || ids.some(id => state.players[id].rewind)) return false;
  const room = decodeCheckpoint(state.run.checkpoint).room;
  const timeline = (1 - loom.timeline) as 0 | 1;
  const nodes = generateLoomNodes(state.run.seed, timeline, room);
  const expanded = new Set(loom.nodes.filter(node => node.expanded).map(node => node.id));
  for (const node of nodes) { node.expanded ||= expanded.has(node.id) || (state.shared.boss.active && node.branch === 'arena'); node.collapsed = loom.eaten.includes(node.id); }
  const chapter = state.shared.chapter;
  const nextCheckpoint = chapter.checkpoints.find(point => point.id > room);
  const minX = state.shared.boss.active ? chapter.arena.x + 12 : chapter.checkpoints[room].x;
  const maxX = state.shared.boss.active ? chapter.arena.x + chapter.arena.w - 12 : Math.min(nextCheckpoint?.trigger ?? Infinity, chapter.arena.trigger) - 1;
  const targets = ids.map(id => {
    const player = state.players[id].actor;
    const candidates = nodes.filter(node => !node.collapsed && (state.shared.boss.active ? node.branch === 'arena' : node.branch !== 'arena')).flatMap(node => {
      const left = Math.max(minX, node.x + 10), right = Math.min(maxX, node.x + node.w - 10);
      if (left > right) return [];
      let x = clamp(player.x + (node.branch === 'hub' ? timeline === 1 ? 18 : -18 : 0), left, right);
      if (node.branch === 'hub' && Math.abs(x - player.x) < 0.1) x = clamp(player.x + (timeline === 1 ? -18 : 18), left, right);
      const position = { x, y: node.y - PLAYER_HEIGHT / 2 };
      const dx = Math.abs(position.x - player.x), dy = Math.abs(position.y - player.y);
      if (dx > LOOM_RULES.maxRerollDx || dy > LOOM_RULES.maxRerollDy || (state.shared.boss.active && overlaps(playerRect(position), bossRect(state.shared.boss)))) return [];
      return [{ id, node, position, cost: dx * 4 + dy }];
    }).sort((a, b) => a.cost - b.cost || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
    return candidates;
  });
  // Two players can share one support, but the selected pair must still fit the shared screen.
  const pairs = targets.length === 1 ? targets[0].map(target => [target]) : targets[0].flatMap(a => targets[1]
    .filter(b => Math.abs(a.position.x - b.position.x) <= COOP_RULES.maxSeparationX && Math.abs(a.position.y - b.position.y) <= COOP_RULES.maxSeparationY)
    .map(b => [a, b]));
  pairs.sort((a, b) => a.reduce((sum, item) => sum + item.cost, 0) - b.reduce((sum, item) => sum + item.cost, 0));
  const selected = pairs[0];
  if (!selected) { state.events.push({ type: 'notice', message: '队伍没有可同时到达的同段安全承载面；本次没有换图，也没有移动任何人。' }); return false; }
  const first = selected[0], from = { x: state.players[first.id].actor.x, y: state.players[first.id].actor.y };
  loom.nodes = nodes; loom.timeline = timeline; loom.rerolls += 1; loom.rerollReadyAt = now + LOOM_RULES.rerollCooldownMs;
  loom.lastReroll = { at: now, from, to: { ...first.position } }; loom.narrow = loomNarrowBounds(nodes); loom.turn.startX = null;
  for (const target of selected) {
    target.node.expanded = true;
    const player = state.players[target.id];
    player.actor = { ...player.actor, ...target.position, vx: 0, vy: 0, grounded: true, standingOn: target.node.id, dashUntil: 0, jumpUntil: 0 };
    player.history = [samplePlayer(player.actor, now)]; player.rewind = null; player.turnStartX = null;
  }
  withPlayer(state, first.id, remapLoomPickups);
  state.events.push({ type: 'notice', message: `队伍已原子换到时间线 ${timeline + 1}；各自Q重新记录，已吞地形与已取奖励不会恢复。` });
  return true;
}
