import { normalizeSwedishOrganizationNumber } from "./fortnox";
import type { SignatureEvidence, SignatureRequest } from "./signatures";

export type TrustCheckPolicyMode = "disabled" | "advisory" | "blocking";

export type TrustCheckStatus =
  | "pending"
  | "pass"
  | "needs_review"
  | "approved"
  | "rejected"
  | "unavailable"
  | "failed";

export type TrustReviewDecision = "approved" | "rejected";

export type TrustProviderStatus = "completed" | "partially_completed" | "failed" | "unavailable";

export type TrustCheckPolicy = {
  teamId: string;
  mode: TrustCheckPolicyMode;
  updatedByActorId: string | null;
  updatedAt: string;
};

export type TrustRoleEvidence = {
  positionType: string | null;
  positionDescription: string;
  positionStart: string | null;
  positionEnd: string | null;
};

export type TrustCheckAdvisoryAnalysis = {
  label: "advisory";
  summary: string;
  confidence?: "low" | "medium" | "high" | null;
  reasons?: readonly string[];
};

export type TrustCheck = {
  id: string;
  teamId: string;
  accountId: string;
  opportunityId: string;
  documentId: string;
  documentVersionId: string;
  signatureRequestId: string;
  signatureEvidenceId: string;
  signaturePartyId: string | null;
  provider: "tic";
  providerSessionId: string;
  providerRequestId: string | null;
  providerEventId: string | null;
  sourceOrganizationNumber: string | null;
  signerName: string;
  signerEmail: string | null;
  signerPersonalNumberMasked: string | null;
  status: TrustCheckStatus;
  resultReason: string;
  companyRegistrationNumber: string | null;
  companyLegalName: string | null;
  companyStatus: string | null;
  roleEvidence: TrustRoleEvidence[];
  signatureDescription: string | null;
  advisoryAnalysis: TrustCheckAdvisoryAnalysis | null;
  originalSourceDescriptions: string[];
  rawPayload: Record<string, unknown>;
  rawPayloadReference: string | null;
  legalBasis: string;
  purpose: string;
  retentionUntil: string | null;
  requestedAt: string;
  completedAt: string | null;
  reviewedAt: string | null;
  reviewerActorId: string | null;
  reviewDecision: TrustReviewDecision | null;
  reviewRationale: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DerivedTrustCheckResult = {
  status: Extract<TrustCheckStatus, "pass" | "needs_review" | "unavailable" | "failed">;
  resultReason: string;
};

export function normalizeTrustPolicyMode(value: string | null | undefined): TrustCheckPolicyMode {
  if (value === "disabled" || value === "advisory" || value === "blocking") {
    return value;
  }

  return "advisory";
}

export function assertCanRequestTrustCheck(input: {
  signatureRequest: SignatureRequest;
  signatureEvidence: SignatureEvidence | null;
}) {
  if (input.signatureRequest.status !== "completed") {
    throw new Error("Trust checks require a completed signature request");
  }

  if (!input.signatureEvidence) {
    throw new Error("Trust checks require signature evidence");
  }

  if (input.signatureEvidence.verificationStatus !== "verified") {
    throw new Error("Trust checks require verified signature evidence");
  }
}

export function deriveTrustCheckResult(input: {
  providerStatus: TrustProviderStatus;
  expectedOrganizationNumber: string | null;
  companyRegistrationNumber: string | null;
  companyStatus: string | null;
  roleEvidence: readonly TrustRoleEvidence[];
}): DerivedTrustCheckResult {
  if (input.providerStatus === "failed") {
    return { status: "failed", resultReason: "provider_failed" };
  }

  if (input.providerStatus === "unavailable" || input.providerStatus === "partially_completed") {
    return { status: "unavailable", resultReason: input.providerStatus };
  }

  if (!input.expectedOrganizationNumber) {
    return { status: "needs_review", resultReason: "missing_expected_organization_number" };
  }

  if (!input.companyRegistrationNumber) {
    return { status: "unavailable", resultReason: "missing_company_registration_number" };
  }

  if (
    !organizationNumbersMatch(input.expectedOrganizationNumber, input.companyRegistrationNumber)
  ) {
    return { status: "needs_review", resultReason: "organization_number_mismatch" };
  }

  if (!companyStatusLooksActive(input.companyStatus)) {
    return { status: "needs_review", resultReason: "company_status_requires_review" };
  }

  if (input.roleEvidence.length === 0) {
    return { status: "needs_review", resultReason: "missing_company_roles" };
  }

  return { status: "pass", resultReason: "active_company_role_match" };
}

export function assertTrustAllowsInvoice(input: {
  policyMode: TrustCheckPolicyMode;
  status: TrustCheckStatus | null;
}) {
  if (input.policyMode !== "blocking") {
    return;
  }

  if (input.status === "pass" || input.status === "approved") {
    return;
  }

  throw new Error("Trust check approval is required before invoice creation");
}

function organizationNumbersMatch(left: string, right: string) {
  try {
    return normalizeSwedishOrganizationNumber(left) === normalizeSwedishOrganizationNumber(right);
  } catch {
    return left.replace(/\D/g, "") === right.replace(/\D/g, "");
  }
}

function companyStatusLooksActive(status: string | null) {
  if (!status) {
    return false;
  }

  const normalized = status.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return ![
    "inactive",
    "dissolved",
    "bankrupt",
    "bankruptcy",
    "liquidation",
    "avregistrerad",
    "konkurs",
    "likvidation",
  ].some((blocked) => normalized.includes(blocked));
}
