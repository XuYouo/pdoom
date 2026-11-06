import { readFileSync } from 'node:fs';
import type * as Phaser from 'phaser';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { LoomNode, WorldState } from '../../src/pages/GamePage/game/entities/model';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { worldPlatforms } from '../../src/pages/GamePage/game/systems/platforms';
import { generateLoomNodes } from '../../src/pages/GamePage/game/data/loomGraph';
import { LOOM_ENVIRONMENT_ASSETS, LOOM_ENVIRONMENT_BINDING } from '../../src/pages/GamePage/game/data/loomEnvironmentAssets';
import { LOOM_TERRAIN_ROLES, LOOM_PROP_ROLES, LOOM_IMAGE_LIMIT, planLoomEnvironment,
  type LoomCommand, type LoomRect } from '../../src/pages/GamePage/game/systems/LoomEnvironmentPlan';
import { LoomEnvironmentRenderer, loomEnvironmentResourcesReady, type LoomEnvironmentBinding,
  type LoomEnvironmentScene, type LoomImage, type LoomTextureFrame, type LoomSourceTexture } from '../../src/pages/GamePage/game/systems/LoomEnvironmentRenderer';

// Independent native-slot/Core literals. Local unit fixtures are not browser evidence.
// Source top3 alpha and Core foreground cracks are separately tested, never faked here.
// API clarification: actual Core allows fractional x/y, but native widths are integers40..180.
// Fractional widths remain explicit negative controls; they are not rounded or stretched.
const TILES = ['upper-left', 'upper-mid-a', 'upper-mid-b', 'upper-right', 'lower-left', 'lower-mid-a', 'lower-mid-b', 'lower-right',
  'hub-left', 'hub-mid-a', 'hub-mid-b', 'hub-right', 'anchor-left', 'anchor-mid-a', 'anchor-mid-b', 'anchor-right',
  'void-wall-a', 'void-wall-b', 'thread-v', 'thread-h', 'thread-elbow', 'thread-fork', 'shuttle-socket', 'quiet-ring',
  'loom-upright', 'loom-crossbar', 'loom-elbow', 'thread-knot', 'thread-tail', 'dark-weave-a', 'dark-weave-b', 'loom-rivet-panel'] as const;
