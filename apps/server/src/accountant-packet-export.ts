import {
  completeStoredAccountantPacketExport,
  redactOperationalText,
  type AccountantPacketAttachmentResolver,
  type AccountantPacketRepository,
  type OutboxDispatchRepository,
  type StoredAccountantPacketExportResult,
} from "@dawn/app";
import { dawnQueueNames, type AccountantPacketExportJob } from "@dawn/jobs";

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
  try {
    return await completeStoredAccountantPacketExport(
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
  } catch (error) {
    await recordAccountantPacketExportFailure(input, error);
    throw error;
  }
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

async function recordAccountantPacketExportFailure(
  input: ProcessAccountantPacketExportJobInput,
  error: unknown,
) {
  const errorText = redactOperationalText(errorMessage(error)) ?? "Accountant packet export failed";

  await input.repository.withTransaction(async (repository) => {
    const packetRepository = repository as AccountantPacketRepository;

    await packetRepository.appendAuditEvent({
      teamId: input.message.teamId,
      actorId: input.message.actorId,
      requestId: input.message.idempotencyKey,
      action: "accountant_packet.export_failed",
      entityType: "accountant_packet",
      entityId: input.message.sourceOutboxEventId,
      metadata: {
        sourceOutboxEventId: input.message.sourceOutboxEventId,
        transactionIds: input.message.transactionIds,
        error: errorText,
      },
    });
    await packetRepository.appendOutboxEvent({
      teamId: input.message.teamId,
      actorId: input.message.actorId,
      requestId: input.message.idempotencyKey,
      type: "accountant_packet.export_failed",
      version: 1,
      payload: {
        sourceOutboxEventId: input.message.sourceOutboxEventId,
        transactionIds: input.message.transactionIds,
        error: errorText,
      },
    });

    if (supportsJobRuns(packetRepository)) {
      await packetRepository.createJobRun({
        teamId: input.message.teamId,
        outboxEventId: input.message.sourceOutboxEventId,
        jobType: "accountant_packet.export",
        queueName: dawnQueueNames.jobs,
        status: "failed",
        attempt: 1,
        idempotencyKey: `${input.message.idempotencyKey}:failure`,
        error: errorText,
      });
    }
  });
}

function supportsJobRuns(
  repository: AccountantPacketRepository,
): repository is AccountantPacketRepository & Pick<OutboxDispatchRepository, "createJobRun"> {
  return "createJobRun" in repository && typeof repository.createJobRun === "function";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
