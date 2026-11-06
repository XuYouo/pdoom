import type { Platform } from '../entities/model';

/** The rule strip remains3px; only presentation coordinates may be snapped. */
export function platformRuleCue(platform: Readonly<Pick<Platform, 'x' | 'y' | 'w'>>, native: boolean) {
  return [native ? Math.round(platform.x) : platform.x, native ? Math.round(platform.y) : platform.y, platform.w, 3] as const;
}
