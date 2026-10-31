import type { Platform } from '../entities/model';

// Actual packed slots from the exported mother map, not its semantic row order.
export const FURNACE_TERRAIN_ROLES = Object.freeze([
  'floor-top-a', 'floor-top-b', 'floor-body-a', 'floor-body-b', 'floor-foot',
  'rack-header-mid', 'ledge-left', 'ledge-mid', 'bulkhead-a', 'ledge-right',
  'lift-left', 'lift-mid', 'lift-right', 'grate-top', 'grate-body', 'bulkhead-b',
  'rack-left', 'rack-right', 'rack-header-left', 'rack-header-right',
  'rack-foot-left', 'rack-foot-right', 'conduit-v', 'conduit-h', 'conduit-elbow',
  'conduit-tee', 'service-panel', 'rack-foot-mid', 'candle-a', 'candle-b', 'ceiling-left', 'ceiling-right',
] as const);
export const FURNACE_PROP_ROLES = Object.freeze([
  'gpu-rack', 'coolant-manifold', 'power-bus', 'floor-exhaust', 'ceiling-aperture', 'lunar-porthole',
] as const);
export type FurnaceTerrainRole = typeof FURNACE_TERRAIN_ROLES[number];
export type FurnacePropRole = typeof FURNACE_PROP_ROLES[number];
export const FURNACE_WIDTH = 3280, FURNACE_HEIGHT = 360, FURNACE_FLOOR = 320, FURNACE_BAND_WIDTH = 512;
export interface FurnaceRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export type FurnaceGeometryRect = Readonly<Pick<Platform, 'id' | 'x' | 'y' | 'w' | 'h'>>;
type Sign = Readonly<{ x: number; y: number; text: string }>;
export interface FurnacePlanInput {
  readonly chapter: Readonly<{ stage: number; width: number; height: number; floor: number; signs?: readonly Sign[] }>;
  readonly furnace: Readonly<{ lifts: readonly FurnaceGeometryRect[]; heatZones: readonly FurnaceGeometryRect[] }> | null;
}
export interface FurnaceRepeat extends FurnaceRect {
  readonly kind: 'repeat'; readonly role: FurnaceTerrainRole; readonly alpha: 1;
  readonly tileX: number; readonly tileY: number;
}
export interface FurnaceProp extends FurnaceRect { readonly kind: 'prop'; readonly role: FurnacePropRole; readonly alpha: 1 }
export type FurnaceCommand = FurnaceRepeat | FurnaceProp;
export interface FurnaceSurface extends FurnaceRect { readonly id: string; readonly commands: readonly FurnaceCommand[] }
export interface FurnaceEnvironmentPlan {
  readonly width: number; readonly height: number;
  readonly backgrounds: readonly FurnaceSurface[]; readonly surfaces: readonly FurnaceSurface[]; readonly lifts: readonly FurnaceSurface[];
}
export interface FurnaceGeometry {
  readonly world: FurnacePlanInput; readonly platforms: readonly Readonly<Platform>[];
  readonly lifts: readonly FurnaceGeometryRect[]; readonly key: readonly unknown[];
}
const intersects = (a: FurnaceRect, b: FurnaceRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const validId = (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0;
function rect(value: FurnaceGeometryRect, moving = false): FurnaceGeometryRect | null {
  if (!value || !validId(value.id)) return null;
  const { id, x, y, w, h } = value;
  if (![x, w, h].every(Number.isSafeInteger) || !Number.isFinite(y) || (!moving && !Number.isSafeInteger(y))) return null;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > FURNACE_WIDTH || y + h > FURNACE_HEIGHT) return null;
  if (moving && (y < 140 || y > 320)) return null;
  return Object.freeze({ id, x, y, w, h });
}
const byId = (a: FurnaceGeometryRect, b: FurnaceGeometryRect) => a.id.localeCompare(b.id);
/** Small immutable geometry snapshot; no phases, dy, timers, actor or save reads. */
export function readFurnaceGeometry(world: FurnacePlanInput, platforms: readonly Readonly<Platform>[]): FurnaceGeometry | null {
  try {
    const c = world.chapter, f = world.furnace;
    if (c.stage !== 3 || c.width !== FURNACE_WIDTH || c.height !== FURNACE_HEIGHT || c.floor !== FURNACE_FLOOR || !f) return null;
    if (!Array.isArray(platforms) || !Array.isArray(f.lifts) || !Array.isArray(f.heatZones)) return null;
    const lifts: FurnaceGeometryRect[] = [], heat: FurnaceGeometryRect[] = [], liftIds = new Set<string>();
    for (const value of f.lifts) {
      const p = rect(value, true); if (!p || p.w !== 120 || p.h !== 12 || liftIds.has(p.id)) return null;
      liftIds.add(p.id); lifts.push(p);
    }
    const heatIds = new Set<string>(), ids = new Set<string>(), matched = new Set<string>(), solids: Readonly<Platform>[] = [];
    for (const value of f.heatZones) {
      const p = rect(value); if (!p || heatIds.has(p.id)) return null;
      heatIds.add(p.id); heat.push(p);
    }
    for (const value of platforms) {
      if (!value || !validId(value.id) || ids.has(value.id)) return null;
      ids.add(value.id);
      // Exclude genuine moving ids BEFORE requiring integer static coordinates.
      if (liftIds.has(value.id)) {
        const actual = lifts.find(lift => lift.id === value.id)!;
        if (value.x !== actual.x || value.y !== actual.y || value.w !== actual.w || value.h !== actual.h) return null;
        matched.add(value.id); continue;
      }
      const p = rect(value); if (!p || (p.h !== 12 && !(p.h === 40 && p.y === FURNACE_FLOOR))) return null;
      const { oneWay, protected: protectedSurface, fragile } = value;
      if ([oneWay, protectedSurface, fragile].some(v => v !== undefined && typeof v !== 'boolean')) return null;
      solids.push(Object.freeze({ ...p, oneWay, protected: protectedSurface, fragile }));
    }
    if (matched.size !== lifts.length) return null;
    const rawSigns = c.signs ?? [];
    if (!Array.isArray(rawSigns)) return null;
    const signs: Sign[] = [];
    for (const value of rawSigns) {
      if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || typeof value.text !== 'string') return null;
      signs.push(Object.freeze({ x: value.x, y: value.y, text: value.text }));
    }
    solids.sort(byId); lifts.sort(byId); heat.sort(byId);
    signs.sort((a, b) => a.x - b.x || a.y - b.y || a.text.localeCompare(b.text));
    const key: unknown[] = [c.stage, c.width, c.height, c.floor, solids.length, heat.length, lifts.length, signs.length];
    for (const p of solids) key.push(p.id, p.x, p.y, p.w, p.h, p.oneWay, p.protected, p.fragile);
    for (const z of heat) key.push(z.id, z.x, z.y, z.w, z.h);
    for (const l of lifts) key.push(l.id, l.x, l.w, l.h); // Moving y is deliberately NOT a cache key.
    for (const s of signs) key.push(s.x, s.y, s.text);
    const snapshot: FurnacePlanInput = Object.freeze({
      chapter: Object.freeze({ stage: 3, width: c.width, height: c.height, floor: c.floor, signs: Object.freeze(signs) }),
      furnace: Object.freeze({ lifts: Object.freeze(lifts), heatZones: Object.freeze(heat) }),
    });
    return Object.freeze({ world: snapshot, platforms: Object.freeze(solids), lifts: snapshot.furnace!.lifts, key: Object.freeze(key) });
  } catch { return null; }
}
const repeat = (role: FurnaceTerrainRole, x: number, y: number, width: number, height: number, tileX = 0): FurnaceRepeat =>
  Object.freeze({ kind: 'repeat', role, x, y, width, height, alpha: 1, tileX, tileY: 0 });
