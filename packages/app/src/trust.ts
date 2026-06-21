import type {
  CommercialDocumentVersion,
  CommercialDocumentWithLines,
  Permission,
  SignatureEvidence,
  SignatureParty,
  SignatureRequest,
  TrustCheck,
  TrustCheckPolicy,
  TrustCheckPolicyMode,
  TrustCheckStatus,
  TrustReviewDecision,
} from "@dawn/domain";
import {
  assertCanRequestTrustCheck,
  assertTrustAllowsInvoice,
  deriveTrustCheckResult,
  normalizeTrustPolicyMode,
} from "@dawn/domain";
import type { TicCompanyRolesEnrichment, TicCompanyRolesProvider } from "@dawn/integrations";

import {
  AppError,
  assertAppRequestTeam,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";

export type UpdateTrustPolicyCommand = {
  teamId: string;
  mode: TrustCheckPolicyMode;
  idempotencyKey: string;
};

export type ReadTrustPolicyCommand = {
  teamId: string;
};

export type RequestSignerTrustCheckCommand = {
  teamId: string;
  signatureRequestId: string;
  signatureEvidenceId?: string | null;
  idempotencyKey: string;
};

export type GetTrustCheckForSignatureCommand = {
  teamId: string;
  signatureRequestId: string;
};

export type ReviewTrustCheckCommand = {
  teamId: string;
  trustCheckId: string;
  decision: TrustReviewDecision;
  rationale: string;
  idempotencyKey: string;
};

export type AssertInvoiceHandoffTrustGateCommand = {
  teamId: string;
  documentId: string;
};

export type TrustCheckView = Omit<TrustCheck, "rawPayload" | "advisoryAnalysis"> & {
  advisoryAnalysis: TrustCheck["advisoryAnalysis"] | null;
  rawPayload: Record<string, unknown> | null;
  permissions: {
    canReview: boolean;
    sensitiveFieldsRedacted: boolean;
  };
};

export type TrustCheckRequestResult = {
  trustCheck: TrustCheckView;
  policy: TrustCheckPolicy;
  replayed: boolean;
};

export type TrustCheckReviewResult = {
  trustCheck: TrustCheckView;
  replayed: boolean;
};

export type TrustRepository = {
  getCommercialDocumentForTeam(
    teamId: string,
    documentId: string,
  ): Promise<CommercialDocumentWithLines | null>;
  getCommercialDocumentVersionForTeam(
    teamId: string,
    versionId: string,
  ): Promise<CommercialDocumentVersion | null>;
  getSignatureRequestForTeam(
    teamId: string,
    signatureRequestId: string,
  ): Promise<SignatureRequest | null>;
  listSignatureParties(teamId: string, signatureRequestId: string): Promise<SignatureParty[]>;
  listSignatureEvidence(teamId: string, signatureRequestId: string): Promise<SignatureEvidence[]>;
  getTrustPolicy(teamId: string): Promise<TrustCheckPolicy | null>;
  upsertTrustPolicy(input: {
    teamId: string;
    mode: TrustCheckPolicyMode;
    updatedByActorId: string;
    updatedAt: string;
  }): Promise<TrustCheckPolicy>;
  getTrustCheckForTeam(teamId: string, trustCheckId: string): Promise<TrustCheck | null>;
  getLatestTrustCheckForSignatureRequest(input: {
    teamId: string;
    signatureRequestId: string;
  }): Promise<TrustCheck | null>;
  getLatestTrustCheckForSignatureEvidence(input: {
    teamId: string;
    signatureEvidenceId: string;
  }): Promise<TrustCheck | null>;
  listTrustChecksForDocument(input: { teamId: string; documentId: string }): Promise<TrustCheck[]>;
  createTrustCheck(input: {
    trustCheckId: string;
    teamId: string;
    accountId: string;
    opportunityId: string;
    documentId: string;
    documentVersionId: string;
    signatureRequestId: string;
    signatureEvidenceId: string;
    signaturePartyId: string | null;
    provider: "tic";
    providerSessionId: string;
    sourceOrganizationNumber: string | null;
    signerName: string;
    signerEmail: string | null;
    signerPersonalNumberMasked: string | null;
    legalBasis: string;
    purpose: string;
    retentionUntil: string | null;
    requestedAt: string;
  }): Promise<TrustCheck>;
  markTrustCheckCompleted(input: {
    teamId: string;
    trustCheckId: string;
    status: TrustCheckStatus;
    resultReason: string;
    providerRequestId: string | null;
    providerEventId: string | null;
    companyRegistrationNumber: string | null;
    companyLegalName: string | null;
    companyStatus: string | null;
    roleEvidence: TrustCheck["roleEvidence"];
    signatureDescription: string | null;
    advisoryAnalysis: TrustCheck["advisoryAnalysis"];
    originalSourceDescriptions: string[];
    rawPayload: Record<string, unknown>;
    rawPayloadReference: string | null;
    completedAt: string | null;
  }): Promise<TrustCheck | null>;
  markTrustCheckReviewed(input: {
    teamId: string;
    trustCheckId: string;
    status: Extract<TrustCheckStatus, "approved" | "rejected">;
    decision: TrustReviewDecision;
    reviewedAt: string;
    reviewerActorId: string;
    rationale: string;
  }): Promise<TrustCheck | null>;
};

export type TrustUseCaseRepository = TransactionReviewRepository & TrustRepository;

const defaultTrustPolicyMode: TrustCheckPolicyMode = "advisory";
const updateTrustPolicyOperation = "trust.policy.update";
const requestTrustCheckOperation = "trust.check.request";
const reviewTrustCheckOperation = "trust.check.review";

export async function readTrustPolicy(
  repository: TrustUseCaseRepository,
  context: TransactionReviewContext,
  command: ReadTrustPolicyCommand,
) {
  assertAppRequestTeam(context, command.teamId, "Trust policy not found");
  await assertTrustReadAccess(repository, context, command.teamId);
  return {
    policy: await loadTrustPolicy(repository, command.teamId),
  };
}

export async function updateTrustPolicy(
  repository: TrustUseCaseRepository,
  context: TransactionReviewContext,
  command: UpdateTrustPolicyCommand,
) {
  return repository.withTransaction(async (transactionRepository) => {
    const trustRepository = transactionRepository as TrustUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Trust policy not found");
    await assertTrustPolicyAccess(trustRepository, context, command.teamId);

    const mode = normalizeTrustPolicyMode(command.mode);
    const fingerprint = stableStringify({ teamId: command.teamId, mode });
    const replayed = await trustRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      updateTrustPolicyOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for another trust policy");
      }

      return {
        ...(replayed.result as { policy: TrustCheckPolicy; replayed: boolean }),
        replayed: true,
      };
    }

    const policy = await trustRepository.upsertTrustPolicy({
      teamId: command.teamId,
      mode,
      updatedByActorId: context.actor.id,
      updatedAt: new Date().toISOString(),
    });

    await trustRepository.appendAuditEvent({
      teamId: command.teamId,
      actorId: context.actor.id,
      requestId: context.requestId,
      action: "trust_policy.updated",
      entityType: "team",
      entityId: command.teamId,
      metadata: { mode },
    });

    const result = { policy, replayed: false };

    await trustRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: updateTrustPolicyOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function requestSignerTrustCheck(
  repository: TrustUseCaseRepository,
  provider: TicCompanyRolesProvider,
  context: TransactionReviewContext,
  command: RequestSignerTrustCheckCommand,
): Promise<TrustCheckRequestResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const trustRepository = transactionRepository as TrustUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Signature request not found");
    const access = await assertTrustRequestAccess(trustRepository, context, command.teamId);
    const policy = await loadTrustPolicy(trustRepository, command.teamId);

    if (policy.mode === "disabled") {
      throw new AppError("CONFLICT", "Trust checks are disabled for this team");
    }

    const material = await loadTrustMaterial(trustRepository, command);
    const fingerprint = stableStringify({
      teamId: command.teamId,
      signatureRequestId: material.signatureRequest.id,
      signatureEvidenceId: material.signatureEvidence.id,
    });
    const replayed = await trustRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      requestTrustCheckOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for another trust check");
      }

      const replayedTrustCheck = await trustRepository.getLatestTrustCheckForSignatureEvidence({
        teamId: command.teamId,
        signatureEvidenceId: material.signatureEvidence.id,
      });
      const replayedResult = replayed.result as TrustCheckRequestResult;

      return {
        ...replayedResult,
        trustCheck: replayedTrustCheck
          ? redactTrustCheck(replayedTrustCheck, access.permissions)
          : replayedResult.trustCheck,
        replayed: true,
      };
    }

    const existing = await trustRepository.getLatestTrustCheckForSignatureEvidence({
      teamId: command.teamId,
      signatureEvidenceId: material.signatureEvidence.id,
    });

    if (existing && existing.status !== "failed") {
      const result = {
        trustCheck: redactTrustCheck(existing, access.permissions),
        policy,
        replayed: true,
      };

      await trustRepository.saveIdempotencyResult({
        teamId: command.teamId,
        actorId: context.actor.id,
        operation: requestTrustCheckOperation,
        key: command.idempotencyKey,
        fingerprint,
        result,
      });

      return result;
    }

    try {
      assertCanRequestTrustCheck({
        signatureRequest: material.signatureRequest,
        signatureEvidence: material.signatureEvidence,
      });
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const requestedAt = new Date().toISOString();
    const pending = await trustRepository.createTrustCheck({
      trustCheckId: crypto.randomUUID(),
      teamId: command.teamId,
      accountId: material.document.accountId,
      opportunityId: material.document.opportunityId,
      documentId: material.document.id,
      documentVersionId: material.version.id,
      signatureRequestId: material.signatureRequest.id,
      signatureEvidenceId: material.signatureEvidence.id,
      signaturePartyId: material.signatureEvidence.signaturePartyId,
      provider: "tic",
      providerSessionId: material.signatureRequest.providerSessionId,
      sourceOrganizationNumber:
        material.signatureRequest.hiddenSignedData.account.customerOrganizationNumber,
      signerName: material.signatureEvidence.signerName,
      signerEmail: material.signatureEvidence.signerEmail,
      signerPersonalNumberMasked: material.signatureEvidence.signerPersonalNumberMasked,
      legalBasis: "contract",
      purpose: "signing_authority_trust_check",
      retentionUntil: null,
      requestedAt,
    });

    await appendTrustEvent(trustRepository, context, {
      action: "trust_check.requested",
      trustCheck: pending,
      document: material.document,
      metadata: {
        signatureRequestId: material.signatureRequest.id,
        signatureEvidenceId: material.signatureEvidence.id,
        policyMode: policy.mode,
      },
    });

    const enrichment = await provider.requestCompanyRoles({
      teamId: command.teamId,
      providerSessionId: material.signatureRequest.providerSessionId,
      signatureRequestId: material.signatureRequest.id,
      signatureEvidenceId: material.signatureEvidence.id,
      sourceOrganizationNumber:
        material.signatureRequest.hiddenSignedData.account.customerOrganizationNumber,
      idempotencyKey: command.idempotencyKey,
    });
    const completed = await completeTrustCheckFromEnrichment(
      trustRepository,
      context,
      material.document,
      pending,
      enrichment,
    );
    const result = {
      trustCheck: redactTrustCheck(completed, access.permissions),
      policy,
      replayed: false,
    };

    await trustRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: requestTrustCheckOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function getTrustCheckForSignature(
  repository: TrustUseCaseRepository,
  context: TransactionReviewContext,
  command: GetTrustCheckForSignatureCommand,
) {
  assertAppRequestTeam(context, command.teamId, "Trust check not found");
  const access = await assertTrustReadAccess(repository, context, command.teamId);
  const signatureRequest = await repository.getSignatureRequestForTeam(
    command.teamId,
    command.signatureRequestId,
  );

  if (!signatureRequest) {
    throw new AppError("NOT_FOUND", "Signature request not found");
  }

  const trustCheck = await repository.getLatestTrustCheckForSignatureRequest({
    teamId: command.teamId,
    signatureRequestId: command.signatureRequestId,
  });

  return {
    trustCheck: trustCheck ? redactTrustCheck(trustCheck, access.permissions) : null,
    policy: await loadTrustPolicy(repository, command.teamId),
  };
}

export async function reviewTrustCheck(
  repository: TrustUseCaseRepository,
  context: TransactionReviewContext,
  command: ReviewTrustCheckCommand,
): Promise<TrustCheckReviewResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const trustRepository = transactionRepository as TrustUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Trust check not found");
    const access = await assertTrustReviewAccess(trustRepository, context, command.teamId);
    const rationale = command.rationale.trim();

    if (!rationale) {
      throw new AppError("CONFLICT", "Trust review rationale is required");
    }

    const trustCheck = await trustRepository.getTrustCheckForTeam(
      command.teamId,
      command.trustCheckId,
    );

    if (!trustCheck) {
      throw new AppError("NOT_FOUND", "Trust check not found");
    }

    const fingerprint = stableStringify({
      teamId: command.teamId,
      trustCheckId: command.trustCheckId,
      decision: command.decision,
      rationale,
    });
    const replayed = await trustRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      reviewTrustCheckOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", "Idempotency key was already used for another trust review");
      }

      return { ...(replayed.result as TrustCheckReviewResult), replayed: true };
    }

    if (trustCheck.status === "approved" || trustCheck.status === "rejected") {
      throw new AppError("CONFLICT", "Trust check has already been reviewed");
    }

    const status = command.decision === "approved" ? "approved" : "rejected";
    const reviewed = await trustRepository.markTrustCheckReviewed({
      teamId: command.teamId,
      trustCheckId: command.trustCheckId,
      status,
      decision: command.decision,
      reviewedAt: new Date().toISOString(),
      reviewerActorId: context.actor.id,
      rationale,
    });

    if (!reviewed) {
      throw new AppError("NOT_FOUND", "Trust check not found");
    }

    const document = await trustRepository.getCommercialDocumentForTeam(
      command.teamId,
      reviewed.documentId,
    );

    if (!document) {
      throw new AppError("NOT_FOUND", "Trust check document not found");
    }

    await appendTrustEvent(trustRepository, context, {
      action: "trust_check.reviewed",
      trustCheck: reviewed,
      document,
      metadata: {
        decision: command.decision,
        reviewerActorId: context.actor.id,
        rationale,
      },
    });

    const result = {
      trustCheck: redactTrustCheck(reviewed, access.permissions),
      replayed: false,
    };

    await trustRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: reviewTrustCheckOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function assertInvoiceHandoffTrustGate(
  repository: TrustUseCaseRepository,
  context: TransactionReviewContext,
  command: AssertInvoiceHandoffTrustGateCommand,
) {
  assertAppRequestTeam(context, command.teamId, "Commercial document not found");
  const policy = await loadTrustPolicy(repository, command.teamId);

  if (policy.mode !== "blocking") {
    return;
  }

  const checks = await repository.listTrustChecksForDocument({
    teamId: command.teamId,
    documentId: command.documentId,
  });
  const latest = checks[0] ?? null;

  try {
    assertTrustAllowsInvoice({ policyMode: policy.mode, status: latest?.status ?? null });
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }
}

