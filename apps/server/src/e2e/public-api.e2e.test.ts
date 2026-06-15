import { describe, expect, test } from "bun:test";

const baseUrl = process.env.DAWN_E2E_BASE_URL?.replace(/\/+$/, "") ?? null;
const apiKey = process.env.DAWN_E2E_API_KEY ?? null;
const teamId = process.env.DAWN_E2E_TEAM_ID ?? null;
const disposableTeamId = process.env.DAWN_E2E_DISPOSABLE_TEAM_ID ?? null;
const allowWrites = process.env.DAWN_E2E_ALLOW_WRITES === "true";

if (!baseUrl) {
  console.warn("Skipping live E2E tests: set DAWN_E2E_BASE_URL to a running Dawn server.");
} else if (!apiKey || !teamId) {
  console.warn("Skipping credentialed live E2E tests: set DAWN_E2E_API_KEY and DAWN_E2E_TEAM_ID.");
}

if (baseUrl && (!allowWrites || !disposableTeamId)) {
  console.warn(
    "Skipping write live E2E tests: set DAWN_E2E_ALLOW_WRITES=true and DAWN_E2E_DISPOSABLE_TEAM_ID.",
  );
}

const describeWithBaseUrl = baseUrl ? describe : describe.skip;
const describeWithCredentials = baseUrl && apiKey && teamId ? describe : describe.skip;
const describeWithDisposableWrites =
  baseUrl && apiKey && allowWrites && disposableTeamId ? describe : describe.skip;

describeWithBaseUrl("live Dawn HTTP smoke", () => {
  test("serves health and OpenAPI over HTTP", async () => {
    const health = await fetchWithRateLimitRetry("/");
    const openApi = await fetchWithRateLimitRetry("/api/v1/openapi.json");
    const document = await openApi.json();

    expect(health.status).toBe(200);
    expect(await health.text()).toBe("OK");
    expect(openApi.status).toBe(200);
    expect(document).toMatchObject({
      openapi: "3.1.0",
      paths: {
        "/transactions": expect.any(Object),
        "/invoices": expect.any(Object),
      },
    });
  });

  test("returns a typed error for unauthenticated public API reads", async () => {
    const response = await fetchWithRateLimitRetry(
      `/api/v1/transactions?teamId=${encodeURIComponent(teamId ?? "missing_team")}`,
    );
    const body = (await response.json()) as PublicApiErrorResponse;

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Missing API key" });
  });

  test("returns a typed error when idempotency is missing on writes", async () => {
    const response = await fetchWithRateLimitRetry("/api/v1/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamId: teamId ?? "missing_team",
        accountId: "acct_e2e",
        description: "E2E idempotency check",
        postedAt: "2026-06-15T00:00:00.000Z",
        money: { amountMinor: -100, currency: "USD" },
      }),
    });
    const body = (await response.json()) as PublicApiErrorResponse;

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: "Idempotency-Key header is required" });
  });
});

describeWithCredentials("live Dawn credentialed public API smoke", () => {
  test("lists team transactions through the public API", async () => {
    const response = await fetchWithRateLimitRetry(
      `/api/v1/transactions?teamId=${encodeURIComponent(teamId!)}`,
      { headers: apiHeaders() },
    );
    const body = (await response.json()) as { data?: unknown };

    expect(response.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describeWithDisposableWrites("live Dawn disposable write smoke", () => {
  test("creates a customer idempotently inside a disposable tenant", async () => {
    const suffix = crypto.randomUUID();
    const idempotencyKey = `e2e:customer:${suffix}`;
    const payload = {
      teamId: disposableTeamId!,
      name: `E2E Customer ${suffix}`,
      email: `e2e+${suffix}@example.test`,
      contactName: "E2E Contact",
      contactEmail: `contact+${suffix}@example.test`,
      contactRole: "Test contact",
    };

    const created = await fetchWithRateLimitRetry("/api/v1/customers", {
      method: "POST",
      headers: apiHeaders({ "idempotency-key": idempotencyKey }),
      body: JSON.stringify(payload),
    });
    const replayed = await fetchWithRateLimitRetry("/api/v1/customers", {
      method: "POST",
      headers: apiHeaders({ "idempotency-key": idempotencyKey }),
      body: JSON.stringify(payload),
    });
    const createdBody = (await created.json()) as PublicApiCustomerResponse;
    const replayedBody = (await replayed.json()) as PublicApiCustomerResponse;

    expect(created.status).toBe(201);
    expect(replayed.status).toBe(201);
    expect(replayedBody.customer.id).toBe(createdBody.customer.id);
    expect(createdBody.customer.name).toBe(payload.name);
  });
});

function apiHeaders(extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "x-request-id": `e2e-${crypto.randomUUID()}`,
    ...extra,
  };
}

type PublicApiCustomerResponse = {
  customer: {
    id: string;
    name: string;
  };
};

type PublicApiErrorResponse = {
  error: string;
};

async function fetchWithRateLimitRetry(path: string, init: RequestInit = {}) {
  if (!baseUrl) {
    throw new Error("DAWN_E2E_BASE_URL is required");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(new URL(path, baseUrl), init);

    if (response.status !== 429 || attempt === 2) {
      return response;
    }

    const retryAfterSeconds = Number(response.headers.get("retry-after") ?? 1);
    await Bun.sleep(Math.max(1, retryAfterSeconds) * 1000);
  }

  throw new Error("Unreachable E2E retry state");
}
