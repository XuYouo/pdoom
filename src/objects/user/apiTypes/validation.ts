import type { UserProfile } from '../UserProfile';
import type { AuthResponse } from './AuthResponse';
import type { GetCurrentUserResponse } from './GetCurrentUserResponse';
import type { LogoutUserResponse } from './LogoutUserResponse';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const instant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value) && Number.isFinite(Date.parse(value));

export function isUserProfile(value: unknown): value is UserProfile {
  return record(value) && uuid(value.id) && typeof value.username === 'string' && /^[A-Za-z0-9_]{3,32}$/.test(value.username);
}
export function isAuthResponse(value: unknown): value is AuthResponse {
  return record(value) && typeof value.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.token)
    && instant(value.expiresAt) && isUserProfile(value.user);
}
export function isGetCurrentUserResponse(value: unknown): value is GetCurrentUserResponse {
  return record(value) && isUserProfile(value.user);
}
export function isLogoutUserResponse(value: unknown): value is LogoutUserResponse {
  return record(value) && value.loggedOut === true;
}
