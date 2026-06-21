import { describe, expect, test } from "bun:test";

import { assertTrustAllowsInvoice, deriveTrustCheckResult } from "./trust";

describe("trust domain rules", () => {
  test("derives pass only from active matching role evidence", () => {
    expect(
      deriveTrustCheckResult({
        providerStatus: "completed",
        expectedOrganizationNumber: "556123-4567",
        companyRegistrationNumber: "5561234567",
        companyStatus: "Aktiv",
        roleEvidence: [
          {
            positionType: "signatory",
            positionDescription: "Firmatecknare",
            positionStart: null,
            positionEnd: null,
          },
        ],
      }),
    ).toEqual({ status: "pass", resultReason: "active_company_role_match" });
  });

  test("keeps failed and partial enrichment out of pass state", () => {
    expect(
      deriveTrustCheckResult({
        providerStatus: "partially_completed",
        expectedOrganizationNumber: "5561234567",
        companyRegistrationNumber: "5561234567",
        companyStatus: "Aktiv",
        roleEvidence: [
          {
            positionType: "signatory",
            positionDescription: "Firmatecknare",
            positionStart: null,
            positionEnd: null,
          },
        ],
      }),
    ).toEqual({ status: "unavailable", resultReason: "partially_completed" });
  });

  test("blocking policy requires pass or reviewer approval before invoice handoff", () => {
    expect(() =>
      assertTrustAllowsInvoice({ policyMode: "blocking", status: "needs_review" }),
    ).toThrow("Trust check approval is required before invoice creation");

    expect(() =>
      assertTrustAllowsInvoice({ policyMode: "blocking", status: "approved" }),
    ).not.toThrow();
  });
});
