import type { ChinchillaSpriteBinding } from '../systems/ChinchillaSpriteRenderer';

const nativeBinding = {
  key: 'chinchilla',
  frames: { idle: 'chinchilla 0.aseprite', tell: 'chinchilla 1.aseprite', recover: 'chinchilla 2.aseprite' },
} as const satisfies ChinchillaSpriteBinding;
export const CHINCHILLA_BINDING = Object.freeze({ key: nativeBinding.key, frames: Object.freeze(nativeBinding.frames) });
export const CHINCHILLA_ASSET = Object.freeze({
  key: CHINCHILLA_BINDING.key, image: 'game/chinchilla.png', atlas: 'game/chinchilla.json',
  frameWidth: 32, frameHeight: 32, frames: Object.freeze(Object.values(CHINCHILLA_BINDING.frames)),
});
