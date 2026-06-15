import { relations } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const team = pgTable("team", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const teamMembership = pgTable(
  "team_membership",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("team_membership_team_user_idx").on(table.teamId, table.userId)],
);

export const teamInvite = pgTable(
  "team_invite",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").default("pending").notNull(),
    invitedByActorId: text("invited_by_actor_id").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("team_invite_pending_email_idx").on(table.teamId, table.email, table.status),
    index("team_invite_team_status_idx").on(table.teamId, table.status),
  ],
);

export const transactionCategory = pgTable(
  "transaction_category",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("transaction_category_team_name_idx").on(table.teamId, table.name)],
);

export const ledgerAccount = pgTable(
  "ledger_account",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    type: text("type").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("ledger_account_team_name_idx").on(table.teamId, table.name),
    index("ledger_account_team_idx").on(table.teamId),
  ],
);

export const bankConnection = pgTable(
  "bank_connection",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerConnectionId: text("provider_connection_id").notNull(),
    institutionName: text("institution_name").notNull(),
    status: text("status").default("connected").notNull(),
    lastSyncAt: timestamp("last_sync_at"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("bank_connection_provider_idx").on(
      table.teamId,
      table.provider,
      table.providerConnectionId,
    ),
    index("bank_connection_team_status_idx").on(table.teamId, table.status),
  ],
);

export const bankAccount = pgTable(
  "bank_account",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => bankConnection.id, { onDelete: "cascade" }),
    ledgerAccountId: text("ledger_account_id")
      .notNull()
      .references(() => ledgerAccount.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    type: text("type").notNull(),
    currentBalanceMinor: integer("current_balance_minor").notNull(),
    status: text("status").default("active").notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("bank_account_provider_idx").on(table.connectionId, table.providerAccountId),
    index("bank_account_team_idx").on(table.teamId),
  ],
);

export const counterparty = pgTable(
  "counterparty",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("counterparty_team_name_idx").on(table.teamId, table.name)],
);

export const transactionTag = pgTable(
  "transaction_tag",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("transaction_tag_team_name_idx").on(table.teamId, table.name)],
);

export const transaction = pgTable(
  "transaction",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => ledgerAccount.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    postedAt: timestamp("posted_at").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    type: text("type").default("expense").notNull(),
    source: text("source").default("manual").notNull(),
    counterpartyId: text("counterparty_id").references(() => counterparty.id, {
      onDelete: "set null",
    }),
    providerTransactionId: text("provider_transaction_id"),
    duplicateKey: text("duplicate_key"),
    categoryId: text("category_id").references(() => transactionCategory.id, {
      onDelete: "set null",
    }),
    reviewState: text("review_state").default("needs_review").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("transaction_team_posted_idx").on(table.teamId, table.postedAt),
    index("transaction_team_account_posted_idx").on(table.teamId, table.accountId, table.postedAt),
    uniqueIndex("transaction_team_duplicate_idx").on(table.teamId, table.duplicateKey),
    uniqueIndex("transaction_team_provider_idx").on(table.teamId, table.providerTransactionId),
  ],
);

export const transactionSplit = pgTable(
  "transaction_split",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transaction.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => transactionCategory.id, {
      onDelete: "set null",
    }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("transaction_split_transaction_idx").on(table.transactionId),
    index("transaction_split_category_idx").on(table.categoryId),
  ],
);

export const transactionTagAssignment = pgTable(
  "transaction_tag_assignment",
  {
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transaction.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => transactionTag.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("transaction_tag_assignment_idx").on(table.transactionId, table.tagId),
    index("transaction_tag_assignment_tag_idx").on(table.tagId),
  ],
);

export const transactionImportSession = pgTable(
  "transaction_import_session",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => ledgerAccount.id, { onDelete: "cascade" }),
    source: text("source").default("csv").notNull(),
    fileName: text("file_name"),
    status: text("status").default("committed").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    mapping: jsonb("mapping").$type<Record<string, unknown>>().notNull(),
    rowCount: integer("row_count").notNull(),
    importedCount: integer("imported_count").notNull(),
    duplicateCount: integer("duplicate_count").notNull(),
    invalidCount: integer("invalid_count").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    committedAt: timestamp("committed_at").defaultNow().notNull(),
  },
  (table) => [
    index("transaction_import_session_team_idx").on(table.teamId, table.createdAt),
    index("transaction_import_session_account_idx").on(table.accountId, table.createdAt),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    requestId: text("request_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_team_entity_idx").on(table.teamId, table.entityType, table.entityId),
  ],
);

export const outboxEvent = pgTable(
  "outbox_event",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    version: integer("version").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").default("pending").notNull(),
    dispatchAttempts: integer("dispatch_attempts").default(0).notNull(),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
  },
  (table) => [
    index("outbox_event_status_idx").on(table.status, table.occurredAt),
    index("outbox_event_retry_idx").on(table.status, table.nextAttemptAt),
  ],
);

export const jobRun = pgTable(
  "job_run",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    outboxEventId: text("outbox_event_id")
      .notNull()
      .references(() => outboxEvent.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull(),
    queueName: text("queue_name").notNull(),
    status: text("status").notNull(),
    attempt: integer("attempt").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("job_run_outbox_idx").on(table.outboxEventId, table.createdAt),
    index("job_run_status_idx").on(table.status, table.createdAt),
  ],
);

