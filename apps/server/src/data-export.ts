import {
  buildTeamDataExportSnapshot,
  type DawnRepository,
  type TeamDataExportSnapshot,
} from "@dawn/app";
import type { TeamDataExportJob } from "@dawn/jobs";

import type { DocumentObjectStorage } from "./document-storage";

const exportContentType = "application/json; charset=utf-8";

export type ProcessTeamDataExportJobInput = {
  repository: DawnRepository;
  storage: DocumentObjectStorage;
  message: TeamDataExportJob;
  generatedAt?: string;
};

export type ProcessTeamDataExportJobResult = {
  objectKey: string;
  byteSize: number;
  contentType: string;
  snapshot: TeamDataExportSnapshot;
};

export async function processTeamDataExportJob(
  input: ProcessTeamDataExportJobInput,
): Promise<ProcessTeamDataExportJobResult> {
  const snapshot = await buildTeamDataExportSnapshot(input.repository, {
    teamId: input.message.teamId,
    sourceOutboxEventId: input.message.sourceOutboxEventId,
    generatedAt: input.generatedAt,
  });
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const body = exactArrayBuffer(new TextEncoder().encode(json));
  const objectKey = teamDataExportObjectKey({
    teamId: input.message.teamId,
    sourceOutboxEventId: input.message.sourceOutboxEventId,
  });

  await input.storage.put({
    objectKey,
    body,
    contentType: exportContentType,
  });
  await input.repository.appendAuditEvent({
    teamId: input.message.teamId,
    actorId: "system:data-workflow",
    requestId: input.message.idempotencyKey,
    action: "team_data.export_archive_written",
    entityType: "team",
    entityId: input.message.teamId,
    metadata: {
      format: input.message.format,
      sourceOutboxEventId: input.message.sourceOutboxEventId,
      objectKey,
      byteSize: body.byteLength,
      contentType: exportContentType,
      generatedAt: snapshot.generatedAt,
    },
  });

  return {
    objectKey,
    byteSize: body.byteLength,
    contentType: exportContentType,
    snapshot,
  };
}

function teamDataExportObjectKey(input: { teamId: string; sourceOutboxEventId: string }) {
  return `teams/${objectKeySegment(input.teamId)}/exports/${objectKeySegment(
    input.sourceOutboxEventId,
  )}.json`;
}

function objectKeySegment(value: string) {
  return value.replace(/[^A-Za-z0-9._=-]/g, "_");
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
