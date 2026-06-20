import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { team } from "./core";

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

export const crmAccount = pgTable(
  "crm_account",
  {
    recordId: text("record_id")
      .primaryKey()
      .references(() => crmRecord.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    legalEntityId: text("legal_entity_id"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => crmOrganization.recordId, { onDelete: "restrict" }),
    accountType: text("account_type").default("prospect").notNull(),
    relationshipStatus: text("relationship_status").default("active").notNull(),
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
    index("crm_account_team_organization_idx").on(table.teamId, table.organizationId),
    index("crm_account_team_account_type_idx").on(table.teamId, table.accountType),
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
  account: one(crmAccount, {
    fields: [crmRecord.id],
    references: [crmAccount.recordId],
  }),
  opportunity: one(crmOpportunity, {
    fields: [crmRecord.id],
    references: [crmOpportunity.recordId],
  }),
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
  opportunities: many(crmOpportunity),
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
