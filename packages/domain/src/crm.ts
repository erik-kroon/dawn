import { assertValidMoney } from "./money";

// Record envelope - shared identity for all CRM objects
export type RecordLifecycleState = "active" | "archived" | "deleted";

export type CrmRecord = {
  id: string;
  teamId: string;
  objectTypeId: string;
  ownerPrincipalId: string | null;
  lifecycleState: RecordLifecycleState;
  version: number;
  createdByActorId: string;
  updatedByActorId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
};

// Party - common layer for organizations and people
export type PartyType = "organization" | "person";

export type Party = {
  recordId: string;
  teamId: string;
  partyType: PartyType;
};

// Person - real external individual, separate from the account relationship
export type Person = {
  recordId: string;
  teamId: string;
  givenName: string | null;
  familyName: string | null;
  displayName: string;
  email: string | null;
  phoneNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

// Organization - real external company, not the CRM relationship
export type Organization = {
  recordId: string;
  teamId: string;
  legalName: string;
  displayName: string | null;
  organizationNumber: string | null;
  countryCode: string | null;
  vatNumber: string | null;
  websiteDomain: string | null;
  createdAt: string;
  updatedAt: string;
};

// Legal entity - tenant-owned company that holds commercial relationships
export type LegalEntityStatus = "active" | "inactive";

export type LegalEntity = {
  recordId: string;
  teamId: string;
  legalName: string;
  organizationNumber: string | null;
  vatNumber: string | null;
  countryCode: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  status: LegalEntityStatus;
  createdAt: string;
  updatedAt: string;
};

// Account - tenant's commercial relationship to an organization
export type AccountType = "prospect" | "customer" | "partner" | "supplier" | "former_customer";
export type RelationshipStatus = "active" | "churned" | "inactive";
export type AccountLifecycleStage =
  | "new"
  | "qualified"
  | "active"
  | "growth"
  | "at_risk"
  | "churned"
  | "inactive";

export type Account = {
  recordId: string;
  teamId: string;
  legalEntityId: string | null;
  organizationId: string;
  accountType: AccountType;
  relationshipStatus: RelationshipStatus;
  lifecycleStage: AccountLifecycleStage | null;
  segment: string | null;
  territory: string | null;
  primaryOwnerPrincipalId: string | null;
  customerSince: string | null;
  churnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Contact - tenant's commercial relationship between an account and a person
export type Contact = {
  recordId: string;
  teamId: string;
  accountId: string;
  personId: string;
  role: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AccountContactSummary = {
  contact: Partial<Contact>;
  person: Partial<Person>;
};

// Opportunity - sales deal linked to an account
export type OpportunityStatus = "open" | "won" | "lost";
export const opportunityStages = [
  "new",
  "qualified",
  "proposal_preparation",
  "proposal_sent",
  "negotiation",
  "won_pending_invoice",
  "won",
  "lost",
  "archived",
] as const;

export type OpportunityStage = (typeof opportunityStages)[number];

export type Opportunity = {
  recordId: string;
  teamId: string;
  accountId: string;
  name: string;
  amountMinor: number;
  currencyCode: string;
  status: OpportunityStatus;
  stage: OpportunityStage;
  expectedCloseDate: string | null;
  primaryOwnerPrincipalId: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Account summary - query result
export type AccountSummary = {
  organization: Partial<Organization>;
  account: Partial<Account>;
  contacts: AccountContactSummary[];
  openOpportunities: Partial<Opportunity>[];
};

// Metadata extensions - typed custom objects, fields, options, and values
export const crmMetadataFieldTypes = [
  "text",
  "integer",
  "boolean",
  "date",
  "money",
  "single_option",
  "record_reference",
] as const;

export type CrmFieldType = (typeof crmMetadataFieldTypes)[number];
export type CrmFieldCardinality = "single" | "many";

export type CrmObjectTypeDefinition = {
  id: string;
  teamId: string;
  objectTypeId: string;
  label: string;
  isCustom: boolean;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmFieldDefinition = {
  id: string;
  teamId: string;
  objectTypeDefinitionId: string;
  objectTypeId: string;
  stableKey: string;
  label: string;
  fieldType: CrmFieldType;
  cardinality: CrmFieldCardinality;
  isRequired: boolean;
  isUnique: boolean;
  allowedReferenceObjectTypeId: string | null;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmOptionSet = {
  id: string;
  teamId: string;
  fieldDefinitionId: string;
  stableKey: string;
  label: string;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmOptionValue = {
  id: string;
  teamId: string;
  optionSetId: string;
  stableKey: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CrmRecordFieldValueDraft = {
  textValue: string | null;
  integerValue: number | null;
  booleanValue: boolean | null;
  dateValue: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
  optionValueId: string | null;
  referenceRecordId: string | null;
};

export type CrmRecordFieldValue = CrmRecordFieldValueDraft & {
  id: string;
  teamId: string;
  recordId: string;
  fieldDefinitionId: string;
  position: number;
  updatedByActorId: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmFieldValueInput =
  | { type: "text"; value: string }
  | { type: "integer"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "date"; value: string }
  | { type: "money"; amountMinor: number; currencyCode: string }
  | { type: "single_option"; optionValueId?: string | null; stableKey?: string | null }
  | { type: "record_reference"; recordId: string };

export type CrmObjectTypeDefinitionDraft = {
  objectTypeId: string;
  label: string;
  isCustom: boolean;
};

export type CrmFieldDefinitionDraft = {
  objectTypeId: string;
  stableKey: string;
  label: string;
  fieldType: CrmFieldType;
  cardinality: CrmFieldCardinality;
  isRequired: boolean;
  isUnique: boolean;
  allowedReferenceObjectTypeId: string | null;
  options: CrmOptionValueDraft[];
};

export type CrmOptionValueDraft = {
  stableKey: string;
  label: string;
  sortOrder: number;
};

export type CrmPersonIdentityDraft = {
  givenName: string | null;
  familyName: string | null;
  displayName: string;
  email: string | null;
  phoneNumber: string | null;
};

export function normalizeCrmObjectTypeDefinition(input: {
  objectTypeId: string;
  label: string;
  isCustom?: boolean | null;
}): CrmObjectTypeDefinitionDraft {
  const objectTypeId = normalizeStableIdentifier(input.objectTypeId, "Object type ID");
  const label = normalizeLabel(input.label, "Object type label");

  return {
    objectTypeId,
    label,
    isCustom: input.isCustom ?? true,
  };
}

export function normalizeCrmFieldDefinition(input: {
  objectTypeId: string;
  stableKey: string;
  label: string;
  fieldType: CrmFieldType;
  cardinality?: CrmFieldCardinality | null;
  isRequired?: boolean | null;
  isUnique?: boolean | null;
  allowedReferenceObjectTypeId?: string | null;
  options?: readonly {
    stableKey: string;
    label: string;
    sortOrder?: number | null;
  }[];
}): CrmFieldDefinitionDraft {
  assertCrmFieldType(input.fieldType);

  const cardinality = input.cardinality ?? "single";
  if (cardinality !== "single" && cardinality !== "many") {
    throw new Error("Field cardinality must be single or many");
  }

  if (cardinality === "many" && input.isUnique) {
    throw new Error("Unique custom fields must use single cardinality");
  }

  const allowedReferenceObjectTypeId = input.allowedReferenceObjectTypeId
    ? normalizeStableIdentifier(input.allowedReferenceObjectTypeId, "Allowed reference object type")
    : null;

  if (input.fieldType === "record_reference" && !allowedReferenceObjectTypeId) {
    throw new Error("Record reference fields must declare an allowed object type");
  }

  if (input.fieldType !== "record_reference" && allowedReferenceObjectTypeId) {
    throw new Error("Allowed reference object type only applies to record reference fields");
  }

  const options = normalizeCrmOptionValueDrafts(input.options ?? []);

  if (input.fieldType !== "single_option" && options.length > 0) {
    throw new Error("Only single option fields can define option values");
  }

  return {
    objectTypeId: normalizeStableIdentifier(input.objectTypeId, "Object type ID"),
    stableKey: normalizeStableIdentifier(input.stableKey, "Field stable key"),
    label: normalizeLabel(input.label, "Field label"),
    fieldType: input.fieldType,
    cardinality,
    isRequired: input.isRequired ?? false,
    isUnique: input.isUnique ?? false,
    allowedReferenceObjectTypeId,
    options,
  };
}

export function normalizeCrmRecordFieldValue(
  fieldDefinition: Pick<
    CrmFieldDefinition,
    "fieldType" | "isRequired" | "allowedReferenceObjectTypeId"
  >,
  input: CrmFieldValueInput,
  optionValues: readonly Pick<CrmOptionValue, "id" | "stableKey" | "isActive">[] = [],
): CrmRecordFieldValueDraft {
  if (input.type !== fieldDefinition.fieldType) {
    throw new Error(`Expected ${fieldDefinition.fieldType} custom field value`);
  }

  const empty = emptyCrmRecordFieldValueDraft();

  switch (input.type) {
    case "text": {
      const value = input.value;
      if (fieldDefinition.isRequired && value.trim().length === 0) {
        throw new Error("Required text custom field value cannot be empty");
      }

      return {
        ...empty,
        textValue: value,
      };
    }
    case "integer": {
      if (!Number.isSafeInteger(input.value)) {
        throw new Error("Integer custom field value must be a safe integer");
      }

      return {
        ...empty,
        integerValue: input.value,
      };
    }
    case "boolean":
      return {
        ...empty,
        booleanValue: input.value,
      };
    case "date":
      return {
        ...empty,
        dateValue: normalizeMetadataDate(input.value),
      };
    case "money": {
      const currencyCode = input.currencyCode.trim().toUpperCase();
      assertValidMoney({ amountMinor: input.amountMinor, currency: currencyCode });

      return {
        ...empty,
        amountMinor: input.amountMinor,
        currencyCode,
      };
    }
    case "single_option": {
      const optionValue = resolveOptionValue(input, optionValues);

      return {
        ...empty,
        optionValueId: optionValue.id,
      };
    }
    case "record_reference": {
      const recordId = input.recordId.trim();

      if (!recordId) {
        throw new Error("Record reference custom field value is required");
      }

      return {
        ...empty,
        referenceRecordId: recordId,
      };
    }
  }
}

export function normalizeCrmPersonIdentity(input: {
  givenName?: string | null;
  familyName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}): CrmPersonIdentityDraft {
  const givenName = input.givenName?.trim() || null;
  const familyName = input.familyName?.trim() || null;
  const explicitDisplayName = input.displayName?.trim() || null;
  const derivedDisplayName = [givenName, familyName].filter(Boolean).join(" ").trim() || null;
  const displayName = explicitDisplayName ?? derivedDisplayName;

  if (!displayName) {
    throw new Error("Contact display name is required");
  }

  const email = input.email?.trim().toLowerCase() || null;

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Contact email must be valid");
  }

  return {
    givenName,
    familyName,
    displayName,
    email,
    phoneNumber: input.phoneNumber?.trim() || null,
  };
}

export function normalizeOpportunityStage(stage: string | null | undefined): OpportunityStage {
  const normalized = stage?.trim() || "new";

  if (!(opportunityStages as readonly string[]).includes(normalized)) {
    throw new Error("Unsupported deal stage");
  }

  return normalized as OpportunityStage;
}

export function deriveOpportunityStatusFromStage(stage: OpportunityStage): OpportunityStatus {
  if (stage === "won" || stage === "won_pending_invoice") {
    return "won";
  }

  if (stage === "lost" || stage === "archived") {
    return "lost";
  }

  return "open";
}

export function assertOpportunityStageTransition(
  currentStage: OpportunityStage,
  nextStage: OpportunityStage,
) {
  if (currentStage === nextStage) {
    return;
  }

  const openStages: readonly OpportunityStage[] = [
    "new",
    "qualified",
    "proposal_preparation",
    "proposal_sent",
    "negotiation",
  ];

  if (currentStage === "archived") {
    throw new Error("Archived deals cannot change stage");
  }

  if (nextStage === "archived") {
    return;
  }

  if (currentStage === "won" || currentStage === "lost") {
    throw new Error("Closed deals can only be archived");
  }

  if (currentStage === "won_pending_invoice") {
    if (nextStage === "won") {
      return;
    }

    throw new Error("Won deals pending invoice can only move to won or archived");
  }

  if (openStages.includes(currentStage) && openStages.includes(nextStage)) {
    return;
  }

  if (
    openStages.includes(currentStage) &&
    (nextStage === "won_pending_invoice" || nextStage === "lost")
  ) {
    return;
  }

  throw new Error("Unsupported deal stage transition");
}

function normalizeCrmOptionValueDrafts(
  options: readonly {
    stableKey: string;
    label: string;
    sortOrder?: number | null;
  }[],
) {
  const seen = new Set<string>();

  return options.map((option, index) => {
    const stableKey = normalizeStableIdentifier(option.stableKey, "Option stable key");

    if (seen.has(stableKey)) {
      throw new Error(`Option stable key "${stableKey}" is already used`);
    }

    seen.add(stableKey);

    const sortOrder = option.sortOrder ?? index;
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new Error("Option sort order must be a non-negative integer");
    }

    return {
      stableKey,
      label: normalizeLabel(option.label, "Option label"),
      sortOrder,
    };
  });
}

function assertCrmFieldType(fieldType: string): asserts fieldType is CrmFieldType {
  if (!(crmMetadataFieldTypes as readonly string[]).includes(fieldType)) {
    throw new Error("Unsupported CRM custom field type");
  }
}

function normalizeStableIdentifier(value: string, label: string) {
  const stableIdentifier = value.trim().toLowerCase();

  if (!/^[a-z][a-z0-9_]{1,62}$/.test(stableIdentifier)) {
    throw new Error(`${label} must be a stable snake_case identifier`);
  }

  return stableIdentifier;
}

function normalizeLabel(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required`);
  }

  if (normalized.length > 120) {
    throw new Error(`${label} must be 120 characters or fewer`);
  }

  return normalized;
}

function emptyCrmRecordFieldValueDraft(): CrmRecordFieldValueDraft {
  return {
    textValue: null,
    integerValue: null,
    booleanValue: null,
    dateValue: null,
    amountMinor: null,
    currencyCode: null,
    optionValueId: null,
    referenceRecordId: null,
  };
}

function normalizeMetadataDate(value: string) {
  const trimmed = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00.000Z`)
    : new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Date custom field value must be a valid ISO date");
  }

  return date.toISOString();
}

function resolveOptionValue(
  input: Extract<CrmFieldValueInput, { type: "single_option" }>,
  optionValues: readonly Pick<CrmOptionValue, "id" | "stableKey" | "isActive">[],
) {
  const optionValueId = input.optionValueId?.trim() || null;
  const stableKey = input.stableKey?.trim().toLowerCase() || null;

  if (!optionValueId && !stableKey) {
    throw new Error("Single option custom field value is required");
  }

  const optionValue = optionValues.find((option) =>
    optionValueId ? option.id === optionValueId : option.stableKey === stableKey,
  );

  if (!optionValue || !optionValue.isActive) {
    throw new Error("Single option custom field value is not allowed");
  }

  return optionValue;
}
