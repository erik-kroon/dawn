import type {
  Account,
  AccountContactSummary,
  AccountSummary,
  Actor,
  Contact,
  CrmAccessDecision,
  CrmFieldDefinition,
  CrmFieldSecurityPolicy,
  CrmFieldType,
  CrmFieldValueInput,
  CrmObjectAction,
  CrmObjectTypeDefinition,
  CrmObjectType,
  CrmOptionSet,
  CrmOptionValue,
  CrmRecord,
  CrmRecordFieldValue,
  CrmRecordFieldValueDraft,
  CrmRecordGrant,
  LegalEntity,
  IntegrationConnection,
  MarketProspect,
  Organization,
  Opportunity,
  OpportunityStage,
  Party,
  PartyType,
  Person,
  Permission,
  TeamRole,
} from "@dawn/domain";
import {
  assertCrmWriteFields,
  assertOpportunityStageTransition,
  assertValidMoney,
  deriveOpportunityStatusFromStage,
  evaluateCrmAccess,
  normalizeCrmFieldDefinition,
  normalizeCrmObjectTypeDefinition,
  normalizeCrmPersonIdentity,
  normalizeOpportunityStage,
  normalizeCrmRecordFieldValue,
  normalizeSwedishOrganizationNumber,
  permissionsForRole,
  redactCrmFields,
  resolveCrmPrincipal,
} from "@dawn/domain";

import {
  AppError,
  type AuditLogEntry,
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

export type CreateLegalEntityCommand = {
  teamId: string;
  legalName: string;
  organizationNumber?: string | null;
  vatNumber?: string | null;
  countryCode?: string | null;
  baseCurrency?: string | null;
  fiscalYearStartMonth?: number | null;
  status?: LegalEntity["status"];
  idempotencyKey: string;
};

export type CreateLegalEntityResult = {
  legalEntity: LegalEntity;
  replayed: boolean;
};

export type CreateAccountCommand = {
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
  idempotencyKey: string;
};

export type CreateAccountResult = {
  account: Account;
  replayed: boolean;
};

export type UpdateAccountCommand = {
  teamId: string;
  accountId: string;
  accountType?: Account["accountType"];
  legalEntityId?: string | null;
  relationshipStatus?: Account["relationshipStatus"];
  lifecycleStage?: Account["lifecycleStage"];
  segment?: string | null;
  territory?: string | null;
  primaryOwnerPrincipalId?: string | null;
  customerSince?: string | null;
  churnedAt?: string | null;
  expectedRecordVersion: number;
  idempotencyKey: string;
};

export type UpdateAccountResult = {
  account: Account;
  record: CrmRecord;
  replayed: boolean;
};

export type CreateContactCommand = {
  teamId: string;
  accountId: string;
  givenName?: string | null;
  familyName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  role?: string | null;
  isPrimary?: boolean | null;
  idempotencyKey: string;
};

export type CreateContactResult = {
  person: Person;
  contact: Contact;
  replayed: boolean;
};

export type UpdateContactCommand = {
  teamId: string;
  contactId: string;
  givenName?: string | null;
  familyName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  role?: string | null;
  isPrimary?: boolean | null;
  expectedRecordVersion: number;
  idempotencyKey: string;
};

export type UpdateContactResult = {
  person: Person;
  contact: Contact;
  record: CrmRecord;
  replayed: boolean;
};

export type CrmProviderObjectRecord = {
  id: string;
  teamId: string;
  provider: string;
  providerObjectType: string;
  providerObjectId: string;
  internalEntityType?: string | null;
  internalEntityId?: string | null;
  rawPayload: Record<string, unknown>;
};

export type LinkAccountProviderCustomerCommand = {
  teamId: string;
  accountId: string;
  provider: "fortnox";
  connectionId: string;
  providerCustomerId: string;
  idempotencyKey: string;
};

export type LinkAccountProviderCustomerResult = {
  account: Account;
  providerObject: CrmProviderObjectRecord;
  replayed: boolean;
};

export type CreateOpportunityCommand = {
  teamId: string;
  accountId: string;
  name: string;
  amountMinor: number;
  currencyCode: string;
  stage?: OpportunityStage | null;
  expectedCloseDate?: string | null;
  primaryOwnerPrincipalId?: string | null;
  idempotencyKey: string;
};

export type CreateOpportunityResult = {
  opportunity: Opportunity;
  replayed: boolean;
};

export type UpdateOpportunityCommand = {
  teamId: string;
  opportunityId: string;
  name?: string;
  amountMinor?: number;
  currencyCode?: string;
  expectedCloseDate?: string | null;
  primaryOwnerPrincipalId?: string | null;
  expectedRecordVersion: number;
  idempotencyKey: string;
};

export type UpdateOpportunityResult = {
  opportunity: Opportunity;
  record: CrmRecord;
  replayed: boolean;
};

export type UpdateOpportunityStageCommand = {
  teamId: string;
  opportunityId: string;
  stage: OpportunityStage;
  expectedRecordVersion: number;
  idempotencyKey: string;
};

export type UpdateOpportunityStageResult = {
  opportunity: Opportunity;
  record: CrmRecord;
  replayed: boolean;
};

export type ArchiveAccountCommand = {
  teamId: string;
  accountId: string;
  expectedRecordVersion: number;
  idempotencyKey: string;
};

export type ArchiveAccountResult = {
  account: Account;
  record: CrmRecord;
  replayed: boolean;
};

export type ArchiveContactCommand = {
  teamId: string;
  contactId: string;
  expectedRecordVersion: number;
  idempotencyKey: string;
};

export type ArchiveContactResult = {
  contact: Contact;
  record: CrmRecord;
  replayed: boolean;
};

export type ArchiveOpportunityCommand = {
  teamId: string;
  opportunityId: string;
  expectedRecordVersion: number;
  idempotencyKey: string;
};

export type ArchiveOpportunityResult = {
  opportunity: Opportunity;
  record: CrmRecord;
  replayed: boolean;
};

export type GetAccountSummaryCommand = {
  teamId: string;
  accountId: string;
};

export type ListAccountTimelineCommand = {
  teamId: string;
  accountId: string;
  limit?: number | null;
};

export type AccountTimelineEntry = {
  id: string;
  teamId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  accountId: string;
  details: Record<string, unknown>;
  occurredAt: string;
};

export type ListAccountTimelineResult = {
  entries: AccountTimelineEntry[];
};

export type ListAccountsCommand = {
  teamId: string;
  legalEntityId?: string | null;
  relationshipStatus?: Account["relationshipStatus"] | null;
  accountType?: Account["accountType"] | null;
  customFieldFilter?: {
    fieldDefinitionId: string;
    value: CrmFieldValueInput;
  } | null;
};

export type ListAccountsResult = {
  accounts: Partial<Account>[];
};

export type AccountDuplicateMatchReason = "organization_number" | "legal_name";

export type SuggestAccountDuplicatesCommand = {
  teamId: string;
  legalName: string;
  organizationNumber?: string | null;
  limit?: number | null;
};

export type AccountDuplicateSuggestion = {
  account: Partial<Account>;
  organization: Partial<Organization>;
  matchReasons: AccountDuplicateMatchReason[];
};

export type SuggestAccountDuplicatesResult = {
  suggestions: AccountDuplicateSuggestion[];
};

export type CreateObjectTypeDefinitionCommand = {
  teamId: string;
  objectTypeId: string;
  label: string;
  idempotencyKey: string;
};

export type CreateObjectTypeDefinitionResult = {
  objectType: CrmObjectTypeDefinition;
  replayed: boolean;
};

export type CreateFieldDefinitionCommand = {
  teamId: string;
  objectTypeId: string;
  stableKey: string;
  label: string;
  fieldType: CrmFieldType;
  cardinality?: CrmFieldDefinition["cardinality"] | null;
  isRequired?: boolean | null;
  isUnique?: boolean | null;
  allowedReferenceObjectTypeId?: string | null;
  options?: readonly {
    stableKey: string;
    label: string;
    sortOrder?: number | null;
  }[];
  idempotencyKey: string;
};

export type CreateFieldDefinitionResult = {
  fieldDefinition: CrmFieldDefinition;
  optionSet: CrmOptionSet | null;
  optionValues: CrmOptionValue[];
  replayed: boolean;
};

export type SetRecordFieldValueCommand = {
  teamId: string;
  recordId: string;
  fieldDefinitionId: string;
  value: CrmFieldValueInput;
  expectedRecordVersion: number;
  idempotencyKey: string;
};

export type SetRecordFieldValueResult = {
  fieldValue: CrmRecordFieldValue;
  record: CrmRecord;
  replayed: boolean;
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
  getPersonForTeam(teamId: string, recordId: string): Promise<Person | null>;
  getLegalEntityForTeam(teamId: string, recordId: string): Promise<LegalEntity | null>;
  getAccountForTeam(teamId: string, recordId: string): Promise<Account | null>;
  getContactForTeam(teamId: string, recordId: string): Promise<Contact | null>;
  getOpportunityForTeam(teamId: string, recordId: string): Promise<Opportunity | null>;
  listOrganizationsForDuplicateCheck(input: {
    teamId: string;
    legalName: string;
    organizationNumber?: string | null;
    limit: number;
  }): Promise<Organization[]>;
  getIntegrationConnectionForTeam(
    teamId: string,
    connectionId: string,
  ): Promise<IntegrationConnection | null>;
  getProviderObjectForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
  }): Promise<CrmProviderObjectRecord | null>;
  listProviderObjectsForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectTypes: readonly string[];
  }): Promise<CrmProviderObjectRecord[]>;
  listAccountsForTeam(input: {
    teamId: string;
    legalEntityId?: string | null;
    relationshipStatus?: Account["relationshipStatus"] | null;
    accountType?: Account["accountType"] | null;
    recordIds?: readonly string[] | null;
    organizationIds?: readonly string[] | null;
  }): Promise<Account[]>;
  listContactsForAccount(teamId: string, accountId: string): Promise<AccountContactSummary[]>;
  listOpenOpportunitiesForAccount(teamId: string, accountId: string): Promise<Opportunity[]>;
  listOpportunitiesForAccount(teamId: string, accountId: string): Promise<Opportunity[]>;
  listMarketProspectsForAccount(teamId: string, accountId: string): Promise<MarketProspect[]>;
  listAuditEvents(input: {
    teamId: string;
    limit: number;
    action?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    requestId?: string | null;
    metadata?: Record<string, string>;
  }): Promise<AuditLogEntry[]>;
  getCrmObjectTypeDefinitionForTeam(
    teamId: string,
    objectTypeId: string,
  ): Promise<CrmObjectTypeDefinition | null>;
  getCrmFieldDefinitionForTeam(
    teamId: string,
    fieldDefinitionId: string,
  ): Promise<CrmFieldDefinition | null>;
  getCrmFieldDefinitionByStableKey(input: {
    teamId: string;
    objectTypeId: string;
    stableKey: string;
  }): Promise<CrmFieldDefinition | null>;
  listCrmOptionValuesForField(input: {
    teamId: string;
    fieldDefinitionId: string;
  }): Promise<CrmOptionValue[]>;
  findCrmRecordFieldValueByFieldValue(input: {
    teamId: string;
    fieldDefinitionId: string;
    value: CrmRecordFieldValueDraft;
    excludeRecordId?: string | null;
  }): Promise<CrmRecordFieldValue | null>;
  listRecordIdsByCrmFieldValue(input: {
    teamId: string;
    fieldDefinitionId: string;
    value: CrmRecordFieldValueDraft;
  }): Promise<string[]>;

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
  createPerson(input: {
    recordId: string;
    teamId: string;
    givenName?: string | null;
    familyName?: string | null;
    displayName: string;
    email?: string | null;
    phoneNumber?: string | null;
  }): Promise<Person>;
  createLegalEntity(input: {
    recordId: string;
    teamId: string;
    legalName: string;
    organizationNumber?: string | null;
    vatNumber?: string | null;
    countryCode: string;
    baseCurrency: string;
    fiscalYearStartMonth: number;
    status: LegalEntity["status"];
  }): Promise<LegalEntity>;
  createAccount(input: {
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
  }): Promise<Account>;
  createContact(input: {
    recordId: string;
    teamId: string;
    accountId: string;
    personId: string;
    role?: string | null;
    isPrimary?: boolean | null;
  }): Promise<Contact>;
  updateAccount(input: {
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
  }): Promise<Account | null>;
  updatePerson(input: {
    teamId: string;
    personId: string;
    givenName: string | null;
    familyName: string | null;
    displayName: string;
    email: string | null;
    phoneNumber: string | null;
  }): Promise<Person | null>;
  updateContact(input: {
    teamId: string;
    contactId: string;
    role: string | null;
    isPrimary: boolean;
  }): Promise<Contact | null>;
  createOpportunity(input: {
    recordId: string;
    teamId: string;
    accountId: string;
    name: string;
    amountMinor: number;
    currencyCode: string;
    stage: OpportunityStage;
    status: Opportunity["status"];
    expectedCloseDate?: string | null;
    primaryOwnerPrincipalId?: string | null;
  }): Promise<Opportunity>;
  updateOpportunityStage(input: {
    teamId: string;
    opportunityId: string;
    stage: OpportunityStage;
    status: Opportunity["status"];
    actorId: string;
  }): Promise<Opportunity | null>;
  updateOpportunity(input: {
    teamId: string;
    opportunityId: string;
    name: string;
    amountMinor: number;
    currencyCode: string;
    expectedCloseDate: string | null;
    primaryOwnerPrincipalId: string | null;
  }): Promise<Opportunity | null>;
  upsertProviderObject(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
    connectionId?: string | null;
    internalEntityType?: string | null;
    internalEntityId?: string | null;
    rawPayload: Record<string, unknown>;
  }): Promise<void>;
  createCrmObjectTypeDefinition(input: {
    id: string;
    teamId: string;
    objectTypeId: string;
    label: string;
    isCustom: boolean;
    createdByActorId: string;
  }): Promise<CrmObjectTypeDefinition>;
  createCrmFieldDefinition(input: {
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
  }): Promise<CrmFieldDefinition>;
  createCrmOptionSet(input: {
    id: string;
    teamId: string;
    fieldDefinitionId: string;
    stableKey: string;
    label: string;
    createdByActorId: string;
  }): Promise<CrmOptionSet>;
  createCrmOptionValues(
    input: {
      id: string;
      teamId: string;
      optionSetId: string;
      stableKey: string;
      label: string;
      sortOrder: number;
    }[],
  ): Promise<CrmOptionValue[]>;
  upsertCrmRecordFieldValue(input: {
    id: string;
    teamId: string;
    recordId: string;
    fieldDefinitionId: string;
    position?: number;
    value: CrmRecordFieldValueDraft;
    updatedByActorId: string;
  }): Promise<CrmRecordFieldValue>;
  incrementCrmRecordVersion(input: {
    teamId: string;
    recordId: string;
    expectedVersion: number;
    actorId: string;
  }): Promise<CrmRecord | null>;
  archiveCrmRecord(input: {
    teamId: string;
    recordId: string;
    expectedVersion: number;
    actorId: string;
  }): Promise<CrmRecord | null>;
};

