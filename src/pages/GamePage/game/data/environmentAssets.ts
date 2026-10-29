/** Semantic roles only: their order is not a production pack index or atlas frame name. */
export const ENVIRONMENT_TILE_ROLES = Object.freeze([
  'stone-top-left', 'stone-top', 'stone-top-right', 'stone-side-left', 'stone-fill', 'stone-side-right', 'stone-fill-alt', 'stone-fill-worn',
  'moss-top-left', 'moss-top', 'moss-top-right', 'soil-side-left', 'soil-fill', 'soil-side-right', 'soil-fill-alt', 'soil-fill-root',
  'timber-ledge-left', 'timber-ledge', 'timber-ledge-right', 'root-ledge-left', 'root-ledge', 'root-ledge-right', 'wall-quiet', 'wall-blocks',
  'timber-column', 'timber-beam', 'timber-bracket', 'wall-fret', 'wall-recess', 'wall-moss', 'stone-top-alt', 'moss-top-alt',
] as const);
export const ENVIRONMENT_PROP_ROLES = Object.freeze([
  'scroll-cabinet', 'lattice-window', 'hanging-lantern', 'forest-trunk', 'forest-canopy', 'stone-lantern', 'root-clump', 'mushroom',
] as const);
export type EnvironmentTileRole = typeof ENVIRONMENT_TILE_ROLES[number];
export type EnvironmentPropRole = typeof ENVIRONMENT_PROP_ROLES[number];
export type EnvironmentFrameId = string | number;
export const ENVIRONMENT_TILE_SIZE = 16;
export const ENVIRONMENT_PROP_SIZE = 64;
export const ENVIRONMENT_MUSHROOM_PIVOT = Object.freeze({ x: 32, y: 32 });

export interface EnvironmentTextureBinding<Role extends string> {
  readonly key: string;
  readonly frames: Readonly<Record<Role, EnvironmentFrameId>>;
}
export interface EnvironmentBinding {
  readonly terrain: EnvironmentTextureBinding<EnvironmentTileRole>;
  readonly props: EnvironmentTextureBinding<EnvironmentPropRole>;
}
export type EnvironmentAsset = Readonly<{ key: string; image: string; frames: readonly EnvironmentFrameId[]; frameWidth: number; frameHeight: number }> & (
  | Readonly<{ load: 'spritesheet'; margin: number; spacing: number; startFrame: number; endFrame: number }>
  | Readonly<{ load: 'atlas'; atlas: string }>
);

/** Read from native exports, not role order. In particular soil-fill occupies slot8 before moss-top-left9. */
const nativeFrames = {
  "terrain": {
    "key": "environment-chapter-one-terrain",
    "frames": {
      "stone-top-left": "0",
      "stone-top": "1",
      "stone-top-right": "2",
      "stone-side-left": "3",
      "stone-fill": "4",
      "stone-side-right": "5",
      "stone-fill-alt": "6",
      "stone-fill-worn": "7",
      "moss-top-left": "9",
      "moss-top": "10",
      "moss-top-right": "11",
      "soil-side-left": "12",
      "soil-fill": "8",
      "soil-side-right": "13",
      "soil-fill-alt": "14",
      "soil-fill-root": "15",
      "timber-ledge-left": "16",
      "timber-ledge": "17",
      "timber-ledge-right": "18",
      "root-ledge-left": "19",
      "root-ledge": "20",
      "root-ledge-right": "21",
      "wall-quiet": "22",
      "wall-blocks": "23",
      "timber-column": "24",
      "timber-beam": "25",
      "timber-bracket": "26",
      "wall-fret": "27",
      "wall-recess": "28",
      "wall-moss": "29",
      "stone-top-alt": "30",
      "moss-top-alt": "31"
    }
  },
  "props": {
    "key": "environment-chapter-one-props",
    "frames": {
      "scroll-cabinet": "chapter-one-props 0.aseprite",
      "lattice-window": "chapter-one-props 1.aseprite",
      "hanging-lantern": "chapter-one-props 2.aseprite",
      "forest-trunk": "chapter-one-props 3.aseprite",
      "forest-canopy": "chapter-one-props 4.aseprite",
      "stone-lantern": "chapter-one-props 5.aseprite",
      "root-clump": "chapter-one-props 6.aseprite",
      "mushroom": "chapter-one-props 7.aseprite"
    }
  }
} as const;
export const ENVIRONMENT_BINDING: EnvironmentBinding = Object.freeze({
  terrain: Object.freeze({ key: nativeFrames.terrain.key, frames: Object.freeze(nativeFrames.terrain.frames) }),
  props: Object.freeze({ key: nativeFrames.props.key, frames: Object.freeze(nativeFrames.props.frames) }),
});
/** Local approved files; only their view is bound, never the exported Aseprite map as physics. */
export const ENVIRONMENT_ASSETS: readonly EnvironmentAsset[] = Object.freeze([
  Object.freeze({ key: ENVIRONMENT_BINDING.terrain.key, image: 'game/chapter-one-terrain.png', load: 'spritesheet' as const, frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, startFrame: 0, endFrame: 31, frames: Object.freeze(ENVIRONMENT_TILE_ROLES.map(role => ENVIRONMENT_BINDING.terrain.frames[role])) }),
  Object.freeze({ key: ENVIRONMENT_BINDING.props.key, image: 'game/chapter-one-props.png', atlas: 'game/chapter-one-props.json', load: 'atlas' as const, frameWidth: 64, frameHeight: 64, frames: Object.freeze(ENVIRONMENT_PROP_ROLES.map(role => ENVIRONMENT_BINDING.props.frames[role])) }),
]);
