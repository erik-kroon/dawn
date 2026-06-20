import { describe, expect, test } from "bun:test";

import type {
  Account,
  AccountContactSummary,
  Actor,
  Contact,
  CrmFieldDefinition,
  CrmFieldSecurityPolicy,
  CrmObjectTypeDefinition,
  CrmOptionSet,
  CrmOptionValue,
  CrmRecord,
  CrmRecordFieldValue,
  CrmRecordFieldValueDraft,
  CrmRecordGrant,
  IntegrationConnection,
  LegalEntity,
  Organization,
  Opportunity,
  Party,
  Person,
  TeamRole,
} from "@dawn/domain";

import {
  archiveAccount,
  archiveContact,
  archiveOpportunity,
  createAccount,
  createContact,
  createFieldDefinition,
  createLegalEntity,
  createObjectTypeDefinition,
  createOpportunity,
  createOrganization,
  getAccountSummary,
  linkAccountProviderCustomer,
  listAccountTimeline,
  listAccounts,
  setRecordFieldValue,
  suggestAccountDuplicates,
  updateAccount,
  updateContact,
  updateOpportunity,
  updateOpportunityStage,
  type CrmProviderObjectRecord,
  type CrmRepository,
  type CrmUseCaseRepository,
} from "./crm";
import type { AuditLogEntry } from "./index";

const now = "2026-06-15T10:00:00.000Z";

class MemoryCrmRepository {
  role: TeamRole = "member";
  actor: Actor = { id: "user_1", type: "user" };
  records = new Map<string, CrmRecord>();
  parties = new Map<string, Party>();
  organizations = new Map<string, Organization>();
  people = new Map<string, Person>();
  legalEntities = new Map<string, LegalEntity>();
  accounts = new Map<string, Account>();
  contacts = new Map<string, Contact>();
  opportunities = new Map<string, Opportunity>();
  integrationConnections = new Map<string, IntegrationConnection>();
  providerObjects = new Map<string, CrmProviderObjectRecord>();
  objectTypeDefinitions = new Map<string, CrmObjectTypeDefinition>();
  fieldDefinitions = new Map<string, CrmFieldDefinition>();
  optionSets = new Map<string, CrmOptionSet>();
  optionValues = new Map<string, CrmOptionValue>();
  recordFieldValues = new Map<string, CrmRecordFieldValue>();
  grants: CrmRecordGrant[] = [];
  fieldPolicies: CrmFieldSecurityPolicy[] = [];
  idempotency = new Map<string, { fingerprint: string; result: unknown }>();
  auditEvents: AuditLogEntry[] = [];
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

  async appendAuditEvent(input: {
    teamId: string;
    actorId: string;
    requestId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }) {
    this.auditEvents.push({
      id: `audit_${this.auditEvents.length + 1}`,
      occurredAt: new Date(Date.parse(now) + this.auditEvents.length * 1000).toISOString(),
      ...input,
    });
  }

  async appendOutboxEvent(input: unknown) {
    this.outboxEvents.push(input);
  }

  async getOrganizationForTeam(teamId: string, recordId: string) {
    const organization = this.organizations.get(recordId);
    return organization?.teamId === teamId ? organization : null;
  }

  async getPersonForTeam(teamId: string, recordId: string) {
    const person = this.people.get(recordId);
    return person?.teamId === teamId ? person : null;
  }