const PROPS = ['fork-spindle', 'split-reel', 'shuttle-bank', 'branch-coupler', 'broken-loom', 'distant-fork-tree'] as const;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) { const d = Object.getOwnPropertyDescriptor(value, key); if (d && 'value' in d) freeze(d.value); }
    Object.freeze(value);
  }
  return value;
}
function trap(target: object, key: string, reads: string[]) {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, get() { reads.push(key); throw Error('forbidden ' + key); } });
}
function world(cp = 0, seed = 42, timeline: 0 | 1 = 0) {
  const w = structuredClone(createWorld({ ...createRun('0badcafe-0000-4000-8000-000000000099', seed), stage: 4, checkpoint: cp, elapsedMs: 20000 }));
  if (timeline) { w.loom!.nodes = generateLoomNodes(seed, timeline, cp); w.loom!.timeline = timeline; }
  return w;
}
function fixture(nodes?: LoomNode[]) {
  const w = world();
  w.loom!.nodes = nodes ?? [node('left', 100.25, 320.5, 131, 'upper'), node('right', 320.75, 320.5, 111, 'lower')];
  return w;
}
function node(id: string, x: number, y: number, w: number, branch: LoomNode['branch'], protectedNode = false): LoomNode {
  return { id, x, y, w, h: 12, branch, protected: protectedNode, segment: branch === 'arena' ? 3 : 0,
    oneWay: true, expanded: true, collapsed: false, collapseAt: null, next: [] };
}
const view = (x = 0, y = 200): LoomRect => ({ x, y, width: 640, height: 360 });
function expectedNodes(w: WorldState) { return worldPlatforms(w).filter(n => !w.loom!.eaten.includes(n.id)); }
function family(n: LoomNode) { return n.branch === 'arena' ? n.protected ? 'anchor' : 'upper' : n.branch; }
function coverage(commands: readonly LoomCommand[], n: LoomNode) {
  const parts = commands.filter(c => c.kind === 'tile' && c.nodeId === n.id).sort((a, b) => a.x - b.x);
  expect(parts).toHaveLength(Math.ceil((n.w - 32) / 16) + 2);
  expect(parts[0]).toMatchObject({ role: family(n) + '-left', x: n.x, y: n.y, width: 16, height: 12, depth: 0.5 });
  expect(parts.at(-1)).toMatchObject({ role: family(n) + '-right', x: n.x + n.w - 16, y: n.y, width: 16, height: 12, depth: 0.5 });
  let cursor = n.x;
  for (const [i, c] of parts.entries()) {
    expect(c.x).toBeCloseTo(cursor, 10); expect(c.y).toBe(n.y); expect(c.height).toBe(12); expect(c.depth).toBe(0.5);
    expect(c.width).toBeGreaterThan(0); expect(c.width).toBeLessThanOrEqual(16); cursor += c.width;
    if (i > 0 && i < parts.length - 1) expect([family(n) + '-mid-a', family(n) + '-mid-b']).toContain(c.role);
  }
  expect(cursor).toBeCloseTo(n.x + n.w, 10);
}
function verifyPlan(w: WorldState) {
  const before = JSON.stringify(w); freeze(w); const p = planLoomEnvironment(w);
  expect(p).not.toBeNull(); expect(JSON.stringify(w)).toBe(before);
  expect(new Set(p!.commands.map(c => c.id)).size).toBe(p!.commands.length); expect(p!.commands.length).toBeLessThanOrEqual(512);
  const nodes = expectedNodes(w);
  expect([...p!.nodeIds].sort()).toEqual(nodes.map(n => n.id).sort());
  for (const n of nodes) coverage(p!.commands, n as LoomNode);
  expect([...new Set(p!.commands.filter(c => c.kind === 'tile' && c.nodeId !== null).map(c => c.nodeId))].sort()).toEqual(nodes.map(n => n.id).sort());
  for (const c of p!.commands) {
    expect(typeof c.id).toBe('string'); expect(c.id.trim()).not.toBe('');
    expect([c.x, c.y, c.width, c.height, c.depth].every(Number.isFinite)).toBe(true);
    expect(c.width).toBeGreaterThan(0); expect(c.height).toBeGreaterThan(0);
    if (c.nodeId === null || c.kind === 'prop') expect(c.depth).toBeLessThan(0);
    if (c.kind === 'prop' && c.nodeId !== null) {
      const hub = nodes.find(n => (n as LoomNode).branch === 'hub' && c.x + c.width > n.x && c.x < n.x + n.w && c.y + c.height <= n.y - 80);
      expect(hub, 'props leave at least80px below their full bounds above a live hub').toBeDefined();
      expect(c.nodeId).toBe(hub!.id);
    }
  }
  return p!;
}
function binding() {
  return { terrain: { key: 'unit-loom-terrain', frames: Object.fromEntries(TILES.map((r, i) => [r, String(i)])) as Record<typeof TILES[number], string | number> },
    props: { key: 'unit-loom-props', frames: Object.fromEntries(PROPS.map((r, i) => [r, 'prop-' + i])) as Record<typeof PROPS[number], string | number> } };
}
type Part = 'terrain' | 'props';
type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type Media = { width: number; height: number; image?: unknown; source?: unknown };
type Frame = Mutable<Omit<LoomTextureFrame, 'source'>> & { source: Media };
interface Faults { op: string; frame: string | null; imageOp: string; imageAt: number; hook: ((op: string, index?: number) => void) | null }
class ImagePort implements LoomImage {
  x = -1; y = -1; key = ''; frame = ''; origin = [0.5, 0.5]; scale = 9; rotation = 3; alpha = 0.2; tint = 0; depth = 99;
  flip = [true, true]; crop = [-1, -1, -1, -1]; visible = false; destroyed = 0; calls: string[] = [];
  constructor(readonly index: number, readonly faults: Faults) {}
  private hit(op: string) {
    this.calls.push(op); this.faults.hook?.(op, this.index);
    if (this.faults.imageOp === op && (this.faults.imageAt < 0 || this.faults.imageAt === this.index)) throw Error('image ' + op);
  }
  setTexture(key: string, frame: string) { this.hit('texture'); this.key = key; this.frame = frame; this.origin = [0.5, 0.5]; this.crop = [-1, -1, -1, -1]; return this; }
  setOrigin(x: number, y: number) { this.hit('origin'); this.origin = [x, y]; return this; }
  setScale(value: number) { this.hit('scale'); this.scale = value; return this; }
  setRotation(value: number) { this.hit('rotation'); this.rotation = value; return this; }
  setPosition(x: number, y: number) { this.hit('position'); this.x = x; this.y = y; return this; }
  setDepth(value: number) { this.hit('depth'); this.depth = value; return this; }
  setAlpha(value: number) { this.hit('alpha'); this.alpha = value; return this; }
  setVisible(value: boolean) { this.hit('visible'); this.visible = value; return this; }
  setCrop(x: number, y: number, width: number, height: number) { this.hit('crop'); this.crop = [x, y, width, height]; return this; }
  setTint(value: number) { this.hit('tint'); this.tint = value; return this; }
  setFlip(x: boolean, y: boolean) { this.hit('flip'); this.flip = [x, y]; return this; }
  destroy() { this.destroyed++; this.visible = false; this.hit('destroy'); }
}
interface Source extends LoomSourceTexture { frames: Map<string, Frame>; filters: number[]; destroyed: number; media: Media; destroy(): void }
function harness(b: LoomEnvironmentBinding = binding()) {
  const faults: Faults = { op: '', frame: null, imageOp: '', imageAt: -1, hook: null };
  const images: ImagePort[] = [], borrowed: Source[] = [], calls: string[] = [];
  const hit = (op: string, name?: string) => {
    calls.push(op + (name === undefined ? '' : ':' + name)); faults.hook?.(op);
    if (faults.op === op && (faults.frame === null || name === faults.frame)) throw Error(op);
  };
  const make = (part: Part): Source => {
    const size = part === 'terrain' ? 16 : 64, width = part === 'terrain' ? 96 : 384, height = part === 'terrain' ? 96 : 64;
    const media: Media = { width, height, image: {}, source: {} }, frames = new Map<string, Frame>();
    const roles = part === 'terrain' ? TILES : PROPS;
    roles.forEach((role, i) => frames.set(String((b[part].frames as Record<string, string | number>)[role]), {
      x: 0, y: 0, cutX: i % 6 * size, cutY: Math.floor(i / 6) * size, cutWidth: size, cutHeight: size,
      width: size, height: size, realWidth: size, realHeight: size, trimmed: false, rotated: false, source: media,
    }));
    const texture: Source = { frames, media, filters: [], destroyed: 0,
      has(name) { hit('has', name); return frames.has(name); },
      get(name) { hit('get-frame', name); if (typeof name !== 'string') throw Error('numeric-zero base trap'); return frames.get(name); },
      setFilter(mode) { hit('filter'); this.filters.push(mode); }, destroy() { this.destroyed++; },
    };
    trap(texture, 'frameTotal', calls); borrowed.push(texture); return texture;
  };
  const sources = { terrain: make('terrain'), props: make('props') };
  const keys = { terrain: b.terrain.key, props: b.props.key };
  const scene: LoomEnvironmentScene = { textures: {
    exists(key) { hit('exists'); return key === keys.terrain || key === keys.props; },
    get(key) { hit('get-texture'); if (key === keys.terrain) return sources.terrain; if (key === keys.props) return sources.props; throw Error('key'); },
  }, add: { image(x, y, key, frame) {
    hit('add'); const image = new ImagePort(images.length, faults); image.x = x; image.y = y; image.key = key; image.frame = frame;
    images.push(image); faults.hook?.('addedtoscene', image.index); return image;
  } } };
  return { scene, sources, make, images, faults, borrowed, calls, binding: b,
    frame(part: Part, slot: number) { const role = (part === 'terrain' ? TILES : PROPS)[slot]; return sources[part].frames.get(String((b[part].frames as Record<string, string | number>)[role]))!; } };
}
type Harness = ReturnType<typeof harness>;
const alive = (h: Harness) => h.images.filter(i => !i.destroyed);
const visible = (h: Harness) => alive(h).filter(i => i.visible);
function clean(h: Harness) { expect(alive(h)).toHaveLength(0); expect(h.borrowed.every(s => s.destroyed === 0)).toBe(true); }
function style(image: ImagePort) {
  expect(image.origin).toEqual([0, 0]); expect(image.scale).toBe(1); expect(image.rotation).toBe(0); expect(image.alpha).toBe(1);
  expect(image.tint).toBe(0xffffff); expect(image.flip).toEqual([false, false]); expect(image.crop.slice(0, 2)).toEqual([0, 0]);
  expect(image.crop[2]).toBeGreaterThan(0); expect(image.crop[3]).toBeGreaterThan(0);
  expect(typeof image.frame).toBe('string'); expect(image.destroyed).toBe(0);
}
function imageCoverage(h: Harness, w: WorldState) {
  const images = visible(h).filter(i => i.depth === 0.5);
  const mapped = images.map(i => ({ id: String(i.index), kind: 'tile' as const, role: TILES[Number(i.frame)], nodeId: '', x: i.x, y: i.y, width: i.crop[2], height: i.crop[3], depth: i.depth }));
  for (const n of expectedNodes(w)) {
    const entries = mapped.filter(i => i.y === n.y && i.x >= n.x && i.x + i.width <= n.x + n.w + 1e-9).map(i => ({ ...i, nodeId: n.id }));
    coverage(entries, n as LoomNode);
  }
  expect(images.reduce((sum, i) => sum + i.crop[2] * i.crop[3], 0)).toBeCloseTo(expectedNodes(w).reduce((sum, n) => sum + n.w * 12, 0), 8);
  images.forEach(style);
}

