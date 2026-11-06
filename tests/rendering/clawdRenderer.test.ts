import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ TintModes: { FILL: 1 } })); // Actual installed Phaser4.0.0 constant.
import { ClawdRenderer, type ClawdVisual } from '../../src/pages/GamePage/game/systems/ClawdRenderer';
import { scene, visual, Atlas, Image } from './clawdFakes';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
const forms = ['aligned', 'masked', 'foom'] as const;
const matrix = forms.flatMap(f => ([-1, 1] as const).flatMap(face => Array.from({ length: 7 }, (_, base) => [0, 83, 133].map(age => [f, face, base, age] as const)).flat()));
const frame = (index: number) => `clawd-svg ${index}.aseprite`;
describe('Clawd read-only actor projection', () => {
  it.each(matrix)('%s facing%i base%i age%i preserves gait/pivot/one-Image budget', (form, facing, base, age) => {
    const h = scene(), r = new ClawdRenderer(h.s), actor = { ...visual().actor, facing, vx: base >= 2 && base <= 5 ? 200 : 0, grounded: base !== 6 };
    const v = visual({ now: 1000, form, actor }); r.drawVisual(v);
    const now = 1000 + [0, 400, 0, 100, 170, 270, 0][base], next = { ...v, now, firedAt: now - age };
    Object.freeze(actor); Object.freeze(next); r.drawVisual(next);
    expect(h.images).toHaveLength(1); const i = h.images[0];
    expect([i.key, i.frame]).toEqual([`clawd-${form}`, frame(base + (age < 83 ? 8 : age < 133 ? 15 : 0))]);
    expect([i.x, i.y, i.origin, i.scale, i.rotation, i.depth, i.flip, i.alpha, i.visible, i.tintMode]).toEqual([80, 311, [16, 27], 1, 0, 3, [facing < 0, false], 1, true, 0]);
    r.destroy(); expect(i.isDestroyed).toBe(true);
  });
  it('never restarts run phase for emission or recovery', () => {
    const h = scene(), r = new ClawdRenderer(h.s), v = visual({ now: 1000, actor: { ...visual().actor, vx: 200 } }); r.drawVisual(v);
    const observed: string[] = [];
    for (const now of [1120, 1190, 1203, 1253, 1280]) { r.drawVisual({ ...v, now, firedAt: 1120 }); observed.push(h.images[0].frame); }
    expect(observed).toEqual([11, 12, 19, 4, 5].map(frame)); r.destroy();
  });
  it('freezes at unchanged simulation time despite wall-time passing', () => {
    vi.useFakeTimers(); const h = scene(), r = new ClawdRenderer(h.s), v = visual({ now: 1000, firedAt: 1000 });
    try { r.drawVisual(v); vi.advanceTimersByTime(100000); r.drawVisual(v); expect(h.images[0].frame).toBe(frame(8));
      r.drawVisual({ ...v, now: 1083 }); expect(h.images[0].frame).toBe(frame(15)); r.drawVisual({ ...v, now: 1133 }); expect(h.images[0].frame).toBe(frame(0));
    } finally { r.destroy(); vi.useRealTimers(); }
  });
  it('gives hurt priority and does not replay an expired shot after interruption', () => {
    const h = scene(), r = new ClawdRenderer(h.s), v = visual({ now: 1000 }); r.drawVisual(v);
    r.drawVisual({ ...v, now: 1010, hp: 90, firedAt: 1000 }); expect(h.images[0].frame).toBe(frame(7));
    r.drawVisual({ ...v, now: 1129, hp: 90, firedAt: 1000 }); expect(h.images[0].frame).toBe(frame(7));
    r.drawVisual({ ...v, now: 1140, hp: 90, firedAt: 1000 }); expect(h.images[0].frame).toBe(frame(0)); r.destroy();
  });
  it('preserves petrification fill, rewind tint and clearTint restoration', () => {
    const h = scene(), r = new ClawdRenderer(h.s), v = visual({ now: 1000, firedAt: 1000 });
    r.drawVisual({ ...v, actor: { ...v.actor, petrifiedUntil: 2000, invulnerableUntil: 2000 } });
    expect([h.images[0].frame, h.images[0].tint, h.images[0].tintMode, h.images[0].visible]).toEqual([frame(0), 0xbcc7c8, 1, true]);
    r.drawVisual({ ...v, rewinding: true }); expect([h.images[0].frame, h.images[0].tint, h.images[0].tintMode]).toEqual([frame(0), 0xa5fff1, 0]);
    r.drawVisual(v); expect([h.images[0].frame, h.images[0].tint, h.images[0].tintMode]).toEqual([frame(8), 0xffffff, 0]); r.destroy();
  });
  it('ignores held-input/cooldown/counter decorations without a receipt', () => {
    const h = scene(), r = new ClawdRenderer(h.s), v = visual({ now: 1000 });
    Object.assign(v, { fire: true, actionCounts: { shots: 1000 }, bullets: [{}] }); Object.assign(v.actor, { shotReadyAt: 1100 });
    r.drawVisual(v); expect(h.images[0].frame).toBe(frame(0)); r.destroy();
  });
  it('keeps non-playing states calm and obeys hidden/alpha/flash independently', () => {
    const h = scene(), r = new ClawdRenderer(h.s), v = visual({ now: 1000, firedAt: 1000, playing: false, alpha: 0.45 });
    r.drawVisual(v); expect([h.images[0].frame, h.images[0].alpha, h.images[0].visible]).toEqual([frame(0), 0.45, true]);
    r.drawVisual({ ...v, hidden: true }); expect(h.images[0].visible).toBe(false);
    r.drawVisual({ ...v, playing: true, actor: { ...v.actor, invulnerableUntil: 2000 } }); expect(h.images[0].visible).toBe(false); r.destroy();
  });
  it('resets hurt/phase on a new run or a backwards simulation time', () => {
    const h = scene(), r = new ClawdRenderer(h.s); r.drawVisual(visual({ now: 1000 })); r.drawVisual(visual({ now: 1010, hp: 90 }));
    expect(h.images[0].frame).toBe(frame(7)); r.drawVisual(visual({ runId: 'new', now: 1020 })); expect(h.images[0].frame).toBe(frame(0));
    r.drawVisual(visual({ runId: 'new', now: 200, hp: 80 })); expect(h.images[0].frame).toBe(frame(0)); r.destroy();
  });
  it('hides on an unused-family fault and rebinds the same owned Image after repair', () => {
    const h = scene(), r = new ClawdRenderer(h.s), v = visual({ now: 1000, firedAt: 1000 }); r.drawVisual(v);
    const a = h.textures.get('clawd-foom'), last = a.get(frame(21))!; a.frames.delete(frame(21)); r.drawVisual(v); expect(h.images[0].visible).toBe(false);
    a.frames.set(frame(21), last); r.drawVisual(v); expect(h.images).toHaveLength(1); expect(h.images[0].visible).toBe(true); r.destroy();
  });
  it('rebinds equal-size replacement textures even at identical key/frame', () => {
    const h = scene(), r = new ClawdRenderer(h.s), v = visual(); r.drawVisual(v);
    const before = h.images[0].calls.filter(c => c.name === 'setTexture').length;
    h.textures.atlases.set('clawd-foom', new Atlas('clawd-foom')); r.drawVisual(v);
    expect(h.images[0].calls.filter(c => c.name === 'setTexture')).toHaveLength(before + 1); expect(h.images).toHaveLength(1); r.destroy();
  });
  it('never commits a partially drawn stale resource set and recovers one live Image', () => {
    const h = scene(), r = new ClawdRenderer(h.s); r.drawVisual(visual());
    h.images[0].hook = name => { if (name === 'setTexture') h.textures.atlases.set('clawd-foom', new Atlas('clawd-foom')); };
    r.drawVisual(visual({ now: 1, firedAt: 1 })); expect(h.images[0].isDestroyed).toBe(true);
    r.drawVisual(visual({ now: 2, firedAt: 1 })); expect(h.images.filter(i => !i.isDestroyed)).toHaveLength(1); expect(h.images[1].visible).toBe(true); r.destroy();
  });
  it('fences destruction during a setter and cannot revive after dispose', () => {
    const h = scene(), r = new ClawdRenderer(h.s); r.drawVisual(visual()); h.images[0].hook = name => { if (name === 'setTexture') r.destroy(); };
    r.drawVisual(visual({ now: 1, firedAt: 1 })); const n = h.images[0].calls.length;
    r.drawVisual(visual()); r.setVisible(true); r.destroy(); expect(h.images).toHaveLength(1); expect(h.images[0].calls).toHaveLength(n);
    expect(h.images[0].calls.filter(c => c.name === 'destroy')).toHaveLength(1);
  });
  it('disposes an Image returned after its owner was destroyed by the factory', () => {
    const h = scene(), r = new ClawdRenderer(h.s), image = new Image(h.s); h.s.add.image = () => { r.destroy(); return image; };
    r.drawVisual(visual()); expect(image.isDestroyed).toBe(true); r.drawVisual(visual()); expect(image.calls.filter(c => c.name === 'destroy')).toHaveLength(1);
  });
  it('rejects shared/foreign images without hiding or destroying the rightful owner', () => {
    const h = scene(), a = new ClawdRenderer(h.s), b = new ClawdRenderer(h.s); a.drawVisual(visual()); const own = h.images[0]; h.s.add.image = () => own;
    b.drawVisual(visual()); b.destroy(); expect(own.isDestroyed).toBe(false); expect(own.visible).toBe(true); a.destroy();
    const x = scene(), foreign = new Image(x.s), other = scene(); other.s.add.image = () => foreign;
    const c = new ClawdRenderer(other.s); c.drawVisual(visual()); c.destroy(); expect(foreign.calls).toHaveLength(0);
  });
  it('recovers external destruction and ignores reentrant draw while taking a value snapshot', () => {
    const h = scene(), r = new ClawdRenderer(h.s), v = visual(); r.drawVisual(v); h.images[0].destroy(); r.drawVisual(v); expect(h.images).toHaveLength(2);
    h.images[1].hook = name => { if (name === 'setTexture') { v.actor.x = 999; r.drawVisual(visual({ now: 9000 })); } };
    r.drawVisual({ ...v, now: 1, firedAt: 1 }); expect(h.images[1].x).toBe(80); expect(h.images[1].frame).toBe(frame(8)); r.destroy();
  });
  it('draw(world) consumes the real Core receipt without a view clock or save write', () => {
    const h = scene(), r = new ClawdRenderer(h.s), original = createWorld(createRun('8a40b11b-007a-4aa3-9e14-6f1f08825d01', 42));
    const next = stepWorld(original, { ...EMPTY_INPUT, fire: true }), bytes = JSON.stringify(next);
    r.draw(next); expect(Number(h.images[0].frame.match(/ ([0-9]+)\./)![1])).toBeGreaterThanOrEqual(8);
    expect(Number(h.images[0].frame.match(/ ([0-9]+)\./)![1])).toBeLessThanOrEqual(14);
    expect(JSON.stringify(next)).toBe(bytes); expect(original.player.lastFiredAt).toBeNull(); r.destroy();
  });
  it.each(['now', 'hp', 'alpha'] as const)('fails closed for non-finite %s without mutating input', key => {
    const h = scene(), r = new ClawdRenderer(h.s), v = visual(); r.drawVisual(v); const invalid: ClawdVisual = { ...v, [key]: NaN }; Object.freeze(invalid);
    expect(() => r.drawVisual(invalid)).not.toThrow(); expect(h.images[0].visible).toBe(false); r.destroy();
  });
});

