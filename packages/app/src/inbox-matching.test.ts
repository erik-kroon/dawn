import { describe, expect, test } from "bun:test";

import {
  acceptInboxMatch,
  generateInboxMatchSuggestions,
  matchPendingInboxForTransaction,
  rejectInboxMatch,
  type DawnRepository,
  type HardNegativeTransactionMatch,
  type InboxItem,
  type InboxTransactionMatchSuggestion,
  type TeamAlias,
} from "./index";
import type { Actor, InboxMatchSuggestion, TeamRole, Transaction } from "@dawn/domain";

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
  listTransactionsForReportCalls = 0;

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

  async listInboxItems(teamId: string) {
    return teamId === this.inboxItem.teamId ? [this.inboxItem] : [];
  }

  async getTransactionForTeam(teamId: string, transactionId: string) {
    return (
      this.transactions.find(
        (transaction) => transaction.teamId === teamId && transaction.id === transactionId,
      ) ?? null
    );
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
        source: this.inboxItem.latestExtraction?.fields.merchantName ?? "",
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
    if (
      input.teamId !== this.inboxItem.teamId ||
      this.inboxItem.status !== "needs_review" ||
      this.inboxItem.extractionStatus !== "completed" ||
      !this.inboxItem.latestExtraction
    ) {
      return [];
    }

    const alreadyAttached = this.attachments.some(
      (attachment) =>
        attachment.documentId === this.inboxItem.documentId ||
        attachment.transactionId === input.transaction.id,
    );
    const alreadySuggested = [...this.suggestions.values()].some(
      (suggestion) =>
        suggestion.teamId === input.teamId &&
        suggestion.inboxItemId === this.inboxItem.id &&
        suggestion.transactionId === input.transaction.id &&
        (suggestion.status === "suggested" || suggestion.status === "accepted"),
    );

    return alreadyAttached || alreadySuggested ? [] : [this.inboxItem].slice(0, input.limit);
  }

  async upsertInboxMatchSuggestions(input: {
    teamId: string;
    inboxItemId: string;
    suggestions: InboxMatchSuggestion[];
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

    const wasAccepted = suggestion.status === "accepted";
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
    if (wasAccepted) {
      this.attachments = this.attachments.filter(
        (attachment) =>
          attachment.transactionId !== rejected.transactionId ||
          attachment.documentId !== this.inboxItem.documentId,
      );
      this.inboxItem = { ...this.inboxItem, status: "needs_review", matchSuggestions: [rejected] };
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

  test("uses calibrated thresholds for reverse-generated suggestions", async () => {
    const repository = new MemoryMatchingRepository();
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
});
