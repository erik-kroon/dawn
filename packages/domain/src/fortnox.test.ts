import { describe, expect, test } from "bun:test";

import {
  fortnoxProviderObjectKey,
  normalizeFortnoxArticleNumber,
  normalizeFortnoxCustomerNumber,
  normalizeSwedishOrganizationNumber,
} from "./fortnox";

describe("Fortnox domain helpers", () => {
  test("normalizes Fortnox customer and article identifiers without changing provider identity", () => {
    expect(normalizeFortnoxCustomerNumber(" 1001 ")).toBe("1001");
    expect(normalizeFortnoxArticleNumber(" konsult-01 ")).toBe("konsult-01");
    expect(
      fortnoxProviderObjectKey({ providerObjectType: "customer", providerObjectId: " 1001 " }),
    ).toBe("fortnox:customer:1001");
  });

  test("normalizes Swedish organization numbers for matching", () => {
    expect(normalizeSwedishOrganizationNumber("556677-8899")).toBe("5566778899");
    expect(normalizeSwedishOrganizationNumber("556 677 8899")).toBe("5566778899");
  });

  test("rejects blank Fortnox identifiers and invalid organization numbers", () => {
    expect(() => normalizeFortnoxCustomerNumber(" ")).toThrow(
      "Fortnox customer number is required",
    );
    expect(() => normalizeSwedishOrganizationNumber("556677")).toThrow(
      "Swedish organization number must contain 10 digits",
    );
  });
});
