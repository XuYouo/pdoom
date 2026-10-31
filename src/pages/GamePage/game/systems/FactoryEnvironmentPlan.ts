import type { Platform } from '../entities/model';

// Semantic names, never packed atlas indices. Every binding role must be admitted.
export const FACTORY_TERRAIN_ROLES = Object.freeze([
  'protected-left', 'protected-middle', 'protected-right', 'protected-fill',
  'service-left', 'service-middle', 'service-right', 'service-fill',
  'floor-left', 'floor-middle', 'floor-right', 'floor-fill-a', 'floor-fill-b', 'base-left', 'base-middle', 'base-right',
  'wall-a', 'wall-b', 'rail', 'rail-joint', 'conduit', 'conduit-elbow', 'vent', 'panel',
  'clip-fill-a', 'clip-fill-b', 'clip-fill-c', 'clip-surface-a', 'clip-surface-b', 'wall-left', 'wall-right', 'floor-fill-c',
] as const);
export const FACTORY_PROP_ROLES = Object.freeze(['wire-spool', 'clip-press', 'clip-hopper', 'service-cabinet', 'conduit-junction', 'inspection-grille'] as const);
export type FactoryTerrainRole = typeof FACTORY_TERRAIN_ROLES[number];
export type FactoryPropRole = typeof FACTORY_PROP_ROLES[number];
export const FACTORY_TILE_SIZE = 16, FACTORY_PROP_SIZE = 64, FACTORY_WIDTH = 640, FACTORY_HEIGHT = 2040, FACTORY_BAND_HEIGHT = 512;
export interface FactoryRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface FactoryPlanInput {
  readonly chapter: Readonly<{ stage: number; width: number; height: number; signs?: readonly Readonly<{ x: number; y: number; text: string }>[] }>;
  readonly collapsed: readonly string[];
}
export interface FactoryRepeat extends FactoryRect {
  readonly kind: 'repeat'; readonly role: FactoryTerrainRole; readonly platformId: string | null;
  readonly alpha: number; readonly tileX: number; readonly tileY: number;
}
export interface FactoryProp extends FactoryRect { readonly kind: 'prop'; readonly role: FactoryPropRole; readonly alpha: number }
export type FactoryCommand = FactoryRepeat | FactoryProp;
export interface FactoryBand extends FactoryRect { readonly commands: readonly FactoryCommand[] }
export interface FactoryEnvironmentPlan { readonly width: number; readonly height: number; readonly bands: readonly FactoryBand[] }
export interface FactorySeaRegion extends FactoryRect { readonly visible: boolean; readonly tileX: number; readonly tileY: number }
export interface FactorySeaPlan { readonly fill: FactorySeaRegion; readonly surface: FactorySeaRegion }
const overlaps = (a: FactoryRect, b: FactoryRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const repeat = (role: FactoryTerrainRole, x: number, y: number, width: number, height: number, platformId: string | null = null, alpha = 1, tileX = 0): FactoryRepeat => Object.freeze({ kind: 'repeat', role, x, y, width, height, platformId, alpha, tileX, tileY: 0 });
const PROP_PLACES: readonly (readonly [FactoryPropRole, number, number])[] = Object.freeze([
  ['wire-spool', 552, 1744], ['clip-press', 24, 1504], ['clip-hopper', 552, 1152],
  ['service-cabinet', 24, 800], ['conduit-junction', 552, 640], ['inspection-grille', 24, 336],
] as const);
/** Only actual Core surfaces enter the physical union. Art never supplies a collider. */
export function planFactoryEnvironment(world: FactoryPlanInput, platforms: readonly Readonly<Platform>[]): FactoryEnvironmentPlan | null {
  const chapter = world.chapter;
  if (chapter.stage !== 2 || chapter.width !== 640 || chapter.height !== 2040 || !Array.isArray(platforms) || !Array.isArray(world.collapsed)) return null;
  const omitted = new Set(world.collapsed), active = platforms.filter(p => !omitted.has(p.id)), ids = new Set<string>();
  for (const p of active) {
    if (typeof p.id !== 'string' || !p.id.trim() || ids.has(p.id) || ![p.x, p.y, p.w, p.h].every(Number.isSafeInteger)) return null;
    if (p.x < 0 || p.y < 0 || p.w <= 0 || p.h <= 0 || p.x + p.w > 640 || p.y + p.h > 2040) return null;
    if ((p.oneWay !== undefined && typeof p.oneWay !== 'boolean') || (p.protected !== undefined && typeof p.protected !== 'boolean')) return null;
    ids.add(p.id);
  }
  const signs = chapter.signs ?? [];
  if (!Array.isArray(signs) || signs.some(s => !Number.isFinite(s.x) || !Number.isFinite(s.y) || typeof s.text !== 'string')) return null;
  const labels = signs.map(s => { const lines = s.text.split('\n'); return { x: s.x - 4, y: s.y - 4, width: Math.max(...lines.map((line: string) => line.length)) * 10 + 8, height: lines.length * 14 + 8 }; });
  const commands: FactoryCommand[] = [repeat('wall-a', 0, 0, 640, 2040, null, 0.16)];
  commands.push(repeat('wall-left', 0, 0, 16, 2040, null, 0.18), repeat('wall-right', 624, 0, 16, 2040, null, 0.18));
  for (const x of [16, 608]) commands.push(repeat('rail', x, 0, 16, 2040, null, 0.18));
  for (let y = 16; y < 2040; y += 128) commands.push(repeat('wall-b', 48, y, 544, Math.min(96, 2040 - y), null, 0.12));
  for (const [role, x, y] of PROP_PLACES) {
    const prop: FactoryProp = Object.freeze({ kind: 'prop', role, x, y, width: 64, height: 64, alpha: 0.18 });
    if (!active.some(p => overlaps(prop, { x: p.x, y: p.y, width: p.w, height: p.h })) && !labels.some(label => overlaps(prop, label))) commands.push(prop);
  }
  for (const p of active) {
    // A 24px one-way arena is a SINGLE top, not two repeated 12/16px ledges.
    const family = p.h > 16 || !p.oneWay ? 'floor' : p.protected ? 'protected' : 'service';
    const h = Math.min(16, p.h), left = Math.min(16, Math.ceil(p.w / 2)), right = Math.min(16, p.w - left), middle = p.w - left - right;
    commands.push(repeat(`${family}-left`, p.x, p.y, left, h, p.id));
    if (middle) commands.push(repeat(`${family}-middle`, p.x + left, p.y, middle, h, p.id));
    if (right) commands.push(repeat(`${family}-right`, p.x + p.w - right, p.y, right, h, p.id, 1, 16 - right));
    if (p.h > 16) for (let x = 0; x < p.w; x += 16) {
      const fills = ['floor-fill-a', 'floor-fill-b', 'floor-fill-c'] as const;
      const role = fills[(Math.floor(p.x / 16) + Math.floor(p.y / 16) + x / 16) % 3];
      commands.push(repeat(role, p.x + x, p.y + 16, Math.min(16, p.w - x), p.h - 16, p.id));
    }
  }
  const bands: FactoryBand[] = [];
  for (let y = 0; y < 2040; y += 512) {
    const rect = { x: 0, y, width: 640, height: Math.min(512, 2040 - y) };
    // Never crop/reset command origins at a band edge: the framebuffer performs clipping.
    const local = commands.filter(c => overlaps(c, rect)).map(c => Object.freeze({ ...c, y: c.y - y }));
    bands.push(Object.freeze({ ...rect, commands: Object.freeze(local) }));
  }
  return Object.freeze({ width: 640, height: 2040, bands: Object.freeze(bands) });
}

/** The fill is clipped to the actual view; the surface is NEVER moved to the view top. */
export function planFactorySea(seaY: number, view: FactoryRect): FactorySeaPlan | null {
  if (![seaY, view.x, view.y, view.width, view.height].every(Number.isFinite) || seaY < 0) return null;
  if (view.width <= 0 || view.height <= 0 || view.width > 640 || view.height > 360 || view.x < 0 || view.y < 0 || view.x + view.width > 640 || view.y + view.height > 2040) return null;
  const bottom = view.y + view.height, top = Math.max(view.y, seaY), height = Math.max(0, bottom - top);
  return Object.freeze({
    fill: Object.freeze({ x: view.x, y: top, width: view.width, height, visible: height > 0, tileX: view.x, tileY: top }),
    surface: Object.freeze({ x: view.x, y: seaY, width: view.width, height: 16, visible: seaY < bottom && seaY + 16 > view.y, tileX: view.x, tileY: 0 }),
  });
}

export interface FactoryPattern { readonly width: number; readonly height: number; readonly commands: readonly FactoryRepeat[] }
/** Small, stationary source-pixel mosaics. Row offsets split the icon grid, not the source pixels. */
export function planFactorySeaPatterns(): Readonly<{ fill: FactoryPattern; surface: FactoryPattern }> {
  const fill: FactoryRepeat[] = [], surface: FactoryRepeat[] = [];
  const fills = ['clip-fill-a', 'clip-fill-b', 'clip-fill-c', 'clip-fill-a', 'clip-fill-c', 'clip-fill-b', 'clip-fill-b', 'clip-fill-a'] as const;
  [0, 8, 4, 12].forEach((shift, row) => {
    for (let col = shift ? -1 : 0; col < 8; col++) fill.push(repeat(fills[((col + row * 3) % 8 + 8) % 8], col * 16 + shift, row * 16, 16, 16));
  });
  const tops = ['clip-surface-a', 'clip-surface-a', 'clip-surface-b', 'clip-surface-a', 'clip-surface-b', 'clip-surface-b', 'clip-surface-a', 'clip-surface-b'] as const;
  tops.forEach((role, col) => surface.push(repeat(role, col * 16, 0, 16, 16)));
  return Object.freeze({ fill: Object.freeze({ width: 128, height: 64, commands: Object.freeze(fill) }), surface: Object.freeze({ width: 128, height: 16, commands: Object.freeze(surface) }) });
}
