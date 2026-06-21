import type {
  CommercialDocumentVersion,
  CommercialDocumentWithLines,
  IntegrationConnection,
  InvoiceHandoff,
  InvoiceHandoffPolicy,
  InvoiceHandoffPolicyMode,
  Opportunity,
  SignatureRequest,
} from "@dawn/domain";
import {
  assertCanApproveInvoiceHandoff,
  assertCanRequestInvoiceHandoff,
  assertCanRunInvoiceHandoff,
  assertOpportunityStageTransition,
  buildInvoiceHandoffProviderPayload,
  deriveOpportunityStatusFromStage,
  normalizeFortnoxCustomerNumber,
  normalizeInvoiceHandoffPolicyMode,
} from "@dawn/domain";
import type { FortnoxInvoiceProvider, IntegrationProviderToken } from "@dawn/integrations";

import type { CrmProviderObjectRecord } from "./crm";
import {
  AppError,
  assertAppRequestTeam,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";
import { assertInvoiceHandoffTrustGate, type TrustRepository } from "./trust";

export type ReadInvoiceHandoffPolicyCommand = {
  teamId: string;
};

export type UpdateInvoiceHandoffPolicyCommand = {
  teamId: string;
  mode: InvoiceHandoffPolicyMode;
  idempotencyKey: string;
};

export type RequestInvoiceHandoffCommand = {
  teamId: string;
  documentId: string;
  versionId?: string | null;
  connectionId: string;
  idempotencyKey: string;
  enforceCallerPermission?: boolean;
};

export type ApproveInvoiceHandoffCommand = {
  teamId: string;
  handoffId: string;
  rationale: string;
  idempotencyKey: string;
};

export type RetryInvoiceHandoffCommand = {
  teamId: string;
  handoffId: string;
  idempotencyKey: string;
  enforceCallerPermission?: boolean;
};

export type ProcessFortnoxInvoiceCreationCommand = {
  teamId: string;
  handoffId: string;
  sourceOutboxEventId?: string | null;
  idempotencyKey: string;
  enforceCallerPermission?: boolean;
};

export type GetInvoiceHandoffForDocumentCommand = {
  teamId: string;
  documentId: string;
};

export type InvoiceHandoffResult = {
  handoff: InvoiceHandoff;
  policy?: InvoiceHandoffPolicy;
  replayed: boolean;
};

export type ProcessFortnoxInvoiceCreationResult = {
  handoff: InvoiceHandoff;
  providerObject: CrmProviderObjectRecord | null;
  replayed: boolean;
};

export type InvoiceHandoffRepository = {
  getCommercialDocumentForTeam(
    teamId: string,
    documentId: string,
  ): Promise<CommercialDocumentWithLines | null>;
  getCommercialDocumentVersionForTeam(
    teamId: string,
    versionId: string,
  ): Promise<CommercialDocumentVersion | null>;
  getSignatureRequestForDocumentVersion(input: {
    teamId: string;
    documentId: string;
    documentVersionId: string;
  }): Promise<SignatureRequest | null>;
  getIntegrationConnectionForTeam(
    teamId: string,
    connectionId: string,
  ): Promise<IntegrationConnection | null>;
  getIntegrationConnectionSecretsForTeam(
    teamId: string,
    connectionId: string,
  ): Promise<{
    token: IntegrationProviderToken;
    rawPayload: Record<string, unknown>;
  } | null>;
  getInvoiceHandoffPolicy(teamId: string): Promise<InvoiceHandoffPolicy | null>;
  upsertInvoiceHandoffPolicy(input: {
    teamId: string;
    mode: InvoiceHandoffPolicyMode;
    updatedByActorId: string;
    updatedAt: string;
  }): Promise<InvoiceHandoffPolicy>;
  getInvoiceHandoffForTeam(teamId: string, handoffId: string): Promise<InvoiceHandoff | null>;
  getActiveInvoiceHandoffForDocumentVersion(input: {
    teamId: string;
    provider: "fortnox";
    documentVersionId: string;
  }): Promise<InvoiceHandoff | null>;
  listInvoiceHandoffsForDocument(input: {
    teamId: string;
    documentId: string;
  }): Promise<InvoiceHandoff[]>;
  createInvoiceHandoff(input: {
    handoffId: string;
    teamId: string;
    accountId: string;
    opportunityId: string;
    documentId: string;
    documentVersionId: string;
    signatureRequestId: string;
    provider: "fortnox";
    connectionId: string;
    status: InvoiceHandoff["status"];
    requestedByActorId: string;
    requestedAt: string;
    requestPayload: Record<string, unknown>;
  }): Promise<InvoiceHandoff>;
  markInvoiceHandoffApproved(input: {
    teamId: string;
    handoffId: string;
    approvedByActorId: string;
    approvedAt: string;
  }): Promise<InvoiceHandoff | null>;
  markInvoiceHandoffRetryRequested(input: {
    teamId: string;
    handoffId: string;
    requestedAt: string;
  }): Promise<InvoiceHandoff | null>;
  markInvoiceHandoffCreating(input: {
    teamId: string;
    handoffId: string;
    lastAttemptAt: string;
  }): Promise<InvoiceHandoff | null>;
  markInvoiceHandoffCreated(input: {
    teamId: string;
    handoffId: string;
    providerObjectRecordId: string | null;
    providerInvoiceId: string;
    providerInvoiceNumber: string;
    providerInvoiceUrl: string | null;
    providerStatus: string;
    rawPayload: Record<string, unknown>;
    completedAt: string;
  }): Promise<InvoiceHandoff | null>;
  markInvoiceHandoffFailed(input: {
    teamId: string;
    handoffId: string;
    failureCode: string;
    failureMessage: string;
    rawPayload?: Record<string, unknown> | null;
    failedAt: string;
  }): Promise<InvoiceHandoff | null>;
  listProviderObjectsForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectTypes: readonly string[];
  }): Promise<CrmProviderObjectRecord[]>;
  upsertProviderObject(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
    connectionId?: string | null;
    internalEntityType?: string | null;
    internalEntityId?: string | null;
    rawPayload: Record<string, unknown>;
  }): Promise<void>;
  getProviderObjectForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectType: string;
    providerObjectId: string;
  }): Promise<CrmProviderObjectRecord | null>;
  getOpportunityForTeam(teamId: string, recordId: string): Promise<Opportunity | null>;
  updateOpportunityStage(input: {
    teamId: string;
    opportunityId: string;
    stage: Opportunity["stage"];
    status: Opportunity["status"];
    actorId: string;
  }): Promise<Opportunity | null>;
};

