import { describe, expect, test } from "bun:test";

import {
  acceptInboxMatch,
  generateInboxMatchSuggestions,
  rejectInboxMatch,
  type DawnRepository,
  type HardNegativeTransactionMatch,
  type InboxItem,
  type InboxTransactionMatchSuggestion,
  type TeamAlias,
} from "./index";
import type { Actor, TeamRole, Transaction } from "@dawn/domain";

class MemoryMatchingRepository {
  role: TeamRole = "member";
  actor: Actor = { id: "user_1", type: "user" };
  inboxItem: InboxItem = {
    id: "inbox_1",
    teamId: "team_1",
    sourceId: "source_1",
    sourceType: "document_upload",
    documentId: "doc_1",
    documentVersionId: "version_1",
    status: "needs_review",
    extractionStatus: "completed",
    createdByActorId: "user_1",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    latestExtraction: {
      id: "extraction_1",
      teamId: "team_1",
      inboxItemId: "inbox_1",
      documentId: "doc_1",
      documentVersionId: "version_1",
      extractionVersion: 1,
      source: "local_deterministic",
      status: "completed",
      fields: {
        merchantName: "Figma Inc",
        issuedAt: "2026-06-14T00:00:00.000Z",
        invoiceNumber: "INV-100",
        totalAmountMinor: 1200,
        currency: "USD",
      },
      confidence: {},
      rawText: "Receipt from Figma Inc INV-100 total 12.00 USD",
      createdByActorId: "user_1",
      createdAt: "2026-06-14T00:00:00.000Z",
    },
    matchSuggestions: [],
  };
  transactions: Transaction[] = [
    {
      id: "txn_1",
      teamId: "team_1",
      accountId: "acct_1",
      description: "Figma Inc INV-100",
      postedAt: "2026-06-14T10:20:00.000Z",
      money: { amountMinor: -1200, currency: "USD" },
      type: "expense",
      source: "bank_sync",
      providerTransactionId: "provider_1",
      categoryId: null,
      reviewState: "needs_review",
    },
  ];
  suggestions = new Map<string, InboxTransactionMatchSuggestion>();
  aliases: TeamAlias[] = [];
  hardNegatives: HardNegativeTransactionMatch[] = [];
  attachments: { transactionId: string; documentId: string }[] = [];
  idempotency = new Map<string, { fingerprint: string; result: unknown }>();
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>) {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(actor: Actor, teamId: string) {
    return actor.id === this.actor.id && teamId === "team_1" ? { role: this.role } : null;
  }

  async getInboxItemForTeam(teamId: string, inboxItemId: string) {
    return teamId === this.inboxItem.teamId && inboxItemId === this.inboxItem.id
      ? this.inboxItem
      : null;
  }

  async listTransactionsForReport(input: { teamId: string }) {
    return this.transactions.filter((transaction) => transaction.teamId === input.teamId);
  }

  async listTeamAliases(teamId: string) {
    return this.aliases.filter((alias) => alias.teamId === teamId);
  }

  async listHardNegativeMatches(teamId: string, inboxItemId: string) {
    return this.hardNegatives.filter(
      (match) => match.teamId === teamId && match.inboxItemId === inboxItemId,
    );
  }

  async upsertInboxMatchSuggestions(input: {
    teamId: string;
    inboxItemId: string;
    suggestions: {
      transactionId: string;
      score: number;
      confidence: InboxTransactionMatchSuggestion["confidence"];
      explanation: string[];
    }[];
  }) {
    const persisted = input.suggestions.map((suggestion, index) => {
      const existing = [...this.suggestions.values()].find(
        (record) =>
          record.teamId === input.teamId &&
          record.inboxItemId === input.inboxItemId &&
          record.transactionId === suggestion.transactionId,
      );
      const record: InboxTransactionMatchSuggestion = {
        id: existing?.id ?? `match_${index + 1}`,
        teamId: input.teamId,
        inboxItemId: input.inboxItemId,
        transactionId: suggestion.transactionId,
        score: suggestion.score,
        confidence: suggestion.confidence,
        explanation: suggestion.explanation,
        status: existing?.status ?? "suggested",
        createdAt: existing?.createdAt ?? "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
        transaction:
          this.transactions.find((transaction) => transaction.id === suggestion.transactionId) ??
          null,
      };
      this.suggestions.set(record.id, record);
      return record;
    });
    this.inboxItem.matchSuggestions = persisted;
    return persisted;
  }

  async getInboxMatchSuggestionForTeam(teamId: string, suggestionId: string) {
    const suggestion = this.suggestions.get(suggestionId);
    return suggestion?.teamId === teamId ? suggestion : null;
  }

  async acceptInboxMatchSuggestion(input: { teamId: string; suggestionId: string }) {
    const suggestion = this.suggestions.get(input.suggestionId);

    if (!suggestion || suggestion.teamId !== input.teamId) {
      throw new Error("Inbox match suggestion not found");
    }

    const accepted = { ...suggestion, status: "accepted" as const };
    this.suggestions.set(accepted.id, accepted);
    this.attachments.push({
      transactionId: accepted.transactionId,
      documentId: this.inboxItem.documentId,
    });
    this.aliases.push({
      id: "alias_1",
      teamId: input.teamId,
      source: this.inboxItem.latestExtraction?.fields.merchantName ?? "",
      target: accepted.transaction?.description ?? "",
      createdAt: "2026-06-14T00:00:00.000Z",
    });
    this.inboxItem = { ...this.inboxItem, status: "resolved", matchSuggestions: [accepted] };
    return { suggestion: accepted, inboxItem: this.inboxItem };
  }

  async rejectInboxMatchSuggestion(input: {
    teamId: string;
    suggestionId: string;
    reason?: string | null;
  }) {
    const suggestion = this.suggestions.get(input.suggestionId);

    if (!suggestion || suggestion.teamId !== input.teamId) {
      throw new Error("Inbox match suggestion not found");
    }

    const rejected = { ...suggestion, status: "rejected" as const };
    this.suggestions.set(rejected.id, rejected);
    this.hardNegatives.push({
      id: "negative_1",
      teamId: input.teamId,
      inboxItemId: rejected.inboxItemId,
      transactionId: rejected.transactionId,
      reason: input.reason,
      createdAt: "2026-06-14T00:00:00.000Z",
    });
    return rejected;
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

  async appendAuditEvent(input: unknown) {
    this.auditEvents.push(input);
  }

  async appendOutboxEvent(input: unknown) {
    this.outboxEvents.push(input);
  }
}

const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};

