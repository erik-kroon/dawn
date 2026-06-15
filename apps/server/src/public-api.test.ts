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
      "/invoices",
      "/documents",
      "/documents/uploads",
      "/documents/{documentId}/download",
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
    expect(document.paths["/customers"]).toMatchObject({
      get: { summary: "List team customers and contacts" },
      post: { summary: "Create a customer" },
    });
    expect(document.paths["/products"]).toMatchObject({
      get: { summary: "List team products" },
      post: { summary: "Create a product" },
    });
    expect(document.paths["/documents/uploads"]).toMatchObject({
      post: { summary: "Create a signed document upload" },
    });
    expect(document.paths["/documents/{documentId}/download"]).toMatchObject({
      post: { summary: "Create a signed document download" },
    });
    expect(document.paths["/reports/overview"]).toMatchObject({
      get: { summary: "Read business report overview" },
    });
    expect(document.components.securitySchemes.bearerApiKey).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });
});
