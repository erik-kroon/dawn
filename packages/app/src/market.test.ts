import { describe, expect, test } from "bun:test";

import type {
  Account,
  AccountContactSummary,
  Actor,
  Contact,
  CrmFieldSecurityPolicy,
  CrmRecord,
  CrmRecordGrant,
  LegalEntity,
  MarketCompany,
  MarketCompanySnapshot,
  MarketProspect,
  Opportunity,
  Organization,
  Party,
  PartyType,
  Person,
  TeamRole,
} from "@dawn/domain";

import { listAccountTimeline } from "./crm";
import type { AuditLogEntry, IdempotencyResult, TransactionReviewContext } from "./index";
import {
  createMarketProspect,
  promoteMarketProspect,
  seedMarketCompany,
  type MarketOriginUseCaseRepository,
} from "./market";

const now = "2026-06-20T10:00:00.000Z";
const context: TransactionReviewContext = {
  actor: { id: "user_1", type: "user" },
  teamId: "team_1",
  requestId: "req_market_1",
};

class MemoryMarketRepository {
  memberships = new Map<string, TeamRole>([
    ["user_1:team_1", "member"],
    ["user_1:team_2", "member"],
  ]);
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  auditEvents: AuditLogEntry[] = [];
  outboxEvents: unknown[] = [];
  records = new Map<string, CrmRecord>();
  parties = new Map<string, Party>();
  organizations = new Map<string, Organization>();
  legalEntities = new Map<string, LegalEntity>();
  accounts = new Map<string, Account>();
  people = new Map<string, Person>();
  contacts = new Map<string, Contact>();
  opportunities = new Map<string, Opportunity>();
  marketCompanies = new Map<string, MarketCompany>();
  marketCompanySnapshots = new Map<string, MarketCompanySnapshot>();
  marketProspects = new Map<string, MarketProspect>();
  grants: CrmRecordGrant[] = [];
  fieldPolicies: CrmFieldSecurityPolicy[] = [];

  async withTransaction<T>(callback: (repository: any) => Promise<T>) {
    return callback(this);
  }

  async ensureDefaultWorkspace(_actor: Actor) {
    return { teamId: "team_1" };
  }

