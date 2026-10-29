import { afterEach, describe, expect, it, vi } from 'vitest';
import { GetCurrentUserAPI } from '../../src/apis/user/GetCurrentUserAPI';
import { RegisterUserAPI } from '../../src/apis/user/RegisterUserAPI';
import { LoginUserAPI } from '../../src/apis/user/LoginUserAPI';
import { LogoutUserAPI } from '../../src/apis/user/LogoutUserAPI';
import { LoadGameAPI } from '../../src/apis/game/LoadGameAPI';
import { SaveGameAPI } from '../../src/apis/game/SaveGameAPI';
import { SubmitScoreAPI } from '../../src/apis/game/SubmitScoreAPI';
import { ListLeaderboardAPI } from '../../src/apis/game/ListLeaderboardAPI';
import type { APIMessage } from '../../src/system/api/APIMessage';
import { ApiError, sendAPI } from '../../src/system/api/sendAPI';
import { SESSION_KEY, clearAuthSession, readAuthSession, storeAuthSession, subscribeAuthSession } from '../../src/system/api/authToken';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { buildScoreSubmission } from '../../src/pages/GamePage/hooks/useScoreSubmission';
import { isGameSave } from '../../src/objects/game/validation';

const id = '8d5a4ccb-a1b1-44c2-bd20-9e503de02211';
const otherId = '9e5a4ccb-a1b1-44c2-bd20-9e503de02222';
const token = 'a'.repeat(43);
const now = Date.parse('2026-10-27T00:00:00Z');
const auth = { token, expiresAt: '2035-10-27T00:00:00Z', user: { id, username: 'tester_1' } };
const save = { ...createRun(id, 42), elapsedMs: 1500, score: 1234 };
const scoreResult = { scoreId: otherId, personalBest: true };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const makeScore = () => new SubmitScoreAPI(id, 1234, 1, 1500, 8, 'defeat');
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('typed API transport', () => {
  const validResponses: [APIMessage<unknown>, unknown][] = [
    [new RegisterUserAPI('tester_1', 'fixture-password'), auth],
    [new LoginUserAPI('tester_1', 'fixture-password'), auth],
    [new LogoutUserAPI(), { loggedOut: true }],
    [new GetCurrentUserAPI(), { user: auth.user }],
    [new LoadGameAPI(), { save: null, revision: 0, updatedAt: null }],
    [new LoadGameAPI(), { save, revision: 1, updatedAt: '2026-10-27T00:00:00.123456Z' }],
    [new SaveGameAPI(save, 0), { revision: 1, updatedAt: '2026-10-27T00:00:00Z' }],
    [makeScore(), scoreResult],
    [new ListLeaderboardAPI(), { entries: [{ rank: 1, username: 'tester_1', score: 1234, stage: 1, doom: 8, ending: 'defeat', createdAt: '2026-10-27T00:00:00Z' }], nextOffset: null }],
  ];

  it.each(validResponses)('accepts the declared valid response for %o', async (message, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(expected)));
    await expect(sendAPI(message, { token })).resolves.toEqual(expected);
  });

  const invalidResponses: [APIMessage<unknown>, unknown][] = [
    [new RegisterUserAPI('tester_1', 'fixture-password'), { ...auth, user: { username: 'tester_1' } }],
    [new LoginUserAPI('tester_1', 'fixture-password'), { ...auth, token: 'not-a-token' }],
    [new LoginUserAPI('tester_1', 'fixture-password'), { ...auth, expiresAt: 'tomorrow' }],
    [new LogoutUserAPI(), { loggedOut: false }],
    [new GetCurrentUserAPI(), { user: { ...auth.user, id: 'forged' } }],
    [new LoadGameAPI(), { save: null, revision: 3, updatedAt: null }],
    [new LoadGameAPI(), { save: { ...save, schemaVersion: 2 }, revision: 1, updatedAt: '2026-10-27T00:00:00Z' }],
    [new SaveGameAPI(save, 0), { revision: 1.5, updatedAt: '2026-10-27T00:00:00Z' }],
    [new SaveGameAPI(save, 0), { revision: 1, updatedAt: 'invalid' }],
    [makeScore(), { scoreId: id, personalBest: 'true' }],
    [makeScore(), { scoreId: 'fake', personalBest: true }],
    [new ListLeaderboardAPI(), { entries: [], nextOffset: -1 }],
    [new ListLeaderboardAPI(), { entries: [{ rank: 1, username: 'tester_1', score: 5, stage: 1, doom: 8, ending: 'foom', createdAt: '2026-10-27T00:00:00Z' }], nextOffset: null }],
  ];
  it.each(invalidResponses)('rejects a malformed 200 response for %o', async (message, invalid) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(invalid)));
    await expect(sendAPI(message, { token })).rejects.toMatchObject({ status: 502, code: 'invalid_response' });
  });

  it('sends exactly six score fields and puts the token only in the Authorization header', async () => {
    const fetch = vi.fn().mockResolvedValue(json(scoreResult)); vi.stubGlobal('fetch', fetch);
    await sendAPI(makeScore(), { token });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/submitscoreapi');
    expect(JSON.parse(init.body)).toEqual({ runId: id, score: 1234, stage: 1, durationMs: 1500, doom: 8, ending: 'defeat' });
    expect(init.body).not.toContain(token);
    expect(init.body).not.toContain('validateResponse');
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
  });

  it('never calls fetch for an unauthenticated protected action', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(sendAPI(makeScore())).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('redacts unknown upstream 500 details and preserves safe typed 409 errors', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ code: 'internal_error', message: 'SELECT password_hash; secret-token' }, 500))
      .mockResolvedValueOnce(json({ code: 'conflict', message: 'runId already has a different result.', requestId: id }, 409));
    vi.stubGlobal('fetch', fetch);
    await expect(sendAPI(makeScore(), { token })).rejects.toMatchObject({ status: 500, code: 'server_error', message: '服务暂时不可用，请稍后重试。' });
    await expect(sendAPI(makeScore(), { token })).rejects.toMatchObject({ status: 409, code: 'conflict', requestId: id });
  });

  it('rejects non-JSON success without trusting a cast', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{not-json', { status: 200 })));
    await expect(sendAPI(makeScore(), { token })).rejects.toBeInstanceOf(ApiError);
  });

  it('keeps a 10s deadline even when an external AbortSignal is supplied', async () => {
    vi.useFakeTimers();
    const external = new AbortController();
    const remove = vi.spyOn(external.signal, 'removeEventListener');
    vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })));
    const pending = expect(sendAPI(makeScore(), { token, signal: external.signal })).rejects.toMatchObject({ status: 0, code: 'timeout' });
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(external.signal.aborted).toBe(false);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('distinguishes user cancellation and always clears its deadline', async () => {
    vi.useFakeTimers();
    const external = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })));
    const pending = expect(sendAPI(makeScore(), { token, signal: external.signal })).rejects.toMatchObject({ code: 'cancelled' });
    external.abort(); await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start an already cancelled request', async () => {
    const external = new AbortController(); external.abort();
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(sendAPI(makeScore(), { token, signal: external.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps byte-identical payloads across network retry instead of minting a new runId', async () => {
    const ended = { save: { ...save }, ending: 'defeat' as const };
    const message = buildScoreSubmission(ended);
    ended.save.score = 9999; ended.save.elapsedMs = 9000; ended.save.runId = otherId;
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('private network implementation detail')).mockResolvedValueOnce(json(scoreResult));
    vi.stubGlobal('fetch', fetch);
    await expect(sendAPI(message, { token })).rejects.toMatchObject({ code: 'network_error' });
    await expect(sendAPI(message, { token })).resolves.toEqual(scoreResult);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ runId: id, score: 1234, durationMs: 1500 });
    expect(Object.isFrozen(message)).toBe(true);
  });

  it('rejects very short or inconsistent results rather than inventing valid server data', () => {
    expect(() => buildScoreSubmission({ save: { ...save, elapsedMs: 999 }, ending: 'defeat' })).toThrow('不足 1 秒');
    expect(() => buildScoreSubmission({ save, ending: 'foom' })).toThrow('不一致');
    expect(() => buildScoreSubmission({ save: { ...save, score: -1 }, ending: 'defeat' })).toThrow('v1');
    expect(isGameSave(save)).toBe(true);
  });
});

