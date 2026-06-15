import {
  createDeterministicDocumentExtractor,
  resolveAppRequest,
  runStoredDocumentExtraction,
  type DawnRepository,
} from "@dawn/app";
import type { DocumentExtractionJob } from "@dawn/jobs";

import type { DocumentObjectStorage } from "./document-storage";

export async function processDocumentExtractionJob(input: {
  repository: DawnRepository;
  storage: DocumentObjectStorage;
  message: DocumentExtractionJob;
}) {
  return runStoredDocumentExtraction(
    input.repository,
    {
      async readText(readInput) {
        const object = await input.storage.get(readInput.objectKey);
        return object ? documentObjectText(object.body) : null;
      },
    },
    createDeterministicDocumentExtractor(),
    resolveAppRequest({
      actor: { id: input.message.actorId, type: "user" },
      source: "system_job",
      requestId: input.message.idempotencyKey,
      teamId: input.message.teamId,
    }),
    {
      teamId: input.message.teamId,
      inboxItemId: input.message.inboxItemId,
      documentId: input.message.documentId,
      versionId: input.message.versionId,
      idempotencyKey: input.message.idempotencyKey,
    },
  );
}

function documentObjectText(body: ArrayBuffer) {
  return new TextDecoder("utf-8", { fatal: false }).decode(body).trim();
}