  async getMembership(actor: Actor, teamId: string) {
    const role = this.memberships.get(`${actor.id}:${teamId}`);
    return role ? { role } : null;
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

  async appendAuditEvent(input: Omit<AuditLogEntry, "id" | "occurredAt">) {
    this.auditEvents.push({
      id: `audit_${this.auditEvents.length + 1}`,
      occurredAt: new Date(Date.parse(now) + this.auditEvents.length * 1000).toISOString(),
      ...input,
    });
  }

  async appendOutboxEvent(input: unknown) {
    this.outboxEvents.push(input);
  }

  async listAuditEvents(input: {
    teamId: string;
    limit: number;
    action?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    requestId?: string | null;
    metadata?: Record<string, string>;
  }) {
    return this.auditEvents
      .filter((event) => event.teamId === input.teamId)
      .filter((event) => !input.action || event.action === input.action)
      .filter((event) => !input.entityType || event.entityType === input.entityType)
      .filter((event) => !input.entityId || event.entityId === input.entityId)
      .filter((event) => !input.requestId || event.requestId === input.requestId)
      .filter(
        (event) =>
          !input.metadata ||
          Object.entries(input.metadata).every(([key, value]) => event.metadata[key] === value),
      )
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, input.limit);
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

  async getCrmRecordForTeam(teamId: string, recordId: string) {
    const record = this.records.get(recordId);
    return record?.teamId === teamId ? record : null;
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

  async createCrmParty(input: { recordId: string; teamId: string; partyType: PartyType }) {
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

  async getOrganizationForTeam(teamId: string, recordId: string) {
    const organization = this.organizations.get(recordId);
    return organization?.teamId === teamId ? organization : null;
  }

  async listOrganizationsForDuplicateCheck(input: {
    teamId: string;
    legalName: string;
    organizationNumber?: string | null;
    limit: number;
  }) {
    const legalNameKey = input.legalName.trim().toLocaleLowerCase("sv-SE");

    return [...this.organizations.values()]
      .filter(
        (organization) =>
          organization.teamId === input.teamId &&
          ((input.organizationNumber &&
            organization.organizationNumber === input.organizationNumber) ||
            organization.legalName.trim().toLocaleLowerCase("sv-SE") === legalNameKey),
      )
      .slice(0, input.limit);
  }

  async getLegalEntityForTeam(teamId: string, recordId: string) {
    const legalEntity = this.legalEntities.get(recordId);
    return legalEntity?.teamId === teamId ? legalEntity : null;
  }

  async createAccount(input: {
    recordId: string;
    teamId: string;
    organizationId: string;
    accountType?: Account["accountType"];
    legalEntityId?: string | null;
    relationshipStatus?: Account["relationshipStatus"];
    lifecycleStage?: Account["lifecycleStage"];
    segment?: string | null;
    territory?: string | null;
    primaryOwnerPrincipalId?: string | null;
    customerSince?: string | null;
    churnedAt?: string | null;
  }) {
    const account: Account = {
      recordId: input.recordId,
      teamId: input.teamId,
      organizationId: input.organizationId,
      accountType: input.accountType ?? "prospect",
      relationshipStatus: input.relationshipStatus ?? "active",
      legalEntityId: input.legalEntityId ?? null,
      lifecycleStage: input.lifecycleStage ?? null,
      segment: input.segment ?? null,
      territory: input.territory ?? null,
      primaryOwnerPrincipalId: input.primaryOwnerPrincipalId ?? null,
      customerSince: input.customerSince ?? null,
      churnedAt: input.churnedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(account.recordId, account);
    return account;
  }

  async getAccountForTeam(teamId: string, recordId: string) {
    const account = this.accounts.get(recordId);
    return account?.teamId === teamId ? account : null;
  }

  async listAccountsForTeam(input: {
    teamId: string;
    legalEntityId?: string | null;
    relationshipStatus?: Account["relationshipStatus"] | null;
    accountType?: Account["accountType"] | null;
    recordIds?: readonly string[] | null;
    organizationIds?: readonly string[] | null;
  }) {
    return [...this.accounts.values()].filter(
      (account) =>
        account.teamId === input.teamId &&
        (!input.recordIds || input.recordIds.includes(account.recordId)) &&
        (!input.organizationIds || input.organizationIds.includes(account.organizationId)) &&
        (!input.legalEntityId || account.legalEntityId === input.legalEntityId) &&
        (!input.relationshipStatus || account.relationshipStatus === input.relationshipStatus) &&
        (!input.accountType || account.accountType === input.accountType),
    );
  }

  async createOpportunity(input: {
    recordId: string;
    teamId: string;
    accountId: string;
    name: string;
    amountMinor: number;
    currencyCode: string;
    stage: Opportunity["stage"];
    status: Opportunity["status"];
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
      status: input.status,
      stage: input.stage,
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

  async getOpportunityForTeam(teamId: string, recordId: string) {
    const opportunity = this.opportunities.get(recordId);
    return opportunity?.teamId === teamId ? opportunity : null;
  }

  async listContactsForAccount(
    _teamId: string,
    _accountId: string,
  ): Promise<AccountContactSummary[]> {
    return [];
  }

  async listOpenOpportunitiesForAccount(teamId: string, accountId: string) {
    return [...this.opportunities.values()].filter(
      (opportunity) =>
        opportunity.teamId === teamId &&
        opportunity.accountId === accountId &&
        opportunity.status === "open",
    );
  }

  async listOpportunitiesForAccount(teamId: string, accountId: string) {
    return [...this.opportunities.values()].filter(
      (opportunity) => opportunity.teamId === teamId && opportunity.accountId === accountId,
    );
  }

  async getPersonForTeam(_teamId: string, _recordId: string): Promise<Person | null> {
    return null;
  }

  async getContactForTeam(_teamId: string, _recordId: string): Promise<Contact | null> {
    return null;
  }

  async getMarketCompanyByIdentity(input: { countryCode: string; organizationNumber: string }) {
    return (
      [...this.marketCompanies.values()].find(
        (company) =>
          company.countryCode === input.countryCode &&
          company.organizationNumber === input.organizationNumber &&
          company.status === "active",
      ) ?? null
    );
  }

  async getMarketCompany(companyId: string) {
    return this.marketCompanies.get(companyId) ?? null;
  }

  async upsertMarketCompany(input: {
    companyId: string;
    countryCode: string;
    organizationNumber: string;
    legalName: string;
  }) {
    const existing = await this.getMarketCompanyByIdentity(input);
    const company: MarketCompany = existing
      ? { ...existing, legalName: input.legalName, updatedAt: now }
      : {
          id: input.companyId,
          countryCode: input.countryCode,
          organizationNumber: input.organizationNumber,
          legalName: input.legalName,
          status: "active",
          createdAt: now,
          updatedAt: now,
        };
    this.marketCompanies.set(company.id, company);
    return company;
  }

  async getMarketCompanySnapshot(snapshotId: string) {
    return this.marketCompanySnapshots.get(snapshotId) ?? null;
  }

  async getMarketCompanySnapshotByContentHash(input: {
    companyId: string;
    provider: string;
    providerCapability: string;
    contentHash: string;
  }) {
    return (
      [...this.marketCompanySnapshots.values()].find(
        (snapshot) =>
          snapshot.companyId === input.companyId &&
          snapshot.provider === input.provider &&
          snapshot.providerCapability === input.providerCapability &&
          snapshot.contentHash === input.contentHash,
      ) ?? null
    );
  }

  async createMarketCompanySnapshot(input: {
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
  }) {
    const snapshot: MarketCompanySnapshot = {
      id: input.snapshotId,
      companyId: input.companyId,
      provider: input.provider,
      providerCapability: input.providerCapability,
      providerCompanyId: input.providerCompanyId,
      retrievedAt: input.retrievedAt,
      normalizedFields: input.normalizedFields,
      rawPayload: input.rawPayload,
      rawPayloadReference: input.rawPayloadReference,
      contentHash: input.contentHash,
      createdAt: now,
    };
    this.marketCompanySnapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  async createMarketProspect(input: {
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
  }) {
    const prospect: MarketProspect = {
      id: input.prospectId,
      teamId: input.teamId,
      companyId: input.companyId,
      companySnapshotId: input.companySnapshotId,
      status: "created",
      sourceGoalId: input.sourceGoalId,
      sourceRunId: input.sourceRunId,
      icpId: input.icpId,
      segmentId: input.segmentId,
      sourceProvider: input.sourceProvider,
      sourceProviderCapability: input.sourceProviderCapability,
      sourceDecisionSummary: input.sourceDecisionSummary,
      createdByActorId: input.createdByActorId,
      promotedAccountId: null,
      promotedOpportunityId: null,
      promotedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.marketProspects.set(prospect.id, prospect);
    return prospect;
  }

  async getMarketProspectForTeam(teamId: string, prospectId: string) {
    const prospect = this.marketProspects.get(prospectId);
    return prospect?.teamId === teamId ? prospect : null;
  }

  async getMarketProspectForOpportunity(teamId: string, opportunityId: string) {
    return (
      [...this.marketProspects.values()].find(
        (prospect) =>
          prospect.teamId === teamId && prospect.promotedOpportunityId === opportunityId,
      ) ?? null
    );
  }

  async listMarketProspectsForAccount(teamId: string, accountId: string) {
    return [...this.marketProspects.values()].filter(
      (prospect) => prospect.teamId === teamId && prospect.promotedAccountId === accountId,
    );
  }

  async promoteMarketProspect(input: {
    teamId: string;
    prospectId: string;
    accountId: string;
    opportunityId: string;
    promotedAt: string;
  }) {
    const prospect = this.marketProspects.get(input.prospectId);

    if (!prospect || prospect.teamId !== input.teamId) {
      return null;
    }

    const promoted: MarketProspect = {
      ...prospect,
      status: "promoted",
      promotedAccountId: input.accountId,
      promotedOpportunityId: input.opportunityId,
      promotedAt: input.promotedAt,
      updatedAt: input.promotedAt,
    };
    this.marketProspects.set(promoted.id, promoted);
    return promoted;
  }
}

describe("market origin use cases", () => {
  test("seeds canonical company snapshots idempotently by content hash", async () => {
    const repository = new MemoryMarketRepository();
    const first = await seedMarketCompany(
      repository as unknown as MarketOriginUseCaseRepository,
      context,
      {
        teamId: "team_1",
        provider: "tic",
        providerCapability: "company_profile",
        providerCompanyId: "tic:5561234567",
        retrievedAt: "2026-06-20T10:00:00.000Z",
        legalName: "Acme AB",
        organizationNumber: "556123-4567",
        rawPayload: { name: "Acme AB", orgNo: "5561234567" },
        rawPayloadReference: "r2://tic/acme.json",
        idempotencyKey: "seed_1",
      },
    );
    const replayed = await seedMarketCompany(
      repository as unknown as MarketOriginUseCaseRepository,
      context,
      {
        teamId: "team_1",
        provider: "tic",
        providerCapability: "company_profile",
        providerCompanyId: "tic:5561234567",
        retrievedAt: "2026-06-20T10:00:00.000Z",
        legalName: "Acme AB",
        organizationNumber: "556123-4567",
        rawPayload: { name: "Acme AB", orgNo: "5561234567" },
        rawPayloadReference: "r2://tic/acme.json",
        idempotencyKey: "seed_1",
      },
    );
    const sameContentNewCommand = await seedMarketCompany(
      repository as unknown as MarketOriginUseCaseRepository,
      context,
      {
        teamId: "team_1",
        provider: "tic",
        providerCapability: "company_profile",
        providerCompanyId: "tic:5561234567",
        retrievedAt: "2026-06-20T11:00:00.000Z",
        legalName: "Acme AB",
        organizationNumber: "5561234567",
        rawPayload: { orgNo: "5561234567", name: "Acme AB" },
        rawPayloadReference: "r2://tic/acme.json",
        idempotencyKey: "seed_2",
      },
    );

    expect(first.company.organizationNumber).toBe("5561234567");
    expect(replayed.replayed).toBe(true);
    expect(sameContentNewCommand.company.id).toBe(first.company.id);
    expect(sameContentNewCommand.snapshot.id).toBe(first.snapshot.id);
    expect(repository.marketCompanies).toHaveLength(1);
    expect(repository.marketCompanySnapshots).toHaveLength(1);
    expect(repository.auditEvents.map((event) => event.action)).toContain("market.company.seeded");
  });

  test("creates and promotes prospects while keeping team-private lineage on timeline", async () => {
    const repository = new MemoryMarketRepository();
    const seed = await seedMarketCompany(
      repository as unknown as MarketOriginUseCaseRepository,
      context,
      {
        teamId: "team_1",
        provider: "tic",
        providerCapability: "company_profile",
        legalName: "Beta AB",
        organizationNumber: "556987-6543",
        rawPayload: { score: 91 },
        idempotencyKey: "seed_beta",
      },
    );
    const prospect = await createMarketProspect(
      repository as unknown as MarketOriginUseCaseRepository,
      context,
      {
        teamId: "team_1",
        companyId: seed.company.id,
        companySnapshotId: seed.snapshot.id,
        sourceGoalId: "goal_1",
        sourceRunId: "run_1",
        icpId: "icp_1",
        segmentId: "segment_1",
        sourceDecisionSummary: "Strong Fortnox-native ICP fit",
        idempotencyKey: "prospect_beta",
      },
    );
    const promoted = await promoteMarketProspect(
      repository as unknown as MarketOriginUseCaseRepository,
      context,
      {
        teamId: "team_1",
        prospectId: prospect.prospect.id,
        opportunityName: "Beta quote-to-cash pilot",
        amountMinor: 125_000,
        currencyCode: "SEK",
        idempotencyKey: "promote_beta",
      },
    );
    const replayedPromotion = await promoteMarketProspect(
      repository as unknown as MarketOriginUseCaseRepository,
      context,
      {
        teamId: "team_1",
        prospectId: prospect.prospect.id,
        opportunityName: "Beta quote-to-cash pilot",
        amountMinor: 125_000,
        currencyCode: "SEK",
        idempotencyKey: "promote_beta",
      },
    );

    await expect(
      promoteMarketProspect(repository as unknown as MarketOriginUseCaseRepository, context, {
        teamId: "team_1",
        prospectId: prospect.prospect.id,
        opportunityName: "Different pilot",
        amountMinor: 250_000,
        currencyCode: "SEK",
        idempotencyKey: "promote_beta_conflict",
      }),
    ).rejects.toThrow("Prospect is already promoted");

    const timeline = await listAccountTimeline(
      repository as unknown as MarketOriginUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: promoted.account.recordId,
      },
    );

    expect(promoted.marketOrigin).toMatchObject({
      prospectId: prospect.prospect.id,
      companyId: seed.company.id,
      companySnapshotId: seed.snapshot.id,
      sourceGoalId: "goal_1",
      sourceRunId: "run_1",
      icpId: "icp_1",
      segmentId: "segment_1",
    });
    expect(promoted.account.organizationId).toBe(promoted.organization.recordId);
    expect(promoted.opportunity.accountId).toBe(promoted.account.recordId);
    expect(replayedPromotion.replayed).toBe(true);
    expect(repository.opportunities).toHaveLength(1);
    expect(await repository.getMarketProspectForTeam("team_2", prospect.prospect.id)).toBeNull();
    expect(
      await repository.listMarketProspectsForAccount("team_2", promoted.account.recordId),
    ).toEqual([]);
    expect(timeline.entries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "market.company.seeded",
        "market.prospect.created",
        "market.prospect.promoted",
        "crm.opportunity.created",
      ]),
    );
  });
});
