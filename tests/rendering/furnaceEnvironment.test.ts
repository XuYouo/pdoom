import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type * as Phaser from 'phaser';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Platform } from '../../src/pages/GamePage/game/entities/model';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { worldPlatforms } from '../../src/pages/GamePage/game/systems/platforms';
import { CHAPTER_THREE } from '../../src/pages/GamePage/game/data/chapterThree';
import { FURNACE_ENVIRONMENT_ASSETS, FURNACE_ENVIRONMENT_BINDING } from '../../src/pages/GamePage/game/data/furnaceEnvironmentAssets';
import { FURNACE_TERRAIN_ROLES, FURNACE_PROP_ROLES, planFurnaceEnvironment, readFurnaceGeometry,
  type FurnaceTerrainRole, type FurnacePropRole, type FurnaceRect, type FurnaceSurface, type FurnacePlanInput } from '../../src/pages/GamePage/game/systems/FurnaceEnvironmentPlan';
import { FurnaceEnvironmentRenderer, furnaceEnvironmentResourcesReady, type FurnaceEnvironmentBinding,
  type FurnaceEnvironmentScene, type FurnaceEnvironmentWorld, type FurnaceTextureFrame, type FurnaceRenderTexture,
  type FurnaceSourceTexture, type FurnaceStampConfig, type FurnaceRepeatConfig } from '../../src/pages/GamePage/game/systems/FurnaceEnvironmentRenderer';

// Independent literals from Core rectangles and the actual packed native exports.
// Neither Plan output nor Renderer output is fed back as its own expected oracle.
const TILE_ROLES = ['floor-top-a', 'floor-top-b', 'floor-body-a', 'floor-body-b', 'floor-foot',
  'rack-header-mid', 'ledge-left', 'ledge-mid', 'bulkhead-a', 'ledge-right', 'lift-left', 'lift-mid', 'lift-right',
  'grate-top', 'grate-body', 'bulkhead-b', 'rack-left', 'rack-right', 'rack-header-left', 'rack-header-right',
  'rack-foot-left', 'rack-foot-right', 'conduit-v', 'conduit-h', 'conduit-elbow', 'conduit-tee', 'service-panel',
  'rack-foot-mid', 'candle-a', 'candle-b', 'ceiling-left', 'ceiling-right'] as const;
const PROP_ROLES = ['gpu-rack', 'coolant-manifold', 'power-bus', 'floor-exhaust', 'ceiling-aperture', 'lunar-porthole'] as const;
const STATIC: readonly Readonly<Platform>[] = [
  { id: 'gpu-floor', x: 0, y: 320, w: 3280, h: 40 },
  { id: 'secret-room', x: 720, y: 105, w: 190, h: 12, oneWay: true, protected: true },
  { id: 'gpu-observer', x: 1420, y: 260, w: 120, h: 12, oneWay: true },
  { id: 'gpu-cache', x: 1880, y: 260, w: 120, h: 12, oneWay: true },
];
const HEAT = [{ id: 'gpu-rack-1', x: 970, y: 300, w: 130, h: 20 },
  { id: 'gpu-rack-2', x: 1660, y: 300, w: 145, h: 20 }, { id: 'gpu-rack-3', x: 2110, y: 300, w: 130, h: 20 }];
const BAND_X = [0, 512, 1024, 1536, 2048, 2560, 3072];
const EXPECTED_BACKGROUND = BAND_X.map(x => [x, 0, x === 3072 ? 208 : 512, 360]);
const EXPECTED_STATIC = [[0, 320, 3280, 40], [720, 105, 190, 12], [1420, 260, 120, 12], [1880, 260, 120, 12]];
const nativeRequire = createRequire(import.meta.url);
const nativeRoot = dirname(nativeRequire.resolve('phaser/package.json'));
const nativeFilters = nativeRequire(join(nativeRoot, 'src/textures/const.js')) as { LINEAR: number; NEAREST: number };
const RESTORE = nativeRequire(join(nativeRoot, 'src/renderer/events/RESTORE_WEBGL_EVENT.js')) as string;
const file = (path: string) => readFileSync(new URL(path, import.meta.url));
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) { const d = Object.getOwnPropertyDescriptor(value, key); if (d && 'value' in d) freeze(d.value); }
    Object.freeze(value);
  }
  return value;
}
function poison(object: object, key: string, reads: string[]) {
  Object.defineProperty(object, key, { configurable: true, enumerable: true, get() { reads.push(key); throw new Error('Forbidden ' + key); } });
}
function input(cp = 0, y = 320) {
  const lifts = cp === 0 ? [{ id: 'nvda-lift', x: 560, y, w: 120, h: 12 }] : [];
  const world = { save: { runId: 'furnace-unit' }, chapter: { stage: 3, width: 3280, height: 360, floor: 320, signs: [] as { x: number; y: number; text: string }[] },
    furnace: { lifts, heatZones: HEAT.slice(cp === 0 ? 0 : cp === 1 ? 1 : 3).map(p => ({ ...p })) } };
  const platforms: Platform[] = [...STATIC.map(p => ({ ...p })), ...lifts];
  return { world, platforms };
}
const BASE = freeze(input());
const view = (x = 0): FurnaceRect => freeze({ x, y: 0, width: 640, height: 360 });
function unitBinding() { return {
  terrain: { key: 'unit-furnace-terrain', frames: Object.fromEntries(TILE_ROLES.map((role, i) => [role, String(i)])) as Record<FurnaceTerrainRole, string | number> },
  props: { key: 'unit-furnace-props', frames: Object.fromEntries(PROP_ROLES.map((role, i) => [role, 'prop-' + i])) as Record<FurnacePropRole, string | number> },
}; }
type Part = 'terrain' | 'props';
type Media = { width: number; height: number; image: object; source: object };
type Frame = { -readonly [P in keyof Omit<FurnaceTextureFrame, 'source'>]: FurnaceTextureFrame[P] } & { source: Media };
const frameRows = [...TILE_ROLES.map((role, index) => ({ part: 'terrain' as const, role, index, size: 16 })),
  ...PROP_ROLES.map((role, index) => ({ part: 'props' as const, role, index, size: 64 }))];