describe("inbox matching use cases", () => {
  test("generates persisted match suggestions with score and explanation", async () => {
    const repository = new MemoryMatchingRepository();

    const result = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1" },
    );

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.transactionId).toBe("txn_1");
    expect(result.suggestions[0]?.score).toBeGreaterThanOrEqual(0.75);
    expect(result.suggestions[0]?.explanation).toContain("Amount matches exactly");
  });

  test("accepts a suggestion, attaches the document, learns an alias, and resolves the item", async () => {
    const repository = new MemoryMatchingRepository();
    const generated = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1" },
    );

    const accepted = await acceptInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      idempotencyKey: "accept_1",
    });

    expect(accepted.suggestion.status).toBe("accepted");
    expect(accepted.inboxItem.status).toBe("resolved");
    expect(repository.attachments).toEqual([{ transactionId: "txn_1", documentId: "doc_1" }]);
    expect(repository.aliases[0]).toMatchObject({
      source: "Figma Inc",
      target: "Figma Inc INV-100",
    });
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("rejects a suggestion and remembers the hard negative", async () => {
    const repository = new MemoryMatchingRepository();
    const generated = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1" },
    );

    const rejected = await rejectInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      reason: "wrong receipt",
      idempotencyKey: "reject_1",
    });

    expect(rejected.suggestion.status).toBe("rejected");
    expect(repository.hardNegatives).toMatchObject([
      { inboxItemId: "inbox_1", transactionId: "txn_1", reason: "wrong receipt" },
    ]);

    const next = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
      },
    );
    expect(next.suggestions).toEqual([]);
  });
});
