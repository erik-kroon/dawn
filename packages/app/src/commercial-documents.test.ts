import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";
import type {
  Account,
  CommercialDocument,
  CommercialDocumentLine,
  CommercialDocumentLineDraft,
  CommercialDocumentVersion,
  CommercialDocumentVersionSnapshot,
  CommercialDocumentWithLines,
  Opportunity,
} from "@dawn/domain";
import { calculateCommercialDocumentTotals } from "@dawn/domain";

import {
  createCommercialDocument,
  createDeterministicCommercialDocumentPdfRenderer,
  declineCommercialDocumentByRecipient,
  finalizeCommercialDocument,
  getCommercialDocumentPdf,
  previewCommercialDocumentPdf,
  reviseCommercialDocument,
  sendCommercialDocument,
  updateCommercialDocumentDraft,
  viewCommercialDocumentByRecipient,
  type CommercialDocumentProviderObjectRecord,
  type CommercialDocumentUseCaseRepository,
} from "./commercial-documents";
import { AppError, type TransactionReviewContext } from "./index";
import { MemoryAppRepository } from "./testkit/memory-repository";

const context: TransactionReviewContext = {
  actor: { id: "user_1", type: "user" },
  teamId: "team_1",
  requestId: "req_1",
};

class MemoryCommercialDocumentRepository
  extends MemoryAppRepository
  implements Partial<CommercialDocumentUseCaseRepository>
{
  crmAccounts = new Map<string, Account>();
  opportunities = new Map<string, Opportunity>();
  providerObjects = new Map<string, CommercialDocumentProviderObjectRecord>();
  commercialDocuments = new Map<string, CommercialDocument>();
  commercialDocumentLines = new Map<string, CommercialDocumentLine[]>();
  commercialDocumentVersions = new Map<string, CommercialDocumentVersion>();
  rejectNextFinalize = false;

  override async withTransaction<T>(callback: (repository: any) => Promise<T>) {
    return callback(this as unknown as CommercialDocumentUseCaseRepository);
  }

  async getAccountForTeam(teamId: string, recordId: string) {
    const account = this.crmAccounts.get(recordId);
    return account?.teamId === teamId ? account : null;
  }

  async getOpportunityForTeam(teamId: string, recordId: string) {
    const opportunity = this.opportunities.get(recordId);
    return opportunity?.teamId === teamId ? opportunity : null;
  }

  async getProviderObjectForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
  }) {
    const object = this.providerObjects.get(
      `${input.teamId}:${input.provider}:${input.providerObjectType}:${input.providerObjectId}`,
    );

    return object ?? null;
  }

  async getCommercialDocumentForTeam(teamId: string, documentId: string) {
    const document = this.commercialDocuments.get(documentId);
    return document?.teamId === teamId ? this.withLines(document) : null;
  }

  async listCommercialDocumentsForOpportunity(teamId: string, opportunityId: string) {
    return [...this.commercialDocuments.values()]
      .filter((document) => document.teamId === teamId && document.opportunityId === opportunityId)
      .map((document) => this.withLines(document));
  }

  async getMarketProspectForOpportunity(_teamId: string, _opportunityId: string) {
    return null;
  }

  async getLatestCommercialDocumentVersionForTeam(teamId: string, documentId: string) {
    return (
      [...this.commercialDocumentVersions.values()]
        .filter((version) => version.teamId === teamId && version.documentId === documentId)
        .sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null
    );
  }

  async getCommercialDocumentVersionForTeam(teamId: string, versionId: string) {
    const version = this.commercialDocumentVersions.get(versionId);
    return version?.teamId === teamId ? version : null;
  }

  async createCommercialDocument(input: {
    documentId: string;
    teamId: string;
    accountId: string;
    opportunityId: string;
    documentType: CommercialDocument["documentType"];
    title: string;
    currency: string;
    validUntil?: string | null;
    paymentTerms?: string | null;
    termsVersion: string;
    templateId?: string | null;
    recipientEmail?: string | null;
    scope?: string | null;
    marketOrigin?: CommercialDocument["marketOrigin"];
    lines: CommercialDocumentLineDraft[];
    createdByActorId: string;
  }) {
    const now = new Date().toISOString();
    const document: CommercialDocument = {
      id: input.documentId,
      teamId: input.teamId,
      accountId: input.accountId,
      opportunityId: input.opportunityId,
      documentType: input.documentType,
      title: input.title,
      status: "draft",
      currency: input.currency,
      validUntil: input.validUntil ?? null,
      paymentTerms: input.paymentTerms ?? null,
      termsVersion: input.termsVersion,
      templateId: input.templateId ?? null,
      recipientEmail: input.recipientEmail ?? null,
      scope: input.scope ?? null,
      marketOrigin: input.marketOrigin ?? null,
      activeVersionId: null,
      recipientAccessTokenHash: null,
      recipientAccessTokenExpiresAt: null,
      sentAt: null,
      viewedAt: null,
      declinedAt: null,
      declineReason: null,
      createdByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
    };
    this.commercialDocuments.set(document.id, document);
    this.commercialDocumentLines.set(document.id, this.buildLines(document, input.lines));
    return this.withLines(document);
  }

  async updateCommercialDocumentDraft(input: {
    documentId: string;
    teamId: string;
    accountId: string;
    opportunityId: string;
    documentType: CommercialDocument["documentType"];
    title: string;
    currency: string;
    validUntil?: string | null;
    paymentTerms?: string | null;
    termsVersion: string;
    templateId?: string | null;
    recipientEmail?: string | null;
    scope?: string | null;
    marketOrigin?: CommercialDocument["marketOrigin"];
    lines: CommercialDocumentLineDraft[];
  }) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId || current.status !== "draft") {
      throw new Error("Commercial document draft was not updated");
    }

    const updated: CommercialDocument = {
      ...current,
      documentType: input.documentType,
      title: input.title,
      currency: input.currency,
      validUntil: input.validUntil ?? null,
      paymentTerms: input.paymentTerms ?? null,
      termsVersion: input.termsVersion,
      templateId: input.templateId ?? null,
      recipientEmail: input.recipientEmail ?? null,
      scope: input.scope ?? null,
      marketOrigin: input.marketOrigin ?? current.marketOrigin,
      updatedAt: new Date().toISOString(),
    };
    this.commercialDocuments.set(updated.id, updated);
    this.commercialDocumentLines.set(updated.id, this.buildLines(updated, input.lines));
    return this.withLines(updated);
  }

  async finalizeCommercialDocument(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    versionNumber: number;
    snapshot: CommercialDocumentVersionSnapshot;
    pdfObjectKey: string;
    pdfBodyBase64: string;
    pdfSha256: string;
    byteSize: number;
    finalizedByActorId: string;
  }) {
    if (this.rejectNextFinalize) {
      this.rejectNextFinalize = false;
      throw new Error("Commercial document was already finalised");
    }

    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId || current.status !== "draft") {
      throw new Error("Commercial document was not finalized");
    }

    const version: CommercialDocumentVersion = {
      id: input.versionId,
      teamId: input.teamId,
      documentId: input.documentId,
      versionNumber: input.versionNumber,
      status: "finalised",
      snapshot: input.snapshot,
      pdfObjectKey: input.pdfObjectKey,
      pdfBodyBase64: input.pdfBodyBase64,
      pdfSha256: input.pdfSha256,
      byteSize: input.byteSize,
      finalizedByActorId: input.finalizedByActorId,
      createdAt: new Date().toISOString(),
    };
    const document: CommercialDocument = {
      ...current,
      status: "finalised",
      activeVersionId: version.id,
      updatedAt: new Date().toISOString(),
    };
    this.commercialDocumentVersions.set(version.id, version);
    this.commercialDocuments.set(document.id, document);

    return { document: this.withLines(document), version };
  }

  async reviseCommercialDocument(input: {
    documentId: string;
    teamId: string;
    accountId: string;
    opportunityId: string;
    documentType: CommercialDocument["documentType"];
    title: string;
    currency: string;
    validUntil?: string | null;
    paymentTerms?: string | null;
    termsVersion: string;
    templateId?: string | null;
    recipientEmail?: string | null;
    scope?: string | null;
    marketOrigin?: CommercialDocument["marketOrigin"];
    lines: CommercialDocumentLineDraft[];
  }) {
    const current = this.commercialDocuments.get(input.documentId);
    const activeVersion = current?.activeVersionId
      ? this.commercialDocumentVersions.get(current.activeVersionId)
      : null;
    const supersededVersion = activeVersion
      ? { ...activeVersion, status: "superseded" as const }
      : null;

    if (supersededVersion) {
      this.commercialDocumentVersions.set(supersededVersion.id, supersededVersion);
    }

    const document: CommercialDocument = {
      ...current!,
      documentType: input.documentType,
      title: input.title,
      status: "draft",
      currency: input.currency,
      validUntil: input.validUntil ?? null,
      paymentTerms: input.paymentTerms ?? null,
      termsVersion: input.termsVersion,
      templateId: input.templateId ?? null,
      recipientEmail: input.recipientEmail ?? null,
      scope: input.scope ?? null,
      marketOrigin: input.marketOrigin ?? current!.marketOrigin,
      activeVersionId: null,
      recipientAccessTokenHash: null,
      recipientAccessTokenExpiresAt: null,
      sentAt: null,
      viewedAt: null,
      declinedAt: null,
      declineReason: null,
      updatedAt: new Date().toISOString(),
    };
    this.commercialDocuments.set(document.id, document);
    this.commercialDocumentLines.set(document.id, this.buildLines(document, input.lines));

    return { document: this.withLines(document), supersededVersion };
  }

  async sendCommercialDocument(input: {
    teamId: string;
    documentId: string;
    recipientEmail: string;
    recipientAccessTokenHash: string;
    recipientAccessTokenExpiresAt: string;
    sentAt: string;
  }) {
    const current = this.commercialDocuments.get(input.documentId)!;
    const document: CommercialDocument = {
      ...current,
      status: "sent",
      recipientEmail: input.recipientEmail,
      recipientAccessTokenHash: input.recipientAccessTokenHash,
      recipientAccessTokenExpiresAt: input.recipientAccessTokenExpiresAt,
      sentAt: input.sentAt,
      updatedAt: input.sentAt,
    };
    this.commercialDocuments.set(document.id, document);
    return this.withLines(document);
  }

  async getCommercialDocumentByRecipientAccessTokenHash(input: { accessTokenHash: string }) {
    const document = [...this.commercialDocuments.values()].find(
      (candidate) => candidate.recipientAccessTokenHash === input.accessTokenHash,
    );

    if (!document?.activeVersionId) {
      return null;
    }

    const version = this.commercialDocumentVersions.get(document.activeVersionId);
    return version ? { document: this.withLines(document), version } : null;
  }

  async markCommercialDocumentViewed(input: {
    teamId: string;
    documentId: string;
    viewedAt: string;
  }) {
    const current = this.commercialDocuments.get(input.documentId)!;
    const document = {
      ...current,
      status: "viewed" as const,
      viewedAt: input.viewedAt,
      updatedAt: input.viewedAt,
    };
    this.commercialDocuments.set(document.id, document);
    return this.withLines(document);
  }

  async declineCommercialDocument(input: {
    teamId: string;
    documentId: string;
    declinedAt: string;
    reason?: string | null;
  }) {
    const current = this.commercialDocuments.get(input.documentId)!;
    const document = {
      ...current,
      status: "declined" as const,
      declinedAt: input.declinedAt,
      declineReason: input.reason ?? null,
      updatedAt: input.declinedAt,
    };
    this.commercialDocuments.set(document.id, document);
    return this.withLines(document);
  }

  seed() {
    this.memberships.set("user_1:team_1", "member");
    this.crmAccounts.set("account_1", {
      recordId: "account_1",
      teamId: "team_1",
      legalEntityId: null,
      organizationId: "org_1",
      accountType: "customer",
      relationshipStatus: "active",
      lifecycleStage: "active",
      segment: null,
      territory: null,
      primaryOwnerPrincipalId: "user_1",
      customerSince: null,
      churnedAt: null,
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
    });
    this.opportunities.set("opp_1", {
      recordId: "opp_1",
      teamId: "team_1",
      accountId: "account_1",
      name: "Website rebuild",
      amountMinor: 125_000,
      currencyCode: "SEK",
      status: "open",
      stage: "proposal_preparation",
      expectedCloseDate: "2026-07-15T00:00:00.000Z",
      primaryOwnerPrincipalId: "user_1",
      wonAt: null,
      lostAt: null,
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
    });
    this.providerObjects.set("team_1:fortnox:article:KONSULT", {
      id: "provider_object_1",
      teamId: "team_1",
      provider: "fortnox",
      providerObjectType: "article",
      providerObjectId: "KONSULT",
      rawPayload: {
        articleNumber: "KONSULT",
        description: "Fortnox consulting article",
        unit: "h",
        vat: 25,
        sourcePayload: { ArticleNumber: "KONSULT", Description: "Will not mutate quote" },
      },
    });
  }

  private buildLines(document: CommercialDocument, lines: CommercialDocumentLineDraft[]) {
    const calculated = calculateCommercialDocumentTotals({
      currency: document.currency,
      lines,
    });

    return lines.map(
      (line, index): CommercialDocumentLine => ({
        id: `line_${document.id}_${index}`,
        teamId: document.teamId,
        documentId: document.id,
        source: line.source,
        provider: line.provider ?? null,
        providerConnectionId: line.providerConnectionId ?? null,
        providerObjectId: line.providerObjectId ?? null,
        providerObjectRecordId: line.providerObjectRecordId ?? null,
        articleNumber: line.articleNumber ?? null,
        description: line.description,
        unit: line.unit ?? null,
        quantityMilli: line.quantityMilli,
        unitPrice: line.unitPrice,
        discountBasisPoints: line.discountBasisPoints ?? 0,
        vatRateBasisPoints: line.vatRateBasisPoints ?? 0,
        snapshot: line.snapshot ?? null,
        sortOrder: index,
        totals: calculated.lines[index]!,
        createdAt: new Date().toISOString(),
      }),
    );
  }

  private withLines(document: CommercialDocument): CommercialDocumentWithLines {
    const lines = this.commercialDocumentLines.get(document.id) ?? [];
    const totals = {
      subtotal: {
        amountMinor: lines.reduce((total, line) => total + line.totals.subtotal.amountMinor, 0),
        currency: document.currency,
      },
      discount: {
        amountMinor: lines.reduce((total, line) => total + line.totals.discount.amountMinor, 0),
        currency: document.currency,
      },
      vat: {
        amountMinor: lines.reduce((total, line) => total + line.totals.vat.amountMinor, 0),
        currency: document.currency,
      },
      total: {
        amountMinor: lines.reduce((total, line) => total + line.totals.total.amountMinor, 0),
        currency: document.currency,
      },
    };

    return { ...document, lines, totals };
  }
}