interface Faults {
  resource: string; part: Part | ''; frame: string | null; allocAt: number; rtAt: number; operation: string;
  max: unknown; noResize: boolean; on: boolean; off: boolean; hook: ((name: string, index: number) => void) | null;
}
interface Op { kind: 'repeat' | 'stamp'; key: string; frame: string; x: number; y: number; width: number; height: number; config: FurnaceStampConfig | FurnaceRepeatConfig }
class Source implements FurnaceSourceTexture {
  frames = new Map<string, Frame>(); filters: number[] = []; destroyed = 0; requests: { op: string; name: string | number }[] = [];
  constructor(readonly part: Part, private faults: Faults, private trace: string[]) {}
  private read(op: string, name: string | number) {
    this.requests.push({ op, name });
    if (this.faults.resource === op && (!this.faults.part || this.faults.part === this.part) && (this.faults.frame === null || this.faults.frame === String(name))) throw Error(op);
  }
  has(name: string | number) { this.read('has', name); return this.frames.has(String(name)); }
  get(name: string | number) {
    this.read('get-frame', name);
    if (name === 0) return { ...this.frames.get('0')!, width: 96, height: 96 }; // Real numeric0 base-frame trap.
    return this.frames.get(String(name));
  }
  setFilter(mode: number) {
    this.trace.push('source:' + this.part + ':filter');
    if (this.faults.resource === 'filter' && (!this.faults.part || this.faults.part === this.part)) throw Error('source filter');
    this.filters.push(mode);
  }
  destroy() { this.destroyed++; }
  get frameTotal(): never { throw Error('Required slots, not frameTotal including Phaser base frame'); }
}
class RT implements FurnaceRenderTexture {
  x: number; y: number; width: number; height: number; origin = [0.5, 0.5]; scale = 2; rotation = 4; depth = 99; alpha = 0.1; visible = true; mode = '';
  cameraPosition = [8, 9]; scroll = [7, 8]; zoom = 3; cameraRotation = 4;
  pending: Op[] = []; ops: Op[] = []; renders = 0; clears = 0; destroyed = 0; pixelsValid = false; clearPending = false;
  moves: number[][] = []; resizes: (number | boolean)[][] = []; trace: string[] = [];
  readonly texture: { filters: number[]; destroyed: number; setFilter: (mode: number) => void };
  readonly camera: FurnaceRenderTexture['camera'];
  constructor(readonly index: number, x: number, y: number, width: number, height: number, private faults: Faults, private all: string[]) {
    this.x = x; this.y = y; this.width = Math.ceil(width / 2) * 2; this.height = Math.ceil(height / 2) * 2;
    this.texture = { filters: [], destroyed: 0, setFilter: mode => {
      this.hit('filter'); this.texture.filters.push(mode); this.pixelsValid = false; this.ops = [];
    } };
    this.camera = {
      setPosition: (x, y) => { this.hit('camera-position'); this.cameraPosition = [x, y]; return this.camera; },
      setScroll: (x, y) => { this.hit('camera-scroll'); this.scroll = [x, y]; return this.camera; },
      setZoom: value => { this.hit('camera-zoom'); this.zoom = value; return this.camera; },
      setRotation: value => { this.hit('camera-rotation'); this.cameraRotation = value; return this.camera; },
    };
  }
  private hit(name: string) {
    this.trace.push(name); this.all.push('rt:' + this.index + ':' + name); this.faults.hook?.(name, this.index);
    if (this.faults.operation === name && (this.faults.rtAt < 0 || this.faults.rtAt === this.index)) throw Error('rt ' + name);
  }
  setOrigin(x: number, y: number) { this.hit('origin'); this.origin = [x, y]; return this; }
  setScale(value: number) { this.hit('scale'); this.scale = value; return this; }
  setRotation(value: number) { this.hit('rotation'); this.rotation = value; return this; }
  setPosition(x: number, y: number) { this.hit('position'); this.x = x; this.y = y; this.moves.push([x, y]); return this; }
  setDepth(value: number) { this.hit('depth'); this.depth = value; return this; }
  setAlpha(value: number) { this.hit('alpha'); this.alpha = value; return this; }
  setVisible(value: boolean) { this.hit('visible'); this.visible = value; return this; }
  setRenderMode(mode: 'render') { this.hit('mode'); this.mode = mode; return this; }
  resize(width: number, height: number, forceEven: boolean) {
    this.hit('resize'); this.resizes.push([width, height, forceEven]);
    this.width = forceEven ? Math.ceil(width / 2) * 2 : width; this.height = forceEven ? Math.ceil(height / 2) * 2 : height; this.pixelsValid = false; return this;
  }
  clear() { this.hit('clear'); this.clears++; this.clearPending = true; this.pending = []; return this; }
  repeat(key: string, frame: string, x: number, y: number, width: number, height: number, config: FurnaceRepeatConfig) {
    this.hit('repeat'); this.pending.push({ kind: 'repeat', key, frame, x, y, width, height, config: { ...config } }); return this;
  }
  stamp(key: string, frame: string, x: number, y: number, config: FurnaceStampConfig) {
    this.hit('stamp'); this.pending.push({ kind: 'stamp', key, frame, x, y, width: 64, height: 64, config: { ...config } }); return this;
  }
  render() {
    this.hit('render'); this.renders++; this.ops = [...(this.clearPending ? [] : this.ops), ...this.pending];
    this.pending = []; this.clearPending = false; this.pixelsValid = true; return this;
  }
  destroy() { this.destroyed++; this.texture.destroyed++; this.pixelsValid = false; this.hit('destroy'); }
}
function harness(binding: FurnaceEnvironmentBinding = unitBinding()) {
  const faults: Faults = { resource: '', part: '', frame: null, allocAt: 0, rtAt: -1, operation: '', max: 4096, noResize: false, on: false, off: false, hook: null };
  const trace: string[] = [], rts: RT[] = [], sources: Source[] = [], listeners = new Set<() => void>();
  const makeSource = (part: Part) => {
    const value = new Source(part, faults, trace), size = part === 'terrain' ? 16 : 64;
    const media: Media = { width: part === 'terrain' ? 96 : 384, height: part === 'terrain' ? 96 : 64, image: {}, source: {} };
    const names = part === 'terrain' ? TILE_ROLES : PROP_ROLES;
    names.forEach((role, slot) => value.frames.set(String((binding[part].frames as Record<string, string | number>)[role]), {
      x: 0, y: 0, cutX: slot % 6 * size, cutY: Math.floor(slot / 6) * size, cutWidth: size, cutHeight: size,
      width: size, height: size, realWidth: size, realHeight: size, trimmed: false, rotated: false, source: media,
    }));
    sources.push(value); return value;
  };
  const textures = { terrain: makeSource('terrain'), props: makeSource('props') };
  const keys = { terrain: binding.terrain.key, props: binding.props.key }; let allocations = 0, ons = 0, offs = 0;
  const scene: FurnaceEnvironmentScene = {
    textures: {
      exists: key => { if (faults.resource === 'exists') throw Error('exists'); return faults.resource !== 'missing' && (key === keys.terrain || key === keys.props); },
      get: key => { if (faults.resource === 'get-texture') throw Error('get texture'); return key === keys.terrain ? textures.terrain : textures.props; },
    },
    add: { renderTexture: (x, y, width, height) => {
      allocations++; trace.push('allocate'); if (allocations === faults.allocAt) throw Error('allocate');
      const rt = new RT(rts.length, x, y, width, height, faults, trace); rts.push(rt);
      if (faults.noResize) Object.defineProperty(rt, 'resize', { value: undefined }); return rt;
    } },
    game: { renderer: {
      getMaxTextureSize: () => { if (faults.resource === 'limit') throw Error('limit'); return faults.max as number; },
      on: (event, listener) => { ons++; if (event !== RESTORE) throw Error('Wrong native event'); listeners.add(listener); if (faults.on) throw Error('on'); },
      off: (event, listener) => { offs++; if (event !== RESTORE) throw Error('Wrong native event'); listeners.delete(listener); if (faults.off) throw Error('off'); },
    } },
  };
  const frame = (part: Part, index: number) => {
    const role = (part === 'terrain' ? TILE_ROLES : PROP_ROLES)[index];
    return textures[part].frames.get(String((binding[part].frames as Record<string, string | number>)[role]))!;
  };
  return { scene, faults, trace, rts, sources, textures, makeSource, frame, listeners, binding,
    emit: () => { for (const callback of [...listeners]) callback(); },
    allocations: () => allocations, ons: () => ons, offs: () => offs,
  };
}
type Harness = ReturnType<typeof harness>;
const live = (h: Harness) => h.rts.filter(rt => rt.destroyed === 0);
function sharedSafe(h: Harness) { expect(h.sources.map(source => source.destroyed)).toEqual(h.sources.map(() => 0)); }
function cleared(h: Harness) { expect(live(h)).toHaveLength(0); expect(h.rts.every(rt => rt.destroyed === 1)).toBe(true); sharedSafe(h); }
const rectangles = (values: readonly FurnaceRect[]) => values.map(v => [v.x, v.y, v.width, v.height]);
const sorted = (values: number[][]) => [...values].sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2] || a[3] - b[3]);
function union(values: readonly FurnaceRect[]): number[][] {
  const groups = new Map<string, { y: number; height: number; spans: number[][] }>();
  for (const r of values) { const key = r.y + ':' + r.height, group = groups.get(key) ?? { y: r.y, height: r.height, spans: [] }; group.spans.push([r.x, r.x + r.width]); groups.set(key, group); }
  const result: number[][] = [];
  for (const group of groups.values()) {
    const spans = group.spans.sort((a, b) => a[0] - b[0]); let left = spans[0][0], right = spans[0][1];
    for (const next of spans.slice(1)) {
      expect(next[0], 'physical surfaces must not overlap').toBeGreaterThanOrEqual(right);
      if (next[0] === right) right = next[1]; else { result.push([left, group.y, right - left, group.height]); [left, right] = next; }
    }
    result.push([left, group.y, right - left, group.height]);
  }
  return sorted(result);
}
function coverage(surface: FurnaceSurface) {
  const mask = new Uint8Array(surface.width * surface.height);
  for (const command of surface.commands) if (command.kind === 'repeat') {
    for (let y = Math.max(0, command.y); y < Math.min(surface.height, command.y + command.height); y++)
      for (let x = Math.max(0, command.x); x < Math.min(surface.width, command.x + command.width); x++) mask[y * surface.width + x] = 1;
  }
  expect(mask.every(value => value === 1), 'native repeats cover the complete physical target without stretching').toBe(true);
}

