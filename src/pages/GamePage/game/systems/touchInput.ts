/** Complete low-frequency touch state, independent of React, Phaser and browser events. */
export interface TouchControlState {
  move: -1 | 0 | 1;
  jump: boolean;
  fire: boolean;
  dash: boolean;
  rewind: boolean;
  insight: boolean;
  reroll: boolean;
  revive: boolean;
  aimDirection: { x: number; y: number } | null;
}

export const EMPTY_TOUCH_INPUT: Readonly<TouchControlState> = Object.freeze({
  move: 0, jump: false, fire: false, dash: false, rewind: false, insight: false, reroll: false, revive: false, aimDirection: null,
});
