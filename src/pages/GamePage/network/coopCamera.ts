import { PLAYER_IDS, type CoopWorldState } from '../game/coop/model';
import { PLAYER_HEIGHT, PLAYER_WIDTH, type Vec2 } from '../game/entities/model';
import { clamp } from '../game/systems/geometry';
import { stepCamera, type CameraPoint } from '../game/systems/cameraFrame';

const viewport = { width: 640, height: 360, left: 12, right: 12, top: 48, bottom: 22 } as const;
const halfWidth = PLAYER_WIDTH / 2, halfHeight = PLAYER_HEIGHT / 2;
const bounds = (actors: readonly Vec2[]) => ({
  left: Math.min(...actors.map(actor => actor.x)) - halfWidth,
  right: Math.max(...actors.map(actor => actor.x)) + halfWidth,
  top: Math.min(...actors.map(actor => actor.y)) - halfHeight,
  bottom: Math.max(...actors.map(actor => actor.y)) + halfHeight,
});

/** One camera for the team. A distant casualty never drags the survivor out of view. */
export function coopCameraTarget(state: CoopWorldState, previous: CameraPoint | null = null, deltaMs = 0, snap = false): CameraPoint {
  const { chapter, boss, omega, mode } = state.shared;
  const active = PLAYER_IDS.filter(id => state.players[id].state === 'active' && state.players[id].hp > 0);
  let actors: Vec2[] = active.map(id => state.players[id].actor);
  if (!actors.length) actors = PLAYER_IDS.filter(id => state.players[id].state === 'downed').map(id => state.players[id].actor);
  if (!actors.length) actors = [state.players[state.hostPlayerId].actor];
  const quietRoom = !!omega && (omega.phase === 'chamber' || omega.phase === 'reveal')
    && active.length > 0 && active.every(id => state.players[id].actor.x >= chapter.arena.x + 16);
  const locked = boss.active || mode === 'finished' || quietRoom;
  const minX = locked ? chapter.arena.x : 0, minY = locked ? chapter.arena.y : 0;
  const maxX = locked ? Math.min(chapter.width - viewport.width, chapter.arena.x + Math.max(0, chapter.arena.w - viewport.width)) : Math.max(0, chapter.width - viewport.width);
  const maxY = locked ? Math.min(chapter.height - viewport.height, chapter.arena.y + Math.max(0, chapter.arena.h - viewport.height)) : Math.max(0, chapter.height - viewport.height);
  const containRange = (subjects: readonly Vec2[]) => {
    const body = bounds(subjects);
    return { left: Math.max(minX, body.right - viewport.width + viewport.right), right: Math.min(maxX, body.left - viewport.left),
      top: Math.max(minY, body.bottom - viewport.height + viewport.bottom), bottom: Math.min(maxY, body.top - viewport.top) };
  };
  if (active.length === 1) {
    const downed = PLAYER_IDS.filter(id => state.players[id].state === 'downed').map(id => state.players[id].actor);
    if (downed.length) {
      const candidate = [...actors, ...downed], range = containRange(candidate);
      if (range.left <= range.right && range.top <= range.bottom) actors = candidate;
    }
  }
  const body = bounds(actors);
  const centerX = (viewport.left + viewport.width - viewport.right) / 2;
  const centerY = (viewport.top + viewport.height - viewport.bottom) / 2;
  const target = { x: clamp((body.left + body.right) / 2 - centerX, minX, maxX),
    y: clamp((body.top + body.bottom) / 2 - centerY, minY, maxY) };
  const smoothed = previous ? stepCamera(previous, target, deltaMs, snap) : target;
  const range = containRange(actors);
  // Clamp the smoothed position too: fast jumps must not outrun camera easing at the 240px boundary.
  // When the world/arena edge or an actual fall/Q makes containment impossible, retain legal framing.
  return { x: clamp(smoothed.x, range.left <= range.right ? range.left : minX, range.left <= range.right ? range.right : maxX),
    y: clamp(smoothed.y, range.top <= range.bottom ? range.top : minY, range.top <= range.bottom ? range.bottom : maxY) };
}
