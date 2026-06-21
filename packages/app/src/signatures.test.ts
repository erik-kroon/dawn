import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";
import type {
  Account,
  CommercialDocumentVersion,
  CommercialDocumentWithLines,
  LegalEntity,
  Opportunity,
  Organization,
  SignatureEvidence,
  SignatureHiddenSignedData,
  SignatureParty,
  SignatureRequest,
} from "@dawn/domain";
import { createMockTicSignatureProvider } from "@dawn/integrations";

import { signWebhookPayload } from "./webhook-signature";
import {
  completeTicSignatureWebhook,
  getRecipientSigningReceipt,
  getRecipientSigningStatus,
  getRecipientSignatureReceipt,
  getSignatureEvidence,
  readRecipientSigningSurface,
  startRecipientTicSignatureRequest,
  startTicSignatureRequest,
  type SignatureUseCaseRepository,
} from "./signatures";
import type { CrmProviderObjectRecord } from "./crm";
import type { TransactionReviewContext } from "./index";
import { MemoryAppRepository } from "./testkit/memory-repository";

const context: TransactionReviewContext = {
  actor: { id: "user_1", type: "user" },
  teamId: "team_1",
  requestId: "req_signature_1",
};
const webhookSecret = "tic_webhook_secret_abcdefghijklmnopqrstuvwxyz";