async function completeTrustCheckFromEnrichment(
  repository: TrustUseCaseRepository,
  context: TransactionReviewContext,
  document: CommercialDocumentWithLines,
  trustCheck: TrustCheck,
  enrichment: TicCompanyRolesEnrichment,
) {
  const roleEvidence = enrichment.roles.map((role) => ({
    positionType: role.positionType,
    positionDescription: role.positionDescription,
    positionStart: role.positionStart,
    positionEnd: role.positionEnd,
  }));
  const result = deriveTrustCheckResult({
    providerStatus: enrichment.status,
    expectedOrganizationNumber: trustCheck.sourceOrganizationNumber,
    companyRegistrationNumber: enrichment.companyRegistrationNumber,
    companyStatus: enrichment.companyStatus,
    roleEvidence,
  });
  const completed = await repository.markTrustCheckCompleted({
    teamId: trustCheck.teamId,
    trustCheckId: trustCheck.id,
    status: result.status,
    resultReason: result.resultReason,
    providerRequestId: enrichment.providerRequestId,
    providerEventId: enrichment.providerEventId,
    companyRegistrationNumber: enrichment.companyRegistrationNumber,
    companyLegalName: enrichment.legalName,
    companyStatus: enrichment.companyStatus,
    roleEvidence,
    signatureDescription: enrichment.signatureDescription,
    advisoryAnalysis: enrichment.signingAuthorityAnalysis
      ? { label: "advisory", ...enrichment.signingAuthorityAnalysis }
      : null,
    originalSourceDescriptions: [
      ...roleEvidence.map((role) => role.positionDescription),
      ...(enrichment.signatureDescription ? [enrichment.signatureDescription] : []),
    ],
    rawPayload: enrichment.rawPayload,
    rawPayloadReference: enrichment.rawPayloadReference ?? null,
    completedAt: enrichment.completedAt ?? new Date().toISOString(),
  });

  if (!completed) {
    throw new AppError("NOT_FOUND", "Trust check not found");
  }

  await appendTrustEvent(repository, context, {
    action: "trust_check.completed",
    trustCheck: completed,
    document,
    metadata: {
      status: completed.status,
      resultReason: completed.resultReason,
      providerRequestId: completed.providerRequestId,
      providerEventId: completed.providerEventId,
      companyRegistrationNumber: completed.companyRegistrationNumber,
      companyStatus: completed.companyStatus,
    },
  });

  return completed;
}

