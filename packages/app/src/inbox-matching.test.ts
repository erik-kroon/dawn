import { describe, expect, test } from "bun:test";

import {
  acceptInboxMatch,
  generateInboxMatchSuggestions,
  matchBidirectionalBatch,
  matchPendingInboxForTransaction,
  rejectInboxMatch,
  type DawnRepository,
  type HardNegativeTransactionMatch,
  type InboxItem,
  type InboxTransactionMatchSuggestion,
  type TeamAlias,
} from "./index";
import type {
  Actor,
  InboxMatchSuggestion,
  TeamRole,
  Transaction,
  TransactionAccountantStatus,
} from "@dawn/domain";

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
  additionalInboxItems: InboxItem[] = [];
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
  nextSuggestionSequence = 1;
  aliases: TeamAlias[] = [];
  hardNegatives: HardNegativeTransactionMatch[] = [];
  attachments: { transactionId: string; documentId: string }[] = [];
  idempotency = new Map<string, { fingerprint: string; result: unknown }>();
  auditEvents: unknown[] = [];
  outboxEvents: unknown[] = [];
  listTransactionsForReportCalls = 0;

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>) {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(actor: Actor, teamId: string) {
    return actor.id === this.actor.id && teamId === "team_1" ? { role: this.role } : null;
  }

  async getInboxItemForTeam(teamId: string, inboxItemId: string) {
    const item = this.findInboxItem(inboxItemId);
    return item?.teamId === teamId ? item : null;
  }

  async listInboxItems(teamId: string) {
    return this.allInboxItems().filter((item) => item.teamId === teamId);
  }

  allInboxItems() {
    return [this.inboxItem, ...this.additionalInboxItems];
  }

  findInboxItem(inboxItemId: string) {
    return this.allInboxItems().find((item) => item.id === inboxItemId) ?? null;
  }

  setInboxItem(item: InboxItem) {
    if (this.inboxItem.id === item.id) {
      this.inboxItem = item;
      return;
    }

    const index = this.additionalInboxItems.findIndex((candidate) => candidate.id === item.id);

    if (index >= 0) {
      this.additionalInboxItems[index] = item;
    }
  }

  async getTransactionForTeam(teamId: string, transactionId: string) {
    return (
      this.transactions.find(
        (transaction) => transaction.teamId === teamId && transaction.id === transactionId,
      ) ?? null
    );
  }

  async countTransactionAttachmentsForTeam(input: { teamId: string; transactionId: string }) {
    return this.attachments.filter(
      (attachment) =>
        attachment.transactionId === input.transactionId &&
        this.transactions.some(
          (transaction) =>
            transaction.teamId === input.teamId && transaction.id === input.transactionId,
        ),
    ).length;
  }

  async updateTransactionAccountantStatusForTeam(input: {
    teamId: string;
    transactionId: string;
    accountantStatus: TransactionAccountantStatus;
    reason?: string | null;
  }) {
    const index = this.transactions.findIndex(
      (transaction) =>
        transaction.teamId === input.teamId && transaction.id === input.transactionId,
    );

    if (index === -1) {
      throw new Error("Transaction not found");
    }

    const updated = {
      ...this.transactions[index]!,
      accountantStatus: input.accountantStatus,
      accountantStatusReason: input.reason ?? null,
      accountantStatusUpdatedAt: "2026-06-14T00:00:00.000Z",
    };
    this.transactions[index] = updated;
    return updated;
  }

  async listTransactionsForReport(input: { teamId: string }) {
    this.listTransactionsForReportCalls += 1;
    return this.transactions.filter((transaction) => transaction.teamId === input.teamId);
  }

  async listTeamAliases(teamId: string) {
    return this.aliases.filter((alias) => alias.teamId === teamId);
  }

  async listTeamMatchFeedback(teamId: string) {
    return [...this.suggestions.values()]
      .filter(
        (suggestion) =>
          suggestion.teamId === teamId &&
          (suggestion.status === "accepted" || suggestion.status === "rejected"),
      )
      .map((suggestion) => ({
        teamId,
        source:
          this.findInboxItem(suggestion.inboxItemId)?.latestExtraction?.fields.merchantName ?? "",
        target: suggestion.transaction?.description ?? "",
        status: suggestion.status as "accepted" | "rejected",
        count: 1,
        lastOccurredAt: suggestion.updatedAt,
      }))
      .filter((feedback) => feedback.source && feedback.target);
  }

  async listHardNegativeMatches(teamId: string, inboxItemId: string) {
    return this.hardNegatives.filter(
      (match) => match.teamId === teamId && match.inboxItemId === inboxItemId,
    );
  }

  async listTransactionMatchCandidatesForInboxItem(input: {
    teamId: string;
    inboxItem: InboxItem;
    limit: number;
  }) {
    return this.transactions
      .filter((transaction) => transaction.teamId === input.teamId)
      .filter(
        (transaction) =>
          !this.attachments.some(
            (attachment) =>
              attachment.documentId === input.inboxItem.documentId ||
              attachment.transactionId === transaction.id,
          ),
      )
      .filter(
        (transaction) =>
          ![...this.suggestions.values()].some(
            (suggestion) =>
              suggestion.teamId === input.teamId &&
              suggestion.inboxItemId === input.inboxItem.id &&
              suggestion.transactionId === transaction.id &&
              (suggestion.status === "suggested" || suggestion.status === "accepted"),
          ),
      )
      .sort(
        (left, right) =>
          right.postedAt.localeCompare(left.postedAt) || left.id.localeCompare(right.id),
      )
      .slice(0, input.limit)
      .map((transaction) => ({
        transaction,
        providerReference: transaction.providerTransactionId,
      }));
  }

  async listInboxMatchCandidatesForTransaction(input: {
    teamId: string;
    transaction: Transaction;
    limit: number;
  }) {
    return this.allInboxItems()
      .filter(
        (item) =>
          item.teamId === input.teamId &&
          item.status === "needs_review" &&
          item.extractionStatus === "completed" &&
          item.latestExtraction,
      )
      .filter(
        (item) =>
          !this.attachments.some(
            (attachment) =>
              attachment.documentId === item.documentId ||
              attachment.transactionId === input.transaction.id,
          ),
      )
      .filter(
        (item) =>
          ![...this.suggestions.values()].some(
            (suggestion) =>
              suggestion.teamId === input.teamId &&
              suggestion.inboxItemId === item.id &&
              suggestion.transactionId === input.transaction.id &&
              (suggestion.status === "suggested" || suggestion.status === "accepted"),
          ),
      )
      .slice(0, input.limit);
  }

  async upsertInboxMatchSuggestions(input: {
    teamId: string;
    inboxItemId: string;
    suggestions: InboxMatchSuggestion[];
  }) {
    const persisted = input.suggestions.map((suggestion) => {
      const existing = [...this.suggestions.values()].find(
        (record) =>
          record.teamId === input.teamId &&
          record.inboxItemId === input.inboxItemId &&
          record.transactionId === suggestion.transactionId,
      );
      const record: InboxTransactionMatchSuggestion = {
        id: existing?.id ?? `match_${this.nextSuggestionSequence++}`,
        teamId: input.teamId,
        inboxItemId: input.inboxItemId,
        transactionId: suggestion.transactionId,
        score: suggestion.score,
        confidence: suggestion.confidence,
        explanation: suggestion.explanation,
        signals: suggestion.signals,
        signalDetails: suggestion.signalDetails,
        thresholds: suggestion.thresholds,
        calibration: suggestion.calibration ?? null,
        matchType: suggestion.matchType,
        status: existing?.status === "expired" ? "suggested" : (existing?.status ?? "suggested"),
        createdAt: existing?.createdAt ?? "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
        transaction:
          this.transactions.find((transaction) => transaction.id === suggestion.transactionId) ??
          null,
      };
      this.suggestions.set(record.id, record);
      return record;
    });
    const item = this.findInboxItem(input.inboxItemId);

    if (item) {
      this.setInboxItem({ ...item, matchSuggestions: persisted });
    }

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

    const item = this.findInboxItem(suggestion.inboxItemId);

    if (!item) {
      throw new Error("Inbox item not found");
    }

    const accepted = { ...suggestion, status: "accepted" as const };
    this.suggestions.set(accepted.id, accepted);
    for (const [id, candidate] of this.suggestions) {
      if (
        candidate.teamId === input.teamId &&
        candidate.inboxItemId === accepted.inboxItemId &&
        candidate.id !== accepted.id &&
        candidate.status === "suggested"
      ) {
        this.suggestions.set(id, {
          ...candidate,
          status: "expired",
          updatedAt: "2026-06-14T00:00:00.000Z",
        });
      }
    }
    this.attachments.push({
      transactionId: accepted.transactionId,
      documentId: item.documentId,
    });
    this.aliases.push({
      id: "alias_1",
      teamId: input.teamId,
      source: item.latestExtraction?.fields.merchantName ?? "",
      target: accepted.transaction?.description ?? "",
      createdAt: "2026-06-14T00:00:00.000Z",
    });
    const updatedItem = { ...item, status: "resolved" as const, matchSuggestions: [accepted] };
    this.setInboxItem(updatedItem);
    return { suggestion: accepted, inboxItem: updatedItem };
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

    const wasAccepted = suggestion.status === "accepted";
    const rejected = { ...suggestion, status: "rejected" as const };
    const item = this.findInboxItem(rejected.inboxItemId);
    this.suggestions.set(rejected.id, rejected);
    this.hardNegatives.push({
      id: "negative_1",
      teamId: input.teamId,
      inboxItemId: rejected.inboxItemId,
      transactionId: rejected.transactionId,
      reason: input.reason,
      createdAt: "2026-06-14T00:00:00.000Z",
    });
    if (wasAccepted) {
      this.attachments = this.attachments.filter(
        (attachment) =>
          attachment.transactionId !== rejected.transactionId ||
          attachment.documentId !== item?.documentId,
      );

      if (item) {
        this.setInboxItem({ ...item, status: "needs_review", matchSuggestions: [rejected] });
      }
    }
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

function createHistoryInboxItem(base: InboxItem, id: string): InboxItem {
  const suffix = id.replace(/[^a-zA-Z0-9]+/g, "_");
  const documentId = `doc_${suffix}`;
  const documentVersionId = `version_${suffix}`;

  return {
    ...base,
    id,
    documentId,
    documentVersionId,
    status: "resolved",
    latestExtraction: base.latestExtraction
      ? {
          ...base.latestExtraction,
          id: `extraction_${suffix}`,
          inboxItemId: id,
          documentId,
          documentVersionId,
        }
      : null,
    matchSuggestions: [],
  };
}

const context = {
  actor: { id: "user_1", type: "user" as const },
  requestId: "request_1",
  teamId: "team_1",
};

const systemMatchingContext = {
  actor: { id: "system:matching", type: "system" as const },
  requestId: "job_1",
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
    expect(result.suggestions[0]?.status).toBe("suggested");
    expect(result.suggestions[0]?.explanation).toContain("Amount matches exactly");
    expect(repository.attachments).toEqual([]);
    expect(repository.listTransactionsForReportCalls).toBe(0);
  });

  test("does not auto-match one-off high-confidence suggestions", async () => {
    const repository = new MemoryMatchingRepository();

    const result = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        autoMatch: { enabled: true },
      },
    );

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.status).toBe("suggested");
    expect(repository.attachments).toEqual([]);
    expect(repository.auditEvents).toEqual([]);
    expect(repository.outboxEvents).toEqual([]);
  });

  test("auto-matches repeated confirmed patterns and can reject them into negative memory", async () => {
    const repository = new MemoryMatchingRepository();

    for (const index of [1, 2]) {
      repository.additionalInboxItems.push(
        createHistoryInboxItem(repository.inboxItem, `history_inbox_${index}`),
      );
      const transaction = {
        ...repository.transactions[0]!,
        id: `txn_history_${index}`,
        providerTransactionId: `provider_history_${index}`,
      };
      repository.suggestions.set(`history_${index}`, {
        id: `history_${index}`,
        teamId: "team_1",
        inboxItemId: `history_inbox_${index}`,
        transactionId: transaction.id,
        score: 1,
        confidence: "high",
        explanation: ["Historical accepted suggestion"],
        status: "accepted",
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
        transaction,
      });
    }

    const generated = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        autoMatch: { enabled: true },
      },
    );

    expect(generated.suggestions).toHaveLength(1);
    expect(generated.suggestions[0]).toMatchObject({
      transactionId: "txn_1",
      status: "accepted",
    });
    expect(repository.attachments).toEqual([{ transactionId: "txn_1", documentId: "doc_1" }]);
    expect(repository.transactions[0]?.accountantStatus).toBe("receipt_found");
    expect(repository.inboxItem.status).toBe("resolved");
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toMatchObject([{ type: "inbox_match.auto_matched" }]);

    const rejected = await rejectInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      reason: "wrong auto-match",
      idempotencyKey: "reject_auto_1",
    });

    expect(rejected.suggestion.status).toBe("rejected");
    expect(repository.attachments).toEqual([]);
    expect(repository.transactions[0]?.accountantStatus).toBe("needs_review");
    expect(repository.inboxItem.status).toBe("needs_review");
    expect(repository.hardNegatives).toMatchObject([
      { inboxItemId: "inbox_1", transactionId: "txn_1", reason: "wrong auto-match" },
    ]);
    expect(await repository.listTeamMatchFeedback("team_1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "Figma Inc",
          target: "Figma Inc INV-100",
          status: "rejected",
        }),
      ]),
    );
  });

  test("skips low-quality extraction even with repeated confirmed patterns", async () => {
    const repository = new MemoryMatchingRepository();
    repository.inboxItem = {
      ...repository.inboxItem,
      latestExtraction: repository.inboxItem.latestExtraction
        ? {
            ...repository.inboxItem.latestExtraction,
            confidence: {
              merchantName: 0.92,
              issuedAt: 0.91,
              totalAmountMinor: 0.2,
              currency: 0.95,
              overall: 0.52,
            },
          }
        : null,
    };

    for (const index of [1, 2]) {
      repository.additionalInboxItems.push(
        createHistoryInboxItem(repository.inboxItem, `history_low_quality_${index}`),
      );
      const transaction = {
        ...repository.transactions[0]!,
        id: `txn_low_quality_history_${index}`,
        providerTransactionId: `provider_low_quality_history_${index}`,
      };
      repository.suggestions.set(`low_quality_history_${index}`, {
        id: `low_quality_history_${index}`,
        teamId: "team_1",
        inboxItemId: `history_low_quality_${index}`,
        transactionId: transaction.id,
        score: 1,
        confidence: "high",
        explanation: ["Historical accepted suggestion"],
        status: "accepted",
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
        transaction,
      });
    }

    const generated = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
        autoMatch: { enabled: true },
      },
    );

    const batch = await matchBidirectionalBatch(
      repository as unknown as DawnRepository,
      systemMatchingContext,
      {
        teamId: "team_1",
        transactionIds: ["txn_1"],
        inboxItemIds: ["inbox_1"],
        sourceOutboxEventId: "outbox_low_quality",
        idempotencyKey: "inbox:match-batch:outbox_low_quality",
        enforceCallerPermission: false,
        autoMatch: { enabled: true },
      },
    );

    expect(generated.suggestions).toEqual([]);
    expect(batch.suggestions).toEqual([]);
    expect(
      [...repository.suggestions.values()].filter(
        (suggestion) =>
          suggestion.inboxItemId === "inbox_1" && suggestion.transactionId === "txn_1",
      ),
    ).toEqual([]);
    expect(repository.attachments).toEqual([]);
    expect(repository.auditEvents).toEqual([]);
    expect(repository.outboxEvents).toEqual([]);
  });

  test("allows complete extractions with conservative provider confidence", async () => {
    const repository = new MemoryMatchingRepository();
    repository.inboxItem = {
      ...repository.inboxItem,
      latestExtraction: repository.inboxItem.latestExtraction
        ? {
            ...repository.inboxItem.latestExtraction,
            confidence: {
              overall: 0.72,
            },
          }
        : null,
    };

    const generated = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        inboxItemId: "inbox_1",
      },
    );

    expect(generated.suggestions).toHaveLength(1);
    expect(generated.suggestions[0]?.transactionId).toBe("txn_1");
  });

  test("skips non-financial extracted documents during matching", async () => {
    const repository = new MemoryMatchingRepository();
    repository.inboxItem = {
      ...repository.inboxItem,
      latestExtraction: repository.inboxItem.latestExtraction
        ? {
            ...repository.inboxItem.latestExtraction,
            fields: {
              documentType: "other",
              merchantName: "Acme Supplies",
              issuedAt: "2026-06-14",
              totalAmountMinor: 1200,
              currency: "USD",
            },
            confidence: {
              documentType: 0.93,
              overall: 0.91,
            },
          }
        : null,
    };

    const direct = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1" },
    );
    const batch = await matchBidirectionalBatch(
      repository as unknown as DawnRepository,
      systemMatchingContext,
      {
        teamId: "team_1",
        transactionIds: ["txn_1"],
        inboxItemIds: ["inbox_1"],
        sourceOutboxEventId: "outbox_other",
        idempotencyKey: "inbox:match-batch:outbox_other",
        enforceCallerPermission: false,
      },
    );

    expect(direct.suggestions).toEqual([]);
    expect(batch.suggestions).toEqual([]);
    expect(repository.suggestions.size).toBe(0);
  });

  test("moves reviewed transactions into and out of ready-to-export when receipt matches change", async () => {
    const repository = new MemoryMatchingRepository();
    repository.transactions = [{ ...repository.transactions[0]!, reviewState: "reviewed" }];
    const generated = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1" },
    );

    await acceptInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      idempotencyKey: "accept_ready_1",
    });

    expect(repository.attachments).toEqual([{ transactionId: "txn_1", documentId: "doc_1" }]);
    expect(repository.transactions[0]?.accountantStatus).toBe("ready_to_export");

    await rejectInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      reason: "wrong receipt",
      idempotencyKey: "reject_ready_1",
    });

    expect(repository.attachments).toEqual([]);
    expect(repository.transactions[0]?.accountantStatus).toBe("missing_receipt");
  });

  test("ranks multiple bounded transaction candidates through repository retrieval", async () => {
    const repository = new MemoryMatchingRepository();
    repository.transactions = [
      {
        ...repository.transactions[0]!,
        id: "txn_amount_date",
        description: "Card purchase",
        providerTransactionId: "provider_amount_date",
      },
      {
        ...repository.transactions[0]!,
        id: "txn_exact",
        providerTransactionId: "provider_exact",
      },
    ];

    const result = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1", limit: 2 },
    );

    expect(result.suggestions.map((suggestion) => suggestion.transactionId)).toEqual([
      "txn_exact",
      "txn_amount_date",
    ]);
    expect(result.suggestions[0]?.score).toBeGreaterThan(result.suggestions[1]?.score ?? 0);
    expect(repository.listTransactionsForReportCalls).toBe(0);
  });

  test("expires competing suggestions after accepting one match", async () => {
    const repository = new MemoryMatchingRepository();
    repository.transactions = [
      repository.transactions[0]!,
      {
        ...repository.transactions[0]!,
        id: "txn_2",
        providerTransactionId: "provider_2",
      },
    ];
    const generated = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1", limit: 2 },
    );

    expect(generated.suggestions).toHaveLength(2);

    await acceptInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      idempotencyKey: "accept_match_1",
    });

    const competingSuggestionId = generated.suggestions[1]?.id ?? "";

    expect(repository.suggestions.get(competingSuggestionId)?.status).toBe("expired");
    await expect(
      acceptInboxMatch(repository as unknown as DawnRepository, context, {
        teamId: "team_1",
        suggestionId: competingSuggestionId,
        idempotencyKey: "accept_match_2",
      }),
    ).rejects.toThrow("Only suggested inbox matches can be accepted");
    expect(repository.attachments).toEqual([{ transactionId: "txn_1", documentId: "doc_1" }]);
  });

  test("revives expired competing suggestions after an accepted match is rejected", async () => {
    const repository = new MemoryMatchingRepository();
    repository.transactions = [
      repository.transactions[0]!,
      {
        ...repository.transactions[0]!,
        id: "txn_2",
        providerTransactionId: "provider_2",
      },
    ];
    const generated = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1", limit: 2 },
    );

    await acceptInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      idempotencyKey: "accept_match_1",
    });
    await rejectInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      reason: "wrong match",
      idempotencyKey: "reject_match_1",
    });

    const regenerated = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1", limit: 2 },
    );

    expect(regenerated.suggestions).toHaveLength(1);
    expect(regenerated.suggestions[0]).toMatchObject({
      transactionId: "txn_2",
      status: "suggested",
    });

    const accepted = await acceptInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: regenerated.suggestions[0]?.id ?? "",
      idempotencyKey: "accept_match_2",
    });

    expect(accepted.suggestion.transactionId).toBe("txn_2");
    expect(repository.attachments).toEqual([{ transactionId: "txn_2", documentId: "doc_1" }]);
  });

  test("matches a pending inbox item when a transaction arrives later", async () => {
    const repository = new MemoryMatchingRepository();
    const forwardRepository = new MemoryMatchingRepository();
    const forward = await generateInboxMatchSuggestions(
      forwardRepository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1" },
    );

    const result = await matchPendingInboxForTransaction(
      repository as unknown as DawnRepository,
      systemMatchingContext,
      {
        teamId: "team_1",
        transactionId: "txn_1",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "inbox:match-pending:outbox_1:txn_1",
        enforceCallerPermission: false,
      },
    );

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.inboxItemId).toBe("inbox_1");
    expect(result.suggestions[0]?.transactionId).toBe("txn_1");
    expect(result.suggestions[0]?.score).toBeGreaterThanOrEqual(0.75);
    expect(result.suggestions[0]?.score).toBe(forward.suggestions[0]?.score);
    expect(result.suggestions[0]?.explanation).toEqual(forward.suggestions[0]?.explanation);

    const listed = await repository.listInboxItems("team_1");
    expect(listed[0]?.matchSuggestions?.[0]?.transactionId).toBe("txn_1");

    const replayed = await matchPendingInboxForTransaction(
      repository as unknown as DawnRepository,
      systemMatchingContext,
      {
        teamId: "team_1",
        transactionId: "txn_1",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "inbox:match-pending:outbox_1:txn_1",
        enforceCallerPermission: false,
      },
    );

    expect(replayed.replayed).toBe(true);
    expect(
      [...repository.suggestions.values()].filter(
        (suggestion) =>
          suggestion.inboxItemId === "inbox_1" && suggestion.transactionId === "txn_1",
      ),
    ).toHaveLength(1);
  });

  test("batch matching keeps competing same-amount receipts and transactions non-conflicting", async () => {
    const repository = new MemoryMatchingRepository();
    repository.additionalInboxItems = [
      {
        ...repository.inboxItem,
        id: "inbox_2",
        documentId: "doc_2",
        documentVersionId: "version_2",
        latestExtraction: {
          ...repository.inboxItem.latestExtraction!,
          id: "extraction_2",
          inboxItemId: "inbox_2",
          documentId: "doc_2",
          documentVersionId: "version_2",
        },
        matchSuggestions: [],
      },
    ];
    repository.transactions = [
      repository.transactions[0]!,
      {
        ...repository.transactions[0]!,
        id: "txn_2",
        providerTransactionId: "provider_2",
      },
    ];

    const result = await matchBidirectionalBatch(
      repository as unknown as DawnRepository,
      systemMatchingContext,
      {
        teamId: "team_1",
        transactionIds: ["txn_1", "txn_2"],
        inboxItemIds: ["inbox_1", "inbox_2"],
        sourceOutboxEventId: "outbox_batch_1",
        idempotencyKey: "inbox:match-batch:outbox_batch_1",
        enforceCallerPermission: false,
      },
    );
    const replayed = await matchBidirectionalBatch(
      repository as unknown as DawnRepository,
      systemMatchingContext,
      {
        teamId: "team_1",
        transactionIds: ["txn_1", "txn_2"],
        inboxItemIds: ["inbox_1", "inbox_2"],
        sourceOutboxEventId: "outbox_batch_1",
        idempotencyKey: "inbox:match-batch:outbox_batch_1",
        enforceCallerPermission: false,
      },
    );

    expect(result.suggestions).toHaveLength(2);
    expect(
      result.suggestions.map((suggestion) => ({
        inboxItemId: suggestion.inboxItemId,
        transactionId: suggestion.transactionId,
      })),
    ).toEqual([
      { inboxItemId: "inbox_1", transactionId: "txn_1" },
      { inboxItemId: "inbox_2", transactionId: "txn_2" },
    ]);
    expect(new Set(result.suggestions.map((suggestion) => suggestion.inboxItemId)).size).toBe(2);
    expect(new Set(result.suggestions.map((suggestion) => suggestion.transactionId)).size).toBe(2);
    expect(replayed.replayed).toBe(true);
    expect(
      [...repository.suggestions.values()].filter(
        (suggestion) =>
          suggestion.status === "suggested" &&
          (suggestion.inboxItemId === "inbox_1" || suggestion.inboxItemId === "inbox_2"),
      ),
    ).toHaveLength(2);
  });

  test("uses calibrated thresholds for reverse-generated suggestions", async () => {
    const repository = new MemoryMatchingRepository();
    repository.additionalInboxItems.push(
      createHistoryInboxItem(repository.inboxItem, "history_inbox"),
    );
    repository.inboxItem = {
      ...repository.inboxItem,
      latestExtraction: {
        ...repository.inboxItem.latestExtraction!,
        fields: {
          merchantName: "Figma Inc",
          totalAmountMinor: 1200,
          currency: "USD",
        },
        rawText: null,
      },
    };
    repository.transactions = [
      {
        ...repository.transactions[0]!,
        description: "Unknown merchant",
        providerTransactionId: "provider_unknown",
      },
    ];

    for (const [index, description] of ["Coffee Shop", "Taxi Ride", "Office Supplies"].entries()) {
      const transaction = {
        ...repository.transactions[0]!,
        id: `txn_history_${index + 1}`,
        description,
        providerTransactionId: `provider_history_${index + 1}`,
      };
      repository.suggestions.set(`history_${index + 1}`, {
        id: `history_${index + 1}`,
        teamId: "team_1",
        inboxItemId: "history_inbox",
        transactionId: transaction.id,
        score: 0.35,
        confidence: "low",
        explanation: ["Historical rejected suggestion"],
        status: "rejected",
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
        transaction,
      });
    }

    const result = await matchPendingInboxForTransaction(
      repository as unknown as DawnRepository,
      systemMatchingContext,
      {
        teamId: "team_1",
        transactionId: "txn_1",
        sourceOutboxEventId: "outbox_low_precision",
        idempotencyKey: "inbox:match-pending:outbox_low_precision:txn_1",
        enforceCallerPermission: false,
      },
    );

    expect(result.suggestions).toEqual([]);
    expect(
      [...repository.suggestions.values()].filter(
        (suggestion) =>
          suggestion.inboxItemId === "inbox_1" && suggestion.transactionId === "txn_1",
      ),
    ).toEqual([]);
  });

  test("accepts and rejects reverse-generated suggestions through existing flows", async () => {
    const acceptedRepository = new MemoryMatchingRepository();
    const generated = await matchPendingInboxForTransaction(
      acceptedRepository as unknown as DawnRepository,
      systemMatchingContext,
      {
        teamId: "team_1",
        transactionId: "txn_1",
        sourceOutboxEventId: "outbox_1",
        idempotencyKey: "inbox:match-pending:outbox_1:txn_1",
        enforceCallerPermission: false,
      },
    );

    const accepted = await acceptInboxMatch(
      acceptedRepository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        suggestionId: generated.suggestions[0]?.id ?? "",
        idempotencyKey: "accept_reverse_1",
      },
    );

    expect(accepted.suggestion.status).toBe("accepted");
    expect(accepted.inboxItem.status).toBe("resolved");

    const rejectedRepository = new MemoryMatchingRepository();
    const generatedForReject = await matchPendingInboxForTransaction(
      rejectedRepository as unknown as DawnRepository,
      systemMatchingContext,
      {
        teamId: "team_1",
        transactionId: "txn_1",
        sourceOutboxEventId: "outbox_2",
        idempotencyKey: "inbox:match-pending:outbox_2:txn_1",
        enforceCallerPermission: false,
      },
    );

    const rejected = await rejectInboxMatch(
      rejectedRepository as unknown as DawnRepository,
      context,
      {
        teamId: "team_1",
        suggestionId: generatedForReject.suggestions[0]?.id ?? "",
        reason: "wrong transaction",
        idempotencyKey: "reject_reverse_1",
      },
    );

    expect(rejected.suggestion.status).toBe("rejected");
    expect(rejectedRepository.hardNegatives).toMatchObject([
      { inboxItemId: "inbox_1", transactionId: "txn_1", reason: "wrong transaction" },
    ]);
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
    expect(await repository.listTeamMatchFeedback("team_1")).toMatchObject([
      {
        source: "Figma Inc",
        target: "Figma Inc INV-100",
        status: "accepted",
      },
    ]);
  });

  test("accepting a match is idempotent by key and rejects conflicting replays", async () => {
    const repository = new MemoryMatchingRepository();
    const generated = await generateInboxMatchSuggestions(
      repository as unknown as DawnRepository,
      context,
      { teamId: "team_1", inboxItemId: "inbox_1" },
    );

    const accepted = await acceptInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      idempotencyKey: "accept_idempotent_1",
    });
    const replayed = await acceptInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      idempotencyKey: "accept_idempotent_1",
    });

    expect(replayed.replayed).toBe(true);
    expect(replayed.suggestion.id).toBe(accepted.suggestion.id);
    expect(repository.attachments).toEqual([{ transactionId: "txn_1", documentId: "doc_1" }]);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
    await expect(
      acceptInboxMatch(repository as unknown as DawnRepository, context, {
        teamId: "team_1",
        suggestionId: "different_suggestion",
        idempotencyKey: "accept_idempotent_1",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Idempotency key was already used for a different inbox match",
    });
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
    expect(await repository.listTeamMatchFeedback("team_1")).toMatchObject([
      {
        source: "Figma Inc",
        target: "Figma Inc INV-100",
        status: "rejected",
      },
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

  test("rejecting a match is idempotent by key and rejects conflicting replays", async () => {
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
      idempotencyKey: "reject_idempotent_1",
    });
    const replayed = await rejectInboxMatch(repository as unknown as DawnRepository, context, {
      teamId: "team_1",
      suggestionId: generated.suggestions[0]?.id ?? "",
      reason: "wrong receipt",
      idempotencyKey: "reject_idempotent_1",
    });

    expect(replayed.replayed).toBe(true);
    expect(replayed.suggestion.id).toBe(rejected.suggestion.id);
    expect(repository.hardNegatives).toHaveLength(1);
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
    await expect(
      rejectInboxMatch(repository as unknown as DawnRepository, context, {
        teamId: "team_1",
        suggestionId: generated.suggestions[0]?.id ?? "",
        reason: "different reason",
        idempotencyKey: "reject_idempotent_1",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Idempotency key was already used for a different inbox match rejection",
    });
  });
});
