import type {
  CommercialDocumentVersion,
  CommercialDocumentWithLines,
} from "./commercial-documents";
import type { Account, LegalEntity, Opportunity, Organization } from "./crm";
import type { MarketOriginLineage } from "./market";

export type SignatureProvider = "tic";

export type SignatureRequestStatus = "requested" | "signing" | "completed" | "failed" | "cancelled";

export type SignaturePartyStatus = "pending" | "signed" | "failed" | "cancelled";

export type SignatureEvidenceVerificationStatus = "verified" | "hash_mismatch" | "unverified";

export type SignatureSignerRole = "external_signer" | "internal_countersigner";

export type SignatureSignerInput = {
  name: string;
  email: string;
  role?: SignatureSignerRole | null;
};

export type SignatureSigner = {
  name: string;
  email: string;
  role: SignatureSignerRole;
};

export type SignatureFortnoxCustomerMapping = {
  provider: "fortnox";
  connectionId: string | null;
  providerCustomerId: string;
} | null;

export type SignatureHiddenSignedData = {
  schemaVersion: 1;
  provider: SignatureProvider;
  document: {
    id: string;
    type: CommercialDocumentWithLines["documentType"];
    title: string;
    versionId: string;
    versionNumber: number;
    pdfSha256: string;
    termsVersion: string;
    total: CommercialDocumentWithLines["totals"]["total"];
    validUntil: string | null;
  };
  deal: {
    opportunityId: string;
    stage: Opportunity["stage"];
  };
  account: {
    accountId: string;
    organizationId: string;
    customerLegalName: string;
    customerOrganizationNumber: string | null;
  };
  seller: {
    legalName: string;
    organizationNumber: string | null;
  };
  signer: SignatureSigner;
  fortnoxCustomerMapping: SignatureFortnoxCustomerMapping;
  marketOrigin: MarketOriginLineage | null;
};

export type SignatureRequest = {
  id: string;
  teamId: string;
  documentId: string;
  documentVersionId: string;
  provider: SignatureProvider;
  providerSessionId: string;
  status: SignatureRequestStatus;
  signingUrl: string | null;
  expiresAt: string | null;
  signingText: string;
  hiddenSignedData: SignatureHiddenSignedData;
  hiddenSignedDataHash: string;
  providerRawPayload: Record<string, unknown>;
  createdByActorId: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SignatureParty = {
  id: string;
  teamId: string;
  signatureRequestId: string;
  role: SignatureSignerRole;
  signingOrder: number;
  name: string;
  email: string;
  providerPartyId: string | null;
  status: SignaturePartyStatus;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SignatureEvidence = {
  id: string;
  teamId: string;
  signatureRequestId: string;
  signaturePartyId: string | null;
  provider: SignatureProvider;
  providerEventId: string;
  providerSessionId: string;
  signedAt: string;
  collectedAt: string;
  signerName: string;
  signerEmail: string | null;
  signerPersonalNumberMasked: string | null;
  documentPdfSha256: string;
  verificationStatus: SignatureEvidenceVerificationStatus;
  signatureValue: string | null;
  xmlDsig: string | null;
  ocspResponse: string | null;
  evidenceObjectKey: string | null;
  rawPayload: Record<string, unknown>;
  createdAt: string;
};

export function normalizeSignatureSigner(input: SignatureSignerInput): SignatureSigner {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const role = input.role ?? "external_signer";

  if (!name) {
    throw new Error("Signer name is required");
  }

  if (role !== "external_signer" && role !== "internal_countersigner") {
    throw new Error("Signer role is invalid");
  }

  return { name, email, role };
}

export function assertCanStartSignatureRequest(input: {
  document: CommercialDocumentWithLines;
  version: CommercialDocumentVersion;
  now?: Date;
}) {
  const { document, version } = input;

  if (version.documentId !== document.id || version.teamId !== document.teamId) {
    throw new Error("Signature version does not belong to document");
  }

  if (document.activeVersionId !== version.id) {
    throw new Error("Only the active finalised document version can be signed");
  }

  if (version.status !== "finalised") {
    throw new Error("Superseded or voided document versions cannot be signed");
  }

  if (!["finalised", "sent", "viewed"].includes(document.status)) {
    throw new Error("Document state cannot start signing");
  }

  if (document.validUntil) {
    const now = input.now ?? new Date();
    const validUntil = new Date(document.validUntil);

    if (now.getTime() >= validUntil.getTime()) {
      throw new Error("Expired documents cannot start signing");
    }
  }
}

export function buildSignatureHiddenSignedData(input: {
  provider: SignatureProvider;
  document: CommercialDocumentWithLines;
  version: CommercialDocumentVersion;
  account: Account;
  customer: Organization;
  opportunity: Opportunity;
  seller: Pick<LegalEntity, "legalName" | "organizationNumber">;
  signer: SignatureSignerInput;
  fortnoxCustomerMapping?: SignatureFortnoxCustomerMapping;
}): SignatureHiddenSignedData {
  const signer = normalizeSignatureSigner(input.signer);

  return {
    schemaVersion: 1,
    provider: input.provider,
    document: {
      id: input.document.id,
      type: input.document.documentType,
      title: input.document.title,
      versionId: input.version.id,
      versionNumber: input.version.versionNumber,
      pdfSha256: input.version.pdfSha256,
      termsVersion: input.document.termsVersion,
      total: input.document.totals.total,
      validUntil: input.document.validUntil,
    },
    deal: {
      opportunityId: input.opportunity.recordId,
      stage: input.opportunity.stage,
    },
    account: {
      accountId: input.account.recordId,
      organizationId: input.customer.recordId,
      customerLegalName: input.customer.legalName,
      customerOrganizationNumber: input.customer.organizationNumber,
    },
    seller: {
      legalName: input.seller.legalName,
      organizationNumber: input.seller.organizationNumber,
    },
    signer,
    fortnoxCustomerMapping: input.fortnoxCustomerMapping ?? null,
    marketOrigin: input.document.marketOrigin,
  };
}

export function buildTicBankIdVisibleSigningText(input: {
  hiddenSignedData: SignatureHiddenSignedData;
}) {
  const data = input.hiddenSignedData;
  const documentLabel = data.document.type === "contract" ? "avtal" : "offert";
  const validity = data.document.validUntil
    ? `Giltig till ${dateOnly(data.document.validUntil)}.`
    : `Startdatum ${dateOnly(new Date().toISOString())}.`;

  return [
    `Du signerar ${documentLabel} ${data.document.title} version ${data.document.versionNumber}.`,
    `Säljare: ${data.seller.legalName}.`,
    `Kund: ${data.account.customerLegalName}.`,
    `Total: ${formatMoney(data.document.total.amountMinor)} ${data.document.total.currency}.`,
    validity,
    `Villkor: ${data.document.termsVersion}.`,
    "Genom att signera bekräftar du avsikten att ingå detta kommersiella åtagande.",
  ].join(" ");
}

export function canonicalSignatureHiddenSignedData(data: SignatureHiddenSignedData) {
  return stableStringify(data);
}

export function assertSignatureEvidenceMatchesVersion(input: {
  evidenceDocumentPdfSha256: string;
  version: CommercialDocumentVersion;
}) {
  if (input.evidenceDocumentPdfSha256 !== input.version.pdfSha256) {
    throw new Error("Signed document hash does not match final PDF bytes");
  }
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Signer email is invalid");
  }

  return email;
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function formatMoney(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${entries.join(",")}}`;
}
