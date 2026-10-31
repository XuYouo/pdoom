/** Native twelve-pose source verified against the exported PNG/JSON and live Aseprite document. */
export const SYDNEY_ASSET = Object.freeze({
  kind: 'sydney' as const,
  key: 'boss-sydney',
  image: 'game/sydney.png',
  atlas: 'game/sydney.json',
  frameWidth: 96,
  frameHeight: 96,
  frameCount: 12,
  frames: Object.freeze(['sydney 0.aseprite', 'sydney 1.aseprite', 'sydney 2.aseprite', 'sydney 3.aseprite', 'sydney 4.aseprite', 'sydney 5.aseprite', 'sydney 6.aseprite', 'sydney 7.aseprite', 'sydney 8.aseprite', 'sydney 9.aseprite', 'sydney 10.aseprite', 'sydney 11.aseprite'] as const),
  // Preview metadata only: Core, never an animation clock, selects the actual pose.
  frameDurations: Object.freeze([600, 1100, 300, 1500, 600, 1100, 300, 1500, 600, 900, 300, 1250]),
  pivot: Object.freeze({ x: 48, y: 48 }),
});
/** Phase-2/3 idle frames complete the static matrix; normal Core play never enters those poses. */
export const SYDNEY_BINDING = Object.freeze({ key: SYDNEY_ASSET.key, frames: SYDNEY_ASSET.frames });
