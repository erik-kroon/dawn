import { describe, expect, test } from "bun:test";

import { createMockIntegrationProviders } from "./index";

describe("integration provider contracts", () => {
  test("declares capabilities for accounting, payments, messaging, and email adapters", async () => {
    const providers = createMockIntegrationProviders();

    expect(providers.map((provider) => [provider.category, provider.provider])).toEqual([
      ["accounting", "mock-accounting"],
      ["payments", "mock-payments"],
      ["messaging", "mock-messaging"],
      ["email", "mock-email"],
    ]);
    expect(providers.every((provider) => provider.capabilities.includes("connect"))).toBe(true);
    expect(providers.every((provider) => provider.capabilities.includes("disable"))).toBe(true);
  });

  test("returns encrypted token metadata instead of raw provider secrets", async () => {
    const provider = createMockIntegrationProviders()[0]!;
    const connection = await provider.connect({
      teamId: "team_1",
      actorId: "user_1",
      idempotencyKey: "connect_1",
    });

    expect(connection.token.encryptedToken).toStartWith("mockkms:");
    expect(connection.token.encryptedToken).not.toContain("mock_secret");
    expect(connection.token.keyId).toBe("mock-kms-local");
    expect(connection.token.lastFour).toHaveLength(4);
  });
});
