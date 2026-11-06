import { describe, expect, it } from 'vitest';
import { file, hash, decodeAse, decodePng, composite, crop, type Pixels } from './clawdAttackCodec';
import { NATIVE_ENDING_ART, ENDING_CLIP_RECT, endingSceneFrame } from '../../src/pages/GamePage/functions/endingSceneAssets';

const native = decodeAse(file('../../assets/source/ending-scenes/ending-scenes.aseprite'));
const scenes = decodePng(file('../../public/game/ending-scenes.png'));
const clips = decodePng(file('../../public/game/ending-clips.png'));
function proveScene(p: Pixels, kind: 'aligned' | 'warden' | 'foom') {
  const frame = endingSceneFrame(kind), i = ['aligned', 'warden', 'foom'].indexOf(kind);
  expect(crop(p, frame.x, frame.y, frame.width, frame.height).rgba.equals(composite(native, i).rgba)).toBe(true);
}
describe('promoted ending runtime pixels remain native and scene-local', () => {
  it.each(['png', 'json'])('promotes the %s unchanged instead of regenerating or resizing the scene sheet', ext => {
    expect(file(`../../public/game/ending-scenes.${ext}`).equals(file(`../../assets/candidates/ending-scenes/ending-scenes.${ext}`))).toBe(true);
  });
  it.each(['aligned', 'warden', 'foom'] as const)('runtime frame %s matches all32768 source pixels', kind => proveScene(scenes, kind));
  it('exports transparent clips directly from the FOOM accent layer, not the composited desktop', () => {
    expect([clips.width, clips.height]).toEqual([NATIVE_ENDING_ART.clips.width, NATIVE_ENDING_ART.clips.height]);
    expect(clips.rgba.equals(composite(native, 2, ['accents']).rgba)).toBe(true);
    const r = ENDING_CLIP_RECT, glyph = crop(clips, r.x, r.y, r.width, r.height);
    expect(glyph.rgba.filter((v, i) => i % 4 === 3 && v === 255)).toHaveLength(69);
    expect(glyph.rgba.filter((v, i) => i % 4 === 3 && v === 0)).toHaveLength(84);
    expect([...glyph.rgba].filter((_, i) => i % 4 === 3).every(a => a === 0 || a === 255)).toBe(true);
  });
  it('retains the admitted native source hash despite export of another layer', () => {
    expect(hash(file('../../assets/source/ending-scenes/ending-scenes.aseprite'))).toBe('4fa9b3572de15b57f098481ebb8868d761c6925c2e6e56aede3a10cdd4adaa08');
  });
  it.each(['aligned', 'warden', 'foom'] as const)('rejects a changed display pixel in frame %s', kind => {
    const p = { ...scenes, rgba: Buffer.from(scenes.rgba) }, frame = endingSceneFrame(kind);
    p.rgba[(32 * p.width + frame.x + 20) * 4] ^= 1;
    expect(() => proveScene(p, kind)).toThrow();
  });
});
