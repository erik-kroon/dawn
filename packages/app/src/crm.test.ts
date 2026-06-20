import { describe, expect, test } from "bun:test";

import type {
  Account,
  Actor,
  CrmFieldSecurityPolicy,
  CrmRecord,
  CrmRecordGrant,
  Organization,
  Opportunity,
  Party,
  TeamRole,
} from "@dawn/domain";

import {
  createAccount,
  createOpportunity,
  createOrganization,
  getAccountSummary,
  type CrmRepository,
  type CrmUseCaseRepository,
} from "./crm";

const now = "2026-06-15T10:00:00.000Z";

class MemoryCrmRepository {
  role: TeamRole = "member";
  actor: Actor = { id: "user_1", type: "user" };
  records = new Map<string, CrmRecord>();
  parties = new Map<string, Party>();
  organizations = new Map<string, Organization>();
  accounts = new Map<string, Account>();
  opportunities = new Map<string, Opportunity>();
  grants: CrmRecordGrant[] = [];
  fieldPolicies: CrmFieldSecurityPolicy[] = [];
  idempotency = new Map<string, { fingerprint: string; result: unknown }>();
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: CrmRepository) => Promise<T>) {
    return callback(this as unknown as CrmRepository);
  }

  async getMembership(actor: Actor, teamId: string) {
    return actor.id === this.actor.id && teamId === "team_1" ? { role: this.role } : null;
  }

  async getIdempotencyResult(teamId: string, actorId: string, operation: string, key: string) {
    return this.idempotency.get(`${teamId}:${actorId}:${operation}:${key}`) ?? null;
  }

  async saveIdempotencyResult(input: {
    teamId: string;
    actorId: string;
    operation: string;
    key: string;
    fingerprint: string;
    result: unknown;
  }) {
    this.idempotency.set(`${input.teamId}:${input.actorId}:${input.operation}:${input.key}`, {
      fingerprint: input.fingerprint,
      result: input.result,
    });
  }

  async appendAuditEvent(input: unknown) {
    this.auditEvents.push(input);
  }

  async appendOutboxEvent(input: unknown) {
    this.outboxEvents.push(input);
  }

  async getOrganizationForTeam(teamId: string, recordId: string) {
    const organization = this.organizations.get(recordId);
    return organization?.teamId === teamId ? organization : null;
  }

  async getCrmRecordForTeam(teamId: string, recordId: string) {
    const record = this.records.get(recordId);
    return record?.teamId === teamId ? record : null;
  }

  async listCrmRecordGrantsForPrincipal(input: {
    teamId: string;
    recordId: string;
    principalId: string;
  }) {
    return this.grants.filter(
      (grant) =>
        grant.teamId === input.teamId &&
        grant.recordId === input.recordId &&
        grant.principalId === input.principalId,
    );
  }

  async listCrmFieldSecurityPolicies(input: {
    teamId: string;
    objectTypeId: string;
    recordId: string | null;
    principalId: string;
  }) {
    return this.fieldPolicies.filter(
      (policy) =>
        policy.teamId === input.teamId &&
        policy.objectTypeId === input.objectTypeId &&
        (policy.targetRecordId === null || policy.targetRecordId === input.recordId) &&
        (policy.principalId === null || policy.principalId === input.principalId),
    );
  }

  async getAccountForTeam(teamId: string, recordId: string) {
    const account = this.accounts.get(recordId);
    return account?.teamId === teamId ? account : null;
  }

  async getOpportunityForTeam(teamId: string, recordId: string) {
    const opportunity = this.opportunities.get(recordId);
    return opportunity?.teamId === teamId ? opportunity : null;
  }

  async listOpenOpportunitiesForAccount(teamId: string, accountId: string) {
    return [...this.opportunities.values()].filter(
      (opportunity) =>
        opportunity.teamId === teamId &&
        opportunity.accountId === accountId &&
        opportunity.status === "open",
    );
  }

  async createCrmRecord(input: {
    recordId: string;
    teamId: string;
    objectTypeId: string;
    createdByActorId: string;
    ownerPrincipalId?: string | null;
  }) {
    const record: CrmRecord = {
      id: input.recordId,
      teamId: input.teamId,
      objectTypeId: input.objectTypeId,
      ownerPrincipalId: input.ownerPrincipalId ?? input.createdByActorId,
      lifecycleState: "active",
      version: 1,
      createdByActorId: input.createdByActorId,
      updatedByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    };
    this.records.set(record.id, record);
    return record;
  }

  async createCrmParty(input: { recordId: string; teamId: string; partyType: "organization" }) {
    const party: Party = {
      recordId: input.recordId,
      teamId: input.teamId,
      partyType: input.partyType,
    };
    this.parties.set(party.recordId, party);
    return party;
  }

  async createOrganization(input: {
    recordId: string;
    teamId: string;
    legalName: string;
    displayName?: string | null;
    organizationNumber?: string | null;
    countryCode?: string | null;
    vatNumber?: string | null;
    websiteDomain?: string | null;
  }) {
    const organization: Organization = {
      recordId: input.recordId,
      teamId: input.teamId,
      legalName: input.legalName,
      displayName: input.displayName ?? null,
      organizationNumber: input.organizationNumber ?? null,
      countryCode: input.countryCode ?? null,
      vatNumber: input.vatNumber ?? null,
      websiteDomain: input.websiteDomain ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.organizations.set(organization.recordId, organization);
    return organization;
  }

  async createAccount(input: {
    recordId: string;
    teamId: string;
    organizationId: string;
    accountType?: Account["accountType"];
    legalEntityId?: string | null;
    primaryOwnerPrincipalId?: string | null;
  }) {
    const account: Account = {
      recordId: input.recordId,
      teamId: input.teamId,
      organizationId: input.organizationId,
      accountType: input.accountType ?? "prospect",
      relationshipStatus: "active",
      legalEntityId: input.legalEntityId ?? null,
      primaryOwnerPrincipalId: input.primaryOwnerPrincipalId ?? null,
      customerSince: null,
      churnedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(account.recordId, account);
    return account;
  }

  async createOpportunity(input: {
    recordId: string;
    teamId: string;
    accountId: string;
    name: string;
    amountMinor: number;
    currencyCode: string;
    expectedCloseDate?: string | null;
    primaryOwnerPrincipalId?: string | null;
  }) {
    const opportunity: Opportunity = {
      recordId: input.recordId,
      teamId: input.teamId,
      accountId: input.accountId,
      name: input.name,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
      status: "open",
      expectedCloseDate: input.expectedCloseDate ?? null,
      primaryOwnerPrincipalId: input.primaryOwnerPrincipalId ?? null,
      wonAt: null,
      lostAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.opportunities.set(opportunity.recordId, opportunity);
    return opportunity;
  }
}

const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};

describe("crm use cases", () => {
  test("creates organization", async () => {
    const repository = new MemoryCrmRepository();
    const result = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        organizationNumber: "556123-4567",
        countryCode: "se",
        websiteDomain: "acme.se",
        idempotencyKey: "org_1",
      },
    );

    expect(result.organization).toMatchObject({
      teamId: "team_1",
      legalName: "Acme AB",
      organizationNumber: "556123-4567",
      countryCode: "SE",
      websiteDomain: "acme.se",
    });
    expect(result.replayed).toBe(false);
    expect(repository.records.has(result.organization.recordId)).toBe(true);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({ action: "crm.organization.created" });
  });

  test("replays create organization with same idempotency key", async () => {
    const repository = new MemoryCrmRepository();
    const first = await createOrganization(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      legalName: "Acme AB",
      idempotencyKey: "org_1",
    });
    const replayed = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );

    expect(replayed.replayed).toBe(true);
    expect(replayed.organization.recordId).toBe(first.organization.recordId);
    expect(repository.organizations.size).toBe(1);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("creates account linked to organization", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );
    const result = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      accountType: "customer",
      idempotencyKey: "account_1",
    });

    expect(result.account).toMatchObject({
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      accountType: "customer",
      relationshipStatus: "active",
    });
    expect(result.replayed).toBe(false);
    expect(repository.auditEvents.at(-1)).toMatchObject({ action: "crm.account.created" });
    expect(repository.outboxEvents.at(-1)).toMatchObject({ type: "crm.account.created" });
  });

  test("denies account creation for organization from another team", async () => {
    const repository = new MemoryCrmRepository();
    const otherOrganization: Organization = {
      recordId: "org_other",
      teamId: "team_2",
      legalName: "Other Corp",
      displayName: null,
      organizationNumber: null,
      countryCode: null,
      vatNumber: null,
      websiteDomain: null,
      createdAt: now,
      updatedAt: now,
    };
    repository.organizations.set(otherOrganization.recordId, otherOrganization);

    await expect(
      createAccount(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        organizationId: otherOrganization.recordId,
        idempotencyKey: "account_1",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Organization not found",
    });
  });

  test("replays create account with same idempotency key", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );
    const first = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      idempotencyKey: "account_1",
    });
    const replayed = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      idempotencyKey: "account_1",
    });

    expect(replayed.replayed).toBe(true);
    expect(replayed.account.recordId).toBe(first.account.recordId);
    expect(repository.accounts.size).toBe(1);
  });

  test("creates opportunity linked to account", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );
    const account = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      idempotencyKey: "account_1",
    });
    const result = await createOpportunity(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      name: "Expansion 2027",
      amountMinor: 100_000,
      currencyCode: "SEK",
      expectedCloseDate: "2027-01-15T00:00:00.000Z",
      idempotencyKey: "opportunity_1",
    });

    expect(result.opportunity).toMatchObject({
      teamId: "team_1",
      accountId: account.account.recordId,
      name: "Expansion 2027",
      amountMinor: 100_000,
      currencyCode: "SEK",
      status: "open",
    });
    expect(result.replayed).toBe(false);
    expect(repository.auditEvents.at(-1)).toMatchObject({ action: "crm.opportunity.created" });
    expect(repository.outboxEvents.at(-1)).toMatchObject({ type: "crm.opportunity.created" });
  });

  test("denies opportunity creation for account from another team", async () => {
    const repository = new MemoryCrmRepository();
    const otherAccount: Account = {
      recordId: "account_other",
      teamId: "team_2",
      organizationId: "org_other",
      accountType: "customer",
      relationshipStatus: "active",
      legalEntityId: null,
      primaryOwnerPrincipalId: null,
      customerSince: null,
      churnedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    repository.accounts.set(otherAccount.recordId, otherAccount);

    await expect(
      createOpportunity(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: otherAccount.recordId,
        name: "Bad deal",
        amountMinor: 1_000,
        currencyCode: "SEK",
        idempotencyKey: "opportunity_1",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Account not found",
    });
  });

  test("replays create opportunity with same idempotency key", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );
    const account = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      idempotencyKey: "account_1",
    });
    const first = await createOpportunity(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      name: "Expansion 2027",
      amountMinor: 100_000,
      currencyCode: "SEK",
      idempotencyKey: "opportunity_1",
    });
    const replayed = await createOpportunity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Expansion 2027",
        amountMinor: 100_000,
        currencyCode: "SEK",
        idempotencyKey: "opportunity_1",
      },
    );

    expect(replayed.replayed).toBe(true);
    expect(replayed.opportunity.recordId).toBe(first.opportunity.recordId);
    expect(repository.opportunities.size).toBe(1);
  });

  test("rejects opportunity with invalid money", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );
    const account = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      idempotencyKey: "account_1",
    });

    await expect(
      createOpportunity(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Bad amount",
        amountMinor: Number.MAX_SAFE_INTEGER + 1,
        currencyCode: "SEK",
        idempotencyKey: "opportunity_bad_amount",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Money amount must use safe integer minor units",
    });

    await expect(
      createOpportunity(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Bad currency",
        amountMinor: 1_000,
        currencyCode: "US",
        idempotencyKey: "opportunity_bad_currency",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Money currency must be an ISO 4217 code",
    });
  });

  test("returns account summary with open opportunities", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );
    const account = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      idempotencyKey: "account_1",
    });
    await createOpportunity(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      name: "Open deal",
      amountMinor: 50_000,
      currencyCode: "SEK",
      idempotencyKey: "opportunity_open",
    });
    const wonOpportunity = await createOpportunity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Won deal",
        amountMinor: 25_000,
        currencyCode: "SEK",
        idempotencyKey: "opportunity_won",
      },
    );
    repository.opportunities.set(wonOpportunity.opportunity.recordId, {
      ...wonOpportunity.opportunity,
      status: "won",
      wonAt: now,
    });

    const summary = await getAccountSummary(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
    );

    expect(summary.organization.recordId).toBe(organization.organization.recordId);
    expect(summary.account.recordId).toBe(account.account.recordId);
    expect(summary.openOpportunities).toHaveLength(1);
    expect(summary.openOpportunities[0]).toMatchObject({ name: "Open deal" });
  });

  test("denies account summary for account from another team", async () => {
    const repository = new MemoryCrmRepository();
    const otherAccount: Account = {
      recordId: "account_other",
      teamId: "team_2",
      organizationId: "org_other",
      accountType: "customer",
      relationshipStatus: "active",
      legalEntityId: null,
      primaryOwnerPrincipalId: null,
      customerSince: null,
      churnedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    repository.accounts.set(otherAccount.recordId, otherAccount);

    await expect(
      getAccountSummary(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: otherAccount.recordId,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Account not found",
    });
  });

  test("forbids create organization for viewer", async () => {
    const repository = new MemoryCrmRepository();
    repository.role = "viewer";

    await expect(
      createOrganization(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot create organizations for this team",
    });
  });

  test("allows record-granted account summary without full team CRM read access", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );
    const account = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      idempotencyKey: "account_1",
    });
    repository.grants.push(
      {
        id: "grant_org_read",
        teamId: "team_1",
        recordId: organization.organization.recordId,
        principalId: "api_key_1",
        action: "read",
        grantedByActorId: "user_1",
        createdAt: now,
        expiresAt: null,
      },
      {
        id: "grant_account_read",
        teamId: "team_1",
        recordId: account.account.recordId,
        principalId: "api_key_1",
        action: "read",
        grantedByActorId: "user_1",
        createdAt: now,
        expiresAt: null,
      },
    );

    const summary = await getAccountSummary(
      repository as unknown as CrmUseCaseRepository,
      {
        actor: { id: "api_key_1", type: "api_key", teamId: "team_1", permissions: [] },
        requestId: "api_request_1",
        teamId: "team_1",
      },
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
    );

    expect(summary.account.recordId).toBe(account.account.recordId);
    expect(summary.organization.recordId).toBe(organization.organization.recordId);
  });

  test("evaluates CRM grants against request principal id", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );
    const account = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      idempotencyKey: "account_1",
    });
    repository.grants.push(
      {
        id: "grant_org_read",
        teamId: "team_1",
        recordId: organization.organization.recordId,
        principalId: "user_1",
        action: "read",
        grantedByActorId: "user_1",
        createdAt: now,
        expiresAt: null,
      },
      {
        id: "grant_account_read",
        teamId: "team_1",
        recordId: account.account.recordId,
        principalId: "user_1",
        action: "read",
        grantedByActorId: "user_1",
        createdAt: now,
        expiresAt: null,
      },
    );

    const summary = await getAccountSummary(
      repository as unknown as CrmUseCaseRepository,
      {
        actor: { id: "api_key_1", type: "api_key", teamId: "team_1", permissions: [] },
        principalId: "user_1",
        requestId: "api_request_1",
        teamId: "team_1",
      },
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
    );

    expect(summary.account.recordId).toBe(account.account.recordId);
    expect(summary.organization.recordId).toBe(organization.organization.recordId);
  });

  test("hides unauthorized CRM records as not found", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );
    const account = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      idempotencyKey: "account_1",
    });

    await expect(
      getAccountSummary(
        repository as unknown as CrmUseCaseRepository,
        {
          actor: { id: "api_key_1", type: "api_key", teamId: "team_1", permissions: [] },
          requestId: "api_request_1",
          teamId: "team_1",
        },
        {
          teamId: "team_1",
          accountId: account.account.recordId,
        },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Account not found",
    });
  });

  test("redacts fields through CRM field security even for team roles", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        organizationNumber: "556123-4567",
        idempotencyKey: "org_1",
      },
    );
    const account = await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      idempotencyKey: "account_1",
    });
    repository.fieldPolicies.push({
      id: "policy_hide_org_number",
      teamId: "team_1",
      targetRecordId: organization.organization.recordId,
      objectTypeId: "organization",
      principalId: null,
      fieldId: "organizationNumber",
      action: "read",
      effect: "deny",
    });

    const summary = await getAccountSummary(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
    );

    expect(summary.organization.legalName).toBe("Acme AB");
    expect(summary.organization.organizationNumber).toBeUndefined();
  });

  test("rejects field writes blocked by CRM field security", async () => {
    const repository = new MemoryCrmRepository();
    const organization = await createOrganization(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        idempotencyKey: "org_1",
      },
    );
    repository.fieldPolicies.push({
      id: "policy_deny_account_type_write",
      teamId: "team_1",
      targetRecordId: null,
      objectTypeId: "account",
      principalId: null,
      fieldId: "accountType",
      action: "write",
      effect: "deny",
    });

    await expect(
      createAccount(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        organizationId: organization.organization.recordId,
        accountType: "customer",
        idempotencyKey: "account_1",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: 'Field "accountType" is not writable',
    });
  });
});
