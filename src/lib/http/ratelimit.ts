/**
 * Section 10.3. An in-process fixed-window counter. It is deliberately not a
 * distributed limiter: a single container is the deployment shape of Section
 * 23.8 path A, and behind several replicas this still cuts a credential-stuffing
 * run by the replica count while adding no infrastructure.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export function rateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds };
}

/** Drop windows that have lapsed, so the map cannot grow without bound. */
export function pruneRateLimits(now = Date.now()): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

/** Test seam. */
export function __resetRateLimits(): void {
  windows.clear();
}

/** Section 10.3: 10 sign-in attempts per 15 minutes, per IP and per email. */
export const SIGN_IN_LIMIT = 10;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
