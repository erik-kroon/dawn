import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";

import { RecipientSigningPage, stateLabel, type RecipientSigningSurface } from "./signing-surface";
import "./index.css";

const baseSurface: RecipientSigningSurface = {
  access: {
    tokenExpiresAt: "2099-08-20T00:00:00.000Z",
  },
  customer: {
    legalName: "Buyer AB",
    organizationNumber: "556987-6543",
  },
  document: {
    currency: "SEK",
    documentType: "quote",
    paymentTerms: "30 days",
    pdfSha256: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    recipientEmail: "buyer@example.com",
    signingIntent: "Genom att signera bekräftar du avsikten att ingå detta åtagande.",
    status: "viewed",
    termsVersion: "terms-2026-06",
    title: "Implementation quote",
    total: { amountMinor: 1250000, currency: "SEK" },
    validUntil: "2026-07-20",
    versionNumber: 2,
  },
  pdf: {
    bodyBase64: "JVBERi0xLjQK",
    byteSize: 9,
    contentType: "application/pdf",
    fileName: "quote-doc-v2.pdf",
    sha256: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  },
  receipt: null,
  sender: {
    legalName: "Seller AB",
    organizationNumber: "556123-4567",
  },
  signature: {
    completedAt: null,
    expiresAt: null,
    provider: "tic",
    signingUrl: null,
    status: null,
  },
  state: "ready",
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("recipient signing surface", () => {
  test("renders ready state with document metadata and signing action", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    document.body.append(container);

    flushSync(() => {
      root.render(<RecipientSigningPage pdfUrl="about:blank" surface={baseSurface} />);
    });

    expect(container.textContent).toContain("Implementation quote");
    expect(container.textContent).toContain("Seller AB");
    expect(container.textContent).toContain("Buyer AB");
    expect(container.textContent).toContain("SEK 12");
    expect(container.textContent).toContain("Start BankID signing");
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe("about:blank");

    root.unmount();
  });

  test("renders signed state with evidence and download actions", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    document.body.append(container);

    flushSync(() => {
      root.render(
        <RecipientSigningPage
          pdfUrl="about:blank"
          surface={{
            ...baseSurface,
            receipt: {
              downloads: [
                {
                  contentType: "application/pdf",
                  fileName: "quote-doc-v2.pdf",
                  kind: "signed_pdf",
                },
                {
                  contentType: "application/json",
                  fileName: "quote-2-receipt.json",
                  kind: "evidence_receipt",
                },
              ],
              evidence: [
                {
                  documentPdfSha256:
                    "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                  evidenceObjectKey: "signatures/team_1/evidence.json",
                  signedAt: "2026-06-20T12:00:00.000Z",
                  signerEmail: "buyer@example.com",
                  signerName: "Ada Buyer",
                  signerPersonalNumberMasked: "********1234",
                  verificationStatus: "verified",
                },
              ],
              signatureRequestId: "sig_1",
              signedAt: "2026-06-20T12:00:00.000Z",
            },
            signature: {
              ...baseSurface.signature,
              completedAt: "2026-06-20T12:00:00.000Z",
              status: "completed",
            },
            state: "signed",
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Signed receipt");
    expect(container.textContent).toContain("Ada Buyer");
    expect(container.textContent).toContain("Verified");
    expect(container.textContent).toContain("Signed PDF");
    expect(container.textContent).toContain("Evidence receipt");

    root.unmount();
  });

  test("has human-readable labels for every signing state", () => {
    expect(["ready", "pending", "failed", "expired", "declined", "signed"].map(stateLabel)).toEqual(
      ["Ready", "Pending", "Failed", "Expired", "Declined", "Signed"],
    );
  });
});
