import { createHash } from "node:crypto";

import type {
  Account,
  CommercialDocumentVersion,
  CommercialDocumentWithLines,
  LegalEntity,
  Opportunity,
  Organization,
  SignatureEvidence,
  SignatureFortnoxCustomerMapping,
  SignatureHiddenSignedData,
  SignatureParty,
  SignatureRequest,
  SignatureSignerRole,
} from "@dawn/domain";
import {
  assertCanStartSignatureRequest,
  assertOpportunityStageTransition,
  assertSignatureEvidenceMatchesVersion,
  buildSignatureHiddenSignedData,
  buildTicBankIdVisibleSigningText,
  canonicalSignatureHiddenSignedData,
  deriveOpportunityStatusFromStage,
  normalizeSignatureSigner,
} from "@dawn/domain";
import type { TicSignatureCompletion, TicSignatureProvider } from "@dawn/integrations";

import type { CrmProviderObjectRecord } from "./crm";
import {
  AppError,
  assertAppRequestTeam,
  resolveTeamAccess,
  type TransactionReviewContext,
  type TransactionReviewRepository,
} from "./index";
import { verifyWebhookSignature } from "./webhook-signature";

export type StartTicSignatureRequestCommand = {
  teamId: string;
  documentId: string;
  versionId?: string | null;
  signerName: string;
  signerEmail: string;
  signerRole?: SignatureSignerRole | null;
  sellerLegalName?: string | null;
  sellerOrganizationNumber?: string | null;
  callbackUrl?: string | null;
  idempotencyKey: string;
};

export type StartTicSignatureRequestResult = {
  signatureRequest: SignatureRequest;
  party: SignatureParty;
  signingUrl: string;
  replayed: boolean;
};

export type CompleteTicSignatureWebhookCommand = {
  rawBody: string;
  signature: string;
  timestamp: string;
  webhookSecret: string;
  now?: Date;
  toleranceSeconds?: number;
};

export type CompleteTicSignatureWebhookResult = {
  signatureRequest: SignatureRequest;
  evidence: SignatureEvidence;
  document: CommercialDocumentWithLines;
  replayed: boolean;
};

export type GetSignatureEvidenceCommand = {
  teamId: string;
  signatureRequestId: string;
};

export type GetSignatureEvidenceResult = {
  signatureRequest: SignatureRequest;
  parties: SignatureParty[];
  evidence: SignatureEvidence[];
};

export type GetRecipientSignatureReceiptCommand = {
  accessToken: string;
};

export type GetRecipientSignatureReceiptResult = {
  document: CommercialDocumentWithLines;
  version: CommercialDocumentVersion;
  signatureRequest: SignatureRequest;
  evidence: SignatureEvidence[];
};