async function loadTrustPolicy(repository: TrustUseCaseRepository, teamId: string) {
  const policy = await repository.getTrustPolicy(teamId);

  if (policy) {
    return { ...policy, mode: normalizeTrustPolicyMode(policy.mode) };
  }

  return {
    teamId,
    mode: defaultTrustPolicyMode,
    updatedByActorId: null,
    updatedAt: new Date(0).toISOString(),
  };
}

async function loadTrustMaterial(
  repository: TrustUseCaseRepository,
  command: RequestSignerTrustCheckCommand,
) {
  const signatureRequest = await repository.getSignatureRequestForTeam(
    command.teamId,
    command.signatureRequestId,
  );

  if (!signatureRequest) {
    throw new AppError("NOT_FOUND", "Signature request not found");
  }

  const [document, version, parties, evidence] = await Promise.all([
    repository.getCommercialDocumentForTeam(command.teamId, signatureRequest.documentId),
    repository.getCommercialDocumentVersionForTeam(
      command.teamId,
      signatureRequest.documentVersionId,
    ),
    repository.listSignatureParties(command.teamId, signatureRequest.id),
    repository.listSignatureEvidence(command.teamId, signatureRequest.id),
  ]);

  if (!document) {
    throw new AppError("NOT_FOUND", "Commercial document not found");
  }

  if (!version) {
    throw new AppError("NOT_FOUND", "Commercial document version not found");
  }

  const signatureEvidence = command.signatureEvidenceId
    ? evidence.find((item) => item.id === command.signatureEvidenceId)
    : evidence[0];

  if (!signatureEvidence) {
    throw new AppError("NOT_FOUND", "Signature evidence not found");
  }

  return {
    document,
    version,
    parties,
    signatureRequest,
    signatureEvidence,
  };
}

