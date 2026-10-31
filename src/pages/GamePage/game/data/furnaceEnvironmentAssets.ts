import { FURNACE_TERRAIN_ROLES, FURNACE_PROP_ROLES, type FurnaceTerrainRole, type FurnacePropRole } from '../systems/FurnaceEnvironmentPlan';
import type { FurnaceEnvironmentBinding } from '../systems/FurnaceEnvironmentRenderer';

export type FurnaceEnvironmentAsset = Readonly<{
  key: string; image: string; frames: readonly string[]; frameWidth: number; frameHeight: number;
}> & (
  | Readonly<{ load: 'spritesheet'; margin: number; spacing: number; startFrame: number; endFrame: number }>
  | Readonly<{ load: 'atlas'; atlas: string }>
);
// Actual packed order, not mother-grid order: bulkhead-a8, ledge-right9.
const terrain = Object.freeze(Object.fromEntries(FURNACE_TERRAIN_ROLES.map((role, i) => [role, String(i)])) as Record<FurnaceTerrainRole, string>);
const props = Object.freeze(Object.fromEntries(FURNACE_PROP_ROLES.map((role, i) => [role, `furnace-props ${i}.aseprite`])) as Record<FurnacePropRole, string>);
export const FURNACE_ENVIRONMENT_BINDING: FurnaceEnvironmentBinding = Object.freeze({
  terrain: Object.freeze({ key: 'environment-furnace-terrain', frames: terrain }),
  props: Object.freeze({ key: 'environment-furnace-props', frames: props }),
});
/** Authoring map is provenance, never level collision. */
export const FURNACE_ENVIRONMENT_ASSETS: readonly FurnaceEnvironmentAsset[] = Object.freeze([
  Object.freeze({ key: FURNACE_ENVIRONMENT_BINDING.terrain.key, image: 'game/furnace-terrain.png', load: 'spritesheet' as const,
    frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, startFrame: 0, endFrame: 31,
    frames: Object.freeze(FURNACE_TERRAIN_ROLES.map(role => terrain[role])) }),
  Object.freeze({ key: FURNACE_ENVIRONMENT_BINDING.props.key, image: 'game/furnace-props.png', atlas: 'game/furnace-props.json', load: 'atlas' as const,
    frameWidth: 64, frameHeight: 64, frames: Object.freeze(FURNACE_PROP_ROLES.map(role => props[role])) }),
]);
