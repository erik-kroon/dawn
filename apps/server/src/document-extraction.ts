import {
  createDeterministicDocumentExtractor,
  runDocumentExtraction,
  type DawnRepository,
} from "@dawn/app";
import type { DocumentExtractionJob } from "@dawn/jobs";

import type { DocumentObjectStorage } from "./document-storage";

export async function processDocumentExtractionJob(input: {
  repository: DawnRepository;
  storage: DocumentObjectStorage;
  message: DocumentExtractionJob;
}) {
  const version = await input.repository.getDocumentVersionForTeam(
    input.message.teamId,
    input.message.versionId,
  );

  if (!version || version.documentId !== input.message.documentId) {
    throw new Error("Document version not found");
  }

  const object = await input.storage.get(version.objectKey);

  if (!object) {
    throw new Error("Document object not found");
  }

  return runDocumentExtraction(
    input.repository,
    createDeterministicDocumentExtractor(),
    {
      actor: { id: input.message.actorId, type: "user" },
      requestId: input.message.idempotencyKey,
      teamId: input.message.teamId,
    },
    {
      teamId: input.message.teamId,
      inboxItemId: input.message.inboxItemId,
      documentId: input.message.documentId,
      versionId: input.message.versionId,
      rawText: documentObjectText(object.body),
      idempotencyKey: input.message.idempotencyKey,
    },
  );
}

function documentObjectText(body: ArrayBuffer) {
  return new TextDecoder("utf-8", { fatal: false }).decode(body).trim();
}
