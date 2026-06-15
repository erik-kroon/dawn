export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

export type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
};

export class InMemoryRateLimiter {
  private readonly records = new Map<string, RateLimitRecord>();

  check(input: RateLimitInput) {
    const now = input.now ?? Date.now();
    const existing = this.records.get(input.key);

    if (!existing || existing.resetAt <= now) {
      this.records.set(input.key, {
        count: 1,
        resetAt: now + input.windowMs,
      });
      return;
    }

    if (existing.count >= input.limit) {
      throw new RateLimitError(
        "Rate limit exceeded",
        Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
      );
    }

    existing.count += 1;
  }

  reset() {
    this.records.clear();
  }
}