describe('Loom environment stable public API', () => {
  it('exports the frozen native role order, bounded image budget and two resource descriptors', () => {
    expect(LOOM_TERRAIN_ROLES).toEqual(TILES); expect(LOOM_PROP_ROLES).toEqual(PROPS); expect(LOOM_IMAGE_LIMIT).toBe(512);
    expect(LOOM_ENVIRONMENT_ASSETS).toHaveLength(2);
    expect(LOOM_ENVIRONMENT_BINDING.terrain.key).toBe('environment-loom-terrain');
    expect(LOOM_ENVIRONMENT_BINDING.props.key).toBe('environment-loom-props');
    expect(typeof planLoomEnvironment).toBe('function'); expect(typeof loomEnvironmentResourcesReady).toBe('function');
    expect(typeof LoomEnvironmentRenderer).toBe('function');
  });
});

describe('literal native ports and data-only resource descriptors', () => {
  it('matches installedPhaser4.0 Image and Scene ports, numeric0 and synchronous add semantics', () => {
    expectTypeOf<Phaser.Scene>().toMatchTypeOf<LoomEnvironmentScene>(); expectTypeOf<Phaser.GameObjects.Image>().toMatchTypeOf<LoomImage>();
    const leaf = (path: string) => readFileSync(new URL('../../node_modules/phaser/' + path, import.meta.url), 'utf8');
    expect(JSON.parse(leaf('package.json')).version).toBe('4.0.0'); expect(leaf('src/textures/const.js')).toMatch(/NEAREST:\s*1/);
    expect(leaf('src/textures/Texture.js')).toContain('if (!name)');
    expect(leaf('src/gameobjects/image/ImageFactory.js')).toContain('return this.displayList.add(new Image(');
    expect(leaf('src/gameobjects/DisplayList.js')).toContain('this.events.emit(SceneEvents.ADDED_TO_SCENE');
    expect(typeof window).toBe('undefined'); expect(typeof document).toBe('undefined');
  });
  it('binds native0..31 strings and all six static atlas names without four empty slots', () => {
    const terrain = Array.from({ length: 32 }, (_, i) => String(i)), props = Array.from({ length: 6 }, (_, i) => 'loom-props ' + i + '.aseprite');
    expect(LOOM_ENVIRONMENT_BINDING).toEqual({ terrain: { key: 'environment-loom-terrain', frames: Object.fromEntries(TILES.map((r, i) => [r, terrain[i]])) },
      props: { key: 'environment-loom-props', frames: Object.fromEntries(PROPS.map((r, i) => [r, props[i]])) } });
    expect(LOOM_ENVIRONMENT_ASSETS).toEqual([
      { key: 'environment-loom-terrain', image: 'game/loom-terrain.png', load: 'spritesheet', frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, startFrame: 0, endFrame: 31, frames: terrain },
      { key: 'environment-loom-props', image: 'game/loom-props.png', atlas: 'game/loom-props.json', load: 'atlas', frameWidth: 64, frameHeight: 64, frames: props },
    ]);
    const h = harness(LOOM_ENVIRONMENT_BINDING); expect(loomEnvironmentResourcesReady(h.scene.textures, LOOM_ENVIRONMENT_BINDING)).toBe(true);
    expect(h.images).toEqual([]); expect(h.borrowed.every(s => !s.filters.length && !s.destroyed)).toBe(true);
  });
});

