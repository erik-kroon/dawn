import { describe, expect, test } from "bun:test";

import { resolveCorsOrigin } from "./cors";

describe("server CORS origin resolution", () => {
  test("allows the configured origin", () => {
    expect(
      resolveCorsOrigin({
        origin: "https://app.example.com",
        configuredOrigin: "https://app.example.com",
      }),
    ).toBe("https://app.example.com");
  });

  test("allows localhost fallback ports only when configured origin is local", () => {
    expect(
      resolveCorsOrigin({
        origin: "http://localhost:3002",
        configuredOrigin: "http://localhost:3001",
      }),
    ).toBe("http://localhost:3002");
    expect(
      resolveCorsOrigin({
        origin: "http://localhost:3002",
        configuredOrigin: "https://app.example.com",
      }),
    ).toBeNull();
  });
});
