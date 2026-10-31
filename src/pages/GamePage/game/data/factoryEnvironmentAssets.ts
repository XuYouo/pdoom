import { FACTORY_TERRAIN_ROLES, FACTORY_PROP_ROLES } from '../systems/FactoryEnvironmentPlan';
import type { FactoryEnvironmentBinding } from '../systems/FactoryEnvironmentRenderer';

export type FactoryEnvironmentAsset = Readonly<{ key: string; image: string; frames: readonly string[]; frameWidth: number; frameHeight: number }> & (
  | Readonly<{ load: 'spritesheet'; margin: number; spacing: number; startFrame: number; endFrame: number }>
  | Readonly<{ load: 'atlas'; atlas: string }>
);

/** Actual static export mapping: wall-a8 and clip-fill-a9 precede floor-left10. Not role order. */
const nativeFrames = {
  "terrain": {
    "key": "environment-factory-terrain",
    "frames": {
      "protected-left": "0",
      "protected-middle": "1",
      "protected-right": "2",
      "protected-fill": "3",
      "service-left": "4",
      "service-middle": "5",
      "service-right": "6",
      "service-fill": "7",
      "floor-left": "10",
      "floor-middle": "11",
      "floor-right": "12",
      "floor-fill-a": "13",
      "floor-fill-b": "14",
      "base-left": "15",
      "base-middle": "16",
      "base-right": "17",
      "wall-a": "8",
      "wall-b": "18",
      "rail": "19",
      "rail-joint": "20",
      "conduit": "21",
      "conduit-elbow": "22",
      "vent": "23",
      "panel": "24",
      "clip-fill-a": "9",
      "clip-fill-b": "25",
      "clip-fill-c": "26",
      "clip-surface-a": "27",
      "clip-surface-b": "28",
      "wall-left": "29",
      "wall-right": "30",
      "floor-fill-c": "31"
    }
  },
  "props": {
    "key": "environment-factory-props",
    "frames": {
      "wire-spool": "factory-props 0.aseprite",
      "clip-press": "factory-props 1.aseprite",
      "clip-hopper": "factory-props 2.aseprite",
      "service-cabinet": "factory-props 3.aseprite",
      "conduit-junction": "factory-props 4.aseprite",
      "inspection-grille": "factory-props 5.aseprite"
    }
  }
} as const;
export const FACTORY_ENVIRONMENT_BINDING: FactoryEnvironmentBinding = Object.freeze({
  terrain: Object.freeze({ key: nativeFrames.terrain.key, frames: Object.freeze(nativeFrames.terrain.frames) }),
  props: Object.freeze({ key: nativeFrames.props.key, frames: Object.freeze(nativeFrames.props.frames) }),
});
/** View resources only. The Aseprite map is never imported as collision geometry. */
export const FACTORY_ENVIRONMENT_ASSETS: readonly FactoryEnvironmentAsset[] = Object.freeze([
  Object.freeze({ key: FACTORY_ENVIRONMENT_BINDING.terrain.key, image: 'game/factory-terrain.png', load: 'spritesheet' as const, frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, startFrame: 0, endFrame: 31, frames: Object.freeze(FACTORY_TERRAIN_ROLES.map(role => FACTORY_ENVIRONMENT_BINDING.terrain.frames[role])) }),
  Object.freeze({ key: FACTORY_ENVIRONMENT_BINDING.props.key, image: 'game/factory-props.png', atlas: 'game/factory-props.json', load: 'atlas' as const, frameWidth: 64, frameHeight: 64, frames: Object.freeze(FACTORY_PROP_ROLES.map(role => FACTORY_ENVIRONMENT_BINDING.props.frames[role])) }),
]);
