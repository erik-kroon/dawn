import { createHash } from "node:crypto";

import type {
  Account,
  MarketCompany,
  MarketCompanySnapshot,
  MarketOriginLineage,
  MarketProspect,
  Opportunity,
  Organization,
} from "@dawn/domain";
import {
  canonicalMarketCompanyIdentityKey,
  marketOriginLineageFromProspect,
  normalizeMarketCompanySeed,
  normalizeMarketProspectLineage,
  stableStringify,
} from "@dawn/domain";

import {
  createAccount,
  createOpportunity,
  createOrganization,
  type CrmUseCaseRepository,
} from "./crm";
import {
  AppError,
  assertAppRequestTeam,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";

export type SeedMarketCompanyCommand = {
  teamId: string;
  provider: string;
  providerCapability: string;
  providerCompanyId?: string | null;
  retrievedAt?: string | null;
  legalName: string;
  organizationNumber: string;
  countryCode?: string | null;
  rawPayload?: Record<string, unknown> | null;
  rawPayloadReference?: string | null;
  idempotencyKey: string;
};

export type SeedMarketCompanyResult = {
  company: MarketCompany;
  snapshot: MarketCompanySnapshot;
  replayed: boolean;
};

export type CreateMarketProspectCommand = {
  teamId: string;
  companyId: string;
  companySnapshotId: string;
  sourceGoalId?: string | null;
  sourceRunId?: string | null;
  icpId?: string | null;
  segmentId?: string | null;
  sourceProvider?: string | null;
  sourceProviderCapability?: string | null;
  sourceDecisionSummary: string;
  idempotencyKey: string;
};

export type CreateMarketProspectResult = {
  prospect: MarketProspect;
  replayed: boolean;
};

export type PromoteMarketProspectCommand = {
  teamId: string;
  prospectId: string;
  accountId?: string | null;
  opportunityName: string;
  amountMinor: number;
  currencyCode: string;
  expectedCloseDate?: string | null;
  primaryOwnerPrincipalId?: string | null;
  idempotencyKey: string;
};

export type PromoteMarketProspectResult = {
  prospect: MarketProspect;
  organization: Organization;
  account: Account;
  opportunity: Opportunity;
  marketOrigin: MarketOriginLineage;
  replayed: boolean;
};

export type MarketOriginRepository = {
  getMarketCompanyByIdentity(input: {
    countryCode: string;
    organizationNumber: string;
  }): Promise<MarketCompany | null>;
  getMarketCompany(companyId: string): Promise<MarketCompany | null>;
  upsertMarketCompany(input: {
    companyId: string;
    countryCode: string;
    organizationNumber: string;
    legalName: string;
  }): Promise<MarketCompany>;
  getMarketCompanySnapshot(snapshotId: string): Promise<MarketCompanySnapshot | null>;
  getMarketCompanySnapshotByContentHash(input: {
    companyId: string;
    provider: string;
    providerCapability: string;
    contentHash: string;
  }): Promise<MarketCompanySnapshot | null>;
  createMarketCompanySnapshot(input: {
    snapshotId: string;
    companyId: string;
    provider: string;
    providerCapability: string;
    providerCompanyId: string | null;
    retrievedAt: string;
    normalizedFields: MarketCompanySnapshot["normalizedFields"];
    rawPayload: Record<string, unknown>;
    rawPayloadReference: string | null;
    contentHash: string;
  }): Promise<MarketCompanySnapshot>;
  getMarketProspectForTeam(teamId: string, prospectId: string): Promise<MarketProspect | null>;
  getMarketProspectForOpportunity(
    teamId: string,
    opportunityId: string,
  ): Promise<MarketProspect | null>;
  listMarketProspectsForAccount(teamId: string, accountId: string): Promise<MarketProspect[]>;
  createMarketProspect(input: {
    prospectId: string;
    teamId: string;
    companyId: string;
    companySnapshotId: string;
    sourceGoalId: string | null;
    sourceRunId: string | null;
    icpId: string | null;
    segmentId: string | null;
    sourceProvider: string;
    sourceProviderCapability: string;
    sourceDecisionSummary: string;
    createdByActorId: string;
  }): Promise<MarketProspect>;
  promoteMarketProspect(input: {
    teamId: string;
    prospectId: string;
    accountId: string;
    opportunityId: string;
    promotedAt: string;
  }): Promise<MarketProspect | null>;
};

export type MarketOriginUseCaseRepository = TransactionReviewRepository &
  CrmUseCaseRepository &
  MarketOriginRepository;

const seedMarketCompanyOperation = "market.company.seed";
const createMarketProspectOperation = "market.prospect.create";
const promoteMarketProspectOperation = "market.prospect.promote";

export async function seedMarketCompany(
  repository: MarketOriginUseCaseRepository,
  context: TransactionReviewContext,
  command: SeedMarketCompanyCommand,
): Promise<SeedMarketCompanyResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const marketRepository = transactionRepository as MarketOriginUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Company not found");
    await assertMarketWriteAccess(marketRepository, context, command.teamId);

    const normalized = normalizeSeedMarketCompanyCommand(command);
    const fingerprint = stableStringify(normalized);
    const replayed = await marketRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      seedMarketCompanyOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different company seed",
        );
      }

      return { ...(replayed.result as SeedMarketCompanyResult), replayed: true };
    }

    const company = await marketRepository.upsertMarketCompany({
      companyId: crypto.randomUUID(),
      countryCode: normalized.normalizedFields.countryCode,
      organizationNumber: normalized.normalizedFields.organizationNumber,
      legalName: normalized.normalizedFields.legalName,
    });
    const existingSnapshot = await marketRepository.getMarketCompanySnapshotByContentHash({
      companyId: company.id,
      provider: normalized.provider,
      providerCapability: normalized.providerCapability,
      contentHash: normalized.contentHash,
    });
    const snapshot =
      existingSnapshot ??
      (await marketRepository.createMarketCompanySnapshot({
        snapshotId: crypto.randomUUID(),
        companyId: company.id,
        provider: normalized.provider,
        providerCapability: normalized.providerCapability,
        providerCompanyId: normalized.providerCompanyId,
        retrievedAt: normalized.retrievedAt,
        normalizedFields: normalized.normalizedFields,
        rawPayload: normalized.rawPayload,
        rawPayloadReference: normalized.rawPayloadReference,
        contentHash: normalized.contentHash,
      }));

    await appendMarketEvents(marketRepository, context, {
      teamId: command.teamId,
      action: "market.company.seeded",
      entityType: "market_company_snapshot",
      entityId: snapshot.id,
      metadata: {
        companyId: company.id,
        companySnapshotId: snapshot.id,
        provider: snapshot.provider,
        providerCapability: snapshot.providerCapability,
        providerCompanyId: snapshot.providerCompanyId,
        organizationNumber: company.organizationNumber,
        legalName: company.legalName,
        contentHash: snapshot.contentHash,
      },
    });

    const result = { company, snapshot, replayed: false };
    await marketRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: seedMarketCompanyOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createMarketProspect(
  repository: MarketOriginUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateMarketProspectCommand,
): Promise<CreateMarketProspectResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const marketRepository = transactionRepository as MarketOriginUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Prospect not found");
    await assertMarketWriteAccess(marketRepository, context, command.teamId);

    const company = await marketRepository.getMarketCompany(command.companyId);
    const snapshot = await marketRepository.getMarketCompanySnapshot(command.companySnapshotId);

    if (!company || !snapshot || snapshot.companyId !== company.id) {
      throw new AppError("NOT_FOUND", "Company snapshot not found");
    }

    const lineage = normalizeMarketProspectLineage({
      sourceGoalId: command.sourceGoalId,
      sourceRunId: command.sourceRunId,
      icpId: command.icpId,
      segmentId: command.segmentId,
      sourceProvider: command.sourceProvider ?? snapshot.provider,
      sourceProviderCapability: command.sourceProviderCapability ?? snapshot.providerCapability,
      sourceDecisionSummary: command.sourceDecisionSummary,
    });
    const normalized = {
      teamId: command.teamId,
      companyId: company.id,
      companySnapshotId: snapshot.id,
      ...lineage,
    };
    const fingerprint = stableStringify(normalized);
    const replayed = await marketRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createMarketProspectOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different prospect");
      }

      return { ...(replayed.result as CreateMarketProspectResult), replayed: true };
    }

    const prospect = await marketRepository.createMarketProspect({
      prospectId: crypto.randomUUID(),
      createdByActorId: context.actor.id,
      ...normalized,
    });

    await appendMarketEvents(marketRepository, context, {
      teamId: command.teamId,
      action: "market.prospect.created",
      entityType: "market_prospect",
      entityId: prospect.id,
      metadata: marketProspectEventMetadata(prospect),
    });

    const result = { prospect, replayed: false };
    await marketRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createMarketProspectOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function promoteMarketProspect(
  repository: MarketOriginUseCaseRepository,
  context: TransactionReviewContext,
  command: PromoteMarketProspectCommand,
): Promise<PromoteMarketProspectResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const marketRepository = transactionRepository as MarketOriginUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Prospect not found");
    await assertMarketWriteAccess(marketRepository, context, command.teamId);

    const prospect = await marketRepository.getMarketProspectForTeam(
      command.teamId,
      command.prospectId,
    );

    if (!prospect) {
      throw new AppError("NOT_FOUND", "Prospect not found");
    }

    const company = await marketRepository.getMarketCompany(prospect.companyId);
    const snapshot = await marketRepository.getMarketCompanySnapshot(prospect.companySnapshotId);

    if (!company || !snapshot || snapshot.companyId !== company.id) {
      throw new AppError("NOT_FOUND", "Prospect company context not found");
    }

    const normalized = normalizePromoteMarketProspectCommand(command);
    const fingerprint = stableStringify({
      ...normalized,
      prospectId: prospect.id,
      companyId: company.id,
      companySnapshotId: snapshot.id,
    });
    const replayed = await marketRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      promoteMarketProspectOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different prospect promotion",
        );
      }

      return { ...(replayed.result as PromoteMarketProspectResult), replayed: true };
    }

    if (prospect.status === "promoted") {
      throw new AppError("CONFLICT", "Prospect is already promoted");
    }

    const { organization, account } = await resolvePromotionAccount(
      marketRepository,
      context,
      command,
      company,
    );
    const opportunityResult = await createOpportunity(marketRepository, context, {
      teamId: command.teamId,
      accountId: account.recordId,
      name: normalized.opportunityName,
      amountMinor: normalized.amountMinor,
      currencyCode: normalized.currencyCode,
      stage: "qualified",
      expectedCloseDate: normalized.expectedCloseDate,
      primaryOwnerPrincipalId: normalized.primaryOwnerPrincipalId,
      idempotencyKey: `${command.idempotencyKey}:opportunity`,
    });
    const promotedAt = new Date().toISOString();
    const promoted = await marketRepository.promoteMarketProspect({
      teamId: command.teamId,
      prospectId: prospect.id,
      accountId: account.recordId,
      opportunityId: opportunityResult.opportunity.recordId,
      promotedAt,
    });

    if (!promoted) {
      throw new AppError("CONFLICT", "Prospect could not be promoted");
    }

    const marketOrigin = marketOriginLineageFromProspect(promoted);
    await appendMarketEvents(marketRepository, context, {
      teamId: command.teamId,
      action: "market.prospect.promoted",
      entityType: "market_prospect",
      entityId: promoted.id,
      metadata: {
        ...marketProspectEventMetadata(promoted),
        accountId: account.recordId,
        opportunityId: opportunityResult.opportunity.recordId,
        organizationId: organization.recordId,
      },
    });

    const result = {
      prospect: promoted,
      organization,
      account,
      opportunity: opportunityResult.opportunity,
      marketOrigin,
      replayed: false,
    };
    await marketRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: promoteMarketProspectOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

