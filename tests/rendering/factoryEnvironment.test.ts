import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type * as Phaser from 'phaser';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CHAPTER_TWO } from '../../src/pages/GamePage/game/data/chapterTwo';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { worldPlatforms } from '../../src/pages/GamePage/game/systems/platforms';
import type { Platform } from '../../src/pages/GamePage/game/entities/model';
import { FACTORY_TERRAIN_ROLES, FACTORY_PROP_ROLES, planFactoryEnvironment, planFactorySea, planFactorySeaPatterns, type FactoryTerrainRole, type FactoryPropRole, type FactoryRect, type FactoryEnvironmentPlan, type FactoryRepeat, type FactoryPattern } from '../../src/pages/GamePage/game/systems/FactoryEnvironmentPlan';
import { FactoryEnvironmentRenderer, type FactoryEnvironmentScene, type FactoryEnvironmentWorld, type FactoryTextureFrame, type FactoryRenderTexture, type FactoryTileSprite, type FactoryRepeatConfig } from '../../src/pages/GamePage/game/systems/FactoryEnvironmentRenderer';
const localRequire = createRequire(import.meta.url);
const nativeFilterMode: { LINEAR: number; NEAREST: number } = localRequire(join(dirname(localRequire.resolve('phaser/package.json')), 'src/textures/const.js'));
// These are unit-only names, NOT the packed production mapping or native-art acceptance.
function unitBinding() { return {
  terrain: { key: 'unit-factory-tiles', frames: Object.fromEntries(FACTORY_TERRAIN_ROLES.map(role => [role, `unit-tile:${role}`])) as Record<FactoryTerrainRole, string> },
  props: { key: 'unit-factory-props', frames: Object.fromEntries(FACTORY_PROP_ROLES.map(role => [role, `unit-prop:${role}`])) as Record<FactoryPropRole, string> },
}; }
function frame(size: number, index = 0): FactoryTextureFrame { return { x: 0, y: 0, cutX: index * size, cutY: 0, cutWidth: size, cutHeight: size, width: size, height: size, realWidth: size, realHeight: size, trimmed: false, rotated: false, source: { width: size * (size === 16 ? 40 : 8), height: size, image: {}, source: {} } }; }
class TextureDouble {
  readonly frames = new Map<string, FactoryTextureFrame>(); readonly requests: (string | number)[] = []; readonly filters: number[] = []; firstFrame = '__BASE'; destroyed = 0;
  has(name: string | number) { this.requests.push(name); return this.frames.has(String(name)); }
  get(name: string | number) { this.requests.push(name); const found = this.frames.get(name ? String(name) : this.firstFrame); if (!found) throw new Error('Missing admitted frame'); return found; }
  setFilter(mode: number) { this.filters.push(mode); }
  destroy() { this.destroyed++; }
  get frameTotal(): never { throw new Error('Must not require total frame count 32'); }
}
class PatternTextureDouble {
  filters: number[] = []; destroyed = 0; pixelsValid = false;
  constructor(private event: (name: string) => void) {}
  setFilter(mode: number) { this.event('filter'); this.filters.push(mode); this.pixelsValid = false; }
}
type Op = { kind: 'repeat' | 'stamp'; key: string; frame: string; x: number; y: number; width: number; height: number; config: { alpha: number; originX: number; originY: number; scale: number; tilePositionX?: number; tilePositionY?: number } };
class RTDouble implements FactoryRenderTexture<PatternTextureDouble> {
  readonly texture: PatternTextureDouble; ops: Op[] = []; renders = 0; clears = 0; destroyed = 0; visible = true; origin = [0.5, 0.5]; scale = 2; depth = 99; mode = '';
  cameraPosition = [8, 9]; scroll = [4, 5]; zoom = 3; rotation = 2;
  readonly camera = {
    setPosition: (x: number, y: number) => { this.cameraPosition = [x, y]; }, setScroll: (x: number, y: number) => { this.scroll = [x, y]; },
    setZoom: (value: number) => { this.zoom = value; }, setRotation: (value: number) => { this.rotation = value; },
  };
  constructor(readonly scene: SceneDouble, readonly id: number, readonly x: number, readonly y: number, readonly width: number, readonly height: number) { this.texture = new PatternTextureDouble(name => scene.event(`rt:${id}:${name}`)); }
  setOrigin(x: number, y: number) { this.scene.event(`rt:${this.id}:origin`); this.origin = [x, y]; }
  setScale(value: number) { this.scale = value; } setDepth(value: number) { this.depth = value; } setVisible(value: boolean) { this.visible = value; } setRenderMode(value: 'render') { this.mode = value; }
  clear() { this.scene.event(`rt:${this.id}:clear`); this.clears++; this.ops = []; }
  repeat(key: string, frame: string, x: number, y: number, width: number, height: number, config: FactoryRepeatConfig) { this.scene.event(`rt:${this.id}:repeat`); this.ops.push({ kind: 'repeat', key, frame, x, y, width, height, config: { ...config } }); }
  stamp(key: string, frame: string, x: number, y: number, config: { alpha: number; originX: number; originY: number; scale: number }) { this.scene.event(`rt:${this.id}:stamp`); this.ops.push({ kind: 'stamp', key, frame, x, y, width: 64, height: 64, config: { ...config } }); }
  render() { this.scene.event(`rt:${this.id}:render`); this.renders++; this.texture.pixelsValid = true; }
  destroy() { this.scene.event(`rt:${this.id}:destroy`); this.destroyed++; this.texture.destroyed++; }
}
class TileDouble implements FactoryTileSprite {
  destroyed = 0; visible = true; origin = [0.5, 0.5]; scale = 2; depth = 99; alpha = 0.5; rotation = 7; tileRotation = 8; tileScale = [2, 2]; tile = [0, 0];
  constructor(readonly scene: SceneDouble, readonly id: number, public x: number, public y: number, public width: number, public height: number, readonly texture: PatternTextureDouble) {}
  setOrigin(x: number, y: number) { this.origin = [x, y]; } setScale(value: number) { this.scale = value; } setDepth(value: number) { this.depth = value; } setVisible(value: boolean) { this.visible = value; } setAlpha(value: number) { this.alpha = value; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; } setSize(width: number, height: number) { this.scene.event(`tile:${this.id}:size`); this.width = width; this.height = height; }
  setRotation(value: number) { this.rotation = value; } setTileRotation(value: number) { this.tileRotation = value; }
  setTileScale(x: number, y: number) { this.tileScale = [x, y]; } setTilePosition(x: number, y: number) { this.tile = [x, y]; }
  destroy() { this.scene.event(`tile:${this.id}:destroy`); expect(this.texture.destroyed).toBe(0); this.destroyed++; }
}
class SceneDouble implements FactoryEnvironmentScene<PatternTextureDouble> {
  readonly tables = new Map<string, TextureDouble>(); readonly rts: RTDouble[] = []; readonly tiles: TileDouble[] = []; readonly events: string[] = [];
  readonly listeners = new Set<() => void>(); limit = 2048; failRTAt = -1; failTileAt = -1; fail: string | null = null;
  constructor() { const binding = unitBinding(); const terrain = new TextureDouble(), props = new TextureDouble(); FACTORY_TERRAIN_ROLES.forEach((role, i) => terrain.frames.set(binding.terrain.frames[role], frame(16, i))); FACTORY_PROP_ROLES.forEach((role, i) => props.frames.set(binding.props.frames[role], frame(64, i))); this.tables.set(binding.terrain.key, terrain); this.tables.set(binding.props.key, props); }
  event(value: string) { this.events.push(value); if (value === this.fail) throw new Error(value); }
  readonly textures = { exists: (key: string) => this.tables.has(key), get: (key: string) => { const texture = this.tables.get(key); if (!texture) throw new Error('Missing texture'); return texture; } };
  readonly game = { renderer: { getMaxTextureSize: () => this.limit, on: (name: string, fn: () => void) => { expect(name).toBe('restorewebgl'); this.listeners.add(fn); }, off: (name: string, fn: () => void) => { expect(name).toBe('restorewebgl'); this.listeners.delete(fn); } } };
  readonly add = {
    renderTexture: (x: number, y: number, w: number, h: number) => { if (this.rts.length === this.failRTAt) throw new Error('RT allocation'); const rt = new RTDouble(this, this.rts.length, x, y, w, h); this.rts.push(rt); return rt; },
    tileSprite: (x: number, y: number, w: number, h: number, texture: PatternTextureDouble) => { if (this.tiles.length === this.failTileAt) throw new Error('Tile allocation'); const tile = new TileDouble(this, this.tiles.length, x, y, w, h, texture); this.tiles.push(tile); return tile; },
  };
  restore() { [...this.listeners].forEach(fn => fn()); }
}
const owners: FactoryEnvironmentRenderer<PatternTextureDouble>[] = [];
function setup(scene = new SceneDouble(), binding: unknown = unitBinding(), notify?: () => void) { const renderer = new FactoryEnvironmentRenderer<PatternTextureDouble>(scene, binding, notify); owners.push(renderer); return { scene, renderer }; }
afterEach(() => owners.splice(0).forEach(owner => owner.destroy()));
function world() { return { chapter: structuredClone(CHAPTER_TWO), collapsed: [] as string[], save: { runId: 'unit-factory-run', elapsedMs: 0, stage: 2 }, factory: { seaY: 1660 } as { seaY: number } | null }; }
const viewport = (): FactoryRect => ({ x: 0, y: 1480, width: 640, height: 360 });
function deepFreeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(child => deepFreeze(child)); } return value; }
function requirePlan(w = world(), platforms: readonly Readonly<Platform>[] = w.chapter.platforms) { const result = planFactoryEnvironment(w, platforms); expect(result).not.toBeNull(); return result!; }
function sample(plan: FactoryEnvironmentPlan, x: number, y: number) {
  const band = plan.bands.find(b => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height);
  if (!band) return null;
  const c = band.commands.find((v): v is FactoryRepeat => v.kind === 'repeat' && v.platformId !== null && x >= v.x + band.x && x < v.x + band.x + v.width && y >= v.y + band.y && y < v.y + band.y + v.height);
  return c ? { id: c.platformId, role: c.role, u: (x - band.x - c.x + c.tileX) % 16, v: (y - band.y - c.y + c.tileY) % 16 } : null;
}
function patternSample(pattern: FactoryPattern, x: number, y: number) {
  const c = pattern.commands.find(c => x >= c.x && x < c.x + c.width && y >= c.y && y < c.y + c.height);
  if (!c) throw new Error('Pattern contains a hole');
  return { role: c.role, u: x - c.x, v: y - c.y };
}
function released(scene: SceneDouble) {
  expect([...scene.rts, ...scene.tiles].every(object => object.destroyed === 1)).toBe(true);
  expect([...scene.tables.values()].every(texture => texture.destroyed === 0)).toBe(true);
}

