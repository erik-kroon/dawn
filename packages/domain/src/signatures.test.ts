import { describe, expect, test } from "bun:test";
import type {
  Account,
  CommercialDocumentVersion,
  CommercialDocumentWithLines,
  LegalEntity,
  Opportunity,
  Organization,
} from "./index";
import {
  assertCanStartSignatureRequest,
  assertSignatureEvidenceMatchesVersion,
  buildSignatureHiddenSignedData,
  buildTicBankIdVisibleSigningText,
  canonicalSignatureHiddenSignedData,
} from "./signatures";

describe("signature domain", () => {
  test("builds deterministic hidden signed data with document, deal, signer and lineage", () => {
    const hidden = buildSignatureHiddenSignedData({
      provider: "tic",
      document,
      version,
      account,
      customer,
      opportunity,
      seller,
      signer: { name: "Ada Lovelace", email: "ADA@EXAMPLE.COM" },
      fortnoxCustomerMapping: {
        provider: "fortnox",
        connectionId: "conn_1",
        providerCustomerId: "1001",
      },
    });
    const reordered = {
      ...hidden,
      document: { ...hidden.document },
      signer: { ...hidden.signer },
    };

    expect(hidden.signer.email).toBe("ada@example.com");
    expect(hidden.marketOrigin).toMatchObject({ prospectId: "prospect_1" });
    expect(canonicalSignatureHiddenSignedData(hidden)).toBe(
      canonicalSignatureHiddenSignedData(reordered),
    );
  });

  test("creates visible BankID text with commercial signing context", () => {
    const hidden = buildSignatureHiddenSignedData({
      provider: "tic",
      document,
      version,
      account,
      customer,
      opportunity,
      seller,
      signer: { name: "Ada Lovelace", email: "ada@example.com" },
    });
    const text = buildTicBankIdVisibleSigningText({ hiddenSignedData: hidden });

    expect(text).toContain("offert Quote 1 version 1");
    expect(text).toContain("Säljare: Seller AB");
    expect(text).toContain("Kund: Customer AB");
    expect(text).toContain("Total: 1250.00 SEK");
    expect(text).toContain("Villkor: terms-2026-06");
    expect(text).toContain("bekräftar du avsikten");
  });

  test("rejects invalid signature start states and hash mismatches", () => {
    expect(() =>
      assertCanStartSignatureRequest({
        document,
        version,
        now: new Date("2026-06-20T10:00:00.000Z"),
      }),
    ).not.toThrow();

    expect(() =>
      assertCanStartSignatureRequest({
        document: { ...document, status: "draft" },
        version,
      }),
    ).toThrow("Document state cannot start signing");

    expect(() =>
      assertCanStartSignatureRequest({
        document: { ...document, status: "declined" },
        version,
      }),
    ).toThrow("Document state cannot start signing");

    expect(() =>
      assertCanStartSignatureRequest({
        document: { ...document, status: "voided" },
        version,
      }),
    ).toThrow("Document state cannot start signing");

    expect(() =>
      assertCanStartSignatureRequest({
        document,
        version,
        now: new Date("2026-07-21T00:00:00.000Z"),
      }),
    ).toThrow("Expired documents cannot start signing");

    expect(() =>
      assertCanStartSignatureRequest({
        document,
        version: { ...version, status: "superseded" },
      }),
    ).toThrow("Superseded or voided");

    expect(() =>
      assertSignatureEvidenceMatchesVersion({
        evidenceDocumentPdfSha256: "other",
        version,
      }),
    ).toThrow("Signed document hash");
  });
});

const document: CommercialDocumentWithLines = {
  id: "doc_1",
  teamId: "team_1",
  accountId: "account_1",
  opportunityId: "opp_1",
  documentType: "quote",
  title: "Quote 1",
  status: "finalised",
  currency: "SEK",
  validUntil: "2026-07-20T00:00:00.000Z",
  paymentTerms: "30 dagar",
  termsVersion: "terms-2026-06",
  templateId: null,
  recipientEmail: "ada@example.com",
  scope: null,
  marketOrigin: {
    companyId: "company_1",
    companySnapshotId: "snapshot_1",
    prospectId: "prospect_1",
    sourceGoalId: "goal_1",
    sourceRunId: "run_1",
    icpId: "icp_1",
    segmentId: "segment_1",
    sourceProvider: "tic",
    sourceProviderCapability: "company_profile",
    sourceDecisionSummary: "Fit",
  },
  activeVersionId: "version_1",
  recipientAccessTokenHash: null,
  recipientAccessTokenExpiresAt: null,
  sentAt: null,
  viewedAt: null,
  declinedAt: null,
  declineReason: null,
  createdByActorId: "user_1",
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
  lines: [],
  totals: {
    subtotal: { amountMinor: 100_000, currency: "SEK" },
    discount: { amountMinor: 0, currency: "SEK" },
    vat: { amountMinor: 25_000, currency: "SEK" },
    total: { amountMinor: 125_000, currency: "SEK" },
  },
};

const version: CommercialDocumentVersion = {
  id: "version_1",
  teamId: "team_1",
  documentId: "doc_1",
  versionNumber: 1,
  status: "finalised",
  snapshot: {
    schemaVersion: 1,
    documentId: "doc_1",
    teamId: "team_1",
    accountId: "account_1",
    opportunityId: "opp_1",
    documentType: "quote",
    title: "Quote 1",
    versionNumber: 1,
    currency: "SEK",
    validUntil: "2026-07-20T00:00:00.000Z",
    paymentTerms: "30 dagar",
    termsVersion: "terms-2026-06",
    templateId: null,
    recipientEmail: "ada@example.com",
    scope: null,
    marketOrigin: document.marketOrigin,
    lines: [],
    totals: document.totals,
  },
  pdfObjectKey: "doc.pdf",
  pdfBodyBase64: Buffer.from("pdf").toString("base64"),
  pdfSha256: "pdf_hash",
  byteSize: 3,
  finalizedByActorId: "user_1",
  createdAt: "2026-06-20T00:00:00.000Z",
};

const account: Account = {
  recordId: "account_1",
  teamId: "team_1",
  legalEntityId: "seller_1",
  organizationId: "org_1",
  accountType: "customer",
  relationshipStatus: "active",
  lifecycleStage: "active",
  segment: null,
  territory: null,
  primaryOwnerPrincipalId: "user_1",
  customerSince: null,
  churnedAt: null,
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
};

const customer: Organization = {
  recordId: "org_1",
  teamId: "team_1",
  legalName: "Customer AB",
  displayName: null,
  organizationNumber: "5561234567",
  countryCode: "SE",
  vatNumber: null,
  websiteDomain: null,
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
};

const seller: Pick<LegalEntity, "legalName" | "organizationNumber"> = {
  legalName: "Seller AB",
  organizationNumber: "5599998888",
};

const opportunity: Opportunity = {
  recordId: "opp_1",
  teamId: "team_1",
  accountId: "account_1",
  name: "Pilot",
  amountMinor: 125_000,
  currencyCode: "SEK",
  status: "open",
  stage: "proposal_sent",
  expectedCloseDate: null,
  primaryOwnerPrincipalId: "user_1",
  wonAt: null,
  lostAt: null,
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
};
