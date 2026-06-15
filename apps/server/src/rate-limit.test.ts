import { describe, expect, test } from "bun:test";
import { RateLimitError } from "@dawn/app/rate-limit";

import { enforcePublicApiRateLimit, publicApiRateLimiter } from "./rate-limit";

describe("public API rate limits", () => {
  test("limits public API requests by API token", () => {
    publicApiRateLimiter.reset();
    const headers = new Headers({ authorization: "Bearer dawn_test_token" });

    for (let index = 0; index < 120; index += 1) {
      enforcePublicApiRateLimit({ headers, path: "/api/v1/transactions", now: 1_000 });
    }

    expect(() =>
      enforcePublicApiRateLimit({ headers, path: "/api/v1/invoices", now: 1_000 }),
    ).toThrow(RateLimitError);
  });
});
