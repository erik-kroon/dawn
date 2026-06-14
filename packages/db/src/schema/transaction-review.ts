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

export const transaction = pgTable(
  "transaction",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    postedAt: timestamp("posted_at").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
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
  (table) => [index("transaction_team_posted_idx").on(table.teamId, table.postedAt)],
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
