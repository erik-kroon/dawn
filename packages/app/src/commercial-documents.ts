import { createHash, randomBytes } from "node:crypto";

import type {
  Account,
  CommercialDocumentDraftInput,
  CommercialDocumentLineDraft,
  CommercialDocumentVersion,
  CommercialDocumentVersionSnapshot,
  CommercialDocumentWithLines,
  MarketProspect,
  Opportunity,
} from "@dawn/domain";
import {
  assertCanDeclineCommercialDocument,
  assertCanEditCommercialDocument,
  assertCanFinalizeCommercialDocument,
  assertCanReviseCommercialDocument,
  assertCanSendCommercialDocument,
  assertCanViewRecipientCommercialDocument,
  buildCommercialDocumentVersionSnapshot,
  calculateCommercialDocumentTotals,
  canonicalCommercialDocumentVersionPayload,
  marketOriginLineageFromProspect,
  normalizeCommercialDocumentDraftInput,
} from "@dawn/domain";

import {
  AppError,
  assertAppRequestTeam,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";

export type CommercialDocumentPdfDocument = {
  fileName: string;
  contentType: "application/pdf";
  bodyBase64: string;
  byteSize: number;
};

export type CommercialDocumentPdfRenderer = {
  render(input: {
    document: CommercialDocumentWithLines;
    snapshot: CommercialDocumentVersionSnapshot;
  }): Promise<CommercialDocumentPdfDocument>;
};

export type CommercialDocumentProviderObjectRecord = {
  id: string;
  teamId: string;
  provider: string;
  providerObjectType: string;
  providerObjectId: string;
  internalEntityType?: string | null;
  internalEntityId?: string | null;
  rawPayload: Record<string, unknown>;
};

export type CreateCommercialDocumentCommand = Omit<
  CommercialDocumentDraftInput,
  "accountId" | "documentType" | "currency"
> & {
  documentType?: CommercialDocumentDraftInput["documentType"] | null;
  currency?: string | null;
  idempotencyKey: string;
};

export type CreateCommercialDocumentResult = {
  document: CommercialDocumentWithLines;
  replayed: boolean;
};

export type UpdateCommercialDocumentDraftCommand = Partial<
  Omit<CommercialDocumentDraftInput, "teamId" | "accountId" | "opportunityId">
> & {
  teamId: string;
  documentId: string;
  idempotencyKey: string;
};

export type UpdateCommercialDocumentDraftResult = {
  document: CommercialDocumentWithLines;
  replayed: boolean;
};

export type PreviewCommercialDocumentPdfCommand = {
  teamId: string;
  documentId: string;
};

export type PreviewCommercialDocumentPdfResult = {
  document: CommercialDocumentWithLines;
  snapshot: CommercialDocumentVersionSnapshot;
  pdf: CommercialDocumentPdfDocument;
};

export type FinalizeCommercialDocumentCommand = {
  teamId: string;
  documentId: string;
  idempotencyKey: string;
};

export type FinalizeCommercialDocumentResult = {
  document: CommercialDocumentWithLines;
  version: CommercialDocumentVersion;
  replayed: boolean;
};

export type ReviseCommercialDocumentCommand = Partial<
  Omit<CommercialDocumentDraftInput, "teamId" | "accountId" | "opportunityId">
> & {
  teamId: string;
  documentId: string;
  idempotencyKey: string;
};

export type ReviseCommercialDocumentResult = {
  document: CommercialDocumentWithLines;
  supersededVersion: CommercialDocumentVersion | null;
  replayed: boolean;
};

export type GetCommercialDocumentPdfCommand = {
  teamId: string;
  documentId: string;
  versionId?: string | null;
};

export type GetCommercialDocumentPdfResult = {
  document: CommercialDocumentWithLines;
  version: CommercialDocumentVersion;
  pdf: CommercialDocumentPdfDocument;
};

export type SendCommercialDocumentCommand = {
  teamId: string;
  documentId: string;
  recipientEmail?: string | null;
  expiresAt?: string | null;
  idempotencyKey: string;
};

export type SendCommercialDocumentResult = {
  document: CommercialDocumentWithLines;
  recipientAccessToken: string;
  recipientAccessTokenExpiresAt: string;
  replayed: boolean;
};

export type ViewCommercialDocumentByRecipientCommand = {
  accessToken: string;
};

export type ViewCommercialDocumentByRecipientResult = {
  document: CommercialDocumentWithLines;
  version: CommercialDocumentVersion;
  pdf: CommercialDocumentPdfDocument;
  viewed: boolean;
};

export type DeclineCommercialDocumentByRecipientCommand = {
  accessToken: string;
  reason?: string | null;
};

export type DeclineCommercialDocumentByRecipientResult = {
  document: CommercialDocumentWithLines;
  declined: boolean;
};

export type CommercialDocumentRepository = {
  getOpportunityForTeam(teamId: string, recordId: string): Promise<Opportunity | null>;
  getAccountForTeam(teamId: string, recordId: string): Promise<Account | null>;
  getProviderObjectForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
  }): Promise<CommercialDocumentProviderObjectRecord | null>;
  getCommercialDocumentForTeam(
    teamId: string,
    documentId: string,
  ): Promise<CommercialDocumentWithLines | null>;
  listCommercialDocumentsForOpportunity(
    teamId: string,
    opportunityId: string,
  ): Promise<CommercialDocumentWithLines[]>;
  getMarketProspectForOpportunity(
    teamId: string,
    opportunityId: string,
  ): Promise<MarketProspect | null>;
  getLatestCommercialDocumentVersionForTeam(
    teamId: string,
    documentId: string,
  ): Promise<CommercialDocumentVersion | null>;
  getCommercialDocumentVersionForTeam(
    teamId: string,
    versionId: string,
  ): Promise<CommercialDocumentVersion | null>;
  createCommercialDocument(
    input: CommercialDocumentDraftInput & {
      documentId: string;
      createdByActorId: string;
    },
  ): Promise<CommercialDocumentWithLines>;
  updateCommercialDocumentDraft(
    input: CommercialDocumentDraftInput & {
      documentId: string;
    },
  ): Promise<CommercialDocumentWithLines>;
  finalizeCommercialDocument(input: {
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
  }): Promise<{ document: CommercialDocumentWithLines; version: CommercialDocumentVersion }>;
  reviseCommercialDocument(
    input: CommercialDocumentDraftInput & {
      documentId: string;
    },
  ): Promise<{
    document: CommercialDocumentWithLines;
    supersededVersion: CommercialDocumentVersion | null;
  }>;
  sendCommercialDocument(input: {
    teamId: string;
    documentId: string;
    recipientEmail: string;
    recipientAccessTokenHash: string;
    recipientAccessTokenExpiresAt: string;
    sentAt: string;
  }): Promise<CommercialDocumentWithLines>;
  getCommercialDocumentByRecipientAccessTokenHash(input: {
    accessTokenHash: string;
  }): Promise<{ document: CommercialDocumentWithLines; version: CommercialDocumentVersion } | null>;
  markCommercialDocumentViewed(input: {
    teamId: string;
    documentId: string;
    viewedAt: string;
  }): Promise<CommercialDocumentWithLines>;
  declineCommercialDocument(input: {
    teamId: string;
    documentId: string;
    declinedAt: string;
    reason?: string | null;
  }): Promise<CommercialDocumentWithLines>;
};

