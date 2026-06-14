import { describe, expect, test } from "bun:test";

import { assertValidMoney, currencyMinorUnitDigits, formatMoney } from "./index";

describe("money", () => {
  test("formats minor units without floating point division", () => {
    expect(formatMoney({ amountMinor: -1200, currency: "USD" })).toBe("-USD 12.00");
    expect(formatMoney({ amountMinor: 120034, currency: "USD" })).toBe("USD 1,200.34");
  });

  test("uses ISO currency minor unit metadata", () => {
    expect(currencyMinorUnitDigits("JPY")).toBe(0);
    expect(formatMoney({ amountMinor: 1200, currency: "JPY" })).toBe("JPY 1,200");
  });

  test("rejects unsafe integer money amounts", () => {
    expect(() =>
      assertValidMoney({ amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "USD" }),
    ).toThrow("Money amount must use safe integer minor units");
  });
});