export type CrmUseCaseRepository = TransactionReviewRepository & CrmRepository;

const createOrganizationOperation = "crm.organization.create";
const createLegalEntityOperation = "crm.legal_entity.create";
const createAccountOperation = "crm.account.create";
const updateAccountOperation = "crm.account.update";
const createContactOperation = "crm.contact.create";
const updateContactOperation = "crm.contact.update";
const linkAccountProviderCustomerOperation = "crm.account.provider_customer.link";
const createOpportunityOperation = "crm.opportunity.create";
const updateOpportunityOperation = "crm.opportunity.update";
const updateOpportunityStageOperation = "crm.opportunity.stage.update";
const archiveAccountOperation = "crm.account.archive";
const archiveContactOperation = "crm.contact.archive";
const archiveOpportunityOperation = "crm.opportunity.archive";
const createObjectTypeDefinitionOperation = "crm.object_type_definition.create";
const createFieldDefinitionOperation = "crm.field_definition.create";
const setRecordFieldValueOperation = "crm.record_field_value.set";
const accountTimelineActions = new Set([
  "crm.account.created",
  "crm.account.updated",
  "crm.account.archived",
  "crm.contact.created",
  "crm.contact.updated",
  "crm.contact.archived",
  "crm.account.provider_customer.linked",
  "crm.opportunity.created",
  "crm.opportunity.updated",
  "crm.opportunity.stage_updated",
  "crm.opportunity.archived",
  "commercial_document.created",
  "commercial_document.updated",
  "commercial_document.finalised",
  "commercial_document.sent",
  "commercial_document.viewed",
  "commercial_document.declined",
  "commercial_document.revised",
  "signature.requested",
  "signature.completed",
  "signature.invalid",
  "market.company.seeded",
  "market.prospect.created",
  "market.prospect.promoted",
]);

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
  person: [
    "recordId",
    "teamId",
    "givenName",
    "familyName",
    "displayName",
    "email",
    "phoneNumber",
    "createdAt",
    "updatedAt",
  ],
  legal_entity: [
    "recordId",
    "teamId",
    "legalName",
    "organizationNumber",
    "vatNumber",
    "countryCode",
    "baseCurrency",
    "fiscalYearStartMonth",
    "status",
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
    "lifecycleStage",
    "segment",
    "territory",
    "primaryOwnerPrincipalId",
    "customerSince",
    "churnedAt",
    "createdAt",
    "updatedAt",
  ],
  contact: [
    "recordId",
    "teamId",
    "accountId",
    "personId",
    "role",
    "isPrimary",
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
    "stage",
    "expectedCloseDate",
    "primaryOwnerPrincipalId",
    "wonAt",
    "lostAt",
    "createdAt",
    "updatedAt",
  ],
};

