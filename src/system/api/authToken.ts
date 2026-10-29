import type { AuthResponse } from '../../objects/user/apiTypes/AuthResponse';
import { isAuthResponse } from '../../objects/user/apiTypes/validation';

export const SESSION_KEY = 'pdoom.session.v1';
const SESSION_CHANGED = 'pdoom:session-changed';
export type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storageOrNull(): SessionStorage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}
function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_CHANGED));
}
function publicSession(value: AuthResponse): AuthResponse {
  // Persist only these explicit fields. Unexpected server fields (including a password) never survive.
  return { token: value.token, expiresAt: value.expiresAt, user: { id: value.user.id, username: value.user.username } };
}

/** Call from effects/event handlers, never render. Storage is untrusted; only the server authenticates tokens. */
export function readAuthSession(storage: SessionStorage | null = storageOrNull(), now = Date.now()): AuthResponse | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (isAuthResponse(value) && Date.parse(value.expiresAt) > now) return publicSession(value);
  } catch { /* Malformed/blocked storage does not establish a session. */ }
  try { storage.removeItem(SESSION_KEY); } catch { /* Storage is optional for local play. */ }
  return null;
}

/** Returns whether this browser can retain the session; no module-level mutable fallback or password cache. */
export function storeAuthSession(value: AuthResponse, storage: SessionStorage | null = storageOrNull(), now = Date.now()): boolean {
  if (!isAuthResponse(value) || Date.parse(value.expiresAt) <= now) throw new Error('服务器会话无效或已过期。');
  if (!storage) return false;
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(publicSession(value)));
    notify();
    return true;
  } catch { return false; }
}

/** expectedToken prevents a late 401 from deleting a newer login. */
export function clearAuthSession(expectedToken?: string, storage: SessionStorage | null = storageOrNull()): boolean {
  if (!storage) return false;
  const current = readAuthSession(storage);
  if (expectedToken && current && current.token !== expectedToken) return false;
  try { storage.removeItem(SESSION_KEY); notify(); return true; } catch { return false; }
}

/** Same-document and same-tab iframe changes carry no token/profile in their notification payload. */
export function subscribeAuthSession(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const storageChanged = (event: StorageEvent) => { if (event.key === SESSION_KEY || event.key === null) listener(); };
  window.addEventListener(SESSION_CHANGED, listener);
  window.addEventListener('storage', storageChanged);
  window.addEventListener('focus', listener);
  return () => {
    window.removeEventListener(SESSION_CHANGED, listener);
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener('focus', listener);
  };
}
