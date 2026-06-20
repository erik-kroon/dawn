import type {
  Account,
  AccountSummary,
  Actor,
  CrmAccessDecision,
  CrmFieldSecurityPolicy,
  CrmObjectAction,
  CrmObjectType,
  CrmRecord,
  CrmRecordGrant,
  Organization,
  Opportunity,
  Party,
  PartyType,
  Permission,
  TeamRole,
} from "@dawn/domain";
import {
  assertCrmWriteFields,
  assertValidMoney,
  evaluateCrmAccess,
  permissionsForRole,
  redactCrmFields,
  resolveCrmPrincipal,
} from "@dawn/domain";

import {
  AppError,
  type IdempotencyResult,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";

export type CreateOrganizationCommand = {
  teamId: string;
  legalName: string;
  displayName?: string | null;
  organizationNumber?: string | null;
  countryCode?: string | null;
  vatNumber?: string | null;
  websiteDomain?: string | null;
  idempotencyKey: string;
};

export type CreateOrganizationResult = {
  organization: Organization;
  replayed: boolean;
};

export type CreateAccountCommand = {
  teamId: string;
  organizationId: string;
  accountType?: Account["accountType"];
  legalEntityId?: string | null;
  primaryOwnerPrincipalId?: string | null;
  idempotencyKey: string;
};

export type CreateAccountResult = {
  account: Account;
  replayed: boolean;
};

export type CreateOpportunityCommand = {
  teamId: string;
  accountId: string;
  name: string;
  amountMinor: number;
  currencyCode: string;
  expectedCloseDate?: string | null;
  primaryOwnerPrincipalId?: string | null;
  idempotencyKey: string;
};

export type CreateOpportunityResult = {
  opportunity: Opportunity;
  replayed: boolean;
};

export type GetAccountSummaryCommand = {
  teamId: string;
  accountId: string;
};

export type CrmRepository = {
  withTransaction<T>(callback: (repository: CrmRepository) => Promise<T>): Promise<T>;
  getMembership(actor: Actor, teamId: string): Promise<{ role: TeamRole } | null>;
  getIdempotencyResult(
    teamId: string,
    actorId: string,
    operation: string,
    key: string,
  ): Promise<IdempotencyResult<unknown> | null>;
  saveIdempotencyResult(input: {
    teamId: string;
    actorId: string;
    operation: string;
    key: string;
    fingerprint: string;
    result: unknown;
  }): Promise<void>;
  appendAuditEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  appendOutboxEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    type: string;
    version: number;
    payload: Record<string, unknown>;
  }): Promise<void>;

  // CRM-specific queries
  getCrmRecordForTeam(teamId: string, recordId: string): Promise<CrmRecord | null>;
  listCrmRecordGrantsForPrincipal(input: {
    teamId: string;
    recordId: string;
    principalId: string;
  }): Promise<CrmRecordGrant[]>;
  listCrmFieldSecurityPolicies(input: {
    teamId: string;
    objectTypeId: string;
    recordId: string | null;
    principalId: string;
  }): Promise<CrmFieldSecurityPolicy[]>;
  getOrganizationForTeam(teamId: string, recordId: string): Promise<Organization | null>;
  getAccountForTeam(teamId: string, recordId: string): Promise<Account | null>;
  getOpportunityForTeam(teamId: string, recordId: string): Promise<Opportunity | null>;
  listOpenOpportunitiesForAccount(teamId: string, accountId: string): Promise<Opportunity[]>;

  // CRM-specific mutations
  createCrmRecord(input: {
    recordId: string;
    teamId: string;
    objectTypeId: string;
    createdByActorId: string;
    ownerPrincipalId?: string | null;
  }): Promise<CrmRecord>;
  createCrmParty(input: { recordId: string; teamId: string; partyType: PartyType }): Promise<Party>;
  createOrganization(input: {
    recordId: string;
    teamId: string;
    legalName: string;
    displayName?: string | null;
    organizationNumber?: string | null;
    countryCode?: string | null;
    vatNumber?: string | null;
    websiteDomain?: string | null;
  }): Promise<Organization>;
  createAccount(input: {
    recordId: string;
    teamId: string;
    organizationId: string;
    accountType?: Account["accountType"];
    legalEntityId?: string | null;
    primaryOwnerPrincipalId?: string | null;
  }): Promise<Account>;
  createOpportunity(input: {
    recordId: string;
    teamId: string;
    accountId: string;
    name: string;
    amountMinor: number;
    currencyCode: string;
    expectedCloseDate?: string | null;
    primaryOwnerPrincipalId?: string | null;
  }): Promise<Opportunity>;
};

