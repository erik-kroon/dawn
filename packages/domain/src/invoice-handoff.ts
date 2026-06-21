import type {
  CommercialDocumentVersion,
  CommercialDocumentWithLines,
} from "./commercial-documents";
import type { Money } from "./money";
import type { SignatureRequest } from "./signatures";

export type InvoiceHandoffPolicyMode = "automatic" | "manual";

export type InvoiceHandoffStatus =
  | "waiting_manual_approval"
  | "requested"
  | "approved"
  | "creating"
  | "created"
  | "failed";

export type InvoiceHandoffPolicy = {
  teamId: string;
  mode: InvoiceHandoffPolicyMode;
  updatedByActorId: string | null;
  updatedAt: string;
};

export type InvoiceHandoff = {
  id: string;
  teamId: string;
  accountId: string;
  opportunityId: string;
  documentId: string;
  documentVersionId: string;
  signatureRequestId: string;
  provider: "fortnox";
  connectionId: string;
  status: InvoiceHandoffStatus;
  requestedByActorId: string;
  requestedAt: string;
  approvedByActorId: string | null;
  approvedAt: string | null;
  providerObjectRecordId: string | null;
  providerInvoiceId: string | null;
  providerInvoiceNumber: string | null;
  providerInvoiceUrl: string | null;
  providerStatus: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  requestPayload: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
  lastAttemptAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceHandoffProviderLine = {
  sortOrder: number;
  articleNumber: string | null;
  description: string;
  unit: string | null;
  quantityMilli: number;
  unitPrice: Money;
  discountBasisPoints: number;
  vatRateBasisPoints: number;
};

export type InvoiceHandoffProviderPayload = {
  schemaVersion: 1;
  teamId: string;
  accountId: string;
  opportunityId: string;
  documentId: string;
  documentVersionId: string;
  signatureRequestId: string;
  documentTitle: string;
  documentType: CommercialDocumentWithLines["documentType"];
  versionNumber: number;
  pdfSha256: string;
  customerNumber: string;
  currency: string;
  paymentTerms: string | null;
  totals: CommercialDocumentWithLines["totals"];
  lines: InvoiceHandoffProviderLine[];
};

export function normalizeInvoiceHandoffPolicyMode(
  value: string | null | undefined,
): InvoiceHandoffPolicyMode {
  if (value === "automatic" || value === "manual") {
    return value;
  }

  return "manual";
}

export function isActiveInvoiceHandoffStatus(status: InvoiceHandoffStatus) {
  return status !== "failed";
}

export function assertCanRequestInvoiceHandoff(input: {
  document: CommercialDocumentWithLines;
  version: CommercialDocumentVersion;
  signatureRequest: SignatureRequest | null;
}) {
  if (input.document.status !== "signed") {
    throw new Error("Invoice handoff requires a signed commercial document");
  }

  if (input.version.documentId !== input.document.id) {
    throw new Error("Invoice handoff version does not belong to the document");
  }

  if (input.document.activeVersionId !== input.version.id) {
    throw new Error("Invoice handoff requires the active signed document version");
  }

  if (!input.signatureRequest || input.signatureRequest.status !== "completed") {
    throw new Error("Invoice handoff requires completed BankID signing");
  }
}

export function assertCanApproveInvoiceHandoff(handoff: InvoiceHandoff) {
  if (handoff.status !== "waiting_manual_approval") {
    throw new Error("Invoice handoff is not waiting for manual approval");
  }
}

export function assertCanRunInvoiceHandoff(handoff: InvoiceHandoff) {
  if (handoff.status === "created") {
    return;
  }

  if (
    handoff.status === "requested" ||
    handoff.status === "approved" ||
    handoff.status === "creating" ||
    handoff.status === "failed"
  ) {
    return;
  }

  throw new Error("Invoice handoff is not ready for invoice creation");
}

export function buildInvoiceHandoffProviderPayload(input: {
  document: CommercialDocumentWithLines;
  version: CommercialDocumentVersion;
  signatureRequest: SignatureRequest;
  customerNumber: string;
}): InvoiceHandoffProviderPayload {
  return {
    schemaVersion: 1,
    teamId: input.document.teamId,
    accountId: input.document.accountId,
    opportunityId: input.document.opportunityId,
    documentId: input.document.id,
    documentVersionId: input.version.id,
    signatureRequestId: input.signatureRequest.id,
    documentTitle: input.document.title,
    documentType: input.document.documentType,
    versionNumber: input.version.versionNumber,
    pdfSha256: input.version.pdfSha256,
    customerNumber: input.customerNumber,
    currency: input.version.snapshot.currency,
    paymentTerms: input.version.snapshot.paymentTerms,
    totals: input.version.snapshot.totals,
    lines: input.version.snapshot.lines.map((line) => ({
      sortOrder: line.sortOrder,
      articleNumber: line.articleNumber,
      description: line.description,
      unit: line.unit,
      quantityMilli: line.quantityMilli,
      unitPrice: line.unitPrice,
      discountBasisPoints: line.discountBasisPoints,
      vatRateBasisPoints: line.vatRateBasisPoints,
    })),
  };
}
