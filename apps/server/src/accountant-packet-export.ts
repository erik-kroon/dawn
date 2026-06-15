import {
  completeStoredAccountantPacketExport,
  type AccountantPacketAttachmentResolver,
  type AccountantPacketRepository,
  type StoredAccountantPacketExportResult,
} from "@dawn/app";
import type { AccountantPacketExportJob } from "@dawn/jobs";

import type { DocumentObjectStorage } from "./document-storage";

export type ProcessAccountantPacketExportJobInput = {
  repository: AccountantPacketRepository;
  storage: DocumentObjectStorage;
  message: AccountantPacketExportJob;
  generatedAt?: string;
};

export type ProcessAccountantPacketExportJobResult = StoredAccountantPacketExportResult;

export async function processAccountantPacketExportJob(
  input: ProcessAccountantPacketExportJobInput,
): Promise<ProcessAccountantPacketExportJobResult> {
  return completeStoredAccountantPacketExport(
    input.repository,
    input.storage,
    {
      teamId: input.message.teamId,
      actorId: input.message.actorId,
      from: input.message.from,
      to: input.message.to,
      transactionIds: input.message.transactionIds,
      formats: input.message.formats,
      csvDelimiter: input.message.csvDelimiter,
      sourceOutboxEventId: input.message.sourceOutboxEventId,
      idempotencyKey: input.message.idempotencyKey,
      generatedAt: input.generatedAt,
    },
    createStoredDocumentAttachmentResolver(input.storage),
  );
}

function createStoredDocumentAttachmentResolver(
  storage: DocumentObjectStorage,
): AccountantPacketAttachmentResolver {
  return {
    async readAttachment(attachment) {
      const object = await storage.get(attachment.objectKey);

      if (!object) {
        return null;
      }

      return {
        body: object.body,
        contentType: object.contentType,
      };
    },
  };
}
