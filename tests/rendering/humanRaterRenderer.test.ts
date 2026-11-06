import type * as Phaser from 'phaser';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { enterRest, applyProgressionCommand } from '../../src/pages/GamePage/game/systems/shop';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import type { WorldState } from '../../src/pages/GamePage/game/entities/model';
import { HUMAN_RATER_ASSET, HUMAN_RATER_BINDING, humanRaterPortraitPosition } from '../../src/pages/GamePage/game/data/humanRaterAssets';
import { HumanRaterSpriteRenderer, humanRaterResourcesReady, humanRaterPlan, HUMAN_RATER_IMAGE_LIMIT,
  type HumanRaterScene, type HumanRaterImage, type HumanRaterTexture, type HumanRaterTextureFrame, type HumanRaterView } from '../../src/pages/GamePage/game/systems/HumanRaterSpriteRenderer';
const roles = ['neutral', 'approved', 'disapproved', 'hacked'] as const;
const names = roles.map(role => `human-rater #${role}.aseprite`);
const binding = () => ({ key: 'human-rater', frames: { neutral: names[0], approved: names[1], disapproved: names[2], hacked: names[3] } });
function real(stage = 1, checkpoint = 11): WorldState {
  return structuredClone(createWorld({ ...createRun('0badcafe-0000-4000-8000-000000000136', 42), stage, checkpoint, hp: 90, doom: 60, tokens: 200,
    inventory: ['constitutional', 'recursive', 'residual'], elapsedMs: 20000 }));
}
function world(): WorldState {
  const w = real();
  w.chapter = { ...w.chapter, checkpoints: [{ id: 0, x: 72, y: 307, trigger: 72 }, { id: 1, x: 160, y: 307, trigger: 160 }, { id: 2, x: 420, y: 307, trigger: 420 }],
    platforms: [{ id: 'left', x: 0, y: 320, w: 320, h: 40 }, { id: 'right', x: 320, y: 320, w: 320, h: 40 }] };
  return w;
}
const view = (x = 0, y = 0): HumanRaterView => ({ x, y, width: 640, height: 360 });
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    for (const key of Reflect.ownKeys(v)) { const d = Object.getOwnPropertyDescriptor(v, key); if (d && 'value' in d) freeze(d.value); }
    Object.freeze(v);
  } return v;
}
function trap(v: object, key: string) { Object.defineProperty(v, key, { configurable: true, get() { throw Error('forbidden ' + key); } }); }
interface Faults { op: string; imageOp: string; imageAt: number; hook: ((op: string, index?: number) => void) | null }
class ImagePort implements HumanRaterImage {
  scene: unknown = {}; active = true; isDestroyed = false; visible = true; destroyed = 0;
  x = -1; y = -1; key = ''; frame = ''; scale = 7; origin = [0, 0]; depth = 8; rotation = 2; alpha = .2;
  tint = 1; tintMode = 'FILL'; flip = [true, true]; crop = [3, 3, 1, 1]; calls: string[] = [];
  listeners: (() => void)[] = [];
  constructor(readonly index: number, readonly faults: Faults) {}
  private hit(op: string) { this.calls.push(op); this.faults.hook?.(op, this.index); if (this.faults.imageOp === op && (this.faults.imageAt < 0 || this.faults.imageAt === this.index)) throw Error(op); }
  once(event: string, listener: () => void) { this.hit('once'); if (event !== 'destroy') throw Error(event); this.listeners.push(listener); return this; }
  setTexture(key: string, frame: string) { this.hit('texture'); this.key = key; this.frame = frame; return this; }
  setOrigin(x: number, y: number) { this.hit('origin'); this.origin = [x, y]; return this; }
  setScale(v: number) { this.hit('scale'); this.scale = v; return this; }
  setRotation(v: number) { this.hit('rotation'); this.rotation = v; return this; }
  setPosition(x: number, y: number) { this.hit('position'); this.x = x; this.y = y; return this; }
  setDepth(v: number) { this.hit('depth'); this.depth = v; return this; }
  setAlpha(v: number) { this.hit('alpha'); this.alpha = v; return this; }
  setVisible(v: boolean) { this.hit('visible'); this.visible = v; return this; }
  setCrop(x: number, y: number, w: number, h: number) { this.hit('crop'); this.crop = [x, y, w, h]; return this; }
  clearTint() { this.hit('clearTint'); this.tint = 0xffffff; this.tintMode = 'MULTIPLY'; return this; }
  setFlip(x: boolean, y: boolean) { this.hit('flip'); this.flip = [x, y]; return this; }
  destroy() {
    if (!this.scene) return; this.destroyed++; this.hit('destroy');
    const pending = this.listeners; this.listeners = []; for (const listener of pending) listener();
    this.visible = false; this.active = false; this.isDestroyed = true; this.scene = undefined;
  }
}
type Frame = { -readonly [P in keyof HumanRaterTextureFrame]: HumanRaterTextureFrame[P] };
function harness() {
  const faults: Faults = { op: '', imageOp: '', imageAt: -1, hook: null }, images: ImagePort[] = [], calls: string[] = [];
  const media = { width: 256, height: 64, image: { naturalWidth: 256, naturalHeight: 64 }, source: {} };
  const frames = new Map<string, Frame>(); let filters = 0, borrowedDestroy = 0;
  const hit = (op: string) => { calls.push(op); faults.hook?.(op); if (faults.op === op) throw Error(op); };
  const texture: HumanRaterTexture & { destroy(): void } = {
    key: 'human-rater', source: [media], has(n) { hit('has'); return frames.has(n); }, get(n) { hit('frame'); return frames.get(n); },
    setFilter(n) { hit('filter'); expect(n).toBe(1); filters++; }, destroy() { borrowedDestroy++; },
  };
  names.forEach((name, i) => frames.set(name, { name, texture, sourceIndex: 0, source: media, x: 0, y: 0,
    cutX: i * 64, cutY: 0, cutWidth: 64, cutHeight: 64, width: 64, height: 64, realWidth: 64, realHeight: 64, trimmed: false, rotated: false }));
  trap(texture, 'frameTotal');
  const scene: HumanRaterScene = { textures: { exists(key) { hit('exists'); return key === 'human-rater'; },
    get(key) { hit('get'); if (key !== 'human-rater') throw Error('foreign key'); return texture; } },
    add: { image(x, y, key, frame) { hit('add'); const i = new ImagePort(images.length, faults); i.x = x; i.y = y; i.key = key; i.frame = frame;
      images.push(i); faults.hook?.('created', i.index); return i; } } };
  return { scene, texture, frames, media, faults, images, calls, get filters() { return filters; }, get borrowedDestroy() { return borrowedDestroy; }, frame: (i: number) => frames.get(names[i])! };
}
type H = ReturnType<typeof harness>;
const visible = (h: H) => h.images.filter(i => i.visible && !i.destroyed);
function noOwned(h: H) { expect(visible(h)).toHaveLength(0); expect(h.images.every(i => i.destroyed === 1)).toBe(true); expect(h.borrowedDestroy).toBe(0); }
function style(i: ImagePort) {
  expect(i.origin).toEqual([.5, 60 / 64]); expect(i.scale).toBe(1); expect(i.rotation).toBe(0); expect(i.depth).toBe(-3); expect(i.alpha).toBe(1);
  expect(i.flip).toEqual([false, false]); expect(i.crop).toEqual([0, 0, 64, 64]); expect(i.tint).toBe(0xffffff); expect(i.tintMode).toBe('MULTIPLY');
}