const prop = (role: FurnacePropRole, x: number, y: number): FurnaceProp =>
  Object.freeze({ kind: 'prop', role, x, y, width: 64, height: 64, alpha: 1 });
function surface(id: string, box: FurnaceRect, commands: readonly FurnaceCommand[]): FurnaceSurface {
  return Object.freeze({ id, ...box, commands: Object.freeze(commands) });
}
function ledge(p: FurnaceGeometryRect, family: 'ledge' | 'lift'): FurnaceCommand[] {
  const left = Math.min(16, Math.ceil(p.w / 2)), right = Math.min(16, p.w - left), middle = p.w - left - right;
  const out: FurnaceCommand[] = [repeat(`${family}-left`, 0, 0, left, p.h)];
  if (middle) out.push(repeat(`${family}-mid`, left, 0, middle, p.h));
  if (right) out.push(repeat(`${family}-right`, p.w - right, 0, right, p.h, 16 - right));
  return out;
}
function solid(p: FurnaceGeometryRect, heat: readonly FurnaceGeometryRect[]): FurnaceCommand[] {
  const out: FurnaceCommand[] = [];
  for (let x = 0; x < p.w; x += 16) for (let y = 0; y < p.h; y += 16) {
    const w = Math.min(16, p.w - x), h = Math.min(16, p.h - y), alternate = Math.floor((p.x + x) / 16) % 2;
    const role = y === 0 ? (alternate ? 'floor-top-b' : 'floor-top-a')
      : h <= 8 && y + h === p.h ? 'floor-foot' : alternate ? 'floor-body-b' : 'floor-body-a';
    out.push(repeat(role, x, y, w, h));
  }
  if (p.y === FURNACE_FLOOR && p.h >= 24) for (const z of heat) {
    if (z.y + z.h !== FURNACE_FLOOR || z.x >= p.x + p.w || z.x + z.w <= p.x) continue;
    const x = Math.max(0, z.x - p.x), right = Math.min(p.w, z.x + z.w - p.x);
    out.push(repeat('grate-top', x, 0, right - x, 16), repeat('grate-body', x, 16, right - x, Math.min(16, p.h - 16)));
    // The source vent starts at localY40. Its ink lands INSIDE the actual floor.
    out.push(prop('floor-exhaust', Math.round(z.x + z.w / 2 - 32) - p.x, -40));
  }
  return out;
}
/** Pure layout. Physical rectangles come only from the supplied Core surfaces. */
export function planFurnaceEnvironment(world: FurnacePlanInput, platforms: readonly Readonly<Platform>[]): FurnaceEnvironmentPlan | null {
  const geometry = readFurnaceGeometry(world, platforms); if (!geometry) return null;
  const { chapter, furnace } = geometry.world; if (!furnace) return null;
  const reserved: FurnaceRect[] = geometry.platforms.map(p => ({ x: p.x - 6, y: p.y - 26, width: p.w + 12, height: p.h + 32 }));
  for (const l of geometry.lifts) reserved.push({ x: l.x - 12, y: 56, width: l.w + 24, height: 276 });
  for (const z of furnace.heatZones) reserved.push({ x: z.x - 16, y: z.y - 28, width: z.w + 32, height: 36 });
  const labelRects: FurnaceRect[] = [];
  for (const s of chapter.signs ?? []) {
    const lines = s.text.split('\n');
    const label = { x: s.x - 4, y: s.y - 4, width: Math.max(...lines.map(line => line.length)) * 10 + 8, height: lines.length * 14 + 8 };
    reserved.push(label); labelRects.push(label);
  }
  // Quiet arena entrance and boss-label band; dressing does not invent barriers.
  reserved.push({ x: 2480, y: 0, width: 80, height: 360 }, { x: 2730, y: 202, width: 320, height: 36 });
  const background: FurnaceCommand[] = [repeat('bulkhead-a', 0, 0, FURNACE_WIDTH, FURNACE_HEIGHT)];
  for (let bay = 0; bay < FURNACE_WIDTH; bay += 160) for (const offset of [12, 88]) for (const y of [64, 144, 224]) {
    const item = prop('gpu-rack', bay + offset, y);
    if (item.x + 64 > FURNACE_WIDTH || reserved.some(r => intersects(r, item))) continue;
    const role: FurnacePropRole = y === 144 && offset === 88 && bay % 640 === 320 ? 'coolant-manifold'
      : y === 144 && offset === 12 && bay % 800 === 0 ? 'power-bus' : 'gpu-rack';
    background.push(prop(role, item.x, item.y));
  }
  // Keep the moon/breach over the real candle; inspect ink, not transparent64px padding.
  for (const lift of geometry.lifts) {
    const x = lift.x + lift.w / 2 - 32;
    const overhead = [
      { item: prop('lunar-porthole', x, -6), ink: { x: x + 12, y: 0, width: 40, height: 40 } },
      { item: prop('ceiling-aperture', x, 36), ink: { x, y: 40, width: 64, height: 18 } },
    ];
    for (const { item, ink } of overhead) {
      const blocked = geometry.platforms.some(p => intersects(ink, { x: p.x, y: p.y, width: p.w, height: p.h }));
      if (!blocked && !labelRects.some(r => intersects(r, ink))) background.push(item);
    }
  }
  const backgrounds: FurnaceSurface[] = [], surfaces: FurnaceSurface[] = [], lifts: FurnaceSurface[] = [];
  for (let x = 0; x < FURNACE_WIDTH; x += FURNACE_BAND_WIDTH) {
    const box = { x, y: 0, width: Math.min(FURNACE_BAND_WIDTH, FURNACE_WIDTH - x), height: FURNACE_HEIGHT };
    backgrounds.push(surface(`background:${x}`, box, background.filter(c => intersects(c, box)).map(c => Object.freeze({ ...c, x: c.x - x }))));
  }
  for (const p of geometry.platforms) {
    const commands = p.h <= 16 ? ledge(p, 'ledge') : solid(p, furnace.heatZones);
    for (let left = 0; left < p.w; left += FURNACE_BAND_WIDTH) {
      const clip = { x: left, y: 0, width: Math.min(FURNACE_BAND_WIDTH, p.w - left), height: p.h };
      const local = commands.filter(c => intersects(c, clip)).map(c => Object.freeze({ ...c, x: c.x - left }));
      surfaces.push(surface(`surface:${p.id}:${left}`, { ...clip, x: p.x + left, y: p.y }, local));
    }
  }
  for (const p of geometry.lifts) {
    lifts.push(surface(`lift:${p.id}`, { x: Math.round(p.x), y: Math.round(p.y), width: p.w, height: p.h }, ledge(p, 'lift')));
  }
  return Object.freeze({ width: FURNACE_WIDTH, height: FURNACE_HEIGHT,
    backgrounds: Object.freeze(backgrounds), surfaces: Object.freeze(surfaces), lifts: Object.freeze(lifts) });
}