const builtInObjectTypeLabels: Record<CrmObjectType, string> = {
  organization: "Organization",
  person: "Person",
  legal_entity: "Legal entity",
  account: "Account",
  contact: "Contact",
  opportunity: "Opportunity",
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

export async function createLegalEntity(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateLegalEntityCommand,
): Promise<CreateLegalEntityResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Legal entity not found");

    const normalized = normalizeCreateLegalEntityCommand(command);
    const principal = await assertCrmCreateAccess(
      crmRepository,
      context,
      command.teamId,
      "legal_entity",
      normalized,
      "You cannot create legal entities for this team",
    );
    const fingerprint = JSON.stringify(normalized);
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createLegalEntityOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different legal entity",
        );
      }

      return { ...(replayed.result as CreateLegalEntityResult), replayed: true };
    }

    const recordId = crypto.randomUUID();
    await crmRepository.createCrmRecord({
      recordId,
      teamId: command.teamId,
      objectTypeId: "legal_entity",
      createdByActorId: context.actor.id,
      ownerPrincipalId: principal.id,
    });
    const legalEntity = await crmRepository.createLegalEntity({
      recordId,
      ...normalized,
    });

    await crmRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "crm.legal_entity.created",
      entityType: "legal_entity",
      entityId: legalEntity.recordId,
      metadata: {
        legalName: legalEntity.legalName,
        organizationNumber: legalEntity.organizationNumber,
        baseCurrency: legalEntity.baseCurrency,
      },
    });

    await crmRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "crm.legal_entity.created",
      version: 1,
      payload: {
        legalEntityId: legalEntity.recordId,
        legalName: legalEntity.legalName,
        baseCurrency: legalEntity.baseCurrency,
      },
    });

    const result = { legalEntity, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createLegalEntityOperation,
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

    if (normalized.legalEntityId) {
      await resolveCrmRecordAccess(
        crmRepository,
        context,
        command.teamId,
        normalized.legalEntityId,
        "legal_entity",
        "read",
        "Legal entity not found",
      );

      const legalEntity = await crmRepository.getLegalEntityForTeam(
        command.teamId,
        normalized.legalEntityId,
      );

      if (!legalEntity) {
        throw new AppError("NOT_FOUND", "Legal entity not found");
      }
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
        legalEntityId: account.legalEntityId,
        accountType: account.accountType,
        relationshipStatus: account.relationshipStatus,
        lifecycleStage: account.lifecycleStage,
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
        legalEntityId: account.legalEntityId,
        accountType: account.accountType,
        relationshipStatus: account.relationshipStatus,
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

export async function updateAccount(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: UpdateAccountCommand,
): Promise<UpdateAccountResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Account not found");

    const account = await crmRepository.getAccountForTeam(command.teamId, command.accountId);

    if (!account) {
      throw new AppError("NOT_FOUND", "Account not found");
    }

    const normalized = normalizeUpdateAccountCommand(command, account);
    const fingerprint = updateFingerprint({
      teamId: command.teamId,
      recordId: command.accountId,
      expectedRecordVersion: command.expectedRecordVersion,
      patch: normalized.patch,
    });
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateAccountOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different account update",
        );
      }

      return { ...(replayed.result as UpdateAccountResult), replayed: true };
    }

    const decision = await resolveCrmRecordAccess(
      crmRepository,
      context,
      command.teamId,
      command.accountId,
      "account",
      "write",
      "Account not found",
    );
    assertActiveRecordForMutation(
      await crmRepository.getCrmRecordForTeam(command.teamId, command.accountId),
      "Account not found",
    );
    assertUpdateFieldsWritable(
      normalized.patch,
      decision,
      "Account update contains blocked fields",
    );

    if (normalized.next.legalEntityId) {
      await resolveCrmRecordAccess(
        crmRepository,
        context,
        command.teamId,
        normalized.next.legalEntityId,
        "legal_entity",
        "read",
        "Legal entity not found",
      );

      const legalEntity = await crmRepository.getLegalEntityForTeam(
        command.teamId,
        normalized.next.legalEntityId,
      );

      if (!legalEntity) {
        throw new AppError("NOT_FOUND", "Legal entity not found");
      }
    }

    const record = await updateRecordEnvelope(crmRepository, context, {
      teamId: command.teamId,
      recordId: account.recordId,
      expectedRecordVersion: command.expectedRecordVersion,
      notFoundMessage: "Account not found",
    });
    const updatedAccount = await crmRepository.updateAccount(normalized.next);

    if (!updatedAccount) {
      throw new AppError("NOT_FOUND", "Account not found");
    }

    await appendUpdateEvents(crmRepository, context, {
      teamId: command.teamId,
      action: "crm.account.updated",
      entityType: "account",
      entityId: updatedAccount.recordId,
      payload: {
        accountId: updatedAccount.recordId,
        organizationId: updatedAccount.organizationId,
        changedFields: Object.keys(normalized.patch),
        recordVersion: record.version,
      },
    });

    const result = { account: updatedAccount, record, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateAccountOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createContact(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateContactCommand,
): Promise<CreateContactResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Contact not found");

    const normalized = normalizeCreateContactCommand(command);
    const principal = await assertCrmCreateAccess(
      crmRepository,
      context,
      command.teamId,
      "contact",
      normalized.contact,
      "You cannot create contacts for this team",
    );
    const fingerprint = JSON.stringify(normalized);
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createContactOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for a different contact");
      }

      return { ...(replayed.result as CreateContactResult), replayed: true };
    }

    await resolveCrmRecordAccess(
      crmRepository,
      context,
      command.teamId,
      normalized.contact.accountId,
      "account",
      "read",
      "Account not found",
    );

    const account = await crmRepository.getAccountForTeam(
      command.teamId,
      normalized.contact.accountId,
    );

    if (!account) {
      throw new AppError("NOT_FOUND", "Account not found");
    }

    const personRecordId = crypto.randomUUID();
    await crmRepository.createCrmRecord({
      recordId: personRecordId,
      teamId: command.teamId,
      objectTypeId: "person",
      createdByActorId: context.actor.id,
      ownerPrincipalId: principal.id,
    });
    await crmRepository.createCrmParty({
      recordId: personRecordId,
      teamId: command.teamId,
      partyType: "person",
    });
    const person = await crmRepository.createPerson({
      recordId: personRecordId,
      teamId: command.teamId,
      ...normalized.person,
    });

    const contactRecordId = crypto.randomUUID();
    await crmRepository.createCrmRecord({
      recordId: contactRecordId,
      teamId: command.teamId,
      objectTypeId: "contact",
      createdByActorId: context.actor.id,
      ownerPrincipalId: principal.id,
    });
    const contact = await crmRepository.createContact({
      recordId: contactRecordId,
      teamId: command.teamId,
      accountId: account.recordId,
      personId: person.recordId,
      role: normalized.contact.role,
      isPrimary: normalized.contact.isPrimary,
    });

    await crmRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "crm.contact.created",
      entityType: "contact",
      entityId: contact.recordId,
      metadata: {
        accountId: contact.accountId,
        personId: contact.personId,
        displayName: person.displayName,
        email: person.email,
        role: contact.role,
        isPrimary: contact.isPrimary,
      },
    });

    await crmRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "crm.contact.created",
      version: 1,
      payload: {
        contactId: contact.recordId,
        accountId: contact.accountId,
        personId: contact.personId,
        displayName: person.displayName,
        email: person.email,
        role: contact.role,
        isPrimary: contact.isPrimary,
      },
    });

    const result = { person, contact, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createContactOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function updateContact(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: UpdateContactCommand,
): Promise<UpdateContactResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Contact not found");

    const contact = await crmRepository.getContactForTeam(command.teamId, command.contactId);

    if (!contact) {
      throw new AppError("NOT_FOUND", "Contact not found");
    }

    const person = await crmRepository.getPersonForTeam(command.teamId, contact.personId);

    if (!person) {
      throw new AppError("NOT_FOUND", "Person not found");
    }

    const normalized = normalizeUpdateContactCommand(command, contact, person);
    const fingerprint = updateFingerprint({
      teamId: command.teamId,
      recordId: command.contactId,
      expectedRecordVersion: command.expectedRecordVersion,
      patch: { ...normalized.contactPatch, ...normalized.personPatch },
    });
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateContactOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different contact update",
        );
      }

      return { ...(replayed.result as UpdateContactResult), replayed: true };
    }

    const [contactDecision, personDecision] = await Promise.all([
      resolveCrmRecordAccess(
        crmRepository,
        context,
        command.teamId,
        contact.recordId,
        "contact",
        "write",
        "Contact not found",
      ),
      resolveCrmRecordAccess(
        crmRepository,
        context,
        command.teamId,
        person.recordId,
        "person",
        "write",
        "Person not found",
      ),
    ]);
    assertActiveRecordForMutation(
      await crmRepository.getCrmRecordForTeam(command.teamId, contact.recordId),
      "Contact not found",
    );
    assertActiveRecordForMutation(
      await crmRepository.getCrmRecordForTeam(command.teamId, person.recordId),
      "Person not found",
    );
    assertUpdateFieldsWritable(
      normalized.contactPatch,
      contactDecision,
      "Contact update contains blocked fields",
    );
    assertUpdateFieldsWritable(
      normalized.personPatch,
      personDecision,
      "Person update contains blocked fields",
    );

    const record = await updateRecordEnvelope(crmRepository, context, {
      teamId: command.teamId,
      recordId: contact.recordId,
      expectedRecordVersion: command.expectedRecordVersion,
      notFoundMessage: "Contact not found",
    });
    const [updatedPerson, updatedContact] = await Promise.all([
      crmRepository.updatePerson(normalized.nextPerson),
      crmRepository.updateContact(normalized.nextContact),
    ]);

    if (!updatedPerson || !updatedContact) {
      throw new AppError("NOT_FOUND", "Contact not found");
    }

    await appendUpdateEvents(crmRepository, context, {
      teamId: command.teamId,
      action: "crm.contact.updated",
      entityType: "contact",
      entityId: updatedContact.recordId,
      payload: {
        contactId: updatedContact.recordId,
        accountId: updatedContact.accountId,
        personId: updatedPerson.recordId,
        changedFields: [
          ...Object.keys(normalized.contactPatch),
          ...Object.keys(normalized.personPatch),
        ],
        recordVersion: record.version,
      },
    });

    const result = { person: updatedPerson, contact: updatedContact, record, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateContactOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function linkAccountProviderCustomer(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: LinkAccountProviderCustomerCommand,
): Promise<LinkAccountProviderCustomerResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Account not found");

    const normalized = normalizeLinkAccountProviderCustomerCommand(command);
    const fingerprint = JSON.stringify(normalized);
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      linkAccountProviderCustomerOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different account provider-customer mapping",
        );
      }

      return { ...(replayed.result as LinkAccountProviderCustomerResult), replayed: true };
    }

    await resolveCrmRecordAccess(
      crmRepository,
      context,
      command.teamId,
      normalized.accountId,
      "account",
      "write",
      "Account not found",
    );

    const account = await crmRepository.getAccountForTeam(command.teamId, normalized.accountId);

    if (!account) {
      throw new AppError("NOT_FOUND", "Account not found");
    }

    const connection = await crmRepository.getIntegrationConnectionForTeam(
      command.teamId,
      normalized.connectionId,
    );

    if (
      !connection ||
      connection.provider !== normalized.provider ||
      connection.category !== "accounting" ||
      connection.status === "disabled"
    ) {
      throw new AppError("NOT_FOUND", "Accounting connection not found");
    }

    const providerObject = await crmRepository.getProviderObjectForTeam({
      teamId: command.teamId,
      provider: normalized.provider,
      providerObjectType: "customer",
      providerObjectId: normalized.providerCustomerId,
    });

    if (!providerObject || providerObjectConnectionId(providerObject) !== connection.id) {
      throw new AppError("NOT_FOUND", "Provider customer not found");
    }

    if (
      providerObject.internalEntityType &&
      (providerObject.internalEntityType !== "account" ||
        providerObject.internalEntityId !== account.recordId)
    ) {
      throw new AppError("CONFLICT", "Provider customer is already linked to another record");
    }

    const existingAccountCustomer = await findAccountProviderCustomerMapping(crmRepository, {
      teamId: command.teamId,
      provider: normalized.provider,
      connectionId: connection.id,
      accountId: account.recordId,
    });

    if (
      existingAccountCustomer &&
      existingAccountCustomer.providerObjectId !== providerObject.providerObjectId
    ) {
      throw new AppError(
        "CONFLICT",
        "Account is already linked to a provider customer for this connection",
      );
    }

    await crmRepository.upsertProviderObject({
      teamId: command.teamId,
      provider: providerObject.provider,
      providerObjectType: providerObject.providerObjectType,
      providerObjectId: providerObject.providerObjectId,
      connectionId: connection.id,
      internalEntityType: "account",
      internalEntityId: account.recordId,
      rawPayload: {
        ...providerObject.rawPayload,
        provider: providerObject.provider,
        integrationConnectionId: connection.id,
        linkedInternalEntityType: "account",
        linkedInternalEntityId: account.recordId,
      },
    });

    const linkedProviderObject = await crmRepository.getProviderObjectForTeam({
      teamId: command.teamId,
      provider: providerObject.provider,
      providerObjectType: providerObject.providerObjectType,
      providerObjectId: providerObject.providerObjectId,
    });

    if (!linkedProviderObject) {
      throw new AppError("NOT_FOUND", "Provider customer not found");
    }

    await crmRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "crm.account.provider_customer.linked",
      entityType: "account",
      entityId: account.recordId,
      metadata: {
        provider: providerObject.provider,
        connectionId: connection.id,
        providerObjectType: providerObject.providerObjectType,
        providerObjectId: providerObject.providerObjectId,
      },
    });

    await crmRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "crm.account.provider_customer.linked",
      version: 1,
      payload: {
        accountId: account.recordId,
        provider: providerObject.provider,
        connectionId: connection.id,
        providerObjectType: providerObject.providerObjectType,
        providerObjectId: providerObject.providerObjectId,
      },
    });

    const result = { account, providerObject: linkedProviderObject, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: linkAccountProviderCustomerOperation,
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
      status: deriveOpportunityStatusFromStage(normalized.stage),
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
        stage: opportunity.stage,
        status: opportunity.status,
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
        stage: opportunity.stage,
        status: opportunity.status,
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

export async function updateOpportunity(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: UpdateOpportunityCommand,
): Promise<UpdateOpportunityResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Opportunity not found");

    const opportunity = await crmRepository.getOpportunityForTeam(
      command.teamId,
      command.opportunityId,
    );

    if (!opportunity) {
      throw new AppError("NOT_FOUND", "Opportunity not found");
    }

    const normalized = normalizeUpdateOpportunityCommand(command, opportunity);
    const fingerprint = updateFingerprint({
      teamId: command.teamId,
      recordId: command.opportunityId,
      expectedRecordVersion: command.expectedRecordVersion,
      patch: normalized.patch,
    });
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateOpportunityOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different opportunity update",
        );
      }

      return { ...(replayed.result as UpdateOpportunityResult), replayed: true };
    }

    const decision = await resolveCrmRecordAccess(
      crmRepository,
      context,
      command.teamId,
      opportunity.recordId,
      "opportunity",
      "write",
      "Opportunity not found",
    );
    assertActiveRecordForMutation(
      await crmRepository.getCrmRecordForTeam(command.teamId, opportunity.recordId),
      "Opportunity not found",
    );
    assertUpdateFieldsWritable(
      normalized.patch,
      decision,
      "Opportunity update contains blocked fields",
    );

    try {
      assertValidMoney({
        amountMinor: normalized.next.amountMinor,
        currency: normalized.next.currencyCode,
      });
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const record = await updateRecordEnvelope(crmRepository, context, {
      teamId: command.teamId,
      recordId: opportunity.recordId,
      expectedRecordVersion: command.expectedRecordVersion,
      notFoundMessage: "Opportunity not found",
    });
    const updatedOpportunity = await crmRepository.updateOpportunity(normalized.next);

    if (!updatedOpportunity) {
      throw new AppError("NOT_FOUND", "Opportunity not found");
    }

    await appendUpdateEvents(crmRepository, context, {
      teamId: command.teamId,
      action: "crm.opportunity.updated",
      entityType: "opportunity",
      entityId: updatedOpportunity.recordId,
      payload: {
        opportunityId: updatedOpportunity.recordId,
        accountId: updatedOpportunity.accountId,
        changedFields: Object.keys(normalized.patch),
        recordVersion: record.version,
      },
    });

    const result = { opportunity: updatedOpportunity, record, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateOpportunityOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function updateOpportunityStage(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: UpdateOpportunityStageCommand,
): Promise<UpdateOpportunityStageResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Opportunity not found");

    if (!Number.isInteger(command.expectedRecordVersion) || command.expectedRecordVersion < 1) {
      throw new AppError("CONFLICT", "Expected record version must be a positive integer");
    }

    const nextStage = normalizeDealStage(command.stage);
    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      opportunityId: command.opportunityId,
      stage: nextStage,
      expectedRecordVersion: command.expectedRecordVersion,
    });
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateOpportunityStageOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different opportunity stage update",
        );
      }

      return { ...(replayed.result as UpdateOpportunityStageResult), replayed: true };
    }

    await resolveCrmRecordAccess(
      crmRepository,
      context,
      command.teamId,
      command.opportunityId,
      "opportunity",
      "write",
      "Opportunity not found",
    );

    const opportunity = await crmRepository.getOpportunityForTeam(
      command.teamId,
      command.opportunityId,
    );

    if (!opportunity) {
      throw new AppError("NOT_FOUND", "Opportunity not found");
    }

    try {
      assertOpportunityStageTransition(opportunity.stage, nextStage);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const updatedRecord = await crmRepository.incrementCrmRecordVersion({
      teamId: command.teamId,
      recordId: opportunity.recordId,
      expectedVersion: command.expectedRecordVersion,
      actorId: context.actor.id,
    });

    if (!updatedRecord) {
      throw new AppError("CONFLICT", "CRM record version conflict");
    }

    const updatedOpportunity = await crmRepository.updateOpportunityStage({
      teamId: command.teamId,
      opportunityId: opportunity.recordId,
      stage: nextStage,
      status: deriveOpportunityStatusFromStage(nextStage),
      actorId: context.actor.id,
    });

    if (!updatedOpportunity) {
      throw new AppError("NOT_FOUND", "Opportunity not found");
    }

    await crmRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "crm.opportunity.stage_updated",
      entityType: "opportunity",
      entityId: updatedOpportunity.recordId,
      metadata: {
        previousStage: opportunity.stage,
        stage: updatedOpportunity.stage,
        status: updatedOpportunity.status,
        recordVersion: updatedRecord.version,
      },
    });

    await crmRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "crm.opportunity.stage_updated",
      version: 1,
      payload: {
        opportunityId: updatedOpportunity.recordId,
        accountId: updatedOpportunity.accountId,
        previousStage: opportunity.stage,
        stage: updatedOpportunity.stage,
        status: updatedOpportunity.status,
        recordVersion: updatedRecord.version,
      },
    });

    const result = { opportunity: updatedOpportunity, record: updatedRecord, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateOpportunityStageOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function archiveAccount(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: ArchiveAccountCommand,
): Promise<ArchiveAccountResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Account not found");

    const fingerprint = archiveFingerprint({
      teamId: command.teamId,
      recordId: command.accountId,
      expectedRecordVersion: command.expectedRecordVersion,
    });
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      archiveAccountOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different account archive",
        );
      }

      return { ...(replayed.result as ArchiveAccountResult), replayed: true };
    }

    await resolveCrmRecordAccess(
      crmRepository,
      context,
      command.teamId,
      command.accountId,
      "account",
      "write",
      "Account not found",
    );

    const account = await crmRepository.getAccountForTeam(command.teamId, command.accountId);

    if (!account) {
      throw new AppError("NOT_FOUND", "Account not found");
    }

    const record = await archiveRecordEnvelope(crmRepository, context, {
      teamId: command.teamId,
      recordId: account.recordId,
      expectedRecordVersion: command.expectedRecordVersion,
      notFoundMessage: "Account not found",
    });

    await appendArchiveEvents(crmRepository, context, {
      teamId: command.teamId,
      action: "crm.account.archived",
      entityType: "account",
      entityId: account.recordId,
      payload: {
        accountId: account.recordId,
        organizationId: account.organizationId,
        recordVersion: record.version,
      },
    });

    const result = { account, record, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: archiveAccountOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function archiveContact(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: ArchiveContactCommand,
): Promise<ArchiveContactResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Contact not found");

    const fingerprint = archiveFingerprint({
      teamId: command.teamId,
      recordId: command.contactId,
      expectedRecordVersion: command.expectedRecordVersion,
    });
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      archiveContactOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different contact archive",
        );
      }

      return { ...(replayed.result as ArchiveContactResult), replayed: true };
    }

    await resolveCrmRecordAccess(
      crmRepository,
      context,
      command.teamId,
      command.contactId,
      "contact",
      "write",
      "Contact not found",
    );

    const contact = await crmRepository.getContactForTeam(command.teamId, command.contactId);

    if (!contact) {
      throw new AppError("NOT_FOUND", "Contact not found");
    }

    const record = await archiveRecordEnvelope(crmRepository, context, {
      teamId: command.teamId,
      recordId: contact.recordId,
      expectedRecordVersion: command.expectedRecordVersion,
      notFoundMessage: "Contact not found",
    });

    await appendArchiveEvents(crmRepository, context, {
      teamId: command.teamId,
      action: "crm.contact.archived",
      entityType: "contact",
      entityId: contact.recordId,
      payload: {
        contactId: contact.recordId,
        accountId: contact.accountId,
        personId: contact.personId,
        recordVersion: record.version,
      },
    });

    const result = { contact, record, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: archiveContactOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function archiveOpportunity(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: ArchiveOpportunityCommand,
): Promise<ArchiveOpportunityResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "Opportunity not found");

    const fingerprint = archiveFingerprint({
      teamId: command.teamId,
      recordId: command.opportunityId,
      expectedRecordVersion: command.expectedRecordVersion,
    });
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      archiveOpportunityOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different opportunity archive",
        );
      }

      return { ...(replayed.result as ArchiveOpportunityResult), replayed: true };
    }

    await resolveCrmRecordAccess(
      crmRepository,
      context,
      command.teamId,
      command.opportunityId,
      "opportunity",
      "write",
      "Opportunity not found",
    );

    const opportunity = await crmRepository.getOpportunityForTeam(
      command.teamId,
      command.opportunityId,
    );

    if (!opportunity) {
      throw new AppError("NOT_FOUND", "Opportunity not found");
    }

    try {
      assertOpportunityStageTransition(opportunity.stage, "archived");
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const record = await archiveRecordEnvelope(crmRepository, context, {
      teamId: command.teamId,
      recordId: opportunity.recordId,
      expectedRecordVersion: command.expectedRecordVersion,
      notFoundMessage: "Opportunity not found",
    });
    const archivedOpportunity = await crmRepository.updateOpportunityStage({
      teamId: command.teamId,
      opportunityId: opportunity.recordId,
      stage: "archived",
      status: deriveOpportunityStatusFromStage("archived"),
      actorId: context.actor.id,
    });

    if (!archivedOpportunity) {
      throw new AppError("NOT_FOUND", "Opportunity not found");
    }

    await appendArchiveEvents(crmRepository, context, {
      teamId: command.teamId,
      action: "crm.opportunity.archived",
      entityType: "opportunity",
      entityId: archivedOpportunity.recordId,
      payload: {
        opportunityId: archivedOpportunity.recordId,
        accountId: archivedOpportunity.accountId,
        previousStage: opportunity.stage,
        stage: archivedOpportunity.stage,
        status: archivedOpportunity.status,
        recordVersion: record.version,
      },
    });

    const result = { opportunity: archivedOpportunity, record, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: archiveOpportunityOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createObjectTypeDefinition(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateObjectTypeDefinitionCommand,
): Promise<CreateObjectTypeDefinitionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "CRM object type not found");
    await assertCrmMetadataAdminAccess(
      crmRepository,
      context,
      command.teamId,
      "You cannot create CRM object types for this team",
    );

    const normalized = normalizeMetadataObjectTypeDefinition(command);

    if (isKnownCrmObjectType(normalized.objectTypeId)) {
      throw new AppError("CONFLICT", "Built-in CRM object types are managed by Dawn");
    }

    const fingerprint = JSON.stringify(normalized);
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createObjectTypeDefinitionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different CRM object type",
        );
      }

      return { ...(replayed.result as CreateObjectTypeDefinitionResult), replayed: true };
    }

    const existing = await crmRepository.getCrmObjectTypeDefinitionForTeam(
      command.teamId,
      normalized.objectTypeId,
    );

    if (existing) {
      throw new AppError("CONFLICT", "CRM object type already exists");
    }

    const objectType = await crmRepository.createCrmObjectTypeDefinition({
      id: crypto.randomUUID(),
      teamId: command.teamId,
      objectTypeId: normalized.objectTypeId,
      label: normalized.label,
      isCustom: true,
      createdByActorId: context.actor.id,
    });

    await crmRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "crm.object_type_definition.created",
      entityType: "crm_object_type_definition",
      entityId: objectType.id,
      metadata: {
        objectTypeId: objectType.objectTypeId,
        label: objectType.label,
      },
    });

    await crmRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "crm.object_type_definition.created",
      version: 1,
      payload: {
        objectTypeDefinitionId: objectType.id,
        objectTypeId: objectType.objectTypeId,
        label: objectType.label,
      },
    });

    const result = { objectType, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createObjectTypeDefinitionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function createFieldDefinition(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateFieldDefinitionCommand,
): Promise<CreateFieldDefinitionResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "CRM field definition not found");
    await assertCrmMetadataAdminAccess(
      crmRepository,
      context,
      command.teamId,
      "You cannot create CRM field definitions for this team",
    );

    const normalized = normalizeMetadataFieldDefinition(command);
    assertNotBuiltInCrmField(normalized.objectTypeId, normalized.stableKey);

    const fingerprint = JSON.stringify(normalized);
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createFieldDefinitionOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different CRM field definition",
        );
      }

      return { ...(replayed.result as CreateFieldDefinitionResult), replayed: true };
    }

    const objectType = await ensureCrmObjectTypeDefinition(
      crmRepository,
      command.teamId,
      normalized.objectTypeId,
      context.actor.id,
    );
    const existing = await crmRepository.getCrmFieldDefinitionByStableKey({
      teamId: command.teamId,
      objectTypeId: normalized.objectTypeId,
      stableKey: normalized.stableKey,
    });

    if (existing) {
      throw new AppError("CONFLICT", "CRM field stable key already exists for this object type");
    }

    if (normalized.allowedReferenceObjectTypeId) {
      await ensureCrmObjectTypeDefinition(
        crmRepository,
        command.teamId,
        normalized.allowedReferenceObjectTypeId,
        context.actor.id,
      );
    }

    const fieldDefinition = await crmRepository.createCrmFieldDefinition({
      id: crypto.randomUUID(),
      teamId: command.teamId,
      objectTypeDefinitionId: objectType.id,
      objectTypeId: normalized.objectTypeId,
      stableKey: normalized.stableKey,
      label: normalized.label,
      fieldType: normalized.fieldType,
      cardinality: normalized.cardinality,
      isRequired: normalized.isRequired,
      isUnique: normalized.isUnique,
      allowedReferenceObjectTypeId: normalized.allowedReferenceObjectTypeId,
      createdByActorId: context.actor.id,
    });
    const optionSet =
      normalized.fieldType === "single_option"
        ? await crmRepository.createCrmOptionSet({
            id: crypto.randomUUID(),
            teamId: command.teamId,
            fieldDefinitionId: fieldDefinition.id,
            stableKey: `${fieldDefinition.stableKey}_options`,
            label: `${fieldDefinition.label} options`,
            createdByActorId: context.actor.id,
          })
        : null;
    const optionValues = optionSet
      ? await crmRepository.createCrmOptionValues(
          normalized.options.map((option) => ({
            id: crypto.randomUUID(),
            teamId: command.teamId,
            optionSetId: optionSet.id,
            stableKey: option.stableKey,
            label: option.label,
            sortOrder: option.sortOrder,
          })),
        )
      : [];

    await crmRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "crm.field_definition.created",
      entityType: "crm_field_definition",
      entityId: fieldDefinition.id,
      metadata: {
        objectTypeId: fieldDefinition.objectTypeId,
        stableKey: fieldDefinition.stableKey,
        fieldType: fieldDefinition.fieldType,
        optionValueCount: optionValues.length,
      },
    });

    await crmRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "crm.field_definition.created",
      version: 1,
      payload: {
        fieldDefinitionId: fieldDefinition.id,
        objectTypeId: fieldDefinition.objectTypeId,
        stableKey: fieldDefinition.stableKey,
        fieldType: fieldDefinition.fieldType,
      },
    });

    const result = { fieldDefinition, optionSet, optionValues, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createFieldDefinitionOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function setRecordFieldValue(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: SetRecordFieldValueCommand,
): Promise<SetRecordFieldValueResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const crmRepository = transactionRepository as CrmUseCaseRepository;

    assertCommandTeamMatchesContext(context, command.teamId, "CRM record not found");

    if (!Number.isInteger(command.expectedRecordVersion) || command.expectedRecordVersion < 1) {
      throw new AppError("CONFLICT", "Expected record version must be a positive integer");
    }

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      recordId: command.recordId,
      fieldDefinitionId: command.fieldDefinitionId,
      value: command.value,
      expectedRecordVersion: command.expectedRecordVersion,
    });
    const replayed = await crmRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      setRecordFieldValueOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different CRM custom field update",
        );
      }

      return { ...(replayed.result as SetRecordFieldValueResult), replayed: true };
    }

    const [fieldDefinition, record] = await Promise.all([
      crmRepository.getCrmFieldDefinitionForTeam(command.teamId, command.fieldDefinitionId),
      crmRepository.getCrmRecordForTeam(command.teamId, command.recordId),
    ]);

    if (!fieldDefinition) {
      throw new AppError("NOT_FOUND", "CRM field definition not found");
    }

    if (!record || record.objectTypeId !== fieldDefinition.objectTypeId) {
      throw new AppError("NOT_FOUND", "CRM record not found");
    }

    await assertCrmRecordMetadataWriteAccess(crmRepository, context, command.teamId, record);

    const optionValues =
      fieldDefinition.fieldType === "single_option"
        ? await crmRepository.listCrmOptionValuesForField({
            teamId: command.teamId,
            fieldDefinitionId: fieldDefinition.id,
          })
        : [];
    const normalizedValue = normalizeMetadataRecordFieldValue(
      fieldDefinition,
      command.value,
      optionValues,
    );

    await assertReferenceValueAllowed(crmRepository, context, command.teamId, fieldDefinition, {
      value: normalizedValue,
    });

    if (fieldDefinition.isUnique) {
      const existing = await crmRepository.findCrmRecordFieldValueByFieldValue({
        teamId: command.teamId,
        fieldDefinitionId: fieldDefinition.id,
        value: normalizedValue,
        excludeRecordId: record.id,
      });

      if (existing) {
        throw new AppError("CONFLICT", "CRM custom field value must be unique");
      }
    }

    const updatedRecord = await crmRepository.incrementCrmRecordVersion({
      teamId: command.teamId,
      recordId: record.id,
      expectedVersion: command.expectedRecordVersion,
      actorId: context.actor.id,
    });

    if (!updatedRecord) {
      throw new AppError("CONFLICT", "CRM record version conflict");
    }

    const fieldValue = await crmRepository.upsertCrmRecordFieldValue({
      id: crypto.randomUUID(),
      teamId: command.teamId,
      recordId: record.id,
      fieldDefinitionId: fieldDefinition.id,
      position: 0,
      value: normalizedValue,
      updatedByActorId: context.actor.id,
    });

    await crmRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "crm.record_field_value.set",
      entityType: "crm_record",
      entityId: record.id,
      metadata: {
        fieldDefinitionId: fieldDefinition.id,
        stableKey: fieldDefinition.stableKey,
        objectTypeId: fieldDefinition.objectTypeId,
        recordVersion: updatedRecord.version,
      },
    });

    await crmRepository.appendOutboxEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      type: "crm.record_field_value.set",
      version: 1,
      payload: {
        recordId: record.id,
        objectTypeId: fieldDefinition.objectTypeId,
        fieldDefinitionId: fieldDefinition.id,
        stableKey: fieldDefinition.stableKey,
        recordVersion: updatedRecord.version,
      },
    });

    const result = { fieldValue, record: updatedRecord, replayed: false };

    await crmRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: setRecordFieldValueOperation,
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
  const contacts = await repository.listContactsForAccount(command.teamId, account.recordId);
  const visibleContacts: AccountContactSummary[] = [];
  const visibleOpenOpportunities: Partial<Opportunity>[] = [];

  for (const summary of contacts) {
    if (!summary.contact.recordId || !summary.person.recordId) {
      continue;
    }

    const contactDecision = await resolveCrmRecordAccess(
      repository,
      context,
      command.teamId,
      summary.contact.recordId,
      "contact",
      "read",
      "Contact not found",
    );
    const personDecision = await resolveCrmRecordAccess(
      repository,
      context,
      command.teamId,
      summary.person.recordId,
      "person",
      "read",
      "Person not found",
    );

    visibleContacts.push({
      contact: redactCrmFields(summary.contact, contactDecision.visibleFields),
      person: redactCrmFields(summary.person, personDecision.visibleFields),
    });
  }

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
    contacts: visibleContacts,
    openOpportunities: visibleOpenOpportunities,
  };
}