describe('Furnace native contracts and independent Core layout', () => {
  it('uses actual Phaser4.0 ports, event, nearest mode and buffered repeat/stamp API', () => {
    expectTypeOf<Phaser.Scene>().toMatchTypeOf<FurnaceEnvironmentScene>();
    expectTypeOf<Phaser.GameObjects.RenderTexture>().toMatchTypeOf<FurnaceRenderTexture>();
    expect(nativeFilters).toMatchObject({ LINEAR: 0, NEAREST: 1 }); expect(RESTORE).toBe('restorewebgl');
    const rt = file('../../node_modules/phaser/src/gameobjects/rendertexture/RenderTexture.js').toString();
    expect(rt).toContain('repeat: function (key, frame, x, y, width, height, config)');
    expect(rt).toContain('stamp: function (key, frame, x, y, config)');
    expect(rt).toContain('this.texture.render();'); expect(rt).toContain('this.texture.setSize(width, height, forceEven);');
    const wrapper = file('../../node_modules/phaser/src/renderer/webgl/wrappers/WebGLTextureWrapper.js').toString();
    expect(wrapper).toContain('this._processTexture();'); expect(wrapper).toContain('gl.UNSIGNED_BYTE, null)');
  });
  it('freezes exact32+6 bindings against native packed metadata, including bulkhead8 and ledge-right9', () => {
    expect(FURNACE_TERRAIN_ROLES).toEqual(TILE_ROLES); expect(FURNACE_PROP_ROLES).toEqual(PROP_ROLES);
    expect(FURNACE_ENVIRONMENT_BINDING.terrain).toEqual({ key: 'environment-furnace-terrain', frames: Object.fromEntries(TILE_ROLES.map((r, i) => [r, String(i)])) });
    expect(FURNACE_ENVIRONMENT_BINDING.props).toEqual({ key: 'environment-furnace-props', frames: Object.fromEntries(PROP_ROLES.map((r, i) => [r, 'furnace-props ' + i + '.aseprite'])) });
    expect(FURNACE_ENVIRONMENT_ASSETS).toHaveLength(2);
    expect(FURNACE_ENVIRONMENT_ASSETS[0]).toEqual({ key: 'environment-furnace-terrain', image: 'game/furnace-terrain.png', load: 'spritesheet', frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, startFrame: 0, endFrame: 31, frames: Array.from({ length: 32 }, (_, i) => String(i)) });
    expect(FURNACE_ENVIRONMENT_ASSETS[1]).toEqual({ key: 'environment-furnace-props', image: 'game/furnace-props.png', atlas: 'game/furnace-props.json', load: 'atlas', frameWidth: 64, frameHeight: 64, frames: Array.from({ length: 6 }, (_, i) => 'furnace-props ' + i + '.aseprite') });
    for (const value of [FURNACE_TERRAIN_ROLES, FURNACE_PROP_ROLES, FURNACE_ENVIRONMENT_ASSETS, FURNACE_ENVIRONMENT_BINDING,
      FURNACE_ENVIRONMENT_BINDING.terrain, FURNACE_ENVIRONMENT_BINDING.props, FURNACE_ENVIRONMENT_BINDING.terrain.frames,
      FURNACE_ENVIRONMENT_BINDING.props.frames, ...FURNACE_ENVIRONMENT_ASSETS, ...FURNACE_ENVIRONMENT_ASSETS.map(a => a.frames)]) expect(Object.isFrozen(value)).toBe(true);
    const packed = JSON.parse(file('../../public/game/furnace-terrain.json').toString()) as { tileCount: number; columns: number; rows: number; imageWidth: number; imageHeight: number; map: { width: number; height: number } };
    expect(packed).toMatchObject({ tileCount: 32, columns: 6, rows: 6, imageWidth: 96, imageHeight: 96, map: { width: 16, height: 8 } });
    const terrainPng = file('../../public/game/furnace-terrain.png'), propsPng = file('../../public/game/furnace-props.png');
    expect([terrainPng.readUInt32BE(16), terrainPng.readUInt32BE(20), propsPng.readUInt32BE(16), propsPng.readUInt32BE(20)]).toEqual([96, 96, 384, 64]);
    const props = JSON.parse(file('../../public/game/furnace-props.json').toString()) as { frames: { filename: string; frame: { x: number; y: number; w: number; h: number } }[] };
    expect(props.frames.map(f => f.filename)).toEqual(FURNACE_ENVIRONMENT_ASSETS[1].frames);
    expect(props.frames.map(f => f.frame)).toEqual(PROP_ROLES.map((_, i) => ({ x: i * 64, y: 0, w: 64, h: 64 })));
    const h = harness(FURNACE_ENVIRONMENT_BINDING); expect(furnaceEnvironmentResourcesReady(h.scene.textures, FURNACE_ENVIRONMENT_BINDING)).toBe(true); expect(h.rts).toEqual([]); sharedSafe(h);
  });
  it.each([0, 1, 2] as const)('CP%i consumes actual immutable Core sets, not the16x8 authoring map as a level', cp => {
    const actual = structuredClone(createWorld({ ...createRun('0badcafe-0000-4000-8000-000000000001', 42), stage: 3, checkpoint: cp, donated: true, elapsedMs: 20000 }));
    expect(CHAPTER_THREE.platforms).toEqual(STATIC);
    expect(actual.furnace?.lifts.map(p => [p.id, p.x, p.y, p.w, p.h])).toEqual(cp === 0 ? [['nvda-lift', 560, 320, 120, 12]] : []);
    expect(actual.furnace?.heatZones.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))).toEqual(HEAT.slice(cp === 0 ? 0 : cp === 1 ? 1 : 3));
    const supplied = worldPlatforms(actual), before = JSON.stringify(actual); freeze(actual); freeze(supplied);
    const plan = planFurnaceEnvironment(actual, supplied); expect(plan).not.toBeNull();
    if (cp === 0) {
      // Observational manifest audit requested by Lead; never an oracle for the checks above/below.
      const commands = [...plan!.backgrounds, ...plan!.surfaces, ...plan!.lifts].flatMap(p => p.commands);
      const terrain = [...new Set(commands.filter(c => c.kind === 'repeat').map(c => c.role))].sort();
      const props = [...new Set(commands.filter(c => c.kind === 'prop').map(c => c.role))].sort();
      console.info('CP0_PLAN_USED_ROLES: ' + JSON.stringify({ terrainCount: terrain.length, terrain, propsCount: props.length, props }));
    }
    expect([plan!.width, plan!.height]).toEqual([3280, 360]); expect(rectangles(plan!.backgrounds)).toEqual(EXPECTED_BACKGROUND);
    expect(union(plan!.surfaces)).toEqual(sorted(EXPECTED_STATIC));
    expect(plan!.surfaces.reduce((sum, p) => sum + p.width * p.height, 0)).toBe(136360);
    expect(rectangles(plan!.lifts)).toEqual(cp === 0 ? [[560, 320, 120, 12]] : []);
    for (const surface of [...plan!.surfaces, ...plan!.lifts]) coverage(surface);
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    expect(r.draw(actual, supplied, view())).toBe(true); expect(live(h)).toHaveLength(cp === 0 ? 18 : 17);
    expect(union(live(h).filter(t => t.depth === 0.5 && !(t.x === 560 && t.height === 12)))).toEqual(sorted(EXPECTED_STATIC));
    r.destroy(); cleared(h);
    expect(JSON.stringify(actual)).toBe(before); expect(Object.isFrozen(plan)).toBe(true);
    for (const group of [plan!.backgrounds, plan!.surfaces, plan!.lifts]) {
      expect(Object.isFrozen(group)).toBe(true);
      for (const p of group) { expect(Object.isFrozen(p)).toBe(true); expect(Object.isFrozen(p.commands)).toBe(true); expect(p.commands.every(Object.isFrozen)).toBe(true); }
    }
    const exhaust = new Set(plan!.surfaces.flatMap(p => p.commands.filter(c => c.kind === 'prop' && c.role === 'floor-exhaust').map(c => [p.x + c.x, p.y + c.y, c.width, c.height].join(','))));
    expect([...exhaust].sort()).toEqual((cp === 0 ? ['1003,280,64,64', '1701,280,64,64', '2143,280,64,64'] : cp === 1 ? ['1701,280,64,64', '2143,280,64,64'] : []).sort());
  });
  it('keeps exactly12px ledges/lift,190px secret room,40px ground and cropped8px floor feet', () => {
    const plan = planFurnaceEnvironment(BASE.world, BASE.platforms)!;
    const secret = plan.surfaces.find(p => p.x === 720)!;
    expect(rectangles([secret])).toEqual([[720, 105, 190, 12]]);
    expect(secret.commands).toEqual([
      { kind: 'repeat', role: 'ledge-left', x: 0, y: 0, width: 16, height: 12, alpha: 1, tileX: 0, tileY: 0 },
      { kind: 'repeat', role: 'ledge-mid', x: 16, y: 0, width: 158, height: 12, alpha: 1, tileX: 0, tileY: 0 },
      { kind: 'repeat', role: 'ledge-right', x: 174, y: 0, width: 16, height: 12, alpha: 1, tileX: 0, tileY: 0 },
    ]);
    expect(plan.lifts[0].commands).toEqual([
      { kind: 'repeat', role: 'lift-left', x: 0, y: 0, width: 16, height: 12, alpha: 1, tileX: 0, tileY: 0 },
      { kind: 'repeat', role: 'lift-mid', x: 16, y: 0, width: 88, height: 12, alpha: 1, tileX: 0, tileY: 0 },
      { kind: 'repeat', role: 'lift-right', x: 104, y: 0, width: 16, height: 12, alpha: 1, tileX: 0, tileY: 0 },
    ]);
    const floor = plan.surfaces.filter(p => p.y === 320 && p.height === 40);
    expect(rectangles(floor)).toEqual(BAND_X.map(x => [x, 320, x === 3072 ? 208 : 512, 40]));
    const foot = floor.flatMap(p => p.commands.filter(c => c.kind === 'repeat' && c.role === 'floor-foot'));
    expect(foot).toHaveLength(205); expect(foot.every(c => c.y === 32 && c.height === 8 && c.width === 16)).toBe(true);
    const tops = floor.flatMap(p => p.commands.filter(c => c.kind === 'repeat' && c.role.startsWith('floor-top')).map(c => ({ ...c, x: p.x + c.x })));
    expect(tops).toHaveLength(205);
    tops.forEach((c, i) => expect([c.x, c.y, c.width, c.height, c.role]).toEqual([i * 16, 0, 16, 16, i % 2 ? 'floor-top-b' : 'floor-top-a']));
  });
  it('with no supplied surfaces or lifts keeps only background, never imports mother-map collision', () => {
    const w = input(2).world, plan = planFurnaceEnvironment(freeze(w), freeze([])); expect(plan).not.toBeNull();
    expect(rectangles(plan!.backgrounds)).toEqual(EXPECTED_BACKGROUND); expect(plan!.surfaces).toEqual([]); expect(plan!.lifts).toEqual([]);
  });
  it.each([140, 140.125, 219.49, 219.5, 319.875, 320])('lift y=%s remains real geometry until native presentation rounds once', y => {
    const data = freeze(input(0, y)), geometry = readFurnaceGeometry(data.world, data.platforms)!, plan = planFurnaceEnvironment(data.world, data.platforms)!;
    expect(geometry.lifts[0].y).toBe(y); expect(geometry.world.furnace!.lifts[0].y).toBe(y);
    expect(rectangles(plan.lifts)).toEqual([[560, Math.round(y), 120, 12]]);
    expect(geometry.key).toEqual(readFurnaceGeometry(BASE.world, BASE.platforms)!.key);
  });
  it('does not mutate/sort caller arrays and snapshots signs/platforms before caching', () => {
    const data = input(); data.world.chapter.signs.push({ x: 200.25, y: 20.5, text: 'two\nlines' }, { x: 10, y: 3, text: 'first' });
    data.platforms.reverse(); data.world.furnace.heatZones.reverse(); const before = JSON.stringify(data); freeze(data);
    const g = readFurnaceGeometry(data.world, data.platforms)!; expect(g).not.toBeNull(); expect(JSON.stringify(data)).toBe(before);
    expect(g.platforms.map(p => p.id)).toEqual(['gpu-cache', 'gpu-floor', 'gpu-observer', 'secret-room']);
    expect(g.world.chapter.signs?.map(s => s.text)).toEqual(['first', 'two\nlines']); expect(Object.isFrozen(g.key)).toBe(true);
    expect(g.world).not.toBe(data.world); expect(g.platforms[0]).not.toBe(data.platforms.find(p => p.id === 'gpu-cache'));
  });
  it('positions overhead props by their actual ink, not the transparent64px padding', () => {
    const plan = planFurnaceEnvironment(BASE.world, BASE.platforms)!;
    const overhead = new Set(plan.backgrounds.flatMap(p => p.commands.filter(c => c.kind === 'prop' && ['lunar-porthole', 'ceiling-aperture'].includes(c.role)).map(c => [c.role, p.x + c.x, p.y + c.y, c.width, c.height].join(','))));
    expect([...overhead].sort()).toEqual(['ceiling-aperture,588,36,64,64', 'lunar-porthole,588,-6,64,64']);
    // Source moon bounds12,6..51,45 and ceiling bounds0,4..63,21 imply these ink boxes.
    expect([588 + 12, -6 + 6, 40, 40]).toEqual([600, 0, 40, 40]);
    expect([588, 36 + 4, 64, 18]).toEqual([588, 40, 64, 18]);
    const blocked = input(); blocked.world.chapter.signs.push({ x: 590, y: 2, text: 'long label covering the moon' });
    const next = planFurnaceEnvironment(blocked.world, blocked.platforms)!;
    expect(next.backgrounds.flatMap(p => p.commands).some(c => c.role === 'lunar-porthole')).toBe(false);
  });
});