export type InvoiceHandoffUseCaseRepository = TransactionReviewRepository &
  TrustRepository &
  InvoiceHandoffRepository;

const defaultInvoiceHandoffPolicyMode: InvoiceHandoffPolicyMode = "manual";
const updatePolicyOperation = "invoice_handoff.policy.update";
const requestHandoffOperation = "invoice_handoff.request";
const approveHandoffOperation = "invoice_handoff.approve";
const retryHandoffOperation = "invoice_handoff.retry";
const processHandoffOperation = "invoice_handoff.process_fortnox_invoice";

export async function readInvoiceHandoffPolicy(
  repository: InvoiceHandoffUseCaseRepository,
  context: TransactionReviewContext,
  command: ReadInvoiceHandoffPolicyCommand,
) {
  assertAppRequestTeam(context, command.teamId, "Invoice handoff policy not found");
  await assertInvoiceReadAccess(repository, context, command.teamId);

  return { policy: await loadInvoiceHandoffPolicy(repository, command.teamId) };
}

export async function updateInvoiceHandoffPolicy(
  repository: InvoiceHandoffUseCaseRepository,
  context: TransactionReviewContext,
  command: UpdateInvoiceHandoffPolicyCommand,
) {
  return repository.withTransaction(async (transactionRepository) => {
    const invoiceRepository = transactionRepository as InvoiceHandoffUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Invoice handoff policy not found");
    await assertInvoiceWriteAccess(invoiceRepository, context, command.teamId);

    const mode = normalizeInvoiceHandoffPolicyMode(command.mode);
    const fingerprint = stableStringify({ teamId: command.teamId, mode });
    const replayed = await invoiceRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updatePolicyOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for another invoice handoff policy",
        );
      }

      return {
        ...(replayed.result as { policy: InvoiceHandoffPolicy; replayed: boolean }),
        replayed: true,
      };
    }

    const policy = await invoiceRepository.upsertInvoiceHandoffPolicy({
      teamId: command.teamId,
      mode,
      updatedByActorId: context.actor.id,
      updatedAt: new Date().toISOString(),
    });

    await invoiceRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "invoice_handoff.policy_updated",
      entityType: "team",
      entityId: command.teamId,
      metadata: { mode },
    });

    const result = { policy, replayed: false };

    await invoiceRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updatePolicyOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function requestInvoiceHandoff(
  repository: InvoiceHandoffUseCaseRepository,
  context: TransactionReviewContext,
  command: RequestInvoiceHandoffCommand,
): Promise<InvoiceHandoffResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const invoiceRepository = transactionRepository as InvoiceHandoffUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Commercial document not found");
    await assertInvoiceWriteAccess(
      invoiceRepository,
      context,
      command.teamId,
      command.enforceCallerPermission,
    );

    const policy = await loadInvoiceHandoffPolicy(invoiceRepository, command.teamId);
    const material = await loadInvoiceHandoffMaterial(invoiceRepository, command);
    await assertInvoiceHandoffTrustGate(invoiceRepository, context, {
      teamId: command.teamId,
      documentId: material.document.id,
    });

    const fingerprint = stableStringify({
      teamId: command.teamId,
      documentId: material.document.id,
      versionId: material.version.id,
      connectionId: material.connection.id,
      provider: "fortnox",
    });
    const replayed = await invoiceRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      requestHandoffOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for another invoice handoff",
        );
      }

      return { ...(replayed.result as InvoiceHandoffResult), replayed: true };
    }

    const existing = await invoiceRepository.getActiveInvoiceHandoffForDocumentVersion({
      teamId: command.teamId,
      provider: "fortnox",
      documentVersionId: material.version.id,
    });

    if (existing) {
      const result = { handoff: existing, policy, replayed: true };

      await invoiceRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: requestHandoffOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    }

    const requestedAt = new Date().toISOString();
    const status: InvoiceHandoff["status"] =
      policy.mode === "automatic" ? "requested" : "waiting_manual_approval";
    const handoff = await invoiceRepository.createInvoiceHandoff({
      handoffId: crypto.randomUUID(),
      teamId: command.teamId,
      accountId: material.document.accountId,
      opportunityId: material.document.opportunityId,
      documentId: material.document.id,
      documentVersionId: material.version.id,
      signatureRequestId: material.signatureRequest.id,
      provider: "fortnox",
      connectionId: material.connection.id,
      status,
      requestedByActorId: context.actor.id,
      requestedAt,
      requestPayload: material.providerPayload as unknown as Record<string, unknown>,
    });

    await appendInvoiceHandoffEvent(invoiceRepository, context, {
      action:
        status === "requested" ? "invoice_handoff.requested" : "invoice_handoff.awaiting_approval",
      document: material.document,
      handoff,
      metadata: {
        policyMode: policy.mode,
        connectionId: material.connection.id,
        customerNumber: material.customer.providerObjectId,
      },
    });

    const result = { handoff, policy, replayed: false };

    await invoiceRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: requestHandoffOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function approveInvoiceHandoff(
  repository: InvoiceHandoffUseCaseRepository,
  context: TransactionReviewContext,
  command: ApproveInvoiceHandoffCommand,
): Promise<InvoiceHandoffResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const invoiceRepository = transactionRepository as InvoiceHandoffUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Invoice handoff not found");
    await assertInvoiceWriteAccess(invoiceRepository, context, command.teamId);

    const rationale = command.rationale.trim();

    if (!rationale) {
      throw new AppError("CONFLICT", "Invoice approval rationale is required");
    }

    const handoff = await invoiceRepository.getInvoiceHandoffForTeam(
      command.teamId,
      command.handoffId,
    );

    if (!handoff) {
      throw new AppError("NOT_FOUND", "Invoice handoff not found");
    }

    try {
      assertCanApproveInvoiceHandoff(handoff);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    await assertInvoiceHandoffTrustGate(invoiceRepository, context, {
      teamId: command.teamId,
      documentId: handoff.documentId,
    });

    const fingerprint = stableStringify({
      teamId: command.teamId,
      handoffId: command.handoffId,
      rationale,
    });
    const replayed = await invoiceRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      approveHandoffOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for another invoice handoff approval",
        );
      }

      return { ...(replayed.result as InvoiceHandoffResult), replayed: true };
    }

    const approved = await invoiceRepository.markInvoiceHandoffApproved({
      teamId: command.teamId,
      handoffId: command.handoffId,
      approvedByActorId: context.actor.id,
      approvedAt: new Date().toISOString(),
    });

    if (!approved) {
      throw new AppError("NOT_FOUND", "Invoice handoff not found");
    }

    const document = await requireCommercialDocument(
      invoiceRepository,
      command.teamId,
      handoff.documentId,
    );
    await appendInvoiceHandoffEvent(invoiceRepository, context, {
      action: "invoice_handoff.approved",
      document,
      handoff: approved,
      metadata: { rationale },
    });

    const result = { handoff: approved, replayed: false };

    await invoiceRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: approveHandoffOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function retryInvoiceHandoff(
  repository: InvoiceHandoffUseCaseRepository,
  context: TransactionReviewContext,
  command: RetryInvoiceHandoffCommand,
): Promise<InvoiceHandoffResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const invoiceRepository = transactionRepository as InvoiceHandoffUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Invoice handoff not found");
    await assertInvoiceWriteAccess(
      invoiceRepository,
      context,
      command.teamId,
      command.enforceCallerPermission,
    );

    const handoff = await invoiceRepository.getInvoiceHandoffForTeam(
      command.teamId,
      command.handoffId,
    );

    if (!handoff) {
      throw new AppError("NOT_FOUND", "Invoice handoff not found");
    }

    if (handoff.status !== "failed") {
      throw new AppError("CONFLICT", "Only failed invoice handoffs can be retried");
    }

    const fingerprint = stableStringify({
      teamId: command.teamId,
      handoffId: command.handoffId,
    });
    const replayed = await invoiceRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      retryHandoffOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for another invoice handoff retry",
        );
      }

      return { ...(replayed.result as InvoiceHandoffResult), replayed: true };
    }

    await assertInvoiceHandoffTrustGate(invoiceRepository, context, {
      teamId: command.teamId,
      documentId: handoff.documentId,
    });

    const retried = await invoiceRepository.markInvoiceHandoffRetryRequested({
      teamId: command.teamId,
      handoffId: command.handoffId,
      requestedAt: new Date().toISOString(),
    });

    if (!retried) {
      throw new AppError("NOT_FOUND", "Invoice handoff not found");
    }

    const document = await requireCommercialDocument(
      invoiceRepository,
      command.teamId,
      handoff.documentId,
    );
    await appendInvoiceHandoffEvent(invoiceRepository, context, {
      action: "invoice_handoff.retry_requested",
      document,
      handoff: retried,
      metadata: {
        previousFailureCode: handoff.failureCode,
        previousFailureMessage: handoff.failureMessage,
      },
    });

    const result = { handoff: retried, replayed: false };

    await invoiceRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: retryHandoffOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function getInvoiceHandoffForDocument(
  repository: InvoiceHandoffUseCaseRepository,
  context: TransactionReviewContext,
  command: GetInvoiceHandoffForDocumentCommand,
) {
  assertAppRequestTeam(context, command.teamId, "Invoice handoff not found");
  await assertInvoiceReadAccess(repository, context, command.teamId);
  const document = await requireCommercialDocument(repository, command.teamId, command.documentId);

  return {
    document,
    handoffs: await repository.listInvoiceHandoffsForDocument({
      teamId: command.teamId,
      documentId: command.documentId,
    }),
    policy: await loadInvoiceHandoffPolicy(repository, command.teamId),
  };
}