describe('factory geometry candidate: independent Core envelope, not native-art acceptance', () => {
  it('exports the agreed semantic roles without any packed-position contract', () => {
    expect(FACTORY_TERRAIN_ROLES).toEqual([
      'protected-left', 'protected-middle', 'protected-right', 'protected-fill', 'service-left', 'service-middle', 'service-right', 'service-fill',
      'floor-left', 'floor-middle', 'floor-right', 'floor-fill-a', 'floor-fill-b', 'base-left', 'base-middle', 'base-right',
      'wall-a', 'wall-b', 'rail', 'rail-joint', 'conduit', 'conduit-elbow', 'vent', 'panel',
      'clip-fill-a', 'clip-fill-b', 'clip-fill-c', 'clip-surface-a', 'clip-surface-b', 'wall-left', 'wall-right', 'floor-fill-c',
    ]);
    expect(FACTORY_PROP_ROLES).toEqual(['wire-spool', 'clip-press', 'clip-hopper', 'service-cabinet', 'conduit-junction', 'inspection-grille']);
    expect(Object.isFrozen(FACTORY_TERRAIN_ROLES)).toBe(true); expect(Object.isFrozen(FACTORY_PROP_ROLES)).toBe(true);
  });
  it('builds four immutable vertical bands with an exact 504px final band', () => {
    const plan = requirePlan(); expect([plan.width, plan.height]).toEqual([640, 2040]);
    expect(plan.bands.map(b => [b.x, b.y, b.width, b.height])).toEqual([[0, 0, 640, 512], [0, 512, 640, 512], [0, 1024, 640, 512], [0, 1536, 640, 504]]);
    expect(Object.isFrozen(plan) && Object.isFrozen(plan.bands)).toBe(true);
    for (const band of plan.bands) expect(Object.isFrozen(band) && Object.isFrozen(band.commands) && band.commands.every(Object.isFrozen)).toBe(true);
  });
  it('covers exactly every real half-open platform rectangle and nothing else', () => {
    const w = world(), plan = requirePlan(w), actual = Buffer.alloc(640 * 2040), expected = Buffer.alloc(actual.length);
    const fill = (dst: Buffer, x: number, y: number, width: number, height: number) => { for (let row = y; row < y + height; row++) dst.fill(1, row * 640 + x, row * 640 + x + width); };
    for (const p of w.chapter.platforms) fill(expected, p.x, p.y, p.w, p.h);
    for (const b of plan.bands) for (const c of b.commands) if (c.kind === 'repeat' && c.platformId !== null) {
      const x = Math.max(b.x, b.x + c.x), y = Math.max(b.y, b.y + c.y), right = Math.min(b.x + b.width, b.x + c.x + c.width), bottom = Math.min(b.y + b.height, b.y + c.y + c.height);
      fill(actual, x, y, right - x, bottom - y);
    }
    expect(actual.equals(expected)).toBe(true); expect(actual.some(pixel => pixel !== 0)).toBe(true);
    for (const [x, y] of [[0, 1839], [149, 1785], [330, 1785], [150, 1797], [500, 500], [639, 1868]]) expect(sample(plan, x, y)).toBeNull();
  });
  it.each(CHAPTER_TWO.platforms.filter(p => p.h === 12))('keeps $id on its authored off-grid origin through the last pixel', p => {
    const plan = requirePlan(); expect(sample(plan, p.x, p.y)).toMatchObject({ id: p.id, u: 0, v: 0 });
    expect(sample(plan, p.x + p.w - 1, p.y + 11)).toMatchObject({ id: p.id, u: 15, v: 11 });
    expect(sample(plan, p.x + p.w, p.y)).toBeNull(); expect(sample(plan, p.x, p.y + 12)).toBeNull();
  });
  it.each([{ id: 'factory-arena', top: 300, bodyEnd: 323, lastV: 7 }, { id: 'factory-start', top: 1840, bodyEnd: 1867, lastV: 11 }])('gives $id only one top16 then a cropped body', ({ id, top, bodyEnd, lastV }) => {
    const plan = requirePlan(); expect(sample(plan, 200, top + 15)).toMatchObject({ id, role: 'floor-middle', v: 15 });
    expect(sample(plan, 200, top + 16)?.role).toMatch(/^floor-fill-[abc]$/); expect(sample(plan, 200, top + 16)?.v).toBe(0);
    expect(sample(plan, 200, bodyEnd)).toMatchObject({ id, v: lastV }); expect(sample(plan, 200, bodyEnd + 1)).toBeNull();
  });
  it('preserves full negative-local origins and source phase across a y512 band boundary', () => {
    const p: Platform = { id: 'unit-cross-band', x: 101, y: 508, w: 100, h: 28, oneWay: true }, plan = requirePlan(world(), [p]);
    expect(plan.bands[1].commands.find(c => c.kind === 'repeat' && c.platformId === p.id)).toMatchObject({ y: -4, height: 16 });
    expect(sample(plan, 125, 511)).toMatchObject({ id: p.id, v: 3 }); expect(sample(plan, 125, 512)).toMatchObject({ id: p.id, v: 4 });
    expect(sample(plan, 125, 524)).toMatchObject({ v: 0 }); expect(sample(plan, 125, 535)).toMatchObject({ v: 11 }); expect(sample(plan, 125, 536)).toBeNull();
  });
  it.each([1, 7, 17, 31, 100, 120, 180])('never expands a non-grid width %i', width => {
    const plan = requirePlan(world(), [{ id: 'unit-width', x: 101, y: 801, w: width, h: 12, oneWay: true }]);
    for (let x = 0; x < width; x++) expect(sample(plan, 101 + x, 812)?.id).toBe('unit-width');
    expect(sample(plan, 100, 801)).toBeNull(); expect(sample(plan, 101 + width, 801)).toBeNull();
  });
  it('keeps machine props dim, away from teaching labels and real surfaces, without ground-at-floor300 assumptions', () => {
    const w = world(), plan = requirePlan(w), props = plan.bands.flatMap(b => b.commands.filter(c => c.kind === 'prop').map(c => ({ ...c, y: c.y + b.y })));
    expect(new Set(props.map(p => p.role)).size).toBe(6); expect(props.some(p => p.y > 1536)).toBe(true);
    for (const p of props) {
      expect([p.width, p.height]).toEqual([64, 64]); expect(p.alpha).toBeLessThanOrEqual(0.22);
      for (const platform of w.chapter.platforms) expect(p.x < platform.x + platform.w && p.x + 64 > platform.x && p.y < platform.y + platform.h && p.y + 64 > platform.y).toBe(false);
    }
    expect(plan.bands[3].commands.find(c => c.kind === 'prop' && c.role === 'clip-press')).toMatchObject({ y: -32, height: 64 });
    const blocked = world(); blocked.chapter = { ...blocked.chapter, signs: [...blocked.chapter.signs, { x: 552, y: 1744, text: 'UNIT LABEL COVERING MACHINE' }] };
    expect(requirePlan(blocked).bands.flatMap(b => b.commands).some(c => c.kind === 'prop' && c.role === 'wire-spool')).toBe(false);
  });
  it.each([{ x: 0.5 }, { y: Infinity }, { w: 0 }, { h: -1 }, { x: -1 }, { y: 2038, h: 12 }])('rejects malformed geometry %j without repairing or snapping it', patch => {
    const p = { id: 'bad', x: 100, y: 500, w: 100, h: 12, ...patch }; expect(planFactoryEnvironment(world(), [p])).toBeNull();
  });
  it('rejects duplicate live IDs and wrong chapter dimensions', () => {
    const w = world(), p = w.chapter.platforms[0]; expect(planFactoryEnvironment(w, [p, p])).toBeNull();
    expect(planFactoryEnvironment({ ...w, chapter: { ...w.chapter, height: 2041 } }, w.chapter.platforms)).toBeNull();
  });
});