type Input = ReturnType<typeof input>;
const badGeometry: { name: string; change: (data: Input) => void }[] = [
  ...(['stage', 'width', 'height', 'floor'] as const).map(key => ({ name: 'chapter ' + key, change: (d: Input) => { d.world.chapter[key]++; } })),
  { name: 'null furnace', change: d => { Reflect.set(d.world, 'furnace', null); } },
  { name: 'not-array lifts', change: d => { Reflect.set(d.world.furnace, 'lifts', {}); } },
  { name: 'not-array heat', change: d => { Reflect.set(d.world.furnace, 'heatZones', {}); } },
  { name: 'missing matching lift', change: d => { d.platforms.pop(); } },
  { name: 'duplicate platform', change: d => { d.platforms.push({ ...d.platforms[0] }); } },
  { name: 'duplicate lift', change: d => { d.world.furnace.lifts.push({ ...d.world.furnace.lifts[0] }); } },
  { name: 'duplicate heat', change: d => { d.world.furnace.heatZones.push({ ...d.world.furnace.heatZones[0] }); } },
  { name: 'blank id', change: d => { d.platforms[0].id = ' '; } },
  { name: 'fractional static y', change: d => { d.platforms[1].y += 0.25; } },
  { name: 'fractional static x', change: d => { d.platforms[1].x += 0.25; } },
  { name: 'fractional width', change: d => { d.platforms[1].w += 0.25; } },
  { name: 'negative x', change: d => { d.platforms[0].x = -1; } },
  { name: 'right overflow', change: d => { d.platforms[0].w = 3281; } },
  { name: 'bottom overflow', change: d => { d.platforms[1].y = 349; } },
  { name: 'floor not at320', change: d => { d.platforms[0].y = 319; } },
  { name: 'ground height41', change: d => { d.platforms[0].h = 41; } },
  { name: 'ledge widened to16px high', change: d => { d.platforms[1].h = 16; } },
  { name: 'zero width', change: d => { d.platforms[1].w = 0; } },
  { name: 'lift width121', change: d => { d.world.furnace.lifts[0].w = 121; } },
  { name: 'lift height13', change: d => { d.world.furnace.lifts[0].h = 13; } },
  { name: 'lift too high', change: d => { d.world.furnace.lifts[0].y = 139.999; } },
  { name: 'lift too low', change: d => { d.world.furnace.lifts[0].y = 320.001; } },
  ...([NaN, Infinity, -Infinity] as const).map(y => ({ name: 'nonfinite lift ' + y, change: (d: Input) => { d.world.furnace.lifts[0].y = y; } })),
  ...(['x', 'y', 'w', 'h'] as const).map(key => ({ name: 'unmatched live lift ' + key, change: (d: Input) => {
    const i = d.platforms.length - 1; d.platforms[i] = { ...d.platforms[i], [key]: d.platforms[i][key] + 1 };
  } })),
  ...(['oneWay', 'protected', 'fragile'] as const).map(key => ({ name: 'nonboolean ' + key, change: (d: Input) => { Reflect.set(d.platforms[1], key, 'true'); } })),
  { name: 'nonarray signs', change: d => { Reflect.set(d.world.chapter, 'signs', {}); } },
  { name: 'nonfinite sign', change: d => { d.world.chapter.signs.push({ x: NaN, y: 1, text: 'label' }); } },
  { name: 'nonstring sign', change: d => { d.world.chapter.signs.push({ x: 1, y: 1, text: 'label' }); Reflect.set(d.world.chapter.signs[0], 'text', null); } },
  { name: 'negative heat', change: d => { d.world.furnace.heatZones[0].w = -1; } },
  { name: 'fractional heat', change: d => { d.world.furnace.heatZones[0].y += 0.5; } },
];
describe('geometry rejection is atomic and source-independent', () => {
  it.each(badGeometry)('$name is rejected by geometry, plan and adapter without allocation', ({ change }) => {
    const data = input(); change(data); freeze(data);
    expect(readFurnaceGeometry(data.world, data.platforms)).toBeNull(); expect(planFurnaceEnvironment(data.world, data.platforms)).toBeNull();
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    expect(r.draw(data.world, data.platforms, view())).toBe(false); expect(h.allocations()).toBe(0); sharedSafe(h); r.destroy();
  });
  it.each([null, undefined, [], {}, 0].map(raw => ({ raw })))('rejects malformed world $raw without throwing or creating resources', ({ raw }) => {
    expect(readFurnaceGeometry(raw as FurnacePlanInput, BASE.platforms)).toBeNull();
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    expect(r.draw(raw as FurnaceEnvironmentWorld, BASE.platforms, view())).toBe(false); expect(h.allocations()).toBe(0); r.destroy();
  });
  it('rejects throwing geometry getters without mutating input or resources', () => {
    const data = input(), reads: string[] = []; poison(data.world.chapter, 'width', reads); freeze(data);
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    expect(r.draw(data.world, data.platforms, view())).toBe(false); expect(reads).toEqual(['width']); expect(h.allocations()).toBe(0); r.destroy();
  });
});
const malformedFrame: { name: string; change: (frame: Frame) => void }[] = [
  ...(['x', 'y', 'cutX', 'cutY', 'cutWidth', 'cutHeight', 'width', 'height', 'realWidth', 'realHeight'] as const)
    .map(key => ({ name: key, change: (f: Frame) => { f[key]++; } })),
  { name: 'trimmed', change: f => { f.trimmed = true; } }, { name: 'rotated', change: f => { f.rotated = true; } },
  { name: 'source.width', change: f => { f.source = { ...f.source, width: f.source.width + 1 }; } },
  { name: 'source.height', change: f => { f.source = { ...f.source, height: f.source.height + 1 }; } },
  { name: 'null source', change: f => { Reflect.set(f, 'source', null); } },
  { name: 'undefined cutWidth', change: f => { Reflect.deleteProperty(f, 'cutWidth'); } },
];
describe('strict38-slot readiness and immutable binding admission', () => {
  it('loader readiness is side-effect-free, needs no GPU limit and admits string0 and extra frames', () => {
    const binding = unitBinding(); binding.terrain.frames['floor-top-a'] = 0;
    const h = harness(binding); Reflect.deleteProperty(h.scene.game.renderer, 'getMaxTextureSize');
    h.textures.terrain.frames.set('extra-unused', h.frame('terrain', 31));
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, binding)).toBe(true);
    expect(h.textures.terrain.requests.some(r => r.op === 'get-frame' && r.name === '0')).toBe(true);
    expect(h.sources.flatMap(s => s.requests).every(r => typeof r.name === 'string')).toBe(true);
    expect(h.sources.map(s => s.filters)).toEqual([[], []]); expect(h.allocations()).toBe(0);
    const r = new FurnaceEnvironmentRenderer(h.scene, binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); r.destroy(); sharedSafe(h);
  });
  it.each(frameRows)('requires $part slot$index ($role), even if outside the view or unused by CP2', ({ part, index }) => {
    const h = harness(), target = h.frame(part, index);
    for (const [name, value] of h.textures[part].frames) if (value === target) h.textures[part].frames.delete(name);
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
    const d = freeze(input(2)), r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    expect(r.draw(d.world, d.platforms, view())).toBe(false); expect(h.allocations()).toBe(0); sharedSafe(h); r.destroy();
  });
  it.each(frameRows.flatMap(row => malformedFrame.map(field => ({ ...row, ...field }))))('$part slot$index rejects malformed $name before any RT', ({ part, index, change }) => {
    const h = harness(); change(h.frame(part, index));
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false);
    expect(h.allocations()).toBe(0); expect(h.sources.map(s => s.filters)).toEqual([[], []]); r.destroy(); sharedSafe(h);
  });
  it.each(['width', 'cutWidth', 'realWidth', 'x', 'cutX'] as const)('rejects nonnumeric/nonfinite %s, not coercing texture metadata', key => {
    for (const value of [undefined, null, '16', NaN, Infinity, -1, 0.5]) {
      const h = harness(); Reflect.set(h.frame('props', 5), key, value);
      expect(furnaceEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
    }
  });
  it.each(frameRows)('rejects absent binding for $part/$role', ({ part, role }) => {
    const h = harness(), binding = unitBinding(); Reflect.deleteProperty(binding[part].frames, role);
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, binding)).toBe(false);
    const r = new FurnaceEnvironmentRenderer(h.scene, binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); expect(h.allocations()).toBe(0); r.destroy();
  });
  it.each([null, undefined, false, 0, '', [], {}, { terrain: {} }, { terrain: [], props: [] }].map(binding => ({ binding })))('rejects incomplete binding $binding', ({ binding }) => {
    const h = harness(); expect(furnaceEnvironmentResourcesReady(h.scene.textures, binding)).toBe(false);
    const r = new FurnaceEnvironmentRenderer(h.scene, binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); expect(h.allocations()).toBe(0); r.destroy();
  });
  it.each([null, undefined, false, -1, 0.5, NaN, Infinity, '', ' ', {}, []].map(value => ({ value })))('rejects invalid frame name/index $value even when the mock contains its string alias', ({ value }) => {
    const binding = unitBinding(); Reflect.set(binding.terrain.frames, 'floor-top-a', value); const h = harness(binding);
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, binding)).toBe(false);
    const r = new FurnaceEnvironmentRenderer(h.scene, binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); expect(h.allocations()).toBe(0); r.destroy();
  });
  it('copies caller bindings and rejects aliased keys, names and throwing binding getters', () => {
    const binding = unitBinding(), h = harness(binding), r = new FurnaceEnvironmentRenderer(h.scene, binding);
    binding.terrain.key = 'mutated'; binding.terrain.frames['floor-top-a'] = 999; binding.props.frames['lunar-porthole'] = 'mutated';
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true); expect(live(h)).toHaveLength(18);
    const duplicate = unitBinding(); duplicate.props.key = duplicate.terrain.key;
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, duplicate)).toBe(false);
    const repeated = unitBinding(); repeated.terrain.frames['ledge-right'] = '8';
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, repeated)).toBe(false);
    const trapped = unitBinding(), reads: string[] = []; poison(trapped, 'terrain', reads);
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, trapped)).toBe(false); expect(reads).toEqual(['terrain']); r.destroy(); cleared(h);
  });
  it('rejects one frame object reused across slots even when live cut getters masquerade as valid cuts', () => {
    const h = harness(), shared = h.frame('terrain', 0); let slot = 0;
    Object.defineProperty(shared, 'cutX', { get: () => slot % 6 * 16 }); Object.defineProperty(shared, 'cutY', { get: () => Math.floor(slot / 6) * 16 });
    h.textures.terrain.get = name => { slot = Number(name); return shared; };
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false); expect(h.allocations()).toBe(0); sharedSafe(h);
  });
  it.each(['exists', 'get-texture', 'has', 'get-frame'])('guards manager/frame %s exceptions with no filtering or allocation', resource => {
    const h = harness(); h.faults.resource = resource;
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false);
    expect(h.allocations()).toBe(0); expect(h.sources.map(s => s.filters)).toEqual([[], []]); r.destroy(); sharedSafe(h);
  });
});

