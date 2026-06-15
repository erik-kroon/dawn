import { describe, expect, test } from "bun:test";

import { signWebhookPayload, verifyWebhookSignature } from "./webhook-signature";

describe("webhook signatures", () => {
  test("verifies HMAC signatures with timestamp tolerance", async () => {
    const timestamp = "1781496000";
    const body = JSON.stringify({ type: "transaction.created", id: "outbox_1" });
    const signature = await signWebhookPayload({
      secret: "whsec_test",
      timestamp,
      body,
    });

    await expect(
      verifyWebhookSignature({
        secret: "whsec_test",
        timestamp,
        body,
        signature,
        now: new Date(1781496000 * 1_000),
      }),
    ).resolves.toBe(true);
  });

  test("rejects tampered payloads and stale timestamps", async () => {
    const timestamp = "1781496000";
    const signature = await signWebhookPayload({
      secret: "whsec_test",
      timestamp,
      body: '{"ok":true}',
    });

    await expect(
      verifyWebhookSignature({
        secret: "whsec_test",
        timestamp,
        body: '{"ok":false}',
        signature,
        now: new Date(1781496000 * 1_000),
      }),
    ).resolves.toBe(false);
    await expect(
      verifyWebhookSignature({
        secret: "whsec_test",
        timestamp,
        body: '{"ok":true}',
        signature,
        now: new Date((1781496000 + 301) * 1_000),
      }),
    ).resolves.toBe(false);
  });
});