describe('stationary native sea composition, not a new simulation or animation clock', () => {
  it('uses all three variants, staggered rows and source-pixel-continuous periodic seams', () => {
    const { fill, surface } = planFactorySeaPatterns(); expect([fill.width, fill.height, surface.width, surface.height]).toEqual([128, 64, 128, 16]);
    expect(new Set(fill.commands.map(c => c.role))).toEqual(new Set(['clip-fill-a', 'clip-fill-b', 'clip-fill-c']));
    expect(patternSample(fill, 0, 0)).toEqual({ role: 'clip-fill-a', u: 0, v: 0 });
    expect(patternSample(fill, 16, 0).role).toBe('clip-fill-b'); expect(patternSample(fill, 32, 0).role).toBe('clip-fill-c');
    expect(patternSample(fill, 0, 16)).toEqual({ role: 'clip-fill-c', u: 8, v: 0 });
    expect(patternSample(fill, 0, 32)).toEqual({ role: 'clip-fill-b', u: 12, v: 0 });
    expect(patternSample(fill, 0, 48)).toEqual({ role: 'clip-fill-a', u: 4, v: 0 });
    for (const y of [0, 16, 32, 48]) { const a = patternSample(fill, 127, y), b = patternSample(fill, 0, y); expect(a.role).toBe(b.role); expect(b.u).toBe((a.u + 1) % 16); }
    expect(new Set(surface.commands.map(c => c.role))).toEqual(new Set(['clip-surface-a', 'clip-surface-b']));
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) patternSample(fill, x, y);
    expect(Object.isFrozen(fill) && Object.isFrozen(fill.commands) && fill.commands.every(Object.isFrozen)).toBe(true);
    expect(planFactorySeaPatterns()).toEqual({ fill, surface });
  });
  it('projects fractional seaY directly while fill and surface have distinct world origins', () => {
    const view = { x: 0, y: 1000.25, width: 640, height: 360 }, sea = planFactorySea(1123.75, view)!;
    expect(sea.fill).toEqual({ x: 0, y: 1123.75, width: 640, height: 236.5, visible: true, tileX: 0, tileY: 1123.75 });
    expect(sea.surface).toEqual({ x: 0, y: 1123.75, width: 640, height: 16, visible: true, tileX: 0, tileY: 0 });
    const above = planFactorySea(995, view)!; expect(above.fill).toMatchObject({ y: 1000.25, height: 360 }); expect(above.surface).toMatchObject({ y: 995, visible: true });
    expect(planFactorySea(900, view)!.surface).toMatchObject({ y: 900, visible: false });
    expect(planFactorySea(2100, view)!.fill).toMatchObject({ height: 0, visible: false });
    expect(Object.isFrozen(sea) && Object.isFrozen(sea.fill) && Object.isFrozen(sea.surface)).toBe(true);
  });
  it.each([NaN, Infinity, -1])('rejects invalid seaY %s without predicting a replacement', seaY => { expect(planFactorySea(seaY, viewport())).toBeNull(); });
  it.each([{ width: 641 }, { height: 361 }, { y: 1700 }, { x: -1 }, { width: 0 }])('rejects invalid viewport %j', patch => { expect(planFactorySea(1660, { ...viewport(), ...patch })).toBeNull(); });
});

