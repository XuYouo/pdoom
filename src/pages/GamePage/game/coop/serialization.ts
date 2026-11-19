import { RELIC_IDS } from '../../../../objects/game/GameSaveData';
import { isGameSave } from '../../../../objects/game/validation';
import { getChapter } from '../data/chapters';
import { decodeCheckpoint, isCompletedSave, isSupportedCheckpoint } from '../data/checkpoints';
import { type CoopWorldState } from './model';

type Check = (value: unknown) => boolean;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const number = (min = -1e9, max = 1e9, integer = false): Check => v => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v));
const n = number(), time = number(0), count = number(0, 1e9, true), hp = number(0, 100), bool: Check = v => typeof v === 'boolean';
const text: Check = v => typeof v === 'string' && v.length <= 500;
const one = (...values: unknown[]): Check => v => values.includes(v);
const nullable = (check: Check): Check => v => v === null || check(v);
const list = (check: Check, max: number, min = 0): Check => v => Array.isArray(v) && v.length >= min && v.length <= max && v.every(check);
const shape = (required: Record<string, Check>, optional: Record<string, Check> = {}): Check => v => record(v) &&
  Object.entries(required).every(([key, check]) => has(v, key) && check(v[key])) &&
  Object.keys(v).every(key => has(required, key) || (has(optional, key) && (v[key] === undefined || optional[key](v[key]))));
const dictionary = (check: Check, max: number, allowed?: readonly string[]): Check => v => record(v) && Object.keys(v).length <= max &&
  Object.entries(v).every(([key, value]) => key.length <= 120 && (!allowed || allowed.includes(key)) && check(value));
const playerId = one('p1', 'p2'), direction = one(-1, 1), action = one('shots', 'dashes', 'rewinds', 'insights');
const kinds = ['dictionary', 'echo', 'caption', 'impact', 'dialogue', 'knife', 'gpu', 'causal', 'void', 'mirror'] as const;
const vec = { x: n, y: n }, rect = { ...vec, w: number(0), h: number(0) };
const counts = shape({ shots: count, dashes: count, rewinds: count, insights: count });
const history = shape({ ...vec, at: time, vx: n, vy: n, facing: direction });
const historyList = list(history, 512, 1);
const rewind = nullable(shape({ path: historyList, startedAt: time, durationMs: number(0.001, 10000) }));
const player = shape({ ...vec, vx: n, vy: n, facing: direction, grounded: bool, rootedBy: nullable(count), standingOn: nullable(text), petrifiedUntil: time,
  coyoteUntil: time, jumpUntil: time, dashUntil: time, dashReadyAt: time, shotReadyAt: time, invulnerableUntil: time, rewindReadyAt: time,
  lastFiredAt: nullable(time), insightUntil: time, insightReadyAt: time, invertedUntil: time, immunity: dictionary(time, kinds.length, kinds), criticalCharges: count });
const behavior = shape({ runId: text, seed: number(1, 2147483647, true), observedAt: time, counts, source: one('observed', 'counts-only'),
  recent: list(shape({ action, at: time }), 48), combos: list(shape({ actions: list(action, 3, 2), uses: count, lastAt: time }), 48) });
const run: Check = v => record(v) && time(v.elapsedMs) && isGameSave({ ...v, elapsedMs: Math.floor(v.elapsedMs as number), hp: 100, actionCounts: { shots: 0, dashes: 0, rewinds: 0, insights: 0 } }) &&
  isSupportedCheckpoint(v as unknown as Parameters<typeof isSupportedCheckpoint>[0]) && !has(v, 'hp') && !has(v, 'actionCounts') && Object.keys(v).length === 12;
const coopPlayer = shape({ actor: player, hp, state: one('active', 'downed', 'waiting'), history: historyList, rewind, behavior, actionCounts: counts,
  reviveProgressMs: number(0, 2000), laserUntil: nullable(time), laserHit: bool, laserAbsorbed: bool, scanAt: nullable(time), turnStartX: nullable(n) });
const platform = { id: text, ...rect };
const platformOptions = { oneWay: bool, fragile: bool, protected: bool };
const factory = nullable(shape({ seaY: n, riseSpeed: number(0), nextProbeId: count, nextBubbleId: count, nextReplicateAt: time,
  probes: list(shape({ ...vec, id: count, hp: number(0), targetPlatformId: nullable(text), phase: one('seek', 'tell', 'consume'), phaseUntil: time }), 6),
  bubbles: list(shape({ ...vec, id: count, hp: number(0), expiresAt: time, text }), 32) }));