async function assertTrustReadAccess(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  teamId: string,
) {
  return resolveTeamAccess(
    repository,
    { ...context, teamId },
    "documents.read",
    "You cannot read trust checks for this team",
  );
}

async function assertTrustRequestAccess(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  teamId: string,
) {
  return resolveTeamAccess(
    repository,
    { ...context, teamId },
    "documents.write",
    "You cannot request trust checks for this team",
  );
}

async function assertTrustPolicyAccess(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  teamId: string,
) {
  return resolveTeamAccess(
    repository,
    { ...context, teamId },
    "team.manage",
    "You cannot update trust policy for this team",
  );
}

async function assertTrustReviewAccess(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  teamId: string,
) {
  return resolveTeamAccess(
    repository,
    { ...context, teamId },
    "trust.review",
    "You cannot review trust checks for this team",
  );
}

function redactTrustCheck(
  trustCheck: TrustCheck,
  permissions: readonly Permission[],
): TrustCheckView {
  const canReview = permissions.includes("trust.review");

  return {
    ...trustCheck,
    advisoryAnalysis: canReview ? trustCheck.advisoryAnalysis : null,
    rawPayload: canReview ? trustCheck.rawPayload : null,
    permissions: {
      canReview,
      sensitiveFieldsRedacted: !canReview,
    },
  };
}