export async function listAccountTimeline(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: ListAccountTimelineCommand,
): Promise<ListAccountTimelineResult> {
  assertCommandTeamMatchesContext(context, command.teamId, "Account not found");

  const limit = normalizeTimelineLimit(command.limit);
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

  const timelineContext: TimelineContext = {
    account,
    visibleAccount: redactCrmFields(account, accountDecision.visibleFields),
    visibleContacts: new Map(),
    visiblePeople: new Map(),
    visibleOpportunities: new Map(),
    marketProspects: new Map(),
  };
  const entityRefs: { entityType: string; entityId: string }[] = [
    { entityType: "account", entityId: account.recordId },
  ];
  const [contacts, opportunities, marketProspects] = await Promise.all([
    repository.listContactsForAccount(command.teamId, account.recordId),
    repository.listOpportunitiesForAccount(command.teamId, account.recordId),
    repository.listMarketProspectsForAccount(command.teamId, account.recordId),
  ]);

  for (const summary of contacts) {
    if (!summary.contact.recordId || !summary.person.recordId) {
      continue;
    }

    try {
      const [contactDecision, personDecision] = await Promise.all([
        resolveCrmRecordAccess(
          repository,
          context,
          command.teamId,
          summary.contact.recordId,
          "contact",
          "read",
          "Contact not found",
        ),
        resolveCrmRecordAccess(
          repository,
          context,
          command.teamId,
          summary.person.recordId,
          "person",
          "read",
          "Person not found",
        ),
      ]);
      timelineContext.visibleContacts.set(
        summary.contact.recordId,
        redactCrmFields(summary.contact, contactDecision.visibleFields),
      );
      timelineContext.visiblePeople.set(
        summary.contact.recordId,
        redactCrmFields(summary.person, personDecision.visibleFields),
      );
      entityRefs.push({ entityType: "contact", entityId: summary.contact.recordId });
    } catch (error) {
      if (error instanceof AppError && error.code === "NOT_FOUND") {
        continue;
      }

      throw error;
    }
  }

  for (const opportunity of opportunities) {
    try {
      const opportunityDecision = await resolveCrmRecordAccess(
        repository,
        context,
        command.teamId,
        opportunity.recordId,
        "opportunity",
        "read",
        "Opportunity not found",
      );
      timelineContext.visibleOpportunities.set(
        opportunity.recordId,
        redactCrmFields(opportunity, opportunityDecision.visibleFields),
      );
      entityRefs.push({ entityType: "opportunity", entityId: opportunity.recordId });
    } catch (error) {
      if (error instanceof AppError && error.code === "NOT_FOUND") {
        continue;
      }

      throw error;
    }
  }

  for (const prospect of marketProspects) {
    timelineContext.marketProspects.set(prospect.id, prospect);
    entityRefs.push({ entityType: "market_prospect", entityId: prospect.id });
    entityRefs.push({
      entityType: "market_company_snapshot",
      entityId: prospect.companySnapshotId,
    });
  }

  const auditBatches = await Promise.all([
    ...entityRefs.map((ref) =>
      repository.listAuditEvents({
        teamId: command.teamId,
        entityType: ref.entityType,
        entityId: ref.entityId,
        limit,
      }),
    ),
    repository.listAuditEvents({
      teamId: command.teamId,
      entityType: "commercial_document",
      metadata: { accountId: account.recordId },
      limit,
    }),
  ]);
  const seen = new Set<string>();
  const entries = auditBatches
    .flat()
    .filter((event) => accountTimelineActions.has(event.action))
    .filter((event) => {
      if (seen.has(event.id)) {
        return false;
      }

      seen.add(event.id);
      return true;
    })
    .map((event) => accountTimelineEntryFromAuditEvent(event, timelineContext))
    .filter((entry): entry is AccountTimelineEntry => entry !== null)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, limit);

  return { entries };
}