const furnace = nullable(shape({ startedAt: time, enraged: bool,
  lifts: list(shape({ ...platform, minY: n, maxY: n, periodMs: number(0.001), offsetMs: n, dy: n }, platformOptions), 128),
  heatZones: list(shape({ id: text, ...rect, phase: one('cool', 'tell', 'active'), phaseUntil: time }), 128),
  laser: nullable(shape({ ...vec, length: number(0), halfHeight: number(0), facing: direction, phase: one('tell', 'active'), until: time, hitPlayer: bool, absorbedByRewind: bool })) }));
const loom = nullable(shape({ timeline: one(0, 1), rerollReadyAt: time, rerolls: count, hpUiTaken: bool, stemsLost: one(0, 1, 2, 3, 4), eaten: list(text, 128),
  nodes: list(shape({ ...platform, branch: one('hub', 'upper', 'lower', 'arena'), segment: count, next: list(text, 16), expanded: bool, collapseAt: nullable(time), collapsed: bool }, platformOptions), 256),
  lastReroll: nullable(shape({ at: time, from: shape(vec), to: shape(vec) })), swallow: nullable(shape({ ids: list(text, 128), at: time })), narrow: shape(rect), pullSpeed: n,
  turn: shape({ until: time, lineX: n, startX: nullable(n), successes: count, weakUntil: time }) }));
const profile = shape({ source: one('counts-only', 'observed', 'mixed'), dominant: action,
  frequencies: shape({ shots: number(0, 1), dashes: number(0, 1), rewinds: number(0, 1), insights: number(0, 1) }), combo: list(action, 3, 1),
  activeBuild: list(one(...RELIC_IDS), 7), suppressedBuild: list(one(...RELIC_IDS), 7), doom: hp, hallucinationEvery: nullable(one(4, 8)),
  damageMultiplier: number(0), defenseMultiplier: number(0), fireIntervalMs: number(0.001), rewindCooldownMs: number(0.001), insightDurationMs: number(0.001),
  insightCooldownMs: number(0.001), coreRadius: number(0), criticalMultiplier: number(0) });
const omega = nullable(shape({ phase: one('storm', 'chamber', 'reveal', 'duel', 'complete'), door: shape(rect), chair: shape(vec), glass: shape(rect), revealAt: nullable(time), revealUntil: time,
  stormZones: list(shape({ ...rect, id: text, phase: one('cool', 'tell', 'active'), phaseUntil: time, direction }), 128),
  mirror: shape({ actor: player, previous: shape(vec), history: historyList, rewind, traversal: list(history, 512), state: one('idle', 'tell', 'execute', 'recover'), until: time,
    plan: list(action, 3), index: count, action: nullable(action), actionBase: count, completedCombos: count, completedInPhase: count, executed: counts, profile, target: shape(vec),
    scan: nullable(shape({ rect: shape(rect), at: time, until: time, hit: bool })) }) }));
const shared = shape({ chapterStage: one(1, 2, 3, 4, 5), mode: one('ready', 'playing', 'rest', 'dead', 'cleared', 'finished', 'unavailable'), factory, furnace, loom, omega,
  rest: nullable(shape({ room: one(1, 2), message: text, evaluation: nullable(shape({ verdict: one('approved', 'disapproved'), nominalTokens: count, creditedTokens: count })) })),
  enemies: list(shape({ id: text, kind: one('parrot', 'repeater', 'deceiver', 'chinchilla'), ...vec, hp: number(0), homeX: n, homeY: n, phase: one('idle', 'tell', 'recover'), phaseUntil: time }), 256),
  boss: shape({ ...vec, kind: one('gato', 'sydney', 'basilisk', 'leviathan', 'mirror'), name: text, facing: direction, hp: number(0), maxHp: number(0.001), active: bool, phase: one(1, 2, 3), action: one('idle', 'tell', 'attack', 'recover'), actionUntil: time, targetX: n, volley: count, enteredAt: time }),
  bullets: list(shape({ ...vec, id: count, vx: n, vy: n, radius: number(0), damage: number(0), faction: one('player', 'enemy'), kind: one(...kinds), expiresAt: time }, { ownerPlayerId: playerId, critical: bool, harmless: bool, glyph: one('(', ')') }), 180),
  pickups: list(shape({ ...vec, id: text, kind: one('token', 'compute', 'mushroom', 'heal'), amount: number(0) }), 512),
  shocks: list(shape({ x: n, width: number(0), until: time }), 128), collapsed: list(text, 512), collapseAt: dictionary(time, 512), nextBulletId: count });
