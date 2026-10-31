import { describe, expect, it } from 'vitest';
import { ChinchillaSpriteRenderer, chinchillaSpriteResourcesReady, chinchillaSpriteRoleFor, type ChinchillaSpriteActor, type ChinchillaSpriteImage, type ChinchillaSpriteScene, type ChinchillaSpriteWorld, type ChinchillaTextureFrame } from '../../src/pages/GamePage/game/systems/ChinchillaSpriteRenderer';
import { CHINCHILLA_ASSET, CHINCHILLA_BINDING } from '../../src/pages/GamePage/game/data/chinchillaAssets';

type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type Frame = Mutable<Omit<ChinchillaTextureFrame, 'source'>> & { source: { width: number; height: number; image: object; source: object } };
const binding = () => ({ key: 'tiny', frames: { idle: '0', tell: '1', recover: '2' } });
class Image implements ChinchillaSpriteImage {
  origin = [0, 0]; position = [0, 0]; flip = false; scale = 9; depth = 0; alpha = 0.5; rotation = 2; destroyed = 0; changes: string[] = [];
  constructor(public frame: string, public failAt = '') {}
  private check(name: string) { this.changes.push(name); if (this.failAt === name) throw new Error(name); }
  setFrame(v: string) { this.frame = v; this.check('frame'); }
  setDisplayOrigin(x: number, y: number) { this.origin = [x, y]; this.check('origin'); }
  setPosition(x: number, y: number) { this.position = [x, y]; this.check('position'); }
  setFlipX(v: boolean) { this.flip = v; this.check('flip'); }
  setScale(v: number) { this.scale = v; this.check('scale'); }
  setDepth(v: number) { this.depth = v; this.check('depth'); }
  setAlpha(v: number) { this.alpha = v; this.check('alpha'); }
  setRotation(v: number) { this.rotation = v; this.check('rotation'); }
  destroy() { this.destroyed++; this.check('destroy'); }
}
function harness() {
  const source = { width: 96, height: 32, image: {}, source: {} };
  const frames = new Map<string, Frame>([0, 1, 2].map(i => [String(i), { cutX: i * 32, cutY: 0, cutWidth: 32, cutHeight: 32, x: 0, y: 0, width: 32, height: 32, realWidth: 32, realHeight: 32, trimmed: false, rotated: false, source }]));
  const images: Image[] = [], filters: number[] = [];
  const state = { present: true, failure: '', nextImageFailure: '' };
  const makeTexture = () => ({
    has: (name: string) => { if (state.failure === 'has') throw new Error('has'); return frames.has(name); },
    get: (name: string) => { if (state.failure === 'frame-get') throw new Error('get'); return frames.get(name); },
    setFilter: (n: number) => { if (state.failure === 'filter') throw new Error('filter'); filters.push(n); },
  });
  const texture = { current: makeTexture() };
  const scene: ChinchillaSpriteScene = {
    add: { image: (_x, _y, key, frame) => { expect(key).toBe('tiny'); if (state.failure === 'add') throw new Error('add'); const im = new Image(frame, state.nextImageFailure); images.push(im); return im; } },
    textures: { exists: () => { if (state.failure === 'exists') throw new Error('exists'); return state.present; }, get: () => { if (state.failure === 'texture-get') throw new Error('get'); return texture.current; } },
  };
  return { scene, frames, source, images, filters, state, texture, makeTexture };
}
const actor = (patch: Partial<ChinchillaSpriteActor> = {}): ChinchillaSpriteActor => Object.freeze({ id: 'chip', kind: 'chinchilla', hp: 108, x: 1730.4, y: 314.4, phase: 'idle', ...patch });
function world(enemies: readonly ChinchillaSpriteActor[] = [actor()], patch: Partial<ChinchillaSpriteWorld> = {}): ChinchillaSpriteWorld {
  return Object.freeze({ save: Object.freeze({ runId: 'run' }), chapter: Object.freeze({ stage: 3 }), player: Object.freeze({ x: 1320 }), enemies: Object.freeze(enemies), ...patch });
}

