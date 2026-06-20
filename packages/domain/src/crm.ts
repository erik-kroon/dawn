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

// Opportunity - sales deal linked to an account
export type OpportunityStatus = "open" | "won" | "lost";

export type Opportunity = {
  recordId: string;
  teamId: string;
  accountId: string;
  name: string;
  amountMinor: number;
  currencyCode: string;
  status: OpportunityStatus;
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
  openOpportunities: Partial<Opportunity>[];
};
