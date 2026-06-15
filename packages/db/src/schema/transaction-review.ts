import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

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

export const integrationConnection = pgTable(
  "integration_connection",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    provider: text("provider").notNull(),
    providerConnectionId: text("provider_connection_id").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").default("connected").notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().notNull(),
    tokenCiphertext: text("token_ciphertext").notNull(),
    tokenKeyId: text("token_key_id").notNull(),
    tokenLastFour: text("token_last_four").notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    lastSyncAt: timestamp("last_sync_at"),
    lastError: text("last_error"),
    disabledAt: timestamp("disabled_at"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("integration_connection_provider_idx").on(
      table.teamId,
      table.provider,
      table.providerConnectionId,
    ),
    index("integration_connection_team_status_idx").on(table.teamId, table.status),
    index("integration_connection_team_category_idx").on(table.teamId, table.category),
  ],
);

export const integrationSyncRun = pgTable(
  "integration_sync_run",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    integrationConnectionId: text("integration_connection_id")
      .notNull()
      .references(() => integrationConnection.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    provider: text("provider").notNull(),
    status: text("status").default("running").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    recordsSynced: integer("records_synced").default(0).notNull(),
    error: text("error"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("integration_sync_run_connection_idx").on(table.integrationConnectionId, table.startedAt),
    index("integration_sync_run_status_idx").on(table.status, table.startedAt),
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

export const inboxMatchSuggestion = pgTable(
  "inbox_match_suggestion",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    inboxItemId: text("inbox_item_id")
      .notNull()
      .references(() => inboxItem.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transaction.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    confidence: text("confidence").notNull(),
    explanation: jsonb("explanation").$type<string[]>().notNull(),
    status: text("status").default("suggested").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("inbox_match_suggestion_item_transaction_idx").on(
      table.teamId,
      table.inboxItemId,
      table.transactionId,
    ),
    index("inbox_match_suggestion_team_item_idx").on(table.teamId, table.inboxItemId),
    index("inbox_match_suggestion_transaction_idx").on(table.transactionId),
  ],
);

export const transactionAttachment = pgTable(
  "transaction_attachment",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transaction.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => businessDocument.id, { onDelete: "cascade" }),
    inboxItemId: text("inbox_item_id").references(() => inboxItem.id, { onDelete: "set null" }),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("transaction_attachment_document_idx").on(
      table.teamId,
      table.transactionId,
      table.documentId,
    ),
    index("transaction_attachment_team_transaction_idx").on(table.teamId, table.transactionId),
    index("transaction_attachment_inbox_item_idx").on(table.inboxItemId),
  ],
);

export const teamAlias = pgTable(
  "team_alias",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    target: text("target").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("team_alias_source_target_idx").on(table.teamId, table.source, table.target),
    index("team_alias_team_idx").on(table.teamId),
  ],
);

export const hardNegativeMatch = pgTable(
  "hard_negative_match",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    inboxItemId: text("inbox_item_id")
      .notNull()
      .references(() => inboxItem.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transaction.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("hard_negative_match_item_transaction_idx").on(
      table.teamId,
      table.inboxItemId,
      table.transactionId,
    ),
    index("hard_negative_match_team_item_idx").on(table.teamId, table.inboxItemId),
  ],
);

export const customer = pgTable(
  "customer",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    billingAddress: text("billing_address"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("customer_team_name_idx").on(table.teamId, table.name),
    index("customer_team_updated_idx").on(table.teamId, table.updatedAt),
  ],
);

export const customerContact = pgTable(
  "customer_contact",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("customer_contact_customer_email_idx").on(table.customerId, table.email),
    index("customer_contact_team_customer_idx").on(table.teamId, table.customerId),
  ],
);

export const product = pgTable(
  "product",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    currency: text("currency").notNull(),
    defaultTaxRateBasisPoints: integer("default_tax_rate_basis_points").default(0).notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("product_team_name_idx").on(table.teamId, table.name),
    index("product_team_updated_idx").on(table.teamId, table.updatedAt),
  ],
);

