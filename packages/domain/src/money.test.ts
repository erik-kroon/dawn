import { describe, expect, test } from "bun:test";

import {
  addMoney,
  assertBalancedSplits,
  assertValidMoney,
  currencyMinorUnitDigits,
  formatMoney,
  negateMoney,
  subtractMoney,
  sumMoney,
} from "./index";

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

  test("adds and subtracts exact minor units in the same currency", () => {
    expect(
      addMoney({ amountMinor: 1200, currency: "USD" }, { amountMinor: -250, currency: "USD" }),
    ).toEqual({
      amountMinor: 950,
      currency: "USD",
    });
    expect(
      subtractMoney({ amountMinor: 1200, currency: "USD" }, { amountMinor: 250, currency: "USD" }),
    ).toEqual({
      amountMinor: 950,
      currency: "USD",
    });
    expect(negateMoney({ amountMinor: -250, currency: "USD" })).toEqual({
      amountMinor: 250,
      currency: "USD",
    });
  });

  test("rejects arithmetic across currencies", () => {
    expect(() =>
      addMoney({ amountMinor: 1200, currency: "USD" }, { amountMinor: 1200, currency: "EUR" }),
    ).toThrow("Money currency mismatch");
  });

  test("sums money and validates split totals", () => {
    expect(
      sumMoney(
        [
          { amountMinor: -700, currency: "USD" },
          { amountMinor: -500, currency: "USD" },
        ],
        "USD",
      ),
    ).toEqual({ amountMinor: -1200, currency: "USD" });

    expect(() =>
      assertBalancedSplits({ amountMinor: -1200, currency: "USD" }, [
        { money: { amountMinor: -700, currency: "USD" } },
        { money: { amountMinor: -499, currency: "USD" } },
      ]),
    ).toThrow("Transaction splits must equal the transaction amount");
  });
});
