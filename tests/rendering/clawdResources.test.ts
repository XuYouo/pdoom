import { describe, expect, it } from 'vitest';
import { clawdResourcesReady, clawdResourceSnapshot, sameClawdResources } from '../../src/pages/GamePage/game/systems/ClawdResources';
import { clawdShotFrame } from '../../src/pages/GamePage/game/data/clawdAssets';
import { Textures, Atlas } from './clawdFakes';
const forms = ['aligned', 'masked', 'foom'];
describe('Clawd complete-family native guard', () => {
  it('accepts all3x22 canonical roles without filter writes', () => {
    const t = new Textures(); expect(clawdResourcesReady(t)).toBe(true);
    expect(sameClawdResources(clawdResourceSnapshot(t), clawdResourceSnapshot(t))).toBe(true);
    t.atlases.forEach(a => expect(a.setFilter).not.toHaveBeenCalled());
  });
  it.each(forms.flatMap(f => Array.from({ length: 22 }, (_, i) => [f, i] as const)))('requires even unused %s frame%i', (form, i) => {
    const t = new Textures(); t.get(`clawd-${form}`).frames.delete(`clawd-svg ${i}.aseprite`);
    expect(clawdResourcesReady(t)).toBe(false);
  });
  it.each(forms)('rejects missing family %s, including non-current forms', form => {
    const t = new Textures(); t.atlases.delete(`clawd-${form}`); expect(clawdResourcesReady(t)).toBe(false);
  });
  it.each(['x', 'y', 'cutX', 'cutY', 'width', 'height', 'cutWidth', 'cutHeight', 'realWidth', 'realHeight', 'sourceIndex'] as const)('rejects unused final-role %s damage', property => {
    const t = new Textures(), f = t.get('clawd-foom').get('clawd-svg 21.aseprite')!;
    f[property] += 1; expect(clawdResourcesReady(t)).toBe(false);
  });
  it.each(['trimmed', 'rotated'] as const)('rejects %s final role', p => {
    const t = new Textures(); t.get('clawd-foom').get('clawd-svg 21.aseprite')![p] = true; expect(clawdResourcesReady(t)).toBe(false);
  });
  it('rejects aliases, false names, wrong owner/source and changed family key', () => {
    for (const fault of ['alias', 'name', 'owner', 'source', 'key']) {
      const t = new Textures(), a = t.get('clawd-foom'), f = a.get('clawd-svg 21.aseprite')!;
      if (fault === 'alias') a.frames.set('clawd-svg 21.aseprite', a.get('clawd-svg 0.aseprite')!);
      if (fault === 'name') f.name = 'pretend';
      if (fault === 'owner') f.texture = t.get('clawd-aligned');
      if (fault === 'source') f.source = t.get('clawd-aligned').source[0];
      if (fault === 'key') a.key = 'borrowed';
      expect(clawdResourcesReady(t), fault).toBe(false);
    }
  });
  it.each(['sourceWidth', 'sourceHeight', 'naturalWidth', 'naturalHeight', 'extraSource', 'sharedImage'])('rejects %s independent of correct frame metadata', fault => {
    const t = new Textures(), a = t.get('clawd-foom'), s = a.source[0];
    if (fault === 'sourceWidth') s.width = 703;
    if (fault === 'sourceHeight') s.height = 31;
    if (fault === 'naturalWidth') s.image.naturalWidth = 1408;
    if (fault === 'naturalHeight') s.image.naturalHeight = 64;
    if (fault === 'extraSource') a.source.push({ ...s });
    if (fault === 'sharedImage') s.image = t.get('clawd-aligned').source[0].image;
    expect(clawdResourcesReady(t)).toBe(false);
  });
  it('uses HTML natural dimensions rather than mutable display size', () => {
    const t = new Textures(); t.get('clawd-aligned').source[0].image.width = 1; expect(clawdResourcesReady(t)).toBe(true);
  });
  it('fails closed for a throwing getter', () => {
    const t = new Textures(); Object.defineProperty(t.get('clawd-foom'), 'source', { get() { throw Error('bad getter'); } });
    expect(() => clawdResourcesReady(t)).not.toThrow(); expect(clawdResourcesReady(t)).toBe(false);
  });
  it('distinguishes equal-size resource replacement from a stable reference set', () => {
    const t = new Textures(), a = clawdResourceSnapshot(t); t.atlases.set('clawd-foom', new Atlas('clawd-foom'));
    expect(clawdResourcesReady(t)).toBe(true); expect(sameClawdResources(a, clawdResourceSnapshot(t))).toBe(false);
  });
});
describe('simulation-time shot matrix, not animation frames played in order', () => {
  it.each(Array.from({ length: 7 }, (_, i) => i))('maps gait%i at precise83/133 boundaries without changing the gait', base => {
    expect([-1, 0, 82.999, 83, 132.999, 133, 10000].map(age => clawdShotFrame(base, 1000 + age, 1000))).toEqual([base, base + 8, base + 8, base + 15, base + 15, base, base]);
  });
  it.each([null, undefined, -1, NaN, Infinity, -Infinity, 1001])('does not manufacture a pulse for invalid/missing/future receipt %s', stamp => {
    expect(clawdShotFrame(0, 1000, stamp)).toBe(0);
  });
  it('accepts an actual emission at zero and gives hurt/suppression priority', () => {
    expect(clawdShotFrame(0, 0, 0)).toBe(8); expect(clawdShotFrame(7, 0, 0)).toBe(7);
    expect(clawdShotFrame(2, 0, 0, false)).toBe(2); expect(clawdShotFrame(0, NaN, 0)).toBe(0);
  });
  it.each([-1, 8, 1.5, NaN, Infinity])('rejects invalid base role %s', n => expect(() => clawdShotFrame(n, 1000, 1000)).toThrow(/base frame/));
});