describe('Furnace adapter presentation, immutability and static caching', () => {
  it.each([0, 1, 2])('CP%i renders literal Core rectangles at native scale with one explicit flush and correct depths', cp => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding), data = freeze(input(cp));
    expect(r.draw(data.world, data.platforms, view())).toBe(true); expect(live(h)).toHaveLength(cp === 0 ? 18 : 17);
    const backgrounds = live(h).filter(t => t.depth === -9), surfaces = live(h).filter(t => t.depth === 0.5);
    expect(rectangles(backgrounds)).toEqual(EXPECTED_BACKGROUND);
    const physical = surfaces.filter(t => !(t.x === 560 && t.height === 12));
    expect(union(physical)).toEqual(sorted(EXPECTED_STATIC));
    expect(rectangles(surfaces.filter(t => t.x === 560 && t.height === 12))).toEqual(cp === 0 ? [[560, 320, 120, 12]] : []);
    expect(h.sources.map(s => s.filters)).toEqual([[1], [1]]);
    expect(h.trace.indexOf('source:terrain:filter')).toBeLessThan(h.trace.indexOf('allocate'));
    expect(h.trace.indexOf('source:props:filter')).toBeLessThan(h.trace.indexOf('allocate'));
    for (const rt of live(h)) {
      expect(rt.origin).toEqual([0, 0]); expect([rt.scale, rt.rotation, rt.zoom, rt.cameraRotation]).toEqual([1, 0, 1, 0]);
      expect(rt.cameraPosition).toEqual([0, 0]); expect(rt.scroll).toEqual([0, 0]); expect(rt.mode).toBe('render');
      expect(rt.alpha).toBe(rt.depth === -9 ? 0.6 : 1); expect(rt.texture.filters).toEqual([1]);
      expect([rt.clears, rt.renders, rt.pending.length]).toEqual([1, 1, 0]); expect(rt.ops.length).toBeGreaterThan(0); expect(rt.pixelsValid).toBe(true);
      expect(rt.trace.indexOf('filter')).toBeLessThan(rt.trace.indexOf('clear')); expect(rt.trace.lastIndexOf('filter')).toBeLessThan(rt.trace.indexOf('render'));
      for (const op of rt.ops) {
        expect(typeof op.frame).toBe('string'); expect(op.config).toMatchObject({ originX: 0, originY: 0, scale: 1, rotation: 0, alpha: 1, tint: 0xffffff });
        if (op.kind === 'repeat') expect(op.config).toMatchObject({ tileScaleX: 1, tileScaleY: 1, tileRotation: 0, tilePositionY: 0 });
      }
    }
    backgrounds.forEach((rt, i) => expect(rt.ops.find(op => op.kind === 'repeat' && op.frame === '8')).toMatchObject({ x: [0, -512, -1024, -1536, -2048, -2560, -3072][i], y: 0, width: 3280, height: 360 }));
    const secret = surfaces.find(t => t.x === 720)!;
    expect(secret.ops.map(op => [op.frame, op.x, op.y, op.width, op.height])).toEqual([['6', 0, 0, 16, 12], ['7', 16, 0, 158, 12], ['9', 174, 0, 16, 12]]);
    const exhaust = new Set(surfaces.flatMap(rt => rt.ops.filter(op => op.kind === 'stamp' && op.frame === 'prop-3').map(op => {
      expect([rt.y + op.y + 40, rt.y + op.y + 63]).toEqual([320, 343]); return rt.x + op.x;
    })));
    expect([...exhaust].sort((a, b) => a - b)).toEqual(cp === 0 ? [1003, 1701, 2143] : cp === 1 ? [1701, 2143] : []);
    r.destroy(); cleared(h);
  });
  it('source numeric0 is normalized before both frame access and native repeat calls', () => {
    const binding = unitBinding(); binding.terrain.frames['floor-top-a'] = 0;
    const h = harness(binding), r = new FurnaceEnvironmentRenderer(h.scene, binding);
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    expect(h.sources.flatMap(s => s.requests).every(r => typeof r.name === 'string')).toBe(true);
    expect(h.rts.flatMap(t => t.ops).some(op => op.frame === '0')).toBe(true); r.destroy(); cleared(h);
  });
  it('camera motion changes only visibility, not allocation, filtering or static flush counts', () => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    for (const x of [0, 0.25, 512, 1372.75, 2640]) expect(r.draw(BASE.world, BASE.platforms, view(x))).toBe(true);
    expect(h.allocations()).toBe(18); expect(h.rts.every(t => t.renders === 1 && t.clears === 1)).toBe(true);
    expect(h.sources.map(s => s.filters)).toEqual([[1], [1]]);
    for (const rt of h.rts.filter(t => t.depth === -9)) expect(rt.visible).toBe(rt.x === 2560 || rt.x === 3072);
    expect(h.rts.find(t => t.x === 560 && t.height === 12)!.visible).toBe(false); r.destroy(); cleared(h);
  });
  it('fractional lift movement and phase/time/dy changes never add a second clock or rebake static pixels', () => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    const lift = h.rts.find(t => t.x === 560 && t.height === 12)!;
    [219.25, 219.49, 219.5, 140.1, 320].forEach((y, index) => {
      const data = input(0, y); Object.assign(data.world.save, { elapsedMs: 50000 + index * 999, donated: !!(index % 2) });
      Object.assign(data.world.furnace, { startedAt: 99999, enraged: true, laser: { phase: 'active', until: 777777 } });
      Object.assign(data.world.furnace.lifts[0], { dy: -999, periodMs: 1, minY: 0, maxY: 9999, offsetMs: 999 });
      data.world.furnace.heatZones.forEach(z => Object.assign(z, { phase: index % 2 ? 'active' : 'tell', phaseUntil: 99999 }));
      const before = JSON.stringify(data); freeze(data);
      expect(r.draw(data.world, data.platforms, view())).toBe(true); expect(lift.y).toBe(Math.round(y)); expect(JSON.stringify(data)).toBe(before);
    });
    expect(lift.moves).toEqual([[560, 219], [560, 220], [560, 140], [560, 320]]);
    expect(h.allocations()).toBe(18); expect(h.rts.every(t => t.renders === 1 && t.clears === 1 && t.texture.filters.length === 1)).toBe(true);
    expect(h.sources.map(s => s.filters)).toEqual([[1], [1]]); r.destroy(); cleared(h);
  });
  it('cannot read clocks, actors, hazards or tween/timer services while consuming a deep-frozen view', () => {
    const data = input(), reads: string[] = [], h = harness();
    for (const key of ['player', 'boss', 'bullets', 'mode', 'toJSON']) poison(data.world, key, reads);
    for (const key of ['elapsedMs', 'donated', 'score']) poison(data.world.save, key, reads);
    for (const key of ['startedAt', 'enraged', 'laser']) poison(data.world.furnace, key, reads);
    for (const key of ['dy', 'periodMs', 'offsetMs', 'minY', 'maxY']) poison(data.world.furnace.lifts[0], key, reads);
    for (const zone of data.world.furnace.heatZones) for (const key of ['phase', 'phaseUntil']) poison(zone, key, reads);
    poison(h.scene, 'time', reads); poison(h.scene, 'tweens', reads); freeze(data);
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    expect(r.draw(data.world, data.platforms, view())).toBe(true); expect(r.draw(data.world, data.platforms, view(512))).toBe(true);
    expect(reads).toEqual([]); expect(h.allocations()).toBe(18); expect(h.rts.every(t => t.renders === 1)).toBe(true); r.destroy(); cleared(h);
  });
  it('reorders of equivalent geometry do not invalidate, but real geometry and run changes do', () => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    const reordered = input(); reordered.platforms.reverse(); reordered.world.furnace.heatZones.reverse(); freeze(reordered);
    expect(r.draw(reordered.world, reordered.platforms, view())).toBe(true); expect(h.allocations()).toBe(18);
    const changed = input(); changed.platforms[1].x = 721; freeze(changed);
    expect(r.draw(changed.world, changed.platforms, view())).toBe(true); expect(h.allocations()).toBe(36); expect(h.rts.slice(0, 18).every(t => t.destroyed === 1)).toBe(true);
    const run = { ...changed.world, save: { runId: 'second-run' } };
    expect(r.draw(freeze(run), changed.platforms, view())).toBe(true); expect(h.allocations()).toBe(54); expect(h.rts.slice(0, 36).every(t => t.destroyed === 1)).toBe(true);
    r.destroy(); cleared(h);
  });
  it.each([1, 2])('checkpoint transition toCP%i replaces dynamic sets atomically, retaining backgrounds with no lifts', cp => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    const data = freeze(input(cp)); expect(r.draw(data.world, data.platforms, view())).toBe(true);
    expect(h.rts.slice(0, 18).every(t => t.destroyed === 1)).toBe(true); expect(live(h)).toHaveLength(17);
    expect(rectangles(live(h).filter(t => t.depth === -9))).toEqual(EXPECTED_BACKGROUND); expect(live(h).some(t => t.x === 560 && t.height === 12)).toBe(false);
    r.destroy(); cleared(h);
  });
  it('renders odd synthetic supplied geometry exactly using real resize(forceEven=false), not a widened collision skin', () => {
    const data = input(2); data.platforms = [{ id: 'synthetic-odd-probe', x: 17, y: 99, w: 191, h: 12 }]; freeze(data);
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(data.world, data.platforms, view())).toBe(true);
    const odd = live(h).find(t => t.depth === 0.5)!; expect(rectangles([odd])).toEqual([[17, 99, 191, 12]]); expect(odd.resizes).toEqual([[191, 12, false]]);
    expect(odd.ops.map(op => [op.x, op.width, op.height])).toEqual([[0, 16, 12], [16, 159, 12], [175, 16, 12]]); r.destroy(); cleared(h);
  });
});
const identityChanges = ['texture', 'frame', 'source', 'image', 'source-source'] as const;
describe('resource lifetime, invalidation and fail-closed ownership', () => {
  it.each((['terrain', 'props'] as const).flatMap(part => identityChanges.map(kind => ({ part, kind }))))('$part $kind replacement invalidates while never destroying shared sources', ({ part, kind }) => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    const index = part === 'terrain' ? 31 : 5, f = h.frame(part, index), originalSource = f.source;
    if (kind === 'texture') { const replacement = h.makeSource(part); replacement.frames = h.textures[part].frames; h.textures[part] = replacement; }
    else if (kind === 'frame') { for (const [name, value] of h.textures[part].frames) if (value === f) h.textures[part].frames.set(name, { ...f }); }
    else if (kind === 'source') f.source = { ...f.source };
    else if (kind === 'image') { f.source.image = {}; expect(f.source).toBe(originalSource); }
    else { f.source.source = {}; expect(f.source).toBe(originalSource); }
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true); expect(h.allocations()).toBe(36);
    expect(h.rts.slice(0, 18).every(t => t.destroyed === 1)).toBe(true); expect(live(h).every(t => t.renders === 1 && t.pixelsValid)).toBe(true);
    sharedSafe(h); r.destroy(); cleared(h);
  });
  it.each(['missing', 'exists', 'get-texture', 'has', 'get-frame', 'limit'])('late %s failure removes every previously owned RT and recovers only on a fresh valid draw', resource => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    h.faults.resource = resource; expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); cleared(h); expect(h.allocations()).toBe(18);
    h.faults.resource = ''; expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true); expect(h.allocations()).toBe(36); r.destroy(); cleared(h);
  });
  it.each(['terrain', 'props'] as const)('late %s tail geometry corruption removes all existing RTs before any partial rebuild', part => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    h.frame(part, part === 'terrain' ? 31 : 5).width--;
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); cleared(h); expect(h.allocations()).toBe(18); r.destroy();
  });
  it.each([undefined, null, '512', NaN, Infinity, 0, -1, 511, 512.5])('invalid device limit %j fails before allocation and also clears earlier resources', limit => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    h.faults.max = limit; expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); cleared(h); expect(h.allocations()).toBe(18); r.destroy();
  });
  it('accepts the exact512 device minimum without allocating a3280-wide RT', () => {
    const h = harness(); h.faults.max = 512; const r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true); expect(h.rts.every(t => t.width <= 512 && t.height <= 512)).toBe(true); r.destroy(); cleared(h);
  });
  it.each([1, 2, 8, 18])('allocation attempt%i failure releases only successfully returned owned RTs', at => {
    const h = harness(); h.faults.allocAt = at; const r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); expect(h.allocations()).toBe(at); expect(h.rts).toHaveLength(at - 1); cleared(h); r.destroy();
  });
  it.each(['visible', 'origin', 'scale', 'rotation', 'depth', 'alpha', 'mode', 'filter', 'camera-position', 'camera-scroll', 'camera-zoom', 'camera-rotation', 'clear', 'repeat', 'stamp', 'render'])('RT %s failure owns-before-setup and cleans every partial object', operation => {
    const h = harness(); h.faults.operation = operation; h.faults.rtAt = 0;
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false);
    expect(h.rts).toHaveLength(1); cleared(h); r.destroy();
  });
  it('last-RT render failure and throwing destroy cannot strand any earlier RT', () => {
    const h = harness(); h.faults.operation = 'render'; h.faults.rtAt = 17;
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); expect(h.rts).toHaveLength(18); cleared(h);
    h.faults.operation = ''; expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    h.faults.operation = 'destroy'; h.faults.rtAt = -1; expect(() => r.destroy()).not.toThrow(); cleared(h); r.destroy(); cleared(h);
  });
  it.each(['terrain', 'props'] as const)('source %s filtering failure leaves no RT and never destroys borrowed textures', part => {
    const h = harness(); h.faults.resource = 'filter'; h.faults.part = part;
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(true);
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); expect(h.allocations()).toBe(0); sharedSafe(h); r.destroy();
  });
  it.each([false, true])('odd-geometry resize failure/missingAPI=%s cleans all background and target RTs', missing => {
    const data = input(2); data.platforms = [{ id: 'odd-probe', x: 0, y: 100, w: 191, h: 12 }]; freeze(data);
    const h = harness(); h.faults.noResize = missing; if (!missing) h.faults.operation = 'resize';
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(data.world, data.platforms, view())).toBe(false); expect(h.rts).toHaveLength(8); cleared(h); r.destroy();
  });
});

