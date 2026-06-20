import type { Money } from "./money";
import type { MarketOriginLineage } from "./market";
import { assertValidMoney } from "./money";
import {
  assertBasisPoints,
  assertCurrencyCode,
  assertIsoDate,
  multiplyMinorByQuantity,
  roundBasisPoints,
} from "./shared";

export type CommercialDocumentType = "quote" | "contract";

export type CommercialDocumentStatus =
  | "draft"
  | "finalised"
  | "sent"
  | "viewed"
  | "signing"
  | "signed"
  | "declined"
  | "expired"
  | "superseded"
  | "voided"
  | "error";

export type CommercialDocumentLineSource = "fortnox_article" | "freeform";

export type CommercialDocument = {
  id: string;
  teamId: string;
  accountId: string;
  opportunityId: string;
  documentType: CommercialDocumentType;
  title: string;
  status: CommercialDocumentStatus;
  currency: string;
  validUntil: string | null;
  paymentTerms: string | null;
  termsVersion: string;
  templateId: string | null;
  recipientEmail: string | null;
  scope: string | null;
  marketOrigin: MarketOriginLineage | null;
  activeVersionId: string | null;
  recipientAccessTokenHash: string | null;
  recipientAccessTokenExpiresAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type CommercialDocumentLineDraft = {
  source: CommercialDocumentLineSource;
  provider?: string | null;
  providerConnectionId?: string | null;
  providerObjectId?: string | null;
  providerObjectRecordId?: string | null;
  articleNumber?: string | null;
  description: string;
  unit?: string | null;
  quantityMilli: number;
  unitPrice: Money;
  discountBasisPoints?: number | null;
  vatRateBasisPoints?: number | null;
  snapshot?: Record<string, unknown> | null;
};

export type NormalizedCommercialDocumentLineDraft = {
  source: CommercialDocumentLineSource;
  provider: string | null;
  providerConnectionId: string | null;
  providerObjectId: string | null;
  providerObjectRecordId: string | null;
  articleNumber: string | null;
  description: string;
  unit: string | null;
  quantityMilli: number;
  unitPrice: Money;
  discountBasisPoints: number;
  vatRateBasisPoints: number;
  snapshot: Record<string, unknown> | null;
};

export type CommercialDocumentLineTotals = {
  subtotal: Money;
  discount: Money;
  vat: Money;
  total: Money;
};

export type CommercialDocumentLine = NormalizedCommercialDocumentLineDraft & {
  id: string;
  teamId: string;
  documentId: string;
  sortOrder: number;
  totals: CommercialDocumentLineTotals;
  createdAt: string;
};

export type CommercialDocumentTotals = {
  subtotal: Money;
  discount: Money;
  vat: Money;
  total: Money;
};

export type CommercialDocumentWithLines = CommercialDocument & {
  lines: CommercialDocumentLine[];
  totals: CommercialDocumentTotals;
};

export type CommercialDocumentDraftInput = {
  teamId: string;
  accountId: string;
  opportunityId: string;
  documentType: CommercialDocumentType;
  title: string;
  currency: string;
  validUntil?: string | null;
  paymentTerms?: string | null;
  termsVersion: string;
  templateId?: string | null;
  recipientEmail?: string | null;
  scope?: string | null;
  marketOrigin?: MarketOriginLineage | null;
  lines: readonly CommercialDocumentLineDraft[];
};

export type CommercialDocumentVersionStatus = "finalised" | "superseded" | "voided";

export type CommercialDocumentVersionSnapshot = {
  schemaVersion: 1;
  documentId: string;
  teamId: string;
  accountId: string;
  opportunityId: string;
  documentType: CommercialDocumentType;
  title: string;
  versionNumber: number;
  currency: string;
  validUntil: string | null;
  paymentTerms: string | null;
  termsVersion: string;
  templateId: string | null;
  recipientEmail: string | null;
  scope: string | null;
  marketOrigin: MarketOriginLineage | null;
  lines: CommercialDocumentVersionLineSnapshot[];
  totals: CommercialDocumentTotals;
};

export type CommercialDocumentVersionLineSnapshot = NormalizedCommercialDocumentLineDraft & {
  sortOrder: number;
  totals: CommercialDocumentLineTotals;
};

export type CommercialDocumentVersion = {
  id: string;
  teamId: string;
  documentId: string;
  versionNumber: number;
  status: CommercialDocumentVersionStatus;
  snapshot: CommercialDocumentVersionSnapshot;
  pdfObjectKey: string;
  pdfBodyBase64: string;
  pdfSha256: string;
  byteSize: number;
  finalizedByActorId: string;
  createdAt: string;
};

export function normalizeCommercialDocumentDraftInput(
  input: CommercialDocumentDraftInput,
): CommercialDocumentDraftInput & { lines: NormalizedCommercialDocumentLineDraft[] } {
  const documentType = normalizeDocumentType(input.documentType);
  const title = input.title.trim();
  const currency = input.currency.trim().toUpperCase();
  const termsVersion = input.termsVersion.trim();
  const validUntil = normalizeOptionalIsoDate(input.validUntil, "Commercial document valid-until");

  return {
    teamId: input.teamId.trim(),
    accountId: input.accountId.trim(),
    opportunityId: input.opportunityId.trim(),
    documentType,
    title,
    currency,
    validUntil,
    paymentTerms: input.paymentTerms?.trim() || null,
    termsVersion,
    templateId: input.templateId?.trim() || null,
    recipientEmail: normalizeOptionalEmail(input.recipientEmail),
    scope: input.scope?.trim() || null,
    marketOrigin: input.marketOrigin ?? null,
    lines: input.lines.map((line) => normalizeCommercialDocumentLineDraft(line, currency)),
  };
}

export function assertCommercialDocumentDraftInput(input: CommercialDocumentDraftInput): void {
  const normalized = normalizeCommercialDocumentDraftInput(input);

  if (!normalized.teamId) {
    throw new Error("Commercial document team is required");
  }

  if (!normalized.accountId) {
    throw new Error("Commercial document account is required");
  }

  if (!normalized.opportunityId) {
    throw new Error("Commercial document deal is required");
  }

  if (!normalized.title) {
    throw new Error("Commercial document title is required");
  }

  if (!normalized.termsVersion) {
    throw new Error("Commercial document terms version is required");
  }

  calculateCommercialDocumentTotals({
    currency: normalized.currency,
    lines: normalized.lines,
  });
}

export function calculateCommercialDocumentTotals(input: {
  currency: string;
  lines: readonly CommercialDocumentLineDraft[];
}): { lines: CommercialDocumentLineTotals[]; totals: CommercialDocumentTotals } {
  const currency = input.currency.trim().toUpperCase();
  assertCurrencyCode(currency);

  if (input.lines.length === 0) {
    throw new Error("Commercial document requires at least one line");
  }

  const normalizedLines = input.lines.map((line) =>
    normalizeCommercialDocumentLineDraft(line, currency),
  );
  const subtotalMinor = normalizedLines.reduce(
    (total, line) =>
      total + multiplyMinorByQuantity(line.unitPrice.amountMinor, line.quantityMilli),
    0,
  );
  const lineDiscountMinor = normalizedLines.reduce(
    (total, line) =>
      total +
      roundBasisPoints(
        multiplyMinorByQuantity(line.unitPrice.amountMinor, line.quantityMilli),
        line.discountBasisPoints,
      ),
    0,
  );
  const subtotalAfterDiscount = subtotalMinor - lineDiscountMinor;
  let allocatedDiscountMinor = 0;
  const lineTotals = normalizedLines.map((line, index) => {
    const lineSubtotalMinor = multiplyMinorByQuantity(
      line.unitPrice.amountMinor,
      line.quantityMilli,
    );
    const lineDiscountMinor = roundBasisPoints(lineSubtotalMinor, line.discountBasisPoints);
    const lineNetMinor = lineSubtotalMinor - lineDiscountMinor;
    const discountShareMinor =
      index === normalizedLines.length - 1
        ? lineDiscountMinor
        : subtotalAfterDiscount === 0
          ? lineDiscountMinor
          : lineDiscountMinor;
    allocatedDiscountMinor += discountShareMinor;
    const vatMinor = roundBasisPoints(lineNetMinor, line.vatRateBasisPoints);

    return {
      subtotal: { amountMinor: lineSubtotalMinor, currency },
      discount: { amountMinor: lineDiscountMinor, currency },
      vat: { amountMinor: vatMinor, currency },
      total: { amountMinor: lineNetMinor + vatMinor, currency },
    };
  });
  const discountMinor =
    lineTotals.length === 0
      ? 0
      : allocatedDiscountMinor +
        lineDiscountMinor -
        lineTotals.reduce((total, line) => total + line.discount.amountMinor, 0);
  const normalizedDiscountMinor =
    discountMinor === 0
      ? lineTotals.reduce((total, line) => total + line.discount.amountMinor, 0)
      : lineDiscountMinor;
  const vatMinor = lineTotals.reduce((total, line) => total + line.vat.amountMinor, 0);
  const totalMinor = subtotalMinor - normalizedDiscountMinor + vatMinor;

  return {
    lines: lineTotals,
    totals: {
      subtotal: { amountMinor: subtotalMinor, currency },
      discount: { amountMinor: normalizedDiscountMinor, currency },
      vat: { amountMinor: vatMinor, currency },
      total: { amountMinor: totalMinor, currency },
    },
  };
}

export function buildCommercialDocumentVersionSnapshot(input: {
  document: CommercialDocumentWithLines;
  versionNumber: number;
}): CommercialDocumentVersionSnapshot {
  if (!Number.isInteger(input.versionNumber) || input.versionNumber <= 0) {
    throw new Error("Commercial document version number must be positive");
  }

  return {
    schemaVersion: 1,
    documentId: input.document.id,
    teamId: input.document.teamId,
    accountId: input.document.accountId,
    opportunityId: input.document.opportunityId,
    documentType: input.document.documentType,
    title: input.document.title,
    versionNumber: input.versionNumber,
    currency: input.document.currency,
    validUntil: input.document.validUntil,
    paymentTerms: input.document.paymentTerms,
    termsVersion: input.document.termsVersion,
    templateId: input.document.templateId,
    recipientEmail: input.document.recipientEmail,
    scope: input.document.scope,
    marketOrigin: input.document.marketOrigin,
    lines: input.document.lines.map((line) => ({
      source: line.source,
      provider: line.provider,
      providerConnectionId: line.providerConnectionId,
      providerObjectId: line.providerObjectId,
      providerObjectRecordId: line.providerObjectRecordId,
      articleNumber: line.articleNumber,
      description: line.description,
      unit: line.unit,
      quantityMilli: line.quantityMilli,
      unitPrice: line.unitPrice,
      discountBasisPoints: line.discountBasisPoints,
      vatRateBasisPoints: line.vatRateBasisPoints,
      snapshot: line.snapshot,
      sortOrder: line.sortOrder,
      totals: line.totals,
    })),
    totals: input.document.totals,
  };
}

export function canonicalCommercialDocumentVersionPayload(
  snapshot: CommercialDocumentVersionSnapshot,
) {
  return stableStringify(snapshot);
}

export function assertCanEditCommercialDocument(document: { status: CommercialDocumentStatus }) {
  if (document.status !== "draft") {
    throw new Error("Only draft commercial documents can be edited");
  }
}

export function assertCanFinalizeCommercialDocument(document: CommercialDocumentWithLines) {
  assertCanEditCommercialDocument(document);

  if (document.totals.total.amountMinor <= 0) {
    throw new Error("Commercial document total must be positive before finalising");
  }
}

export function assertCanSendCommercialDocument(document: CommercialDocumentWithLines) {
  if (document.status !== "finalised" && document.status !== "viewed") {
    throw new Error("Only finalised commercial documents can be sent");
  }

  if (!document.activeVersionId) {
    throw new Error("Commercial document requires a finalised version before sending");
  }

  if (!document.recipientEmail) {
    throw new Error("Commercial document send requires a recipient email");
  }
}

export function assertCanReviseCommercialDocument(document: { status: CommercialDocumentStatus }) {
  if (document.status === "draft") {
    throw new Error("Draft commercial documents can be edited without revision");
  }

  if (document.status === "signed") {
    throw new Error("Signed commercial documents require a new document or amendment");
  }

  if (document.status === "voided") {
    throw new Error("Voided commercial documents cannot be revised");
  }
}

export function assertCanViewRecipientCommercialDocument(document: CommercialDocument) {
  if (document.status !== "sent" && document.status !== "viewed" && document.status !== "signed") {
    throw new Error("Commercial document is not available to recipient");
  }

  if (
    document.recipientAccessTokenExpiresAt &&
    Date.now() >= new Date(document.recipientAccessTokenExpiresAt).getTime()
  ) {
    throw new Error("Commercial document recipient link expired");
  }
}

export function assertCanDeclineCommercialDocument(document: CommercialDocument) {
  if (document.status !== "sent" && document.status !== "viewed") {
    throw new Error("Commercial document cannot be declined");
  }

  if (
    document.recipientAccessTokenExpiresAt &&
    Date.now() >= new Date(document.recipientAccessTokenExpiresAt).getTime()
  ) {
    throw new Error("Commercial document recipient link expired");
  }
}

function normalizeCommercialDocumentLineDraft(
  line: CommercialDocumentLineDraft,
  currency: string,
): NormalizedCommercialDocumentLineDraft {
  const source = normalizeLineSource(line.source);
  const description = line.description.trim();

  if (!description) {
    throw new Error("Commercial document line description is required");
  }

  if (!Number.isInteger(line.quantityMilli) || line.quantityMilli <= 0) {
    throw new Error("Commercial document line quantity must be positive");
  }

  assertValidMoney(line.unitPrice);

  if (line.unitPrice.amountMinor < 0) {
    throw new Error("Commercial document line unit price cannot be negative");
  }

  if (line.unitPrice.currency !== currency) {
    throw new Error("Commercial document line currency must match document currency");
  }

  assertBasisPoints(line.discountBasisPoints ?? 0, "Commercial document line discount");
  assertBasisPoints(line.vatRateBasisPoints ?? 0, "Commercial document line VAT rate");

  if (source === "fortnox_article" && !line.providerObjectId?.trim()) {
    throw new Error("Fortnox article line requires a provider object id");
  }

  return {
    source,
    provider: line.provider?.trim() || null,
    providerConnectionId: line.providerConnectionId?.trim() || null,
    providerObjectId: line.providerObjectId?.trim() || null,
    providerObjectRecordId: line.providerObjectRecordId?.trim() || null,
    articleNumber: line.articleNumber?.trim() || null,
    description,
    unit: line.unit?.trim() || null,
    quantityMilli: line.quantityMilli,
    unitPrice: line.unitPrice,
    discountBasisPoints: line.discountBasisPoints ?? 0,
    vatRateBasisPoints: line.vatRateBasisPoints ?? 0,
    snapshot: line.snapshot ?? null,
  };
}

function normalizeDocumentType(value: CommercialDocumentType) {
  if (value === "quote" || value === "contract") {
    return value;
  }

  throw new Error("Commercial document type is invalid");
}

function normalizeLineSource(value: CommercialDocumentLineSource) {
  if (value === "fortnox_article" || value === "freeform") {
    return value;
  }

  throw new Error("Commercial document line source is invalid");
}

function normalizeOptionalIsoDate(value: string | null | undefined, label: string) {
  if (!value) {
    return null;
  }

  assertIsoDate(value, label);
  return new Date(value).toISOString();
}

function normalizeOptionalEmail(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Commercial document recipient email is invalid");
  }

  return email;
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