describe('Chinchilla strict three-state view', () => {
  it('imports in Node with no runtime Phaser or browser global and freezes actual descriptor', () => {
    expect(typeof window).toBe('undefined'); expect(CHINCHILLA_ASSET.frames).toEqual(['chinchilla 0.aseprite', 'chinchilla 1.aseprite', 'chinchilla 2.aseprite']);
    expect(CHINCHILLA_ASSET).toMatchObject({ key: 'chinchilla', frameWidth: 32, frameHeight: 32 });
    expect(Object.isFrozen(CHINCHILLA_BINDING.frames)).toBe(true); expect(Object.isFrozen(CHINCHILLA_ASSET.frames)).toBe(true);
  });
  it.each(['idle', 'tell', 'recover'] as const)('projects only real %s state, native1x origin16 and integer center', phase => {
    const h = harness(), r = new ChinchillaSpriteRenderer(h.scene, binding()), w = world([actor({ phase })]);
    expect([...r.draw(w)]).toEqual(['chip']); const im = h.images[0];
    expect(im.frame).toBe(String(['idle', 'tell', 'recover'].indexOf(phase))); expect(im.origin).toEqual([16, 16]); expect(im.position).toEqual([1730, 314]);
    expect([im.scale, im.depth, im.alpha, im.rotation, im.flip]).toEqual([1, 2, 1, 0, false]); expect(h.filters).toEqual([1]);
  });
  it.each(['seek', 'attack', 'consume', 'IDLE', '', null, undefined, 3])('refuses invented phase %s', phase => expect(chinchillaSpriteRoleFor(phase)).toBeNull());
  it('shares a complete side-effect-free ready guard, including every unused pose', () => {
    const h = harness(); expect(chinchillaSpriteResourcesReady(h.scene.textures, binding())).toBe(true);
    expect(h.images).toEqual([]); expect(h.filters).toEqual([]); h.frames.delete('2');
    expect(chinchillaSpriteResourcesReady(h.scene.textures, binding())).toBe(false); expect(new ChinchillaSpriteRenderer(h.scene, binding()).draw(world()).size).toBe(0);
  });
  const invalidBindings: unknown[] = [null, undefined, [], {}, { key: '', frames: binding().frames }, { key: 'tiny', frames: {} }, { key: 'tiny', frames: { idle: 0, tell: '0', recover: 2 } }, { key: 'tiny', frames: { idle: -1, tell: 1, recover: 2 } }, { key: 'tiny', frames: { idle: 0.5, tell: 1, recover: 2 } }, { key: 'tiny', frames: { idle: '', tell: '1', recover: '2' } }];
  it.each(invalidBindings)('rejects malformed binding %#', value => {
    const h = harness(); expect(chinchillaSpriteResourcesReady(h.scene.textures, value)).toBe(false);
    expect(new ChinchillaSpriteRenderer(h.scene, value).draw(world()).size).toBe(0); expect(h.images).toEqual([]);
  });
  it('copies bindings, normalizes numeric0, and survives hostile getters', () => {
    const h = harness(), input = { key: 'tiny', frames: { idle: 0, tell: 1, recover: 2 } }, r = new ChinchillaSpriteRenderer(h.scene, input);
    input.key = 'changed'; input.frames.idle = 9; expect(r.draw(world()).size).toBe(1); expect(h.images[0].frame).toBe('0');
    expect(chinchillaSpriteResourcesReady(h.scene.textures, { get key() { throw new Error('getter'); } })).toBe(false);
  });
  for (const index of [0, 1, 2]) {
    it.each(['cutWidth', 'cutHeight', 'width', 'height', 'realWidth', 'realHeight', 'x', 'y', 'cutX', 'cutY', 'trimmed', 'rotated'] as const)(`rejects frame${index} corrupted %s`, property => {
      const h = harness(), frame = h.frames.get(String(index))!;
      Object.assign(frame, { [property]: property === 'trimmed' || property === 'rotated' ? true : 31 });
      expect(chinchillaSpriteResourcesReady(h.scene.textures, binding())).toBe(false); expect(new ChinchillaSpriteRenderer(h.scene, binding()).draw(world()).size).toBe(0);
    });
  }
  it.each([{ width: 95 }, { width: 128 }, { height: 31 }, { height: 64 }, { width: NaN }, { width: Infinity }])('rejects source dimensions %j', patch => {
    const h = harness(); Object.assign(h.source, patch); expect(chinchillaSpriteResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it('rejects alias rectangles even when three names and complete32x32 frames exist', () => {
    const h = harness(); h.frames.get('2')!.cutX = 0; expect(chinchillaSpriteResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it('uses no elapsedMs, phaseUntil, physics, IO or animation clock while paused', () => {
    const h = harness(), r = new ChinchillaSpriteRenderer(h.scene, binding());
    const w = world([Object.freeze({ ...actor(), get phaseUntil() { throw new Error('deadline'); } })], { save: Object.freeze({ runId: 'run', get elapsedMs() { throw new Error('clock'); } }) });
    for (let i = 0; i < 100; i++) expect([...r.draw(w)]).toEqual(['chip']);
    expect(h.images).toHaveLength(1); expect(h.images[0].frame).toBe('0'); expect(h.filters).toEqual([1]);
  });
  it('reuses one image, changes only the actual state and reasserts pivot/transform/flip', () => {
    const h = harness(), r = new ChinchillaSpriteRenderer(h.scene, binding()); r.draw(world()); const im = h.images[0];
    im.origin = [0, 0]; im.scale = 4; im.alpha = 0.2; im.rotation = 2;
    r.draw(world([actor({ phase: 'tell' })], { player: { x: 1800 } }));
    expect(h.images).toHaveLength(1); expect(im.frame).toBe('1'); expect(im.flip).toBe(true); expect(im.origin).toEqual([16, 16]); expect([im.scale, im.alpha, im.rotation]).toEqual([1, 1, 0]);
    r.draw(world([actor({ phase: 'recover' })])); expect(im.frame).toBe('2'); expect(im.flip).toBe(false);
  });
  it.each([{ hp: 0 }, { hp: -1 }, { hp: NaN }, { hp: Infinity }, { x: NaN }, { y: Infinity }, { id: ' ' }, { kind: 'parrot' }, { phase: 'attack' }])('removes invalid or dead actor %j', patch => {
    const h = harness(), r = new ChinchillaSpriteRenderer(h.scene, binding()); r.draw(world());
    expect(r.draw(world([actor(patch as Partial<ChinchillaSpriteActor>)]))).toEqual(new Set()); expect(h.images[0].destroyed).toBe(1);
  });
  it('rejects ambiguous duplicate IDs without moving a shared image between bodies', () => {
    const h = harness(), r = new ChinchillaSpriteRenderer(h.scene, binding()); r.draw(world());
    expect(r.draw(world([actor(), actor({ x: 2180 })])).size).toBe(0); expect(h.images[0].destroyed).toBe(1);
  });
  it.each([{ chapter: { stage: 2 } }, { save: { runId: '' } }, { player: { x: NaN } }])('cleans incompatible world %j', patch => {
    const h = harness(), r = new ChinchillaSpriteRenderer(h.scene, binding()); r.draw(world()); expect(r.draw(world(undefined, patch)).size).toBe(0); expect(h.images[0].destroyed).toBe(1);
  });
  it('clears on run/stage changes, lost resources, reentry and repeated destroy', () => {
    const h = harness(), r = new ChinchillaSpriteRenderer(h.scene, binding()); r.draw(world()); r.draw(world(undefined, { save: { runId: 'new' } }));
    expect(h.images[0].destroyed).toBe(1); expect(h.images).toHaveLength(2); h.state.present = false; expect(r.draw(world()).size).toBe(0);
    h.state.present = true; r.draw(world()); r.draw(world(undefined, { chapter: { stage: 1 } })); expect(h.images[2].destroyed).toBe(1);
    r.draw(world()); r.destroy(); r.destroy(); expect(r.draw(world()).size).toBe(0); expect(h.images.every(i => i.destroyed === 1)).toBe(true);
  });
  it.each(['texture', 'frame', 'source', 'image', 'media'] as const)('invalidates same-key %s identity', kind => {
    const h = harness(), r = new ChinchillaSpriteRenderer(h.scene, binding()); r.draw(world());
    if (kind === 'texture') h.texture.current = h.makeTexture();
    else if (kind === 'frame') h.frames.set('0', { ...h.frames.get('0')! });
    else if (kind === 'source') h.frames.get('0')!.source = { ...h.source };
    else if (kind === 'image') h.source.image = {}; else h.source.source = {};
    expect(r.draw(world()).size).toBe(1); expect(h.images).toHaveLength(2); expect(h.images[0].destroyed).toBe(1); expect(h.filters).toEqual([1, 1]);
  });
  it.each(['exists', 'texture-get', 'has', 'frame-get', 'filter', 'add'])('fails closed on resource/allocation %s', failure => {
    const h = harness(), r = new ChinchillaSpriteRenderer(h.scene, binding()); h.state.failure = failure;
    expect(r.draw(world()).size).toBe(0); expect(h.images).toEqual([]);
    if (failure !== 'add' && failure !== 'filter') expect(chinchillaSpriteResourcesReady(h.scene.textures, binding())).toBe(false);
  });
  it.each(['origin', 'position', 'flip', 'scale', 'depth', 'alpha', 'rotation'])('releases owned partial object on setter %s', failure => {
    const h = harness(); h.state.nextImageFailure = failure; const r = new ChinchillaSpriteRenderer(h.scene, binding());
    expect(r.draw(world()).size).toBe(0); expect(h.images[0].destroyed).toBe(1);
  });
  it('releases every owned object when a later frame setter throws', () => {
    const h = harness(), r = new ChinchillaSpriteRenderer(h.scene, binding()); r.draw(world([actor(), actor({ id: 'two', x: 2180 })]));
    h.images[0].failAt = 'frame'; expect(r.draw(world([actor({ phase: 'tell' }), actor({ id: 'two', x: 2180 })])).size).toBe(0);
    expect(h.images.map(i => i.destroyed)).toEqual([1, 1]);
  });
});
