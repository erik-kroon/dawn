import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { providerObject, team } from "./core";

export const crmRecord = pgTable(
  "crm_record",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    objectTypeId: text("object_type_id").notNull(),
    ownerPrincipalId: text("owner_principal_id"),
    lifecycleState: text("lifecycle_state").default("active").notNull(),
    version: integer("version").default(1).notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    updatedByActorId: text("updated_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    archivedAt: timestamp("archived_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [index("crm_record_team_object_type_idx").on(table.teamId, table.objectTypeId)],
);

export const crmParty = pgTable(
  "crm_party",
  {
    recordId: text("record_id")
      .primaryKey()
      .references(() => crmRecord.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    partyType: text("party_type").notNull(),
  },
  (table) => [index("crm_party_team_party_type_idx").on(table.teamId, table.partyType)],
);

export const crmOrganization = pgTable(
  "crm_organization",
  {
    recordId: text("record_id")
      .primaryKey()
      .references(() => crmRecord.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    displayName: text("display_name"),
    organizationNumber: text("organization_number"),
    countryCode: text("country_code"),
    vatNumber: text("vat_number"),
    websiteDomain: text("website_domain"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("crm_organization_team_legal_name_idx").on(table.teamId, table.legalName),
    uniqueIndex("crm_organization_team_organization_number_idx").on(
      table.teamId,
      table.organizationNumber,
    ),
  ],
);

export const crmPerson = pgTable(
  "crm_person",
  {
    recordId: text("record_id")
      .primaryKey()
      .references(() => crmRecord.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    givenName: text("given_name"),
    familyName: text("family_name"),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phoneNumber: text("phone_number"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("crm_person_team_display_name_idx").on(table.teamId, table.displayName),
    index("crm_person_team_email_idx").on(table.teamId, table.email),
  ],
);

export const crmLegalEntity = pgTable(
  "crm_legal_entity",
  {
    recordId: text("record_id")
      .primaryKey()
      .references(() => crmRecord.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    organizationNumber: text("organization_number"),
    vatNumber: text("vat_number"),
    countryCode: text("country_code").default("SE").notNull(),
    baseCurrency: text("base_currency").default("SEK").notNull(),
    fiscalYearStartMonth: integer("fiscal_year_start_month").default(1).notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("crm_legal_entity_team_status_idx").on(table.teamId, table.status),
    uniqueIndex("crm_legal_entity_team_organization_number_idx").on(
      table.teamId,
      table.organizationNumber,
    ),
  ],
);

export const crmAccount = pgTable(
  "crm_account",
  {
    recordId: text("record_id")
      .primaryKey()
      .references(() => crmRecord.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    legalEntityId: text("legal_entity_id").references(() => crmLegalEntity.recordId, {
      onDelete: "restrict",
    }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => crmOrganization.recordId, { onDelete: "restrict" }),
    accountType: text("account_type").default("prospect").notNull(),
    relationshipStatus: text("relationship_status").default("active").notNull(),
    lifecycleStage: text("lifecycle_stage"),
    segment: text("segment"),
    territory: text("territory"),
    primaryOwnerPrincipalId: text("primary_owner_principal_id"),
    customerSince: timestamp("customer_since"),
    churnedAt: timestamp("churned_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("crm_account_team_legal_entity_idx").on(table.teamId, table.legalEntityId),
    index("crm_account_team_organization_idx").on(table.teamId, table.organizationId),
    index("crm_account_team_account_type_idx").on(table.teamId, table.accountType),
    index("crm_account_team_relationship_status_idx").on(table.teamId, table.relationshipStatus),
  ],
);

export const crmContact = pgTable(
  "crm_contact",
  {
    recordId: text("record_id")
      .primaryKey()
      .references(() => crmRecord.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => crmAccount.recordId, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => crmPerson.recordId, { onDelete: "restrict" }),
    role: text("role"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("crm_contact_team_account_idx").on(table.teamId, table.accountId),
    index("crm_contact_team_person_idx").on(table.teamId, table.personId),
    uniqueIndex("crm_contact_team_account_person_idx").on(
      table.teamId,
      table.accountId,
      table.personId,
    ),
  ],
);

export const crmOpportunity = pgTable(
  "crm_opportunity",
  {
    recordId: text("record_id")
      .primaryKey()
      .references(() => crmRecord.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => crmAccount.recordId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    status: text("status").default("open").notNull(),
    stage: text("stage").default("new").notNull(),
    expectedCloseDate: timestamp("expected_close_date"),
    primaryOwnerPrincipalId: text("primary_owner_principal_id"),
    wonAt: timestamp("won_at"),
    lostAt: timestamp("lost_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("crm_opportunity_team_account_idx").on(table.teamId, table.accountId),
    index("crm_opportunity_team_status_idx").on(table.teamId, table.status),
    index("crm_opportunity_team_stage_idx").on(table.teamId, table.stage),
  ],
);

export const marketCompany = pgTable(
  "market_company",
  {
    id: text("id").primaryKey(),
    countryCode: text("country_code").notNull(),
    organizationNumber: text("organization_number").notNull(),
    legalName: text("legal_name").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("market_company_country_org_active_idx").on(
      table.countryCode,
      table.organizationNumber,
      table.status,
    ),
    index("market_company_legal_name_idx").on(table.legalName),
  ],
);

export const marketCompanySnapshot = pgTable(
  "market_company_snapshot",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => marketCompany.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerCapability: text("provider_capability").notNull(),
    providerCompanyId: text("provider_company_id"),
    retrievedAt: timestamp("retrieved_at").notNull(),
    normalizedFields: jsonb("normalized_fields")
      .$type<{
        legalName: string;
        organizationNumber: string;
        countryCode: string;
      }>()
      .notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    rawPayloadReference: text("raw_payload_reference"),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("market_company_snapshot_content_idx").on(
      table.companyId,
      table.provider,
      table.providerCapability,
      table.contentHash,
    ),
    index("market_company_snapshot_company_idx").on(table.companyId, table.retrievedAt),
    index("market_company_snapshot_provider_object_idx").on(
      table.provider,
      table.providerCompanyId,
    ),
  ],
);

export const marketProspect = pgTable(
  "market_prospect",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => marketCompany.id, { onDelete: "restrict" }),
    companySnapshotId: text("company_snapshot_id")
      .notNull()
      .references(() => marketCompanySnapshot.id, { onDelete: "restrict" }),
    status: text("status").default("created").notNull(),
    sourceGoalId: text("source_goal_id"),
    sourceRunId: text("source_run_id"),
    icpId: text("icp_id"),
    segmentId: text("segment_id"),
    sourceProvider: text("source_provider").notNull(),
    sourceProviderCapability: text("source_provider_capability").notNull(),
    sourceDecisionSummary: text("source_decision_summary").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    promotedAccountId: text("promoted_account_id").references(() => crmAccount.recordId, {
      onDelete: "set null",
    }),
    promotedOpportunityId: text("promoted_opportunity_id").references(
      () => crmOpportunity.recordId,
      { onDelete: "set null" },
    ),
    promotedAt: timestamp("promoted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("market_prospect_team_status_idx").on(table.teamId, table.status),
    index("market_prospect_team_company_idx").on(table.teamId, table.companyId),
    index("market_prospect_team_account_idx").on(table.teamId, table.promotedAccountId),
    index("market_prospect_team_opportunity_idx").on(table.teamId, table.promotedOpportunityId),
  ],
);

export const commercialDocument = pgTable(
  "commercial_document",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => crmAccount.recordId, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => crmOpportunity.recordId, { onDelete: "cascade" }),
    documentType: text("document_type").default("quote").notNull(),
    title: text("title").notNull(),
    status: text("status").default("draft").notNull(),
    currency: text("currency").notNull(),
    validUntil: timestamp("valid_until"),
    paymentTerms: text("payment_terms"),
    termsVersion: text("terms_version").notNull(),
    templateId: text("template_id"),
    recipientEmail: text("recipient_email"),
    scope: text("scope"),
    marketOrigin: jsonb("market_origin").$type<Record<string, unknown> | null>(),
    activeVersionId: text("active_version_id"),
    recipientAccessTokenHash: text("recipient_access_token_hash"),
    recipientAccessTokenExpiresAt: timestamp("recipient_access_token_expires_at"),
    sentAt: timestamp("sent_at"),
    viewedAt: timestamp("viewed_at"),
    declinedAt: timestamp("declined_at"),
    declineReason: text("decline_reason"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("commercial_document_team_status_idx").on(table.teamId, table.status),
    index("commercial_document_team_account_idx").on(table.teamId, table.accountId),
    index("commercial_document_team_opportunity_idx").on(table.teamId, table.opportunityId),
    uniqueIndex("commercial_document_recipient_token_idx").on(table.recipientAccessTokenHash),
  ],
);

export const commercialDocumentLine = pgTable(
  "commercial_document_line",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => commercialDocument.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    provider: text("provider"),
    providerConnectionId: text("provider_connection_id"),
    providerObjectId: text("provider_object_id"),
    providerObjectRecordId: text("provider_object_record_id").references(() => providerObject.id, {
      onDelete: "set null",
    }),
    articleNumber: text("article_number"),
    description: text("description").notNull(),
    unit: text("unit"),
    quantityMilli: integer("quantity_milli").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    currency: text("currency").notNull(),
    discountBasisPoints: integer("discount_basis_points").default(0).notNull(),
    vatRateBasisPoints: integer("vat_rate_basis_points").default(0).notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull(),
    vatMinor: integer("vat_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown> | null>(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("commercial_document_line_document_idx").on(table.documentId, table.sortOrder),
    index("commercial_document_line_provider_object_idx").on(table.providerObjectRecordId),
  ],
);

export const commercialDocumentVersion = pgTable(
  "commercial_document_version",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => commercialDocument.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    status: text("status").default("finalised").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    pdfObjectKey: text("pdf_object_key").notNull(),
    pdfBodyBase64: text("pdf_body_base64").notNull(),
    pdfSha256: text("pdf_sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    finalizedByActorId: text("finalized_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("commercial_document_version_number_idx").on(table.documentId, table.versionNumber),
    uniqueIndex("commercial_document_version_pdf_object_key_idx").on(table.pdfObjectKey),
    index("commercial_document_version_team_document_idx").on(table.teamId, table.documentId),
  ],
);

export const signatureRequest = pgTable(
  "signature_request",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => commercialDocument.id, { onDelete: "cascade" }),
    documentVersionId: text("document_version_id")
      .notNull()
      .references(() => commercialDocumentVersion.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerSessionId: text("provider_session_id").notNull(),
    status: text("status").default("requested").notNull(),
    signingUrl: text("signing_url"),
    expiresAt: timestamp("expires_at"),
    signingText: text("signing_text").notNull(),
    hiddenSignedData: jsonb("hidden_signed_data").$type<Record<string, unknown>>().notNull(),
    hiddenSignedDataHash: text("hidden_signed_data_hash").notNull(),
    providerRawPayload: jsonb("provider_raw_payload").$type<Record<string, unknown>>().notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("signature_request_team_document_idx").on(table.teamId, table.documentId),
    index("signature_request_team_version_idx").on(table.teamId, table.documentVersionId),
    uniqueIndex("signature_request_provider_session_idx").on(
      table.provider,
      table.providerSessionId,
    ),
  ],
);

export const signatureParty = pgTable(
  "signature_party",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    signatureRequestId: text("signature_request_id")
      .notNull()
      .references(() => signatureRequest.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    signingOrder: integer("signing_order").default(1).notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    providerPartyId: text("provider_party_id"),
    status: text("status").default("pending").notNull(),
    signedAt: timestamp("signed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("signature_party_request_order_idx").on(table.signatureRequestId, table.signingOrder),
    index("signature_party_team_status_idx").on(table.teamId, table.status),
  ],
);

export const signatureEvidence = pgTable(
  "signature_evidence",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    signatureRequestId: text("signature_request_id")
      .notNull()
      .references(() => signatureRequest.id, { onDelete: "cascade" }),
    signaturePartyId: text("signature_party_id").references(() => signatureParty.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerSessionId: text("provider_session_id").notNull(),
    signedAt: timestamp("signed_at").notNull(),
    collectedAt: timestamp("collected_at").notNull(),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email"),
    signerPersonalNumberMasked: text("signer_personal_number_masked"),
    documentPdfSha256: text("document_pdf_sha256").notNull(),
    verificationStatus: text("verification_status").notNull(),
    signatureValue: text("signature_value"),
    xmlDsig: text("xml_dsig"),
    ocspResponse: text("ocsp_response"),
    evidenceObjectKey: text("evidence_object_key"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("signature_evidence_provider_event_idx").on(table.provider, table.providerEventId),
    index("signature_evidence_request_idx").on(table.teamId, table.signatureRequestId),
    index("signature_evidence_session_idx").on(table.provider, table.providerSessionId),
  ],
);

export const crmObjectTypeDefinition = pgTable(
  "crm_object_type_definition",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    objectTypeId: text("object_type_id").notNull(),
    label: text("label").notNull(),
    isCustom: boolean("is_custom").default(true).notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("crm_object_type_definition_team_object_type_idx").on(
      table.teamId,
      table.objectTypeId,
    ),
  ],
);

export const crmFieldDefinition = pgTable(
  "crm_field_definition",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    objectTypeDefinitionId: text("object_type_definition_id")
      .notNull()
      .references(() => crmObjectTypeDefinition.id, { onDelete: "cascade" }),
    objectTypeId: text("object_type_id").notNull(),
    stableKey: text("stable_key").notNull(),
    label: text("label").notNull(),
    fieldType: text("field_type").notNull(),
    cardinality: text("cardinality").default("single").notNull(),
    isRequired: boolean("is_required").default(false).notNull(),
    isUnique: boolean("is_unique").default(false).notNull(),
    allowedReferenceObjectTypeId: text("allowed_reference_object_type_id"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("crm_field_definition_team_object_stable_key_idx").on(
      table.teamId,
      table.objectTypeId,
      table.stableKey,
    ),
    index("crm_field_definition_team_object_type_definition_idx").on(
      table.teamId,
      table.objectTypeDefinitionId,
    ),
  ],
);

export const crmOptionSet = pgTable(
  "crm_option_set",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    fieldDefinitionId: text("field_definition_id")
      .notNull()
      .references(() => crmFieldDefinition.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    label: text("label").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("crm_option_set_team_field_definition_idx").on(
      table.teamId,
      table.fieldDefinitionId,
    ),
  ],
);

export const crmOptionValue = pgTable(
  "crm_option_value",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    optionSetId: text("option_set_id")
      .notNull()
      .references(() => crmOptionSet.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("crm_option_value_team_set_stable_key_idx").on(
      table.teamId,
      table.optionSetId,
      table.stableKey,
    ),
    index("crm_option_value_team_set_sort_idx").on(
      table.teamId,
      table.optionSetId,
      table.sortOrder,
    ),
  ],
);

export const crmRecordFieldValue = pgTable(
  "crm_record_field_value",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    recordId: text("record_id")
      .notNull()
      .references(() => crmRecord.id, { onDelete: "cascade" }),
    fieldDefinitionId: text("field_definition_id")
      .notNull()
      .references(() => crmFieldDefinition.id, { onDelete: "cascade" }),
    position: integer("position").default(0).notNull(),
    textValue: text("text_value"),
    integerValue: integer("integer_value"),
    booleanValue: boolean("boolean_value"),
    dateValue: timestamp("date_value"),
    amountMinor: integer("amount_minor"),
    currencyCode: text("currency_code"),
    optionValueId: text("option_value_id").references(() => crmOptionValue.id, {
      onDelete: "restrict",
    }),
    referenceRecordId: text("reference_record_id").references(() => crmRecord.id, {
      onDelete: "restrict",
    }),
    updatedByActorId: text("updated_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("crm_record_field_value_team_record_field_position_idx").on(
      table.teamId,
      table.recordId,
      table.fieldDefinitionId,
      table.position,
    ),
    index("crm_record_field_value_text_filter_idx").on(
      table.teamId,
      table.fieldDefinitionId,
      table.textValue,
    ),
    index("crm_record_field_value_integer_filter_idx").on(
      table.teamId,
      table.fieldDefinitionId,
      table.integerValue,
    ),
    index("crm_record_field_value_boolean_filter_idx").on(
      table.teamId,
      table.fieldDefinitionId,
      table.booleanValue,
    ),
    index("crm_record_field_value_date_filter_idx").on(
      table.teamId,
      table.fieldDefinitionId,
      table.dateValue,
    ),
    index("crm_record_field_value_money_filter_idx").on(
      table.teamId,
      table.fieldDefinitionId,
      table.amountMinor,
      table.currencyCode,
    ),
    index("crm_record_field_value_option_filter_idx").on(
      table.teamId,
      table.fieldDefinitionId,
      table.optionValueId,
    ),
    index("crm_record_field_value_reference_filter_idx").on(
      table.teamId,
      table.fieldDefinitionId,
      table.referenceRecordId,
    ),
  ],
);

export const crmRecordGrant = pgTable(
  "crm_record_grant",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    recordId: text("record_id")
      .notNull()
      .references(() => crmRecord.id, { onDelete: "cascade" }),
    principalId: text("principal_id").notNull(),
    action: text("action").notNull(),
    grantedByActorId: text("granted_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    uniqueIndex("crm_record_grant_team_record_principal_action_idx").on(
      table.teamId,
      table.recordId,
      table.principalId,
      table.action,
    ),
    index("crm_record_grant_principal_idx").on(table.teamId, table.principalId),
  ],
);

export const crmFieldSecurityPolicy = pgTable(
  "crm_field_security_policy",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    targetRecordId: text("target_record_id").references(() => crmRecord.id, {
      onDelete: "cascade",
    }),
    objectTypeId: text("object_type_id").notNull(),
    principalId: text("principal_id"),
    fieldId: text("field_id").notNull(),
    action: text("action").notNull(),
    effect: text("effect").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("crm_field_security_policy_lookup_idx").on(
      table.teamId,
      table.objectTypeId,
      table.targetRecordId,
      table.principalId,
    ),
    index("crm_field_security_policy_field_idx").on(
      table.teamId,
      table.objectTypeId,
      table.fieldId,
    ),
  ],
);

export const crmRecordRelations = relations(crmRecord, ({ one, many }) => ({
  party: one(crmParty, {
    fields: [crmRecord.id],
    references: [crmParty.recordId],
  }),
  organization: one(crmOrganization, {
    fields: [crmRecord.id],
    references: [crmOrganization.recordId],
  }),
  person: one(crmPerson, {
    fields: [crmRecord.id],
    references: [crmPerson.recordId],
  }),
  legalEntity: one(crmLegalEntity, {
    fields: [crmRecord.id],
    references: [crmLegalEntity.recordId],
  }),
  account: one(crmAccount, {
    fields: [crmRecord.id],
    references: [crmAccount.recordId],
  }),
  contact: one(crmContact, {
    fields: [crmRecord.id],
    references: [crmContact.recordId],
  }),
  opportunity: one(crmOpportunity, {
    fields: [crmRecord.id],
    references: [crmOpportunity.recordId],
  }),
  fieldValues: many(crmRecordFieldValue),
  grants: many(crmRecordGrant),
  fieldSecurityPolicies: many(crmFieldSecurityPolicy),
}));

export const crmPartyRelations = relations(crmParty, ({ one }) => ({
  record: one(crmRecord, {
    fields: [crmParty.recordId],
    references: [crmRecord.id],
  }),
  team: one(team, {
    fields: [crmParty.teamId],
    references: [team.id],
  }),
}));

export const crmOrganizationRelations = relations(crmOrganization, ({ one, many }) => ({
  record: one(crmRecord, {
    fields: [crmOrganization.recordId],
    references: [crmRecord.id],
  }),
  team: one(team, {
    fields: [crmOrganization.teamId],
    references: [team.id],
  }),
  accounts: many(crmAccount),
}));

export const crmPersonRelations = relations(crmPerson, ({ one, many }) => ({
  record: one(crmRecord, {
    fields: [crmPerson.recordId],
    references: [crmRecord.id],
  }),
  team: one(team, {
    fields: [crmPerson.teamId],
    references: [team.id],
  }),
  contacts: many(crmContact),
}));

export const crmLegalEntityRelations = relations(crmLegalEntity, ({ one, many }) => ({
  record: one(crmRecord, {
    fields: [crmLegalEntity.recordId],
    references: [crmRecord.id],
  }),
  team: one(team, {
    fields: [crmLegalEntity.teamId],
    references: [team.id],
  }),
  accounts: many(crmAccount),
}));

export const crmAccountRelations = relations(crmAccount, ({ one, many }) => ({
  record: one(crmRecord, {
    fields: [crmAccount.recordId],
    references: [crmRecord.id],
  }),
  team: one(team, {
    fields: [crmAccount.teamId],
    references: [team.id],
  }),
  organization: one(crmOrganization, {
    fields: [crmAccount.organizationId],
    references: [crmOrganization.recordId],
  }),
  legalEntity: one(crmLegalEntity, {
    fields: [crmAccount.legalEntityId],
    references: [crmLegalEntity.recordId],
  }),
  contacts: many(crmContact),
  opportunities: many(crmOpportunity),
}));

export const crmContactRelations = relations(crmContact, ({ one }) => ({
  record: one(crmRecord, {
    fields: [crmContact.recordId],
    references: [crmRecord.id],
  }),
  team: one(team, {
    fields: [crmContact.teamId],
    references: [team.id],
  }),
  account: one(crmAccount, {
    fields: [crmContact.accountId],
    references: [crmAccount.recordId],
  }),
  person: one(crmPerson, {
    fields: [crmContact.personId],
    references: [crmPerson.recordId],
  }),
}));

export const crmOpportunityRelations = relations(crmOpportunity, ({ one }) => ({
  record: one(crmRecord, {
    fields: [crmOpportunity.recordId],
    references: [crmRecord.id],
  }),
  team: one(team, {
    fields: [crmOpportunity.teamId],
    references: [team.id],
  }),
  account: one(crmAccount, {
    fields: [crmOpportunity.accountId],
    references: [crmAccount.recordId],
  }),
}));

export const crmObjectTypeDefinitionRelations = relations(
  crmObjectTypeDefinition,
  ({ one, many }) => ({
    team: one(team, {
      fields: [crmObjectTypeDefinition.teamId],
      references: [team.id],
    }),
    fields: many(crmFieldDefinition),
  }),
);

export const crmFieldDefinitionRelations = relations(crmFieldDefinition, ({ one, many }) => ({
  team: one(team, {
    fields: [crmFieldDefinition.teamId],
    references: [team.id],
  }),
  objectType: one(crmObjectTypeDefinition, {
    fields: [crmFieldDefinition.objectTypeDefinitionId],
    references: [crmObjectTypeDefinition.id],
  }),
  optionSet: one(crmOptionSet),
  fieldValues: many(crmRecordFieldValue),
}));

export const crmOptionSetRelations = relations(crmOptionSet, ({ one, many }) => ({
  team: one(team, {
    fields: [crmOptionSet.teamId],
    references: [team.id],
  }),
  fieldDefinition: one(crmFieldDefinition, {
    fields: [crmOptionSet.fieldDefinitionId],
    references: [crmFieldDefinition.id],
  }),
  optionValues: many(crmOptionValue),
}));

export const crmOptionValueRelations = relations(crmOptionValue, ({ one, many }) => ({
  team: one(team, {
    fields: [crmOptionValue.teamId],
    references: [team.id],
  }),
  optionSet: one(crmOptionSet, {
    fields: [crmOptionValue.optionSetId],
    references: [crmOptionSet.id],
  }),
  fieldValues: many(crmRecordFieldValue),
}));

export const crmRecordFieldValueRelations = relations(crmRecordFieldValue, ({ one }) => ({
  team: one(team, {
    fields: [crmRecordFieldValue.teamId],
    references: [team.id],
  }),
  record: one(crmRecord, {
    fields: [crmRecordFieldValue.recordId],
    references: [crmRecord.id],
  }),
  fieldDefinition: one(crmFieldDefinition, {
    fields: [crmRecordFieldValue.fieldDefinitionId],
    references: [crmFieldDefinition.id],
  }),
  optionValue: one(crmOptionValue, {
    fields: [crmRecordFieldValue.optionValueId],
    references: [crmOptionValue.id],
  }),
  referenceRecord: one(crmRecord, {
    fields: [crmRecordFieldValue.referenceRecordId],
    references: [crmRecord.id],
  }),
}));

export const crmRecordGrantRelations = relations(crmRecordGrant, ({ one }) => ({
  record: one(crmRecord, {
    fields: [crmRecordGrant.recordId],
    references: [crmRecord.id],
  }),
  team: one(team, {
    fields: [crmRecordGrant.teamId],
    references: [team.id],
  }),
}));

export const crmFieldSecurityPolicyRelations = relations(crmFieldSecurityPolicy, ({ one }) => ({
  record: one(crmRecord, {
    fields: [crmFieldSecurityPolicy.targetRecordId],
    references: [crmRecord.id],
  }),
  team: one(team, {
    fields: [crmFieldSecurityPolicy.teamId],
    references: [team.id],
  }),
}));