function normalizeSeedMarketCompanyCommand(command: SeedMarketCompanyCommand) {
  try {
    const normalized = normalizeMarketCompanySeed(command);
    const contentHash = sha256Text(stableStringify(normalized.contentPayload));

    return {
      teamId: command.teamId,
      ...normalized,
      contentHash,
    };
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }
}

function normalizePromoteMarketProspectCommand(command: PromoteMarketProspectCommand) {
  const opportunityName = command.opportunityName.trim();
  const currencyCode = command.currencyCode.trim().toUpperCase();

  if (!opportunityName) {
    throw new AppError("CONFLICT", "Opportunity name is required");
  }

  if (!Number.isSafeInteger(command.amountMinor) || command.amountMinor < 0) {
    throw new AppError("CONFLICT", "Opportunity amount must be a non-negative safe integer");
  }

  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new AppError("CONFLICT", "Opportunity currency must use ISO 4217 format");
  }

  return {
    teamId: command.teamId,
    accountId: command.accountId?.trim() || null,
    opportunityName,
    amountMinor: command.amountMinor,
    currencyCode,
    expectedCloseDate: normalizeOptionalDate(command.expectedCloseDate),
    primaryOwnerPrincipalId: command.primaryOwnerPrincipalId?.trim() || null,
  };
}

