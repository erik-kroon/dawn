import { describe, expect, test } from "bun:test";

import {
  assertMarketCompanyIdentityInvariant,
  canonicalMarketCompanyIdentityKey,
  normalizeMarketCompanySeed,
  normalizeMarketProspectLineage,
  stableStringify,
} from "./market";

describe("market origin domain", () => {
  test("normalizes Swedish company seeds into one canonical identity key", () => {
    const first = normalizeMarketCompanySeed({
      provider: "tic",
      providerCapability: "company_profile",
      retrievedAt: "2026-06-20T10:00:00.000Z",
      legalName: "  Acme AB  ",
      organizationNumber: "556123-4567",
      rawPayload: { b: 2, a: 1 },
    });
    const second = normalizeMarketCompanySeed({
      provider: "tic",
      providerCapability: "company_profile",
      legalName: "Acme AB",
      organizationNumber: "5561234567",
      rawPayload: { a: 1, b: 2 },
    });

    expect(first.normalizedFields).toMatchObject({
      legalName: "Acme AB",
      organizationNumber: "5561234567",
      countryCode: "SE",
    });
    expect(canonicalMarketCompanyIdentityKey(first.normalizedFields)).toBe("SE:5561234567");
    expect(canonicalMarketCompanyIdentityKey(second.normalizedFields)).toBe("SE:5561234567");
    expect(stableStringify(first.contentPayload)).toBe(stableStringify(second.contentPayload));
  });

  test("rejects invalid canonical market company identities", () => {
    expect(() =>
      assertMarketCompanyIdentityInvariant({
        countryCode: "SE",
        organizationNumber: "556123456",
        status: "active",
      }),
    ).toThrow("Swedish organization number must contain 10 digits");
    expect(() =>
      assertMarketCompanyIdentityInvariant({
        countryCode: "SE",
        organizationNumber: "5561234567",
        status: "inactive",
      }),
    ).toThrow("Only active canonical company identities");
  });

  test("normalizes prospect lineage without dropping source dimensions", () => {
    expect(
      normalizeMarketProspectLineage({
        sourceGoalId: " goal_1 ",
        sourceRunId: " run_1 ",
        icpId: " icp_1 ",
        segmentId: " segment_1 ",
        sourceProvider: " tic ",
        sourceProviderCapability: " company_profile ",
        sourceDecisionSummary: " Good ICP fit ",
      }),
    ).toEqual({
      sourceGoalId: "goal_1",
      sourceRunId: "run_1",
      icpId: "icp_1",
      segmentId: "segment_1",
      sourceProvider: "tic",
      sourceProviderCapability: "company_profile",
      sourceDecisionSummary: "Good ICP fit",
    });
  });
});
