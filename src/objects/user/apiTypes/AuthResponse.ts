import type { UserProfile } from '../UserProfile';
export interface AuthResponse { token: string; expiresAt: string; user: UserProfile }
