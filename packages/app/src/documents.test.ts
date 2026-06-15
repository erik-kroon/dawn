import { describe, expect, test } from "bun:test";
import type { Actor, TeamRole } from "@dawn/domain";

import {
  AppError,
  completeDocumentUpload,
  createDocumentDownload,
  createDocumentUpload,
  type BusinessDocument,
  type BusinessDocumentVersion,
  type DawnRepository,
  type DocumentUrlSigner,
  type IdempotencyResult,
} from "./index";

class MemoryDocumentRepository {
  auditEvents: unknown[] = [];
  documents = new Map<string, BusinessDocument>();
  documentVersions = new Map<string, BusinessDocumentVersion>();
  idempotency = new Map<string, IdempotencyResult<unknown>>();
  memberships = new Map<string, TeamRole>();
  outboxEvents: unknown[] = [];

  async withTransaction<T>(callback: (repository: DawnRepository) => Promise<T>): Promise<T> {
    return callback(this as unknown as DawnRepository);
  }

  async getMembership(actor: Actor, teamId: string) {
    const role = this.memberships.get(`${actor.id}:${teamId}`);
    return role ? { role } : null;
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

  async listDocuments(teamId: string) {
    return [...this.documents.values()].filter((document) => document.teamId === teamId);
  }

  async createDocumentUploadRecord(input: {
    documentId: string;
    versionId: string;
    teamId: string;
    title: string;
    objectKey: string;
    fileName: string;
    contentType: string;
    byteSize: number;
    checksumSha256?: string | null;
    createdByActorId: string;
  }) {
    const now = "2026-06-15T10:00:00.000Z";
    const version: BusinessDocumentVersion = {
      id: input.versionId,
      documentId: input.documentId,
      teamId: input.teamId,
      versionNumber: 1,
      objectKey: input.objectKey,
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256 ?? null,
      status: "pending_upload",
      uploadedAt: null,
      createdAt: now,
    };
    const document: BusinessDocument = {
      id: input.documentId,
      teamId: input.teamId,
      title: input.title,
      status: "uploading",
      currentVersionId: null,
      createdByActorId: input.createdByActorId,
      createdAt: now,
      updatedAt: now,
      currentVersion: null,
    };
    this.documents.set(document.id, document);
    this.documentVersions.set(version.id, version);

    return { document, version };
  }

  async getDocumentForTeam(teamId: string, documentId: string) {
    const document = this.documents.get(documentId);
    return document?.teamId === teamId ? document : null;
  }

  async getDocumentVersionForTeam(teamId: string, versionId: string) {
    const version = this.documentVersions.get(versionId);
    return version?.teamId === teamId ? version : null;
  }

  async completeDocumentVersionUpload(input: {
    teamId: string;
    documentId: string;
    versionId: string;
    byteSize: number;
    checksumSha256?: string | null;
    uploadedAt: Date;
  }) {
    const document = this.documents.get(input.documentId);
    const version = this.documentVersions.get(input.versionId);

    if (
      !document ||
      document.teamId !== input.teamId ||
      !version ||
      version.teamId !== input.teamId
    ) {
      throw new Error("Document upload not found");
    }

    const uploadedVersion: BusinessDocumentVersion = {
      ...version,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256 ?? null,
      status: "uploaded",
      uploadedAt: input.uploadedAt.toISOString(),
    };
    const uploadedDocument: BusinessDocument = {
      ...document,
      status: "uploaded",
      currentVersionId: uploadedVersion.id,
      currentVersion: uploadedVersion,
      updatedAt: input.uploadedAt.toISOString(),
    };
    this.documentVersions.set(uploadedVersion.id, uploadedVersion);
    this.documents.set(uploadedDocument.id, uploadedDocument);

    return { document: uploadedDocument, version: uploadedVersion };
  }
}

const signer: DocumentUrlSigner = {
  async createUploadUrl(input) {
    return {
      url: `https://files.example.com/upload/${input.teamId}/${input.versionId}`,
      expiresAt: "2026-06-15T10:15:00.000Z",
    };
  },
  async createDownloadUrl(input) {
    return {
      url: `https://files.example.com/download/${input.teamId}/${input.versionId}`,
      expiresAt: "2026-06-15T10:05:00.000Z",
    };
  },
};

describe("document use cases", () => {
  test("creates upload metadata with a signed URL and idempotent replay", async () => {
    const repository = new MemoryDocumentRepository();
    repository.memberships.set("user_1:team_1", "member");

    const first = await createDocumentUpload(
      repository as unknown as DawnRepository,
      signer,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        fileName: " Receipt June.pdf ",
        contentType: "Application/PDF",
        byteSize: 7,
        idempotencyKey: "upload_1",
      },
    );
    const replayed = await createDocumentUpload(
      repository as unknown as DawnRepository,
      signer,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        fileName: " Receipt June.pdf ",
        contentType: "Application/PDF",
        byteSize: 7,
        idempotencyKey: "upload_1",
      },
    );

    expect(first.document).toMatchObject({
      teamId: "team_1",
      title: "Receipt June",
      status: "uploading",
    });
    expect(first.version).toMatchObject({
      fileName: "Receipt June.pdf",
      contentType: "application/pdf",
      status: "pending_upload",
    });
    expect(first.version.objectKey).toContain(`/documents/${first.document.id}/versions/`);
    expect(first.uploadUrl).toContain(first.version.id);
    expect(replayed).toMatchObject({ replayed: true, document: { id: first.document.id } });
    expect(repository.auditEvents).toHaveLength(0);
    expect(repository.outboxEvents).toHaveLength(0);
  });

