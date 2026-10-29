import { expect, it } from 'vitest';
import { createRun, isGameSave } from '../../src/pages/GamePage/functions/saveModel';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import type { FrameInput, LoomNode, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { applyProgressionCommand } from '../../src/pages/GamePage/game/systems/shop';
import { LOOM_ANCHOR_ID } from '../../src/pages/GamePage/game/data/loomGraph';

/** Real controls only. R's intentional game-world transfer is not a test-side position edit. */
function controller(branch: 'upper' | 'lower') {
  let targetId: string | null = null; let waitForCollapse: string | null = null;
  return (world: WorldState): FrameInput => {
    const p = world.player; const loom = world.loom!; const now = world.save.elapsedMs;
    if (world.boss.active) {
      const line = loom.turn.lineX; const target = line + 22;
      const weak = now < loom.turn.weakUntil;
      if (weak) return { ...EMPTY_INPUT, move: now < p.dashUntil ? -1 : 0, fire: true, aim: world.boss };
      const inWindow = world.boss.action === 'attack' && now < loom.turn.until;
      if (inWindow && now < p.dashUntil) return { ...EMPTY_INPUT, move: -1, fire: true, aim: world.boss };
      const canTurn = inWindow && p.standingOn === LOOM_ANCHOR_ID && p.x >= line + 20 && p.x <= line + 32 && now >= p.dashReadyAt;
      return { ...EMPTY_INPUT, move: canTurn ? -1 : p.x < target - 4 ? 1 : p.x > target + 4 ? -1 : 0, dashPressed: canTurn, fire: true, aim: world.boss };
    }
    const support = loom.nodes.find(node => node.id === p.standingOn) ?? loom.nodes.find(node => node.expanded && !node.collapsed && Math.abs(p.y + 11 - node.y) < 1 && p.x > node.x && p.x < node.x + node.w);
    if (p.grounded && support?.fragile && loom.rerolls === 0) waitForCollapse ??= support.id;
    if (waitForCollapse && loom.rerolls === 0) {
      const collapsing = loom.nodes.find(node => node.id === waitForCollapse)!;
      return { ...EMPTY_INPUT, rerollPressed: collapsing.collapsed && p.y > collapsing.y + 24 };
    }
    if (p.grounded && support) {
      const next = support.next.map(id => loom.nodes.find(node => node.id === id)!).filter(Boolean);
      targetId = (next.find(node => node.branch === branch) ?? next[0])?.id ?? support.id;
    }
    let target: LoomNode | undefined = loom.nodes.find(node => node.id === targetId);
    target ??= support ?? loom.nodes.find(node => node.expanded && !node.collapsed);
    if (!target) return EMPTY_INPUT;
    const x = target.x + target.w / 2;
    const needsJump = !!support && (target.y < support.y - 8 || target.x > support.x + support.w + 6);
    return { ...EMPTY_INPUT, move: p.x < x - 3 ? 1 : p.x > x + 3 ? -1 : 0,
      jumpPressed: p.grounded && needsJump && p.x >= support!.x + support!.w - 30, jumpHeld: true };
  };
}

const routes = [42, 77].flatMap(seed => (['upper', 'lower'] as const).map(branch => ({ seed, branch })));
it.each(routes)('seed $seed takes the real $branch route, rerolls after collapse and wins all narrow turn phases', ({ seed, branch }) => {
  let world = createWorld({ ...createRun('77b71a98-1219-40c1-87b8-824bf213c401', seed), stage: 4 });
  const inputFor = controller(branch); const rooms = new Set<number>(); const phases = new Set<number>(); const attacks = new Set<number>(); const turns = new Set<number>();
  const visitedBranches = new Set<string>();
  let frames = 0; let rerollsObserved = 0; let rescuedFall = false; let presentationTaken = false; let presentationReturnedDuringPlay = false;
  let narrowTurn = false;
  while ((world.mode === 'playing' || world.mode === 'rest') && frames < 60 * 180) {
    const previous = world;
    if (world.mode === 'rest') { rooms.add(world.rest!.room); world = applyProgressionCommand(world, { type: 'rest-continue' }); }
    else world = stepWorld(world, inputFor(world));
    const loom = world.loom!; const before = previous.loom!;
    const support = loom.nodes.find(node => node.id === world.player.standingOn);
    if (support?.branch === 'upper' || support?.branch === 'lower') visitedBranches.add(support.branch);
    if (loom.rerolls > before.rerolls) {
      rerollsObserved += 1;
      expect(loom.nodes.map(node => [node.id, node.x, node.y, node.w])).not.toEqual(before.nodes.map(node => [node.id, node.x, node.y, node.w]));
      expect(world.history).toHaveLength(1); expect(world.history[0].at).toBe(world.save.elapsedMs);
      expect(world.player.grounded).toBe(true);
      expect(world.save.actionCounts).toEqual(previous.save.actionCounts);
      const survivingIds = new Set(previous.pickups.map(pickup => pickup.id));
      expect(world.pickups.every(pickup => survivingIds.has(pickup.id))).toBe(true);
      rescuedFall ||= !previous.player.grounded && previous.player.vy > 0 && before.nodes.some(node => node.collapsed && Math.abs(node.x + node.w / 2 - previous.player.x) < node.w);
    }
    if (world.boss.active) phases.add(world.boss.phase);
    if (world.boss.action === 'attack') attacks.add(world.boss.phase);
    presentationTaken ||= loom.hpUiTaken && loom.stemsLost > 0;
    if (loom.turn.successes > before.turn.successes) {
      turns.add(world.boss.phase);
      expect(previous.loom!.turn.startX! - world.player.x).toBeGreaterThanOrEqual(32);
      expect(world.player.x).toBeLessThanOrEqual(loom.turn.lineX - 14);
      expect(world.player.facing).toBe(-1); expect(world.player.dashUntil).toBeGreaterThan(world.save.elapsedMs);
      narrowTurn ||= loom.narrow.w <= 200;
      presentationReturnedDuringPlay ||= world.mode === 'playing' && !loom.hpUiTaken && loom.stemsLost === 0;
    }
    frames += 1;
  }
  console.info('Loom normal-input route', { seed, branch, mode: world.mode, elapsedMs: world.save.elapsedMs, hp: world.save.hp, x: world.player.x, y: world.player.y, bossHp: world.boss.hp, frames, rerollsObserved, turns: world.loom!.turn.successes, narrow: world.loom!.narrow.w, visited: [...visitedBranches] });
  expect(world.mode).toBe('cleared'); expect(world.boss.hp).toBe(0);
  expect([...rooms]).toEqual([1, 2]); expect([...phases]).toEqual([1, 2, 3]); expect([...attacks]).toEqual([1, 2, 3]); expect([...turns]).toEqual([1, 2, 3]);
  expect([...visitedBranches]).toEqual([branch]); expect(rerollsObserved).toBe(1); expect(rescuedFall).toBe(true);
  expect(narrowTurn).toBe(true); expect(presentationTaken).toBe(true); expect(presentationReturnedDuringPlay).toBe(true);
  expect(world.loom).toMatchObject({ hpUiTaken: false, stemsLost: 0 }); expect(world.save.doom).toBe(8);
  expect(world.save.stage).toBe(5); expect(world.save.checkpoint).toBe(0); expect(isGameSave(world.save)).toBe(true);
  expect(Object.keys(world.save.actionCounts).sort()).toEqual(['dashes', 'insights', 'rewinds', 'shots']);
});