export type SignatureRepository = {
  getCommercialDocumentForTeam(
    teamId: string,
    documentId: string,
  ): Promise<CommercialDocumentWithLines | null>;
  getCommercialDocumentVersionForTeam(
    teamId: string,
    versionId: string,
  ): Promise<CommercialDocumentVersion | null>;
  getCommercialDocumentByRecipientAccessTokenHash(input: {
    accessTokenHash: string;
  }): Promise<{ document: CommercialDocumentWithLines; version: CommercialDocumentVersion } | null>;
  getAccountForTeam(teamId: string, recordId: string): Promise<Account | null>;
  getOrganizationForTeam(teamId: string, recordId: string): Promise<Organization | null>;
  getLegalEntityForTeam(teamId: string, recordId: string): Promise<LegalEntity | null>;
  getOpportunityForTeam(teamId: string, recordId: string): Promise<Opportunity | null>;
  listProviderObjectsForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectTypes: readonly string[];
  }): Promise<CrmProviderObjectRecord[]>;
  getSignatureRequestForTeam(
    teamId: string,
    signatureRequestId: string,
  ): Promise<SignatureRequest | null>;
  getSignatureRequestForDocumentVersion(input: {
    teamId: string;
    documentId: string;
    documentVersionId: string;
  }): Promise<SignatureRequest | null>;
  getSignatureRequestByProviderSession(input: {
    provider: "tic";
    providerSessionId: string;
  }): Promise<SignatureRequest | null>;
  listSignatureParties(teamId: string, signatureRequestId: string): Promise<SignatureParty[]>;
  listSignatureEvidence(teamId: string, signatureRequestId: string): Promise<SignatureEvidence[]>;
  getSignatureEvidenceByProviderEvent(input: {
    provider: "tic";
    providerEventId: string;
  }): Promise<SignatureEvidence | null>;
  createSignatureRequest(input: {
    signatureRequestId: string;
    teamId: string;
    documentId: string;
    documentVersionId: string;
    provider: "tic";
    providerSessionId: string;
    signingUrl: string | null;
    expiresAt: string | null;
    signingText: string;
    hiddenSignedData: SignatureHiddenSignedData;
    hiddenSignedDataHash: string;
    providerRawPayload: Record<string, unknown>;
    createdByActorId: string;
  }): Promise<SignatureRequest>;
  createSignatureParty(input: {
    partyId: string;
    teamId: string;
    signatureRequestId: string;
    role: SignatureSignerRole;
    signingOrder: number;
    name: string;
    email: string;
    providerPartyId: string | null;
  }): Promise<SignatureParty>;
  markCommercialDocumentSigning(input: {
    teamId: string;
    documentId: string;
    signingAt: string;
  }): Promise<CommercialDocumentWithLines | null>;
  markCommercialDocumentSigned(input: {
    teamId: string;
    documentId: string;
    signedAt: string;
  }): Promise<CommercialDocumentWithLines | null>;
  markSignatureRequestCompleted(input: {
    teamId: string;
    signatureRequestId: string;
    completedAt: string;
  }): Promise<SignatureRequest | null>;
  markSignaturePartySigned(input: {
    teamId: string;
    partyId: string;
    signedAt: string;
  }): Promise<SignatureParty | null>;
  createSignatureEvidence(input: {
    evidenceId: string;
    teamId: string;
    signatureRequestId: string;
    signaturePartyId: string | null;
    provider: "tic";
    providerEventId: string;
    providerSessionId: string;
    signedAt: string;
    collectedAt: string;
    signerName: string;
    signerEmail: string | null;
    signerPersonalNumberMasked: string | null;
    documentPdfSha256: string;
    verificationStatus: SignatureEvidence["verificationStatus"];
    signatureValue: string | null;
    xmlDsig: string | null;
    ocspResponse: string | null;
    evidenceObjectKey: string | null;
    rawPayload: Record<string, unknown>;
  }): Promise<SignatureEvidence>;
  updateOpportunityStage(input: {
    teamId: string;
    opportunityId: string;
    stage: Opportunity["stage"];
    status: Opportunity["status"];
    actorId: string;
  }): Promise<Opportunity | null>;
};

export type SignatureUseCaseRepository = TransactionReviewRepository & SignatureRepository;

const startTicSignatureRequestOperation = "signature.tic.request.start";
const completeTicSignatureWebhookOperation = "signature.tic.webhook.completed";