export async function listAccounts(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: ListAccountsCommand,
): Promise<ListAccountsResult> {
  assertCommandTeamMatchesContext(context, command.teamId, "Account not found");

  const normalized = normalizeListAccountsCommand(command);

  if (normalized.legalEntityId) {
    await resolveCrmRecordAccess(
      repository,
      context,
      command.teamId,
      normalized.legalEntityId,
      "legal_entity",
      "read",
      "Legal entity not found",
    );
  }

  const recordIds = normalized.customFieldFilter
    ? await resolveAccountCustomFieldFilter(repository, command.teamId, normalized)
    : null;

  const accounts = await repository.listAccountsForTeam({ ...normalized, recordIds });
  const visibleAccounts: Partial<Account>[] = [];

  for (const account of accounts) {
    try {
      const decision = await resolveCrmRecordAccess(
        repository,
        context,
        command.teamId,
        account.recordId,
        "account",
        "read",
        "Account not found",
      );
      visibleAccounts.push(redactCrmFields(account, decision.visibleFields));
    } catch (error) {
      if (error instanceof AppError && error.code === "NOT_FOUND") {
        continue;
      }

      throw error;
    }
  }

  return { accounts: visibleAccounts };
}

export async function suggestAccountDuplicates(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  command: SuggestAccountDuplicatesCommand,
): Promise<SuggestAccountDuplicatesResult> {
  assertCommandTeamMatchesContext(context, command.teamId, "Account not found");

  const normalized = normalizeSuggestAccountDuplicatesCommand(command);
  const organizations = await repository.listOrganizationsForDuplicateCheck(normalized);

  if (organizations.length === 0) {
    return { suggestions: [] };
  }

  const organizationById = new Map(
    organizations.map((organization) => [organization.recordId, organization]),
  );
  const accounts = await repository.listAccountsForTeam({
    teamId: normalized.teamId,
    organizationIds: organizations.map((organization) => organization.recordId),
  });
  const suggestions: {
    suggestion: AccountDuplicateSuggestion;
    hasOrganizationNumberMatch: boolean;
    createdAt: string;
  }[] = [];

  for (const account of accounts) {
    const organization = organizationById.get(account.organizationId);

    if (!organization) {
      continue;
    }

    try {
      const [accountDecision, organizationDecision] = await Promise.all([
        resolveCrmRecordAccess(
          repository,
          context,
          command.teamId,
          account.recordId,
          "account",
          "read",
          "Account not found",
        ),
        resolveCrmRecordAccess(
          repository,
          context,
          command.teamId,
          organization.recordId,
          "organization",
          "read",
          "Organization not found",
        ),
      ]);
      const visibleAccount = redactCrmFields(account, accountDecision.visibleFields);
      const visibleOrganization = redactCrmFields(organization, organizationDecision.visibleFields);
      const matchReasons = duplicateMatchReasons(organization, visibleOrganization, normalized);

      if (matchReasons.length === 0) {
        continue;
      }

      suggestions.push({
        suggestion: {
          account: visibleAccount,
          organization: visibleOrganization,
          matchReasons,
        },
        hasOrganizationNumberMatch: matchReasons.includes("organization_number"),
        createdAt: account.createdAt,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "NOT_FOUND") {
        continue;
      }

      throw error;
    }
  }

  suggestions.sort((left, right) => {
    if (left.hasOrganizationNumberMatch !== right.hasOrganizationNumberMatch) {
      return left.hasOrganizationNumberMatch ? -1 : 1;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });

  return {
    suggestions: suggestions.slice(0, normalized.limit).map((candidate) => candidate.suggestion),
  };
}

type TimelineContext = {
  account: Account;
  visibleAccount: Partial<Account>;
  visibleContacts: Map<string, Partial<Contact>>;
  visiblePeople: Map<string, Partial<Person>>;
  visibleOpportunities: Map<string, Partial<Opportunity>>;
  marketProspects: Map<string, MarketProspect>;
};

function accountTimelineEntryFromAuditEvent(
  event: AuditLogEntry,
  context: TimelineContext,
): AccountTimelineEntry | null {
  const details = timelineEventDetails(event, context);

  if (!details) {
    return null;
  }

  return {
    id: event.id,
    teamId: event.teamId,
    actorId: event.actorId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    accountId: context.account.recordId,
    details,
    occurredAt: event.occurredAt,
  };
}

function timelineEventDetails(
  event: AuditLogEntry,
  context: TimelineContext,
): Record<string, unknown> | null {
  if (event.action === "crm.account.created") {
    return pickDefined({
      organizationId: context.visibleAccount.organizationId,
      legalEntityId: context.visibleAccount.legalEntityId,
      accountType: context.visibleAccount.accountType,
      relationshipStatus: context.visibleAccount.relationshipStatus,
      lifecycleStage: context.visibleAccount.lifecycleStage,
    });
  }

  if (event.action === "crm.account.updated") {
    if (event.entityId !== context.account.recordId) {
      return null;
    }

    return pickDefined({
      accountId: context.visibleAccount.recordId,
      organizationId: context.visibleAccount.organizationId,
      legalEntityId: context.visibleAccount.legalEntityId,
      accountType: context.visibleAccount.accountType,
      relationshipStatus: context.visibleAccount.relationshipStatus,
      lifecycleStage: context.visibleAccount.lifecycleStage,
      changedFields: event.metadata.changedFields,
      recordVersion: event.metadata.recordVersion,
    });
  }

  if (event.action === "crm.account.archived") {
    if (event.entityId !== context.account.recordId) {
      return null;
    }

    return pickDefined({
      accountId: context.visibleAccount.recordId,
      organizationId: context.visibleAccount.organizationId,
      recordVersion: event.metadata.recordVersion,
    });
  }

  if (event.action === "crm.contact.created") {
    const contact = context.visibleContacts.get(event.entityId);
    const person = context.visiblePeople.get(event.entityId);

    if (!contact || !person) {
      return null;
    }

    return pickDefined({
      accountId: contact.accountId,
      contactId: contact.recordId,
      personId: contact.personId,
      displayName: person.displayName,
      email: person.email,
      role: contact.role,
      isPrimary: contact.isPrimary,
    });
  }

  if (event.action === "crm.contact.updated") {
    const contact = context.visibleContacts.get(event.entityId);
    const person = context.visiblePeople.get(event.entityId);

    if (!contact || !person) {
      return null;
    }

    return pickDefined({
      accountId: contact.accountId,
      contactId: contact.recordId,
      personId: contact.personId,
      displayName: person.displayName,
      email: person.email,
      role: contact.role,
      isPrimary: contact.isPrimary,
      changedFields: event.metadata.changedFields,
      recordVersion: event.metadata.recordVersion,
    });
  }

  if (event.action === "crm.contact.archived") {
    const contact = context.visibleContacts.get(event.entityId);

    if (!contact) {
      return null;
    }

    return pickDefined({
      accountId: contact.accountId,
      contactId: contact.recordId,
      personId: contact.personId,
      recordVersion: event.metadata.recordVersion,
    });
  }

  if (event.action === "crm.account.provider_customer.linked") {
    if (event.entityId !== context.account.recordId) {
      return null;
    }

    return pickDefined({
      provider: event.metadata.provider,
      connectionId: event.metadata.connectionId,
      providerObjectType: event.metadata.providerObjectType,
      providerObjectId: event.metadata.providerObjectId,
    });
  }

  if (event.action === "crm.opportunity.created") {
    const opportunity = context.visibleOpportunities.get(event.entityId);

    if (!opportunity) {
      return null;
    }

    return opportunityTimelineDetails(opportunity);
  }

  if (event.action === "crm.opportunity.updated") {
    const opportunity = context.visibleOpportunities.get(event.entityId);

    if (!opportunity) {
      return null;
    }

    return pickDefined({
      ...opportunityTimelineDetails(opportunity),
      changedFields: event.metadata.changedFields,
      recordVersion: event.metadata.recordVersion,
    });
  }

  if (event.action === "crm.opportunity.stage_updated") {
    const opportunity = context.visibleOpportunities.get(event.entityId);

    if (!opportunity) {
      return null;
    }

    return pickDefined({
      ...opportunityTimelineDetails(opportunity),
      previousStage: opportunity.stage === undefined ? undefined : event.metadata.previousStage,
      recordVersion: opportunity.stage === undefined ? undefined : event.metadata.recordVersion,
    });
  }

  if (event.action === "crm.opportunity.archived") {
    const opportunity = context.visibleOpportunities.get(event.entityId);

    if (!opportunity) {
      return null;
    }

    return pickDefined({
      ...opportunityTimelineDetails(opportunity),
      previousStage: opportunity.stage === undefined ? undefined : event.metadata.previousStage,
      recordVersion: opportunity.stage === undefined ? undefined : event.metadata.recordVersion,
    });
  }

  if (event.action.startsWith("commercial_document.")) {
    if (event.metadata.accountId !== context.account.recordId) {
      return null;
    }

    const opportunity =
      typeof event.metadata.opportunityId === "string"
        ? context.visibleOpportunities.get(event.metadata.opportunityId)
        : null;

    if (event.metadata.opportunityId && !opportunity) {
      return null;
    }

    return pickDefined({
      documentId: event.metadata.documentId ?? event.entityId,
      accountId: event.metadata.accountId,
      opportunityId: event.metadata.opportunityId,
      opportunityName: opportunity?.name,
      documentType: event.metadata.documentType,
      title: event.metadata.title,
      status: event.metadata.status,
      total: event.metadata.total,
      versionId: event.metadata.versionId,
      versionNumber: event.metadata.versionNumber,
      supersededVersionId: event.metadata.supersededVersionId,
      recipientEmail: event.metadata.recipientEmail,
      expiresAt: event.metadata.expiresAt,
      viewedAt: event.metadata.viewedAt,
      declinedAt: event.metadata.declinedAt,
      reason: event.metadata.reason,
      pdfSha256: event.metadata.pdfSha256,
    });
  }

  if (event.action.startsWith("signature.")) {
    if (event.metadata.accountId !== context.account.recordId) {
      return null;
    }

    const opportunity =
      typeof event.metadata.opportunityId === "string"
        ? context.visibleOpportunities.get(event.metadata.opportunityId)
        : null;

    if (event.metadata.opportunityId && !opportunity) {
      return null;
    }

    return pickDefined({
      documentId: event.metadata.documentId ?? event.entityId,
      accountId: event.metadata.accountId,
      opportunityId: event.metadata.opportunityId,
      opportunityName: opportunity?.name,
      documentType: event.metadata.documentType,
      title: event.metadata.title,
      status: event.metadata.status,
      signatureRequestId: event.metadata.signatureRequestId,
      signatureEvidenceId: event.metadata.signatureEvidenceId,
      provider: event.metadata.provider,
      providerEventId: event.metadata.providerEventId,
      providerSessionId: event.metadata.providerSessionId,
      documentVersionId: event.metadata.documentVersionId,
      versionNumber: event.metadata.versionNumber,
      pdfSha256: event.metadata.pdfSha256,
      hiddenSignedDataHash: event.metadata.hiddenSignedDataHash,
      signerEmail: event.metadata.signerEmail,
      signerName: event.metadata.signerName,
      expectedPdfSha256: event.metadata.expectedPdfSha256,
      receivedPdfSha256: event.metadata.receivedPdfSha256,
    });
  }

  if (event.action.startsWith("market.")) {
    const prospectId =
      typeof event.metadata.prospectId === "string" ? event.metadata.prospectId : null;

    if (
      event.entityType === "market_prospect" &&
      (!prospectId || !context.marketProspects.has(prospectId))
    ) {
      return null;
    }

    return pickDefined({
      prospectId: event.metadata.prospectId,
      companyId: event.metadata.companyId,
      companySnapshotId: event.metadata.companySnapshotId ?? event.entityId,
      organizationNumber: event.metadata.organizationNumber,
      legalName: event.metadata.legalName,
      sourceGoalId: event.metadata.sourceGoalId,
      sourceRunId: event.metadata.sourceRunId,
      icpId: event.metadata.icpId,
      segmentId: event.metadata.segmentId,
      sourceProvider: event.metadata.sourceProvider ?? event.metadata.provider,
      sourceProviderCapability:
        event.metadata.sourceProviderCapability ?? event.metadata.providerCapability,
      sourceDecisionSummary: event.metadata.sourceDecisionSummary,
      accountId: event.metadata.accountId ?? context.account.recordId,
      opportunityId: event.metadata.opportunityId,
      organizationId: event.metadata.organizationId,
      contentHash: event.metadata.contentHash,
    });
  }

  return null;
}

function opportunityTimelineDetails(opportunity: Partial<Opportunity>) {
  return pickDefined({
    opportunityId: opportunity.recordId,
    accountId: opportunity.accountId,
    name: opportunity.name,
    stage: opportunity.stage,
    status: opportunity.status,
    amountMinor: opportunity.amountMinor,
    currencyCode: opportunity.currencyCode,
    expectedCloseDate: opportunity.expectedCloseDate,
  });
}

function pickDefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function updateFingerprint(input: {
  teamId: string;
  recordId: string;
  expectedRecordVersion: number;
  patch: Record<string, unknown>;
}) {
  return JSON.stringify(input);
}

async function updateRecordEnvelope(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  input: {
    teamId: string;
    recordId: string;
    expectedRecordVersion: number;
    notFoundMessage: string;
  },
) {
  if (!Number.isInteger(input.expectedRecordVersion) || input.expectedRecordVersion < 1) {
    throw new AppError("CONFLICT", "Expected record version must be a positive integer");
  }

  const current = await repository.getCrmRecordForTeam(input.teamId, input.recordId);
  assertActiveRecordForMutation(current, input.notFoundMessage);

  const updated = await repository.incrementCrmRecordVersion({
    teamId: input.teamId,
    recordId: input.recordId,
    expectedVersion: input.expectedRecordVersion,
    actorId: context.actor.id,
  });

  if (!updated) {
    throw new AppError("CONFLICT", "CRM record version conflict");
  }

  return updated;
}

function assertActiveRecordForMutation(record: CrmRecord | null, notFoundMessage: string) {
  if (!record || record.lifecycleState === "deleted") {
    throw new AppError("NOT_FOUND", notFoundMessage);
  }

  if (record.lifecycleState === "archived") {
    throw new AppError("CONFLICT", "CRM record is archived");
  }
}

function assertUpdateFieldsWritable(
  patch: Record<string, unknown>,
  decision: CrmAccessDecision,
  message: string,
) {
  if (Object.keys(patch).length === 0) {
    throw new AppError("CONFLICT", "Update command must change at least one field");
  }

  try {
    assertCrmWriteFields(patch, decision.writableFields);
  } catch (error) {
    throw new AppError("FORBIDDEN", `${message}: ${errorMessage(error)}`);
  }
}

async function appendUpdateEvents(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  input: {
    teamId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  },
) {
  await repository.appendAuditEvent({
    teamId: input.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.payload,
  });

  await repository.appendOutboxEvent({
    teamId: input.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    type: input.action,
    version: 1,
    payload: input.payload,
  });
}

function archiveFingerprint(input: {
  teamId: string;
  recordId: string;
  expectedRecordVersion: number;
}) {
  return JSON.stringify(input);
}

async function archiveRecordEnvelope(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  input: {
    teamId: string;
    recordId: string;
    expectedRecordVersion: number;
    notFoundMessage: string;
  },
) {
  if (!Number.isInteger(input.expectedRecordVersion) || input.expectedRecordVersion < 1) {
    throw new AppError("CONFLICT", "Expected record version must be a positive integer");
  }

  const current = await repository.getCrmRecordForTeam(input.teamId, input.recordId);

  if (!current || current.lifecycleState === "deleted") {
    throw new AppError("NOT_FOUND", input.notFoundMessage);
  }

  if (current.lifecycleState === "archived") {
    throw new AppError("CONFLICT", "CRM record is already archived");
  }

  const archived = await repository.archiveCrmRecord({
    teamId: input.teamId,
    recordId: input.recordId,
    expectedVersion: input.expectedRecordVersion,
    actorId: context.actor.id,
  });

  if (!archived) {
    throw new AppError("CONFLICT", "CRM record version conflict");
  }

  return archived;
}

async function appendArchiveEvents(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  input: {
    teamId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  },
) {
  await repository.appendAuditEvent({
    teamId: input.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.payload,
  });

  await repository.appendOutboxEvent({
    teamId: input.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    type: input.action,
    version: 1,
    payload: input.payload,
  });
}

function normalizeCreateOrganizationCommand(command: CreateOrganizationCommand) {
  const legalName = command.legalName.trim();
  const countryCode = command.countryCode?.trim().toUpperCase() || null;

  if (!legalName) {
    throw new AppError("CONFLICT", "Legal name is required");
  }

  return {
    teamId: command.teamId,
    legalName,
    displayName: command.displayName?.trim() || null,
    organizationNumber: normalizeOptionalOrganizationNumber(
      command.organizationNumber,
      countryCode,
    ),
    countryCode,
    vatNumber: command.vatNumber?.trim() || null,
    websiteDomain: command.websiteDomain?.trim().toLowerCase() || null,
  };
}

function normalizeMetadataObjectTypeDefinition(command: CreateObjectTypeDefinitionCommand) {
  try {
    return normalizeCrmObjectTypeDefinition({
      objectTypeId: command.objectTypeId,
      label: command.label,
      isCustom: true,
    });
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }
}

function normalizeMetadataFieldDefinition(command: CreateFieldDefinitionCommand) {
  try {
    return normalizeCrmFieldDefinition({
      objectTypeId: command.objectTypeId,
      stableKey: command.stableKey,
      label: command.label,
      fieldType: command.fieldType,
      cardinality: command.cardinality ?? "single",
      isRequired: command.isRequired ?? false,
      isUnique: command.isUnique ?? false,
      allowedReferenceObjectTypeId: command.allowedReferenceObjectTypeId ?? null,
      options: command.options ?? [],
    });
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }
}

function normalizeMetadataRecordFieldValue(
  fieldDefinition: CrmFieldDefinition,
  value: CrmFieldValueInput,
  optionValues: readonly CrmOptionValue[],
) {
  try {
    return normalizeCrmRecordFieldValue(fieldDefinition, value, optionValues);
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }
}

function assertNotBuiltInCrmField(objectTypeId: string, stableKey: string) {
  if (!isKnownCrmObjectType(objectTypeId)) {
    return;
  }

  const builtInKeys = new Set(crmObjectFields[objectTypeId].map(toStableIdentifier));

  if (builtInKeys.has(stableKey)) {
    throw new AppError("CONFLICT", "Built-in CRM fields must remain in typed CRM tables");
  }
}

function isKnownCrmObjectType(objectTypeId: string): objectTypeId is CrmObjectType {
  return Object.prototype.hasOwnProperty.call(crmObjectFields, objectTypeId);
}

function toStableIdentifier(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function normalizeCreateLegalEntityCommand(command: CreateLegalEntityCommand) {
  const legalName = command.legalName.trim();
  const countryCode = command.countryCode?.trim().toUpperCase() || "SE";
  const baseCurrency = command.baseCurrency?.trim().toUpperCase() || "SEK";
  const fiscalYearStartMonth = command.fiscalYearStartMonth ?? 1;
  const validStatuses: LegalEntity["status"][] = ["active", "inactive"];
  const status =
    command.status && validStatuses.includes(command.status) ? command.status : "active";

  if (!legalName) {
    throw new AppError("CONFLICT", "Legal entity name is required");
  }

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new AppError("CONFLICT", "Country code must use ISO 3166-1 alpha-2 format");
  }

  if (!/^[A-Z]{3}$/.test(baseCurrency)) {
    throw new AppError("CONFLICT", "Base currency must use ISO 4217 format");
  }

  if (
    !Number.isInteger(fiscalYearStartMonth) ||
    fiscalYearStartMonth < 1 ||
    fiscalYearStartMonth > 12
  ) {
    throw new AppError("CONFLICT", "Fiscal year start month must be between 1 and 12");
  }

  return {
    teamId: command.teamId,
    legalName,
    organizationNumber: normalizeOptionalOrganizationNumber(
      command.organizationNumber,
      countryCode,
    ),
    vatNumber: command.vatNumber?.trim() || null,
    countryCode,
    baseCurrency,
    fiscalYearStartMonth,
    status,
  };
}

function normalizeSuggestAccountDuplicatesCommand(command: SuggestAccountDuplicatesCommand) {
  const legalName = command.legalName.trim();
  const limit = command.limit ?? 10;

  if (!legalName) {
    throw new AppError("CONFLICT", "Legal name is required");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new AppError("CONFLICT", "Duplicate suggestion limit must be between 1 and 25");
  }

  return {
    teamId: command.teamId,
    legalName,
    legalNameKey: normalizeDuplicateLegalName(legalName),
    organizationNumber: normalizeOptionalSwedishOrganizationNumber(command.organizationNumber),
    limit,
  };
}

function normalizeTimelineLimit(value: number | null | undefined) {
  const limit = value ?? 50;

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("CONFLICT", "Timeline limit must be between 1 and 100");
  }

  return limit;
}

function normalizeOptionalOrganizationNumber(
  value: string | null | undefined,
  countryCode: string | null,
) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (!countryCode || countryCode === "SE") {
    return normalizeOptionalSwedishOrganizationNumber(trimmed);
  }

  return trimmed;
}