async function resolvePromotionAccount(
  repository: MarketOriginUseCaseRepository,
  context: TransactionReviewContext,
  command: PromoteMarketProspectCommand,
  company: MarketCompany,
) {
  if (command.accountId?.trim()) {
    const account = await repository.getAccountForTeam(command.teamId, command.accountId.trim());

    if (!account) {
      throw new AppError("NOT_FOUND", "Account not found");
    }

    const organization = await repository.getOrganizationForTeam(
      command.teamId,
      account.organizationId,
    );

    if (!organization) {
      throw new AppError("NOT_FOUND", "Organization not found");
    }

    return { organization, account };
  }

  const organization = await resolvePromotionOrganization(repository, context, command, company);
  const existingAccount = (
    await repository.listAccountsForTeam({
      teamId: command.teamId,
      organizationIds: [organization.recordId],
      relationshipStatus: "active",
    })
  )[0];

  if (existingAccount) {
    return { organization, account: existingAccount };
  }

  const accountResult = await createAccount(repository, context, {
    teamId: command.teamId,
    organizationId: organization.recordId,
    accountType: "prospect",
    relationshipStatus: "active",
    lifecycleStage: "qualified",
    idempotencyKey: `${command.idempotencyKey}:account`,
  });

  return { organization, account: accountResult.account };
}