export async function startTicSignatureRequest(
  repository: SignatureUseCaseRepository,
  provider: TicSignatureProvider,
  context: TransactionReviewContext,
  command: StartTicSignatureRequestCommand,
): Promise<StartTicSignatureRequestResult> {
  return repository.withTransaction(async (transactionRepository) => {
    const signatureRepository = transactionRepository as SignatureUseCaseRepository;

    assertAppRequestTeam(context, command.teamId, "Commercial document not found");
    await assertSignatureWriteAccess(signatureRepository, context, command.teamId);

    const material = await loadSignatureMaterial(signatureRepository, command);
    const signer = normalizeSignatureSigner({
      name: command.signerName,
      email: command.signerEmail,
      role: command.signerRole,
    });
    const seller = resolveSeller(command, material.seller);
    const fortnoxCustomerMapping = await findFortnoxCustomerMapping(signatureRepository, {
      teamId: command.teamId,
      accountId: material.account.recordId,
    });
    const hiddenSignedData = buildSignatureHiddenSignedData({
      provider: "tic",
      document: material.document,
      version: material.version,
      account: material.account,
      customer: material.customer,
      opportunity: material.opportunity,
      seller,
      signer,
      fortnoxCustomerMapping,
    });
    const canonicalHiddenData = canonicalSignatureHiddenSignedData(hiddenSignedData);
    const hiddenSignedDataHash = sha256Text(canonicalHiddenData);
    const signingText = buildTicBankIdVisibleSigningText({ hiddenSignedData });
    const normalized = {
      teamId: command.teamId,
      documentId: material.document.id,
      versionId: material.version.id,
      signer,
      seller,
      callbackUrl: command.callbackUrl?.trim() || null,
      hiddenSignedDataHash,
    };
    const fingerprint = stableStringify(normalized);
    const replayed = await signatureRepository.getIdempotencyResult(
      command.teamId,
      context.actor.id,
      startTicSignatureRequestOperation,
      command.idempotencyKey,
    );

    if (replayed) {
      if (replayed.fingerprint !== fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Idempotency key was already used for a different signature request",
        );
      }

      return { ...(replayed.result as StartTicSignatureRequestResult), replayed: true };
    }

    try {
      assertCanStartSignatureRequest({
        document: material.document,
        version: material.version,
      });
    } catch (error) {
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const existingRequest = await signatureRepository.getSignatureRequestForDocumentVersion({
      teamId: command.teamId,
      documentId: material.document.id,
      documentVersionId: material.version.id,
    });

    if (existingRequest && existingRequest.status !== "failed") {
      throw new AppError("CONFLICT", "Signature request already exists for this document version");
    }

    const session = await provider.createSignatureRequest({
      teamId: command.teamId,
      documentId: material.document.id,
      documentVersionId: material.version.id,
      signer: { name: signer.name, email: signer.email },
      userVisibleData: signingText,
      userNonVisibleData: canonicalHiddenData,
      callbackUrl: normalized.callbackUrl,
      idempotencyKey: command.idempotencyKey,
    });
    const signatureRequest = await signatureRepository.createSignatureRequest({
      signatureRequestId: crypto.randomUUID(),
      teamId: command.teamId,
      documentId: material.document.id,
      documentVersionId: material.version.id,
      provider: "tic",
      providerSessionId: session.providerSessionId,
      signingUrl: session.signingUrl,
      expiresAt: session.expiresAt,
      signingText,
      hiddenSignedData,
      hiddenSignedDataHash,
      providerRawPayload: session.rawPayload,
      createdByActorId: context.actor.id,
    });
    const party = await signatureRepository.createSignatureParty({
      partyId: crypto.randomUUID(),
      teamId: command.teamId,
      signatureRequestId: signatureRequest.id,
      role: signer.role,
      signingOrder: 1,
      name: signer.name,
      email: signer.email,
      providerPartyId: null,
    });
    const signingAt = new Date().toISOString();
    const signingDocument = await signatureRepository.markCommercialDocumentSigning({
      teamId: command.teamId,
      documentId: material.document.id,
      signingAt,
    });

    if (!signingDocument) {
      throw new AppError("CONFLICT", "Commercial document could not enter signing");
    }

    await appendSignatureEvent(signatureRepository, context, {
      teamId: command.teamId,
      action: "signature.requested",
      document: signingDocument,
      signatureRequest,
      metadata: {
        signatureRequestId: signatureRequest.id,
        provider: "tic",
        providerSessionId: session.providerSessionId,
        documentVersionId: material.version.id,
        versionNumber: material.version.versionNumber,
        pdfSha256: material.version.pdfSha256,
        hiddenSignedDataHash,
        signerEmail: signer.email,
      },
    });

    const result = {
      signatureRequest,
      party,
      signingUrl: session.signingUrl,
      replayed: false,
    };

    await signatureRepository.saveIdempotencyResult({
      teamId: command.teamId,
      actorId: context.actor.id,
      operation: startTicSignatureRequestOperation,
      key: command.idempotencyKey,
      fingerprint,
      result,
    });

    return result;
  });
}

