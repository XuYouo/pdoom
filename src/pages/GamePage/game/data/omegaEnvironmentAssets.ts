import { OMEGA_TERRAIN_ROLES, OMEGA_PROP_ROLES, type OmegaTerrainRole, type OmegaPropRole } from '../systems/OmegaEnvironmentPlan';
import type { OmegaEnvironmentBinding } from '../systems/OmegaEnvironmentRenderer';
export type OmegaEnvironmentAsset = Readonly<{
  key: string; image: string; frames: readonly string[]; frameWidth: number; frameHeight: number;
}> & (
  | Readonly<{ load: 'spritesheet'; margin: number; spacing: number; startFrame: number; endFrame: number }>
  | Readonly<{ load: 'atlas'; atlas: string }>
);
const terrain = Object.freeze(Object.fromEntries(OMEGA_TERRAIN_ROLES.map((role, i) => [role, String(i)])) as Record<OmegaTerrainRole, string>);
const props = Object.freeze(Object.fromEntries(OMEGA_PROP_ROLES.map((role, i) => [role, `omega-props ${i}.aseprite`])) as Record<OmegaPropRole, string>);
export const OMEGA_ENVIRONMENT_BINDING: OmegaEnvironmentBinding = Object.freeze({
  terrain: Object.freeze({ key: 'environment-omega-terrain', frames: terrain }),
  props: Object.freeze({ key: 'environment-omega-props', frames: props }),
});
/** Source authoring map is provenance, never an additional collision map. */
export const OMEGA_ENVIRONMENT_ASSETS: readonly OmegaEnvironmentAsset[] = Object.freeze([
  Object.freeze({ key: OMEGA_ENVIRONMENT_BINDING.terrain.key, image: 'game/omega-terrain.png', load: 'spritesheet' as const,
    frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, startFrame: 0, endFrame: 31,
    frames: Object.freeze(OMEGA_TERRAIN_ROLES.map(role => terrain[role])) }),
  Object.freeze({ key: OMEGA_ENVIRONMENT_BINDING.props.key, image: 'game/omega-props.png', atlas: 'game/omega-props.json', load: 'atlas' as const,
    frameWidth: 64, frameHeight: 128, frames: Object.freeze(OMEGA_PROP_ROLES.map(role => props[role])) }),
]);
