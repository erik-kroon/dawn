import { describe, expect, test } from "bun:test";
import { RateLimitError } from "@dawn/app/rate-limit";

import { assistantRouteRateLimiter, enforceAssistantRateLimit } from "./rate-limit";

describe("API route rate limits", () => {
  test("limits assistant requests per actor and team", () => {
    assistantRouteRateLimiter.reset();

    for (let index = 0; index < 30; index += 1) {
      enforceAssistantRateLimit({ actorId: "user_1", teamId: "team_1", now: 1_000 });
    }

    expect(() =>
      enforceAssistantRateLimit({ actorId: "user_1", teamId: "team_1", now: 1_000 }),
    ).toThrow(RateLimitError);
    expect(() =>
      enforceAssistantRateLimit({ actorId: "user_1", teamId: "team_2", now: 1_000 }),
    ).not.toThrow();
  });
});
