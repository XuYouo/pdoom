export const PICKUP_ROLES = Object.freeze(['token', 'compute', 'heal'] as const);
export type PickupRole = typeof PICKUP_ROLES[number];
export interface PickupBinding {
  readonly key: string; readonly frames: Readonly<Record<PickupRole, string>>;
}
export const PICKUP_BINDING: PickupBinding = Object.freeze({
  key: 'pickup-items',
  frames: Object.freeze({
    token: 'pickup-items 0.aseprite', compute: 'pickup-items 1.aseprite', heal: 'pickup-items 2.aseprite',
  }),
});
/** Static frame roles only; the simulation owns collection and the clock. */
export const PICKUP_ASSET = Object.freeze({
  key: PICKUP_BINDING.key, image: 'game/pickup-items.png', atlas: 'game/pickup-items.json', load: 'atlas' as const,
  frameWidth: 32, frameHeight: 32,
  frames: Object.freeze(PICKUP_ROLES.map(role => PICKUP_BINDING.frames[role])),
});