describe('stage exit, viewport rejection, WebGL recovery and disposal', () => {
  it.each([{ x: -1 }, { y: -1 }, { width: 0 }, { height: 0 }, { width: 641 }, { height: 361 },
    { x: 2641 }, { y: 1 }, { x: NaN }, { y: Infinity }, { width: NaN }, { height: -1 }])('invalid viewport %j clears owned resources', patch => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    expect(r.draw(BASE.world, BASE.platforms, freeze({ ...view(), ...patch }))).toBe(false); cleared(h); expect(h.allocations()).toBe(18); r.destroy();
  });
  it.each([null, undefined, 0, '', ' '])('invalid runId %j cannot leave a previous run visible', runId => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    const data = input(); Reflect.set(data.world.save, 'runId', runId); freeze(data);
    expect(r.draw(data.world, data.platforms, view())).toBe(false); cleared(h); r.destroy();
  });
  it('stage exit releases all RTs, returning later rebakes once, and draw failure never calls restore invalidation', () => {
    const h = harness(); let callbacks = 0; const r = new FurnaceEnvironmentRenderer(h.scene, h.binding, () => { callbacks++; });
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    const other = input(); other.world.chapter.stage = 2; freeze(other);
    expect(r.draw(other.world, other.platforms, view())).toBe(false); cleared(h); expect(callbacks).toBe(0);
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true); expect(h.allocations()).toBe(36);
    h.faults.resource = 'missing'; expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); h.emit(); expect(callbacks).toBe(0); cleared(h); r.destroy();
  });
  it('normal paused restore filters before commands and reflushes all18 existing RTs once without a callback or new allocation', () => {
    const h = harness(); let callbacks = 0; const r = new FurnaceEnvironmentRenderer(h.scene, h.binding, () => { callbacks++; });
    h.emit(); expect(callbacks).toBe(0); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    const before = JSON.stringify(BASE); h.rts.forEach(t => { t.pixelsValid = false; t.ops = []; });
    h.faults.hook = name => { if (name === 'render') h.emit(); }; // nested native event must be ignored while restoring
    h.emit(); expect(callbacks).toBe(0); expect(h.allocations()).toBe(18);
    for (const t of h.rts) { expect([t.renders, t.clears, t.texture.filters.length]).toEqual([2, 2, 2]); expect(t.texture.filters).toEqual([1, 1]); expect(t.pixelsValid).toBe(true); expect(t.pending).toEqual([]); }
    expect(h.sources.map(s => s.filters)).toEqual([[1, 1], [1, 1]]); expect(JSON.stringify(BASE)).toBe(before);
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true); expect(h.rts.every(t => t.renders === 2)).toBe(true);
    h.faults.hook = null; r.destroy(); cleared(h);
  });
  it('source change during paused restore clears stale RTs then synchronously redraws immutable last state through one nonrecursive callback', () => {
    const h = harness(), paused = freeze({ ...BASE.world, mode: 'paused', save: { ...BASE.world.save, elapsedMs: 123456 } });
    const before = JSON.stringify(paused); let callbacks = 0;
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding, () => {
      callbacks++; expect(live(h)).toHaveLength(0); expect(r.draw(paused, BASE.platforms, view())).toBe(true); h.emit();
    });
    expect(r.draw(paused, BASE.platforms, view())).toBe(true); h.frame('props', 5).source.image = {};
    h.faults.hook = name => { if (name === 'render') h.emit(); };
    h.emit(); expect(callbacks).toBe(1); expect(h.allocations()).toBe(36); expect(live(h)).toHaveLength(18);
    expect(h.rts.slice(0, 18).every(t => t.destroyed === 1)).toBe(true); expect(live(h).every(t => t.renders === 1 && t.pixelsValid)).toBe(true);
    expect(JSON.stringify(paused)).toBe(before); expect(paused.save.elapsedMs).toBe(123456);
    h.faults.hook = null; r.destroy(); cleared(h);
  });
  it.each(['missing', 'limit', 'filter', 'render'])('restore %s failure clears all owned buffers and invalidates only once', failure => {
    const h = harness(); let callbacks = 0; const r = new FurnaceEnvironmentRenderer(h.scene, h.binding, () => { callbacks++; h.emit(); });
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    if (failure === 'render') { h.faults.operation = 'render'; h.faults.rtAt = 17; } else h.faults.resource = failure;
    expect(() => h.emit()).not.toThrow(); expect(callbacks).toBe(1); cleared(h); expect(h.allocations()).toBe(18);
    h.emit(); expect(callbacks).toBe(1); r.destroy();
  });
  it('a callback that redraws then throws cannot leak its newly allocated replacement RTs', () => {
    const h = harness(); let callbacks = 0;
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding, () => { callbacks++; expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true); throw Error('consumer'); });
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true); h.frame('terrain', 0).source.image = {};
    expect(() => h.emit()).not.toThrow(); expect(callbacks).toBe(1); expect(h.allocations()).toBe(36); cleared(h);
    h.emit(); expect(callbacks).toBe(1); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true); expect(h.allocations()).toBe(54); r.destroy(); cleared(h);
  });
  it('draw and restore reentry while submitting commands neither recursively allocate nor destroy the active transaction', () => {
    const h = harness(); let nested = 0, callbacks = 0;
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding, () => { callbacks++; });
    h.faults.hook = name => { if (name === 'render') { nested++; expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); h.emit(); } };
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true); expect(nested).toBe(18); expect(callbacks).toBe(0);
    expect(h.allocations()).toBe(18); expect(live(h)).toHaveLength(18); expect(h.rts.every(t => t.renders === 1 && t.pixelsValid)).toBe(true);
    h.faults.hook = null; r.destroy(); cleared(h);
  });
  it('constructor subscription failure unregisters its attempted callback and never renders', () => {
    const h = harness(); h.faults.on = true; const r = new FurnaceEnvironmentRenderer(h.scene, h.binding);
    expect([h.ons(), h.offs(), h.listeners.size]).toEqual([1, 1, 0]); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); expect(h.allocations()).toBe(0);
    r.destroy(); expect(h.offs()).toBe(1); sharedSafe(h);
  });
  it('destroy is idempotent, removes only its exact listener, and stale restore/draw cannot allocate or inspect state', () => {
    const h = harness(); let foreignCalls = 0; const foreign = () => { foreignCalls++; }; h.listeners.add(foreign);
    const r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    const callback = [...h.listeners].find(fn => fn !== foreign)!; r.destroy(); r.destroy(); cleared(h);
    expect([h.ons(), h.offs(), h.listeners.size]).toEqual([1, 1, 1]); expect(h.listeners.has(foreign)).toBe(true);
    const data = input(), reads: string[] = []; poison(data.world, 'save', reads); freeze(data);
    expect(r.draw(data.world, data.platforms, view())).toBe(false); callback(); h.emit();
    expect(reads).toEqual([]); expect(foreignCalls).toBe(1); expect(h.allocations()).toBe(18); cleared(h);
  });
  it('off-listener exceptions cannot prevent releasing all owned RTs or permit a second destroy', () => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    h.faults.off = true; expect(() => r.destroy()).not.toThrow(); r.destroy(); expect(h.offs()).toBe(1); expect(h.listeners.size).toBe(0); cleared(h);
  });
});

