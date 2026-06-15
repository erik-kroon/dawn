import { describe, expect, test } from "bun:test";

import { redactServerLogValue, requestIdFromHeaders } from "./observability";

describe("server observability helpers", () => {
  test("extracts caller request IDs or generates one", () => {
    expect(requestIdFromHeaders(new Headers({ "x-request-id": "request_1" }))).toBe("request_1");
    expect(requestIdFromHeaders(new Headers())).toHaveLength(36);
  });

  test("redacts secrets and PII from structured log payloads", () => {
    expect(
      redactServerLogValue({
        authorization: "Bearer token123",
        nested: {
          email: "owner@example.com",
          note: "failed with sk_live_secret123456 for owner@example.com",
        },
      }),
    ).toEqual({
      authorization: "[redacted]",
      nested: {
        email: "[redacted]",
        note: "failed with [redacted-token] for [redacted-email]",
      },
    });
  });
});
