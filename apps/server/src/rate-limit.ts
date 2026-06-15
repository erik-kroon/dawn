import { InMemoryRateLimiter } from "@dawn/app/rate-limit";

export const publicApiRateLimiter = new InMemoryRateLimiter();

export function enforcePublicApiRateLimit(input: { headers: Headers; path: string; now?: number }) {
  publicApiRateLimiter.check({
    key: publicApiRateLimitKey(input.headers, input.path),
    limit: 120,
    windowMs: 60_000,
    now: input.now,
  });
}

function publicApiRateLimitKey(headers: Headers, path: string) {
  const authorization = headers.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    return `public-api:${authorization.slice(0, 32)}`;
  }

  return `public-api:${headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for") ?? "anonymous"}:${path}`;
}
