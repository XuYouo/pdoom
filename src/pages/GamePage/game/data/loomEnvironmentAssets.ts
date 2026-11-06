import { LOOM_TERRAIN_ROLES, LOOM_PROP_ROLES, type LoomTerrainRole, type LoomPropRole } from '../systems/LoomEnvironmentPlan';
import type { LoomEnvironmentBinding } from '../systems/LoomEnvironmentRenderer';
export type LoomEnvironmentAsset = Readonly<{
  key: string; image: string; frames: readonly string[]; frameWidth: number; frameHeight: number;
}> & (
  | Readonly<{ load: 'spritesheet'; margin: number; spacing: number; startFrame: number; endFrame: number }>
  | Readonly<{ load: 'atlas'; atlas: string }>
);

const terrain = Object.freeze(Object.fromEntries(LOOM_TERRAIN_ROLES.map((role, i) => [role, String(i)])) as Record<LoomTerrainRole, string>);
const props = Object.freeze(Object.fromEntries(LOOM_PROP_ROLES.map((role, i) => [role, `loom-props ${i}.aseprite`])) as Record<LoomPropRole, string>);
export const LOOM_ENVIRONMENT_BINDING: LoomEnvironmentBinding = Object.freeze({
  terrain: Object.freeze({ key: 'environment-loom-terrain', frames: terrain }),
  props: Object.freeze({ key: 'environment-loom-props', frames: props }),
});
/** The exported authoring map is provenance, never a new platform/collision map. */
export const LOOM_ENVIRONMENT_ASSETS: readonly LoomEnvironmentAsset[] = Object.freeze([
  Object.freeze({ key: LOOM_ENVIRONMENT_BINDING.terrain.key, image: 'game/loom-terrain.png', load: 'spritesheet' as const,
    frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, startFrame: 0, endFrame: 31,
    frames: Object.freeze(LOOM_TERRAIN_ROLES.map(role => terrain[role])) }),
  Object.freeze({ key: LOOM_ENVIRONMENT_BINDING.props.key, image: 'game/loom-props.png', atlas: 'game/loom-props.json', load: 'atlas' as const,
    frameWidth: 64, frameHeight: 64, frames: Object.freeze(LOOM_PROP_ROLES.map(role => props[role])) }),
]);