describe('session boundary', () => {
  it('validates complete sessions and persists only token, expiry and explicit profile fields', () => {
    const storage = memory();
    expect(storeAuthSession({ ...auth, password: 'MUST_NOT_PERSIST' } as typeof auth, storage, now)).toBe(true);
    const raw = storage.getItem(SESSION_KEY)!;
    expect(raw).not.toContain('MUST_NOT_PERSIST');
    expect(JSON.parse(raw)).toEqual(auth);
    expect(readAuthSession(storage, now)).toEqual(auth);
  });

  it.each(['{bad-json', JSON.stringify({ ...auth, user: {} }), JSON.stringify({ ...auth, expiresAt: '2000-01-01T00:00:00Z' }), JSON.stringify({ token })])('drops malformed or expired storage', raw => {
    const storage = memory(); storage.setItem(SESSION_KEY, raw);
    expect(readAuthSession(storage, now)).toBeNull();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('does not let a late 401 clear a newer login', () => {
    const storage = memory(); const next = { ...auth, token: 'b'.repeat(43) };
    storeAuthSession(next, storage, now);
    expect(clearAuthSession(token, storage)).toBe(false);
    expect(readAuthSession(storage, now)).toEqual(next);
    expect(clearAuthSession(next.token, storage)).toBe(true);
    expect(readAuthSession(storage, now)).toBeNull();
  });

  it('keeps local play safe when storage is unavailable and rejects already expired login data', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(readAuthSession(blocked, now)).toBeNull();
    expect(storeAuthSession(auth, blocked, now)).toBe(false);
    expect(clearAuthSession(undefined, blocked)).toBe(false);
    expect(() => storeAuthSession({ ...auth, expiresAt: '2000-01-01T00:00:00Z' }, memory(), now)).toThrow();
  });

  it('notifies same-page consumers without sensitive event payloads and unsubscribes cleanly', () => {
    const storage = memory(); const target = Object.assign(new EventTarget(), { sessionStorage: storage });
    vi.stubGlobal('window', target);
    const listener = vi.fn(); const unsubscribe = subscribeAuthSession(listener);
    const events: Event[] = [];
    target.addEventListener('pdoom:session-changed', event => events.push(event));
    storeAuthSession(auth, storage, now); clearAuthSession(undefined, storage);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(events.every(event => Reflect.get(event, 'detail') === undefined && !JSON.stringify(event).includes(token))).toBe(true);
    unsubscribe(); storeAuthSession(auth, storage, now);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