export type CommercialDocumentUseCaseRepository = TransactionReviewRepository &
  CommercialDocumentRepository;

const createCommercialDocumentOperation = "commercial_document.create";
const updateCommercialDocumentDraftOperation = "commercial_document.draft.update";
const finalizeCommercialDocumentOperation = "commercial_document.finalize";
const reviseCommercialDocumentOperation = "commercial_document.revise";
const sendCommercialDocumentOperation = "commercial_document.send";

export async function createCommercialDocument(
  repository: CommercialDocumentUseCaseRepository,
  context: TransactionReviewContext,
  command: CreateCommercialDocumentCommand,
): Promise<CreateCommercialDocumentResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as CommercialDocumentUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Commercial document not found");
    await assertCommercialDocumentWriteAccess(documentRepository, context, command.teamId);

    const opportunity = await getActiveOpportunity(
      documentRepository,
      command.teamId,
      command.opportunityId,
    );
    const account = await getAccountForOpportunity(documentRepository, command.teamId, opportunity);
    const marketProspect = await documentRepository.getMarketProspectForOpportunity(
      command.teamId,
      opportunity.recordId,
    );
    const normalized = await normalizeCommercialDocumentCommand(documentRepository, {
      ...command,
      accountId: account.recordId,
      documentType: command.documentType ?? "quote",
      currency: command.currency ?? opportunity.currencyCode,
      marketOrigin: marketProspect ? marketOriginLineageFromProspect(marketProspect) : null,
    });
    const fingerprint = JSON.stringify(normalized);
    const replayed = await documentRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      createCommercialDocumentOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different commercial document",
        );
      }

      return { ...(replayed.result as CreateCommercialDocumentResult), replayed: true };
    }

    const document = await documentRepository.createCommercialDocument({
      documentId: crypto.randomUUID(),
      ...normalized,
      createdByActorId: context.actor.id,
    });

    await appendCommercialDocumentEvents(documentRepository, context, {
      teamId: command.teamId,
      document,
      action: "commercial_document.created",
      type: "commercial_document.created",
      metadata: { opportunityId: document.opportunityId, total: document.totals.total },
    });

    const result = { document, replayed: false };

    await documentRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: createCommercialDocumentOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function updateCommercialDocumentDraft(
  repository: CommercialDocumentUseCaseRepository,
  context: TransactionReviewContext,
  command: UpdateCommercialDocumentDraftCommand,
): Promise<UpdateCommercialDocumentDraftResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as CommercialDocumentUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Commercial document not found");
    await assertCommercialDocumentWriteAccess(documentRepository, context, command.teamId);

    const current = await documentRepository.getCommercialDocumentForTeam(
      command.teamId,
      command.documentId,
    );

    if (!current) {
      throw new AppError("NOT_FOUND", "Commercial document not found");
    }

    try {
      assertCanEditCommercialDocument(current);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const normalized = await normalizeCommercialDocumentCommand(documentRepository, {
      teamId: command.teamId,
      accountId: current.accountId,
      opportunityId: current.opportunityId,
      documentType: command.documentType ?? current.documentType,
      title: command.title ?? current.title,
      currency: command.currency ?? current.currency,
      validUntil: command.validUntil === undefined ? current.validUntil : command.validUntil,
      paymentTerms:
        command.paymentTerms === undefined ? current.paymentTerms : command.paymentTerms,
      termsVersion: command.termsVersion ?? current.termsVersion,
      templateId: command.templateId === undefined ? current.templateId : command.templateId,
      recipientEmail:
        command.recipientEmail === undefined ? current.recipientEmail : command.recipientEmail,
      scope: command.scope === undefined ? current.scope : command.scope,
      marketOrigin: current.marketOrigin,
      lines: command.lines ?? current.lines,
    });
    const fingerprint = JSON.stringify({
      documentId: command.documentId,
      ...normalized,
    });
    const replayed = await documentRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateCommercialDocumentDraftOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different commercial document update",
        );
      }

      return { ...(replayed.result as UpdateCommercialDocumentDraftResult), replayed: true };
    }

    const document = await documentRepository.updateCommercialDocumentDraft({
      documentId: command.documentId,
      ...normalized,
    });

    await appendCommercialDocumentEvents(documentRepository, context, {
      teamId: command.teamId,
      document,
      action: "commercial_document.updated",
      type: "commercial_document.updated",
      metadata: { opportunityId: document.opportunityId, total: document.totals.total },
    });

    const result = { document, replayed: false };

    await documentRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateCommercialDocumentDraftOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function previewCommercialDocumentPdf(
  repository: CommercialDocumentUseCaseRepository,
  renderer: CommercialDocumentPdfRenderer,
  context: TransactionReviewContext,
  command: PreviewCommercialDocumentPdfCommand,
): Promise<PreviewCommercialDocumentPdfResult> {
  assertAppRequestTeam(context, command.teamId, "Commercial document not found");
  await assertCommercialDocumentReadAccess(repository, context, command.teamId);

  const document = await repository.getCommercialDocumentForTeam(
    command.teamId,
    command.documentId,
  );

  if (!document) {
    throw new AppError("NOT_FOUND", "Commercial document not found");
  }

  const versionNumber = await nextCommercialDocumentVersionNumber(
    repository,
    command.teamId,
    command.documentId,
  );
  const snapshot = buildCommercialDocumentVersionSnapshot({ document, versionNumber });
  const pdf = await renderer.render({ document, snapshot });

  return { document, snapshot, pdf };
}