export async function processFortnoxInvoiceCreation(
  repository: InvoiceHandoffUseCaseRepository,
  provider: FortnoxInvoiceProvider,
  context: TransactionReviewContext,
  command: ProcessFortnoxInvoiceCreationCommand,
): Promise<ProcessFortnoxInvoiceCreationResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const invoiceRepository = transactionRepository as InvoiceHandoffUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Invoice handoff not found");
    await assertInvoiceWriteAccess(
      invoiceRepository,
      context,
      command.teamId,
      command.enforceCallerPermission,
    );

    const handoff = await invoiceRepository.getInvoiceHandoffForTeam(
      command.teamId,
      command.handoffId,
    );

    if (!handoff) {
      throw new AppError("NOT_FOUND", "Invoice handoff not found");
    }

    const fingerprint = stableStringify({
      teamId: command.teamId,
      handoffId: handoff.id,
      sourceOutboxEventId: command.sourceOutboxEventId ?? null,
    });
    const replayed = await invoiceRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      processHandoffOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for another Fortnox invoice creation",
        );
      }

      return { ...(replayed.result as ProcessFortnoxInvoiceCreationResult), replayed: true };
    }

    try {
      assertCanRunInvoiceHandoff(handoff);
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    if (handoff.status === "created") {
      const providerObject = handoff.providerInvoiceId
        ? await invoiceRepository.getProviderObjectForTeam({
            teamId: handoff.teamId,
            provider: "fortnox",
            providerObjectType: "invoice",
            providerObjectId: handoff.providerInvoiceId,
          })
        : null;
      const result = { handoff, providerObject, replayed: true };

      await invoiceRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: processHandoffOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    }

    const material = await loadInvoiceHandoffMaterial(invoiceRepository, {
      teamId: handoff.teamId,
      documentId: handoff.documentId,
      versionId: handoff.documentVersionId,
      connectionId: handoff.connectionId,
    });

    await assertInvoiceHandoffTrustGate(invoiceRepository, context, {
      teamId: handoff.teamId,
      documentId: handoff.documentId,
    });

    const attemptAt = new Date().toISOString();
    const creating = await invoiceRepository.markInvoiceHandoffCreating({
      teamId: command.teamId,
      handoffId: handoff.id,
      lastAttemptAt: attemptAt,
    });

    if (!creating) {
      throw new AppError("NOT_FOUND", "Invoice handoff not found");
    }

    try {
      const secrets = await invoiceRepository.getIntegrationConnectionSecretsForTeam(
        command.teamId,
        material.connection.id,
      );
      const created = await provider.createInvoice({
        teamId: command.teamId,
        connectionId: material.connection.id,
        providerConnectionId: material.connection.providerConnectionId,
        token: secrets?.token ?? null,
        payload: material.providerPayload,
        idempotencyKey: command.idempotencyKey,
      });

      await invoiceRepository.upsertProviderObject({
        teamId: command.teamId,
        provider: "fortnox",
        providerObjectType: "invoice",
        providerObjectId: created.providerInvoiceId,
        connectionId: material.connection.id,
        internalEntityType: "commercial_document",
        internalEntityId: material.document.id,
        rawPayload: {
          ...created.rawPayload,
          integrationConnectionId: material.connection.id,
          invoiceHandoffId: handoff.id,
          documentId: material.document.id,
          documentVersionId: material.version.id,
          signatureRequestId: material.signatureRequest.id,
          providerInvoiceId: created.providerInvoiceId,
          invoiceNumber: created.invoiceNumber,
          invoiceUrl: created.invoiceUrl,
          providerStatus: created.providerStatus,
          paymentStatus: created.paymentStatus,
        },
      });
      const providerObject = await invoiceRepository.getProviderObjectForTeam({
        teamId: command.teamId,
        provider: "fortnox",
        providerObjectType: "invoice",
        providerObjectId: created.providerInvoiceId,
      });
      const completedAt = new Date().toISOString();
      const completed = await invoiceRepository.markInvoiceHandoffCreated({
        teamId: command.teamId,
        handoffId: handoff.id,
        providerObjectRecordId: providerObject?.id ?? null,
        providerInvoiceId: created.providerInvoiceId,
        providerInvoiceNumber: created.invoiceNumber,
        providerInvoiceUrl: created.invoiceUrl,
        providerStatus: created.providerStatus,
        rawPayload: created.rawPayload,
        completedAt,
      });

      if (!completed) {
        throw new AppError("NOT_FOUND", "Invoice handoff not found");
      }

      await moveOpportunityToWon(invoiceRepository, context, material.document);
      await appendInvoiceHandoffEvent(invoiceRepository, context, {
        action: "invoice_handoff.created",
        document: material.document,
        handoff: completed,
        metadata: {
          providerInvoiceId: created.providerInvoiceId,
          providerInvoiceNumber: created.invoiceNumber,
          providerInvoiceUrl: created.invoiceUrl,
          providerStatus: created.providerStatus,
          paymentStatus: created.paymentStatus,
          sourceOutboxEventId: command.sourceOutboxEventId ?? null,
        },
      });

      const result = { handoff: completed, providerObject, replayed: false };

      await invoiceRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: processHandoffOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    } catch (error) {
      const failed = await invoiceRepository.markInvoiceHandoffFailed({
        teamId: command.teamId,
        handoffId: handoff.id,
        failureCode: error instanceof AppError ? error.code.toLowerCase() : "provider_error",
        failureMessage: errorMessage(error),
        rawPayload: { sourceOutboxEventId: command.sourceOutboxEventId ?? null },
        failedAt: new Date().toISOString(),
      });

      await appendInvoiceHandoffEvent(invoiceRepository, context, {
        action: "invoice_handoff.failed",
        document: material.document,
        handoff: failed ?? creating,
        metadata: {
          failureCode: failed?.failureCode ?? "provider_error",
          failureMessage: failed?.failureMessage ?? errorMessage(error),
          sourceOutboxEventId: command.sourceOutboxEventId ?? null,
        },
      });

      throw error;
    }
  });
}