describe('independent humanRater adapter resource contract', () => {
  it('is compatible with installed real Scene and canonical four literal frames', () => {
    expectTypeOf<Phaser.Scene>().toExtend<HumanRaterScene>();
    expect(HUMAN_RATER_BINDING).toEqual(binding()); expect(HUMAN_RATER_ASSET.frames).toEqual(names);
    expect(HUMAN_RATER_ASSET).toMatchObject({ key: 'human-rater', image: 'game/human-rater.png', atlas: 'game/human-rater.json', frameWidth: 64, frameHeight: 64 });
    expect(HUMAN_RATER_IMAGE_LIMIT).toBe(2);
  });
  it('pure eager guard visits all frames but never filters or allocates', () => {
    const h = harness(); expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(true);
    expect(h.calls.filter(v => v === 'frame')).toHaveLength(4); expect(h.filters).toBe(0); expect(h.images).toHaveLength(0);
  });
  it.each([null, undefined, {}, [], { key: 'foreign', frames: binding().frames }, { key: 'human-rater', frames: {} }])('rejects malformed binding %s', value => {
    const h = harness(); expect(humanRaterResourcesReady(h.scene.textures, value)).toBe(false);
    expect(new HumanRaterSpriteRenderer(h.scene, value).draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(0);
  });
  it.each(roles)('rejects missing role %s even when current pose is only neutral', role => {
    const h = harness(); h.frames.delete(binding().frames[role]); const w = world();
    expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
    expect(new HumanRaterSpriteRenderer(h.scene, binding()).draw(w, view()).size).toBe(0); expect(h.images).toHaveLength(0);
  });
  const badFrames = [
    ['name', 'wrong'], ['texture', {}], ['source', { width: 256, height: 64 }], ['sourceIndex', 1], ['x', 1], ['y', 1],
    ['cutX', -1], ['cutY', 1], ['width', 31], ['height', 31], ['cutWidth', 31], ['cutHeight', 31],
    ['realWidth', 33], ['realHeight', 33], ['trimmed', true], ['rotated', true], ['cutX', 65], ['cutX', NaN],
  ] as const;
  it.each(badFrames)('rejects unused hacked frame %s=%s', (key, value) => {
    const h = harness(); Object.assign(h.frame(3), { [key]: value });
    expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
    expect(new HumanRaterSpriteRenderer(h.scene, binding()).draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(0);
  });
  it.each(['width', 'height', 'naturalWidth', 'naturalHeight'])('rejects wrong %s on actual atlas source', key => {
    const h = harness(); if (key.startsWith('natural')) Object.assign(h.media.image, { [key]: 97 }); else Object.assign(h.media, { [key]: 97 });
    expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it('allows canonical Canvas source256x64 but rejects natural-vs-layout mismatch', () => {
    const h = harness(); Object.assign(h.media, { image: { width: 256, height: 64 } });
    expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(true);
    Object.assign(h.media, { image: { width: 256, height: 64, naturalWidth: 97, naturalHeight: 64 } });
    expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it('rejects aliased Frame identity even with adaptive getters', () => {
    const h = harness(); const f = h.frame(0); let index = 0;
    Object.defineProperty(f, 'name', { get: () => names[index] }); Object.defineProperty(f, 'cutX', { get: () => index * 64 });
    h.texture.get = name => { index = names.indexOf(name); return f; };
    expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it.each(['exists', 'get', 'has', 'frame'])('catches resource exception %s without drawing', op => {
    const h = harness(); h.faults.op = op;
    expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
    expect(new HumanRaterSpriteRenderer(h.scene, binding()).draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(0);
  });
  it.each(['key', 'source'])('catches texture getter %s', key => {
    const h = harness(); trap(h.texture, key); expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it.each(['image', 'width', 'height', 'source'])('catches source getter %s', key => {
    const h = harness(); trap(h.media, key); expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it.each(['name', 'texture', 'source', 'sourceIndex', 'cutX', 'realWidth', 'trimmed'])('catches unused frame getter %s', key => {
    const h = harness(); trap(h.frame(3), key); expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it('rejects extra TextureSource and forged owner key', () => {
    const h = harness(); Object.assign(h.texture, { source: [h.media, h.media] }); expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
    Object.assign(h.texture, { source: [h.media], key: 'foreign' }); expect(humanRaterResourcesReady(h.scene.textures, binding())).toBe(false);
  });
});

describe('real readonly station plan, not inferred history', () => {
  const anchors = [[1, 1, 1436, 320, 'forest'], [1, 2, 2124, 320, 'approach-arena'],
    [2, 1, 446, 1290, 'factory-step-10'], [2, 2, 446, 740, 'factory-step-20'],
    [3, 1, 1376, 320, 'gpu-floor'], [3, 2, 2456, 320, 'gpu-floor'],
    [4, 1, 624, 360, 'loom-hub-1'], [4, 2, 1204, 360, 'loom-hub-2'],
    [5, 1, 1016, 320, 'omega-floor-1'], [5, 2, 1976, 320, 'omega-floor-2']] as const;
  it.each(anchors)('chapter%d room%d sits at literal native foot(%d,%d) on %s', (stage, room, x, y, supportId) => {
    const w = real(stage, 10 + room), before = JSON.stringify(w); freeze(w);
    expect(humanRaterPlan(w, view()).find(p => p.room === room)).toMatchObject({ id: `rater:${room}`, x, y, role: 'neutral', supportId });
    expect(JSON.stringify(w)).toBe(before);
  });
  it.each([11, 12, 21, 22, 1, 2])('v1 checkpoint%d never reconstructs a historical approval', checkpoint => {
    const w = real(1, checkpoint), plan = humanRaterPlan(freeze(w), view());
    expect(plan.map(p => p.role)).toEqual(checkpoint === 21 ? ['hacked', 'neutral'] : checkpoint === 22 ? ['neutral', 'hacked'] : ['neutral', 'neutral']);
  });
  it('only real entry/hack facts choose frames; repair/reorder/continue do not invent evaluations', () => {
    let w = real(1, 0); w.save.hp = 55; enterRest(w, 1);
    expect(humanRaterPlan(w, view())[0].role).toBe('disapproved');
    w = applyProgressionCommand(w, { type: 'shop-buy', offerId: 'repair' });
    expect(w.save.hp).toBe(90); expect(humanRaterPlan(w, view())[0].role).toBe('disapproved');
    w = applyProgressionCommand(w, { type: 'shop-hack', offerId: 'upgrade:calibrated' });
    expect(humanRaterPlan(w, view()).map(p => p.role)).toEqual(['hacked', 'neutral']);
    w = applyProgressionCommand(w, { type: 'rest-continue' });
    expect(humanRaterPlan(w, view()).map(p => p.role)).toEqual(['neutral', 'neutral']);
  });
  it('poses stay in their own room, not on every station in the chapter', () => {
    const w = real(1, 1); enterRest(w, 2); w.rest!.message = 'fake disapproved string';
    expect(humanRaterPlan(w, view()).map(p => p.role)).toEqual(['neutral', 'approved']);
  });
  it('reads no player, rewards, message, elapsed time or wall clock', () => {
    const h = harness(), w = world(); trap(w, 'player'); trap(w.rest!, 'message');
    for (const key of ['hp', 'doom', 'tokens', 'score', 'elapsedMs']) trap(w.save, key);
    const r = new HumanRaterSpriteRenderer(h.scene, binding()); expect(r.draw(w, view()).size).toBe(2); r.destroy(); noOwned(h);
  });
  it('projects frozen input at native1x, real foot pivot and behind pickups, markers and danger', () => {
    const h = harness(), w = world(), before = JSON.stringify(w); freeze(w);
    const r = new HumanRaterSpriteRenderer(h.scene, freeze(binding())); expect([...r.draw(w, freeze(view()))]).toEqual(['rater:1', 'rater:2']);
    expect(h.images.map(i => [i.x, i.y, i.frame])).toEqual([[216, 320, names[0]], [364, 320, names[0]]]);
    h.images.forEach(style); expect(JSON.stringify(w)).toBe(before); expect(h.filters).toBe(1); r.destroy(); noOwned(h);
  });
  it.each(roles)('%s uses a literal crop in the existing portrait without rescaling', (pose) => {
    expect(humanRaterPortraitPosition(pose)).toBe(['-8px -4px', '-72px -4px', '-136px -4px', '-200px -4px'][roles.indexOf(pose)]);
  });
  it('missing support removes only its owned station; restoration reuses neither dead handle nor texture ownership', () => {
    const h = harness(), w = world(), r = new HumanRaterSpriteRenderer(h.scene, binding()); r.draw(w, view());
    w.collapsed.push('left'); expect([...r.draw(w, view())]).toEqual(['rater:2']); expect(h.images.map(i => i.destroyed)).toEqual([1, 0]);
    w.collapsed = []; expect(r.draw(w, view()).size).toBe(2); expect(h.images).toHaveLength(3); expect(h.filters).toBe(1); r.destroy(); noOwned(h);
  });
  it.each(['unexpanded', 'collapsed', 'removed'] as const)('Loom %s support is never replaced by a chapter floor', kind => {
    const w = real(4), hub = w.loom!.nodes.find(n => n.id === 'loom-hub-1')!;
    if (kind === 'unexpanded') hub.expanded = false;
    if (kind === 'collapsed') hub.collapsed = true;
    if (kind === 'removed') w.loom!.nodes = w.loom!.nodes.filter(n => n !== hub);
    w.chapter = { ...w.chapter, platforms: [{ id: 'fake-floor', x: 0, y: 360, w: 2580, h: 24 }] };
    expect(humanRaterPlan(w, view()).some(p => p.room === 1)).toBe(false);
  });
  it('drowned factory platform hides its station at the real sea boundary', () => {
    const w = real(2); w.factory!.seaY = 1290.01; expect(humanRaterPlan(w, view()).some(p => p.room === 1)).toBe(true);
    w.factory!.seaY = 1290; expect(humanRaterPlan(w, view()).some(p => p.room === 1)).toBe(false);
  });
  it.each(['missing', 'ambiguous', 'short', 'zero-height'])('%s support is not a license to float or overhang', kind => {
    const w = world();
    if (kind === 'missing') w.chapter = { ...w.chapter, platforms: [] };
    if (kind === 'ambiguous') w.chapter = { ...w.chapter, platforms: [...w.chapter.platforms, ...w.chapter.platforms.map(p => ({ ...p, id: p.id + '-other' }))] };
    if (kind === 'short') w.chapter = { ...w.chapter, platforms: w.chapter.platforms.map(p => ({ ...p, w: 50 })) };
    if (kind === 'zero-height') w.chapter = { ...w.chapter, platforms: w.chapter.platforms.map(p => ({ ...p, h: 0 })) };
    expect(humanRaterPlan(w, view())).toEqual([]);
  });
  it('never moves the station onto a nearby dynamic K-line lift when its actual floor is gone', () => {
    const w = real(3); w.collapsed.push('gpu-floor');
    w.furnace!.lifts[0] = { ...w.furnace!.lifts[0], x: 1200, y: 320, w: 400, h: 12 };
    expect(humanRaterPlan(w, view()).some(p => p.room === 1)).toBe(false);
  });
  it('offscreen rooms allocate nothing and an owned image hides then returns without ghost allocation', () => {
    const h = harness(), w = world(), r = new HumanRaterSpriteRenderer(h.scene, binding());
    expect(r.draw(w, view(700)).size).toBe(0); expect(h.images).toHaveLength(0);
    expect(r.draw(w, view()).size).toBe(2); expect(r.draw(w, view(700)).size).toBe(0); expect(visible(h)).toHaveLength(0);
    expect(r.draw(w, view()).size).toBe(2); expect(h.images).toHaveLength(2); r.destroy(); noOwned(h);
  });
  it.each(['run', 'stage', 'frame', 'source', 'source-array', 'physical-image', 'texture'])('%s change fences the previous owned generation', change => {
    const h = harness(), w = world(), r = new HumanRaterSpriteRenderer(h.scene, binding()); r.draw(w, view());
    if (change === 'run') w.save.runId += '-next';
    if (change === 'stage') { w.chapter = { ...w.chapter, stage: 3 }; w.save.stage = 3; }
    if (change === 'frame') h.frames.set(names[3], { ...h.frame(3) });
    if (change === 'source-array') Object.assign(h.texture, { source: [...h.texture.source] });
    if (change === 'physical-image') h.media.image = { naturalWidth: 256, naturalHeight: 64 };
    if (change === 'source') { const s = { ...h.media }; Object.assign(h.texture, { source: [s] }); for (const f of h.frames.values()) f.source = s; }
    if (change === 'texture') { const t = { ...h.texture }; for (const f of h.frames.values()) f.texture = t; h.scene.textures.get = () => t; }
    expect(r.draw(w, view()).size).toBe(2); expect(h.images.slice(0, 2).every(i => i.destroyed === 1)).toBe(true);
    expect(h.images).toHaveLength(4); expect(h.borrowedDestroy).toBe(0); r.destroy(); noOwned(h);
  });
  it('binding is defensively copied and two game instances own distinct images', () => {
    const a = harness(), b = harness(), mutable = binding(), x = new HumanRaterSpriteRenderer(a.scene, mutable), y = new HumanRaterSpriteRenderer(b.scene, binding());
    mutable.key = 'foreign'; mutable.frames.hacked = 'foreign';
    expect(x.draw(world(), view()).size).toBe(2); expect(y.draw(world(), view()).size).toBe(2); x.destroy(); noOwned(a);
    expect(visible(b)).toHaveLength(2); y.destroy(); noOwned(b);
  });
});
describe('invalid plans cannot retain old stations', () => {
  const cases: [string, (w: WorldState, v: HumanRaterView) => void][] = [
    ['empty run', w => { w.save.runId = ''; }], ['stage mismatch', w => { w.save.stage = 3; }],
    ['short world', w => { w.chapter = { ...w.chapter, width: 639 }; }], ['fraction world', w => { w.chapter = { ...w.chapter, width: 2880.5 }; }],
    ['duplicate anchor', w => { w.chapter = { ...w.chapter, checkpoints: [w.chapter.checkpoints[0], w.chapter.checkpoints[1], w.chapter.checkpoints[1]] }; }],
    ['missing anchor', w => { w.chapter = { ...w.chapter, checkpoints: w.chapter.checkpoints.slice(0, 2) }; }],
    ['bad anchor', w => { Object.assign(w.chapter.checkpoints[1], { x: NaN }); }], ['unknown checkpoint', w => { w.save.checkpoint = 999; }],
    ['unknown evaluation', w => { w.rest!.evaluation = { verdict: 'wrong', nominalTokens: 24, creditedTokens: 24 } as never; }],
    ['negative view', (_, v) => { Object.assign(v, { x: -1 }); }], ['overflow view', (_, v) => { Object.assign(v, { x: 2241 }); }],
    ['wrong viewport', (_, v) => { Object.assign(v, { width: 1280 }); }], ['NaN view', (_, v) => { Object.assign(v, { y: NaN }); }],
  ];
  it.each(cases)('%s cleans previous images without allocating a guessed replacement', (_, change) => {
    const h = harness(), w = world(), v = view(), r = new HumanRaterSpriteRenderer(h.scene, binding()); expect(r.draw(w, v).size).toBe(2);
    change(w, v); expect(r.draw(w, v).size).toBe(0); expect(h.images).toHaveLength(2); noOwned(h);
  });
});
describe('bounded lifetime, real destroy order and exception fences', () => {
  it.each(['texture', 'origin', 'scale', 'rotation', 'flip', 'clearTint', 'alpha', 'position', 'depth', 'crop', 'visible', 'once'])('catches Image %s setter exception without partial handling', op => {
    const h = harness(), w = world(); h.faults.imageOp = op; h.faults.imageAt = 1;
    const r = new HumanRaterSpriteRenderer(h.scene, binding()); expect(r.draw(w, view()).size).toBe(0);
    expect(h.images).toHaveLength(2); noOwned(h); h.faults.imageOp = ''; expect(r.draw(w, view()).size).toBe(2);
  });
  it.each(['add', 'filter'])('catches %s exception with no borrowed destruction', op => {
    const h = harness(); h.faults.op = op; const r = new HumanRaterSpriteRenderer(h.scene, binding());
    expect(r.draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(0); expect(h.borrowedDestroy).toBe(0);
  });
  it('release failure on a run transition fails closed but tries every owned image', () => {
    const h = harness(), w = world(), r = new HumanRaterSpriteRenderer(h.scene, binding()); r.draw(w, view());
    h.faults.imageOp = 'destroy'; h.faults.imageAt = 0; w.save.runId += '-new';
    expect(r.draw(w, view()).size).toBe(0); expect(h.images).toHaveLength(2);
    expect(h.images.every(i => i.destroyed === 1 && !i.visible)).toBe(true); expect(h.borrowedDestroy).toBe(0);
    h.faults.imageOp = ''; expect(r.draw(w, view()).size).toBe(2); expect(h.images).toHaveLength(4);
  });
  it('external DESTROY is fenced while scene and active still look live', () => {
    const h = harness(), w = world(), r = new HumanRaterSpriteRenderer(h.scene, binding()); r.draw(w, view());
    let liveDuringEvent = false; h.images[0].once('destroy', () => { liveDuringEvent = !!h.images[0].scene && h.images[0].active; });
    h.images[0].destroy(); expect(liveDuringEvent).toBe(true); noOwned(h);
    expect(r.draw(w, view()).size).toBe(2); expect(h.images).toHaveLength(4); r.destroy(); noOwned(h);
  });
  it('external destroy during configure never returns partial ids or double destroys', () => {
    const h = harness(), w = world(), r = new HumanRaterSpriteRenderer(h.scene, binding()); r.draw(w, view());
    let once = false; h.faults.hook = (op, i) => { if (!once && op === 'position' && i === 1) { once = true; h.images[1].destroy(); } };
    expect(r.draw(w, view()).size).toBe(0); noOwned(h); h.faults.hook = null; expect(r.draw(w, view()).size).toBe(2);
  });
  it.each(['created', 'texture', 'position', 'visible', 'filter', 'frame'])('dispose during %s fences and cleans even just-returned handles', op => {
    const h = harness(), w = world(), r = new HumanRaterSpriteRenderer(h.scene, binding()); let once = false;
    h.faults.hook = name => { if (!once && name === op) { once = true; r.destroy(); } };
    expect(r.draw(w, view()).size).toBe(0); noOwned(h); const count = h.images.length;
    expect(r.draw(w, view()).size).toBe(0); expect(h.images).toHaveLength(count);
  });
  it.each(['created', 'texture', 'position', 'visible', 'filter', 'frame'])('reentrant draw during %s invalidates the outer generation', op => {
    const h = harness(), w = world(), r = new HumanRaterSpriteRenderer(h.scene, binding()); let once = false;
    h.faults.hook = name => { if (!once && name === op) { once = true; expect(r.draw(w, view()).size).toBe(0); } };
    expect(r.draw(w, view()).size).toBe(0); noOwned(h); h.faults.hook = null; expect(r.draw(w, view()).size).toBe(2);
  });
  it('adopts and releases an allocated handle when factory disposes before returning', () => {
    const h = harness(), r = new HumanRaterSpriteRenderer(h.scene, binding());
    h.faults.hook = op => { if (op === 'created') r.destroy(); };
    expect(r.draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(1); noOwned(h);
  });
  it('rejects same Image returned for two live ids', () => {
    const h = harness(); const factory = h.scene.add.image; let first: HumanRaterImage | null = null;
    h.scene.add.image = (...args) => first ??= factory(...args);
    expect(new HumanRaterSpriteRenderer(h.scene, binding()).draw(world(), view()).size).toBe(0); expect(h.images).toHaveLength(1); noOwned(h);
  });
  it('dispose is idempotent and makes no later allocation, filter or callback registration', () => {
    const h = harness(), w = world(), r = new HumanRaterSpriteRenderer(h.scene, binding()); r.draw(w, view()); r.destroy(); r.destroy(); noOwned(h);
    const calls = h.calls.length; expect(r.draw(w, view()).size).toBe(0); expect(h.calls).toHaveLength(calls); expect(h.images).toHaveLength(2);
  });
});
