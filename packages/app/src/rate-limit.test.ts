import { describe, expect, test } from "bun:test";

import { InMemoryRateLimiter, RateLimitError } from "./rate-limit";

describe("rate limits", () => {
  test("allows requests inside a fixed window and rejects over limit", () => {
    const limiter = new InMemoryRateLimiter();
    limiter.check({ key: "actor:user_1", limit: 2, windowMs: 60_000, now: 1_000 });
    limiter.check({ key: "actor:user_1", limit: 2, windowMs: 60_000, now: 2_000 });

    expect(() =>
      limiter.check({ key: "actor:user_1", limit: 2, windowMs: 60_000, now: 3_000 }),
    ).toThrow(RateLimitError);
  });

  test("resets after the window expires", () => {
    const limiter = new InMemoryRateLimiter();
    limiter.check({ key: "api:key_1", limit: 1, windowMs: 1_000, now: 1_000 });
    limiter.check({ key: "api:key_1", limit: 1, windowMs: 1_000, now: 2_001 });

    expect(() =>
      limiter.check({ key: "api:key_1", limit: 1, windowMs: 1_000, now: 2_500 }),
    ).toThrow("Rate limit exceeded");
  });
});
