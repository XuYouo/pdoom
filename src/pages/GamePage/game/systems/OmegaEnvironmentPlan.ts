import type { Platform, WorldState } from '../entities/model';
import { worldPlatforms } from './platforms';

export const OMEGA_TERRAIN_ROLES = Object.freeze([
  'corridor-top-left', 'corridor-top-mid-a', 'corridor-top-mid-b', 'corridor-top-right',
  'corridor-body-left', 'corridor-body-a', 'corridor-body-b', 'corridor-body-right',
  'corridor-foot-left', 'corridor-foot-a', 'corridor-foot-b', 'corridor-foot-right',
  'chamber-top-left', 'chamber-top-mid-a', 'chamber-top-mid-b', 'chamber-top-right',
  'chamber-body-left', 'chamber-body-a', 'chamber-body-b', 'chamber-body-right',
  'chamber-foot-left', 'chamber-foot-a', 'chamber-foot-b', 'chamber-foot-right',
  'observer-left', 'observer-mid-a', 'observer-mid-b', 'observer-right',
  'quiet-wall', 'rear-channel', 'rack-base', 'floor-recess',
] as const);
export const OMEGA_PROP_ROLES = Object.freeze([
  'compute-bank', 'cable-arch', 'air-duct', 'empty-chair', 'final-door-frame', 'standing-mirror',
] as const);
export const OMEGA_IMAGE_LIMIT = 384;
export type OmegaTerrainRole = typeof OMEGA_TERRAIN_ROLES[number];
export type OmegaPropRole = typeof OMEGA_PROP_ROLES[number];
export interface OmegaRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface Stamp extends OmegaRect { readonly id: string; readonly platformId: string | null; readonly depth: number }
export type OmegaCommand = Stamp & (
  | { readonly kind: 'tile'; readonly role: OmegaTerrainRole }
  | { readonly kind: 'prop'; readonly role: OmegaPropRole }
);
export interface OmegaEnvironmentPlan { readonly commands: readonly OmegaCommand[]; readonly platformIds: readonly string[] }
const intersects = (a: OmegaRect, b: OmegaRect) => a.x < b.x + b.width && a.x + a.width > b.x
  && a.y < b.y + b.height && a.y + a.height > b.y;
function validView(v: OmegaRect): boolean {
  return [v.x, v.y, v.width, v.height].every(Number.isFinite) && v.x >= 0 && v.x <= 2560
    && v.y === 0 && v.width > 0 && v.width <= 640 && v.height > 0 && v.height <= 360;
}
function validPlatform(p: Readonly<Platform>): boolean {
  return typeof p.id === 'string' && !!p.id.trim() && [p.x, p.y, p.w, p.h].every(Number.isSafeInteger)
    && p.x >= 0 && p.y >= 0 && p.w >= 32 && p.x + p.w <= 3200 && p.y + p.h <= 360
    && ((p.h === 40 && p.y === 320 && !p.oneWay) || (p.h === 12 && p.oneWay === true))
    && [p.oneWay, p.protected, p.fragile].every(v => v === undefined || typeof v === 'boolean');
}
function readPlan(world: Readonly<WorldState>, view: OmegaRect): OmegaEnvironmentPlan | null {
  const c = world.chapter, omega = world.omega;
  if (!validView(view) || c.stage !== 5 || c.width !== 3200 || c.height !== 360 || c.floor !== 320 || !omega) return null;
  if (world.loom || world.furnace || !Array.isArray(c.platforms) || c.platforms.length !== 6
    || c.platforms.some(p => !validPlatform(p)) || new Set(c.platforms.map(p => p.id)).size !== c.platforms.length
    || !Array.isArray(world.collapsed) || world.collapsed.some(id => typeof id !== 'string')) return null;
  const { door, chair, glass } = omega;
  if (door.x !== 2480 || door.y !== 224 || door.w !== 40 || door.h !== 96
    || chair.x !== 2800 || chair.y !== 300 || glass.x !== 3001 || glass.y !== 222 || glass.w !== 48 || glass.h !== 98) return null;
  const commands: OmegaCommand[] = [], platformIds: string[] = [];
  const add = (command: OmegaCommand) => {
    if (!intersects(command, view)) return;
    if (commands.length >= OMEGA_IMAGE_LIMIT) throw Error('Omega visible command budget');
    commands.push(command);
  };
  for (const p of worldPlatforms(world)) {
    const bounds = { x: p.x, y: p.y, width: p.w, height: p.h };
    if (!intersects(bounds, view)) continue;
    platformIds.push(p.id);
    const rows = p.h === 12 ? [12] : [16, 16, 8];
    for (const [row, height] of rows.entries()) {
      const y = p.y + row * 16;
      if (y >= view.y + view.height || y + height <= view.y) continue;
      const stamp = (suffix: string, side: number, x: number, width: number) => {
        const family = p.h === 12 ? 24 : (x >= door.x ? 12 : 0) + row * 4;
        add({ kind: 'tile', role: OMEGA_TERRAIN_ROLES[family + side], id: `support:${p.id}:${row}:${suffix}`,
          platformId: p.id, x, y, width, height, depth: 0.5 });
      };
      stamp('left', 0, p.x, 16);
      const left = p.x + 16, right = p.x + p.w - 16;
      // Compute the visible middle band first: never create the605 whole-world support commands.
      const first = Math.max(0, Math.floor((view.x - left) / 16));
      const last = Math.min(Math.ceil((right - left) / 16) - 1, Math.ceil((view.x + view.width - left) / 16) - 1);
      for (let index = first; index <= last; index++) {
        const x = left + index * 16;
        stamp(`middle:${index}`, 1 + index % 2, x, Math.min(16, right - x));
      }
      stamp('right', 3, right, 16);
    }
  }
  const props: readonly [OmegaPropRole, number, number][] = [
    ['compute-bank', 272 - 32, c.floor - 120], ['cable-arch', 1100 - 32, c.floor - 120],
    ['air-duct', 1840 - 32, c.floor - 120], ['empty-chair', chair.x - 32, c.floor - 120],
    ['final-door-frame', door.x - 12, door.y - 24], ['standing-mirror', glass.x - 8, glass.y - 22],
  ];
  for (const [role, x, y] of props) add({ kind: 'prop', role, id: `prop:${role}`, platformId: null,
    x, y, width: 64, height: 128, depth: -5 });
  return { commands, platformIds };
}
/** Read only real supports; malformed data/view/budget never returns a partial skin. */
export function planOmegaEnvironment(world: Readonly<WorldState>, view: OmegaRect): OmegaEnvironmentPlan | null {
  try { return readPlan(world, view); } catch { return null; }
}