export const providerSyncRun = pgTable(
  "provider_sync_run",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => bankConnection.id, { onDelete: "cascade" }),
    status: text("status").default("running").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    accountsSynced: integer("accounts_synced").default(0).notNull(),
    transactionsImported: integer("transactions_imported").default(0).notNull(),
    duplicateCount: integer("duplicate_count").default(0).notNull(),
    error: text("error"),
  },
  (table) => [
    index("provider_sync_run_connection_idx").on(table.connectionId, table.startedAt),
    index("provider_sync_run_status_idx").on(table.status, table.startedAt),
  ],
);

export const providerObject = pgTable(
  "provider_object",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerObjectType: text("provider_object_type").notNull(),
    providerObjectId: text("provider_object_id").notNull(),
    connectionId: text("connection_id").references(() => bankConnection.id, {
      onDelete: "set null",
    }),
    bankAccountId: text("bank_account_id").references(() => bankAccount.id, {
      onDelete: "set null",
    }),
    internalEntityType: text("internal_entity_type"),
    internalEntityId: text("internal_entity_id"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("provider_object_provider_idx").on(
      table.teamId,
      table.provider,
      table.providerObjectType,
      table.providerObjectId,
    ),
    index("provider_object_internal_idx").on(table.internalEntityType, table.internalEntityId),
  ],
);

export const businessDocument = pgTable(
  "document",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").default("uploading").notNull(),
    currentVersionId: text("current_version_id"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("document_team_status_idx").on(table.teamId, table.status),
    index("document_team_updated_idx").on(table.teamId, table.updatedAt),
  ],
);

export const documentVersion = pgTable(
  "document_version",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => businessDocument.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    checksumSha256: text("checksum_sha256"),
    status: text("status").default("pending_upload").notNull(),
    uploadedByActorId: text("uploaded_by_actor_id").notNull(),
    uploadedAt: timestamp("uploaded_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("document_version_number_idx").on(table.documentId, table.versionNumber),
    uniqueIndex("document_version_object_key_idx").on(table.objectKey),
    index("document_version_team_idx").on(table.teamId, table.createdAt),
  ],
);

export const inboxSource = pgTable(
  "inbox_source",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("inbox_source_team_type_name_idx").on(table.teamId, table.type, table.name),
  ],
);

export const inboxItem = pgTable(
  "inbox_item",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => inboxSource.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    documentId: text("document_id")
      .notNull()
      .references(() => businessDocument.id, { onDelete: "cascade" }),
    documentVersionId: text("document_version_id")
      .notNull()
      .references(() => documentVersion.id, { onDelete: "cascade" }),
    status: text("status").default("pending_extraction").notNull(),
    extractionStatus: text("extraction_status").default("pending").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("inbox_item_document_version_idx").on(table.teamId, table.documentVersionId),
    index("inbox_item_team_status_idx").on(table.teamId, table.status),
    index("inbox_item_team_updated_idx").on(table.teamId, table.updatedAt),
  ],
);

export const documentExtraction = pgTable(
  "document_extraction",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    inboxItemId: text("inbox_item_id")
      .notNull()
      .references(() => inboxItem.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => businessDocument.id, { onDelete: "cascade" }),
    documentVersionId: text("document_version_id")
      .notNull()
      .references(() => documentVersion.id, { onDelete: "cascade" }),
    extractionVersion: integer("extraction_version").notNull(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    fields: jsonb("fields").$type<Record<string, unknown>>().notNull(),
    confidence: jsonb("confidence").$type<Record<string, unknown>>().notNull(),
    rawText: text("raw_text"),
    error: text("error"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("document_extraction_version_idx").on(table.inboxItemId, table.extractionVersion),
    index("document_extraction_team_idx").on(table.teamId, table.createdAt),
  ],
);

export const idempotencyKey = pgTable(
  "idempotency_key",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    key: text("key").notNull(),
    operation: text("operation").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_key_operation_idx").on(
      table.teamId,
      table.actorId,
      table.operation,
      table.key,
    ),
  ],
);

export const teamRelations = relations(team, ({ many }) => ({
  memberships: many(teamMembership),
  invites: many(teamInvite),
  categories: many(transactionCategory),
  accounts: many(ledgerAccount),
  bankConnections: many(bankConnection),
  bankAccounts: many(bankAccount),
  counterparties: many(counterparty),
  tags: many(transactionTag),
  imports: many(transactionImportSession),
  transactions: many(transaction),
  outboxEvents: many(outboxEvent),
  jobRuns: many(jobRun),
  providerSyncRuns: many(providerSyncRun),
  providerObjects: many(providerObject),
  documents: many(businessDocument),
  documentVersions: many(documentVersion),
  inboxSources: many(inboxSource),
  inboxItems: many(inboxItem),
  documentExtractions: many(documentExtraction),
}));

export const teamMembershipRelations = relations(teamMembership, ({ one }) => ({
  team: one(team, {
    fields: [teamMembership.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMembership.userId],
    references: [user.id],
  }),
}));