async function loadInvoiceHandoffPolicy(
  repository: InvoiceHandoffUseCaseRepository,
  teamId: string,
): Promise<InvoiceHandoffPolicy> {
  return (
    (await repository.getInvoiceHandoffPolicy(teamId)) ?? {
      teamId,
      mode: defaultInvoiceHandoffPolicyMode,
      updatedByActorId: null,
      updatedAt: new Date(0).toISOString(),
    }
  );
}

async function loadInvoiceHandoffMaterial(
  repository: InvoiceHandoffUseCaseRepository,
  command: Pick<
    RequestInvoiceHandoffCommand,
    "teamId" | "documentId" | "versionId" | "connectionId"
  >,
) {
  const document = await requireCommercialDocument(repository, command.teamId, command.documentId);
  const versionId = command.versionId ?? document.activeVersionId;

  if (!versionId) {
    throw new AppError("CONFLICT", "Commercial document has no finalized version");
  }

  const version = await repository.getCommercialDocumentVersionForTeam(command.teamId, versionId);

  if (!version || version.documentId !== document.id) {
    throw new AppError("NOT_FOUND", "Commercial document version not found");
  }

  const signatureRequest = await repository.getSignatureRequestForDocumentVersion({
    teamId: command.teamId,
    documentId: document.id,
    documentVersionId: version.id,
  });

  try {
    assertCanRequestInvoiceHandoff({ document, version, signatureRequest });
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  const connection = await repository.getIntegrationConnectionForTeam(
    command.teamId,
    command.connectionId,
  );

  if (!connection || connection.provider !== "fortnox" || connection.status !== "connected") {
    throw new AppError("NOT_FOUND", "Connected Fortnox integration not found");
  }

  const customer = await findFortnoxCustomerMapping(repository, {
    teamId: command.teamId,
    accountId: document.accountId,
    connectionId: connection.id,
  });

  if (!customer) {
    throw new AppError("CONFLICT", "Account must be linked to a Fortnox customer first");
  }

  return {
    document,
    version,
    signatureRequest: signatureRequest as SignatureRequest,
    connection,
    customer,
    providerPayload: buildInvoiceHandoffProviderPayload({
      document,
      version,
      signatureRequest: signatureRequest as SignatureRequest,
      customerNumber: normalizeFortnoxCustomerNumber(customer.providerObjectId),
    }),
  };
}

async function requireCommercialDocument(
  repository: InvoiceHandoffUseCaseRepository,
  teamId: string,
  documentId: string,
) {
  const document = await repository.getCommercialDocumentForTeam(teamId, documentId);

  if (!document) {
    throw new AppError("NOT_FOUND", "Commercial document not found");
  }

  return document;
}

async function findFortnoxCustomerMapping(
  repository: InvoiceHandoffUseCaseRepository,
  input: { teamId: string; accountId: string; connectionId: string },
) {
  const customers = await repository.listProviderObjectsForTeam({
    teamId: input.teamId,
    provider: "fortnox",
    providerObjectTypes: ["customer"],
  });

  return (
    customers.find(
      (customer) =>
        providerObjectConnectionId(customer) === input.connectionId &&
        customer.internalEntityType === "account" &&
        customer.internalEntityId === input.accountId,
    ) ?? null
  );
}

function providerObjectConnectionId(providerObject: CrmProviderObjectRecord) {
  const integrationConnectionId = providerObject.rawPayload.integrationConnectionId;

  return typeof integrationConnectionId === "string" ? integrationConnectionId : null;
}

async function assertInvoiceReadAccess(
  repository: InvoiceHandoffUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
) {
  return await resolveTeamAccess(
    repository,
    { ...context, teamId },
    "invoices.read",
    "You cannot read invoice handoffs for this team",
  );
}

async function assertInvoiceWriteAccess(
  repository: InvoiceHandoffUseCaseRepository,
  context: TransactionReviewContext,
  teamId: string,
  enforceCallerPermission = true,
) {
  if (enforceCallerPermission === false) {
    return null;
  }

  await resolveTeamAccess(
    repository,
    { ...context, teamId },
    "invoices.write",
    "You cannot create invoices for this team",
  );
  return await resolveTeamAccess(
    repository,
    { ...context, teamId },
    "integrations.write",
    "You cannot write Fortnox invoice handoffs for this team",
  );
}

async function appendInvoiceHandoffEvent(
  repository: InvoiceHandoffUseCaseRepository,
  context: TransactionReviewContext,
  input: {
    action: string;
    document: CommercialDocumentWithLines;
    handoff: InvoiceHandoff;
    metadata: Record<string, unknown>;
  },
) {
  const metadata = {
    invoiceHandoffId: input.handoff.id,
    provider: input.handoff.provider,
    connectionId: input.handoff.connectionId,
    accountId: input.document.accountId,
    opportunityId: input.document.opportunityId,
    documentId: input.document.id,
    documentVersionId: input.handoff.documentVersionId,
    signatureRequestId: input.handoff.signatureRequestId,
    status: input.handoff.status,
    providerInvoiceId: input.handoff.providerInvoiceId,
    providerInvoiceNumber: input.handoff.providerInvoiceNumber,
    ...input.metadata,
  };

  await repository.appendAuditEvent({
    teamId: input.handoff.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    action: input.action,
    entityType: "invoice_handoff",
    entityId: input.handoff.id,
    metadata,
  });
  await repository.appendOutboxEvent({
    teamId: input.handoff.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    type: input.action,
    version: 1,
    payload: {
      ...metadata,
      handoffId: input.handoff.id,
    },
  });
}

async function moveOpportunityToWon(
  repository: InvoiceHandoffUseCaseRepository,
  context: TransactionReviewContext,
  document: CommercialDocumentWithLines,
) {
  const opportunity = await repository.getOpportunityForTeam(
    document.teamId,
    document.opportunityId,
  );

  if (!opportunity || opportunity.stage === "won") {
    return opportunity;
  }

  try {
    assertOpportunityStageTransition(opportunity.stage, "won");
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  return await repository.updateOpportunityStage({
    teamId: document.teamId,
    opportunityId: opportunity.recordId,
    stage: "won",
    status: deriveOpportunityStatusFromStage("won"),
    actorId: context.actor.id,
  });
}

function stableStringify(value: unknown) {
  return JSON.stringify(value, (_key, nestedValue) => {
    if (!nestedValue || typeof nestedValue !== "object" || Array.isArray(nestedValue)) {
      return nestedValue;
    }

    return Object.fromEntries(
      Object.entries(nestedValue as Record<string, unknown>).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
