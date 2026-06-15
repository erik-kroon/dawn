import {
  resolveSystemAppRequest,
  runQueuedCsvTransactionImport,
  type TransactionImportPayloadStorage,
  type TransactionReviewRepository,
} from "@dawn/app";
import type { TransactionImportCommitJob } from "@dawn/jobs";

import type { DocumentObjectStorage } from "./document-storage";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function createTransactionImportPayloadStorage(
  storage: DocumentObjectStorage,
): TransactionImportPayloadStorage {
  return {
    async put(input) {
      await storage.put({
        objectKey: input.objectKey,
        body: textEncoder.encode(input.body).buffer,
        contentType: input.contentType,
      });
    },
    async get(objectKey) {
      const object = await storage.get(objectKey);

      if (!object) {
        return null;
      }

      return {
        body: textDecoder.decode(object.body),
        contentType: object.contentType,
        byteSize: object.byteSize,
      };
    },
    async delete(objectKey) {
      await storage.delete(objectKey);
    },
  };
}

export async function processQueuedCsvTransactionImportJob(input: {
  repository: TransactionReviewRepository;
  storage: DocumentObjectStorage;
  message: TransactionImportCommitJob;
}) {
  await runQueuedCsvTransactionImport(
    input.repository,
    createTransactionImportPayloadStorage(input.storage),
    resolveSystemAppRequest({
      actorId: "system:transaction-import",
      requestId: input.message.idempotencyKey,
      teamId: input.message.teamId,
    }),
    {
      teamId: input.message.teamId,
      importSessionId: input.message.importSessionId,
      payloadObjectKey: input.message.payloadObjectKey,
      sourceOutboxEventId: input.message.sourceOutboxEventId,
      idempotencyKey: input.message.idempotencyKey,
    },
  );
}
