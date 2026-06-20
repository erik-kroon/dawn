import { normalizeSwedishOrganizationNumber } from "./fortnox";

export type MarketCompanyStatus = "active" | "inactive";

export type MarketCompany = {
  id: string;
  countryCode: string;
  organizationNumber: string;
  legalName: string;
  status: MarketCompanyStatus;
  createdAt: string;
  updatedAt: string;
};

export type MarketCompanySnapshotNormalizedFields = {
  legalName: string;
  organizationNumber: string;
  countryCode: string;
};

export type MarketCompanySnapshot = {
  id: string;
  companyId: string;
  provider: string;
  providerCapability: string;
  providerCompanyId: string | null;
  retrievedAt: string;
  normalizedFields: MarketCompanySnapshotNormalizedFields;
  rawPayload: Record<string, unknown>;
  rawPayloadReference: string | null;
  contentHash: string;
  createdAt: string;
};

export type MarketProspectStatus = "created" | "promoted" | "archived";

export type MarketProspect = {
  id: string;
  teamId: string;
  companyId: string;
  companySnapshotId: string;
  status: MarketProspectStatus;
  sourceGoalId: string | null;
  sourceRunId: string | null;
  icpId: string | null;
  segmentId: string | null;
  sourceProvider: string;
  sourceProviderCapability: string;
  sourceDecisionSummary: string;
  createdByActorId: string;
  promotedAccountId: string | null;
  promotedOpportunityId: string | null;
  promotedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketOriginLineage = {
  companyId: string;
  companySnapshotId: string;
  prospectId: string;
  sourceGoalId: string | null;
  sourceRunId: string | null;
  icpId: string | null;
  segmentId: string | null;
  sourceProvider: string;
  sourceProviderCapability: string;
  sourceDecisionSummary: string;
};

export type NormalizedMarketCompanySeed = {
  provider: string;
  providerCapability: string;
  providerCompanyId: string | null;
  retrievedAt: string;
  normalizedFields: MarketCompanySnapshotNormalizedFields;
  rawPayload: Record<string, unknown>;
  rawPayloadReference: string | null;
  contentPayload: Record<string, unknown>;
};

export function normalizeMarketCompanySeed(input: {
  provider: string;
  providerCapability: string;
  providerCompanyId?: string | null;
  retrievedAt?: string | null;
  legalName: string;
  organizationNumber: string;
  countryCode?: string | null;
  rawPayload?: Record<string, unknown> | null;
  rawPayloadReference?: string | null;
}): NormalizedMarketCompanySeed {
  const provider = normalizeRequiredText(input.provider, "Provider");
  const providerCapability = normalizeRequiredText(input.providerCapability, "Provider capability");
  const legalName = normalizeRequiredText(input.legalName, "Legal name");
  const countryCode = (input.countryCode?.trim().toUpperCase() || "SE") as string;

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error("Country code must use ISO 3166-1 alpha-2 format");
  }

  const organizationNumber =
    countryCode === "SE"
      ? normalizeSwedishOrganizationNumber(input.organizationNumber)
      : normalizeRequiredText(input.organizationNumber, "Organization number");
  const retrievedAt = normalizeOptionalIsoDate(input.retrievedAt) ?? new Date().toISOString();
  const normalizedFields = { legalName, organizationNumber, countryCode };
  const rawPayload = input.rawPayload ?? {};
  const rawPayloadReference = input.rawPayloadReference?.trim() || null;
  const providerCompanyId = input.providerCompanyId?.trim() || null;
  const contentPayload = {
    provider,
    providerCapability,
    providerCompanyId,
    normalizedFields,
    rawPayload,
    rawPayloadReference,
  };

  return {
    provider,
    providerCapability,
    providerCompanyId,
    retrievedAt,
    normalizedFields,
    rawPayload,
    rawPayloadReference,
    contentPayload,
  };
}

export function canonicalMarketCompanyIdentityKey(input: {
  countryCode: string;
  organizationNumber: string;
}) {
  const countryCode = input.countryCode.trim().toUpperCase();
  const organizationNumber =
    countryCode === "SE"
      ? normalizeSwedishOrganizationNumber(input.organizationNumber)
      : normalizeRequiredText(input.organizationNumber, "Organization number");

  return `${countryCode}:${organizationNumber}`;
}

export function assertMarketCompanyIdentityInvariant(input: {
  countryCode: string;
  organizationNumber: string;
  status: MarketCompanyStatus;
}) {
  if (input.status !== "active") {
    throw new Error("Only active canonical company identities can be used for market origin");
  }

  canonicalMarketCompanyIdentityKey(input);
}

export function normalizeMarketProspectLineage(input: {
  sourceGoalId?: string | null;
  sourceRunId?: string | null;
  icpId?: string | null;
  segmentId?: string | null;
  sourceProvider: string;
  sourceProviderCapability: string;
  sourceDecisionSummary: string;
}): Omit<MarketOriginLineage, "companyId" | "companySnapshotId" | "prospectId"> {
  return {
    sourceGoalId: normalizeOptionalText(input.sourceGoalId),
    sourceRunId: normalizeOptionalText(input.sourceRunId),
    icpId: normalizeOptionalText(input.icpId),
    segmentId: normalizeOptionalText(input.segmentId),
    sourceProvider: normalizeRequiredText(input.sourceProvider, "Source provider"),
    sourceProviderCapability: normalizeRequiredText(
      input.sourceProviderCapability,
      "Source provider capability",
    ),
    sourceDecisionSummary: normalizeRequiredText(
      input.sourceDecisionSummary,
      "Source decision summary",
    ),
  };
}

export function marketOriginLineageFromProspect(
  prospect: Pick<
    MarketProspect,
    | "id"
    | "companyId"
    | "companySnapshotId"
    | "sourceGoalId"
    | "sourceRunId"
    | "icpId"
    | "segmentId"
    | "sourceProvider"
    | "sourceProviderCapability"
    | "sourceDecisionSummary"
  >,
): MarketOriginLineage {
  return {
    companyId: prospect.companyId,
    companySnapshotId: prospect.companySnapshotId,
    prospectId: prospect.id,
    sourceGoalId: prospect.sourceGoalId,
    sourceRunId: prospect.sourceRunId,
    icpId: prospect.icpId,
    segmentId: prospect.segmentId,
    sourceProvider: prospect.sourceProvider,
    sourceProviderCapability: prospect.sourceProviderCapability,
    sourceDecisionSummary: prospect.sourceDecisionSummary,
  };
}

export function stableStringify(value: unknown): string {
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

function normalizeRequiredText(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeOptionalIsoDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Retrieved-at must be a valid ISO date");
  }

  return date.toISOString();
}