describe('pure actual-World Loom support plan', () => {
  it('covers actualCP0/1/2 and both Core timelines across even and odd native seeds', () => {
    for (const seed of [0, 1, 42, 43, 1337]) for (const cp of [0, 1, 2]) for (const timeline of [0, 1] as const) {
      const w = world(cp, seed, timeline); w.loom!.nodes.forEach(n => { n.expanded = true; }); verifyPlan(w);
    }
  });
  it.each([40, 41, 49, 63, 64, 65, 110, 111, 122, 131, 136, 180])('covers width%s at fractional coordinates with full16px endcaps and prefix-only middle cuts', width => {
    for (const [branch, safe] of [['upper', false], ['lower', false], ['hub', true], ['arena', true], ['arena', false]] as const) {
      verifyPlan(fixture([node('fractional-' + branch, 100.375, 320.625, width, branch, safe)]));
    }
  });
  it('uses worldPlatforms plus eaten exclusion, not stale collapsed or unexpanded graph nodes', () => {
    const nodes = ['live', 'ghost', 'collapsed', 'collapsed-list', 'eaten'].map((id, i) => node(id, 100 + i * 180, 320, 100, 'upper'));
    nodes[1].expanded = false; nodes[2].collapsed = true;
    const w = fixture(nodes); w.collapsed = ['collapsed-list']; w.loom!.eaten = ['eaten'];
    const p = verifyPlan(w); expect(p.nodeIds).toEqual(['live']);
    expect(p.commands.filter(c => c.nodeId !== null).every(c => c.nodeId === 'live')).toBe(true);
  });
  it('does not invent a floor from the authoring map when no actual node is live', () => {
    for (const nodes of [[], [node('ghost', 100, 320, 100, 'upper')]]) {
      const w = fixture(nodes); nodes.forEach(n => { n.expanded = false; });
      const p = planLoomEnvironment(freeze(w));
      if (p) { expect(p.nodeIds).toEqual([]); expect(p.commands.every(c => c.nodeId === null && c.depth < 0)).toBe(true); }
    }
  });
  it('does not run a collapse/weak/animation clock or read presentation timers', () => {
    const w = fixture(), expected = planLoomEnvironment(freeze(structuredClone(w))), reads: string[] = [];
    trap(w.save, 'elapsedMs', reads); trap(w.loom!, 'turn', reads); trap(w, 'time', reads); trap(w, 'frame', reads);
    w.loom!.nodes.forEach(n => trap(n, 'collapseAt', reads)); freeze(w);
    expect(planLoomEnvironment(w)).toEqual(expected); expect(reads).toEqual([]);
  });
  it('attaches any hub prop to its live hub, keeps64px source geometry and removes it with that hub', () => {
    const hub = node('safe-hub', 100, 360, 180, 'hub', true), w = fixture([hub]);
    const p = verifyPlan(w); const props = p.commands.filter(c => c.kind === 'prop' && c.nodeId === hub.id);
    props.forEach(c => { expect([c.width, c.height]).toEqual([64, 64]); expect(c.y + 64).toBeLessThanOrEqual(hub.y - 80); });
    const gone = structuredClone(w); gone.loom!.eaten = [hub.id];
    const next = planLoomEnvironment(gone); if (next) expect(next.commands.some(c => c.nodeId === hub.id)).toBe(false);
  });
  it('rejects a single malformed node or duplicate identity instead of partially skinning', () => {
    const invalid: Partial<LoomNode>[] = [{ x: NaN }, { x: -0.1 }, { x: 2580 }, { y: Infinity }, { y: -1 }, { y: 635 },
      { w: 0 }, { w: 39.999 }, { w: 40.125 }, { w: 110.5 }, { w: 131.75 }, { w: 181 }, { w: Infinity }, { w: 2581 }, { h: 13 }, { h: 0 }, { id: '' }, { id: '   ' }];
    for (const patch of invalid) for (const expanded of [true, false]) {
      const w = fixture(); Object.assign(w.loom!.nodes[1], patch, { expanded }); expect(planLoomEnvironment(freeze(w))).toBeNull();
    }
    const w = fixture(); w.loom!.nodes[1].id = w.loom!.nodes[0].id; w.loom!.nodes[1].expanded = false;
    expect(planLoomEnvironment(freeze(w))).toBeNull();
  });
  it('fails closed for absent/wrong stage, broken containers, getters and over-budget real geometry', () => {
    const wrong = world(); wrong.chapter = { ...wrong.chapter, stage: 3 };
    const absent = world(); absent.loom = null;
    for (const w of [null, undefined, {}, wrong, absent]) expect(planLoomEnvironment(w as WorldState)).toBeNull();
    const poisoned = fixture(), reads: string[] = []; trap(poisoned.loom!, 'nodes', reads);
    expect(planLoomEnvironment(poisoned)).toBeNull(); expect(reads).toEqual(['nodes']);
    const huge = fixture(Array.from({ length: 33 }, (_, i) => node('huge-' + i, 100, 200 + i * 12, 180, 'hub', true)));
    expect(planLoomEnvironment(freeze(huge))).toBeNull();
  });
});

