import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/pages/GamePage/game/data/chapterOne';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import type { FrameInput, Platform, Player } from '../../src/pages/GamePage/game/entities/model';
import { movePlayer } from '../../src/pages/GamePage/game/systems/controller';
import { createPlayer } from '../../src/pages/GamePage/game/systems/rules';

const floor: Platform[] = [{ id: 'floor', x: 0, y: 320, w: 1000, h: 40 }];
const tick = (p: Player, input: Partial<FrameInput> = {}, now = 1000, platforms = floor) => movePlayer(p, { ...EMPTY_INPUT, ...input }, platforms, now, TUNING.stepMs / 1000, false);

describe('fixed-step platform controller', () => {
  it('lands on a solid floor and only permits buffered/coyote jumps', () => {
    const p = { ...createPlayer(100, 307, 0), vy: 180 };
    const landed = tick(p);
    expect(landed.player.y).toBe(309);
    expect(landed.player.grounded).toBe(true);
    const jump = tick(landed.player, { jumpPressed: true, jumpHeld: true });
    expect(jump.player.vy).toBeLessThan(-400);
    expect(jump.player.grounded).toBe(false);
    expect(jump.player.coyoteUntil).toBe(0);
    const noDouble = tick(jump.player, { jumpPressed: true, jumpHeld: true }, 1017);
    expect(noDouble.player.vy).toBeGreaterThan(jump.player.vy);
  });
  it('uses 110ms coyote and 130ms jump buffering', () => {
    const p = { ...createPlayer(100, 270, 0), coyoteUntil: 1090, grounded: false };
    expect(tick(p, { jumpPressed: true, jumpHeld: true }, 1080).player.vy).toBeLessThan(0);
    expect(tick(p, { jumpPressed: true, jumpHeld: true }, 1100).player.vy).toBeGreaterThan(0);
    const buffered = tick({ ...p, coyoteUntil: 0, y: 304, vy: 220 }, { jumpPressed: true, jumpHeld: true }, 1000);
    const landed = tick(buffered.player, { jumpHeld: true }, 1017);
    const bounced = tick(landed.player, { jumpHeld: true }, 1034);
    expect(bounced.player.vy).toBeLessThan(0);
  });
  it('cuts a released jump and gives dash a finite cooldown', () => {
    const p = { ...createPlayer(100, 200, 0), vy: -400 };
    expect(tick(p, { jumpHeld: false }).player.vy).toBeGreaterThan(-180);
    const dash = tick(p, { move: 1, dashPressed: true });
    expect(dash.dashed).toBe(true);
    expect(dash.player.vx).toBe(TUNING.dashSpeed);
    expect(tick(dash.player, { dashPressed: true }, 1020).dashed).toBe(false);
    expect(tick(dash.player, { dashPressed: true }, 2000).dashed).toBe(true);
  });
  it('passes through the underside of one-way ledges and lands from above', () => {
    const ledge: Platform[] = [{ id: 'ledge', x: 50, y: 200, w: 150, h: 12, oneWay: true }];
    const rising = tick({ ...createPlayer(100, 225, 0), vy: -400 }, { jumpHeld: true }, 1000, ledge);
    expect(rising.player.vy).toBeLessThan(0);
    const falling = tick({ ...createPlayer(100, 186, 0), vy: 300 }, {}, 1000, ledge);
    expect(falling.player.y).toBe(189);
    expect(falling.player.grounded).toBe(true);
  });
  it('keeps the mushroom ceiling safe and clamps the boss arena', () => {
    const p = { ...createPlayer(2220, 19, 0), invertedUntil: 5000, vy: -300 };
    const result = movePlayer(p, { ...EMPTY_INPUT, move: -1 }, floor, 1000, 1 / 60, true);
    expect(result.player.x).toBeGreaterThanOrEqual(2252);
    expect(result.player.y).toBe(18);
    expect(result.player.grounded).toBe(true);
  });
});