function normalizeOptionalSwedishOrganizationNumber(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return normalizeSwedishOrganizationNumber(trimmed);
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }
}

function duplicateMatchReasons(
  organization: Organization,
  visibleOrganization: Partial<Organization>,
  normalized: ReturnType<typeof normalizeSuggestAccountDuplicatesCommand>,
): AccountDuplicateMatchReason[] {
  const matchReasons: AccountDuplicateMatchReason[] = [];

  if (
    normalized.organizationNumber &&
    organization.organizationNumber === normalized.organizationNumber &&
    visibleOrganization.organizationNumber === normalized.organizationNumber
  ) {
    matchReasons.push("organization_number");
  }

  if (
    normalizeDuplicateLegalName(organization.legalName) === normalized.legalNameKey &&
    visibleOrganization.legalName === organization.legalName
  ) {
    matchReasons.push("legal_name");
  }

  return matchReasons;
}

function normalizeDuplicateLegalName(value: string) {
  return value.trim().toLocaleLowerCase("sv-SE");
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

async function assertCrmMetadataAdminAccess(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
  forbiddenMessage: string,
) {
  const capabilities = await resolveCrmCapabilities(repository, context, teamId);

  if (!capabilities.includes("team.manage")) {
    throw new AppError("FORBIDDEN", forbiddenMessage);
  }
}

async function assertCrmRecordMetadataWriteAccess(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
  record: CrmRecord,
) {
  if (isKnownCrmObjectType(record.objectTypeId)) {
    await resolveCrmRecordAccess(
      repository,
      context,
      teamId,
      record.id,
      record.objectTypeId,
      "write",
      "CRM record not found",
    );
    return;
  }

  await assertCrmMetadataAdminAccess(
    repository,
    context,
    teamId,
    "You cannot update custom CRM records for this team",
  );
}

async function assertCrmRecordMetadataReadAccess(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
  record: CrmRecord,
) {
  if (isKnownCrmObjectType(record.objectTypeId)) {
    await resolveCrmRecordAccess(
      repository,
      context,
      teamId,
      record.id,
      record.objectTypeId,
      "read",
      "CRM record not found",
    );
    return;
  }

  await assertCrmMetadataAdminAccess(
    repository,
    context,
    teamId,
    "You cannot read custom CRM records for this team",
  );
}

async function ensureCrmObjectTypeDefinition(
  repository: CrmUseCaseRepository,
  teamId: string,
  objectTypeId: string,
  actorId: string,
) {
  const existing = await repository.getCrmObjectTypeDefinitionForTeam(teamId, objectTypeId);

  if (existing) {
    return existing;
  }

  if (!isKnownCrmObjectType(objectTypeId)) {
    throw new AppError("NOT_FOUND", "CRM object type not found");
  }

  return repository.createCrmObjectTypeDefinition({
    id: crypto.randomUUID(),
    teamId,
    objectTypeId,
    label: builtInObjectTypeLabels[objectTypeId],
    isCustom: false,
    createdByActorId: actorId,
  });
}

async function assertReferenceValueAllowed(
  repository: CrmUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
  fieldDefinition: CrmFieldDefinition,
  input: { value: CrmRecordFieldValueDraft },
) {
  if (!input.value.referenceRecordId) {
    return;
  }

  const referenceRecord = await repository.getCrmRecordForTeam(
    teamId,
    input.value.referenceRecordId,
  );

  if (
    !referenceRecord ||
    referenceRecord.objectTypeId !== fieldDefinition.allowedReferenceObjectTypeId
  ) {
    throw new AppError("NOT_FOUND", "Referenced CRM record not found");
  }

  await assertCrmRecordMetadataReadAccess(repository, context, teamId, referenceRecord);
}

async function resolveAccountCustomFieldFilter(
  repository: CrmUseCaseRepository,
  teamId: string,
  command: ReturnType<typeof normalizeListAccountsCommand>,
) {
  const filter = command.customFieldFilter;

  if (!filter) {
    return null;
  }

  const fieldDefinition = await repository.getCrmFieldDefinitionForTeam(
    teamId,
    filter.fieldDefinitionId,
  );

  if (!fieldDefinition) {
    throw new AppError("NOT_FOUND", "CRM field definition not found");
  }

  if (fieldDefinition.objectTypeId !== "account") {
    throw new AppError("CONFLICT", "Account custom field filters must target account fields");
  }

  const optionValues =
    fieldDefinition.fieldType === "single_option"
      ? await repository.listCrmOptionValuesForField({
          teamId,
          fieldDefinitionId: fieldDefinition.id,
        })
      : [];
  const value = normalizeMetadataRecordFieldValue(fieldDefinition, filter.value, optionValues);

  return repository.listRecordIdsByCrmFieldValue({
    teamId,
    fieldDefinitionId: fieldDefinition.id,
    value,
  });
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
  const validRelationshipStatuses: Account["relationshipStatus"][] = [
    "active",
    "churned",
    "inactive",
  ];
  const relationshipStatus: Account["relationshipStatus"] =
    command.relationshipStatus && validRelationshipStatuses.includes(command.relationshipStatus)
      ? command.relationshipStatus
      : "active";
  const validLifecycleStages: NonNullable<Account["lifecycleStage"]>[] = [
    "new",
    "qualified",
    "active",
    "growth",
    "at_risk",
    "churned",
    "inactive",
  ];
  const lifecycleStage =
    command.lifecycleStage && validLifecycleStages.includes(command.lifecycleStage)
      ? command.lifecycleStage
      : null;

  return {
    teamId: command.teamId,
    organizationId: command.organizationId,
    accountType,
    legalEntityId: command.legalEntityId?.trim() || null,
    relationshipStatus,
    lifecycleStage,
    segment: command.segment?.trim() || null,
    territory: command.territory?.trim() || null,
    primaryOwnerPrincipalId: command.primaryOwnerPrincipalId?.trim() || null,
    customerSince: normalizeOptionalDate(
      command.customerSince,
      "Customer since must be a valid date",
    ),
    churnedAt: normalizeOptionalDate(command.churnedAt, "Churned at must be a valid date"),
  };
}

function normalizeUpdateAccountCommand(command: UpdateAccountCommand, current: Account) {
  const merged = normalizeCreateAccountCommand({
    teamId: command.teamId,
    organizationId: current.organizationId,
    accountType: command.accountType ?? current.accountType,
    legalEntityId:
      command.legalEntityId === undefined ? current.legalEntityId : command.legalEntityId,
    relationshipStatus: command.relationshipStatus ?? current.relationshipStatus,
    lifecycleStage:
      command.lifecycleStage === undefined ? current.lifecycleStage : command.lifecycleStage,
    segment: command.segment === undefined ? current.segment : command.segment,
    territory: command.territory === undefined ? current.territory : command.territory,
    primaryOwnerPrincipalId:
      command.primaryOwnerPrincipalId === undefined
        ? current.primaryOwnerPrincipalId
        : command.primaryOwnerPrincipalId,
    customerSince:
      command.customerSince === undefined ? current.customerSince : command.customerSince,
    churnedAt: command.churnedAt === undefined ? current.churnedAt : command.churnedAt,
    idempotencyKey: command.idempotencyKey,
  });
  const patch = pickProvided(command, [
    "accountType",
    "legalEntityId",
    "relationshipStatus",
    "lifecycleStage",
    "segment",
    "territory",
    "primaryOwnerPrincipalId",
    "customerSince",
    "churnedAt",
  ]);

  return {
    teamId: command.teamId,
    accountId: command.accountId,
    expectedRecordVersion: command.expectedRecordVersion,
    patch: patchFromValues(patch, merged),
    next: {
      teamId: command.teamId,
      accountId: command.accountId,
      accountType: merged.accountType,
      legalEntityId: merged.legalEntityId,
      relationshipStatus: merged.relationshipStatus,
      lifecycleStage: merged.lifecycleStage,
      segment: merged.segment,
      territory: merged.territory,
      primaryOwnerPrincipalId: merged.primaryOwnerPrincipalId,
      customerSince: merged.customerSince,
      churnedAt: merged.churnedAt,
    },
  };
}

function normalizeCreateContactCommand(command: CreateContactCommand) {
  const accountId = command.accountId.trim();

  if (!accountId) {
    throw new AppError("CONFLICT", "Account ID is required");
  }

  try {
    return {
      teamId: command.teamId,
      person: normalizeCrmPersonIdentity({
        givenName: command.givenName ?? null,
        familyName: command.familyName ?? null,
        displayName: command.displayName ?? null,
        email: command.email ?? null,
        phoneNumber: command.phoneNumber ?? null,
      }),
      contact: {
        teamId: command.teamId,
        accountId,
        role: command.role?.trim() || null,
        isPrimary: command.isPrimary ?? false,
      },
    };
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }
}

function normalizeUpdateContactCommand(
  command: UpdateContactCommand,
  contact: Contact,
  person: Person,
) {
  const nextGivenName = command.givenName === undefined ? person.givenName : command.givenName;
  const nextFamilyName = command.familyName === undefined ? person.familyName : command.familyName;
  const displayNameInput =
    command.displayName !== undefined
      ? command.displayName
      : command.givenName !== undefined || command.familyName !== undefined
        ? null
        : person.displayName;
  const personDraft = (() => {
    try {
      return normalizeCrmPersonIdentity({
        givenName: nextGivenName,
        familyName: nextFamilyName,
        displayName: displayNameInput,
        email: command.email === undefined ? person.email : command.email,
        phoneNumber: command.phoneNumber === undefined ? person.phoneNumber : command.phoneNumber,
      });
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }
  })();
  const nextContact = {
    teamId: command.teamId,
    contactId: command.contactId,
    role: command.role === undefined ? contact.role : command.role?.trim() || null,
    isPrimary:
      command.isPrimary === undefined || command.isPrimary === null
        ? contact.isPrimary
        : command.isPrimary,
  };
  const contactPatch = patchFromValues(pickProvided(command, ["role", "isPrimary"]), nextContact);
  const personPatch = patchFromValues(
    pickProvided(command, ["givenName", "familyName", "displayName", "email", "phoneNumber"]),
    personDraft,
  );

  if (personDraft.displayName !== person.displayName && !("displayName" in personPatch)) {
    personPatch.displayName = personDraft.displayName;
  }

  return {
    teamId: command.teamId,
    contactId: command.contactId,
    expectedRecordVersion: command.expectedRecordVersion,
    contactPatch,
    personPatch,
    nextContact,
    nextPerson: {
      teamId: command.teamId,
      personId: person.recordId,
      givenName: personDraft.givenName,
      familyName: personDraft.familyName,
      displayName: personDraft.displayName,
      email: personDraft.email,
      phoneNumber: personDraft.phoneNumber,
    },
  };
}

function normalizeLinkAccountProviderCustomerCommand(command: LinkAccountProviderCustomerCommand) {
  const accountId = command.accountId.trim();
  const connectionId = command.connectionId.trim();
  const providerCustomerId = command.providerCustomerId.trim();

  if (!accountId) {
    throw new AppError("CONFLICT", "Account ID is required");
  }

  if (!connectionId) {
    throw new AppError("CONFLICT", "Accounting connection ID is required");
  }

  if (!providerCustomerId) {
    throw new AppError("CONFLICT", "Provider customer ID is required");
  }

  return {
    teamId: command.teamId,
    accountId,
    provider: command.provider,
    connectionId,
    providerCustomerId,
  };
}

function normalizeListAccountsCommand(command: ListAccountsCommand) {
  const customFieldFilter = command.customFieldFilter
    ? {
        fieldDefinitionId: command.customFieldFilter.fieldDefinitionId.trim(),
        value: command.customFieldFilter.value,
      }
    : null;

  if (command.customFieldFilter && !customFieldFilter?.fieldDefinitionId) {
    throw new AppError("CONFLICT", "CRM field definition ID is required");
  }

  return {
    teamId: command.teamId,
    legalEntityId: command.legalEntityId?.trim() || null,
    relationshipStatus: command.relationshipStatus ?? null,
    accountType: command.accountType ?? null,
    customFieldFilter,
  };
}

function providerObjectConnectionId(providerObject: CrmProviderObjectRecord) {
  const integrationConnectionId = providerObject.rawPayload.integrationConnectionId;

  return typeof integrationConnectionId === "string" ? integrationConnectionId : null;
}

async function findAccountProviderCustomerMapping(
  repository: CrmUseCaseRepository,
  input: {
    teamId: string;
    provider: string;
    connectionId: string;
    accountId: string;
  },
) {
  const customers = await repository.listProviderObjectsForTeam({
    teamId: input.teamId,
    provider: input.provider,
    providerObjectTypes: ["customer"],
  });

  return (
    customers.find(
      (customer) =>
        providerObjectConnectionId(customer) === input.connectionId &&
        customer.internalEntityType === "account" &&
        customer.internalEntityId === input.accountId,
    ) ?? null
  );
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
    stage: normalizeDealStage(command.stage ?? "new"),
    expectedCloseDate: command.expectedCloseDate ?? null,
    primaryOwnerPrincipalId: command.primaryOwnerPrincipalId?.trim() || null,
  };
}