const FRAME_ROWS = [...TILES.map((role, slot) => ({ part: 'terrain' as const, role, slot })), ...PROPS.map((role, slot) => ({ part: 'props' as const, role, slot }))];
describe('38-slot source resources and immutable binding guard', () => {
  it('is a pure positive guard and accepts optional media handles absent without allocations or filters', () => {
    const h = harness(); delete h.sources.terrain.media.image; delete h.sources.terrain.media.source;
    delete h.sources.props.media.image; delete h.sources.props.media.source;
    for (let i = 0; i < 3; i++) expect(loomEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(true);
    expect(h.images).toEqual([]); expect(h.borrowed.every(s => !s.filters.length && !s.destroyed)).toBe(true);
  });
  it.each(FRAME_ROWS)('rejects missing required$part/$role including slots unused by the current scene', ({ part, role }) => {
    const h = harness(), name = String((h.binding[part].frames as Record<string, string | number>)[role]); h.sources[part].frames.delete(name);
    expect(loomEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false); expect(h.images).toEqual([]);
    expect(h.borrowed.every(s => !s.filters.length && !s.destroyed)).toBe(true);
    const r = new LoomEnvironmentRenderer(h.scene, h.binding); expect(r.draw(freeze(fixture()), view())).toBe(false); clean(h);
  });
  it.each(FRAME_ROWS)('rejects shifted native cut for$part/$role, never only frameTotal', ({ part, slot }) => {
    const h = harness(); h.frame(part, slot).cutX += 1;
    expect(loomEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
  });
  it('rejects each wrong native dimension, trim, rotation, source size and throwing getter', () => {
    const fields: [keyof Frame, unknown][] = [['x', 1], ['y', 1], ['cutY', -1], ['cutWidth', 15], ['cutHeight', 15], ['width', 15], ['height', 15],
      ['realWidth', 15], ['realHeight', 15], ['rotated', true], ['trimmed', true], ['source', null]];
    for (const part of ['terrain', 'props'] as const) for (const [key, value] of fields) {
      const h = harness(); Object.assign(h.frame(part, part === 'terrain' ? 31 : 5), { [key]: value });
      expect(loomEnvironmentResourcesReady(h.scene.textures, h.binding), part + ':' + key).toBe(false);
    }
    for (const key of ['width', 'height']) {
      const h = harness(); Object.assign(h.sources.props.media, { [key]: 1 }); expect(loomEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
    }
    for (const location of ['frame', 'media', 'binding'] as const) {
      const h = harness(), reads: string[] = [];
      if (location === 'frame') trap(h.frame('terrain', 31), 'trimmed', reads);
      if (location === 'media') trap(h.sources.props.media, 'width', reads);
      if (location === 'binding') trap(h.binding.props.frames, PROPS[5], reads);
      expect(loomEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false); expect(reads.length).toBeGreaterThan(0);
    }
  });
  it('rejects frame aliases even when a shared object mutates its cut coordinates to look correct', () => {
    const h = harness(), shared = { ...h.frame('terrain', 0) };
    h.sources.terrain.get = name => { const f = h.sources.terrain.frames.get(name); return f ? Object.assign(shared, f) : undefined; };
    expect(loomEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
  });
  it('rejects same source texture across two keys even with all38 valid distinct frames', () => {
    const h = harness(); for (const [name, frame] of h.sources.props.frames) h.sources.terrain.frames.set(name, frame);
    h.sources.props = h.sources.terrain; expect(loomEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
  });
  it('rejects cross-group source alias even when getter-time dimensions are adapted', () => {
    const h = harness(), shared: Media = { width: 96, height: 96 };
    for (const part of ['terrain', 'props'] as const) {
      const source = h.sources[part]; source.frames.forEach(f => { f.source = shared; });
      source.get = name => { shared.width = part === 'terrain' ? 96 : 384; shared.height = part === 'terrain' ? 96 : 64; return source.frames.get(name); };
    }
    expect(loomEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
  });
  it.each(['exists', 'get-texture', 'has', 'get-frame'])('catches resource%s failure without GPU writes or exceptions', op => {
    const h = harness(); h.faults.op = op; expect(loomEnvironmentResourcesReady(h.scene.textures, h.binding)).toBe(false);
    expect(h.images).toEqual([]); expect(h.borrowed.every(s => s.filters.length === 0)).toBe(true);
  });
  it('copies binding once, normalizes numeric slots to strings and ignores later caller mutations', () => {
    const b = binding(); TILES.forEach((role, i) => { b.terrain.frames[role] = i; }); const h = harness(b), r = new LoomEnvironmentRenderer(h.scene, b);
    b.terrain.key = 'changed'; b.props.key = 'changed-too'; TILES.forEach(role => { b.terrain.frames[role] = 'bad'; });
    expect(r.draw(freeze(fixture()), view())).toBe(true); expect(visible(h).length).toBeGreaterThan(0);
    expect(visible(h).every(i => i.key === 'unit-loom-terrain' || i.key === 'unit-loom-props')).toBe(true);
    expect(h.calls.some(c => c.startsWith('get-frame:0'))).toBe(true); r.destroy(); clean(h);
  });
  it('fails closed for incomplete, aliased-key, duplicate-frame and getter-hostile bindings', () => {
    const same = binding(); same.props.key = same.terrain.key;
    const duplicate = binding(); duplicate.terrain.frames[TILES[31]] = duplicate.terrain.frames[TILES[0]];
    const blank = binding(); blank.props.key = ' ';
    const missing = binding(); delete (missing.props.frames as Partial<typeof missing.props.frames>)[PROPS[5]];
    const badNumber = binding(); badNumber.terrain.frames[TILES[0]] = NaN;
    const getter = binding(); trap(getter, 'terrain', []);
    for (const b of [null, undefined, [], {}, false, same, duplicate, blank, missing, badNumber, getter]) {
      const h = harness(); expect(loomEnvironmentResourcesReady(h.scene.textures, b)).toBe(false);
      const r = new LoomEnvironmentRenderer(h.scene, b); expect(r.draw(freeze(fixture()), view())).toBe(false); clean(h); r.destroy();
    }
  });
});

describe('Image-only owned pool, native crop and lifecycle', () => {
  it('draws exact fractional supports, restores native style and reuses all images without refiltering', () => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = freeze(fixture()), before = JSON.stringify(w);
    expect(r.draw(w, view())).toBe(true); imageCoverage(h, w); visible(h).forEach(style);
    const first = [...h.images]; expect(first.length).toBeGreaterThan(0); expect(alive(h).length).toBeLessThanOrEqual(512);
    expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]);
    visible(h).forEach(i => { i.scale = 5; i.rotation = 2; i.alpha = 0.1; i.tint = 1; i.origin = [1, 1]; i.flip = [true, true]; i.crop = [2, 3, 1, 1]; });
    for (let i = 0; i < 4; i++) { expect(r.draw(w, view())).toBe(true); imageCoverage(h, w); }
    expect(h.images).toEqual(first); expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]); expect(JSON.stringify(w)).toBe(before);
    r.destroy(); clean(h); expect(h.images.every(i => i.destroyed === 1)).toBe(true);
  });
  it('moves surviving node images without snapping positions or allocating a new pool', () => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
    const before = [...h.images]; w.loom!.nodes.forEach(n => { n.x += 0.125; n.y -= 0.375; });
    expect(r.draw(freeze(w), view())).toBe(true); imageCoverage(h, w); expect(h.images).toEqual(before);
    r.destroy(); clean(h);
  });
  it.each(['expanded', 'node-collapse', 'collapsed-list', 'eaten', 'removed'] as const)('hides%s nodes in the same draw with no stale visible image', reason => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
    const firstId = w.loom!.nodes[0].id;
    if (reason === 'expanded') w.loom!.nodes[0].expanded = false;
    if (reason === 'node-collapse') w.loom!.nodes[0].collapsed = true;
    if (reason === 'collapsed-list') w.collapsed = [firstId];
    if (reason === 'eaten') w.loom!.eaten = [firstId];
    if (reason === 'removed') w.loom!.nodes.shift();
    expect(r.draw(freeze(w), view())).toBe(true); imageCoverage(h, w);
    expect(visible(h).filter(i => i.depth === 0.5).every(i => i.x >= 320.75)).toBe(true);
    r.destroy(); clean(h);
  });
  it('culls old view images and restores them without stale geometry or growing allocations', () => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
    const supports = visible(h).filter(i => i.depth === 0.5);
    expect(r.draw(w, view(1940))).toBe(true); expect(visible(h).filter(i => i.depth === 0.5)).toEqual([]);
    expect(r.draw(w, view())).toBe(true); imageCoverage(h, w);
    expect(supports.every(i => visible(h).includes(i))).toBe(true);
    const allocated = h.images.length; expect(r.draw(w, view())).toBe(true); expect(h.images.length).toBe(allocated);
    expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]); r.destroy(); clean(h);
  });
  it('bounds the live pool while actual topology alternates and missing nodes never leave a visible skin', () => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding);
    for (let step = 0; step < 40; step++) {
      const w = fixture([node('varying-' + step, 100.25, 320, 110 + step % 20, step % 2 ? 'upper' : 'lower')]);
      expect(r.draw(w, view())).toBe(true); imageCoverage(h, w); expect(alive(h).length).toBeLessThanOrEqual(512);
    }
    r.destroy(); clean(h);
  });
  it('destroys prior-run ownership instead of reusing stale images in a new run', () => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
    const old = [...h.images]; w.save.runId = '0badcafe-0000-4000-8000-000000000100'; expect(r.draw(w, view())).toBe(true);
    expect(old.every(i => i.destroyed === 1)).toBe(true); expect(visible(h).every(i => !old.includes(i))).toBe(true); imageCoverage(h, w);
    r.destroy(); clean(h);
  });
  it('destroys owned images on stage or run identity failure without destroying borrowed sources', () => {
    for (const kind of ['stage', 'run', 'loom'] as const) {
      const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
      if (kind === 'stage') w.chapter = { ...w.chapter, stage: 5 };
      if (kind === 'run') w.save.runId = ' ';
      if (kind === 'loom') w.loom = null;
      expect(r.draw(w, view())).toBe(false); clean(h); r.destroy(); expect(h.images.every(i => i.destroyed === 1)).toBe(true);
    }
  });
  it.each(['texture', 'frame', 'source', 'image-handle', 'source-handle'] as const)('clears and refilters changed%s resources even when key and geometry stay identical', kind => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
    const old = [...h.images];
    if (kind === 'texture') h.sources.terrain = h.make('terrain');
    if (kind === 'frame') h.sources.terrain.frames.set('31', { ...h.frame('terrain', 31) });
    if (kind === 'source') { const media = { ...h.sources.terrain.media }; h.sources.terrain.frames.forEach(f => { f.source = media; }); }
    if (kind === 'image-handle') h.sources.terrain.media.image = {};
    if (kind === 'source-handle') h.sources.terrain.media.source = {};
    expect(r.draw(w, view())).toBe(true); expect(old.every(i => i.destroyed === 1)).toBe(true); imageCoverage(h, w);
    expect(h.sources.terrain.filters).toEqual(kind === 'texture' ? [1] : [1, 1]);
    const counts = h.borrowed.map(s => s.filters.length); expect(r.draw(w, view())).toBe(true); expect(h.borrowed.map(s => s.filters.length)).toEqual(counts);
    r.destroy(); clean(h);
  });
  it('clears on a lost unused required resource and can recover on an explicit later draw', () => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
    const saved = h.frame('props', 5); h.sources.props.frames.delete('prop-5'); expect(r.draw(w, view())).toBe(false); clean(h);
    h.sources.props.frames.set('prop-5', saved); expect(r.draw(w, view())).toBe(true); imageCoverage(h, w); r.destroy(); clean(h);
  });
  it('validates bounded finite views before drawing and clears an already populated pool', () => {
    const badViews = [null, {}, { ...view(), x: -1 }, { ...view(), y: -1 }, { ...view(), x: 1941 }, { ...view(), y: 281 },
      { ...view(), width: 0 }, { ...view(), height: 0 }, { ...view(), width: 641 }, { ...view(), height: 361 }, { ...view(), x: NaN }, { ...view(), y: Infinity }];
    for (const v of badViews) {
      const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
      expect(r.draw(w, v as LoomRect)).toBe(false); clean(h); r.destroy();
    }
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding); expect(r.draw(fixture(), { x: 80.25, y: 300.25, width: 400, height: 40 })).toBe(true);
    imageCoverage(h, fixture()); r.destroy(); clean(h);
  });
  it('clears on invalid plan geometry, hostile getters or image allocation failure', () => {
    for (const cause of ['geometry', 'world-getter', 'resource-getter', 'add', 'filter'] as const) {
      const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
      if (cause === 'geometry') w.loom!.nodes[0].w = 39;
      if (cause === 'world-getter') trap(w.save, 'runId', []);
      if (cause === 'resource-getter') trap(h.frame('props', 5), 'cutX', []);
      if (cause === 'add' || cause === 'filter') { h.sources.terrain = h.make('terrain'); h.faults.op = cause; }
      expect(r.draw(w, view())).toBe(false); clean(h); r.destroy();
    }
  });
  it.each(['origin', 'scale', 'rotation', 'depth', 'alpha', 'visible', 'crop', 'tint', 'flip'])('releases partial allocations when mandatory Image%s throws', op => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding); h.faults.imageOp = op; h.faults.imageAt = 2;
    expect(r.draw(freeze(fixture()), view())).toBe(false); clean(h); expect(h.images.length).toBeGreaterThan(0);
    expect(h.images.every(i => i.destroyed === 1)).toBe(true); r.destroy();
  });
  it.each(['get-frame', 'filter', 'addedtoscene', 'crop'])('does not report success or leak when destroy reenters during%s', op => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); let fired = false;
    h.faults.hook = name => { if (name === op && !fired) { fired = true; r.destroy(); } };
    const returned = r.draw(w, view());
    if (returned || alive(h).length) console.info('LOOM_DISPOSE_REENTRY', JSON.stringify({ op, returned, fired, allocated: h.images.length, alive: alive(h).length }));
    expect(returned).toBe(false); expect(fired).toBe(true); clean(h);
    h.faults.hook = null; expect(r.draw(w, view())).toBe(false); r.destroy(); clean(h);
    expect(h.images.every(i => i.destroyed === 1)).toBe(true);
  });
  it('refuses nested draw, never registers timers/GL callbacks and destroys idempotently despite one throwing image', () => {
    const h = harness(), reads: string[] = [];
    for (const key of ['game', 'events', 'time', 'tweens', 'anims']) trap(h.scene, key, reads);
    trap(h.scene.add, 'renderTexture', reads);
    const r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); let nested: boolean | null = null;
    h.faults.hook = op => { if (op === 'origin') { h.faults.hook = null; nested = r.draw(w, view()); } };
    expect(r.draw(w, view())).toBe(true); expect(nested).toBe(false); expect(reads).toEqual([]);
    h.faults.imageOp = 'destroy'; h.faults.imageAt = 0; expect(() => r.destroy()).not.toThrow(); clean(h);
    r.destroy(); expect(r.draw(w, view())).toBe(false); expect(h.images.every(i => i.destroyed === 1)).toBe(true); expect(reads).toEqual([]);
  });
});

