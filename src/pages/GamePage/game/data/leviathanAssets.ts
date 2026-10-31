import type { LeviathanSpriteBinding } from '../systems/LeviathanSpriteRenderer';

/** Native160: closed rotations0..3, then real weak-open rotations0..3. ASCII export names. */
export const LEVIATHAN_BINDING: LeviathanSpriteBinding = Object.freeze({
  key: 'boss-leviathan',
  frames: Object.freeze(Array.from({ length: 8 }, (_, index) => `leviathan ${index}.aseprite`)),
});
export const LEVIATHAN_ASSET = Object.freeze({
  ...LEVIATHAN_BINDING, image: 'game/leviathan.png', atlas: 'game/leviathan.json', frameWidth: 160, frameHeight: 160,
});
