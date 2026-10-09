import { describe, expect, it } from "vitest";

import { createRateLimiter } from "./rate-limit.server";

describe("createRateLimiter", () => {
  it("allows the budget, then refuses until the window passes", () => {
    let now = 0;
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 2,
      now: () => now,
    });

    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(true);
    const refused = limiter.hit("a");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(1);

    expect(limiter.hit("b").allowed).toBe(true);

    now = 1000;
    expect(limiter.hit("a").allowed).toBe(true);
  });

  it("forgets a key on reset", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => 0 });

    limiter.hit("a");
    expect(limiter.hit("a").allowed).toBe(false);
    limiter.reset("a");
    expect(limiter.hit("a").allowed).toBe(true);
  });
});