describe('independent same-id state changes and full failure ownership', () => {
  it('recrops and changes native family on the same stable node id, then restores original width', () => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture([node('stable', 100.25, 320.5, 131, 'upper')]);
    expect(r.draw(w, view())).toBe(true); const firstLeft = visible(h).find(i => i.depth === 0.5 && i.x === 100.25)!;
    w.loom!.nodes[0].branch = 'lower'; w.loom!.nodes[0].w = 111; expect(r.draw(w, view())).toBe(true); imageCoverage(h, w);
    expect(visible(h).find(i => i.depth === 0.5 && i.x === 100.25)).toBe(firstLeft); expect(firstLeft.frame).toBe('4');
    w.loom!.nodes[0].branch = 'upper'; w.loom!.nodes[0].w = 131; expect(r.draw(w, view())).toBe(true); imageCoverage(h, w);
    expect(firstLeft.frame).toBe('0'); r.destroy(); clean(h);
  });
  it.each(['texture', 'position'])('releases an existing full pool when a changed command Image%s fails', op => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
    const target = visible(h).find(i => i.depth === 0.5)!; h.faults.imageOp = op; h.faults.imageAt = target.index;
    w.loom!.nodes[0].x += 0.5; w.loom!.nodes[0].branch = 'lower';
    expect(r.draw(w, view())).toBe(false); clean(h); r.destroy(); expect(h.images.every(i => i.destroyed === 1)).toBe(true);
  });
  it('rejects null/partial hostile scenes and null default binding without allocation or throw', () => {
    for (const scene of [null, {}, { textures: {}, add: {} }]) {
      const r = new LoomEnvironmentRenderer(scene as LoomEnvironmentScene, binding());
      expect(r.draw(fixture(), view())).toBe(false); expect(() => r.destroy()).not.toThrow();
    }
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene); expect(r.draw(fixture(), view())).toBe(false); expect(h.images).toEqual([]);
    r.destroy(); clean(h);
  });
});