const checkpointPlayer = shape({ hp, actionCounts: counts, behavior });
const event: Check = v => record(v) && (
  shape({ type: one('notice'), message: text }, { playerId })(v) || shape({ type: one('impact'), strength: number(0, 1) }, { playerId })(v) ||
  shape({ type: one('checkpoint', 'defeat', 'rest-opened', 'rest-updated', 'rest-closed', 'context-changed') })(v) ||
  shape({ type: one('stage-cleared'), stage: one(1, 2, 3, 4) })(v) || shape({ type: one('victory'), ending: one('aligned', 'warden', 'foom') })(v));
const stateShape = shape({ version: one(1), tick: count, epoch: count, hostPlayerId: playerId, shared, run, players: shape({ p1: coopPlayer, p2: coopPlayer }),
  ready: shape({ p1: bool, p2: bool }), targetPlayerId: playerId, enemyTargets: dictionary(playerId, 256),
  checkpoint: shape({ run, players: shape({ p1: checkpointPlayer, p2: checkpointPlayer }) }), events: list(event, 128) });

// Rest encodings 11/21 precede closed marker 1; their numeric magnitude is not progress.
function checkpointProgress(run: CoopWorldState['run']): number {
  if (isCompletedSave(run)) return 9;
  const checkpoint = decodeCheckpoint(run.checkpoint);
  return checkpoint.room * 3 + (checkpoint.resting ? checkpoint.hackUsed ? 1 : 0 : 2);
}
function coherentProgress(state: CoopWorldState): boolean {
  const { run, checkpoint, shared } = state;
  if (state.hostPlayerId !== 'p1' || checkpoint.run.runId !== run.runId || checkpoint.run.seed !== run.seed || checkpoint.run.stage !== run.stage
    || checkpointProgress(checkpoint.run) > checkpointProgress(run) || checkpoint.run.elapsedMs > run.elapsedMs) return false;
  const point = decodeCheckpoint(run.checkpoint);
  if (shared.mode === 'rest') {
    if (!point.resting || !shared.rest || shared.rest.room !== point.room) return false;
  } else if (shared.rest !== null || point.resting) return false;
  if ((shared.mode === 'finished') !== isCompletedSave(run) || shared.mode === 'cleared' && run.checkpoint !== 0) return false;
  return Object.values(checkpoint.players).every(player => player.behavior.runId === run.runId && player.behavior.seed === run.seed);
}

const actions = ['shots', 'dashes', 'rewinds', 'insights'] as const;
const optionalBoolean = (value: unknown) => value === undefined ? 0 : value ? 2 : 1;

/** Lossless tuples and an interned sample table retain every sample and its exact numeric precision. */
function pack(value: unknown, samples: unknown[][], sampleIds: Map<string, number>, key = ''): unknown {
  if (Array.isArray(value)) {
    if (['history', 'path', 'traversal'].includes(key)) return value.map(s => {
      const tuple = [s.at, s.x, s.y, s.vx, s.vy, s.facing], signature = JSON.stringify(tuple);
      let id = sampleIds.get(signature);
      if (id === undefined) { id = samples.length; samples.push(tuple); sampleIds.set(signature, id); }
      return id;
    });
    if (key === 'bullets') return value.map(s => [s.id, s.x, s.y, s.vx, s.vy, s.radius, s.damage,
      s.faction === 'player' ? 0 : 1, kinds.indexOf(s.kind), s.expiresAt,
      s.ownerPlayerId === undefined ? 0 : s.ownerPlayerId === 'p1' ? 1 : 2,
      optionalBoolean(s.critical), optionalBoolean(s.harmless), s.glyph === undefined ? 0 : s.glyph === '(' ? 1 : 2]);
    if (key === 'recent') return value.map(s => [actions.indexOf(s.action), s.at]);
    if (key === 'combos') return value.map(s => [s.actions.map((a: typeof actions[number]) => actions.indexOf(a)), s.uses, s.lastAt]);
    return value.map(item => pack(item, samples, sampleIds));
  }
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, pack(item, samples, sampleIds, name)]));
  return value;
}
function unpack(value: unknown, samples: unknown[][], key = '', depth = 0): unknown {
  if (depth > 20) throw new Error('Snapshot nesting');
  if (Array.isArray(value)) {
    if (value.length > 512) throw new Error('Snapshot collection');
    if (['history', 'path', 'traversal'].includes(key)) return value.map(index => {
      if (!Number.isInteger(index) || index < 0 || index >= samples.length) throw new Error('History reference');
      const s = samples[index];
      // Each reference becomes a separate sample object; mutable histories never alias across players.
      return { at: s[0], x: s[1], y: s[2], vx: s[3], vy: s[4], facing: s[5] };
    });
    if (key === 'bullets') return value.map(s => {
      if (!Array.isArray(s) || s.length !== 14 || !one(0, 1)(s[7]) || !number(0, kinds.length - 1, true)(s[8]) ||
        !s.slice(10).every(one(0, 1, 2))) throw new Error('Bullet tuple');
      return { id: s[0], x: s[1], y: s[2], vx: s[3], vy: s[4], radius: s[5], damage: s[6], faction: s[7] === 0 ? 'player' : 'enemy',
        kind: kinds[s[8]], expiresAt: s[9], ...(s[10] ? { ownerPlayerId: s[10] === 1 ? 'p1' : 'p2' } : {}),
        ...(s[11] ? { critical: s[11] === 2 } : {}), ...(s[12] ? { harmless: s[12] === 2 } : {}), ...(s[13] ? { glyph: s[13] === 1 ? '(' : ')' } : {}) };
    });
    if (key === 'recent') return value.map(s => {
      if (!Array.isArray(s) || s.length !== 2 || !number(0, 3, true)(s[0])) throw new Error('Behavior tuple');
      return { action: actions[s[0]], at: s[1] };
    });
    if (key === 'combos') return value.map(s => {
      if (!Array.isArray(s) || s.length !== 3 || !list(number(0, 3, true), 3, 2)(s[0])) throw new Error('Combo tuple');
      return { actions: s[0].map((a: number) => actions[a]), uses: s[1], lastAt: s[2] };
    });
    return value.map(item => unpack(item, samples, '', depth + 1));
  }
  if (record(value)) {
    if (Object.keys(value).length > 512) throw new Error('Snapshot object');
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, unpack(item, samples, name, depth + 1)]));
  }
  return value;
}