export const invoice = pgTable(
  "invoice",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    invoiceNumber: text("invoice_number").notNull(),
    status: text("status").default("draft").notNull(),
    issueDate: timestamp("issue_date").notNull(),
    dueDate: timestamp("due_date"),
    currency: text("currency").notNull(),
    discountBasisPoints: integer("discount_basis_points").default(0).notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    amountPaidMinor: integer("amount_paid_minor").default(0).notNull(),
    notes: text("notes"),
    sentAt: timestamp("sent_at"),
    viewedAt: timestamp("viewed_at"),
    paidAt: timestamp("paid_at"),
    overdueAt: timestamp("overdue_at"),
    voidedAt: timestamp("voided_at"),
    deliveryToEmail: text("delivery_to_email"),
    deliveryProviderMessageId: text("delivery_provider_message_id"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("invoice_team_number_idx").on(table.teamId, table.invoiceNumber),
    index("invoice_team_status_idx").on(table.teamId, table.status),
    index("invoice_customer_idx").on(table.customerId, table.updatedAt),
  ],
);

export const invoiceLine = pgTable(
  "invoice_line",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantityMilli: integer("quantity_milli").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    currency: text("currency").notNull(),
    discountBasisPoints: integer("discount_basis_points").default(0).notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").default(0).notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("invoice_line_invoice_idx").on(table.invoiceId, table.sortOrder),
    index("invoice_line_product_idx").on(table.productId),
  ],
);

export const invoicePayment = pgTable(
  "invoice_payment",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    paidAt: timestamp("paid_at").notNull(),
    method: text("method"),
    note: text("note"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("invoice_payment_invoice_idx").on(table.invoiceId, table.paidAt),
    index("invoice_payment_team_idx").on(table.teamId, table.paidAt),
  ],
);

export const invoiceEvent = pgTable(
  "invoice_event",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    actorId: text("actor_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("invoice_event_invoice_idx").on(table.invoiceId, table.occurredAt),
    index("invoice_event_team_idx").on(table.teamId, table.occurredAt),
  ],
);

export const recurringInvoice = pgTable(
  "recurring_invoice",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    sourceInvoiceId: text("source_invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    frequency: text("frequency").notNull(),
    nextRunAt: timestamp("next_run_at").notNull(),
    status: text("status").default("active").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("recurring_invoice_team_status_idx").on(table.teamId, table.status, table.nextRunAt),
    index("recurring_invoice_source_idx").on(table.sourceInvoiceId),
  ],
);

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").default("active").notNull(),
    billableRateMinor: integer("billable_rate_minor").notNull(),
    currency: text("currency").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("project_team_status_idx").on(table.teamId, table.status),
    index("project_customer_idx").on(table.customerId, table.updatedAt),
  ],
);

export const projectMember = pgTable(
  "project_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    role: text("role").notNull(),
    billableRateMinor: integer("billable_rate_minor"),
    currency: text("currency"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("project_member_actor_idx").on(table.projectId, table.actorId),
    index("project_member_team_idx").on(table.teamId, table.actorId),
  ],
);

export const timeEntry = pgTable(
  "time_entry",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    description: text("description").notNull(),
    occurredOn: timestamp("occurred_on").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    billableStatus: text("billable_status").notNull(),
    billableRateMinor: integer("billable_rate_minor"),
    currency: text("currency"),
    invoiceId: text("invoice_id").references(() => invoice.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("time_entry_team_occurred_idx").on(table.teamId, table.occurredOn),
    index("time_entry_project_idx").on(table.projectId, table.occurredOn),
    index("time_entry_invoice_idx").on(table.invoiceId),
  ],
);

export const businessInsight = pgTable(
  "business_insight",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    severity: text("severity").notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    sourceRefs: jsonb("source_refs").$type<Record<string, unknown>[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("business_insight_team_period_idx").on(table.teamId, table.periodStart, table.periodEnd),
    index("business_insight_team_created_idx").on(table.teamId, table.createdAt),
  ],
);

export const assistantThread = pgTable(
  "assistant_thread",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("assistant_thread_team_updated_idx").on(table.teamId, table.updatedAt),
    index("assistant_thread_creator_idx").on(table.teamId, table.createdByActorId),
  ],
);

export const assistantMessage = pgTable(
  "assistant_message",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => assistantThread.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    sourceRefs: jsonb("source_refs").$type<Record<string, unknown>[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("assistant_message_thread_created_idx").on(table.threadId, table.createdAt),
    index("assistant_message_team_created_idx").on(table.teamId, table.createdAt),
  ],
);