describe('removed-node release ownership before external destroy callbacks', () => {
  it('detaches a removed image before a throwing destroy so failure cleanup cannot destroy it twice', () => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
    const removed = visible(h).find(i => i.depth === 0.5 && i.x === w.loom!.nodes[0].x)!;
    h.faults.imageOp = 'destroy'; h.faults.imageAt = removed.index; w.loom!.nodes[0].collapsed = true;
    expect(r.draw(w, view())).toBe(false); clean(h); expect(removed.destroyed).toBe(1);
    r.destroy(); expect(h.images.every(i => i.destroyed === 1)).toBe(true);
  });
  it('detaches a removed image before its synchronous callback disposes the whole adapter', () => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
    const removed = visible(h).find(i => i.depth === 0.5 && i.x === w.loom!.nodes[0].x)!; let fired = false;
    h.faults.hook = (op, index) => { if (op === 'destroy' && index === removed.index && !fired) { fired = true; r.destroy(); } };
    w.loom!.nodes[0].collapsed = true; expect(r.draw(w, view())).toBe(false); expect(fired).toBe(true); clean(h);
    expect(removed.destroyed).toBe(1); expect(h.images.every(i => i.destroyed === 1)).toBe(true); expect(r.draw(w, view())).toBe(false);
  });
});