describe("commercial document use cases", () => {
  test("creates quote drafts from deals with Fortnox article snapshots and idempotency", async () => {
    const repository = new MemoryCommercialDocumentRepository();
    repository.seed();

    const created = await createCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      quoteCommand("quote-key"),
    );
    const replayed = await createCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      quoteCommand("quote-key"),
    );

    expect(created.replayed).toBe(false);
    expect(replayed.replayed).toBe(true);
    expect(replayed.document.id).toBe(created.document.id);
    expect(created.document.accountId).toBe("account_1");
    expect(created.document.currency).toBe("SEK");
    expect(created.document.lines[0]?.providerObjectRecordId).toBe("provider_object_1");
    expect(created.document.lines[0]?.snapshot).toMatchObject({
      provider: "fortnox",
      providerObjectId: "KONSULT",
      rawPayload: {
        sourcePayload: { Description: "Will not mutate quote" },
      },
    });
    expect(created.document.totals.total).toEqual({ amountMinor: 46_875, currency: "SEK" });
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.outboxEvents).toHaveLength(1);
  });

  test("updates draft quotes and blocks edits after immutable finalization", async () => {
    const repository = new MemoryCommercialDocumentRepository();
    repository.seed();

    const created = await createCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      quoteCommand("quote-key"),
    );
    const updated = await updateCommercialDocumentDraft(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
        title: "Updated quote",
        lines: [
          {
            source: "freeform",
            description: "Strategy",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 20_000, currency: "SEK" },
            vatRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "update-key",
      },
    );
    const renderer = createDeterministicCommercialDocumentPdfRenderer();
    await finalizeCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      renderer,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "finalize-key",
      },
    );

    expect(updated.document.title).toBe("Updated quote");
    expect(updated.document.totals.total).toEqual({ amountMinor: 25_000, currency: "SEK" });
    await expect(
      updateCommercialDocumentDraft(
        repository as unknown as CommercialDocumentUseCaseRepository,
        context,
        {
          teamId: "team_1",
          documentId: created.document.id,
          title: "Too late",
          idempotencyKey: "late-update",
        },
      ),
    ).rejects.toThrow("Only draft commercial documents can be edited");
  });

  test("previews and finalizes exact commercial document bytes with a stable SHA-256", async () => {
    const repository = new MemoryCommercialDocumentRepository();
    repository.seed();
    const renderer = createDeterministicCommercialDocumentPdfRenderer();
    const created = await createCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      quoteCommand("quote-key"),
    );
    const preview = await previewCommercialDocumentPdf(
      repository as unknown as CommercialDocumentUseCaseRepository,
      renderer,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
      },
    );
    const finalized = await finalizeCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      renderer,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "finalize-key",
      },
    );
    const retrieved = await getCommercialDocumentPdf(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
      },
    );
    const replayed = await finalizeCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      renderer,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "finalize-key",
      },
    );

    expect(Buffer.from(preview.pdf.bodyBase64, "base64").toString().startsWith("%PDF-1.4")).toBe(
      true,
    );
    expect(finalized.document.status).toBe("finalised");
    expect(finalized.document.activeVersionId).toBe(finalized.version.id);
    expect(finalized.version.versionNumber).toBe(1);
    expect(finalized.version.pdfSha256).toBe(sha256Base64(preview.pdf.bodyBase64));
    expect(retrieved.pdf.bodyBase64).toBe(preview.pdf.bodyBase64);
    expect(retrieved.version.id).toBe(finalized.version.id);
    expect(replayed.replayed).toBe(true);
    expect(replayed.version.id).toBe(finalized.version.id);
  });

  test("does not save failed finalisation races as idempotent results", async () => {
    const repository = new MemoryCommercialDocumentRepository();
    repository.seed();
    const renderer = createDeterministicCommercialDocumentPdfRenderer();
    const created = await createCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      quoteCommand("quote-key"),
    );
    repository.rejectNextFinalize = true;

    await expect(
      finalizeCommercialDocument(
        repository as unknown as CommercialDocumentUseCaseRepository,
        renderer,
        context,
        {
          teamId: "team_1",
          documentId: created.document.id,
          idempotencyKey: "finalize-race-key",
        },
      ),
    ).rejects.toEqual(new AppError("CONFLICT", "Commercial document was already finalised"));

    const finalized = await finalizeCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      renderer,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "finalize-race-key",
      },
    );

    expect(finalized.replayed).toBe(false);
    expect(finalized.version.versionNumber).toBe(1);
    expect(repository.commercialDocumentVersions.size).toBe(1);
    expect(repository.auditEvents).toEqual([
      expect.objectContaining({ action: "commercial_document.created" }),
      expect.objectContaining({ action: "commercial_document.finalised" }),
    ]);
  });

  test("revises finalised quotes by superseding the old version and reopening a draft", async () => {
    const repository = new MemoryCommercialDocumentRepository();
    repository.seed();
    const renderer = createDeterministicCommercialDocumentPdfRenderer();
    const created = await createCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      quoteCommand("quote-key"),
    );
    const finalized = await finalizeCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      renderer,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "finalize-key",
      },
    );
    const revised = await reviseCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
        title: "Revised quote",
        lines: [
          {
            source: "freeform",
            description: "Revised scope",
            quantityMilli: 1_000,
            unitPrice: { amountMinor: 30_000, currency: "SEK" },
            vatRateBasisPoints: 2_500,
          },
        ],
        idempotencyKey: "revise-key",
      },
    );
    const refinalized = await finalizeCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      renderer,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "finalize-revision-key",
      },
    );

    expect(revised.document.status).toBe("draft");
    expect(revised.document.activeVersionId).toBeNull();
    expect(revised.document.title).toBe("Revised quote");
    expect(revised.supersededVersion?.id).toBe(finalized.version.id);
    expect(revised.supersededVersion?.status).toBe("superseded");
    expect(refinalized.version.versionNumber).toBe(2);
  });

  test("sends recipient links, records first view once, and accepts decline reasons", async () => {
    const repository = new MemoryCommercialDocumentRepository();
    repository.seed();
    const renderer = createDeterministicCommercialDocumentPdfRenderer();
    const created = await createCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      quoteCommand("quote-key"),
    );
    await finalizeCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      renderer,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
        idempotencyKey: "finalize-key",
      },
    );

    const sent = await sendCommercialDocument(
      repository as unknown as CommercialDocumentUseCaseRepository,
      context,
      {
        teamId: "team_1",
        documentId: created.document.id,
        expiresAt: "2026-08-01T00:00:00.000Z",
        idempotencyKey: "send-key",
      },
    );
    const viewed = await viewCommercialDocumentByRecipient(
      repository as unknown as CommercialDocumentUseCaseRepository,
      {
        accessToken: sent.recipientAccessToken,
      },
    );
    const viewedAgain = await viewCommercialDocumentByRecipient(
      repository as unknown as CommercialDocumentUseCaseRepository,
      {
        accessToken: sent.recipientAccessToken,
      },
    );
    const declined = await declineCommercialDocumentByRecipient(
      repository as unknown as CommercialDocumentUseCaseRepository,
      {
        accessToken: sent.recipientAccessToken,
        reason: "Need another start date",
      },
    );
    const declinedAgain = await declineCommercialDocumentByRecipient(
      repository as unknown as CommercialDocumentUseCaseRepository,
      {
        accessToken: sent.recipientAccessToken,
        reason: "Changed my mind again",
      },
    );
    const storedVersion = repository.commercialDocumentVersions.get(viewed.version.id);
    const declinedAuditEvents = repository.auditEvents.filter(
      (event) => (event as { action?: string }).action === "commercial_document.declined",
    );

    expect(sent.document.status).toBe("sent");
    expect(sent.document.recipientAccessTokenHash).not.toBe(sent.recipientAccessToken);
    expect(viewed.viewed).toBe(true);
    expect(viewed.document.status).toBe("viewed");
    expect(storedVersion).toBeDefined();
    expect(viewed.pdf.bodyBase64).toBe(storedVersion!.pdfBodyBase64);
    expect(viewedAgain.viewed).toBe(false);
    expect(declined.document.status).toBe("declined");
    expect(declined.document.declineReason).toBe("Need another start date");
    expect(declinedAgain.declined).toBe(false);
    expect(declinedAgain.document.declineReason).toBe("Need another start date");
    expect(declinedAuditEvents).toHaveLength(1);
    expect(repository.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "commercial_document.sent" }),
        expect.objectContaining({ action: "commercial_document.viewed" }),
        expect.objectContaining({ action: "commercial_document.declined" }),
      ]),
    );
  });
});

function quoteCommand(idempotencyKey: string) {
  return {
    teamId: "team_1",
    opportunityId: "opp_1",
    title: "Quote for Website rebuild",
    validUntil: "2026-07-20T00:00:00.000Z",
    paymentTerms: "30 dagar",
    termsVersion: "2026.1",
    recipientEmail: "buyer@example.com",
    scope: "Build and launch",
    lines: [
      {
        source: "fortnox_article" as const,
        providerObjectId: "KONSULT",
        description: "Consulting",
        quantityMilli: 3_000,
        unitPrice: { amountMinor: 12_500, currency: "SEK" },
      },
    ],
    idempotencyKey,
  };
}

function sha256Base64(bodyBase64: string) {
  return createHash("sha256").update(Buffer.from(bodyBase64, "base64")).digest("hex");
}
