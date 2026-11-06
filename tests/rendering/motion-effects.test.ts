import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ Scene: class {} }));
import { WorldScene } from '../../src/pages/GamePage/game/scenes/WorldScene';
import { GameBridge } from '../../src/pages/GamePage/game/bridge';

interface Probe {
  command(command: { type: 'set-reduced-motion'; reducedMotion: boolean }): void;
  emitWorldEvents(): void;
  cameras: { main: { shake: ReturnType<typeof vi.fn>; shakeEffect: { reset: ReturnType<typeof vi.fn> } } };
  world: Readonly<{ events: readonly { type: string; strength?: number; message?: string }[] }>;
  paused: boolean; accumulator: number; cleaned: boolean;
}
function sceneFor(strength = 0.006) {
  const bridge = new GameBridge(), events = vi.fn(); bridge.onEvent(events);
  const scene = new WorldScene(bridge) as unknown as Probe;
  const camera = { shake: vi.fn(), shakeEffect: { reset: vi.fn() } };
  scene.cameras = { main: camera };
  scene.world = Object.freeze({ events: Object.freeze([Object.freeze({ type: 'impact', strength })]) });
  return { scene, camera, events };
}

describe('actual Scene camera-impact boundary', () => {
  it.each([0.001, 0.006, 0.02])('keeps ordinary impact strength%s without changing the frozen world', strength => {
    const { scene, camera } = sceneFor(strength), before = JSON.stringify(scene.world);
    scene.emitWorldEvents(); expect(camera.shake).toHaveBeenCalledExactlyOnceWith(90, strength);
    expect(JSON.stringify(scene.world)).toBe(before);
  });
  it('stops an in-progress shake immediately when reduced motion is requested', () => {
    const { scene, camera } = sceneFor();
    scene.command({ type: 'set-reduced-motion', reducedMotion: true });
    expect(camera.shakeEffect.reset).toHaveBeenCalledOnce(); expect(camera.shake).not.toHaveBeenCalled();
  });
  it.each([0.001, 0.006, 0.02])('does not start subsequent shake for real impact strength%s', strength => {
    const { scene, camera } = sceneFor(strength), before = JSON.stringify(scene.world);
    scene.command({ type: 'set-reduced-motion', reducedMotion: true }); scene.emitWorldEvents();
    expect(camera.shake).not.toHaveBeenCalled(); expect(JSON.stringify(scene.world)).toBe(before);
  });
  it('changing the preference neither resumes nor steps a paused world', () => {
    const { scene, camera } = sceneFor(), world = scene.world;
    scene.paused = true; scene.accumulator = 7.5;
    scene.command({ type: 'set-reduced-motion', reducedMotion: true });
    expect(camera.shakeEffect.reset).toHaveBeenCalledOnce();
    expect(scene.paused).toBe(true); expect(scene.accumulator).toBe(7.5); expect(scene.world).toBe(world);
  });
  it('returns to normal impacts only after the resolved preference becomes false', () => {
    const { scene, camera } = sceneFor();
    scene.command({ type: 'set-reduced-motion', reducedMotion: true });
    scene.command({ type: 'set-reduced-motion', reducedMotion: false }); scene.emitWorldEvents();
    expect(camera.shakeEffect.reset).toHaveBeenCalledOnce(); expect(camera.shake).toHaveBeenCalledExactlyOnceWith(90, 0.006);
  });
  it('does not touch a camera after Scene cleanup', () => {
    const { scene, camera } = sceneFor(); scene.cleaned = true;
    scene.command({ type: 'set-reduced-motion', reducedMotion: true });
    expect(camera.shakeEffect.reset).not.toHaveBeenCalled();
  });
  it('keeps unrelated gameplay notices and never changes the event list', () => {
    const { scene, camera, events } = sceneFor();
    scene.world = Object.freeze({ events: Object.freeze([Object.freeze({ type: 'impact', strength: .01 }), Object.freeze({ type: 'notice', message: '真实伤害仍然发生' })]) });
    const before = JSON.stringify(scene.world);
    scene.command({ type: 'set-reduced-motion', reducedMotion: true }); scene.emitWorldEvents();
    expect(camera.shake).not.toHaveBeenCalled(); expect(events).toHaveBeenCalledExactlyOnceWith({ type: 'notice', message: '真实伤害仍然发生' });
    expect(JSON.stringify(scene.world)).toBe(before);
  });
});
