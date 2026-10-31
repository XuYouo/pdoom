import type { BasiliskSpriteBinding } from '../systems/BasiliskSpriteRenderer';

/** Frozen native export: donation mode first, then idle/tell/attack/recover. */
export const BASILISK_BINDING: BasiliskSpriteBinding = Object.freeze({
  key: 'basilisk', frames: Object.freeze(Array.from({ length: 8 }, (_, index) => `basilisk ${index}.aseprite`)),
});
export const BASILISK_ASSET = Object.freeze({
  ...BASILISK_BINDING, image: 'game/basilisk.png', atlas: 'game/basilisk.json', frameWidth: 96, frameHeight: 96,
});