async function resolvePromotionOrganization(
  repository: MarketOriginUseCaseRepository,
  context: TransactionReviewContext,
  command: PromoteMarketProspectCommand,
  company: MarketCompany,
) {
  const duplicateMatches = await repository.listOrganizationsForDuplicateCheck({
    teamId: command.teamId,
    legalName: company.legalName,
    organizationNumber: company.organizationNumber,
    limit: 10,
  });
  const existing = duplicateMatches.find(
    (organization) => organization.organizationNumber === company.organizationNumber,
  );

  if (existing) {
    return existing;
  }

  const organizationResult = await createOrganization(repository, context, {
    teamId: command.teamId,
    legalName: company.legalName,
    displayName: company.legalName,
    organizationNumber: company.organizationNumber,
    countryCode: company.countryCode,
    idempotencyKey: `${command.idempotencyKey}:organization`,
  });

  return organizationResult.organization;
}

async function assertMarketWriteAccess(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  teamId: string,
) {
  await resolveTeamAccess(
    repository,
    { ...context, teamId },
    "crm.accounts.write",
    "You cannot write market prospects for this team",
  );
}

async function appendMarketEvents(
  repository: MarketOriginUseCaseRepository,
  context: TransactionReviewContext,
  input: {
    teamId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  },
) {
  await repository.appendAuditEvent({
    teamId: input.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata,
  });

  await repository.appendOutboxEvent({
    teamId: input.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    type: input.action,
    version: 1,
    payload: input.metadata,
  });
}

function marketProspectEventMetadata(prospect: MarketProspect) {
  return {
    prospectId: prospect.id,
    companyId: prospect.companyId,
    companySnapshotId: prospect.companySnapshotId,
    status: prospect.status,
    sourceGoalId: prospect.sourceGoalId,
    sourceRunId: prospect.sourceRunId,
    icpId: prospect.icpId,
    segmentId: prospect.segmentId,
    sourceProvider: prospect.sourceProvider,
    sourceProviderCapability: prospect.sourceProviderCapability,
    sourceDecisionSummary: prospect.sourceDecisionSummary,
    accountId: prospect.promotedAccountId,
    opportunityId: prospect.promotedOpportunityId,
  };
}

function normalizeOptionalDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("CONFLICT", "Expected close date is invalid");
  }

  return date.toISOString();
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected market-origin error";
}

export function marketCompanyIdentityKey(input: {
  countryCode: string;
  organizationNumber: string;
}) {
  try {
    return canonicalMarketCompanyIdentityKey(input);
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }
}