  test("completes uploads by updating metadata and emitting audit and outbox events", async () => {
    const repository = new MemoryDocumentRepository();
    repository.memberships.set("user_1:team_1", "member");
    const prepared = await createDocumentUpload(
      repository as unknown as DawnRepository,
      signer,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        byteSize: 7,
        idempotencyKey: "upload_1",
      },
    );

    const completed = await completeDocumentUpload(
      repository as unknown as DawnRepository,
      { actor: { id: "user_1", type: "user" }, requestId: "request_2", teamId: "team_1" },
      {
        teamId: "team_1",
        documentId: prepared.document.id,
        versionId: prepared.version.id,
        byteSize: 7,
      },
    );

    expect(completed.document.status).toBe("uploaded");
    expect(completed.document.currentVersionId).toBe(prepared.version.id);
    expect(completed.version.status).toBe("uploaded");
    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({ action: "document.uploaded" });
    expect(repository.outboxEvents).toHaveLength(1);
    expect(repository.outboxEvents[0]).toMatchObject({ type: "document.uploaded" });
  });

  test("scopes download signing to document read permission", async () => {
    const repository = new MemoryDocumentRepository();
    repository.memberships.set("user_1:team_1", "member");
    repository.memberships.set("user_2:team_1", "viewer");
    const prepared = await createDocumentUpload(
      repository as unknown as DawnRepository,
      signer,
      { actor: { id: "user_1", type: "user" }, requestId: "request_1", teamId: "team_1" },
      {
        teamId: "team_1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        byteSize: 7,
        idempotencyKey: "upload_1",
      },
    );
    await completeDocumentUpload(
      repository as unknown as DawnRepository,
      { actor: { id: "user_1", type: "user" }, requestId: "request_2", teamId: "team_1" },
      {
        teamId: "team_1",
        documentId: prepared.document.id,
        versionId: prepared.version.id,
        byteSize: 7,
      },
    );

    const download = await createDocumentDownload(
      repository as unknown as DawnRepository,
      signer,
      { actor: { id: "user_2", type: "user" }, requestId: "request_3", teamId: "team_1" },
      { teamId: "team_1", documentId: prepared.document.id },
    );

    await expect(
      createDocumentDownload(
        repository as unknown as DawnRepository,
        signer,
        { actor: { id: "user_3", type: "user" }, requestId: "request_4", teamId: "team_1" },
        { teamId: "team_1", documentId: prepared.document.id },
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(download.downloadUrl).toContain(prepared.version.id);
  });
});