describe('factory native port and independent cache/resource lifetime', () => {
  it('matches actual installed Phaser4 ports, Core world shape and NEAREST enum', () => {
    expectTypeOf<Phaser.Scene>().toMatchTypeOf<FactoryEnvironmentScene>(); expectTypeOf<ReturnType<typeof createWorld>>().toMatchTypeOf<FactoryEnvironmentWorld>();
    expect(nativeFilterMode.NEAREST).not.toBe(nativeFilterMode.LINEAR); expect(nativeFilterMode.NEAREST).toBe(1);
  });
  it('owns four static bands, two hidden mosaics and two sea consumers through owned Texture handles', () => {
    const { scene, renderer } = setup(), w = deepFreeze(world()), before = JSON.stringify(w); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true);
    expect(scene.rts.map(rt => [rt.x, rt.y, rt.width, rt.height])).toEqual([[0, 0, 640, 512], [0, 512, 640, 512], [0, 1024, 640, 512], [0, 1536, 640, 504], [0, 0, 128, 64], [0, 0, 128, 16]]);
    expect(scene.tiles).toHaveLength(2); expect(scene.tiles[0].texture).toBe(scene.rts[4].texture); expect(scene.tiles[1].texture).toBe(scene.rts[5].texture);
    expect(scene.rts.map(rt => rt.visible)).toEqual([true, true, true, true, false, false]);
    for (const rt of scene.rts) {
      expect(rt).toMatchObject({ origin: [0, 0], scale: 1, depth: -5, mode: 'render', cameraPosition: [0, 0], scroll: [0, 0], zoom: 1, rotation: 0, renders: 1 });
      expect(rt.texture.filters).toEqual([nativeFilterMode.NEAREST]); expect(rt.texture.pixelsValid).toBe(true);
      expect(scene.events.indexOf(`rt:${rt.id}:filter`)).toBeLessThan(scene.events.indexOf(`rt:${rt.id}:clear`)); expect(scene.events.indexOf(`rt:${rt.id}:clear`)).toBeLessThan(scene.events.indexOf(`rt:${rt.id}:render`));
      expect(rt.ops.every(op => typeof op.frame === 'string' && op.config.scale === 1 && op.config.originX === 0 && op.config.originY === 0)).toBe(true);
    }
    for (const tile of scene.tiles) expect(tile).toMatchObject({ origin: [0, 0], scale: 1, tileScale: [1, 1], rotation: 0, tileRotation: 0, depth: 0.5, alpha: 1 });
    expect(JSON.stringify(w)).toBe(before);
  });
  it('does not rebake either cache for time, seaY, camera movement or saved next-stage identity', () => {
    const { scene, renderer } = setup(), w = world(); renderer.draw(w, w.chapter.platforms, viewport());
    w.save.elapsedMs = 999999; w.save.stage = 5; w.factory = { seaY: 1510.5 };
    expect(renderer.draw(w, [...w.chapter.platforms], { x: 0, y: 1440.25, width: 640, height: 360 })).toBe(true);
    expect(scene.rts).toHaveLength(6); expect(scene.rts.map(rt => rt.renders)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(scene.tiles[0]).toMatchObject({ x: 0, y: 1510.5, width: 640, height: 289.75, tile: [0, 1510.5] });
    expect(scene.tiles[1]).toMatchObject({ y: 1510.5, tile: [0, 0] });
  });
  it('keeps unseen surfaces hidden instead of sticking an invented surface to the view top', () => {
    const { scene, renderer } = setup(), w = world(); w.factory = { seaY: 1400 }; renderer.draw(w, w.chapter.platforms, viewport());
    expect(scene.tiles[0]).toMatchObject({ y: 1480, height: 360, visible: true, tile: [0, 1480] }); expect(scene.tiles[1]).toMatchObject({ y: 1400, visible: false });
    w.factory = { seaY: 2100 }; renderer.draw(w, w.chapter.platforms, viewport()); expect(scene.tiles.map(tile => tile.visible)).toEqual([false, false]);
    expect(scene.rts.map(rt => rt.renders)).toEqual([1, 1, 1, 1, 1, 1]);
  });
  it('clears swallowed terrain in the same bands, including protected surfaces, without rebaking sea mosaics', () => {
    const { scene, renderer } = setup(), w = world(); renderer.draw(w, w.chapter.platforms, viewport());
    const before = scene.rts.slice(0, 4).map(rt => rt.ops.filter(op => op.config.alpha === 1).length);
    w.collapsed.push('factory-side-1', 'factory-step-1'); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true);
    expect(scene.rts.map(rt => rt.renders)).toEqual([2, 2, 2, 2, 1, 1]); expect(scene.rts).toHaveLength(6);
    const plan = requirePlan(w); expect(sample(plan, 30, 1620)).toBeNull(); expect(sample(plan, 150, 1785)).toBeNull();
    expect(scene.rts[3].ops.filter(op => op.config.alpha === 1).length).toBeLessThan(before[3]);
    const active = w.chapter.platforms.filter(p => !w.collapsed.includes(p.id)); expect(renderer.draw(w, active, viewport())).toBe(true);
    expect(scene.rts.map(rt => rt.renders)).toEqual([2, 2, 2, 2, 1, 1]);
  });
  it('consumes actual Core worldPlatforms without mutating Core, contacts or collapse deadlines', () => {
    const w = createWorld({ ...createRun('unit-factory-core', 7), stage: 2 }); w.collapsed.push('factory-side-1'); w.collapseAt['factory-step-1'] = 0;
    const platforms = worldPlatforms(w), before = JSON.stringify(w), { renderer } = setup(); deepFreeze(w);
    expect(renderer.draw(w, platforms, viewport())).toBe(true); expect(JSON.stringify(w)).toBe(before);
    expect(worldPlatforms(w)).toEqual(platforms); const plan = planFactoryEnvironment(w, platforms)!;
    expect(sample(plan, 30, 1620)).toBeNull(); expect(sample(plan, 150, 1785)?.id).toBe('factory-step-1');
  });
  it('never reads player, clocks, speed, phase, HP, deadlines, camera or combat collections', () => {
    const w = world(), forbidden = () => { throw new Error('Forbidden inference or subsystem access'); };
    for (const name of ['player', 'boss', 'bullets', 'collapseAt', 'camera', 'mode']) Object.defineProperty(w, name, { get: forbidden, enumerable: false });
    Object.defineProperty(w.save, 'elapsedMs', { get: forbidden, enumerable: false }); Object.defineProperty(w.chapter, 'floor', { get: forbidden, enumerable: false });
    for (const name of ['riseSpeed', 'phase', 'phaseUntil', 'probes', 'bubbles', 'hp']) Object.defineProperty(w.factory, name, { get: forbidden, enumerable: false });
    const { renderer } = setup(); deepFreeze(w); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true);
  });
  it('copies caller bindings defensively and admits a named string zero without touching firstFrame', () => {
    const scene = new SceneDouble(), binding = unitBinding(), texture = scene.textures.get(binding.terrain.key);
    texture.frames.set('0', texture.frames.get(binding.terrain.frames['wall-a'])!); texture.frames.set('__BASE', frame(64)); binding.terrain.frames['wall-a'] = '0';
    const { renderer } = setup(scene, binding); binding.terrain.key = 'changed-key'; binding.props.frames['wire-spool'] = 'changed-frame';
    const w = world(); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true);
    expect(texture.requests.every(value => typeof value === 'string')).toBe(true); expect(texture.requests).toContain('0'); expect(scene.rts.some(rt => rt.ops.some(op => op.frame === '0'))).toBe(true);
  });
  it.each(['terrain', 'props'] as const)('rejects duplicate native frame names within %s before allocation', group => {
    const binding = unitBinding(), frames = binding[group].frames as Record<string, string>, keys = Object.keys(frames); frames[keys[1]] = frames[keys[0]];
    const { scene, renderer } = setup(new SceneDouble(), binding), w = world(); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); expect(scene.rts).toHaveLength(0); expect(scene.tiles).toHaveLength(0);
  });
  it.each([null, {}, { terrain: null }, { terrain: { key: 'x', frames: {} }, props: {} }])('leaves unavailable/malformed binding %j entirely on fallback', binding => {
    const { scene, renderer } = setup(new SceneDouble(), binding), w = world(); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); expect(scene.rts).toHaveLength(0);
  });
  it.each(['', ' ', 0, -1, 0.5, NaN])('rejects invalid frame identifier %j before allocation', value => {
    const binding = unitBinding(); Object.assign(binding.terrain.frames, { 'wall-a': value }); const { scene, renderer } = setup(new SceneDouble(), binding), w = world();
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); expect(scene.rts).toHaveLength(0);
  });
  it('allows four packed tail slots and BASE but still requires an unused semantic role', () => {
    const { scene, renderer } = setup(), binding = unitBinding(), texture = scene.textures.get(binding.terrain.key), w = world();
    for (let i = 32; i < 36; i++) texture.frames.set(`unused-tail-${i}`, frame(16, i)); texture.frames.set('__BASE', frame(96));
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true);
    texture.frames.delete(binding.terrain.frames.panel); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); released(scene);
  });
  it.each(['terrain', 'props'] as const)('fails atomically when a whole %s texture disappears', group => {
    const { scene, renderer } = setup(), w = world(); renderer.draw(w, w.chapter.platforms, viewport()); scene.tables.delete(unitBinding()[group].key);
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); released(scene);
  });
  it.each([{ x: 1 }, { y: 1 }, { width: 15 }, { height: 15 }, { realWidth: 15 }, { realHeight: 15 }, { cutWidth: 15 }, { cutHeight: 15 }, { trimmed: true }, { rotated: true }, { cutX: -1 }, { cutX: 0.5 }, { cutY: 1 }])('rejects malformed source frame %j and removes every old view object', patch => {
    const { scene, renderer } = setup(), w = world(), binding = unitBinding(), texture = scene.textures.get(binding.terrain.key), key = binding.terrain.frames['wall-a'];
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true); Object.assign(texture.frames.get(key)!, patch);
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); released(scene);
  });
  it.each([{ width: 0 }, { height: 0 }, { width: Infinity }, { width: 639.5 }])('rejects malformed backing dimensions %j', patch => {
    const { scene, renderer } = setup(), w = world(), texture = scene.textures.get(unitBinding().terrain.key); renderer.draw(w, w.chapter.platforms, viewport());
    Object.assign(texture.frames.get('unit-tile:wall-a')!.source, patch); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); released(scene);
  });
  it('validates 64px props independently rather than accepting the 16px terrain shape', () => {
    const { scene, renderer } = setup(), w = world(); renderer.draw(w, w.chapter.platforms, viewport()); scene.textures.get(unitBinding().props.key).frames.set('unit-prop:wire-spool', frame(16));
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); released(scene);
  });
  it.each([0, 512, 639, 640.5, NaN, Infinity])('requires a real supported texture cap %s before any allocation', limit => {
    const scene = new SceneDouble(); scene.limit = limit; const { renderer } = setup(scene), w = world(); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); expect(scene.rts).toHaveLength(0);
  });
  it('accepts cap640 and never allocates a full 2040px-tall render target', () => {
    const scene = new SceneDouble(); scene.limit = 640; const { renderer } = setup(scene), w = world(); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true); expect(scene.rts.every(rt => rt.width <= 640 && rt.height <= 640)).toBe(true);
  });
  it('fails closed without a capability method instead of assuming WebGL', () => {
    const scene = new SceneDouble(); Object.defineProperty(scene.game.renderer, 'getMaxTextureSize', { value: undefined }); const { renderer } = setup(scene), w = world();
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); expect(scene.rts).toHaveLength(0);
  });
  it.each(['terrain', 'props'] as const)('re-admits atomic %s Texture replacement without destroying source assets', group => {
    const { scene, renderer } = setup(), w = world(), key = unitBinding()[group].key, old = scene.textures.get(key); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true);
    const replacement = new TextureDouble(); old.frames.forEach((value, name) => replacement.frames.set(name, value)); scene.tables.set(key, replacement);
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true); expect(scene.rts).toHaveLength(12); expect(scene.tiles).toHaveLength(4);
    expect(scene.rts.slice(0, 6).every(rt => rt.destroyed === 1)).toBe(true); expect(scene.tiles.slice(0, 2).every(tile => tile.destroyed === 1)).toBe(true); expect(old.destroyed).toBe(0);
  });
  it.each(['frame', 'source', 'image', 'payload', 'cut', 'dimensions'])('invalidates same-key %s changes even for an unused role', kind => {
    const { scene, renderer } = setup(), w = world(), texture = scene.textures.get(unitBinding().terrain.key), key = 'unit-tile:panel', old = texture.frames.get(key)!;
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true);
    if (kind === 'frame') texture.frames.set(key, { ...old });
    if (kind === 'source') Object.assign(old, { source: { ...old.source } });
    if (kind === 'image') Object.assign(old.source, { image: {} });
    if (kind === 'payload') Object.assign(old.source, { source: {} });
    if (kind === 'cut') Object.assign(old, { cutX: old.cutX + 1 });
    if (kind === 'dimensions') Object.assign(old.source, { width: old.source.width + 16 });
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true); expect(scene.rts).toHaveLength(12); expect(scene.tiles).toHaveLength(4);
    expect(scene.rts.slice(0, 6).every(rt => rt.destroyed === 1)).toBe(true); expect(scene.rts.slice(6).every(rt => rt.renders === 1 && rt.destroyed === 0)).toBe(true);
  });
  it('defaults an omitted constructor binding to unavailable without allocation', () => {
    const scene = new SceneDouble(), renderer = new FactoryEnvironmentRenderer<PatternTextureDouble>(scene), w = world(); owners.push(renderer);
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); expect(scene.rts).toHaveLength(0);
  });
  it('restores every cache and the last sea snapshot while paused, without a new draw or clock', () => {
    const notify = vi.fn(), { scene, renderer } = setup(new SceneDouble(), unitBinding(), notify), w = deepFreeze(world()), view = { ...viewport() };
    expect(renderer.draw(w, w.chapter.platforms, view)).toBe(true); view.y = 0; view.height = 1;
    scene.rts.forEach(rt => { rt.texture.pixelsValid = false; rt.cameraPosition = [4, 4]; rt.zoom = 7; }); scene.tiles[0].y = 99;
    scene.restore(); expect(scene.rts).toHaveLength(6); expect(scene.tiles).toHaveLength(2); expect(scene.rts.every(rt => rt.renders === 2 && rt.texture.pixelsValid && rt.zoom === 1)).toBe(true);
    expect(scene.tiles[0]).toMatchObject({ y: 1660, height: 180, tile: [0, 1660] }); expect(scene.tiles[1]).toMatchObject({ y: 1660, tile: [0, 0] }); expect(notify).not.toHaveBeenCalled();
  });
  it.each(['missing', 'identity', 'replay', 'sea-update'])('notifies the parent exactly once after paused restoration %s failure', failure => {
    const notify = vi.fn(), { scene, renderer } = setup(new SceneDouble(), unitBinding(), notify), w = deepFreeze(world()), before = JSON.stringify(w);
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true);
    const texture = scene.textures.get(unitBinding().terrain.key), old = texture.frames.get('unit-tile:panel')!;
    if (failure === 'missing') texture.frames.delete('unit-tile:panel');
    if (failure === 'identity') texture.frames.set('unit-tile:panel', { ...old });
    if (failure === 'replay') scene.fail = 'rt:5:render';
    if (failure === 'sea-update') scene.fail = 'tile:1:size';
    scene.restore(); released(scene); expect(notify).toHaveBeenCalledTimes(1); expect(JSON.stringify(w)).toBe(before);
    scene.restore(); expect(notify).toHaveBeenCalledTimes(1);
    texture.frames.set('unit-tile:panel', old); scene.fail = null; expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true); expect(scene.rts).toHaveLength(12);
  });
  it('returns false synchronously on ordinary draw failure without recursive parent notifications', () => {
    const notify = vi.fn(), { scene, renderer } = setup(new SceneDouble(), unitBinding(), notify), w = world(); renderer.draw(w, w.chapter.platforms, viewport());
    vi.spyOn(scene.textures.get(unitBinding().terrain.key), 'get').mockImplementation(() => { throw new Error('Resource lookup'); });
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); released(scene); expect(notify).not.toHaveBeenCalled(); scene.restore(); expect(notify).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3, 4, 5])('releases all partial RT allocations when allocation %i fails', index => {
    const scene = new SceneDouble(); scene.failRTAt = index; const { renderer } = setup(scene), w = world();
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); expect(scene.rts).toHaveLength(index); released(scene); scene.failRTAt = -1;
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true); expect(scene.rts.slice(index).every(rt => rt.renders === 1)).toBe(true);
  });
  it.each([0, 1])('releases both mosaic owners when sea consumer allocation %i fails', index => {
    const scene = new SceneDouble(); scene.failTileAt = index; const { renderer } = setup(scene), w = world();
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); expect(scene.rts).toHaveLength(6); expect(scene.tiles).toHaveLength(index); released(scene);
  });
  it.each(['rt:0:origin', 'rt:4:filter', 'rt:4:repeat', 'rt:5:render', 'rt:0:stamp', 'rt:0:render', 'tile:0:size', 'tile:1:size'])('cleans every owned object after operation %s throws', failure => {
    const scene = new SceneDouble(); scene.fail = failure; const { renderer } = setup(scene), w = world();
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); expect(scene.events).toContain(failure); expect(scene.rts.length).toBeGreaterThan(0); released(scene);
  });
  it('rebuilds on run identity but cleans outside actual stage2 or without factory state', () => {
    const { scene, renderer } = setup(), w = world(); renderer.draw(w, w.chapter.platforms, viewport()); w.save.runId = 'new-unit-run';
    expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(true); expect(scene.rts).toHaveLength(12); expect(scene.rts.slice(0, 6).every(rt => rt.destroyed === 1)).toBe(true);
    w.chapter = { ...w.chapter, stage: 3 }; expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); released(scene);
    w.chapter = { ...w.chapter, stage: 2 }; w.factory = null; expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false); expect(scene.rts).toHaveLength(12);
  });
  it('releases consumers before generated textures, never destroys inputs and cannot resurrect after destroy', () => {
    const { scene, renderer } = setup(), w = world(); renderer.draw(w, w.chapter.platforms, viewport()); const late = [...scene.listeners][0];
    renderer.destroy(); renderer.destroy(); late(); scene.restore(); expect(renderer.draw(w, w.chapter.platforms, viewport())).toBe(false);
    released(scene); expect(scene.listeners.size).toBe(0); expect(scene.rts).toHaveLength(6); expect(scene.tiles).toHaveLength(2);
    expect(scene.events.filter(event => event.endsWith(':destroy'))).toEqual(['tile:1:destroy', 'tile:0:destroy', 'rt:5:destroy', 'rt:4:destroy', 'rt:3:destroy', 'rt:2:destroy', 'rt:1:destroy', 'rt:0:destroy']);
  });
  it('keeps two renderer instances and their restore subscriptions independent', () => {
    const scene = new SceneDouble(), a = setup(scene).renderer, b = setup(scene).renderer, w = world();
    a.draw(w, w.chapter.platforms, viewport()); b.draw(w, w.chapter.platforms, viewport()); a.destroy(); scene.restore();
    expect(scene.listeners.size).toBe(1); expect(scene.rts.slice(0, 6).every(rt => rt.destroyed === 1 && rt.renders === 1)).toBe(true);
    expect(scene.rts.slice(6).every(rt => rt.destroyed === 0 && rt.renders === 2)).toBe(true); b.destroy(); expect(scene.listeners.size).toBe(0); released(scene);
  });
});
