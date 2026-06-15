import { describe, expect, test } from "bun:test";

import { appRequestFromSession } from "./context";

describe("api context request intake", () => {
  test("resolves session context into an app request", () => {
    const request = appRequestFromSession(
      {
        requestId: "request_1",
        session: {
          user: {
            id: "user_1",
            email: "owner@example.com",
          },
        },
      },
      {
        teamId: "team_1",
        idempotencyKey: "idem_1",
      },
    );

    expect(request).toMatchObject({
      actor: { id: "user_1", type: "user", email: "owner@example.com" },
      source: "session",
      requestId: "request_1",
      teamId: "team_1",
      idempotencyKey: "idem_1",
      locale: "en-US",
      timezone: "UTC",
    });
  });
});