async function appendTrustEvent(
  repository: TrustUseCaseRepository,
  context: TransactionReviewContext,
  input: {
    action: "trust_check.requested" | "trust_check.completed" | "trust_check.reviewed";
    trustCheck: TrustCheck;
    document: CommercialDocumentWithLines;
    metadata: Record<string, unknown>;
  },
) {
  const metadata = {
    trustCheckId: input.trustCheck.id,
    documentId: input.document.id,
    documentType: input.document.documentType,
    title: input.document.title,
    status: input.document.status,
    accountId: input.document.accountId,
    opportunityId: input.document.opportunityId,
    signatureRequestId: input.trustCheck.signatureRequestId,
    signatureEvidenceId: input.trustCheck.signatureEvidenceId,
    provider: input.trustCheck.provider,
    providerSessionId: input.trustCheck.providerSessionId,
    trustStatus: input.trustCheck.status,
    resultReason: input.trustCheck.resultReason,
    companyStatus: input.trustCheck.companyStatus,
    roleDescriptions: input.trustCheck.roleEvidence.map((role) => role.positionDescription),
    signatureDescription: input.trustCheck.signatureDescription,
    advisoryAnalysisLabel: input.trustCheck.advisoryAnalysis?.label,
    originalSourceDescriptions: input.trustCheck.originalSourceDescriptions,
    ...input.metadata,
  };

  await repository.appendAuditEvent({
    teamId: input.trustCheck.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    action: input.action,
    entityType: "commercial_document",
    entityId: input.document.id,
    metadata,
  });

  await repository.appendOutboxEvent({
    teamId: input.trustCheck.teamId,
    actorId: context.actor.id,
    requestId: context.requestId,
    type: input.action,
    version: 1,
    payload: metadata,
  });
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${entries.join(",")}}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
