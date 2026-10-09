import { singleton } from "~/utils/singleton.server";

/**
 * A fixed-window counter per key, held in this process's memory. The app runs
 * as a single Node process, so one counter per process is the whole picture;
 * a restart forgets the counts, which only ever errs towards letting people in.
 */
export interface RateLimiter {
  /** Counts one attempt; `allowed` is false once the window's budget is spent. */
  hit(key: string): { allowed: boolean; retryAfterSeconds: number };
  reset(key: string): void;
}

const MAX_TRACKED_KEYS = 10_000;

export function createRateLimiter({
  windowMs,
  max,
  now = Date.now,
}: {
  windowMs: number;
  max: number;
  now?: () => number;
}): RateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();

  function prune(at: number) {
    for (const [key, window] of windows) {
      if (at - window.startedAt >= windowMs) windows.delete(key);
    }
  }

  return {
    hit(key) {
      const at = now();
      let window = windows.get(key);
      if (!window || at - window.startedAt >= windowMs) {
        if (windows.size >= MAX_TRACKED_KEYS) prune(at);
        window = { startedAt: at, count: 0 };
        windows.set(key, window);
      }
      window.count += 1;
      return {
        allowed: window.count <= max,
        retryAfterSeconds: Math.ceil((window.startedAt + windowMs - at) / 1000),
      };
    },
    reset(key) {
      windows.delete(key);
    },
  };
}

const MINUTE = 60_000;

/** The shared limiters, one per kind of request they protect. */
export const rateLimiters = singleton("rate-limiters", () => ({
  loginByIp: createRateLimiter({ windowMs: 15 * MINUTE, max: 30 }),
  loginByEmail: createRateLimiter({ windowMs: 15 * MINUTE, max: 10 }),
  passwordMailByIp: createRateLimiter({ windowMs: 15 * MINUTE, max: 10 }),
  passwordMailByEmail: createRateLimiter({ windowMs: 60 * MINUTE, max: 3 }),
  dinnerSignupByIp: createRateLimiter({ windowMs: 10 * MINUTE, max: 10 }),
  pageViewByIp: createRateLimiter({ windowMs: MINUTE, max: 120 }),
}));

/** The IP or, when unknown, one shared bucket for every unknown caller. */
export function rateLimitKey(ip: string | null): string {
  return ip ?? "unknown-ip";
}