export function serializeCoopWorld(state: CoopWorldState): Record<string, unknown> {
  const { chapter, ...runtime } = state.shared;
  const samples: unknown[][] = [];
  const data = pack({ ...state, shared: { ...runtime, chapterStage: chapter.stage } }, samples, new Map());
  // Timestamp/velocity values repeat across actors and adjacent samples; intern the numbers too.
  const numbers: unknown[] = [], numberIds = new Map<unknown, number>();
  const table = samples.map(sample => sample.map(value => {
    let index = numberIds.get(value);
    if (index === undefined) { index = numbers.length; numbers.push(value); numberIds.set(value, index); }
    return index;
  }));
  return { encoding: 'coop-tuples-v1', data, samples: table, numbers };
}
export function deserializeCoopWorld(payload: unknown): CoopWorldState | null {
  try {
    if (!record(payload) || payload.encoding !== 'coop-tuples-v1' || Object.keys(payload).length !== 4) return null;
    if (!Array.isArray(payload.numbers) || payload.numbers.length > 21504 || !payload.numbers.every(n) ||
      !Array.isArray(payload.samples) || payload.samples.length > 3584) return null;
    const numbers = payload.numbers;
    const samples = payload.samples.map(s => {
      if (!Array.isArray(s) || s.length !== 6 || !s.every(index => Number.isInteger(index) && index >= 0 && index < numbers.length)) throw new Error('Sample tuple');
      const tuple = s.map(index => numbers[index]);
      if (!history({ at: tuple[0], x: tuple[1], y: tuple[2], vx: tuple[3], vy: tuple[4], facing: tuple[5] })) throw new Error('Sample value');
      return tuple;
    });
    const data = unpack(payload.data, samples);
    if (!stateShape(data) || !record(data) || !record(data.shared)) return null;
    const chapter = getChapter(data.shared.chapterStage as number); if (!chapter) return null;
    const { chapterStage, ...runtime } = data.shared; void chapterStage;
    const state = { ...data, shared: { ...runtime, chapter } } as unknown as CoopWorldState;
    if (!coherentProgress(state)) return null;
    if (state.run.stage !== chapter.stage + (state.shared.mode === 'cleared' ? 1 : 0)) return null;
    if ((state.shared.factory !== null) !== (chapter.stage === 2) || (state.shared.furnace !== null) !== (chapter.stage === 3) ||
      (state.shared.loom !== null) !== (chapter.stage === 4) || (state.shared.omega !== null) !== (chapter.stage === 5)) return null;
    for (const id of ['p1', 'p2'] as const) {
      const p = state.players[id];
      if ((p.state === 'active') !== (p.hp > 0)) return null;
      if (p.history.some((sample, index) => index > 0 && sample.at < p.history[index - 1].at)) return null;
      if (p.rewind && p.rewind.path.some((sample, index) => index > 0 && sample.at < p.rewind!.path[index - 1].at)) return null;
      if (p.behavior.runId !== state.run.runId || p.behavior.seed !== state.run.seed) return null;
    }
    return state;
  } catch { return null; }
}
