import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type Phaser from 'phaser';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { CHAPTER, PLATFORMS, SIGNS } from '../../src/pages/GamePage/game/data/chapterOne';
import { ENVIRONMENT_ASSETS, ENVIRONMENT_BINDING, ENVIRONMENT_PROP_ROLES, ENVIRONMENT_TILE_ROLES, type EnvironmentBinding, type EnvironmentFrameId, type EnvironmentPropRole, type EnvironmentTileRole } from '../../src/pages/GamePage/game/data/environmentAssets';
import { environmentMaterialAt, planChapterOneEnvironment, type ChapterOneEnvironmentPlan, type EnvironmentRepeat } from '../../src/pages/GamePage/game/systems/ChapterOneEnvironmentPlan';
import { ChapterOneEnvironmentRenderer, type ChapterOneEnvironmentScene, type ChapterOneEnvironmentWorld, type EnvironmentImage, type EnvironmentRenderTexture, type EnvironmentTextureFrame } from '../../src/pages/GamePage/game/systems/ChapterOneEnvironmentRenderer';
import { worldPlatforms } from '../../src/pages/GamePage/game/systems/platforms';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';

const localRequire = createRequire(import.meta.url);
const nativeFilterMode: Readonly<{ LINEAR: number; NEAREST: number }> = localRequire(join(dirname(localRequire.resolve('phaser/package.json')), 'src/textures/const.js'));

