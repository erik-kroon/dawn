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
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
  },
  (table) => [index("outbox_event_status_idx").on(table.status, table.occurredAt)],
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
  counterparties: many(counterparty),
  tags: many(transactionTag),
  transactions: many(transaction),
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