function normalizeUpdateOpportunityCommand(
  command: UpdateOpportunityCommand,
  current: Opportunity,
) {
  const name = command.name === undefined ? current.name : command.name.trim();

  if (!name) {
    throw new AppError("CONFLICT", "Opportunity name is required");
  }

  const next = {
    teamId: command.teamId,
    opportunityId: command.opportunityId,
    name,
    amountMinor: command.amountMinor ?? current.amountMinor,
    currencyCode:
      command.currencyCode === undefined
        ? current.currencyCode
        : command.currencyCode.trim().toUpperCase(),
    expectedCloseDate:
      command.expectedCloseDate === undefined
        ? current.expectedCloseDate
        : normalizeOptionalDate(command.expectedCloseDate, "Expected close date must be valid"),
    primaryOwnerPrincipalId:
      command.primaryOwnerPrincipalId === undefined
        ? current.primaryOwnerPrincipalId
        : command.primaryOwnerPrincipalId?.trim() || null,
  };
  const patch = patchFromValues(
    pickProvided(command, [
      "name",
      "amountMinor",
      "currencyCode",
      "expectedCloseDate",
      "primaryOwnerPrincipalId",
    ]),
    next,
  );

  return {
    teamId: command.teamId,
    opportunityId: command.opportunityId,
    expectedRecordVersion: command.expectedRecordVersion,
    patch,
    next,
  };
}

function normalizeDealStage(stage: string | null | undefined) {
  try {
    return normalizeOpportunityStage(stage);
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }
}

function pickProvided<T extends Record<string, unknown>, K extends keyof T>(
  input: T,
  keys: readonly K[],
) {
  const provided: Partial<Record<K, true>> = {};

  for (const key of keys) {
    if (input[key] !== undefined) {
      provided[key] = true;
    }
  }

  return provided;
}

function patchFromValues<T extends Record<string, unknown>>(
  provided: Partial<Record<keyof T, true>>,
  values: T,
) {
  const patch: Record<string, unknown> = {};

  for (const key of Object.keys(provided)) {
    patch[key] = values[key];
  }

  return patch;
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

function normalizeOptionalDate(value: string | null | undefined, message: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("CONFLICT", message);
  }

  return date.toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected application error";
}