export async function completeTicSignatureWebhook(
  repository: SignatureUseCaseRepository,
  provider: TicSignatureProvider,
  command: CompleteTicSignatureWebhookCommand,
): Promise<CompleteTicSignatureWebhookResult> {
  const verified = await verifyWebhookSignature({
    secret: command.webhookSecret,
    body: command.rawBody,
    timestamp: command.timestamp,
    signature: command.signature,
    now: command.now,
    toleranceSeconds: command.toleranceSeconds,
  });

  if (!verified) {
    throw new AppError("FORBIDDEN", "TIC webhook signature is invalid");
  }

  let completion: TicSignatureCompletion;

  try {
    completion = provider.parseCompletionWebhook({ body: command.rawBody });
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  return repository.withTransaction(async (transactionRepository) => {
    const signatureRepository = transactionRepository as SignatureUseCaseRepository;
    const request = await signatureRepository.getSignatureRequestByProviderSession({
      provider: "tic",
      providerSessionId: completion.providerSessionId,
    });

    if (!request) {
      throw new AppError("NOT_FOUND", "Signature request not found");
    }

    const context: TransactionReviewContext = {
      actor: { id: "provider:tic", type: "provider_webhook" },
      teamId: request.teamId,
      requestId: `tic:${completion.providerEventId}`,
    };
    const replayedByEvent = await signatureRepository.getSignatureEvidenceByProviderEvent({
      provider: "tic",
      providerEventId: completion.providerEventId,
    });

    if (replayedByEvent) {
      const document = await getSignatureDocument(signatureRepository, request);
      return {
        signatureRequest: request,
        evidence: replayedByEvent,
        document,
        replayed: true,
      };
    }

    const existingEvidence = await signatureRepository.listSignatureEvidence(
      request.teamId,
      request.id,
    );

    if (request.status === "completed" && existingEvidence[0]) {
      const document = await getSignatureDocument(signatureRepository, request);
      return {
        signatureRequest: request,
        evidence: existingEvidence[0],
        document,
        replayed: true,
      };
    }

    const document = await getSignatureDocument(signatureRepository, request);
    const version = await signatureRepository.getCommercialDocumentVersionForTeam(
      request.teamId,
      request.documentVersionId,
    );

    if (!version || version.documentId !== document.id) {
      throw new AppError("NOT_FOUND", "Signature document version not found");
    }

    try {
      assertSignatureEvidenceMatchesVersion({
        evidenceDocumentPdfSha256: completion.documentPdfSha256,
        version,
      });
    } catch (error) {
      await appendSignatureEvent(signatureRepository, context, {
        teamId: request.teamId,
        action: "signature.invalid",
        document,
        signatureRequest: request,
        metadata: {
          signatureRequestId: request.id,
          provider: "tic",
          providerEventId: completion.providerEventId,
          providerSessionId: completion.providerSessionId,
          documentVersionId: version.id,
          expectedPdfSha256: version.pdfSha256,
          receivedPdfSha256: completion.documentPdfSha256,
        },
      });
      throw new AppError("CONFLICT", errorMessage(error));
    }

    const parties = await signatureRepository.listSignatureParties(request.teamId, request.id);
    const party = parties[0] ?? null;
    const signedAt = normalizeIsoDate(completion.signedAt, "Signature completion time");
    const completedRequest = await signatureRepository.markSignatureRequestCompleted({
      teamId: request.teamId,
      signatureRequestId: request.id,
      completedAt: signedAt,
    });

    if (!completedRequest) {
      throw new AppError("CONFLICT", "Signature request could not be completed");
    }

    const signedParty = party
      ? await signatureRepository.markSignaturePartySigned({
          teamId: request.teamId,
          partyId: party.id,
          signedAt,
        })
      : null;
    const evidence = await signatureRepository.createSignatureEvidence({
      evidenceId: crypto.randomUUID(),
      teamId: request.teamId,
      signatureRequestId: request.id,
      signaturePartyId: signedParty?.id ?? party?.id ?? null,
      provider: "tic",
      providerEventId: completion.providerEventId,
      providerSessionId: completion.providerSessionId,
      signedAt,
      collectedAt: new Date().toISOString(),
      signerName: completion.signerName,
      signerEmail: completion.signerEmail?.trim().toLowerCase() || null,
      signerPersonalNumberMasked: completion.signerPersonalNumberMasked?.trim() || null,
      documentPdfSha256: completion.documentPdfSha256,
      verificationStatus: "verified",
      signatureValue: completion.signatureValue ?? null,
      xmlDsig: completion.xmlDsig ?? null,
      ocspResponse: completion.ocspResponse ?? null,
      evidenceObjectKey: completion.evidenceObjectKey ?? null,
      rawPayload: completion.rawPayload,
    });
    const signedDocument = await signatureRepository.markCommercialDocumentSigned({
      teamId: request.teamId,
      documentId: document.id,
      signedAt,
    });

    if (!signedDocument) {
      throw new AppError("CONFLICT", "Commercial document could not be signed");
    }

    await moveOpportunityToWonPendingInvoice(signatureRepository, context, signedDocument);

    await appendSignatureEvent(signatureRepository, context, {
      teamId: request.teamId,
      action: "signature.completed",
      document: signedDocument,
      signatureRequest: completedRequest,
      metadata: {
        signatureRequestId: request.id,
        signatureEvidenceId: evidence.id,
        provider: "tic",
        providerEventId: completion.providerEventId,
        providerSessionId: completion.providerSessionId,
        documentVersionId: version.id,
        versionNumber: version.versionNumber,
        pdfSha256: version.pdfSha256,
        signerName: completion.signerName,
        signerEmail: evidence.signerEmail,
      },
    });

    const result = {
      signatureRequest: completedRequest,
      evidence,
      document: signedDocument,
      replayed: false,
    };

    await signatureRepository.saveIdempotencyResult({
      teamId: request.teamId,
      actorId: context.actor.id,
      operation: completeTicSignatureWebhookOperation,
      key: completion.providerEventId,
      fingerprint: sha256Text(command.rawBody),
      result,
    });

    return result;
  });
}

export async function getSignatureEvidence(
  repository: SignatureUseCaseRepository,
  context: TransactionReviewContext,
  command: GetSignatureEvidenceCommand,
): Promise<GetSignatureEvidenceResult> {
  assertAppRequestTeam(context, command.teamId, "Signature request not found");
  await assertSignatureReadAccess(repository, context, command.teamId);

  const signatureRequest = await repository.getSignatureRequestForTeam(
    command.teamId,
    command.signatureRequestId,
  );

  if (!signatureRequest) {
    throw new AppError("NOT_FOUND", "Signature request not found");
  }

  const [parties, evidence] = await Promise.all([
    repository.listSignatureParties(command.teamId, signatureRequest.id),
    repository.listSignatureEvidence(command.teamId, signatureRequest.id),
  ]);

  return { signatureRequest, parties, evidence };
}

export async function getRecipientSignatureReceipt(
  repository: SignatureUseCaseRepository,
  command: GetRecipientSignatureReceiptCommand,
): Promise<GetRecipientSignatureReceiptResult> {
  const match = await repository.getCommercialDocumentByRecipientAccessTokenHash({
    accessTokenHash: sha256Text(command.accessToken),
  });

  if (!match) {
    throw new AppError("NOT_FOUND", "Signature receipt not found");
  }

  if (
    match.document.recipientAccessTokenExpiresAt &&
    Date.now() >= new Date(match.document.recipientAccessTokenExpiresAt).getTime()
  ) {
    throw new AppError("CONFLICT", "Commercial document recipient link expired");
  }

  if (match.document.status !== "signed") {
    throw new AppError("CONFLICT", "Signature receipt is not available");
  }

  const signatureRequest = await repository.getSignatureRequestForDocumentVersion({
    teamId: match.document.teamId,
    documentId: match.document.id,
    documentVersionId: match.version.id,
  });

  if (!signatureRequest || signatureRequest.status !== "completed") {
    throw new AppError("NOT_FOUND", "Signature receipt not found");
  }

  const evidence = await repository.listSignatureEvidence(
    match.document.teamId,
    signatureRequest.id,
  );

  return {
    document: match.document,
    version: match.version,
    signatureRequest,
    evidence,
  };
}

async function loadSignatureMaterial(
  repository: SignatureUseCaseRepository,
  command: StartTicSignatureRequestCommand,
) {
  const document = await repository.getCommercialDocumentForTeam(
    command.teamId,
    command.documentId,
  );

  if (!document) {
    throw new AppError("NOT_FOUND", "Commercial document not found");
  }

  const versionId = command.versionId?.trim() || document.activeVersionId;

  if (!versionId) {
    throw new AppError("CONFLICT", "Commercial document requires a finalised version");
  }

  const [version, account, opportunity] = await Promise.all([
    repository.getCommercialDocumentVersionForTeam(command.teamId, versionId),
    repository.getAccountForTeam(command.teamId, document.accountId),
    repository.getOpportunityForTeam(command.teamId, document.opportunityId),
  ]);

  if (!version || version.documentId !== document.id) {
    throw new AppError("NOT_FOUND", "Commercial document version not found");
  }

  if (!account) {
    throw new AppError("NOT_FOUND", "Account not found");
  }

  if (!opportunity) {
    throw new AppError("NOT_FOUND", "Opportunity not found");
  }

  const [customer, seller] = await Promise.all([
    repository.getOrganizationForTeam(command.teamId, account.organizationId),
    account.legalEntityId
      ? repository.getLegalEntityForTeam(command.teamId, account.legalEntityId)
      : Promise.resolve(null),
  ]);

  if (!customer) {
    throw new AppError("NOT_FOUND", "Customer organization not found");
  }

  return { document, version, account, customer, seller, opportunity };
}

function resolveSeller(
  command: StartTicSignatureRequestCommand,
  legalEntity: LegalEntity | null,
): Pick<LegalEntity, "legalName" | "organizationNumber"> {
  if (legalEntity) {
    return {
      legalName: legalEntity.legalName,
      organizationNumber: legalEntity.organizationNumber,
    };
  }

  const legalName = command.sellerLegalName?.trim();

  if (!legalName) {
    throw new AppError("CONFLICT", "Seller legal name is required for signing");
  }

  return {
    legalName,
    organizationNumber: command.sellerOrganizationNumber?.trim() || null,
  };
}

async function findFortnoxCustomerMapping(
  repository: SignatureUseCaseRepository,
  input: { teamId: string; accountId: string },
): Promise<SignatureFortnoxCustomerMapping> {
  const customers = await repository.listProviderObjectsForTeam({
    teamId: input.teamId,
    provider: "fortnox",
    providerObjectTypes: ["customer"],
  });
  const customer = customers.find(
    (object) =>
      object.internalEntityType === "account" && object.internalEntityId === input.accountId,
  );

  if (!customer) {
    return null;
  }

  return {
    provider: "fortnox",
    connectionId: providerObjectConnectionId(customer),
    providerCustomerId: customer.providerObjectId,
  };
}

function providerObjectConnectionId(providerObject: CrmProviderObjectRecord) {
  const integrationConnectionId = providerObject.rawPayload.integrationConnectionId;

  return typeof integrationConnectionId === "string" ? integrationConnectionId : null;
}

async function getSignatureDocument(
  repository: SignatureUseCaseRepository,
  request: SignatureRequest,
) {
  const document = await repository.getCommercialDocumentForTeam(
    request.teamId,
    request.documentId,
  );

  if (!document) {
    throw new AppError("NOT_FOUND", "Signature document not found");
  }

  return document;
}

async function moveOpportunityToWonPendingInvoice(
  repository: SignatureUseCaseRepository,
  context: TransactionReviewContext,
  document: CommercialDocumentWithLines,
) {
  const opportunity = await repository.getOpportunityForTeam(
    document.teamId,
    document.opportunityId,
  );

  if (!opportunity) {
    throw new AppError("NOT_FOUND", "Opportunity not found");
  }

  if (opportunity.stage === "won_pending_invoice") {
    return opportunity;
  }

  try {
    assertOpportunityStageTransition(opportunity.stage, "won_pending_invoice");
  } catch (error) {
    throw new AppError("CONFLICT", errorMessage(error));
  }

  const updated = await repository.updateOpportunityStage({
    teamId: document.teamId,
    opportunityId: opportunity.recordId,
    stage: "won_pending_invoice",
    status: deriveOpportunityStatusFromStage("won_pending_invoice"),
    actorId: context.actor.id,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Opportunity not found");
  }

  return updated;
}

async function assertSignatureWriteAccess(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  teamId: string,
) {
  await resolveTeamAccess(
    repository,
    { ...context, teamId },
    "documents.write",
    "You cannot request signatures for this team",
  );
}

async function assertSignatureReadAccess(
  repository: TransactionReviewRepository,
  context: TransactionReviewContext,
  teamId: string,
) {
  await resolveTeamAccess(
    repository,
    { ...context, teamId },
    "documents.read",
    "You cannot read signature evidence for this team",
  );
}

async function appendSignatureEvent(
  repository: SignatureUseCaseRepository,
  context: TransactionReviewContext,
  input: {
    teamId: string;
    action: string;
    document: CommercialDocumentWithLines;
    signatureRequest: SignatureRequest;
    metadata: Record<string, unknown>;
  },
) {
  const metadata = {
    documentId: input.document.id,
    documentType: input.document.documentType,
    title: input.document.title,
    status: input.document.status,
    accountId: input.document.accountId,
    opportunityId: input.document.opportunityId,
    ...input.metadata,
  };

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
    type: input.action,
    version: 1,
    payload: metadata,
  });
}

function normalizeIsoDate(value: string, label: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("CONFLICT", `${label} is invalid`);
  }

  return date.toISOString();
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
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
  return error instanceof Error ? error.message : "Unexpected signature error";
}
