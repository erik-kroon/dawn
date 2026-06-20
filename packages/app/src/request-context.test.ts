import { describe, expect, test } from "bun:test";

import {
  AppError,
  assertAppRequestTeam,
  resolveAppRequest,
  resolveScopedActorAppRequest,
  resolveSessionAppRequest,
  resolveSystemAppRequest,
} from "./index";

describe("app request intake", () => {
  test("normalizes session user requests with stable defaults", () => {
    expect(
      resolveSessionAppRequest({
        user: { id: "user_1", email: "owner@example.com" },
        requestId: " request_1 ",
        teamId: " team_1 ",
      }),
    ).toEqual({
      actor: { id: "user_1", type: "user", email: "owner@example.com" },
      source: "session",
      requestId: "request_1",
      correlationId: "request_1",
      principalId: "user_1",
      teamId: "team_1",
      locale: "en-US",
      timezone: "UTC",
      idempotencyKey: undefined,
      session: {
        userId: "user_1",
        email: "owner@example.com",
      },
      membership: undefined,
    });
  });

  test("normalizes scoped API actors and idempotency metadata", () => {
    expect(
      resolveScopedActorAppRequest({
        source: "api_key",
        actor: {
          id: "api_key_1",
          type: "api_key",
          teamId: "team_1",
          permissions: ["transactions.read"],
        },
        requestId: "request_1",
        teamId: "team_1",
        idempotencyKey: " idem_1 ",
        locale: "sv-SE",
        timezone: "Europe/Stockholm",
      }),
    ).toMatchObject({
      actor: {
        id: "api_key_1",
        type: "api_key",
        teamId: "team_1",
        permissions: ["transactions.read"],
      },
      source: "api_key",
      requestId: "request_1",
      correlationId: "request_1",
      principalId: "api_key_1",
      teamId: "team_1",
      locale: "sv-SE",
      timezone: "Europe/Stockholm",
      idempotencyKey: "idem_1",
    });
  });

  test("normalizes system job requests", () => {
    expect(
      resolveSystemAppRequest({
        actorId: "system:bank-sync",
        requestId: "bank:sync:outbox_1",
        teamId: "team_1",
      }),
    ).toMatchObject({
      actor: { id: "system:bank-sync", type: "system" },
      source: "system_job",
      requestId: "bank:sync:outbox_1",
      correlationId: "bank:sync:outbox_1",
      principalId: "system:bank-sync",
      teamId: "team_1",
    });
  });

  test("creates request IDs when adapters do not provide one", () => {
    const request = resolveAppRequest({
      actor: { id: "provider:sandbox-bank", type: "provider_webhook" },
      source: "provider_webhook",
    });

    expect(typeof request.requestId).toBe("string");
    expect(request.requestId.length).toBeGreaterThan(0);
  });

  test("centralizes team mismatch behavior", () => {
    expect(() =>
      assertAppRequestTeam(
        {
          actor: { id: "user_1", type: "user" },
          requestId: "request_1",
          teamId: "team_1",
        },
        "team_2",
        "Team not found",
      ),
    ).toThrow(AppError);
  });
});
