import { apiName, type APIMessage } from './APIMessage';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const REQUEST_TIMEOUT_MS = 10000;
const unavailable = '服务暂时不可用，请稍后重试。';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function httpError(status: number, body: unknown): ApiError {
  const requestId = record(body) && typeof body.requestId === 'string' && /^[a-f0-9-]{36}$/i.test(body.requestId)
    ? body.requestId : undefined;
  // Never render an upstream/internal 5xx diagnostic, even if a proxy returns JSON.
  if (status < 500 && record(body) && typeof body.code === 'string' && /^[a-z_]{1,64}$/.test(body.code)
      && typeof body.message === 'string' && body.message.length <= 512) {
    return new ApiError(status, body.code, body.message, requestId);
  }
  return new ApiError(status, 'server_error', unavailable, requestId);
}

export async function sendAPI<Response>(message: APIMessage<Response>, options: { token?: string; signal?: AbortSignal } = {}): Promise<Response> {
  if (message.authenticated && !options.token) throw new ApiError(401, 'unauthorized', '请先登录以使用云端功能。');
  if (options.signal?.aborted) throw new ApiError(0, 'cancelled', '请求已取消。');
  const payload = Object.fromEntries(Object.entries(message).filter(([key]) => !['action', 'authenticated', 'validateResponse'].includes(key)));
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const result = await fetch(`/api/${apiName(message.action)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body: unknown = await result.json().catch(() => null);
    if (controller.signal.aborted) throw new ApiError(0, 'cancelled', '请求已取消。');
    if (!result.ok) throw httpError(result.status, body);
    if (!message.validateResponse(body)) throw new ApiError(502, 'invalid_response', '云端响应不符合数据契约；未确认成功，也未覆盖本地数据。');
    return body;
  } catch (error) {
    if (timedOut) throw new ApiError(0, 'timeout', '云端请求超过 10 秒。结果尚未确认，可以使用相同数据重试。');
    if (options.signal?.aborted) throw new ApiError(0, 'cancelled', '请求已取消。');
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'network_error', '无法连接云端。结果尚未确认；本地游戏不受影响，可以重试。');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