describe('strict primitive types and late source getters', () => {
  it.each(['trimmed', 'rotated'] as const)('%s must be the boolean false, not merely falsy', key => {
    for (const value of [undefined, null, 0, 1, 'false']) {
      const h = harness(); Reflect.set(h.frame('props', 5), key, value);
      expect(furnaceEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
    }
  });
  it.each(['terrain', 'props'] as const)('%s keys cannot be blank or nonstring even if the manager happens to expose them', part => {
    for (const key of [undefined, null, 0, '', ' ', {}, []]) {
      const binding = unitBinding(); Reflect.set(binding[part], 'key', key); const h = harness(binding);
      expect(furnaceEnvironmentResourcesReady(h.scene.textures, binding)).toBe(false);
    }
  });
  it.each(['image', 'source'] as const)('throwing last-slot source.%s fails closed and clears an existing view', key => {
    const h = harness(), r = new FurnaceEnvironmentRenderer(h.scene, h.binding); expect(r.draw(BASE.world, BASE.platforms, view())).toBe(true);
    const target = h.frame('props', 5), reads: string[] = []; target.source = { ...target.source }; poison(target.source, key, reads);
    expect(furnaceEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false); expect(reads).toEqual([key]);
    expect(r.draw(BASE.world, BASE.platforms, view())).toBe(false); expect(reads).toEqual([key, key]); expect(h.allocations()).toBe(18); cleared(h); r.destroy();
  });
  it.each([undefined, null, {}, 'platforms'].map(platforms => ({ platforms })))('nonarray platform input $platforms is never treated as mother-map geometry', ({ platforms }) => {
    expect(readFurnaceGeometry(BASE.world, platforms as readonly Platform[])).toBeNull();
    expect(planFurnaceEnvironment(BASE.world, platforms as readonly Platform[])).toBeNull();
  });
});
