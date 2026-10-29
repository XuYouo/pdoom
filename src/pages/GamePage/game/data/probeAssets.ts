import type { ProbeSpriteBinding } from '../systems/ProbeSpriteRenderer';

/** Actual native Aseprite keys. Probe physics and replication do not come from this atlas. */
const nativeBinding = {
  "key": "von-neumann-probe",
  "frames": {
    "seek-a": "von-neumann-probe 0.aseprite",
    "seek-b": "von-neumann-probe 1.aseprite",
    "tell": "von-neumann-probe 2.aseprite",
    "consume": "von-neumann-probe 3.aseprite"
  }
} as const satisfies ProbeSpriteBinding;
export const PROBE_BINDING = Object.freeze({ key: nativeBinding.key, frames: Object.freeze(nativeBinding.frames) });
export const PROBE_ASSET = Object.freeze({
  key: PROBE_BINDING.key, image: 'game/von-neumann-probe.png', atlas: 'game/von-neumann-probe.json',
  frameWidth: 32, frameHeight: 32, frames: Object.freeze(Object.values(PROBE_BINDING.frames)),
});