  async getLegalEntityForTeam(teamId: string, recordId: string) {
    const legalEntity = this.legalEntities.get(recordId);
    return legalEntity?.teamId === teamId ? legalEntity : null;
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

  async getContactForTeam(teamId: string, recordId: string) {
    const contact = this.contacts.get(recordId);
    return contact?.teamId === teamId ? contact : null;
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

  async listContactsForAccount(
    teamId: string,
    accountId: string,
  ): Promise<AccountContactSummary[]> {
    return [...this.contacts.values()]
      .filter((contact) => contact.teamId === teamId && contact.accountId === accountId)
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
      .map((contact) => ({
        contact,
        person: this.people.get(contact.personId)!,
      }));
  }

  async getCrmObjectTypeDefinitionForTeam(teamId: string, objectTypeId: string) {
    return (
      [...this.objectTypeDefinitions.values()].find(
        (objectType) => objectType.teamId === teamId && objectType.objectTypeId === objectTypeId,
      ) ?? null
    );
  }

  async createCrmObjectTypeDefinition(input: {
    id: string;
    teamId: string;
    objectTypeId: string;
    label: string;
    isCustom: boolean;
    createdByActorId: string;
  }) {
    const objectType: CrmObjectTypeDefinition = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.objectTypeDefinitions.set(objectType.id, objectType);
    return objectType;
  }

  async getCrmFieldDefinitionForTeam(teamId: string, fieldDefinitionId: string) {
    const fieldDefinition = this.fieldDefinitions.get(fieldDefinitionId);
    return fieldDefinition?.teamId === teamId ? fieldDefinition : null;
  }

  async getCrmFieldDefinitionByStableKey(input: {
    teamId: string;
    objectTypeId: string;
    stableKey: string;
  }) {
    return (
      [...this.fieldDefinitions.values()].find(
        (fieldDefinition) =>
          fieldDefinition.teamId === input.teamId &&
          fieldDefinition.objectTypeId === input.objectTypeId &&
          fieldDefinition.stableKey === input.stableKey,
      ) ?? null
    );
  }

  async createCrmFieldDefinition(input: {
    id: string;
    teamId: string;
    objectTypeDefinitionId: string;
    objectTypeId: string;
    stableKey: string;
    label: string;
    fieldType: CrmFieldDefinition["fieldType"];
    cardinality: CrmFieldDefinition["cardinality"];
    isRequired: boolean;
    isUnique: boolean;
    allowedReferenceObjectTypeId: string | null;
    createdByActorId: string;
  }) {
    const fieldDefinition: CrmFieldDefinition = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldDefinitions.set(fieldDefinition.id, fieldDefinition);
    return fieldDefinition;
  }

  async createCrmOptionSet(input: {
    id: string;
    teamId: string;
    fieldDefinitionId: string;
    stableKey: string;
    label: string;
    createdByActorId: string;
  }) {
    const optionSet: CrmOptionSet = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.optionSets.set(optionSet.id, optionSet);
    return optionSet;
  }

  async createCrmOptionValues(
    input: {
      id: string;
      teamId: string;
      optionSetId: string;
      stableKey: string;
      label: string;
      sortOrder: number;
    }[],
  ) {
    const optionValues = input.map((optionValue) => ({
      ...optionValue,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));

    for (const optionValue of optionValues) {
      this.optionValues.set(optionValue.id, optionValue);
    }

    return optionValues;
  }

  async listCrmOptionValuesForField(input: { teamId: string; fieldDefinitionId: string }) {
    const optionSet = [...this.optionSets.values()].find(
      (set) => set.teamId === input.teamId && set.fieldDefinitionId === input.fieldDefinitionId,
    );

    if (!optionSet) {
      return [];
    }

    return [...this.optionValues.values()]
      .filter(
        (optionValue) =>
          optionValue.teamId === input.teamId && optionValue.optionSetId === optionSet.id,
      )
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async upsertCrmRecordFieldValue(input: {
    id: string;
    teamId: string;
    recordId: string;
    fieldDefinitionId: string;
    position?: number;
    value: CrmRecordFieldValueDraft;
    updatedByActorId: string;
  }) {
    const existing = [...this.recordFieldValues.values()].find(
      (fieldValue) =>
        fieldValue.teamId === input.teamId &&
        fieldValue.recordId === input.recordId &&
        fieldValue.fieldDefinitionId === input.fieldDefinitionId &&
        fieldValue.position === (input.position ?? 0),
    );
    const fieldValue: CrmRecordFieldValue = {
      id: existing?.id ?? input.id,
      teamId: input.teamId,
      recordId: input.recordId,
      fieldDefinitionId: input.fieldDefinitionId,
      position: input.position ?? 0,
      ...input.value,
      updatedByActorId: input.updatedByActorId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.recordFieldValues.set(fieldValue.id, fieldValue);
    return fieldValue;
  }

  async findCrmRecordFieldValueByFieldValue(input: {
    teamId: string;
    fieldDefinitionId: string;
    value: CrmRecordFieldValueDraft;
    excludeRecordId?: string | null;
  }) {
    return (
      [...this.recordFieldValues.values()].find(
        (fieldValue) =>
          fieldValue.teamId === input.teamId &&
          fieldValue.fieldDefinitionId === input.fieldDefinitionId &&
          fieldValue.recordId !== input.excludeRecordId &&
          crmFieldValueMatches(fieldValue, input.value),
      ) ?? null
    );
  }

  async listRecordIdsByCrmFieldValue(input: {
    teamId: string;
    fieldDefinitionId: string;
    value: CrmRecordFieldValueDraft;
  }) {
    return [...this.recordFieldValues.values()]
      .filter(
        (fieldValue) =>
          fieldValue.teamId === input.teamId &&
          fieldValue.fieldDefinitionId === input.fieldDefinitionId &&
          crmFieldValueMatches(fieldValue, input.value),
      )
      .map((fieldValue) => fieldValue.recordId);
  }

  async incrementCrmRecordVersion(input: {
    teamId: string;
    recordId: string;
    expectedVersion: number;
    actorId: string;
  }) {
    const record = this.records.get(input.recordId);

    if (!record || record.teamId !== input.teamId || record.version !== input.expectedVersion) {
      return null;
    }

    const updated: CrmRecord = {
      ...record,
      version: record.version + 1,
      updatedByActorId: input.actorId,
      updatedAt: now,
    };
    this.records.set(updated.id, updated);
    return updated;
  }

  async archiveCrmRecord(input: {
    teamId: string;
    recordId: string;
    expectedVersion: number;
    actorId: string;
  }) {
    const record = this.records.get(input.recordId);

    if (
      !record ||
      record.teamId !== input.teamId ||
      record.version !== input.expectedVersion ||
      record.lifecycleState !== "active"
    ) {
      return null;
    }

    const updated: CrmRecord = {
      ...record,
      lifecycleState: "archived",
      version: record.version + 1,
      updatedByActorId: input.actorId,
      updatedAt: now,
      archivedAt: now,
    };
    this.records.set(updated.id, updated);
    return updated;
  }

  async getOpportunityForTeam(teamId: string, recordId: string) {
    const opportunity = this.opportunities.get(recordId);
    return opportunity?.teamId === teamId ? opportunity : null;
  }

  async getIntegrationConnectionForTeam(teamId: string, connectionId: string) {
    const connection = this.integrationConnections.get(connectionId);
    return connection?.teamId === teamId ? connection : null;
  }

  async getProviderObjectForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
  }) {
    return this.providerObjects.get(providerObjectKey(input)) ?? null;
  }

  async listProviderObjectsForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectTypes: readonly string[];
  }) {
    return [...this.providerObjects.values()]
      .filter((object) => object.teamId === input.teamId)
      .filter((object) => object.provider === input.provider)
      .filter((object) => input.providerObjectTypes.includes(object.providerObjectType));
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

  async listMarketProspectsForAccount(_teamId: string, _accountId: string) {
    return [];
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

  async createCrmParty(input: { recordId: string; teamId: string; partyType: Party["partyType"] }) {
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

  async createPerson(input: {
    recordId: string;
    teamId: string;
    givenName?: string | null;
    familyName?: string | null;
    displayName: string;
    email?: string | null;
    phoneNumber?: string | null;
  }) {
    const person: Person = {
      recordId: input.recordId,
      teamId: input.teamId,
      givenName: input.givenName ?? null,
      familyName: input.familyName ?? null,
      displayName: input.displayName,
      email: input.email ?? null,
      phoneNumber: input.phoneNumber ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.people.set(person.recordId, person);
    return person;
  }

  async updatePerson(input: {
    teamId: string;
    personId: string;
    givenName: string | null;
    familyName: string | null;
    displayName: string;
    email: string | null;
    phoneNumber: string | null;
  }) {
    const person = this.people.get(input.personId);

    if (!person || person.teamId !== input.teamId) {
      return null;
    }

    const updated: Person = {
      ...person,
      givenName: input.givenName,
      familyName: input.familyName,
      displayName: input.displayName,
      email: input.email,
      phoneNumber: input.phoneNumber,
      updatedAt: now,
    };
    this.people.set(updated.recordId, updated);
    return updated;
  }

  async createLegalEntity(input: {
    recordId: string;
    teamId: string;
    legalName: string;
    organizationNumber?: string | null;
    vatNumber?: string | null;
    countryCode: string;
    baseCurrency: string;
    fiscalYearStartMonth: number;
    status: LegalEntity["status"];
  }) {
    const legalEntity: LegalEntity = {
      recordId: input.recordId,
      teamId: input.teamId,
      legalName: input.legalName,
      organizationNumber: input.organizationNumber ?? null,
      vatNumber: input.vatNumber ?? null,
      countryCode: input.countryCode,
      baseCurrency: input.baseCurrency,
      fiscalYearStartMonth: input.fiscalYearStartMonth,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };
    this.legalEntities.set(legalEntity.recordId, legalEntity);
    return legalEntity;
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

  async updateAccount(input: {
    teamId: string;
    accountId: string;
    accountType: Account["accountType"];
    legalEntityId: string | null;
    relationshipStatus: Account["relationshipStatus"];
    lifecycleStage: Account["lifecycleStage"];
    segment: string | null;
    territory: string | null;
    primaryOwnerPrincipalId: string | null;
    customerSince: string | null;
    churnedAt: string | null;
  }) {
    const account = this.accounts.get(input.accountId);

    if (!account || account.teamId !== input.teamId) {
      return null;
    }

    const updated: Account = {
      ...account,
      accountType: input.accountType,
      legalEntityId: input.legalEntityId,
      relationshipStatus: input.relationshipStatus,
      lifecycleStage: input.lifecycleStage,
      segment: input.segment,
      territory: input.territory,
      primaryOwnerPrincipalId: input.primaryOwnerPrincipalId,
      customerSince: input.customerSince,
      churnedAt: input.churnedAt,
      updatedAt: now,
    };
    this.accounts.set(updated.recordId, updated);
    return updated;
  }

  async createContact(input: {
    recordId: string;
    teamId: string;
    accountId: string;
    personId: string;
    role?: string | null;
    isPrimary?: boolean | null;
  }) {
    const contact: Contact = {
      recordId: input.recordId,
      teamId: input.teamId,
      accountId: input.accountId,
      personId: input.personId,
      role: input.role ?? null,
      isPrimary: input.isPrimary ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.contacts.set(contact.recordId, contact);
    return contact;
  }

  async updateContact(input: {
    teamId: string;
    contactId: string;
    role: string | null;
    isPrimary: boolean;
  }) {
    const contact = this.contacts.get(input.contactId);

    if (!contact || contact.teamId !== input.teamId) {
      return null;
    }

    const updated: Contact = {
      ...contact,
      role: input.role,
      isPrimary: input.isPrimary,
      updatedAt: now,
    };
    this.contacts.set(updated.recordId, updated);
    return updated;
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

  async updateOpportunity(input: {
    teamId: string;
    opportunityId: string;
    name: string;
    amountMinor: number;
    currencyCode: string;
    expectedCloseDate: string | null;
    primaryOwnerPrincipalId: string | null;
  }) {
    const opportunity = this.opportunities.get(input.opportunityId);

    if (!opportunity || opportunity.teamId !== input.teamId) {
      return null;
    }

    const updated: Opportunity = {
      ...opportunity,
      name: input.name,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
      expectedCloseDate: input.expectedCloseDate,
      primaryOwnerPrincipalId: input.primaryOwnerPrincipalId,
      updatedAt: now,
    };
    this.opportunities.set(updated.recordId, updated);
    return updated;
  }

  async updateOpportunityStage(input: {
    teamId: string;
    opportunityId: string;
    stage: Opportunity["stage"];
    status: Opportunity["status"];
    actorId: string;
  }) {
    const opportunity = this.opportunities.get(input.opportunityId);

    if (!opportunity || opportunity.teamId !== input.teamId) {
      return null;
    }

    const updated: Opportunity = {
      ...opportunity,
      stage: input.stage,
      status: input.status,
      wonAt: input.status === "won" ? (opportunity.wonAt ?? now) : (opportunity.wonAt ?? null),
      lostAt: input.stage === "lost" ? (opportunity.lostAt ?? now) : (opportunity.lostAt ?? null),
      updatedAt: now,
    };
    this.opportunities.set(updated.recordId, updated);
    return updated;
  }

  async upsertProviderObject(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
    connectionId?: string | null;
    internalEntityType?: string | null;
    internalEntityId?: string | null;
    rawPayload: Record<string, unknown>;
  }) {
    const key = providerObjectKey(input);
    const existing = this.providerObjects.get(key);
    const object: CrmProviderObjectRecord = {
      id: existing?.id ?? key,
      teamId: input.teamId,
      provider: input.provider,
      providerObjectType: input.providerObjectType,
      providerObjectId: input.providerObjectId,
      internalEntityType: input.internalEntityType ?? null,
      internalEntityId: input.internalEntityId ?? null,
      rawPayload: input.rawPayload,
    };
    this.providerObjects.set(key, object);
  }
}

function crmFieldValueMatches(fieldValue: CrmRecordFieldValue, expected: CrmRecordFieldValueDraft) {
  return (
    fieldValue.textValue === expected.textValue &&
    fieldValue.integerValue === expected.integerValue &&
    fieldValue.booleanValue === expected.booleanValue &&
    fieldValue.dateValue === expected.dateValue &&
    fieldValue.amountMinor === expected.amountMinor &&
    fieldValue.currencyCode === expected.currencyCode &&
    fieldValue.optionValueId === expected.optionValueId &&
    fieldValue.referenceRecordId === expected.referenceRecordId
  );
}

const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};

function providerObjectKey(input: {
  teamId: string;
  provider: string;
  providerObjectType: string;
  providerObjectId: string;
}) {
  return `${input.teamId}:${input.provider}:${input.providerObjectType}:${input.providerObjectId}`;
}

async function createAccountFixture(repository: MemoryCrmRepository, suffix: string) {
  const organization = await createOrganization(
    repository as unknown as CrmUseCaseRepository,
    context,
    {
      teamId: "team_1",
      legalName: `Acme ${suffix} AB`,
      idempotencyKey: `org_${suffix}`,
    },
  );

  return createAccount(repository as unknown as CrmUseCaseRepository, context, {
    teamId: "team_1",
    organizationId: organization.organization.recordId,
    idempotencyKey: `account_${suffix}`,
  });
}

function addFortnoxCustomerFixture(
  repository: MemoryCrmRepository,
  input: {
    connectionId?: string;
    providerCustomerId?: string;
    customerName?: string;
    internalEntityType?: string | null;
    internalEntityId?: string | null;
  } = {},
) {
  const connectionId = input.connectionId ?? "fortnox_connection_1";
  const providerCustomerId = input.providerCustomerId ?? "1001";
  const connection: IntegrationConnection = {
    id: connectionId,
    teamId: "team_1",
    category: "accounting",
    provider: "fortnox",
    providerConnectionId: "fortnox:team_1",
    displayName: "Fortnox Demo AB",
    status: "connected",
    capabilities: ["sync", "disconnect"],
    tokenKeyId: "fortnox-token",
    tokenLastFour: "1234",
    rawPayload: {},
    lastSyncAt: null,
    lastError: null,
    disabledAt: null,
    createdByActorId: "user_1",
    createdAt: now,
    updatedAt: now,
  };
  const providerObject: CrmProviderObjectRecord = {
    id: `fortnox:customer:${providerCustomerId}`,
    teamId: "team_1",
    provider: "fortnox",
    providerObjectType: "customer",
    providerObjectId: providerCustomerId,
    internalEntityType: input.internalEntityType ?? null,
    internalEntityId: input.internalEntityId ?? null,
    rawPayload: {
      integrationConnectionId: connection.id,
      providerConnectionId: connection.providerConnectionId,
      customerNumber: providerCustomerId,
      name: input.customerName ?? "Acme AB",
    },
  };
  repository.integrationConnections.set(connection.id, connection);
  repository.providerObjects.set(providerObjectKey(providerObject), providerObject);

  return { connection, providerObject };
}

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
      organizationNumber: "5561234567",
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

  test("creates multiple legal entities for a team", async () => {
    const repository = new MemoryCrmRepository();
    const first = await createLegalEntity(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      legalName: "Dawn Sverige AB",
      organizationNumber: "559001-0001",
      baseCurrency: "sek",
      idempotencyKey: "legal_entity_1",
    });
    const second = await createLegalEntity(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      legalName: "Dawn Norge AS",
      countryCode: "no",
      baseCurrency: "nok",
      fiscalYearStartMonth: 7,
      idempotencyKey: "legal_entity_2",
    });

    expect(first.legalEntity).toMatchObject({
      legalName: "Dawn Sverige AB",
      organizationNumber: "5590010001",
      countryCode: "SE",
      baseCurrency: "SEK",
      fiscalYearStartMonth: 1,
    });
    expect(second.legalEntity).toMatchObject({
      legalName: "Dawn Norge AS",
      countryCode: "NO",
      baseCurrency: "NOK",
      fiscalYearStartMonth: 7,
    });
    expect(repository.legalEntities.size).toBe(2);
    expect(repository.auditEvents.at(-1)).toMatchObject({ action: "crm.legal_entity.created" });
    expect(repository.outboxEvents.at(-1)).toMatchObject({ type: "crm.legal_entity.created" });
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

  test("suggests duplicate accounts by normalized organization number and legal name", async () => {
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
      accountType: "customer",
      idempotencyKey: "account_1",
    });
    repository.organizations.set("org_other_team", {
      recordId: "org_other_team",
      teamId: "team_2",
      legalName: "Acme AB",
      displayName: null,
      organizationNumber: "5561234567",
      countryCode: "SE",
      vatNumber: null,
      websiteDomain: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.accounts.set("account_other_team", {
      recordId: "account_other_team",
      teamId: "team_2",
      organizationId: "org_other_team",
      legalEntityId: null,
      accountType: "customer",
      relationshipStatus: "active",
      lifecycleStage: null,
      segment: null,
      territory: null,
      primaryOwnerPrincipalId: null,
      customerSince: null,
      churnedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await suggestAccountDuplicates(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "acme ab",
        organizationNumber: "556 123 4567",
      },
    );

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      account: { recordId: account.account.recordId, accountType: "customer" },
      organization: {
        recordId: organization.organization.recordId,
        legalName: "Acme AB",
        organizationNumber: "5561234567",
      },
      matchReasons: ["organization_number", "legal_name"],
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

    const redacted = await suggestAccountDuplicates(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Acme AB",
        organizationNumber: "5561234567",
      },
    );

    expect(redacted.suggestions[0]?.organization.organizationNumber).toBeUndefined();
    expect(redacted.suggestions[0]?.matchReasons).toEqual(["legal_name"]);
  });

  test("creates separate account roles for the same organization across legal entities", async () => {
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
    const legalEntity = await createLegalEntity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Dawn Sverige AB",
        idempotencyKey: "legal_entity_1",
      },
    );
    const roles: Account["accountType"][] = [
      "prospect",
      "customer",
      "partner",
      "supplier",
      "former_customer",
    ];

    for (const accountType of roles) {
      await createAccount(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        organizationId: organization.organization.recordId,
        legalEntityId: legalEntity.legalEntity.recordId,
        accountType,
        relationshipStatus: accountType === "former_customer" ? "churned" : "active",
        lifecycleStage: accountType === "customer" ? "growth" : "new",
        segment: "mid-market",
        territory: "SE",
        customerSince: accountType === "customer" ? "2026-01-01T00:00:00.000Z" : null,
        churnedAt: accountType === "former_customer" ? "2026-05-01T00:00:00.000Z" : null,
        idempotencyKey: `account_${accountType}`,
      });
    }

    expect(repository.accounts.size).toBe(5);
    expect([...repository.accounts.values()].map((account) => account.accountType).sort()).toEqual(
      [...roles].sort(),
    );
    expect(repository.organizations.get(organization.organization.recordId)).not.toHaveProperty(
      "accountType",
    );
    expect(repository.auditEvents.at(-1)).toMatchObject({
      action: "crm.account.created",
      metadata: {
        organizationId: organization.organization.recordId,
        legalEntityId: legalEntity.legalEntity.recordId,
      },
    });
  });

  test("filters account queries by legal entity and relationship status", async () => {
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
    const legalEntityOne = await createLegalEntity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Dawn Sverige AB",
        idempotencyKey: "legal_entity_1",
      },
    );
    const legalEntityTwo = await createLegalEntity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Dawn Norge AS",
        countryCode: "NO",
        baseCurrency: "NOK",
        idempotencyKey: "legal_entity_2",
      },
    );
    await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      legalEntityId: legalEntityOne.legalEntity.recordId,
      accountType: "customer",
      relationshipStatus: "active",
      idempotencyKey: "account_1",
    });
    await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      legalEntityId: legalEntityOne.legalEntity.recordId,
      accountType: "former_customer",
      relationshipStatus: "churned",
      idempotencyKey: "account_2",
    });
    await createAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      organizationId: organization.organization.recordId,
      legalEntityId: legalEntityTwo.legalEntity.recordId,
      accountType: "customer",
      relationshipStatus: "active",
      idempotencyKey: "account_3",
    });

    const filtered = await listAccounts(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      legalEntityId: legalEntityOne.legalEntity.recordId,
      relationshipStatus: "active",
    });

    expect(filtered.accounts).toHaveLength(1);
    expect(filtered.accounts[0]).toMatchObject({
      legalEntityId: legalEntityOne.legalEntity.recordId,
      relationshipStatus: "active",
      accountType: "customer",
    });
  });

  test("updates account relationship fields with optimistic versioning", async () => {
    const repository = new MemoryCrmRepository();
    const account = await createAccountFixture(repository, "update");
    const legalEntity = await createLegalEntity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        legalName: "Dawn Sverige AB",
        idempotencyKey: "update_account_legal_entity",
      },
    );

    const updated = await updateAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      legalEntityId: legalEntity.legalEntity.recordId,
      accountType: "customer",
      relationshipStatus: "active",
      lifecycleStage: "growth",
      segment: "mid-market",
      territory: "SE",
      primaryOwnerPrincipalId: "user_2",
      customerSince: "2026-01-01T00:00:00.000Z",
      expectedRecordVersion: 1,
      idempotencyKey: "update_account_1",
    });
    const replayed = await updateAccount(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      legalEntityId: legalEntity.legalEntity.recordId,
      accountType: "customer",
      relationshipStatus: "active",
      lifecycleStage: "growth",
      segment: "mid-market",
      territory: "SE",
      primaryOwnerPrincipalId: "user_2",
      customerSince: "2026-01-01T00:00:00.000Z",
      expectedRecordVersion: 1,
      idempotencyKey: "update_account_1",
    });

    expect(updated).toMatchObject({
      account: {
        recordId: account.account.recordId,
        legalEntityId: legalEntity.legalEntity.recordId,
        accountType: "customer",
        lifecycleStage: "growth",
        segment: "mid-market",
        primaryOwnerPrincipalId: "user_2",
      },
      record: { version: 2 },
      replayed: false,
    });
    expect(replayed).toMatchObject({ replayed: true, record: { version: 2 } });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "crm.account.updated",
      payload: {
        accountId: account.account.recordId,
        changedFields: expect.arrayContaining(["legalEntityId", "accountType", "segment"]),
        recordVersion: 2,
      },
    });

    await expect(
      updateAccount(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: account.account.recordId,
        segment: "enterprise",
        expectedRecordVersion: 1,
        idempotencyKey: "update_account_conflict",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "CRM record version conflict",
    });
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

  test("creates contact person under an account and returns it in account summary", async () => {
    const repository = new MemoryCrmRepository();
    const account = await createAccountFixture(repository, "contact");
    const contact = await createContact(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      givenName: " Ada ",
      familyName: " Buyer ",
      email: " ADA@ACME.test ",
      phoneNumber: " +46701234567 ",
      role: " CFO ",
      isPrimary: true,
      idempotencyKey: "contact_1",
    });
    const replayed = await createContact(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      givenName: " Ada ",
      familyName: " Buyer ",
      email: " ADA@ACME.test ",
      phoneNumber: " +46701234567 ",
      role: " CFO ",
      isPrimary: true,
      idempotencyKey: "contact_1",
    });
    const summary = await getAccountSummary(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
    );

    expect(contact).toMatchObject({
      person: {
        givenName: "Ada",
        familyName: "Buyer",
        displayName: "Ada Buyer",
        email: "ada@acme.test",
        phoneNumber: "+46701234567",
      },
      contact: {
        accountId: account.account.recordId,
        role: "CFO",
        isPrimary: true,
      },
      replayed: false,
    });
    expect(replayed).toMatchObject({
      replayed: true,
      contact: { recordId: contact.contact.recordId },
      person: { recordId: contact.person.recordId },
    });
    expect(repository.people.size).toBe(1);
    expect(repository.contacts.size).toBe(1);
    expect(summary.contacts).toEqual([
      {
        contact: expect.objectContaining({
          recordId: contact.contact.recordId,
          accountId: account.account.recordId,
          role: "CFO",
          isPrimary: true,
        }),
        person: expect.objectContaining({
          recordId: contact.person.recordId,
          displayName: "Ada Buyer",
          email: "ada@acme.test",
        }),
      },
    ]);
    expect(repository.parties.get(contact.person.recordId)).toMatchObject({ partyType: "person" });
    expect(repository.auditEvents.at(-1)).toMatchObject({ action: "crm.contact.created" });
    expect(repository.outboxEvents.at(-1)).toMatchObject({ type: "crm.contact.created" });
  });

  test("updates contact relationship and person identity fields", async () => {
    const repository = new MemoryCrmRepository();
    const account = await createAccountFixture(repository, "contact_update");
    const contact = await createContact(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      givenName: "Ada",
      familyName: "Buyer",
      email: "ada@acme.test",
      role: "CFO",
      isPrimary: true,
      idempotencyKey: "contact_update_create",
    });

    const updated = await updateContact(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      contactId: contact.contact.recordId,
      familyName: "Closer",
      email: "closer@acme.test",
      role: "Signer",
      isPrimary: false,
      expectedRecordVersion: 1,
      idempotencyKey: "contact_update_1",
    });

    expect(updated).toMatchObject({
      person: {
        recordId: contact.person.recordId,
        displayName: "Ada Closer",
        email: "closer@acme.test",
      },
      contact: { recordId: contact.contact.recordId, role: "Signer", isPrimary: false },
      record: { version: 2 },
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "crm.contact.updated",
      payload: {
        contactId: contact.contact.recordId,
        accountId: account.account.recordId,
        changedFields: expect.arrayContaining(["role", "isPrimary", "familyName", "email"]),
        recordVersion: 2,
      },
    });
  });

  test("rejects contact creation for inaccessible account or invalid person identity", async () => {
    const repository = new MemoryCrmRepository();
    const otherAccount: Account = {
      recordId: "account_other",
      teamId: "team_2",
      organizationId: "org_other",
      accountType: "customer",
      relationshipStatus: "active",
      legalEntityId: null,
      lifecycleStage: null,
      segment: null,
      territory: null,
      primaryOwnerPrincipalId: null,
      customerSince: null,
      churnedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    repository.accounts.set(otherAccount.recordId, otherAccount);

    await expect(
      createContact(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: otherAccount.recordId,
        displayName: "Ada Buyer",
        email: "ada@acme.test",
        idempotencyKey: "contact_other_account",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Account not found",
    });

    const account = await createAccountFixture(repository, "invalid_contact");

    await expect(
      createContact(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: account.account.recordId,
        email: "not-an-email",
        idempotencyKey: "contact_invalid_email",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Contact display name is required",
    });

    await expect(
      createContact(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: account.account.recordId,
        displayName: "Ada Buyer",
        email: "not-an-email",
        idempotencyKey: "contact_invalid_email_2",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Contact email must be valid",
    });
  });

  test("links an account to a Fortnox customer projection idempotently", async () => {
    const repository = new MemoryCrmRepository();
    const account = await createAccountFixture(repository, "fortnox_link");
    const { connection } = addFortnoxCustomerFixture(repository);

    const linked = await linkAccountProviderCustomer(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        provider: "fortnox",
        connectionId: connection.id,
        providerCustomerId: "1001",
        idempotencyKey: "fortnox_customer_link_1",
      },
    );
    const replayed = await linkAccountProviderCustomer(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        provider: "fortnox",
        connectionId: connection.id,
        providerCustomerId: "1001",
        idempotencyKey: "fortnox_customer_link_1",
      },
    );

    expect(linked).toMatchObject({
      account: { recordId: account.account.recordId },
      providerObject: {
        provider: "fortnox",
        providerObjectType: "customer",
        providerObjectId: "1001",
        internalEntityType: "account",
        internalEntityId: account.account.recordId,
        rawPayload: {
          integrationConnectionId: connection.id,
          linkedInternalEntityType: "account",
          linkedInternalEntityId: account.account.recordId,
        },
      },
      replayed: false,
    });
    expect(replayed).toMatchObject({
      replayed: true,
      providerObject: { providerObjectId: "1001", internalEntityId: account.account.recordId },
    });
    expect(repository.auditEvents.at(-1)).toMatchObject({
      action: "crm.account.provider_customer.linked",
      metadata: { provider: "fortnox", providerObjectId: "1001", connectionId: connection.id },
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "crm.account.provider_customer.linked",
      payload: { accountId: account.account.recordId, providerObjectId: "1001" },
    });
  });

  test("rejects conflicting Fortnox customer mappings", async () => {
    const repository = new MemoryCrmRepository();
    const account = await createAccountFixture(repository, "fortnox_conflict");
    const otherAccount = await createAccountFixture(repository, "fortnox_other");
    const { connection } = addFortnoxCustomerFixture(repository, {
      providerCustomerId: "1001",
      internalEntityType: "account",
      internalEntityId: otherAccount.account.recordId,
    });

    await expect(
      linkAccountProviderCustomer(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: account.account.recordId,
        provider: "fortnox",
        connectionId: connection.id,
        providerCustomerId: "1001",
        idempotencyKey: "fortnox_customer_link_conflict_1",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Provider customer is already linked to another record",
    });

    repository.providerObjects.get(
      providerObjectKey({
        teamId: "team_1",
        provider: "fortnox",
        providerObjectType: "customer",
        providerObjectId: "1001",
      }),
    )!.internalEntityId = account.account.recordId;
    addFortnoxCustomerFixture(repository, {
      providerCustomerId: "1002",
      customerName: "Acme Secondary AB",
    });

    await expect(
      linkAccountProviderCustomer(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: account.account.recordId,
        provider: "fortnox",
        connectionId: connection.id,
        providerCustomerId: "1002",
        idempotencyKey: "fortnox_customer_link_conflict_2",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Account is already linked to a provider customer for this connection",
    });
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
      stage: "new",
    });
    expect(result.replayed).toBe(false);
    expect(repository.auditEvents.at(-1)).toMatchObject({ action: "crm.opportunity.created" });
    expect(repository.outboxEvents.at(-1)).toMatchObject({ type: "crm.opportunity.created" });
  });

  test("updates opportunity commercial fields with optimistic versioning", async () => {
    const repository = new MemoryCrmRepository();
    const account = await createAccountFixture(repository, "opportunity_update");
    const opportunity = await createOpportunity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Implementation package",
        amountMinor: 250_000,
        currencyCode: "SEK",
        idempotencyKey: "opportunity_update_create",
      },
    );

    const updated = await updateOpportunity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        opportunityId: opportunity.opportunity.recordId,
        name: "Implementation and rollout",
        amountMinor: 325_000,
        currencyCode: "sek",
        expectedCloseDate: "2026-09-01T00:00:00.000Z",
        primaryOwnerPrincipalId: "user_2",
        expectedRecordVersion: 1,
        idempotencyKey: "opportunity_update_1",
      },
    );

    expect(updated).toMatchObject({
      opportunity: {
        recordId: opportunity.opportunity.recordId,
        name: "Implementation and rollout",
        amountMinor: 325_000,
        currencyCode: "SEK",
        expectedCloseDate: "2026-09-01T00:00:00.000Z",
        primaryOwnerPrincipalId: "user_2",
      },
      record: { version: 2 },
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "crm.opportunity.updated",
      payload: {
        opportunityId: opportunity.opportunity.recordId,
        accountId: account.account.recordId,
        changedFields: expect.arrayContaining(["name", "amountMinor", "currencyCode"]),
        recordVersion: 2,
      },
    });
  });

  test("updates opportunity deal stage with fixed transition rules", async () => {
    const repository = new MemoryCrmRepository();
    const account = await createAccountFixture(repository, "stage");
    const created = await createOpportunity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Implementation package",
        amountMinor: 250_000,
        currencyCode: "SEK",
        idempotencyKey: "opportunity_stage_create",
      },
    );

    const proposalSent = await updateOpportunityStage(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        opportunityId: created.opportunity.recordId,
        stage: "proposal_sent",
        expectedRecordVersion: 1,
        idempotencyKey: "opportunity_stage_update_1",
      },
    );
    const replayed = await updateOpportunityStage(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        opportunityId: created.opportunity.recordId,
        stage: "proposal_sent",
        expectedRecordVersion: 1,
        idempotencyKey: "opportunity_stage_update_1",
      },
    );
    const wonPendingInvoice = await updateOpportunityStage(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        opportunityId: created.opportunity.recordId,
        stage: "won_pending_invoice",
        expectedRecordVersion: 2,
        idempotencyKey: "opportunity_stage_update_2",
      },
    );

    expect(proposalSent).toMatchObject({
      opportunity: { stage: "proposal_sent", status: "open" },
      record: { version: 2 },
      replayed: false,
    });
    expect(replayed).toMatchObject({ replayed: true, record: { version: 2 } });
    expect(wonPendingInvoice).toMatchObject({
      opportunity: { stage: "won_pending_invoice", status: "won", wonAt: now },
      record: { version: 3 },
    });
    expect(repository.auditEvents.at(-1)).toMatchObject({
      action: "crm.opportunity.stage_updated",
      metadata: {
        previousStage: "proposal_sent",
        stage: "won_pending_invoice",
        status: "won",
        recordVersion: 3,
      },
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "crm.opportunity.stage_updated",
      payload: { stage: "won_pending_invoice", status: "won", recordVersion: 3 },
    });

    await expect(
      updateOpportunityStage(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        opportunityId: created.opportunity.recordId,
        stage: "negotiation",
        expectedRecordVersion: 3,
        idempotencyKey: "opportunity_stage_invalid",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Won deals pending invoice can only move to won or archived",
    });
  });

  test("returns account timeline entries for CRM actions and Fortnox mapping", async () => {
    const repository = new MemoryCrmRepository();
    const account = await createAccountFixture(repository, "timeline");
    const { connection } = addFortnoxCustomerFixture(repository);
    const contact = await createContact(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      givenName: "Ada",
      familyName: "Buyer",
      email: "ada@acme.test",
      role: "CFO",
      isPrimary: true,
      idempotencyKey: "timeline_contact",
    });
    await linkAccountProviderCustomer(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      provider: "fortnox",
      connectionId: connection.id,
      providerCustomerId: "1001",
      idempotencyKey: "timeline_fortnox_link",
    });
    const opportunity = await createOpportunity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Implementation package",
        amountMinor: 250_000,
        currencyCode: "SEK",
        idempotencyKey: "timeline_opportunity",
      },
    );
    await updateOpportunityStage(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      opportunityId: opportunity.opportunity.recordId,
      stage: "proposal_sent",
      expectedRecordVersion: 1,
      idempotencyKey: "timeline_stage_update",
    });
    await repository.appendAuditEvent({
      teamId: "team_1",
      actorId: "user_1",
      requestId: "timeline_doc_sent",
      action: "commercial_document.sent",
      entityType: "commercial_document",
      entityId: "quote_1",
      metadata: {
        documentId: "quote_1",
        accountId: account.account.recordId,
        opportunityId: opportunity.opportunity.recordId,
        documentType: "quote",
        title: "Quote for implementation package",
        status: "sent",
        total: { amountMinor: 312_500, currency: "SEK" },
        versionId: "quote_version_1",
        versionNumber: 1,
        recipientEmail: "buyer@acme.test",
      },
    });
    await repository.appendAuditEvent({
      teamId: "team_1",
      actorId: "recipient",
      requestId: "timeline_doc_viewed",
      action: "commercial_document.viewed",
      entityType: "commercial_document",
      entityId: "quote_1",
      metadata: {
        documentId: "quote_1",
        accountId: account.account.recordId,
        opportunityId: opportunity.opportunity.recordId,
        documentType: "quote",
        title: "Quote for implementation package",
        status: "viewed",
        total: { amountMinor: 312_500, currency: "SEK" },
        versionId: "quote_version_1",
        versionNumber: 1,
        viewedAt: "2026-06-20T12:00:00.000Z",
      },
    });
    repository.fieldPolicies.push({
      id: "policy_hide_amount",
      teamId: "team_1",
      targetRecordId: opportunity.opportunity.recordId,
      objectTypeId: "opportunity",
      principalId: null,
      fieldId: "amountMinor",
      action: "read",
      effect: "deny",
    });

    const timeline = await listAccountTimeline(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
    );

    expect(timeline.entries.map((entry) => entry.action)).toEqual([
      "commercial_document.viewed",
      "commercial_document.sent",
      "crm.opportunity.stage_updated",
      "crm.opportunity.created",
      "crm.account.provider_customer.linked",
      "crm.contact.created",
      "crm.account.created",
    ]);
    expect(timeline.entries.find((entry) => entry.action === "crm.contact.created")).toMatchObject({
      entityId: contact.contact.recordId,
      details: {
        contactId: contact.contact.recordId,
        personId: contact.person.recordId,
        displayName: "Ada Buyer",
        email: "ada@acme.test",
        role: "CFO",
        isPrimary: true,
      },
    });
    expect(
      timeline.entries.find((entry) => entry.action === "crm.account.provider_customer.linked"),
    ).toMatchObject({
      entityId: account.account.recordId,
      details: {
        provider: "fortnox",
        connectionId: connection.id,
        providerObjectType: "customer",
        providerObjectId: "1001",
      },
    });
    expect(
      timeline.entries.find((entry) => entry.action === "commercial_document.viewed"),
    ).toMatchObject({
      entityId: "quote_1",
      details: {
        documentId: "quote_1",
        accountId: account.account.recordId,
        opportunityId: opportunity.opportunity.recordId,
        opportunityName: "Implementation package",
        documentType: "quote",
        title: "Quote for implementation package",
        status: "viewed",
        total: { amountMinor: 312_500, currency: "SEK" },
        versionId: "quote_version_1",
        versionNumber: 1,
        viewedAt: "2026-06-20T12:00:00.000Z",
      },
    });
    const stageEntry = timeline.entries.find(
      (entry) => entry.action === "crm.opportunity.stage_updated",
    );
    expect(stageEntry).toMatchObject({
      entityId: opportunity.opportunity.recordId,
      details: {
        opportunityId: opportunity.opportunity.recordId,
        name: "Implementation package",
        stage: "proposal_sent",
        status: "open",
        currencyCode: "SEK",
        previousStage: "new",
        recordVersion: 2,
      },
    });
    expect(stageEntry?.details.amountMinor).toBeUndefined();
  });

  test("archives account, contact, and opportunity records with idempotency", async () => {
    const repository = new MemoryCrmRepository();
    const account = await createAccountFixture(repository, "archive");
    const contact = await createContact(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      accountId: account.account.recordId,
      displayName: "Ada Buyer",
      email: "ada@acme.test",
      idempotencyKey: "archive_contact_create",
    });
    const opportunity = await createOpportunity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        name: "Implementation package",
        amountMinor: 250_000,
        currencyCode: "SEK",
        idempotencyKey: "archive_opportunity_create",
      },
    );

    const archivedContact = await archiveContact(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        contactId: contact.contact.recordId,
        expectedRecordVersion: 1,
        idempotencyKey: "archive_contact_1",
      },
    );
    const replayedContact = await archiveContact(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        contactId: contact.contact.recordId,
        expectedRecordVersion: 1,
        idempotencyKey: "archive_contact_1",
      },
    );
    const archivedOpportunity = await archiveOpportunity(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        opportunityId: opportunity.opportunity.recordId,
        expectedRecordVersion: 1,
        idempotencyKey: "archive_opportunity_1",
      },
    );
    const archivedAccount = await archiveAccount(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
        expectedRecordVersion: 1,
        idempotencyKey: "archive_account_1",
      },
    );
    const timeline = await listAccountTimeline(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        accountId: account.account.recordId,
      },
    );

    expect(archivedContact).toMatchObject({
      record: { lifecycleState: "archived", version: 2, archivedAt: now },
      contact: { recordId: contact.contact.recordId },
      replayed: false,
    });
    expect(replayedContact).toMatchObject({
      record: { lifecycleState: "archived", version: 2 },
      replayed: true,
    });
    expect(archivedOpportunity).toMatchObject({
      record: { lifecycleState: "archived", version: 2, archivedAt: now },
      opportunity: { stage: "archived", status: "lost" },
    });
    expect(archivedAccount).toMatchObject({
      record: { lifecycleState: "archived", version: 2, archivedAt: now },
      account: { recordId: account.account.recordId },
    });
    expect(timeline.entries.map((entry) => entry.action).slice(0, 3)).toEqual([
      "crm.account.archived",
      "crm.opportunity.archived",
      "crm.contact.archived",
    ]);
    expect(repository.outboxEvents.at(-3)).toMatchObject({
      type: "crm.contact.archived",
      payload: { contactId: contact.contact.recordId, accountId: account.account.recordId },
    });
    expect(repository.outboxEvents.at(-2)).toMatchObject({
      type: "crm.opportunity.archived",
      payload: {
        opportunityId: opportunity.opportunity.recordId,
        previousStage: "new",
        stage: "archived",
        status: "lost",
      },
    });
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "crm.account.archived",
      payload: { accountId: account.account.recordId },
    });

    await expect(
      archiveAccount(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        accountId: account.account.recordId,
        expectedRecordVersion: 2,
        idempotencyKey: "archive_account_again",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "CRM record is already archived",
    });
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
      lifecycleStage: null,
      segment: null,
      territory: null,
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
      lifecycleStage: null,
      segment: null,
      territory: null,
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

  test("creates custom object and field definitions with stable option values", async () => {
    const repository = new MemoryCrmRepository();
    repository.role = "admin";

    const objectType = await createObjectTypeDefinition(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        objectTypeId: "success_plan",
        label: "Success plan",
        idempotencyKey: "object_type_1",
      },
    );

    expect(objectType.objectType.objectTypeId).toBe("success_plan");
    expect(objectType.objectType.isCustom).toBe(true);

    const field = await createFieldDefinition(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        objectTypeId: "account",
        stableKey: "customer_tier",
        label: "Customer tier",
        fieldType: "single_option",
        options: [
          { stableKey: "gold", label: "Gold" },
          { stableKey: "silver", label: "Silver" },
        ],
        idempotencyKey: "field_1",
      },
    );

    expect(field.fieldDefinition.objectTypeId).toBe("account");
    expect(field.optionSet?.stableKey).toBe("customer_tier_options");
    expect(field.optionValues.map((option) => option.stableKey)).toEqual(["gold", "silver"]);

    await expect(
      createFieldDefinition(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        objectTypeId: "account",
        stableKey: "relationship_status",
        label: "Relationship status",
        fieldType: "text",
        idempotencyKey: "field_2",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Built-in CRM fields must remain in typed CRM tables",
    });
  });

  test("sets typed custom field values with idempotency, versioning, audit, and outbox", async () => {
    const repository = new MemoryCrmRepository();
    repository.role = "admin";
    const account = await createAccountFixture(repository, "one");
    const field = await createFieldDefinition(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        objectTypeId: "account",
        stableKey: "risk_score",
        label: "Risk score",
        fieldType: "integer",
        idempotencyKey: "field_risk_score",
      },
    );

    const auditCount = repository.auditEvents.length;
    const result = await setRecordFieldValue(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        recordId: account.account.recordId,
        fieldDefinitionId: field.fieldDefinition.id,
        value: { type: "integer", value: 42 },
        expectedRecordVersion: 1,
        idempotencyKey: "set_risk_score",
      },
    );

    expect(result.record.version).toBe(2);
    expect(result.fieldValue.integerValue).toBe(42);
    expect(repository.records.get(account.account.recordId)?.version).toBe(2);
    expect(repository.auditEvents).toHaveLength(auditCount + 1);
    expect(repository.outboxEvents.at(-1)).toMatchObject({
      type: "crm.record_field_value.set",
    });

    const replay = await setRecordFieldValue(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        recordId: account.account.recordId,
        fieldDefinitionId: field.fieldDefinition.id,
        value: { type: "integer", value: 42 },
        expectedRecordVersion: 1,
        idempotencyKey: "set_risk_score",
      },
    );

    expect(replay.replayed).toBe(true);
    expect(repository.records.get(account.account.recordId)?.version).toBe(2);
  });

  test("rejects custom field version conflicts and unique value reuse", async () => {
    const repository = new MemoryCrmRepository();
    repository.role = "admin";
    const first = await createAccountFixture(repository, "first");
    const second = await createAccountFixture(repository, "second");
    const field = await createFieldDefinition(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        objectTypeId: "account",
        stableKey: "external_customer_id",
        label: "External customer ID",
        fieldType: "text",
        isUnique: true,
        idempotencyKey: "field_external_customer_id",
      },
    );

    await setRecordFieldValue(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      recordId: first.account.recordId,
      fieldDefinitionId: field.fieldDefinition.id,
      value: { type: "text", value: "cust_123" },
      expectedRecordVersion: 1,
      idempotencyKey: "set_first_external_id",
    });

    await expect(
      setRecordFieldValue(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        recordId: first.account.recordId,
        fieldDefinitionId: field.fieldDefinition.id,
        value: { type: "text", value: "cust_456" },
        expectedRecordVersion: 1,
        idempotencyKey: "set_first_stale_external_id",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "CRM record version conflict",
    });

    await expect(
      setRecordFieldValue(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        recordId: second.account.recordId,
        fieldDefinitionId: field.fieldDefinition.id,
        value: { type: "text", value: "cust_123" },
        expectedRecordVersion: 1,
        idempotencyKey: "set_second_external_id",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "CRM custom field value must be unique",
    });
  });

  test("filters accounts by typed custom field value", async () => {
    const repository = new MemoryCrmRepository();
    repository.role = "admin";
    const enterprise = await createAccountFixture(repository, "enterprise");
    const smb = await createAccountFixture(repository, "smb");
    const field = await createFieldDefinition(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        objectTypeId: "account",
        stableKey: "market_segment",
        label: "Market segment",
        fieldType: "text",
        idempotencyKey: "field_market_segment",
      },
    );

    await setRecordFieldValue(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      recordId: enterprise.account.recordId,
      fieldDefinitionId: field.fieldDefinition.id,
      value: { type: "text", value: "enterprise" },
      expectedRecordVersion: 1,
      idempotencyKey: "set_enterprise_segment",
    });
    await setRecordFieldValue(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      recordId: smb.account.recordId,
      fieldDefinitionId: field.fieldDefinition.id,
      value: { type: "text", value: "smb" },
      expectedRecordVersion: 1,
      idempotencyKey: "set_smb_segment",
    });

    const filtered = await listAccounts(repository as unknown as CrmUseCaseRepository, context, {
      teamId: "team_1",
      customFieldFilter: {
        fieldDefinitionId: field.fieldDefinition.id,
        value: { type: "text", value: "enterprise" },
      },
    });

    expect(filtered.accounts).toHaveLength(1);
    expect(filtered.accounts[0]?.recordId).toBe(enterprise.account.recordId);
  });

  test("rejects invalid custom field values before persistence", async () => {
    const repository = new MemoryCrmRepository();
    repository.role = "admin";
    const account = await createAccountFixture(repository, "invalid");
    const field = await createFieldDefinition(
      repository as unknown as CrmUseCaseRepository,
      context,
      {
        teamId: "team_1",
        objectTypeId: "account",
        stableKey: "risk_score",
        label: "Risk score",
        fieldType: "integer",
        idempotencyKey: "field_invalid_risk_score",
      },
    );

    await expect(
      setRecordFieldValue(repository as unknown as CrmUseCaseRepository, context, {
        teamId: "team_1",
        recordId: account.account.recordId,
        fieldDefinitionId: field.fieldDefinition.id,
        value: { type: "text", value: "high" },
        expectedRecordVersion: 1,
        idempotencyKey: "set_invalid_risk_score",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Expected integer custom field value",
    });

    expect(repository.records.get(account.account.recordId)?.version).toBe(1);
    expect(repository.recordFieldValues.size).toBe(0);
  });
});
