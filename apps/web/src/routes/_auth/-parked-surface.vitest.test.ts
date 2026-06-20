import { afterEach, describe, expect, test } from "vitest";

afterEach(() => {
  delete process.env.SKIP_ENV_VALIDATION;
});

describe("parked product surfaces", () => {
  test("stay hidden unless the explicit web flag is enabled", async () => {
    process.env.SKIP_ENV_VALIDATION = "1";
    const { parkedSurfacesEnabled } = await import("./-parked-surface");

    expect(parkedSurfacesEnabled()).toBe(false);
    expect(parkedSurfacesEnabled("0")).toBe(false);
    expect(parkedSurfacesEnabled("false")).toBe(false);
    expect(parkedSurfacesEnabled("1")).toBe(true);
    expect(parkedSurfacesEnabled("true")).toBe(true);
  });
});