export async function finalizeCommercialDocument(
  repository: CommercialDocumentUseCaseRepository,
  renderer: CommercialDocumentPdfRenderer,
  context: TransactionReviewContext,
  command: FinalizeCommercialDocumentCommand,
): Promise<FinalizeCommercialDocumentResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as CommercialDocumentUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Commercial document not found");
    await assertCommercialDocumentWriteAccess(documentRepository, context, command.teamId);

    const fingerprint = JSON.stringify({
      teamId: command.teamId,
      documentId: command.documentId,
    });
    const replayed = await documentRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      finalizeCommercialDocumentOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different commercial document finalisation",
        );
      }

      return { ...(replayed.result as FinalizeCommercialDocumentResult), replayed: true };
    }

    const current = await documentRepository.getCommercialDocumentForTeam(
      command.teamId,
      command.documentId,
    );

    if (!current) {
      throw new AppError("NOT_FOUND", "Commercial document not found");
    }

    try {
      assertCanFinalizeCommercialDocument(current);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const versionNumber = await nextCommercialDocumentVersionNumber(
      documentRepository,
      command.teamId,
      command.documentId,
    );
    const snapshot = buildCommercialDocumentVersionSnapshot({
      document: current,
      versionNumber,
    });
    const pdf = await renderer.render({ document: current, snapshot });
    const pdfSha256 = sha256Base64Body(pdf.bodyBase64);
    const versionId = crypto.randomUUID();
    const finalized = await finalizeCommercialDocumentVersion(documentRepository, {
      teamId: command.teamId,
      documentId: command.documentId,
      versionId,
      versionNumber,
      snapshot,
      pdfObjectKey: `commercial-documents/${command.teamId}/${command.documentId}/v${versionNumber}.pdf`,
      pdfBodyBase64: pdf.bodyBase64,
      pdfSha256,
      byteSize: pdf.byteSize,
      finalizedByActorId: context.actor.id,
    });

    await appendCommercialDocumentEvents(documentRepository, context, {
      teamId: command.teamId,
      document: finalized.document,
      action: "commercial_document.finalised",
      type: "commercial_document.finalised",
      metadata: {
        opportunityId: finalized.document.opportunityId,
        versionId: finalized.version.id,
        versionNumber: finalized.version.versionNumber,
        pdfSha256,
      },
    });

    const result = { ...finalized, replayed: false };

    await documentRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: finalizeCommercialDocumentOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function getCommercialDocumentPdf(
  repository: CommercialDocumentUseCaseRepository,
  context: TransactionReviewContext,
  command: GetCommercialDocumentPdfCommand,
): Promise<GetCommercialDocumentPdfResult> {
  assertAppRequestTeam(context, command.teamId, "Commercial document not found");
  await assertCommercialDocumentReadAccess(repository, context, command.teamId);

  const document = await repository.getCommercialDocumentForTeam(
    command.teamId,
    command.documentId,
  );

  if (!document) {
    throw new AppError("NOT_FOUND", "Commercial document not found");
  }

  const version = command.versionId
    ? await repository.getCommercialDocumentVersionForTeam(command.teamId, command.versionId)
    : document.activeVersionId
      ? await repository.getCommercialDocumentVersionForTeam(
          command.teamId,
          document.activeVersionId,
        )
      : null;

  if (!version || version.documentId !== document.id) {
    throw new AppError("NOT_FOUND", "Commercial document version not found");
  }

  return { document, version, pdf: pdfFromVersion(version) };
}

export async function reviseCommercialDocument(
  repository: CommercialDocumentUseCaseRepository,
  context: TransactionReviewContext,
  command: ReviseCommercialDocumentCommand,
): Promise<ReviseCommercialDocumentResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as CommercialDocumentUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Commercial document not found");
    await assertCommercialDocumentWriteAccess(documentRepository, context, command.teamId);

    const current = await documentRepository.getCommercialDocumentForTeam(
      command.teamId,
      command.documentId,
    );

    if (!current) {
      throw new AppError("NOT_FOUND", "Commercial document not found");
    }

    try {
      assertCanReviseCommercialDocument(current);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const normalized = await normalizeCommercialDocumentCommand(documentRepository, {
      teamId: command.teamId,
      accountId: current.accountId,
      opportunityId: current.opportunityId,
      documentType: command.documentType ?? current.documentType,
      title: command.title ?? `${current.title} revision`,
      currency: command.currency ?? current.currency,
      validUntil: command.validUntil === undefined ? current.validUntil : command.validUntil,
      paymentTerms:
        command.paymentTerms === undefined ? current.paymentTerms : command.paymentTerms,
      termsVersion: command.termsVersion ?? current.termsVersion,
      templateId: command.templateId === undefined ? current.templateId : command.templateId,
      recipientEmail:
        command.recipientEmail === undefined ? current.recipientEmail : command.recipientEmail,
      scope: command.scope === undefined ? current.scope : command.scope,
      marketOrigin: current.marketOrigin,
      lines: command.lines ?? current.lines,
    });
    const fingerprint = JSON.stringify({
      documentId: command.documentId,
      ...normalized,
    });
    const replayed = await documentRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      reviseCommercialDocumentOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different commercial document revision",
        );
      }

      return { ...(replayed.result as ReviseCommercialDocumentResult), replayed: true };
    }

    const revised = await documentRepository.reviseCommercialDocument({
      documentId: command.documentId,
      ...normalized,
    });

    await appendCommercialDocumentEvents(documentRepository, context, {
      teamId: command.teamId,
      document: revised.document,
      action: "commercial_document.revised",
      type: "commercial_document.revised",
      metadata: {
        opportunityId: revised.document.opportunityId,
        supersededVersionId: revised.supersededVersion?.id ?? null,
        total: revised.document.totals.total,
      },
    });

    const result = { ...revised, replayed: false };

    await documentRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: reviseCommercialDocumentOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function sendCommercialDocument(
  repository: CommercialDocumentUseCaseRepository,
  context: TransactionReviewContext,
  command: SendCommercialDocumentCommand,
): Promise<SendCommercialDocumentResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const documentRepository = transactionRepository as CommercialDocumentUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Commercial document not found");
    await assertCommercialDocumentWriteAccess(documentRepository, context, command.teamId);

    const normalized = {
      teamId: command.teamId,
      documentId: command.documentId,
      recipientEmail: normalizeOptionalEmail(command.recipientEmail),
      expiresAt: normalizeOptionalDate(command.expiresAt),
    };
    const fingerprint = JSON.stringify(normalized);
    const replayed = await documentRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      sendCommercialDocumentOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different commercial document send",
        );
      }

      return { ...(replayed.result as SendCommercialDocumentResult), replayed: true };
    }

    const current = await documentRepository.getCommercialDocumentForTeam(
      command.teamId,
      command.documentId,
    );

    if (!current) {
      throw new AppError("NOT_FOUND", "Commercial document not found");
    }

    const recipientEmail = normalized.recipientEmail ?? current.recipientEmail;
    if (!recipientEmail) {
      throw new AppError("CONFLICT", "Commercial document send requires a recipient email");
    }

    const documentForSend = { ...current, recipientEmail };

    try {
      assertCanSendCommercialDocument(documentForSend);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const recipientAccessToken = randomBytes(32).toString("base64url");
    const recipientAccessTokenExpiresAt =
      normalized.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
    const document = await documentRepository.sendCommercialDocument({
      teamId: command.teamId,
      documentId: command.documentId,
      recipientEmail,
      recipientAccessTokenHash: sha256Text(recipientAccessToken),
      recipientAccessTokenExpiresAt,
      sentAt: new Date().toISOString(),
    });

    await appendCommercialDocumentEvents(documentRepository, context, {
      teamId: command.teamId,
      document,
      action: "commercial_document.sent",
      type: "commercial_document.sent",
      metadata: {
        opportunityId: document.opportunityId,
        recipientEmail,
        expiresAt: recipientAccessTokenExpiresAt,
      },
    });

    const result = {
      document,
      recipientAccessToken,
      recipientAccessTokenExpiresAt,
      replayed: false,
    };

    await documentRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: sendCommercialDocumentOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function viewCommercialDocumentByRecipient(
  repository: CommercialDocumentUseCaseRepository,
  command: ViewCommercialDocumentByRecipientCommand,
): Promise<ViewCommercialDocumentByRecipientResult> {
  const accessTokenHash = sha256Text(command.accessToken);
  const match = await repository.getCommercialDocumentByRecipientAccessTokenHash({
    accessTokenHash,
  });

  if (!match) {
    throw new AppError("NOT_FOUND", "Commercial document not found");
  }

  try {
    assertCanViewRecipientCommercialDocument(match.document);
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  if (match.document.status === "viewed") {
    return { ...match, pdf: pdfFromVersion(match.version), viewed: false };
  }

  const viewedAt = new Date().toISOString();
  const document = await repository.markCommercialDocumentViewed({
    teamId: match.document.teamId,
    documentId: match.document.id,
    viewedAt,
  });

  await repository.appendAuditEvent({
    teamId: document.teamId,
    actorId: "recipient",
    requestId: `recipient:${document.id}:${viewedAt}`,
    action: "commercial_document.viewed",
    entityType: "commercial_document",
    entityId: document.id,
    metadata: commercialDocumentAuditMetadata(document, { viewedAt }),
  });

  await repository.appendOutboxEvent({
    teamId: document.teamId,
    actorId: "recipient",
    requestId: `recipient:${document.id}:${viewedAt}`,
    type: "commercial_document.viewed",
    version: 1,
    payload: {
      documentId: document.id,
      opportunityId: document.opportunityId,
      viewedAt,
    },
  });

  return { document, version: match.version, pdf: pdfFromVersion(match.version), viewed: true };
}

export async function declineCommercialDocumentByRecipient(
  repository: CommercialDocumentUseCaseRepository,
  command: DeclineCommercialDocumentByRecipientCommand,
): Promise<DeclineCommercialDocumentByRecipientResult> {
  const accessTokenHash = sha256Text(command.accessToken);
  const match = await repository.getCommercialDocumentByRecipientAccessTokenHash({
    accessTokenHash,
  });

  if (!match) {
    throw new AppError("NOT_FOUND", "Commercial document not found");
  }

  if (match.document.status === "declined") {
    return { document: match.document, declined: false };
  }

  try {
    assertCanDeclineCommercialDocument(match.document);
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  const declinedAt = new Date().toISOString();
  const document = await repository.declineCommercialDocument({
    teamId: match.document.teamId,
    documentId: match.document.id,
    declinedAt,
    reason: command.reason?.trim() || null,
  });

  await repository.appendAuditEvent({
    teamId: document.teamId,
    actorId: "recipient",
    requestId: `recipient:${document.id}:${declinedAt}`,
    action: "commercial_document.declined",
    entityType: "commercial_document",
    entityId: document.id,
    metadata: commercialDocumentAuditMetadata(document, {
      declinedAt,
      reason: document.declineReason,
    }),
  });

  await repository.appendOutboxEvent({
    teamId: document.teamId,
    actorId: "recipient",
    requestId: `recipient:${document.id}:${declinedAt}`,
    type: "commercial_document.declined",
    version: 1,
    payload: {
      documentId: document.id,
      opportunityId: document.opportunityId,
      reason: document.declineReason,
    },
  });

  return { document, declined: true };
}

export function createDeterministicCommercialDocumentPdfRenderer(): CommercialDocumentPdfRenderer {
  return {
    async render(input) {
      const lines = input.snapshot.lines
        .map(
          (line) =>
            `${line.description} ${line.quantityMilli / 1_000} ${line.totals.total.amountMinor}`,
        )
        .join("\\n");
      const pdfText = [
        "%PDF-1.4",
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj",
        `4 0 obj << /Length 180 >> stream\\nBT /F1 12 Tf 72 720 Td (${escapePdfText(
          `${input.snapshot.documentType.toUpperCase()} ${input.snapshot.title}`,
        )}) Tj 0 -18 Td (${escapePdfText(`Total ${input.snapshot.totals.total.amountMinor} ${input.snapshot.currency}`)}) Tj 0 -18 Td (${escapePdfText(lines)}) Tj 0 -18 Td (${escapePdfText(canonicalCommercialDocumentVersionPayload(input.snapshot))}) Tj ET\\nendstream endobj`,
        "trailer << /Root 1 0 R >>",
        "%%EOF",
      ].join("\n");
      const bodyBase64 = Buffer.from(pdfText).toString("base64");

      return {
        fileName: `${input.snapshot.documentType}-${input.snapshot.documentId}-v${input.snapshot.versionNumber}.pdf`,
        contentType: "application/pdf",
        bodyBase64,
        byteSize: Buffer.byteLength(pdfText),
      };
    },
  };
}

async function normalizeCommercialDocumentCommand(
  repository: CommercialDocumentUseCaseRepository,
  command: CommercialDocumentDraftInput,
) {
  const enrichedLines = await Promise.all(
    command.lines.map((line) => enrichCommercialDocumentLine(repository, command.teamId, line)),
  );
  const normalized = normalizeCommercialDocumentDraftInput({
    ...command,
    lines: enrichedLines,
  });

  try {
    calculateCommercialDocumentTotals({
      currency: normalized.currency,
      lines: normalized.lines,
    });
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  return normalized;
}

async function enrichCommercialDocumentLine(
  repository: CommercialDocumentUseCaseRepository,
  teamId: string,
  line: CommercialDocumentLineDraft,
): Promise<CommercialDocumentLineDraft> {
  if (line.source !== "fortnox_article") {
    return line;
  }

  const provider = line.provider?.trim() || "fortnox";
  const providerObjectId = line.providerObjectId?.trim();

  if (!providerObjectId) {
    return line;
  }

  const object = await repository.getProviderObjectForTeam({
    teamId,
    provider,
    providerObjectType: "article",
    providerObjectId,
  });

  if (!object) {
    throw new AppError("NOT_FOUND", "Fortnox article not found");
  }

  return {
    ...line,
    provider,
    providerObjectRecordId: object.id,
    articleNumber:
      line.articleNumber?.trim() ||
      stringFromRecord(object.rawPayload, "articleNumber") ||
      providerObjectId,
    description:
      line.description?.trim() ||
      stringFromRecord(object.rawPayload, "description") ||
      stringFromRecord(object.rawPayload, "Description") ||
      providerObjectId,
    unit: line.unit?.trim() || stringFromRecord(object.rawPayload, "unit") || null,
    vatRateBasisPoints:
      line.vatRateBasisPoints ??
      vatPercentToBasisPoints(numberFromRecord(object.rawPayload, "vat")) ??
      0,
    snapshot: {
      provider: object.provider,
      providerObjectType: object.providerObjectType,
      providerObjectId: object.providerObjectId,
      providerObjectRecordId: object.id,
      rawPayload: object.rawPayload,
    },
  };
}

async function assertCommercialDocumentWriteAccess(
  repository: CommercialDocumentUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
) {
  await resolveTeamAccess(
    repository,
    { ...context, teamId },
    "documents.write",
    "You cannot write commercial documents for this team",
  );
  await resolveTeamAccess(
    repository,
    { ...context, teamId },
    "crm.opportunities.read",
    "You cannot read deals for this team",
  );
}

async function assertCommercialDocumentReadAccess(
  repository: CommercialDocumentUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
) {
  await resolveTeamAccess(
    repository,
    { ...context, teamId },
    "documents.read",
    "You cannot read commercial documents for this team",
  );
}

async function getActiveOpportunity(
  repository: CommercialDocumentUseCaseRepository,
  teamId: string,
  opportunityId: string,
) {
  const opportunity = await repository.getOpportunityForTeam(teamId, opportunityId);

  if (!opportunity) {
    throw new AppError("NOT_FOUND", "Deal not found");
  }

  return opportunity;
}

async function getAccountForOpportunity(
  repository: CommercialDocumentUseCaseRepository,
  teamId: string,
  opportunity: Opportunity,
) {
  const account = await repository.getAccountForTeam(teamId, opportunity.accountId);

  if (!account) {
    throw new AppError("NOT_FOUND", "Account not found");
  }

  return account;
}

async function nextCommercialDocumentVersionNumber(
  repository: CommercialDocumentUseCaseRepository,
  teamId: string,
  documentId: string,
) {
  const latest = await repository.getLatestCommercialDocumentVersionForTeam(teamId, documentId);
  return (latest?.versionNumber ?? 0) + 1;
}

async function finalizeCommercialDocumentVersion(
  repository: CommercialDocumentUseCaseRepository,
  input: Parameters<CommercialDocumentUseCaseRepository["finalizeCommercialDocument"]>[0],
) {
  try {
    return await repository.finalizeCommercialDocument(input);
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }
}

async function appendCommercialDocumentEvents(
  repository: CommercialDocumentUseCaseRepository,
  context: TransactionReviewContext,
  input: {
    teamId: string;
    document: CommercialDocumentWithLines;
    action: string;
    type: string;
    metadata: Record<string, unknown>;
  },
) {
  const metadata = commercialDocumentAuditMetadata(input.document, input.metadata);

  await repository.appendAuditEvent({
    teamId: input.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    action: input.action,
    entityType: "commercial_document",
    entityId: input.document.id,
    metadata,
  });

  await repository.appendOutboxEvent({
    teamId: input.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    type: input.type,
    version: 1,
    payload: {
      ...metadata,
    },
  });
}

function commercialDocumentAuditMetadata(
  document: CommercialDocumentWithLines,
  metadata: Record<string, unknown>,
) {
  return {
    documentId: document.id,
    accountId: document.accountId,
    opportunityId: document.opportunityId,
    documentType: document.documentType,
    title: document.title,
    status: document.status,
    total: document.totals.total,
    ...metadata,
  };
}

function sha256Base64Body(bodyBase64: string) {
  return createHash("sha256").update(Buffer.from(bodyBase64, "base64")).digest("hex");
}

function pdfFromVersion(version: CommercialDocumentVersion): CommercialDocumentPdfDocument {
  const pdfSha256 = sha256Base64Body(version.pdfBodyBase64);

  if (pdfSha256 !== version.pdfSha256) {
    throw new AppError("CONFLICT", "Finalised commercial document PDF hash mismatch");
  }

  return {
    fileName: `${version.snapshot.documentType}-${version.snapshot.documentId}-v${version.versionNumber}.pdf`,
    contentType: "application/pdf",
    bodyBase64: version.pdfBodyBase64,
    byteSize: version.byteSize,
  };
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeOptionalDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("CONFLICT", "Commercial document expiry date is invalid");
  }

  return date.toISOString();
}

function normalizeOptionalEmail(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("CONFLICT", "Commercial document recipient email is invalid");
  }

  return email;
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }

  return null;
}

function vatPercentToBasisPoints(value: number | null) {
  return value === null ? null : Math.round(value * 100);
}

function escapePdfText(value: string) {
  return value.replace(/[\\()]/g, (character) => `\\${character}`).replace(/\r?\n/g, " ");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected commercial document error";
}