export type CrmUseCaseRepository = TransactionReviewRepository & CrmRepository;

const createOrganizationOperation = "crm.organization.create";
const createAccountOperation = "crm.account.create";
const createOpportunityOperation = "crm.opportunity.create";

const crmObjectFields: Record<CrmObjectType, readonly string[]> = {
  organization: [
    "recordId",
    "teamId",
    "legalName",
    "displayName",
    "organizationNumber",
    "countryCode",
    "vatNumber",
    "websiteDomain",
    "createdAt",
    "updatedAt",
  ],
  account: [
    "recordId",
    "teamId",
    "legalEntityId",
    "organizationId",
    "accountType",
    "relationshipStatus",
    "primaryOwnerPrincipalId",
    "customerSince",
    "churnedAt",
    "createdAt",
    "updatedAt",
  ],
  opportunity: [
    "recordId",
    "teamId",
    "accountId",
    "name",
    "amountMinor",
    "currencyCode",
    "status",
    "expectedCloseDate",
    "primaryOwnerPrincipalId",
    "wonAt",
    "lostAt",
    "createdAt",
    "updatedAt",
  ],
};

export async function createOrganization(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateOrganizationCommand,
): Promise<CreateOrganizationResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Organization not found");

    const normalized = normalizeCreateOrganizationCommand(command);
    const principal = await assertCrmCreateAccess(
      crmRepository,
      context,
      command.teamId,
      "organization",
      normalized,
      "You cannot create organizations for this team",
    );
    const fingerprint = JSON.stringify(normalized);
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createOrganizationOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different organization",
        );
      }

      return { ...(replayed.result as CreateOrganizationResult), replayed: true };
    }

    const recordId = crypto.randomUUID();
    await crmRepository.createCrmRecord({
      recordId,
      teamId: command.teamId,
      objectTypeId: "organization",
      createdByActorId: context.actor.id,
      ownerPrincipalId: principal.id,
    });
    await crmRepository.createCrmParty({
      recordId,
      teamId: command.teamId,
      partyType: "organization",
    });
    const organization = await crmRepository.createOrganization({
      recordId,
      ...normalized,
    });

    await crmRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "crm.organization.created",
      entityType: "organization",
      entityId: organization.recordId,
      metadata: {
        legalName: organization.legalName,
        organizationNumber: organization.organizationNumber,
      },
    });

    await crmRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "crm.organization.created",
      version: 1,
      payload: {
        organizationId: organization.recordId,
        legalName: organization.legalName,
      },
    });

    const result = { organization, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createOrganizationOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createAccount(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateAccountCommand,
): Promise<CreateAccountResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Account not found");

    const normalized = normalizeCreateAccountCommand(command);
    const principal = await assertCrmCreateAccess(
      crmRepository,
      context,
      command.teamId,
      "account",
      normalized,
      "You cannot create accounts for this team",
    );
    const fingerprint = JSON.stringify(normalized);
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createAccountOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different account");
      }

      return { ...(replayed.result as CreateAccountResult), replayed: true };
    }

    await resolveCrmRecordAccess(
      crmRepository,
      context,
      command.teamId,
      command.organizationId,
      "organization",
      "read",
      "Organization not found",
    );

    const organization = await crmRepository.getOrganizationForTeam(
      command.teamId,
      command.organizationId,
    );

    if (!organization) {
      throw new AppError("NOT_FOUND", "Organization not found");
    }

    const recordId = crypto.randomUUID();
    await crmRepository.createCrmRecord({
      recordId,
      teamId: command.teamId,
      objectTypeId: "account",
      createdByActorId: context.actor.id,
      ownerPrincipalId: principal.id,
    });
    const account = await crmRepository.createAccount({
      recordId,
      ...normalized,
    });

    await crmRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "crm.account.created",
      entityType: "account",
      entityId: account.recordId,
      metadata: {
        organizationId: account.organizationId,
        accountType: account.accountType,
      },
    });

    await crmRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "crm.account.created",
      version: 1,
      payload: {
        accountId: account.recordId,
        organizationId: account.organizationId,
      },
    });

    const result = { account, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createAccountOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createOpportunity(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateOpportunityCommand,
): Promise<CreateOpportunityResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Opportunity not found");

    const normalized = normalizeCreateOpportunityCommand(command);
    const principal = await assertCrmCreateAccess(
      crmRepository,
      context,
      command.teamId,
      "opportunity",
      normalized,
      "You cannot create opportunities for this team",
    );
    const fingerprint = JSON.stringify(normalized);
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createOpportunityOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different opportunity",
        );
      }

      return { ...(replayed.result as CreateOpportunityResult), replayed: true };
    }

    await resolveCrmRecordAccess(
      crmRepository,
      context,
      command.teamId,
      command.accountId,
      "account",
      "read",
      "Account not found",
    );

    const account = await crmRepository.getAccountForTeam(command.teamId, command.accountId);

    if (!account) {
      throw new AppError("NOT_FOUND", "Account not found");
    }

    try {
      assertValidMoney({ amountMinor: normalized.amountMinor, currency: normalized.currencyCode });
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const recordId = crypto.randomUUID();
    await crmRepository.createCrmRecord({
      recordId,
      teamId: command.teamId,
      objectTypeId: "opportunity",
      createdByActorId: context.actor.id,
      ownerPrincipalId: principal.id,
    });
    const opportunity = await crmRepository.createOpportunity({
      recordId,
      ...normalized,
    });

    await crmRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "crm.opportunity.created",
      entityType: "opportunity",
      entityId: opportunity.recordId,
      metadata: {
        accountId: opportunity.accountId,
        amount: { amountMinor: opportunity.amountMinor, currency: opportunity.currencyCode },
      },
    });

    await crmRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "crm.opportunity.created",
      version: 1,
      payload: {
        opportunityId: opportunity.recordId,
        accountId: opportunity.accountId,
        amount: { amountMinor: opportunity.amountMinor, currency: opportunity.currencyCode },
      },
    });

    const result = { opportunity, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createOpportunityOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function getAccountSummary(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: GetAccountSummaryCommand,
): Promise<AccountSummary> {
  assertCommandTeamMatchesContext(context, command.teamId, "Account not found");

  const accountDecision = await resolveCrmRecordAccess(
    repository,
    context,
    command.teamId,
    command.accountId,
    "account",
    "read",
    "Account not found",
  );

  const account = await repository.getAccountForTeam(command.teamId, command.accountId);

  if (!account) {
    throw new AppError("NOT_FOUND", "Account not found");
  }

  const organizationDecision = await resolveCrmRecordAccess(
    repository,
    context,
    command.teamId,
    account.organizationId,
    "organization",
    "read",
    "Organization not found",
  );

  const organization = await repository.getOrganizationForTeam(
    command.teamId,
    account.organizationId,
  );

  if (!organization) {
    throw new AppError("NOT_FOUND", "Organization not found");
  }

  const openOpportunities = await repository.listOpenOpportunitiesForAccount(
    command.teamId,
    account.recordId,
  );
  const visibleOpenOpportunities: Partial<Opportunity>[] = [];

  for (const opportunity of openOpportunities) {
    const decision = await resolveCrmRecordAccess(
      repository,
      context,
      command.teamId,
      opportunity.recordId,
      "opportunity",
      "read",
      "Opportunity not found",
    );
    visibleOpenOpportunities.push(redactCrmFields(opportunity, decision.visibleFields));
  }

  return {
    organization: redactCrmFields(organization, organizationDecision.visibleFields),
    account: redactCrmFields(account, accountDecision.visibleFields),
    openOpportunities: visibleOpenOpportunities,
  };
}

function normalizeCreateOrganizationCommand(command: CreateOrganizationCommand) {
  const legalName = command.legalName.trim();

  if (!legalName) {
    throw new AppError("CONFLICT", "Legal name is required");
  }

  return {
    teamId: command.teamId,
    legalName,
    displayName: command.displayName?.trim() || null,
    organizationNumber: command.organizationNumber?.trim() || null,
    countryCode: command.countryCode?.trim().toUpperCase() || null,
    vatNumber: command.vatNumber?.trim() || null,
    websiteDomain: command.websiteDomain?.trim().toLowerCase() || null,
  };
}

async function assertCrmCreateAccess(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
  objectType: CrmObjectType,
  input: Record<string, unknown>,
  forbiddenMessage: string,
) {
  const principal = resolveCrmPrincipal(context.actor, teamId, context.principalId);
  const capabilities = await resolveCrmCapabilities(repository, context, teamId);
  const fieldPolicies = await repository.listCrmFieldSecurityPolicies({
    teamId,
    objectTypeId: objectType,
    recordId: null,
    principalId: principal.id,
  });
  const decision = evaluateCrmAccess({
    principal,
    teamId,
    record: {
      id: "__new__",
      teamId,
      objectTypeId: objectType,
      ownerPrincipalId: principal.id,
      lifecycleState: "active",
    },
    capabilities,
    action: { objectType, action: "write" },
    grants: [],
    fieldPolicies,
    allFields: crmObjectFields[objectType],
  });

  if (!decision.allowed) {
    throw new AppError("FORBIDDEN", forbiddenMessage);
  }

  try {
    assertCrmWriteFields(input, decision.writableFields);
  } catch (error) {
    throw new AppError("FORBIDDEN", errorMessage(error));
  }

  return principal;
}

async function resolveCrmRecordAccess(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
  recordId: string,
  objectType: CrmObjectType,
  action: CrmObjectAction,
  notFoundMessage: string,
): Promise<CrmAccessDecision> {
  const record = await repository.getCrmRecordForTeam(teamId, recordId);
  const principal = resolveCrmPrincipal(context.actor, teamId, context.principalId);
  const [capabilities, grants, fieldPolicies] = await Promise.all([
    resolveCrmCapabilities(repository, context, teamId),
    repository.listCrmRecordGrantsForPrincipal({
      teamId,
      recordId,
      principalId: principal.id,
    }),
    repository.listCrmFieldSecurityPolicies({
      teamId,
      objectTypeId: objectType,
      recordId,
      principalId: principal.id,
    }),
  ]);
  const decision = evaluateCrmAccess({
    principal,
    teamId,
    record,
    capabilities,
    action: { objectType, action },
    grants,
    fieldPolicies,
    allFields: crmObjectFields[objectType],
  });

  if (!decision.allowed) {
    if (action === "read") {
      throw new AppError("NOT_FOUND", notFoundMessage);
    }

    throw new AppError("FORBIDDEN", `You cannot ${action} this ${objectType}`);
  }

  return decision;
}

async function resolveCrmCapabilities(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
): Promise<readonly Permission[]> {
  if (context.actor.type !== "user") {
    if (context.actor.teamId !== teamId) {
      return [];
    }

    return context.actor.permissions ?? [];
  }

  const membership = await repository.getMembership(context.actor, teamId);
  return membership ? permissionsForRole(membership.role) : [];
}

function normalizeCreateAccountCommand(command: CreateAccountCommand) {
  const validAccountTypes: Account["accountType"][] = [
    "prospect",
    "customer",
    "partner",
    "supplier",
    "former_customer",
  ];
  const accountType: Account["accountType"] =
    command.accountType && validAccountTypes.includes(command.accountType)
      ? command.accountType
      : "prospect";

  return {
    teamId: command.teamId,
    organizationId: command.organizationId,
    accountType,
    legalEntityId: command.legalEntityId?.trim() || null,
    primaryOwnerPrincipalId: command.primaryOwnerPrincipalId?.trim() || null,
  };
}

function normalizeCreateOpportunityCommand(command: CreateOpportunityCommand) {
  const name = command.name.trim();

  if (!name) {
    throw new AppError("CONFLICT", "Opportunity name is required");
  }

  return {
    teamId: command.teamId,
    accountId: command.accountId,
    name,
    amountMinor: command.amountMinor,
    currencyCode: command.currencyCode.trim().toUpperCase(),
    expectedCloseDate: command.expectedCloseDate ?? null,
    primaryOwnerPrincipalId: command.primaryOwnerPrincipalId?.trim() || null,
  };
}

function assertCommandTeamMatchesContext(
  context: TransactionReviewContext,
  teamId: string,
  message: string,
) {
  if (context.teamId && context.teamId !== teamId) {
    throw new AppError("NOT_FOUND", message);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected application error";
}