// Unit-only names. Neither this dictionary nor its order is a claimed native export binding.
function unitBinding() {
  return {
    terrain: { key: 'unit-terrain', frames: Object.fromEntries(ENVIRONMENT_TILE_ROLES.map(role => [role, `unit-tile:${role}`])) as Record<EnvironmentTileRole, EnvironmentFrameId> },
    props: { key: 'unit-props', frames: Object.fromEntries(ENVIRONMENT_PROP_ROLES.map(role => [role, `unit-prop:${role}`])) as Record<EnvironmentPropRole, EnvironmentFrameId> },
  };
}
function frame(size: number, index = 0): EnvironmentTextureFrame {
  return { cutX: index * size, cutY: 0, cutWidth: size, cutHeight: size, width: size, height: size, realWidth: size, realHeight: size, trimmed: false, rotated: false, source: { width: size * 40, height: size } };
}
class TextureDouble {
  readonly frames = new Map<string, EnvironmentTextureFrame>();
  firstFrame = '';
  has(id: EnvironmentFrameId) { return this.frames.has(String(id)); }
  get(id: EnvironmentFrameId) { const result = this.frames.get(id ? String(id) : this.firstFrame); if (!result) throw new Error('Frame requested before existence check'); return result; }
}
type DrawValue = { kind: 'repeat' | 'stamp'; key: string; frame: EnvironmentFrameId; x: number; y: number; width?: number; height?: number; repeatAlpha?: number; config?: { originX: number; originY: number; scale: number; alpha: number } };
class SurfaceDouble implements EnvironmentRenderTexture {
  events: string[] = []; pending: DrawValue[] = []; painted: DrawValue[] = []; renders = 0; destroyed = 0; origin: number[] = []; scale = 0; depth = 0; mode = '';
  constructor(readonly x: number, readonly y: number, readonly width: number, readonly height: number) {}
  readonly texture = { setFilter: (mode: number) => { this.events.push(`filter:${mode}`); this.painted = []; } };
  readonly camera = {
    setPosition: (x: number, y: number) => { this.events.push(`camera-position:${x},${y}`); },
    setScroll: (x: number, y: number) => { this.events.push(`camera-scroll:${x},${y}`); },
    setZoom: (zoom: number) => { this.events.push(`camera-zoom:${zoom}`); },
    setRotation: (rotation: number) => { this.events.push(`camera-rotation:${rotation}`); },
  };
  setOrigin(x: number, y: number) { this.origin = [x, y]; }
  setScale(value: number) { this.scale = value; }
  setDepth(value: number) { this.depth = value; }
  setRenderMode(value: 'render') { this.mode = value; }
  clear() { this.events.push('clear'); this.pending = []; }
  repeat(key: string, value: EnvironmentFrameId, x: number, y: number, width: number, height: number, config?: { alpha: number }) { this.events.push('repeat'); this.pending.push({ kind: 'repeat', key, frame: value, x, y, width, height, ...(config ? { repeatAlpha: config.alpha } : {}) }); }
  stamp(key: string, value: EnvironmentFrameId, x: number, y: number, config: { originX: number; originY: number; scale: number; alpha: number }) { this.events.push('stamp'); this.pending.push({ kind: 'stamp', key, frame: value, x, y, config: { ...config } }); }
  render() { this.events.push('render'); this.painted = [...this.pending]; this.pending = []; this.renders++; }
  destroy() { this.destroyed++; }
  draw(): never { throw new Error('Queued Image references forbidden'); }
  drawFrame(): never { throw new Error('Not an installed RT API'); }
}
class ImageDouble implements EnvironmentImage {
  origin: number[] = []; scale = 0; depth = 0; alpha = 0; flipped = true; destroyed = 0;
  constructor(public x: number, public y: number, readonly key: string, readonly frame: EnvironmentFrameId) {}
  setPosition(x: number, y: number) { this.x = x; this.y = y; }
  setDisplayOrigin(x: number, y: number) { this.origin = [x, y]; }
  setScale(value: number) { this.scale = value; }
  setDepth(value: number) { this.depth = value; }
  setAlpha(value: number) { this.alpha = value; }
  setFlipX(value: boolean) { this.flipped = value; }
  destroy() { this.destroyed++; }
}
class SceneDouble implements ChapterOneEnvironmentScene {
  readonly surfaces: SurfaceDouble[] = []; readonly images: ImageDouble[] = []; readonly tables = new Map<string, TextureDouble>();
  readonly listeners = new Set<() => void>(); limit = 4096; failAllocationAt = -1;
  readonly game = { renderer: {
    getMaxTextureSize: () => this.limit,
    on: (event: string, listener: () => void) => { expect(event).toBe('restorewebgl'); this.listeners.add(listener); },
    off: (event: string, listener: () => void) => { expect(event).toBe('restorewebgl'); this.listeners.delete(listener); },
  } };
  readonly textures = {
    exists: (key: string) => this.tables.has(key),
    get: (key: string) => { const texture = this.tables.get(key); if (!texture) throw new Error('Texture requested before existence check'); return texture; },
  };
  readonly add = {
    renderTexture: (x: number, y: number, width: number, height: number) => { if (this.surfaces.length === this.failAllocationAt) throw new Error('No render target'); const surface = new SurfaceDouble(x, y, width, height); this.surfaces.push(surface); return surface; },
    image: (x: number, y: number, key: string, value: EnvironmentFrameId) => { const image = new ImageDouble(x, y, key, value); this.images.push(image); return image; },
  };
  constructor(binding: EnvironmentBinding = unitBinding()) {
    const tiles = new TextureDouble(), props = new TextureDouble();
    ENVIRONMENT_TILE_ROLES.forEach((role, index) => tiles.frames.set(String(binding.terrain.frames[role]), frame(16, index)));
    ENVIRONMENT_PROP_ROLES.forEach((role, index) => props.frames.set(String(binding.props.frames[role]), frame(64, index)));
    tiles.firstFrame = String(binding.terrain.frames[ENVIRONMENT_TILE_ROLES[0]]); props.firstFrame = String(binding.props.frames[ENVIRONMENT_PROP_ROLES[0]]);
    this.tables.set(binding.terrain.key, tiles); this.tables.set(binding.props.key, props);
  }
  restore() { for (const listener of [...this.listeners]) listener(); }
}
const world = () => structuredClone(createWorld(createRun('44444444-4444-4444-8444-444444444444', 42)));
function requirePlan(input = world(), platforms = input.chapter.platforms) { const plan = planChapterOneEnvironment(input, platforms); if (!plan) throw new Error('Expected supported first-chapter plan'); return plan; }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
function sample(plan: ChapterOneEnvironmentPlan, x: number, y: number) {
  const chunk = plan.chunks.find(value => x >= value.x && x < value.x + value.width && y >= value.y && y < value.y + value.height);
  if (!chunk) return null;
  const localX = x - chunk.x;
  const command = [...chunk.commands].reverse().find((value): value is EnvironmentRepeat => value.kind === 'repeat' && localX >= value.x && localX < value.x + value.width && y >= value.y && y < value.y + value.height);
  return command ? { role: command.role, id: command.platformId, u: (localX - command.x) % 16, v: (y - command.y) % 16 } : null;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('environment roles and pure geometry', () => {
  it('keeps thirty-two semantic roles and eight props in frozen approved descriptors', () => {
    expect(ENVIRONMENT_TILE_ROLES).toHaveLength(32); expect(new Set(ENVIRONMENT_TILE_ROLES).size).toBe(32);
    expect(ENVIRONMENT_PROP_ROLES).toHaveLength(8); expect(ENVIRONMENT_PROP_ROLES.filter(role => role.includes('mushroom'))).toEqual(['mushroom']);
    expect(ENVIRONMENT_BINDING).not.toBeNull(); expect(ENVIRONMENT_ASSETS).toHaveLength(2); expect(Object.isFrozen(ENVIRONMENT_ASSETS)).toBe(true);
    expect(Object.isFrozen(ENVIRONMENT_TILE_ROLES)).toBe(true); expect(Object.isFrozen(ENVIRONMENT_PROP_ROLES)).toBe(true);
  });
  it('uses five exact native chunks and freezes all exported plan values', () => {
    const plan = requirePlan(); expect(plan.chunks.map(c => [c.x, c.y, c.width, c.height])).toEqual([[0, 0, 640, 360], [640, 0, 640, 360], [1280, 0, 640, 360], [1920, 0, 640, 360], [2560, 0, 320, 360]]);
    expect(Object.isFrozen(plan)).toBe(true); expect(Object.isFrozen(plan.chunks)).toBe(true);
    for (const chunk of plan.chunks) { expect(Object.isFrozen(chunk)).toBe(true); expect(Object.isFrozen(chunk.commands)).toBe(true); expect(chunk.commands.every(Object.isFrozen)).toBe(true); }
  });
  it('covers precisely the real platform union without filling ground gaps or enlarging twelve-pixel ledges', () => {
    const plan = requirePlan(), actual = Buffer.alloc(CHAPTER.width * CHAPTER.height), expected = Buffer.alloc(actual.length);
    const fill = (buffer: Buffer, x: number, y: number, width: number, height: number) => { for (let row = y; row < y + height; row++) buffer.fill(1, row * CHAPTER.width + x, row * CHAPTER.width + x + width); };
    for (const platform of PLATFORMS) fill(expected, platform.x, platform.y, platform.w, platform.h);
    for (const chunk of plan.chunks) for (const command of chunk.commands) if (command.kind === 'repeat') {
      const x0 = Math.max(chunk.x, chunk.x + command.x), x1 = Math.min(chunk.x + chunk.width, chunk.x + command.x + command.width);
      const y0 = Math.max(0, command.y), y1 = Math.min(chunk.height, command.y + command.height); fill(actual, x0, y0, x1 - x0, y1 - y0);
    }
    expect(Buffer.compare(actual, expected)).toBe(0);
    for (const x of [640, 700, 739, 1210, 1250, 1309, 1750, 1800, 1849]) expect(sample(plan, x, 320)).toBeNull();
  });
  it.each([{ x: 1309, expected: 'study' }, { x: 1310, expected: 'forest' }, { x: 2239, expected: 'forest' }, { x: 2240, expected: 'arena' }])('classifies material at x=$x without changing geometry', ({ x, expected }) => { expect(environmentMaterialAt(x)).toBe(expected); });
  it.each(PLATFORMS.filter(platform => platform.oneWay))('keeps $id native 1:1 to its exact final column and twelfth row', platform => {
    const plan = requirePlan(); expect(sample(plan, platform.x + platform.w - 1, platform.y + 11)).toMatchObject({ id: platform.id, u: (platform.w - 1) % 16, v: 11 });
    expect(sample(plan, platform.x + platform.w, platform.y)).toBeNull(); expect(sample(plan, platform.x, platform.y + 12)).toBeNull();
  });
  it('crops the forty-pixel ground to 16+16+8 rather than scaling a tile or extending the world', () => {
    const plan = requirePlan(); expect(sample(plan, 100, 335)).toMatchObject({ role: 'stone-top', v: 15 }); expect(sample(plan, 100, 336)).toMatchObject({ role: 'stone-fill', v: 0 });
    expect(sample(plan, 100, 351)).toMatchObject({ v: 15 }); expect(sample(plan, 100, 352)).toMatchObject({ v: 0 }); expect(sample(plan, 100, 359)).toMatchObject({ v: 7 }); expect(sample(plan, 100, 360)).toBeNull();
  });
  it('preserves whole repeat rectangles with negative local origins across RT edges', () => {
    const plan = requirePlan(), crossing = plan.chunks[1].commands.find((c): c is EnvironmentRepeat => c.kind === 'repeat' && c.platformId === 'first-crossing');
    expect(crossing).toMatchObject({ x: -50, width: 130, height: 12 }); expect(sample(plan, 639, 254)?.u).toBe(1); expect(sample(plan, 640, 254)?.u).toBe(2);
    for (const index of [2, 3, 4]) expect(plan.chunks[index].commands.find(c => c.kind === 'repeat' && c.platformId === 'approach-arena')).toMatchObject({ x: 1850 - plan.chunks[index].x, width: 1030 });
    expect(sample(plan, 1920, 320)?.u).toBe(6); expect(sample(plan, 2560, 320)?.u).toBe(6);
  });
  it('does not draw artificial side cliffs at x2240 inside one real approach-arena platform', () => {
    const plan = requirePlan(); for (const x of [1850, 2239, 2240, 2879]) expect(sample(plan, x, 320)).toMatchObject({ id: 'approach-arena', role: 'stone-top' });
  });
  it('uses dim background-only props away from holes and teaching labels, with uncut cross-chunk stamps', () => {
    const plan = requirePlan();
    for (const chunk of plan.chunks) for (const command of chunk.commands) if (command.kind === 'stamp') {
      const x = command.x + chunk.x; expect(command.role).not.toBe('mushroom'); expect(command.alpha).toBe(0.22);
      expect(PLATFORMS.some(p => !p.oneWay && x >= p.x && x + 64 <= p.x + p.w)).toBe(true);
      for (const sign of SIGNS) { const lines = sign.text.split('\n'), w = Math.max(...lines.map(line => line.length)) * 10, h = lines.length * 14; expect(x < sign.x + w && x + 64 > sign.x && command.y < sign.y + h && command.y + 64 > sign.y).toBe(false); }
    }
    expect(plan.chunks[3].commands.find(c => c.kind === 'stamp' && c.role === 'lattice-window')).toMatchObject({ x: 624 });
    expect(plan.chunks[4].commands.find(c => c.kind === 'stamp' && c.role === 'lattice-window')).toMatchObject({ x: -16 });
  });
  it('accepts actual worldPlatforms and ignores collapseAt deadlines until Core really removes a surface', () => {
    const input = world(); input.collapseAt['compute-branch'] = 1; input.save.elapsedMs = 100000;
    expect(requirePlan(input, worldPlatforms(input)).chunks.some(c => c.commands.some(v => v.kind === 'repeat' && v.platformId === 'compute-branch'))).toBe(true);
    input.collapsed.push('compute-branch'); expect(requirePlan(input, worldPlatforms(input)).chunks.some(c => c.commands.some(v => v.kind === 'repeat' && v.platformId === 'compute-branch'))).toBe(false);
  });
  it.each([{ x: NaN }, { y: Infinity }, { w: 0 }, { h: -1 }, { x: 0.5 }])('rejects invalid geometry %j without repairing Core data', patch => {
    const input = world(), platforms = [{ ...PLATFORMS[0], ...patch }]; expect(planChapterOneEnvironment(input, platforms)).toBeNull();
  });
});

describe('read-only environment port and native lifecycle', () => {
  it('matches the installed Phaser nearest-filter constant rather than a mock assumption', () => {
    expect(nativeFilterMode.NEAREST).not.toBe(nativeFilterMode.LINEAR);
    const scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding());
    expect(renderer.draw(world())).toBe(true);
    for (const surface of scene.surfaces) expect(surface.events[0]).toBe(`filter:${nativeFilterMode.NEAREST}`);
    renderer.destroy();
  });
  it('is structurally compatible with installed Phaser4 Scene and the actual Core world', () => { expectTypeOf<Phaser.Scene>().toMatchTypeOf<ChapterOneEnvironmentScene>(); expectTypeOf<ReturnType<typeof createWorld>>().toMatchTypeOf<ChapterOneEnvironmentWorld>(); });
  it('keeps an explicitly unavailable binding on the Graphics fallback path', () => {
    const scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, null); expect(renderer.draw(world())).toBe(false); expect(scene.surfaces).toHaveLength(0); expect(scene.images).toHaveLength(0); renderer.destroy(); expect(scene.listeners.size).toBe(0);
  });
  it('bakes five native RTs with NEAREST before commands and identity cameras, without mutating a frozen world', () => {
    const scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()), input = freeze(world()), before = JSON.stringify(input);
    expect(renderer.draw(input)).toBe(true); expect(JSON.stringify(input)).toBe(before); expect(scene.surfaces).toHaveLength(5); expect(scene.images).toHaveLength(1);
    for (const surface of scene.surfaces) {
      expect(surface).toMatchObject({ scale: 1, origin: [0, 0], depth: -5, mode: 'render', renders: 1 }); expect(surface.width).toBeLessThanOrEqual(640); expect(surface.height).toBe(360);
      expect(surface.events.slice(0, 6)).toEqual([`filter:${nativeFilterMode.NEAREST}`, 'camera-position:0,0', 'camera-scroll:0,0', 'camera-zoom:1', 'camera-rotation:0', 'clear']); expect(surface.events.at(-1)).toBe('render'); expect(surface.painted.length).toBeGreaterThan(0);
      for (const value of surface.painted) if (value.kind === 'stamp') expect(value.config).toEqual({ originX: 0, originY: 0, scale: 1, alpha: 0.22 });
    }
    expect(scene.images[0]).toMatchObject({ origin: [32, 32], depth: -1, scale: 1, alpha: 1, flipped: false, frame: 'unit-prop:mushroom' });
  });
  it('does not rebake for elapsed time, camera-like fields, collapse deadlines or a saved next stage', () => {
    const scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()), input = world(); renderer.draw(input);
    input.save.elapsedMs = 9999; input.save.stage = 2; input.collapseAt['compute-branch'] = 1; renderer.draw(input);
    expect(scene.surfaces.map(s => s.renders)).toEqual([1, 1, 1, 1, 1]); expect(scene.surfaces).toHaveLength(5);
  });
  it('rebakes changed actual platform membership in the same owned RTs without stale terrain', () => {
    const scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()), input = world(); renderer.draw(input); input.collapsed.push('compute-branch'); renderer.draw(input, worldPlatforms(input));
    expect(scene.surfaces).toHaveLength(5); expect(scene.surfaces.map(s => s.renders)).toEqual([2, 2, 2, 2, 2]);
    expect(scene.surfaces[1].painted.some(p => p.kind === 'repeat' && p.x === 390 && p.y === 192)).toBe(false);
  });
  it('replays a retained immutable plan after restore while no new world update occurs', () => {
    const scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()), input = world(); renderer.draw(input);
    const before = scene.surfaces.map(s => [...s.painted]); input.chapter.platforms[0].x = 99; for (const surface of scene.surfaces) surface.painted = [];
    scene.restore(); expect(scene.surfaces.map(s => s.painted)).toEqual(before); expect(scene.surfaces.every(s => s.painted.length > 0 && s.renders === 2)).toBe(true);
    // This is a port replay positive control, not a claimed native browser context-restoration test.
  });
  it('cleans on resource loss during restoration and can recover at the next genuine draw', () => {
    const scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()), input = world(); renderer.draw(input); const saved = scene.textures.get('unit-terrain'); scene.tables.delete('unit-terrain'); scene.restore();
    expect(scene.surfaces.every(s => s.destroyed === 1)).toBe(true); expect(scene.images[0].destroyed).toBe(1); scene.tables.set('unit-terrain', saved); expect(renderer.draw(input)).toBe(true); expect(scene.surfaces).toHaveLength(10);
  });
  it('reads only authoritative environment fields and never player, camera, Doom or collapseAt', () => {
    const input = world(); for (const key of ['player', 'camera', 'collapseAt']) Object.defineProperty(input, key, { get: () => { throw new Error(`forbidden ${key}`); } });
    Object.defineProperty(input.save, 'doom', { get: () => { throw new Error('forbidden Doom inference'); } });
    expect(new ChapterOneEnvironmentRenderer(new SceneDouble(), unitBinding()).draw(input)).toBe(true);
  });
  it('keeps one static mushroom frame at the original simulation bob, with no new alpha clock', () => {
    vi.useFakeTimers(); const input = world(), scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()); renderer.draw(input); const image = scene.images[0], y = image.y;
    vi.advanceTimersByTime(120000); renderer.draw(input); expect(image.y).toBe(y); expect(image.alpha).toBe(1); expect(vi.getTimerCount()).toBe(0);
    input.save.elapsedMs = 280; renderer.draw(input); expect(image.x).toBe(1668); expect(image.y).toBe(174 + Math.sin(280 / 280 + 1668) * 2); expect(image.frame).toBe('unit-prop:mushroom'); expect(scene.images).toHaveLength(1);
  });
  it('removes a genuinely collected mushroom immediately, without manufacturing background mushrooms', () => {
    const input = world(), scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()); renderer.draw(input); input.pickups = input.pickups.filter(p => p.kind !== 'mushroom'); renderer.draw(input);
    expect(scene.images[0].destroyed).toBe(1); expect(scene.surfaces.every(s => s.renders === 1)).toBe(true);
  });
  it('rebuilds on run identity but not saved next-stage identity, and removes everything outside stage one', () => {
    const input = world(), scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()); renderer.draw(input); input.save.runId = 'new-run'; renderer.draw(input);
    expect(scene.surfaces.slice(0, 5).every(s => s.destroyed === 1)).toBe(true); expect(scene.images[0].destroyed).toBe(1); expect(scene.surfaces).toHaveLength(10);
    input.chapter = { ...input.chapter, stage: 2 }; expect(renderer.draw(input)).toBe(false); expect(scene.surfaces.every(s => s.destroyed === 1)).toBe(true); expect(scene.images.every(i => i.destroyed === 1)).toBe(true);
  });
  it.each([0, 512, 639, NaN, Infinity])('fails safely at unsupported texture limit %s', limit => { const scene = new SceneDouble(); scene.limit = limit; expect(new ChapterOneEnvironmentRenderer(scene, unitBinding()).draw(world())).toBe(false); expect(scene.surfaces).toHaveLength(0); });
  it('cleans any partial allocation instead of leaving an incomplete overlay over Graphics', () => { const scene = new SceneDouble(); scene.failAllocationAt = 2; expect(new ChapterOneEnvironmentRenderer(scene, unitBinding()).draw(world())).toBe(false); expect(scene.surfaces).toHaveLength(2); expect(scene.surfaces.every(s => s.destroyed === 1)).toBe(true); expect(scene.images).toHaveLength(0); });
  it.each(['unit-terrain', 'unit-props'])('cleans after missing whole texture %s', key => { const scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()); renderer.draw(world()); scene.tables.delete(key); expect(renderer.draw(world())).toBe(false); expect(scene.surfaces.every(s => s.destroyed === 1)).toBe(true); expect(scene.images[0].destroyed).toBe(1); });
  it.each([
    { cutWidth: 15 }, { width: 15 }, { realWidth: 32 }, { height: 15 }, { realHeight: 32 }, { trimmed: true }, { rotated: true },
    { cutX: -1 }, { cutY: -1 }, { cutX: 0.5 }, { cutX: 640 }, { cutY: 1 }, { source: { width: 15, height: 16 } }, { source: { width: NaN, height: 16 } },
  ])('rejects invalid actual TextureFrame metadata %j', patch => {
    const scene = new SceneDouble(); Object.assign(scene.textures.get('unit-terrain').get('unit-tile:stone-top'), patch);
    expect(new ChapterOneEnvironmentRenderer(scene, unitBinding()).draw(world())).toBe(false); expect(scene.surfaces).toHaveLength(0);
  });
  it('requires all semantic roles even if the missing role is not currently painted', () => { const scene = new SceneDouble(); scene.textures.get('unit-terrain').frames.delete('unit-tile:moss-top-alt'); expect(new ChapterOneEnvironmentRenderer(scene, unitBinding()).draw(world())).toBe(false); });
  it('validates the independent 64px prop frame instead of borrowing the tile dimensions', () => { const scene = new SceneDouble(); scene.textures.get('unit-props').frames.set('unit-prop:mushroom', frame(16)); expect(new ChapterOneEnvironmentRenderer(scene, unitBinding()).draw(world())).toBe(false); });
  it('copies role bindings defensively and accepts legal numeric/deduplicated native frame identifiers', () => {
    const binding = unitBinding(), scene = new SceneDouble(binding), renderer = new ChapterOneEnvironmentRenderer(scene, binding); binding.terrain.frames['stone-top'] = 'external-edit'; expect(renderer.draw(world())).toBe(true);
    const numeric = unitBinding(); for (const role of ENVIRONMENT_TILE_ROLES) numeric.terrain.frames[role] = 0;
    expect(new ChapterOneEnvironmentRenderer(new SceneDouble(numeric), numeric).draw(world())).toBe(true);
  });

  it('normalizes numeric zero to its real named frame even when firstFrame is a decoy', () => {
    const binding = unitBinding(); for (const role of ENVIRONMENT_TILE_ROLES) binding.terrain.frames[role] = 0; binding.props.frames.mushroom = 0;
    const scene = new SceneDouble(binding), tiles = scene.textures.get('unit-terrain'), props = scene.textures.get('unit-props');
    const decoy = frame(16, 39); tiles.frames.set('decoy', decoy); tiles.firstFrame = 'decoy'; props.frames.set('decoy', frame(64, 39)); props.firstFrame = 'decoy';
    expect(tiles.get(0)).toBe(decoy); expect(tiles.get('0')).not.toBe(decoy); // Actual 4.0 Texture.get falsy-zero rule.
    const renderer = new ChapterOneEnvironmentRenderer(scene, binding); expect(renderer.draw(world())).toBe(true);
    expect(scene.surfaces.flatMap(surface => surface.painted).filter(command => command.kind === 'repeat').every(command => command.frame === '0')).toBe(true);
    expect(scene.images[0].frame).toBe('0'); renderer.destroy();
  });
  it.each(['unit-terrain', 'unit-props'])('invalidates atomically replaced texture identity %s without needing a missing draw', key => {
    const scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()), input = freeze(world()); renderer.draw(input);
    scene.tables.set(key, new SceneDouble().textures.get(key)); expect(renderer.draw(input)).toBe(true);
    expect(scene.surfaces).toHaveLength(10); expect(scene.surfaces.slice(0, 5).every(surface => surface.destroyed === 1)).toBe(true);
    expect(scene.images).toHaveLength(2); expect(scene.images[0].destroyed).toBe(1); renderer.destroy();
  });
  it('invalidates an atomically replaced Frame inside the same texture', () => {
    const scene = new SceneDouble(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding()), input = freeze(world()); renderer.draw(input);
    scene.textures.get('unit-terrain').frames.set('unit-tile:stone-top', frame(16, 1)); expect(renderer.draw(input)).toBe(true);
    expect(scene.surfaces).toHaveLength(10); expect(scene.images[0].destroyed).toBe(1); renderer.destroy();
  });
  it('notifies the parent to repaint frozen fallback after restoration loses resources', () => {
    const scene = new SceneDouble(), input = freeze(world()), before = JSON.stringify(input);
    const invalidate = vi.fn(() => renderer.draw(input));
    const renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding(), invalidate); renderer.draw(input);
    scene.tables.delete('unit-terrain'); scene.restore();
    expect(invalidate).toHaveBeenCalledTimes(1); expect(invalidate.mock.results[0].value).toBe(false);
    expect(scene.surfaces.every(surface => surface.destroyed === 1)).toBe(true); expect(JSON.stringify(input)).toBe(before);
    scene.restore(); expect(invalidate).toHaveBeenCalledTimes(1); renderer.destroy();
  });
  it('notifies restoration failure after a real replay exception, not only missing resources', () => {
    const scene = new SceneDouble(), invalidate = vi.fn(), renderer = new ChapterOneEnvironmentRenderer(scene, unitBinding(), invalidate); renderer.draw(world());
    vi.spyOn(scene.surfaces[0], 'render').mockImplementationOnce(() => { throw new Error('Context replay failed'); }); scene.restore();
    expect(invalidate).toHaveBeenCalledTimes(1); expect(scene.surfaces.every(surface => surface.destroyed === 1)).toBe(true); expect(scene.images[0].destroyed).toBe(1); renderer.destroy();
  });
  it.each(['', ' ', -1, 0.5, NaN])('rejects invalid frame identifier %s before any allocation', value => { const binding = unitBinding(); binding.props.frames.mushroom = value; const scene = new SceneDouble(); expect(new ChapterOneEnvironmentRenderer(scene, binding).draw(world())).toBe(false); expect(scene.surfaces).toHaveLength(0); });
  it('destroys idempotently, unregisters restore, never resurrects and keeps renderer instances separate', () => {
    const scene = new SceneDouble(), first = new ChapterOneEnvironmentRenderer(scene, unitBinding()), second = new ChapterOneEnvironmentRenderer(scene, unitBinding()); first.draw(world()); second.draw(world()); first.destroy(); first.destroy();
    expect(scene.listeners.size).toBe(1); expect(first.draw(world())).toBe(false); scene.restore(); expect(scene.surfaces.slice(0, 5).every(s => s.destroyed === 1 && s.renders === 1)).toBe(true); expect(scene.surfaces.slice(5).every(s => s.destroyed === 0 && s.renders === 2)).toBe(true); second.destroy(); expect(scene.listeners.size).toBe(0);
  });
});