export const assistantToolCall = pgTable(
  "assistant_tool_call",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => assistantThread.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => assistantMessage.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    risk: text("risk").notNull(),
    status: text("status").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<Record<string, unknown>>().notNull(),
    sourceRefs: jsonb("source_refs").$type<Record<string, unknown>[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("assistant_tool_call_thread_created_idx").on(table.threadId, table.createdAt),
    index("assistant_tool_call_team_tool_idx").on(table.teamId, table.toolName),
  ],
);

export const assistantActionApproval = pgTable(
  "assistant_action_approval",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => assistantThread.id, { onDelete: "cascade" }),
    requestedByMessageId: text("requested_by_message_id")
      .notNull()
      .references(() => assistantMessage.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    risk: text("risk").notNull(),
    status: text("status").default("pending").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    preview: jsonb("preview").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    sourceRefs: jsonb("source_refs").$type<Record<string, unknown>[]>().notNull(),
    requestedByActorId: text("requested_by_actor_id").notNull(),
    approvedByActorId: text("approved_by_actor_id"),
    rejectedByActorId: text("rejected_by_actor_id"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
    executedAt: timestamp("executed_at"),
  },
  (table) => [
    index("assistant_action_approval_team_status_idx").on(table.teamId, table.status),
    index("assistant_action_approval_thread_created_idx").on(table.threadId, table.createdAt),
  ],
);

export const automationRule = pgTable(
  "automation_rule",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    triggerType: text("trigger_type").notNull(),
    triggerEventType: text("trigger_event_type").notNull(),
    actionType: text("action_type").notNull(),
    actionConfig: jsonb("action_config").$type<Record<string, unknown>>().notNull(),
    approvalPolicy: text("approval_policy").default("require_approval").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("automation_rule_team_enabled_idx").on(table.teamId, table.enabled),
    index("automation_rule_trigger_idx").on(table.teamId, table.triggerEventType),
  ],
);

export const automationRun = pgTable(
  "automation_run",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    ruleId: text("rule_id")
      .notNull()
      .references(() => automationRule.id, { onDelete: "cascade" }),
    sourceOutboxEventId: text("source_outbox_event_id")
      .notNull()
      .references(() => outboxEvent.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    actionType: text("action_type").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<Record<string, unknown>>().notNull(),
    error: text("error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("automation_run_team_started_idx").on(table.teamId, table.startedAt),
    index("automation_run_rule_started_idx").on(table.ruleId, table.startedAt),
    index("automation_run_source_idx").on(table.sourceOutboxEventId),
  ],
);

export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("api_key_hash_idx").on(table.keyHash),
    index("api_key_team_idx").on(table.teamId, table.createdAt),
  ],
);

export const oauthApp = pgTable(
  "oauth_app",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("oauth_app_team_idx").on(table.teamId, table.createdAt)],
);

export const oauthGrant = pgTable(
  "oauth_grant",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    appId: text("app_id")
      .notNull()
      .references(() => oauthApp.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("oauth_grant_team_idx").on(table.teamId, table.createdAt),
    index("oauth_grant_app_idx").on(table.appId, table.createdAt),
  ],
);

export const webhookSubscription = pgTable(
  "webhook_subscription",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    eventTypes: jsonb("event_types").$type<string[]>().notNull(),
    signingSecretHash: text("signing_secret_hash").notNull(),
    status: text("status").default("active").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("webhook_subscription_team_status_idx").on(table.teamId, table.status),
    index("webhook_subscription_team_created_idx").on(table.teamId, table.createdAt),
  ],
);

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => webhookSubscription.id, { onDelete: "cascade" }),
    outboxEventId: text("outbox_event_id")
      .notNull()
      .references(() => outboxEvent.id, { onDelete: "cascade" }),
    status: text("status").default("pending").notNull(),
    attempt: integer("attempt").default(0).notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    error: text("error"),
    nextAttemptAt: timestamp("next_attempt_at"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("webhook_delivery_subscription_idx").on(table.subscriptionId, table.createdAt),
    index("webhook_delivery_status_idx").on(table.status, table.nextAttemptAt),
    index("webhook_delivery_outbox_idx").on(table.outboxEventId),
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
  integrationConnections: many(integrationConnection),
  integrationSyncRuns: many(integrationSyncRun),
  documents: many(businessDocument),
  documentVersions: many(documentVersion),
  inboxSources: many(inboxSource),
  inboxItems: many(inboxItem),
  documentExtractions: many(documentExtraction),
  customers: many(customer),
  customerContacts: many(customerContact),
  products: many(product),
  invoices: many(invoice),
  invoiceLines: many(invoiceLine),
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
