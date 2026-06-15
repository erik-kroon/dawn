import { describe, expect, test } from "bun:test";

describe("public API contract", () => {
  test("publishes OpenAPI paths for public resources", async () => {
    process.env.DATABASE_URL ??= "postgres://test";
    process.env.BETTER_AUTH_SECRET ??= "abcdefghijklmnopqrstuvwxyz123456";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.POLAR_ACCESS_TOKEN ??= "test";
    process.env.POLAR_SUCCESS_URL ??= "http://localhost:3001/success";
    process.env.CORS_ORIGIN ??= "http://localhost:3001";

    const { publicApiOpenApiDocument } = await import(".");
    const document = publicApiOpenApiDocument("https://api.dawn.local/api/v1/openapi.json");

    expect(document.servers).toEqual([{ url: "https://api.dawn.local/api/v1" }]);
    expect(Object.keys(document.paths)).toEqual([
      "/transactions",
      "/bank-accounts",
      "/invoices",
      "/documents",
      "/documents/uploads",
      "/documents/{documentId}/download",
      "/inbox-items",
      "/inbox-items/{inboxItemId}/extraction-correction",
      "/inbox-matches/{suggestionId}/accept",
      "/inbox-matches/{suggestionId}/reject",
      "/customers",
      "/products",
      "/projects",
      "/time-entries",
      "/reports/overview",
      "/webhook-subscriptions",
    ]);
    expect(document.paths["/invoices"]).toMatchObject({
      post: { summary: "Create an invoice draft" },
    });
    expect(document.paths["/transactions"]).toMatchObject({
      get: {
        operationId: "listTransactions",
        summary: "List team transactions",
        "x-required-scope": "transactions.read",
        "x-idempotency": "none",
        responses: {
          "200": { description: "Team transaction list" },
        },
      },
      post: {
        operationId: "createTransaction",
        summary: "Create a ledger transaction",
        "x-required-scope": "transactions.write",
        "x-idempotency": "required",
        responses: {
          "201": { description: "Created ledger transaction" },
        },
      },
    });
    expect(document.paths["/bank-accounts"]).toMatchObject({
      get: {
        operationId: "listBankAccounts",
        summary: "List bank accounts and connections",
        "x-required-scope": "bank_accounts.read",
      },
    });
    expect(document.paths["/customers"]).toMatchObject({
      get: { summary: "List team customers and contacts", "x-required-scope": "customers.read" },
      post: { summary: "Create a customer", "x-required-scope": "customers.write" },
    });
    expect(document.paths["/products"]).toMatchObject({
      get: { summary: "List team products", "x-required-scope": "products.read" },
      post: { summary: "Create a product", "x-required-scope": "products.write" },
    });
    expect(document.paths["/documents/uploads"]).toMatchObject({
      post: { summary: "Create a signed document upload" },
    });
    expect(document.paths["/documents/{documentId}/download"]).toMatchObject({
      post: { summary: "Create a signed document download" },
    });
    expect(document.paths["/inbox-items/{inboxItemId}/extraction-correction"]).toMatchObject({
      post: { summary: "Correct extracted document fields", "x-required-scope": "inbox.write" },
    });
    expect(document.paths["/inbox-matches/{suggestionId}/accept"]).toMatchObject({
      post: { summary: "Accept an inbox transaction match", "x-required-scope": "inbox.write" },
    });
    expect(document.paths["/inbox-matches/{suggestionId}/reject"]).toMatchObject({
      post: { summary: "Reject an inbox transaction match", "x-required-scope": "inbox.write" },
    });
    expect(document.paths["/time-entries"]).toMatchObject({
      post: { summary: "Create a time entry", "x-required-scope": "time_entries.write" },
    });
    expect(document.paths["/reports/overview"]).toMatchObject({
      get: { summary: "Read business report overview", "x-required-scope": "reports.read" },
    });
    expect(document.components.securitySchemes.bearerApiKey).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });
});