describe('Clawd owned-image failure and bounded lifetime controls', () => {
  it('uses installed Phaser4 nearest-neighbour code1, never linear0, for the whole family', () => {
    const h = scene(), r = new ClawdRenderer(h.s); r.drawVisual(visual());
    // Phaser4.0.0 WebGLRenderer.setTextureFilter maps0 to LINEAR and1 to NEAREST.
    for (const a of h.textures.atlases.values()) expect(a.setFilter.mock.calls).toEqual([[1]]);
    r.drawVisual(visual({ now: 100, form: 'masked', firedAt: 100 }));
    for (const a of h.textures.atlases.values()) expect(a.setFilter.mock.calls).toEqual([[1]]); r.destroy();
  });

  it.each(['setVisible', 'setTexture', 'setDisplayOrigin', 'setScale', 'setRotation', 'setCrop', 'setDepth', 'setPosition', 'setFlip', 'setAlpha', 'clearTint', 'setTint', 'setTintMode'])('fails closed when %s throws, then recovers without replay', method => {
    const h = scene(), r = new ClawdRenderer(h.s); r.drawVisual(visual()); const old = h.images[0];
    old.hook = name => { if (name === method) throw Error('injected setter failure'); };
    expect(() => r.drawVisual(visual({ now: 1, form: 'masked', firedAt: 1, actor: { ...visual().actor, petrifiedUntil: 100 } }))).not.toThrow();
    expect(old.isDestroyed).toBe(true); expect(old.visible).toBe(false);
    r.drawVisual(visual({ now: 200, firedAt: 1 })); expect(h.images.filter(i => !i.isDestroyed)).toHaveLength(1); expect(h.images[1].frame).toBe(frame(0)); r.destroy();
  });
  it('recovers a throwing factory without an artificial attack restart', () => {
    const h = scene(), r = new ClawdRenderer(h.s), normal = h.s.add.image; h.s.add.image = () => { throw Error('factory'); };
    expect(() => r.drawVisual(visual({ now: 1000, firedAt: 1000 }))).not.toThrow(); expect(h.images).toHaveLength(0);
    h.s.add.image = normal; r.drawVisual(visual({ now: 1133, firedAt: 1000 })); expect(h.images[0].frame).toBe(frame(0)); r.destroy();
  });
  it('one owned Image survives600 draws across all skins, poses and actual-shot ages', () => {
    const h = scene(), r = new ClawdRenderer(h.s);
    for (let tick = 0; tick < 600; tick++) {
      const now = tick * 16.666; r.drawVisual(visual({ now, form: forms[tick % 3], firedAt: Math.floor(now / 185) * 185,
        actor: { ...visual().actor, vx: tick % 2 ? 100 : 0, grounded: tick % 7 !== 0, facing: tick % 2 ? -1 : 1 } }));
    }
    expect(h.images).toHaveLength(1); expect(h.images[0].isDestroyed).toBe(false); r.destroy();
  });
});