describe('borrowed-source filter identity is separate from Image ownership', () => {
  it('does not refilter unchanged resources across run/stage/error cleanup, but initializes true replacement', () => {
    const h = harness(), r = new LoomEnvironmentRenderer(h.scene, h.binding), w = fixture(); expect(r.draw(w, view())).toBe(true);
    expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]);
    const old = [...h.images]; w.save.runId = '0badcafe-0000-4000-8000-000000000101'; expect(r.draw(w, view())).toBe(true);
    expect(old.every(i => i.destroyed === 1)).toBe(true); expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]);
    w.chapter = { ...w.chapter, stage: 5 }; expect(r.draw(w, view())).toBe(false); clean(h);
    w.chapter = { ...w.chapter, stage: 4 }; expect(r.draw(w, view())).toBe(true); expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]);
    const frame = h.frame('props', 5); h.sources.props.frames.delete('prop-5'); expect(r.draw(w, view())).toBe(false); clean(h);
    h.sources.props.frames.set('prop-5', frame); expect(r.draw(w, view())).toBe(true); expect(h.borrowed.map(s => s.filters)).toEqual([[1], [1]]);
    const replaced = h.sources.terrain, oldImages = [...alive(h)]; h.sources.terrain = h.make('terrain');
    expect(r.draw(w, view())).toBe(true); expect(oldImages.every(i => i.destroyed === 1)).toBe(true);
    expect(replaced.filters).toEqual([1]); expect(h.sources.terrain.filters).toEqual([1]);
    const counts = h.borrowed.map(s => s.filters.length); expect(r.draw(w, view())).toBe(true); expect(h.borrowed.map(s => s.filters.length)).toEqual(counts);
    r.destroy(); clean(h); expect(h.images.every(i => i.destroyed === 1)).toBe(true);
  });
});