class MemorySignatureRepository
  extends MemoryAppRepository
  implements Partial<SignatureUseCaseRepository>
{
  crmAccounts = new Map<string, Account>();
  organizations = new Map<string, Organization>();
  legalEntities = new Map<string, LegalEntity>();
  opportunities = new Map<string, Opportunity>();
  providerObjects = new Map<string, CrmProviderObjectRecord>();
  commercialDocuments = new Map<string, CommercialDocumentWithLines>();
  versions = new Map<string, CommercialDocumentVersion>();
  signatureRequests = new Map<string, SignatureRequest>();
  signatureParties = new Map<string, SignatureParty>();
  signatureEvidence = new Map<string, SignatureEvidence>();

  override async withTransaction<T>(callback: (repository: any) => Promise<T>) {
    return callback(this as unknown as SignatureUseCaseRepository);
  }

  async getCommercialDocumentForTeam(teamId: string, documentId: string) {
    const document = this.commercialDocuments.get(documentId);
    return document?.teamId === teamId ? document : null;
  }

  async getCommercialDocumentVersionForTeam(teamId: string, versionId: string) {
    const version = this.versions.get(versionId);
    return version?.teamId === teamId ? version : null;
  }

  async getCommercialDocumentByRecipientAccessTokenHash(input: { accessTokenHash: string }) {
    const document = [...this.commercialDocuments.values()].find(
      (candidate) => candidate.recipientAccessTokenHash === input.accessTokenHash,
    );

    if (!document?.activeVersionId) {
      return null;
    }

    const version = this.versions.get(document.activeVersionId);
    return version ? { document, version } : null;
  }

  async getAccountForTeam(teamId: string, recordId: string) {
    const account = this.crmAccounts.get(recordId);
    return account?.teamId === teamId ? account : null;
  }

  async getOrganizationForTeam(teamId: string, recordId: string) {
    const organization = this.organizations.get(recordId);
    return organization?.teamId === teamId ? organization : null;
  }

  async getLegalEntityForTeam(teamId: string, recordId: string) {
    const legalEntity = this.legalEntities.get(recordId);
    return legalEntity?.teamId === teamId ? legalEntity : null;
  }

  async getOpportunityForTeam(teamId: string, recordId: string) {
    const opportunity = this.opportunities.get(recordId);
    return opportunity?.teamId === teamId ? opportunity : null;
  }

  async listProviderObjectsForTeam(input: {
    teamId: string;
    provider: string;
    providerObjectTypes: readonly string[];
  }) {
    return [...this.providerObjects.values()].filter(
      (object) =>
        object.teamId === input.teamId &&
        object.provider === input.provider &&
        input.providerObjectTypes.includes(object.providerObjectType),
    );
  }

  async getSignatureRequestForTeam(teamId: string, signatureRequestId: string) {
    const request = this.signatureRequests.get(signatureRequestId);
    return request?.teamId === teamId ? request : null;
  }

  async getSignatureRequestForDocumentVersion(input: {
    teamId: string;
    documentId: string;
    documentVersionId: string;
  }) {
    return (
      [...this.signatureRequests.values()].find(
        (request) =>
          request.teamId === input.teamId &&
          request.documentId === input.documentId &&
          request.documentVersionId === input.documentVersionId,
      ) ?? null
    );
  }

  async getSignatureRequestByProviderSession(input: {
    provider: "tic";
    providerSessionId: string;
  }) {
    return (
      [...this.signatureRequests.values()].find(
        (request) =>
          request.provider === input.provider &&
          request.providerSessionId === input.providerSessionId,
      ) ?? null
    );
  }

  async listSignatureParties(teamId: string, signatureRequestId: string) {
    return [...this.signatureParties.values()].filter(
      (party) => party.teamId === teamId && party.signatureRequestId === signatureRequestId,
    );
  }

  async listSignatureEvidence(teamId: string, signatureRequestId: string) {
    return [...this.signatureEvidence.values()].filter(
      (evidence) =>
        evidence.teamId === teamId && evidence.signatureRequestId === signatureRequestId,
    );
  }

  async getSignatureEvidenceByProviderEvent(input: { provider: "tic"; providerEventId: string }) {
    return (
      [...this.signatureEvidence.values()].find(
        (evidence) =>
          evidence.provider === input.provider &&
          evidence.providerEventId === input.providerEventId,
      ) ?? null
    );
  }

  async createSignatureRequest(input: {
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
  }) {
    const now = new Date().toISOString();
    const request: SignatureRequest = {
      id: input.signatureRequestId,
      teamId: input.teamId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      provider: input.provider,
      providerSessionId: input.providerSessionId,
      status: "requested",
      signingUrl: input.signingUrl,
      expiresAt: input.expiresAt,
      signingText: input.signingText,
      hiddenSignedData: input.hiddenSignedData,
      hiddenSignedDataHash: input.hiddenSignedDataHash,
      providerRawPayload: input.providerRawPayload,
      createdByActorId: input.createdByActorId,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.signatureRequests.set(request.id, request);
    return request;
  }

  async createSignatureParty(input: {
    partyId: string;
    teamId: string;
    signatureRequestId: string;
    role: SignatureParty["role"];
    signingOrder: number;
    name: string;
    email: string;
    providerPartyId: string | null;
  }) {
    const now = new Date().toISOString();
    const party: SignatureParty = {
      id: input.partyId,
      teamId: input.teamId,
      signatureRequestId: input.signatureRequestId,
      role: input.role,
      signingOrder: input.signingOrder,
      name: input.name,
      email: input.email,
      providerPartyId: input.providerPartyId,
      status: "pending",
      signedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.signatureParties.set(party.id, party);
    return party;
  }

  async markCommercialDocumentSigning(input: {
    teamId: string;
    documentId: string;
    signingAt: string;
  }) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const document = { ...current, status: "signing" as const, updatedAt: input.signingAt };
    this.commercialDocuments.set(document.id, document);
    return document;
  }

  async markCommercialDocumentViewed(input: {
    teamId: string;
    documentId: string;
    viewedAt: string;
  }) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId) {
      throw new Error("Commercial document was not viewed");
    }

    const document = {
      ...current,
      status: "viewed" as const,
      viewedAt: input.viewedAt,
      updatedAt: input.viewedAt,
    };
    this.commercialDocuments.set(document.id, document);
    return document;
  }

  async markCommercialDocumentSigned(input: {
    teamId: string;
    documentId: string;
    signedAt: string;
  }) {
    const current = this.commercialDocuments.get(input.documentId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const document = { ...current, status: "signed" as const, updatedAt: input.signedAt };
    this.commercialDocuments.set(document.id, document);
    return document;
  }

  async markSignatureRequestCompleted(input: {
    teamId: string;
    signatureRequestId: string;
    completedAt: string;
  }) {
    const current = this.signatureRequests.get(input.signatureRequestId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const request: SignatureRequest = {
      ...current,
      status: "completed",
      completedAt: input.completedAt,
      updatedAt: input.completedAt,
    };
    this.signatureRequests.set(request.id, request);
    return request;
  }

  async markSignaturePartySigned(input: { teamId: string; partyId: string; signedAt: string }) {
    const current = this.signatureParties.get(input.partyId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const party: SignatureParty = {
      ...current,
      status: "signed",
      signedAt: input.signedAt,
      updatedAt: input.signedAt,
    };
    this.signatureParties.set(party.id, party);
    return party;
  }

  async createSignatureEvidence(input: {
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
  }) {
    const evidence: SignatureEvidence = {
      id: input.evidenceId,
      teamId: input.teamId,
      signatureRequestId: input.signatureRequestId,
      signaturePartyId: input.signaturePartyId,
      provider: input.provider,
      providerEventId: input.providerEventId,
      providerSessionId: input.providerSessionId,
      signedAt: input.signedAt,
      collectedAt: input.collectedAt,
      signerName: input.signerName,
      signerEmail: input.signerEmail,
      signerPersonalNumberMasked: input.signerPersonalNumberMasked,
      documentPdfSha256: input.documentPdfSha256,
      verificationStatus: input.verificationStatus,
      signatureValue: input.signatureValue,
      xmlDsig: input.xmlDsig,
      ocspResponse: input.ocspResponse,
      evidenceObjectKey: input.evidenceObjectKey,
      rawPayload: input.rawPayload,
      createdAt: input.collectedAt,
    };
    this.signatureEvidence.set(evidence.id, evidence);
    return evidence;
  }

  async updateOpportunityStage(input: {
    teamId: string;
    opportunityId: string;
    stage: Opportunity["stage"];
    status: Opportunity["status"];
    actorId: string;
  }) {
    const current = this.opportunities.get(input.opportunityId);

    if (!current || current.teamId !== input.teamId) {
      return null;
    }

    const updated: Opportunity = {
      ...current,
      stage: input.stage,
      status: input.status,
      wonAt: input.status === "won" ? new Date().toISOString() : current.wonAt,
      lostAt: input.status === "lost" ? new Date().toISOString() : current.lostAt,
      updatedAt: new Date().toISOString(),
    };
    this.opportunities.set(updated.recordId, updated);
    return updated;
  }

  seed() {
    this.memberships.set("user_1:team_1", "member");
    this.organizations.set("org_1", organization);
    this.legalEntities.set("seller_1", seller);
    this.crmAccounts.set("account_1", account);
    this.opportunities.set("opp_1", opportunity);
    this.commercialDocuments.set("doc_1", document);
    this.versions.set("version_1", version);
    this.providerObjects.set("fortnox_customer_1001", {
      id: "provider_customer_1",
      teamId: "team_1",
      provider: "fortnox",
      providerObjectType: "customer",
      providerObjectId: "1001",
      internalEntityType: "account",
      internalEntityId: "account_1",
      rawPayload: { integrationConnectionId: "fortnox_conn_1" },
    });
  }
}

describe("signature use cases", () => {
  test("starts TIC signing, completes a verified webhook once, and exposes evidence", async () => {
    const repository = new MemorySignatureRepository();
    const provider = createMockTicSignatureProvider();
    repository.seed();

    const started = await startTicSignatureRequest(
      repository as unknown as SignatureUseCaseRepository,
      provider,
      context,
      {
        teamId: "team_1",
        documentId: "doc_1",
        signerName: "Ada Lovelace",
        signerEmail: "Ada@Example.com",
        idempotencyKey: "sign_start_1",
      },
    );
    const replayedStart = await startTicSignatureRequest(
      repository as unknown as SignatureUseCaseRepository,
      provider,
      context,
      {
        teamId: "team_1",
        documentId: "doc_1",
        signerName: "Ada Lovelace",
        signerEmail: "Ada@Example.com",
        idempotencyKey: "sign_start_1",
      },
    );

    expect(started.signatureRequest.hiddenSignedData.fortnoxCustomerMapping).toEqual({
      provider: "fortnox",
      connectionId: "fortnox_conn_1",
      providerCustomerId: "1001",
    });
    expect(started.signatureRequest.signingText).toContain("Säljare: Seller AB");
    expect(repository.commercialDocuments.get("doc_1")?.status).toBe("signing");
    expect(replayedStart.replayed).toBe(true);

    const body = JSON.stringify({
      providerEventId: "tic_evt_1",
      providerSessionId: started.signatureRequest.providerSessionId,
      documentPdfSha256: version.pdfSha256,
      signedAt: "2026-06-20T12:00:00.000Z",
      signerName: "Ada Lovelace",
      signerEmail: "ada@example.com",
      signerPersonalNumberMasked: "********1234",
      signatureValue: "signature-value",
      xmlDsig: "<Signature />",
      ocspResponse: "ocsp-response",
      evidenceObjectKey: "signatures/team_1/evidence/tic_evt_1.json",
    });
    const timestamp = "1781956800";
    const signature = await signWebhookPayload({ secret: webhookSecret, timestamp, body });
    const completed = await completeTicSignatureWebhook(
      repository as unknown as SignatureUseCaseRepository,
      provider,
      {
        rawBody: body,
        signature,
        timestamp,
        webhookSecret,
        now: new Date("2026-06-20T12:00:00.000Z"),
      },
    );
    const duplicate = await completeTicSignatureWebhook(
      repository as unknown as SignatureUseCaseRepository,
      provider,
      {
        rawBody: body,
        signature,
        timestamp,
        webhookSecret,
        now: new Date("2026-06-20T12:00:00.000Z"),
      },
    );
    const evidence = await getSignatureEvidence(
      repository as unknown as SignatureUseCaseRepository,
      context,
      {
        teamId: "team_1",
        signatureRequestId: started.signatureRequest.id,
      },
    );
    const receipt = await getRecipientSignatureReceipt(
      repository as unknown as SignatureUseCaseRepository,
      { accessToken: recipientToken },
    );

    expect(completed.document.status).toBe("signed");
    expect(completed.evidence.verificationStatus).toBe("verified");
    expect(repository.opportunities.get("opp_1")).toMatchObject({
      stage: "won_pending_invoice",
      status: "won",
    });
    expect(duplicate.replayed).toBe(true);
    expect(repository.signatureEvidence).toHaveLength(1);
    expect(evidence.evidence[0]).toMatchObject({ providerEventId: "tic_evt_1" });
    expect(receipt.evidence).toHaveLength(1);
    expect(
      (repository.auditEvents as Array<{ action: string }>).map((event) => event.action),
    ).toEqual(expect.arrayContaining(["signature.requested", "signature.completed"]));
    expect((repository.outboxEvents as Array<{ type: string }>).map((event) => event.type)).toEqual(
      expect.arrayContaining(["signature.requested", "signature.completed"]),
    );
    expect([...repository.idempotency.keys()]).toEqual(
      expect.arrayContaining([
        "team_1:user_1:signature.tic.request.start:sign_start_1",
        "team_1:provider:tic:signature.tic.webhook.completed:tic_evt_1",
      ]),
    );
  });

  test("supports recipient-token signing read, start, status, and receipt", async () => {
    const repository = new MemorySignatureRepository();
    const provider = createMockTicSignatureProvider();
    repository.seed();
    repository.commercialDocuments.set("doc_1", {
      ...document,
      status: "sent",
      recipientAccessTokenExpiresAt: "2099-08-20T00:00:00.000Z",
    });

    const read = await readRecipientSigningSurface(
      repository as unknown as SignatureUseCaseRepository,
      { accessToken: recipientToken },
    );
    const started = await startRecipientTicSignatureRequest(
      repository as unknown as SignatureUseCaseRepository,
      provider,
      {
        accessToken: recipientToken,
        idempotencyKey: "recipient_start_1",
      },
    );
    const replayedStart = await startRecipientTicSignatureRequest(
      repository as unknown as SignatureUseCaseRepository,
      provider,
      {
        accessToken: recipientToken,
        idempotencyKey: "recipient_start_1",
      },
    );
    const pending = await getRecipientSigningStatus(
      repository as unknown as SignatureUseCaseRepository,
      { accessToken: recipientToken },
    );

    expect(read).toMatchObject({
      state: "ready",
      document: { status: "viewed", versionNumber: 1, pdfSha256: version.pdfSha256 },
      sender: { legalName: "Seller AB" },
      customer: { legalName: "Customer AB" },
      pdf: { sha256: version.pdfSha256 },
    });
    expect(repository.commercialDocuments.get("doc_1")?.status).toBe("signing");
    expect(started.replayed).toBe(false);
    expect(replayedStart.replayed).toBe(true);
    expect(started.signingUrl).toStartWith("https://tic.example/sign/");
    expect(started.signatureRequest).toMatchObject({
      teamId: "team_1",
      documentId: "doc_1",
      documentVersionId: "version_1",
      createdByActorId: "recipient:doc_1",
    });
    expect(started.signatureRequest.hiddenSignedData).toMatchObject({
      deal: { opportunityId: "opp_1" },
      account: { accountId: "account_1", customerLegalName: "Customer AB" },
      seller: { legalName: "Seller AB" },
      signer: { name: "ada", email: "ada@example.com", role: "external_signer" },
      fortnoxCustomerMapping: { providerCustomerId: "1001" },
    });
    expect(pending).toMatchObject({
      state: "pending",
      pdf: null,
      signature: {
        status: "requested",
        signingUrl: started.signatureRequest.signingUrl,
      },
      receipt: null,
    });

    const body = JSON.stringify({
      providerEventId: "tic_evt_recipient_1",
      providerSessionId: started.signatureRequest.providerSessionId,
      documentPdfSha256: version.pdfSha256,
      signedAt: "2026-06-20T12:00:00.000Z",
      signerName: "Ada Recipient",
      signerEmail: "ada@example.com",
      signerPersonalNumberMasked: "********1234",
      signatureValue: "signature-value",
      xmlDsig: "<Signature />",
      ocspResponse: "ocsp-response",
      evidenceObjectKey: "signatures/team_1/evidence/tic_evt_recipient_1.json",
    });
    const timestamp = "1781956800";
    const signature = await signWebhookPayload({ secret: webhookSecret, timestamp, body });
    await completeTicSignatureWebhook(
      repository as unknown as SignatureUseCaseRepository,
      provider,
      {
        rawBody: body,
        signature,
        timestamp,
        webhookSecret,
        now: new Date("2026-06-20T12:00:00.000Z"),
      },
    );

    const signedStatus = await getRecipientSigningStatus(
      repository as unknown as SignatureUseCaseRepository,
      { accessToken: recipientToken },
    );
    const receipt = await getRecipientSigningReceipt(
      repository as unknown as SignatureUseCaseRepository,
      { accessToken: recipientToken },
    );

    expect(signedStatus).toMatchObject({
      state: "signed",
      pdf: null,
      receipt: {
        signatureRequestId: started.signatureRequest.id,
        evidence: [{ documentPdfSha256: version.pdfSha256, verificationStatus: "verified" }],
      },
    });
    expect(receipt).toMatchObject({
      state: "signed",
      pdf: { sha256: version.pdfSha256 },
      receipt: {
        signatureRequestId: started.signatureRequest.id,
        downloads: expect.arrayContaining([
          expect.objectContaining({ kind: "signed_pdf" }),
          expect.objectContaining({ kind: "evidence_receipt" }),
        ]),
      },
    });
    expect(repository.signatureEvidence).toHaveLength(1);
    expect([...repository.idempotency.keys()]).toContain(
      "team_1:recipient:doc_1:signature.tic.recipient.start:recipient_start_1",
    );
  });

  test("scopes recipient signing access to live sent tokens and terminal states", async () => {
    const repository = new MemorySignatureRepository();
    const provider = createMockTicSignatureProvider();
    repository.seed();

    await expect(
      readRecipientSigningSurface(repository as unknown as SignatureUseCaseRepository, {
        accessToken: "missing_token",
      }),
    ).rejects.toThrow("Recipient signing link not found");

    repository.commercialDocuments.set("doc_1", {
      ...document,
      status: "sent",
      recipientAccessTokenExpiresAt: "2000-01-01T00:00:00.000Z",
    });
    await expect(
      getRecipientSigningStatus(repository as unknown as SignatureUseCaseRepository, {
        accessToken: recipientToken,
      }),
    ).rejects.toThrow("Commercial document recipient link expired");
    await expect(
      startRecipientTicSignatureRequest(
        repository as unknown as SignatureUseCaseRepository,
        provider,
        {
          accessToken: recipientToken,
          idempotencyKey: "recipient_expired_start",
        },
      ),
    ).rejects.toThrow("Commercial document recipient link expired");

    for (const status of ["draft", "finalised"] as const) {
      repository.commercialDocuments.set("doc_1", {
        ...document,
        status,
        recipientAccessTokenExpiresAt: "2099-08-20T00:00:00.000Z",
      });
      await expect(
        readRecipientSigningSurface(repository as unknown as SignatureUseCaseRepository, {
          accessToken: recipientToken,
        }),
      ).rejects.toThrow("Commercial document is not available for recipient signing");
    }

    for (const [status, state] of [
      ["declined", "declined"],
      ["expired", "expired"],
      ["error", "failed"],
    ] as const) {
      repository.commercialDocuments.set("doc_1", {
        ...document,
        status,
        recipientAccessTokenExpiresAt: "2099-08-20T00:00:00.000Z",
      });
      await expect(
        getRecipientSigningStatus(repository as unknown as SignatureUseCaseRepository, {
          accessToken: recipientToken,
        }),
      ).resolves.toMatchObject({ state });
    }
  });

  test("rejects invalid webhook signatures and hash mismatches without signing", async () => {
    const repository = new MemorySignatureRepository();
    const provider = createMockTicSignatureProvider();
    repository.seed();
    const started = await startTicSignatureRequest(
      repository as unknown as SignatureUseCaseRepository,
      provider,
      context,
      {
        teamId: "team_1",
        documentId: "doc_1",
        signerName: "Ada Lovelace",
        signerEmail: "ada@example.com",
        idempotencyKey: "sign_start_2",
      },
    );
    const badBody = JSON.stringify({
      providerEventId: "tic_evt_bad",
      providerSessionId: started.signatureRequest.providerSessionId,
      documentPdfSha256: "bad_hash",
      signerName: "Ada Lovelace",
    });
    const timestamp = "1781956800";
    const validSignature = await signWebhookPayload({
      secret: webhookSecret,
      timestamp,
      body: badBody,
    });
    const staleTimestamp = "1";
    const staleSignature = await signWebhookPayload({
      secret: webhookSecret,
      timestamp: staleTimestamp,
      body: badBody,
    });
    const wrongSessionBody = JSON.stringify({
      providerEventId: "tic_evt_missing",
      providerSessionId: "missing_session",
      documentPdfSha256: version.pdfSha256,
      signerName: "Ada Lovelace",
    });
    const wrongSessionSignature = await signWebhookPayload({
      secret: webhookSecret,
      timestamp,
      body: wrongSessionBody,
    });

    await expect(
      completeTicSignatureWebhook(repository as unknown as SignatureUseCaseRepository, provider, {
        rawBody: badBody,
        signature: "v1=invalid",
        timestamp,
        webhookSecret,
        now: new Date("2026-06-20T12:00:00.000Z"),
      }),
    ).rejects.toThrow("TIC webhook signature is invalid");

    await expect(
      completeTicSignatureWebhook(repository as unknown as SignatureUseCaseRepository, provider, {
        rawBody: wrongSessionBody,
        signature: wrongSessionSignature,
        timestamp,
        webhookSecret,
        now: new Date("2026-06-20T12:00:00.000Z"),
      }),
    ).rejects.toThrow("Signature request not found");

    await expect(
      completeTicSignatureWebhook(repository as unknown as SignatureUseCaseRepository, provider, {
        rawBody: badBody,
        signature: staleSignature,
        timestamp: staleTimestamp,
        webhookSecret,
        now: new Date("2026-06-20T12:00:00.000Z"),
      }),
    ).rejects.toThrow("TIC webhook signature is invalid");

    await expect(
      completeTicSignatureWebhook(repository as unknown as SignatureUseCaseRepository, provider, {
        rawBody: badBody,
        signature: validSignature,
        timestamp,
        webhookSecret,
        now: new Date("2026-06-20T12:00:00.000Z"),
      }),
    ).rejects.toThrow("Signed document hash");

    expect(repository.commercialDocuments.get("doc_1")?.status).toBe("signing");
    expect(repository.signatureEvidence).toHaveLength(0);
    expect(
      (repository.auditEvents as Array<{ action: string }>).map((event) => event.action),
    ).toContain("signature.invalid");
  });
});

const recipientToken = "recipient_token";
const now = "2026-06-20T00:00:00.000Z";

const organization: Organization = {
  recordId: "org_1",
  teamId: "team_1",
  legalName: "Customer AB",
  displayName: null,
  organizationNumber: "5561234567",
  countryCode: "SE",
  vatNumber: null,
  websiteDomain: null,
  createdAt: now,
  updatedAt: now,
};

const seller: LegalEntity = {
  recordId: "seller_1",
  teamId: "team_1",
  legalName: "Seller AB",
  organizationNumber: "5599998888",
  vatNumber: null,
  countryCode: "SE",
  baseCurrency: "SEK",
  fiscalYearStartMonth: 1,
  status: "active",
  createdAt: now,
  updatedAt: now,
};

const account: Account = {
  recordId: "account_1",
  teamId: "team_1",
  legalEntityId: "seller_1",
  organizationId: "org_1",
  accountType: "customer",
  relationshipStatus: "active",
  lifecycleStage: "active",
  segment: null,
  territory: null,
  primaryOwnerPrincipalId: "user_1",
  customerSince: null,
  churnedAt: null,
  createdAt: now,
  updatedAt: now,
};

const opportunity: Opportunity = {
  recordId: "opp_1",
  teamId: "team_1",
  accountId: "account_1",
  name: "Quote-to-cash pilot",
  amountMinor: 125_000,
  currencyCode: "SEK",
  status: "open",
  stage: "proposal_sent",
  expectedCloseDate: null,
  primaryOwnerPrincipalId: "user_1",
  wonAt: null,
  lostAt: null,
  createdAt: now,
  updatedAt: now,
};

const document: CommercialDocumentWithLines = {
  id: "doc_1",
  teamId: "team_1",
  accountId: "account_1",
  opportunityId: "opp_1",
  documentType: "quote",
  title: "Pilot quote",
  status: "finalised",
  currency: "SEK",
  validUntil: "2026-07-20T00:00:00.000Z",
  paymentTerms: "30 dagar",
  termsVersion: "terms-2026-06",
  templateId: null,
  recipientEmail: "ada@example.com",
  scope: null,
  marketOrigin: {
    companyId: "company_1",
    companySnapshotId: "snapshot_1",
    prospectId: "prospect_1",
    sourceGoalId: "goal_1",
    sourceRunId: "run_1",
    icpId: "icp_1",
    segmentId: "segment_1",
    sourceProvider: "tic",
    sourceProviderCapability: "company_profile",
    sourceDecisionSummary: "Strong fit",
  },
  activeVersionId: "version_1",
  recipientAccessTokenHash: sha256Text(recipientToken),
  recipientAccessTokenExpiresAt: "2026-08-20T00:00:00.000Z",
  sentAt: "2026-06-20T01:00:00.000Z",
  viewedAt: null,
  declinedAt: null,
  declineReason: null,
  createdByActorId: "user_1",
  createdAt: now,
  updatedAt: now,
  lines: [],
  totals: {
    subtotal: { amountMinor: 100_000, currency: "SEK" },
    discount: { amountMinor: 0, currency: "SEK" },
    vat: { amountMinor: 25_000, currency: "SEK" },
    total: { amountMinor: 125_000, currency: "SEK" },
  },
};

const version: CommercialDocumentVersion = {
  id: "version_1",
  teamId: "team_1",
  documentId: "doc_1",
  versionNumber: 1,
  status: "finalised",
  snapshot: {
    schemaVersion: 1,
    documentId: "doc_1",
    teamId: "team_1",
    accountId: "account_1",
    opportunityId: "opp_1",
    documentType: "quote",
    title: "Pilot quote",
    versionNumber: 1,
    currency: "SEK",
    validUntil: "2026-07-20T00:00:00.000Z",
    paymentTerms: "30 dagar",
    termsVersion: "terms-2026-06",
    templateId: null,
    recipientEmail: "ada@example.com",
    scope: null,
    marketOrigin: document.marketOrigin,
    lines: [],
    totals: document.totals,
  },
  pdfObjectKey: "commercial-documents/team_1/doc_1/v1.pdf",
  pdfBodyBase64: Buffer.from("final pdf bytes").toString("base64"),
  pdfSha256: createHash("sha256").update(Buffer.from("final pdf bytes")).digest("hex"),
  byteSize: Buffer.byteLength("final pdf bytes"),
  finalizedByActorId: "user_1",
  createdAt: now,
};

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
