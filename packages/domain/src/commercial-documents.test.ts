import { describe, expect, test } from "bun:test";

import {
  assertCanEditCommercialDocument,
  assertCanFinalizeCommercialDocument,
  buildCommercialDocumentVersionSnapshot,
  calculateCommercialDocumentTotals,
  canonicalCommercialDocumentVersionPayload,
  normalizeCommercialDocumentDraftInput,
  type CommercialDocumentWithLines,
} from "./commercial-documents";

describe("commercial document domain", () => {
  test("calculates deterministic quote totals with line discounts and VAT", () => {
    const calculated = calculateCommercialDocumentTotals({
      currency: "SEK",
      lines: [
        {
          source: "freeform",
          description: "Implementation",
          quantityMilli: 2_000,
          unitPrice: { amountMinor: 10_000, currency: "SEK" },
          discountBasisPoints: 1_000,
          vatRateBasisPoints: 2_500,
        },
        {
          source: "fortnox_article",
          provider: "fortnox",
          providerObjectId: "SUPPORT",
          articleNumber: "SUPPORT",
          description: "Support",
          quantityMilli: 500,
          unitPrice: { amountMinor: 20_000, currency: "SEK" },
          vatRateBasisPoints: 2_500,
          snapshot: {
            providerObjectId: "SUPPORT",
            sourcePayload: { Description: "Changed later" },
          },
        },
      ],
    });

    expect(calculated.lines[0]?.subtotal).toEqual({ amountMinor: 20_000, currency: "SEK" });
    expect(calculated.lines[0]?.discount).toEqual({ amountMinor: 2_000, currency: "SEK" });
    expect(calculated.lines[0]?.vat).toEqual({ amountMinor: 4_500, currency: "SEK" });
    expect(calculated.lines[1]?.subtotal).toEqual({ amountMinor: 10_000, currency: "SEK" });
    expect(calculated.lines[1]?.vat).toEqual({ amountMinor: 2_500, currency: "SEK" });
    expect(calculated.totals).toEqual({
      subtotal: { amountMinor: 30_000, currency: "SEK" },
      discount: { amountMinor: 2_000, currency: "SEK" },
      vat: { amountMinor: 7_000, currency: "SEK" },
      total: { amountMinor: 35_000, currency: "SEK" },
    });
  });

  test("normalizes commercial document drafts and validates article references", () => {
    const normalized = normalizeCommercialDocumentDraftInput({
      teamId: " team_1 ",
      accountId: " account_1 ",
      opportunityId: " opp_1 ",
      documentType: "quote",
      title: " Quote ",
      currency: "sek",
      validUntil: "2026-07-01T00:00:00.000Z",
      paymentTerms: " 30 dagar ",
      termsVersion: " 2026.1 ",
      recipientEmail: " Buyer@Example.com ",
      lines: [
        {
          source: "fortnox_article",
          provider: "fortnox",
          providerObjectId: " KONSULT ",
          description: " Consulting ",
          quantityMilli: 1_000,
          unitPrice: { amountMinor: 12_500, currency: "SEK" },
        },
      ],
    });

    expect(normalized).toMatchObject({
      teamId: "team_1",
      accountId: "account_1",
      opportunityId: "opp_1",
      currency: "SEK",
      paymentTerms: "30 dagar",
      termsVersion: "2026.1",
      recipientEmail: "buyer@example.com",
    });
    expect(normalized.lines[0]).toMatchObject({
      providerObjectId: "KONSULT",
      discountBasisPoints: 0,
      vatRateBasisPoints: 0,
    });

    expect(() =>
      normalizeCommercialDocumentDraftInput({
        ...normalized,
        lines: [
          {
            source: "fortnox_article",
            description: "Missing article",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 1_000, currency: "SEK" },
          },
        ],
      }),
    ).toThrow("Fortnox article line requires a provider object id");
  });

  test("builds canonical immutable version payloads independent of object key order", () => {
    const document: CommercialDocumentWithLines = {
      id: "doc_1",
      teamId: "team_1",
      accountId: "account_1",
      opportunityId: "opp_1",
      documentType: "quote",
      title: "Quote 1",
      status: "draft",
      currency: "SEK",
      validUntil: "2026-07-01T00:00:00.000Z",
      paymentTerms: "30 dagar",
      termsVersion: "2026.1",
      templateId: null,
      recipientEmail: "buyer@example.com",
      scope: "Scope",
      activeVersionId: null,
      recipientAccessTokenHash: null,
      recipientAccessTokenExpiresAt: null,
      sentAt: null,
      viewedAt: null,
      declinedAt: null,
      declineReason: null,
      createdByActorId: "user_1",
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
      totals: {
        subtotal: { amountMinor: 1_000, currency: "SEK" },
        discount: { amountMinor: 0, currency: "SEK" },
        vat: { amountMinor: 250, currency: "SEK" },
        total: { amountMinor: 1_250, currency: "SEK" },
      },
      lines: [
        {
          id: "line_1",
          teamId: "team_1",
          documentId: "doc_1",
          sortOrder: 0,
          source: "fortnox_article",
          provider: "fortnox",
          providerConnectionId: "conn_1",
          providerObjectId: "KONSULT",
          providerObjectRecordId: "po_1",
          articleNumber: "KONSULT",
          description: "Consulting",
          unit: "h",
          quantityMilli: 1_000,
          unitPrice: { amountMinor: 1_000, currency: "SEK" },
          discountBasisPoints: 0,
          vatRateBasisPoints: 2_500,
          snapshot: { b: 2, a: 1 },
          totals: {
            subtotal: { amountMinor: 1_000, currency: "SEK" },
            discount: { amountMinor: 0, currency: "SEK" },
            vat: { amountMinor: 250, currency: "SEK" },
            total: { amountMinor: 1_250, currency: "SEK" },
          },
          createdAt: "2026-06-20T00:00:00.000Z",
        },
      ],
    };
    const first = buildCommercialDocumentVersionSnapshot({ document, versionNumber: 1 });
    const second = buildCommercialDocumentVersionSnapshot({
      document: {
        ...document,
        lines: [{ ...document.lines[0]!, snapshot: { a: 1, b: 2 } }],
      },
      versionNumber: 1,
    });

    expect(canonicalCommercialDocumentVersionPayload(first)).toEqual(
      canonicalCommercialDocumentVersionPayload(second),
    );
  });

  test("only draft positive-total commercial documents can be finalized", () => {
    const document = {
      status: "finalised",
    } as const;

    expect(() => assertCanEditCommercialDocument(document)).toThrow(
      "Only draft commercial documents can be edited",
    );

    expect(() =>
      assertCanFinalizeCommercialDocument({
        ...document,
        status: "draft",
        totals: {
          subtotal: { amountMinor: 0, currency: "SEK" },
          discount: { amountMinor: 0, currency: "SEK" },
          vat: { amountMinor: 0, currency: "SEK" },
          total: { amountMinor: 0, currency: "SEK" },
        },
      } as CommercialDocumentWithLines),
    ).toThrow("Commercial document total must be positive before finalising");
  });
});
